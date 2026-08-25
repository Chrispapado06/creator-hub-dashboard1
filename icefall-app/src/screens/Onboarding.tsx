import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Anchor,
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  Compass,
  Footprints,
  Loader2,
  MoreHorizontal,
  MountainSnow,
  Search,
  Snowflake,
  Wind,
  X,
} from "lucide-react";
import { Button, Disclaimer } from "@/components/ui/primitives";
import { MountainThumb } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation } from "@/lib/format";
import { monthsAhead } from "@/data/mock/clock";
import { sync } from "@/services/repository";
import { assessPeak } from "@/services/peakAssessment";
import { PEAK_ATTRIBUTION, searchPeaks, type Peak } from "@/services/peaks";
import { buildPlanForGoal } from "@/tracking/training";
import { useApp, type OnboardingAnswers } from "@/state/AppState";
import type { Discipline, ExperienceLevel, Goal } from "@/types";
import type { Equipment } from "@/coach/exercises";
import { SESSION_INTENTS, type IntentId } from "@/coach/sessionIntent";
import { useSettings } from "@/settings/store";

/**
 * Screen 02 — personalisation.
 *
 * THE RULE THIS FILE IS BUILT ON: a question earns its screen only if the
 * answer changes what ICEFALL does. A questionnaire that collects preferences
 * and then ignores them is theatre, and the payoff screen at the end is the
 * proof — it states, per answer, what changed.
 *
 * Which means it also has to state what did NOT change. Two answers here are
 * currently stored on the profile and read by nothing:
 *
 *   · trainingDays      — buildPlanForGoal lays down a fixed seven-day week
 *                         (six sessions, one rest day) and does not consult it
 *   · typicalSessionMin — buildSession takes its length from the plan's day,
 *                         and SessionDetail passes equipment only
 *
 * They are asked because they belong on the profile and the athlete expects to
 * be asked, and the payoff says plainly that they do not yet move a session.
 * The moment either is wired up, delete the caveat — do not delete the answer.
 *
 * Everything else is genuinely consumed:
 *
 *   · availableEquipment  → SessionDetail → buildSession, which will not
 *                           prescribe a movement whose kit you don't have
 *   · technicalSkills     → mountainReadiness.technicalDimension, matched
 *                           against the competences the objective demands
 *   · maxAltitudeM        → mountainReadiness.bestAltitude, as a floor
 *   · disciplineExperience→ mountainReadiness.experienceDimension, surfaced
 *                           verbatim as context and deliberately not scored
 *   · the goal + timeline → addGoal, whose targetDate is what buildPlanForGoal
 *                           builds the whole plan backwards from
 *
 * The numbers on the payoff screen are not written by hand. It calls
 * buildPlanForGoal on the goal it just created and reads the week count and the
 * session count back out, so the screen cannot drift from the generator.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const DURATION = 0.38;

/* -------------------------------------------------------------------------- */
/* Answer vocabularies                                                         */
/* -------------------------------------------------------------------------- */

type Level = "beginner" | "intermediate" | "advanced" | "expert";

const LEVELS: { id: Level; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
  { id: "expert", label: "Expert" },
];

/**
 * Eight disciplines are offered; the app's `Discipline` union holds six.
 *
 * Mountain biking, alpine skiing and "other" have no member of that union, and
 * inventing one here would ripple through activity types and fixtures. They are
 * offered anyway — people do them — and they are not thrown away: every
 * selected discipline gets an experience row, and every row is written to
 * `disciplineExperience`, which is keyed by free-form string. Only the six the
 * union recognises reach `OnboardingAnswers.disciplines`.
 */
interface DisciplineOption {
  id: string;
  label: string;
  icon: typeof Footprints;
  /** Present when this maps onto the app's own `Discipline` union. */
  discipline?: Discipline;
}

const DISCIPLINES: DisciplineOption[] = [
  { id: "hiking", label: "Hiking", icon: Footprints, discipline: "hiking" },
  { id: "trail-running", label: "Trail running", icon: Wind, discipline: "trail-running" },
  {
    id: "mountaineering",
    label: "Mountaineering",
    icon: MountainSnow,
    discipline: "mountaineering",
  },
  { id: "climbing", label: "Climbing", icon: Anchor, discipline: "climbing" },
  { id: "ski-touring", label: "Ski touring", icon: Compass, discipline: "ski-touring" },
  { id: "mountain-biking", label: "Mountain biking", icon: Bike },
  { id: "alpine-skiing", label: "Alpine skiing", icon: Snowflake },
  { id: "other", label: "Something else", icon: MoreHorizontal },
];

/**
 * A display-level summary only.
 *
 * `User.experience` is a single value and this flow asks per discipline, so the
 * strongest level is taken. Note what this is NOT used for: sessions.ts refuses
 * to map mountain experience onto movement difficulty, and nothing here changes
 * that — an athlete who has climbed for twenty years still gets a conservative
 * first barbell session, which is the correct outcome.
 */
const LEVEL_TO_EXPERIENCE: Record<Level, ExperienceLevel> = {
  beginner: "new",
  intermediate: "developing",
  advanced: "experienced",
  expert: "advanced",
};

const SUGGESTED_MOUNTAIN_IDS = ["mont-blanc", "matterhorn", "everest", "mount-olympus"];

/** Curated objectives as peaks, so one picker handles suggestions and search alike. */
const SUGGESTIONS: Peak[] = SUGGESTED_MOUNTAIN_IDS.flatMap((id) => {
  const m = sync.mountainById(id);
  // A curated id that no longer resolves disappears rather than rendering an
  // empty tile — a blank suggestion is worse than one fewer suggestion.
  if (!m) return [];
  return [
    {
      id: `curated:${m.id}`,
      name: m.name,
      elevationM: m.elevationM,
      lat: m.coords.lat,
      lon: m.coords.lon,
      curatedId: m.id,
      country: m.country,
    },
  ];
});

