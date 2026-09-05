import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Droplets, Timer, Zap } from "lucide-react";

import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { ProgressRing } from "@/components/ui/charts";
import { useCoachIntel } from "@/coach/hooks";
import {
  dailyEnergyFor,
  stillToCover,
  type DailyEnergy,
  type RecordedSessionInput,
} from "@/coach/fuelDay";
import { estimateFromEntry, fuellingFor, type FuellingPlan } from "@/coach/nutrition";
import { isoDate } from "@/data/mock/clock";
import { useFuelLocal } from "@/screens/Nutrition";
import { useSettings } from "@/settings/store";
import { useApp } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";
import { ACCENT, Chip, CoachCard, CoachHead, Eyebrow, ON_PRIMARY, PRIMARY, TINT } from "./shell";

/**
 * COACH — FUEL, to the owner's design of 2026-09-04.
 *
 * The drawing carries sample numbers — 2,400 kcal, 1,680 consumed, 120 g of
 * protein against a target — and its own brief says of them: "Sample values
 * for demo. Targets are estimates." This page draws NONE of them. Every figure
 * is the energy engine's own, run exactly as the Fuel inputs screen runs it:
 *
 *   · TARGET is `dailyEnergyFor(...).total`, which is a BAND, low to high, not
 *     one number. `fuelDay.ts` is explicit about why: the resting term alone
 *     carries ±10% for individual variation before an activity multiplier
 *     widens it further. The ring is drawn against the band's floor and says
 *     so; the legend prints the band.
 *   · CONSUMED is the sum of `estimateFromEntry` over today's food log, and
 *     it is "nothing logged" rather than 0 when the log is empty — a zero
 *     would claim the athlete ate nothing.
 *   · REMAINING is `stillToCover`, which rounds UP and never prints a zero
 *     over a shortfall, and reads "within range" once the floor is met.
 *   · THE MACRO TILES have no targets, because the engine prescribes none —
 *     `coach/nutrition.ts` sets no macro split and no body-composition goal.
 *     They show grams logged, from the same estimates, or a dash.
 *
 * THE TARGET SELECTOR changes the guidance — which emphasis the suggestions
 * lead with and what "Your target" says — and nothing numeric, because there
 * is no engine behind a target that would make a number true. Three targets,
 * not the drawing's four: "Weight mgmt" is a body-composition goal, and
 * `coach/nutrition.ts` records the owner's own rule that ICEFALL sets none —
 * "that single sentence is the reason the fuel screen is not another calorie
 * app". Adding it here would contradict the rule at the one place it matters.
 * If the owner wants it back, that is a product decision to take knowingly.
 *
 * "Suggested for you" is `fuellingFor(today)` — the before / during / after
 * guidance the engine writes for the session — rather than the drawing's
 * sample meals with invented calorie counts.
 *
 * Every input, the food-log composer and the hydration log stay on the old
 * Fuel screen at `/coach/nutrition`, reached from Adjust, Log food and
 * Nutrition preferences.
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
 * The plan decides the chip; the engine's reason, when there is one, is said
 * in the note under the ring.
 */
