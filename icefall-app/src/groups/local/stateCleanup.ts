/**
 * Taking a group out of saved state (`icefall.state.v1`) with everything keyed
 * to it: the four demo groups dev and `VITE_SHOW_DEMO=1` builds used to seed,
 * and a group somebody deletes from this phone.
 *
 * Structure plan §3.2 and D8. Decisions this module holds:
 *
 * - EXACT IDS, WRITTEN HERE AS LITERALS. No prefix match, so a real
 *   `expedition-*` group, or any other id, can never be caught. No import of the
 *   old demo module either, so this keeps working after that file is deleted.
 * - RUNS ON EVERY LOAD, NO MARKER KEY. Removing records that are not there
 *   changes nothing, so running it twice is the same as running it once.
 * - PURE. No React and no storage access, so it runs under the node tests. The
 *   caller (`state/normalisePersisted.ts`) hands the result back to `load()`, and
 *   the provider's save effect writes the cleaned state.
 * - Anything typed onto a demo group goes with it (plan R6). Only dev and demo
 *   builds ever held these records; production never seeded them.
 */
import type { Persisted } from "@/state/AppState";

/** The ids the old seeding wrote. Never extend this with a pattern. */
export const SEEDED_DEMO_GROUP_IDS = [
  "demo-group-mont-blanc",
  "demo-group-alpine-women",
  "demo-group-ama-dablam",
  "demo-group-denali-2026",
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A copy of `rec` without the given keys, or null when none of them is present. */
function withoutKeys<V>(rec: Record<string, V>, keys: string[]): Record<string, V> | null {
  const present = keys.filter((k) => Object.prototype.hasOwnProperty.call(rec, k));
  if (present.length === 0) return null;
  const next = { ...rec };
  for (const k of present) delete next[k];
  return next;
}

const idField = (entry: unknown): unknown => (isRecord(entry) ? entry.id : undefined);
const groupIdField = (entry: unknown): unknown => (isRecord(entry) ? entry.groupId : undefined);

/**
 * The state without the groups whose ids are given, their sessions and messages
 * (by `groupId`), and their notes, checklist-sharing, style and
 * `checklistStatuses["group:<id>"]` entries.
 *
 * EXACT IDS ONLY — the caller names every group it means, and nothing is
 * matched by shape. Returns the SAME object when there is nothing to remove,
 * and never adds a field the input did not have. The input is not mutated.
 *
 * Two callers, both naming their own ids: the load-time demo clean-up below,
 * and "Delete from this phone" on a group saved here (structure plan §2.3). One
 * removal, so a group can never leave half of itself keyed to an id nothing
 * points at any more.
 */
export function dropPhoneGroups<T extends Partial<Persisted>>(
  p: T,
  groupIds: readonly string[],
): T {
  const wanted = new Set<string>(groupIds);
  const isWanted = (id: unknown): boolean => typeof id === "string" && wanted.has(id);
  const withoutWanted = <E,>(list: E[], idOf: (entry: E) => unknown): E[] | null => {
    const kept = list.filter((entry) => !isWanted(idOf(entry)));
    return kept.length === list.length ? null : kept;
  };

  const next: Partial<Persisted> = { ...p };
  let changed = false;

  if (Array.isArray(p.expeditions)) {
    const kept = withoutWanted(p.expeditions, idField);
    if (kept) {
      next.expeditions = kept;
      changed = true;
    }
  }
  if (Array.isArray(p.groupSessions)) {
    const kept = withoutWanted(p.groupSessions, groupIdField);
    if (kept) {
      next.groupSessions = kept;
      changed = true;
    }
  }
  if (Array.isArray(p.groupMessages)) {
    const kept = withoutWanted(p.groupMessages, groupIdField);
    if (kept) {
      next.groupMessages = kept;
      changed = true;
    }
  }

  const ids = [...wanted];
  if (isRecord(p.groupNotes)) {
    const kept = withoutKeys(p.groupNotes, ids);
    if (kept) {
      next.groupNotes = kept;
      changed = true;
    }
  }
  if (isRecord(p.groupChecklistShared)) {
    const kept = withoutKeys(p.groupChecklistShared, ids);
    if (kept) {
      next.groupChecklistShared = kept;
      changed = true;
    }
  }
  if (isRecord(p.groupStyle)) {
    const kept = withoutKeys(p.groupStyle, ids);
    if (kept) {
      next.groupStyle = kept;
      changed = true;
    }
  }
  /* Only the group-keyed lists. A group on a mountain the athlete has as a goal
     shares the goal's list (keyed by goal id), and that list is theirs. */
  if (isRecord(p.checklistStatuses)) {
    const kept = withoutKeys(
      p.checklistStatuses,
      ids.map((id) => `group:${id}`),
    );
    if (kept) {
      next.checklistStatuses = kept;
      changed = true;
    }
  }

  return changed ? (next as T) : p;
}

/**
 * The state without the four seeded demo groups and everything keyed to them.
 *
 * The ids are the literals above and nothing else, which is D8: no prefix
 * match, so a real `expedition-*` group can never be caught by it.
 */
export function dropSeededDemoGroups<T extends Partial<Persisted>>(p: T): T {
  return dropPhoneGroups(p, SEEDED_DEMO_GROUP_IDS);
}
