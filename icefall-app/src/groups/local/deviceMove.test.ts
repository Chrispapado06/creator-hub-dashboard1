/**
 * `npm run test:groups-device-move`.
 *
 * Structure plan §2 and slice S6: the one tap that moves a group saved on this
 * phone up to an ICEFALL account.
 *
 * WHAT IS PROVEN HERE
 *   1. The mapping, field by field, including the two the owner's ruling of
 *      16 Sep 2026 changed: a peak ICEFALL has no record of MOVES, carrying its
 *      own name as the group's subject, and a catalogue that could not be read
 *      stops the move with its own sentence rather than filing the group
 *      against nothing irreversibly.
 *   2. The payload is the whole payload: no members, no notes, no sessions, no
 *      messages and no checklist ever reach it. This is D5 as a test.
 *   3. Nothing is recorded as moved until the group has been read back.
 *   4. Demo groups and groups already moved are never offered.
 *   5. The screens are wired the way the plan says: the old `expedition-…` link
 *      redirects once `movedTo` is set, an unmoved one opens the read-only
 *      summary, and `AppState` still holds no server call.
 *
 * WHAT IS NOT PROVEN: that a real move lands on the real database. That needs
 * `group_type_and_trip.sql` applied and a signed-in account (open question
 * Q15); until then the server half is driven through the injected seam, and
 * `tests/groups-type-trip.test.mjs` is what proves `group_import_device` itself.
 */
import assert from "node:assert/strict";
import type { PostgrestError } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  MAX_MOVED_DESCRIPTION,
  MAX_MOVED_NAME,
  MOVE_ACCOUNT_UNKNOWN,
  MOVE_DATES_OUT_OF_ORDER,
  MOVE_NAME_EMPTY,
  MOVE_NAME_TOO_LONG,
  MOVE_NO_SERVER,
  MOVE_READ_BACK_FAILED,
  MOVE_SIGN_IN,
  MOVE_WHAT_STAYS,
  capacityFor,
  matchPeak,
  moveCatalogueUnknown,
  moveDeviceGroup,
  moveNoRecordOfPeak,
  movePublishedUnder,
  performMove,
  planDeviceMove,
  visibilityFor,
  type MoveFields,
  type MoveSeam,
} from "@/groups/local/deviceMove";
import { hasMoved, isSeededDemoGroupId, phoneGroupsNotMoved } from "@/groups/local/phoneGroups";
import { SEEDED_DEMO_GROUP_IDS } from "@/groups/local/stateCleanup";
import { GROUP_SPACE_NO_BACKEND } from "@/social/groupSpace";
import type { DestinationsRead, GroupDestination } from "@/groups/mountains";
import type { Expedition } from "@/network/types";

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

const pending: (() => Promise<void>)[] = [];
const atest = (name: string, fn: () => Promise<void>) => {
  pending.push(async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failures.push(name);
      console.log(`  ✗ ${name}`);
      console.log(`    ${err instanceof Error ? err.message : String(err)}`);
    }
  });
};

const readFile = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const group = (patch: Partial<Expedition> = {}): Expedition => ({
  id: "expedition-1726000000000",
  peakName: "Mont Blanc",
  elevationM: 4806,
  window: { fromIso: "2027-07-01", toIso: "2027-07-08" },
  sizeMin: 2,
  sizeMax: 4,
  experience: "intermediate",
  lookingFor: ["expedition-partners"],
  description: "Two weeks of acclimatisation first.",
  privacy: "public",
  memberIds: ["local:you"],
  createdBy: "local:you",
  createdAt: "2026-09-01T00:00:00.000Z",
  ...patch,
});

const destination = (
  id: string,
  name: string,
  kind: GroupDestination["kind"] = "mountain",
): GroupDestination => ({
  id,
  name,
  kind,
  range: null,
  region: null,
  country: null,
  elevationM: null,
});

/** A catalogue with the two peaks that matter, and a trek with a peak's name. */
const CATALOGUE: GroupDestination[] = [
  destination("mont-blanc", "Mont Blanc"),
  destination("ama-dablam", "Ama Dablam"),
  destination("mont-blanc-du-tacul", "Mont Blanc du Tacul"),
  destination("matterhorn-trek", "Matterhorn", "trek"),
];

const ready: DestinationsRead = { status: "ready", destinations: CATALOGUE };

const absent = (status: "unreachable" | "refused" | "not-provisioned"): DestinationsRead => ({
  status,
  message: "the catalogue's own sentence",
});

