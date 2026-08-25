import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, CircleDashed, Mountain as MountainIcon } from "lucide-react";

import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { QualifierBadge, UnavailableState } from "@/components/coach/DataState";
import { FactorBar, ScoreRing, TrendLine, type TrendPoint } from "@/components/coach/CoachUI";
import { LockedPreview, UpgradePrompt } from "@/components/growth/UpgradePrompt";

import { assessObjectiveReadiness } from "@/coach/mountainReadiness";
import type { Dimension, DimensionResult, ObjectiveReadiness } from "@/coach/mountainReadiness";
import {
  DEMAND_ID,
  DEMAND_LEVEL_LABEL,
  DEMAND_LEVEL_RANK,
  DEMAND_PROFILE_DISCLAIMER,
  demandProfile,
} from "@/services/demandProfile";
import type { Demand, DemandLevel } from "@/services/demandProfile";
import {
  HISTORY_NOTICE,
  objectiveKey,
  recordSnapshot,
  type ReadinessSnapshot,
} from "@/services/benchmarkHistory";
import { ASSESSMENT_DISCLAIMER, assessPeak } from "@/services/peakAssessment";
import { sync } from "@/services/repository";
import { useRecordedActivities } from "@/tracking/feed";
import { useApp } from "@/state/AppState";
import { fmtElevation } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Benchmark — where the athlete stands against what the mountain asks.
 *
 * READ THIS BEFORE EDITING. Two engines produce everything on this screen and
 * this file adds no measurement of its own:
 *
 *   `assessObjectiveReadiness`  what ICEFALL can see about the ATHLETE, in four
 *                               dimensions, with the two it cannot see left
 *                               null and explained.
 *   `demandProfile`             what the MOUNTAIN asks for, in seven demands,
 *                               derived from the class of objective.
 *
 * The single most important property of the page is that those two are never
 * silently multiplied together. A demand level is ordinal and a readiness score
 * is 0–100; there is no arithmetic between them anywhere in this file, and the
 * three demands ICEFALL has no measurement for say so rather than borrowing the
 * fitness number to fill the row.
 *
 * The one number this file introduces is the PREPARATION TARGET, and the rules
 * around it are not negotiable:
 *
 *   - It is ICEFALL's own target for preparation, scaled to how much the
 *     mountain asks. It is NOT a threshold that means anyone may climb, NOT a
 *     probability of anything, and NOT derived from route data — ICEFALL holds
 *     none for a peak it has not curated.
 *   - Reaching it is the point at which the coach stops asking for more, in the
 *     same sense as every other ceiling in this codebase. There is no reward
 *     for exceeding it and no verdict attached to falling short of it: a
 *     shortfall is a reason to keep building or to move the date, and the copy
 *     says exactly that.
 *   - The safety-critical output — `professionalAdvice`, the engine disclaimer
 *     and the name of the limiting dimension — is rendered for EVERY tier,
 *     never behind the paywall. Selling somebody the sentence that tells them
 *     to hire a guide would be indefensible whatever the pricing table says.
 *
 * Nothing on this page tells anyone to climb or not to climb.
 */

/* -------------------------------------------------------------------------- */
/* Preparation targets                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The preparation target for a dimension, by how much the mountain asks of it.
 *
 * These are ICEFALL's figures, in the same family as the training benchmarks in
 * `mountainReadiness` — a level of preparation the coach wants to see before an
 * objective of this class, not a measurement of the objective. They are held
 * below 100 on purpose at every level: the engine's own composite is capped at
 * 75 on anything needing a guide and 60 above 6,000 m, because the last part of
 * that judgement is made in person by somebody qualified, on the day.
 */
const TARGET_FOR_LEVEL: Record<DemandLevel, number> = {
  moderate: 60,
  high: 75,
  "very-high": 85,
};

/** A dimension only carries a gap worth naming once it is this far short. */
const MATERIAL_GAP = 5;

/**
 * Which readiness dimension, if any, speaks to a demand.
 *
 * `null` is the important value here and there are three of them. ICEFALL
 * derives fitness from ascent, sustained hours and weekly volume — that is a
 * real answer for vertical and aerobic endurance and it is NOT an answer for
 * strength, for carrying a load, or for how well somebody recovers between
 * days. Mapping those onto the fitness bar would turn one measurement into
 * three, which is the fabrication this whole system exists to refuse.
 */
