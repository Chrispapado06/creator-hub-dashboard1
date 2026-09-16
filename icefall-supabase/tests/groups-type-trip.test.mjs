// Groups file 3 (group_type_and_trip), run against a real Postgres.
//
// `node tests/groups-type-trip.test.mjs`. Standalone and NOT in the `npm test`
// chain, like coach-limits.test.mjs and the two groups tests beside it: that
// chain's first link, rls.test.mjs, is broken, so nothing after it runs. Plan
// icefall-app/docs/groups-structure-plan.md §6.4.
//
// It loads every migration, then groups_hardening.sql, group_roles.sql and
// group_type_and_trip.sql from wherever each is now: migrations-staged/groups/
// until the owner applies it, migrations/ after.
//
// WHAT IS PROVED
//   - A group no longer has to be about a mountain (owner ruling 2): no
//     destination at all, a trek, or a peak the catalogue does not hold.
//   - `about` is DERIVED from the destination and cannot disagree with it, so
//     a client written before this file — which sends a mountain and no
//     `about` — still creates exactly the group it meant to.
//   - `kind`, `official` and `origin_ref` are facts once written, and
//     `official` is staff-only on the way in as well as afterwards.
//   - One official group per destination.
//   - Capacity refuses the next join, and the trigger takes the group's row
//     lock BEFORE it counts.
//   - `group_import_device` returns the same group twice and takes no members,
//     notes or messages.
//   - `group_discover` lists a group the caller is not in, hides one nobody is
//     in (D16), matches the topic as well as the name, and caps its own limit.
//   - The organiser edits the group; the founder who handed it on does not.
//   - Running the file a second time changes nothing and raises nothing.

import { readFileSync } from "node:fs";
import { locateGroupFile, openGroupsDb } from "./lib/groups-db.mjs";

const { db, sources, mkUser, as, check, finish } = await openGroupsDb("group_type_and_trip");
console.log(
  `groups_hardening.sql loaded from: ${sources.groups_hardening}\n` +
    `group_roles.sql loaded from: ${sources.group_roles}\n` +
    `group_type_and_trip.sql loaded from: ${sources.group_type_and_trip}\n`,
);

/* ---- people and places --------------------------------------------------- */

const creator = await mkUser("creator@x.io", "Creator");
const alice = await mkUser("alice@x.io", "Alice");
const bob = await mkUser("bob@x.io", "Bob");
const carol = await mkUser("carol@x.io", "Carol");
const stranger = await mkUser("stranger@x.io", "Stranger");
const staff = await mkUser("staff@icefall.test", "Staff", { staff: true });

await db.query(
  `insert into public.destinations (id, name, kind, range, country, elevation_m) values
     ('test-peak', 'Test Peak', 'mountain', 'Test Range', 'Testland', 4000),
     ('other-peak', 'Other Peak', 'mountain', 'Test Range', 'Testland', 3000)
   on conflict (id) do nothing`,
);
// A trek states the point its altitude measures — 20260831170000 insists, and
// it is right to.
await db.query(
  `insert into public.destinations (id, name, kind, region, country, max_altitude_m, max_altitude_of) values
     ('test-trek', 'Test Trek', 'trek', 'alps', 'Testland', 2500, 'Test Col')
   on conflict (id) do nothing`,
);

/** Insert a group as somebody, for real, and hand back the row or the error. */
const makeGroup = (by, columns, values) =>
  as(
    by,
    () =>
      db.query(
        `insert into public.groups (${columns.join(", ")}) values (${values
          .map((_, i) => `$${i + 1}`)
          .join(", ")}) returning id, kind, about, topic, official, destination_id`,
        values,
      ),
    { keep: true },
  );

const join = (who, group) =>
  as(
    who,
    () => db.query(`insert into public.group_members (group_id, profile_id) values ($1, $2)`, [group, who]),
    { keep: true },
  );

/* ========================================================================== */
/* 1. A group does not have to be about a mountain                            */
/* ========================================================================== */

