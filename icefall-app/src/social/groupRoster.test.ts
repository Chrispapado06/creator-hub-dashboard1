/**
 * `npm run test:groups-roster-client`.
 *
 * Structure plan slice S4 and risk R11: the CLIENT has to follow the organiser
 * role, and it has to keep working on a server that has not got it yet.
 *
 * WHY THIS FILE EXISTS. Three claims `groupSpace.ts` now makes are claims a
 * typecheck cannot see:
 *
 *   1. THAT THE ANSWER COMES FROM THE ROLE WHERE THERE IS ONE, AND FROM
 *      `created_by` WHERE THERE IS NOT. Those two disagree the moment a group
 *      is handed on — the person who started it is an ordinary member and
 *      somebody else answers the requests — and getting it the wrong way round
 *      shows one person a control that cannot work and hides it from the person
 *      it belongs to.
 *   2. THAT THE READER'S OWN ROW DECIDES. `group_members_select` always shows a
 *      person their own row, and it is the only row that carries their role.
 *   3. THAT "NOBODY RUNS THIS GROUP" IS KNOWN RATHER THAN ASSUMED. A field that
 *      did not arrive must not become a refusal to take somebody's ask.
 *
 * It follows the suites beside it: a plain TypeScript program with a small
 * harness, inside `src/` so `npm run typecheck` checks it against the same
 * types the app uses. There is no network and no Supabase client — every row
 * below is one this file wrote.
 *
 * WHAT IS NOT PROVEN HERE: that a real server answers 42703 for the missing
 * column (`tests/groups-roles.test.mjs` runs the migration itself), and that
 * the screens draw these answers (checked by hand on 5210 in S4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  GROUP_COLUMNS,
  GROUP_COLUMNS_WITH_TRIP,
  MEMBER_COLUMNS,
  MEMBER_COLUMNS_WITH_ROLE,
  groupFromRow,
  nobodyRunsGroup,
  rosterFromRows,
  type GroupSpace,
} from "@/social/groupSpace";

let passed = 0;
const failures: string[] = [];
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}`);
    console.log(`    ${err instanceof Error ? err.message : String(err)}`);
  }
};

const readSrc = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const ME = "uid-me";
const THEM = "uid-them";
const THIRD = "uid-third";

/** One row as PostgREST hands it back, with the embed resolved. */
const row = (profileId: string, role?: string, extra: Record<string, unknown> = {}) => ({
  profile_id: profileId,
  joined_at: "2026-09-01T08:00:00.000Z",
  role,
  profiles: {
    id: profileId,
    display_name: `Name ${profileId}`,
    username: `user_${profileId}`,
    avatar_url: null,
    location_label: "Chamonix, France",
  },
  ...extra,
});

console.log("\nGroups roster — the client follows the organiser role\n");

/* -------------------------------------------------------------------------- */
/* 1. The two selects                                                          */
/* -------------------------------------------------------------------------- */

test("the role select is the base select plus exactly one column", () => {
  assert.equal(MEMBER_COLUMNS_WITH_ROLE, `${MEMBER_COLUMNS}, role`);
  assert.equal(MEMBER_COLUMNS.includes("role"), false);
});

test("the roster asks for the role first and retries without it only for an absent column", () => {
  const src = readSrc("src/social/groupSpace.ts");
  const fn = src.slice(src.indexOf("async function readRoster"), src.indexOf("async function readMessages"));
  const first = fn.indexOf("ask(MEMBER_COLUMNS_WITH_ROLE)");
  const retry = fn.indexOf("ask(MEMBER_COLUMNS)");
  assert.ok(first > 0, "readRoster does not ask for the role at all");
  assert.ok(retry > first, "readRoster does not retry with the base columns after it");
  const between = fn.slice(first, retry);
  assert.match(between, /classify\(roster\.error\) === "not-provisioned"/);
  assert.match(between, /roleRead = false/);
});

/* -------------------------------------------------------------------------- */
/* 2. A server that has the column                                             */
/* -------------------------------------------------------------------------- */

