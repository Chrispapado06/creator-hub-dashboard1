import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, ShieldCheck } from "lucide-react";

import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { useCoachIntel } from "@/coach/hooks";
import { assessObjectiveReadiness, type DimensionResult } from "@/coach/mountainReadiness";
import { isKnown } from "@/coach/types";
import { isoDate } from "@/data/mock/clock";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";
import { useTraining } from "@/tracking/training";
import type { TrainingPlan } from "@/types";
import { ACCENT, Chip, CoachCard, CoachHead, Eyebrow, ON_STRONG, STRONG, TINT, useObjective } from "./shell";

/**
 * COACH — PROGRESS, to the owner's design of 2026-09-04.
 *
 * Four cards: the objective and where the plan is on its path, what this
 * preparation has recorded, four development areas, and the coach's
 * observation. The brief's own rules decide what may be drawn:
 *
 *   · THE MILESTONE PATH is the plan's phases — consecutive blocks grouped
 *     by family (Base, Build, Peak, Taper), each done, current or ahead by
 *     where the current week sits. "Objective selected" leads because it is
 *     the one milestone that is always true once this page can render. The
 *     drawing names its phases "Base preparation / Build capacity / Mountain
 *     readiness"; the plan names its own, and the plan's names are printed.
 *   · NO READINESS PERCENTAGE. The brief says not to invent one, and the app
 *     agrees: readiness has its own screen with its own qualifiers.
 *   · PHASE STATS are counts — sessions completed against sessions
 *     prescribed, from `completedByDate` — and the activity history behind
 *     them is one tap away on the old Progress screen, which keeps every
 *     total, load figure and record it always drew.
 *   · THE FOUR AREAS carry a status ONLY where a source exists. Endurance and
 *     technical skill read `assessObjectiveReadiness`'s fitness and technical
 *     dimensions; recovery reads today's recovery assessment. Strength has no
 *     source in ICEFALL and says "Not enough data yet" — the phrase the brief
 *     asks for — rather than a status somebody would have to have measured.
 *     "On track" and "Building" are presentation buckets over the engine's
 *     0–100 score (75 and above, and below), not new measurements.
 */

/** "Base 4 · deload" → "Base". */
function blockPrefix(block: string): string {
  return block.split("·")[0].trim().replace(/\s+\d+$/, "");
}

interface Milestone {
  label: string;
  state: "done" | "current" | "upcoming";
}

function milestonesFor(plan: TrainingPlan, currentIndex: number): Milestone[] {
  const groups: { name: string; first: number; last: number }[] = [];
  for (const week of plan.weeks) {
    const name = blockPrefix(week.block);
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.last = week.index;
    else groups.push({ name, first: week.index, last: week.index });
  }
  return [
    { label: "Objective selected", state: "done" },
    ...groups.map<Milestone>((g) => ({
      label: g.name,
      state: g.last < currentIndex ? "done" : g.first <= currentIndex ? "current" : "upcoming",
    })),
  ];
}

type AreaStatus = { label: string; tone: "green" | "blue" | "peach" | "neutral" };

const NOT_ENOUGH: AreaStatus = { label: "Not enough data yet", tone: "neutral" };

function statusFromDimension(d: DimensionResult | undefined): AreaStatus {
  if (!d || !isKnown(d.score)) return NOT_ENOUGH;
  return d.score.value >= 75 ? { label: "On track", tone: "green" } : { label: "Building", tone: "blue" };
}

