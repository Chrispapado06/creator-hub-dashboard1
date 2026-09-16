/**
 * Gear list: the model and the phone-only storage.
 *
 * Storage runs against the in-memory backend `db.ts` exposes for tests; the
 * real IndexedDB is proved in the Playwright run.
 */

import { __resetDeviceStorageForTests, __useBrokenDeviceStorage, __useMemoryDeviceStorage, deviceStore } from "@/device/db";
import type { ChecklistItem } from "@/services/checklist";

import {
  ADDED_GROUP_LABEL,
  PACKED,
  addedItemId,
  buildGearGroups,
  checkGearLabel,
  gearCount,
  gearScopeId,
  normaliseGearLabel,
  packedLabel,
  readGear,
  removeAddedGear,
  tickId,
  withAddedItem,
  withoutAddedItem,
  writeAddedGear,
  writeGearTick,
  type AddedGearItem,
} from "./gear";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${err instanceof Error ? err.message : String(err)}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label} expected ${e}, got ${a}`);
}

function ok(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

const item = (id: string, label: string, category: ChecklistItem["category"]): ChecklistItem => ({
  id,
  label,
  category,
  essential: true,
  thirdParty: true,
});

const ITEMS = [
  item("kit-axe", "Ice axe", "technical"),
  item("kit-shell", "Hard shell", "clothing"),
];

const tick = (scopeId: string, itemId: string, at = 1) => ({
  id: tickId(scopeId, itemId),
  scopeId,
  itemId,
  status: PACKED,
  at,
});

async function run() {
  /* -- Scope ------------------------------------------------------------- */

  await test("no trip has no scope", () => {
    eq(gearScopeId(null), null);
  });

  await test("the objective's id is the scope when there is one", () => {
    eq(gearScopeId({ id: "t1", record: { goalId: "goal-9" } }), "goal-9");
  });

  await test("a trip with no objective keeps its own corner", () => {
    eq(gearScopeId({ id: "t1", record: null }), "trip:t1");
  });

  /* -- Building rows ------------------------------------------------------ */

  await test("rows follow category order, typed rows last", () => {
    const groups = buildGearGroups({
      items: ITEMS,
      added: [
        { id: "own-2", label: "Thermos", at: 2 },
        { id: "own-1", label: "Spare gloves", at: 1 },
      ],
      ticks: {},
      statuses: {},
    });
    eq(
      groups.map((g) => g.id),
      ["technical", "clothing", "added"],
    );
    eq(groups[2].label, ADDED_GROUP_LABEL);
    // Oldest first, so the list does not reshuffle under a gloved thumb.
    eq(
      groups[2].rows.map((r) => r.label),
      ["Spare gloves", "Thermos"],
    );
  });

  await test("a tick marks its row and only its row", () => {
    const groups = buildGearGroups({
      items: ITEMS,
      added: [],
      ticks: { "kit-axe": tick("goal-9", "kit-axe", 1700) },
      statuses: {},
    });
    eq(groups[0].rows[0].packed, true);
    eq(groups[0].rows[0].packedAt, 1700);
    eq(groups[1].rows[0].packed, false);
    eq(groups[1].rows[0].packedAt, null);
  });

  await test("a tick with some other status word is not a tick", () => {
    const groups = buildGearGroups({
      items: ITEMS,
      added: [],
      ticks: { "kit-axe": { ...tick("goal-9", "kit-axe"), status: "owned" } },
      statuses: {},
    });
    eq(groups[0].rows[0].packed, false);
  });

  await test("the app's own status is shown, never rewritten", () => {
    const groups = buildGearGroups({
      items: ITEMS,
      added: [],
      ticks: {},
      statuses: { "kit-axe": "need" },
    });
    eq(groups[0].rows[0].statusLabel, "Need");
    eq(groups[1].rows[0].statusLabel, null);
  });

  await test("counting and its label", () => {
    const groups = buildGearGroups({
      items: ITEMS,
      added: [{ id: "own-1", label: "Thermos", at: 1 }],
      ticks: { "kit-shell": tick("goal-9", "kit-shell") },
      statuses: {},
    });
    eq(gearCount(groups), { packed: 1, total: 3 });
    eq(packedLabel(gearCount(groups)), "1 of 3 packed");
  });

  await test("an empty category is not a heading with nothing under it", () => {
    const groups = buildGearGroups({ items: [], added: [], ticks: {}, statuses: {} });
    eq(groups.length, 0);
  });

  /* -- Adding a row ------------------------------------------------------- */

  await test("labels are tidied and capped", () => {
    eq(normaliseGearLabel("  Spare   gloves \n"), "Spare gloves");
    eq(normaliseGearLabel("x".repeat(90)).length, 60);
  });

  await test("empty and duplicate labels are refused by name", () => {
    const groups = buildGearGroups({ items: ITEMS, added: [], ticks: {}, statuses: {} });
    const empty = checkGearLabel("   ", groups);
    eq(empty.ok, false);
    ok(!empty.ok && empty.reason.length > 0, "a reason is given");
    const dupe = checkGearLabel("ice AXE", groups);
    eq(dupe.ok, false);
    const fine = checkGearLabel(" Thermos ", groups);
    eq(fine, { ok: true, label: "Thermos" });
  });

  await test("two rows added in the same millisecond get different ids", () => {
    let list: AddedGearItem[] = [];
    list = withAddedItem(list, "A", 5);
    list = withAddedItem(list, "B", 5);
    eq(list.map((a) => a.id), ["own-5", "own-5-2"]);
    eq(addedItemId(list, 5), "own-5-3");
    eq(withoutAddedItem(list, "own-5").map((a) => a.label), ["B"]);
  });

  /* -- Storage ------------------------------------------------------------ */

  await test("a tick is kept, and un-ticking removes it", async () => {
    __useMemoryDeviceStorage();
    eq(await writeGearTick("goal-9", "kit-axe", true, 111), true);
    let stored = await readGear("goal-9");
    eq(stored.kept, true);
    eq(stored.ticks["kit-axe"].at, 111);
    eq(await writeGearTick("goal-9", "kit-axe", false, 112), true);
    stored = await readGear("goal-9");
    eq(stored.ticks["kit-axe"], undefined);
    __resetDeviceStorageForTests();
  });

  await test("one trip's ticks never leak into another's", async () => {
    __useMemoryDeviceStorage();
    await writeGearTick("goal-9", "kit-axe", true, 1);
    await writeGearTick("trip:t2", "kit-shell", true, 2);
    const nine = await readGear("goal-9");
    eq(Object.keys(nine.ticks), ["kit-axe"]);
    const two = await readGear("trip:t2");
    eq(Object.keys(two.ticks), ["kit-shell"]);
    __resetDeviceStorageForTests();
  });

  await test("typed rows come back, and removing one takes its tick with it", async () => {
    __useMemoryDeviceStorage();
    const list = withAddedItem([], "Thermos", 7);
    eq(await writeAddedGear("goal-9", list, 7), true);
    await writeGearTick("goal-9", list[0].id, true, 8);
    let stored = await readGear("goal-9");
    eq(stored.added, [{ id: "own-7", label: "Thermos", at: 7 }]);
    const res = await removeAddedGear("goal-9", stored.added, "own-7", 9);
    eq(res.kept, true);
    eq(res.added, []);
    stored = await readGear("goal-9");
    eq(stored.added, []);
    eq(await deviceStore("gearTicks").count(), 0);
    __resetDeviceStorageForTests();
  });

  await test("a corrupt stored list is ignored rather than shown", async () => {
    __useMemoryDeviceStorage();
    await writeAddedGear("goal-9", [{ id: "own-1" } as AddedGearItem, { id: "own-2", label: "Thermos", at: 2 }], 3);
    const stored = await readGear("goal-9");
    eq(stored.added, [{ id: "own-2", label: "Thermos", at: 2 }]);
    __resetDeviceStorageForTests();
  });

  await test("a phone with no database says so instead of throwing", async () => {
    __useBrokenDeviceStorage();
    const stored = await readGear("goal-9");
    eq(stored, { ticks: {}, added: [], kept: false });
    eq(await writeGearTick("goal-9", "kit-axe", true, 1), false);
    eq(await writeAddedGear("goal-9", [], 1), false);
    eq((await removeAddedGear("goal-9", [], "own-1", 1)).kept, false);
    __resetDeviceStorageForTests();
  });

  console.log(`gear: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void run();