test("the role marks the organiser, and nobody else", () => {
  const { members } = rosterFromRows([row(ME, "member"), row(THEM, "organiser")], {
    createdBy: ME,
    uid: ME,
    roleRead: true,
  });
  assert.deepEqual(
    members.map((m) => [m.profileId, m.isOrganiser]),
    [
      [ME, false],
      [THEM, true],
    ],
  );
});

test("the reader who holds the role is the organiser, even though somebody else started it", () => {
  const { isOrganiser } = rosterFromRows([row(THEM, "member"), row(ME, "organiser")], {
    createdBy: THEM,
    uid: ME,
    roleRead: true,
  });
  assert.equal(isOrganiser, true);
});

test("and the person who started it is NOT, once the group has been handed on", () => {
  const { isOrganiser, members } = rosterFromRows([row(ME, "member"), row(THEM, "organiser")], {
    createdBy: ME,
    uid: ME,
    roleRead: true,
  });
  assert.equal(isOrganiser, false);
  assert.equal(members.find((m) => m.profileId === ME)?.isOrganiser, false);
});

test("a row whose role is missing or unknown is a member, never an organiser", () => {
  const { members } = rosterFromRows([row(ME), row(THEM, "ORGANISER"), row(THIRD, "")], {
    createdBy: ME,
    uid: ME,
    roleRead: true,
  });
  assert.deepEqual(members.map((m) => m.isOrganiser), [false, false, false]);
});

test("a reader whose own row did not come back falls back to created_by", () => {
  // Over the 500 limit, or hidden by a block: `members` is missing the reader.
  const held = rosterFromRows([row(THEM, "member"), row(THIRD, "member")], {
    createdBy: ME,
    uid: ME,
    roleRead: true,
  });
  assert.equal(held.isOrganiser, true);
  const not = rosterFromRows([row(THEM, "organiser")], { createdBy: THIRD, uid: ME, roleRead: true });
  assert.equal(not.isOrganiser, false);
});

/* -------------------------------------------------------------------------- */
/* 3. A server that has not                                                    */
/* -------------------------------------------------------------------------- */

test("without the column the person who started it is the organiser", () => {
  const { members, isOrganiser } = rosterFromRows([row(ME), row(THEM)], {
    createdBy: ME,
    uid: ME,
    roleRead: false,
  });
  assert.equal(isOrganiser, true);
  assert.deepEqual(
    members.map((m) => [m.profileId, m.isOrganiser]),
    [
      [ME, true],
      [THEM, false],
    ],
  );
});

test("and a role that somehow arrived anyway is ignored", () => {
  // The retry dropped the column, so anything under that key is not an answer
  // this read asked for and must not be treated as one.
  const { members, isOrganiser } = rosterFromRows([row(ME, "member"), row(THEM, "organiser")], {
    createdBy: ME,
    uid: ME,
    roleRead: false,
  });
  assert.equal(isOrganiser, true);
  assert.deepEqual(members.map((m) => m.isOrganiser), [true, false]);
});

test("a group whose founder deleted their account marks nobody", () => {
  const { members, isOrganiser } = rosterFromRows([row(ME), row(THEM)], {
    createdBy: null,
    uid: ME,
    roleRead: false,
  });
  assert.equal(isOrganiser, false);
  assert.deepEqual(members.map((m) => m.isOrganiser), [false, false]);
});

/* -------------------------------------------------------------------------- */
/* 4. The people themselves are unchanged                                      */
/* -------------------------------------------------------------------------- */

test("a row with no profile_id is dropped rather than drawn as a nameless person", () => {
  const { members } = rosterFromRows(
    [{ profile_id: null, joined_at: "x", profiles: null }, row(ME, "organiser")],
    { createdBy: ME, uid: ME, roleRead: true },
  );
  assert.equal(members.length, 1);
  assert.equal(members[0].profileId, ME);
});