export default function Progress() {
  const intel = useCoachIntel();
  const training = useTraining();
  const { goal, kind } = useObjective();
  const { objectives, coachProfile } = useApp();
  const activities = useRecordedActivities();

  const plan = training.plan;
  const week = training.currentWeek;
  const todayKey = isoDate(new Date());

  const real = useMemo(() => activities.filter((a) => !a.simulated), [activities]);

  const milestones = useMemo(
    () => (plan ? milestonesFor(plan, week?.index ?? plan.currentWeek) : []),
    [plan, week],
  );

  const stats = useMemo(() => {
    if (!plan) return null;
    let prescribed = 0;
    let due = 0;
    let completed = 0;
    for (const w of plan.weeks) {
      for (const d of w.days) {
        if (d.focus === "rest") continue;
        prescribed++;
        if (d.date > todayKey) continue;
        due++;
        if (training.completedByDate.get(d.date) === true) completed++;
      }
    }
    return { prescribed, due, completed, remaining: prescribed - completed };
  }, [plan, training.completedByDate, todayKey]);

  // The same assessment Explore's hub and the readiness screen run — from
  // recorded sessions, logged summits and what the athlete told ICEFALL.
  const readiness = useMemo(() => {
    if (!goal || typeof goal.elevationM !== "number" || !Number.isFinite(goal.elevationM)) return null;
    const summitsLogged = objectives.flatMap((o) =>
      o.summitedAt ? [{ name: o.name, elevationM: o.elevationM, date: o.summitedAt }] : [],
    );
    return assessObjectiveReadiness({
      peak: { name: goal.name, elevationM: goal.elevationM, lat: goal.lat, lon: goal.lon },
      activities: real,
      summitsLogged,
      selfReported: {
        technicalSkills: coachProfile.technicalSkills.length > 0 ? coachProfile.technicalSkills : undefined,
        maxAltitudeM: coachProfile.maxAltitudeM,
        disciplineExperience:
          Object.keys(coachProfile.disciplineExperience).length > 0 ? coachProfile.disciplineExperience : undefined,
      },
    });
  }, [goal, real, objectives, coachProfile]);

  const dim = (id: string) => readiness?.dimensions.find((d) => d.id === id);

  const recoveryStatus: AreaStatus = (() => {
    switch (intel.recovery.status) {
      case "good":
        return { label: "On track", tone: "green" };
      case "moderate":
        return { label: "Building", tone: "blue" };
      case "poor":
        return { label: "Needs rest", tone: "peach" };
      default:
        return NOT_ENOUGH;
    }
  })();

  const areas = [
    {
      label: "Endurance",
      sub: "Aerobic base for long alpine days",
      status: statusFromDimension(dim("fitness")),
      to: "/coach/readiness",
    },
    { label: "Strength", sub: "Load bearing and stability", status: NOT_ENOUGH, to: "/coach/readiness" },
    {
      label: "Technical skills",
      sub: "Crampons, rope, movement",
      status: statusFromDimension(dim("technical")),
      to: "/coach/readiness",
    },
    { label: "Recovery", sub: "Sleep, nutrition, rest days", status: recoveryStatus, to: "/coach/recovery" },
  ];

  const phaseName = week ? blockPrefix(week.block) : null;

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-10 pt-6">
        <Rise>
          <CoachHead title="Progress" objective="line" />
        </Rise>

        {/* ---- Objective progress ----------------------------------------- */}
        <Rise className="mt-5">
          <CoachCard>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Eyebrow>Objective</Eyebrow>
                <h2 className="display mt-1.5 truncate text-[36px] leading-none text-snow">
                  {goal ? goal.name : "No objective"}
                </h2>
                <p className="mt-2 text-[15px] text-mist">{goal ? (kind ?? "Objective") : "Set one to see a path."}</p>
              </div>
              {phaseName && (
                <div className="shrink-0 text-right">
                  <Eyebrow>Phase</Eyebrow>
                  <p className="mt-1.5 text-[16px] font-semibold text-snow">{phaseName}</p>
                </div>
              )}
            </div>

            {milestones.length > 0 ? (
              <ol className="mt-6 flex items-start">
                {milestones.map((m, i) => (
                  <li key={m.label} className="relative flex min-w-0 flex-1 flex-col items-center">
                    {i > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute right-1/2 top-[11px] h-[2px] w-full"
                        style={{ backgroundColor: m.state === "upcoming" ? TINT.blue : ACCENT.blue }}
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "relative z-10 grid h-6 w-6 place-items-center rounded-full border-2",
                        m.state === "upcoming" ? "bg-graphite" : "",
                      )}
                      style={{
                        borderColor: m.state === "upcoming" ? TINT.blue : ACCENT.blue,
                        backgroundColor: m.state === "done" ? ACCENT.blue : "var(--ice-graphite)",
                      }}
                    >
                      {m.state === "current" && (
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACCENT.blue }} />
                      )}
                    </span>
                    <span
                      className={cn(
                        "mt-2 px-1 text-center text-[12px] leading-tight",
                        m.state === "upcoming" ? "text-mist" : "text-snow",
                      )}
                    >
                      {m.label}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-5 text-[14px] leading-relaxed text-mist">
                {goal
                  ? "The plan has no phases to show yet."
                  : "Name an objective and the plan's phases appear here as a path."}
              </p>
            )}
          </CoachCard>
        </Rise>

        {/* ---- This preparation ------------------------------------------- */}
        <Rise className="mt-4">
          <CoachCard>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="display text-[30px] leading-none text-snow">This preparation</h2>
              <Eyebrow>{stats ? "Phase stats" : "Activity"}</Eyebrow>
            </div>

            {stats ? (
              <>
                <dl className="mt-4 divide-y divide-hairline">
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-[15px] text-snow">Sessions completed</dt>
                    <dd className="tnum text-[15px] text-mist">{stats.completed} logged</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-[15px] text-snow">Sessions planned</dt>
                    <dd className="tnum text-[15px] text-mist">{stats.remaining} remaining</dd>
                  </div>
                </dl>
                {real.length > 0 ? (
                  <Link
                    to="/coach/progress/history"
                    className="mt-3 inline-flex items-center gap-1.5 text-[15px] text-azure"
                  >
                    Activity history
                    <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" />
                  </Link>
                ) : (
                  <p className="display mt-4 text-[20px] italic leading-snug text-mist">
                    Your activity history will appear here as you complete sessions.
                  </p>
                )}
              </>
            ) : (
              <p className="display mt-4 text-[20px] italic leading-snug text-mist">
                Your activity history will appear here as you complete sessions.
              </p>
            )}
          </CoachCard>
        </Rise>

        {/* ---- Development areas ------------------------------------------ */}
        <Rise className="mt-4">
          <CoachCard>
            <h2 className="display text-[30px] leading-none text-snow">Development areas</h2>
            <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
              {areas.map((a) => (
                <li key={a.label}>
                  <Link to={a.to} className="flex items-center justify-between gap-3 py-4">
                    <span className="min-w-0">
                      <span className="block text-[17px] font-medium text-snow">{a.label}</span>
                      <span className="block text-[13px] text-mist">{a.sub}</span>
                    </span>
                    <Chip tone={a.status.tone} className="shrink-0">
                      {a.status.label}
                    </Chip>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
              Statuses come from recorded sessions, logged summits and today's check-in. Where
              nothing has been recorded, nothing is claimed.
            </p>
          </CoachCard>
        </Rise>

        {/* ---- Coach observations ----------------------------------------- */}
        <Rise className="mt-4">
          <CoachCard>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: TINT.blue, color: ACCENT.blue }}
              >
                <ShieldCheck size={17} strokeWidth={1.6} />
              </span>
              <h2 className="display text-[28px] leading-none text-snow">Coach observations</h2>
            </div>
            <p className="mt-4 text-[15px] leading-relaxed text-snow">
              {intel.cold
                ? "Your recent activities will help Coach identify useful patterns over time."
                : intel.briefing.note}
            </p>
            <Link
              to="/coach/chat"
              className="mt-5 flex h-[52px] items-center justify-center gap-2 rounded-full text-[16px] font-semibold"
              style={{ backgroundColor: STRONG, color: ON_STRONG }}
            >
              Ask Coach about my progress
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
            </Link>
          </CoachCard>
        </Rise>
      </Stagger>
    </Screen>
  );
}
