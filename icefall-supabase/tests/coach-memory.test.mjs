// What the Coach's memory tables actually allow, run against a real Postgres.
//
// `node tests/coach-memory.test.mjs` - standalone, and deliberately NOT part of
// the `npm test` chain, for the reason tests/coach-limits.test.mjs already
// records: that chain is `a && b && c` and its first link, tests/rls.test.mjs,
// dies loading migration 20260903060000 with `role "authenticator" does not
// exist`. Nothing downstream of a failing `&&` runs, so adding this file to the
// chain today would only mean it never executed. That breakage predates this
// file and is not fixed here.
//
// WHY THIS BUILDS ITS OWN MINIMAL SCHEMA rather than loading every migration:
// the file under test needs exactly two things from the rest of the database -
// `public.profiles` and `auth.uid()`.
//
// WHAT IS BEING PROVED, in one sentence each: an athlete owns their own
// transcript and nobody else can read it, a message cannot be smuggled into
// somebody else's thread, neither a message nor a note can be edited after the
// fact, the same note cannot be kept twice, deleting a thread takes its
// messages with it, and the checks that mirror the client's own caps bind.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, "..", "migrations", "20260911160000_coach_memory.sql");

const db = await PGlite.create();

await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table public.profiles (id uuid primary key references auth.users(id) on delete cascade,
                                display_name text not null default 'x');
