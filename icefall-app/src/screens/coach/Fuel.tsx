import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  Droplets,
  MoreVertical,
  SlidersHorizontal,
  Timer,
  Utensils,
  UtensilsCrossed,
} from "lucide-react";

import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { useCoachPlanSummary } from "@/coach/planSummary";
import { useCoachIntel } from "@/coach/hooks";
import {
  dailyEnergyFor,
  stillToCover,
  type DailyEnergy,
  type RecordedSessionInput,
} from "@/coach/fuelDay";
import { estimateFromEntry, fuellingFor, type FuellingPlan } from "@/coach/nutrition";
import { isoDate } from "@/data/mock/clock";
import { cn } from "@/lib/utils";
import { useFuelLocal } from "@/screens/Nutrition";
import { useObjective } from "@/screens/coach/shell";
import { useSettings } from "@/settings/store";
import { useApp } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";

/**
 * COACH — FUEL, rebuilt to `docs/design/coach-1to1-spec.md` Part B5 and the
 * brief's "Fuel" section (16 Sep 2026).
 *
 * STRUCTURE, TOP TO BOTTOM, MATCHES THE MOCKUP: a slim "‹ Coach / Fuel / ⋮"
 * top bar, the non-editable context line (§4.2 rule 3 — the objective chip
 * lives on the hub ONLY, so this line is text, never a link), the "Today's
 * fuel" card (training-day badge + the range + subline), then EITHER the
 * empty state OR the logged state with a horizontal band — never both, and
 * never a card the athlete cannot act on — then "Why this range?", then the
 * existing Performance / Maintenance / Recovery selector kept verbatim (the
 * brief's own instruction), then the real guidance and food log ICEFALL
 * already computes, which the mockup's crop does not show but nothing asked
 * to remove either.
 *
 * EVERY COLOUR IS A REAL TOKEN. `bg-graphite` / `bg-slate` / `border-hairline*`
 * / `text-snow` / `text-mist*` / `bg-azure` / `text-azure*` / `bg-summit` —
 * the same set `ObjectiveSheet.tsx` and `AboutCoachSheet.tsx` already use.
 * Nothing here is a hex literal, and nothing is dark-only: every one of these
 * resolves correctly in both themes (`index.css`).
 *
 * THE RANGE IS NEVER A SINGLE NUMBER WITH A "+" — brief §4 rule 5. Two states
 * only, both built: `band` present renders "{low} – {high} kcal" as prose;
 * `band` absent renders the honest reason instead of a number.
 *
 * TONE: no red "over" state exists anywhere on this screen because
 * `coach/fuelDay.ts`'s own `StillToCover` type has no variant to render one
 * (see its comment — "no numeric field that can hold a negative"). Once the
 * floor is met the copy says "within range", never a guilt line about a
 * ceiling ICEFALL never set.
 *
 * WHAT THE DRAWING DOES NOT SHOW, KEPT ANYWAY: the fuelling guidance
 * (Before/During/After), the target selector's own macro breakdown per meal
 * (still on `/coach/nutrition`, where it always lived) and today's logged
 * meals. These are real, already-computed data with nowhere else in the app
 * to live — removing them would delete working features the brief never
 * asked to cut. The daily macro-total tiles the OLD version of this screen
 * drew ARE dropped: they leaned on "peach"/"lavender" tints that have no
 * entry in the brief's colour table, and per-item macros already show on the
 * food log at `/coach/nutrition`, so nothing is actually lost.
 *
 * Every figure below is computed exactly as `/coach/nutrition` computes it —
 * see that screen's inputs for where `fuel.sexForEnergy`, `dailyMovement` etc.
 * come from. This screen adds no engine of its own.
 */

/* -------------------------------------------------------------------------- */
/* The target                                                                  */
/* -------------------------------------------------------------------------- */

type FuelTarget = "performance" | "maintenance" | "recovery";

const TARGETS: Record<
  FuelTarget,
  { label: string; sub: string; heading: string; description: string; emphasis: string }
