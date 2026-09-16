// Groups file 2 (group_roles), run against a real Postgres.
//
// `node tests/groups-roles.test.mjs`. Standalone and NOT in the `npm test`
// chain, like coach-limits.test.mjs and groups-hardening.test.mjs: that chain's
// first link, rls.test.mjs, is broken, so nothing after it runs. Plan §6.4.
//
// It loads every migration, then groups_hardening.sql and group_roles.sql from
// wherever each is now: migrations-staged/groups/ until the owner applies it,
// migrations/ after.
//
// WHAT IS PROVED
//   - The backfill picks the creator when they are still a member, and the
//     earliest-joined member when the creator has left or `created_by` is null.
//   - Creating a group seats its creator as the organiser; joining one does not.
//   - A client cannot write `role`: not on the way in, and not afterwards.
//   - One organiser per group, enforced by the schema.
//   - Organiser powers follow the ROLE, not `created_by`: requests, removing a
//     member, deleting a message, deleting a post (D14).
//   - Handing the group on works, and only the organiser can do it.
//   - The last organiser leaving promotes the earliest-joined member (D3).
//   - Their ACCOUNT BEING DELETED does too — and the account can now be deleted
//     at all, which before this file it could not (`groups_guard`).
//   - `has_organiser` answers a stranger honestly, and answers false for a
//     group everybody has left.
//   - Deleting a group with members raises nothing.
//   - The block rule and the staff arms survived every policy rewrite (R9).
//   - Running the file a second time changes nothing and raises nothing.

import { readFileSync } from "node:fs";
import { locateGroupFile, openGroupsDb } from "./lib/groups-db.mjs";

const { db, sources, mkUser, as, check, finish } = await openGroupsDb("group_roles");
console.log(
  `groups_hardening.sql loaded from: ${sources.groups_hardening}\n` +
    `group_roles.sql loaded from: ${sources.group_roles}\n`,
);

/* ---- people and places (as superuser, which stands in for the service role) ---- */

const creator = await mkUser("creator@x.io", "Creator");
const alice = await mkUser("alice@x.io", "Alice");
const bob = await mkUser("bob@x.io", "Bob");
const asker = await mkUser("asker@x.io", "Asker");
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

/** Seat somebody in a public group, as themselves, for real. */
const join = async (who, group) => {
  const r = await as(
    who,
    () => db.query(`insert into public.group_members (group_id, profile_id) values ($1, $2)`, [group, who]),
    { keep: true },
  );
  if (!r.ok) throw new Error(`could not join: ${r.error}`);
};

/*
 * WHEN SOMEBODY JOINED, SET DELIBERATELY.
 *
 * `joined_at` defaults to now(), which is the TRANSACTION's clock — two people
 * seated microseconds apart can hold the same value, and the tiebreak is then
 * `profile_id`, which is a random uuid. Every "earliest-joined" assertion below
 * would be a coin toss. So each fixture is stamped with a minute of its own.
 * The app never writes this column (the insert privilege does not cover it);
 * this runs as the superuser, which stands in for the service role.
 */
const stamp = (group, who, minute) =>
  db.query(
    `update public.group_members set joined_at = timestamptz '2026-01-01 00:00:00+00' + ($3 || ' minutes')::interval
      where group_id = $1 and profile_id = $2`,
    [group, who, String(minute)],
  );

const roleOf = async (group, who) =>
  (
    await db.query(`select role from public.group_members where group_id = $1 and profile_id = $2`, [group, who])
  ).rows[0]?.role ?? null;

const organiserOf = async (group) =>
  (
    await db.query(`select profile_id from public.group_members where group_id = $1 and role = 'organiser'`, [group])
  ).rows[0]?.profile_id ?? null;

let r;

/* ========================================================================== */
/* 1. The backfill                                                            */
/* ========================================================================== */

/*
 * A migration cannot be tested against rows that existed before it ran, because
 * by the time this file opens the database it has already run. So three groups
 * are built and then put back into the state file 2 found them in — every role
 * 'member' — and `group_roles_backfill()` is called again. It is the same
 * function the migration itself calls on its last line.
 */

const bf1 = await mkGroup(creator, "Creator still in", "public");
await join(alice, bf1);
await stamp(bf1, creator, 1);
await stamp(bf1, alice, 2);