{
  const old = await makeGroup(
    creator,
    ["destination_id", "name", "created_by", "visibility"],
    ["test-peak", "A client from before this file", creator, "public"],
  );
  check(
    "a client that knows nothing about `about` still creates its group, filed as a mountain",
    old.ok && old.value.rows[0].about === "mountain" && old.value.rows[0].kind === "team",
    old.ok ? JSON.stringify(old.value.rows[0]) : old.error,
  );
}

{
  const trek = await makeGroup(
    creator,
    ["destination_id", "name", "created_by", "visibility"],
    ["test-trek", "Walking the test trek", creator, "public"],
  );
  check(
    "a group may now be about a trek, and says so",
    trek.ok && trek.value.rows[0].about === "trek",
    trek.ok ? JSON.stringify(trek.value.rows[0]) : trek.error,
  );
}

{
  const none = await makeGroup(
    creator,
    ["name", "created_by", "visibility", "topic", "about", "kind"],
    ["Women who climb", creator, "public", "Women who climb", "identity", "community"],
  );
  check(
    "a group with no destination at all is allowed, and carries its own topic",
    none.ok &&
      none.value.rows[0].destination_id === null &&
      none.value.rows[0].about === "identity" &&
      none.value.rows[0].topic === "Women who climb",
    none.ok ? JSON.stringify(none.value.rows[0]) : none.error,
  );
}

{
  const peak = await makeGroup(
    creator,
    ["name", "created_by", "visibility", "topic", "about"],
    ["Pic Sans Nom", creator, "public", "Pic Sans Nom", "mountain"],
  );
  check(
    "a peak the catalogue has no record of moves up as a topic, not a refusal",
    peak.ok && peak.value.rows[0].destination_id === null && peak.value.rows[0].about === "mountain",
    peak.ok ? JSON.stringify(peak.value.rows[0]) : peak.error,
  );
}

{
  const lie = await makeGroup(
    creator,
    ["destination_id", "name", "created_by", "visibility", "about"],
    ["test-trek", "Calling a trek a mountain", creator, "public", "mountain"],
  );
  check(
    "a group cannot say it is about a mountain while pointing at a trek",
    !lie.ok && /cannot be about/.test(lie.error ?? ""),
    lie.ok ? "it was allowed" : lie.error,
  );
}

{
  const ghost = await makeGroup(
    creator,
    ["destination_id", "name", "created_by", "visibility"],
    ["no-such-place", "Filed against nothing", creator, "public"],
  );
  check(
    "a destination that is not in the catalogue is refused, by name",
    !ghost.ok && /no destination called/.test(ghost.error ?? ""),
    ghost.ok ? "it was allowed" : ghost.error,
  );
}

{
  const bad = await makeGroup(
    creator,
    ["name", "created_by", "visibility", "about"],
    ["Nonsense", creator, "public", "vibes"],
  );
  check("an unknown `about` is refused", !bad.ok, bad.ok ? "it was allowed" : bad.error);
}

/* ========================================================================== */
/* 2. What is a fact                                                          */
/* ========================================================================== */

/** Every check below hangs off this one group, so a failure here is said out
    loud rather than thrown as a missing property halfway down the file. */
const made = await makeGroup(
  creator,
  ["destination_id", "name", "created_by", "visibility", "capacity"],
  ["test-peak", "The team", creator, "public", 3],
);
check("an ordinary team with three places can be created at all", made.ok, made.ok ? "" : made.error);
if (!made.ok) finish();
const team = made.value.rows[0].id;

{
  const r = await as(creator, () =>
    db.query(`update public.groups set kind = 'community' where id = $1`, [team]),
  );
  check(
    "a team cannot become a community",
    !r.ok && /different things/.test(r.error ?? ""),
    r.ok ? "it was allowed" : r.error,
  );
}

{
  const r = await as(creator, () =>
    db.query(`update public.groups set official = true where id = $1`, [team]),
  );
  check(
    "a member cannot make their own group official",
    !r.ok && /only staff/.test(r.error ?? ""),
    r.ok ? "it was allowed" : r.error,
  );
}

