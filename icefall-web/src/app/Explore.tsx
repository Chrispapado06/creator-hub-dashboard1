import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Listbox } from "@/components/Listbox";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  Info,
  Star,
  MapPin,
  Mountain as MountainIcon,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { companyById, companySlug } from "@/data/companies";
import { CompanyMark } from "@/components/CompanyMark";
import { RouteMap } from "./RouteMap";
import { TrailThumb } from "./TrailThumb";
import { peakFallback, peakImage } from "./peakPlate";
import { objectiveIsOn, PEAKS, type Peak } from "@/data/peaks";
import { peakCredit } from "@/data/peakPhotoCredits";
import {
  distanceKm,
  NETWORK_LABEL,
  relForCountry,
  searchPlaces,
  useCountryTrails,
  useTrailCountries,
  useTrailLine,
  useTrails,
  type Place,
  type Trail,
  type TrailCountry,
} from "./trails";
import { Badge, Button, VerifiedTick } from "@/components/ui";
import {
  DEMO_NOTICE,
  EXPEDITIONS,
  IS_DEMO,
  type Expedition,
} from "@/data/demo";
import { formatEur, type Cents } from "@/money/model";

/**
 * Explore — the phone app's five sections on a desktop.
 *
 * ── WHY THIS PAGE STOPPED EXPLAINING ITSELF ─────────────────────────────────
 *
 * The previous revision carried six paragraphs of apology: the filters do not
 * filter, the peaks do not open, the marketplace has no partners, an expedition
 * is not booked here. All of it true, and all of it read as a product ashamed
 * of itself. A page that spends its first screen on caveats never gets to show
 * anything.
 *
 * So the caveats became BEHAVIOUR instead of prose:
 *   · the filters were inert and said so — now they genuinely narrow the list
 *     that is on screen, which is a claim the page can actually keep;
 *   · empty states are two short labels ("No listings yet" / "Needs verified
 *     partners"), never a sentence explaining the absence;
 *   · DEMO_NOTICE appears once, at the foot, and is the page's whole budget of
 *     explanatory text.
 * Everything else that needs saying is said in a comment like this one, where
 * it costs a reader of the page nothing.
 *
 * ── WHAT IS REAL, WHAT IS DEMO ──────────────────────────────────────────────
 *
 * FIND and MOUNTAINS are facts and are NOT gated on IS_DEMO. Everest is 8,849 m
 * and the Tour du Mont Blanc is 170 km whether or not ICEFALL has a partner or
 * a user — a mountain is not a listing.
 *
 * EXPEDITIONS, GUIDES and SOCIAL are gated. Companies, guides and posts are
 * invented, and a production build shows the empty state instead. SOCIAL is the
 * strictest of the three: ICEFALL has no accounts, so there is no feed to
 * degrade to.
 *
 * No user statistic is invented anywhere on this page — the only numbers are
 * facts about mountains, counts of what is rendered, or demo content behind the
 * gate.
 */

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */



/* -------------------------------------------------------------------------- */
/* Data — mountains and trails are facts, not listings                        */
/* -------------------------------------------------------------------------- */



/**
 * The feed. Invented people, invented efforts, dev-gated with everything else.
 * Never rendered in production — ICEFALL has no accounts, so a "quiet feed"
 * would be a fiction rather than an empty one.
 */

/* -------------------------------------------------------------------------- */
/* Filter plumbing                                                            */
/* -------------------------------------------------------------------------- */

interface Band<T> {
  label: string;
  test: (item: T) => boolean;
}

/** Only offer a band that would actually return something. */
function bandOptions<T>(bands: Band<T>[], items: T[]): string[] {
  return bands.filter((b) => items.some(b.test)).map((b) => b.label);
}

function inBand<T>(bands: Band<T>[], label: string, item: T): boolean {
  if (!label) return true;
  const b = bands.find((x) => x.label === label);
  return b ? b.test(item) : true;
}

const uniq = (values: string[]): string[] =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));

const FIVE_K: Cents = 500_000;
const TWENTY_K: Cents = 2_000_000;

/*
 * By the thousand, highest first — the way climbers actually talk about
 * objectives ("an 8,000-er", "my first 6,000 m peak").
 */
const ELEVATION_BANDS: Band<Peak>[] = [
  { label: "8,000 m+", test: (p) => p.elevationM >= 8000 },
  { label: "7,000 m", test: (p) => p.elevationM >= 7000 && p.elevationM < 8000 },
  { label: "6,000 m", test: (p) => p.elevationM >= 6000 && p.elevationM < 7000 },
  { label: "5,000 m", test: (p) => p.elevationM >= 5000 && p.elevationM < 6000 },
  { label: "4,000 m", test: (p) => p.elevationM >= 4000 && p.elevationM < 5000 },
  { label: "3,000 m", test: (p) => p.elevationM >= 3000 && p.elevationM < 4000 },
  // Kosciuszko is 2,228 m. Without this band it is in the catalogue and
  // unreachable by the filter, which reads as a bug rather than as a choice.
  { label: "Under 3,000 m", test: (p) => p.elevationM < 3000 },
];

const DURATION_BANDS: Band<Expedition>[] = [
  { label: "Up to a week", test: (e) => e.durationDays <= 7 },
  { label: "One to four weeks", test: (e) => e.durationDays > 7 && e.durationDays <= 28 },
  { label: "Over four weeks", test: (e) => e.durationDays > 28 },
];

const PRICE_BANDS: Band<Expedition>[] = [
  { label: `Under ${formatEur(FIVE_K)}`, test: (e) => e.fromEur < FIVE_K },
  { label: `${formatEur(FIVE_K)} – ${formatEur(TWENTY_K)}`, test: (e) => e.fromEur >= FIVE_K && e.fromEur < TWENTY_K },
  { label: `${formatEur(TWENTY_K)} and above`, test: (e) => e.fromEur >= TWENTY_K },
];