function fieldsOf(plan: ReturnType<typeof planDeviceMove>): MoveFields {
  assert.equal(plan.status, "ready", plan.status === "blocked" ? plan.message : "");
  return (plan as { fields: MoveFields }).fields;
}

/* -------------------------------------------------------------------------- */
/* 1. The mapping                                                              */
/* -------------------------------------------------------------------------- */

test("every field maps, and the peak is filed against the catalogue row", () => {
  const fields = fieldsOf(planDeviceMove(group(), ready, "Mont Blanc"));
  assert.deepEqual(fields, {
    originRef: "expedition-1726000000000",
    name: "Mont Blanc",
    destinationId: "mont-blanc",
    topic: null,
    about: null,
    visibility: "public",
    intendedOn: "2027-07-01",
    endsOn: "2027-07-08",
    capacity: 4,
    experience: "intermediate",
    description: "Two weeks of acclimatisation first.",
  });
});

test("the payload has these eleven fields and no others", () => {
  const fields = fieldsOf(planDeviceMove(group(), ready, "Mont Blanc"));
  assert.deepEqual(Object.keys(fields).sort(), [
    "about",
    "capacity",
    "description",
    "destinationId",
    "endsOn",
    "experience",
    "intendedOn",
    "name",
    "originRef",
    "topic",
    "visibility",
  ]);
});

test("nobody and nothing private is carried across (D5)", () => {
  const fields = fieldsOf(
    planDeviceMove(
      group({
        memberIds: ["local:you", "local:someone-else"],
        lookingFor: ["expedition-partners", "training-partners"],
      }),
      ready,
      "Mont Blanc",
    ),
  );
  const written = JSON.stringify(fields);
  for (const forbidden of [
    "memberIds",
    "local:you",
    "local:someone-else",
    "lookingFor",
    "expedition-partners",
    "createdBy",
    "createdAt",
    "sizeMin",
    "elevationM",
    "groupNotes",
    "groupSessions",
    "groupMessages",
    "checklist",
  ]) {
    assert.equal(written.includes(forbidden), false, `payload mentions ${forbidden}`);
  }
});

test("the name starts as the peak's and is whatever the person typed", () => {
  const fields = fieldsOf(planDeviceMove(group(), ready, "  The Tacul four  "));
  assert.equal(fields.name, "The Tacul four");
});

test("an empty or over-long name stops the move, each with its own sentence", () => {
  const empty = planDeviceMove(group(), ready, "   ");
  assert.equal(empty.status === "blocked" && empty.reason, "name-empty");
  assert.equal(empty.status === "blocked" && empty.message, MOVE_NAME_EMPTY);

  const long = planDeviceMove(group(), ready, "x".repeat(MAX_MOVED_NAME + 1));
  assert.equal(long.status === "blocked" && long.reason, "name-too-long");
  assert.equal(long.status === "blocked" && long.message, MOVE_NAME_TOO_LONG);

  assert.equal(planDeviceMove(group(), ready, "x".repeat(MAX_MOVED_NAME)).status, "ready");
});

test("an end before the start stops the move", () => {
  const plan = planDeviceMove(
    group({ window: { fromIso: "2027-07-08", toIso: "2027-07-01" } }),
    ready,
    "Mont Blanc",
  );
  assert.equal(plan.status === "blocked" && plan.reason, "dates-out-of-order");
  assert.equal(plan.status === "blocked" && plan.message, MOVE_DATES_OUT_OF_ORDER);
});

test("the same day at both ends is a window, not an error", () => {
  const fields = fieldsOf(
    planDeviceMove(
      group({ window: { fromIso: "2027-07-01", toIso: "2027-07-01" } }),
      ready,
      "Mont Blanc",
    ),
  );
  assert.equal(fields.intendedOn, "2027-07-01");
  assert.equal(fields.endsOn, "2027-07-01");
});

test("a date that is not a calendar day is absent, never guessed", () => {
  const fields = fieldsOf(
    planDeviceMove(group({ window: { fromIso: "soon", toIso: "" } }), ready, "Mont Blanc"),
  );
  assert.equal(fields.intendedOn, null);
  assert.equal(fields.endsOn, null);
});

test("privacy maps to the door, and invite-only is the closed one", () => {
  assert.equal(visibilityFor("public"), "public");
  assert.equal(visibilityFor("invite-only"), "private");
  assert.equal(
    fieldsOf(planDeviceMove(group({ privacy: "invite-only" }), ready, "Mont Blanc")).visibility,
    "private",
  );
});

