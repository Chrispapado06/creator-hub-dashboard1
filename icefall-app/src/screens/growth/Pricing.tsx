import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, Circle, Minus } from "lucide-react";
import { Badge, Button, AzureNotice } from "@/components/ui/primitives";
import { Rise, Stagger } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import {
  BILLING_NOTICE,
  FEATURES,
  FEATURE_GROUPS,
  PLANS,
  TRIAL_DAYS,
  fmtEur,
  hasFeature,
  planFor,
  type Feature,
  type FeatureId,
  type Plan,
  type TierId,
} from "@/growth/tiers";

/**
 * The plans.
 *
 * READ THIS BEFORE EDITING. ICEFALL has no payment processor — not "not yet
 * configured", none at all. That single fact decides this screen, and none of
 * the following is negotiable:
 *
 *   - THERE IS NO CARD FORM, NO CHECKOUT, AND NO CONTROL THAT IMPLIES ONE.
 *     Nothing here takes a card number, a billing address or a payment method,
 *     and no button may be added that looks like it does. If billing ever
 *     lands, a processor's own hosted sheet collects those fields — never this
 *     file.
 *   - THE TERMS ARE STATED BEFORE THE PLANS, AT A SIZE THAT CAN BE READ. Trial
 *     length, the price after it, the billing period and cancellation sit above
 *     the cards, in body type. Burying them in grey 10px text under the fold is
 *     precisely how people get misled on pricing screens, so it is not done
 *     here.
 *   - NOTHING IMPLIES A CHARGE. No renewal date, no "cancel before Friday", no
 *     countdown, no scarcity, no "N people upgraded today". None of it would be
 *     true, and a false deadline is pressure whether or not the money is real.
 *   - EVERY NUMBER IS COMPUTED FROM `@/growth/tiers`. The annual monthly
 *     equivalent and the saving are derived, never typed in — hard-coded
 *     marketing figures are how copy silently becomes false the first time
 *     someone edits a price.
 *   - A FEATURE THAT DOES NOT EXIST IS MARKED COMING SOON AND COUNTED AS NOT
 *     INCLUDED. `hasFeature` already returns false for those; the table shows
 *     them distinctly rather than letting a tick imply they ship today.
 *
 * See src/screens/auth/Trial.tsx for the trial offer itself — the disclosure
 * conventions on both screens are deliberately identical.
 */

type Period = "monthly" | "annual";

/** The trial opens Pro, so Pro is what the terms panel quotes. */
const PRO = planFor("pro");

// Widened deliberately: TRIAL_DAYS is exported as a literal type, so comparing
// it against anything else is a compile error even though it is configuration
// that could reasonably change.
const trialDays: number = TRIAL_DAYS;
const TRIAL_LENGTH = `${trialDays} ${trialDays === 1 ? "day" : "days"}`;

const TIER_ORDER: TierId[] = ["free", "pro", "elite"];

/**
 * What a tier adds over the one below it, counting only what is BUILT.
 *
 * Derived rather than written out, because a hand-maintained "what's new in
 * Pro" list is a list that keeps promising a feature after it moves tiers or
 * gets cut. `comingSoon` entries are excluded here on purpose — they are shown
 * in the comparison table, marked as unavailable, and never as a selling point.
 */
function builtAdditions(tier: TierId): Feature[] {
  const index = TIER_ORDER.indexOf(tier);
  const below = index > 0 ? TIER_ORDER[index - 1] : null;
  return FEATURES.filter(
    (f) => !f.comingSoon && f.tiers.includes(tier) && (below === null || !f.tiers.includes(below)),
  );
}

const ADDITIONS: Record<TierId, Feature[]> = {
  free: builtAdditions("free"),
  pro: builtAdditions("pro"),
  elite: builtAdditions("elite"),
};

/** Everything listed against a tier that has not been built. */
function comingSoonFor(tier: TierId): Feature[] {
  return FEATURES.filter((f) => f.comingSoon === true && f.tiers.includes(tier));
}

/** A card lists a few lines; the table below carries the full comparison. */
const MAX_CARD_FEATURES = 5;