const DEMAND_EVIDENCE: Record<string, Dimension | null> = {
  [DEMAND_ID.verticalEndurance]: "fitness",
  [DEMAND_ID.aerobicEndurance]: "fitness",
  [DEMAND_ID.strength]: null,
  [DEMAND_ID.packEndurance]: null,
  [DEMAND_ID.technicalSkill]: "technical",
  [DEMAND_ID.altitude]: "altitude",
  [DEMAND_ID.recovery]: null,
};

/** Why ICEFALL has no figure for a demand. Specific, never a generic shrug. */
const NOT_MEASURED_COPY: Record<string, string> = {
  [DEMAND_ID.strength]:
    "ICEFALL scores fitness from ascent, hours and weekly volume. None of that measures strength, so there is no figure here rather than the fitness number borrowed twice.",
  [DEMAND_ID.packEndurance]:
    "Nothing ICEFALL records says what you were carrying. A session's weight is not in the feed, so pack endurance is not scored against an objective.",
  [DEMAND_ID.recovery]:
    "The coach assesses recovery day to day from what you report, but not against a specific mountain — how you recover on an expedition is not predictable from how you recover at home.",
};

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

/** Everything the screen needs about the objective it was opened for. */
interface Objective {
  peak: { name: string; elevationM: number; lat?: number; lon?: number };
  backTo: string;
}