const TIMELINES: { id: string; label: string; months: number; assumed?: boolean }[] = [
  { id: "6m", label: "Within 6 months", months: 6 },
  { id: "1y", label: "Within a year", months: 12 },
  { id: "2y", label: "Within two years", months: 24 },
  // A plan has to be built backwards from a date, so "not sure" still needs
  // one. Twelve months is used and the payoff screen says it was assumed.
  { id: "unsure", label: "Not sure yet", months: 12, assumed: true },
];

/** JS day indices, Monday first. `CoachProfile.trainingDays` is 0 = Sunday. */
const WEEK: { day: number; label: string; full: string }[] = [
  { day: 1, label: "Mon", full: "Monday" },
  { day: 2, label: "Tue", full: "Tuesday" },
  { day: 3, label: "Wed", full: "Wednesday" },
  { day: 4, label: "Thu", full: "Thursday" },
  { day: 5, label: "Fri", full: "Friday" },
  { day: 6, label: "Sat", full: "Saturday" },
  { day: 0, label: "Sun", full: "Sunday" },
];

const SESSION_LENGTHS = [30, 45, 60, 90, 120];

/** Labels for the real `Equipment` union — see src/coach/exercises.ts. */
const EQUIPMENT: { id: Equipment; label: string; note?: string }[] = [
  { id: "none", label: "Bodyweight only", note: "No kit at all" },
  { id: "dumbbells", label: "Dumbbells" },
  { id: "barbell", label: "Barbell" },
  { id: "kettlebell", label: "Kettlebell" },
  { id: "pull-up-bar", label: "Pull-up bar" },
  { id: "bench", label: "Bench" },
  { id: "step", label: "Step or box" },
  { id: "resistance-band", label: "Resistance band" },
  { id: "treadmill", label: "Treadmill" },
  { id: "stairs", label: "Stairs" },
  { id: "pack", label: "Weighted pack" },
  { id: "hangboard", label: "Hangboard" },
];

/**
 * The technical competences ICEFALL can actually check an objective against.
 *
 * Every string here is one of the skills `peakAssessment` lists for a band, so
 * `mountainReadiness.skillClaimed` matches it and the requirement is marked as
 * reported. That constraint is the whole point: offering "lead rock" — which no
 * band asks for — would look thorough and do nothing but drag the technical
 * score down, because any claim at all switches that dimension from "withheld"
 * to scored. A tile that cannot be credited is not offered.
 */
const SKILL_GROUPS: { title: string; skills: string[] }[] = [
  {
    title: "Hill and scrambling ground",
    skills: [
      "Navigation in poor visibility",
      "Grade I–II scrambling",
      "Comfort with exposure",
      "Rockfall awareness",
    ],
  },
  {
    title: "Snow, ice and glacier",
    skills: [
      "Crampon and ice-axe technique",
      "Self-arrest on steep snow",
      "Roped glacier travel",
      "Crevasse rescue",
      "Efficient rope work on mixed ground",
      "Reading snow and serac hazard",
    ],
  },
  {
    title: "Altitude and expedition",
    skills: [
      "Staged acclimatisation",
      "Recognising acute mountain sickness",
      "Cold-injury prevention",
      "Fixed-line ascent and descent",
      "Supplementary oxygen systems",
    ],
  },
];

/**
 * Bands, stored as the lower bound.
 *
 * The bottom band stores 0, which `bestAltitude` ignores because it requires a
 * value above zero. That is correct: "I have never been above 1,000 m" is an
 * answer, but it is not an altitude floor worth reasoning from.
 */
const ALTITUDE_BANDS: { id: string; label: string; lowerM: number }[] = [
  { id: "b0", label: "Under 1,000 m", lowerM: 0 },
  { id: "b1", label: "1,000 – 3,000 m", lowerM: 1000 },
  { id: "b2", label: "3,000 – 4,500 m", lowerM: 3000 },
  { id: "b3", label: "4,500 – 6,000 m", lowerM: 4500 },
  { id: "b4", label: "Above 6,000 m", lowerM: 6000 },
];

/* -------------------------------------------------------------------------- */
/* Shared chrome — the visual language of the auth screens                     */
/* -------------------------------------------------------------------------- */

function StepHead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string | string[];
  subtitle?: string;
}) {
  const lines = Array.isArray(title) ? title : [title];
  return (
    <header>
      <p className="section-label text-azure/85">{eyebrow}</p>
      <h1 className="display mt-3 text-[30px] leading-[1.08] text-snow">
        {lines.map((l) => (
          <span key={l} className="block">
            {l}
          </span>
        ))}
      </h1>
      {subtitle && <p className="mt-3 text-[13px] leading-relaxed text-mist">{subtitle}</p>}
    </header>
  );
}

/** The azure check badge that marks a chosen tile. */
function Ticked() {
  return (
    <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-azure text-obsidian">
      <Check size={12} strokeWidth={3} />
    </span>
  );
}

function Tile({
  selected,
  onClick,
  className,
  children,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={cn(
        "relative rounded-tile border text-left transition-colors duration-200",
        selected
          ? "border-azure/60 bg-azure/[0.07]"
          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
        className,
      )}
    >
      {children}
      {selected && <Ticked />}
    </button>
  );
}

/** A one-line row of mutually exclusive choices. */
function ChoiceRow({
  label,
  detail,
  selected,
  onClick,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-tile border px-4 py-3 text-left transition-colors duration-200",
        selected
          ? "border-azure/60 bg-azure/[0.07]"
          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
      )}
    >
      {/* Aligned to the first line, not the block: a row carrying a second line
          of detail would otherwise float its marker into the gap between them. */}
      <span
        className={cn(
          "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
          selected ? "bg-azure" : "bg-white/20",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-snow">{label}</span>
        {detail && <span className="mt-0.5 block text-[11px] text-mist-dim">{detail}</span>}
      </span>
    </button>
  );
}