{
  const r = await makeGroup(
    alice,
    ["destination_id", "name", "created_by", "visibility", "official"],
    ["other-peak", "Claiming to be ICEFALL", alice, "public", true],
  );
  check(
    "and cannot claim it on the way in either",
    !r.ok && /only staff/.test(r.error ?? ""),
    r.ok ? "it was allowed" : r.error,
  );
}

{
  const r = await as(
    staff,
    () => db.query(`update public.groups set official = true where id = $1`, [team]),
    { keep: true },
  );
  const after = await db.query(`select official from public.groups where id = $1`, [team]);
  check("staff can", r.ok && after.rows[0].official === true, r.ok ? "" : r.error);
}

{
  const second = await makeGroup(
    alice,
    ["destination_id", "name", "created_by", "visibility"],
    ["test-peak", "A second official", alice, "public"],
  );
  const r = await as(staff, () =>
    db.query(`update public.groups set official = true where id = $1`, [second.value.rows[0].id]),
  );
  check(
    "one official group per destination, and the second is refused",
    !r.ok && /groups_one_official_per_destination|unique/i.test(r.error ?? ""),
    r.ok ? "it was allowed" : r.error,
  );
  await db.query(`delete from public.groups where id = $1`, [second.value.rows[0].id]);
}

{
  const r = await as(
    staff,
    () => db.query(`update public.groups set official = false where id = $1`, [team]),
    { keep: true },
  );
  check("staff can take the mark off again", r.ok, r.ok ? "" : r.error);
}

{
  const r = await as(creator, () =>
    db.query(`update public.groups set destination_id = 'other-peak' where id = $1`, [team]),
  );
  check(
    "the subject does not move",
    !r.ok && /about its subject/.test(r.error ?? ""),
    r.ok ? "it was allowed" : r.error,
  );
}

{
  const topicOnly = (await makeGroup(
    creator,
    ["name", "created_by", "visibility", "topic", "about"],
    ["Chamonix locals", creator, "public", "Chamonix locals", "region"],
  )).value.rows[0].id;
  const r = await as(creator, () =>
    db.query(`update public.groups set destination_id = 'test-peak' where id = $1`, [topicOnly]),
  );
  check(
    "and a group with no destination cannot be given one later either",
    !r.ok && /about its subject/.test(r.error ?? ""),
    r.ok ? "it was allowed" : r.error,
  );
  const rename = await as(
    creator,
    () => db.query(`update public.groups set topic = 'Chamonix climbers' where id = $1`, [topicOnly]),
    { keep: true },
  );
  check("the topic itself can still be corrected", rename.ok, rename.ok ? "" : rename.error);
}

{
  const r = await as(creator, () =>
    db.query(`update public.groups set origin_ref = 'expedition-1' where id = $1`, [team]),
  );
  check(
    "origin_ref is where a group came from, not a field",
    !r.ok && /origin is a fact/.test(r.error ?? ""),
    r.ok ? "it was allowed" : r.error,
  );
}

/* ---- the checks on the columns themselves -------------------------------- */

for (const [name, sql, params] of [
  ["a group cannot end before it starts", `update public.groups set intended_on = '2026-07-10', ends_on = '2026-07-01' where id = $1`, [team]],
  ["capacity has a floor of two", `update public.groups set capacity = 1 where id = $1`, [team]],
  ["and a ceiling of fifty", `update public.groups set capacity = 51 where id = $1`, [team]],
  ["an unknown experience word is refused", `update public.groups set experience = 'grizzled' where id = $1`, [team]],
  ["an unknown language is refused", `update public.groups set language = 'elvish' where id = $1`, [team]],
  ["a topic over 80 characters is refused", `update public.groups set topic = repeat('x', 81) where id = $1`, [team]],
  ["a description over 1000 characters is refused", `update public.groups set description = repeat('x', 1001) where id = $1`, [team]],
]) {
  const r = await as(creator, () => db.query(sql, params));
  check(name, !r.ok, r.ok ? "it was allowed" : "");
}

