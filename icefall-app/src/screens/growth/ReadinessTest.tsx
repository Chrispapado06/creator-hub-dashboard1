import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";

import { Button, Disclaimer } from "@/components/ui/primitives";
import { useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtElevation } from "@/lib/format";
import { sync } from "@/services/repository";
import { assessPeak } from "@/services/peakAssessment";
import { PEAK_ATTRIBUTION, rememberPeaks, searchPeaks, type Peak } from "@/services/peaks";
import { useApp } from "@/state/AppState";
import {
  READINESS_QUESTIONS,
  READINESS_RESULT_ROUTE,
  READINESS_SELF_REPORT_NOTICE,
  READINESS_TEST_DISCLAIMER,
  READINESS_TEST_VERSION,
  coachProfilePatchFrom,
  countdownLabel,
  daysUntil,
  isComplete,
  loadReadinessTest,
  parseDateKey,
  saveReadinessTest,
  selfReportFrom,
  toDateKey,
  type ReadinessObjective,
  type ReadinessQuestionId,
  type ReadinessResultNavState,
  type ReadinessTestAnswers,
} from "@/growth/readinessTest";
// Type-only, so this erases at build and the result screen stays in its own
// lazy chunk. It exports the shape deliberately, so the funnel hands over what
// that screen actually parses rather than a payload of its own invention.
import type { ReadinessResultState } from "@/screens/growth/ReadinessResult";

/**
 * The free Readiness Test — the top of the funnel.
 *
 * THREE THINGS THIS SCREEN MUST NEVER DO, in the order they would be tempting:
 *
 *   1. ASK FOR MONEY. There is no card form here, no price, no plan, no
 *      "unlock", and no processor behind any of it. The result is free and
 *      reaching it costs nothing.
 *   2. ASK FOR AN ACCOUNT. Nothing here is gated behind a sign-up. The answers
 *      persist locally, the result renders without a session, and the account
 *      ask comes afterwards, once ICEFALL has given something first.
 *   3. MANUFACTURE URGENCY. The countdown on step two is a subtraction between
 *      two dates. It is stated once, calmly, at a size that respects it — never
 *      as a ticking clock, never in red, never next to a call to decide.
 *
 * And the one it must always do: say that the answers are self-reported. Every
 * figure collected here is a stranger's own estimate of themselves. ICEFALL has
 * measured nothing, and `mountainReadiness` caps a self-report below a recorded
 * score for precisely that reason. The copy matches the arithmetic.
 *
 * Elevations and coordinates are never typed in. Curated mountains come from
 * the ICEFALL table; everything else is resolved live through `searchPeaks`
 * against OpenStreetMap, and a peak that cannot be resolved says so rather than
 * appearing with a plausible number beside it — the class of objective, the
 * skills it demands and the whole readiness assessment are derived from that
 * elevation.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const DURATION = 0.38;

/** How far ahead the date picker will go. Five years is a plan, not a whim. */
const MAX_MONTHS_AHEAD = 60;

const STEPS = [
  { key: "objective", label: "Mountain" },
  { key: "date", label: "Date" },
  { key: "level", label: "Level" },
] as const;

/* -------------------------------------------------------------------------- */
/* Suggested objectives                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The seven objectives offered up front.
 *
 * Five are curated ICEFALL mountains and carry their own verified photograph
 * and grade. Ama Dablam and Kilimanjaro are not curated, so they are NOT typed
 * in here — they are looked up through `searchPeaks` at runtime so their
 * elevation and position come from OpenStreetMap like any other discovered
 * peak. If the lookup fails, the tile says so; it does not fall back to a
 * remembered number.
 */
interface LiveSpec {
  key: string;
  /** The name ICEFALL offers, and the string it searches for. */
  label: string;
  /**
   * OSM names that are the same summit. Kilimanjaro's high point is tagged
   * "Uhuru Peak", so a search for "Kilimanjaro" alone does not find the
   * mountain everyone means by it.
   */
  aliases: string[];
  /**
   * A sanity floor, NEVER a displayed figure.
   *
   * This exists because of a real result: Photon's first hit for "Kilimanjaro"
   * is a 9 m hill in Denmark that happens to carry the name, and the funnel
   * rendered it as "Kilimanjaro · 9 m · Denmark · Hill walk". Every elevation
   * and coordinate still comes from OpenStreetMap — this only rejects a
   * namesake, and when nothing clears it the tile says the lookup failed rather
   * than showing a number that is true of the wrong mountain.
   */
  minElevationM: number;
}