/** What a blank answer means, said rather than enforced. */
function EmptyMeaning({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 border-l border-hairline pl-3 text-[11px] leading-relaxed text-mist-dim">
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Peak search                                                                 */
/* -------------------------------------------------------------------------- */

function PeakSearch({ onPick }: { onPick: (p: Peak) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Peak[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    // Debounced: the geocoder behind searchPeaks allows roughly one request a
    // second, and typing "matterhorn" would otherwise fire ten.
    const t = setTimeout(() => {
      searchPeaks(q, ctrl.signal)
        .then((r) => {
          setResults(r.slice(0, 8));
          setSearched(true);
        })
        .finally(() => setSearching(false));
    }, 550);
    return () => {
      clearTimeout(t);
      ctrl.abort();
      setSearching(false);
    };
  }, [query]);

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search for a mountain</span>
        <Search
          size={16}
          strokeWidth={1.6}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any peak on earth"
          spellCheck={false}
          className="h-12 w-full rounded-tile border border-hairline bg-elevated/40 pl-10 pr-10 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
        />
        {searching && (
          <Loader2
            size={16}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-mist-dim"
          />
        )}
        {!searching && query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full text-mist-dim transition-colors hover:text-snow"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </label>

      {results.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-3 rounded-tile border border-hairline bg-elevated/40 p-2.5 text-left transition-colors hover:border-azure/50"
              >
                <MountainThumb peak={p} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-snow">{p.name}</span>
                  <span className="tnum block text-[11px] text-mist-dim">
                    {fmtElevation(p.elevationM)} m{p.country ? ` · ${p.country}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searched && !searching && results.length === 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
          Nothing found. Search runs against OpenStreetMap and needs a connection; peaks without a
          recorded elevation are left out, because elevation is what every assessment is derived
          from.
        </p>
      )}

      <p className="mt-3 text-[10px] text-mist-dim">{PEAK_ATTRIBUTION}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The flow                                                                    */
/* -------------------------------------------------------------------------- */

type StepKey =
  | "intro"
  | "disciplines"
  | "experience"
  | "goal"
  | "timeline"
  | "days"
  | "length"
  | "equipment"
  | "skills"
  | "altitude"
  | "body"
  | "intent"
  | "name"
  | "payoff";

/**
 * Every question the flow can ask.
 *
 * The live total shrinks when a step doesn't apply, so the intro quotes this
 * ceiling rather than the current count — promising "eight questions" and then
 * asking ten because they picked an objective is exactly the small dishonesty
 * this screen exists to avoid.
 */
const ALL_QUESTION_STEPS: StepKey[] = [
  "disciplines",
  "experience",
  "goal",
  "timeline",
  "days",
  "length",
  "equipment",
  "skills",
  "altitude",
  "body",
  "intent",
  "name",
];

/** What was actually written, so the payoff reports facts rather than intent. */
interface CreatedGoal {
  peak: Peak;
  targetDate: string;
  trainingStartedAt: string;
  /** True when the athlete said "not sure" and the date was chosen for them. */
  dateAssumed: boolean;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { account, completeOnboarding, updateCoachProfile, addGoal, setBodyMassKg } = useApp();
  const { patch: patchSettings } = useSettings();

  const [index, setIndex] = useState(0);

  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [goalPeak, setGoalPeak] = useState<Peak | null>(null);
  const [noGoal, setNoGoal] = useState(false);
  const [timelineId, setTimelineId] = useState<string | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [sessionMin, setSessionMin] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [altitudeId, setAltitudeId] = useState<string | null>(null);
  const [name, setName] = useState(account?.name ?? "");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [intent, setIntent] = useState<IntentId | null>(null);
  const [created, setCreated] = useState<CreatedGoal | null>(null);

  /**
   * Steps that have something to ask. Two drop out: the experience step when no
   * discipline was chosen, and the timeline when there is no objective to date.
   * A screen that asks nothing still costs a tap and still counts against "N of
   * N", which makes the flow feel longer than it is.
   */
  const steps = useMemo<StepKey[]>(() => {
    const s: StepKey[] = ["intro", "disciplines"];
    if (disciplines.length > 0) s.push("experience");
    s.push("goal");
    if (goalPeak) s.push("timeline");
    // "body" and "intent" sit BEFORE "name" deliberately: `finish()` runs on
    // leaving the name step, so anything asked after it would be written after
    // the answers were already saved.
    s.push("days", "length", "equipment", "skills", "altitude", "body", "intent", "name", "payoff");
    return s;
  }, [disciplines.length, goalPeak]);

  const step = steps[Math.min(index, steps.length - 1)];

  // The intro and the payoff are not questions, so they are outside the count.
  const questions: StepKey[] = steps.filter((s) => s !== "intro" && s !== "payoff");
  const questionNumber = questions.indexOf(step) + 1;

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  /* ---- Persistence ------------------------------------------------------- */

  // completeOnboarding and addGoal both append, so running finish twice would
  // create two goals. It is called once, on leaving the name step.
  const saved = useRef(false);

  const finish = useCallback(() => {
    if (saved.current) return;
    saved.current = true;

    updateCoachProfile({
      disciplineExperience: levels,
      availableEquipment: equipment,
      trainingDays: days,
      // The stored default is 60; an unanswered step must not silently claim a
      // different one, so the same 60 is written back.
      typicalSessionMin: sessionMin ?? 60,
      technicalSkills: skills,
      maxAltitudeM: ALTITUDE_BANDS.find((b) => b.id === altitudeId)?.lowerM,
    });

    /**
     * The athlete's objective is always created, even when a goal of the same
     * name already exists.
     *
     * The four suggestions are also four of the demo fixtures in
     * data/mock/goals.ts, so picking one leaves two "Mont Blanc" rows on the
     * Goals screen. That is ugly and worth fixing — but the alternative is
     * worse. Adopting the fixture would silently discard the timeline answer and
     * hand a brand-new athlete a goal that claims they began training eleven
     * weeks ago and are 41% prepared for a summit they mentioned a minute ago.
     * Inventing a measurement is a far more serious fault than a duplicate row.
     *
     * The real fix is upstream — the fixtures should not ship as the athlete's
     * own goals, or AppState needs a way to retarget an existing one. Neither
     * belongs in this file.
     */
    if (goalPeak) {
      const timeline = TIMELINES.find((t) => t.id === timelineId) ?? TIMELINES[1];
      const curated = goalPeak.curatedId ? sync.mountainById(goalPeak.curatedId) : undefined;
      const targetDate = monthsAhead(timeline.months);
      const trainingStartedAt = new Date().toISOString();

      addGoal({
        name: goalPeak.name,
        subtitle:
          curated?.difficultyLabel ??
          assessPeak(goalPeak.elevationM, goalPeak.lat, goalPeak.lon).label,
        elevationM: goalPeak.elevationM,
        mountainId: goalPeak.curatedId,
        wikipedia: goalPeak.wikipedia,
        lat: goalPeak.lat,
        lon: goalPeak.lon,
        country: goalPeak.country,
        targetDate,
        trainingStartedAt,
        photo: curated?.photo,
        gaps: [
          "Training plan just created — complete sessions to build preparation",
          "Baseline fitness assessment outstanding",
        ],
      });

      setCreated({
        peak: goalPeak,
        targetDate,
        trainingStartedAt,
        dateAssumed: Boolean(timeline.assumed),
      });
    }

    const strongest = LEVELS.map((l) => l.id)
      .filter((id) => Object.values(levels).includes(id))
      .at(-1);

    const answers: OnboardingAnswers = {
      name,
      disciplines: disciplines
        .map((id) => DISCIPLINES.find((d) => d.id === id)?.discipline)
        .filter((d): d is Discipline => d !== undefined),
      // Conservative when nothing was said. "new" is the only value that cannot
      // overstate what the athlete has done.
      experience: strongest ? LEVEL_TO_EXPERIENCE[strongest] : "new",
      // Deliberately blank: completeOnboarding would otherwise create a second
      // goal on a hardcoded ten-month horizon, ignoring the timeline answer.
      goalName: "",
    };
    /*
     * The body answers, written where each is actually read.
     *
     * Weight goes to `setBodyMassKg` because that is the value the recorder
     * passes into the calorie estimate — it defaulted to 72 kg for everyone, so
     * this is the first session whose energy figure describes this athlete.
     * Height, birth year and the training intent go to settings, which is where
     * the rest of the profile lives.
     */
    const kg = Number(weightKg.replace(",", "."));
    if (Number.isFinite(kg) && kg > 0) setBodyMassKg(kg);

    const cm = Number(heightCm.replace(",", "."));
    const year = Number(birthYear);
    patchSettings({
      heightCm: Number.isFinite(cm) && cm > 0 ? Math.round(cm) : undefined,
      birthYear: Number.isFinite(year) && year > 1900 ? Math.round(year) : undefined,
      trainingIntent: intent ?? undefined,
      sessionGoal: intent ?? undefined,
    });

    completeOnboarding(answers);
  }, [
    addGoal,
    altitudeId,
    completeOnboarding,
    days,
    disciplines,
    equipment,
    goalPeak,
    levels,
    name,
    sessionMin,
    skills,
    timelineId,
    updateCoachProfile,
  ]);

  /* ---- Gating ------------------------------------------------------------ */

  // Multi-select steps never block. Every single-select offers an answer for
  // every athlete — including "not sure" and "I don't have one yet" — so
  // requiring one asks nothing unreasonable.
  const canAdvance = ((): boolean => {
    switch (step) {
      case "experience":
        return disciplines.every((id) => levels[id] !== undefined);
      case "goal":
        return Boolean(goalPeak) || noGoal;
      case "timeline":
        return timelineId !== null;
      case "length":
        return sessionMin !== null;
      case "altitude":
        return altitudeId !== null;
      case "name":
        return name.trim().length > 0;
      default:
        return true;
    }
  })();

  function next() {
    if (!canAdvance) return;
    if (step === "name") finish();
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  return (
    <div className="flex h-full flex-col bg-obsidian">
      {/* ---- Progress ---------------------------------------------------- */}
      <div
        className="flex shrink-0 items-center gap-3 px-5 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)" }}
      >
        {index > 0 && step !== "payoff" ? (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            aria-label="Back"
            className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:text-snow"
          >
            <ArrowLeft size={18} strokeWidth={1.6} />
          </button>
        ) : (
          <span className="h-9 w-0 shrink-0" />
        )}

        <div className="flex flex-1 gap-1">
          {questions.map((key, i) => {
            const reached = questionNumber > 0 && i < questionNumber;
            const done = step === "payoff";
            return (
              <span key={key} className="h-px flex-1 overflow-hidden bg-hairline">
                <motion.span
                  className="block h-full bg-azure"
                  initial={false}
                  animate={{ width: reached || done ? "100%" : "0%" }}
                  transition={{ duration: 0.45, ease: EASE }}
                />
              </span>
            );
          })}
        </div>

        <span className="section-label tnum shrink-0">
          {step === "intro"
            ? "INTRO"
            : step === "payoff"
              ? "DONE"
              : `${questionNumber} OF ${questions.length}`}
        </span>
      </div>

      {/* ---- Body -------------------------------------------------------- */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5">
        {/* NOT mode="wait". That mode holds the incoming step until the outgoing
            one finishes exiting, and framer-motion drives exits with
            requestAnimationFrame — which the browser pauses whenever the page is
            hidden. Background the app mid-step and the exit never completes, so
            the next question never mounts and the athlete comes back to a dead
            screen part-way through signing up. Overlapping the transition costs
            a little polish and cannot strand anyone. */}
        <AnimatePresence initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: DURATION, ease: EASE }}
            className="pb-10 pt-6"
          >
            {step === "intro" && <IntroStep count={ALL_QUESTION_STEPS.length} />}

            {step === "disciplines" && (
              <>
                <StepHead
                  eyebrow="Disciplines"
                  title={["What do you", "actually do?"]}
                  subtitle="Choose everything that applies. This decides which experience questions ICEFALL asks you next, and those go to the readiness assessment as context."
                />
                <div className="mt-7 grid grid-cols-2 gap-2.5">
                  {DISCIPLINES.map((d) => {
                    const on = disciplines.includes(d.id);
                    const Icon = d.icon;
                    return (
                      <Tile
                        key={d.id}
                        selected={on}
                        className="p-4"
                        onClick={() => {
                          setDisciplines((s) => toggle(s, d.id));
                          // Dropping a discipline drops its experience answer —
                          // keeping it would write a level for something the
                          // athlete no longer says they do.
                          setLevels((s) => {
                            if (!(d.id in s)) return s;
                            const rest = { ...s };
                            delete rest[d.id];
                            return rest;
                          });
                        }}
                      >
                        <Icon
                          size={19}
                          strokeWidth={1.5}
                          className={on ? "text-azure" : "text-mist"}
                        />
                        <span className="mt-6 block pr-5 text-[13px] leading-snug text-snow">
                          {d.label}
                        </span>
                      </Tile>
                    );
                  })}
                </div>
                <EmptyMeaning>
                  Choosing nothing is allowed. ICEFALL then skips the experience question and
                  records no disciplines — your sessions and your plan are unaffected, because
                  neither is built from this answer.
                </EmptyMeaning>
              </>
            )}

            {step === "experience" && (
              <>
                <StepHead
                  eyebrow="Experience"
                  title="How far in are you?"
                  subtitle="One answer per discipline. ICEFALL records these as your own words and never scores them — a claim is a claim, and it will say so."
                />
                <div className="mt-7 space-y-5">
                  {disciplines.map((id) => {
                    const option = DISCIPLINES.find((d) => d.id === id);
                    if (!option) return null;
                    return (
                      <div key={id}>
                        <p className="section-label text-mist-dim">{option.label}</p>
                        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                          {LEVELS.map((l) => {
                            const on = levels[id] === l.id;
                            return (
                              <button
                                key={l.id}
                                type="button"
                                onClick={() => setLevels((s) => ({ ...s, [id]: l.id }))}
                                aria-pressed={on}
                                className={cn(
                                  "rounded-tile border px-1 py-2.5 text-[11px] transition-colors duration-200",
                                  on
                                    ? "border-azure/60 bg-azure/[0.07] text-snow"
                                    : "border-hairline bg-elevated/40 text-mist hover:border-hairline-strong",
                                )}
                              >
                                {l.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {step === "goal" && (
              <>
                <StepHead
                  eyebrow="Next goal"
                  title="What are you building towards?"
                  subtitle="The objective and its date are what the whole training plan is generated backwards from."
                />

                {goalPeak ? (
                  <div className="mt-7 flex items-center gap-3 rounded-tile border border-azure/60 bg-azure/[0.07] p-3">
                    <MountainThumb peak={goalPeak} size={46} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-snow">{goalPeak.name}</p>
                      <p className="tnum text-[11px] text-mist-dim">
                        {fmtElevation(goalPeak.elevationM)} m ·{" "}
                        {assessPeak(goalPeak.elevationM, goalPeak.lat, goalPeak.lon).label}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGoalPeak(null)}
                      aria-label="Choose a different objective"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-mist transition-colors hover:text-snow"
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mt-7 space-y-2">
                      {SUGGESTIONS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setGoalPeak(p);
                            setNoGoal(false);
                          }}
                          className="flex w-full items-center gap-3 rounded-tile border border-hairline bg-elevated/40 p-2.5 text-left transition-colors hover:border-azure/50"
                        >
                          <MountainThumb peak={p} size={46} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] text-snow">{p.name}</span>
                            <span className="tnum block text-[11px] text-mist-dim">
                              {fmtElevation(p.elevationM)} m{p.country ? ` · ${p.country}` : ""}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>

                    <p className="section-label mt-8 text-mist-dim">Or find your own</p>
                    <div className="mt-2.5">
                      <PeakSearch
                        onPick={(p) => {
                          setGoalPeak(p);
                          setNoGoal(false);
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setNoGoal((v) => !v)}
                      aria-pressed={noGoal}
                      className={cn(
                        "relative mt-6 w-full rounded-tile border p-4 text-left transition-colors duration-200",
                        noGoal
                          ? "border-azure/60 bg-azure/[0.07]"
                          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                      )}
                    >
                      <span className="block text-[13px] text-snow">I don't have one yet</span>
                      <span className="mt-1 block pr-6 text-[11px] leading-relaxed text-mist-dim">
                        A perfectly good answer, and nothing is withheld for it. ICEFALL simply
                        won't invent a summit to point you at.
                      </span>
                      {noGoal && <Ticked />}
                    </button>
                  </>
                )}
              </>
            )}

            {step === "timeline" && goalPeak && (
              <>
                <StepHead
                  eyebrow="Timeline"
                  title={["When do you want", "to be standing on it?"]}
                  subtitle={`The plan for ${goalPeak.name} is built backwards from this date — how many weeks it runs, and where Base, Build, Peak and Taper fall.`}
                />
                <div className="mt-7 space-y-2">
                  {TIMELINES.map((t) => (
                    <ChoiceRow
                      key={t.id}
                      label={t.label}
                      detail={
                        t.assumed
                          ? "ICEFALL will assume twelve months so a plan can exist, and will say so"
                          : undefined
                      }
                      selected={timelineId === t.id}
                      onClick={() => setTimelineId(t.id)}
                    />
                  ))}
                </div>
              </>
            )}

            {step === "days" && (
              <>
                <StepHead
                  eyebrow="Training days"
                  title="Which days are yours?"
                  subtitle="The days you can normally train, saved to your profile."
                />
                <div className="mt-7 grid grid-cols-4 gap-2">
                  {WEEK.map((d) => {
                    const on = days.includes(d.day);
                    return (
                      <button
                        key={d.day}
                        type="button"
                        onClick={() => setDays((s) => toggle(s, d.day))}
                        aria-pressed={on}
                        aria-label={d.full}
                        className={cn(
                          "rounded-tile border py-3 text-[12px] transition-colors duration-200",
                          on
                            ? "border-azure/60 bg-azure/[0.07] text-snow"
                            : "border-hairline bg-elevated/40 text-mist hover:border-hairline-strong",
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <EmptyMeaning>
                  Choosing nothing means ICEFALL holds no training days for you. Be aware of what
                  this answer does either way: the generated week is currently a fixed six sessions
                  and one rest day, and ICEFALL does not yet move sessions onto the days you pick.
                  It is recorded on your profile, not applied to the plan.
                </EmptyMeaning>
              </>
            )}

            {step === "length" && (
              <>
                <StepHead
                  eyebrow="Session length"
                  title="How long is a normal session?"
                  subtitle="Roughly, on a day you are not doing something long in the mountains."
                />
                <div className="mt-7 space-y-2">
                  {SESSION_LENGTHS.map((m) => (
                    <ChoiceRow
                      key={m}
                      label={m === 120 ? "120 minutes or more" : `${m} minutes`}
                      selected={sessionMin === m}
                      onClick={() => setSessionMin(m)}
                    />
                  ))}
                </div>
                <EmptyMeaning>
                  Recorded on your profile. Sessions are still prescribed at the length the plan
                  sets for that kind of day — ICEFALL does not yet cut them to this number. When one
                  does not fit, the session screen will rebuild it around the time you actually
                  have.
                </EmptyMeaning>
              </>
            )}

            {step === "equipment" && (
              <>
                <StepHead
                  eyebrow="Equipment"
                  title="What can you train with?"
                  subtitle="This one changes your sessions directly: ICEFALL will not prescribe a movement that needs kit you don't have."
                />
                <div className="mt-7 grid grid-cols-2 gap-2.5">
                  {EQUIPMENT.map((e) => {
                    const on = equipment.includes(e.id);
                    return (
                      <Tile
                        key={e.id}
                        selected={on}
                        className="p-3.5"
                        onClick={() => setEquipment((s) => toggle(s, e.id))}
                      >
                        <span className="block pr-5 text-[13px] leading-snug text-snow">
                          {e.label}
                        </span>
                        {e.note && (
                          <span className="mt-0.5 block text-[11px] text-mist-dim">{e.note}</span>
                        )}
                      </Tile>
                    );
                  })}
                </div>
                <EmptyMeaning>
                  Choosing nothing is different from choosing "bodyweight only". Nothing means you
                  have not told ICEFALL, so sessions are built as normal with a note that they
                  assume the movements are available. "Bodyweight only" is a statement, and sessions
                  are then built without equipment at all.
                </EmptyMeaning>
              </>
            )}

            {step === "skills" && (
              <>
                <StepHead
                  eyebrow="Technical skills"
                  title="What have you been taught?"
                  subtitle="Only competences ICEFALL can check an objective against are listed. Nothing here is verified — it is your word, and every screen that uses it says so."
                />
                <div className="mt-7 space-y-6">
                  {SKILL_GROUPS.map((g) => (
                    <div key={g.title}>
                      <p className="section-label text-mist-dim">{g.title}</p>
                      <div className="mt-2.5 space-y-2">
                        {g.skills.map((s) => {
                          const on = skills.includes(s);
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setSkills((v) => toggle(v, s))}
                              aria-pressed={on}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-tile border px-3.5 py-3 text-left transition-colors duration-200",
                                on
                                  ? "border-azure/60 bg-azure/[0.07]"
                                  : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                              )}
                            >
                              <span
                                className={cn(
                                  "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
                                  on
                                    ? "border-azure bg-azure/15 text-azure"
                                    : "border-hairline text-transparent",
                                )}
                              >
                                <Check size={10} strokeWidth={3} />
                              </span>
                              <span className="text-[13px] text-snow">{s}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {skills.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSkills([])}
                    className="section-label mt-6 text-mist transition-colors hover:text-snow"
                  >
                    Clear all — none of these yet
                  </button>
                )}

                <EmptyMeaning>
                  None of these yet is a normal place to be, and it is the honest answer if you have
                  not been taught them. ICEFALL then withholds a technical readiness score rather
                  than guessing one. These are learned in person from a qualified instructor, never
                  from an app.
                </EmptyMeaning>
              </>
            )}

            {step === "altitude" && (
              <>
                <StepHead
                  eyebrow="Altitude"
                  title="How high have you been?"
                  subtitle="The highest you have actually stood, on any trip. This becomes the floor ICEFALL reasons from — it will never assume one."
                />
                <div className="mt-7 space-y-2">
                  {ALTITUDE_BANDS.map((b) => (
                    <ChoiceRow
                      key={b.id}
                      label={b.label}
                      selected={altitudeId === b.id}
                      onClick={() => setAltitudeId(b.id)}
                    />
                  ))}
                </div>
                <EmptyMeaning>
                  Having reached an altitude once is not the same as being acclimatised for it —
                  acclimatisation is lost within a few weeks back down low. ICEFALL treats this as
                  history, not as current state.
                </EmptyMeaning>
              </>
            )}

            {step === "name" && (
              <>
                <StepHead
                  eyebrow="Your name"
                  title="Last one."
                  // Not "you can change it later in Settings" — no screen edits
                  // the name today, and promising one would be a small lie.
                  subtitle="What ICEFALL should call you. It stays on this device; there is no account server behind it."
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") next();
                  }}
                  placeholder="Your full name"
                  autoComplete="name"
                  autoFocus
                  className="mt-7 h-14 w-full rounded-tile border border-hairline bg-elevated/40 px-4 text-[17px] font-light text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
                />
              </>
            )}

            {step === "body" && (
              <>
                <StepHead
                  eyebrow="You"
                  title="A few numbers about you."
                  subtitle="All optional. Weight is the one that changes anything today — the calorie estimate has no other input, and until now it assumed 72 kg for everybody."
                />
                <div className="mt-7 space-y-3">
                  <NumberField
                    label="Weight"
                    unit="kg"
                    value={weightKg}
                    onChange={setWeightKg}
                    placeholder="72"
                    note="Used for the calorie estimate on every session."
                  />
                  <NumberField
                    label="Height"
                    unit="cm"
                    value={heightCm}
                    onChange={setHeightCm}
                    placeholder="178"
                    note="Recorded only. Nothing in ICEFALL uses it yet."
                  />
                  <NumberField
                    label="Year of birth"
                    unit=""
                    value={birthYear}
                    onChange={setBirthYear}
                    placeholder="1994"
                    note="Recorded only. ICEFALL will not turn your age into a heart-rate zone — that formula is a population average, not a measurement of you."
                  />
                </div>
              </>
            )}

            {step === "intent" && (
              <>
                <StepHead
                  eyebrow="Training"
                  title="What are you training for?"
                  subtitle="This sets what a session defaults to. You can change it every time you record, and it never overrides what you actually do."
                />
                <div className="mt-7 space-y-2.5">
                  {SESSION_INTENTS.filter((i) => i.id !== "free").map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setIntent(i.id)}
                      className={cn(
                        "w-full rounded-tile border px-4 py-3.5 text-left transition-colors",
                        intent === i.id
                          ? "border-azure/55 bg-azure/[0.08]"
                          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                      )}
                    >
                      <span className="block text-[15px] text-snow">{i.label}</span>
                      <span className="mt-0.5 block text-[12px] text-mist-dim">{i.blurb}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === "payoff" && (
              <Payoff
                created={created}
                disciplines={disciplines}
                levels={levels}
                days={days}
                sessionMin={sessionMin ?? 60}
                equipment={equipment}
                skills={skills}
                altitudeId={altitudeId}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ---- Footer ------------------------------------------------------ */}
      <div
        className="shrink-0 border-t border-hairline bg-obsidian px-5 pt-4"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {step === "payoff" ? (
          <Button size="lg" className="w-full" onClick={() => navigate("/trial")}>
            Continue
            <ArrowRight size={16} strokeWidth={1.8} />
          </Button>
        ) : (
          <Button size="lg" className="w-full" disabled={!canAdvance} onClick={next}>
            {step === "intro" ? "Begin" : step === "name" ? "Build my plan" : "Continue"}
            <ArrowRight size={16} strokeWidth={1.8} />
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 01 — Intro                                                                  */
/* -------------------------------------------------------------------------- */

function IntroStep({ count }: { count: number }) {
  return (
    <>
      <StepHead
        eyebrow="Personalisation"
        title={["Let's build", "your mountain."]}
        subtitle={`${count} questions at most — a couple drop out if they don't apply to you. About a minute. Almost every one changes something: which movements your sessions prescribe, how long your plan runs, and what ICEFALL is willing to say about your readiness for a summit. Two are recorded for later, and say so when you reach them.`}
      />

      <div className="mt-9 space-y-px overflow-hidden rounded-card border border-hairline">
        {[
          ["Your objective", "Sets the target date the whole plan is built backwards from."],
          ["Your equipment", "Decides which exercises can appear in a session at all."],
          [
            "Your skills and altitude",
            "The two things ICEFALL cannot observe, and will not guess.",
          ],
        ].map(([t, d]) => (
          <div key={t} className="bg-graphite px-4 py-3.5">
            <p className="text-[13px] text-snow">{t}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">{d}</p>
          </div>
        ))}
      </div>

      <Disclaimer className="mt-7">
        Where an answer does not yet change anything, the summary at the end says so rather than
        implying otherwise. ICEFALL is a training tool, not medical advice, and it defers to a
        certified guide on anything glaciated, technical or high.
      </Disclaimer>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 12 — Payoff                                                                 */
/* -------------------------------------------------------------------------- */

function Line({ label, value, effect }: { label: string; value: string; effect: React.ReactNode }) {
  return (
    <div className="border-t border-hairline py-3.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="section-label text-mist-dim">{label}</span>
        <span className="tnum min-w-0 text-right text-[13px] text-snow">{value}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-mist">{effect}</p>
    </div>
  );
}

function Payoff({
  created,
  disciplines,
  levels,
  days,
  sessionMin,
  equipment,
  skills,
  altitudeId,
}: {
  created: CreatedGoal | null;
  disciplines: string[];
  levels: Record<string, Level>;
  days: number[];
  sessionMin: number;
  equipment: Equipment[];
  skills: string[];
  altitudeId: string | null;
}) {
  /**
   * The plan's real shape, read back out of the generator.
   *
   * These numbers are not written by hand and cannot drift: buildPlanForGoal is
   * the function the Coach uses, run here against the goal that was just
   * created, so the week count and the session count on this screen are the
   * ones the athlete will actually see.
   */
  const plan = useMemo(() => {
    if (!created) return null;
    const curated = created.peak.curatedId ? sync.mountainById(created.peak.curatedId) : undefined;
    const preview: Goal = {
      id: "onboarding-preview",
      name: created.peak.name,
      elevationM: created.peak.elevationM,
      mountainId: created.peak.curatedId,
      targetDate: created.targetDate,
      trainingStartedAt: created.trainingStartedAt,
      preparation: 0,
      status: "active",
    };
    const built = buildPlanForGoal(preview, curated);
    const week = built.weeks[0];
    return {
      totalWeeks: built.totalWeeks,
      sessionsPerWeek: week ? week.days.filter((d) => d.focus !== "rest").length : 0,
      restDays: week ? week.days.filter((d) => d.focus === "rest").length : 0,
    };
  }, [created]);

  const assessment = created
    ? assessPeak(created.peak.elevationM, created.peak.lat, created.peak.lon)
    : null;

  const dayNames = WEEK.filter((w) => days.includes(w.day)).map((w) => w.label);
  const equipmentLabels = EQUIPMENT.filter((e) => equipment.includes(e.id)).map((e) => e.label);
  const band = ALTITUDE_BANDS.find((b) => b.id === altitudeId);
  const disciplineCount = disciplines.length;
  const namedLevels = disciplines
    .map((id) => {
      const option = DISCIPLINES.find((d) => d.id === id);
      const level = levels[id];
      return option && level
        ? `${option.label} · ${LEVELS.find((l) => l.id === level)?.label}`
        : "";
    })
    .filter(Boolean);

  return (
    <>
      <StepHead
        eyebrow="Your setup"
        title={["Here's what", "we built for you."]}
        subtitle="A starting plan, assembled from what you told us. It changes as you record sessions — nothing below is a prediction about a summit."
      />

      <div className="mt-8 rounded-card border border-hairline bg-graphite p-4">
        <p className="section-label text-azure/85">What your answers changed</p>

        <div className="mt-4">
          {created && plan && assessment ? (
            <>
              <Line
                label="Objective"
                value={`${created.peak.name} · ${fmtElevation(created.peak.elevationM)} m`}
                effect={`Created as an active goal and classed as ${assessment.label.toLowerCase()} from its elevation. That class is what your readiness is measured against.`}
              />
              <Line
                label="Target date"
                value={fmtDate(created.targetDate)}
                effect={
                  created.dateAssumed
                    ? "You said you were not sure, so ICEFALL assumed twelve months in order to have something to build backwards from. Replace the objective from Goals when the date firms up."
                    : "Everything below is built backwards from this date."
                }
              />
              <Line
                label="Plan length"
                value={`${plan.totalWeeks} weeks`}
                effect="Base, Build, Peak and Taper, laid out proportionally across those weeks, with a lighter week every fourth."
              />
              <Line
                label="Each week"
                value={`${plan.sessionsPerWeek} sessions · ${plan.restDays} rest`}
                effect="The shape of the generated week. The rest day is part of the plan, not a gap in it."
              />
            </>
          ) : (
            <Line
              label="Objective"
              value="None yet"
              effect="Nothing is withheld for this. Without a date there is nothing to build a plan backwards from, so ICEFALL has not invented one — add an objective in Goals whenever you have one, and everything else you told us still applies to it."
            />
          )}

          <Line
            label="Session length"
            value={`${sessionMin} min`}
            effect="Saved to your profile. It does not yet shorten a prescribed session — the session screen is where you rebuild one around the time you have."
          />

          <Line
            label="Training days"
            value={dayNames.length > 0 ? dayNames.join(", ") : "Not stated"}
            effect={
              dayNames.length > 0
                ? "Saved to your profile. The generated week is not yet cut to these days. If the plan asks for more days than you have, move what you can and leave the rest — a missed session is not a debt."
                : "Nothing recorded, and nothing is lost by it — the generated week is the same either way."
            }
          />

          <Line
            label="Equipment"
            value={equipmentLabels.length > 0 ? equipmentLabels.join(", ") : "Not stated"}
            effect={
              equipmentLabels.length > 0
                ? "Your sessions will only prescribe movements this kit can do. Anything needing something else is substituted or left out."
                : "You told us nothing, so sessions are built as normal and carry a note that they assume the movements are available. That is the honest reading of silence — not that you own nothing."
            }
          />

          <Line
            label="Technical skills"
            value={skills.length > 0 ? `${skills.length} reported` : "None reported"}
            effect={
              skills.length > 0
                ? "Checked one by one against what your objective's class of ground demands. Self-declared, so the score is capped well short of full marks — and a guide will form their own view regardless."
                : "Technical readiness stays unscored rather than guessed. Nothing is marked against you for it; it is simply not something ICEFALL can see."
            }
          />

          <Line
            label="Highest altitude"
            value={band ? band.label : "Not stated"}
            effect={
              band && band.lowerM > 0
                ? `Used as a floor of ${fmtElevation(band.lowerM)} m for altitude readiness — never as a claim that you are acclimatised now.`
                : "No altitude floor is recorded, so altitude readiness stays unreported until a recorded session or a logged summit gives ICEFALL one."
            }
          />

          <Line
            label="Disciplines"
            value={disciplineCount > 0 ? `${disciplineCount} selected` : "None"}
            effect={
              namedLevels.length > 0
                ? `${namedLevels.join(" · ")}. Shown alongside your readiness as context in your own words, and deliberately not turned into a number.`
                : "Nothing recorded, and nothing downstream depends on it."
            }
          />
        </div>
      </div>

      <div className="mt-5 rounded-card border border-hairline bg-graphite p-4">
        <p className="section-label text-azure/85">Why the last two questions mattered</p>
        <p className="mt-3 text-[12px] leading-relaxed text-mist">
          Nothing in a training feed says whether you can move on crampons, travel roped on a
          glacier or get a partner out of a crevasse — and no amount of volume implies it. The same
          is true of altitude. So when ICEFALL is not told, it withholds those parts of a mountain
          readiness assessment rather than filling them in, and it says which part is missing. Your
          answers are what let it give you a whole assessment instead of a hole in one.
        </p>
      </div>

      <Disclaimer className="mt-6">
        This is a starting point, not a guarantee, and it adapts as you record real sessions.
        ICEFALL does not give medical advice and never asks you to train through pain.
        {assessment?.requiresGuide
          ? ` ${created?.peak.name} is glaciated or technical ground: engage a certified guide (IFMGA/UIAGM) or a reputable operator, and learn the skills in person.`
          : ""}
      </Disclaimer>
    </>
  );
}

/**
 * One optional measurement.
 *
 * Every field says what it is used for, including the ones that are used for
 * nothing yet — asking for a number and not saying why is how an onboarding
 * flow starts feeling like a form.
 */
function NumberField({
  label,
  unit,
  value,
  onChange,
  placeholder,
  note,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  note: string;
}) {
  return (
    <label className="block rounded-tile border border-hairline bg-elevated/40 px-4 py-3 transition-colors focus-within:border-azure/50">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] uppercase tracking-[0.1em] text-mist-dim">{label}</span>
        <span className="flex items-baseline gap-1.5">
          <input
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
            placeholder={placeholder}
            className="w-[74px] bg-transparent text-right text-[19px] font-light text-snow outline-none placeholder:text-mist-dim/60"
          />
          {unit && <span className="text-[12px] text-mist-dim">{unit}</span>}
        </span>
      </span>
      <span className="mt-1.5 block text-[11px] leading-relaxed text-mist-dim">{note}</span>
    </label>
  );
}