test("a party size outside the column's range moves as no size set", () => {
  assert.equal(capacityFor(4), 4);
  assert.equal(capacityFor(2), 2);
  assert.equal(capacityFor(50), 50);
  assert.equal(capacityFor(1), null);
  assert.equal(capacityFor(51), null);
  assert.equal(capacityFor(4.5), null);
  assert.equal(capacityFor("4" as unknown), null);
  assert.equal(fieldsOf(planDeviceMove(group({ sizeMax: 99 }), ready, "M")).capacity, null);
});

test("a standing the server does not know is left unset", () => {
  assert.equal(
    fieldsOf(planDeviceMove(group({ experience: "expert" }), ready, "M")).experience,
    "expert",
  );
  assert.equal(
    fieldsOf(planDeviceMove(group({ experience: "legend" as never }), ready, "M")).experience,
    null,
  );
});

test("a description over the column's length is trimmed by its owner, not by us", () => {
  const ok = planDeviceMove(
    group({ description: "x".repeat(MAX_MOVED_DESCRIPTION) }),
    ready,
    "M",
  );
  assert.equal(ok.status, "ready");
  const tooLong = planDeviceMove(
    group({ description: "x".repeat(MAX_MOVED_DESCRIPTION + 1) }),
    ready,
    "M",
  );
  assert.equal(tooLong.status === "blocked" && tooLong.reason, "description-too-long");
  /* And it is not shortened behind their back. */
  assert.equal(
    fieldsOf(planDeviceMove(group({ description: "   " }), ready, "M")).description,
    null,
  );
});

/* -------------------------------------------------------------------------- */
/* 2. Which peak, and the owner's ruling of 16 Sep                             */
/* -------------------------------------------------------------------------- */

test("the match is exact, case-folded and mountains only", () => {
  assert.equal(matchPeak("  mont blanc ", CATALOGUE)?.id, "mont-blanc");
  assert.equal(matchPeak("Mont Blanc du Tacul", CATALOGUE)?.id, "mont-blanc-du-tacul");
  assert.equal(matchPeak("Mont", CATALOGUE), null);
  /* A trek with a peak's name is a walk, and a party is not going up it. */
  assert.equal(matchPeak("Matterhorn", CATALOGUE), null);
  assert.equal(matchPeak("", CATALOGUE), null);
});

test("Ama Dablam is a server mountain, and the move files a group against it", () => {
  const fields = fieldsOf(planDeviceMove(group({ peakName: "Ama Dablam" }), ready, "Ama Dablam"));
  assert.equal(fields.destinationId, "ama-dablam");
  assert.equal(fields.topic, null);
  assert.equal(fields.about, null);
});

