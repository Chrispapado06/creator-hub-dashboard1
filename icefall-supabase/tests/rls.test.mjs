import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "migrations");

// Every migration, in order — so this stays honest as the schema grows.
const SQL = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");

const db = await PGlite.create();
await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text,
                           raw_user_meta_data jsonb default '{}'::jsonb);
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  end $$;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
  create publication supabase_realtime;
`);
await db.exec(SQL);

// Seed as superuser (stands in for the service role).
const mk = async (email, role, name) => {
  const u = await db.query(`insert into auth.users (email) values ($1) returning id`, [email]);
  const id = u.rows[0].id;
  await db.query(`update public.profiles set role=$2, display_name=$3 where id=$1`, [id, role, name]);
  return id;
};
const alice = await mk("alice@x.io", "athlete", "Alice");   // in the thread
const bob = await mk("bob@x.io", "athlete", "Bob");         // NOT in the thread
const guide = await mk("guide@x.io", "guide", "Guide G");
const admin = await mk("admin@x.io", "admin", "Staff");

const th = await db.query(
  `insert into public.threads (peak_name, created_by) values ('Mont Blanc', $1) returning id`, [alice]);
const threadId = th.rows[0].id;
await db.query(`insert into public.thread_participants (thread_id, profile_id) values ($1,$2),($1,$3)`,
  [threadId, alice, guide]);
await db.query(`insert into public.messages (thread_id, sender_id, body) values ($1,$2,'My dates and my experience.')`,
  [threadId, alice]);

/** Run fn as a signed-in user (or anon when uid is null). */
async function as(uid, fn) {
  await db.exec("begin");
  await db.exec(`set local role ${uid ? "authenticated" : "anon"}`);
  if (uid) await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  else await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e.message.split("\n")[0] };
  } finally {
    await db.exec("rollback");
  }
}

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

// 1. participants can read
let r = await as(alice, () => db.query(`select body from public.messages`));
check("Alice (participant) reads her thread", r.ok && r.value.rows.length === 1,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(guide, () => db.query(`select body from public.messages`));
check("Guide (participant) reads the thread", r.ok && r.value.rows.length === 1,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// 2. THE ONE THAT MATTERS — an outsider must see nothing
r = await as(bob, () => db.query(`select body from public.messages`));
check("Bob (outsider) reads NOTHING", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(bob, () => db.query(`select * from public.threads`));
check("Bob cannot see the thread row", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(bob, () => db.query(`select * from public.thread_participants`));
check("Bob cannot enumerate participants", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// 3. anon gets nothing at all
r = await as(null, () => db.query(`select body from public.messages`));
check("anon is refused messages", !r.ok, r.ok ? `LEAKED ${r.value.rows.length} row(s)` : r.error);

// 4. outsider cannot inject himself into the conversation
r = await as(bob, () => db.query(
  `insert into public.thread_participants (thread_id, profile_id) values ($1,$2)`, [threadId, bob]));
check("Bob cannot add himself to the thread", !r.ok, r.ok ? "INSERTED" : r.error);

// 5. outsider cannot post into it
r = await as(bob, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'hi')`, [threadId, bob]));
check("Bob cannot post into the thread", !r.ok, r.ok ? "INSERTED" : r.error);

// 6. forgery — participant writing in someone else's name
r = await as(guide, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'forged')`, [threadId, alice]));
check("Guide cannot forge a message as Alice", !r.ok, r.ok ? "INSERTED" : r.error);

// 7. history is immutable, even for a participant
r = await as(alice, () => db.query(`update public.messages set body='rewritten'`));
check("Alice cannot edit a sent message", !r.ok, r.ok ? "UPDATED" : r.error);
r = await as(alice, () => db.query(`delete from public.messages`));
check("Alice cannot delete a sent message", !r.ok, r.ok ? "DELETED" : r.error);

// 8. privilege escalation
r = await as(bob, () => db.query(`update public.profiles set role='admin' where id=$1`, [bob]));
const escalated = r.ok
  ? (await db.query(`select role from public.profiles where id=$1`, [bob])).rows[0].role === "admin"
  : false;
check("Bob cannot promote himself to admin", !escalated, escalated ? "ESCALATED" : (r.ok ? "no rows changed" : r.error));

// 9. admin oversight works
r = await as(admin, () => db.query(`select body from public.messages`));
check("Admin can read for support", r.ok && r.value.rows.length === 1,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// 10. unlisted providers stay hidden
await db.query(`insert into public.guide_profiles (id, listed) values ($1, false)`, [guide]);
r = await as(bob, () => db.query(`select * from public.guide_profiles`));
check("Unlisted guide profile hidden from others", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// 11. the verification lock
r = await as(guide, () => db.query(`update public.guide_profiles set credentials_verified=true where id=$1`, [guide]));
check("Guide cannot mark themselves verified", !r.ok, r.ok ? "VERIFIED ITSELF" : r.error);

/* ---- chat: blocking, idempotency, reporting ------------------------------ */

// A direct thread between Alice and Bob so blocking can be exercised.
const dm = (await db.query(
  `insert into public.threads (kind, created_by) values ('direct', $1) returning id`, [alice])).rows[0].id;
await db.query(`insert into public.thread_participants (thread_id, profile_id) values ($1,$2),($1,$3)`,
  [dm, alice, bob]);

r = await as(bob, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'hello')`, [dm, bob]));
check("Bob can message Alice before any block", r.ok, r.ok ? "sent" : r.error);