const metres = (m: number): string => `${m.toLocaleString("en-GB")} m`;
const hit = (q: string, ...fields: string[]): boolean =>
  fields.join(" ").toLowerCase().includes(q.trim().toLowerCase());

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Sections, as pages                                                         */
/* -------------------------------------------------------------------------- */

/**
 * These four were tabs inside one Explore screen, and are now four routes.
 *
 * WHY THE CHANGE. A tab bar says "these are views of one thing". Routes, peaks,
 * the feed and the operator directory are four different things that happen to
 * share a filter row, and burying them behind a segmented control had two
 * costs: nothing was linkable except through a query string, and a section that
 * had been rebuilt looked untouched because people reached the old surface
 * first — which is exactly how the guides page came to exist twice.
 *
 * The shared shell below stays shared. What changed is that each section has an
 * address, a heading of its own, and an entry in the sidebar.
 */
export type SectionId = "find" | "mountains" | "expeditions";

const SECTIONS: Record<
  SectionId,
  { title: string; blurb?: string; placeholder?: string; path: string }
> = {
  find: {
    title: "Find a route",
    blurb: "Search the OpenStreetMap walking and climbing catalogue.",
    placeholder: "Route or region",
    path: "/app/find",
  },
  mountains: {
    title: "Mountains",
    /*
      COUNTED, NOT SPELLED OUT. This read "Fifty-one peaks" while the same
      screen rendered "52 peaks" from the catalogue directly below it — the
      blurb was written when there were fifty-one and nothing updated it when
      the fifty-second was added. A reader saw both numbers at once.

      Same defect as the commission rate that said 10% after it became 15%: a
      figure restated in prose is a second copy of a fact that lives somewhere
      else, and it drifts silently because nothing typechecks English. Derive it
      and the two can never disagree again.
    */
    blurb: `${PEAKS.length} peaks, by altitude, range and country.`,
    placeholder: "Peak or range",
    path: "/app/mountains",
  },
  expeditions: {
    title: "Expeditions",
    blurb: "The operators who run the world\u2019s high peaks, and what they charge.",
    placeholder: "Objective or company",
    path: "/app/expeditions",
  },
};

function Section({ section }: { section: SectionId }) {
  const meta = SECTIONS[section];

  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, string>>({});

  const set = (key: string, value: string) => setSel((s) => ({ ...s, [key]: value }));
  const pick = (key: string) => sel[key] ?? "";
  const dirty = q.trim().length > 0 || Object.values(sel).some(Boolean);
  const clear = () => {
    setQ("");
    setSel({});
  };

  const peaks = useMemo(
    () =>
      PEAKS.filter(
        (p) =>
          hit(q, p.name, p.range, p.country) &&
          (!sel.country || p.country === sel.country) &&
          inBand(ELEVATION_BANDS, sel.elevation ?? "", p),
      ),
    [q, sel],
  );

  const expeditions = useMemo(
    () =>
      EXPEDITIONS.filter(
        (e) =>
          hit(q, e.objective, e.company, e.country) &&
          (!sel.country || e.country === sel.country) &&
          (!sel.season || e.months === sel.season) &&
          inBand(DURATION_BANDS, sel.duration ?? "", e) &&
          inBand(PRICE_BANDS, sel.price ?? "", e),
      ),
    [q, sel],
  );

  const count =
    section === "find"
      ? "catalogue"
      : section === "mountains"
        ? `${peaks.length} peaks`
        : `${expeditions.length} listings`;

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">{meta.title}</h1>
          {meta.blurb !== undefined && (
            <p className="mt-1.5 text-[13px] text-mist">{meta.blurb}</p>
          )}
        </div>
        <p className="tnum text-[12px] text-mist-dim">{count}</p>
      </div>

      <div className="mt-5">
          <FilterRow onClear={dirty ? clear : undefined}>
            <SearchField value={q} onChange={setQ} placeholder={meta.placeholder ?? "Search"} />

            {section === "mountains" && (
              <>
                <Select any="Anywhere" value={pick("country")} onChange={(v) => set("country", v)} options={uniq(PEAKS.map((p) => p.country))} />
                <Select any="Any elevation" value={pick("elevation")} onChange={(v) => set("elevation", v)} options={bandOptions(ELEVATION_BANDS, PEAKS)} />
              </>
            )}

            {section === "expeditions" && (
              <>
                <Select any="Anywhere" value={pick("country")} onChange={(v) => set("country", v)} options={uniq(EXPEDITIONS.map((e) => e.country))} />
                <Select any="Any season" value={pick("season")} onChange={(v) => set("season", v)} options={uniq(EXPEDITIONS.map((e) => e.months))} />
                <Select any="Any duration" value={pick("duration")} onChange={(v) => set("duration", v)} options={bandOptions(DURATION_BANDS, EXPEDITIONS)} />
                <Select any="Any price" value={pick("price")} onChange={(v) => set("price", v)} options={bandOptions(PRICE_BANDS, EXPEDITIONS)} />
              </>
            )}
        </FilterRow>
      </div>

      <div className="mt-7">
        {section === "mountains" && <Mountains peaks={peaks} onClear={clear} />}
        {section === "expeditions" && (
          <Expeditions
            listings={expeditions}
            peaks={peaks}
            query={q}
            band={pick("elevation")}
            onBand={(v) => set("elevation", v)}
            onClear={clear}
          />
        )}
      </div>

      {/*
        The page's ONE explanatory block, and the last thing on it. Everything
        above says what it is in labels.
      */}
      {IS_DEMO && (
        <p className="mt-12 border-l-2 border-azure/30 pl-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE}
        </p>
      )}
    </div>
  );
}