test("Ama Dablam really is in the seed catalogue and not in the app's fourteen", () => {
  const catalogue = readFile("../icefall-supabase/seed/catalogue.sql");
  assert.equal(/\('ama-dablam', '[^']+', 'mountain'/.test(catalogue), true);
  const appPeaks = readFile("src/data/mock/mountains.ts");
  assert.equal(appPeaks.includes('"ama-dablam"'), false);
});

test("a peak ICEFALL has no record of MOVES, carrying its own name (ruling 2)", () => {
  const plan = planDeviceMove(group({ peakName: "Pico Norte" }), ready, "Pico Norte");
  const fields = fieldsOf(plan);
  assert.equal(fields.destinationId, null);
  assert.equal(fields.topic, "Pico Norte");
  assert.equal(fields.about, "mountain");
  assert.equal((plan as { matched: unknown }).matched, null);
  assert.match(moveNoRecordOfPeak("Pico Norte"), /^ICEFALL has no record of Pico Norte,/);
});

test("a catalogue that could not be read stops the move and says why", () => {
  for (const status of ["unreachable", "refused", "not-provisioned"] as const) {
    const plan = planDeviceMove(group(), absent(status), "Mont Blanc");
    assert.equal(plan.status === "blocked" && plan.reason, "catalogue-unknown");
    assert.equal(
      plan.status === "blocked" && plan.message,
      moveCatalogueUnknown("Mont Blanc"),
      status,
    );
  }
  /* And that sentence is about this group, not about a list of places. */
  assert.match(moveCatalogueUnknown("Mont Blanc"), /Mont Blanc/);
});

test("no server and signed out are their own sentences, not the catalogue's", () => {
  assert.notEqual(MOVE_NO_SERVER, MOVE_SIGN_IN);
  assert.match(MOVE_NO_SERVER, /stays on this phone\.$/);
  assert.match(MOVE_SIGN_IN, /^Sign in/);
});

/* -------------------------------------------------------------------------- */
/* 3. Which groups are offered at all                                          */
/* -------------------------------------------------------------------------- */

test("a group already moved is never offered again", () => {
  const moved = group({ movedTo: "11111111-2222-3333-4444-555555555555", movedBy: "uid-1" });
  assert.equal(hasMoved(moved), true);
  const plan = planDeviceMove(moved, ready, "Mont Blanc");
  assert.equal(plan.status === "blocked" && plan.reason, "already-moved");
  assert.deepEqual(phoneGroupsNotMoved([moved]), []);
});

test("a blank movedTo is not a move", () => {
  assert.equal(hasMoved(group({ movedTo: "   " })), false);
  assert.equal(phoneGroupsNotMoved([group({ movedTo: "  " })]).length, 1);
});

test("the four demo ids are never offered, and a real group always is", () => {
  const demo = SEEDED_DEMO_GROUP_IDS.map((id) => group({ id }));
  assert.deepEqual(phoneGroupsNotMoved(demo), []);
  for (const id of SEEDED_DEMO_GROUP_IDS) assert.equal(isSeededDemoGroupId(id), true);
  assert.equal(isSeededDemoGroupId("expedition-1726000000000"), false);
  assert.equal(isSeededDemoGroupId(`${SEEDED_DEMO_GROUP_IDS[0]}-2`), false);
  assert.equal(phoneGroupsNotMoved([group()]).length, 1);
});

/* -------------------------------------------------------------------------- */
/* 4. The server half                                                          */
/* -------------------------------------------------------------------------- */

const UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function seam(
  overrides: Partial<MoveSeam> & { calls?: MoveFields[] } = {},
): MoveSeam & { calls: MoveFields[] } {
  const calls: MoveFields[] = overrides.calls ?? [];
  return {
    calls,
    async call(fields) {
      calls.push(fields);
      return overrides.call ? overrides.call(fields) : { groupId: UUID, error: null };
    },
    async readBack(groupId) {
      if (overrides.readBack) return overrides.readBack(groupId);
      return {
        status: "ready",
        membership: "member",
        group: { id: groupId } as never,
      };
    },
  };
}

atest("a move that lands returns the group and the account it went to", async () => {
  const s = seam();
  const fields = fieldsOf(planDeviceMove(group(), ready, "Mont Blanc"));
  const outcome = await performMove(fields, s, "uid-1");
  assert.deepEqual(outcome, { ok: true, groupId: UUID, accountId: "uid-1" });
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].originRef, "expedition-1726000000000");
});

atest("a refused call moves nothing and says so in one sentence", async () => {
  const s = seam({
    call: async () => ({
      groupId: null,
      error: {
        code: "42501",
        message: "row-level security",
        details: "",
        hint: "",
        name: "e",
      } as unknown as PostgrestError,
    }),
  });
  const outcome = await performMove(fieldsOf(planDeviceMove(group(), ready, "M")), s, "uid-1");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.message.length > 0, true);
});

atest("a group that cannot be read back is NOT recorded as moved", async () => {
  const s = seam({
    readBack: async () => ({ status: "not-found", message: "no group" }) as never,
  });
  const outcome = await performMove(fieldsOf(planDeviceMove(group(), ready, "M")), s, "uid-1");
  assert.deepEqual(outcome, { ok: false, message: MOVE_READ_BACK_FAILED });
});

atest("an empty id back from the server is a failure, not a group", async () => {
  const s = seam({ call: async () => ({ groupId: "", error: null }) });
  const outcome = await performMove(fieldsOf(planDeviceMove(group(), ready, "M")), s, "uid-1");
  assert.equal(outcome.ok, false);
});

atest("a second tap returns the same group, because the call is idempotent", async () => {
  const s = seam();
  const fields = fieldsOf(planDeviceMove(group(), ready, "M"));
  const first = await performMove(fields, s, "uid-1");
  const second = await performMove(fields, s, "uid-1");
  assert.deepEqual(first, second);
  assert.equal(s.calls[0].originRef, s.calls[1].originRef);
});

