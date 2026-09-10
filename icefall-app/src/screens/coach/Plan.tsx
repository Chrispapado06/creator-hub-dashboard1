import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Play } from "lucide-react";

import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { isoDate } from "@/data/mock/clock";
import { FOCUS_LABELS, fmtDistance, fmtElevation } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { REFERENCE_PLAN_NOTE } from "@/services/peakTier";
import { useTraining } from "@/tracking/training";
import type { TrainingDay, TrainingWeek } from "@/types";
import { ACCENT, Chip, CoachCard, CoachHead, Eyebrow, ON_PRIMARY, PRIMARY, TINT } from "./shell";

/**
 * COACH — PLAN, to the owner's design of 2026-09-04.
 *
 * A preparation summary, then this week as a vertical timeline whose rows
 * expand in place — the brief asks for inline detail and no deep navigation.
 * Everything drawn is the generated plan's own: the block name, the week
 * index against `totalWeeks`, each day's title, duration, distance and ascent,
 * and the completion state `useTraining` already resolves from the athlete's
 * ticks and their recorded activities.
 *
 * "33%" in the drawing is `preparation.percent`, which `computePreparation`
 * derives from prescribed sessions completed. It is labelled as that, because
 * a bare percentage beside a mountain reads as readiness, and readiness is a
 * different number with its own screen.
 *
 * The phases view and the month calendar the old Plan screen drew are one tap
 * away at `/coach/plan/calendar`, not gone: other weeks are read there, and
 * this page keeps to the week the athlete is in.
 */

function parseDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

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

/** "Base 4 · deload" → "Base". The block's family, without its number or flag. */
function blockPrefix(block: string): string {
  return block.split("·")[0].trim().replace(/\s+\d+$/, "");
}

/* The same four sentences the old Plan's phases view carried. */
const PHASE_PURPOSE: Record<string, string> = {
  Base: "Aerobic base at a volume that repeats every week without costing you the next one.",
  Build: "Volume and vertical rise together — the sessions start to resemble the objective.",
  Peak: "The most specific weeks in the plan, and the highest load it prescribes.",
  Taper: "Volume comes down so the work already behind you can surface.",
};

