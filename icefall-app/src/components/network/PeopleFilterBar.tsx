import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  MapPin,
  Mountain as MountainIcon,
  Search,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtElevation } from "@/lib/format";
import { MOUNTAINS } from "@/data/mock/mountains";
import { PEAK_ATTRIBUTION, rememberPeaks, searchPeaks, type Peak } from "@/services/peaks";
import { LOOKING_FOR_LABELS, type LookingFor } from "@/network/types";
import {
  DEFAULT_FLEX_MONTHS,
  DEFAULT_RADIUS_KM,
  FLEX_OPTIONS,
  RADIUS_LADDER_KM,
  dateSummary,
  fmtKm,
  fmtMonthLong,
  locationSummary,
  lookingForSummary,
  monthOptions,
  objectiveSummary,
  type DateFilter,
  type LocationFilter,
  type ObjectiveFilter,
  type ObjectivePick,
  type PeopleFilters,
} from "@/network/peopleFilters";

/**
 * The People filter bar: GOING TO, DATE, LOCATION, LOOKING FOR.
 *
 * WHAT THESE CONTROLS DO, PLAINLY
 *
 * They describe what ICEFALL WOULD look for. They do not run a search, because
 * there is nothing connected to search: no server, no directory, no other
 * athletes. Every panel says so where an athlete might otherwise assume
 * something happened, and the peak search in GOING TO is labelled as a search
 * for MOUNTAINS — it queries OpenStreetMap, never people.
 *
 * LOCATION IS THE ONE THAT MATTERS
 *
 * "Near me" is unavailable until the athlete has turned location on, and
 * selecting it is impossible before then: the option is disabled, and nothing
 * in this component reads, requests or infers a position under any branch. The
 * geolocation prompt lives behind the consent card on the screen itself and is
 * only ever raised by an explicit tap there.
 *
 * Country and city are free text held on this device. ICEFALL does no
 * geocoding, so they compare against the words other people wrote for their own
 * area rather than a resolved place — the panel says exactly that instead of
 * implying a lookup that does not happen.
 */

type FieldId = "objective" | "date" | "location" | "looking-for";

const FIELDS: { id: FieldId; label: string }[] = [
  { id: "objective", label: "Going to" },
  { id: "date", label: "Date" },
  { id: "location", label: "Location" },
  { id: "looking-for", label: "Looking for" },
];

/** The order the model declares them in — the vocabulary a profile can record. */
const LOOKING_FOR_OPTIONS: LookingFor[] = [
  "expedition-partners",
  "training-partners",
  "hiking-partners",
  "expedition-group",
  "friends",
  "networking",
];

/** The curated ICEFALL objectives, as filter picks. Real peaks, real elevations. */
const CURATED_PICKS: ObjectivePick[] = MOUNTAINS.map((m) => ({
  name: m.name,
  elevationM: m.elevationM,
  lat: m.coords.lat,
  lon: m.coords.lon,
}));

const LOCATION_OPTIONS: { kind: LocationFilter["kind"]; label: string }[] = [
  { kind: "near-me", label: "Near me" },
  { kind: "country", label: "Country" },
  { kind: "city", label: "City" },
  { kind: "anywhere", label: "Anywhere" },
];

/* -------------------------------------------------------------------------- */
/* Bar                                                                         */
/* -------------------------------------------------------------------------- */

