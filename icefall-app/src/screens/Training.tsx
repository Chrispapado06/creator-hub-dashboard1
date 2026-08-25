import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { useState } from "react";
import { Badge, Card, SectionLabel } from "@/components/ui/primitives";
import { ProgressRing } from "@/components/ui/charts";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { TrainingDayRow } from "@/components/domain/cards";
import { cn } from "@/lib/utils";
import { fmtDistance, fmtElevation } from "@/lib/format";
import { isoDate } from "@/data/mock/clock";
import { useTraining } from "@/tracking/training";
import { useApp } from "@/state/AppState";

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/**
 * Screen 07 — the plan that gets you there.
 *
 * The plan is generated from the current objective rather than fixed to one
 * mountain, and sessions tick themselves off when a recorded activity does the
 * work. That connection is what makes it a plan rather than a poster.
 */
export default function Training() {
  const { plan, goal, completedByDate, satisfiedByActivity, preparation } = useTraining();
  const { toggleSession } = useApp();
  const [weekIndex, setWeekIndex] = useState<number | null>(null);

  if (!plan || !goal) {
    return (
      <Screen>
        <p className="py-16 text-center text-[13px] text-mist-dim">
          Set an objective and ICEFALL will build the plan around it.
        </p>
      </Screen>
    );
  }

  const idx = weekIndex ?? plan.currentWeek;
  const week = plan.weeks.find((w) => w.index === idx) ?? plan.weeks[0];
  const today = isoDate(new Date());

  const days = week.days.map((d) => ({
    ...d,
    completed: completedByDate.get(d.date) ?? d.completed,
  }));

  const sessions = days.filter((d) => d.focus !== "rest");
  const done = sessions.filter((d) => d.completed).length;
  const weekDistance = days.reduce((a, d) => a + (d.distanceKm ?? 0), 0);
  const weekElevation = days.reduce((a, d) => a + (d.elevationM ?? 0), 0);
  const autoCount = days.filter((d) => satisfiedByActivity.has(d.date)).length;

  return (
    <Screen>
      <Stagger>
        <Rise className="pt-5">
          <p className="section-label">Training plan</p>
          <h2 className="mt-1.5 text-[22px] font-light tracking-[-0.02em] text-snow">
            {plan.title}
          </h2>
          <p className="mt-1 text-[12px] text-mist-dim">
            Week {plan.currentWeek} of {plan.totalWeeks} · built for {goal.name}
          </p>
        </Rise>

        {/* Week navigator */}
        <Rise className="pt-5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setWeekIndex(Math.max(1, idx - 1))}
              disabled={idx <= 1}
              aria-label="Previous week"
              className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow disabled:opacity-30"
            >
              <ChevronLeft size={18} strokeWidth={1.5} />
            </button>
            <div className="text-center">
              <p className="text-[15px] text-snow">Week {week.index}</p>
              <p className="section-label mt-1">{week.block}</p>
            </div>
            <button
              type="button"
              onClick={() => setWeekIndex(Math.min(plan.totalWeeks, idx + 1))}
              disabled={idx >= plan.totalWeeks}
              aria-label="Next week"
              className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow disabled:opacity-30"
            >
              <ChevronRight size={18} strokeWidth={1.5} />
            </button>
          </div>

          <div className="mt-4 flex gap-1.5">
            {days.map((d, i) => {
              const isToday = d.date === today;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      "text-[9px] font-medium tracking-[0.1em]",
                      isToday ? "text-azure" : "text-mist-dim",
                    )}
                  >
                    {DAY_LABELS[i][0]}
                  </span>
                  <span
                    className={cn(
                      "h-1 w-full rounded-full",
                      d.completed
                        ? "bg-summit"
                        : d.focus === "rest"
                          ? "bg-white/[0.07]"
                          : isToday
                            ? "bg-azure"
                            : "bg-white/20",
                    )}
                  />
                </div>
              );
            })}
          </div>
        </Rise>

        {/* Week summary */}
        <Rise className="pt-5">
          <Card>
            <div className="flex items-center gap-5">
              <ProgressRing
                value={sessions.length ? (done / sessions.length) * 100 : 0}
                size={64}
                stroke={2.5}
              >
                <span className="tnum text-[12px] text-snow">
                  {done}/{sessions.length}
                </span>
              </ProgressRing>
              <div className="grid flex-1 grid-cols-2 gap-3">
                <div>
                  <div className="tnum text-[17px] font-light leading-none text-snow">
                    {fmtDistance(weekDistance)}
                    <span className="ml-0.5 text-[11px] text-mist">km</span>
                  </div>
                  <div className="section-label mt-2">Planned</div>
                </div>
                <div>
                  <div className="tnum text-[17px] font-light leading-none text-snow">
                    {fmtElevation(weekElevation)}
                    <span className="ml-0.5 text-[11px] text-mist">m</span>
                  </div>
                  <div className="section-label mt-2">Ascent</div>
                </div>
              </div>
            </div>
            {autoCount > 0 && (
              <p className="mt-4 flex items-center gap-2 border-t border-hairline pt-3.5 text-[11px] text-summit">
                <Zap size={12} strokeWidth={1.8} />
                {autoCount} {autoCount === 1 ? "session" : "sessions"} ticked off by activities you
                recorded
              </p>
            )}
          </Card>
        </Rise>

        {/* Preparation — derived, and shown as such */}
        {preparation && (
          <Rise className="pt-6">
            <SectionLabel
              action={<span className="tnum section-label text-azure">{preparation.percent}%</span>}
            >
              Preparation for {goal.name}
            </SectionLabel>
            <Card className="mt-3">
              <div className="space-y-3.5">
                {preparation.parts.map((p) => (
                  <div key={p.label}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] text-mist">{p.label}</span>
                      <span className="tnum text-[12px] text-snow">{p.percent}%</span>
                    </div>
                    <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-azure"
                        style={{ width: `${p.percent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-mist-dim">{p.detail}</p>
                  </div>
                ))}
              </div>
            </Card>
          </Rise>
        )}

        {/* Days */}
        <Rise className="pt-6">
          <SectionLabel>Sessions</SectionLabel>
          <Card className="mt-3" inset={false}>
            <div className="px-4">
              {days.map((d, i) => (
                <div key={d.date} className="relative">
                  <TrainingDayRow
                    day={d}
                    dayLabel={DAY_LABELS[i]}
                    onToggle={() =>
                      toggleSession(
                        week.index,
                        d.date,
                        satisfiedByActivity.has(d.date) || week.days[i].completed,
                      )
                    }
                  />
                  {satisfiedByActivity.has(d.date) && (
                    <Badge tone="summit" className="absolute right-9 top-4">
                      Recorded
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </Rise>
      </Stagger>
    </Screen>
  );
}
