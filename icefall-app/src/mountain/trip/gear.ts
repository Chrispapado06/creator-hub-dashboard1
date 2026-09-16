/**
 * MOUNTAIN MODE · GEAR — the pure model and the phone-only storage (brief M5,
 * plan §3.5: "the app currently links to a list that forgets everything the
 * moment you navigate away").
 *
 * Two kinds of row, kept apart on purpose:
 *
 *  - Rows DERIVED from the objective's kit list (`services/checklist.ts`). They
 *    are regenerated every time, never copied into storage, so a change to the
 *    generator is never frozen into an old snapshot.
 *  - Rows the athlete TYPED, which only exist here.
 *
 * And two kinds of mark, also kept apart:
 *
 *  - The full app's `ItemStatus` ("Have", "Need", …) answers *do you own it*.
 *    This file never writes it — a Mountain-mode tick must not overwrite what
 *    the athlete recorded at home.
 *  - The tick here answers *is it in the bag*. It is stored on the phone in
 *    `gearTicks` and goes nowhere else.
 */

import { NO_DATABASE_SENTENCE, deviceStore, kvGet, kvSet } from "@/device/db";
import type { GearTick } from "@/device/types";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  STATUS_LABEL,
  type ChecklistCategory,
  type ChecklistItem,
  type ItemStatus,
} from "@/services/checklist";

/** The one status word this screen writes. `GearTick.status` is deliberately loose. */
export const PACKED = "packed";

/** Storage failed. The tick still applies on screen until the app is closed. */
export const GEAR_NOT_KEPT_SENTENCE =
  "This tick is not kept on this phone. " + NO_DATABASE_SENTENCE;

export const GEAR_KEPT_HERE_SENTENCE = "Ticks are kept on this phone only.";

/** Longer than this is a note, not a kit item, and it stops a row from being readable in gloves. */
export const MAX_GEAR_LABEL = 60;

export interface AddedGearItem {
  id: string;
  label: string;
  at: number;
}

export interface GearRow {
  /** Unique inside one scope. Checklist ids for derived rows, `own-…` for typed ones. */
  id: string;
  label: string;
  detail: string | null;
  packed: boolean;
  /** When it was ticked, or null. */
  packedAt: number | null;
  /** True when the athlete typed this row, so it can be removed again. */
  added: boolean;
  /** What the full app recorded against this item, shown read-only. Null when nothing. */
  statusLabel: string | null;
}

export interface GearGroup {
  id: ChecklistCategory | "added";
  label: string;
  rows: GearRow[];
}

export const ADDED_GROUP_LABEL = "Added by you";

/* -------------------------------------------------------------------------- */
/* Scope and keys                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Which list the ticks belong to.
 *
 * The objective's id when the trip has one, so the ticks sit beside the kit
 * statuses the full app already keys by `goalId`. Otherwise the trip's own id,
 * which keeps the review build's example trip in its own corner.
 */
export function gearScopeId(
  trip: { id: string; record: { goalId: string | null } | null } | null,
): string | null {
  if (!trip) return null;
  return trip.record?.goalId ?? `trip:${trip.id}`;
}

export function tickId(scopeId: string, itemId: string): string {
  return `${scopeId}:${itemId}`;
}

export function addedKey(scopeId: string): string {
  return `mountain.gear.added.${scopeId}`;
}

/* -------------------------------------------------------------------------- */
/* Building the rows                                                           */
/* -------------------------------------------------------------------------- */

export interface GearInput {
  /** Already filtered for what this athlete may see (`visibleKit`). */
  items: ChecklistItem[];
  added: AddedGearItem[];
  /** Keyed by item id, not by tick id — the caller has one scope. */
  ticks: Record<string, GearTick>;
  statuses: Record<string, ItemStatus>;
}

/**
 * Category order first, then typed rows last, oldest first so the list does not
 * reshuffle under a gloved thumb between taps.
 */
export function buildGearGroups(input: GearInput): GearGroup[] {
  const { items, added, ticks, statuses } = input;

  const row = (
    id: string,
    label: string,
    detail: string | null,
    isAdded: boolean,
  ): GearRow => {
    const tick = ticks[id];
    const packed = tick?.status === PACKED;
    const status = statuses[id];
    return {
      id,
      label,
      detail,
      packed,
      packedAt: packed ? (tick?.at ?? null) : null,
      added: isAdded,
      statusLabel: status ? STATUS_LABEL[status] : null,
    };
  };

  const groups: GearGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    const rows = items
      .filter((i) => i.category === category)
      .map((i) => row(i.id, i.label, i.detail ?? null, false));
    if (rows.length > 0) groups.push({ id: category, label: CATEGORY_LABEL[category], rows });
  }

  const addedRows = [...added]
    .sort((a, b) => a.at - b.at)
    .map((a) => row(a.id, a.label, null, true));
  if (addedRows.length > 0) groups.push({ id: "added", label: ADDED_GROUP_LABEL, rows: addedRows });

  return groups;
}