{
  const r = await as(
    creator,
    () =>
      db.query(
        `update public.groups set intended_on = '2026-07-01', ends_on = '2026-07-10',
                experience = 'intermediate', language = 'fr', route_label = 'Normal route',
                description = 'Six days, two rope teams.' where id = $1`,
        [team],
      ),
    { keep: true },
  );
  check("the trip itself is editable", r.ok, r.ok ? "" : r.error);
}

/* ========================================================================== */
/* 3. The organiser edits the group                                           */
/* ========================================================================== */

await join(alice, team);

{
  const r = await as(alice, () => db.query(`update public.groups set name = 'Alice was here' where id = $1`, [team]));
  check("an ordinary member cannot edit the group", !r.ok || r.value.rowCount === 0, "it changed the row");
}

{
  const handed = await as(
    creator,
    () => db.query(`select public.group_transfer_organiser($1, $2)`, [team, alice]),
    { keep: true },
  );
  const byAlice = await as(
    alice,
    () => db.query(`update public.groups set name = 'The team, renamed' where id = $1`, [team]),
    { keep: true },
  );
  const byCreator = await as(creator, () =>
    db.query(`update public.groups set name = 'Back again' where id = $1`, [team]),
  );
  const row = await db.query(`select name from public.groups where id = $1`, [team]);
  check(
    "the organiser it was handed to edits it, and the founder who handed it on does not",
    handed.ok && byAlice.ok && row.rows[0].name === "The team, renamed" && (!byCreator.ok || byCreator.value.rowCount === 0),
    `handed=${handed.ok} alice=${byAlice.ok} name=${row.rows[0].name}`,
  );
  await as(alice, () => db.query(`select public.group_transfer_organiser($1, $2)`, [team, creator]), { keep: true });
}

/* ========================================================================== */
/* 4. Capacity                                                                */
/* ========================================================================== */

{
  // The team holds the creator and Alice, and has three places.
  const third = await join(bob, team);
  const fourth = await join(carol, team);
  const count = await db.query(`select count(*)::int as n from public.group_members where group_id = $1`, [team]);
  check(
    "the last place is taken, and the next person is refused rather than seated",
    third.ok && !fourth.ok && /group_full/.test(fourth.error ?? "") && count.rows[0].n === 3,
    `third=${third.ok} fourth=${fourth.ok} error=${fourth.error} members=${count.rows[0].n}`,
  );
}

{
  const src = await db.query(
    `select pg_get_functiondef('public.group_members_capacity()'::regprocedure) as def`,
  );
  const def = src.rows[0].def.toLowerCase();
  check(
    "it takes the group's row lock BEFORE it counts, so two joins at once cannot both fit",
    def.indexOf("for update") > 0 && def.indexOf("for update") < def.indexOf("count(*)"),
    "the count comes first, or there is no lock",
  );
  check(
    "and it counts as the database rather than as the person joining",
    /security definer/.test(def),
    "an invoker count would see none of a group it is not in yet",
  );
}

{
  const open = (await makeGroup(
    creator,
    ["destination_id", "name", "created_by", "visibility"],
    ["other-peak", "No limit set", creator, "public"],
  )).value.rows[0].id;
  const joined = await join(bob, open);
  check("a group with no capacity set has no limit", joined.ok, joined.ok ? "" : joined.error);
}

/* ========================================================================== */
/* 5. Moving a group up from a phone                                          */
/* ========================================================================== */