type Slot = { kind: "curated"; key: string; peak: Peak } | ({ kind: "live" } & LiveSpec);

function curatedSlot(id: string): Slot[] {
  const m = sync.mountainById(id);
  // A curated id that no longer resolves disappears rather than rendering an
  // empty tile — one fewer suggestion beats a blank one.
  if (!m) return [];
  return [
    {
      kind: "curated",
      key: `curated:${m.id}`,
      peak: {
        id: `curated:${m.id}`,
        name: m.name,
        elevationM: m.elevationM,
        lat: m.coords.lat,
        lon: m.coords.lon,
        curatedId: m.id,
        country: m.country,
      },
    },
  ];
}

const SLOTS: Slot[] = [
  ...curatedSlot("mont-blanc"),
  ...curatedSlot("matterhorn"),
  ...curatedSlot("aconcagua"),
  {
    kind: "live",
    key: "live:ama-dablam",
    label: "Ama Dablam",
    aliases: ["ama dablam"],
    // A second "Ama Dablam" exists in Czechia. Both are real records; only one
    // is the objective anybody means.
    minElevationM: 6000,
  },
  ...curatedSlot("everest"),
  ...curatedSlot("mount-olympus"),
  {
    kind: "live",
    key: "live:kilimanjaro",
    label: "Kilimanjaro",
    aliases: ["kilimanjaro", "uhuru peak", "kibo"],
    minElevationM: 5000,
  },
];

type LiveState =
  | { status: "pending" }
  | { status: "ready"; peak: Peak; osmName?: string }
  | { status: "unavailable" };

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Which search result is the mountain we asked for.
 *
 * Three gates, and a peak has to pass all of them: its name is one ICEFALL
 * accepts for this objective, its elevation clears the floor, and among what is
 * left it is the highest. Nothing looser is safe — attaching a famous name to
 * the wrong record would put a fabricated mountain at the top of the funnel,
 * with a class, a skill list and a readiness score all derived from it. When
 * nothing passes, this returns null and the tile says so.
 */
function bestMatch(spec: LiveSpec, results: Peak[]): Peak | null {
  const accepted = results.filter((p) => {
    if (p.elevationM < spec.minElevationM) return false;
    const name = normalise(p.name);
    return spec.aliases.some((a) => name === a || name.includes(a));
  });
  if (accepted.length === 0) return null;
  return accepted.reduce((best, p) => (p.elevationM > best.elevationM ? p : best));
}

/* -------------------------------------------------------------------------- */
/* Shared chrome                                                               */
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

function Ticked({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-full bg-azure text-obsidian",
        className,
      )}
    >
      <Check size={12} strokeWidth={3} />
    </span>
  );
}

/** The class of mountain, from the curated table or derived from elevation. */
function classLabelFor(peak: Peak): string {
  const curated = peak.curatedId ? sync.mountainById(peak.curatedId) : undefined;
  return curated?.difficultyLabel ?? assessPeak(peak.elevationM, peak.lat, peak.lon).shortLabel;
}

/* -------------------------------------------------------------------------- */
/* Objective card                                                              */
/* -------------------------------------------------------------------------- */