atest("with no server, the move refuses in its own words, not the reader's", async () => {
  const outcome = await moveDeviceGroup(fieldsOf(planDeviceMove(group(), ready, "M")));
  assert.deepEqual(outcome, { ok: false, message: MOVE_NO_SERVER });
  /* The shared sentence is about reading a group, so it is not borrowed here. */
  assert.match(GROUP_SPACE_NO_BACKEND, /cannot open this group/);
  assert.notEqual(MOVE_NO_SERVER, GROUP_SPACE_NO_BACKEND);
});

/* -------------------------------------------------------------------------- */
/* 5. The wiring, read from the files                                          */
/* -------------------------------------------------------------------------- */

const deviceMoveSource = readFile("src/groups/local/deviceMove.ts");
const dispatcher = readFile("src/screens/explore/GroupWorkspace.tsx");
const tab = readFile("src/screens/explore/Groups.tsx");
const appState = readFile("src/state/AppState.tsx");
const section = readFile("src/screens/groups/sections/tab/DeviceGroupsSection.tsx");
const summary = readFile("src/screens/groups/local/DeviceGroupSummary.tsx");
const moveUi = readFile("src/screens/groups/local/MoveToAccount.tsx");

test("the RPC is called with the arguments the staged migration declares", () => {
  const migration = readFile("../icefall-supabase/migrations-staged/groups/group_type_and_trip.sql");
  const signature = migration.slice(
    migration.indexOf("function public.group_import_device(") +
      "function public.group_import_device(".length,
  );
  const declared = signature.slice(0, signature.indexOf("\n)")).match(/\bp_[a-z_]+/g);
  assert.notEqual(declared, null);
  for (const argument of declared ?? []) {
    assert.equal(
      deviceMoveSource.includes(`${argument}:`),
      true,
      `deviceMove.ts never passes ${argument}`,
    );
  }
});

test("the old link redirects once the group has moved, and opens read-only when it has not", () => {
  assert.match(dispatcher, /if \(group && hasMoved\(group\)\) \{/);
  assert.match(dispatcher, /<Navigate to=\{`\/social\/groups\/\$\{group\.movedTo\}`\} replace \/>/);
  assert.match(dispatcher, /<DeviceGroupSummary key=\{group\.id\} expedition=\{group\} \/>/);
  /* The workspace is no longer rendered by anything. */
  assert.equal(/<Workspace\b/.test(dispatcher), false);
});

test("the tab shows the phone groups through the new section only", () => {
  assert.match(tab, /<DeviceGroupsSection query=\{query\} \/>/);
  assert.equal(tab.includes("members on this device"), false);
  assert.equal(tab.includes("On this device</SectionLabel>"), false);
});

test("AppState records the move and holds no server call", () => {
  assert.match(appState, /markExpeditionMoved/);
  assert.match(appState, /deleteExpedition/);
  assert.equal(/\bsupabase\b/i.test(appState), false);
  assert.equal(/from "@\/groups\/local\/deviceMove"/.test(appState), false);
  assert.equal(/from "@\/social\/groupSpace"/.test(appState), false);
});

test("nothing in the new group files carries a hex colour", () => {
  for (const [name, source] of [
    ["deviceMove.ts", deviceMoveSource],
    ["DeviceGroupsSection.tsx", section],
    ["DeviceGroupSummary.tsx", summary],
    ["MoveToAccount.tsx", moveUi],
  ] as const) {
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(source), false, `${name} has a hex colour`);
  }
});

test("every explanation on these screens is one sentence", () => {
  const lines = [
    MOVE_WHAT_STAYS,
    MOVE_NO_SERVER,
    MOVE_SIGN_IN,
    MOVE_ACCOUNT_UNKNOWN,
    MOVE_DATES_OUT_OF_ORDER,
    MOVE_NAME_EMPTY,
    MOVE_NAME_TOO_LONG,
    MOVE_READ_BACK_FAILED,
    moveCatalogueUnknown("Mont Blanc"),
    moveNoRecordOfPeak("Mont Blanc"),
    movePublishedUnder("Ada"),
  ];
  for (const line of lines) {
    assert.equal((line.match(/[.?!](\s|$)/g) ?? []).length, 1, `not one sentence: ${line}`);
  }
});

test("the read-only summary takes nothing new and offers one way out", () => {
  assert.equal(/<(input|textarea)\b/.test(summary), false);
  assert.match(summary, /Delete from this phone/);
  assert.match(summary, /Delete this group from this phone\?/);
  assert.match(summary, /deleteExpedition\(expedition\.id\)/);
});

/* -------------------------------------------------------------------------- */

void (async () => {
  for (const run of pending) await run();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
})();