export const MountainsPage = () => <Section section="mountains" />;
export const ExpeditionsPage = () => <Section section="expeditions" />;

/**
 * The old address, kept alive.
 *
 * `/app/explore?tab=mountains` links exist — in the sidebar's history, in the
 * guides page, in anything already sent to somebody. They resolve to the new
 * route rather than 404-ing or silently landing on the wrong section.
 */
export default function ExploreRedirect() {
  const [params] = useSearchParams();
  const raw = params.get("tab");
  if (raw === "guides") return <Navigate to="/app/guides" replace />;
  const target = raw !== null && raw in SECTIONS ? SECTIONS[raw as SectionId].path : "/app/find";
  return <Navigate to={target} replace />;
}

/* -------------------------------------------------------------------------- */
/* Filter row — one line, real controls                                       */
/* -------------------------------------------------------------------------- */

function FilterRow({ children, onClear }: { children: ReactNode; onClear?: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {children}
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear} className="rounded-pill">
          Clear
        </Button>
      )}
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  onKeyDown,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  return (
    <div className="relative">
      <Search
        size={14}
        strokeWidth={1.8}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "h-9 w-[248px] rounded-pill border border-hairline bg-slate pl-9 pr-4 text-[12.5px] text-snow outline-none placeholder:text-mist-dim focus:border-hairline-strong",
          className,
        )}
      />
    </div>
  );
}