test("the profile embed resolves, and an absent one writes no name in", () => {
  const { members } = rosterFromRows(
    [row(ME, "organiser"), { profile_id: THEM, joined_at: "2026-09-02T00:00:00.000Z", role: "member", profiles: null }],
    { createdBy: ME, uid: ME, roleRead: true },
  );
  assert.equal(members[0].name, `Name ${ME}`);
  assert.equal(members[0].username, `user_${ME}`);
  assert.equal(members[0].location, "Chamonix, France");
  assert.equal(members[1].name, null);
  assert.equal(members[1].username, null);
  assert.equal(members[1].location, null);
  assert.equal(members[1].joinedAt, "2026-09-02T00:00:00.000Z");
});

/* -------------------------------------------------------------------------- */
/* 5. Whether anybody runs the group                                           */
/* -------------------------------------------------------------------------- */

const group = (over: Partial<GroupSpace>): GroupSpace => ({
  id: "g-1",
  name: "A group",
  destinationId: "mont-blanc",
  destination: null,
  mountain: null,
  visibility: "private",
  intendedOn: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  createdBy: ME,
  memberCount: 3,
  joinedByMe: false,
  foundedByMe: true,
  hasOrganiser: null,
  kind: null,
  about: null,
  topic: null,
  official: null,
  endsOn: null,
  capacity: null,
  experience: null,
  routeLabel: null,
  language: null,
  description: null,
  coverPath: null,
  coverCredit: null,
  ...over,
});

test("the server's answer decides where it came back", () => {
  assert.equal(nobodyRunsGroup(group({ hasOrganiser: true, createdBy: null })), false);
  assert.equal(nobodyRunsGroup(group({ hasOrganiser: false, createdBy: ME })), true);
});

test("and where it did not, created_by answers the same question", () => {
  assert.equal(nobodyRunsGroup(group({ hasOrganiser: null, createdBy: ME })), false);
  assert.equal(nobodyRunsGroup(group({ hasOrganiser: null, createdBy: null })), true);
});

test("the group read asks for has_organiser separately, never on the main select", () => {
  const src = readSrc("src/social/groupSpace.ts");
  assert.equal(/const GROUP_COLUMNS[\s\S]*?;/.exec(src)?.[0].includes("has_organiser"), false);
  assert.match(src, /async function readHasOrganiser/);
  const read = src.slice(src.indexOf("async function readGroup"), src.indexOf("export function useGroup"));
  // Only for a private group the reader is not in: the public early return is
  // above the call, and a member never reaches it.
  assert.ok(
    read.indexOf('group.visibility === "public"') < read.indexOf("readHasOrganiser(session.client"),
    "has_organiser is asked for on a public group too",
  );
  assert.ok(
    read.indexOf("group.joinedByMe") < read.indexOf("readHasOrganiser(session.client"),
    "has_organiser is asked for by a member too",
  );
});

