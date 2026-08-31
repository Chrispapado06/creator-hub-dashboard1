/**
 * Featured slot pricing — the one formula behind every number.
 *
 *     monthly price = BASE × Visibility Index × Slot Weight × Tier Multiplier
 *
 * From Featured-Slot-Pricing-Framework v1.0, 30 August 2026. This module was
 * verified by regenerating all 613 prices published in that document's rate
 * card and comparing them cell by cell: ZERO mismatches. If you change anything
 * here, run that check again — `slotPricing.test.ts` does exactly that.
 *
 * MONEY IS INTEGER MINOR UNITS (cents), never a float. Rounding to the nearest
 * EUR 5 on a float is how a rate card starts disagreeing with an invoice.
 *
 * THIS IS A FLAT PLACEMENT FEE, NOT A COMMISSION. It is not tied to bookings
 * made, and nothing here should ever be presented beside a booking figure as
 * though the two were connected.
 */

export const BASE_EUR = 250;
export const GROWTH_EXPONENT = 0.65;

/**
 * Position weights. Mountains carry 5 slots, treks carry 3.
 *
 * The trek curve is deliberately flatter: with only three slots, position 3
 * still sits above the fold. In a five-slot list, positions 4 and 5 genuinely
 * are worth less and have to be priced so they can actually be sold.
 */
export const MOUNTAIN_SLOT_WEIGHTS = [1.0, 0.8, 0.64, 0.51, 0.41] as const;
export const TREK_SLOT_WEIGHTS = [1.0, 0.78, 0.6] as const;

export type ListingKind = "mountain" | "trek";

export interface Tier {
  n: number;
  label: string;
  minUsers: number;
  /** null on the top tier — it is open-ended. */
  maxUsers: number | null;
  /** The user count the multiplier is computed FROM. See the note below. */
  floorUsers: number;
  multiplier: number;
}

/**
 * MULTIPLIERS ARE COMPUTED AT THE FLOOR OF EACH BAND, so an operator only moves
 * up once the whole band is cleared — not gradually as users trickle in.
 *
 * Tier 1's floor is 1,000, not 0. `(0/1000)^0.65` is zero, which would price
 * every slot at nothing. 1,000 is the anchor the whole framework is built on:
 * BASE is "Everest Slot 1 at launch scale".
 */
export const TIERS: readonly Tier[] = [
  { n: 1, label: "Tier 1", minUsers: 0, maxUsers: 1_499, floorUsers: 1_000, multiplier: 1.0 },
  { n: 2, label: "Tier 2", minUsers: 1_500, maxUsers: 3_499, floorUsers: 1_500, multiplier: 1.3 },
  { n: 3, label: "Tier 3", minUsers: 3_500, maxUsers: 7_499, floorUsers: 3_500, multiplier: 2.25 },
  { n: 4, label: "Tier 4", minUsers: 7_500, maxUsers: 14_999, floorUsers: 7_500, multiplier: 3.7 },
  { n: 5, label: "Tier 5", minUsers: 15_000, maxUsers: 34_999, floorUsers: 15_000, multiplier: 5.8 },
  { n: 6, label: "Tier 6", minUsers: 35_000, maxUsers: 74_999, floorUsers: 35_000, multiplier: 10.1 },
  { n: 7, label: "Tier 7", minUsers: 75_000, maxUsers: null, floorUsers: 75_000, multiplier: 16.55 },
];

/**
 * TIERS ARE MEASURED ON MONTHLY ACTIVE USERS, NEVER REGISTERED ACCOUNTS.
 *
 * The framework is blunt about why: "Claiming 50,000 users when 4,000 open the
 * app is the kind of thing that ends a renewal conversation and travels fast in
 * a small industry." The parameter is named to make the wrong number awkward to
 * pass.
 */
export function tierForActiveUsers(monthlyActiveUsers: number): Tier {
  const u = Math.max(0, Math.floor(monthlyActiveUsers));
  return TIERS.find((t) => u >= t.minUsers && (t.maxUsers === null || u <= t.maxUsers)) ?? TIERS[0];
}

/** The published multiplier, or the raw curve for a hypothetical user count. */
export function rawMultiplier(users: number): number {
  return Math.pow(Math.max(users, 1) / 1000, GROWTH_EXPONENT);
}

/**
 * Round half to EVEN, which is what the published card actually does.
 *
 * Not a stylistic choice — it was derived. Everest Slot 5 at Tier 1 is exactly
 * EUR 102.50, and the document prints EUR 100. Ordinary half-up rounding gives
 * 105 and would disagree with the operator's own copy of the rate card on the
 * very first row of the very first table.
 */
