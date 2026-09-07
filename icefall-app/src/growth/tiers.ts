/**
 * ICEFALL plans.
 *
 * ICEFALL has NO payment processor. Every price here is what a plan WILL cost
 * when subscriptions go live; nothing is charged, no card is collected, and no
 * surface built on this module may imply otherwise. That is a commercial
 * honesty requirement, not a placeholder to be filled in later with a checkout.
 *
 * The derived figures — the annual monthly-equivalent and the saving — are
 * COMPUTED from the prices. Hard-coding "€9.99" and "33%" is how marketing copy
 * silently becomes false the first time someone edits a price.
 */

/**
 * TWO TIERS, NOT THREE — the owner, 2026-09-06: "9.99 is our only
 * subscription".
 *
 * There used to be `elite` ("Expedition", €29 / month) above `pro` (€15). Both
 * are gone: there is one paid plan now and it costs €9.99 a month. Every
 * feature that was Expedition-only moved onto the paid plan rather than being
 * dropped — collapsing the ladder must not quietly take a feature away from
 * somebody, and nothing here was ever charged for in the first place.
 *
 * NO ANNUAL PRICE. "One subscription" means one price; `derive` returns nulls
 * for the equivalent and the saving, and the pricing screen prints neither
 * rather than a computed discount on a plan that has no annual option.
 */
export type TierId = "free" | "pro";

export interface Plan {
  id: TierId;
  name: string;
  tagline: string;
  monthlyEur: number | null;
  annualEur: number | null;
  /** Annual ÷ 12. Null when the plan has no annual price. */
  annualMonthlyEquivalent: number | null;
  /** Percent saved by paying annually rather than monthly. */
  annualSavingPct: number | null;
  recommended?: boolean;
}

/** Trial length in days. One place, so copy and the clock cannot disagree. */
export const TRIAL_DAYS = 14;

/** Free-tier AI coach allowance. Enforced in AppState, not decorative. */
export const FREE_COACH_INTERACTIONS_PER_MONTH = 3;

function derive(monthly: number | null, annual: number | null) {
  if (monthly === null || annual === null || monthly <= 0) {
    return { annualMonthlyEquivalent: null, annualSavingPct: null };
  }
  const equivalent = annual / 12;
  return {
    annualMonthlyEquivalent: Math.round(equivalent * 100) / 100,
    annualSavingPct: Math.round((1 - equivalent / monthly) * 100),
  };
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Base",
    tagline: "For getting started.",
    monthlyEur: 0,
    annualEur: null,
    ...derive(null, null),
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Everything ICEFALL does.",
    monthlyEur: 9.99,
    annualEur: null,
    ...derive(9.99, null),
    recommended: true,
  },
];