test("the organised-groups count asks for the role and falls back to created_by", () => {
  const src = readSrc("src/social/groupSpace.ts");
  const fn = src.slice(src.indexOf("export async function countOrganisedGroups"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  const role = body.indexOf('.eq("role", "organiser")');
  const created = body.indexOf('.eq("created_by", session.uid)');
  assert.ok(role > 0, "the count never asks for the organiser role");
  assert.ok(created > role, "the count does not fall back to created_by after it");
  assert.match(body.slice(role, created), /classify\(byRole\.error\) !== "not-provisioned"/);
});

/* -------------------------------------------------------------------------- */
/* 6. The screens say "Organiser"                                              */
/* -------------------------------------------------------------------------- */

test("the roster badge reads Organiser, and `Started it` is gone", () => {
  const workspace = readSrc("src/screens/explore/GroupWorkspace.tsx");
  assert.match(workspace, /member\.isOrganiser && <Badge tone="neutral">Organiser<\/Badge>/);
  assert.equal(/Started it/.test(workspace), false);
});

test("the avatar crown is the organiser, not whoever started the group", () => {
  const chrome = readSrc("src/screens/explore/groupChrome.tsx");
  assert.match(chrome, /organiser: boolean;/);
  assert.match(chrome, /title="Organiser"/);
  assert.equal(/Started this group/.test(chrome), false);
});

test("no group screen still reads `isFounder` or `foundedByMe` to decide a power", () => {
  for (const p of [
    "src/screens/explore/GroupWorkspace.tsx",
    "src/screens/explore/groupChrome.tsx",
    "src/screens/explore/Groups.tsx",
  ]) {
    assert.equal(/\.isFounder\b/.test(readSrc(p)), false, `${p} still reads isFounder`);
  }
  const workspace = readSrc("src/screens/explore/GroupWorkspace.tsx");
  // `foundedByMe` survives in ONE place, and it is the one place it is true:
  // the leave panel, which says "even though you started it".
  assert.equal((workspace.match(/foundedByMe/g) ?? []).length, 2);
  assert.match(workspace, /canModerate=\{roster\.isOrganiser\}/);
});

/* -------------------------------------------------------------------------- */
/* 7. The trip, on a server that has it and a server that has not (S5, D13)     */
/* -------------------------------------------------------------------------- */

/*
 * `group_type_and_trip.sql` is written and NOT APPLIED, and the app ships
 * before the owner applies it. So every field it adds has to arrive through a
 * select that a server without those columns can refuse WITHOUT taking the
 * group page down with it — which is the whole of D13, and the thing a
 * typecheck cannot see.
 */

/** A row as today's server answers: the base columns and nothing else. */
const baseRow = (over: Record<string, unknown> = {}) => ({
  id: "g-1",
  name: "June push",
  destination_id: "mont-blanc",
  visibility: "public",
  intended_on: "2027-06-02",
  created_at: "2026-09-01T00:00:00.000Z",
  created_by: ME,
  member_count: 4,
  joined_by_me: true,
  destinations: {
    id: "mont-blanc",
    name: "Mont Blanc",
    kind: "mountain",
    range: "Graian Alps",
    country: "France / Italy",
    elevation_m: 4806,
  },
  ...over,
});

/** The same row from a server with file 3 applied. */
const tripRow = (over: Record<string, unknown> = {}) =>
  baseRow({
    kind: "team",
    about: "mountain",
    topic: null,
    official: false,
    ends_on: "2027-06-09",
    capacity: 6,
    experience: "intermediate",
    route_label: "Goûter",
    language: "fr",
    description: "Two rope teams.",
    cover_path: "g-1/cover.jpg",
    cover_credit: "A photographer",
    ...over,
  });

test("the trip select is the base select plus exactly the columns file 3 adds", () => {
  assert.equal(
    GROUP_COLUMNS_WITH_TRIP,
    `${GROUP_COLUMNS}, kind, about, topic, official, ends_on, capacity, experience, ` +
      "route_label, language, description, cover_path, cover_credit",
  );
  // The group's OWN columns, which is everything before the destinations
  // embed — the embed asks for that table's `kind`, which is a different
  // column on a different table and has always been there.
  const own = GROUP_COLUMNS.slice(0, GROUP_COLUMNS.indexOf("destinations("));
  for (const column of ["kind", "about", "topic", "official", "capacity", "ends_on"]) {
    assert.equal(own.includes(column), false, `${column} is in the base select`);
  }
});

test("the group read asks for the trip first and retries without it only for an absent column", () => {
  const src = readSrc("src/social/groupSpace.ts");
  const fn = src.slice(src.indexOf("async function readGroup"), src.indexOf("export function useGroup"));
  const first = fn.indexOf("askGroup(GROUP_COLUMNS_WITH_TRIP)");
  const retry = fn.indexOf("askGroup(GROUP_COLUMNS)");
  assert.ok(first > 0, "readGroup never asks for the trip columns");
  assert.ok(retry > first, "readGroup does not retry with the base columns after it");
  const between = fn.slice(first, retry);
  assert.match(between, /classify\(error\) === "not-provisioned"/);
  assert.match(between, /tripRead = false/);
});

test("a server that has the columns reads every one of them", () => {
  const group = groupFromRow(tripRow(), ME, true);
  assert.ok(group);
  assert.equal(group.kind, "team");
  assert.equal(group.about, "mountain");
  assert.equal(group.official, false);
  assert.equal(group.endsOn, "2027-06-09");
  assert.equal(group.capacity, 6);
  assert.equal(group.experience, "intermediate");
  assert.equal(group.routeLabel, "Goûter");
  assert.equal(group.language, "fr");
  assert.equal(group.description, "Two rope teams.");
  assert.equal(group.coverPath, "g-1/cover.jpg");
  assert.equal(group.coverCredit, "A photographer");
});

test("a server without them still renders the group, with every trip field null", () => {
  const group = groupFromRow(baseRow(), ME, false);
  assert.ok(group, "the group was dropped rather than drawn");
  // Everything the page drew before is still there.
  assert.equal(group.name, "June push");
  assert.equal(group.destinationId, "mont-blanc");
  assert.equal(group.mountain?.name, "Mont Blanc");
  assert.equal(group.memberCount, 4);
  assert.equal(group.intendedOn, "2027-06-02");
  // And nothing from file 3 is claimed.
  assert.deepEqual(
    [
      group.kind,
      group.about,
      group.topic,
      group.official,
      group.endsOn,
      group.capacity,
      group.experience,
      group.routeLabel,
      group.language,
      group.description,
      group.coverPath,
      group.coverCredit,
    ],
    new Array(12).fill(null),
  );
});

test("and a trip that somehow arrived anyway is ignored", () => {
  // The retry dropped those columns, so anything under those keys is not an
  // answer this read asked for — the same rule as the roster's role.
  const group = groupFromRow(tripRow(), ME, false);
  assert.equal(group?.kind, null);
  assert.equal(group?.capacity, null);
  assert.equal(group?.language, null);
});

test("a word outside the server's own check constraint is not an answer", () => {
  const group = groupFromRow(
    tripRow({ kind: "clan", about: "vibes", experience: "grizzled", language: "elvish" }),
    ME,
    true,
  );
  assert.equal(group?.kind, null);
  assert.equal(group?.about, null);
  assert.equal(group?.experience, null);
  assert.equal(group?.language, null);
});

test("a group about something that is not a place is read, not dropped", () => {
  const group = groupFromRow(
    tripRow({
      destination_id: null,
      destinations: null,
      about: "identity",
      topic: "Women who climb",
    }),
    ME,
    true,
  );
  assert.ok(group, "a group with no destination was dropped");
  assert.equal(group.destinationId, null);
  assert.equal(group.destination, null);
  assert.equal(group.mountain, null);
  assert.equal(group.topic, "Women who climb");
  assert.equal(group.about, "identity");
});

test("a trek is a destination but never a mountain", () => {
  const group = groupFromRow(
    tripRow({
      destination_id: "tour-du-mont-blanc",
      about: "trek",
      destinations: {
        id: "tour-du-mont-blanc",
        name: "Tour du Mont Blanc",
        kind: "trek",
        range: null,
        country: "France / Italy / Switzerland",
        elevation_m: null,
      },
    }),
    ME,
    true,
  );
  assert.equal(group?.destination?.name, "Tour du Mont Blanc");
  assert.equal(group?.destination?.kind, "trek");
  assert.equal(group?.mountain, null, "a trek was drawn as a mountain");
});

test("a group with no name is still dropped — that one is a broken row", () => {
  assert.equal(groupFromRow(baseRow({ name: null }), ME, true), null);
  assert.equal(groupFromRow(baseRow({ id: "  " }), ME, true), null);
  assert.equal(groupFromRow(baseRow({ visibility: "unlisted" }), ME, true), null);
});

test("create sends the new columns only when the group needs them", () => {
  const src = readSrc("src/social/groupSpace.ts");
  const fn = src.slice(src.indexOf("const create = useCallback"), src.indexOf("const join = useCallback"));
  assert.match(fn, /const needsFileThree = slug === null \|\| topic\.length > 0;/);
  // The ordinary group on a mountain is written exactly as it was before file
  // 3, so it keeps working on today's server.
  const guarded = fn.slice(fn.indexOf("if (needsFileThree)"));
  assert.match(guarded.slice(0, guarded.indexOf("\n      }")), /row\.topic/);
  assert.match(fn, /SUBJECT_NOT_LIVE/);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
