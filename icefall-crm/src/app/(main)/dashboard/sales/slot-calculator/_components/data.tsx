import { MOUNTAINS, TREKS } from "@/domain/visibilityIndex";
import type { ListingKind } from "@/domain/slotPricing";

/**
 * NO PLACEHOLDER ROWS ON THIS SCREEN. The calculator prices a listing, not a
 * customer, so it names no operator anywhere — the pool below is the real
 * ported Visibility Index table (77 mountains, 76 treks), tagged with its kind
 * so a selected listing carries its own slot count.
 *
 * `refPriceEur` is carried through because the domain type declares it. It is
 * context for a sales conversation and never an input to the price, so nothing
 * on the screen renders it.
 */
export type Listing = {
  name: string;
  kind: ListingKind;
  index: number;
  refPriceEur?: number;
};

export const MOUNTAIN_LISTINGS: readonly Listing[] = MOUNTAINS.map((l) => ({
  name: l.name,
  kind: "mountain" as const,
  index: l.index,
}));

export const TREK_LISTINGS: readonly Listing[] = TREKS.map((l) => ({
  name: l.name,
  kind: "trek" as const,
  index: l.index,
  refPriceEur: l.refPriceEur,
}));

/** Names for the positions, as the sales conversation says them out loud. */
export const SLOT_LABELS = ["Featured", "Top", "Prime", "Standard", "Basic"] as const;