function dayKindChip(
  energy: DailyEnergy,
  hasSession: boolean,
  restDay: boolean,
): { label: string; tone: "green" | "peach" | "neutral" } {
  if (energy.session.kind === "recorded") return { label: "Training day", tone: "green" };
  if (restDay) return { label: "Rest day", tone: "peach" };
  if (hasSession) return { label: "Training day", tone: "green" };
  return { label: "No session", tone: "neutral" };
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function Fuel() {
  const { bodyMassKgSet } = useApp();
  const { settings } = useSettings();
  const { fuel } = useFuelLocal();
  const { today, briefing } = useCoachIntel();
  const recorded = useRecordedActivities();
  const [target, setTarget] = useFuelTarget();

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
      proteinG: sum((e) => e.proteinG),
      carbsG: sum((e) => e.carbsG),
      fatG: sum((e) => e.fatG),
      unestimated: entries.filter((e) => e.estimate.kcal === null).length,
    };
  }, [entries]);

  const loggedKcal = totals?.kcal ?? null;
  const cover = stillToCover(energy.total, loggedKcal);
  const band = energy.total;

  // The ring fills against the band's FLOOR — the least the day asks for —
  // and is capped at full once the floor is met.
  const ringValue =
    band && loggedKcal !== null ? Math.max(0, Math.min(100, Math.round((loggedKcal / band.low) * 100))) : 0;

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
    { label: "Before", lines: fuelling.before, icon: Timer, tint: "peach" as const },
    { label: "During", lines: fuelling.during, icon: Droplets, tint: "blue" as const },
    { label: "After", lines: fuelling.after, icon: Check, tint: "green" as const },
  ].filter((s) => s.lines.length > 0);

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-10 pt-6">
        <Rise>
          <CoachHead title="Fuel" subtitle="Nutrition that supports your mountain goals." />
        </Rise>

        {/* ---- Your target ------------------------------------------------ */}
        <Rise className="mt-5">
          <CoachCard>
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Your target</Eyebrow>
              <Link to="/coach/nutrition" className="inline-flex items-center gap-1 text-[15px] text-azure">
                Adjust
                <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" />
              </Link>
            </div>
            <h2 className="display mt-2 text-[32px] leading-[1.05] text-snow">{t.heading}</h2>
            <p className="mt-2.5 text-[14px] leading-relaxed text-mist">{t.description}</p>
            <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
              {(Object.keys(TARGETS) as FuelTarget[]).map((id) => {
                const on = id === target;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTarget(id)}
                    aria-pressed={on}
                    className="shrink-0 rounded-full px-4 py-2.5 text-[14px] font-medium transition-colors"
                    style={
                      on
                        ? { backgroundColor: PRIMARY, color: ON_PRIMARY }
                        : { backgroundColor: TINT.blue, color: "var(--ice-snow)" }
                    }
                  >
                    {TARGETS[id].label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
              A target changes the guidance below, not the range: the range is worked out from
              your body and today's session, and ICEFALL sets no weight or body-composition goals.
            </p>
          </CoachCard>
        </Rise>

        {/* ---- Today's target --------------------------------------------- */}
        <Rise className="mt-4">
          <CoachCard>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="display text-[32px] leading-none text-snow">Today's target</h2>
                <p className="mt-1.5 truncate text-[14px] text-mist">
                  {today
                    ? `${today.title}${today.durationMin ? ` · ${today.durationMin} min` : ""}`
                    : "No session in the plan today"}
                </p>
              </div>
              <Chip tone={chip.tone} className="shrink-0">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                {chip.label}
              </Chip>
            </div>

            {band ? (
              <div className="mt-5 flex items-center gap-5">
                <div className="relative shrink-0">
                  <ProgressRing value={ringValue} size={124} stroke={9}>
                    <span className="flex flex-col items-center leading-none">
                      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-mist">
                        {loggedKcal === null ? "Range" : cover === "inside-range" ? "Covered" : "Remaining"}
                      </span>
                      <span className="display tnum mt-1.5 text-[34px] text-snow">
                        {loggedKcal === null
                          ? `${kcal(band.low)}+`
                          : cover === "inside-range"
                            ? "✓"
                            : cover
                              ? kcal(cover.kcal)
                              : "—"}
                      </span>
                      <span className="mt-1 text-[12px] text-mist">kcal</span>
                    </span>
                  </ProgressRing>
                </div>

                <dl className="min-w-0 flex-1 text-[15px]">
                  <div className="flex items-center justify-between gap-3 py-1.5">
                    <dt className="flex items-center gap-2 text-mist">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACCENT.blue }} />
                      Target
                    </dt>
                    <dd className="tnum font-semibold text-snow">
                      {kcal(band.low)}–{kcal(band.high)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-1.5">
                    <dt className="flex items-center gap-2 text-mist">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TINT.lavender }} />
                      Consumed
                    </dt>
                    <dd className={loggedKcal === null ? "text-[13px] text-mist" : "tnum font-semibold text-snow"}>
                      {loggedKcal === null ? "Nothing logged" : kcal(loggedKcal)}
                    </dd>
                  </div>
                  <div className="my-1 border-t border-hairline" />
                  <div className="flex items-center justify-between gap-3 py-1.5">
                    <dt className="flex items-center gap-2 text-mist">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACCENT.peach }} />
                      Remaining
                    </dt>
                    <dd className={cover === "inside-range" || cover === null ? "text-[13px] text-mist" : "tnum font-semibold text-snow"}>
                      {cover === null ? "—" : cover === "inside-range" ? "Within range" : kcal(cover.kcal)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="mt-4 text-[14px] leading-relaxed text-mist">
                {energy.resting.kind === "unavailable"
                  ? energy.resting.sentence
                  : "The range needs more inputs than ICEFALL has today."}{" "}
                <Link to="/coach/nutrition" className="text-azure">
                  Add them
                </Link>
                .
              </p>
            )}

            <p className="tnum mt-4 text-[13px] leading-relaxed text-mist">
              {band && loggedKcal !== null
                ? `${ringValue}% of the low end of today's range, from ${entries.length} logged ${entries.length === 1 ? "item" : "items"}.`
                : band
                  ? "Log what you eat and this fills in against the low end of the range."
                  : ""}
              {totals && totals.unestimated > 0
                ? ` ${totals.unestimated} ${totals.unestimated === 1 ? "item has" : "items have"} no estimate and ${totals.unestimated === 1 ? "is" : "are"} not counted.`
                : ""}
            </p>
            {sessionNote && (
              <p className="mt-2 text-[13px] leading-relaxed text-mist">{sessionNote}</p>
            )}
            <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
              A range, not a number: the resting term alone varies ±10% between people. Targets are
              estimates and should be adjusted to your needs.
            </p>
          </CoachCard>
        </Rise>

        {/* ---- Macros ----------------------------------------------------- */}
        <Rise className="mt-4">
          <div className="grid grid-cols-3 gap-3">
            <MacroTile label="Protein" grams={totals?.proteinG ?? null} tone="blue" />
            <MacroTile label="Carbs" grams={totals?.carbsG ?? null} tone="peach" />
            <MacroTile label="Fats" grams={totals?.fatG ?? null} tone="lavender" />
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
            Grams logged today, from the same estimates. ICEFALL prescribes no macro split, so
            there is no target to fill towards.
          </p>
        </Rise>

        {/* ---- Suggested for you ------------------------------------------ */}
        <Rise className="mt-7">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="display text-[32px] leading-none text-snow">Suggested for you</h2>
              <p className="mt-2 text-[14px] leading-snug text-mist">
                Guidance matched to your target and today's training.
              </p>
            </div>
            <Link to="/coach/nutrition" className="shrink-0 text-[15px] text-azure">
              See all
            </Link>
          </div>
        </Rise>

        {suggestions.length > 0 ? (
          suggestions.map((s) => {
            const Icon = s.icon;
            return (
              <Rise key={s.label} className="mt-3">
                <CoachCard className="p-4">
                  <div className="flex items-start gap-4">
                    <span
                      aria-hidden="true"
                      className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[16px]"
                      style={{ backgroundColor: TINT[s.tint], color: ACCENT[s.tint] }}
                    >
                      <Icon size={24} strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium uppercase tracking-[0.16em]" style={{ color: ACCENT[s.tint] }}>
                        {s.label}
                      </p>
                      <p className="mt-1 text-[16px] font-semibold leading-snug text-snow">{s.lines[0]}</p>
                      {s.lines.slice(1).map((line) => (
                        <p key={line} className="mt-1 text-[13px] leading-snug text-mist">
                          {line}
                        </p>
                      ))}
                      <Chip tone="blue" className="mt-2.5">
                        <Zap size={12} strokeWidth={2} aria-hidden="true" />
                        {t.emphasis}
                      </Chip>
                    </div>
                  </div>
                </CoachCard>
              </Rise>
            );
          })
        ) : (
          <Rise className="mt-3">
            <CoachCard>
              <p className="text-[14px] leading-relaxed text-mist">{fuelling.context}</p>
            </CoachCard>
          </Rise>
        )}

        {/* ---- Your meals ------------------------------------------------- */}
        <Rise className="mt-7">
          <CoachCard>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="display text-[30px] leading-none text-snow">Your meals</h2>
              <Link to="/coach/nutrition" className="shrink-0 text-[15px] text-azure">
                Log food
              </Link>
            </div>
            {entries.length > 0 ? (
              <ul className="mt-3 divide-y divide-hairline">
                {entries.map(({ entry, estimate }) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] text-snow">{entry.description}</p>
                      <p className="text-[12px] text-mist">
                        {new Date(entry.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        {entry.portions !== 1 ? ` · ${entry.portions} portions` : ""}
                      </p>
                    </div>
                    <span className={estimate.kcal === null ? "text-[12px] text-mist" : "tnum text-[15px] text-snow"}>
                      {estimate.kcal === null ? "No estimate" : `${kcal(estimate.kcal)} kcal`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[14px] leading-relaxed text-mist">
                Nothing logged today. Log a meal and the ring above fills against your range.
              </p>
            )}
          </CoachCard>
        </Rise>

        {/* ---- Nutrition insights ----------------------------------------- */}
        <Rise className="mt-4">
          <CoachCard>
            <Eyebrow>Nutrition insights</Eyebrow>
            <p className="mt-3 text-[15px] leading-relaxed text-snow">
              {fuelling.context}
              {fuelling.emphasis ? ` ${fuelling.emphasis}` : ""}
            </p>
            <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
              Insights are educational and based on your selected target — not medical advice.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/coach/nutrition" className="rounded-full border border-hairline-strong px-4 py-2 text-[14px] text-snow">
                Adjust target
              </Link>
              <Link to="/coach/nutrition" className="rounded-full border border-hairline-strong px-4 py-2 text-[14px] text-snow">
                Log food
              </Link>
              <Link to="/coach/nutrition" className="rounded-full border border-hairline-strong px-4 py-2 text-[14px] text-snow">
                Nutrition preferences
              </Link>
            </div>
          </CoachCard>
        </Rise>

        <Rise className="mt-5">
          <p className="text-[11px] leading-relaxed text-mist-dim">
            Targets are estimates and should be adjusted to your needs. ICEFALL does not provide
            medical nutrition therapy.
          </p>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function MacroTile({
  label,
  grams,
  tone,
}: {
  label: string;
  grams: number | null;
  tone: "blue" | "peach" | "lavender";
}) {
  return (
    <div className="rounded-[20px] bg-graphite p-4 shadow-[0_1px_10px_rgba(20,24,40,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-mist">{label}</p>
        <span
          aria-hidden="true"
          className="grid h-5 w-5 place-items-center rounded-full"
          style={{ backgroundColor: TINT[tone] }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ACCENT[tone] }} />
        </span>
      </div>
      <p className="display tnum mt-3 text-[32px] leading-none text-snow">
        {grams === null ? "—" : Math.round(grams)}
        {grams !== null && <span className="ml-1 text-[14px] text-mist">g</span>}
      </p>
      <p className="mt-2.5 text-[12px] text-mist">{grams === null ? "nothing logged" : "logged today"}</p>
    </div>
  );
}
