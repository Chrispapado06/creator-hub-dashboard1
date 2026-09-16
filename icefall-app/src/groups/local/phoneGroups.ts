/**
 * The groups saved on this phone that still count as the athlete's own.
 *
 * Structure plan §3.5: Passport and search count "phone groups not yet moved".
 * TWO THINGS ARE LEFT OUT, and neither is a guess about a record:
 *
 *   - the four demo ids, by exact literal, in case an install still holds one
 *     before the load-time clean-up has run;
 *   - anything with `movedTo`, because that group is now a group on ICEFALL's
 *     server and is counted there. Counting it in both places would tell
 *     somebody who started three groups that they started six.
 *
 * Pure: no React and no storage, so it runs under the node tests.
 */
import type { Expedition } from "@/network/types";
import { SEEDED_DEMO_GROUP_IDS } from "./stateCleanup";

const SEEDED = new Set<string>(SEEDED_DEMO_GROUP_IDS);

/**
 * Is this one of the four ids dev builds used to seed? EXACT LITERALS, never a
 * prefix: a real `expedition-*` group must never be caught by it.
 */
export function isSeededDemoGroupId(id: string): boolean {
  return SEEDED.has(id);
}

/** Has this group been moved to an account? A written id and nothing less. */
export function hasMoved(expedition: Expedition): boolean {
  return typeof expedition.movedTo === "string" && expedition.movedTo.trim().length > 0;
}

export function phoneGroupsNotMoved(expeditions: readonly Expedition[]): Expedition[] {
  return expeditions.filter((e) => !SEEDED.has(e.id) && !hasMoved(e));
}
