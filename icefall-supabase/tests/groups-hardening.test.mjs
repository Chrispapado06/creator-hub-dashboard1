// Groups file 1 (groups_hardening), run against a real Postgres.
//
// `node tests/groups-hardening.test.mjs`. Standalone and NOT in the `npm test`
// chain, like coach-limits.test.mjs: that chain's first link, rls.test.mjs,
// is broken, so nothing after it runs. Plan §6.4.
//
// It loads every migration, then groups_hardening.sql from wherever it is now:
// migrations-staged/groups/ until the owner applies it, migrations/ after.
//
// WHAT IS PROVED
//   - RLS is forced on group_join_requests and group_messages.
//   - A declined requester cannot delete the request and ask again.
//   - An accepted request cannot be deleted by the requester either.
//   - A pending request can still be withdrawn.
//   - A founder cannot rewrite profile_id, move a request to another group,
//     or change requested_at, and can still accept, decline and change their mind.
//   - Staff can remove a member; a plain member cannot remove somebody else;
//     the founder still can; leaving still works.
//   - Members still read and write the chat; a stranger still reads nothing.
//   - The block rule on the roster and the chat is still there (plan R9).
//   - Deleting the decider's account still works with the new trigger.
//   - Running the file a second time changes nothing and raises nothing.

import { readFileSync } from "node:fs";
import { locateGroupFile, openGroupsDb } from "./lib/groups-db.mjs";

const { db, sources, mkUser, as, check, finish } = await openGroupsDb("groups_hardening");
console.log(`groups_hardening.sql loaded from: ${sources.groups_hardening}\n`);

/* ---- people and places (as superuser, which stands in for the service role) ---- */

const founder = await mkUser("founder@x.io", "Founder");
const founder2 = await mkUser("founder2@x.io", "Second founder");
const declined = await mkUser("declined@x.io", "Declined");
const pending = await mkUser("pending@x.io", "Pending");
const accepted = await mkUser("accepted@x.io", "Accepted");
const member = await mkUser("member@x.io", "Member");
const stranger = await mkUser("stranger@x.io", "Stranger");
const staff = await mkUser("staff@icefall.test", "Staff", { staff: true });

await db.query(
  `insert into public.destinations (id, name, kind) values ('test-peak', 'Test Peak', 'mountain')
   on conflict (id) do nothing`,
);

const mkGroup = async (by, name, visibility) => {
  const r = await as(
    by,
    () =>
      db.query(
        `insert into public.groups (destination_id, name, created_by, visibility)
         values ('test-peak', $1, $2, $3) returning id`,
        [name, by, visibility],
      ),
    { keep: true },
  );
  if (!r.ok) throw new Error(`could not create ${name}: ${r.error}`);
  return r.value.rows[0].id;
};

const privateGroup = await mkGroup(founder, "Private team", "private");
const otherGroup = await mkGroup(founder, "Another team", "private");
const secondFounderGroup = await mkGroup(founder2, "Second founder's team", "private");

// Asks arrive undecided, as the insert policy requires.
for (const who of [declined, pending, accepted]) {
  const r = await as(
    who,
    () => db.query(`insert into public.group_join_requests (group_id, profile_id) values ($1, $2)`, [privateGroup, who]),
    { keep: true },
  );
  if (!r.ok) throw new Error(`ask failed: ${r.error}`);
}
const askSecond = await as(
  declined,
  () =>
    db.query(`insert into public.group_join_requests (group_id, profile_id) values ($1, $2)`, [
      secondFounderGroup,
      declined,
    ]),
  { keep: true },
);
if (!askSecond.ok) throw new Error(`ask failed: ${askSecond.error}`);

const decide = (by, group, who, accept) =>
  as(
    by,
    () =>
      db.query(
        `update public.group_join_requests
            set accepted_at = $4, declined_at = $5, decided_by = $1
          where group_id = $2 and profile_id = $3
         returning group_id`,
        [by, group, who, accept ? new Date().toISOString() : null, accept ? null : new Date().toISOString()],
      ),
    { keep: true },
  );