function dayMeta(day: TrainingDay): string {
  const parts: string[] = [FOCUS_LABELS[day.focus] ?? day.focus];
  if (day.durationMin) parts.push(`${day.durationMin} min`);
  if (day.distanceKm) parts.push(`${fmtDistance(day.distanceKm)} km`);
  if (day.elevationM) parts.push(`${fmtElevation(day.elevationM)} m`);
  return parts.join(" · ");
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type DayState = "rest" | "completed" | "today" | "upcoming" | "unmarked";

export default function Plan() {
  const training = useTraining();
  const { toggleSession } = useApp();
  const todayKey = isoDate(new Date());

  const plan = training.plan;
  const week = training.currentWeek;

  // The row that opens by default: today, else the first day still ahead.
  const [open, setOpen] = useState<string | null>(() => {
    if (!week) return null;
    return (
      week.days.find((d) => d.date === todayKey)?.date ??
      week.days.find((d) => d.date > todayKey)?.date ??
      null
    );
  });

  const prefix = week ? blockPrefix(week.block) : null;

  const stateOf = (day: TrainingDay): DayState => {
    if (day.focus === "rest") return "rest";
    if (training.completedByDate.get(day.date) === true) return "completed";
    if (day.date === todayKey) return "today";
    if (day.date > todayKey) return "upcoming";
    return "unmarked";
  };

  const prescribed = useMemo(
    () => (week ? week.days.filter((d) => d.focus !== "rest").length : 0),
    [week],
  );

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-10 pt-6">
        <Rise>
          <CoachHead title="Plan" objective="line" />
        </Rise>

        {!plan || !week ? (
          <Rise className="mt-5">
            <CoachCard>
              <Eyebrow>Preparation</Eyebrow>
              <h2 className="display mt-1.5 text-[32px] leading-none text-snow">No plan yet</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-mist">
                ICEFALL builds a week-by-week plan from an objective and its date. Name one and
                this page fills in.
              </p>
              <Link
                to="/goals"
                className="mt-5 flex h-[52px] items-center justify-center rounded-full text-[16px] font-semibold"
                style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
              >
                Set an objective
              </Link>
            </CoachCard>
          </Rise>
        ) : (
          <>
            {/* ---- Preparation summary ------------------------------------ */}
            <Rise className="mt-5">
              <CoachCard>
                <div className="flex items-center justify-between gap-3">
                  <Eyebrow>{prefix} phase</Eyebrow>
                  <span className="tnum text-[13px] text-mist">
                    Week {week.index} of {plan.totalWeeks}
                  </span>
                </div>
                <h2 className="display mt-2 text-[32px] leading-[1.05] text-snow">
                  Week {week.index} of your preparation
                </h2>
                <p className="mt-2.5 text-[14px] leading-relaxed text-mist">
                  {PHASE_PURPOSE[prefix ?? ""] ?? week.block}
                </p>

                {/* The plan's own label. It was on the Training screen and the
                    older CoachPlan, and this — the routed /coach/plan — had none. */}
                {training.goal && !training.goal.mountainId && (
                  <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
                    {REFERENCE_PLAN_NOTE}
                  </p>
                )}

                {training.preparation && (
                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: TINT.blue }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, training.preparation.percent))}%`,
                          backgroundColor: ACCENT.blue,
                        }}
                      />
                    </div>
                    {/* The CONSISTENCY part, not the composite: the composite
                        also holds time-in-build (and, on a surveyed mountain,
                        capability), so printing it under "of prescribed
                        sessions completed" was a false label — 36% shown where
                        2 of 4 sessions was the fact. */}
                    <p className="tnum mt-2 text-[12px] text-mist">
                      {training.preparation.parts.find((p) => p.label === "Consistency")?.percent ??
                        training.preparation.percent}
                      % of prescribed sessions completed — not a readiness figure.
                    </p>
                  </div>
                )}
              </CoachCard>
            </Rise>

            {/* ---- This week -------------------------------------------- */}
            <Rise className="mt-4">
              <CoachCard className="p-0">
                <div className="flex items-baseline justify-between gap-3 px-5 pt-5">
                  <h2 className="display text-[30px] leading-none text-snow">This week</h2>
                  <span className="tnum text-[13px] text-mist">{weekRangeLabel(week)}</span>
                </div>
                <p className="tnum px-5 pt-1.5 text-[13px] text-mist">
                  {prescribed} {prescribed === 1 ? "session" : "sessions"} prescribed
                </p>

                <ol className="mt-3 border-t border-hairline">
                  {week.days.map((day, i) => {
                    const state = stateOf(day);
                    const expanded = open === day.date;
                    const isFuture = day.date > todayKey;
                    const completed = state === "completed";
                    return (
                      <li key={day.date} className="border-b border-hairline last:border-b-0">
                        <button
                          type="button"
                          onClick={() => setOpen(expanded ? null : day.date)}
                          aria-expanded={expanded}
                          className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left"
                        >
                          <span className="w-9 shrink-0">
                            <span
                              className={cn(
                                "block text-[11px] font-medium uppercase tracking-[0.12em]",
                                state === "today" ? "text-azure" : "text-mist",
                              )}
                            >
                              {DAY_NAMES[i] ?? ""}
                            </span>
                            <span className="tnum block text-[15px] text-snow">{parseDate(day.date).getDate()}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate text-[15px]",
                                state === "rest" ? "text-mist" : "font-medium text-snow",
                              )}
                            >
                              {day.title}
                            </span>
                            <span className="tnum block truncate text-[12px] text-mist">{dayMeta(day)}</span>
                          </span>
                          <StateChip state={state} />
                          <ChevronDown
                            size={16}
                            strokeWidth={1.7}
                            aria-hidden="true"
                            className={cn("shrink-0 text-mist transition-transform", expanded && "rotate-180")}
                          />
                        </button>

                        {expanded && (
                          <div className="px-5 pb-5">
                            <div className="rounded-[18px] p-4" style={{ backgroundColor: TINT.blue }}>
                              <h3 className="display text-[26px] leading-[1.05] text-snow">{day.title}</h3>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Chip tone="blue">{FOCUS_LABELS[day.focus] ?? day.focus}</Chip>
                                {day.durationMin ? <Chip>{day.durationMin} minutes</Chip> : null}
                                <Chip>{week.block}</Chip>
                              </div>
                              <p className="mt-3 text-[14px] leading-relaxed text-mist">
                                {day.detail ??
                                  (state === "rest"
                                    ? "A rest day. Nothing is prescribed, and nothing recorded today counts against the plan."
                                    : "The plan carries no notes for this session.")}
                              </p>

                              <div className="mt-4 flex items-center gap-3">
                                <Link
                                  to={`/coach/session/${day.date}`}
                                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold"
                                  style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
                                >
                                  <Play size={14} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                                  {state === "rest" ? "Open the day" : "Start session"}
                                </Link>
                                {state !== "rest" && (
                                  <button
                                    type="button"
                                    disabled={isFuture}
                                    onClick={() => toggleSession(week.index, day.date, day.completed)}
                                    aria-pressed={completed}
                                    title={isFuture ? "Sessions can be marked once the day arrives." : undefined}
                                    className={cn(
                                      "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[14px] font-medium",
                                      completed
                                        ? "border-transparent text-snow"
                                        : "border-hairline-strong text-snow",
                                      isFuture && "opacity-40",
                                    )}
                                    style={completed ? { backgroundColor: TINT.green, color: ACCENT.green } : undefined}
                                  >
                                    <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                                    {completed ? "Done" : "Mark done"}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>

                <div className="px-5 py-4">
                  <Link to="/coach/plan/calendar" className="text-[15px] text-azure">
                    Full calendar and phases →
                  </Link>
                </div>
              </CoachCard>
            </Rise>
          </>
        )}
      </Stagger>
    </Screen>
  );
}

function StateChip({ state }: { state: DayState }) {
  switch (state) {
    case "completed":
      return <Chip tone="green">Completed</Chip>;
    case "today":
      return (
        <Chip tone="blue" filled>
          Today
        </Chip>
      );
    case "upcoming":
      return <Chip>Upcoming</Chip>;
    case "rest":
      return <Chip className="text-mist">Rest</Chip>;
    default:
      // A past session with no tick and no recorded activity. Not "missed":
      // ICEFALL does not know what happened, only that nothing was marked.
      return <Chip className="text-mist">Not marked</Chip>;
  }
}