const bf2 = await mkGroup(creator, "Creator has left", "public");
await join(alice, bf2);
await join(bob, bf2);
await stamp(bf2, creator, 1);
await stamp(bf2, alice, 2);
await stamp(bf2, bob, 3);
// The creator leaves. The promotion trigger fires here; the reset below undoes
// it, which is the point — this group is now shaped like a pre-file-2 row.
r = await as(
  creator,
  () => db.query(`delete from public.group_members where group_id = $1 and profile_id = $2`, [bf2, creator]),
  { keep: true },
);
if (!r.ok) throw new Error(`creator could not leave: ${r.error}`);

const bf3 = await mkGroup(creator, "Creator deleted their account", "public");
await join(alice, bf3);
await join(bob, bf3);
await stamp(bf3, creator, 1);
await stamp(bf3, alice, 2);
await stamp(bf3, bob, 3);
r = await as(
  creator,
  () => db.query(`delete from public.group_members where group_id = $1 and profile_id = $2`, [bf3, creator]),
  { keep: true },
);
if (!r.ok) throw new Error(`creator could not leave: ${r.error}`);
// The `on delete set null` an account deletion performs, done by hand. Before
// this file `groups_guard` raised on it, which is why nobody who had started a
// group could delete their account (§5 proves the whole cascade).
r = await db
  .query(`update public.groups set created_by = null where id = $1`, [bf3])
  .then(() => ({ ok: true }), (e) => ({ ok: false, error: e.message.split("\n")[0] }));
check("created_by can be nulled, as an account deletion does", r.ok, r.ok ? "" : r.error);

await db.query(`update public.group_members set role = 'member' where group_id = any($1::uuid[])`, [[bf1, bf2, bf3]]);

const filled = (await db.query(`select public.group_roles_backfill() as n`)).rows[0].n;
check("the backfill fills every group that has no organiser", filled === 3, String(filled));

check("it picks the creator when they are still a member", (await organiserOf(bf1)) === creator, String(await organiserOf(bf1)));
check(
  "it picks the earliest-joined member when the creator has left",
  (await organiserOf(bf2)) === alice,
  String(await organiserOf(bf2)),
);
check(
  "it picks the earliest-joined member when created_by is null",
  (await organiserOf(bf3)) === alice,
  String(await organiserOf(bf3)),
);

const again = (await db.query(`select public.group_roles_backfill() as n`)).rows[0].n;
check("and running it again fills nothing", again === 0, String(again));

/* ========================================================================== */
/* 2. Who becomes the organiser, and who cannot write the column              */
/* ========================================================================== */

const team = await mkGroup(creator, "Private team", "private");
check("creating a group seats its creator as the organiser", (await roleOf(team, creator)) === "organiser");

const open = await mkGroup(creator, "Open group", "public");
await join(alice, open);
await join(bob, open);
check("joining a group makes you a member", (await roleOf(open, alice)) === "member", String(await roleOf(open, alice)));

r = await as(alice, () =>
  db.query(`insert into public.group_members (group_id, profile_id, role) values ($1, $2, 'organiser')`, [team, alice]),
);
check("a client cannot name the role column on the way in", !r.ok, r.ok ? "INSERTED" : r.error);

r = await as(bob, () =>
  db.query(`update public.group_members set role = 'organiser' where group_id = $1 and profile_id = $2 returning 1`, [open, bob]),
);
check("and cannot update it afterwards — there is no update grant at all", !r.ok, r.ok ? `UPDATED ${r.value.rows.length}` : r.error);

const grants = (
  await db.query(
    `select privilege_type, column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'group_members' and grantee = 'authenticated'
        and privilege_type = 'INSERT' order by column_name`,
  )
).rows;
check(
  "the insert privilege names group_id and profile_id and nothing else",
  grants.length === 2 && grants.map((g) => g.column_name).join(",") === "group_id,profile_id",
  JSON.stringify(grants),
);

await db.exec("begin");
r = await db
  .query(`update public.group_members set role = 'organiser' where group_id = $1 and profile_id = $2`, [open, bob])
  .then(() => ({ ok: true }), (e) => ({ ok: false, error: e.message.split("\n")[0] }));
await db.exec("rollback");
check("a second organiser is impossible even for the service role", !r.ok, r.ok ? "TWO ORGANISERS" : r.error);