> = {
  performance: {
    label: "Performance",
    sub: "Energy-dense fuel",
    heading: "Performance and mountain preparation",
    description:
      "Higher energy availability to sustain uphill endurance, protect lean mass, and support recovery between sessions.",
    emphasis: "Higher energy for training",
  },
  maintenance: {
    label: "Maintenance",
    sub: "Balanced everyday",
    heading: "Maintenance",
    description:
      "Balanced everyday eating that keeps training sustainable, with intake following the day's work rather than pushing it up or down.",
    emphasis: "Balanced everyday",
  },
  recovery: {
    label: "Recovery",
    sub: "Protein + carbs",
    heading: "Recovery",
    description:
      "Protein and carbohydrate close to each session to repair and refill, with the rest of the day kept steady.",
    emphasis: "Protein and carbs after sessions",
  },
};

const TARGET_KEY = "icefall.fuel-target.v1";

/**
 * Under the `icefall.` prefix so "Erase all data" clears it with everything
 * else. Read once; a refused write (private mode) leaves the choice for the
 * session only, and the page says nothing false either way because the choice
 * never touches a number.
 */
function useFuelTarget(): [FuelTarget, (t: FuelTarget) => void] {
  const [target, setTarget] = useState<FuelTarget>(() => {
    try {
      const raw = localStorage.getItem(TARGET_KEY);
      return raw === "maintenance" || raw === "recovery" ? raw : "performance";
    } catch {
      return "performance";
    }
  });
  return [
    target,
    (t) => {
      setTarget(t);
      try {
        localStorage.setItem(TARGET_KEY, t);
      } catch {
        /* private mode — kept for this session only */
      }
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

const kcal = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 0 });

/**
 * What kind of day it is, from the PLAN — not from whether the engine could
 * cost the session. A technical session carries no distance, so the engine
 * excludes it from the range ("not-costable"); that is a fact about the
 * arithmetic, and it printed as "No session" on a day that plainly had one.
 * The plan decides the badge; the engine's reason, when there is one, is said
 * in the note under the range.
 */
function dayKindChip(
  energy: DailyEnergy,
  hasSession: boolean,
  restDay: boolean,
): { label: string; training: boolean } {
  if (energy.session.kind === "recorded") return { label: "Training day", training: true };
  if (restDay) return { label: "Rest day", training: false };
  if (hasSession) return { label: "Training day", training: true };
  return { label: "No session", training: false };
}

/* -------------------------------------------------------------------------- */
/* Small shared pieces — real tokens only                                     */
/* -------------------------------------------------------------------------- */

function Card({
  children,
  className,
  pad = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** false when the card owns its own padding (e.g. a divided list). */
  pad?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-card border border-hairline-strong bg-graphite",
        pad && "p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

function DayBadge({ training, label }: { training: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium",
        training ? "bg-summit/15 text-summit" : "border border-hairline-strong text-mist",
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

/**
 * The horizontal band, B5 §5 — a track spanning 0 → the range's high end, the
 * [low, high] zone tinted, and a single dot marking what was logged. Capped at
 * 100% rather than drawn past it: there is no "over" state to draw (see the
 * file header), so a total above the top of the range still reads as "at the
 * top", in the same azure, never a different colour.
 */
function FuelBand({ low, high, logged }: { low: number; high: number; logged: number }) {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const lowPct = high > 0 ? clamp((low / high) * 100) : 0;
  const markerPct = high > 0 ? clamp((logged / high) * 100) : 0;
  const lowLabelPct = Math.min(Math.max(lowPct, 6), 92);

  return (
    <div className="mt-4">
      <div className="relative h-3.5">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-slate">
          <div
            className="absolute inset-y-0 right-0 rounded-full bg-azure/25"
            style={{ left: `${lowPct}%` }}
            aria-hidden="true"
          />
        </div>
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-graphite bg-azure"
          style={{ left: `${markerPct}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] tnum text-mist-dim">
        <span
          className="absolute"
          style={{ left: `${lowLabelPct}%`, transform: "translateX(-50%)" }}
        >
          {kcal(low)}
        </span>
        <span className="absolute right-0">{kcal(high)}</span>
      </div>
    </div>
  );
}

/**
 * The top bar every Coach sub-page shares in the mockup: "‹ Coach" back to
 * the hub, the page's own centred title, a "⋮" overflow. Built local to this
 * screen rather than in `shell.tsx` — the hub, Chat and Plan agents are
 * touching that file concurrently today, and this bar has no state any other
 * screen needs to share.
 */
function FuelTopBar({ onMore }: { onMore: () => void }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center">
      <Link
        to="/coach"
        className="-ml-2 inline-flex h-11 items-center gap-0.5 justify-self-start rounded-full pl-2 pr-3 text-[15px] text-mist transition-colors hover:text-snow"
      >
        <ChevronLeft size={20} strokeWidth={1.7} aria-hidden="true" />
        Coach
      </Link>
      <h1 className="display justify-self-center text-[18px] text-snow">Fuel</h1>
      <button
        type="button"
        onClick={onMore}
        aria-label="Fuel options"
        className="-mr-2 grid h-11 w-11 shrink-0 place-items-center justify-self-end rounded-full text-mist transition-colors hover:text-snow"
      >
        <MoreVertical size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function Fuel() {
  const navigate = useNavigate();
  const { bodyMassKgSet } = useApp();
  const { settings } = useSettings();
  const { fuel } = useFuelLocal();
  const { today, briefing } = useCoachIntel();
  const recorded = useRecordedActivities();
  const [target, setTarget] = useFuelTarget();
  const { goal } = useObjective();
  const planSummary = useCoachPlanSummary();
  const [moreOpen, setMoreOpen] = useState(false);
  const tipsRef = useRef<HTMLDivElement | null>(null);

  const todayKey = isoDate(new Date());

  const recordedToday = useMemo<RecordedSessionInput[]>(
    () =>
      recorded
        .filter((a) => !a.simulated && isoDate(new Date(a.startedAt)) === todayKey)
        .map((a) => ({ kcal: a.calories, movingSec: a.movingSec, forKg: a.caloriesForKg ?? null })),
    [recorded, todayKey],
  );

  // The same call, with the same inputs, as the Fuel inputs screen — so the two
  // never disagree about today's range.
  const energy = useMemo(
    () =>
      dailyEnergyFor({
        bodyMassKgSet,
        heightCm: settings.heightCm ?? null,
        birthYear: settings.birthYear ?? null,
        sex: fuel.sexForEnergy ?? null,
        movement: fuel.dailyMovement ?? null,
        day: today ?? null,
        easedFocus: briefing.training?.focus ?? null,
        packKg: settings.packWeightKg ?? null,
        recorded: recordedToday,
      }),
    [
      bodyMassKgSet,
      settings.heightCm,
      settings.birthYear,
      settings.packWeightKg,
      fuel.sexForEnergy,
      fuel.dailyMovement,
      today,
      briefing.training?.focus,
      recordedToday,
    ],
  );

  const restDay = today?.focus === "rest" && energy.session.kind !== "recorded";

  const fuelling = useMemo<FuellingPlan>(() => {
    const mass = bodyMassKgSet ?? undefined;
    if (energy.session.kind === "eased" && briefing.training) {
      return fuellingFor({ focus: briefing.training.focus, bodyMassKg: mass });
    }
    return fuellingFor({ day: today ?? undefined, bodyMassKg: mass });
  }, [energy.session.kind, briefing.training, today, bodyMassKgSet]);

  /* ---- What has been eaten today ------------------------------------------ */

  const entries = useMemo(
    () =>
      (fuel.foodLog ?? [])
        .filter((e) => e.date === todayKey)
        .map((e) => ({ entry: e, estimate: estimateFromEntry(e) })),
    [fuel.foodLog, todayKey],
  );

  const totals = useMemo(() => {
    if (entries.length === 0) return null;
    const sum = (pick: (e: (typeof entries)[number]["estimate"]) => number | null) => {
      let total = 0;
      let counted = 0;
      for (const { estimate } of entries) {
        const v = pick(estimate);
        if (typeof v === "number" && Number.isFinite(v)) {
          total += v;
          counted++;
        }
      }
      return counted > 0 ? total : null;
    };
    return {
      kcal: sum((e) => e.kcal),
      unestimated: entries.filter((e) => e.estimate.kcal === null).length,
    };
  }, [entries]);

  const loggedKcal = totals?.kcal ?? null;
  const cover = stillToCover(energy.total, loggedKcal);
  const band = energy.total;

  const chip = dayKindChip(energy, Boolean(today && today.focus !== "rest"), restDay);
  // Why the range does or does not include the session — the engine's own
  // sentence, shown only when there is something to explain.
  const sessionNote =
    energy.session.kind === "not-costable" ||
    energy.session.kind === "eased" ||
    energy.session.kind === "unavailable"
      ? energy.session.sentence
      : null;
  const t = TARGETS[target];

  const suggestions = [
    { label: "Before", lines: fuelling.before, icon: Timer },
    { label: "During", lines: fuelling.during, icon: Droplets },
    { label: "After", lines: fuelling.after, icon: Check },
  ].filter((s) => s.lines.length > 0);

  const contextLine = goal
    ? [
        goal.name,
        planSummary ? `Week ${planSummary.currentWeek.index}` : null,
        planSummary?.currentPhaseLabel,
      ]
        .filter((p): p is string => Boolean(p))
        .join(" · ")
    : null;

  const scrollToTips = () =>
    tipsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-10 pt-4">
        <Rise>
          <FuelTopBar onMore={() => setMoreOpen(true)} />
          {/* Non-editable — §4.2 rule 3. The chip that changes the objective
              lives on the hub only; every sub-page gets this slim line. */}
          {contextLine && <p className="mt-2 truncate text-[13px] text-mist">{contextLine}</p>}
        </Rise>

        {/* ---- Today's fuel ------------------------------------------------ */}
        <Rise className="mt-5">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Utensils size={16} strokeWidth={1.7} className="text-mist" aria-hidden="true" />
                <p className="text-[15px] font-medium text-snow">Today's fuel</p>
              </div>
              <DayBadge training={chip.training} label={chip.label} />
            </div>

            {band ? (
              <p className="display tnum mt-4 text-[30px] leading-[1.08] text-snow">
                {kcal(band.low)} – {kcal(band.high)} kcal
              </p>
            ) : (
              <p className="mt-4 text-[15px] leading-relaxed text-mist">
                {energy.resting.kind === "unavailable"
                  ? energy.resting.sentence
                  : "The range needs more inputs than ICEFALL has today."}
              </p>
            )}

            <p className="mt-2 text-[13px] leading-relaxed text-mist">
              {band ? (
                "Your energy target for today."
              ) : (
                <>
                  <Link to="/coach/nutrition" className="text-azure-bright">
                    Add them
                  </Link>
                  .
                </>
              )}
            </p>
            {sessionNote && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-mist-dim">{sessionNote}</p>
            )}
          </Card>
        </Rise>

        {/* ---- Empty state, or the logged state with the band -------------- */}
        {band && (
          <Rise className="mt-4">
            {loggedKcal === null ? (
              <Card pad={false} className="flex flex-col items-center px-5 py-9 text-center">
                <span
                  aria-hidden="true"
                  className="grid h-12 w-12 place-items-center rounded-full bg-slate text-mist"
                >
                  <UtensilsCrossed size={22} strokeWidth={1.6} />
                </span>
                <p className="mt-4 text-[16px] font-semibold text-snow">Nothing logged yet</p>
                <p className="mt-1.5 max-w-[260px] text-[13.5px] leading-relaxed text-mist">
                  Log your meals to track your energy and support your training.
                </p>
                <Link
                  to="/coach/nutrition"
                  className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-azure text-[15px] font-semibold text-[color:var(--ice-on-accent)] transition-opacity hover:opacity-90"
                >
                  Log food
                </Link>
                <button
                  type="button"
                  onClick={scrollToTips}
                  className="mt-2.5 flex h-12 w-full items-center justify-center rounded-full border border-hairline-strong text-[15px] font-medium text-snow transition-colors hover:border-azure/40"
                >
                  View nutrition tips
                </button>
              </Card>
            ) : (
              <Card>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="tnum text-[15px] font-semibold text-snow">
                    {kcal(loggedKcal)} kcal logged
                  </p>
                  <p className="tnum text-[13px] text-mist">
                    {cover === "inside-range"
                      ? "Within range"
                      : cover
                        ? `${kcal(cover.kcal)} kcal to the low end`
                        : ""}
                  </p>
                </div>
                <FuelBand low={band.low} high={band.high} logged={loggedKcal} />
                <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
                  From {entries.length} logged {entries.length === 1 ? "item" : "items"}.
                  {totals && totals.unestimated > 0
                    ? ` ${totals.unestimated} ${totals.unestimated === 1 ? "item has" : "items have"} no estimate and ${totals.unestimated === 1 ? "is" : "are"} not counted.`
                    : ""}
                </p>
              </Card>
            )}
          </Rise>
        )}

        {/* ---- Why this range? ---------------------------------------------- */}
        <Rise className="mt-4">
          <Card>
            <p className="text-[16px] font-semibold text-snow">Why this range?</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-mist">
              Based on your training plan, duration and intensity for today.
            </p>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-dim">
              A range, not a number: the resting term alone varies ±10% between people. Targets are
              estimates and should be adjusted to your needs.
            </p>
          </Card>
        </Rise>

        {/* ---- Target selector — kept from the existing Fuel screen -------- */}
        <Rise className="mt-4">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <Link to="/coach/nutrition" className="text-[13.5px] text-azure-bright">
                Adjust
              </Link>
            </div>
            <h2 className="display mt-1 text-[26px] leading-[1.1] text-snow">{t.heading}</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-mist">{t.description}</p>
            <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
              {(Object.keys(TARGETS) as FuelTarget[]).map((id) => {
                const on = id === target;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTarget(id)}
                    aria-pressed={on}
                    className={cn(
                      "shrink-0 rounded-full px-4 py-2.5 text-[14px] font-medium transition-colors",
                      on ? "bg-azure text-[color:var(--ice-on-accent)]" : "bg-slate text-snow",
                    )}
                  >
                    {TARGETS[id].label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
              A target changes the guidance below, not the range: the range is worked out from your
              body and today's session, and ICEFALL sets no weight or body-composition goals.
            </p>
          </Card>
        </Rise>

        {/* ---- Suggested for you -------------------------------------------- */}
        <div ref={tipsRef} />
        <Rise className="mt-6">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-mist">
            Suggested for you
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-mist">
            Guidance matched to your target and today's training.
          </p>
        </Rise>
        <Rise className="mt-3">
          {suggestions.length > 0 ? (
            <Card pad={false} className="divide-y divide-hairline">
              {suggestions.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="flex items-start gap-3.5 p-4">
                    <span
                      aria-hidden="true"
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-azure/15 text-azure"
                    >
                      <Icon size={17} strokeWidth={1.6} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] font-medium uppercase tracking-[0.14em] text-azure-bright">
                        {s.label}
                      </p>
                      <p className="mt-1 text-[14.5px] font-medium leading-snug text-snow">
                        {s.lines[0]}
                      </p>
                      {s.lines.slice(1).map((line) => (
                        <p key={line} className="mt-1 text-[13px] leading-snug text-mist">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="px-4 py-3 text-[11.5px] leading-relaxed text-mist-dim">{t.emphasis}</p>
            </Card>
          ) : (
            <Card>
              <p className="text-[13.5px] leading-relaxed text-mist">{fuelling.context}</p>
            </Card>
          )}
        </Rise>

        {/* ---- Your meals ---------------------------------------------------- */}
        <Rise className="mt-6">
          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[16px] font-semibold text-snow">Your meals</p>
              <Link to="/coach/nutrition" className="shrink-0 text-[13.5px] text-azure-bright">
                Log food
              </Link>
            </div>
            {entries.length > 0 ? (
              <ul className="mt-3 divide-y divide-hairline">
                {entries.map(({ entry, estimate }) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] text-snow">{entry.description}</p>
                      <p className="text-[12px] text-mist">
                        {new Date(entry.at).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {entry.portions !== 1 ? ` · ${entry.portions} portions` : ""}
                      </p>
                    </div>
                    <span
                      className={
                        estimate.kcal === null
                          ? "text-[12px] text-mist"
                          : "tnum text-[14.5px] text-snow"
                      }
                    >
                      {estimate.kcal === null ? "No estimate" : `${kcal(estimate.kcal)} kcal`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[13.5px] leading-relaxed text-mist">
                Nothing logged today. Log a meal and it appears here.
              </p>
            )}
          </Card>
        </Rise>

        <Rise className="mt-5">
          <p className="text-[11px] leading-relaxed text-mist-dim">
            Targets are estimates and should be adjusted to your needs. ICEFALL does not provide
            medical nutrition therapy.
          </p>
        </Rise>
      </Stagger>

      {moreOpen && (
        <Sheet title="Fuel options" onClose={() => setMoreOpen(false)}>
          <SheetRow
            icon={Utensils}
            title="Log food"
            detail="Add what you've eaten today"
            onClick={() => {
              setMoreOpen(false);
              navigate("/coach/nutrition");
            }}
          />
          <SheetRow
            icon={SlidersHorizontal}
            title="Nutrition preferences"
            detail="Body, movement and fuelling inputs"
            onClick={() => {
              setMoreOpen(false);
              navigate("/coach/nutrition");
            }}
          />
        </Sheet>
      )}
    </Screen>
  );
}