function ObjectiveCard({
  peak,
  selected,
  onSelect,
  osmName,
}: {
  peak: Peak;
  selected: boolean;
  onSelect: () => void;
  /**
   * The name OpenStreetMap holds for this summit, when it differs from the one
   * ICEFALL offers it under. Disclosed rather than quietly replaced: the record
   * behind the elevation is "Uhuru Peak", and someone choosing "Kilimanjaro"
   * should be able to see which record they are choosing.
   */
  osmName?: string;
}) {
  // The one place that decides what picture a mountain gets, and the only thing
  // that knows whether it is a photograph of THIS peak or terrain of the right
  // altitude band. The distinction is rendered, not swallowed.
  const image = useMountainImage(peak);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-stretch overflow-hidden rounded-tile border text-left transition-colors duration-200",
        selected
          ? "border-azure/60 bg-azure/[0.07]"
          : "border-hairline bg-elevated/40 hover:border-hairline-strong",
      )}
    >
      <span className="relative block h-[86px] w-[104px] shrink-0 overflow-hidden bg-slate">
        <img
          src={image.src}
          alt=""
          aria-hidden
          loading="lazy"
          title={image.credit}
          className={cn("h-full w-full object-cover", image.real ? "opacity-100" : "opacity-45")}
        />
        {!image.real && (
          // Said in words rather than hinted with a dot: at this size there is
          // room to be explicit, and a stand-in must never read as a summit shot.
          <span className="absolute inset-x-0 bottom-0 bg-obsidian/75 px-1.5 py-[3px] text-[8px] uppercase tracking-[0.1em] text-mist-dim">
            Representative
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-snow">{peak.name}</span>
          <span className="tnum mt-1 block text-[11px] text-mist-dim">
            {fmtElevation(peak.elevationM)} m{peak.country ? ` · ${peak.country}` : ""}
          </span>
          {osmName && (
            <span className="mt-0.5 block truncate text-[10px] text-mist-dim">
              Summit tagged {osmName} in OpenStreetMap
            </span>
          )}
          <span className="mt-1.5 block text-[10px] uppercase tracking-[0.12em] text-mist-dim">
            {classLabelFor(peak)}
          </span>
        </span>
        {selected && <Ticked />}
      </span>
    </button>
  );
}