/* ========================================================================== */
/* 3. Organiser powers follow the role                                        */
/* ========================================================================== */

// alice and bob are seated in the private team through accepted asks, which is
// the only way into a private group.
for (const who of [alice, bob]) {
  await db.query(
    `insert into public.group_join_requests (group_id, profile_id, accepted_at, decided_by) values ($1, $2, now(), $3)`,
    [team, who, creator],
  );
  r = await as(who, () => db.query(`insert into public.group_members (group_id, profile_id) values ($1, $2)`, [team, who]), {
    keep: true,
  });
  if (!r.ok) throw new Error(`seating failed: ${r.error}`);
}

await stamp(team, creator, 1);
await stamp(team, alice, 2);
await stamp(team, bob, 3);

r = await as(
  asker,
  () => db.query(`insert into public.group_join_requests (group_id, profile_id) values ($1, $2)`, [team, asker]),
  { keep: true },
);
check("somebody can ask to join the private team", r.ok, r.ok ? "" : r.error);

r = await as(creator, () => db.query(`select profile_id from public.group_join_requests where group_id = $1`, [team]));
check("the organiser reads the asks", r.ok && r.value.rows.length === 3, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(alice, () => db.query(`select profile_id from public.group_join_requests where group_id = $1`, [team]));
check(
  "a plain member reads only their own ask, never anybody else's",
  r.ok && r.value.rows.length === 1 && r.value.rows[0].profile_id === alice,
  r.ok ? `${r.value.rows.length} row(s)` : r.error,
);

// A message and a post to act on.
const msg = await as(
  alice,
  () =>
    db.query(`insert into public.group_messages (group_id, author_id, body) values ($1, $2, 'Six at the hut.') returning id`, [
      team,
      alice,
    ]),
  { keep: true },
);
if (!msg.ok) throw new Error(`message failed: ${msg.error}`);
const msgId = msg.value.rows[0].id;

const post = await as(
  alice,
  () =>
    db.query(`insert into public.posts (author_id, body, group_id) values ($1, 'Fixed rope ends at the shoulder.', $2) returning id`, [
      alice,
      team,
    ]),
  { keep: true },
);
if (!post.ok) throw new Error(`post failed: ${post.error}`);
const postId = post.value.rows[0].id;

r = await as(bob, () => db.query(`delete from public.group_messages where id = $1 returning 1`, [msgId]));
check("a plain member cannot delete somebody else's message", r.ok && r.value.rows.length === 0, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(bob, () => db.query(`delete from public.posts where id = $1 returning 1`, [postId]));
check("nor their post", r.ok && r.value.rows.length === 0, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(creator, () => db.query(`delete from public.posts where id = $1 returning 1`, [postId]));
check("the organiser can remove a post in their group (D14)", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

const ordinaryPost = (
  await db.query(`insert into public.posts (author_id, body) values ($1, 'An ordinary post.') returning id`, [alice])
).rows[0].id;
r = await as(alice, () => db.query(`delete from public.posts where id = $1 returning 1`, [ordinaryPost]));
check("an ordinary post is still its author's to delete", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(creator, () => db.query(`delete from public.group_messages where id = $1 returning 1`, [msgId]));
check("the organiser can remove a message", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(creator, () => db.query(`delete from public.group_members where group_id = $1 and profile_id = $2 returning 1`, [team, bob]));
check("the organiser can remove a member", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(staff, () => db.query(`delete from public.group_members where group_id = $1 and profile_id = $2 returning 1`, [team, bob]));
check("and staff still can", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

/* ========================================================================== */
/* 4. Handing the group on                                                    */
/* ========================================================================== */

r = await as(stranger, () => db.query(`select public.group_transfer_organiser($1, $2)`, [team, stranger]));
check("a stranger cannot hand the group on", !r.ok, r.ok ? "TRANSFERRED" : r.error);

r = await as(alice, () => db.query(`select public.group_transfer_organiser($1, $2)`, [team, alice]));
check("nor can a plain member take it", !r.ok, r.ok ? "TRANSFERRED" : r.error);

r = await as(creator, () => db.query(`select public.group_transfer_organiser($1, $2)`, [team, stranger]));
check("and it cannot be handed to somebody who is not in the group", !r.ok, r.ok ? "TRANSFERRED" : r.error);

r = await as(creator, () => db.query(`select public.group_transfer_organiser($1, $2)`, [team, alice]), { keep: true });
check("the organiser can hand it to a member", r.ok, r.ok ? "" : r.error);
check("who becomes the organiser", (await roleOf(team, alice)) === "organiser", String(await roleOf(team, alice)));
check("while the person who started it becomes a member", (await roleOf(team, creator)) === "member", String(await roleOf(team, creator)));

r = await as(creator, () => db.query(`select profile_id from public.group_join_requests where group_id = $1`, [team]));
check(
  "the person who started it can no longer read the asks",
  r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error,
);

r = await as(alice, () =>
  db.query(
    `update public.group_join_requests set accepted_at = now(), decided_by = $1 where group_id = $2 and profile_id = $3 returning 1`,
    [alice, team, asker],
  ),
);
check("and the new organiser can answer them", r.ok && r.value.rows.length === 1, r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(alice, () => db.query(`select public.is_group_founder($1) as v`, [team]));
check("`is_group_founder` now asks who runs the group", r.ok && r.value.rows[0].v === true, JSON.stringify(r));
r = await as(creator, () => db.query(`select public.is_group_founder($1) as v, public.is_group_creator($1) as c`, [team]));
check(
  "and `is_group_creator` still asks who made it",
  r.ok && r.value.rows[0].v === false && r.value.rows[0].c === true,
  JSON.stringify(r),
);

/* ========================================================================== */
/* 5. When the organiser goes (D3)                                            */
/* ========================================================================== */

r = await as(
  alice,
  () => db.query(`delete from public.group_members where group_id = $1 and profile_id = $2`, [team, alice]),
  { keep: true },
);
check("the organiser can leave", r.ok, r.ok ? "" : r.error);
check(
  "and the earliest-joined member left behind takes over",
  (await organiserOf(team)) === creator,
  String(await organiserOf(team)),
);

// An account with a group behind it. Before this file `groups_guard` refused
// the `on delete set null` on `created_by`, so this delete failed outright and
// nobody who had ever started a group could leave ICEFALL.
const ghost = await mkUser("ghost@x.io", "Ghost");
const heir = await mkUser("heir@x.io", "Heir");
const left = await mkGroup(ghost, "Group with a deleted founder", "public");
await join(heir, left);
await stamp(left, ghost, 1);
await stamp(left, heir, 2);
check("the founder holds the role before they go", (await roleOf(left, ghost)) === "organiser");

r = await db
  .query(`delete from auth.users where id = $1`, [ghost])
  .then(() => ({ ok: true }), (e) => ({ ok: false, error: e.message.split("\n")[0] }));
check("somebody who has started a group can now delete their account", r.ok, r.ok ? "" : r.error);
check("the group survives them", (await db.query(`select id from public.groups where id = $1`, [left])).rows.length === 1);
check(
  "with created_by null",
  (await db.query(`select created_by from public.groups where id = $1`, [left])).rows[0]?.created_by === null,
);
check("and the earliest-joined member left behind as the organiser", (await organiserOf(left)) === heir, String(await organiserOf(left)));

r = await db
  .query(`update public.groups set created_by = $1 where id = $2`, [heir, left])
  .then(() => ({ ok: true }), (e) => ({ ok: false, error: e.message.split("\n")[0] }));
check("but nobody can be written back into created_by", !r.ok, r.ok ? "REWRITTEN" : r.error);

/* ========================================================================== */
/* 6. A group with nobody in it, and a group being deleted                    */
/* ========================================================================== */

const emptied = await mkGroup(bob, "Everybody left", "private");
r = await as(
  bob,
  () => db.query(`delete from public.group_members where group_id = $1 and profile_id = $2`, [emptied, bob]),
  { keep: true },
);
check("the only member can leave their own group", r.ok, r.ok ? "" : r.error);
check("which then has no organiser", (await organiserOf(emptied)) === null, String(await organiserOf(emptied)));

r = await as(stranger, () => db.query(`select public.has_organiser(g.*) as v from public.groups g where g.id = $1`, [emptied]));
check("and `has_organiser` tells a stranger so", r.ok && r.value.rows[0].v === false, JSON.stringify(r));

r = await as(stranger, () => db.query(`select public.has_organiser(g.*) as v from public.groups g where g.id = $1`, [team]));
check("while a group that has one answers true", r.ok && r.value.rows[0].v === true, JSON.stringify(r));

r = await as(stranger, () => db.query(`select profile_id from public.group_members where group_id = $1`, [team]));
check(
  "and the stranger still cannot read who that is",
  r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error,
);

// Deleting a group cascades its members. The promotion trigger must leave a
// group that is going alone rather than promoting somebody into it on the way
// out.
const doomed = await mkGroup(bob, "To be deleted", "public");
await join(alice, doomed);
r = await as(bob, () => db.query(`delete from public.groups where id = $1 returning 1`, [doomed]), { keep: true });
check("deleting a group with members raises nothing", r.ok && r.value.rows.length === 1, r.ok ? "" : r.error);
check(
  "and takes its member rows with it",
  (await db.query(`select 1 from public.group_members where group_id = $1`, [doomed])).rows.length === 0,
);

/* ========================================================================== */
/* 7. Policy text: nothing was dropped in the rewrites (R9)                   */
/* ========================================================================== */

const policy = async (table, name) =>
  (
    await db.query(`select qual, with_check from pg_policies where schemaname = 'public' and tablename = $1 and policyname = $2`, [
      table,
      name,
    ])
  ).rows[0] ?? null;

const memSelect = await policy("group_members", "group_members_select");
check("group_members_select still carries the block rule", memSelect && /blocked_ids/.test(memSelect.qual), JSON.stringify(memSelect));
const msgSelect = await policy("group_messages", "group_messages_select");
check("group_messages_select still carries the block rule", msgSelect && /blocked_ids/.test(msgSelect.qual), JSON.stringify(msgSelect));

const memDelete = await policy("group_members", "group_members_delete");
check(
  "group_members_delete has self, organiser and staff arms",
  memDelete && /auth\.uid\(\)/.test(memDelete.qual) && /is_group_organiser/.test(memDelete.qual) && /is_staff\(\)/.test(memDelete.qual),
  JSON.stringify(memDelete),
);
const msgDelete = await policy("group_messages", "group_messages_delete");
check(
  "group_messages_delete has author, organiser and staff arms",
  msgDelete && /author_id/.test(msgDelete.qual) && /is_group_organiser/.test(msgDelete.qual) && /is_staff\(\)/.test(msgDelete.qual),
  JSON.stringify(msgDelete),
);
const postDelete = await policy("posts", "posts_delete");
check(
  "posts_delete keeps author, company admin and staff, and gains the group organiser",
  postDelete &&
    /author_id/.test(postDelete.qual) &&
    /is_company_admin/.test(postDelete.qual) &&
    /is_staff\(\)/.test(postDelete.qual) &&
    /is_group_organiser/.test(postDelete.qual) &&
    /group_id IS NOT NULL/i.test(postDelete.qual),
  JSON.stringify(postDelete),
);
const memInsert = await policy("group_members", "group_members_insert");
check(
  "group_members_insert keeps the creation seat, the public arm and the accepted-ask arm",
  memInsert &&
    /is_group_creator/.test(memInsert.with_check) &&
    /visibility = 'public'/.test(memInsert.with_check) &&
    /accepted_at IS NOT NULL/i.test(memInsert.with_check),
  JSON.stringify(memInsert),
);
const reqDelete = await policy("group_join_requests", "group_join_requests_delete");
check(
  "the hardening fix on withdrawing an ask is untouched",
  reqDelete && /accepted_at IS NULL/i.test(reqDelete.qual) && /declined_at IS NULL/i.test(reqDelete.qual),
  JSON.stringify(reqDelete),
);

/* ========================================================================== */
/* 8. Safe to run twice                                                       */
/* ========================================================================== */

const before = (await db.query(`select group_id, profile_id, role from public.group_members order by group_id, profile_id`)).rows;
const located = locateGroupFile("group_roles");
r = await db
  .exec(readFileSync(located.path, "utf8"))
  .then(() => ({ ok: true }), (e) => ({ ok: false, error: e.message.split("\n")[0] }));
check("running the file a second time raises nothing", r.ok, r.ok ? "" : r.error);
const after = (await db.query(`select group_id, profile_id, role from public.group_members order by group_id, profile_id`)).rows;
check("and changes no role", JSON.stringify(before) === JSON.stringify(after), `${before.length} row(s)`);

finish();