/** The name of the tier below this one, for "everything in X, plus". */
function tierBelowName(tier: TierId): string | null {
  const index = TIER_ORDER.indexOf(tier);
  return index > 0 ? planFor(TIER_ORDER[index - 1]).name : null;
}

/* -------------------------------------------------------------------------- */
/* Prices — every figure below comes out of the plan table                    */
/* -------------------------------------------------------------------------- */

interface PriceCopy {
  /** The large figure. */
  amount: string;
  /** What the figure is per. */
  unit: string;
  /** The other billing period, stated so both are always visible. */
  alternative: string | null;
}

function priceCopy(plan: Plan, period: Period): PriceCopy {
  const { monthlyEur, annualEur, annualMonthlyEquivalent, annualSavingPct } = plan;

  // Free has no annual price and never will — it costs nothing either way, and
  // an empty "annual" column would read as missing data rather than as free.
  if (monthlyEur === 0) {
    return { amount: fmtEur(0), unit: "always", alternative: "Free, with no time limit." };
  }

  if (period === "annual" && annualEur !== null) {
    const equivalent =
      annualMonthlyEquivalent !== null ? `${fmtEur(annualMonthlyEquivalent)} a month` : null;
    const saving = annualSavingPct !== null ? `${annualSavingPct}% less than paying monthly` : null;
    const monthly =
      monthlyEur !== null ? `${fmtEur(monthlyEur)} a month if you pay monthly.` : null;

    return {
      amount: fmtEur(annualEur),
      unit: "per year",
      alternative: [[equivalent, saving].filter(Boolean).join(" — "), monthly]
        .filter(Boolean)
        .join(". "),
    };
  }

  if (monthlyEur === null) {
    // No price recorded. Say so rather than printing a plausible one.
    return { amount: "—", unit: "price not set", alternative: null };
  }

  const annual =
    annualEur !== null && annualMonthlyEquivalent !== null && annualSavingPct !== null
      ? `Or ${fmtEur(annualEur)} a year — ${fmtEur(annualMonthlyEquivalent)} a month, ${annualSavingPct}% less.`
      : null;

  return { amount: fmtEur(monthlyEur), unit: "per month", alternative: annual };
}

/** The largest annual saving on offer. Computed, so it cannot overstate. */
const MAX_ANNUAL_SAVING = Math.max(0, ...PLANS.map((p) => p.annualSavingPct ?? 0));

/* -------------------------------------------------------------------------- */
/* Terms — length, price, period, cancellation. Above the plans, in body type. */
/* -------------------------------------------------------------------------- */