function roundHalfEven(value: number, step: number): number {
  const q = value / step;
  const f = Math.floor(q);
  const r = q - f;
  const n = Math.abs(r - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.floor(q + 0.5);
  return n * step;
}

/** "Nearest EUR 5 above EUR 50, nearest EUR 1 below that." */
export function roundToCard(rawEur: number): number {
  return rawEur > 50 ? roundHalfEven(rawEur, 5) : roundHalfEven(rawEur, 1);
}

export function slotWeights(kind: ListingKind): readonly number[] {
  return kind === "mountain" ? MOUNTAIN_SLOT_WEIGHTS : TREK_SLOT_WEIGHTS;
}

export interface Quote {
  /** Integer minor units. Never a float — see the header. */
  monthlyCents: number;
  monthlyEur: number;
  kind: ListingKind;
  slot: number;
  index: number;
  slotWeight: number;
  tier: Tier;
  /** BASE × index × weight × multiplier, before rounding. For "show your working". */
  rawEur: number;
  /** Whether this listing is invoiced per slot at this tier, or bundled. */
  soldAs: "per-slot" | "bundle";
  /** The whole page sold out, at this tier. */
  pageTotalCents: number;
}

/**
 * THE BUNDLE RULE. A listing is sold per slot only when its LOWEST slot clears
 * EUR 12. Below that, a Slot 5 at EUR 6/month costs more in payment fees and
 * invoicing than it earns, and an operator guiding eight small peaks does not
 * want eight line items.
 *
 * Every listing still carries a full per-slot price — the rule decides how it is
 * INVOICED, not what it is worth. And because the threshold is checked against
 * the tier-adjusted price, listings graduate out of the bundle on their own as
 * the user base grows, with no manual repricing.
 */
export const BUNDLE_FLOOR_EUR = 12;

export function isSoldPerSlot(kind: ListingKind, index: number, tier: Tier): boolean {
  const w = slotWeights(kind);
  const lowest = BASE_EUR * index * w[w.length - 1] * tier.multiplier;
  return roundToCard(lowest) >= BUNDLE_FLOOR_EUR;
}

/**
 * The whole calculation, in one call.
 *
 * `slot` is 1-based, as everybody says it out loud. Out-of-range throws rather
 * than clamping: a request for Slot 4 on a trek is a bug in the caller, and
 * quietly returning the Slot 3 price would put a wrong number on an invoice.
 */
export function quoteSlot(args: {
  kind: ListingKind;
  index: number;
  slot: number;
  monthlyActiveUsers: number;
}): Quote {
  const { kind, index, slot, monthlyActiveUsers } = args;
  const weights = slotWeights(kind);
  if (!Number.isInteger(slot) || slot < 1 || slot > weights.length) {
    throw new RangeError(
      `Slot ${slot} does not exist on a ${kind}: there are ${weights.length}.`,
    );
  }
  const tier = tierForActiveUsers(monthlyActiveUsers);
  const slotWeight = weights[slot - 1];
  const rawEur = BASE_EUR * index * slotWeight * tier.multiplier;
  const monthlyEur = roundToCard(rawEur);

  const pageTotalEur = weights.reduce(
    (sum, w) => sum + roundToCard(BASE_EUR * index * w * tier.multiplier),
    0,
  );

  return {
    monthlyCents: Math.round(monthlyEur * 100),
    monthlyEur,
    kind,
    slot,
    index,
    slotWeight,
    tier,
    rawEur,
    soldAs: isSoldPerSlot(kind, index, tier) ? "per-slot" : "bundle",
    pageTotalCents: Math.round(pageTotalEur * 100),
  };
}

/** Every slot on one listing, for showing a whole page at once. */
export function quotePage(args: {
  kind: ListingKind;
  index: number;
  monthlyActiveUsers: number;
}): Quote[] {
  return slotWeights(args.kind).map((_, i) =>
    quoteSlot({ ...args, slot: i + 1 }),
  );
}

/** Tier 1 bundle packages. These scale on the same multipliers as everything else. */
export const BUNDLE_PACKAGES = [
  { name: "Regional Starter", coverage: "Up to 3 bundle listings", tier1Eur: 45 },
  { name: "Regional Standard", coverage: "Up to 8 bundle listings", tier1Eur: 90 },
  { name: "Regional Unlimited", coverage: "All bundle listings in one region", tier1Eur: 150 },
] as const;

export function bundlePriceEur(tier1Eur: number, tier: Tier): number {
  return roundToCard(tier1Eur * tier.multiplier);
}
