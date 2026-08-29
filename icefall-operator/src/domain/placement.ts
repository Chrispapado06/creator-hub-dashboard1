/**
 * The `placement_status` view, client-side.
 *
 * EXPIRY IS DERIVED, NEVER STORED. Nothing in the schema writes to `placements`
 * on a timer, and nothing here does either: an expired placement still holds its
 * slot, and `effectiveStatus` simply starts reading `expired` on the day after
 * its term ends. Spec §2 — an expiry raises a reminder for a human and never
 * reorders the mountain.
 *
 * This mirrors the database view rather than adding to it, so the operator sees
 * the same answer the internal CRM does.
 */

import { daysUntil, TODAY } from "./dates";
import type { Placement, PlacementStatusRow } from "./types";

export function placementStatus(p: Placement, today: string = TODAY): PlacementStatusRow {
  const daysRemaining = p.endsOn ? daysUntil(p.endsOn, today) : null;
  const lapsed = p.status === "active" && daysRemaining !== null && daysRemaining < 0;
  return {
    placementId: p.id,
    effectiveStatus: lapsed ? "expired" : p.status,
    // Something a human needs to look at: it has lapsed, or it is close enough
    // that ICEFALL should be having the renewal conversation now.
    needsReview: lapsed || (daysRemaining !== null && daysRemaining <= 30 && p.status === "active"),
    daysRemaining,
  };
}

/** The placement for one mountain, if this company holds one at all. */
export const placementFor = (placements: readonly Placement[], mountainId: string): Placement | null =>
  placements.find((p) => p.mountainId === mountainId && p.status !== "cancelled") ?? null;