{
  const first = await as(
    bob,
    () =>
      db.query(
        `select public.group_import_device($1, $2, $3, null, null, $4, $5, $6, $7, $8, $9) as id`,
        ["expedition-1726000000000", "Bob's phone group", "test-peak", "private", "2027-05-01", "2027-05-20", 4, "advanced", "Written on the phone."],
      ),
    { keep: true },
  );
  const again = await as(
    bob,
    () =>
      db.query(`select public.group_import_device($1, $2, $3) as id`, [
        "expedition-1726000000000",
        "Bob's phone group",
        "test-peak",
      ]),
    { keep: true },
  );
  const rows = await db.query(`select * from public.groups where origin_ref = 'expedition-1726000000000'`);
  check(
    "moving the same phone group twice returns the same group, not a second one",
    first.ok && again.ok && first.value.rows[0].id === again.value.rows[0].id && rows.rowCount === 1,
    first.ok && again.ok ? `${first.value.rows[0].id} vs ${again.value.rows[0].id}, ${rows.rowCount} rows` : first.error ?? again.error,
  );
  const g = rows.rows[0];
  check(
    "the fields it takes are the ones the plan lists, and it is a team",
    g.name === "Bob's phone group" &&
      g.visibility === "private" &&
      g.kind === "team" &&
      g.about === "mountain" &&
      g.capacity === 4 &&
      g.experience === "advanced" &&
      g.ends_on !== null,
    JSON.stringify(g),
  );
  const members = await db.query(`select count(*)::int as n from public.group_members where group_id = $1`, [g.id]);
  check("and it takes nobody with it — the mover is its only member", members.rows[0].n === 1, `${members.rows[0].n}`);
}

{
  /*
   * PGlite has ONE connection, so the two taps above cannot really collide. The
   * index is what makes them safe when they do — checked as the plan checks the
   * capacity lock, by reading what was actually created rather than by trusting
   * that a second call happened to return the same row.
   */
  const idx = await db.query(
    `select indexdef from pg_indexes where schemaname = 'public' and indexname = 'groups_origin_ref_once'`,
  );
  const def = (idx.rows[0]?.indexdef ?? "").toLowerCase();
  check(
    "and two taps at once cannot make two groups: the pair is unique in the schema",
    /unique/.test(def) && /created_by/.test(def) && /origin_ref/.test(def) && /where/.test(def),
    def || "there is no such index",
  );
}

{
  const noPeak = await as(
    bob,
    () =>
      db.query(`select public.group_import_device($1, $2, null, $3, $4) as id`, [
        "expedition-1726000000001",
        "Pic Sans Nom, June",
        "Pic Sans Nom",
        "mountain",
      ]),
    { keep: true },
  );
  const row = await db.query(`select destination_id, topic, about from public.groups where origin_ref = 'expedition-1726000000001'`);
  check(
    "a phone group whose peak ICEFALL has no record of still moves, with the peak as its topic",
    noPeak.ok && row.rows[0].destination_id === null && row.rows[0].topic === "Pic Sans Nom",
    noPeak.ok ? JSON.stringify(row.rows[0]) : noPeak.error,
  );
}

{
  const mine = await as(alice, () =>
    db.query(`select public.group_import_device($1, $2, $3) as id`, [
      "expedition-1726000000000",
      "Alice's own phone group",
      "test-peak",
    ]),
  );
  check(
    "the same phone id under another account is that account's own group",
    mine.ok,
    mine.ok ? "" : mine.error,
  );
}

{
  const signedOut = await db
    .query(`select public.group_import_device('x', 'y', 'test-peak')`)
    .then(() => null)
    .catch((e) => e.message.split("\n")[0]);
  check(
    "signed out, nothing moves",
    signedOut !== null && /sign in/.test(signedOut),
    signedOut ?? "it was allowed",
  );
}

/* ========================================================================== */
/* 6. Discover                                                                */
/* ========================================================================== */

{
  const seen = await as(stranger, () =>
    db.query(`select id, name, member_count, joined_by_me from public.group_discover()`),
  );
  const names = seen.ok ? seen.value.rows.map((r) => r.name) : [];
  check(
    "a stranger sees groups they are not in, with the true size of each",
    seen.ok && names.includes("The team, renamed") && seen.value.rows.every((r) => r.member_count > 0 && r.joined_by_me === false),
    seen.ok ? names.join(" | ") : seen.error,
  );
}