export function planFor(id: TierId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown tier: ${id}`);
  return plan;
}

export type FeatureId = string;

export interface Feature {
  id: FeatureId;
  label: string;
  detail?: string;
  group: string;
  tiers: TierId[];
  /**
   * The feature does not exist in this codebase. It is shown so the tier reads
   * honestly, and must never be presented as included.
   */
  comingSoon?: boolean;
  /**
   * The feature EXISTS and is BUILT, is intended to be paid, and is not
   * actually withheld from anyone yet — no code path gates it.
   *
   * These three states are different and the table has to tell them apart. A
   * plain Minus against Free claimed ICEFALL withholds something it does not,
   * under a caption promising the table describes the app "today"; `comingSoon`
   * would have been just as wrong in the other direction, since these features
   * do work. `hasFeature` therefore returns TRUE for them on every tier, which
   * is the truth until a gate is written.
   *
   * When billing and the gates land, delete the flag — do not delete the row.
   */
  notYetEnforced?: boolean;
}

/**
 * Every entry below was checked against what this codebase actually does.
 *
 * Deliberately ABSENT: human expert review. It appeared in the product brief
 * for the old Expedition tier, but there is no coach, no reviewer and no
 * process behind it. Listing it — even as "coming soon" — against a paid plan
 * would be selling a person who does not exist. That holds at €9.99 exactly as
 * it held at €29.
 */
export const FEATURES: Feature[] = [
  // ---- Objective -----------------------------------------------------------
  {
    id: "objective.one",
    label: "One mountain objective",
    group: "Your objective",
    tiers: ["free", "pro"],
  },
  {
    id: "objective.readiness",
    label: "Mountain Readiness score",
    group: "Your objective",
    tiers: ["free", "pro"],
  },
  {
    id: "objective.profile",
    label: "Performance profile",
    group: "Your objective",
    tiers: ["free", "pro"],
  },
  {
    id: "objective.countdown",
    label: "Summit countdown",
    group: "Your objective",
    tiers: ["free", "pro"],
  },
  {
    id: "objective.multiple",
    notYetEnforced: true,
    label: "Multiple objectives",
    detail: "Train toward a primary and secondary mountain.",
    group: "Your objective",
    tiers: ["pro"],
  },

  // ---- Training ------------------------------------------------------------
  {
    id: "training.preview",
    label: "7-day training preview",
    group: "Training",
    tiers: ["free", "pro"],
  },
  {
    id: "training.full",
    notYetEnforced: true,
    label: "Full personalised plan",
    detail: "Built backwards from your summit date.",
    group: "Training",
    tiers: ["pro"],
  },
  {
    id: "training.adaptive",
    notYetEnforced: true,
    label: "Adaptive schedule",
    detail: "Sessions adjust to what you actually record.",
    group: "Training",
    tiers: ["pro"],
  },
  {
    id: "training.session",
    notYetEnforced: true,
    label: "Full session detail",
    detail: "Warm-up, main set and cool-down, with substitutions.",
    group: "Training",
    tiers: ["pro"],
  },

  // ---- Coach ---------------------------------------------------------------
  {
    id: "coach.limited",
    label: `Coach — ${FREE_COACH_INTERACTIONS_PER_MONTH} conversations a month`,
    group: "Coach",
    tiers: ["free"],
  },
  { id: "coach.unlimited", label: "Coach — unlimited", group: "Coach", tiers: ["pro"] },
  {
    id: "coach.adapt",
    notYetEnforced: true,
    label: "Session adjustments",
    detail: "Shorten, swap equipment, or ease off when you're tired.",
    group: "Coach",
    tiers: ["pro"],
  },

  // ---- Data ----------------------------------------------------------------
  {
    id: "data.tracking",
    label: "Activity tracking",
    detail: "GPS and Bluetooth heart-rate straps.",
    group: "Data",
    tiers: ["free", "pro"],
  },
  {
    id: "data.progress",
    label: "Progress tracking",
    group: "Data",
    tiers: ["free", "pro"],
  },
  {
    id: "data.analytics",
    label: "Advanced analytics",
    detail: "Training load, trends and benchmarks.",
    group: "Data",
    tiers: ["pro"],
  },
  {
    id: "data.recovery",
    notYetEnforced: true,
    label: "Recovery analysis",
    group: "Data",
    tiers: ["pro"],
  },

  // ---- Conditions ----------------------------------------------------------
  // Both entries describe what src/screens/mountain/Conditions.tsx actually
  // renders today against a live forecast. Listed here rather than gated on an
  // unrelated id, because a paid plan should say what it grants — and because a
  // gate borrowed from "Advanced analytics" would silently change the moment
  // somebody edited that row.
  {
    id: "conditions.current",
    label: "Current mountain conditions",
    detail: "Summit temperature, wind, visibility, precipitation and freezing level, plus today.",
    group: "Conditions",
    tiers: ["free", "pro"],
  },
  {
    id: "conditions.detail",
    label: "Elevation breakdown and extended forecast",
    detail: "Conditions modelled per elevation band, seven days, and your expedition window.",
    group: "Conditions",
    tiers: ["pro"],
  },

  // ---- Fuelling ------------------------------------------------------------
  {
    id: "fuel.basic",
    label: "Basic nutrition guidance",
    group: "Fuelling",
    tiers: ["free", "pro"],
  },
  {
    id: "fuel.full",
    notYetEnforced: true,
    label: "Training-day fuelling",
    detail: "Before, during and after, scaled to the session.",
    group: "Fuelling",
    tiers: ["pro"],
  },

  // ---- Equipment -----------------------------------------------------------
  // All four are built and working (src/services/checklist.ts and the checklist
  // screen). Nothing here is aspirational — see the `comingSoon` block below
  // for the things that are.
  {
    id: "equipment.checklist",
    label: "Equipment checklist",
    detail: "The essentials for your objective, with what you have and what you still need.",
    group: "Equipment",
    tiers: ["free", "pro"],
  },
  {
    id: "equipment.checklist.full",
    label: "Full mountain-specific kit list",
    detail: "Altitude, glacier and expedition items derived from the peak itself.",
    group: "Equipment",
    tiers: ["pro"],
  },
  {
    id: "equipment.pack",
    label: "Pack weight planner",
    detail: "Itemised weights split into base, consumables and water.",
    group: "Equipment",
    tiers: ["pro"],
  },
  {
    id: "equipment.documents",
    label: "Permits, insurance and documents",
    group: "Equipment",
    tiers: ["pro"],
  },

  // ---- Expedition — NONE of this is built ----------------------------------
  {
    id: "exp.planning",
    label: "Expedition planning",
    group: "Expedition",
    tiers: ["pro"],
    comingSoon: true,
  },
  {
    id: "exp.acclimatisation",
    label: "Acclimatisation planning",
    group: "Expedition",
    tiers: ["pro"],
    comingSoon: true,
  },
  {
    id: "exp.weather",
    label: "Weather integration",
    group: "Expedition",
    tiers: ["pro"],
    comingSoon: true,
  },
  {
    id: "exp.route",
    label: "Route and GPX analysis",
    group: "Expedition",
    tiers: ["pro"],
    comingSoon: true,
  },
  {
    id: "exp.mode",
    label: "Expedition mode",
    group: "Expedition",
    tiers: ["pro"],
    comingSoon: true,
  },
];

/**
 * Whether a tier includes a feature.
 *
 * A `comingSoon` feature returns FALSE however high the tier — it does not
 * exist, so nobody can have it. The pricing table shows it separately.
 */
export function hasFeature(tier: TierId, id: FeatureId): boolean {
  const feature = FEATURES.find((f) => f.id === id);
  if (!feature || feature.comingSoon) return false;
  // Built, intended to be paid, but gated by nothing — so everyone has it.
  // Reporting false here would have the app claim to withhold something the
  // athlete can plainly use.
  if (feature.notYetEnforced) return true;
  return feature.tiers.includes(tier);
}

export function featuresForGroup(group: string): Feature[] {
  return FEATURES.filter((f) => f.group === group);
}

export const FEATURE_GROUPS = [...new Set(FEATURES.map((f) => f.group))];

/** Shown on every pricing surface. Not a footnote — a statement. */
export const BILLING_NOTICE =
  "Billing is not connected yet. No payment method is taken, nothing is charged, and the prices here are what each plan will cost when subscriptions go live.";

export function fmtEur(amount: number): string {
  return amount === 0 ? "€0" : `€${amount.toFixed(2).replace(/\.00$/, "")}`;
}
