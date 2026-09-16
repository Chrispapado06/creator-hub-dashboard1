/**
 * `npm run test:groups-demo-cleanup` and `npm run test:groups-demo-cleanup-demo`.
 *
 * Structure plan §3.1–3.2, slice S1. The same file runs twice: once as a
 * production bundle, and once with `DEV: true, VITE_SHOW_DEMO: "1"`, the build
 * that used to seed four demo groups into saved state. Both runs must show that
 * nothing seeds a group and that the clean-up removes exactly those four.
 *
 * WHAT IS PROVEN
 *   1. The clean-up drops the four exact ids and every entry keyed to them.
 *   2. It leaves `expedition-*` groups and near-miss ids alone.
 *   3. It is idempotent, does not mutate its input and tolerates missing or
 *      malformed fields.
 *   4. The normaliser seeds no group, cleans a stored state, and reloading its
 *      own output changes nothing.
 *   5. `AppState.tsx` no longer reaches the old seeding, and the clean-up does
 *      not import the old demo module (D8).
 *
 * WHAT IS NOT PROVEN: that the provider writes the cleaned state back. That is
 * the save effect in `AppState.tsx`, which runs on the first render; check it in
 * the browser by reading `icefall.state.v1` after one load.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEEDED_DEMO_GROUP_IDS, dropSeededDemoGroups } from "@/groups/local/stateCleanup";
import { EMPTY_PERSISTED, normalisePersisted } from "@/state/normalisePersisted";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import type { Persisted } from "@/state/AppState";
import type { Expedition } from "@/network/types";
import type { GroupMessage, GroupTrainingSession } from "@/network/groups";

const DEMO_RUN = import.meta.env.VITE_SHOW_DEMO === "1";

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

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** Written out here, not imported, so the test checks the module's literals. */
const DEMO_IDS = [
  "demo-group-mont-blanc",
  "demo-group-alpine-women",
  "demo-group-ama-dablam",
  "demo-group-denali-2026",
];

/** A real phone group, and ids a prefix or substring match would wrongly catch. */
const KEPT_IDS = [
  "expedition-1726000000000",
  "expedition-demo-group-mont-blanc",
  "demo-group-mont-blanc-2",
  "demo-group-other",
  "DEMO-GROUP-MONT-BLANC",
];

const FIXED_NOW = "2026-09-16T08:00:00.000Z";

const expedition = (id: string): Expedition => ({
  id,
  peakName: "Mont Blanc",
  elevationM: 4806,
  window: { fromIso: "2027-07-01", toIso: "2027-07-08" },
  sizeMin: 2,
  sizeMax: 4,
  experience: "intermediate",
  lookingFor: [],
  privacy: "public",
  memberIds: ["local:you"],
  createdBy: "local:you",
  createdAt: "2026-09-01T00:00:00.000Z",
});

const session = (groupId: string): GroupTrainingSession => ({
  id: `session-${groupId}`,
  groupId,
  title: "Stairs",
  dayKey: "2026-10-03",
  rsvps: { "local:you": "going" },
  createdAt: "2026-09-01T00:00:00.000Z",
});

const message = (groupId: string): GroupMessage => ({
  id: `message-${groupId}`,
  groupId,
  authorId: "local:you",
  body: "Note to self",
  at: "2026-09-01T00:00:00.000Z",
});

const keyed = <V>(ids: string[], value: V): Record<string, V> =>
  Object.fromEntries(ids.map((id) => [id, value]));

function stateWith(ids: string[]): Partial<Persisted> {
  return {
    onboarded: true,
    name: "Athlete",
    customGoals: [],
    sessionOverrides: {},
    kudos: [],
    objectives: [],
    memberSince: "2026-01-01T00:00:00.000Z",
    expeditions: ids.map(expedition),
    groupSessions: ids.map(session),
    groupMessages: ids.map(message),
    groupNotes: keyed(ids, "Bring the rope"),
    groupChecklistShared: keyed(ids, true),
    groupStyle: keyed(ids, "independent"),
    checklistStatuses: {
      ...Object.fromEntries(ids.map((id) => [`group:${id}`, { harness: "have" as const }])),
      "goal-mont-blanc": { harness: "need" as const },
    },
  };
}

const sorted = (xs: string[]) => [...xs].sort();

/* -------------------------------------------------------------------------- */
/* 1–3. The clean-up                                                           */
/* -------------------------------------------------------------------------- */