{
  const empty = (await makeGroup(
    creator,
    ["destination_id", "name", "created_by", "visibility"],
    ["other-peak", "Everybody left", creator, "public"],
  )).value.rows[0].id;
  await db.query(`delete from public.group_members where group_id = $1`, [empty]);
  const seen = await as(stranger, () => db.query(`select name from public.group_discover()`));
  const still = await db.query(`select count(*)::int as n from public.groups where id = $1`, [empty]);
  check(
    "a group nobody is in is not listed, and is not deleted either (D16)",
    seen.ok && !seen.value.rows.some((r) => r.name === "Everybody left") && still.rows[0].n === 1,
    seen.ok ? seen.value.rows.map((r) => r.name).join(" | ") : seen.error,
  );
}

{
  const byTopic = await as(stranger, () =>
    db.query(`select name from public.group_discover($1)`, ["chamonix"]),
  );
  const byPeak = await as(stranger, () =>
    db.query(`select name from public.group_discover($1)`, ["Test Peak"]),
  );
  check(
    "the search matches a group's own topic as well as its name and its mountain",
    byTopic.ok &&
      byTopic.value.rows.some((r) => r.name === "Chamonix locals") &&
      byPeak.ok &&
      byPeak.value.rows.length > 0,
    byTopic.ok && byPeak.ok ? `${byTopic.value.rows.length} / ${byPeak.value.rows.length}` : byTopic.error ?? byPeak.error,
  );
}

{
  const communities = await as(stranger, () =>
    db.query(`select name, kind from public.group_discover(null, 'community')`),
  );
  const identities = await as(stranger, () =>
    db.query(`select name, about from public.group_discover(null, null, 'identity')`),
  );
  check(
    "the chips filter by kind and by subject",
    communities.ok &&
      communities.value.rows.every((r) => r.kind === "community") &&
      identities.ok &&
      identities.value.rows.every((r) => r.about === "identity"),
    communities.ok && identities.ok
      ? `${communities.value.rows.length} communities, ${identities.value.rows.length} identities`
      : communities.error ?? identities.error,
  );
}

{
  const capped = await as(stranger, () =>
    db.query(`select count(*)::int as n from public.group_discover(null, null, null, null, null, null, null, null, 9999)`),
  );
  check(
    "a client cannot ask Discover for the whole table",
    capped.ok && capped.value.rows[0].n <= 50,
    capped.ok ? `${capped.value.rows[0].n}` : capped.error,
  );
}

{
  const invoker = await db.query(
    `select prosecdef from pg_proc where oid = 'public.group_discover(text, text, text, date, date, text, text, text, int, timestamptz)'::regprocedure`,
  );
  check(
    "Discover runs as the caller, so it can never show more than the policy would",
    invoker.rows[0].prosecdef === false,
    "it is SECURITY DEFINER",
  );
}

/* ========================================================================== */
/* 7. The file is safe to run twice                                           */
/* ========================================================================== */

{
  const before = await db.query(`select count(*)::int as n, count(about)::int as a from public.groups`);
  const found = locateGroupFile("group_type_and_trip");
  let raised = null;
  try {
    await db.exec(readFileSync(found.path, "utf8"));
  } catch (e) {
    raised = e.message.split("\n")[0];
  }
  const after = await db.query(`select count(*)::int as n, count(about)::int as a from public.groups`);
  check(
    "running it again raises nothing and changes nothing",
    raised === null && before.rows[0].n === after.rows[0].n && after.rows[0].a === after.rows[0].n,
    raised ?? `${JSON.stringify(before.rows[0])} -> ${JSON.stringify(after.rows[0])}`,
  );
}

/* ---- and the earlier files' rules are still standing (R9) ---------------- */

{
  const policies = await db.query(
    `select polname, pg_get_expr(polqual, polrelid) as using_expr
       from pg_policy where polrelid = 'public.groups'::regclass`,
  );
  const update = policies.rows.find((p) => p.polname === "groups_update");
  const del = policies.rows.find((p) => p.polname === "groups_delete");
  check(
    "groups_update asks the organiser, and groups_delete still asks the creator",
    /is_group_organiser/.test(update?.using_expr ?? "") && /created_by/.test(del?.using_expr ?? ""),
    `${update?.using_expr} | ${del?.using_expr}`,
  );
}

finish();
