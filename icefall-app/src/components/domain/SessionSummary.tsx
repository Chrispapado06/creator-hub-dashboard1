import { Link } from "react-router-dom";
import { Calendar, Check, Flag, Mountain as MountainIcon, Trophy } from "lucide-react";
import { SectionLabel } from "@/components/ui/primitives";
import { fmtDistance, fmtElevation } from "@/lib/format";
import { LOAD_DISCLAIMER, mountainLoad, personalBests } from "@/tracking/analysis";
import {
  bestToday, journeyTotals, milestonesFor, nextMilestone, whyItMattered,
} from "@/tracking/achievement";
import type { RecordedActivity } from "@/tracking/types";
import type { Goal } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The signature post-activity panels, built to the supplied mockup.
 *
 * Every card here is allowed to be absent. `bestToday` returns null when the
 * session set no record and broke no streak, and this file renders the honest
 * alternative rather than promoting something that is not true — the mockup's
 * "New!" flag appears only for a genuine all-time record, and "Previous best"
 * only when there is a previous best to name.
 *
 * Kept out of `ActivitySummary` so the panels can be reused on the completion
 * screen without the two drifting apart.
 */

export function SessionPanels({
  activity,
  all,
  goal,
  packKg,
}: {
  /**
   * The recording behind this screen — ABSENT for a seeded or imported
   * activity that carries no track.
   *
   * That case is the common one on an existing account, and gating the whole
   * panel set on it made the redesign invisible on every activity the athlete
   * already had. So the panels split by what each one actually needs: "best
   * today" and "why this mattered" describe THIS session and are withheld
   * without it, while the journey, the milestones and what comes next describe
   * the ATHLETE and are drawn from every recording they own.
   */
  activity?: RecordedActivity;
  all: RecordedActivity[];
  goal?: Goal;
  packKg?: number;
}) {
  const best = activity ? bestToday(activity, all) : null;
  const load = activity ? mountainLoad(activity, packKg) : [];
  const journey = journeyTotals(all);
  const milestones = milestonesFor(journey.totalVerticalM);
  const bests = personalBests(all);
  const next = nextMilestone(journey.totalVerticalM);

  const daysToObjective = goal
    ? Math.max(
        0,
        Math.round((new Date(goal.targetDate).getTime() - Date.now()) / 86_400_000),
      )
    : null;

  return (
    <div className="space-y-3">
      {/* ---- Your best today ------------------------------------------- */}
      {activity && (
      <div className="rounded-card border border-hairline bg-graphite p-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Your best today</SectionLabel>
          {best?.isPersonalBest && (
            <span className="rounded-pill border border-azure/55 bg-azure/[0.12] px-2.5 py-[3px] text-[9.5px] uppercase tracking-[0.1em] text-azure">
              New
            </span>
          )}
        </div>

        {best ? (
          <div className="mt-3.5 flex items-center gap-4">
            <span
              className={cn(
                "grid h-[62px] w-[62px] shrink-0 place-items-center rounded-full border",
                best.isPersonalBest
                  ? "border-azure/55 bg-azure/[0.07] text-azure"
                  : "border-hairline-strong text-mist",
              )}
            >
              <Trophy size={22} strokeWidth={1.4} />
            </span>
            <div className="min-w-0">
              <p className="text-[17px] font-light leading-snug text-snow">{best.headline}</p>
              {best.detail && (
                <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">{best.detail}</p>
              )}
            </div>
          </div>
        ) : (
          /* The mockup always shows an achievement. Sometimes there isn't one,
             and saying so is better than promoting an ordinary day. */
          <div className="mt-3.5">
            <p className="text-[16px] font-light text-snow">You showed up</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">
              {activity.simulated
                ? "A simulated session — it earns no records, and counts towards nothing."
                : "No record this time. The work still counts."}
            </p>
          </div>
        )}
      </div>
      )}

      {/* ---- Why this mattered ------------------------------------------ */}
      {activity && load.length > 0 && (
      <div className="rounded-card border border-hairline bg-graphite p-4">
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>Why this mattered</SectionLabel>
          <span className="text-[10px] text-mist-dim">Training stimulus</span>
        </div>
        <div className="mt-3.5 space-y-2.5">
          {load.map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <span className="w-[104px] shrink-0 text-[11.5px] text-mist">{f.label}</span>
              <span className="flex h-1.5 flex-1 gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-full flex-1 rounded-full",
                      i <= f.score ? "bg-azure" : "bg-white/[0.07]",
                    )}
                  />
                ))}
              </span>
              <span className="tnum w-6 shrink-0 text-right text-[11px] text-mist-dim">
                {f.score}/5
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3.5 text-[12px] leading-relaxed text-mist">{whyItMattered(activity)}</p>
        <p className="mt-2 text-[10px] leading-relaxed text-mist-dim">{LOAD_DISCLAIMER}</p>
      </div>
      )}

      {!activity && (
        <div className="rounded-card border border-hairline bg-graphite p-4">
          <SectionLabel>This session</SectionLabel>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-dim">
            No GPS recording is stored for this activity, so there is nothing to judge it against —
            no record, no training stimulus, no replay. Your journey below still counts everything
            ICEFALL has actually recorded.
          </p>
        </div>
      )}

      {/* ---- Your journey ----------------------------------------------- */}
      <div className="rounded-card border border-hairline bg-graphite p-4">
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>Your journey</SectionLabel>
          {goal && (
            <Link to="/goals" className="text-[11.5px] text-azure hover:underline">
              {goal.name} →
            </Link>
          )}
        </div>

        <div className="mt-4 flex items-center gap-5">
          {goal && <PreparationRing pct={goal.preparation} />}
          <div className="min-w-0 flex-1 space-y-3">
            <JourneyRow label="Today" value={`+${fmtElevation(journey.todayVerticalM)} m`} />
            <JourneyRow
              label="This week"
              value={`${journey.weekActivities} ${journey.weekActivities === 1 ? "activity" : "activities"}`}
              sub={`${fmtElevation(journey.weekVerticalM)} m`}
            />
            <JourneyRow
              label="This month"
              value={`${journey.monthActivities} ${journey.monthActivities === 1 ? "activity" : "activities"}`}
              sub={`${fmtElevation(journey.monthVerticalM)} m`}
            />
          </div>
        </div>

        <p className="tnum mt-3.5 border-t border-hairline pt-3 text-[11.5px] text-mist-dim">
          Total vertical so far: {fmtElevation(journey.totalVerticalM)} m
        </p>
        {goal && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-mist-dim">
            Preparation is your training progress, not a judgement that the mountain is safe.
          </p>
        )}
      </div>

      {/* ---- Milestones -------------------------------------------------- */}
      <div className="rounded-card border border-hairline bg-graphite p-4">
        <SectionLabel>Milestones</SectionLabel>
        <div className="mt-3.5 space-y-3">
          {milestones.slice(0, 5).map((m) => {
            const pct = Math.min(100, Math.round((journey.totalVerticalM / m.targetM) * 100));
            return (
              <div key={m.id} className="flex items-center gap-3">
                <MountainIcon
                  size={14}
                  strokeWidth={1.5}
                  className={cn("shrink-0", m.reached ? "text-azure" : "text-mist-dim")}
                />
                <span className="w-[100px] shrink-0 text-[11.5px] text-snow">{m.label}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <span
                    className="block h-full rounded-full bg-azure"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                {m.reached ? (
                  <Check size={13} strokeWidth={2.2} className="shrink-0 text-azure" />
                ) : (
                  <span className="tnum w-8 shrink-0 text-right text-[10.5px] text-mist-dim">
                    {pct}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Personal bests ---------------------------------------------- */}
      {bests.length > 0 && (
        <div className="rounded-card border border-hairline bg-graphite p-4">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Personal bests</SectionLabel>
            <Link to="/activity" className="text-[11.5px] text-mist hover:text-snow">
              View all
            </Link>
          </div>
          <div className="mt-3 space-y-2.5">
            {bests.map((b) => {
              const isThis = activity ? b.activityId === activity.id : false;
              return (
                <div key={b.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-snow">{b.label}</span>
                    <span className="tnum mt-0.5 block text-[11px] text-mist-dim">{b.value}</span>
                  </span>
                  {isThis && (
                    <span className="shrink-0 rounded-pill border border-azure/55 bg-azure/[0.12] px-2 py-[3px] text-[9px] uppercase tracking-[0.09em] text-azure">
                      New best
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-mist-dim">
            Records come from real recordings. A simulated activity never sets one.
          </p>
        </div>
      )}

      {/* ---- What's next --------------------------------------------------- */}
      <div className="rounded-card border border-hairline bg-graphite p-4">
        <SectionLabel>What's next</SectionLabel>
        <div className="mt-3 space-y-2.5">
          {next && (
            <NextRow
              icon={Flag}
              title="Next milestone"
              detail={`${fmtElevation(next.remainingM)} m to ${next.label}`}
            />
          )}
          {goal && daysToObjective !== null && (
            <NextRow
              icon={Calendar}
              title={`${daysToObjective} ${daysToObjective === 1 ? "day" : "days"}`}
              detail={`Until ${goal.name}`}
              to="/goals"
            />
          )}
          <NextRow
            icon={MountainIcon}
            title="Plan the next session"
            detail="Your coach picks it from what you have actually done"
            to="/coach"
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PreparationRing({ pct }: { pct: number }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  const filled = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: 76, height: 76 }}>
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
        <circle
          cx="38"
          cy="38"
          r={R}
          fill="none"
          stroke="var(--ice-azure)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(filled / 100) * C} ${C}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="text-center">
          <span className="tnum block text-[19px] font-light leading-none text-snow">
            {Math.round(filled)}%
          </span>
          <span className="mt-0.5 block text-[7.5px] uppercase tracking-[0.12em] text-mist-dim">
            Prepared
          </span>
        </span>
      </span>
    </div>
  );
}

function JourneyRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-b border-hairline pb-2.5 last:border-0 last:pb-0">
      <p className="text-[9.5px] uppercase tracking-[0.12em] text-mist-dim">{label}</p>
      <p className="tnum mt-0.5 text-[14px] text-snow">
        {value}
        {sub && <span className="text-[12px] text-mist"> · {sub}</span>}
      </p>
    </div>
  );
}

function NextRow({
  icon: Icon,
  title,
  detail,
  to,
}: {
  icon: typeof Flag;
  title: string;
  detail: string;
  to?: string;
}) {
  const inner = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline-strong text-azure">
        <Icon size={15} strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-snow">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-mist-dim">{detail}</span>
      </span>
    </>
  );
  const cls =
    "flex items-center gap-3 rounded-tile border border-hairline bg-slate/30 px-3 py-2.5";
  return to ? (
    <Link to={to} className={cn(cls, "transition-colors hover:border-azure/40")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