export interface GearCount {
  packed: number;
  total: number;
}

export function gearCount(groups: GearGroup[]): GearCount {
  let packed = 0;
  let total = 0;
  for (const group of groups) {
    for (const r of group.rows) {
      total += 1;
      if (r.packed) packed += 1;
    }
  }
  return { packed, total };
}

/** "4 of 18 packed". Never a percentage: eighteen rows is a list you can count. */
export function packedLabel(count: GearCount): string {
  return `${count.packed} of ${count.total} packed`;
}

/* -------------------------------------------------------------------------- */
/* Adding a row                                                                */
/* -------------------------------------------------------------------------- */

export function normaliseGearLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_GEAR_LABEL);
}

export type AddCheck = { ok: true; label: string } | { ok: false; reason: string };

/**
 * Empty is a mis-tap, not an item. A duplicate is refused by name rather than
 * silently merged, because two rows reading "Spare gloves" is the one thing
 * that makes a tick list useless.
 */
export function checkGearLabel(text: string, groups: GearGroup[]): AddCheck {
  const label = normaliseGearLabel(text);
  if (!label) return { ok: false, reason: "Type what you are adding." };
  const taken = groups.some((g) =>
    g.rows.some((r) => r.label.toLowerCase() === label.toLowerCase()),
  );
  if (taken) return { ok: false, reason: "That is already on the list." };
  return { ok: true, label };
}

/** `own-<time>`, with a counter only if two rows were added in the same millisecond. */
export function addedItemId(existing: AddedGearItem[], now: number): string {
  const base = `own-${now}`;
  if (!existing.some((a) => a.id === base)) return base;
  let n = 2;
  while (existing.some((a) => a.id === `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function withAddedItem(
  existing: AddedGearItem[],
  label: string,
  now: number,
): AddedGearItem[] {
  return [...existing, { id: addedItemId(existing, now), label, at: now }];
}

export function withoutAddedItem(existing: AddedGearItem[], id: string): AddedGearItem[] {
  return existing.filter((a) => a.id !== id);
}

/* -------------------------------------------------------------------------- */
/* Storage — this phone only                                                   */
/* -------------------------------------------------------------------------- */

export interface StoredGear {
  ticks: Record<string, GearTick>;
  added: AddedGearItem[];
  /** False when the phone would not give us a database: the screen says so. */
  kept: boolean;
}

/**
 * Never rejects. A phone with no database still gets a working list for this
 * session; it is told the ticks are not being kept rather than shown an error.
 */
export async function readGear(scopeId: string): Promise<StoredGear> {
  try {
    const rows = await deviceStore("gearTicks").byIndex("scopeId", scopeId);
    const ticks: Record<string, GearTick> = {};
    for (const t of rows) ticks[t.itemId] = t;
    const record = await kvGet<AddedGearItem[]>(addedKey(scopeId));
    const added = Array.isArray(record?.value)
      ? record.value.filter(
          (a): a is AddedGearItem =>
            !!a && typeof a.id === "string" && typeof a.label === "string",
        )
      : [];
    return { ticks, added, kept: true };
  } catch {
    return { ticks: {}, added: [], kept: false };
  }
}

/** Returns false when the phone would not keep it. Un-ticking removes the row. */
export async function writeGearTick(
  scopeId: string,
  itemId: string,
  packed: boolean,
  now: number = Date.now(),
): Promise<boolean> {
  const store = deviceStore("gearTicks");
  try {
    if (packed) {
      await store.put({ id: tickId(scopeId, itemId), scopeId, itemId, status: PACKED, at: now });
    } else {
      await store.delete(tickId(scopeId, itemId));
    }
    return true;
  } catch {
    return false;
  }
}

export async function writeAddedGear(
  scopeId: string,
  added: AddedGearItem[],
  now: number = Date.now(),
): Promise<boolean> {
  try {
    await kvSet(addedKey(scopeId), added, now);
    return true;
  } catch {
    return false;
  }
}

/** Removing a typed row takes its tick with it, or the tick outlives the item. */
export async function removeAddedGear(
  scopeId: string,
  added: AddedGearItem[],
  id: string,
  now: number = Date.now(),
): Promise<{ added: AddedGearItem[]; kept: boolean }> {
  const next = withoutAddedItem(added, id);
  const keptList = await writeAddedGear(scopeId, next, now);
  const keptTick = await writeGearTick(scopeId, id, false, now);
  return { added: next, kept: keptList && keptTick };
}
