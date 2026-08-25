import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, CircleDashed, Minus, ShieldAlert } from "lucide-react";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { QualifierBadge, UnavailableState } from "@/components/coach/DataState";
import { Rise, Stagger } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation } from "@/lib/format";
import { assessObjectiveReadiness } from "@/coach/mountainReadiness";
import type { Dimension, DimensionResult, ObjectiveReadiness } from "@/coach/mountainReadiness";
import { assessPeak } from "@/services/peakAssessment";
import { useRecordedActivities } from "@/tracking/feed";
import { useApp, usePrimaryGoal } from "@/state/AppState";

/**
 * The readiness payoff — the first and only surface for `assessObjectiveReadiness`.
 *
 * READ THIS BEFORE EDITING. Everything on this screen is produced by the engine
 * in `@/coach/mountainReadiness`, and the single most important property of
 * this file is that it ADDS NOTHING. It has no thresholds of its own for
 * dimensions, it invents no dimension the engine does not compute, and it never
 * substitutes a number for a `Score` the engine withheld.
 *
 * Three consequences that are not negotiable:
 *
 *   1. THE ENGINE COMPUTES FOUR DIMENSIONS — fitness, technical, altitude,
 *      experience — and this screen renders exactly those four. It does not
 *      render "aerobic capacity", "pack endurance", "recovery" or "nutrition".
 *      ICEFALL does not compute them against an objective, and drawing a bar
 *      for one would be inventing a measurement.
 *   2. A NULL SCORE IS NEVER A ZERO. Two distinct nulls arrive here and they
 *      read differently on purpose: null WITH a reason is "we do not know this,
 *      here is why" and gets the UnavailableState; null WITHOUT a reason is
 *      "this dimension does not apply to this class of objective" and gets a
 *      plain line saying so. Neither is a bar at 0%.
 *   3. THIS SCORE IS MOSTLY SELF-REPORTED, and on the funnel path it is
 *      entirely self-reported — the athlete answered some questions minutes
 *      ago and ICEFALL has observed nothing. The qualifier badge therefore sits
 *      on the headline number itself, not in a footnote, because a number this
 *      consequential being mistaken for a measurement is the worst outcome this
 *      screen can produce.
 *
 * And what it must never read as: clearance. The engine's `disclaimer` and its
 * `professionalAdvice` are rendered in full and high on the page, above the
 * call to action rather than below it, for exactly the reason the trial screen
 * puts its billing notice above the button.
 */

/* -------------------------------------------------------------------------- */
/* The funnel's hand-off                                                       */
/* -------------------------------------------------------------------------- */

/**
 * What the readiness questionnaire passes through router state.
 *
 * Exported so the funnel screen can import the shape rather than guessing at
 * it. Every field is optional-tolerant on arrival — this screen validates what
 * it is given and falls back to what is already on the profile, because a
 * malformed hand-off must degrade into a smaller honest answer rather than a
 * crash or an invented one.
 */
export interface ReadinessResultState {
  peak: { name: string; elevationM: number; lat?: number; lon?: number };
  /** ISO date the athlete intends to attempt it. Absent when they gave none. */
  targetDate?: string;
  /**
   * The questionnaire's answers, in the engine's own `selfReported` shape.
   * Passed through untouched — this screen does not reinterpret an answer.
   */
  selfReported?: {
    technicalSkills?: string[];
    maxAltitudeM?: number;
    disciplineExperience?: Record<string, string>;
    fitness?: {
      weeklyAscentM?: number;
      biggestDayAscentM?: number;
      longestDayHours?: number;
    };
  };
}

/* ---- Narrow parsing of untrusted router state ---------------------------- */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A finite number of any sign — for coordinates. */
const finite = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** A finite POSITIVE number — for elevations, hours and ascent. */
const positive = (v: unknown): number | undefined => {
  const n = finite(v);
  return n !== undefined && n > 0 ? n : undefined;
};

const text = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
};

const textList = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const items = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return items.length > 0 ? items : undefined;
};