export default function Benchmark() {
  const { goalId } = useParams<{ goalId: string }>();
  const { goals, objectives, coachProfile } = useApp();
  const activities = useRecordedActivities();

  /**
   * The route parameter names either a goal or a saved objective. Both are
   * resolved rather than assuming one, because the mountain pages reach this
   * screen from both lists — and neither is invented if it is missing.
   */
  const objective = useMemo<Objective | null>(() => {
    const id = goalId ? decodeURIComponent(goalId) : undefined;
    if (!id) return null;

    const goal = goals.find((g) => g.id === id);
    if (goal) {
      const curated = goal.mountainId ? sync.mountainById(goal.mountainId) : undefined;
      const elevationM = goal.elevationM ?? curated?.elevationM;
      // A custom objective with no elevation is not a mountain. There is no
      // class of objective to derive, so there is nothing honest to benchmark.
      if (elevationM === undefined) return null;
      return {
        peak: {
          name: goal.name,
          elevationM,
          lat: goal.lat ?? curated?.coords.lat,
          lon: goal.lon ?? curated?.coords.lon,
        },
        backTo: `/goals/${goal.id}`,
      };
    }

    const saved = objectives.find((o) => o.id === id) ?? objectives.find((o) => o.curatedId === id);
    if (saved) {
      return {
        peak: { name: saved.name, elevationM: saved.elevationM, lat: saved.lat, lon: saved.lon },
        backTo: "/goals",
      };
    }

    return null;
  }, [goalId, goals, objectives]);

  /**
   * Summits the athlete has MARKED as done. The mock athlete fixture is
   * deliberately not read: crediting a real person with a fixture's summits
   * would feed a fabrication straight into experience and altitude.
   */
  const summitsLogged = useMemo(
    () =>
      objectives.flatMap((o) =>
        o.summitedAt ? [{ name: o.name, elevationM: o.elevationM, date: o.summitedAt }] : [],
      ),
    [objectives],
  );

  const selfReported = useMemo(
    () => ({
      technicalSkills:
        coachProfile.technicalSkills.length > 0 ? coachProfile.technicalSkills : undefined,
      maxAltitudeM: coachProfile.maxAltitudeM,
      disciplineExperience:
        Object.keys(coachProfile.disciplineExperience).length > 0
          ? coachProfile.disciplineExperience
          : undefined,
    }),
    [coachProfile],
  );

  const readiness = useMemo<ObjectiveReadiness | null>(() => {
    if (!objective) return null;
    return assessObjectiveReadiness({
      peak: objective.peak,
      activities,
      summitsLogged,
      selfReported,
    });
  }, [objective, activities, summitsLogged, selfReported]);

  /* ---- History ----------------------------------------------------------- */

  const [history, setHistory] = useState<ReadinessSnapshot[]>([]);

  // One reading a day, written when the screen is viewed. Nothing before the
  // first reading is reconstructed — see benchmarkHistory.ts.
  useEffect(() => {
    if (!objective || !readiness) return;
    setHistory(recordSnapshot(objectiveKey(objective.peak), readiness.overall));
  }, [objective, readiness]);

  if (!objective || !readiness) return <NoObjective />;

  const { peak } = objective;
  const assessment = assessPeak(peak.elevationM, peak.lat ?? 0, peak.lon);
  const demands = demandProfile(peak);

  /* ---- Targets and gaps --------------------------------------------------- */

  const targets = buildTargets(readiness.dimensions, demands);
  const ranked = [...targets]
    .filter((t) => t.shortfall !== null && t.shortfall >= MATERIAL_GAP)
    .sort((a, b) => (b.shortfall ?? 0) - (a.shortfall ?? 0));
  const uncomparable = targets.filter((t) => t.shortfall === null && t.applicable);

  const gap = readiness.biggestGap;
  const gapRow = gap ? (targets.find((t) => t.dimension.id === gap.id) ?? null) : null;

  /**
   * Whether this assessment is the athlete's own account of themselves.
   *
   * True whenever a dimension declares self-reported provenance, and true when
   * ICEFALL has observed nothing at all. The badge sits on the headline figure
   * for that reason rather than in a footnote.
   */
  const recordedSessions = activities.filter((a) => !a.simulated).length;
  const selfReportedOverall =
    recordedSessions === 0 || readiness.dimensions.some((d) => d.provenance === "self-reported");

  return (
    <Screen>
      <ScreenHeader
        title="Benchmark"
        subtitle={`${peak.name} · ${fmtElevation(peak.elevationM)} m · ${assessment.shortLabel}`}
        back={objective.backTo}
      />

      <Stagger>
        {/* ---- Your readiness — free ------------------------------------- */}
        <Rise className="pt-1">
          <SectionLabel>Your readiness</SectionLabel>
          <Card className="mt-3">
            <div className="flex flex-col items-center pb-1 pt-2">
              <ScoreRing
                score={readiness.overall}
                unit="/100"
                size={132}
                label="Preparation profile"
                caption={peak.name}
              />
              {readiness.overall.value !== null && selfReportedOverall && (
                <span className="mt-3">
                  <QualifierBadge kind="self-reported" />
                </span>
              )}
            </div>

            <p className="mt-4 border-t border-hairline pt-4 text-[12px] leading-relaxed text-mist">
              {readiness.overall.value === null
                ? "ICEFALL is not putting a single figure on this objective while a dimension it turns on is unknown. A number assembled from the parts that happen to be known would read as a verdict on the whole mountain."
                : "This is the weakest of the dimensions this objective turns on, not an average of them. On a mountain the weakest one is the one that decides, and a strong dimension cannot pay for an absent one."}
            </p>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Dimensions</SectionLabel>
          <Card className="mt-3">
            <div className="divide-y divide-hairline">
              {readiness.dimensions.map((d) => (
                <DimensionRow key={d.id} dimension={d} />
              ))}
            </div>
          </Card>
        </Rise>

        {/* Rendered for every tier. Safety guidance is never a paid feature. */}
        {readiness.professionalAdvice && (
          <Rise className="pt-6">
            <SectionLabel>Professional support</SectionLabel>
            <Card className="mt-3">
              <p className="text-[13px] leading-relaxed text-mist">
                {readiness.professionalAdvice}
              </p>
            </Card>
          </Rise>
        )}

        {/* ---- Readiness vs target — Pro ---------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Readiness vs target</SectionLabel>
          <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
            A preparation target, not a summit threshold. It is the point at which ICEFALL stops
            asking for more preparation against a mountain of this class — it does not mean the
            objective is on, and it is not a judgement that anybody is safe to attempt it.
          </p>
          <LockedPreview
            featureId="data.analytics"
            title="Readiness against target is part of ICEFALL Pro."
            body="See how each dimension stands against the preparation target for a mountain of this class."
          >
            <Card className="mt-3" inset={false}>
              <div className="divide-y divide-hairline">
                {targets.map((t) => (
                  <TargetRowView key={t.dimension.id} row={t} />
                ))}
              </div>
            </Card>

            {/* Inside the same gate as the rows above. Naming a gap in figures
                is the Pro surface; WHICH dimension is holding the objective
                back, and what to do about it, stays free further down the page
                — that sentence is safety guidance, not an upsell. */}
            <Card className="mt-2.5">
              <p className="section-label text-mist-dim">Largest gaps</p>
              {ranked.length === 0 ? (
                <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
                  {uncomparable.length > 0
                    ? "Nothing ICEFALL can currently measure sits materially short of its target. The dimensions below cannot be compared at all until you tell ICEFALL about them, and those are the ones that matter most on this class of ground."
                    : "No dimension ICEFALL can see sits materially short of its preparation target. That is not the same as being ready: ICEFALL cannot see the route, the conditions, or how you move on the day."}
                </p>
              ) : (
                <ul className="mt-2.5 space-y-2">
                  {ranked.map((t) => (
                    <li key={t.dimension.id} className="flex gap-3 text-[12px] leading-relaxed">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                      <span className="text-mist">
                        <span className="text-snow">{t.dimension.label}</span> is{" "}
                        <span className="tnum">{t.shortfall}</span> short of a target of{" "}
                        <span className="tnum">{t.target}</span> for this class of objective.
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {uncomparable.length > 0 && (
                <p className="mt-3 border-t border-hairline pt-3 text-[12px] leading-relaxed text-mist-dim">
                  Not comparable yet: {uncomparable.map((t) => t.dimension.label).join(", ")}. A
                  dimension ICEFALL has no figure for cannot be short of a target — it is simply
                  unknown, and on this class of objective the unknown one is usually the one that
                  matters.
                </p>
              )}
            </Card>
          </LockedPreview>
        </Rise>

        {/* ---- Mountain demand profile — Pro ------------------------------ */}
        <Rise className="pt-6">
          <SectionLabel>Mountain demand profile</SectionLabel>
          <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
            What a mountain of this class asks for, and what ICEFALL can currently see about you
            against each. The levels are ordinal — they are not percentages and they are not
            compared arithmetically with the scores above.
          </p>
          {demands.length === 0 ? (
            <Card className="mt-3">
              <p className="text-[12px] leading-relaxed text-mist-dim">
                ICEFALL cannot read an elevation for this objective, so there is no class of
                mountain to derive demands from.
              </p>
            </Card>
          ) : (
            <LockedPreview
              featureId="data.analytics"
              title="The mountain demand profile is part of ICEFALL Pro."
              body="See what this class of objective asks for across all seven demands."
            >
              <div className="mt-3 space-y-2.5">
                {demands.map((demand) => (
                  <DemandCard
                    key={demand.id}
                    demand={demand}
                    dimension={dimensionFor(readiness.dimensions, DEMAND_EVIDENCE[demand.id])}
                  />
                ))}
              </div>
            </LockedPreview>
          )}
          <Disclaimer className="mt-4">{DEMAND_PROFILE_DISCLAIMER}</Disclaimer>
        </Rise>

        {/* ---- Biggest gap ------------------------------------------------ */}
        <Rise className="pt-6">
          <SectionLabel>Your biggest gap</SectionLabel>
          {gap === null ? (
            <Card className="mt-3">
              <p className="text-[13px] leading-relaxed text-mist">
                No dimension ICEFALL can see is currently holding this objective back. That is not a
                statement that you are ready for it — ICEFALL cannot see the route, the conditions,
                or how you move on the day, and the assessment that counts is made in person.
              </p>
            </Card>
          ) : (
            <Card className="mt-3">
              <p className="text-[15px] text-snow">{gap.label}</p>
              {/* The recommendation stays free. It is the sentence most likely
                  to send somebody to an instructor, and it is not for sale. */}
              <p className="mt-2 text-[13px] leading-relaxed text-mist">{gap.recommendation}</p>

              <LockedPreview
                featureId="data.analytics"
                title="Gap analysis is part of ICEFALL Pro."
                body="See the size of the gap against ICEFALL's preparation target."
              >
                <div className="mt-4 flex gap-3 border-t border-hairline pt-4">
                  <GapTile label="Current" score={gapRow?.dimension.score.value ?? null} />
                  <GapTile label="Target" score={gapRow?.target ?? null} />
                  <GapTile
                    label="Difference"
                    score={gapRow?.shortfall ?? null}
                    prefix={gapRow?.shortfall ? "−" : undefined}
                  />
                </div>
              </LockedPreview>

              {gapRow?.shortfall === null && (
                <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
                  There is no difference to show because there is no figure to subtract from.
                  ICEFALL will not put a number on a dimension nobody has told it about.
                </p>
              )}

              <Link
                to="/coach/plan"
                className="mt-4 flex items-center gap-2.5 border-t border-hairline pt-3.5 text-[13px] text-azure transition-colors hover:text-azure-bright"
              >
                <span className="flex-1">Work on this in your plan</span>
                <ArrowRight size={15} strokeWidth={1.7} />
              </Link>
            </Card>
          )}
        </Rise>

        {/* ---- History ---------------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>History</SectionLabel>
          <HistorySection history={history} peakName={peak.name} />
        </Rise>

        {/* ---- Mountain comparison — Pro ---------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Mountain comparison</SectionLabel>
          <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
            The same preparation profile, read against the other objectives you have saved. These
            are preparation profiles against ICEFALL's benchmarks for each class of objective. They
            are not a chance of summiting, and a higher figure on an easier mountain does not make
            that mountain a safe day.
          </p>
          <LockedPreview
            featureId="data.analytics"
            title="Comparing objectives is part of ICEFALL Pro."
            body="Read your current profile against every mountain you are considering."
          >
            <Comparison
              current={peak}
              objectives={objectives}
              activities={activities}
              summitsLogged={summitsLogged}
              selfReported={selfReported}
            />
          </LockedPreview>
        </Rise>

        {/* ---- Framing ---------------------------------------------------- */}
        <Rise className="pt-8">
          <Disclaimer>{readiness.disclaimer}</Disclaimer>
          <Disclaimer className="mt-4">{ASSESSMENT_DISCLAIMER}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* No objective                                                                */
/* -------------------------------------------------------------------------- */

function NoObjective() {
  return (
    <Screen>
      <ScreenHeader title="Benchmark" back="/goals" />
      <Stagger>
        <Rise className="pt-1">
          <Card>
            <div className="flex gap-3">
              <MountainIcon size={16} strokeWidth={1.4} className="mt-0.5 shrink-0 text-mist-dim" />
              <div className="min-w-0">
                <p className="text-[13px] leading-relaxed text-snow">
                  There is no objective to benchmark against.
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-mist">
                  This screen needs a mountain with a known elevation — that is what sets the class
                  of objective, and every demand and target on the page is derived from it. Pick an
                  objective, or add an elevation to the one you have.
                </p>
              </div>
            </div>
            <Button asChild variant="secondary" className="mt-4 w-full">
              <Link to="/goals">Choose an objective</Link>
            </Button>
          </Card>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Dimensions                                                                  */
/* -------------------------------------------------------------------------- */

function dimensionFor(dimensions: DimensionResult[], id: Dimension | null): DimensionResult | null {
  if (id === null) return null;
  return dimensions.find((d) => d.id === id) ?? null;
}

/**
 * One dimension row.
 *
 * Two distinct nulls arrive here and they must not look the same. Null WITH a
 * reason is "we do not know this, here is why" and gets the absence treatment.
 * Null WITHOUT a reason means the dimension does not apply to this class of
 * objective at all, which is not missing data and must not be drawn as though
 * the athlete owes ICEFALL something.
 */
function DimensionRow({ dimension }: { dimension: DimensionResult }) {
  if (dimension.score.value === null && dimension.score.reason === undefined) {
    return (
      <div className="py-3">
        <div className="flex items-center gap-3">
          <span className="flex-1 text-[13px] text-snow">{dimension.label}</span>
          <span className="shrink-0 text-[11px] text-mist-dim">Not scored here</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">{dimension.summary}</p>
      </div>
    );
  }

  return (
    <FactorBar
      label={dimension.label}
      score={dimension.score}
      note={dimension.summary}
      // Provenance is not decoration: the funnel scores a stranger from their
      // own estimate, and handing that back as a measurement would be the most
      // consequential lie this screen could tell.
      qualifier={dimension.provenance === "self-reported" ? "self-reported" : undefined}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Targets                                                                     */
/* -------------------------------------------------------------------------- */

interface TargetRow {
  dimension: DimensionResult;
  target: number;
  /** How far short of the target, or null when there is no figure to compare. */
  shortfall: number | null;
  /** False when the dimension does not apply to this class of objective. */
  applicable: boolean;
}

/**
 * Targets per dimension, scaled by what the mountain actually asks.
 *
 * The mapping is deliberately narrow. Fitness answers to the two endurance
 * demands ICEFALL derives it from and to nothing else; experience answers to
 * the most demanding thing on the mountain, because a record is built from
 * objectives of a comparable class rather than from any one quality.
 */
function buildTargets(dimensions: DimensionResult[], demands: Demand[]): TargetRow[] {
  const levelOf = (id: string): DemandLevel | null =>
    demands.find((d) => d.id === id)?.level ?? null;

  const strongest = (levels: (DemandLevel | null)[]): DemandLevel => {
    const present = levels.filter((l): l is DemandLevel => l !== null);
    if (present.length === 0) return "high";
    return present.reduce((a, b) => (DEMAND_LEVEL_RANK[b] > DEMAND_LEVEL_RANK[a] ? b : a));
  };

  const levelForDimension = (id: Dimension): DemandLevel => {
    switch (id) {
      case "fitness":
        return strongest([
          levelOf(DEMAND_ID.verticalEndurance),
          levelOf(DEMAND_ID.aerobicEndurance),
        ]);
      case "technical":
        return strongest([levelOf(DEMAND_ID.technicalSkill)]);
      case "altitude":
        return strongest([levelOf(DEMAND_ID.altitude)]);
      case "experience":
        return strongest(demands.map((d) => d.level));
    }
  };

  return dimensions.map((dimension) => {
    // A dimension the objective does not turn on carries a null score with no
    // reason. It gets no target: a target on it would imply the mountain asks
    // for something it does not.
    const applicable = !(dimension.score.value === null && dimension.score.reason === undefined);
    const target = TARGET_FOR_LEVEL[levelForDimension(dimension.id)];
    const shortfall =
      dimension.score.value === null
        ? null
        : Math.max(0, Math.round(target - dimension.score.value));

    return { dimension, target, shortfall, applicable };
  });
}

function TargetRowView({ row }: { row: TargetRow }) {
  const value = row.dimension.score.value;

  if (!row.applicable) {
    return (
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex-1 text-[13px] text-snow">{row.dimension.label}</span>
          <span className="shrink-0 text-[11px] text-mist-dim">Not scored on this objective</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[13px] text-snow">{row.dimension.label}</span>
        {value === null ? (
          <span className="shrink-0 text-[11px] text-mist-dim">No figure yet</span>
        ) : (
          <span className="tnum shrink-0 text-[12px] text-mist">
            {Math.round(value)}
            <span className="text-mist-dim"> of {row.target}</span>
          </span>
        )}
      </div>

      {/* The target sits as a hairline tick on the track. An unknown value draws
          the target and no bar at all — a zero-width fill and a genuine zero
          must never look the same. */}
      <div className="relative mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
        {value !== null && (
          <div
            className="h-full rounded-full bg-azure"
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          />
        )}
        <span
          aria-hidden
          className="absolute top-0 h-full w-px bg-snow/60"
          style={{ left: `${row.target}%` }}
        />
      </div>

      {value === null ? (
        <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
          Nothing to compare against the target of {row.target} until ICEFALL has a figure for this.
        </p>
      ) : row.shortfall !== null && row.shortfall >= MATERIAL_GAP ? (
        <p className="tnum mt-2 text-[11px] leading-relaxed text-mist-dim">
          {row.shortfall} short of the preparation target for this class of objective.
        </p>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
          At or above ICEFALL's preparation target. There is nothing further to gain here.
        </p>
      )}
    </div>
  );
}

function GapTile({
  label,
  score,
  prefix,
}: {
  label: string;
  score: number | null;
  prefix?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="section-label">{label}</p>
      {/* Words, not a dash. A dash in a row of figures reads as a value of
          nothing, and "we have no figure" is a different statement entirely. */}
      {score === null ? (
        <p className="mt-2 text-[12px] leading-snug text-mist-dim">Not known</p>
      ) : (
        <p className="tnum mt-2 text-[22px] font-extralight leading-none text-snow">
          {prefix}
          {Math.round(score)}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Demands                                                                     */
/* -------------------------------------------------------------------------- */

function LevelMarks({ level }: { level: DemandLevel }) {
  const rank = DEMAND_LEVEL_RANK[level];
  return (
    <span className="flex shrink-0 items-center gap-[3px]">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden
          className={cn("h-[3px] w-[14px] rounded-full", i <= rank ? "bg-azure" : "bg-white/[0.08]")}
        />
      ))}
      <span className="sr-only">{DEMAND_LEVEL_LABEL[level]} demand</span>
    </span>
  );
}

function DemandCard({ demand, dimension }: { demand: Demand; dimension: DimensionResult | null }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[13px] text-snow">{demand.label}</span>
        <span className="section-label text-[9px] text-mist-dim">
          {DEMAND_LEVEL_LABEL[demand.level]}
        </span>
        <LevelMarks level={demand.level} />
      </div>

      <p className="mt-2.5 text-[12px] leading-relaxed text-mist">{demand.note}</p>

      <div className="mt-3 border-t border-hairline pt-3">
        <p className="section-label text-mist-dim">What ICEFALL can see</p>
        {dimension === null ? (
          <NotMeasured note={NOT_MEASURED_COPY[demand.id] ?? DEFAULT_NOT_MEASURED} />
        ) : dimension.score.value === null ? (
          <div className="mt-2.5">
            {dimension.score.reason === undefined ? (
              <p className="text-[11px] leading-relaxed text-mist-dim">{dimension.summary}</p>
            ) : (
              <UnavailableState reason={dimension.score.reason} size="sm" className="items-start" />
            )}
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2.5">
            <span className="tnum text-[15px] font-extralight text-snow">
              {Math.round(dimension.score.value)}
              <span className="text-[11px] text-mist-dim">/100</span>
            </span>
            <span className="text-[11px] text-mist-dim">{dimension.label}</span>
            {dimension.provenance === "self-reported" && <QualifierBadge kind="self-reported" />}
          </div>
        )}
      </div>
    </Card>
  );
}

const DEFAULT_NOT_MEASURED =
  "ICEFALL does not measure this against an objective, so there is no figure to show beside the demand.";

/**
 * "ICEFALL computes nothing here" — a different state from the five in
 * DataState, which all describe something the athlete's own data is missing.
 * This one is about the product, not the person, so it never reads as a
 * prompt to go and log something.
 */
function NotMeasured({ note }: { note: string }) {
  return (
    <div className="mt-2.5 flex gap-2.5">
      <span
        aria-hidden
        className="mt-[1px] grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-dashed border-hairline-strong text-mist-dim"
      >
        <CircleDashed size={11} strokeWidth={1.6} />
      </span>
      <div className="min-w-0">
        <p className="section-label text-[9px]">Not measured</p>
        <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">{note}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Readiness over time.
 *
 * ICEFALL began keeping this record the first time this screen was opened, so
 * for almost everyone the honest answer is "history begins now". Nothing is
 * back-filled from the training feed and no earlier point is estimated.
 *
 * Deliberately NOT wrapped in `LockedPreview`: these are the athlete's own
 * readings, and blurring somebody's own record back at them to sell a
 * subscription is the one thing the growth components explicitly forbid. Free
 * tier sees the record it has; the chart is the Pro surface, and the readings
 * keep accruing either way so nothing is lost by waiting.
 */
function HistorySection({ history, peakName }: { history: ReadinessSnapshot[]; peakName: string }) {
  const { can } = useApp();
  const points = useMemo<TrendPoint[]>(
    () =>
      history.map((s) => ({
        label: s.date.slice(5),
        score: { value: s.value, reason: s.reason },
      })),
    [history],
  );

  const plottable = points.filter((p) => p.score.value !== null).length;

  return (
    <Card className="mt-3">
      {history.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-mist-dim">
          No reading has been stored yet. If this device blocks local storage, ICEFALL cannot keep a
          history at all — the figure above is still correct for today.
        </p>
      ) : plottable < 2 || !can("data.analytics") ? (
        <>
          <p className="text-[13px] leading-relaxed text-snow">
            {plottable < 2 ? "History begins now." : "Readings are being recorded."}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-mist">
            {plottable < 2
              ? `ICEFALL has ${history.length === 1 ? "one reading" : `${history.length} readings`} for ${peakName}, starting today. There are no earlier points because none were taken — nothing here is reconstructed from your training feed.`
              : `${history.length} readings recorded for ${peakName}. The trend chart is part of ICEFALL Pro; the readings accrue whichever plan you are on.`}
          </p>
          {plottable >= 2 && (
            <UpgradePrompt
              featureId="data.analytics"
              className="mt-4"
              title="Your readiness trend is part of ICEFALL Pro."
              body="Plot every reading ICEFALL has recorded against this objective."
            />
          )}
        </>
      ) : (
        <>
          <TrendLine points={points} height={78} />
          <div className="tnum mt-2 flex justify-between text-[10px] text-mist-dim">
            <span>{points[0]?.label}</span>
            <span>{points[points.length - 1]?.label}</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
            {history.length} readings for {peakName}. A break in the line is a day readiness could
            not be computed, not a day it fell to zero.
          </p>
        </>
      )}
      <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
        {HISTORY_NOTICE}
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Comparison                                                                  */
/* -------------------------------------------------------------------------- */

/** Enough to see a ladder, few enough to stay legible on a phone. */
const MAX_COMPARISONS = 8;

function Comparison({
  current,
  objectives,
  activities,
  summitsLogged,
  selfReported,
}: {
  current: { name: string; elevationM: number };
  objectives: { id: string; name: string; elevationM: number; lat: number; lon: number }[];
  activities: Parameters<typeof assessObjectiveReadiness>[0]["activities"];
  summitsLogged: { name: string; elevationM: number; date: string }[];
  selfReported: Parameters<typeof assessObjectiveReadiness>[0]["selfReported"];
}) {
  const rows = useMemo(() => {
    const list = objectives
      .filter((o) => Number.isFinite(o.elevationM) && o.elevationM > 0)
      .slice()
      .sort((a, b) => a.elevationM - b.elevationM)
      .slice(0, MAX_COMPARISONS);

    return list.map((o) => {
      const peak = { name: o.name, elevationM: o.elevationM, lat: o.lat, lon: o.lon };
      const result = assessObjectiveReadiness({ peak, activities, summitsLogged, selfReported });
      return {
        id: o.id,
        name: o.name,
        elevationM: o.elevationM,
        shortLabel: assessPeak(o.elevationM, o.lat, o.lon).shortLabel,
        overall: result.overall,
        isCurrent:
          o.name === current.name && Math.round(o.elevationM) === Math.round(current.elevationM),
      };
    });
  }, [objectives, activities, summitsLogged, selfReported, current]);

  if (rows.length === 0) {
    return (
      <Card className="mt-3">
        <p className="text-[12px] leading-relaxed text-mist-dim">
          You have no other saved objectives to compare against. Save a mountain and it appears
          here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-3" inset={false}>
      <div className="divide-y divide-hairline">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-snow">
                {row.name}
                {row.isCurrent && (
                  <span className="ml-2 text-[11px] text-azure">This objective</span>
                )}
              </p>
              <p className="tnum mt-0.5 text-[11px] text-mist-dim">
                {fmtElevation(row.elevationM)} m · {row.shortLabel}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {row.overall.value === null ? (
                <UnavailableState
                  reason={row.overall.reason ?? "no-data"}
                  size="sm"
                  className="max-w-[128px]"
                />
              ) : (
                <p className="tnum text-[18px] font-extralight leading-none text-snow">
                  {row.overall.value}
                  <span className="ml-1 text-[11px] text-mist-dim">/100</span>
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="border-t border-hairline px-4 py-3 text-[11px] leading-relaxed text-mist-dim">
        Preparation profiles, computed against ICEFALL's benchmarks for each class of objective.
        Class is estimated from elevation and position, not from a route.
      </p>
    </Card>
  );
}
