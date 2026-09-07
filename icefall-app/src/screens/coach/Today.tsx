import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUp,
  Check,
  ChevronRight,
  Droplets,
  MessageCircle,
  MountainSnow,
  PenLine,
  Play,
  Timer,
  Utensils,
} from "lucide-react";

import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { useCoachIntel } from "@/coach/hooks";
import { fuellingFor } from "@/coach/nutrition";
import { COACH_DISCLAIMER } from "@/coach/types";
import { fmtElevation } from "@/lib/format";
import { useApp } from "@/state/AppState";
import { useTraining } from "@/tracking/training";
import type { TrainingWeek } from "@/types";
import { ACCENT, Chip, CoachCard, CoachHead, Eyebrow, ON_PRIMARY, PRIMARY, TILE, TINT } from "./shell";

/**
 * COACH — TODAY, to the owner's design of 2026-09-04. The default Coach page.
 *
 * Four cards, in the drawing's order: the next step, this week, today's fuel,
 * a coach note. Every figure on them is the plan's own or a count of what the
 * athlete marked done:
 *
 *   · "Your next step" is `useTraining().today` — the day the generated plan
 *     holds for today, with its own title, duration and ascent. The drawing's
 *     "Zone 2" chip has no counterpart in a `TrainingDay` (there is no
 *     intensity zone in the data), so it is not drawn. The phase chip is the
 *     plan's block, verbatim, the same string Home prints.
 *   · "This week" counts the current week's prescribed sessions (rest days
 *     excluded) against `completedByDate`, which already merges the athlete's
 *     own ticks with recorded activities. The bars are one per prescribed
 *     session, filled where that session is done — not a percentage.
 *   · "Today's fuel" is the first line of each part of `fuellingFor(today)`,
 *     the same guidance Fuel prints in full.
 *   · The coach note is `briefing.note`, the sentence the engine wrote for
 *     today. It is quoted because it is the coach's line, not the page's.
 *
 * "Start session" opens the session page for today, which is where the plan's
 * full prescription, the fuelling and the record control already live. The
 * drawing's elevation-profile flourish under the chips is not drawn: a rising
 * curve beside "↑ 620 m" reads as a profile of the route, and no route exists
 * for a prescribed session.
 */

function parseDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** "14–20 Oct" or "28 Oct – 3 Nov". The real dates, not the drawing's "Mon · Sun". */
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

