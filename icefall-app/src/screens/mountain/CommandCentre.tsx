import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowUpRight,
  Backpack,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudSnow,
  Gauge,
  Mountain as MountainIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { ScoreRing } from "@/components/coach/CoachUI";
import {
  QualifierBadge,
  UnavailableState,
  UNAVAILABLE_COPY as ABSENCE_COPY,
} from "@/components/coach/DataState";
import { useMountainImage } from "@/components/domain/MountainImage";

import { assessObjectiveReadiness } from "@/coach/mountainReadiness";
import type { Dimension, DimensionResult, ObjectiveReadiness } from "@/coach/mountainReadiness";
import { OBJECTIVE_READINESS_DISCLAIMER } from "@/coach/mountainReadiness";
import { useCoachIntel } from "@/coach/hooks";
import { isKnown } from "@/coach/types";
import type { Unavailable } from "@/coach/types";

import { CHECKLIST_DISCLAIMER, completion, generateChecklist } from "@/services/checklist";
import {
  CONDITIONS_ATTRIBUTION,
  CONDITIONS_DISCLAIMER,
  getMountainConditions,
  rateDay,
} from "@/services/conditions";
import type { MountainConditions, Reading } from "@/services/conditions";
import { assessPeak } from "@/services/peakAssessment";
import type { PeakAssessment } from "@/services/peakAssessment";
import {
  REFERENCE_NEXT_STEP,
  REFERENCE_NO_KIT_LIST,
  REFERENCE_NO_KIT_LIST_SHORT,
  REFERENCE_NO_READINESS,
  REFERENCE_NO_READINESS_SHORT,
  REFERENCE_NOT_ASSESSED,
  TIER_EYEBROW,
  TIER_STATEMENT,
} from "@/services/peakTier";
import { sync } from "@/services/repository";

import { useRecordedActivities } from "@/tracking/feed";
import { useApp } from "@/state/AppState";
import { FOCUS_LABELS, fmtDate, fmtElevation } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Goal, Mountain } from "@/types";

/**
 * §20 — the Command Centre.
 *
 * ICEFALL answers one question, and this is the screen that asks it whole:
 * AM I READY FOR THIS MOUNTAIN? Conditions, performance and equipment each have
 * their own screen and each is honest on its own; what none of them can do
 * alone is tell an athlete which of the three is the thin one this week. That
 * is the only reason this screen exists, and it is why the three systems are
 * read side by side here rather than summarised into a single number.
 *
 * There is no composite. A blended "expedition score" would be the easiest
 * thing on earth to build here and the most dishonest thing in the app: you
 * cannot average a missing crampon against a wind forecast against twelve weeks
 * of ascent, and a single figure would let a strong training block pay for
 * equipment nobody has packed. So the three systems are reported separately, in
 * words, with the reason underneath each one.
 *
 * The house rules this screen is built around:
 *
 *  - EVERY STATE IS DERIVED. A system with nothing behind it reads "not enough
 *    yet" and says why. Nothing defaults to a calm word, in the same way the
 *    forecast layer never defaults a failed request to calm weather.
 *  - NOTHING HERE TELLS ANYONE TO CLIMB. The conditions vocabulary describes
 *    weather — settled, mixed, unsettled — and never permission. The priority
 *    line never says push harder, never says make up a missed session, and
 *    never mentions a chance of summiting, because ICEFALL does not know one.
 *  - PROVENANCE TRAVELS WITH THE NUMBER. Readiness assembled from what the
 *    athlete typed is badged self-reported wherever it appears, including on
 *    the headline ring.
 *  - A REFERENCE ENTRY IS NOT ASSESSED. Every figure on this screen that is
 *    not weather comes from `assessPeak`'s elevation band — the class label,
 *    the kit list, the readiness composite, the guide verdict. For a goal on
 *    a peak no human record backs, none of that has a source. Measured live
 *    2026-09-11 on Erciyes Dağı, a summer walk-up volcano: "Serious alpine",
 *    "crevasse rescue kit" as essential, "engage an IFMGA/UIAGM-certified
 *    guide", readiness 10/100 — all from 3,917 m and nothing else. So for
 *    that tier the two systems that would be derived report a NAMED absence
 *    (`services/peakTier.ts`) and only the forecast, the countdown and the
 *    plan are read.
 */

/* -------------------------------------------------------------------------- */
/* Local calendar arithmetic                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A target date read in the athlete's own calendar.
 *
 * `new Date("2026-08-20")` is parsed as UTC midnight, so west of Greenwich its
 * local components are the 19th and every countdown built on it is a day out.
 * A date-only string is therefore constructed from its parts, which is what the
 * training plan already does for exactly this reason (see `isoDate` in
 * data/mock/clock). Anything carrying a time is a real instant and is read in
 * local time as it stands.
 */
