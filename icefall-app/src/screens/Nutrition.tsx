import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { AzureNotice, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { QualifierBadge } from "@/components/coach/DataState";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { TextInput } from "@/screens/guides/bookingParts";
import {
  IMAGE_ANALYSIS_NOTE,
  NUTRITION_DISCLAIMER,
  coachViewOfMeal,
  estimateFromEntry,
  fuellingFor,
  type FuellingPlan,
} from "@/coach/nutrition";
import {
  dailyEnergyFor,
  narrowingWorth,
  stillToCover,
  type DailyEnergy,
  type DailyMovement,
  type RecordedSessionInput,
  type SessionCost,
  type Sex,
} from "@/coach/fuelDay";
import { FUEL_RECORD_KEY } from "@/coach/fuelRecord";
import { useCoachIntel } from "@/coach/hooks";
import { useRecordedActivities } from "@/tracking/feed";
import { useApp } from "@/state/AppState";
import { useSettings } from "@/settings/store";
import { readAvatar } from "@/lib/image";
import { isoDate } from "@/data/mock/clock";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Screen 09 — FUEL. What today costs, and what you have actually eaten.
 *
 * THREE THINGS THIS SCREEN GOT WRONG BEFORE, AND WHY THEY MATTERED
 *
 * 1. IT SHOWED FOUR MEALS NOBODY ATE. The fixture's breakfast, snack, lunch and
 *    second snack were rendered with their `loggedAt` times formatted as 07:20,
 *    10:30, 13:15 and 16:40 — today. A timestamp is what makes a row read as a
 *    record rather than an example, and beside them sat a 2,800 kcal figure and
 *    380 g of carbohydrate that no engine in this app computed for anybody.
 *    Every figure on this screen now comes from `coach/fuelDay.ts` applied to
 *    what the athlete actually told ICEFALL, or from `estimateFromEntry` run
 *    over what they actually typed. There is no fixture on this screen at all,
 *    in DEV or anywhere else.
 *
 * 2. IT WROTE ITS OWN DISCLAIMER. `coach/nutrition.ts` exports two constants
 *    written to be rendered verbatim, and both sat unused while this file
 *    carried a two-sentence substitute of its own. The substitute dropped both
 *    halves that do the work: no mention of medication, allergies, pregnancy or
 *    a difficult relationship with food, and no "ICEFALL sets no weight or
 *    body-composition targets". Both constants are rendered here as constants —
 *    interpolated nowhere, trimmed nowhere, paraphrased nowhere.
 *
 * 3. THE HYDRATION FIGURE WAS AN UNDATED RUNNING TOTAL under a label reading
 *    "Logged today". `addHydration` in AppState only ever adds; nothing resets
 *    at midnight, so from day two the sentence was false. Hydration here is
 *    keyed by LOCAL calendar date and the old undated total is deliberately not
 *    migrated into today — importing an undated number into a dated slot is the
 *    same lie in a new place.
 *
 * WHAT THIS SCREEN WILL NOT DO
 *
 *   NO MAXIMUM, ANYWHERE. `total` is a floor with a stated width. There is no
 *   budget to spend down, nothing turns amber, and `stillToCover` is typed so
 *   that "over" has no representation — eat 6,000 kcal on a 2,650–4,650 day and
 *   the screen says you are inside the range and changes in no other way.
 *
 *   NO MIDPOINT. Where the engine returns a band, both bounds are printed. A
 *   midpoint rendered as a point is how a range becomes a target.
 *
 *   FOUR WORDS FOR FOUR FACTS. The session row reads "None" (a prescribed rest
 *   day), "Not counted" (duration-only, so ACSM cannot cost it), "Withdrawn"
 *   (the briefing replaced it) or "—" (no plan day). A zero is never printed
 *   for any of them, and an em dash is never printed over a measured zero.
 *
 *   NOTHING TOUCHES THE NETWORK. Every figure is a pure function of local
 *   state, because this screen is read at 4 a.m. in a hut with no signal.
 *
 * TWO EXTRACTIONS ARE OWED, AND ARE NOT DONE HERE BECAUSE THIS CHANGE OWNS ONE
 * FILE. `FuelGroup` below is the twin of `FuelGroup` in screens/coach/CoachPlan
 * .tsx and both should move to components/coach/FuelGroups.tsx; `RangeBar`
 * belongs beside `FactorBar` in components/coach/CoachUI.tsx. Likewise the four
 * things `fuelLocal` persists want homes in settings/store.ts and AppState —
 * see the note on that store.
 */

/* -------------------------------------------------------------------------- */
/* Local persistence                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The four things this screen records that have no home yet.
 *
 * `sexForEnergy` and `dailyMovement` belong in `settings/store.ts`; the food log
 * and the dated hydration belong in `AppState`. They are here because this
 * change owns one file, and a Fuel tab whose answers evaporate the moment the
 * athlete navigates away would be worse than the duplication. Same storage
 * mechanism as `settings/store.ts` — one module-level value, one subscriber
 * list — so two mounted copies of this screen cannot drift apart.
 *
 * EVERY DECLINE IS STORED AS AN ANSWER. "Prefer not to say" and "never asked"
 * produce different copy on this screen, and a missing key cannot tell them
 * apart. Same rule as `OnboardingDeclined`.
 */
export interface FoodLogEntry {
  id: string;
  /** Local calendar date, never toISOString(). */
  date: string;
  /** ISO instant, for ordering within a day. */
  at: string;
  description: string;
  portions: number;
  photoDataUrl?: string;
}

interface FuelLocal {
  sexForEnergy?: Sex;
  sexForEnergyDeclined?: boolean;
  dailyMovement?: DailyMovement;
  dailyMovementDeclined?: boolean;
  heightCmDeclined?: boolean;
  birthYearDeclined?: boolean;
  /** ml, keyed by LOCAL calendar date. */
  hydrationByDate?: Record<string, number>;
  /** Newest first. */
  foodLog?: FoodLogEntry[];
}

/* THE KEY NOW HAS ONE OWNER, and it is not this file.
   `coach/fuelRecord.ts` exports it, and exports the only setter any other
   surface may use. It was duplicated into the signup flow while this file held
   the accessor privately — a copy that a rename here would have killed with no
   error and a green typecheck. Importing it means the next rename breaks the
   build instead of the feature. */
const FUEL_KEY = FUEL_RECORD_KEY;
/** Enough days of eating to be useful; not so many that localStorage strains. */
const MAX_FOOD_ENTRIES = 400;

function readFuel(): FuelLocal {
  try {
    const raw = localStorage.getItem(FUEL_KEY);
    return raw ? (JSON.parse(raw) as FuelLocal) : {};
  } catch {
    return {};
  }
}

const fuelListeners = new Set<(s: FuelLocal) => void>();
let fuelCurrent: FuelLocal = readFuel();

function writeFuel(next: FuelLocal) {
  fuelCurrent = next;
  try {
    localStorage.setItem(FUEL_KEY, JSON.stringify(next));
  } catch {
    /* private mode, or the store is full — this session still works */
  }
  fuelListeners.forEach((l) => l(next));
}

function useFuelLocal() {
  const [state, setState] = useState(fuelCurrent);

  useEffect(() => {
    fuelListeners.add(setState);
    setState(fuelCurrent);
    return () => {
      fuelListeners.delete(setState);
    };
  }, []);

  const patch = useCallback((p: Partial<FuelLocal>) => writeFuel({ ...fuelCurrent, ...p }), []);

  const addFood = useCallback((e: Omit<FoodLogEntry, "id">) => {
    writeFuel({
      ...fuelCurrent,
      foodLog: [
        { ...e, id: `food-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
        ...(fuelCurrent.foodLog ?? []),
      ].slice(0, MAX_FOOD_ENTRIES),
    });
  }, []);

  const removeFood = useCallback((id: string) => {
    writeFuel({ ...fuelCurrent, foodLog: (fuelCurrent.foodLog ?? []).filter((e) => e.id !== id) });
  }, []);

  const addWater = useCallback((date: string, ml: number) => {
    const by = { ...(fuelCurrent.hydrationByDate ?? {}) };
    by[date] = Math.max(0, (by[date] ?? 0) + ml);
    writeFuel({ ...fuelCurrent, hydrationByDate: by });
  }, []);

  return { fuel: state, patch, addFood, removeFood, addWater };
}

/* -------------------------------------------------------------------------- */
/* Copy that must be rendered exactly as written                               */
/* -------------------------------------------------------------------------- */

/** F1 — under the band, in every state, and never dismissible. */
const FLOOR_NOT_LIMIT =
  "A floor, not a limit. ICEFALL never asks you to eat less than this, and nothing here turns amber if you go past it.";

/** F2 — the refusal. The one place the word it refuses is allowed to appear. */
const REFUSAL_TITLE = "No target, and nothing to stay under";
const REFUSAL_BODY =
  "This is an estimate of what today costs, built from published equations and the session in your plan. It is not a calorie goal. Everything you do outside a recorded session is not measured by anything, which is most of why the range is wide. ICEFALL sets no weight or body-composition target and never will.";

/** F9 — in the range card, when there is no weight. */
const NO_WEIGHT_BODY =
  "Nothing here is estimated from an average body. ICEFALL defaulted to 72 kg for everyone once, and every figure it showed was computed for a stranger. Add your weight and the range appears.";

const MOVEMENT_QUESTION = "Outside training, how much of your day are you on your feet?";
const SEX_QUESTION = "Resting energy is a published equation with one term ICEFALL doesn't hold.";

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

/** Thousands separated. Read at 34px in the dark, on a phone, in gloves. */
const kcal = (n: number) => Math.round(n).toLocaleString("en-GB");
const bandText = (b: { low: number; high: number }) => `${kcal(b.low)} – ${kcal(b.high)}`;

/* -------------------------------------------------------------------------- */
/* RangeBar                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The day's band on a FIXED scale, with what has been logged as a tick.
 *
 * The scale never adapts to the band. A self-scaling bar draws every range at
 * the same width, which destroys the one thing this bar exists to show: that
 * answering two questions makes the band visibly narrower. 1,200–5,600 kcal
 * covers a rest day for a small athlete through a long mountain day for a large
 * one, and both ends are outside anything the engine will produce.
 *
 * The logged tick may sit PAST the right-hand edge of the band. Nothing happens
 * when it does: no colour change, no cap, no second state. Over-running the top
 * of the range is not an event this app recognises.
 */
const SCALE_LOW_KCAL = 1_200;
const SCALE_HIGH_KCAL = 5_600;

function RangeBar({
  low,
  high,
  logged,
  unknown,
}: {
  low?: number;
  high?: number;
  logged?: number | null;
  unknown?: boolean;
}) {
  const reduce = useReducedMotion();

  // No fill at all when the day cannot be computed. `FactorBar` establishes the
  // rule: a zero-width azure fill and a real zero must not look the same.
  if (unknown || low === undefined || high === undefined) {
    return (
      <div
        aria-hidden="true"
        className="h-2 w-full rounded-full border border-dashed border-hairline-strong"
      />
    );
  }

  const pos = (v: number) =>
    Math.max(0, Math.min(100, ((v - SCALE_LOW_KCAL) / (SCALE_HIGH_KCAL - SCALE_LOW_KCAL)) * 100));

  const left = pos(low);
  const width = Math.max(1.5, pos(high) - left);

  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={cn(
          "absolute inset-y-0 rounded-full bg-azure/70",
          !reduce && "transition-[left,width] duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)]",
        )}
        style={{ left: `${left}%`, width: `${width}%` }}
      />
      {typeof logged === "number" && (
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 w-[2px] rounded-full bg-azure",
            !reduce && "transition-[left] duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)]",
          )}
          style={{ left: `calc(${pos(logged)}% - 1px)` }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows and small controls — the house patterns, not new ones                  */
/* -------------------------------------------------------------------------- */

/** The inline accordion from GuideRequest: expands IN PLACE, never a sheet. */
function FieldRow({
  label,
  value,
  note,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-hairline first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[64px] w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="shrink-0 text-[13px] text-mist">{label}</span>
        {/* Nothing here truncates. A row that says "Not answered — the range…"
            has lost the half that explains what the absence costs, which is the
            only reason the row is worth reading. It wraps instead. */}
        <span className="min-w-0 flex-1 text-right">
          <span className="flex min-w-0 items-center justify-end gap-2.5 text-[14.5px] leading-snug text-snow">
            {value}
          </span>
          {note && <span className="mt-1 block text-[11.5px] leading-snug text-mist">{note}</span>}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={1.6}
          aria-hidden="true"
          className={cn("shrink-0 text-mist-dim transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

/** An answer ICEFALL does not have. Dimmed, and always a phrase. */
function Unset({ children }: { children: React.ReactNode }) {
  return <span className="text-right text-mist-dim">{children}</span>;
}

function StepButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline-strong text-mist transition-colors hover:border-azure/50 hover:text-snow disabled:pointer-events-none disabled:opacity-30"
    >
      {icon}
    </button>
  );
}

/**
 * A number the athlete gives, with NO starting value.
 *
 * A stepper alone cannot ask this question: it has to start somewhere, and
 * whatever it started at would be a figure ICEFALL invented and the athlete
 * would be free to accept without noticing. So the first answer is typed, and
 * the steppers only appear once there is a real value to step from.
 */
function NumberField({
  value,
  unit,
  step = 1,
  min,
  max,
  placeholder,
  onChange,
}: {
  value: number | null;
  unit: string;
  step?: number;
  min: number;
  max: number;
  placeholder: string;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState("");

  if (value === null) {
    const n = Number(draft.replace(",", "."));
    const ok = Number.isFinite(n) && n >= min && n <= max;
    return (
      <div className="flex items-center gap-2.5">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-11 flex-1"
        />
        <Button
          size="md"
          variant="secondary"
          disabled={!ok}
          onClick={() => {
            if (ok) onChange(Math.round(n));
          }}
        >
          Save
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <StepButton
        label={`Less ${unit}`}
        icon={<Minus size={16} strokeWidth={1.8} />}
        disabled={value - step < min}
        onClick={() => onChange(value - step)}
      />
      <p className="tnum flex-1 text-center text-[24px] font-light text-snow">
        {value.toLocaleString("en-GB")}
        <span className="ml-1 text-[12px] text-mist">{unit}</span>
      </p>
      <StepButton
        label={`More ${unit}`}
        icon={<Plus size={16} strokeWidth={1.8} />}
        disabled={value + step > max}
        onClick={() => onChange(value + step)}
      />
    </div>
  );
}

/**
 * One question, answered by tapping. The check-in's radiogroup, verbatim in
 * behaviour: nothing is pre-selected, so "not answered" is genuinely visible,
 * and every control is 44 px tall for a gloved hand.
 */
function ChoiceField<T extends string>({
  label,
  options,
  value,
  columns,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  columns: string;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", columns)}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-11 rounded-tile border px-2 text-[13px] transition-colors duration-200",
              selected
                ? "border-azure/50 bg-azure/10 text-azure"
                : "border-hairline-strong text-mist hover:border-azure/30 hover:text-snow",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One labelled group of fuelling lines. Omitted entirely when it has none.
 *
 * The twin of `FuelGroup` in screens/coach/CoachPlan.tsx. Two renderings of one
 * `FuellingPlan` is exactly the drift `components/ui/primitives.tsx` was
 * consolidated to stop, and lifting both into components/coach/FuelGroups.tsx
 * is owed — see the file header for why it is not done in this change.
 */
function FuelGroup({
  label,
  lines,
  first = false,
}: {
  label: string;
  lines: string[];
  first?: boolean;
}) {
  if (lines.length === 0) return null;

  return (
    <div className={cn("px-4 py-3.5", !first && "border-t border-hairline")}>
      <p className="section-label">{label}</p>
      <ul className="mt-2 space-y-2">
        {lines.map((line) => (
          <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed text-mist">
            <span
              aria-hidden="true"
              className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure/60"
            />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Session row wording                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The one word (or band) the session row shows, and whether it is an absence.
 *
 * `rowLabel` comes off the engine's own union rather than being re-derived here,
 * so the four words stay four words. "None" is a prescribed nothing, "Not
 * counted" is a session the equations cannot cost, "Withdrawn" is a session the
 * briefing replaced, and "—" is a day with no session at all. None of them is a
 * zero and none of them is interchangeable with another.
 */
function sessionRowValue(s: SessionCost): { text: string; absent: boolean } {
  if (s.kind === "band") return { text: bandText(s.band), absent: false };
  if (s.kind === "recorded") return { text: kcal(s.kcal), absent: false };
  return { text: s.rowLabel, absent: true };
}

/** The one-line status under the title. Derived from the session, never generic. */
function statusLine(e: DailyEnergy): string {
  if (e.resting.kind === "unavailable") return e.resting.sentence;
  switch (e.session.kind) {
    case "band":
      return "Costed from today's session in your plan and from what ICEFALL knows about the rest of your day.";
    case "recorded":
      return "Costed from the session you recorded today and from what ICEFALL knows about the rest of your day.";
    case "none-prescribed":
      return "Nothing is prescribed today, so this is resting energy and everyday movement only.";
    case "not-costable":
      return "Today's session carries no distance in the plan, so it is excluded from the range rather than estimated.";
    case "eased":
      return "ICEFALL held today's session down, so the session it replaced is not costed.";
    default:
      return "There is no session in your plan for today, so this is resting energy and everyday movement only.";
  }
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

const MOVEMENT_OPTIONS = [
  { value: "seated" as const, label: "Mostly seated" },
  { value: "on-feet" as const, label: "On your feet a fair bit" },
  { value: "physical" as const, label: "Physical job" },
] as const;

const SEX_OPTIONS = [
  { value: "female" as const, label: "Female" },
  { value: "male" as const, label: "Male" },
] as const;

export default function Nutrition() {
  const { bodyMassKgSet, setBodyMassKg } = useApp();
  const { settings, patch: patchSettings } = useSettings();
  const { fuel, patch: patchFuel, addFood, removeFood, addWater } = useFuelLocal();
  const { today, plan, briefing } = useCoachIntel();
  const recorded = useRecordedActivities();

  const [openContributor, setOpenContributor] = useState<string | null>(null);
  const [openAsk, setOpenAsk] = useState<string | null>(null);
  const [openWorking, setOpenWorking] = useState(false);
  const [entryText, setEntryText] = useState("");
  const [portions, setPortions] = useState(1);
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const todayKey = isoDate(new Date());
  const tomorrowKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return isoDate(d);
  }, []);

  /* ---- What was actually recorded today --------------------------------- */

  // `useRecordedActivities`, never `useActivityFeed` — the feed adapter drops
  // `caloriesForKg`, and without it the engine cannot tell a figure computed for
  // this athlete from one computed for the 72 kg stranger the recorder used to
  // default to. Simulated recordings are dropped: a demo activity must never
  // move a real figure.
  const recordedToday = useMemo<RecordedSessionInput[]>(
    () =>
      recorded
        .filter((a) => !a.simulated && isoDate(new Date(a.startedAt)) === todayKey)
        .map((a) => ({ kcal: a.calories, movingSec: a.movingSec, forKg: a.caloriesForKg ?? null })),
    [recorded, todayKey],
  );

  /* ---- The day ----------------------------------------------------------- */

  const energy = useMemo(
    () =>
      dailyEnergyFor({
        // `bodyMassKgSet`, never `bodyMassKg`. The latter is 72 for everyone who
        // has never answered, and is indistinguishable from a real answer.
        bodyMassKgSet,
        heightCm: settings.heightCm ?? null,
        birthYear: settings.birthYear ?? null,
        sex: fuel.sexForEnergy ?? null,
        movement: fuel.dailyMovement ?? null,
        day: today ?? null,
        easedFocus: briefing.training?.focus ?? null,
        packKg: settings.packWeightKg ?? null,
        recorded: recordedToday,
      }),
    [
      bodyMassKgSet,
      settings.heightCm,
      settings.birthYear,
      settings.packWeightKg,
      fuel.sexForEnergy,
      fuel.dailyMovement,
      today,
      briefing.training?.focus,
      recordedToday,
    ],
  );

  const worth = useMemo(() => narrowingWorth(energy), [energy]);
  const noWeight = energy.resting.kind === "unavailable";
  /*
   * A rest day is a fact about the PLAN, not about whether the engine could
   * cost the session. With no weight the session term reports `unavailable`
   * (the weight guard fires first), and keying the promoted emphasis off
   * `none-prescribed` alone buried it on exactly the day a new athlete most
   * needs it. A recording outranks the plan: if they went out, it was not a
   * rest day whatever the plan said.
   */
  const restDay = today?.focus === "rest" && energy.session.kind !== "recorded";

  /* ---- Fuelling ---------------------------------------------------------- */

  /*
   * Asked WITHOUT an altitude, and the reasoning is CoachPlan's: `fuellingFor`
   * changes its advice above 2,500 m, but the only altitude ICEFALL holds is the
   * objective's, and today's session is being done at home. Passing the
   * mountain's height would turn a Tuesday hill session into guidance for a
   * summit day nobody is on.
   *
   * On an eased day it is asked for `briefing.training.focus` and never for
   * `today.focus`. A Fuel tab prescribing 60–90 g of carbohydrate an hour on a
   * morning Today has already vetoed the long day is the contradiction the
   * shared coach context exists to prevent.
   */
  const fuellingPlan = useMemo<FuellingPlan>(() => {
    const mass = bodyMassKgSet ?? undefined;
    if (energy.session.kind === "eased" && briefing.training) {
      return fuellingFor({ focus: briefing.training.focus, bodyMassKg: mass });
    }
    return fuellingFor({ day: today ?? undefined, bodyMassKg: mass });
  }, [energy.session.kind, briefing.training, today, bodyMassKgSet]);

  /* ---- What has been eaten ----------------------------------------------- */

  const log = useMemo(() => fuel.foodLog ?? [], [fuel.foodLog]);

  // Re-estimated on EVERY read rather than stored with the entry. An estimate
  // that is written down once quietly becomes a record: the food reference can
  // improve, and a figure frozen at the moment of typing would never benefit
  // from it while looking exactly like one that had.
  const todaysEntries = useMemo(
    () =>
      log
        .filter((e) => e.date === todayKey)
        .map((e) => ({ entry: e, estimate: estimateFromEntry(e) })),
    [log, todayKey],
  );

  const withFigures = todaysEntries.filter((e) => e.estimate.kcal !== null);
  const unestimated = todaysEntries.length - withFigures.length;
  const loggedKcal =
    withFigures.length === 0 ? null : withFigures.reduce((a, e) => a + (e.estimate.kcal ?? 0), 0);
  const shortfall = stillToCover(energy.total, loggedKcal);

  const trainedToday = recordedToday.length > 0;
  const trainingTomorrow = useMemo(() => {
    const d = plan?.weeks.flatMap((w) => w.days).find((x) => x.date === tomorrowKey);
    return d !== undefined && d.focus !== "rest";
  }, [plan, tomorrowKey]);

  /** The athlete's own recent entries. Never a food list ICEFALL wrote. */
  const recentDescriptions = useMemo(() => {
    const seen: string[] = [];
    for (const e of log) {
      const d = e.description.trim();
      if (d && !seen.some((s) => s.toLowerCase() === d.toLowerCase())) seen.push(d);
      if (seen.length === 6) break;
    }
    return seen;
  }, [log]);

  const hydrationMl = fuel.hydrationByDate?.[todayKey] ?? 0;

  /* ---- The questions still open ------------------------------------------ */

  const askWeight = bodyMassKgSet === null;
  const askSex = fuel.sexForEnergy === undefined && fuel.sexForEnergyDeclined !== true;
  const askMovement = fuel.dailyMovement === undefined && fuel.dailyMovementDeclined !== true;
  const askHeight = settings.heightCm === undefined && fuel.heightCmDeclined !== true;
  const askBirthYear = settings.birthYear === undefined && fuel.birthYearDeclined !== true;
  const anythingOpen = askWeight || askSex || askMovement || askHeight || askBirthYear;

  const logEntry = () => {
    const description = entryText.trim();
    if (!description) return;
    addFood({
      date: todayKey,
      at: new Date().toISOString(),
      description,
      portions,
      photoDataUrl: photo,
    });
    setEntryText("");
    setPortions(1);
    setPhoto(undefined);
    setPhotoError(null);
  };

  const attachPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    try {
      // The app's own downscaler, at a size a data URL can live in local storage
      // at. The photograph is a record beside the entry and is never read — see
      // IMAGE_ANALYSIS_NOTE, rendered next to the button that opens the camera.
      setPhoto(await readAvatar(file, 220));
    } catch (e) {
      setPhotoError(
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message: string }).message)
          : "That image couldn't be read. Try a different one.",
      );
    }
  };

  /*
   * The range degrades WHOLE. `total` is null whenever any contributor is
   * unavailable, and half a range is not a smaller range — it is a wrong one,
   * and an athlete cannot tell the difference by looking at it.
   */
  const total = energy.total;

  return (
    <Screen padded={false}>
      {/* Every child of Stagger must be a Rise. A wrapper div between them
          leaves the cards at opacity 0 — invisible, with no error. */}
      <Stagger className="px-5">
        {/* ---- 1. Heading ------------------------------------------------- */}
        <Rise className="pt-6">
          <p className="section-label">
            Fuel ·{" "}
            {fmtDate(todayKey, { weekday: "long", day: "numeric", month: "long", year: undefined })}
          </p>
          <h1 className="mt-2.5 text-[22px] font-light leading-snug tracking-[-0.02em] text-snow">
            {total === null ? (
              "Today's range can't be worked out yet."
            ) : (
              <>
                Today costs somewhere between <span className="tnum">{kcal(total.low)}</span> and{" "}
                <span className="tnum">{kcal(total.high)}</span> kcal.
              </>
            )}
          </h1>
          <p className="mt-2.5 flex gap-2.5 text-[13px] leading-relaxed text-mist">
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-azure" />
            <span className="min-w-0">{statusLine(energy)}</span>
          </p>
        </Rise>

        {/* ---- Rest-day emphasis, promoted -------------------------------- */}
        {/* The single most important placement on this screen. On the one day
            the number drops, the app says out loud that the number was never an
            instruction — before the athlete reads the smaller range. */}
        {restDay && fuellingPlan.emphasis && (
          <Rise className="pt-5">
            <AzureNotice title="Today">
              <p>{fuellingPlan.emphasis}</p>
            </AzureNotice>
          </Rise>
        )}

        {/* ---- 2. The range ----------------------------------------------- */}
        <Rise className="pt-5">
          <Card inset={false}>
            <div className="p-4">
              {/* The badge sits on its OWN row above the figure rather than
                  beside it. Sharing the row wrapped "1,450 – 3,100" across two
                  lines on a 375 pt phone, which reads as two numbers rather
                  than as one range — the exact misreading a band must not risk.
                  `whitespace-nowrap` keeps the two bounds and their dash on one
                  line whatever the figures grow to. */}
              <div className="flex items-center justify-between gap-3">
                <p className="section-label">What today costs</p>
                {total !== null && <QualifierBadge kind="estimated" />}
              </div>
              <p
                className={cn(
                  "tnum mt-2.5 whitespace-nowrap text-[34px] font-extralight leading-none tracking-[-0.02em]",
                  total === null ? "text-mist-dim" : "text-snow",
                )}
              >
                {total === null ? "—" : bandText(total)}
                {total !== null && (
                  <span className="ml-1.5 text-[14px] font-normal text-mist">kcal</span>
                )}
              </p>

              <div className="mt-4">
                <RangeBar
                  low={total?.low}
                  high={total?.high}
                  logged={loggedKcal}
                  unknown={total === null}
                />
              </div>

              <p className="mt-3.5 text-[12px] leading-relaxed text-mist">{FLOOR_NOT_LIMIT}</p>

              {noWeight && (
                <p className="mt-3 border-l border-azure/30 pl-3 text-[12px] leading-relaxed text-mist-dim">
                  {NO_WEIGHT_BODY}
                </p>
              )}
            </div>

            {/* The three contributors, each expanding in place. */}
            <div className="border-t border-hairline">
              <FieldRow
                label="Resting"
                open={openContributor === "resting"}
                onToggle={() =>
                  setOpenContributor(openContributor === "resting" ? null : "resting")
                }
                value={
                  energy.resting.kind === "band" ? (
                    <span className="tnum">{bandText(energy.resting.band)}</span>
                  ) : (
                    <Unset>—</Unset>
                  )
                }
              >
                <p className="text-[12px] leading-relaxed text-mist">{energy.resting.sentence}</p>
              </FieldRow>

              <FieldRow
                label="Everyday movement"
                open={openContributor === "everyday"}
                onToggle={() =>
                  setOpenContributor(openContributor === "everyday" ? null : "everyday")
                }
                note={
                  energy.everyday.kind === "band" && !energy.everyday.answered
                    ? "Not answered — the range covers every answer."
                    : undefined
                }
                value={
                  energy.everyday.kind === "band" ? (
                    <span className="tnum">{bandText(energy.everyday.band)}</span>
                  ) : (
                    <Unset>—</Unset>
                  )
                }
              >
                <p className="text-[12px] leading-relaxed text-mist">{energy.everyday.sentence}</p>
              </FieldRow>

              <FieldRow
                label="Today's session"
                open={openContributor === "session"}
                onToggle={() =>
                  setOpenContributor(openContributor === "session" ? null : "session")
                }
                value={
                  sessionRowValue(energy.session).absent ? (
                    <Unset>{sessionRowValue(energy.session).text}</Unset>
                  ) : (
                    <span className="tnum">{sessionRowValue(energy.session).text}</span>
                  )
                }
              >
                <p className="text-[12px] leading-relaxed text-mist">{energy.session.sentence}</p>
              </FieldRow>
            </div>
          </Card>
        </Rise>

        {/* ---- The refusal ------------------------------------------------- */}
        <Rise className="pt-4">
          <AzureNotice title={REFUSAL_TITLE}>
            <p>{REFUSAL_BODY}</p>
          </AzureNotice>
        </Rise>

        {/* ---- 3. Ask once ------------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>{anythingOpen ? "Narrow the range" : "What ICEFALL is using"}</SectionLabel>
          <Card className="mt-3" inset={false}>
            {/* Weight first, always: nothing else computes without it. */}
            <FieldRow
              label="Weight"
              open={openAsk === "weight"}
              onToggle={() => setOpenAsk(openAsk === "weight" ? null : "weight")}
              value={
                bodyMassKgSet === null ? (
                  <Unset>Not set</Unset>
                ) : (
                  <span className="tnum">{bodyMassKgSet} kg</span>
                )
              }
            >
              <p className="mb-3 text-[12px] leading-relaxed text-mist">
                Every figure on this screen starts here. Nothing is estimated from an average body,
                so without it the range is not shown at all.
              </p>
              <NumberField
                value={bodyMassKgSet}
                unit="kg"
                min={30}
                max={200}
                placeholder="Weight in kg"
                onChange={(v) => setBodyMassKg(v)}
              />
            </FieldRow>

            <FieldRow
              label="Everyday movement"
              open={openAsk === "movement"}
              onToggle={() => setOpenAsk(openAsk === "movement" ? null : "movement")}
              value={
                fuel.dailyMovement ? (
                  <span>{MOVEMENT_OPTIONS.find((o) => o.value === fuel.dailyMovement)?.label}</span>
                ) : fuel.dailyMovementDeclined ? (
                  <Unset>Not answered — the range covers every answer.</Unset>
                ) : (
                  <Unset>Not answered</Unset>
                )
              }
            >
              <p className="mb-2.5 text-[13px] leading-relaxed text-snow">{MOVEMENT_QUESTION}</p>
              <ChoiceField
                label={MOVEMENT_QUESTION}
                columns="grid-cols-2"
                options={MOVEMENT_OPTIONS}
                value={fuel.dailyMovement ?? null}
                onChange={(v) => patchFuel({ dailyMovement: v, dailyMovementDeclined: false })}
              />
              <button
                type="button"
                onClick={() => patchFuel({ dailyMovement: undefined, dailyMovementDeclined: true })}
                className="mt-2 h-11 w-full rounded-tile border border-hairline-strong text-[13px] text-mist transition-colors hover:border-azure/30 hover:text-snow"
              >
                Prefer not to say
              </button>
              <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
                {worth.movementKcal !== null
                  ? `This is the biggest thing ICEFALL doesn't measure, and answering it narrows today's range by about ${kcal(worth.movementKcal)} kcal.`
                  : "This is the biggest thing ICEFALL doesn't measure."}
              </p>
            </FieldRow>

            {/* Never headed "Sex". The heading is about the equation, because
                that is the only thing the answer is used for. */}
            <FieldRow
              label="Resting energy"
              open={openAsk === "sex"}
              onToggle={() => setOpenAsk(openAsk === "sex" ? null : "sex")}
              value={
                fuel.sexForEnergy ? (
                  <span>{SEX_OPTIONS.find((o) => o.value === fuel.sexForEnergy)?.label}</span>
                ) : fuel.sexForEnergyDeclined ? (
                  <Unset>Not answered — the range covers both.</Unset>
                ) : (
                  <Unset>Not answered</Unset>
                )
              }
            >
              <p className="mb-2.5 text-[13px] leading-relaxed text-snow">{SEX_QUESTION}</p>
              <ChoiceField
                label={SEX_QUESTION}
                columns="grid-cols-2"
                options={SEX_OPTIONS}
                value={fuel.sexForEnergy ?? null}
                onChange={(v) => patchFuel({ sexForEnergy: v, sexForEnergyDeclined: false })}
              />
              <button
                type="button"
                onClick={() => patchFuel({ sexForEnergy: undefined, sexForEnergyDeclined: true })}
                className="mt-2 h-11 w-full rounded-tile border border-hairline-strong text-[13px] text-mist transition-colors hover:border-azure/30 hover:text-snow"
              >
                Prefer not to say
              </button>
              <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
                {worth.sexKcal !== null
                  ? `Skipping this widens today's estimate by about ${kcal(worth.sexKcal)} kcal and changes nothing else. It is used for this calculation only — never shown on your profile, and never used to decide what you see.`
                  : "It is used for this calculation only — never shown on your profile, and never used to decide what you see."}
              </p>
            </FieldRow>

            <FieldRow
              label="Height"
              open={openAsk === "height"}
              onToggle={() => setOpenAsk(openAsk === "height" ? null : "height")}
              value={
                settings.heightCm !== undefined ? (
                  <span className="tnum">{settings.heightCm} cm</span>
                ) : fuel.heightCmDeclined ? (
                  <Unset>Not answered</Unset>
                ) : (
                  <Unset>Not set</Unset>
                )
              }
            >
              <p className="mb-3 text-[12px] leading-relaxed text-mist">
                {worth.heightKcal !== null
                  ? `With your height and year of birth, resting energy uses Mifflin-St Jeor. Without them it falls back to a weight-only equation. Answering narrows today's range by about ${kcal(worth.heightKcal)} kcal.`
                  : "With your height and year of birth, resting energy uses Mifflin-St Jeor. Without them it falls back to a weight-only equation."}
              </p>
              <NumberField
                value={settings.heightCm ?? null}
                unit="cm"
                min={100}
                max={250}
                placeholder="Height in cm"
                onChange={(v) => patchSettings({ heightCm: v })}
              />
              {settings.heightCm === undefined && !fuel.heightCmDeclined && (
                <button
                  type="button"
                  onClick={() => patchFuel({ heightCmDeclined: true })}
                  className="mt-2 h-11 w-full rounded-tile border border-hairline-strong text-[13px] text-mist transition-colors hover:border-azure/30 hover:text-snow"
                >
                  Prefer not to say
                </button>
              )}
            </FieldRow>

            <FieldRow
              label="Year of birth"
              open={openAsk === "birthYear"}
              onToggle={() => setOpenAsk(openAsk === "birthYear" ? null : "birthYear")}
              value={
                settings.birthYear !== undefined ? (
                  <span className="tnum">{settings.birthYear}</span>
                ) : fuel.birthYearDeclined ? (
                  <Unset>Not answered</Unset>
                ) : (
                  <Unset>Not set</Unset>
                )
              }
            >
              <p className="mb-3 text-[12px] leading-relaxed text-mist">
                {worth.birthYearKcal !== null
                  ? `Age is a term in the resting-energy equation, and answering narrows today's range by about ${kcal(worth.birthYearKcal)} kcal. It is not used to derive a maximum heart rate — that remains a population average ICEFALL will not print as your number.`
                  : "Age is a term in the resting-energy equation. It is not used to derive a maximum heart rate — that remains a population average ICEFALL will not print as your number."}
              </p>
              <NumberField
                value={settings.birthYear ?? null}
                unit=""
                min={1900}
                max={new Date().getFullYear()}
                placeholder="Year of birth"
                onChange={(v) => patchSettings({ birthYear: v })}
              />
              {settings.birthYear === undefined && !fuel.birthYearDeclined && (
                <button
                  type="button"
                  onClick={() => patchFuel({ birthYearDeclined: true })}
                  className="mt-2 h-11 w-full rounded-tile border border-hairline-strong text-[13px] text-mist transition-colors hover:border-azure/30 hover:text-snow"
                >
                  Prefer not to say
                </button>
              )}
            </FieldRow>

            {/* Only where it changes an arithmetic that is actually running. */}
            {energy.session.kind === "band" && (
              <FieldRow
                label="Pack"
                open={openAsk === "pack"}
                onToggle={() => setOpenAsk(openAsk === "pack" ? null : "pack")}
                value={
                  settings.packWeightKg !== undefined ? (
                    <span className="tnum">{settings.packWeightKg} kg</span>
                  ) : (
                    <Unset>None set</Unset>
                  )
                }
              >
                <p className="mb-3 text-[12px] leading-relaxed text-mist">
                  Carried load moves the work of the session and nothing else — a pack has no
                  resting metabolism. With none set, today's floor is computed for your body alone.
                </p>
                <NumberField
                  value={settings.packWeightKg ?? null}
                  unit="kg"
                  min={0}
                  max={60}
                  placeholder="Pack weight in kg"
                  onChange={(v) => patchSettings({ packWeightKg: v })}
                />
              </FieldRow>
            )}
          </Card>
        </Rise>

        {/* ---- 4. Provenance ---------------------------------------------- */}
        <Rise className="pt-6">
          <Card inset={false}>
            <FieldRow
              label="How this was worked out"
              open={openWorking}
              onToggle={() => setOpenWorking(!openWorking)}
              value={<Unset>{openWorking ? "Hide" : "Show"}</Unset>}
            >
              <ul className="space-y-2.5">
                {energy.provenance.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[12px] leading-relaxed text-mist">
                    <span
                      aria-hidden="true"
                      className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure/60"
                    />
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
              <p className="section-label mt-4">Not included</p>
              <ul className="mt-2 space-y-2.5">
                {energy.excluded.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[12px] leading-relaxed text-mist-dim">
                    <span
                      aria-hidden="true"
                      className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/20"
                    />
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            </FieldRow>
          </Card>
        </Rise>

        {/* ---- 5. Logged so far -------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Logged so far</SectionLabel>
          <Card className="mt-3">
            <p
              className={cn(
                "tnum text-[24px] font-light leading-none",
                loggedKcal === null ? "text-mist-dim" : "text-snow",
              )}
            >
              {loggedKcal === null ? "—" : kcal(loggedKcal)}
              {loggedKcal !== null && <span className="ml-1 text-[12px] text-mist">kcal</span>}
            </p>
            <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
              {todaysEntries.length === 0
                ? "Nothing logged today. The range above stands on its own."
                : loggedKcal === null
                  ? "Nothing you logged today could be matched to the food reference, so there is no figure — not a zero."
                  : total === null
                    ? "There is no range today to compare this against."
                    : shortfall === "inside-range"
                      ? "You are inside today's range."
                      : shortfall !== null
                        ? `About ${kcal(shortfall.kcal)} kcal to go before the bottom of today's range.`
                        : "There is no range today to compare this against."}
            </p>
            {unestimated > 0 && loggedKcal !== null && (
              <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
                {unestimated === 1
                  ? "One entry could not be estimated, so this total is low by whatever it contained."
                  : `${unestimated} entries could not be estimated, so this total is low by whatever they contained.`}
              </p>
            )}
          </Card>
        </Rise>

        {/* ---- 6. Fuelling ------------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Fuelling today</SectionLabel>
          {/* Nothing rendered where `emphasis` is null. An emphasis manufactured
              for an empty day trains the athlete to ignore the ones that matter. */}
          {!restDay && fuellingPlan.emphasis && (
            <p className="mt-3 flex gap-2.5 text-[13px] leading-relaxed text-snow">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-azure" />
              <span className="min-w-0">{fuellingPlan.emphasis}</span>
            </p>
          )}
          <Card className="mt-3" inset={false}>
            <FuelGroup label="Before" lines={fuellingPlan.before} first />
            <FuelGroup label="During" lines={fuellingPlan.during} />
            <FuelGroup label="After" lines={fuellingPlan.after} />
            <FuelGroup label="Water" lines={fuellingPlan.hydration} />
            <p className="border-t border-hairline px-4 py-3.5 text-[11px] leading-relaxed text-mist-dim">
              {fuellingPlan.context}
            </p>
          </Card>
        </Rise>

        {/* ---- 7. Meals ---------------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Meals</SectionLabel>

          <Card className="mt-3">
            <TextInput
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              placeholder="What was on the plate? e.g. chicken breast, rice, olive oil"
              aria-label="What you ate"
              className="h-11"
            />

            {recentDescriptions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {recentDescriptions.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setEntryText(d)}
                    className="max-w-full truncate rounded-full border border-hairline-strong px-3 py-2 text-[12px] text-mist transition-colors hover:border-azure/40 hover:text-snow"
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3.5 flex items-center gap-4">
              <span className="flex-1 text-[12px] text-mist">Portions</span>
              <StepButton
                label="Fewer portions"
                icon={<Minus size={16} strokeWidth={1.8} />}
                disabled={portions <= 1}
                onClick={() => setPortions(portions - 1)}
              />
              <span className="tnum w-8 text-center text-[24px] font-light text-snow">
                {portions}
              </span>
              <StepButton
                label="More portions"
                icon={<Plus size={16} strokeWidth={1.8} />}
                disabled={portions >= 10}
                onClick={() => setPortions(portions + 1)}
              />
            </div>

            {photo && (
              <div className="mt-3.5 flex items-center gap-3">
                <img
                  src={photo}
                  alt="Attached to this entry"
                  className="h-12 w-12 rounded-tile object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhoto(undefined)}
                  className="text-[12px] text-mist transition-colors hover:text-snow"
                >
                  Remove photograph
                </button>
              </div>
            )}
            {photoError && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{photoError}</p>
            )}

            <div className="mt-3.5 flex gap-2.5">
              <Button className="flex-1" disabled={!entryText.trim()} onClick={logEntry}>
                <Plus size={15} strokeWidth={1.8} /> Log it
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Photograph food"
                onClick={() => photoInput.current?.click()}
              >
                <Camera size={16} strokeWidth={1.6} />
              </Button>
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void attachPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Beside the camera, where the expectation it defeats is formed. */}
            <Disclaimer className="mt-3">{IMAGE_ANALYSIS_NOTE}</Disclaimer>
          </Card>

          {todaysEntries.length > 0 && (
            <div className="mt-3 space-y-3">
              {todaysEntries.map(({ entry, estimate }) => (
                <Card key={entry.id}>
                  <div className="flex items-start gap-3">
                    {entry.photoDataUrl && (
                      <img
                        src={entry.photoDataUrl}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-tile object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-snow">{entry.description}</p>
                      {entry.portions !== 1 && (
                        <p className="tnum mt-1 text-[11px] text-mist-dim">
                          {entry.portions} portions
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "tnum text-[15px] font-light",
                          estimate.kcal === null ? "text-mist-dim" : "text-snow",
                        )}
                      >
                        {estimate.kcal === null ? "—" : kcal(estimate.kcal)}
                      </p>
                      {estimate.confidence !== "unavailable" && (
                        <span className="mt-1.5 inline-block">
                          <QualifierBadge
                            kind={estimate.confidence === "logged" ? "self-reported" : "estimated"}
                          />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-4">
                    <Macro label="Carbs" value={estimate.carbsG} />
                    <Macro label="Protein" value={estimate.proteinG} />
                    <Macro label="Fat" value={estimate.fatG} />
                  </div>

                  {estimate.matched.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {estimate.matched.map((m) => (
                        <span
                          key={m}
                          className="rounded-full border border-hairline px-2 py-1 text-[10.5px] text-mist-dim"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Verbatim. The note is the entry's own account of where its
                      figures came from, or of why there are none. */}
                  <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{estimate.note}</p>

                  <p className="mt-2.5 border-l border-azure/30 pl-3 text-[11.5px] leading-relaxed text-mist">
                    {coachViewOfMeal(estimate, { trainedToday, trainingTomorrow })}
                  </p>

                  <button
                    type="button"
                    onClick={() => removeFood(entry.id)}
                    className="mt-3 flex h-11 items-center gap-2 text-[12px] text-mist-dim transition-colors hover:text-snow"
                  >
                    <Trash2 size={13} strokeWidth={1.6} /> Remove this entry
                  </button>
                </Card>
              ))}
            </div>
          )}
        </Rise>

        {/* ---- 8. Hydration ------------------------------------------------ */}
        <Rise className="pt-6">
          <SectionLabel>Hydration</SectionLabel>
          <Card className="mt-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                {/* A real, measured zero: the athlete has logged nothing today.
                    Not an em dash — this is arithmetic that did happen. */}
                <p className="tnum text-[24px] font-light leading-none text-snow">
                  {(hydrationMl / 1000).toFixed(1)}
                  <span className="ml-1 text-[12px] text-mist">L</span>
                </p>
                <p className="section-label mt-2.5">Logged today</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => addWater(todayKey, 250)}>
                  +250
                </Button>
                <Button size="sm" variant="secondary" onClick={() => addWater(todayKey, 500)}>
                  +500
                </Button>
              </div>
            </div>
            {/* No figure to drink towards, so no bar and no "remaining". Sweat
                rates vary several-fold between people; the fuelling guidance
                above says what to do about that in words rather than a number. */}
          </Card>
        </Rise>

        {/* ---- 9. The disclaimer, verbatim --------------------------------- */}
        <Rise className="pt-8">
          <Disclaimer>{NUTRITION_DISCLAIMER}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/** One macronutrient from a single entry. Null is an em dash, never a zero. */
function Macro({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "tnum text-[13px] font-light",
          value === null ? "text-mist-dim" : "text-snow",
        )}
      >
        {value === null ? "—" : `${value} g`}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-mist-dim">{label}</p>
    </div>
  );
}