let r = await decide(founder, privateGroup, declined, false);
check("founder can decline a request", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);
r = await decide(founder, privateGroup, accepted, true);
check("founder can accept a request", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);
r = await decide(founder2, secondFounderGroup, declined, false);
if (!r.ok) throw new Error(`second decision failed: ${r.error}`);

// The accepted person joins; a plain member joins too (seated through an accepted ask).
r = await as(accepted, () => db.query(`insert into public.group_members (group_id, profile_id) values ($1, $2)`, [privateGroup, accepted]), { keep: true });
check("an accepted person can join the private group", r.ok, r.ok ? "" : r.error);
await db.query(`insert into public.group_join_requests (group_id, profile_id, accepted_at, decided_by) values ($1, $2, now(), $3)`, [privateGroup, member, founder]);
await db.query(`insert into public.group_members (group_id, profile_id) values ($1, $2)`, [privateGroup, member]);

/* ---- 1. FORCE row level security ------------------------------------------------ */

const flags = (
  await db.query(
    `select relname, relrowsecurity, relforcerowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relname in ('group_join_requests', 'group_messages')
      order by relname`,
  )
).rows;
for (const t of ["group_join_requests", "group_messages"]) {
  const row = flags.find((f) => f.relname === t);
  check(`RLS is enabled and forced on ${t}`, row && row.relrowsecurity === true && row.relforcerowsecurity === true, JSON.stringify(row));
}

/* ---- 2. Only an undecided request can be withdrawn ------------------------------- */

r = await as(declined, async () => {
  const del = await db.query(`delete from public.group_join_requests where group_id = $1 and profile_id = $2 returning 1`, [privateGroup, declined]);
  const still = await db.query(`select declined_at from public.group_join_requests where group_id = $1 and profile_id = $2`, [privateGroup, declined]);
  return { deleted: del.rows.length, still: still.rows.length, declinedAt: still.rows[0]?.declined_at ?? null };
});
check(
  "a declined requester cannot delete the request",
  r.ok && r.value.deleted === 0 && r.value.still === 1 && r.value.declinedAt !== null,
  JSON.stringify(r),
);

// Withdraw-then-ask in one transaction, which is what the old policy allowed.
r = await as(declined, async () => {
  await db.query(`delete from public.group_join_requests where group_id = $1 and profile_id = $2`, [privateGroup, declined]);
  return db.query(`insert into public.group_join_requests (group_id, profile_id) values ($1, $2)`, [privateGroup, declined]);
});
check("so a declined requester cannot ask again", !r.ok, r.ok ? "ASKED AGAIN" : r.error);

r = await as(declined, () => db.query(`insert into public.group_members (group_id, profile_id) values ($1, $2)`, [privateGroup, declined]));
check("and a declined requester still cannot join", !r.ok, r.ok ? "JOINED" : r.error);

