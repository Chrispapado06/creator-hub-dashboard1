import { Fragment, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { QualifierBadge, ScoreValue, UnavailableState } from "@/components/coach/DataState";
import { COACH_DISCLAIMER, isKnown, known, unavailable } from "@/coach/types";
import { useCoachIntel } from "@/coach/hooks";
import { useTraining } from "@/tracking/training";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";
import { FOCUS_LABELS, fmtDistance, fmtDurationCompact, fmtElevation } from "@/lib/format";
import { isoDate } from "@/data/mock/clock";
import type { Score } from "@/coach/types";
import type { Readiness } from "@/coach/readiness";
import type { TrainingDay, TrainingPlan, TrainingWeek } from "@/types";

/**
 * Coach screen 02 — the plan.
 *
 * Three ways into the same generated block: the week you are in, the shape of
 * the whole build, and a month at a glance. Nothing on this screen is a fixture.
 * The weeks come from `buildPlanForGoal`, the phases are read back out of the
 * block names that generator wrote, and completion comes from what the athlete
 * actually recorded or actually ticked.
 *
 * Three rules govern every completion mark here, and none of them are cosmetic:
 *
 *  1. NOTHING IS PRE-TICKED. `buildPlanForGoal` emits `completed: false` for
 *     every day it writes. A tick means a recorded activity satisfied the
 *     session or the athlete said it was done — see `useTraining`.
 *
 *  2. A FUTURE DAY IS NEITHER COMPLETE NOR MISSED. The toggle is inert until
 *     the day arrives, and a future date can never render as done. The same map
 *     feeds `computePreparation`, so a tick on tomorrow would inflate readiness
 *     for an objective off work nobody has done.
 *
 *  3. A PAST DAY THAT WAS NOT DONE IS SHOWN, NOT SCOLDED. There is no "missed"
 *     styling anywhere in this file. Flagging skipped sessions is how an app
 *     talks someone into making up volume, and a made-up session in the week
 *     before an objective is worse than the one that was skipped.
 */

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/**
 * Read a plan date as a LOCAL calendar date.
 *
 * `new Date("2026-04-20")` is specified to parse as UTC midnight, which renders
 * as the 19th anywhere west of Greenwich — the exact bug documented on `isoDate`
 * in src/data/mock/clock.ts, which is why the plan writes its dates with local
 * components in the first place. Reading them back through the UTC path would
 * shift every row on this screen by a day, including which row is "today".
 */
function parseDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Year and month collapsed to one sortable integer, for the calendar cursor. */
const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();

/** "20–26 Apr" within a month, "28 Apr – 4 May" across one. */
function weekRangeLabel(week: TrainingWeek): string {
  const start = parseDate(week.startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const endLabel = end.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  if (sameMonth) return `${start.getDate()}–${endLabel}`;
  return `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${endLabel}`;
}

/**
 * The one line under a session title. Every part is omitted when the plan did
 * not prescribe it — a session with no distance shows no distance rather than
 * "0.0 km", which would read as a target of zero.
 */
function dayMeta(day: TrainingDay): string {
  const parts: string[] = [FOCUS_LABELS[day.focus] ?? day.focus];
  if (day.durationMin) parts.push(fmtDurationCompact(day.durationMin * 60));
  if (day.distanceKm) parts.push(`${fmtDistance(day.distanceKm)} km`);
  if (day.elevationM) parts.push(`${fmtElevation(day.elevationM)} m`);
  return parts.join(" · ");
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The family a week's block belongs to: "Base 2 · deload" → "Base".
 *
 * The ordinal and the deload marker are week-level detail. Grouping on what is
 * left is a READ of the structure the generator already wrote — this screen must
 * not invent a phase the plan does not have, so anything that does not match a
 * known family simply carries its own name and no description.
 */
function blockPrefix(block: string): string {
  return block
    .split("·")[0]
    .trim()
    .replace(/\s+\d+$/, "");
}

/**
 * One line per block family, describing what that stretch of the plan actually
 * does. These are not motivational copy: each one restates the load multiplier
 * and session mix `weekTemplate`/`blockFor` apply for that family, so the words
 * and the generated sessions cannot drift apart. A family with no entry gets no
 * line rather than a plausible-sounding one.
 */
const PHASE_PURPOSE: Record<string, string> = {
  Base: "Aerobic base at a volume that repeats every week without costing you the next one.",
  Build: "Volume and vertical rise together — the sessions start to resemble the objective.",
  Peak: "The most specific weeks in the plan, and the highest load it prescribes.",
  Taper: "Volume comes down so the work already behind you can surface.",
};

interface Phase {
  number: number;
  name: string;
  firstWeek: number;
  lastWeek: number;
  deloadWeeks: number;
  purpose?: string;
  containsCurrent: boolean;
  /** Sessions the phase prescribes in total. Rest days are not sessions. */
  prescribed: number;
  /** Of those, the ones whose date has already passed. */
  due: number;
  completed: number;
}

function derivePhases(
  plan: TrainingPlan,
  completedByDate: Map<string, boolean>,
  todayKey: string,
): Phase[] {
  // Consecutive weeks only. If a plan ever returned to "Base" after "Peak" that
  // would be a second, separate phase — which is the honest reading, because it
  // is a second, separate stretch of the athlete's calendar.
  const groups: { name: string; weeks: TrainingWeek[] }[] = [];
  for (const week of plan.weeks) {
    const name = blockPrefix(week.block);
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.weeks.push(week);
    else groups.push({ name, weeks: [week] });
  }

  return groups.map((group, i) => {
    let prescribed = 0;
    let due = 0;
    let completed = 0;

    for (const week of group.weeks) {
      for (const day of week.days) {
        if (day.focus === "rest") continue;
        prescribed++;
        // Days still ahead are counted as prescribed but never as due, so a
        // phase in the future reports what it asks for and nothing about
        // performance against it.
        if (day.date > todayKey) continue;
        due++;
        if (completedByDate.get(day.date) === true) completed++;
      }
    }

    const firstWeek = group.weeks[0].index;
    const lastWeek = group.weeks[group.weeks.length - 1].index;

    return {
      number: i + 1,
      name: group.name,
      firstWeek,
      lastWeek,
      deloadWeeks: group.weeks.filter((w) => w.block.includes("deload")).length,
      purpose: PHASE_PURPOSE[group.name],
      containsCurrent: plan.currentWeek >= firstWeek && plan.currentWeek <= lastWeek,
      prescribed,
      due,
      completed,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

type Tab = "week" | "phases" | "calendar";

const TABS = [
  { value: "week", label: "Week" },
  { value: "phases", label: "Phases" },
  { value: "calendar", label: "Calendar" },
] as const;

export default function CoachPlan() {
  const { plan, readiness, cold } = useCoachIntel();
  // `useCoachIntel` gives the plan and the current week but not completion —
  // that lives in the training state, keyed by date, and is the only source
  // allowed to say a session is done. Reading it here rather than recomputing
  // keeps this screen and the goal's preparation figure on the same numbers.
  const { goal, completedByDate, satisfiedByActivity } = useTraining();
  const { toggleSession } = useApp();

  const [tab, setTab] = useState<Tab>("week");
  const [weekIndex, setWeekIndex] = useState<number | null>(null);
  const todayKey = isoDate(new Date());

  const phases = useMemo(
    () => (plan ? derivePhases(plan, completedByDate, todayKey) : []),
    [plan, completedByDate, todayKey],
  );

  if (!plan || !goal) return <NoObjective />;

  const index = Math.min(plan.totalWeeks, Math.max(1, weekIndex ?? plan.currentWeek));
  const week = plan.weeks.find((w) => w.index === index) ?? plan.weeks[0];

  return (
    <Screen>
      <Stagger>
        <Rise className="pt-5">
          <p className="section-label">Training plan</p>
          <h2 className="mt-2 text-[21px] font-light tracking-[-0.02em] text-snow">{plan.title}</h2>
          <p className="tnum mt-1.5 text-[12px] text-mist-dim">
            Week {plan.currentWeek} of {plan.totalWeeks} · built backwards from {goal.name}
          </p>
        </Rise>

        <Rise className="pt-5">
          <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
        </Rise>
      </Stagger>

      <Stagger key={tab}>
        {tab === "week" && (
          <WeekView
            plan={plan}
            week={week}
            onStepWeek={(next) => setWeekIndex(next)}
            completedByDate={completedByDate}
            satisfiedByActivity={satisfiedByActivity}
            onToggle={(day) =>
              toggleSession(
                week.index,
                day.date,
                // The fallback must match the value `useTraining` derived, or the
                // first tap would toggle away from the wrong baseline and appear
                // to do nothing.
                satisfiedByActivity.has(day.date) || day.completed,
              )
            }
            todayKey={todayKey}
            readiness={readiness}
            cold={cold}
          />
        )}

        {tab === "phases" && <PhasesView phases={phases} plan={plan} />}

        {tab === "calendar" && (
          <CalendarView
            plan={plan}
            completedByDate={completedByDate}
            satisfiedByActivity={satisfiedByActivity}
            todayKey={todayKey}
          />
        )}

        <Rise className="pt-8">
          <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state — no objective, no plan, nothing recorded                       */
/* -------------------------------------------------------------------------- */

/**
 * The genuine first-run screen.
 *
 * ICEFALL could fill this with a generic eight-week block, and every competitor
 * does. It would be a plan for nobody: `buildPlanForGoal` takes its length from
 * the date, its volume from the altitude and its session mix from the terrain,
 * so without an objective there is no honest plan to draw — only a poster.
 */
function NoObjective() {
  return (
    <Screen>
      <Stagger>
        <Rise className="pt-10">
          <p className="section-label">Training plan</p>
          <h2 className="display mt-3 text-[30px] text-snow">Set the mountain first.</h2>
          <p className="mt-4 text-[13px] leading-relaxed text-mist">
            ICEFALL builds the plan backwards from an objective. The date sets how many weeks there
            are, the altitude and the terrain set what the weeks contain. Without one there is
            nothing to build, and a generic block would not be built for anything you are doing.
          </p>
        </Rise>

        <Rise className="pt-6">
          <Button asChild>
            <Link to="/goals">Choose an objective</Link>
          </Button>
        </Rise>

        <Rise className="pt-6">
          <Card>
            <SectionLabel>Until then</SectionLabel>
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
              Keep recording. Sessions are matched to the plan by date the moment one exists, so
              nothing you do between now and then is lost — and nothing before your first recorded
              activity is counted against you.
            </p>
          </Card>
        </Rise>

        <Rise className="pt-8">
          <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* WEEK                                                                        */
/* -------------------------------------------------------------------------- */

function WeekView({
  plan,
  week,
  onStepWeek,
  completedByDate,
  satisfiedByActivity,
  onToggle,
  todayKey,
  readiness,
  cold,
}: {
  plan: TrainingPlan;
  week: TrainingWeek;
  onStepWeek: (index: number) => void;
  completedByDate: Map<string, boolean>;
  satisfiedByActivity: Set<string>;
  onToggle: (day: TrainingDay) => void;
  todayKey: string;
  readiness: Readiness;
  cold: boolean;
}) {
  const sessions = week.days.filter((d) => d.focus !== "rest");
  const due = sessions.filter((d) => d.date <= todayKey);
  const ahead = sessions.length - due.length;
  const completed = due.filter((d) => completedByDate.get(d.date) === true);
  const fromActivity = completed.filter((d) => satisfiedByActivity.has(d.date)).length;
  const byHand = completed.length - fromActivity;

  /**
   * Adherence over the sessions that have actually fallen due.
   *
   * Dividing by every session in the week would report Monday of a fresh week as
   * 0% — a number that looks like failure and describes nothing. When no session
   * has come round yet there is no adherence to state, so the score is withheld
   * with a reason instead of being floored at zero.
   */
  const adherence: Score =
    due.length === 0 ? unavailable("no-data") : known((completed.length / due.length) * 100);

  return (
    <>
      {/* Week navigator */}
      <Rise className="pt-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onStepWeek(week.index - 1)}
            disabled={week.index <= 1}
            aria-label="Previous week"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow disabled:opacity-25 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} strokeWidth={1.5} />
          </button>

          <div className="min-w-0 text-center">
            <p className="tnum truncate text-[15px] font-light text-snow">
              Week {week.index} · {weekRangeLabel(week)}
            </p>
            <p className="section-label mt-1.5">{week.block}</p>
          </div>

          <button
            type="button"
            onClick={() => onStepWeek(week.index + 1)}
            disabled={week.index >= plan.totalWeeks}
            aria-label="Next week"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow disabled:opacity-25 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} strokeWidth={1.5} />
          </button>
        </div>
      </Rise>

      {/* Adherence so far */}
      <Rise className="pt-5">
        <Card>
          <SectionLabel>Completed so far</SectionLabel>

          {isKnown(adherence) ? (
            <div className="mt-3.5 flex items-center gap-5">
              <ScoreValue score={adherence} unit="%" size="md" className="shrink-0" />
              <p className="tnum min-w-0 flex-1 border-l border-hairline pl-5 text-[13px] leading-relaxed text-mist">
                {`${completed.length} of ${due.length} ${due.length === 1 ? "session" : "sessions"} due so far.`}
                {ahead > 0 &&
                  ` ${ahead} still ${ahead === 1 ? "sits" : "sit"} ahead of you — neither done nor missed.`}
              </p>
            </div>
          ) : (
            // A week entirely in the future has no adherence to state. The
            // unavailable state gets the full width rather than being squeezed
            // beside a caption, because absence is the whole message here.
            <div className="mt-4">
              <ScoreValue score={adherence} size="md" />
              <p className="tnum mt-3.5 text-center text-[13px] leading-relaxed text-mist">
                No session in this week has come round yet.
                {ahead > 0 &&
                  ` All ${ahead} ${ahead === 1 ? "sits" : "sit"} ahead of you — neither done nor missed.`}
              </p>
            </div>
          )}

          {completed.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3.5">
              {fromActivity > 0 && (
                <>
                  <span className="tnum text-[11px] text-mist-dim">
                    {fromActivity} matched from what you recorded
                  </span>
                  <QualifierBadge kind="estimated" />
                </>
              )}
              {byHand > 0 && (
                <>
                  <span className="tnum text-[11px] text-mist-dim">{byHand} marked by you</span>
                  <QualifierBadge kind="self-reported" />
                </>
              )}
            </div>
          )}
        </Card>
      </Rise>

      {/* Seven days */}
      <Rise className="pt-6">
        <SectionLabel>Sessions</SectionLabel>
        <Card className="mt-3 p-1.5" inset={false}>
          {week.days.map((day, i) => (
            <Fragment key={day.date}>
              {i > 0 && <div className="mx-3 h-px bg-hairline" />}
              <DayRow
                day={day}
                label={DAY_LABELS[i]}
                isToday={day.date === todayKey}
                isFuture={day.date > todayKey}
                completed={day.date <= todayKey && completedByDate.get(day.date) === true}
                fromActivity={satisfiedByActivity.has(day.date)}
                onToggle={() => onToggle(day)}
              />
            </Fragment>
          ))}
        </Card>
      </Rise>

      <PlanInputs readiness={readiness} cold={cold} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Day row                                                                     */
/* -------------------------------------------------------------------------- */

function DayRow({
  day,
  label,
  isToday,
  isFuture,
  completed,
  fromActivity,
  onToggle,
}: {
  day: TrainingDay;
  label: string;
  isToday: boolean;
  isFuture: boolean;
  completed: boolean;
  fromActivity: boolean;
  onToggle: () => void;
}) {
  const isRest = day.focus === "rest";
  const date = parseDate(day.date);

  return (
    <div
      className={cn(
        "flex items-stretch gap-1 rounded-tile border transition-colors",
        // Today is the only row that carries an outline. One azure edge on the
        // screen is the whole point of a five-percent accent.
        isToday ? "border-azure/45 bg-azure/[0.03]" : "border-transparent",
      )}
    >
      <Link
        to={`/coach/session/${day.date}`}
        className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3.5 rounded-tile px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
      >
        <div className="w-8 shrink-0 text-center">
          <p className={cn("section-label text-[9px]", isToday && "text-azure")}>{label}</p>
          <p
            className={cn(
              "tnum mt-1.5 text-[15px] font-extralight leading-none",
              isToday ? "text-azure" : isRest ? "text-mist-dim" : "text-snow",
            )}
          >
            {date.getDate()}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[13px]", isRest ? "text-mist" : "text-snow")}>
            {day.title}
          </p>
          <p className="tnum mt-1 truncate text-[11px] text-mist-dim">{dayMeta(day)}</p>
          {completed && (
            <span className="mt-2 inline-flex">
              {/* Provenance, not decoration. A tick derived from a recorded
                  activity clears the session at 60% of what was prescribed
                  (see `activitySatisfies`), which is an inference; a tick the
                  athlete made is their word. Neither is a measurement of the
                  session, and the two must not look identical. */}
              <QualifierBadge kind={fromActivity ? "estimated" : "self-reported"} />
            </span>
          )}
        </div>
      </Link>

      {isRest ? (
        // Rest is not a session, so there is nothing to complete. A control here
        // would turn the day the plan protects into one more box to clear.
        <div className="w-11 shrink-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={isFuture}
          aria-pressed={completed}
          aria-label={
            isFuture
              ? `${day.title} on ${day.date} has not happened yet`
              : completed
                ? `Mark ${day.title} not done`
                : `Mark ${day.title} done`
          }
          title={isFuture ? "Sessions can be marked once the day arrives." : undefined}
          className="grid w-11 shrink-0 place-items-center rounded-tile disabled:cursor-default"
        >
          <span
            className={cn(
              "grid h-6 w-6 place-items-center rounded-full border transition-all duration-200",
              completed
                ? "border-azure bg-azure text-obsidian"
                : "border-hairline-strong text-transparent",
              !completed && !isFuture && "hover:border-azure/60",
              isFuture && "opacity-30",
            )}
          >
            {completed ? (
              <Check size={12} strokeWidth={2.5} />
            ) : isToday ? (
              <span className="h-1.5 w-1.5 rounded-full bg-azure" />
            ) : null}
          </span>
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* What the plan is built on — and what it cannot see                          */
/* -------------------------------------------------------------------------- */

/**
 * How to close each readiness gap, keyed by the component ids `computeReadiness`
 * emits. Every line is an instruction about DATA, never about training: "record
 * what you do" is a request for honesty, "train more often" would be this screen
 * pushing volume to improve its own score.
 */
const SUPPLY_HINT: Record<string, { text: string; to: string; action: string }> = {
  training: {
    text: "The comparison needs your own recent weeks to sit against.",
    to: "/activity/select",
    action: "Record a session",
  },
  recovery: {
    text: "Recovery is a self-report, and nothing is assumed in its place.",
    to: "/coach/check-in",
    action: "Log today's check-in",
  },
  consistency: {
    text: "A fortnight of recorded history is the least a pattern can be read from.",
    to: "/activity/select",
    action: "Record a session",
  },
  "goal-alignment": {
    text: "This reads the shape of your last four weeks against the objective.",
    to: "/activity/select",
    action: "Record a session",
  },
};

function PlanInputs({ readiness, cold }: { readiness: Readiness; cold: boolean }) {
  const missing = readiness.components.filter((c) => c.score.value === null);

  return (
    <>
      <Rise className="pt-7">
        <SectionLabel>What this plan cannot see</SectionLabel>
        <Card className="mt-3">
          <p className="text-[13px] leading-relaxed text-mist">
            The plan is built from your objective and matched against the sessions you record. It
            does not adjust to the two signals below, and neither is estimated in their place —
            reading sleep or heart-rate variability needs an Apple Health or Health Connect bridge
            that only a native build can provide. No browser exposes either.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-hairline pt-5">
            <SignalTile label="Sleep" />
            <SignalTile label="HRV" />
          </div>
        </Card>
      </Rise>

      {missing.length > 0 && (
        <Rise className="pt-7">
          <SectionLabel>Readiness is running on less than four inputs</SectionLabel>
          <Card className="mt-3">
            <p className="text-[13px] leading-relaxed text-mist">
              {missing.length} of the four components behind readiness could not be computed. The
              weights redistribute across what is left rather than assuming an average for what is
              not, so the number is narrower than it looks.
            </p>

            <div className="mt-5 space-y-5 border-t border-hairline pt-5">
              {missing.map((component) => {
                const hint = SUPPLY_HINT[component.id];
                return (
                  <div key={component.id} className="flex items-start gap-4">
                    <UnavailableState
                      reason={component.score.reason ?? "no-data"}
                      size="sm"
                      className="w-[86px] shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-snow">{component.label}</p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
                        {component.note}
                      </p>
                      {hint && (
                        <>
                          <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
                            {hint.text}
                          </p>
                          <Link
                            to={hint.to}
                            className="mt-2 inline-flex min-h-[28px] items-center gap-1.5 text-[12px] text-azure transition-colors hover:text-azure-bright"
                          >
                            {hint.action}
                            <ChevronRight size={13} strokeWidth={1.6} />
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </Rise>
      )}

      {cold && (
        <Rise className="pt-4">
          <p className="text-[12px] leading-relaxed text-mist-dim">
            Fewer than three activities are on record, so there is very little for the plan to match
            itself against yet. Sessions tick themselves off as you record them.
          </p>
        </Rise>
      )}
    </>
  );
}

/**
 * A named signal ICEFALL has no source for.
 *
 * Deliberately the same size and weight as a tile that holds a real number, so
 * absence sits in the layout rather than hiding at the bottom of it.
 */
function SignalTile({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center rounded-tile bg-white/[0.02] px-3 py-4">
      <p className="section-label text-[9px] text-mist">{label}</p>
      {/* "not-connected" is the honest reason: the bridge exists as a contract in
          src/tracking/sources/health.ts and nothing is attached to it. */}
      <UnavailableState reason="not-connected" size="sm" className="mt-3" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PHASES                                                                      */
/* -------------------------------------------------------------------------- */

function PhasesView({ phases, plan }: { phases: Phase[]; plan: TrainingPlan }) {
  const lastDay = plan.weeks[plan.weeks.length - 1]?.days.slice(-1)[0]?.date;

  return (
    <>
      <Rise className="pt-6">
        <p className="text-[13px] leading-relaxed text-mist">
          {phases.length} {phases.length === 1 ? "phase" : "phases"} across {plan.totalWeeks} weeks,
          read from the blocks the plan was generated with. Nothing here is a stage ICEFALL invented
          on top of it.
        </p>
      </Rise>

      <Rise className="pt-5">
        <div className="space-y-3">
          {phases.map((phase) => (
            <PhaseCard key={`${phase.number}-${phase.name}`} phase={phase} />
          ))}
        </div>
      </Rise>

      {lastDay && (
        <Rise className="pt-5">
          <p className="tnum text-[11px] leading-relaxed text-mist-dim">
            The build ends on{" "}
            {parseDate(lastDay).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            . Move the objective's date and every phase above is rebuilt around it.
          </p>
        </Rise>
      )}
    </>
  );
}

function PhaseCard({ phase }: { phase: Phase }) {
  const ahead = phase.due === 0;

  return (
    <Card
      className={cn("transition-colors", phase.containsCurrent && "border-azure/35 bg-azure/[0.03]")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("section-label", phase.containsCurrent && "text-azure/80")}>
            Phase {String(phase.number).padStart(2, "0")}
          </p>
          <h3 className="mt-2 truncate text-[17px] font-light text-snow">{phase.name}</h3>
          <p className="tnum mt-1 text-[12px] text-mist">
            {phase.firstWeek === phase.lastWeek
              ? `Week ${phase.firstWeek}`
              : `Weeks ${phase.firstWeek}–${phase.lastWeek}`}
            {phase.deloadWeeks > 0 &&
              ` · ${phase.deloadWeeks} deload ${phase.deloadWeeks === 1 ? "week" : "weeks"}`}
          </p>
        </div>
        {phase.containsCurrent && <Badge tone="azure">Current</Badge>}
      </div>

      {/* Absent for any block family this screen has no honest description of. */}
      {phase.purpose && (
        <p className="mt-3.5 text-[13px] leading-relaxed text-mist">{phase.purpose}</p>
      )}

      <p className="tnum mt-4 border-t border-hairline pt-3.5 text-[11px] text-mist-dim">
        {ahead
          ? // A phase that has not started reports what it asks for. "0 of 24"
            // would be arithmetic about a stretch of calendar that has not
            // happened, dressed up as a result.
            `${phase.prescribed} ${phase.prescribed === 1 ? "session" : "sessions"} prescribed. Not started.`
          : `${phase.completed} of ${phase.due} ${phase.due === 1 ? "session" : "sessions"} completed${
              phase.due < phase.prescribed ? ` · ${phase.prescribed - phase.due} still ahead` : ""
            }`}
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* CALENDAR                                                                    */
/* -------------------------------------------------------------------------- */

function CalendarView({
  plan,
  completedByDate,
  satisfiedByActivity,
  todayKey,
}: {
  plan: TrainingPlan;
  completedByDate: Map<string, boolean>;
  satisfiedByActivity: Set<string>;
  todayKey: string;
}) {
  const days = useMemo(() => {
    const map = new Map<string, TrainingDay>();
    for (const week of plan.weeks) for (const day of week.days) map.set(day.date, day);
    return map;
  }, [plan]);

  const bounds = useMemo(() => {
    const all = [...days.keys()].sort();
    return {
      first: monthKey(parseDate(all[0])),
      last: monthKey(parseDate(all[all.length - 1])),
    };
  }, [days]);

  // Open on the month the athlete is in when the plan covers it, so the first
  // thing on screen is the part of the calendar they can act on.
  const [cursor, setCursor] = useState(() =>
    Math.min(bounds.last, Math.max(bounds.first, monthKey(parseDate(todayKey)))),
  );

  // Clamped on every render, not just on the step buttons: switching objective
  // rebuilds the plan underneath this state, and a cursor left pointing outside
  // the new build would render an empty month as though the plan had a hole.
  const visible = Math.min(bounds.last, Math.max(bounds.first, cursor));
  const year = Math.floor(visible / 12);
  const month = visible % 12;
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const cells = useMemo<(string | null)[]>(() => {
    const first = new Date(year, month, 1);
    // Monday-first, matching the plan's weeks, which always start on a Monday.
    const lead = (first.getDay() + 6) % 7;
    const length = new Date(year, month + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= length; d++) out.push(isoDate(new Date(year, month, d)));
    return out;
  }, [year, month]);

  return (
    <>
      <Rise className="pt-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCursor(Math.max(bounds.first, visible - 1))}
            disabled={visible <= bounds.first}
            aria-label="Previous month"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow disabled:opacity-25 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} strokeWidth={1.5} />
          </button>
          <p className="text-[15px] font-light text-snow">{monthLabel}</p>
          <button
            type="button"
            onClick={() => setCursor(Math.min(bounds.last, visible + 1))}
            disabled={visible >= bounds.last}
            aria-label="Next month"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow disabled:opacity-25 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} strokeWidth={1.5} />
          </button>
        </div>
      </Rise>

      <Rise className="pt-4">
        <Card inset={false} className="p-3">
          <div className="grid grid-cols-7">
            {WEEKDAY_INITIALS.map((initial, i) => (
              <span key={i} className="section-label pb-2 text-center text-[9px]">
                {initial}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((date, i) => {
              if (!date) return <span key={`pad-${i}`} aria-hidden="true" />;

              const day = days.get(date);
              const session = day && day.focus !== "rest" ? day : undefined;
              const isFuture = date > todayKey;
              const completed = !isFuture && completedByDate.get(date) === true;

              return (
                <CalendarCell
                  key={date}
                  date={date}
                  session={session}
                  isToday={date === todayKey}
                  completed={completed}
                  fromActivity={satisfiedByActivity.has(date)}
                />
              );
            })}
          </div>
        </Card>
      </Rise>

      <Rise className="pt-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <LegendItem className="bg-azure" label="Completed" />
          <LegendItem className="bg-white/25" label="Session, not yet done" />
          <LegendItem className="border border-hairline-strong" label="No session" />
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-mist-dim">
          A day without a mark carries no session, or is a rest day the plan wrote in. Nothing on
          this calendar is marked missed, and a day still ahead of you shows the same mark whether
          it is tomorrow or in four months.
        </p>
      </Rise>
    </>
  );
}

function CalendarCell({
  date,
  session,
  isToday,
  completed,
  fromActivity,
}: {
  date: string;
  session?: TrainingDay;
  isToday: boolean;
  completed: boolean;
  fromActivity: boolean;
}) {
  const number = parseDate(date).getDate();

  const inner = (
    <>
      <span
        className={cn(
          "tnum text-[13px] font-extralight leading-none",
          isToday ? "text-azure" : session ? "text-snow" : "text-mist-dim",
        )}
      >
        {number}
      </span>
      <span className="mt-1.5 grid h-1.5 place-items-center">
        {session && (
          <span className={cn("h-1.5 w-1.5 rounded-full", completed ? "bg-azure" : "bg-white/25")} />
        )}
      </span>
    </>
  );

  const shell = cn(
    "flex h-11 flex-col items-center justify-center rounded-tile border",
    isToday ? "border-azure/45" : "border-transparent",
  );

  // Only a day that carries a session goes anywhere — a link to an empty day
  // would promise a session screen that has nothing to show.
  if (!session) {
    return <span className={shell}>{inner}</span>;
  }

  return (
    <Link
      to={`/coach/session/${date}`}
      aria-label={`${session.title}, ${date}${completed ? `, completed${fromActivity ? " from a recorded activity" : ""}` : ""}`}
      className={cn(shell, "transition-colors hover:bg-white/[0.04]")}
    >
      {inner}
    </Link>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-[11px] text-mist-dim">
      <span className={cn("h-1.5 w-1.5 rounded-full", className)} />
      {label}
    </span>
  );
}