console.log(`\ngroups demo clean-up (demo data ${DEMO_RUN ? "ON" : "OFF"} in this bundle)`);

test("the bundle's demo flag matches the run it claims to be", () => {
  assert.equal(SHOW_DEMO_DATA, DEMO_RUN);
});

test("the clean-up names exactly the four ids the old seeding wrote", () => {
  assert.deepEqual([...SEEDED_DEMO_GROUP_IDS], DEMO_IDS);
});

test("drops exactly the four ids and every entry keyed to them", () => {
  const input = stateWith([...DEMO_IDS, ...KEPT_IDS]);
  const out = dropSeededDemoGroups(input);

  assert.deepEqual(out.expeditions?.map((e) => e.id), KEPT_IDS);
  assert.deepEqual(out.groupSessions?.map((x) => x.groupId), KEPT_IDS);
  assert.deepEqual(out.groupMessages?.map((x) => x.groupId), KEPT_IDS);
  assert.deepEqual(sorted(Object.keys(out.groupNotes ?? {})), sorted(KEPT_IDS));
  assert.deepEqual(sorted(Object.keys(out.groupChecklistShared ?? {})), sorted(KEPT_IDS));
  assert.deepEqual(sorted(Object.keys(out.groupStyle ?? {})), sorted(KEPT_IDS));
  assert.deepEqual(
    sorted(Object.keys(out.checklistStatuses ?? {})),
    sorted([...KEPT_IDS.map((id) => `group:${id}`), "goal-mont-blanc"]),
  );

  // Everything else is passed through untouched.
  assert.equal(out.objectives, input.objectives);
  assert.equal(out.customGoals, input.customGoals);
  assert.equal(out.name, "Athlete");
  assert.equal(out.memberSince, input.memberSince);
});

test("a goal's checklist is kept even when a demo group shared it", () => {
  const out = dropSeededDemoGroups(stateWith(DEMO_IDS));
  assert.deepEqual(out.checklistStatuses, { "goal-mont-blanc": { harness: "need" } });
  assert.deepEqual(out.expeditions, []);
});

test("leaves expedition-* groups and near-miss ids alone, as the same object", () => {
  const input = stateWith(KEPT_IDS);
  const snapshot = structuredClone(input);
  const out = dropSeededDemoGroups(input);
  assert.equal(out, input);
  assert.deepEqual(out, snapshot);
});

test("does not mutate its input", () => {
  const input = stateWith([...DEMO_IDS, ...KEPT_IDS]);
  const snapshot = structuredClone(input);
  dropSeededDemoGroups(input);
  assert.deepEqual(input, snapshot);
});

test("is idempotent", () => {
  const once = dropSeededDemoGroups(stateWith([...DEMO_IDS, ...KEPT_IDS]));
  const twice = dropSeededDemoGroups(once);
  assert.equal(twice, once);
  assert.deepEqual(twice, once);
});

test("tolerates missing fields and adds none", () => {
  const empty = {};
  assert.equal(dropSeededDemoGroups(empty), empty);
  assert.deepEqual(dropSeededDemoGroups(empty), {});

  const onlyGroups: Partial<Persisted> = { expeditions: [expedition(DEMO_IDS[0]), expedition(KEPT_IDS[0])] };
  const out = dropSeededDemoGroups(onlyGroups);
  assert.deepEqual(Object.keys(out), ["expeditions"]);
  assert.deepEqual(out.expeditions?.map((e) => e.id), [KEPT_IDS[0]]);

  const onlyNotes: Partial<Persisted> = { groupNotes: { [DEMO_IDS[1]]: "x" } };
  assert.deepEqual(dropSeededDemoGroups(onlyNotes), { groupNotes: {} });
});

test("tolerates malformed fields without throwing", () => {
  const odd = {
    expeditions: null,
    groupSessions: [null, { groupId: 5 }, "text"],
    groupMessages: {},
    groupNotes: "text",
    groupChecklistShared: [],
    groupStyle: null,
    checklistStatuses: 7,
  } as unknown as Partial<Persisted>;
  assert.equal(dropSeededDemoGroups(odd), odd);

  const mixed = {
    expeditions: [null, expedition(DEMO_IDS[2]), { peakName: "no id" }],
  } as unknown as Partial<Persisted>;
  const out = dropSeededDemoGroups(mixed) as unknown as { expeditions: unknown[] };
  assert.deepEqual(out.expeditions, [null, { peakName: "no id" }]);
});