function Terms({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="overflow-hidden rounded-tile border border-hairline">
      {rows.map(([label, value], i) => (
        <div
          key={label}
          className={cn(
            "flex items-baseline justify-between gap-4 bg-elevated/40 px-4 py-3",
            i > 0 && "border-t border-hairline",
          )}
        >
          <dt className="text-[12px] text-mist-dim">{label}</dt>
          <dd className="tnum text-right text-[13px] text-snow">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The commercial disclosure, built as a panel rather than a footnote.
 *
 * It sits above the plan cards because someone who reads no further than the
 * prices must still have read this.
 */

/* -------------------------------------------------------------------------- */
/* Billing period switch                                                      */
/* -------------------------------------------------------------------------- */

function PeriodSwitch({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="grid grid-cols-2 rounded-tile border border-hairline p-1">
      <button
        type="button"
        aria-pressed={value === "monthly"}
        onClick={() => onChange("monthly")}
        className={cn(
          "rounded-[calc(var(--radius-tile,10px)-3px)] py-2.5 text-center text-[13px] transition-colors",
          value === "monthly" ? "bg-white/[0.07] text-snow" : "text-mist-dim hover:text-mist",
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        aria-pressed={value === "annual"}
        onClick={() => onChange("annual")}
        className={cn(
          "flex items-center justify-center gap-2 rounded-[calc(var(--radius-tile,10px)-3px)] py-2.5 text-[13px] transition-colors",
          value === "annual" ? "bg-white/[0.07] text-snow" : "text-mist-dim hover:text-mist",
        )}
      >
        Yearly
        {MAX_ANNUAL_SAVING > 0 && (
          <span className="tnum rounded-full bg-azure/15 px-1.5 py-0.5 text-[10px] font-medium text-azure">
            Save {MAX_ANNUAL_SAVING}%
          </span>
        )}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Compact plan column — the mock-up's three-across cards                      */
/* -------------------------------------------------------------------------- */

/**
 * The short per-card checklist. Every line resolves through `hasFeature`, so a
 * tick means the tier really includes it and a dash means it does not — no
 * hand-kept list that keeps promising a feature after it moves or gets cut.
 * These are the ENFORCED differences (plus two universal lines), which is why
 * Free greys the ones it doesn't have.
 */
/**
 * A peak per tier, ascending in seriousness — a modest summit for Base, the
 * Matterhorn for Pro, Everest for Expedition. Decorative, and drawn from the
 * app's own photography rather than a flat icon.
 */
const PLAN_IMG: Record<TierId, string> = {
  free: "/img/mount-olympus.jpg",
  pro: "/img/matterhorn.jpg",
  elite: "/img/everest.jpg",
};

const CARD_LINES: { id: FeatureId; label: string }[] = [
  { id: "objective.readiness", label: "Readiness score" },
  { id: "data.progress", label: "Progress tracking" },
  { id: "coach.unlimited", label: "Unlimited Coach" },
  { id: "data.analytics", label: "Advanced analytics" },
  { id: "conditions.detail", label: "Extended forecast" },
  { id: "equipment.checklist.full", label: "Full kit list" },
  { id: "equipment.pack", label: "Pack planner" },
  { id: "equipment.documents", label: "Permits & docs" },
];

function PlanColumn({
  plan,
  period,
  current,
  trialing,
  cta,
}: {
  plan: Plan;
  period: Period;
  current: boolean;
  trialing: boolean;
  cta: React.ReactNode;
}) {
  const price = priceCopy(plan, period);
  const primary = plan.recommended === true;
  const soon = comingSoonFor(plan.id);

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-card border p-3",
        primary ? "border-azure/45 bg-graphite" : "border-hairline bg-graphite/50",
      )}
    >
      {primary && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-azure px-2 py-0.5 text-[8px] font-semibold tracking-[0.08em] text-obsidian">
          MOST POPULAR
        </span>
      )}

      <p className="section-label text-[9px]">{plan.name}</p>
      <p className="tnum mt-1.5 text-[19px] font-light leading-none text-snow">{price.amount}</p>
      <p className="mt-1 text-[9.5px] leading-tight text-mist-dim">{price.unit}</p>
      <p className="mt-1.5 min-h-[26px] text-[9.5px] leading-tight text-mist">{plan.tagline}</p>

      <span
        className={cn(
          "mx-auto my-3 block h-12 w-12 overflow-hidden rounded-full border",
          primary ? "border-azure/50 ring-1 ring-azure/25" : "border-hairline",
        )}
      >
        <img src={PLAN_IMG[plan.id]} alt="" aria-hidden className="h-full w-full object-cover" />
      </span>

      <ul className="flex-1 space-y-1.5">
        {CARD_LINES.map((line) => {
          const on = hasFeature(plan.id, line.id);
          return (
            <li key={line.id} className="flex items-start gap-1.5">
              {on ? (
                <Check size={11} strokeWidth={2.4} className="mt-[1px] shrink-0 text-azure" aria-hidden />
              ) : (
                <Minus size={11} strokeWidth={1.8} className="mt-[1px] shrink-0 text-mist-dim/40" aria-hidden />
              )}
              <span className={cn("text-[10px] leading-tight", on ? "text-snow" : "text-mist-dim/50")}>
                {line.label}
              </span>
            </li>
          );
        })}
      </ul>

      {plan.id === "elite" && soon.length > 0 && (
        <p className="mt-2 border-l border-azure/25 pl-2 text-[9px] leading-tight text-mist-dim">
          + {soon.length} expedition features, coming soon
        </p>
      )}

      {current && (
        <p className="mt-2 text-center text-[9px] text-azure/80">{trialing ? "Your trial" : "Your plan"}</p>
      )}

      <div className="mt-3">{cta}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Plan card                                                                  */
/* -------------------------------------------------------------------------- */

function PlanCard({
  plan,
  period,
  current,
  trialing,
  cta,
}: {
  plan: Plan;
  period: Period;
  /** True when this is the tier in force today. */
  current: boolean;
  /** True when the tier is held because a trial is running, not because it was bought. */
  trialing: boolean;
  cta?: React.ReactNode;
}) {
  const price = priceCopy(plan, period);
  const additions = ADDITIONS[plan.id];
  const soon = comingSoonFor(plan.id);
  const below = tierBelowName(plan.id);
  const primary = plan.recommended === true;

  const shown = additions.slice(0, MAX_CARD_FEATURES);
  const remaining = additions.length - shown.length;

  return (
    <div
      className={cn(
        "rounded-card border p-5",
        primary ? "border-azure/35 bg-graphite" : "border-hairline bg-graphite/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[15px] font-medium text-snow">{plan.name}</h2>
        {primary && <Badge tone="azure">Best value</Badge>}
        {current && <Badge tone="neutral">{trialing ? "Your trial" : "Your plan"}</Badge>}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-mist">{plan.tagline}</p>

      <div className="mt-5 flex items-baseline gap-2">
        <span className="tnum display text-[34px] leading-none text-snow">{price.amount}</span>
        <span className="text-[13px] text-mist">{price.unit}</span>
      </div>
      {price.alternative && (
        <p className="tnum mt-2 text-[11px] leading-relaxed text-mist-dim">{price.alternative}</p>
      )}

      <div className="mt-5 border-t border-hairline pt-4">
        <p className="section-label">
          {additions.length === 0 && below
            ? `Everything in ${below}`
            : below
              ? `Everything in ${below}, plus`
              : "Included"}
        </p>

        {additions.length > 0 && (
          <ul className="mt-3 space-y-2.5">
            {shown.map((f) => (
              <li key={f.id} className="flex gap-2.5">
                <span
                  className="mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border border-azure/50 text-azure"
                  aria-hidden
                >
                  <Check size={8} strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] leading-snug text-snow">{f.label}</span>
                  {f.detail && (
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-mist-dim">
                      {f.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {remaining > 0 && (
          <p className="tnum mt-3 text-[11px] leading-relaxed text-mist-dim">
            And {remaining} more, listed in the comparison below.
          </p>
        )}

        {/* The honest reading of the Elite tier today: everything that would
            distinguish it from Pro is unbuilt. Saying so on the card — not only
            in the table — is the difference between a plan and a promise. */}
        {additions.length === 0 && soon.length > 0 && (
          <p className="tnum mt-3 border-l border-azure/30 pl-3 text-[11px] leading-relaxed text-mist">
            Nothing beyond {below} is built yet. The {soon.length} expedition features listed for
            this plan are marked coming soon in the comparison below, and are not included at any
            price today.
          </p>
        )}
      </div>

      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Comparison table                                                           */
/* -------------------------------------------------------------------------- */

function Cell({ feature, tier }: { feature: Feature; tier: TierId }) {
  // Checked before `hasFeature` for clarity, though `hasFeature` also returns
  // false for anything unbuilt: a coming-soon feature is NOT included, and a
  // tick here would be the single most misleading pixel on the screen.
  if (feature.comingSoon && feature.tiers.includes(tier)) {
    return (
      <span className="inline-flex text-mist-dim" title="Coming soon — not included">
        <Circle size={11} strokeWidth={1.6} aria-hidden />
        <span className="sr-only">Coming soon, not included</span>
      </span>
    );
  }

  // Built and working, but nothing gates it yet — so it is available on every
  // tier including this one. Ticked, because the athlete really does have it,
  // and annotated, because it is not free forever.
  if (feature.notYetEnforced && !feature.tiers.includes(tier)) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-azure/70"
        title="Available to everyone while billing is not connected. Planned as a paid feature."
      >
        <Check size={13} strokeWidth={2.2} aria-hidden />
        <span aria-hidden className="text-[9px] leading-none">
          *
        </span>
        <span className="sr-only">
          Currently available on this plan; planned as a paid feature once billing is connected
        </span>
      </span>
    );
  }

  if (hasFeature(tier, feature.id)) {
    return (
      <span className="inline-flex text-azure">
        <Check size={13} strokeWidth={2.2} aria-hidden />
        <span className="sr-only">Included</span>
      </span>
    );
  }

  return (
    <span className="inline-flex text-mist-dim/60">
      <Minus size={12} strokeWidth={1.6} aria-hidden />
      <span className="sr-only">Not included</span>
    </span>
  );
}

function ComparisonTable() {
  return (
    <div className="overflow-hidden rounded-card border border-hairline">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">What each ICEFALL plan includes</caption>
        <thead>
          <tr className="border-b border-hairline bg-elevated/40">
            <th scope="col" className="section-label px-3.5 py-3 font-medium">
              Feature
            </th>
            {PLANS.map((p) => (
              <th
                key={p.id}
                scope="col"
                className="section-label w-[46px] px-1 py-3 text-center font-medium"
              >
                {/* The tier word alone — "ICEFALL Pro" will not fit a phone column. */}
                {p.name.replace("ICEFALL ", "")}
              </th>
            ))}
          </tr>
        </thead>

        {FEATURE_GROUPS.map((group) => {
          const rows = FEATURES.filter((f) => f.group === group);
          return (
            <tbody key={group}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={PLANS.length + 1}
                  className="section-label border-y border-hairline bg-white/[0.02] px-3.5 py-2.5 text-left font-medium text-mist"
                >
                  {group}
                </th>
              </tr>
              {rows.map((f) => (
                <tr key={f.id} className="border-t border-hairline">
                  <th scope="row" className="px-3.5 py-3 text-left font-normal">
                    <span
                      className={cn(
                        "block text-[12px] leading-snug",
                        f.comingSoon ? "text-mist" : "text-snow",
                      )}
                    >
                      {f.label}
                    </span>
                    {f.detail && (
                      <span className="mt-1 block text-[11px] leading-relaxed text-mist-dim">
                        {f.detail}
                      </span>
                    )}
                    {f.comingSoon && (
                      <span className="mt-1.5 inline-block">
                        <Badge tone="neutral">Coming soon</Badge>
                      </span>
                    )}
                  </th>
                  {PLANS.map((p) => (
                    <td key={p.id} className="px-1 py-3 text-center align-top">
                      <Cell feature={f} tier={p.id} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function Pricing() {
  const navigate = useNavigate();
  const { subscription, currentTier } = useApp();
  const [period, setPeriod] = useState<Period>("monthly");
  const [compare, setCompare] = useState(false);
  const [restore, setRestore] = useState(false);

  const trialing = subscription.status === "trialing";

  const priceAfterTrial =
    period === "annual" && PRO.annualEur !== null
      ? `${fmtEur(PRO.annualEur)} per year`
      : PRO.monthlyEur !== null
        ? `${fmtEur(PRO.monthlyEur)} per month`
        : "Price not set";

  function goBack() {
    // Reachable from anywhere in the app via UpgradePrompt, and also directly by
    // URL — in which case there is no history to step back through.
    if (window.history.length > 1) navigate(-1);
    else navigate("/home");
  }

  return (
    <div className="no-scrollbar relative h-full overflow-y-auto bg-obsidian">
      <div
        className="relative px-5 pb-24"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
      >
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:text-snow"
          >
            <ArrowLeft size={19} strokeWidth={1.6} />
          </button>
          <p className="section-label tracking-[0.28em] text-snow">ICEFALL</p>
          <button
            type="button"
            onClick={() => setRestore(true)}
            className="text-[12px] text-azure transition-colors hover:text-azure-bright"
          >
            Restore
          </button>
        </div>

        <Stagger>
          <Rise>
            <p className="section-label text-azure/85">Choose your plan</p>
            <h1 className="display mt-2 text-[30px] leading-[1.08] text-snow">
              Unlock your mountain potential.
            </h1>
            <p className="mt-3 text-[13px] leading-relaxed text-mist">
              Go further with advanced tools, intelligent coaching and the full ICEFALL system.
            </p>
            {restore && (
              <p className="mt-3 rounded-tile border border-hairline bg-elevated/40 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-mist">
                Nothing to restore — billing isn't connected yet, so no purchase has ever been made.
              </p>
            )}
            <p className="mt-4 text-[11.5px] leading-relaxed text-mist-dim">
              {TRIAL_LENGTH} free, then the price shown. Nothing is charged — billing isn't
              connected. Prices are what each plan will cost when subscriptions go live.
            </p>
          </Rise>

          {/* ---- Plans ------------------------------------------------------ */}
          <Rise className="mt-6">
            <PeriodSwitch value={period} onChange={setPeriod} />
          </Rise>

          <Rise className="mt-3">
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map((plan) => {
                const isCurrent = currentTier === plan.id;
                const cta = isCurrent ? (
                  <div className="rounded-tile border border-hairline py-2 text-center text-[10.5px] text-mist">
                    {trialing ? "Your trial" : "Current"}
                  </div>
                ) : plan.id === "pro" ? (
                  <Link
                    to="/trial"
                    className="block rounded-tile bg-azure py-2 text-center text-[10.5px] font-semibold text-obsidian transition-colors hover:bg-azure-bright"
                  >
                    Start trial
                  </Link>
                ) : plan.id === "free" ? (
                  <Link
                    to="/home"
                    className="block rounded-tile border border-hairline py-2 text-center text-[10.5px] text-snow transition-colors hover:border-hairline-strong"
                  >
                    Continue
                  </Link>
                ) : (
                  <Link
                    to="/trial"
                    className="block rounded-tile border border-hairline py-2 text-center text-[10.5px] text-snow transition-colors hover:border-hairline-strong"
                  >
                    Choose
                  </Link>
                );
                return (
                  <PlanColumn
                    key={plan.id}
                    plan={plan}
                    period={period}
                    current={isCurrent}
                    trialing={trialing && isCurrent}
                    cta={cta}
                  />
                );
              })}
            </div>
          </Rise>

          {/* ---- Compare all features (collapsible) ------------------------- */}
          <Rise className="mt-4">
            <button
              type="button"
              onClick={() => setCompare((v) => !v)}
              aria-expanded={compare}
              className="flex w-full items-center justify-between rounded-tile border border-hairline bg-elevated/40 px-4 py-3.5 transition-colors hover:border-hairline-strong"
            >
              <span className="text-[13px] text-snow">Compare all features</span>
              <ChevronRight
                size={16}
                strokeWidth={1.8}
                className={cn("text-mist transition-transform", compare && "rotate-90")}
              />
            </button>
            {compare && (
              <div className="mt-4">
                <p className="mb-4 text-[11.5px] leading-relaxed text-mist">
                  A tick means the feature works in ICEFALL today. A ticked asterisk means it is
                  built and every plan can use it right now, planned to become paid once billing is
                  connected — nothing is withheld today. Anything marked coming soon is not built and
                  is not included at any price.
                </p>
                <ComparisonTable />
              </div>
            )}
          </Rise>

          {/* ---- Terms + billing, kept honest and legible ------------------ */}
          <Rise className="mt-6">
            <AzureNotice title="Billing is not connected">
        <p>{BILLING_NOTICE}</p>
        <p>
          No card is requested anywhere in ICEFALL, nothing renews, and there is nothing to cancel.
        </p>
      </AzureNotice>
          </Rise>

          <Rise className="mt-5">
            <Terms
              rows={[
                ["Free trial", `${TRIAL_LENGTH}, free`],
                ["Plan the trial opens", PRO.name],
                [`${PRO.name} after the trial`, priceAfterTrial],
                ["Billing period", period === "annual" ? "Annual" : "Monthly"],
                ["Cancel", "Any time"],
                ["Payment method", "None taken"],
              ]}
            />
          </Rise>

          <Rise className="mt-6">
            <p className="text-[11px] leading-relaxed text-mist-dim">
              Nothing on this screen takes a payment. When subscriptions go live, the prices above
              are what each plan will cost, and this screen will say so plainly rather than change
              quietly.
            </p>
            <button
              type="button"
              onClick={goBack}
              className="section-label mt-6 w-full text-center text-mist transition-colors hover:text-snow"
            >
              Back to ICEFALL
            </button>
          </Rise>
        </Stagger>
      </div>
    </div>
  );
}