function localMidnight(iso: string): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** Whole days between today and the target, both taken as local calendar days. */
function daysUntilLocal(targetIso: string, now: Date): number | null {
  const target = localMidnight(targetIso);
  if (!target) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/* -------------------------------------------------------------------------- */
/* Expedition status                                                           */
/* -------------------------------------------------------------------------- */

type SystemId = "training" | "equipment" | "conditions";

/**
 * One row of EXPEDITION STATUS.
 *
 * `word` is the whole point: a colour alone would be unreadable to a colour
 * blind athlete, unreadable in daylight, and — worse — would imply a verdict
 * without ever having to defend one. Every row carries a word and a sentence
 * saying what produced it.
 *
 * `deficit` is 0–1, where 1 is furthest behind, and drives the priority line.
 * It is never inferred from a colour, and a system with no data does not score
 * zero deficit by omission; see the individual derivations below.
 */
interface SystemStatus {
  id: SystemId;
  label: string;
  icon: LucideIcon;
  word: string;
  reason: string;
  deficit: number;
  to: string;
}

/**
 * Weather can be reported but it cannot be prepared, so it is held below the
 * two systems that can. Capped at 0.5, conditions can only become the athlete's
 * priority once training and equipment are both better than half done — which
 * is the only situation in which "watch the mountain" is genuinely the most
 * useful thing anyone could say.
 */
const CONDITIONS_DEFICIT_CEILING = 0.5;

/* -------------------------------------------------------------------------- */
/* Conditions                                                                  */
/* -------------------------------------------------------------------------- */

type ConditionsState =
  | { status: "no-location" }
  | { status: "loading" }
  | { status: "ready"; data: MountainConditions };

/**
 * The live forecast for this objective.
 *
 * Deliberately without elevation bands: they cost one request per band and the
 * conditions screen is where they belong. This screen needs enough to say what
 * the mountain is doing today and no more.
 */
function useObjectiveConditions(peak: {
  name: string;
  elevationM: number | null;
  lat?: number;
  lon?: number;
}): ConditionsState {
  const { name, elevationM, lat, lon } = peak;
  const located = lat !== undefined && lon !== undefined && elevationM !== null;

  const [state, setState] = useState<ConditionsState>(() =>
    located ? { status: "loading" } : { status: "no-location" },
  );

  useEffect(() => {
    if (lat === undefined || lon === undefined || elevationM === null) {
      setState({ status: "no-location" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });

    void getMountainConditions({
      peakName: name,
      elevationM,
      lat,
      lon,
      signal: controller.signal,
    }).then((data) => {
      // An aborted request resolves with a fully-absent result; writing it would
      // replace a live panel with an absence caused only by navigation.
      if (!controller.signal.aborted) setState({ status: "ready", data });
    });

    return () => controller.abort();
  }, [name, elevationM, lat, lon]);

  return state;
}

/**
 * The conditions row of EXPEDITION STATUS.
 *
 * The vocabulary describes WEATHER and nothing else. "Settled" is not "go" and
 * "unsettled" is not "do not go" — mountain weather turns faster than any model
 * resolves it, and the decision belongs to the athlete and their guide.
 */
function conditionsStatus(state: ConditionsState, to: string): SystemStatus {
  const base = { id: "conditions" as const, label: "Conditions", icon: CloudSnow, to };

  if (state.status === "no-location") {
    return {
      ...base,
      word: "Not enough yet",
      reason:
        "ICEFALL does not hold coordinates for this objective, so it cannot pull a forecast for it.",
      deficit: 0,
    };
  }

  if (state.status === "loading") {
    return {
      ...base,
      word: "Reading",
      reason: "Fetching the current forecast for the summit.",
      deficit: 0,
    };
  }

  const today = state.data.daily[0];

  if (state.data.error || !today) {
    return {
      ...base,
      word: "Not available",
      reason:
        "The forecast request did not complete. Nothing is being shown in its place — check the local mountain forecast directly.",
      deficit: 0,
    };
  }

  const rated = rateDay(today);
  const notes = rated.notes.join(" ");

  switch (rated.rating) {
    case "favourable":
      return { ...base, word: "Settled", reason: notes, deficit: 0 };
    case "mixed":
      return { ...base, word: "Mixed", reason: notes, deficit: 0.3 };
    case "poor":
      return { ...base, word: "Unsettled", reason: notes, deficit: CONDITIONS_DEFICIT_CEILING };
    default:
      return {
        ...base,
        word: "Not available",
        reason: "The model has no figures for today at this elevation.",
        deficit: 0,
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Training status                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Words for the training row.
 *
 * Every one describes the RECORD — what ICEFALL has seen — never the athlete
 * and never their prospects. "Established" says a body of work exists; it does
 * not say anyone is ready, and the readiness engine's own ceilings mean a
 * guided objective cannot reach beyond it anyway.
 */
function trainingWord(value: number): string {
  if (value >= 75) return "Established";
  if (value >= 50) return "Building";
  return "Early";
}

function trainingStatus(
  readiness: ObjectiveReadiness | null,
  recordedSessions: number,
  to: string,
  surveyed: boolean,
): SystemStatus {
  const base = { id: "training" as const, label: "Training", icon: Gauge, to };

  // Not a data gap: there is no class of objective to measure against, and
  // the deficit is zero because a system with no claim cannot be "behind".
  if (!surveyed) {
    return { ...base, word: "Not assessed", reason: REFERENCE_NO_READINESS_SHORT, deficit: 0 };
  }

  // No elevation for the objective means no class of mountain to assess against.
  if (!readiness) {
    return {
      ...base,
      word: "Not enough yet",
      reason:
        "Without an elevation for this objective ICEFALL cannot judge what class of mountain it is, so there is nothing to assess against.",
      deficit: 1,
    };
  }

  const gap = readiness.biggestGap;

  if (!isKnown(readiness.overall)) {
    return {
      ...base,
      word: "Not enough yet",
      reason:
        recordedSessions === 0
          ? "No sessions recorded on this device yet, and no single figure is given while a dimension this objective depends on is unknown."
          : `${gap ? gap.label : "One dimension this objective depends on"} is unknown, so no single figure is given for the mountain as a whole.`,
      deficit: 1,
    };
  }

  const value = readiness.overall.value;

  return {
    ...base,
    word: trainingWord(value),
    reason: gap
      ? `Set by ${gap.label.toLowerCase()}, the weakest of the dimensions this objective turns on.`
      : "No dimension ICEFALL can see is currently limiting this objective. That is not the same as being prepared for it.",
    deficit: (100 - value) / 100,
  };
}

/* -------------------------------------------------------------------------- */
/* Equipment status                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What the equipment checklist knows.
 *
 * `total === null` means no checklist could be generated for this objective at
 * all — which is a different claim from a checklist with nothing ticked, and
 * the two must never render the same. See `equipmentStatus`.
 *
 * `total` is the APPLICABLE count from `completion`, not the raw item count:
 * rows the athlete has struck out as not applicable are removed from both sides
 * of the figure by the checklist service, and re-adding them here would produce
 * a percentage that can never reach 100.
 */
interface EquipmentSummary {
  total: number | null;
  accounted: number | null;
  /** Whether any status has been recorded against this list at all. */
  touched: boolean;
  reason?: Unavailable;
  /** No list was generated because the peak is a reference entry, not because data is missing. */
  unsurveyed?: true;
}

function equipmentStatus(summary: EquipmentSummary, to: string): SystemStatus {
  const base = { id: "equipment" as const, label: "Equipment", icon: Backpack, to };

  if (summary.unsurveyed) {
    return { ...base, word: "No list", reason: REFERENCE_NO_KIT_LIST_SHORT, deficit: 0 };
  }

  if (summary.total === null || summary.accounted === null || summary.total === 0) {
    return {
      ...base,
      word: "Not enough yet",
      reason:
        "No equipment checklist has been generated for this objective yet, so ICEFALL has nothing to report against.",
      deficit: 1,
    };
  }

  // Silence is not a claim that something is packed, so an untouched list is
  // reported as untouched rather than as a list that is 0% done — the second
  // reads as work assessed and found wanting.
  if (!summary.touched) {
    return {
      ...base,
      word: "Not started",
      reason: `No status recorded against any of the ${summary.total} items yet. Nothing is assumed to be packed.`,
      deficit: 1,
    };
  }

  const outstanding = Math.max(0, summary.total - summary.accounted);
  const share = summary.accounted / summary.total;

  const word =
    outstanding === 0 ? "Complete" : share >= 0.75 ? "Nearly assembled" : "Partly assembled";

  return {
    ...base,
    word,
    reason:
      outstanding === 0
        ? `All ${summary.total} applicable items are accounted for — held, borrowed or hired.`
        : `${outstanding} of ${summary.total} applicable items are still unaccounted for.`,
    deficit: 1 - share,
  };
}

/* -------------------------------------------------------------------------- */
/* Next priority                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The single line telling the athlete what to work on.
 *
 * Derived from whichever of the three systems is furthest behind, never chosen
 * for tone. Three things it will never say, and the reasons are the product's:
 *
 *   - never "climb" or "do not climb" — that call belongs to the athlete and
 *     their guide, on the day, with the mountain in front of them
 *   - never "push harder" or "make up the sessions you missed" — a shortfall in
 *     training is a reason to move a date, not to train through fatigue
 *   - never a probability of success, because ICEFALL has none
 */
function priorityForTraining(
  readiness: ObjectiveReadiness,
  assessment: PeakAssessment,
  peakName: string,
): string {
  const gap = readiness.biggestGap;

  if (!gap) {
    return `Nothing ICEFALL can see is currently limiting your preparation for ${peakName} — which is not the same as being prepared for it, and the assessment that counts is made in person.`;
  }

  const unknown = !isKnown(readiness.overall);

  // The sentence names the DIMENSION rather than the system, because the card
  // already carries the system's own label. Naming both invents a second
  // vocabulary for the same row and makes the two look like different claims.
  const byDimension: Record<Dimension, string> = unknown
    ? {
        technical: `Of the three, this is the thinnest: ICEFALL holds no record of your technical skills, so tell it which of them you have been trained in and arrange instruction for the rest with an IFMGA/UIAGM-certified guide.`,
        altitude: `Of the three, this is the thinnest: ICEFALL holds no altitude history for you, and without it there is nothing honest to say about an objective this high.`,
        experience: `Of the three, this is the thinnest: the objectives you have already done are not logged, and that is the record a guide will ask about first.`,
        fitness: `Of the three, this is the thinnest: record your sessions for a few weeks — vertical, hours and how regularly you get out — and this dimension answers itself.`,
      }
    : {
        technical: `Of the three, this is the thinnest, and technical skill is the weakest part of it — it closes with instruction from a certified guide or instructor rather than with training volume.`,
        altitude: `Of the three, this is the thinnest, and altitude is the weakest part of it — it builds through progressively higher objectives and an acclimatisation plan made with your guide, not through anything you can do at home.`,
        experience: `Of the three, this is the thinnest, and experience is the weakest part of it — it builds through objectives one class below ${assessment.label.toLowerCase()}, taken in order.`,
        fitness: `Of the three, this is the thinnest, and fitness is the weakest part of it — it closes over months rather than weeks, with one long day a week and a genuine rest day in every week.`,
      };

  return byDimension[gap.id];
}

function nextPriority(
  systems: SystemStatus[],
  readiness: ObjectiveReadiness | null,
  assessment: PeakAssessment | null,
  peakName: string,
  equipment: EquipmentSummary,
  surveyed: boolean,
): { system: SystemId; sentence: string } {
  // Ranking three systems needs a claim about what the mountain asks of each,
  // and for a reference entry ICEFALL holds none. The line says so instead of
  // electing a winner between two systems that reported nothing.
  if (!surveyed) {
    return {
      system: "training",
      sentence: `${REFERENCE_NOT_ASSESSED} Keep to the general programme, watch the forecast, and treat the date as provisional.`,
    };
  }

  // Ties break in order of consequence: what you can prepare outranks what you
  // can only watch, and the body of work outranks the kit list.
  const order: SystemId[] = ["training", "equipment", "conditions"];
  const leader = systems.reduce((worst, s) =>
    s.deficit > worst.deficit ||
    (s.deficit === worst.deficit && order.indexOf(s.id) < order.indexOf(worst.id))
      ? s
      : worst,
  );

  if (leader.id === "training") {
    if (!readiness || !assessment) {
      return {
        system: "training",
        sentence: `Add an elevation to this objective so ICEFALL can work out what class of mountain ${peakName} is — every performance figure on this screen depends on it.`,
      };
    }
    return { system: "training", sentence: priorityForTraining(readiness, assessment, peakName) };
  }

  if (leader.id === "equipment") {
    if (equipment.total === null || equipment.accounted === null || equipment.total === 0) {
      return {
        system: "equipment",
        sentence: `Of the three, this is the thinnest: no checklist exists for ${peakName} yet, and it is the one part of this that can be finished entirely in advance.`,
      };
    }
    const outstanding = Math.max(0, equipment.total - equipment.accounted);
    return {
      system: "equipment",
      sentence: `Of the three, this is the thinnest: ${outstanding} of ${equipment.total} items are still unaccounted for, and it is the one part of this that can be finished entirely in advance.`,
    };
  }

  return {
    system: "conditions",
    sentence: `The two things you can prepare are both in reasonable shape, so the remaining variable is the mountain: today's modelled figures read ${leader.word.toLowerCase()} — review the local mountain forecast and the avalanche bulletin, and keep the plan provisional.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function CommandCentre() {
  const { goalId } = useParams<{ goalId: string }>();
  const { goals, objectives, coachProfile, checklistStatuses } = useApp();
  const activities = useRecordedActivities();
  const intel = useCoachIntel();

  /**
   * The objective this screen is about.
   *
   * The route wins; failing that the soonest active goal, which is the same
   * primary objective the dashboard and the coach already use. A goalId that
   * matches nothing falls through to the primary rather than 404ing — the
   * screen is still useful, and it names the mountain it is showing.
   */
  const goal = useMemo<Goal | undefined>(() => {
    const byId = goalId ? goals.find((g) => g.id === goalId) : undefined;
    if (byId) return byId;
    return goals
      .filter((g) => g.status === "active")
      .sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate))[0];
  }, [goalId, goals]);

  /**
   * A link that names an objective this athlete does not hold.
   *
   * The fallback is useful, but it must be stated: a screen that quietly swaps
   * the mountain under a countdown and a kit list is how someone ends up
   * preparing for the wrong summit.
   */
  const showingFallback = goalId !== undefined && !goals.some((g) => g.id === goalId);

  /** Simulated recordings are badged in the feed and are not training anyone did. */
  const recorded = useMemo(() => activities.filter((a) => !a.simulated), [activities]);

  /**
   * Summits the athlete has MARKED as done. The mock athlete fixture carries a
   * summit list which is deliberately not read here: crediting someone with a
   * fixture's mountains would feed a fabrication into altitude and experience.
   */
  const summitsLogged = useMemo(
    () =>
      objectives.flatMap((o) =>
        o.summitedAt ? [{ name: o.name, elevationM: o.elevationM, date: o.summitedAt }] : [],
      ),
    [objectives],
  );

  /** Curated mountains carry the coordinates a goal often does not. */
  const mountain = goal?.mountainId ? sync.mountainById(goal.mountainId) : undefined;
  /** Whether a human-written record backs this objective. See the header. */
  const surveyed = mountain !== undefined;
  const elevationM = goal?.elevationM ?? mountain?.elevationM ?? null;
  const lat = goal?.lat ?? mountain?.coords.lat;
  const lon = goal?.lon ?? mountain?.coords.lon;

  const readiness = useMemo<ObjectiveReadiness | null>(() => {
    if (!goal || elevationM === null || !surveyed) return null;
    return assessObjectiveReadiness({
      peak: { name: goal.name, elevationM, lat, lon },
      activities: recorded,
      summitsLogged,
      selfReported: {
        technicalSkills:
          coachProfile.technicalSkills.length > 0 ? coachProfile.technicalSkills : undefined,
        maxAltitudeM: coachProfile.maxAltitudeM,
        disciplineExperience:
          Object.keys(coachProfile.disciplineExperience).length > 0
            ? coachProfile.disciplineExperience
            : undefined,
      },
    });
  }, [goal, elevationM, lat, lon, surveyed, recorded, summitsLogged, coachProfile]);

  const conditions = useObjectiveConditions({
    name: goal?.name ?? "",
    elevationM,
    lat,
    lon,
  });

  /**
   * Equipment completion.
   *
   * The checklist is derived from the peak, so it exists as soon as an
   * elevation does; what the athlete has recorded against it lives in app
   * state, keyed by goal.
   *
   * ⚠️ THIS SAID THE TWO SCREENS "CAN NEVER DISAGREE ABOUT THE FIGURE." THEY
   * DO. Both call `completion` from the checklist service, which is where that
   * confidence came from — but the Checklist screen filters the list down to
   * the items it actually shows before counting, and this one counts every
   * generated row. Same function, two different inputs, two different
   * denominators on screen at once, and this figure drives the readiness
   * wording and the "do this next" line.
   *
   * The fix is to share the visible-items filter, not to restate the claim:
   * see `Checklist.tsx`, where the filter lives today. Until it is lifted into
   * `services/checklist.ts`, this note records the disagreement rather than
   * denying it.
   */
  const equipment = useMemo<EquipmentSummary>(() => {
    if (!goal || elevationM === null) {
      return { total: null, accounted: null, touched: false, reason: "no-data" };
    }
    if (!surveyed) {
      return { total: null, accounted: null, touched: false, unsurveyed: true };
    }
    const list = generateChecklist({ name: goal.name, elevationM, lat, lon });
    const statuses = checklistStatuses[goal.id] ?? {};
    const result = completion(list.items, statuses);
    return {
      total: result.applicable,
      accounted: result.resolved,
      touched: Object.keys(statuses).length > 0,
    };
  }, [goal, elevationM, lat, lon, surveyed, checklistStatuses]);

  if (!goal) return <NoObjective />;

  const assessment =
    elevationM === null || !surveyed ? null : assessPeak(elevationM, lat ?? 0, lon);
  const base = `/mountain/${goal.id}`;
  const now = new Date();
  const daysRemaining = daysUntilLocal(goal.targetDate, now);

  const systems: SystemStatus[] = [
    trainingStatus(readiness, recorded.length, `${base}/benchmark`, surveyed),
    equipmentStatus(equipment, `${base}/checklist`),
    conditionsStatus(conditions, `${base}/conditions`),
  ];

  const priority = nextPriority(systems, readiness, assessment, goal.name, equipment, surveyed);

  /**
   * Whether the performance figure is the athlete's own account of themselves.
   * True when any dimension says so, and true when ICEFALL has observed nothing
   * at all — in which case every figure on the screen came from a form.
   */
  const selfReported =
    recorded.length === 0 ||
    (readiness?.dimensions.some((d) => d.provenance === "self-reported") ?? false);

  return (
    <Screen padded={false}>
      <Hero goal={goal} elevationM={elevationM} assessment={assessment} curated={mountain} />

      <Stagger className="px-5 pb-4">
        {showingFallback && (
          <Rise className="pt-6">
            <p className="text-[11px] leading-relaxed text-mist-dim">
              No objective of yours matches this link, so ICEFALL is showing your soonest active one
              — {goal.name}. Everything below is about that mountain.
            </p>
          </Rise>
        )}

        <Rise className="pt-6">
          <Countdown goal={goal} daysRemaining={daysRemaining} />
        </Rise>

        <Rise className="pt-6">
          <ExpeditionStatus systems={systems} />
        </Rise>

        <Rise className="pt-6">
          <PerformancePanel
            readiness={readiness}
            selfReported={selfReported}
            recordedSessions={recorded.length}
            to={`${base}/benchmark`}
            surveyed={surveyed}
          />
        </Rise>

        <Rise className="pt-6">
          <EquipmentPanel summary={equipment} to={`${base}/checklist`} />
        </Rise>

        <Rise className="pt-6">
          <ConditionsPanel state={conditions} peakName={goal.name} to={`${base}/conditions`} />
        </Rise>

        {/* Guarded here rather than inside the panel: an empty Rise would still
            contribute its top padding and open a gap with nothing in it. */}
        {readiness && (
          <Rise className="pt-6">
            <HoldingBack readiness={readiness} />
          </Rise>
        )}

        <Rise className="pt-6">
          <TodayPanel intel={intel} goal={goal} />
        </Rise>

        <Rise className="pt-6">
          <NextPriority priority={priority} />
        </Rise>

        <Rise className="pt-6">
          <Footnotes
            readiness={readiness}
            conditions={conditions}
            hasChecklist={equipment.total !== null && equipment.total > 0}
            surveyed={surveyed}
          />
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero — WHERE AM I GOING                                                     */
/* -------------------------------------------------------------------------- */

function Hero({
  goal,
  elevationM,
  assessment,
  curated,
}: {
  goal: Goal;
  elevationM: number | null;
  assessment: PeakAssessment | null;
  curated: Mountain | undefined;
}) {
  const image = useMountainImage({
    name: goal.name,
    elevationM: elevationM ?? undefined,
    lat: goal.lat,
    lon: goal.lon,
    curatedId: goal.mountainId,
    wikipedia: goal.wikipedia,
    photo: goal.photo,
  });

  return (
    <div className="relative h-[300px] w-full overflow-hidden bg-slate">
      <img
        src={image.src}
        alt={image.real ? goal.name : ""}
        // Derived band artwork is held back so it reads as texture rather than
        // as a photograph of this summit.
        className={cn(
          "absolute inset-0 h-full w-full object-cover",
          image.real ? "opacity-100" : "opacity-45",
        )}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/75 to-obsidian/35" />

      <div className="absolute inset-x-0 top-0 p-4">
        <Link
          to="/goals"
          aria-label="Objectives"
          className="grid h-9 w-9 place-items-center rounded-full border border-hairline bg-obsidian/60 text-snow backdrop-blur transition-colors hover:border-azure/50"
        >
          <ChevronLeft size={18} strokeWidth={1.6} />
        </Link>
      </div>

      <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
        <p className="section-label text-mist">Command centre</p>
        <h1 className="display mt-2 text-[38px] leading-[1.05] text-snow">{goal.name}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {elevationM === null ? (
            <Badge>Elevation not held</Badge>
          ) : (
            <span className="tnum text-[13px] text-mist">{fmtElevation(elevationM)} m</span>
          )}
          {/* The grade a PERSON wrote, or the tier. Never `assessment.shortLabel`:
              that is an elevation band, and on the Matterhorn it read "Serious
              alpine" against a record that says "Technical alpine". */}
          {curated ? (
            <>
              <span className="text-mist-dim">·</span>
              <span className="text-[13px] text-mist">{curated.difficultyLabel}</span>
            </>
          ) : (
            <>
              <span className="text-mist-dim">·</span>
              <span className="section-label text-[9px] text-mist-dim">{TIER_EYEBROW.reference}</span>
            </>
          )}
          {goal.subtitle && goal.subtitle !== curated?.difficultyLabel && (
            <>
              <span className="text-mist-dim">·</span>
              <span className="text-[13px] text-mist">{goal.subtitle}</span>
            </>
          )}
        </div>

        {/* The image tier is never hidden: band artwork must not pass as a
            photograph of this mountain. */}
        {!image.real && image.caption && (
          <p className="mt-3 text-[10px] leading-relaxed text-mist-dim">{image.caption}</p>
        )}
        {image.credit && (
          <p className="mt-3 text-[10px] leading-relaxed text-mist-dim">{image.credit}</p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Countdown — WHEN                                                            */
/* -------------------------------------------------------------------------- */

function Countdown({ goal, daysRemaining }: { goal: Goal; daysRemaining: number | null }) {
  return (
    <Card className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="section-label text-mist-dim">Target date</p>
        <p className="mt-2.5 text-[17px] font-light text-snow">{fmtDate(goal.targetDate)}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
          A date you set, not a date ICEFALL recommends. Moving it is always available.
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="section-label text-mist-dim">Days remaining</p>
        {daysRemaining === null ? (
          <UnavailableState reason="no-data" size="sm" className="mt-2" />
        ) : daysRemaining < 0 ? (
          <p className="mt-2.5 text-[13px] text-mist">Date passed</p>
        ) : daysRemaining === 0 ? (
          <p className="mt-2.5 text-[13px] text-mist">Today</p>
        ) : (
          <p className="tnum mt-2 text-[34px] font-extralight leading-none tracking-[-0.02em] text-snow">
            {daysRemaining}
          </p>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Expedition status — the three systems, side by side                         */
/* -------------------------------------------------------------------------- */

function ExpeditionStatus({ systems }: { systems: SystemStatus[] }) {
  return (
    <section>
      <SectionLabel>Expedition status</SectionLabel>

      <Card inset={false} className="mt-3 divide-y divide-hairline">
        {systems.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.id}
              to={s.to}
              className="flex items-start gap-3.5 px-4 py-4 transition-colors first:rounded-t-card last:rounded-b-card hover:bg-white/[0.02]"
            >
              <Icon size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2.5">
                  <span className="section-label text-mist-dim">{s.label}</span>
                  {/* The word carries the state. Nothing here is colour-coded:
                      a traffic light asserts a verdict it cannot defend, and it
                      disappears entirely for a colour blind reader. */}
                  <span className="text-[14px] font-light text-snow">{s.word}</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{s.reason}</p>
              </div>

              <ChevronRight size={14} strokeWidth={1.7} className="mt-1 shrink-0 text-mist-dim" />
            </Link>
          );
        })}
      </Card>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Performance — AM I PHYSICALLY READY                                         */
/* -------------------------------------------------------------------------- */

function DimensionRow({ dimension }: { dimension: DimensionResult }) {
  const score = dimension.score;

  // A dimension that does not apply to this class of objective carries a null
  // score with NO reason. It is not missing data and must not be asked for.
  const notApplicable = score.value === null && score.reason === undefined;

  return (
    <div className="py-3">
      <div className="flex items-center gap-2.5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-snow">{dimension.label}</span>
        {dimension.provenance === "self-reported" && <QualifierBadge kind="self-reported" />}
        {isKnown(score) ? (
          <span className="tnum shrink-0 text-[12px] text-mist">
            {score.value}
            <span className="text-mist-dim">/100</span>
          </span>
        ) : (
          <span className="shrink-0 text-[11px] text-mist-dim">
            {notApplicable ? "Not applicable" : ABSENCE_COPY[score.reason ?? "no-data"].title}
          </span>
        )}
      </div>

      <div
        className="mt-2 h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: "oklch(1 0 0 / 8%)" }}
      >
        {/* No fill at all when the value is unknown: a zero-width azure bar and a
            genuine score of zero would look identical. */}
        {isKnown(score) && (
          <div
            className="h-full rounded-full bg-azure"
            style={{ width: `${Math.max(0, Math.min(100, score.value))}%` }}
          />
        )}
      </div>
    </div>
  );
}

function PerformancePanel({
  readiness,
  selfReported,
  recordedSessions,
  to,
  surveyed,
}: {
  readiness: ObjectiveReadiness | null;
  selfReported: boolean;
  recordedSessions: number;
  to: string;
  surveyed: boolean;
}) {
  return (
    <section>
      <SectionLabel>Am I physically ready</SectionLabel>

      <Card className="mt-3">
        {!surveyed ? (
          // A named absence, not an UnavailableState: nothing is missing from a
          // calculation. There is no calculation for this tier.
          <div className="py-1">
            <p className="section-label text-mist-dim">No readiness figure</p>
            <p className="mt-2.5 text-[12px] leading-relaxed text-mist">{REFERENCE_NO_READINESS}</p>
            <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">{REFERENCE_NEXT_STEP}</p>
          </div>
        ) : !readiness ? (
          <div className="py-4">
            <UnavailableState reason="no-data" size="md" className="mx-auto" />
            <p className="mt-4 text-center text-[11px] leading-relaxed text-mist-dim">
              ICEFALL judges the class of objective from its elevation and position. Without an
              elevation for this one there is nothing honest to assess against.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center pt-1">
              <ScoreRing score={readiness.overall} size={132} caption="Preparation profile" />
              {isKnown(readiness.overall) && selfReported && (
                <span className="mt-3">
                  <QualifierBadge kind="self-reported" />
                </span>
              )}
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">
              {isKnown(readiness.overall)
                ? "The weakest applicable dimension rather than an average — strength in one place cannot pay for a gap in another."
                : "No single figure is given while a dimension this objective depends on is unknown. A number built from the parts that happen to be known would read as a verdict on the whole mountain."}
              {recordedSessions === 0 &&
                " Nothing has been recorded on this device, so everything below came from what you told ICEFALL rather than from anything it observed."}
            </p>

            <div className="mt-3 divide-y divide-hairline border-t border-hairline">
              {readiness.dimensions.map((d) => (
                <DimensionRow key={d.id} dimension={d} />
              ))}
            </div>

            <Link to={to} className="mt-4 block">
              <Button variant="secondary" className="w-full">
                Open the benchmark
                <ChevronRight size={15} strokeWidth={1.8} />
              </Button>
            </Link>
          </>
        )}
      </Card>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Equipment — DO I HAVE EVERYTHING                                            */
/* -------------------------------------------------------------------------- */

function EquipmentPanel({ summary, to }: { summary: EquipmentSummary; to: string }) {
  const known =
    summary.total !== null && summary.accounted !== null && summary.total > 0
      ? { total: summary.total, accounted: summary.accounted }
      : null;

  return (
    <section>
      <SectionLabel>Do I have everything</SectionLabel>

      <Card className="mt-3">
        {summary.unsurveyed ? (
          <div className="py-1">
            <p className="section-label text-mist-dim">No kit list</p>
            <p className="mt-2.5 text-[12px] leading-relaxed text-mist">{REFERENCE_NO_KIT_LIST}</p>
            <Link to={to} className="mt-4 block">
              <Button variant="secondary" className="w-full">
                Open your pack
                <ChevronRight size={15} strokeWidth={1.8} />
              </Button>
            </Link>
          </div>
        ) : known === null ? (
          <div className="py-3">
            <UnavailableState reason={summary.reason ?? "no-data"} size="md" className="mx-auto" />
            <p className="mt-4 text-center text-[11px] leading-relaxed text-mist-dim">
              No checklist has been generated for this objective yet. Nothing is being shown as
              packed in the meantime.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="tnum text-[34px] font-extralight leading-none tracking-[-0.02em] text-snow">
                  {known.accounted}
                  <span className="ml-1 text-[14px] font-light text-mist">of {known.total}</span>
                </p>
                <p className="section-label mt-2.5 text-mist-dim">Items accounted for</p>
              </div>
              <p className="tnum text-[13px] text-mist">
                {Math.round((known.accounted / known.total) * 100)}%
              </p>
            </div>

            <div
              className="mt-4 h-[3px] w-full overflow-hidden rounded-full"
              style={{ background: "oklch(1 0 0 / 8%)" }}
            >
              <div
                className="h-full rounded-full bg-azure"
                style={{ width: `${Math.round((known.accounted / known.total) * 100)}%` }}
              />
            </div>

            {/* What counts is stated rather than implied: an item you have
                arranged to borrow or hire is not an item you are missing, and
                a figure that treated it as one would push people to buy kit
                they had already sorted. */}
            <p className="mt-3.5 text-[11px] leading-relaxed text-mist-dim">
              {summary.touched
                ? "Held, borrowed and hired all count. Items you have struck out as not applicable are removed from both sides of the figure."
                : "No status has been recorded against this list yet, so nothing is counted as packed."}
            </p>
          </>
        )}

        <Link to={to} className="mt-4 block">
          <Button variant="secondary" className="w-full">
            Open the checklist
            <ChevronRight size={15} strokeWidth={1.8} />
          </Button>
        </Link>
      </Card>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Conditions — WHAT IS THE MOUNTAIN DOING                                     */
/* -------------------------------------------------------------------------- */

/**
 * One forecast figure.
 *
 * A missing reading prints the reason it is missing, never a zero and never a
 * dash: "0 °C on the summit" and "we could not read the summit temperature"
 * would dress the same and mean opposite things to someone packing a bag.
 */
function ReadingTile({
  label,
  reading,
  unit,
  format,
}: {
  label: string;
  reading: Reading;
  unit: string;
  format: (n: number) => string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="section-label text-mist-dim">{label}</p>
      {reading.value === null ? (
        <p className="mt-2 text-[11px] text-mist-dim">
          {ABSENCE_COPY[reading.reason ?? "no-data"].title}
        </p>
      ) : (
        <p className="tnum mt-2 text-[22px] font-extralight leading-none text-snow">
          {format(reading.value)}
          <span className="ml-1 text-[12px] font-light text-mist">{unit}</span>
        </p>
      )}
    </div>
  );
}

function ConditionsPanel({
  state,
  peakName,
  to,
}: {
  state: ConditionsState;
  peakName: string;
  to: string;
}) {
  return (
    <section>
      <SectionLabel>What is the mountain doing</SectionLabel>

      <Card className="mt-3">
        {state.status === "no-location" ? (
          <div className="py-3">
            <UnavailableState reason="no-data" size="md" className="mx-auto" />
            <p className="mt-4 text-center text-[11px] leading-relaxed text-mist-dim">
              ICEFALL holds no coordinates for {peakName}, so it cannot ask for a forecast. Nothing
              is shown in place of one.
            </p>
          </div>
        ) : state.status === "loading" ? (
          <p className="py-6 text-center text-[12px] text-mist-dim">Reading the forecast…</p>
        ) : state.data.error ? (
          <div className="py-3">
            <UnavailableState reason="no-data" size="md" className="mx-auto" />
            <p className="mt-4 text-center text-[11px] leading-relaxed text-mist-dim">
              The forecast request did not complete. A failed request is never drawn as calm weather
              — check the local mountain forecast directly.
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-4">
              <ReadingTile
                label="Summit temp"
                reading={state.data.current.temperatureC}
                unit="°C"
                format={(n) => n.toFixed(1)}
              />
              <ReadingTile
                label="Wind"
                reading={state.data.current.windKph}
                unit="km/h"
                format={(n) => String(Math.round(n))}
              />
              <ReadingTile
                label="Freezing level"
                reading={state.data.current.freezingLevelM}
                unit="m"
                format={fmtElevation}
              />
            </div>

            {state.data.daily[0] && (
              <p className="mt-4 border-t border-hairline pt-3.5 text-[11px] leading-relaxed text-mist-dim">
                {rateDay(state.data.daily[0]).notes.join(" ")}
              </p>
            )}

            <p className="mt-3 text-[10px] leading-relaxed text-mist-dim">
              {CONDITIONS_ATTRIBUTION}
            </p>
          </>
        )}

        <Link to={to} className="mt-4 block">
          <Button variant="secondary" className="w-full">
            Open conditions
            <ChevronRight size={15} strokeWidth={1.8} />
          </Button>
        </Link>
      </Card>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Holding me back                                                             */
/* -------------------------------------------------------------------------- */

function HoldingBack({ readiness }: { readiness: ObjectiveReadiness }) {
  const gap = readiness.biggestGap;
  const dimension = gap ? (readiness.dimensions.find((d) => d.id === gap.id) ?? null) : null;

  return (
    <section>
      <SectionLabel>What is holding me back</SectionLabel>

      <Card className="mt-3">
        {gap === null ? (
          <p className="text-[12px] leading-relaxed text-mist">
            No dimension ICEFALL can see is currently limiting this objective. That is not a
            statement that you are prepared for it — ICEFALL cannot see the route, the conditions,
            or how you move on the day.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <span className="text-[15px] font-light text-snow">{gap.label}</span>
              {dimension?.provenance === "self-reported" && <QualifierBadge kind="self-reported" />}
            </div>
            {dimension && (
              <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">{dimension.summary}</p>
            )}
            <p className="mt-3.5 border-t border-hairline pt-3.5 text-[12px] leading-relaxed text-mist">
              {gap.recommendation}
            </p>
          </>
        )}
      </Card>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Today — WHAT DO I DO TODAY                                                  */
/* -------------------------------------------------------------------------- */

function TodayPanel({ intel, goal }: { intel: ReturnType<typeof useCoachIntel>; goal: Goal }) {
  const today = intel.today;

  /**
   * The coach builds one plan, for the soonest active objective. Viewing a
   * different mountain's command centre must not silently relabel that plan as
   * this mountain's — so when they differ, the screen says whose plan it is.
   */
  const planIsForAnother = intel.goal !== undefined && intel.goal.id !== goal.id;

  return (
    <section>
      <SectionLabel>What do I do today</SectionLabel>

      <Card className="mt-3">
        {intel.plan === null ? (
          // Not an UnavailableState: nothing failed and nothing is missing from
          // a calculation. There is simply no plan yet, and the honest sentence
          // for that is not "we need more data".
          <p className="text-[12px] leading-relaxed text-mist">
            No training plan has been built yet, so there is no session to show for today.
          </p>
        ) : today === undefined ? (
          <p className="text-[12px] leading-relaxed text-mist">
            Nothing is scheduled for today in the current plan.
          </p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="section-label text-mist-dim">
                  {FOCUS_LABELS[today.focus] ?? today.focus}
                </p>
                <p className="mt-2 text-[15px] font-light leading-snug text-snow">{today.title}</p>
              </div>
              {intel.currentWeek && (
                <Badge className="shrink-0">Week {intel.currentWeek.index}</Badge>
              )}
            </div>

            {today.detail && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{today.detail}</p>
            )}

            {(today.elevationM !== undefined || today.durationMin !== undefined) && (
              <div className="mt-3.5 flex gap-6 border-t border-hairline pt-3.5">
                {today.elevationM !== undefined && (
                  <div>
                    <p className="section-label text-mist-dim">Ascent</p>
                    <p className="tnum mt-1.5 text-[15px] font-light text-snow">
                      {fmtElevation(today.elevationM)} m
                    </p>
                  </div>
                )}
                {today.durationMin !== undefined && (
                  <div>
                    <p className="section-label text-mist-dim">Duration</p>
                    <p className="tnum mt-1.5 text-[15px] font-light text-snow">
                      {today.durationMin} min
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {planIsForAnother && intel.goal && (
          <p className="mt-3.5 text-[11px] leading-relaxed text-mist-dim">
            Your training plan is currently built for {intel.goal.name}, not {goal.name}. Today's
            session comes from that plan.
          </p>
        )}

        <Link to="/coach/plan" className="mt-4 block">
          <Button variant="secondary" className="w-full">
            Open the plan
            <ChevronRight size={15} strokeWidth={1.8} />
          </Button>
        </Link>
      </Card>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Next priority                                                               */
/* -------------------------------------------------------------------------- */

const PRIORITY_LABEL: Record<SystemId, string> = {
  training: "Training",
  equipment: "Equipment",
  conditions: "Conditions",
};

function NextPriority({ priority }: { priority: { system: SystemId; sentence: string } }) {
  return (
    <section>
      <SectionLabel>Your next priority</SectionLabel>

      <Card className="mt-3 border-azure/25">
        <div className="flex items-center gap-2">
          <ArrowUpRight size={14} strokeWidth={1.8} className="shrink-0 text-azure" />
          <span className="section-label text-mist-dim">{PRIORITY_LABEL[priority.system]}</span>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-snow">{priority.sentence}</p>
      </Card>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Footnotes                                                                   */
/* -------------------------------------------------------------------------- */

function Footnotes({
  readiness,
  conditions,
  hasChecklist,
  surveyed,
}: {
  readiness: ObjectiveReadiness | null;
  conditions: ConditionsState;
  hasChecklist: boolean;
  surveyed: boolean;
}) {
  return (
    <section className="space-y-4">
      {!surveyed && <Disclaimer>{TIER_STATEMENT.reference}</Disclaimer>}
      {readiness?.professionalAdvice && <Disclaimer>{readiness.professionalAdvice}</Disclaimer>}
      {readiness && <Disclaimer>{OBJECTIVE_READINESS_DISCLAIMER}</Disclaimer>}
      {hasChecklist && <Disclaimer>{CHECKLIST_DISCLAIMER}</Disclaimer>}
      {conditions.status !== "no-location" && <Disclaimer>{CONDITIONS_DISCLAIMER}</Disclaimer>}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

function NoObjective() {
  return (
    <Screen>
      <Stagger>
        <Rise className="pt-6">
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <MountainIcon size={28} strokeWidth={1.2} className="text-mist-dim" />
            <h1 className="mt-5 text-[22px] font-light text-snow">No objective set</h1>
            <p className="mt-3 max-w-[30ch] text-[13px] leading-relaxed text-mist">
              The command centre reads three systems against one mountain. Choose the mountain and
              it has something to read.
            </p>
            <Link to="/goals" className="mt-7">
              <Button>
                <CalendarDays size={15} strokeWidth={1.8} />
                Set an objective
              </Button>
            </Link>
          </div>
        </Rise>
      </Stagger>
    </Screen>
  );
}