export function PeopleFilterBar({
  filters,
  touched,
  locationOptIn,
  goalPeak,
  onObjective,
  onDate,
  onLocation,
  onLookingFor,
  onReset,
}: {
  filters: PeopleFilters;
  /** Whether anything has been changed away from the athlete's own goal. */
  touched: boolean;
  /** Gates "Near me". Never a reason to read a position — only to offer it. */
  locationOptIn: boolean;
  /** The athlete's active objective, offered as the first pick. */
  goalPeak: ObjectivePick | null;
  onObjective: (f: ObjectiveFilter) => void;
  onDate: (f: DateFilter) => void;
  onLocation: (f: LocationFilter) => void;
  onLookingFor: (l: LookingFor[]) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState<FieldId | null>(null);

  // A "near me" filter set while location was on can outlive it — the athlete
  // turns location off elsewhere, or clears their data. The radius is then
  // measured from nothing, so the bar says it needs location rather than
  // showing a distance that is not being applied to anything.
  const staleNearMe = filters.location.kind === "near-me" && !locationOptIn;

  const summary: Record<FieldId, string> = {
    objective: objectiveSummary(filters.objective),
    date: dateSummary(filters.date),
    location: staleNearMe ? "Near me · needs location" : locationSummary(filters.location),
    "looking-for": lookingForSummary(filters.lookingFor),
  };

  return (
    <div>
      <div className="no-scrollbar -mx-5 overflow-x-auto px-5">
        <div className="flex gap-2">
          {FIELDS.map((field) => {
            const isOpen = open === field.id;
            return (
              <button
                key={field.id}
                type="button"
                aria-expanded={isOpen}
                aria-controls={`people-filter-${field.id}`}
                onClick={() => setOpen(isOpen ? null : field.id)}
                className={cn(
                  "shrink-0 rounded-tile border px-3 py-2 text-left transition-colors",
                  isOpen
                    ? "border-azure/50 bg-azure/[0.06]"
                    : "border-hairline hover:border-hairline-strong",
                )}
              >
                <span className="section-label block text-[9px]">{field.label}</span>
                <span className="mt-1 flex items-center gap-1.5">
                  <span className="max-w-[15ch] truncate text-[12px] text-snow">
                    {summary[field.id]}
                  </span>
                  <ChevronDown
                    size={12}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className={cn("text-mist-dim transition-transform", isOpen && "rotate-180")}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {open !== null && (
        <div
          id={`people-filter-${open}`}
          className="mt-3 rounded-card border border-hairline bg-graphite p-4"
        >
          {open === "objective" && (
            <ObjectivePanel
              value={filters.objective}
              goalPeak={goalPeak}
              onChange={(f) => onObjective(f)}
            />
          )}
          {open === "date" && <DatePanel value={filters.date} onChange={onDate} />}
          {open === "location" && (
            <LocationPanel
              value={filters.location}
              locationOptIn={locationOptIn}
              onChange={onLocation}
            />
          )}
          {open === "looking-for" && (
            <LookingForPanel value={filters.lookingFor} onChange={onLookingFor} />
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">
            Filters describe what ICEFALL would look for. Setting one does not make a search happen
            — there is nothing connected to search, and no one can see what you set here.
          </p>
        </div>
      )}

      {touched && (
        <button
          type="button"
          onClick={onReset}
          className="mt-3 text-[11px] text-mist-dim transition-colors hover:text-snow"
        >
          Reset filters to your objective
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Going to                                                                    */
/* -------------------------------------------------------------------------- */

function ObjectivePanel({
  value,
  goalPeak,
  onChange,
}: {
  value: ObjectiveFilter;
  goalPeak: ObjectivePick | null;
  onChange: (f: ObjectiveFilter) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Peak[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const selectedName = value.kind === "peak" ? value.peak.name : null;

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
    const timer = setTimeout(() => {
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
      clearTimeout(timer);
      ctrl.abort();
      setSearching(false);
    };
  }, [query]);

  // The athlete's own objective first, then the curated peaks — with the goal
  // removed from the curated list so one mountain never appears twice.
  const picks = useMemo(() => {
    const curated = CURATED_PICKS.filter(
      (p) => !goalPeak || p.name.toLowerCase() !== goalPeak.name.toLowerCase(),
    );
    return goalPeak ? [goalPeak, ...curated] : curated;
  }, [goalPeak]);

  return (
    <div>
      <p className="section-label">Going to</p>

      <div className="mt-3 space-y-2">
        <OptionRow
          label="Any mountain"
          note="Everyone, whatever they are training for."
          selected={value.kind === "any"}
          onSelect={() => onChange({ kind: "any" })}
        />

        {picks.map((peak) => (
          <OptionRow
            key={`${peak.name}:${peak.lat ?? "?"}`}
            label={peak.name}
            note={
              goalPeak && peak.name === goalPeak.name
                ? typeof peak.elevationM === "number"
                  ? `Your objective · ${fmtElevation(peak.elevationM)} m`
                  : "Your objective"
                : typeof peak.elevationM === "number"
                  ? `${fmtElevation(peak.elevationM)} m`
                  : undefined
            }
            selected={selectedName !== null && selectedName === peak.name}
            onSelect={() => onChange({ kind: "peak", peak })}
          />
        ))}
      </div>

      <label className="relative mt-3.5 block">
        <span className="sr-only">Search for a mountain</span>
        <Search
          size={15}
          strokeWidth={1.6}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any peak on earth"
          spellCheck={false}
          className="h-11 w-full rounded-tile border border-hairline bg-elevated/40 pl-10 pr-10 text-[13px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
        />
        {searching && (
          <Loader2
            size={15}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-mist-dim"
            aria-hidden="true"
          />
        )}
        {!searching && query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear the mountain search"
            className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-mist-dim transition-colors hover:text-snow"
          >
            <X size={13} strokeWidth={2} />
          </button>
        )}
      </label>

      {results.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {results.map((p) => (
            <li key={p.id}>
              <OptionRow
                label={p.name}
                note={`${fmtElevation(p.elevationM)} m${p.country ? ` · ${p.country}` : ""}`}
                selected={selectedName === p.name}
                onSelect={() =>
                  onChange({
                    kind: "peak",
                    peak: { name: p.name, elevationM: p.elevationM, lat: p.lat, lon: p.lon },
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}

      {searched && !searching && results.length === 0 && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
          No peak found. The search runs against OpenStreetMap and needs a connection; peaks with no
          recorded elevation are left out, because elevation is what every assessment is derived
          from.
        </p>
      )}

      {/* A search box on a People screen has to say what it searches. This one
          finds mountains. There is no directory of athletes to search. */}
      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
        This searches mountains, not people. {PEAK_ATTRIBUTION}.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Date                                                                        */
/* -------------------------------------------------------------------------- */

function DatePanel({ value, onChange }: { value: DateFilter; onChange: (f: DateFilter) => void }) {
  // The chosen month is passed in so a goal further out than the run of months
  // on offer still appears — otherwise the picker could not express the plan
  // the app already knows about.
  const months = useMemo(
    () =>
      monthOptions(
        new Date(),
        value.kind === "month" ? { year: value.year, month: value.month } : null,
      ),
    [value],
  );
  const flex = value.kind === "month" ? value.flexMonths : DEFAULT_FLEX_MONTHS;

  // An objective a year out sits well off the right of the row. Opening the
  // panel to an apparently unselected picker would read as "no month set", so
  // the chosen one is brought into view once, on open.
  const selectedPill = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    selectedPill.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, []);

  return (
    <div>
      <p className="section-label">Date</p>

      <div className="no-scrollbar -mx-4 mt-3 overflow-x-auto px-4">
        <div className="flex gap-2">
          <Pill selected={value.kind === "any"} onSelect={() => onChange({ kind: "any" })}>
            Any month
          </Pill>
          {months.map((m) => {
            const selected =
              value.kind === "month" && value.year === m.year && value.month === m.month;
            return (
              <Pill
                key={`${m.year}-${m.month}`}
                ref={selected ? selectedPill : undefined}
                selected={selected}
                onSelect={() =>
                  onChange({ kind: "month", year: m.year, month: m.month, flexMonths: flex })
                }
              >
                {m.label}
              </Pill>
            );
          })}
        </div>
      </div>

      {value.kind === "month" && (
        <>
          <p className="section-label mt-4">Give or take</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {FLEX_OPTIONS.map((option) => (
              <Pill
                key={option.months}
                selected={flex === option.months}
                onSelect={() =>
                  onChange({
                    kind: "month",
                    year: value.year,
                    month: value.month,
                    flexMonths: option.months,
                  })
                }
              >
                {option.label}
              </Pill>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
            Set to {fmtMonthLong(value.year, value.month)}
            {flex > 0
              ? `, and ${flex === 1 ? "a month" : `${flex} months`} either side — weather, permits and leave move alpine plans by weeks.`
              : " exactly."}{" "}
            Someone who has not set a target date is not counted either way.
          </p>
        </>
      )}

      {value.kind === "any" && (
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
          Any month at all, including people who have not set a date.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Location                                                                    */
/* -------------------------------------------------------------------------- */

function LocationPanel({
  value,
  locationOptIn,
  onChange,
}: {
  value: LocationFilter;
  locationOptIn: boolean;
  onChange: (f: LocationFilter) => void;
}) {
  const place = value.kind === "country" || value.kind === "city" ? value.place : "";

  return (
    <div>
      <p className="section-label">Location</p>

      <div className="mt-3 space-y-2">
        {LOCATION_OPTIONS.map((option) => {
          // "Near me" needs an area of your own, and ICEFALL has not been given
          // one. It is disabled rather than hidden so the athlete can see what
          // turning location on would buy them — and selecting it is impossible
          // until they do, so nothing here can trigger a position request.
          const blocked = option.kind === "near-me" && !locationOptIn;

          return (
            <OptionRow
              key={option.kind}
              label={option.label}
              note={
                option.kind === "near-me"
                  ? blocked
                    ? "Needs location, which is off. Turn it on under Location above; nothing about where you are is read until you do."
                    : "Within the radius you set, using your area rounded to a 5 km grid."
                  : option.kind === "country"
                    ? "Match the words someone wrote for their own area."
                    : option.kind === "city"
                      ? "The same text match, narrower wording."
                      : "No distance limit at all."
              }
              selected={value.kind === option.kind}
              disabled={blocked}
              onSelect={() => {
                if (blocked) return;
                if (option.kind === "near-me") {
                  onChange({ kind: "near-me", km: DEFAULT_RADIUS_KM });
                } else if (option.kind === "anywhere") {
                  onChange({ kind: "anywhere" });
                } else {
                  onChange({ kind: option.kind, place });
                }
              }}
            />
          );
        })}
      </div>

      {value.kind === "near-me" && (
        <>
          <p className="section-label mt-4">Radius</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {RADIUS_LADDER_KM.map((km) => (
              <Pill
                key={km}
                selected={value.km === km}
                onSelect={() => onChange({ kind: "near-me", km })}
              >
                {fmtKm(km)}
              </Pill>
            ))}
          </div>
          <p className="mt-2.5 flex items-start gap-2 text-[11px] leading-relaxed text-mist-dim">
            <MapPin size={12} strokeWidth={1.6} className="mt-0.5 shrink-0" aria-hidden="true" />
            Distances are worked out from positions rounded to a 5 km grid and are only ever shown
            as a wide band. No coordinate is compared, stored or displayed.
          </p>
        </>
      )}

      {(value.kind === "country" || value.kind === "city") && (
        <>
          <label className="relative mt-4 block">
            <span className="sr-only">
              {value.kind === "country" ? "Country" : "City or region"}
            </span>
            <Search
              size={15}
              strokeWidth={1.6}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
            />
            <input
              value={place}
              onChange={(e) => onChange({ kind: value.kind, place: e.target.value })}
              placeholder={
                value.kind === "country"
                  ? "France, Nepal, Scotland…"
                  : "Chamonix, Zermatt, Keswick…"
              }
              className="h-11 w-full rounded-tile border border-hairline bg-elevated/40 pl-10 pr-4 text-[13px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
            />
          </label>
          {/* Both options do the same thing, and saying so is better than
              implying a lookup ICEFALL cannot perform. */}
          <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
            ICEFALL does not geocode, so country and city both match the words someone wrote for
            their own area — it cannot tell a city from the country around it. What you type stays
            on this device.
          </p>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Looking for                                                                 */
/* -------------------------------------------------------------------------- */

function LookingForPanel({
  value,
  onChange,
}: {
  value: LookingFor[];
  onChange: (l: LookingFor[]) => void;
}) {
  return (
    <div>
      <p className="section-label">Looking for</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Pill selected={value.length === 0} onSelect={() => onChange([])}>
          Anything
        </Pill>
        {LOOKING_FOR_OPTIONS.map((id) => (
          <Pill
            key={id}
            selected={value.includes(id)}
            onSelect={() =>
              onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
            }
          >
            {LOOKING_FOR_LABELS[id]}
          </Pill>
        ))}
      </div>

      {/* The list is the vocabulary a profile can actually record. Offering an
          intention nobody could ever set would be a control that can never
          match anybody, backend or no backend. */}
      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
        These are the intentions an ICEFALL profile can record. Pick any number — someone matches if
        they are after one of them. Somebody who has not said what they are looking for is not
        counted either way.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small controls                                                              */
/* -------------------------------------------------------------------------- */

function OptionRow({
  label,
  note,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  note?: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-tile border p-2.5 text-left transition-colors",
        selected ? "border-azure/50 bg-azure/[0.06]" : "border-hairline",
        disabled ? "opacity-50" : "hover:border-hairline-strong",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
          selected ? "border-azure text-azure" : "border-hairline-strong text-transparent",
        )}
        aria-hidden="true"
      >
        <Check size={10} strokeWidth={2.4} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13px]", selected ? "text-snow" : "text-mist")}>
          {label}
        </span>
        {note && (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-mist-dim">{note}</span>
        )}
      </span>
    </button>
  );
}

function Pill({
  selected,
  onSelect,
  children,
  ref,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  /** Only the month row uses this, to scroll the chosen month into view. */
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] transition-colors",
        selected
          ? "border-azure/50 bg-azure/[0.08] text-snow"
          : "border-hairline text-mist-dim hover:border-hairline-strong hover:text-mist",
      )}
    >
      {children}
    </button>
  );
}
