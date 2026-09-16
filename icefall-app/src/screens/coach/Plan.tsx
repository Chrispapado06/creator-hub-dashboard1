import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  MoreVertical,
  Mountain as MountainGlyph,
  type LucideIcon,
} from "lucide-react";

import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { ProgressRing } from "@/components/ui/charts";
import { isoDate } from "@/data/mock/clock";
import { FOCUS_LABELS, fmtDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePrimaryGoal, useApp } from "@/state/AppState";
import { DELOAD_SCALE, parseBlockLabel, useTraining } from "@/tracking/training";
import type { TrainingDay, TrainingWeek } from "@/types";
import { useCoachPlanSummary, weekRangeLabel, type PlanPhase } from "@/coach/planSummary";

/**
 * COACH — PLAN, to `docs/design/coach-1to1-spec.md` Part B3/B4 and the
 * owner's brief §1 and §4.2.
 *
 * ONE ROUTE, ONE COMPONENT, TWO VIEWS. `/coach/plan` and
 * `/coach/plan?view=progress` render from the SAME markup tree — the
 * segmented control only swaps which section below it is mounted. This is
 * not a style choice: the brief's §4.2 exists because the mockup's own
 * Schedule and Progress screens disagreed with each other (different session
 * names, a phase "Complete" while its own Schedule view was still inside it,
 * 45% vs 13/243, 106+136≠242). Two screens computing their own arithmetic is
 * how that happens; one screen reading `useCoachPlanSummary()` once cannot
 * produce it, because there is only one place the numbers are computed.
 *
 * EVERY NUMBER ON THIS PAGE COMES FROM `useCoachPlanSummary()` — the shared
 * hook Hub and this screen both read, per the brief's §4.2 "one source of
 * truth" rule. The only other data read here is `useTraining().completedByDate`
 * (per-day completion, for the row status glyph and the mark-done action) and
 * `useTraining().plan.weeks` (to browse a week other than the current one) —
 * neither is a count, a week number, a percentage or a day total, so reading
 * them here does not create a second arithmetic path.
 *
 * THE DELOAD COPY IS REAL, NOT COPIED FROM THE MOCKUP. "65%" is
 * `DELOAD_SCALE` from `tracking/training.ts` — the actual multiplier the
 * generator applies to a deload week — read back rather than retyped, so the
 * sentence can never drift from what the plan actually did.
 *
 * TODAY'S ROW IS THE ONLY ROW THAT OPENS `/coach/session/:date` BY TAPPING
 * IT. Part B3's own table draws a chevron on the today row only; every other
 * row is informational, reached instead through its own "⋯" menu ("View
 * session" / "Mark done"), which is also where a non-today row's mark-done
 * toggle lives now that the old inline expand-in-place is gone.
 */

type DayStatus = "completed" | "today" | "upcoming";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian";

function dayAbbrev(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-GB", { weekday: "short" });
}

function sessionMeta(day: TrainingDay): string {
  if (day.focus === "rest") return day.detail ?? "Rest and recovery.";
  const parts: string[] = [];
  if (day.durationMin) parts.push(`${day.durationMin} min`);
  parts.push(FOCUS_LABELS[day.focus] ?? day.focus);
  return parts.join(" · ");
}