export default function Today() {
  const intel = useCoachIntel();
  const training = useTraining();
  const { bodyMassKgSet } = useApp();

  const today = training.today;
  const week = training.currentWeek;

  const planned = useMemo(() => (week ? week.days.filter((d) => d.focus !== "rest") : []), [week]);
  const done = useMemo(
    () => planned.filter((d) => training.completedByDate.get(d.date) === true).length,
    [planned, training.completedByDate],
  );
  const remaining = planned.length - done;

  const fuel = useMemo(
    () => fuellingFor({ day: today, bodyMassKg: bodyMassKgSet ?? undefined }),
    [today, bodyMassKgSet],
  );

  // The briefing can hold today's session down (illness, a hard day yesterday);
  // when its focus differs from the plan's, the plan's day is shown with that
  // said beside it rather than silently swapped.
  const eased = Boolean(
    today && intel.briefing.training && intel.briefing.training.focus !== today.focus,
  );
  const isRest = today?.focus === "rest";

  const fuelRows = [
    { label: "Before your session", line: fuel.before[0], icon: Timer, tint: "peach" as const },
    { label: "During your session", line: fuel.during[0], icon: Droplets, tint: "blue" as const },
    { label: "After your session", line: fuel.after[0], icon: Check, tint: "green" as const },
  ].filter((r): r is typeof r & { line: string } => typeof r.line === "string" && r.line.length > 0);

  const weekLine = !week
    ? "Set an objective and ICEFALL builds the week around it."
    : planned.length === 0
      ? "A recovery week — nothing is prescribed."
      : remaining === 0
        ? "Every session this week is done."
        : `${remaining} ${remaining === 1 ? "session" : "sessions"} left this week.`;

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-10 pt-6">
        <Rise>
          {/* "Today", not "Coach". This page used to be the section's landing
              surface and carried the section's name; `/coach` is now the hub,
              which owns that name and which `CoachHead` draws a chevron back
              to. Left as "Coach" the page would read "← Coach" directly above a
              56px serif "Coach", which looks like a rendering fault. */}
          <CoachHead
            title="Today"
            subtitle="Your preparation, one step at a time."
            objectiveDetail="elevation"
          />
        </Rise>

        {/* ---- Your next step -------------------------------------------- */}
        <Rise className="mt-5">
          <CoachCard tint="blue">
            <div className="flex items-start justify-between gap-3">
              <Eyebrow className="pt-2">Your next step</Eyebrow>
              <span
                aria-hidden="true"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px]"
                style={{ backgroundColor: TILE, color: ACCENT.blue }}
              >
                <MountainSnow size={20} strokeWidth={1.6} />
              </span>
            </div>

            {today ? (
              <>
                <h2 className="display mt-1 text-[36px] leading-[1.02] text-snow">{today.title}</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {typeof today.durationMin === "number" && today.durationMin > 0 && (
                    <Chip tone="blue">{today.durationMin} minutes</Chip>
                  )}
                  {week && <Chip>{week.block}</Chip>}
                  {typeof today.elevationM === "number" && today.elevationM > 0 && (
                    <Chip>
                      <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
                      {fmtElevation(today.elevationM)} m
                    </Chip>
                  )}
                  {isRest && <Chip>Rest</Chip>}
                  {eased && <Chip tone="peach">Eased today</Chip>}
                </div>
                {eased && (
                  <p className="mt-3 text-[13px] leading-relaxed text-mist">{intel.briefing.status}</p>
                )}
                {intel.cold && (
                  <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
                    Nothing is recorded yet, so this is the plan's prescription rather than a read
                    of your form.
                  </p>
                )}
                <Link
                  to={`/coach/session/${today.date}`}
                  className="mt-5 flex h-[52px] items-center justify-center gap-2.5 rounded-full text-[16px] font-semibold transition-transform active:scale-[0.985]"
                  style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
                >
                  <Play size={15} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                  {isRest ? "Open today" : "Start session"}
                </Link>
              </>
            ) : (
              <>
                <h2 className="display mt-1 text-[36px] leading-[1.02] text-snow">
                  {intel.goal ? "Nothing planned today" : "Name the mountain"}
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-mist">
                  {intel.goal
                    ? "There is no session in your plan for today. Anything you record still counts."
                    : "The plan, the fuelling and the coach all follow an objective. Set one and today has a step."}
                </p>
                <Link
                  to={intel.goal ? "/activity/select" : "/goals"}
                  className="mt-5 flex h-[52px] items-center justify-center gap-2.5 rounded-full text-[16px] font-semibold"
                  style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
                >
                  <Play size={15} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                  {intel.goal ? "Record a session" : "Set an objective"}
                </Link>
              </>
            )}
          </CoachCard>
        </Rise>

        {/* ---- This week -------------------------------------------------- */}
        <Rise className="mt-4">
          <CoachCard>
            <Eyebrow>This week</Eyebrow>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <h2 className="display text-[32px] leading-none text-snow">
                {week ? `${done} of ${planned.length} ${planned.length === 1 ? "session" : "sessions"}` : "No plan yet"}
              </h2>
              {week && <span className="tnum shrink-0 text-[14px] text-mist">{weekRangeLabel(week)}</span>}
            </div>

            {week && planned.length > 0 && (
              <div className="mt-4 flex gap-2" aria-hidden="true">
                {planned.map((d) => (
                  <span
                    key={d.date}
                    className="h-2 flex-1 rounded-full"
                    style={{
                      backgroundColor:
                        training.completedByDate.get(d.date) === true ? ACCENT.blue : TINT.blue,
                    }}
                  />
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[14px] leading-snug text-mist">{weekLine}</p>
              <Link
                to={week ? "/coach/plan" : "/goals"}
                className="shrink-0 text-[15px] text-azure"
              >
                {week ? "View full plan →" : "Set an objective →"}
              </Link>
            </div>
          </CoachCard>
        </Rise>

        {/* ---- Today's fuel ----------------------------------------------- */}
        <Rise className="mt-4">
          <CoachCard tint="blue">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Eyebrow>Today's fuel</Eyebrow>
                <h2 className="display mt-1.5 text-[30px] leading-none text-snow">Eat with intention</h2>
              </div>
              <span
                aria-hidden="true"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border"
                style={{ backgroundColor: TILE, color: ACCENT.blue, borderColor: TINT.blue }}
              >
                <Utensils size={18} strokeWidth={1.6} />
              </span>
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-mist">
              Nutrition and hydration guidance for this session.
            </p>

            {fuelRows.length > 0 ? (
              <div className="mt-4 space-y-2.5">
                {fuelRows.map((row) => {
                  const Icon = row.icon;
                  return (
                    <Link
                      key={row.label}
                      to="/coach/fuel"
                      className="flex items-center gap-3.5 rounded-[16px] px-3.5 py-3"
                      style={{ backgroundColor: TILE }}
                    >
                      <span
                        aria-hidden="true"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                        style={{ backgroundColor: TINT[row.tint], color: ACCENT[row.tint] }}
                      >
                        <Icon size={16} strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-snow">{row.label}</span>
                        <span className="block truncate text-[13px] text-mist">{row.line}</span>
                      </span>
                      <ChevronRight size={16} strokeWidth={1.7} className="shrink-0 text-mist" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-[13px] leading-relaxed text-mist">{fuel.context}</p>
            )}

            <Link to="/coach/fuel" className="mt-4 inline-block text-[15px] text-azure">
              View Fuel →
            </Link>
          </CoachCard>
        </Rise>

        {/* ---- Coach note ------------------------------------------------- */}
        <Rise className="mt-4">
          <CoachCard>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: TINT.lavender, color: ACCENT.lavender }}
              >
                <PenLine size={15} strokeWidth={1.7} />
              </span>
              <Eyebrow>Coach note</Eyebrow>
            </div>
            <blockquote className="display mt-4 text-[26px] italic leading-[1.15] text-snow">
              “{intel.briefing.note}”
            </blockquote>
            <div className="mt-5 flex items-center gap-4">
              <Link
                to="/coach/chat"
                className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-hairline-strong px-4 text-[15px] font-medium text-snow"
              >
                <MessageCircle size={16} strokeWidth={1.7} aria-hidden="true" />
                Ask Coach
              </Link>
              <Link to="/coach/check-in" className="text-[14px] text-mist">
                Daily check-in
              </Link>
            </div>
          </CoachCard>
        </Rise>

        <Rise className="mt-6">
          <p className="text-[11px] leading-relaxed text-mist-dim">{COACH_DISCLAIMER}</p>
        </Rise>
      </Stagger>
    </Screen>
  );
}