function Select({
  any,
  value,
  onChange,
  options,
}: {
  any: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  if (options.length === 0) return null;
  // Native select retired per 11-CONTROLS-CONTRACT; same value/onChange, new shell.
  return (
    <Listbox
      value={value}
      onChange={onChange}
      options={options.map((o) => ({ value: o, label: o }))}
      label={any}
      placeholder={any}
      triggerClassName={cn(
        "h-9 rounded-pill border bg-slate px-3.5 text-[12.5px]",
        value ? "border-azure/45 text-azure" : "border-hairline text-mist",
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Empty states — two labels, never a paragraph                               */
/* -------------------------------------------------------------------------- */

function Empty({ title, note, onClear }: { title: string; note: string; onClear?: () => void }) {
  return (
    <div className="rounded-card border border-hairline bg-graphite px-6 py-10 text-center">
      <p className="text-[14px] text-snow">{title}</p>
      <p className="mt-1.5 text-[12px] text-mist-dim">{note}</p>
      {onClear && (
        <Button variant="secondary" size="sm" onClick={onClear} className="mt-4 rounded-pill">
          Clear filters
        </Button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* FIND                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * FIND — the route list beside a satellite map, the way a hiker actually
 * chooses one: read the numbers, then look at the ground.
 *
 * The map is STICKY and the list scrolls past it. Selecting a route in either
 * place moves the other, so the two halves are one instrument rather than two
 * panels that happen to share a screen.
 *
 * Card imagery is a satellite tile of the route's OWN coordinates. There is no
 * verified photograph of most of these trails, and a stock alpine picture
 * behind a card is a photograph of somewhere else.
 */
/**
 * FIND — the real OpenStreetMap catalogue, beside a satellite map.
 *
 * 77,141 trails across 22 country files, loaded on demand. The previous version
 * searched ten hand-written routes, so any country outside that handful — Cyprus
 * among them — reported "No matches" as though the search were broken rather
 * than the list being ten long.
 *
 * Card imagery is a satellite tile of the route's OWN coordinates. Most trails
 * have no verified photograph, and a stock alpine picture is a photograph of
 * somewhere else.
 */
/**
 * FIND — a rail of results beside a map that fills the rest of the screen.
 *
 * Laid out to the owner's reference (AllTrails, 2026-09-01): the search sits at
 * the TOP OF THE RAIL rather than over the page, the list scrolls inside the
 * rail, and the map owns everything else edge to edge. The previous version put
 * a two-column card grid where the map should be and pushed the map into a
 * 520px column, which is backwards for a screen whose subject is WHERE things
 * are.
 *
 * ── THE FILTERS ARE NOT THE REFERENCE'S FILTERS, DELIBERATELY ───────────────
 *
 * The reference offers Difficulty, Length, Elevation, Activity and Features.
 * ICEFALL has NONE of those for an OpenStreetMap trail. The index carries a
 * name, a position, a country, a network tier, an optional ref and an optional
 * length — that is the whole record. A "Difficulty" control here would either
 * do nothing or invent a grade for 77,141 routes nobody has walked for us, and
 * an "Est. 2-2.5 hr" line — which the reference shows and which reads as the
 * most useful thing on its card — cannot be computed from a length without a
 * gradient profile and an assumed pace.
 *
 * So the row carries the three filters that are real: COUNTRY, NETWORK TIER
 * and LENGTH. Each offers only values present in the current result set, so a
 * filter can never return nothing — the same rule the mountains filters follow.
 */
const TRAIL_LENGTH_BANDS: Band<Trail>[] = [
  { label: "Under 10 km", test: (t) => t.lengthKm != null && t.lengthKm < 10 },
  { label: "10 – 50 km", test: (t) => t.lengthKm != null && t.lengthKm >= 10 && t.lengthKm < 50 },
  { label: "50 – 200 km", test: (t) => t.lengthKm != null && t.lengthKm >= 50 && t.lengthKm < 200 },
  { label: "Over 200 km", test: (t) => t.lengthKm != null && t.lengthKm >= 200 },
];

/**
 * What the search box can be pointed at.
 *
 * A COUNTRY is exact — the manifest holds its file and its extent, so picking
 * one is a lookup. A TOWN is not: nothing in this data says where a town ends,
 * so it resolves to a point and a radius, and the radius is stated on screen
 * rather than implied.
 */
type Picked =
  | { kind: "country"; name: string; detail: string; country: TrailCountry }
  | { kind: "town"; name: string; detail: string; town: Place };

/** How near "near a town" is. Printed on every card, never left to be guessed. */
const NEAR_KM = 40;

export function FindPage() {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [network, setNetwork] = useState("");
  const [length, setLength] = useState("");
  const [order, setOrder] = useState("longest");
  const [selected, setSelected] = useState<string | undefined>(undefined);

  /*
    PLACE SEARCH. Typing "cy" offers Cyprus, and picking it loads that country's
    whole file and frames the map on its real extent.

    This is a different question from the name search beside it, which is why it
    is a different mechanism rather than a cleverer query. `searchTrails` matches
    route NAMES, and a Cypriot footpath is under no obligation to have "Cyprus"
    in its name — searching the text for a country finds only the routes that
    happen to mention it, which is a subset with no meaning. Picking the place
    reads the country file, so "Cyprus · 176 routes" is the whole of Cyprus.
  */
  const [place, setPlace] = useState<Picked | null>(null);
  const [active, setActive] = useState(0);
  const [towns, setTowns] = useState<Place[]>([]);
  const countries = useTrailCountries();

  /*
    Towns come from Photon over the network and countries from the manifest on
    disk, so they arrive at different speeds and are debounced differently: the
    country list is filtered on every keystroke, the town request waits 300ms
    for typing to stop. Photon allows roughly one request a second.
  */
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2 || place !== null) {
      setTowns([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      void searchPlaces(needle, ctrl.signal).then(setTowns);
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, place]);

  const suggestions = useMemo<Picked[]>(() => {
    const needle = q.trim().toLowerCase();
    if (needle === "" || place !== null) return [];
    const countryHits: Picked[] = countries
      .filter((c) => c.name.toLowerCase().includes(needle))
      .map((c) => ({ kind: "country", name: c.name, detail: `${c.count.toLocaleString("en-GB")} routes`, country: c }));
    const townHits: Picked[] = towns
      // A town whose name is already a country in the list would read as a duplicate.
      .filter((t) => !countryHits.some((c) => c.name.toLowerCase() === t.name.toLowerCase()))
      .map((t) => ({ kind: "town", name: t.name, detail: t.detail, town: t }));
    return [...countryHits, ...townHits].slice(0, 7);
  }, [countries, towns, q, place]);

  const choose = (pick: Picked) => {
    setPlace(pick);
    setQ(pick.name);
    setCountry("");
    setTowns([]);
    setActive(0);
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(suggestions.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(suggestions[active] ?? suggestions[0]);
    } else if (e.key === "Escape") {
      setPlace(null);
      setQ("");
    }
  };

  /*
    A TOWN IS ANSWERED BY DISTANCE, and the distance is printed.

    Picking a country is exact — that country's file IS the answer. A town has
    no such boundary in this data, so "routes near Limassol" has to mean
    something measurable: every route in that town's COUNTRY, ranked by
    great-circle distance from the town, and only those within NEAR_KM. The
    figure goes on the card, so "near" is a number the reader can check rather
    than a word they have to trust.
  */
  const townRel =
    place !== null && place.kind === "town" ? relForCountry(countries, place.town.country) : null;
  const countryRel =
    place === null ? null : place.kind === "country" ? place.country.rel : townRel;

  // Both hooks always run; only one of them is asked for anything.
  const byName = useTrails(place === null ? q : "");
  const byPlace = useCountryTrails(countryRel);

  const trails = useMemo(() => {
    if (place === null) return byName.trails;
    if (place.kind === "country") return byPlace.trails;
    const { lat, lon } = place.town;
    return byPlace.trails
      .map((t) => ({ t, km: distanceKm(lat, lon, t.lat, t.lon) }))
      .filter((x) => x.km <= NEAR_KM)
      .sort((a, b) => a.km - b.km)
      .map((x) => x.t);
  }, [place, byName.trails, byPlace.trails]);

  const loading = place === null ? byName.loading : byPlace.loading;

  const nearKm = useMemo(() => {
    if (place === null || place.kind !== "town") return null;
    const { lat, lon } = place.town;
    const m = new Map<number, number>();
    for (const t of trails) m.set(t.osmId, distanceKm(lat, lon, t.lat, t.lon));
    return m;
  }, [place, trails]);

  /* A town has no extent here, so the map is framed on a box around it. */
  const fit = useMemo<[number, number, number, number] | undefined>(() => {
    if (place === null) return undefined;
    if (place.kind === "country") return place.country.bbox;
    const { lat, lon } = place.town;
    const dLat = NEAR_KM / 111;
    const dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
  }, [place]);

  const list = useMemo(() => {
    const filtered = trails.filter(
      (t) =>
        (country === "" || t.country === country) &&
        (network === "" || (t.network !== undefined && NETWORK_LABEL[t.network] === network)) &&
        inBand(TRAIL_LENGTH_BANDS, length, t),
    );
    return order === "name"
      ? [...filtered].sort((a, b) => a.name.localeCompare(b.name))
      : filtered;
  }, [trails, country, network, length, order]);

  const pins = useMemo(
    () => list.slice(0, 40).map((t) => ({ id: String(t.osmId), name: t.name, lat: t.lat, lon: t.lon })),
    [list],
  );

  /*
    The selected route's own course, fetched from OpenStreetMap on demand.

    Keyed off the SELECTION, so it costs one request per route a reader actually
    opens — not one per row rendered. Hover used to set the selection, which
    would have made this fire on every mouse movement across the rail; selection
    is now a click or a keyboard focus.
  */
  const lineFor = selected === undefined ? null : Number(selected);
  const line = useTrailLine(lineFor);

  const dirty = q.trim() !== "" || place !== null || country !== "" || network !== "" || length !== "";
  const clear = () => {
    setQ("");
    setPlace(null);
    setCountry("");
    setNetwork("");
    setLength("");
  };

  return (
    <div className="grid h-[calc(100vh-136px)] overflow-hidden rounded-card border border-hairline lg:grid-cols-[404px_minmax(0,1fr)]">
      {/* ── the rail: search, count, and the list that scrolls inside it ── */}
      <aside className="flex min-h-0 flex-col border-hairline bg-graphite lg:border-r">
        <div className="border-b border-hairline p-5">
          <h1 className="text-[19px] font-light tracking-[-0.02em] text-snow">Find a route</h1>
          <div className="relative mt-3.5">
            <SearchField
              value={q}
              onChange={(v) => {
                setQ(v);
                setPlace(null);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
              placeholder="Route, region or country"
              className="w-full"
            />

            {/*
              Places matching what has been typed. Arrow keys move, Enter picks,
              Escape clears — a suggestion list that only takes a mouse is the
              same defect as a control with no focus ring, and this app spent a
              morning removing those.
            */}
            {suggestions.length > 0 && (
              <ul
                role="listbox"
                aria-label="Places"
                className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-tile border border-hairline bg-elevated py-1 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)]"
              >
                {suggestions.map((c, i) => (
                  <li key={`${c.kind}-${c.name}-${c.detail}`} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        choose(c);
                      }}
                      onMouseMove={() => setActive(i)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors",
                        i === active ? "bg-slate" : "bg-transparent",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <MapPin
                          size={12}
                          strokeWidth={1.9}
                          className={c.kind === "country" ? "shrink-0 text-azure" : "shrink-0 text-mist-dim"}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-snow">{c.name}</span>
                          {c.detail !== "" && (
                            <span className="block truncate text-[10.5px] text-mist-dim">{c.detail}</span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-mist-dim">
                        {c.kind === "country" ? "Country" : "Town"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {place !== null && (
            <button
              type="button"
              onClick={() => {
                setPlace(null);
                setQ("");
              }}
              className="mt-3 inline-flex items-center gap-2 rounded-pill border border-azure/45 bg-azure/10 px-3 py-1.5 text-[11.5px] text-azure"
            >
              <MapPin size={11} strokeWidth={2} />
              {place.kind === "town" ? `Within ${NEAR_KM} km of ${place.name}` : place.name}
              <span aria-hidden className="text-azure/70">×</span>
              <span className="sr-only">Clear this place</span>
            </button>
          )}
          <div className="mt-3.5 flex items-center justify-between gap-3">
            <p className="tnum text-[11.5px] text-mist-dim">
              {loading
                ? "Searching the catalogue…"
                : list.length === 0
                  ? "Nothing matches"
                  : `${list.length.toLocaleString("en-GB")} route${list.length === 1 ? "" : "s"}`}
            </p>
            <Listbox
              value={order}
              onChange={setOrder}
              label="Order"
              options={[
                { value: "longest", label: "Longest first" },
                { value: "name", label: "Name A–Z" },
              ]}
              triggerClassName="h-8 rounded-pill border border-hairline bg-slate px-3 text-[11.5px] text-mist"
            />
          </div>
        </div>

        {/*
          Keyed on the query so a new search REPLACES the list rather than
          reconciling into it. Without this, two cards from the previous result
          survived the swap — a Slovakian and an Austrian route sat above the
          Cyprus ones on a search for "cyprus". Cross-border routes share an OSM
          relation id across country files, so `key={osmId}` is not unique
          across two different result sets and React kept the stale children.
        */}
        <div key={q} className="min-h-0 flex-1 overflow-y-auto p-4">
          {list.length === 0 && !loading ? (
            <p className="px-1 pt-6 text-[12.5px] leading-relaxed text-mist-dim">
              No route in the catalogue matches that.
              {dirty && (
                <button type="button" onClick={clear} className="mt-2 block text-azure">
                  Clear the filters
                </button>
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-3.5">
              {list.map((t, i) => (
                <article
                  key={`${t.osmId}-${i}`}
                  onClick={() => setSelected(String(t.osmId))}
                  onFocus={() => setSelected(String(t.osmId))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(String(t.osmId));
                    }
                  }}
                  tabIndex={0}
                  className={cn(
                    "overflow-hidden rounded-tile border bg-obsidian/40 transition-colors",
                    String(t.osmId) === selected
                      ? "border-azure/55"
                      : "border-hairline hover:border-hairline-strong",
                  )}
                >
                  <TrailThumb trail={t}>
                    {t.ref !== undefined && /[a-z]/i.test(t.ref) && (
                      <span className="absolute right-2.5 top-2.5 rounded-pill border border-azure/45 bg-obsidian/75 px-2 py-0.5 text-[10px] text-azure">
                        {t.ref}
                      </span>
                    )}
                  </TrailThumb>
                  <div className="p-3.5">
                    <p className="truncate text-[13.5px] font-light tracking-[-0.01em] text-snow">
                      {t.name}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-mist-dim">
                      <MapPin size={11} strokeWidth={1.9} />
                      {t.country !== "" ? t.country : "Location not recorded"}
                    </p>
                    <p className="mt-2.5 flex items-center gap-2 text-[11.5px] text-mist">
                      <span className="tnum">
                        {t.lengthKm != null ? `${t.lengthKm.toFixed(0)} km` : "Length not recorded"}
                      </span>
                      {t.network !== undefined && (
                        <>
                          <span aria-hidden className="text-mist-dim">·</span>
                          <span className="text-azure">{NETWORK_LABEL[t.network]}</span>
                        </>
                      )}
                      {nearKm?.get(t.osmId) !== undefined && (
                        <>
                          <span aria-hidden className="text-mist-dim">·</span>
                          <span className="tnum text-mist-dim">
                            {(nearKm.get(t.osmId) ?? 0).toFixed(0)} km away
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── the map, edge to edge, with the filters floating over it ── */}
      <div className="relative min-h-0">
        <RouteMap
          pins={pins}
          selectedId={selected}
          onSelect={setSelected}
          fit={fit}
          line={line}
          className="h-full w-full"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-4">
          <div className="pointer-events-auto">
            <Listbox
              value={country}
              onChange={setCountry}
              label="Country"
              placeholder="Anywhere"
              options={uniq(trails.map((t) => t.country).filter((c) => c !== "")).map((c) => ({ value: c, label: c }))}
              triggerClassName={cn(
                "h-9 rounded-pill border px-3.5 text-[12.5px] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)]",
                country !== "" ? "border-azure/45 bg-azure/15 text-azure" : "border-hairline-strong bg-obsidian/85 text-snow",
              )}
            />
          </div>
          <div className="pointer-events-auto">
            <Listbox
              value={network}
              onChange={setNetwork}
              label="Network"
              placeholder="Any network"
              options={uniq(
                trails.map((t) => (t.network === undefined ? "" : NETWORK_LABEL[t.network])).filter((n) => n !== ""),
              ).map((n) => ({ value: n, label: n }))}
              triggerClassName={cn(
                "h-9 rounded-pill border px-3.5 text-[12.5px] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)]",
                network !== "" ? "border-azure/45 bg-azure/15 text-azure" : "border-hairline-strong bg-obsidian/85 text-snow",
              )}
            />
          </div>
          <div className="pointer-events-auto">
            <Listbox
              value={length}
              onChange={setLength}
              label="Length"
              placeholder="Any length"
              options={bandOptions(TRAIL_LENGTH_BANDS, trails).map((b) => ({ value: b, label: b }))}
              triggerClassName={cn(
                "h-9 rounded-pill border px-3.5 text-[12.5px] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)]",
                length !== "" ? "border-azure/45 bg-azure/15 text-azure" : "border-hairline-strong bg-obsidian/85 text-snow",
              )}
            />
          </div>
          {dirty && (
            <button
              type="button"
              onClick={clear}
              className="pointer-events-auto h-9 rounded-pill px-3.5 text-[12.5px] text-mist transition-colors hover:text-snow"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MOUNTAINS                                                                  */
/* -------------------------------------------------------------------------- */

function Mountains({ peaks, onClear }: { peaks: Peak[]; onClear: () => void }) {
  if (peaks.length === 0) return <Empty title="No matches" note="Try a wider filter" onClear={onClear} />;

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {peaks.map((p) => (
        /*
         * These were <article> elements with nothing to click — the third
         * dead-card in this app, after the trip cards and the Explore
         * expedition cards. A grid of mountains that does not open a mountain
         * is a picture of a grid.
         */
        <Link
          key={p.id}
          to={`/app/mountains/${p.id}`}
          className="group relative block h-[250px] overflow-hidden rounded-card border border-hairline transition-colors hover:border-azure/45"
        >
          <img
            src={peakImage(p.id)}
            onError={(ev) => {
              // Never a photograph of a different mountain — see peakPlate.ts.
              const el = ev.currentTarget;
              if (!el.dataset.fellBack) {
                el.dataset.fellBack = "1";
                el.src = peakFallback(p.id);
              }
            }}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 scrim-bottom" />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <div className="flex items-end justify-between gap-3">
              <h3 className="text-[19px] font-light tracking-[-0.02em] text-snow">{p.name}</h3>
              <p className="tnum text-[15px] font-light text-azure">{metres(p.elevationM)}</p>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-mist">
              <MountainIcon size={12} strokeWidth={1.8} className="text-mist-dim" />
              {p.range} · {p.country}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SOCIAL                                                                     */
/* -------------------------------------------------------------------------- */

function Expeditions({
  listings, peaks, query, band, onBand, onClear,
}: {
  listings: Expedition[];
  /** Already filtered by the search box and the band — see the parent. */
  peaks: Peak[];
  query: string;
  band: string;
  onBand: (v: string) => void;
  onClear: () => void;
}) {
  const [peakId, setPeakId] = useState<string>("mont-blanc");

  if (!IS_DEMO) return <Empty title="No listings yet" note="Needs verified partners" />;

  /*
   * The selection FOLLOWS the filter rather than fighting it.
   *
   * This tab used to render `PEAKS` — the whole catalogue, always — so typing
   * "annapurna" narrowed nothing and the rail sat there showing Mont Blanc as
   * though the search box were decorative. Reading the selection out of the
   * filtered list each render means a peak that has been filtered away cannot
   * stay selected, and no effect is needed to correct it afterwards.
   */
  const peak = peaks.find((p) => p.id === peakId) ?? peaks[0];

  /* A listing is "on" a peak when its objective names that peak — the objective
     is written "Everest — South Col", so the mountain is the part before the
     dash and no guessing is involved. */
  // Via the shared matcher: "Mount Everest" in the catalogue is "Everest" in an
  // objective, and comparing them directly reported no listings for fifteen
  // peaks that had them.
  const onPeak = peak ? listings.filter((e) => objectiveIsOn(e.objective, peak)) : [];

  return (
    <>
      <Banner />

      <section className="mt-9">
        <div className="flex items-baseline justify-between">
          <h2 className="section-label">Explore mountains</h2>
          <Link to="/app/mountains" className="text-[11.5px] text-azure hover:text-azure-bright">
            View all
          </Link>
        </div>

        {/* Altitude, by the thousand. */}
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => onBand("")}
            aria-pressed={band === ""}
            className={cn(
              "shrink-0 rounded-pill border px-3.5 py-1.5 text-[11.5px] transition-colors",
              band === "" ? "border-azure bg-azure/10 text-azure" : "border-hairline text-mist hover:border-hairline-strong",
            )}
          >
            Any altitude
          </button>
          {ELEVATION_BANDS.map((b) => {
            const n = PEAKS.filter((p) => b.test(p)).length;
            return (
              <button
                key={b.label}
                type="button"
                onClick={() => onBand(band === b.label ? "" : b.label)}
                aria-pressed={band === b.label}
                className={cn(
                  "shrink-0 rounded-pill border px-3.5 py-1.5 text-[11.5px] transition-colors",
                  band === b.label
                    ? "border-azure bg-azure/10 text-azure"
                    : "border-hairline text-mist hover:border-hairline-strong",
                )}
              >
                {b.label}
                <span className="tnum ml-1.5 text-mist-dim">{n}</span>
              </button>
            );
          })}
        </div>

        {peaks.length === 0 && (
          <div className="mt-4 rounded-card border border-hairline bg-graphite p-6">
            <p className="text-[13px] text-mist">
              No mountain in the catalogue matches{query.trim() ? ` “${query.trim()}”` : " this filter"}.
            </p>
            <button type="button" onClick={onClear} className="mt-2 text-[12px] text-azure hover:text-azure-bright">
              Clear the filters
            </button>
          </div>
        )}

        <PeakCredits peaks={peaks} />

        <div className="no-scrollbar mt-3 flex gap-4 overflow-x-auto pb-1">
          {peaks.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeakId(p.id)}
              aria-pressed={p.id === peakId}
              className={cn(
                "group relative h-[148px] w-[184px] shrink-0 overflow-hidden rounded-card border text-left transition-colors",
                p.id === peakId ? "border-azure" : "border-hairline hover:border-hairline-strong",
              )}
            >
              <img
                src={peakImage(p.id)}
                alt=""
                aria-hidden
                loading="lazy"
                onError={(ev) => {
                  // Never a photograph of a different mountain — fall back to
                  // the generated plate instead.
                  const el = ev.currentTarget;
                  if (!el.dataset.fellBack) {
                    el.dataset.fellBack = "1";
                    el.src = peakFallback(p.id);
                  }
                }}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 scrim-bottom" />
              {p.id === peakId && (
                <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-pill bg-obsidian/75 backdrop-blur">
                  <Star size={12} className="fill-azure text-azure" strokeWidth={1.8} />
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 p-3.5">
                <span className="block text-[14px] leading-tight text-snow">{p.name}</span>
                <span className="tnum mt-0.5 block text-[11.5px] text-mist">
                  {p.elevationM.toLocaleString("en-GB")} m
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {peak && (
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="section-label">Expeditions on {peak.name}</h2>
            <p className="mt-1 text-[12px] text-mist-dim">
              {onPeak.length === 0
                ? "No listing covers this peak"
                : `${new Set(onPeak.map((e) => e.company)).size} ${
                    new Set(onPeak.map((e) => e.company)).size === 1 ? "company" : "companies"
                  } offering expeditions`}
            </p>
          </div>
          {listings.length > onPeak.length && (
            <button type="button" onClick={onClear} className="text-[11.5px] text-azure hover:text-azure-bright">
              View all {listings.length} listings
            </button>
          )}
        </div>

        {onPeak.length === 0 ? (
          <div className="mt-4 rounded-card border border-hairline bg-graphite p-6">
            <p className="text-[13px] text-mist">
              No operator in this directory publishes an expedition on {peak.name}.
            </p>
            <p className="mt-1.5 text-[12px] text-mist-dim">
              Pick another mountain above, or browse every listing.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-3">
            {onPeak.map((e, i) => (
              <Listing key={e.id} e={e} peak={peak} best={i === 0} />
            ))}
          </div>
        )}

        {/*
          The ordering rationale, stated once.
          A marketplace that ranks operators has to say what the ranking means,
          because the default assumption about a "best match" badge is that
          somebody paid for it.
        */}
        <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-mist-dim">
          <Info size={13} strokeWidth={1.8} className="mt-px shrink-0" />
          Ordered on how specifically a listing covers {peak.name} — the ground it works and the
          altitude it works at. No position here is for sale, and ICEFALL takes no part in a booking.
        </p>
      </section>
      )}
    </>
  );
}

/**
 * Photograph credits for the peaks currently on screen.
 *
 * REQUIRED, not decorative. These images are other people's work under CC BY
 * and CC BY-SA, and both licences oblige us to name the author wherever the
 * work appears. A card at 184 px cannot carry a credit line without becoming
 * unreadable, so the credits sit in one disclosure directly beneath the rail
 * they belong to, each linking its Commons file page.
 */
function PeakCredits({ peaks }: { peaks: Peak[] }) {
  const credited = peaks
    .map((p) => ({ p, c: peakCredit(p.id) }))
    .filter((x): x is { p: Peak; c: NonNullable<ReturnType<typeof peakCredit>> } => Boolean(x.c));
  if (!credited.length) return null;

  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer list-none text-[11px] text-mist-dim transition-colors hover:text-mist">
        Photograph credits ({credited.length}) &middot; Wikimedia Commons
      </summary>
      <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
        {credited.map(({ p, c }) => (
          <li key={p.id} className="text-[10.5px] leading-snug text-mist-dim">
            <span className="text-mist">{p.name}</span> &middot;{" "}
            {c.credit ?? "Unknown photographer"} &middot;{" "}
            <a
              href={c.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-azure/80 hover:text-azure"
            >
              {c.license}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Banner() {
  return (
    <section className="grid overflow-hidden rounded-card border border-hairline bg-graphite lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative min-h-[210px]">
        <img src="/img/denali.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-graphite lg:to-graphite" />
      </div>
      <div className="flex flex-col justify-center p-8">
        <p className="section-label">Find your next expedition</p>
        <h2 className="mt-2.5 text-[25px] font-light leading-[1.18] tracking-[-0.02em] text-snow">
          Companies that run them.
          <br />
          The mountains they run.
        </h2>
        <p className="mt-3 max-w-[46ch] text-[13px] leading-relaxed text-mist">
          Compare operators, read what climbers said, and see exactly what a price covers before you
          enquire.
        </p>
        <Link
          to="/app/mountains"
          className="mt-5 inline-flex w-fit items-center gap-2 rounded-pill bg-azure-cta px-5 py-2.5 text-[13px] font-medium text-obsidian transition-opacity hover:opacity-90"
        >
          Start exploring
          <ChevronRight size={14} strokeWidth={2.2} />
        </Link>
      </div>
    </section>
  );
}

/**
 * One operator's listing for the selected peak.
 *
 * `best` gets the gilt treatment — the single sanctioned non-azure surface in
 * the app. See the `--ice-gilt` note in `index.css`.
 */
function Listing({ e, peak, best }: { e: Expedition; peak: Peak; best: boolean }) {
  const c = companyById(companySlug(e.company));
  const rated = c !== undefined && c.reviewCount > 0;

  return (
    <Link
      to={`/app/trip/${e.id}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-card border transition-colors",
        best
          ? "gilt-sheen border-gilt/45 hover:border-gilt"
          : "border-hairline bg-graphite hover:border-azure/45",
      )}
    >
      {/*
        THE BANNER, and only on the best match.
        A gold border alone was doing the whole job of saying "this one is
        different", which at card size is a hairline. Giving the recommendation
        the mountain it is a recommendation FOR is what makes it read as a
        different kind of thing rather than a card with a warmer outline.

        It stays INSIDE THE GRID COLUMN. It briefly spanned the full row, and a
        photograph stretched across 1,300 px at 132 px tall is a letterbox strip
        with the mountain cropped out of it — the banner drew attention to the
        card and away from the peak it was supposed to be showing.
      */}
      {best && (
        <div className="relative h-[132px] shrink-0">
          <img
            src={peakImage(peak.id)}
            alt=""
            aria-hidden
            loading="lazy"
            onError={(ev) => {
              const el = ev.currentTarget;
              if (!el.dataset.fellBack) {
                el.dataset.fellBack = "1";
                el.src = peakFallback(peak.id);
              }
            }}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 scrim-bottom" />
          <span className="absolute left-4 top-4 flex w-fit items-center gap-1.5 rounded-pill border border-gilt/50 bg-obsidian/70 px-3 py-1 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-gilt backdrop-blur">
            <Star size={9} className="fill-gilt" strokeWidth={0} />
            Best match for {peak.name}
          </span>
          <span className="tnum absolute bottom-3.5 right-4 text-[11.5px] text-mist">
            {peak.elevationM.toLocaleString("en-GB")} m
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3.5">
          {/* An invented company's mark, or its monogram. A real business's logo
              is not bundled — see the `logo` note in data/companies.ts. */}
          <CompanyMark
            name={e.company}
            logo={c?.logo}
            size={best ? 60 : 52}
            variant="tile"
            decorative
          />

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className={cn("truncate text-snow", best ? "text-[15px]" : "text-[13.5px]")}>
                {e.company}
              </span>
              <VerifiedTick verifiedOn={e.verifiedOn} size={13} />
            </span>
            <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">{e.objective}</span>
            <span className="mt-1.5 flex items-center gap-1.5 text-[11.5px]">
              {rated ? (
                <>
                  <Star size={11} className="fill-azure text-azure" strokeWidth={1.8} />
                  <span className="tnum text-snow">{c.rating.toFixed(1)}</span>
                  <span className="text-mist-dim">({c.reviewCount})</span>
                </>
              ) : (
                /* No rating is invented for an operator that has none published —
                   see the Elite Exped note in data/companies.ts. */
                <span className="text-mist-dim">No ratings published</span>
              )}
            </span>
          </span>

          <span className="shrink-0 text-right">
            <span className="section-label block">From</span>
            <span className={cn("tnum mt-1 block text-snow", best ? "text-[17px]" : "text-[13px]")}>
              {formatEur(e.fromEur)}
            </span>
            {!best && (
              <span className="tnum mt-1 block text-[11px] text-mist-dim">
                {peak.elevationM.toLocaleString("en-GB")} m
              </span>
            )}
          </span>
        </div>

        <div className="mt-3.5 flex items-center gap-2 border-t border-hairline pt-3">
          <Badge tone="azure">{e.months}</Badge>
          <span className="tnum text-[11.5px] text-mist-dim">{e.durationDays} days</span>
          {best && (
            <span className="hidden text-[11.5px] text-mist-dim sm:inline">
              &middot; {e.country}
            </span>
          )}
          <ChevronRight
            size={15}
            strokeWidth={1.9}
            className="ml-auto text-mist-dim transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </div>
    </Link>
  );
}