r = await as(accepted, () => db.query(`delete from public.group_join_requests where group_id = $1 and profile_id = $2 returning 1`, [privateGroup, accepted]));
check("an accepted request cannot be deleted by the requester", r.ok && r.value.rows.length === 0, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(pending, () => db.query(`delete from public.group_join_requests where group_id = $1 and profile_id = $2 returning 1`, [privateGroup, pending]));
check("a pending request can still be withdrawn", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(stranger, () => db.query(`delete from public.group_join_requests returning 1`));
check("nobody deletes somebody else's request", r.ok && r.value.rows.length === 0, r.ok ? `${r.value.rows.length} row(s)` : r.error);

/* ---- 3. A request's identity is frozen ------------------------------------------ */

r = await as(founder, () =>
  db.query(
    `update public.group_join_requests set profile_id = $1, accepted_at = now(), declined_at = null, decided_by = $2
      where group_id = $3 and profile_id = $4 returning 1`,
    [stranger, founder, privateGroup, pending],
  ),
);
check("a founder cannot rewrite profile_id to admit somebody who never asked", !r.ok, r.ok ? `UPDATED ${r.value.rows.length}` : r.error);

r = await as(founder, () =>
  db.query(
    `update public.group_join_requests set profile_id = $1, decided_by = $2
      where group_id = $3 and profile_id = $4 returning 1`,
    [stranger, founder, privateGroup, declined],
  ),
);
check("a founder cannot rewrite profile_id on a decided request", !r.ok, r.ok ? `UPDATED ${r.value.rows.length}` : r.error);

r = await as(founder, () =>
  db.query(
    `update public.group_join_requests set group_id = $1, accepted_at = now(), declined_at = null, decided_by = $2
      where group_id = $3 and profile_id = $4 returning 1`,
    [otherGroup, founder, privateGroup, declined],
  ),
);
check("a founder cannot move a request to another group they started", !r.ok, r.ok ? `UPDATED ${r.value.rows.length}` : r.error);

r = await as(founder, () =>
  db.query(
    `update public.group_join_requests set requested_at = now() - interval '30 days', decided_by = $1
      where group_id = $2 and profile_id = $3 returning 1`,
    [founder, privateGroup, declined],
  ),
);
check("a founder cannot change requested_at", !r.ok, r.ok ? `UPDATED ${r.value.rows.length}` : r.error);

await db.exec("begin");
r = await db
  .query(`update public.group_join_requests set profile_id = $1 where group_id = $2 and profile_id = $3`, [stranger, privateGroup, declined])
  .then(() => ({ ok: true }), (e) => ({ ok: false, error: e.message.split("\n")[0] }));
await db.exec("rollback");
check("the freeze holds for the service role too", !r.ok, r.ok ? "UPDATED" : r.error);

r = await as(founder, () =>
  db.query(
    `update public.group_join_requests set accepted_at = now(), declined_at = null, decided_by = $1
      where group_id = $2 and profile_id = $3 returning accepted_at`,
    [founder, privateGroup, declined],
  ),
);
check("a founder can still change their mind (declined to accepted)", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(stranger, () =>
  db.query(
    `update public.group_join_requests set accepted_at = now(), declined_at = null, decided_by = $1
      where group_id = $2 and profile_id = $3 returning 1`,
    [stranger, privateGroup, declined],
  ),
);
check("a stranger still cannot decide a request", r.ok && r.value.rows.length === 0, r.ok ? `${r.value.rows.length} row(s)` : r.error);

// Deleting the decider's account nulls decided_by (on delete set null), and the
// freeze trigger fires on that update, so it must let it through.
//
// The decider here is NOT a group founder, set by the service role. Deleting a
// founder's account fails before it reaches this table, and not because of this
// file: `groups.created_by` is `on delete set null`, and `groups_guard`
// (20260902100000) refuses any change to `created_by`. That is an existing bug
// for file 2 (group_roles), which owns what happens when an organiser's account
// goes. It is recorded in the handbook, not fixed here.
const decider = await mkUser("decider@x.io", "Decider");
await db.query(`update public.group_join_requests set decided_by = $1 where group_id = $2 and profile_id = $3`, [
  decider,
  secondFounderGroup,
  declined,
]);
r = await db
  .query(`delete from auth.users where id = $1`, [decider])
  .then(() => ({ ok: true }), (e) => ({ ok: false, error: e.message.split("\n")[0] }));
const orphaned = (
  await db.query(`select decided_by, declined_at from public.group_join_requests where group_id = $1 and profile_id = $2`, [
    secondFounderGroup,
    declined,
  ])
).rows[0];
check(
  "deleting the decider's account still works and keeps the decision",
  r.ok && orphaned && orphaned.decided_by === null && orphaned.declined_at !== null,
  r.ok ? JSON.stringify(orphaned) : r.error,
);

/* ---- 4. Staff can remove a member again ----------------------------------------- */

r = await as(member, () => db.query(`delete from public.group_members where group_id = $1 and profile_id = $2 returning 1`, [privateGroup, accepted]));
check("a plain member cannot remove somebody else", r.ok && r.value.rows.length === 0, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(staff, () => db.query(`delete from public.group_members where group_id = $1 and profile_id = $2 returning 1`, [privateGroup, accepted]));
check("staff can remove a member", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(founder, () => db.query(`delete from public.group_members where group_id = $1 and profile_id = $2 returning 1`, [privateGroup, accepted]));
check("the founder can still remove a member", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(member, () => db.query(`delete from public.group_members where group_id = $1 and profile_id = $2 returning 1`, [privateGroup, member]));
check("a member can still leave", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

/* ---- The chat still works under FORCE ------------------------------------------- */

r = await as(
  member,
  () =>
    db.query(`insert into public.group_messages (group_id, author_id, body) values ($1, $2, 'Meeting at the hut at six.') returning id`, [
      privateGroup,
      member,
    ]),
  { keep: true },
);
check("a member can still send a message", r.ok && r.value.rows.length === 1, r.ok ? "" : r.error);

r = await as(founder, () => db.query(`select body from public.group_messages where group_id = $1`, [privateGroup]));
check("a member can still read the chat", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(stranger, () => db.query(`select body from public.group_messages`));
check("a stranger still reads no message", r.ok && r.value.rows.length === 0, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(stranger, () => db.query(`insert into public.group_messages (group_id, author_id, body) values ($1, $2, 'hi')`, [privateGroup, stranger]));
check("a stranger still cannot send a message", !r.ok, r.ok ? "SENT" : r.error);

/* ---- Policy text: the fixes are there, and the block rule was not lost (R9) ---------- */

const policy = async (table, name) =>
  (await db.query(`select qual, with_check from pg_policies where schemaname = 'public' and tablename = $1 and policyname = $2`, [table, name])).rows[0] ?? null;

const reqDelete = await policy("group_join_requests", "group_join_requests_delete");
check(
  "group_join_requests_delete tests both outcomes are unset",
  reqDelete && /accepted_at IS NULL/i.test(reqDelete.qual) && /declined_at IS NULL/i.test(reqDelete.qual),
  JSON.stringify(reqDelete),
);
const memDelete = await policy("group_members", "group_members_delete");
// `is_group_founder` OR `is_group_organiser`: this file restores the staff arm
// beside whoever runs the group, and file 2 (group_roles) renames that person
// without touching the staff arm. Once BOTH files are applied, migrations/
// holds both and the later one wins — so pinning one name here would fail the
// day the owner applies file 2, for a rename this test is not about.
// `groups-roles.test.mjs` asserts the organiser name specifically.
check(
  "group_members_delete has self, organiser and staff arms",
  memDelete &&
    /auth\.uid\(\)/.test(memDelete.qual) &&
    /is_group_(founder|organiser)/.test(memDelete.qual) &&
    /is_staff\(\)/.test(memDelete.qual),
  JSON.stringify(memDelete),
);
const memSelect = await policy("group_members", "group_members_select");
check("group_members_select still carries the block rule", memSelect && /blocked_ids/.test(memSelect.qual), JSON.stringify(memSelect));
const msgSelect = await policy("group_messages", "group_messages_select");
check("group_messages_select still carries the block rule", msgSelect && /blocked_ids/.test(msgSelect.qual), JSON.stringify(msgSelect));
const reqInsert = await policy("group_join_requests", "group_join_requests_insert");
check(
  "an ask must still arrive undecided",
  reqInsert && /accepted_at IS NULL/i.test(reqInsert.with_check) && /decided_by IS NULL/i.test(reqInsert.with_check),
  JSON.stringify(reqInsert),
);

const trig = (
  await db.query(
    `select tgname from pg_trigger where tgrelid = 'public.group_join_requests'::regclass and not tgisinternal and tgname = 'group_join_requests_freeze_identity'`,
  )
).rows;
check("the freeze trigger is installed", trig.length === 1, JSON.stringify(trig));

/* ---- Safe to run twice ---------------------------------------------------------- */

const located = locateGroupFile("groups_hardening");
r = await db
  .exec(readFileSync(located.path, "utf8"))
  .then(() => ({ ok: true }), (e) => ({ ok: false, error: e.message.split("\n")[0] }));
check("running the file a second time raises nothing", r.ok, r.ok ? "" : r.error);
const flagsAgain = (
  await db.query(
    `select count(*)::int as n from pg_class where relnamespace = 'public'::regnamespace
       and relname in ('group_join_requests', 'group_messages') and relforcerowsecurity`,
  )
).rows[0].n;
check("and both tables are still forced afterwards", flagsAgain === 2, String(flagsAgain));

finish();