export default function Plan() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: "schedule" | "progress" =
    searchParams.get("view") === "progress" ? "progress" : "schedule";

  const summary = useCoachPlanSummary();
  const training = useTraining();
  const { toggleSession } = useApp();
  const goal = usePrimaryGoal();

  const [weekIndex, setWeekIndex] = useState<number | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [rowMenuFor, setRowMenuFor] = useState<string | null>(null);

  // A menu left open across a week flip or a view switch is a menu pointing
  // at a row that is no longer there.
  useEffect(() => {
    setRowMenuFor(null);
  }, [weekIndex, view]);

  function setView(v: "schedule" | "progress") {
    const next = new URLSearchParams(searchParams);
    if (v === "progress") next.set("view", "progress");
    else next.delete("view");
    setSearchParams(next, { replace: true });
  }

  if (!summary) {
    return (
      <Screen padded={false}>
        <Stagger className="px-5 pb-10 pt-6">
          <Rise>
            <PlanTopBar
              menuOpen={headerMenuOpen}
              onMenu={() => setHeaderMenuOpen((v) => !v)}
              onCloseMenu={() => setHeaderMenuOpen(false)}
            />
          </Rise>
          <Rise className="mt-6">
            <div className="rounded-card border border-hairline bg-graphite p-5">
              <p className="section-label">Plan</p>
              <h2 className="display mt-2 text-[28px] leading-tight text-snow">No plan yet</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-mist">
                ICEFALL builds a week-by-week plan from an objective and its date. Name one and this
                page fills in.
              </p>
              <Link
                to="/goals"
                className={cn(
                  "mt-5 flex h-[52px] items-center justify-center rounded-full bg-azure text-[16px] font-semibold text-obsidian transition-colors hover:bg-azure-bright",
                  FOCUS_RING,
                )}
              >
                Set an objective
              </Link>
            </div>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  const idx = weekIndex ?? summary.currentWeek.index;
  const viewedWeek: TrainingWeek =
    summary.plan.weeks.find((w) => w.index === idx) ?? summary.currentWeek;
  const viewedIsDeload = parseBlockLabel(viewedWeek.block)?.deload ?? false;
  // The same source `useTraining()` itself derives "today" from — not
  // `training.today?.date`, which is `undefined` whenever today's calendar
  // date falls outside the plan's own span, and would then silently disable
  // the future-day guard on the mark-done action below.
  const todayKey = isoDate(new Date());

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-10 pt-6">
        <Rise>
          <PlanTopBar
            menuOpen={headerMenuOpen}
            onMenu={() => setHeaderMenuOpen((v) => !v)}
            onCloseMenu={() => setHeaderMenuOpen(false)}
          />
        </Rise>

        {/* THE SLIM, NON-EDITABLE CONTEXT LINE — brief §4.2 item 3. The
            objective chip that can change the goal lives on the hub alone;
            everywhere else, including here, gets this line only. */}
        <Rise className="mt-4">
          <p className="truncate text-[13px] text-azure-bright">
            {goal?.name ?? "No objective"} · Week {summary.currentWeek.index} ·{" "}
            {summary.currentPhaseLabel}
          </p>
        </Rise>

        <Rise className="mt-5">
          <div
            role="tablist"
            aria-label="Plan view"
            className="flex gap-1 rounded-full bg-slate p-1"
          >
            <button
              type="button"
              role="tab"
              id="plan-tab-schedule"
              aria-selected={view === "schedule"}
              aria-controls="plan-panel-schedule"
              onClick={() => setView("schedule")}
              className={cn(
                "h-11 flex-1 rounded-full text-[13.5px] font-medium transition-colors",
                view === "schedule" ? "bg-azure text-obsidian" : "text-mist hover:text-snow",
                FOCUS_RING,
              )}
            >
              Schedule
            </button>
            <button
              type="button"
              role="tab"
              id="plan-tab-progress"
              aria-selected={view === "progress"}
              aria-controls="plan-panel-progress"
              onClick={() => setView("progress")}
              className={cn(
                "h-11 flex-1 rounded-full text-[13.5px] font-medium transition-colors",
                view === "progress" ? "bg-azure text-obsidian" : "text-mist hover:text-snow",
                FOCUS_RING,
              )}
            >
              Progress
            </button>
          </div>
        </Rise>

        {view === "schedule" ? (
          <div id="plan-panel-schedule" role="tabpanel" aria-labelledby="plan-tab-schedule">
            <Rise className="mt-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setWeekIndex(Math.max(1, idx - 1))}
                  disabled={idx <= 1}
                  aria-label="Previous week"
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow disabled:opacity-30",
                    FOCUS_RING,
                  )}
                >
                  <ChevronLeft size={18} strokeWidth={1.6} aria-hidden="true" />
                </button>
                <div className="text-center">
                  <p className="text-[15px] font-medium text-snow">Week {viewedWeek.index}</p>
                  <p className="tnum mt-0.5 text-[13px] text-mist">
                    {weekRangeLabel(viewedWeek.startDate)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWeekIndex(Math.min(summary.totalWeeks, idx + 1))}
                  disabled={idx >= summary.totalWeeks}
                  aria-label="Next week"
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow disabled:opacity-30",
                    FOCUS_RING,
                  )}
                >
                  <ChevronRight size={18} strokeWidth={1.6} aria-hidden="true" />
                </button>
              </div>
            </Rise>

            <Rise className="mt-4">
              <div className="overflow-hidden rounded-card border border-hairline bg-graphite">
                {viewedWeek.days.map((day) => {
                  const completed = training.completedByDate.get(day.date) ?? day.completed;
                  const isToday = day.date === todayKey;
                  const isFuture = day.date > todayKey;
                  const status: DayStatus = completed
                    ? "completed"
                    : isToday
                      ? "today"
                      : "upcoming";
                  return (
                    <DayRow
                      key={day.date}
                      day={day}
                      status={status}
                      completed={completed}
                      isFuture={isFuture}
                      menuOpen={rowMenuFor === day.date}
                      onOpenMenu={() =>
                        setRowMenuFor((cur) => (cur === day.date ? null : day.date))
                      }
                      onCloseMenu={() => setRowMenuFor(null)}
                      onToggle={() => toggleSession(viewedWeek.index, day.date, day.completed)}
                    />
                  );
                })}
              </div>
            </Rise>

            {viewedIsDeload && (
              <Rise className="mt-4">
                <div className="flex items-start gap-3 rounded-card border border-alert/25 bg-alert/10 p-4">
                  <Lightbulb
                    size={18}
                    strokeWidth={1.7}
                    className="mt-0.5 shrink-0 text-alert"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-snow">Deload week</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-mist">
                      {Math.round(DELOAD_SCALE * 100)}% of your usual block load so earlier weeks
                      are absorbed.
                    </p>
                  </div>
                </div>
              </Rise>
            )}
          </div>
        ) : (
          <div id="plan-panel-progress" role="tabpanel" aria-labelledby="plan-tab-progress">
            <Rise className="mt-6">
              <div className="rounded-card border border-hairline bg-graphite p-5">
                <div className="flex items-center gap-5">
                  <ProgressRing value={summary.sessions.percentOfPrescribed} size={92} stroke={7}>
                    <span className="tnum text-[22px] font-semibold text-snow">
                      {summary.sessions.percentOfPrescribed}%
                    </span>
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold text-snow">
                      Week {summary.currentWeek.index} of {summary.totalWeeks}
                    </p>
                    <p className="tnum mt-2 text-[13px] text-mist">
                      {summary.daysCompleted} days completed
                    </p>
                    <p className="tnum text-[13px] text-mist">
                      {summary.daysRemaining} days remaining
                    </p>
                  </div>
                </div>
                <p className="mt-4 border-t border-hairline pt-3 text-[12px] leading-relaxed text-mist-dim">
                  Of prescribed sessions completed to date — not a readiness figure.
                </p>
              </div>
            </Rise>

            <Rise className="mt-4">
              <div className="grid grid-cols-3 gap-3">
                <StatTile icon={Check} value={summary.sessions.completedToDate} label="Logged" />
                <StatTile
                  icon={Calendar}
                  value={summary.sessions.remainingTotal}
                  label="Remaining"
                />
                <StatTile icon={MountainGlyph} value={summary.totalWeeks} label="Weeks" />
              </div>
            </Rise>

            <Rise className="mt-4">
              <div className="rounded-card border border-hairline bg-graphite p-5">
                <p className="text-[15px] font-semibold text-snow">Milestones</p>
                {summary.phases.length > 0 ? (
                  <ol className="mt-1 divide-y divide-hairline">
                    {summary.phases.map((phase) => (
                      <MilestoneRow key={`${phase.kind}-${phase.weekStart}`} phase={phase} />
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-[13px] leading-relaxed text-mist">
                    The plan has no phases to show yet.
                  </p>
                )}
              </div>
            </Rise>
          </div>
        )}
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Top bar — "‹ Coach" / "Plan" / "⋮", the shape every non-hub Coach page uses */
/* -------------------------------------------------------------------------- */

function PlanTopBar({
  menuOpen,
  onMenu,
  onCloseMenu,
}: {
  menuOpen: boolean;
  onMenu: () => void;
  onCloseMenu: () => void;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
      <Link
        to="/coach"
        className={cn(
          "-ml-2 inline-flex items-center gap-1 rounded-full py-2 pl-2 pr-3 text-mist transition-colors hover:text-snow",
          FOCUS_RING,
        )}
      >
        <ChevronLeft size={20} strokeWidth={1.6} aria-hidden="true" />
        <span className="text-[15px]">Coach</span>
      </Link>
      <h1 className="display justify-self-center text-[20px] text-snow">Plan</h1>
      <div className="relative justify-self-end">
        <button
          type="button"
          aria-label="Plan options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={onMenu}
          className={cn(
            "grid h-11 w-11 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow",
            FOCUS_RING,
          )}
        >
          <MoreVertical size={19} strokeWidth={1.7} aria-hidden="true" />
        </button>
        {menuOpen && (
          <>
            {/* Click-outside catcher. A `fixed` full-screen button rather than
                a document listener — the same trick the app's other overflow
                menu (`PostCard`'s "⋯") uses, and it closes on Escape for free
                because the menu items are plain focusable elements. */}
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={onCloseMenu}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div
              role="menu"
              aria-label="Plan options"
              className="absolute right-0 top-12 z-20 w-56 overflow-hidden rounded-tile border border-hairline-strong bg-slate shadow-lg"
            >
              <Link
                role="menuitem"
                to="/coach/plan/calendar"
                onClick={onCloseMenu}
                className="block px-4 py-3 text-[13.5px] text-snow transition-colors hover:bg-white/[0.04]"
              >
                Full calendar &amp; phases
              </Link>
              <Link
                role="menuitem"
                to="/coach/plan/changes"
                onClick={onCloseMenu}
                className="block border-t border-hairline px-4 py-3 text-[13.5px] text-snow transition-colors hover:bg-white/[0.04]"
              >
                Plan changes
              </Link>
              <Link
                role="menuitem"
                to="/coach/review"
                onClick={onCloseMenu}
                className="block border-t border-hairline px-4 py-3 text-[13.5px] text-snow transition-colors hover:bg-white/[0.04]"
              >
                Weekly review
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Schedule — one day row                                                     */
/* -------------------------------------------------------------------------- */

function StatusGlyph({ status, small }: { status: DayStatus; small?: boolean }) {
  const size = small ? "h-[18px] w-[18px]" : "h-6 w-6";
  if (status === "completed") {
    return (
      <span
        aria-label="Completed"
        className={cn(
          "grid shrink-0 place-items-center rounded-full border border-summit bg-summit text-obsidian",
          size,
        )}
      >
        <Check size={small ? 10 : 13} strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (status === "today") {
    return (
      <span
        aria-label="Today"
        className={cn("grid shrink-0 place-items-center rounded-full border-2 border-azure", size)}
      >
        <span className={cn("rounded-full bg-azure", small ? "h-1.5 w-1.5" : "h-2.5 w-2.5")} />
      </span>
    );
  }
  return (
    <span
      aria-label="Not yet marked"
      className={cn("shrink-0 rounded-full border border-hairline-strong", size)}
    />
  );
}

function DayRow({
  day,
  status,
  completed,
  isFuture,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onToggle,
}: {
  day: TrainingDay;
  status: DayStatus;
  completed: boolean;
  isFuture: boolean;
  menuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onToggle: () => void;
}) {
  const isToday = status === "today";
  const content = (
    <>
      <span className="w-10 shrink-0">
        <span
          className={cn(
            "block text-[11px] font-medium uppercase tracking-[0.1em]",
            isToday ? "text-azure" : "text-mist",
          )}
        >
          {dayAbbrev(day.date)}
        </span>
        <span className="tnum block text-[14px] text-snow">{fmtDateShort(day.date)}</span>
      </span>
      <span className="min-w-0 flex-1">
        {/* No `truncate` here on purpose: a real session's name (e.g.
            "Strength — Lower Body" on the highlighted today row, which also
            carries a status dot AND a chevron) was clipping mid-word at
            narrow widths. Wrapping to two lines shows the real name in full
            instead of hiding part of it. */}
        <span
          className={cn(
            "block text-[15px] leading-snug",
            day.focus === "rest" ? "text-mist" : "font-medium text-snow",
          )}
        >
          {day.title}
        </span>
        <span className="tnum block truncate text-[12px] text-mist">{sessionMeta(day)}</span>
      </span>
      <StatusGlyph status={status} />
    </>
  );

  return (
    <div
      className={cn(
        "relative flex items-center gap-3.5 border-b border-hairline px-4 py-3.5 last:border-b-0",
        isToday && "bg-azure/12",
      )}
    >
      {isToday ? (
        <Link
          to={`/coach/session/${day.date}`}
          className={cn("flex min-w-0 flex-1 items-center gap-3.5 rounded-[10px]", FOCUS_RING)}
        >
          {content}
          <ChevronRight
            size={16}
            strokeWidth={1.8}
            className="shrink-0 text-azure"
            aria-hidden="true"
          />
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3.5">{content}</div>
      )}

      <div className="relative shrink-0">
        <button
          type="button"
          aria-label={`Options for ${day.title}, ${dayAbbrev(day.date)} ${fmtDateShort(day.date)}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={onOpenMenu}
          className={cn(
            "grid h-11 w-11 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow",
            FOCUS_RING,
          )}
        >
          <MoreVertical size={17} strokeWidth={1.7} aria-hidden="true" />
        </button>
        {menuOpen && (
          <>
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={onCloseMenu}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div
              role="menu"
              aria-label={`Options for ${day.title}`}
              className="absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-tile border border-hairline-strong bg-slate shadow-lg"
            >
              {!isToday && (
                <Link
                  role="menuitem"
                  to={`/coach/session/${day.date}`}
                  onClick={onCloseMenu}
                  className="block px-4 py-3 text-[13.5px] text-snow transition-colors hover:bg-white/[0.04]"
                >
                  View session
                </Link>
              )}
              <button
                role="menuitem"
                type="button"
                disabled={isFuture}
                onClick={() => {
                  onToggle();
                  onCloseMenu();
                }}
                className={cn(
                  "block w-full px-4 py-3 text-left text-[13.5px] text-snow transition-colors hover:bg-white/[0.04] disabled:opacity-40",
                  !isToday && "border-t border-hairline",
                )}
              >
                {completed
                  ? "Mark not done"
                  : day.focus === "rest"
                    ? "Mark rest day as taken"
                    : "Mark done"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

function StatTile({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-card border border-hairline bg-graphite p-4 text-center">
      <Icon size={16} strokeWidth={1.7} className="mx-auto text-azure" aria-hidden="true" />
      <p className="tnum mt-2 text-[22px] font-semibold text-snow">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-mist">{label}</p>
    </div>
  );
}

function MilestoneRow({ phase }: { phase: PlanPhase }) {
  const label =
    phase.status === "complete"
      ? "Complete"
      : phase.status === "in-progress"
        ? "In progress"
        : "Not started";
  const glyphStatus: DayStatus =
    phase.status === "complete"
      ? "completed"
      : phase.status === "in-progress"
        ? "today"
        : "upcoming";
  return (
    <li className="flex items-center justify-between gap-3 py-3.5">
      <div className="min-w-0">
        <p className="text-[14.5px] font-medium text-snow">{phase.label} phase</p>
        <p className="tnum text-[12.5px] text-mist">
          Weeks {phase.weekStart}–{phase.weekEnd}
        </p>
      </div>
      <span
        className={cn(
          "flex shrink-0 items-center gap-2 text-[12.5px]",
          phase.status === "complete"
            ? "text-summit"
            : phase.status === "in-progress"
              ? "text-azure"
              : "text-mist",
        )}
      >
        {label}
        <StatusGlyph status={glyphStatus} small />
      </span>
    </li>
  );
}