// Alice blocks Bob.
await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1,$2)`, [alice, bob]);

r = await as(bob, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'again')`, [dm, bob]));
check("blocked user cannot post", !r.ok, r.ok ? "SENT ANYWAY" : r.error);

// Symmetric: the blocker cannot keep talking at them either.
r = await as(alice, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'still here')`, [dm, alice]));
check("block is symmetric — blocker also stopped", !r.ok, r.ok ? "SENT ANYWAY" : r.error);

// The blocked party must not be able to discover the block.
r = await as(bob, () => db.query(`select * from public.blocks`));
check("blocked user cannot see the block", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(alice, () => db.query(`select * from public.blocks`));
check("blocker sees their own block", r.ok && r.value.rows.length === 1,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// Offline send: the same client_id retried must insert once, not twice.
const cid = "11111111-2222-3333-4444-555555555555";
await db.exec("begin");
await db.exec("set local role authenticated");
await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [guide]);
let dupOk = false;
try {
  await db.query(
    `insert into public.messages (thread_id, sender_id, body, client_id) values ($1,$2,'queued',$3)`,
    [threadId, guide, cid]);
  try {
    await db.query(
      `insert into public.messages (thread_id, sender_id, body, client_id) values ($1,$2,'queued',$3)`,
      [threadId, guide, cid]);
  } catch { dupOk = true; }
} catch (e) { dupOk = false; }
await db.exec("rollback");
check("a retried offline message inserts once", dupOk, dupOk ? "second insert rejected" : "DUPLICATED");

// Reporting
r = await as(bob, () => db.query(
  `insert into public.reports (reporter_id, subject_id, reason, detail) values ($1,$2,'off_platform_payment','asked me to pay by bank transfer')`,
  [bob, guide]));
check("anyone can file a report", r.ok, r.ok ? "filed" : r.error);

r = await as(bob, () => db.query(
  `insert into public.reports (reporter_id, subject_id, reason) values ($1,$2,'spam')`, [alice, guide]));
check("cannot file a report as someone else", !r.ok, r.ok ? "FILED" : r.error);

/* -- waitlist: insert-only to the public ------------------------------------
   The launch page writes here with the publishable key, so `anon` is the
   attacker as well as the customer. Adding yourself must work; everything else
   must not — a list of customer email addresses that anon can SELECT is a list
   that has been published. */

// Seeded as superuser, standing in for an address someone already left.
await db.query(`insert into public.waitlist (email, name, source) values ('early@x.io','Early Bird','hero')`);

r = await as(null, () => db.query(
  `insert into public.waitlist (email, name, source) values ('stranger@x.io','A Stranger','hero')`));
check("anon can join the waitlist", r.ok, r.ok ? "inserted" : r.error);

r = await as(null, () => db.query(`select email from public.waitlist`));
check("anon CANNOT read the waitlist", !r.ok || r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s) LEAKED` : r.error);

r = await as(alice, () => db.query(`select email from public.waitlist`));
check("a signed-in user cannot read it either", !r.ok || r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s) LEAKED` : r.error);

r = await as(null, () => db.query(`update public.waitlist set email='hijack@x.io'`));
check("anon cannot rewrite an address", !r.ok, r.ok ? "UPDATED" : r.error);

r = await as(null, () => db.query(`delete from public.waitlist`));
check("anon cannot delete the list", !r.ok, r.ok ? "DELETED" : r.error);

// The API lowercases and trims before it gets here; the constraint is what makes
// `unique (email)` mean one person rather than one spelling.
r = await as(null, () => db.query(
  `insert into public.waitlist (email, source) values ('Mixed.Case@X.IO','hero')`));
check("an unnormalised address is rejected", !r.ok, r.ok ? "ACCEPTED" : r.error);

r = await as(null, () => db.query(
  `insert into public.waitlist (email, source) values ('early@x.io','footer')`));
check("the same address cannot be added twice", !r.ok, r.ok ? "DUPLICATED" : r.error);

r = await as(null, () => db.query(
  `insert into public.waitlist (email, source) values ('not-an-email','hero')`));
check("a malformed address is rejected", !r.ok, r.ok ? "ACCEPTED" : r.error);


console.log("\nRLS ATTACK RESULTS\n" + "=".repeat(64));
let failed = 0;
for (const t of results) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? " PASS" : " FAIL"}  ${t.name.padEnd(42)} ${t.detail ?? ""}`);
}
console.log("=".repeat(64));
console.log(`${results.length - failed}/${results.length} passed`);
await db.close();
process.exit(failed ? 1 : 0);