/** A suggestion whose elevation is still being fetched, or could not be. */
function PendingCard({ name, failed }: { name: string; failed: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-tile border border-hairline bg-elevated/20 px-3.5 py-4">
      {!failed && <Loader2 size={14} className="shrink-0 animate-spin text-mist-dim" />}
      <div className="min-w-0">
        <p className="truncate text-[13px] text-mist">{name}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">
          {failed
            ? "Could not be looked up just now. Search for it below when you have a connection — ICEFALL will not show an elevation it has not verified."
            : "Looking up its elevation and position."}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Peak search — the custom objective                                          */
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
          rememberPeaks(r);
          setResults(r.slice(0, 8));
          setSearched(true);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 550);
    return () => {
      clearTimeout(t);
      ctrl.abort();
      setSearching(false);
    };
  }, [query]);

  return (
    <div className="mt-2.5">
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
          autoFocus
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
            className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-mist-dim transition-colors hover:text-snow"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </label>

      {results.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {results.map((p) => (
            <li key={p.id}>
              <ObjectiveCard peak={p} selected={false} onSelect={() => onPick(p)} />
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
/* Date picker                                                                 */
/* -------------------------------------------------------------------------- */

const WEEKDAYS = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
];

const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const FULL_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function DatePicker({
  value,
  onChange,
  today,
}: {
  value: string | null;
  onChange: (key: string) => void;
  today: Date;
}) {
  const [view, setView] = useState(() => {
    const base = (value ? parseDateKey(value) : null) ?? today;
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const monthIndex = view.year * 12 + view.month;
  const firstAllowed = today.getFullYear() * 12 + today.getMonth();
  const lastAllowed = firstAllowed + MAX_MONTHS_AHEAD;

  const shift = (months: number) => {
    const target = Math.min(lastAllowed, Math.max(firstAllowed, monthIndex + months));
    setView({ year: Math.floor(target / 12), month: target % 12 });
  };

  const jumpTo = (months: number) => {
    const target = Math.min(lastAllowed, firstAllowed + months);
    setView({ year: Math.floor(target / 12), month: target % 12 });
  };

  // Monday-first, so the two weekend columns sit together — this is a British
  // English app and a mountain weekend is one block, not two ends of a row.
  const lead = (new Date(view.year, view.month, 1).getDay() + 6) % 7;
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  return (
    <div className="rounded-card border border-hairline bg-graphite p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={monthIndex <= firstAllowed}
          aria-label="Previous month"
          className="grid h-8 w-8 place-items-center rounded-full text-mist transition-colors hover:text-snow disabled:pointer-events-none disabled:opacity-25"
        >
          <ChevronLeft size={17} strokeWidth={1.6} />
        </button>
        <p className="text-[13px] text-snow">
          {MONTH_YEAR.format(new Date(view.year, view.month, 1))}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={monthIndex >= lastAllowed}
          aria-label="Next month"
          className="grid h-8 w-8 place-items-center rounded-full text-mist transition-colors hover:text-snow disabled:pointer-events-none disabled:opacity-25"
        >
          <ChevronRight size={17} strokeWidth={1.6} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <span
            key={d.key}
            aria-hidden
            className="grid h-7 place-items-center text-[10px] uppercase tracking-[0.1em] text-mist-dim"
          >
            {d.label}
          </span>
        ))}

        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}

        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const date = new Date(view.year, view.month, day);
          const key = toDateKey(date);
          // Local midnights on both sides — never a UTC comparison, which would
          // grey out today for anyone east of Greenwich.
          const past = date.getTime() < todayMs;
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              disabled={past}
              onClick={() => onChange(key)}
              aria-label={FULL_DATE.format(date)}
              aria-pressed={selected}
              className={cn(
                "tnum grid h-9 place-items-center rounded-[8px] text-[13px] transition-colors duration-150",
                past && "pointer-events-none text-mist-dim/30",
                !past && !selected && "text-mist hover:bg-white/[0.05] hover:text-snow",
                selected && "bg-azure font-medium text-obsidian",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-hairline pt-3">
        <span className="section-label text-mist-dim">Jump to</span>
        {[
          { months: 6, label: "6 months" },
          { months: 12, label: "1 year" },
          { months: 24, label: "2 years" },
        ].map((j) => (
          <button
            key={j.months}
            type="button"
            onClick={() => jumpTo(j.months)}
            className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-mist transition-colors hover:border-hairline-strong hover:text-snow"
          >
            {j.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Level questions                                                             */
/* -------------------------------------------------------------------------- */

function QuestionBlock({
  index,
  question,
  chosen,
  onChoose,
}: {
  index: number;
  question: (typeof READINESS_QUESTIONS)[number];
  chosen: string | undefined;
  onChoose: (optionId: string) => void;
}) {
  // Short bands sit two to a row; a ladder of sentences gets a column of its
  // own rather than being truncated into ambiguity.
  const compact = question.options.every((o) => o.label.length <= 18);

  return (
    <section className="border-t border-hairline pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="section-label text-mist-dim">{question.eyebrow}</p>
        <span className="tnum text-[10px] text-mist-dim">
          {index + 1}/{READINESS_QUESTIONS.length}
        </span>
      </div>
      <p className="mt-2 text-[15px] leading-snug text-snow">{question.prompt}</p>
      {question.note && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{question.note}</p>
      )}

      <div className={cn("mt-3.5 gap-1.5", compact ? "grid grid-cols-2" : "flex flex-col")}>
        {question.options.map((o) => {
          const on = chosen === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChoose(o.id)}
              aria-pressed={on}
              className={cn(
                "flex items-center gap-2.5 rounded-tile border px-3.5 py-3 text-left transition-colors duration-200",
                on
                  ? "border-azure/60 bg-azure/[0.07]"
                  : "border-hairline bg-elevated/40 hover:border-hairline-strong",
              )}
            >
              <span
                className={cn("h-1.5 w-1.5 shrink-0 rounded-full", on ? "bg-azure" : "bg-white/20")}
              />
              <span className={cn("text-[13px] leading-snug", on ? "text-snow" : "text-mist")}>
                {o.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The flow                                                                    */
/* -------------------------------------------------------------------------- */

export default function ReadinessTest() {
  const navigate = useNavigate();
  const { coachProfile, updateCoachProfile } = useApp();

  // One `now` for the life of the screen, so the calendar, the countdown and
  // the disabled-day test cannot disagree if midnight passes mid-flow.
  const today = useMemo(() => new Date(), []);

  // A previous run is offered back rather than thrown away: someone retaking
  // the test has usually come to change one answer.
  const previous = useMemo(() => loadReadinessTest(), []);

  const [step, setStep] = useState(0);
  const [objective, setObjective] = useState<Peak | null>(() =>
    previous ? { ...previous.objective } : null,
  );
  const [dateKey, setDateKey] = useState<string | null>(() => {
    if (!previous) return null;
    // A stored date that has passed is not offered back. A countdown to
    // yesterday is not a countdown, and silently keeping it would put a
    // negative number on the result screen.
    const left = daysUntil(previous.targetDate, today);
    return left !== null && left >= 0 ? previous.targetDate : null;
  });
  const [choices, setChoices] = useState<Partial<Record<ReadinessQuestionId, string>>>(
    () => previous?.choices ?? {},
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [live, setLive] = useState<Record<string, LiveState>>({});

  /* ---- Resolving the non-curated suggestions ----------------------------- */

  useEffect(() => {
    const specs = SLOTS.flatMap((s) => (s.kind === "live" ? [s] : []));
    if (specs.length === 0) return;

    const ctrl = new AbortController();
    let alive = true;

    void (async () => {
      // Sequential on purpose: `searchPeaks` goes through Photon and Nominatim,
      // and Nominatim's usage policy is one request a second. Firing both at
      // once is how a shared community geocoder starts refusing this app.
      for (const spec of specs) {
        const results = await searchPeaks(spec.label, ctrl.signal).catch(() => [] as Peak[]);
        if (!alive) return;
        const hit = bestMatch(spec, results);

        if (!hit) {
          setLive((s) => ({ ...s, [spec.key]: { status: "unavailable" } }));
          continue;
        }

        // The record is kept whole — elevation, position and Wikipedia link are
        // OSM's. Only the display name is the one ICEFALL offered, because
        // "Uhuru Peak" is what OSM calls the summit of the mountain the athlete
        // just tapped, and the card names the tag it came from.
        const osmName = normalise(hit.name) === normalise(spec.label) ? undefined : hit.name;
        const peak: Peak = osmName ? { ...hit, name: spec.label } : hit;
        rememberPeaks([hit]);
        setLive((s) => ({ ...s, [spec.key]: { status: "ready", peak, osmName } }));
      }
    })();

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  /* ---- Derived ----------------------------------------------------------- */

  const daysToGo = dateKey ? daysUntil(dateKey, today) : null;
  const complete = isComplete(choices);
  const answered = READINESS_QUESTIONS.filter((q) => choices[q.id] !== undefined).length;

  const suggested = useMemo<Peak[]>(
    () =>
      SLOTS.flatMap((slot) => {
        if (slot.kind === "curated") return [slot.peak];
        const state = live[slot.key];
        return state?.status === "ready" ? [state.peak] : [];
      }),
    [live],
  );

  /** A searched objective is shown at the top so the choice stays visible. */
  const pinned = objective && !suggested.some((p) => p.id === objective.id) ? objective : null;

  const canAdvance = step === 0 ? objective !== null : step === 1 ? daysToGo !== null : complete;

  /* ---- Finishing --------------------------------------------------------- */

  // Guarded: updateCoachProfile is idempotent, but a double tap would also
  // navigate twice and push two entries onto the history stack.
  const submitted = useRef(false);

  const finish = useCallback(() => {
    if (submitted.current || !objective || !dateKey || !complete) return;
    submitted.current = true;

    const answers: ReadinessTestAnswers = {
      version: READINESS_TEST_VERSION,
      objective: {
        id: objective.id,
        name: objective.name,
        elevationM: objective.elevationM,
        lat: objective.lat,
        lon: objective.lon,
        ...(objective.curatedId ? { curatedId: objective.curatedId } : {}),
        ...(objective.wikipedia ? { wikipedia: objective.wikipedia } : {}),
        ...(objective.country ? { country: objective.country } : {}),
      } satisfies ReadinessObjective,
      targetDate: dateKey,
      choices,
      completedAt: new Date().toISOString(),
    };

    // Persisted BEFORE navigating. Router state survives a reload — the router
    // keeps it on the history entry — but NOT a cold arrival: a shared link, a
    // new tab, or coming back tomorrow all land with no state at all. Without
    // this record that athlete would be sent through ten questions again to see
    // a result they had already been given.
    saveReadinessTest(answers);

    // Only the two things the athlete actually answered. Technical skills,
    // equipment and training days are deliberately not in the patch — see
    // coachProfilePatchFrom.
    updateCoachProfile(coachProfilePatchFrom(answers, coachProfile));

    /**
     * The hand-off, in the result screen's own exported shape.
     *
     * `targetDate` goes across as the UTC instant of the LOCAL midnight the
     * athlete picked, because the result screen subtracts it from `Date.now()`
     * to get its countdown. Sending the bare "2027-02-20" would be read as UTC
     * midnight and could land the count a day out for anyone far enough east or
     * west; the date key stays the stored truth, and this is derived from it.
     *
     * `answers` rides along untouched. The result screen's parser ignores keys
     * it does not know, and carrying the raw bands means a later version can
     * show what was actually answered without another round of ten questions.
     */
    const state: ReadinessResultState & ReadinessResultNavState = {
      peak: {
        name: answers.objective.name,
        elevationM: answers.objective.elevationM,
        lat: answers.objective.lat,
        lon: answers.objective.lon,
      },
      targetDate: parseDateKey(dateKey)?.toISOString(),
      selfReported: selfReportFrom(answers, coachProfile),
      answers,
    };
    navigate(READINESS_RESULT_ROUTE, { state });
  }, [objective, dateKey, complete, choices, coachProfile, updateCoachProfile, navigate]);

  const back = () => {
    if (step === 0) navigate("/");
    else setStep((s) => s - 1);
  };

  const advance = () => {
    if (!canAdvance) return;
    if (step === 2) finish();
    else setStep((s) => s + 1);
  };

  /* ---- Render ------------------------------------------------------------ */

  return (
    <div className="flex h-full flex-col bg-obsidian">
      {/* ---- Progress ---------------------------------------------------- */}
      <div
        className="flex shrink-0 items-center gap-3 px-5 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)" }}
      >
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:text-snow"
        >
          <ArrowLeft size={18} strokeWidth={1.6} />
        </button>

        {/* Hairline segments rather than a bar. The label carries the meaning for
            anyone who cannot see which of the three is lit. */}
        <div
          role="group"
          aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step].label}`}
          className="flex flex-1 gap-1.5"
        >
          {STEPS.map((s, i) => (
            <span key={s.key} className="h-px flex-1 overflow-hidden bg-hairline">
              <motion.span
                className="block h-full bg-azure"
                initial={false}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.45, ease: EASE }}
              />
            </span>
          ))}
        </div>

        <span className="section-label tnum shrink-0 text-mist-dim">
          {step + 1} OF {STEPS.length}
        </span>
      </div>

      {/* ---- Body -------------------------------------------------------- */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5">
        {/* NOT mode="wait" — framer-motion drives exits with requestAnimationFrame,
            which the browser pauses when the page is hidden. Backgrounding the app
            mid-step would leave the next step unmounted for good. */}
        <AnimatePresence initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: DURATION, ease: EASE }}
            className="pb-8 pt-6"
          >
            {/* ---- 1. Objective ------------------------------------------ */}
            {step === 0 && (
              <>
                <StepHead
                  eyebrow="Free readiness test"
                  title={["What are you", "training for?"]}
                  subtitle="Three steps and ten questions. No account, no card, nothing to pay — the result is free and it is yours either way."
                />

                <div className="mt-7 space-y-2">
                  {pinned && (
                    <ObjectiveCard peak={pinned} selected onSelect={() => setObjective(null)} />
                  )}

                  {SLOTS.map((slot) => {
                    if (slot.kind === "curated") {
                      return (
                        <ObjectiveCard
                          key={slot.key}
                          peak={slot.peak}
                          selected={objective?.id === slot.peak.id}
                          onSelect={() => setObjective(slot.peak)}
                        />
                      );
                    }
                    const state: LiveState = live[slot.key] ?? { status: "pending" };
                    if (state.status === "ready") {
                      return (
                        <ObjectiveCard
                          key={slot.key}
                          peak={state.peak}
                          osmName={state.osmName}
                          selected={objective?.id === state.peak.id}
                          onSelect={() => setObjective(state.peak)}
                        />
                      );
                    }
                    return (
                      <PendingCard
                        key={slot.key}
                        name={slot.label}
                        failed={state.status === "unavailable"}
                      />
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setSearchOpen((v) => !v)}
                    aria-expanded={searchOpen}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-tile border px-3.5 py-4 text-left transition-colors duration-200",
                      searchOpen
                        ? "border-hairline-strong bg-elevated/40"
                        : "border-hairline bg-elevated/40 hover:border-hairline-strong",
                    )}
                  >
                    <Search size={16} strokeWidth={1.6} className="shrink-0 text-mist" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-snow">Custom objective</span>
                      <span className="mt-0.5 block text-[11px] text-mist-dim">
                        Search any named peak on earth
                      </span>
                    </span>
                  </button>

                  {searchOpen && (
                    <PeakSearch
                      onPick={(p) => {
                        setObjective(p);
                        setSearchOpen(false);
                      }}
                    />
                  )}
                </div>

                <p className="mt-5 border-l border-hairline pl-3 text-[11px] leading-relaxed text-mist-dim">
                  Elevations and positions come from ICEFALL's curated mountains or from
                  OpenStreetMap. Everything the test says about a mountain is derived from them, so
                  a peak ICEFALL cannot look up is left out rather than estimated.
                </p>
              </>
            )}

            {/* ---- 2. Date ------------------------------------------------ */}
            {step === 1 && objective && (
              <>
                <StepHead
                  eyebrow={objective.name}
                  title="When are you going?"
                  subtitle="Pick the day you intend to be on the mountain. If it moves, take the test again — nothing here is booked, shared or sent anywhere."
                />

                <div className="mt-7">
                  <DatePicker value={dateKey} onChange={setDateKey} today={today} />
                </div>

                {dateKey && daysToGo !== null && (
                  <motion.div
                    key={dateKey}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.42, ease: EASE }}
                    className="mt-5 rounded-card border border-hairline bg-graphite px-5 py-7 text-center"
                  >
                    {daysToGo > 0 ? (
                      <>
                        <p className="tnum display text-[56px] font-extralight leading-none text-snow">
                          {daysToGo.toLocaleString("en-GB")}
                        </p>
                        <p className="section-label mt-3 text-mist">
                          {daysToGo === 1 ? "DAY TO GO" : "DAYS TO GO"}
                        </p>
                      </>
                    ) : (
                      <p className="display text-[30px] leading-none text-snow">
                        {countdownLabel(daysToGo)}
                      </p>
                    )}
                    <p className="mt-4 text-[12px] text-mist-dim">
                      {FULL_DATE.format(parseDateKey(dateKey) ?? today)}
                    </p>
                  </motion.div>
                )}

                <p className="mt-5 border-l border-hairline pl-3 text-[11px] leading-relaxed text-mist-dim">
                  A count of days, nothing more. It is not a deadline and nothing expires — it is
                  simply how far out your mountain sits from today.
                </p>
              </>
            )}

            {/* ---- 3. Level ----------------------------------------------- */}
            {step === 2 && objective && (
              <>
                <StepHead
                  eyebrow="Your current level"
                  title="Where are you now?"
                  subtitle="Ten questions, each a band rather than a number. Pick the band you are honestly in — the lowest option on every question claims nothing, and it is a real answer."
                />

                <div className="mt-6 rounded-tile border border-azure/25 bg-azure/[0.05] p-4">
                  <p className="section-label text-azure/85">Self-reported</p>
                  <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
                    {READINESS_SELF_REPORT_NOTICE}
                  </p>
                </div>

                <div className="mt-7 space-y-6">
                  {READINESS_QUESTIONS.map((q, i) => (
                    <QuestionBlock
                      key={q.id}
                      index={i}
                      question={q}
                      chosen={choices[q.id]}
                      onChoose={(optionId) => setChoices((s) => ({ ...s, [q.id]: optionId }))}
                    />
                  ))}
                </div>

                <Disclaimer className="mt-8">{READINESS_TEST_DISCLAIMER}</Disclaimer>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ---- Action ------------------------------------------------------ */}
      <div
        className="shrink-0 border-t border-hairline bg-obsidian px-5 pt-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        {step === 2 && (
          <p className="tnum mb-3 text-center text-[11px] text-mist-dim">
            {answered} of {READINESS_QUESTIONS.length} answered
          </p>
        )}
        <Button size="lg" className="w-full" disabled={!canAdvance} onClick={advance}>
          {step === 0 ? "Choose your mountain" : step === 1 ? "Continue" : "See my readiness"}
        </Button>
        {step === 2 && (
          <p className="mt-3 text-center text-[11px] text-mist-dim">
            No account and no payment. Nothing is charged at any point in this test.
          </p>
        )}
      </div>
    </div>
  );
}