const textMap = (v: unknown): Record<string, string> | undefined => {
  if (!isRecord(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, raw] of Object.entries(v)) {
    const value = text(raw);
    if (value !== undefined) out[k] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

/** An ISO date string we can actually parse. Anything else is treated as absent. */
const isoDate = (v: unknown): string | undefined => {
  const s = text(v);
  if (s === undefined) return undefined;
  return Number.isFinite(new Date(s).getTime()) ? s : undefined;
};

function parseNavState(raw: unknown): ReadinessResultState | null {
  if (!isRecord(raw) || !isRecord(raw.peak)) return null;

  const name = text(raw.peak.name);
  const elevationM = positive(raw.peak.elevationM);
  // Without a name and an elevation there is no objective to assess. Guessing
  // either would put a stranger's mountain on the athlete's payoff screen.
  if (name === undefined || elevationM === undefined) return null;

  const sr = isRecord(raw.selfReported) ? raw.selfReported : undefined;
  const fit = sr && isRecord(sr.fitness) ? sr.fitness : undefined;

  return {
    peak: { name, elevationM, lat: finite(raw.peak.lat), lon: finite(raw.peak.lon) },
    targetDate: isoDate(raw.targetDate),
    selfReported: sr
      ? {
          technicalSkills: textList(sr.technicalSkills),
          maxAltitudeM: positive(sr.maxAltitudeM),
          disciplineExperience: textMap(sr.disciplineExperience),
          fitness: fit
            ? {
                weeklyAscentM: positive(fit.weeklyAscentM),
                biggestDayAscentM: positive(fit.biggestDayAscentM),
                longestDayHours: positive(fit.longestDayHours),
              }
            : undefined,
        }
      : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Estimated preparation                                                       */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/**
 * ICEFALL plans in four-week blocks — see `blockFor` in `@/tracking/training`,
 * which lays down Base/Build/Peak/Taper in roughly four-week chunks with a
 * deload every fourth week.
 */
const BLOCK_WEEKS = 4;

/**
 * The generator will not build a plan shorter than this, so nothing this screen
 * quotes may be shorter either. Mirrors `MIN_WEEKS` in `@/tracking/training`,
 * which is module-private; if that constant changes, change this one.
 */
const MIN_BUILD_WEEKS = 8;

/**
 * The point at which the engine stops treating a dimension as the limiter —
 * `STRONG_DIMENSION` in `@/coach/mountainReadiness`, which is module-private.
 * The estimate is the distance to HERE, not to 100: "no longer the thing
 * holding you back" is a defensible target and "perfect" is not.
 */
const LIMITER_THRESHOLD = 75;

/**
 * The one assumption on this screen, and it is disclosed in the copy verbatim.
 *
 * There is no measured rate at which a person's fitness score rises, and this
 * is NOT a claim that there is. It is a deliberately pessimistic planning
 * figure — no more than ten points of the gap closed per four-week block — used
 * so the arithmetic produces a FLOOR under the preparation time rather than a
 * forecast of a finish date. Raising it would make the screen more encouraging
 * and less true, which is the wrong trade in both directions.
 */
const POINTS_PER_BLOCK = 10;

type Preparation =
  | { kind: "weeks"; floorWeeks: number }
  /** No week figure can be given honestly, and this says why in the coach's words. */
  | { kind: "not-estimable"; reason: string }
  /** Nothing ICEFALL can see is currently the limiter. */
  | { kind: "no-limiter" };

/**
 * Weeks of preparation, computed from the gap the engine found.
 *
 * Only ONE dimension can be turned into a number of weeks: fitness. That is not
 * a limitation of the arithmetic, it is a fact about the dimensions —
 *
 *   technical  is bought in days of instruction from a qualified person, and no
 *              quantity of weeks substitutes for it;
 *   altitude   is closed by trips and by a trip's own acclimatisation schedule,
 *              neither of which ICEFALL can see;
 *   experience is closed by completing objectives, which happen on their own
 *              calendar and not on a training plan's.
 *
 * Putting a week count on any of those three would be a fabricated timeline for
 * something training does not deliver, so they return `not-estimable` with the
 * real reason instead.
 */
function estimatePreparation(readiness: ObjectiveReadiness): Preparation {
  const gap = readiness.biggestGap;
  if (gap === null) return { kind: "no-limiter" };

  const dimension = readiness.dimensions.find((d) => d.id === gap.id);
  const score = dimension?.score.value ?? null;

  if (gap.id !== "fitness") {
    const reason: Record<Exclude<Dimension, "fitness">, string> = {
      technical:
        "Technical competence is not measured in weeks of training. It is learned in person, in days, from an IFMGA/UIAGM-certified guide or a qualified instructor — so ICEFALL will not put a training timeline on it.",
      altitude:
        "Altitude is closed by going higher over time and by the acclimatisation schedule of the trip itself. ICEFALL cannot see your itinerary and cannot predict how you will respond, so there is no honest number of weeks to give here.",
      experience:
        "Experience is built by completing objectives one class below this one. They happen on their own calendar rather than a training plan's, so ICEFALL will not estimate it in weeks.",
    };
    return { kind: "not-estimable", reason: reason[gap.id] };
  }

  if (score === null) {
    return {
      kind: "not-estimable",
      reason:
        "ICEFALL has nothing to measure the gap against yet. Record a few weeks of sessions — vertical, hours and how regularly you get out — and it can put a floor under the preparation time.",
    };
  }

  const shortfall = Math.max(0, LIMITER_THRESHOLD - score);
  const blocks = Math.ceil(shortfall / POINTS_PER_BLOCK);
  const floorWeeks = Math.max(MIN_BUILD_WEEKS, blocks * BLOCK_WEEKS);
  return { kind: "weeks", floorWeeks };
}

/* -------------------------------------------------------------------------- */
/* Screen chrome — the full-bleed funnel shell, as the trial screens use       */
/* -------------------------------------------------------------------------- */

function FunnelScreen({
  eyebrow,
  title,
  subtitle,
  back,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  back?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="no-scrollbar relative h-full overflow-y-auto bg-obsidian">
      <div
        className="relative px-6 pb-12"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
      >
        {back && (
          <Link
            to={back}
            aria-label="Back"
            className="mb-8 grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:text-snow"
          >
            <ArrowLeft size={19} strokeWidth={1.6} />
          </Link>
        )}

        <Stagger>
          <Rise>
            <p className="section-label text-azure/85">{eyebrow}</p>
            <h1 className="display mt-3 text-[32px] leading-[1.08] text-snow">{title}</h1>
            {subtitle && <p className="mt-3 text-[13px] leading-relaxed text-mist">{subtitle}</p>}
          </Rise>
          {children}
        </Stagger>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The dimension bar                                                           */
/* -------------------------------------------------------------------------- */

/**
 * One dimension, in one of three renderings.
 *
 * The bar itself is a hairline track with a fill and no gradient. The LIMITING
 * dimension's fill is azure and every other fill is neutral — that is the whole
 * accent budget on this list, and it is spent on the one row the athlete has to
 * act on rather than sprinkled across four.
 */
function DimensionRow({ dimension, limiting }: { dimension: DimensionResult; limiting: boolean }) {
  const value = dimension.score.value;

  return (
    <div className="border-t border-hairline py-4 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-snow">{dimension.label}</span>
        {value !== null ? (
          <span className="tnum text-[15px] font-light tracking-[-0.01em] text-snow">
            {value}
            <span className="ml-0.5 text-[11px] text-mist">%</span>
          </span>
        ) : (
          <span className="section-label text-mist-dim">
            {dimension.score.reason ? "No score" : "Not assessed"}
          </span>
        )}
      </div>

      {value !== null && (
        <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={cn("h-full rounded-full", limiting ? "bg-azure" : "bg-snow/45")}
            style={{ width: `${value}%` }}
          />
        </div>
      )}

      {/* Provenance rides beside the bar, not under the card. The engine sets it
          when a dimension was scored from the athlete's own answers rather than
          from anything ICEFALL observed. */}
      {dimension.provenance === "self-reported" && (
        <span className="mt-2.5 inline-block">
          <QualifierBadge kind="self-reported" />
        </span>
      )}

      {/* A dimension with no score and a REASON gets the designed absence state.
          A dimension with no score and no reason does not apply to this class of
          objective at all — that is a finding, not a gap, so it gets a line
          rather than a "connect a device" prompt. */}
      {value === null && dimension.score.reason && (
        <div className="mt-3 rounded-tile border border-hairline bg-elevated/30 px-4 py-4">
          <UnavailableState reason={dimension.score.reason} size="sm" />
        </div>
      )}

      <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{dimension.summary}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Requirements of the limiting dimension                                      */
/* -------------------------------------------------------------------------- */

/**
 * The engine's `met` is three-state and the three states are NOT interchangeable:
 * `true` we have evidence for, `false` we have contrary evidence for, and `null`
 * means nobody has told us. A cross beside `null` would be ICEFALL asserting a
 * shortcoming nobody reported, so `null` gets a dashed empty circle — the house
 * shorthand for a slot waiting on an answer — and never a failure mark.
 */
function RequirementRow({
  met,
  label,
  note,
}: {
  met: boolean | null;
  label: string;
  note: string;
}) {
  const icon =
    met === true ? (
      <Check size={10} strokeWidth={2.6} />
    ) : met === false ? (
      <Minus size={10} strokeWidth={2.6} />
    ) : (
      <CircleDashed size={11} strokeWidth={1.5} />
    );

  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
          met === true ? "border-azure/50 text-azure" : "border-hairline-strong text-mist-dim",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] leading-snug text-snow">{label}</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-mist-dim">{note}</span>
      </span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state — no objective to assess                                        */
/* -------------------------------------------------------------------------- */

function NoObjective() {
  return (
    <FunnelScreen
      eyebrow="Readiness"
      title="No objective set."
      subtitle="Readiness is always readiness for something. Without a mountain and its elevation there is nothing for ICEFALL to assess, and a general score would mean nothing on any particular day."
      back="/home"
    >
      <Rise className="mt-8">
        <Button asChild className="w-full">
          <Link to="/explore">
            Choose a mountain
            <ArrowRight size={16} strokeWidth={1.8} />
          </Link>
        </Button>
      </Rise>
    </FunnelScreen>
  );
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                  */
/* -------------------------------------------------------------------------- */

export default function ReadinessResult() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, account, coachProfile, objectives } = useApp();
  const activities = useRecordedActivities();
  const goal = usePrimaryGoal();

  // Fixed on mount so the countdown cannot tick over mid-screen and change the
  // preparation comparison under the athlete's eyes.
  const now = useMemo(() => new Date(), []);

  const passed = useMemo(() => parseNavState(location.state as unknown), [location.state]);

  /**
   * Where the objective comes from, in order of authority:
   *   1. the questionnaire that just ran (router state);
   *   2. the athlete's soonest active goal.
   * If neither yields a name AND an elevation, the screen says so rather than
   * assessing a mountain nobody chose.
   */
  const objective = useMemo(() => {
    if (passed) return passed;
    if (goal && typeof goal.elevationM === "number" && Number.isFinite(goal.elevationM)) {
      return {
        peak: {
          name: goal.name,
          elevationM: goal.elevationM,
          lat: goal.lat,
          lon: goal.lon,
        },
        targetDate: goal.targetDate,
        selfReported: undefined,
      } satisfies ReadinessResultState;
    }
    return null;
  }, [passed, goal]);

  /**
   * Summits the athlete has MARKED as done. The seeded objective list ships
   * with none marked, and the mock `user.summits` fixture is deliberately not
   * read here — crediting a real athlete with a fixture's summits would feed a
   * fabrication straight into the experience and altitude dimensions.
   */
  const summitsLogged = useMemo(
    () =>
      objectives.flatMap((o) =>
        o.summitedAt ? [{ name: o.name, elevationM: o.elevationM, date: o.summitedAt }] : [],
      ),
    [objectives],
  );

  const readiness = useMemo<ObjectiveReadiness | null>(() => {
    if (!objective) return null;
    return assessObjectiveReadiness({
      peak: objective.peak,
      activities,
      summitsLogged,
      selfReported: {
        // The questionnaire's answers win where it asked; the stored profile
        // fills the rest. Both are the athlete's own words either way.
        technicalSkills:
          objective.selfReported?.technicalSkills ??
          (coachProfile.technicalSkills.length > 0 ? coachProfile.technicalSkills : undefined),
        maxAltitudeM: objective.selfReported?.maxAltitudeM ?? coachProfile.maxAltitudeM,
        disciplineExperience:
          objective.selfReported?.disciplineExperience ??
          (Object.keys(coachProfile.disciplineExperience).length > 0
            ? coachProfile.disciplineExperience
            : undefined),
        fitness: objective.selfReported?.fitness,
      },
      now,
    });
  }, [objective, activities, summitsLogged, coachProfile, now]);

  if (!objective || !readiness) return <NoObjective />;

  const { peak, targetDate } = objective;
  const gap = readiness.biggestGap;
  const gapDimension = gap ? (readiness.dimensions.find((d) => d.id === gap.id) ?? null) : null;
  const preparation = estimatePreparation(readiness);

  const daysToSummit =
    targetDate === undefined
      ? null
      : Math.ceil((new Date(targetDate).getTime() - now.getTime()) / DAY_MS);
  const weeksAvailable =
    daysToSummit === null || daysToSummit < 0 ? null : Math.floor(daysToSummit / 7);

  // Same call the engine makes internally (latitude only shapes the season
  // window, which is not surfaced here), used solely to explain why a composite
  // on this class of objective is held below full marks.
  const assessment = assessPeak(peak.elevationM, peak.lat ?? 0, peak.lon);

  /**
   * Whether this assessment is the athlete's own account of themselves.
   *
   * True whenever any dimension declares self-reported provenance, and true
   * whenever ICEFALL has observed nothing at all — which is every athlete
   * arriving from the questionnaire. The badge sits ON the headline number for
   * that reason: on this path the number is a structured version of what they
   * just typed, and it must never be mistaken for something ICEFALL measured.
   */
  const recordedSessions = activities.filter((a) => !a.simulated).length;
  const selfReportedOverall =
    recordedSessions === 0 || readiness.dimensions.some((d) => d.provenance === "self-reported");

  const firstName = user.name.split(" ")[0];

  /** The lead line of the insight, in the coach's register. Never a promise. */
  const insightLead =
    gap === null
      ? `No dimension ICEFALL can see is currently holding ${peak.name} back, ${firstName}. That is not the same as being ready for it — ICEFALL cannot see the route, the conditions, or how you move on the day.`
      : readiness.overall.value === null
        ? `ICEFALL is not putting a single figure on ${peak.name} yet, ${firstName}, and ${gap.label.toLowerCase()} is the reason.`
        : `The figure above is set by ${gap.label.toLowerCase()}, ${firstName}. It is the weakest of the dimensions this objective turns on, and on a mountain the weakest one is the one that decides.`;

  return (
    <FunnelScreen
      eyebrow="Readiness assessment"
      title={peak.name}
      subtitle={`${fmtElevation(peak.elevationM)} m · ${assessment.shortLabel}`}
      back="/home"
    >
      {/* ---- The score ---------------------------------------------------- */}
      <Rise className="mt-8">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="section-label text-mist-dim">Your {peak.name} readiness</p>

              {readiness.overall.value !== null ? (
                <p className="tnum mt-3 text-[64px] font-extralight leading-none tracking-[-0.03em] text-snow">
                  {readiness.overall.value}
                  <span className="ml-1.5 text-[18px] font-light text-mist">%</span>
                </p>
              ) : (
                <div className="mt-4 flex justify-start">
                  <UnavailableState reason={readiness.overall.reason ?? "no-data"} size="lg" />
                </div>
              )}

              {readiness.overall.value !== null && selfReportedOverall && (
                <span className="mt-3.5 inline-block">
                  <QualifierBadge kind="self-reported" />
                </span>
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="section-label text-mist-dim">Days to summit</p>
              {targetDate === undefined || daysToSummit === null ? (
                <p className="mt-3 text-[13px] leading-snug text-mist">No date set</p>
              ) : daysToSummit < 0 ? (
                <p className="mt-3 text-[13px] leading-snug text-mist">Date passed</p>
              ) : (
                <>
                  <p className="tnum mt-3 text-[30px] font-extralight leading-none tracking-[-0.02em] text-snow">
                    {daysToSummit}
                  </p>
                  <p className="mt-2 text-[11px] text-mist-dim">{fmtDate(targetDate)}</p>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-hairline pt-4">
            <p className="text-[11px] leading-relaxed text-mist-dim">
              {selfReportedOverall
                ? "Self-reported. This is built from what you told ICEFALL, not from anything it has observed, and it is not a measurement of your body. "
                : "Built from the sessions you have recorded and from what you have told ICEFALL. "}
              {readiness.overall.value === null
                ? "No single figure is given while a dimension this objective depends on is unknown — a number assembled from the parts that happen to be known would read as a verdict on the whole mountain."
                : "It is the weakest applicable dimension rather than an average, so strength in one place cannot pay for a gap in another."}
              {readiness.overall.value !== null && assessment.requiresGuide
                ? " It is also held short of full marks on this class of objective: the last of that judgement is made in person, on the day, by a certified guide, and ICEFALL is not entitled to award it."
                : ""}
            </p>
            {daysToSummit === null && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
                No target date has been given, so ICEFALL is not counting down to one.
              </p>
            )}
          </div>
        </Card>
      </Rise>

      {/* ---- Guide requirement, above everything it could be traded against - */}
      {readiness.professionalAdvice && (
        <Rise className="mt-4">
          <div className="rounded-tile border border-azure/25 bg-azure/[0.05] p-4">
            <div className="flex items-center gap-2 text-azure/85">
              <ShieldAlert size={13} strokeWidth={1.7} aria-hidden="true" />
              <p className="section-label text-azure/85">Take professional instruction</p>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
              {readiness.professionalAdvice}
            </p>
          </div>
        </Rise>
      )}

      {/* ---- Performance profile ------------------------------------------ */}
      <Rise className="mt-9">
        <SectionLabel>Performance profile</SectionLabel>
        <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
          The four dimensions ICEFALL assesses against an objective. Where one is blank it is
          because ICEFALL does not know it or does not score it here — never because it is zero.
        </p>
        <Card className="mt-3 p-5">
          {readiness.dimensions.map((d) => (
            <DimensionRow key={d.id} dimension={d} limiting={gap?.id === d.id} />
          ))}
        </Card>
      </Rise>

      {/* ---- Personalised insight ----------------------------------------- */}
      <Rise className="mt-9">
        <SectionLabel>What this says</SectionLabel>
        <Card className="mt-3 p-5">
          <p className="text-[13px] leading-relaxed text-snow">{insightLead}</p>
          {gapDimension && (
            <p className="mt-3 text-[12px] leading-relaxed text-mist">{gapDimension.summary}</p>
          )}
        </Card>
      </Rise>

      {/* ---- Your priority ------------------------------------------------- */}
      {gap && (
        <Rise className="mt-9">
          <SectionLabel>Your priority</SectionLabel>
          <Card className="mt-3 p-5">
            <p className="display text-[24px] leading-tight text-snow">{gap.label}</p>
            <p className="mt-3 text-[12px] leading-relaxed text-mist">{gap.recommendation}</p>

            {gapDimension && gapDimension.requirements.length > 0 && (
              <>
                <p className="section-label mt-5 text-mist-dim">What this objective asks for</p>
                <ul className="mt-3 space-y-3">
                  {gapDimension.requirements.map((r) => (
                    <RequirementRow key={r.label} met={r.met} label={r.label} note={r.note} />
                  ))}
                </ul>
                <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">
                  An empty circle means nobody has told ICEFALL yet — it is a question, not a mark
                  against you.
                </p>
              </>
            )}
          </Card>
        </Rise>
      )}

      {/* ---- Estimated preparation ---------------------------------------- */}
      <Rise className="mt-9">
        <SectionLabel>Estimated preparation</SectionLabel>
        <Card className="mt-3 p-5">
          {preparation.kind === "weeks" ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] text-mist">At least</span>
                <span className="tnum text-[38px] font-extralight leading-none tracking-[-0.02em] text-snow">
                  {preparation.floorWeeks}
                </span>
                <span className="text-[13px] text-mist">weeks</span>
              </div>
              <p className="mt-3.5 text-[12px] leading-relaxed text-mist">
                {weeksAvailable === null
                  ? "A floor under the preparation time before fitness stops being the dimension holding this objective back. No target date has been set, so ICEFALL cannot weigh it against the time you have."
                  : weeksAvailable < preparation.floorWeeks
                    ? `Your date leaves ${weeksAvailable} ${weeksAvailable === 1 ? "week" : "weeks"}, which is short of ICEFALL's own floor for the gap it can see. Moving the date is a legitimate answer and usually the better one — a mountain is not improved by arriving underprepared or tired.`
                    : `Your date leaves ${weeksAvailable} weeks, which clears that floor. Clearing it is not the same as being ready: it means time is not the thing in the way.`}
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
                Computed from the gap ICEFALL can see and the time you have, on a deliberately
                pessimistic planning assumption — four-week blocks, and no more than about ten
                points of the gap closed per block. It is an assumption about planning, not a
                prediction about your body, and it is a floor rather than a finish date.
              </p>
            </>
          ) : preparation.kind === "no-limiter" ? (
            <p className="text-[12px] leading-relaxed text-mist">
              No dimension ICEFALL can see is currently the limiter, so there is no preparation
              shortfall to put a number on. Keep training, and keep the assessment that matters —
              the one made in person, on the day — ahead of this one.
            </p>
          ) : (
            <>
              <p className="section-label text-mist-dim">Not estimable</p>
              <p className="mt-3 text-[12px] leading-relaxed text-mist">{preparation.reason}</p>
            </>
          )}

          <p className="mt-4 border-t border-hairline pt-4 text-[11px] leading-relaxed text-mist-dim">
            A plan is a way of preparing. It is not a guarantee of a summit, and no figure on this
            screen is a promise that you will be ready.
          </p>
        </Card>
      </Rise>

      {/* ---- The engine's own disclaimer, in full -------------------------- */}
      <Rise className="mt-9">
        <SectionLabel>What this assessment is not</SectionLabel>
        <Disclaimer className="mt-3">{readiness.disclaimer}</Disclaimer>
      </Rise>

      {/* ---- The ask ------------------------------------------------------- */}
      <Rise className="mt-10">
        <div className="border-t border-hairline pt-7">
          <p className="display text-[24px] leading-tight text-snow">
            Your mountain has been mapped.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-mist">
            {account
              ? "Your assessment is held on this device against your objective, and it updates itself as you record sessions and tell ICEFALL more."
              : "Create your free ICEFALL account to save your assessment."}
          </p>

          {/* The account is a profile on this device and nothing more — there is
              no account server. Saying "save your assessment" without saying
              where it is saved would imply a backend that does not exist, so the
              qualification sits directly under the ask rather than in a footer. */}
          <p className="mt-4 border-l border-hairline pl-3 text-[11px] leading-relaxed text-mist-dim">
            ICEFALL is not connected to an account server. An account is a profile on this device:
            your answers and this assessment stay on your phone, nothing is uploaded, no payment
            method is asked for and nothing is charged. The assessment is recomputed from your
            answers each time you open it.
          </p>

          <Button
            className="mt-6 w-full"
            onClick={() => navigate(account ? "/coach/plan" : "/auth/create")}
          >
            Build my training plan
            <ArrowRight size={16} strokeWidth={1.8} />
          </Button>
          {!account && (
            <Button variant="secondary" className="mt-3 w-full" onClick={() => navigate("/home")}>
              Not now
            </Button>
          )}
        </div>
      </Rise>
    </FunnelScreen>
  );
}