/* -------------------------------------------------------------------------- */
/* 4. The normaliser seeds nothing                                             */
/* -------------------------------------------------------------------------- */

const GROUP_FIELDS = [
  "expeditions",
  "groupSessions",
  "groupMessages",
  "groupNotes",
  "groupChecklistShared",
  "groupStyle",
  "checklistStatuses",
] as const;

test("a first run seeds no group", () => {
  const first = normalisePersisted(null, () => FIXED_NOW);
  for (const field of GROUP_FIELDS) assert.equal(field in first, false, `${field} was seeded`);
  // What a first run has always seeded, and still does.
  assert.equal(first.memberSince, FIXED_NOW);
  assert.ok((first.objectives ?? []).length > 0);
  assert.ok((first.objectives ?? []).every((o) => o.id.startsWith("curated:")));
  assert.equal(normalisePersisted("", () => FIXED_NOW).expeditions, undefined);
});

test("a stored state with no groups gets none", () => {
  assert.equal(normalisePersisted("{}", () => FIXED_NOW).expeditions, undefined);
  assert.deepEqual(normalisePersisted('{"expeditions":[]}', () => FIXED_NOW).expeditions, []);
  const withProfile = normalisePersisted(
    JSON.stringify({ onboarded: true, myProfile: { id: "local:you" } }),
    () => FIXED_NOW,
  );
  assert.equal(withProfile.expeditions, undefined);
});

test("stored fields are kept and only missing ones are stamped", () => {
  const stored = { onboarded: true, name: "Athlete", memberSince: "2026-01-01T00:00:00.000Z", objectives: [] };
  const out = normalisePersisted(JSON.stringify(stored), () => FIXED_NOW);
  assert.equal(out.memberSince, stored.memberSince);
  assert.deepEqual(out.objectives, []);
  assert.equal(out.name, "Athlete");
  assert.equal(out.onboarded, true);
  assert.deepEqual(out.customGoals, []);

  const old = normalisePersisted('{"onboarded":true}', () => FIXED_NOW);
  assert.equal(old.memberSince, FIXED_NOW);
  assert.ok((old.objectives ?? []).length > 0);
});

test("a stored state holding the seeded groups loads without them", () => {
  const out = normalisePersisted(JSON.stringify(stateWith([...DEMO_IDS, ...KEPT_IDS])), () => FIXED_NOW);
  const text = JSON.stringify(out);
  for (const id of DEMO_IDS) {
    assert.equal(text.includes(`"${id}"`), false, `${id} survived`);
    assert.equal(text.includes(`"group:${id}"`), false, `group:${id} survived`);
  }
  assert.deepEqual(out.expeditions?.map((e) => e.id), KEPT_IDS);
});

test("reloading a normalised state changes nothing", () => {
  const first = normalisePersisted(JSON.stringify(stateWith([...DEMO_IDS, ...KEPT_IDS])), () => FIXED_NOW);
  const again = normalisePersisted(JSON.stringify(first), () => "2030-01-01T00:00:00.000Z");
  assert.deepEqual(again, first);
});

test("text that is not a JSON object gives the empty state", () => {
  for (const raw of ["not json", "null", "[]", '"text"', "42", "true"]) {
    assert.deepEqual(normalisePersisted(raw, () => FIXED_NOW), EMPTY_PERSISTED, raw);
  }
});

/* -------------------------------------------------------------------------- */
/* 5. The seeding is gone at the source                                        */
/* -------------------------------------------------------------------------- */

const readSrc = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

test("AppState no longer reaches the old demo seeding", () => {
  const app = readSrc("src/state/AppState.tsx");
  assert.equal(/demoGroupRecords/.test(app), false);
  assert.match(app, /function load\(\): Persisted \{[\s\S]*?normalisePersisted\(localStorage\.getItem\(STORAGE_KEY\)\)/);
});

test("the clean-up and normaliser import no demo module and no server code", () => {
  const importLine = /\bfrom\s*["']([^"']+)["']/g;
  for (const file of ["src/groups/local/stateCleanup.ts", "src/state/normalisePersisted.ts"]) {
    const specs = [...readSrc(file).matchAll(importLine)].map((m) => m[1]);
    for (const spec of specs) {
      assert.equal(/demo|backend|supabase|social\//i.test(spec), false, `${file} imports ${spec}`);
    }
  }
});

/* -------------------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exitCode = 1;