`);

await db.exec(readFileSync(FILE, "utf8"));

const mk = async (email) => {
  const u = await db.query(`insert into auth.users (email) values ($1) returning id`, [email]);
  const id = u.rows[0].id;
  await db.query(`insert into public.profiles (id) values ($1)`, [id]);
  return id;
};
const alice = await mk("alice@x.io");
const bob = await mk("bob@x.io");

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

/**
 * Run something as a signed-in athlete.
 *
 * `commit` rather than `rollback`, unlike the limits suite: this file builds a
 * transcript across several steps and then reads it back, so the writes have to
 * survive. Each call still returns ok/error rather than throwing, because a
 * REFUSAL is the expected result of about half of these.
 */
async function asUser(uid, fn) {
  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  try {
    const value = await fn();
    await db.exec("commit");
    return { ok: true, value };
  } catch (e) {
    await db.exec("rollback");
    return { ok: false, error: e.message.split("\n")[0] };
  }
}

/* 1. An athlete can hold a conversation with their coach. */

const started = await asUser(alice, async () => {
  const c = await db.query(
    `insert into public.coach_conversations (user_id) values ($1) returning id`,
    [alice],
  );
  return c.rows[0].id;
});
check("an athlete can start a conversation", started.ok, started.error);
const aliceThread = started.value;

const said = await asUser(alice, async () => {
  await db.query(
    `insert into public.coach_messages (conversation_id, user_id, role, body)
     values ($1,$2,'athlete','Am I ready for Mont Blanc?')`,
    [aliceThread, alice],
  );
  await db.query(
    `insert into public.coach_messages (conversation_id, user_id, role, body, disclaimer)
     values ($1,$2,'coach','Not yet.','ICEFALL Coach is not a medical service.')`,
    [aliceThread, alice],
  );
  return (
    await db.query(`select count(*)::int as n from public.coach_messages where conversation_id=$1`, [
      aliceThread,
    ])
  ).rows[0].n;
});
check("both turns are stored", said.ok && said.value === 2, said.error ?? `n=${said.value}`);

/* 2. The thread's clock follows its last message, so the list can order by it. */

const touched = await asUser(alice, async () =>
  (
    await db.query(
      `select (updated_at >= started_at) as moved from public.coach_conversations where id=$1`,
      [aliceThread],
    )
  ).rows[0].moved,
);
check("updated_at follows the last message", touched.ok && touched.value === true, touched.error);

/* 3. NOBODY ELSE CAN READ IT. The whole promise of the screen. */

const peek = await asUser(bob, async () =>
  (await db.query(`select count(*)::int as n from public.coach_messages`)).rows[0].n,
);
check("another athlete reads none of it", peek.ok && peek.value === 0, peek.error ?? `n=${peek.value}`);

const peekThreads = await asUser(bob, async () =>
  (await db.query(`select count(*)::int as n from public.coach_conversations`)).rows[0].n,
);
check(
  "another athlete sees no conversations",
  peekThreads.ok && peekThreads.value === 0,
  peekThreads.error ?? `n=${peekThreads.value}`,
);

const anonPeek = await (async () => {
  await db.exec("begin");
  await db.exec("set local role anon");
  try {
    await db.query(`select 1 from public.coach_messages`);
    return { blocked: false };
  } catch (e) {
    return { blocked: true, error: e.message.split("\n")[0] };
  } finally {
    await db.exec("rollback");
  }
})();
check("a signed-out client is refused outright", anonPeek.blocked, "anon could select");

/* 4. A message cannot be put into somebody else's thread. */

const smuggle = await asUser(bob, async () =>
  db.query(
    `insert into public.coach_messages (conversation_id, user_id, role, body)
     values ($1,$2,'athlete','who is reading this')`,
    [aliceThread, bob],
  ),
);
check("bob cannot write into alice's thread", !smuggle.ok, "the insert succeeded");

/* And not even by claiming to be her - the policy checks the writer, not the
   column. */
const impersonate = await asUser(bob, async () =>
  db.query(
    `insert into public.coach_messages (conversation_id, user_id, role, body)
     values ($1,$2,'athlete','who is reading this')`,
    [aliceThread, alice],
  ),
);
check("bob cannot write as alice", !impersonate.ok, "the insert succeeded");

/* The trigger holds for a writer that RLS does not apply to - a migration, a
   service_role job, a future Edge Function. That is what makes the denormalised
   user_id trustworthy for the policies that read it. */
const triggerHolds = await (async () => {
  await db.exec("begin");
  try {
    await db.query(
      `insert into public.coach_messages (conversation_id, user_id, role, body)
       values ($1,$2,'athlete','bypassing rls entirely')`,
      [aliceThread, bob],
    );
    return { blocked: false };
  } catch (e) {
    return { blocked: true, error: e.message.split("\n")[0] };
  } finally {
    await db.exec("rollback");
  }
})();
check(
  "the owner trigger holds even without RLS",
  triggerHolds.blocked,
  "a privileged writer attached a message to the wrong owner",
);

/* 5. A transcript is not editable. */

const edit = await asUser(alice, async () =>
  db.query(`update public.coach_messages set body='something else' where user_id=$1`, [alice]),
);
check("a message cannot be edited", !edit.ok, "the update succeeded");

/* 6. Notes. */

const noted = await asUser(alice, async () => {
  await db.query(
    `insert into public.coach_notes (user_id, note, category, source)
     values ($1,'My knee always gives way on long descents','body','captured')`,
    [alice],
  );
  await db.query(
    `insert into public.coach_notes (user_id, note, category, source)
     values ($1,'I train Tuesday, Thursday and Saturday','schedule','typed')`,
    [alice],
  );
  return (await db.query(`select count(*)::int as n from public.coach_notes`)).rows[0].n;
});
check("notes are stored", noted.ok && noted.value === 2, noted.error ?? `n=${noted.value}`);

const dupe = await asUser(alice, async () =>
  db.query(
    `insert into public.coach_notes (user_id, note, category, source)
     values ($1,'my knee   ALWAYS gives way on long descents','body','captured')`,
    [alice],
  ),
);
check("the same fact is not kept twice", !dupe.ok, "a duplicate note was stored");

const bobsOwn = await asUser(bob, async () =>
  db.query(
    `insert into public.coach_notes (user_id, note, category, source)
     values ($1,'My knee always gives way on long descents','body','captured')`,
    [bob],
  ),
);
check(
  "the duplicate rule is per athlete, not global",
  bobsOwn.ok,
  bobsOwn.error,
);

const editNote = await asUser(alice, async () =>
  db.query(`update public.coach_notes set note='something I never said' where user_id=$1`, [alice]),
);
check("a note cannot be edited", !editNote.ok, "the update succeeded");

const forget = await asUser(alice, async () => {
  await db.query(
    `delete from public.coach_notes where user_id=$1 and category='schedule'`,
    [alice],
  );
  return (await db.query(`select count(*)::int as n from public.coach_notes`)).rows[0].n;
});
check(
  "the athlete can delete a note",
  forget.ok && forget.value === 1,
  forget.error ?? `n=${forget.value}`,
);

const peekNotes = await asUser(bob, async () =>
  (await db.query(`select count(*)::int as n from public.coach_notes`)).rows[0].n,
);
check(
  "notes are private to their athlete",
  peekNotes.ok && peekNotes.value === 1,
  peekNotes.error ?? `n=${peekNotes.value}`,
);

/* The checks that mirror the client's own caps. */
const tooLong = await asUser(alice, async () =>
  db.query(
    `insert into public.coach_notes (user_id, note, category, source) values ($1,$2,'body','typed')`,
    [alice, "x".repeat(181)],
  ),
);
check("a note over 180 characters is refused", !tooLong.ok, "an over-long note was stored");

const badCategory = await asUser(alice, async () =>
  db.query(
    `insert into public.coach_notes (user_id, note, category, source)
     values ($1,'a note','diagnosis','typed')`,
    [alice],
  ),
);
check("an unknown category is refused", !badCategory.ok, "a made-up category was stored");

const badSource = await asUser(alice, async () =>
  db.query(
    `insert into public.coach_notes (user_id, note, category, source)
     values ($1,'a note','body','ai-generated')`,
    [alice],
  ),
);
check(
  "a source outside captured/typed is refused",
  !badSource.ok,
  "a note could claim a source the app cannot produce",
);

/* 7. Remembering can be turned off, and only by its owner. */

const pref = await asUser(alice, async () => {
  await db.query(`insert into public.coach_memory_prefs (user_id, capture) values ($1,false)`, [
    alice,
  ]);
  return (await db.query(`select capture from public.coach_memory_prefs where user_id=$1`, [alice]))
    .rows[0].capture;
});
check("an athlete can turn remembering off", pref.ok && pref.value === false, pref.error);

const flip = await asUser(bob, async () =>
  db.query(`update public.coach_memory_prefs set capture=true where user_id=$1`, [alice]),
);
check(
  "nobody else can turn it back on",
  !flip.ok || (await db.query(`select capture from public.coach_memory_prefs where user_id=$1`, [alice])).rows[0].capture === false,
  "bob changed alice's preference",
);

/* 8. Deleting a thread takes its messages with it. */

const wipe = await asUser(alice, async () => {
  await db.query(`delete from public.coach_conversations where id=$1`, [aliceThread]);
  return (await db.query(`select count(*)::int as n from public.coach_messages`)).rows[0].n;
});
check(
  "deleting a conversation deletes its messages",
  wipe.ok && wipe.value === 0,
  wipe.error ?? `n=${wipe.value}`,
);

/* 9. Deleting the account takes everything. */

const before = (await db.query(`select count(*)::int as n from public.coach_notes where user_id=$1`, [bob])).rows[0].n;
await db.query(`delete from auth.users where id=$1`, [bob]);
const left = (await db.query(`select count(*)::int as n from public.coach_notes where user_id=$1`, [bob])).rows[0].n;
const others = (await db.query(`select count(*)::int as n from public.coach_notes`)).rows[0].n;
// And only theirs: a cascade that reached further would be a data-loss bug
// wearing the costume of a privacy feature.
check(
  "deleting an account cascades that athlete's memory away",
  before === 1 && left === 0 && others === 1,
  `before=${before} after=${left} others=${others}`,
);

/* -------------------------------------------------------------------------- */

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : `  -- ${r.detail ?? ""}`}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) process.exitCode = 1;
