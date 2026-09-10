import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import {
  Bell,
  ChevronRight,
  ExternalLink,
  MapPin,
  MessageSquare,
  Mountain as MountainIcon,
  BadgeCheck,
  Search,
  ShieldOff,
  SlidersHorizontal,
  Smartphone,
  Star,
} from "lucide-react";

import { Badge, Button, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { CompanyMark } from "@/components/domain/CompanyMark";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { HeroImage } from "@/components/domain/cards";
import { useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation, fmtPrice } from "@/lib/format";
import { sync } from "@/services/repository";
import { ACCESS_DISCLAIMER, accessFor, operatorSearchUrl } from "@/services/expeditionAccess";
import {
  DEMO_NOTICE,
  OPERATOR_DISCLAIMER,
  SHOW_DEMO_OPERATORS,
  allOperators,
  isExpeditionGround,
  operatorsFor,
  type Operator,
} from "@/services/operators";
import { TREKS, trekById, trekDuration, type Trek } from "@/treks";
import { FAMOUS_TREKS } from "@/treks/famous";
import { trekHasPhoto, trekImage, trekImageSubject } from "@/treks/images";
import { loadPeakCatalogue, searchPeaks, type Peak } from "@/services/peaks";
import { lastPlace } from "@/routes/places";
import { useApp, usePrimaryGoal, type EnquiryThread } from "@/state/AppState";
import type { Goal, Mountain } from "@/types";

/**
 * Screen 15 — the expedition company directory (/explore/expeditions).
 *
 * WHAT THIS DIRECTORY IS, AND WHAT IT REFUSES TO BE
 *
 * ICEFALL has no operator partnerships, no bookings, no reviews and no backend.
 * A directory of guiding companies is the one surface in this app where
 * decorating an empty dataset would be dangerous rather than merely dishonest:
 * a climber who rings a company that does not exist, or trusts a rating nobody
 * gave, can end up on a glacier with the wrong people. So in an ordinary build
 * this screen renders only what `operators.ts` actually holds — sample
 * listings, each named as a sample — and refuses, individually and on purpose:
 *
 *   · invented company names     — every card is a listing from the model
 *   · star ratings, review counts — there are no reviews to average
 *   · "verified" ticks           — ICEFALL verifies nothing about an operator
 *   · years in business, team size, founding dates — unverifiable claims
 *   · "+24 climbers joined"      — there are no members and no social proof
 *   · sponsored or premium slots — no commercial relationships exist, and a
 *                                  paid slot at the top of a safety-critical
 *                                  directory would be wrong even if they did
 *   · an inflated result count   — the count line reports what is rendered
 *
 * THE ONE EXCEPTION, STATED HERE BECAUSE THIS HEADER USED TO DENY IT.
 *
 * A tick, a star rating with a review count, and a "From €X" price do render —
 * for entries carrying `demo: true`, and only when `SHOW_DEMO_OPERATORS` is on.
 * That flag is false in any ordinary production build and the demo entries
 * themselves are `[]` at definition, so none of it reaches a shipped bundle,
 * let alone a screen. It exists so the mockup can be judged as drawn, and a
 * build carrying it may only be deployed behind Deployment Protection — the
 * conditions are in `@/lib/demoFlag` and they are not optional.
 *
 * The list above therefore describes what SHIPS, not what the file contains,
 * and this paragraph is the difference. It was written the other way for a
 * while: a header claiming to refuse all three sat directly above the code that
 * renders them, which is worse than either the honest refusal or the honest
 * exception, because the next person to read it stops checking.
 *
 * What replaces them is the material that actually decides who to trust at
 * altitude: certification, the real permit authority for the range, response
 * time, and the questions to ask before money moves. Those come from
 * `expeditionAccess.ts`, which names only checkable bodies.
 */

/* -------------------------------------------------------------------------- */
/* Ranges                                                                     */
/* -------------------------------------------------------------------------- */

type RangeId = "alps" | "himalaya" | "karakoram" | "andes" | "africa";

interface Range {
  id: RangeId;
  label: string;
  /** The same name inside a sentence — "the Alps", but "Africa". */
  prose: string;
  /** Country names spelled exactly as operators.ts and expeditionAccess.ts spell them. */
  countries: readonly string[];
}

const RANGES: readonly Range[] = [
  {
    id: "alps",
    label: "Alps",
    prose: "the Alps",
    countries: ["Switzerland", "France", "Italy", "Austria", "Slovenia", "Germany"],
  },
  {
    id: "himalaya",
    label: "Himalaya",
    prose: "the Himalaya",
    countries: ["Nepal", "India", "China", "Bhutan"],
  },
  // Pakistan only. The Karakoram crosses into China and India, but a listing
  // that works in Tibet is not thereby a Karakoram operator, and filing it
  // under both ranges would overstate what it does.
  { id: "karakoram", label: "Karakoram", prose: "the Karakoram", countries: ["Pakistan"] },
  {
    id: "andes",
    label: "Andes",
    prose: "the Andes",
    countries: ["Argentina", "Chile", "Peru", "Bolivia", "Ecuador"],
  },
  // Africa stays in the chip set although no sample listing covers it. The
  // empty result is the true answer, and it is more useful than quietly
  // dropping the chip or padding it with a listing that does not exist.
  { id: "africa", label: "Africa", prose: "Africa", countries: ["Tanzania", "Kenya", "Morocco"] },
];

type ChipId = "all" | RangeId;

const CHIPS: readonly { id: ChipId; label: string }[] = [
  { id: "all", label: "All" },
  ...RANGES.map((r) => ({ id: r.id as ChipId, label: r.label })),
];

/* -------------------------------------------------------------------------- */
/* Listing helpers — all derived from the model, none invented                */
/* -------------------------------------------------------------------------- */

/** Fixtures spell shared summits "France / Italy"; permits are per country. */
function countriesOf(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split("/")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * WHAT THE COMPANY LIST IS ABOUT — a mountain, or a trek.
 *
 * The rails on this tab select rather than navigate, and both of them feed the
 * same list of companies underneath. That is the whole interaction: tap a
 * mountain to see who climbs it, tap a trek to see who walks it, without
 * leaving the page. This type is what makes the second half possible without
 * duplicating the company section, and it is deliberately NARROWER than `Peak`
 * — name, altitude and country are all `operatorsFor` actually matches on.
 */
interface ListingSubject {
  kind: "peak" | "trek";
  /** Selection key, so a rail can mark the chosen tile. */
  key: string;
  name: string;
  elevationM: number;
  country?: string;
  lat?: number;
  lon?: number;
  curatedId?: string;
  photo?: string;
}

const subjectFromPeak = (p: Peak): ListingSubject => ({
  kind: "peak",
  key: p.id,
  name: p.name,
  elevationM: p.elevationM,
  country: p.country,
  lat: p.lat,
  lon: p.lon,
  curatedId: p.curatedId,
  photo: p.photo,
});

/**
 * A trek as a listing subject.
 *
 * NO COORDINATES, ON PURPOSE. A trek is a line, not a point, and the catalogue
 * stores no position for one. Omitting lat/lon leaves `useMountainImage` to
 * fall back to terrain art, which it captions as derived; borrowing the
 * coordinates of a mountain the route passes would caption someone else's
 * summit as this walk, and defaulting to 0,0 would send the imagery lookup to
 * the Gulf of Guinea.
 *
 * UNDEFINED WHEN THE HIGH POINT IS UNPUBLISHED. Companies are matched partly
 * on the altitude they work at, so a missing altitude has no honest default:
 * zero clears every operator's floor and would return the entire directory,
 * ordered as though something had matched. One of the 31 picked treks — the
 * Kumano Kodo — is in exactly that position, and the tab says so.
 */
const subjectFromTrek = (t: Trek): ListingSubject | undefined =>
  t.maxAltitudeM === null
    ? undefined
    : {
        kind: "trek",
        key: `trek:${t.id}`,
        name: t.name,
        elevationM: t.maxAltitudeM,
        country: t.country,
        // The route's OWN photograph, and only when one exists — `trekImage`
        // would otherwise hand back a contour plate as though it were a
        // picture. Passing it here means the featured card's banner shows the
        // walk rather than generated terrain, which is both better looking and
        // a truer answer to "what is this list about".
        photo: trekHasPhoto(t.id) ? trekImage(t) : undefined,
      };

/**
 * The country the athlete last looked at, read from the saved place.
 *
 * TWO SHAPES, because a place can BE a country. `region` reads
 * "Haute-Savoie, France" for a town, so the country is its last comma segment
 * — but for a country the geocoder returns `{ name: "Slovakia", region: "",
 * kind: "Country" }`, and reading the region there yields nothing at all. The
 * first version did exactly that and silently opened on "Everywhere" for
 * anyone whose last search was a whole country.
 */
function countryOfLastPlace(): string {
  const place = lastPlace();
  if (!place) return "";
  if (place.kind === "Country" && place.name) return place.name;
  const parts = (place.region ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : "";
}

/** A listing with no regions works everywhere — the model's global fallback. */
const isMultiRange = (o: Operator) => o.regions.length === 0;

const rangesOf = (o: Operator): Range[] =>
  RANGES.filter((r) => o.regions.some((c) => r.countries.includes(c)));

/**
 * The one range a listing is filed under in Companies.
 *
 * Ranges share countries — a listing that works in China touches both the
 * Himalaya and, historically, the Karakoram — so grouping on any overlap would
 * print the same listing twice and make six listings look like eight. The model
 * names the country an operator is registered in first, so that is the one that
 * decides the group, and every listing appears exactly once.
 */
const primaryRangeOf = (o: Operator): Range | undefined =>
  RANGES.find((r) => o.regions.length > 0 && r.countries.includes(o.regions[0]));

function coversRange(o: Operator, chip: ChipId): boolean {
  if (chip === "all") return true;
  if (isMultiRange(o)) return true; // genuinely multi-range, not a promoted slot
  const range = RANGES.find((r) => r.id === chip);
  return range ? o.regions.some((c) => range.countries.includes(c)) : false;
}

const coversAnyCountry = (o: Operator, countries: readonly string[]) =>
  countries.some((c) => o.regions.includes(c));

/** British-English list: "Nepal, India and China". */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The real permit authorities for the countries a listing covers. Nothing here
 * is written by ICEFALL — every line is a body a climber can ring.
 */
function permitAuthorities(o: Operator): { country: string; authority: string }[] {
  const out: { country: string; authority: string }[] = [];
  for (const country of o.regions) {
    const access = accessFor({ country, requiresGuide: false, elevationM: o.minElevationM });
    if (access.authority) out.push({ country, authority: access.authority });
  }
  return out;
}

/** The first real access note for a covered country, quoted rather than paraphrased. */
function firstAccessNote(o: Operator): { country: string; note: string } | undefined {
  for (const country of o.regions) {
    const access = accessFor({ country, requiresGuide: false, elevationM: o.minElevationM });
    const note = access.notes[0];
    if (note) return { country, note };
  }
  return undefined;
}

/**
 * The card's description.
 *
 * Not copy about the company — there is no company, and prose about one would
 * be marketing for nobody. It is the first real access fact for the ground the
 * listing covers, quoted from `expeditionAccess`, which is the thing a climber
 * reading a directory entry actually needs. Only the multi-range fallback,
 * which covers no particular country, gets a sentence about the listing itself.
 */
const SAMPLE_DESCRIPTION =
  "A sample entry. It holds what a real listing would hold — certification, coverage and response time — and names no company, because ICEFALL has none to name.";

/** Curated ICEFALL objectives that sit inside a listing's coverage. */
function objectivesIn(o: Operator): Mountain[] {
  if (isMultiRange(o)) return [];
  return sync.mountains.filter((m) => countriesOf(m.country).some((c) => o.regions.includes(c)));
}

/** Monogram from the range the listing is named for. Never a fabricated logo. */
/* `monogram` moved to `components/domain/CompanyMark` — one algorithm, five screens. */

/* -------------------------------------------------------------------------- */
/* The objective an enquiry is about                                          */
/* -------------------------------------------------------------------------- */

interface EnquiryObjective {
  peakName: string;
  elevationM: number;
  goalId?: string;
  /** Countries the objective sits in — used for ordering, not for ranking. */
  countries: string[];
}

function objectiveFrom(goal: Goal | undefined): EnquiryObjective | undefined {
  if (!goal) return undefined;
  const mountain = goal.mountainId ? sync.mountainById(goal.mountainId) : undefined;
  return {
    peakName: goal.name,
    elevationM: goal.elevationM ?? mountain?.elevationM ?? 0,
    goalId: goal.id,
    countries: countriesOf(goal.country ?? mountain?.country),
  };
}

/** The existing compose route in Inbox.tsx — the only enquiry flow there is. */
/**
 * Where a company card goes.
 *
 * The COMPANY'S PAGE, not a blank enquiry form. Tapping a listing used to drop
 * straight into "new enquiry" with a message to write — asking someone to make
 * first contact with a guiding company before they had read a single thing
 * about it, and before they had seen what it costs. The profile carries the
 * cost band, what an expedition on this peak actually involves, the permit
 * authority and the questions to put in writing; the enquiry is the button at
 * the bottom of it.
 *
 * The peak travels in the query string so the profile knows which mountain the
 * question is about, and the enquiry it composes is pre-addressed to it.
 */
function operatorHref(operator: Operator, objective: EnquiryObjective): string {
  const params = new URLSearchParams({
    peak: objective.peakName,
    elevation: String(objective.elevationM),
  });
  if (objective.goalId) params.set("goal", objective.goalId);
  return `/operator/${operator.id}?${params.toString()}`;
}

/**
 * Deterministic order. Listings that cover the objective the athlete is
 * actually training for come first, then everything else alphabetically, then
 * the multi-range fallback because it is the least specific — not because
 * anyone paid for a position. Nothing on this screen can be bought.
 */
function orderListings(list: Operator[], objective: EnquiryObjective | undefined): Operator[] {
  const countries = objective?.countries ?? [];
  const rank = (o: Operator) => {
    if (countries.length > 0 && coversAnyCountry(o, countries)) return 0;
    return isMultiRange(o) ? 2 : 1;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "en-GB"));
}

/** Working-altitude facet, built from the values the model actually holds. */
const ELEVATION_BANDS: number[] = Array.from(new Set(allOperators().map((o) => o.minElevationM)))
  .filter((m) => m > 0)
  .sort((a, b) => a - b);

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Three tabs, and the search box above them does the work.
 *
 * This screen used to carry four tabs (Explore / My expeditions / Companies /
 * Invitations), a region facet, an altitude facet, a filter sheet, a "near you"
 * block and a read-first panel — a whole filing system in front of a question
 * that is really one line long: which companies run this mountain. Type
 * "everest", get Everest's operators.
 *
 *   EXPLORE            a mountain, and the companies that run expeditions on it
 *   MOUNTAINS          every peak ICEFALL holds
 *   HIKES TO MOUNTAINS the walk-ins and approach trails around the peak
 */

type TabId = "explore" | "mountains" | "treks";

const TABS: readonly { id: TabId; label: string }[] = [
  { id: "explore", label: "Explore" },
  { id: "mountains", label: "Mountains" },
  { id: "treks", label: "Treks" },
];

/** Opening peak when the athlete has no objective set. */
const DEFAULT_PEAK = "everest";

/**
 * The curated objectives, as catalogue peaks.
 *
 * These ten are the only mountains with a photograph, a grade and a written
 * route, so they open the rail. Everything past them comes from the peak
 * catalogue, which is why the rail and the search results share one type.
 */
const CURATED_PEAKS: Peak[] = sync.mountains.map((m) => ({
  id: `curated:${m.id}`,
  name: m.name,
  elevationM: m.elevationM,
  lat: m.coords.lat,
  lon: m.coords.lon,
  country: m.country,
  curatedId: m.id,
  photo: m.photo,
  photoCredit: m.photoCredit,
}));

export default function Expeditions() {
  const goal = usePrimaryGoal();
  const [query, setQuery] = useState("");

  /**
   * THE ATHLETE'S OWN GOAL OPENS THE SCREEN — EVEN WHEN IT IS NOT CURATED.
   *
   * `peakId` fell back to Everest for any goal without a `mountainId`, so an
   * athlete training for Mount Robson opened "Expeditions" on Everest's
   * companies, with their own mountain nowhere on the rail. A goal carries the
   * position, elevation and entity id it was created with — everything a rail
   * tile and a listing subject need, in the shape `searchPeaks` returns — so
   * the goal leads the rail and is the opening focus. Nothing is invented: a
   * goal with no position (a custom objective) still gets the default.
   */
  const goalPeak = useMemo<Peak | undefined>(() => {
    if (
      !goal ||
      goal.mountainId ||
      goal.lat === undefined ||
      goal.lon === undefined ||
      goal.elevationM === undefined
    )
      return undefined;
    return {
      id: `osm:${goal.lat.toFixed(4)},${goal.lon.toFixed(4)}`,
      name: goal.name,
      elevationM: goal.elevationM,
      lat: goal.lat,
      lon: goal.lon,
      country: goal.country,
      wikipedia: goal.wikipedia,
      wikidata: goal.wikidata,
    };
  }, [goal]);
  const rail = useMemo(() => (goalPeak ? [goalPeak, ...CURATED_PEAKS] : CURATED_PEAKS), [goalPeak]);

  const [peakId, setPeakId] = useState<string>(
    goal?.mountainId ? `curated:${goal.mountainId}` : (goalPeak?.id ?? `curated:${DEFAULT_PEAK}`),
  );
  const [tab, setTab] = useState<TabId>("explore");
  const [trekId, setTrekId] = useState<string | null>(null);
  const [found, setFound] = useState<Peak[] | null>(null);
  const [loadingPeaks, setLoadingPeaks] = useState(false);

  const needle = query.trim().toLowerCase();

  /**
   * Search the WHOLE catalogue, not the ten curated objectives.
   *
   * Typing "k2" used to answer "No mountain matches that", because the only
   * mountains this screen knew were the ten with photographs. `searchPeaks`
   * reads the precached catalogue and then Overpass, so every summit OSM holds
   * is reachable from here.
   *
   * Debounced, and the in-flight request is abandoned when the query moves on —
   * otherwise a slow answer for "k" lands after the answer for "k2" and
   * overwrites it.
   */
  useEffect(() => {
    if (needle.length < 2) {
      setFound(null);
      setLoadingPeaks(false);
      return;
    }
    let live = true;
    const controller = new AbortController();
    setLoadingPeaks(true);

    const t = window.setTimeout(() => {
      searchPeaks(needle, controller.signal)
        .then((peaks) => {
          if (live) setFound(peaks.slice(0, 24));
        })
        .catch(() => {
          // An unreachable Overpass still leaves the local catalogue's answer.
          if (live) setFound([]);
        })
        .finally(() => {
          if (live) setLoadingPeaks(false);
        });
    }, 280);

    return () => {
      live = false;
      controller.abort();
      window.clearTimeout(t);
    };
  }, [needle]);

  const shownMountains = needle.length >= 2 ? (found ?? []) : rail;

  /**
   * The peak in focus.
   *
   * Typing a mountain's name selects it, which is the whole interaction: the
   * search box is how you change what "expeditions on …" is about, rather than
   * a filter applied on top of a selection made somewhere else.
   */
  const peak = useMemo(() => {
    if (needle && shownMountains.length > 0) return shownMountains[0];
    return rail.find((m) => m.id === peakId) ?? rail[0];
  }, [needle, shownMountains, peakId, rail]);

  /**
   * The trek in focus, when a trek tile was the last thing tapped.
   *
   * A trek selection OUTRANKS the peak selection rather than replacing it:
   * choosing a mountain clears this, so the two rails cannot both look active
   * while only one of them is driving the list below.
   */
  const selectedTrek = trekId ? trekById(trekId) : undefined;

  const subject = useMemo<ListingSubject | undefined>(
    () => (selectedTrek ? subjectFromTrek(selectedTrek) : peak ? subjectFromPeak(peak) : undefined),
    [selectedTrek, peak],
  );

  /** Every company that works this subject's country at this altitude. */
  const listings = useMemo(() => {
    if (!subject) return [];
    const byId = new Map<string, Operator>();
    const scopes: (string | undefined)[] =
      countriesOf(subject.country).length > 0 ? countriesOf(subject.country) : [undefined];
    for (const country of scopes) {
      for (const o of operatorsFor({ country, elevationM: subject.elevationM })) byId.set(o.id, o);
    }

    let out = [...byId.values()];
    // A company's own name is searchable too — "alpine ascents" should find
    // them without knowing which mountain they are filed under.
    if (needle && shownMountains.length === 0) {
      out = allOperators().filter((o) =>
        [o.name, o.certification, o.city, ...o.regions].some((f) =>
          f?.toLowerCase().includes(needle),
        ),
      );
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  }, [subject, needle, shownMountains.length]);

  const objective = objectiveFrom(goal);

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-24 pt-2">
        {/* ---- Title ---------------------------------------------------- */}
        <Rise className="flex items-center justify-between">
          <h1 className="text-[19px] font-normal uppercase tracking-[0.14em] text-snow">
            Expeditions
          </h1>
          <Link
            to="/notifications"
            aria-label="Notifications"
            className="grid h-9 w-9 place-items-center rounded-full border border-hairline text-mist transition-colors hover:border-azure/50 hover:text-snow"
          >
            <Bell size={16} strokeWidth={1.7} />
          </Link>
        </Rise>

        {/* ---- Search ---------------------------------------------------- */}
        <Rise className="relative pt-4">
          <Search
            size={16}
            strokeWidth={1.6}
            className="pointer-events-none absolute left-3.5 top-1/2 mt-2 -translate-y-1/2 text-mist-dim"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search expeditions, mountains or companies…"
            aria-label="Search expeditions, mountains or companies"
            className="h-11 w-full rounded-full border border-hairline bg-elevated/40 pl-10 pr-4 text-[13px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50 [&::-webkit-search-cancel-button]:hidden"
          />
        </Rise>

        {/* ---- Tabs ------------------------------------------------------ */}
        {/* These are the Expeditions screen's OWN sub-pages and they stay.
            The Explore bar above lost its Mountains and Treks tabs; these are
            not those. Here they are the depth behind the two rails on the
            Explore sub-tab — the full grid of peaks, and the trek list. */}
        <Rise className="no-scrollbar -mx-5 mt-5 flex gap-7 overflow-x-auto border-b border-hairline px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={t.id === tab}
              className={cn(
                "shrink-0 border-b-2 pb-2.5 text-[12px] uppercase tracking-[0.1em] transition-colors",
                t.id === tab
                  ? "border-azure text-azure"
                  : "border-transparent text-mist-dim hover:text-mist",
              )}
            >
              {t.label}
            </button>
          ))}
        </Rise>

        {tab === "explore" && (
          <ExploreTab
            subject={subject}
            selectedTrek={selectedTrek}
            mountains={shownMountains}
            selectedId={selectedTrek ? undefined : peak?.id}
            selectedTrekId={trekId}
            onSelect={(id) => {
              setPeakId(id);
              setTrekId(null);
              setQuery("");
            }}
            onSelectTrek={setTrekId}
            listings={listings}
            objective={objective}
            searching={needle !== ""}
            loading={loadingPeaks}
          />
        )}

        {tab === "mountains" && (
          <MountainsTab
            mountains={shownMountains}
            loading={loadingPeaks}
            searching={needle !== ""}
          />
        )}

        {tab === "treks" && <TreksTab />}
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Explore                                                                    */
/* -------------------------------------------------------------------------- */

function ExploreTab({
  subject,
  selectedTrek,
  mountains,
  selectedId,
  selectedTrekId,
  onSelect,
  onSelectTrek,
  listings,
  objective,
  searching,
  loading,
}: {
  subject: ListingSubject | undefined;
  selectedTrek: Trek | undefined;
  mountains: Peak[];
  selectedId: string | undefined;
  selectedTrekId: string | null;
  onSelect: (id: string) => void;
  onSelectTrek: (id: string) => void;
  listings: Operator[];
  objective: EnquiryObjective | undefined;
  searching: boolean;
  loading: boolean;
}) {
  const companiesRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  /**
   * Choosing a mountain scrolls to what choosing it changed.
   *
   * On a phone the company list for a peak starts below the fold — under the
   * banner, the rail and the trek rail — so tapping a tile updated a heading
   * nobody could see and the tap read as doing nothing at all.
   *
   * Two frames, not one: the section being aimed at re-renders with the new
   * peak, and a selection made from search results also clears the query,
   * which re-lays out the whole tab. Measuring before that settles scrolls to
   * where the companies USED to be.
   */
  const revealCompanies = () => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = companiesRef.current;
        if (!el) return;
        const scroller = scrollParentOf(el);
        if (!scroller) return;
        const top =
          el.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
        scroller.scrollTo({
          top: Math.max(0, top - 12),
          behavior: reduceMotion ? "auto" : "smooth",
        });
      }),
    );
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    revealCompanies();
  };

  /**
   * A trek tile SELECTS, it does not navigate.
   *
   * The rail used to be a row of links straight to the trek page, and leaving
   * the screen to find out who runs a walk is not what the mountain rail does
   * two sections above it. Both rails now answer the same question in the same
   * place. The trek's own page is still reachable from the section below.
   */
  const handleSelectTrek = (id: string) => {
    onSelectTrek(id);
    revealCompanies();
  };

  return (
    <>
      {/* The banner is the section's one piece of styling, and it goes away
          during a search — a poster above a result list is furniture. */}
      {!searching && (
        <Rise className="pt-5">
          <HeroImage src="/img/denali.jpg" alt="" ratio="aspect-[16/9]">
            <h2 className="max-w-[11ch] text-[26px] font-light leading-[1.15] text-snow">
              Find your next expedition
            </h2>
            <p className="mt-2 text-[12.5px] text-snow/70">
              Companies that run them. The mountains they run.
            </p>
          </HeroImage>
        </Rise>
      )}

      {/* ---- The mountain rail ------------------------------------------ */}
      <Rise className="flex items-baseline justify-between pt-7">
        <p className="section-label">{searching ? "Matching mountains" : "Explore mountains"}</p>
        <Link
          to="/explore/mountains"
          className="flex items-center gap-0.5 text-[11.5px] text-azure transition-colors hover:text-azure-bright"
        >
          View all
          <ChevronRight size={13} strokeWidth={1.9} />
        </Link>
      </Rise>

      {mountains.length === 0 ? (
        <Rise className="py-8">
          <p className="text-[12.5px] text-mist">
            {loading ? "Searching every peak…" : "No mountain matches that."}
          </p>
        </Rise>
      ) : (
        <Rise className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5">
          {mountains.map((m) => (
            <MountainTile
              key={m.id}
              mountain={m}
              selected={m.id === selectedId}
              onSelect={() => handleSelect(m.id)}
            />
          ))}
        </Rise>
      )}

      {/* ---- Famous treks, directly under the mountains ------------------ */}
      {/* Hidden mid-search: the results are about what was typed, and a fixed
          rail of world-famous walks under a search for "alpine ascents"
          answers a question nobody asked. */}
      {!searching && <FamousTreks selectedId={selectedTrekId} onSelect={handleSelectTrek} />}

      {/* ---- The companies ---------------------------------------------- */}
      {/* Where a tap on either rail scrolls to. A zero-height anchor rather
          than a wrapper, so the `Stagger` sequence below is left alone. It sits
          outside the conditional so the scroll target exists even while a trek
          with no published high point is selected. */}
      <div ref={companiesRef} aria-hidden className="h-0" />

      {/* A trek was chosen, but its high point is unpublished — so there is
          nothing to match companies on. Saying that is the honest answer; a
          list assembled without the altitude filter would be the directory in
          alphabetical order, wearing the authority of a match. */}
      {selectedTrek && !subject && (
        <Rise className="pt-8">
          <p className="section-label">Companies on {selectedTrek.name}</p>
          <p className="mt-2.5 max-w-[52ch] text-[12.5px] leading-relaxed text-mist">
            No high point is published for this route, and companies are matched partly on the
            altitude they work at. Rather than list every operator and let the order imply a match
            nobody made, this shows none.
          </p>
        </Rise>
      )}

      {/* A summit below expedition ground. Mount Olympus at 2,918 m is the
          case that prompted this: no company in the directory works below
          4,000 m, so the heading could only ever be followed by "no listing
          covers this peak" — which reads as a hole in the market rather than
          the category error it is. It wants a guide, and says so. */}
      {subject?.kind === "peak" && !isExpeditionGround(subject.elevationM) && (
        <>
          <Rise className="pt-8">
            <p className="section-label">Guides on {subject.name}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
              {subject.name} is a guided objective rather than an expedition. Expedition companies
              organise permits, base camps and logistics for high peaks, and the lowest altitude any
              of them works at is well above this summit.
            </p>
          </Rise>
          <Rise className="pt-3">
            <Link
              to={`/explore/guides?peak=${encodeURIComponent(subject.name)}&elevation=${subject.elevationM}${subject.country ? `&country=${encodeURIComponent(subject.country)}` : ""}`}
              className="flex items-center gap-3.5 py-3.5 transition-colors hover:opacity-90"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-tile border border-hairline bg-elevated/40 text-mist">
                <MountainIcon size={17} strokeWidth={1.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-snow">Find a guide</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-mist">
                  Individual professional guides, matched to {subject.name}.
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
            </Link>
          </Rise>
        </>
      )}

      {subject && (subject.kind === "trek" || isExpeditionGround(subject.elevationM)) && (
        <>
          <Rise className="pt-8">
            <p className="section-label">
              {subject.kind === "trek"
                ? `Companies on ${subject.name}`
                : `Expeditions on ${subject.name}`}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
              {listings.length === 0
                ? subject.kind === "trek"
                  ? "No listing covers this route."
                  : "No listing covers this peak."
                : subject.kind === "trek"
                  ? // The claim is the MATCH, not a booking: no trek in the
                    // catalogue carries an operator link, so "companies that
                    // run this trek" would assert what the data cannot.
                    `${listings.length} ${listings.length === 1 ? "company" : "companies"} matched to ${subject.country} at ${fmtElevation(subject.elevationM)} m`
                  : `${listings.length} ${listings.length === 1 ? "company" : "companies"} offering expeditions`}
            </p>
          </Rise>

          {/* The gilt band at the top, then the rest as rows. The spacing is
              the list now — there is nothing left to space cards apart. */}
          <div className="mt-3.5">
            {(() => {
              // The best match is lifted out and shown first, highlighted; the
              // rest keep their alphabetical order underneath it.
              // A pinned entry takes the top card; otherwise the ranking picks
              // it. The two are different claims and the badge says which.
              const best = listings.find((o) => o.featured) ?? bestMatchFor(listings, subject);
              const rest = listings.filter((o) => o.id !== best?.id);
              return (
                <>
                  {best && (
                    <Rise key={best.id}>
                      <OperatorCard
                        operator={best}
                        subject={subject}
                        objective={objective}
                        featured
                      />
                    </Rise>
                  )}
                  {rest.map((o) => (
                    <Rise key={o.id} className="border-t border-hairline first:border-t-0">
                      <OperatorCard operator={o} subject={subject} objective={objective} />
                    </Rise>
                  ))}
                </>
              );
            })()}
          </div>

          {/*
           * THE THREE PARAGRAPHS THAT USED TO CLOSE THIS LIST ARE GONE.
           *
           * An ordering note, `OPERATOR_DISCLAIMER` and `DEMO_NOTICE` stacked
           * up to a wall of small grey text under every company list, and the
           * owner asked for it removed. What each of them said still reaches
           * the reader, which is the only reason removing them was safe:
           *
           *   · "not vetted, no part in a booking" — the TrustStrip at the
           *     foot of this tab says exactly that, in full, unconditionally.
           *   · "these companies are invented" — every demo listing carries a
           *     DEMO chip on the card itself, beside the invented figures.
           *   · "no position is for sale" — the TrustStrip covers the paid-
           *     placement claim too.
           *
           * So this is a de-duplication, not a quiet dropping of the honesty
           * copy. If the TrustStrip is ever removed from this screen or the
           * DEMO chip stops rendering, these have to come back — the facts are
           * load-bearing and a reader must not be able to reach an invented
           * company without meeting one of them.
           */}
        </>
      )}

      <Rise className="pt-8">
        <TrustStrip />
      </Rise>
    </>
  );
}

/**
 * The nearest ancestor that actually scrolls.
 *
 * Found by BEHAVIOUR, not by class name: this app's scroll container is a
 * Tailwind `overflow-y-auto` today, and a selector looking for that string
 * would break silently the day the layout is refactored — leaving the tap
 * feedback dead with nothing to show for it. Asking whether an element
 * overflows and scrolls cannot go stale that way.
 */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (/(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/** A peak in the horizontal rail — photo, name, height. */
function MountainTile({
  mountain,
  selected = false,
  onSelect,
  to,
}: {
  mountain: Peak;
  selected?: boolean;
  onSelect?: () => void;
  /**
   * Render as a link, filling its container, instead of a fixed-width selector.
   *
   * The tile is 128 px wide because that is what the horizontal rail wants. In
   * the two-column grid on the Mountains sub-tab the cell is 162 px, so the
   * tile sat in it leaving 34 px of dead space down the right of every card —
   * which read as the grid having too much gap, when the gap was 12 px and it
   * was the tile that was short.
   *
   * It also fixes a real defect: the grid used to wrap this BUTTON in a Link,
   * which is invalid HTML and lets the button swallow the click. Now the tile
   * is the anchor.
   */
  to?: string;
}) {
  // `useMountainImage` returns { src, real } — `real: false` means it fell back
  // to generated terrain art rather than a photograph of this peak.
  const image = useMountainImage(mountain);
  const Tag = (to ? Link : "button") as React.ElementType;

  return (
    <Tag
      {...(to ? { to } : { type: "button" as const, onClick: onSelect, "aria-pressed": selected })}
      /* The photograph IS the tile, so the only edge is the picture's own.
         Selection is a ring drawn INSIDE that edge rather than a frame swapped
         for a coloured one — a border that only changes colour makes every
         unselected tile read as selected-but-grey. */
      className={cn(
        "relative block overflow-hidden rounded-tile text-left transition-opacity hover:opacity-[0.92]",
        to ? "w-full" : "w-[128px] shrink-0",
        selected && "ring-2 ring-inset ring-azure",
      )}
    >
      <div className="aspect-[4/5] w-full bg-slate">
        <img
          src={image.src}
          alt=""
          aria-hidden
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 scrim-bottom px-3 pb-2.5 pt-8">
        <p className="truncate text-[13px] text-snow">{mountain.name}</p>
        <p className="tnum mt-0.5 text-[11px] text-mist">{fmtElevation(mountain.elevationM)} m</p>
      </div>
    </Tag>
  );
}

/* -------------------------------------------------------------------------- */
/* Treks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * FAMOUS TREKS — a rail, built like the mountain rail at the top of the tab.
 *
 * A trek is not an expedition and this block does not pretend otherwise: it
 * keeps its own heading and its own vocabulary, and no trek is ever merged
 * into the company listings. The distinction `treks/model.ts` draws is the one
 * a reader comes here to make — an expedition climbs a summit, a trek walks to,
 * around or between mountains — and one list holding both would file a
 * fortnight's walking at 5,364 m beside a two-month climb at 8,849 m.
 *
 * ── IT IS NOT SCOPED TO THE SELECTED PEAK, ON PURPOSE ───────────────────────
 * The first build of this rail answered "treks on {peak}" and changed with the
 * mountain selection. It was cut. Only four of the ten curated mountains have
 * a linked route at all, so six of them showed a paragraph explaining an
 * absence instead of a list — a section that is empty more often than not is
 * furniture, and the fix is to not ask the question. The catalogue's 252
 * routes are a world list; this rail shows the well-known ones and stays put.
 * Anything peak-specific belongs on the mountain's own page.
 *
 * ── "FAMOUS" IS AN OPINION, AND THE HEADING IS NOW ALL THAT SAYS SO ─────────
 * Nobody has walked these through ICEFALL, no operator reports numbers to us,
 * and the `Trek` model holds no popularity, rating or booking field — so there
 * is nothing here to rank and the order below is editorial.
 *
 * A sub-line used to carry that qualification in words ("picked by hand, not
 * ranked"); it was removed with the rest of the small grey text on this tab.
 * The claim is therefore doing its work through ONE WORD: "Famous" asserts
 * recognition, which is a fair editorial judgement, where "Top", "Best", "Most
 * popular" or a numbered list would each assert a measurement this app cannot
 * make. Rename the heading to any of those and the sentence has to come back.
 * `treks/famous.ts` records what was refused in assembling the list, including
 * the plausible-looking near miss.
 */
function FamousTreks({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <Rise className="flex items-baseline justify-between pt-8">
        <p className="section-label">Famous treks</p>
        <Link
          to="/explore/treks"
          className="flex items-center gap-0.5 text-[11.5px] text-azure transition-colors hover:text-azure-bright"
        >
          View all
          <ChevronRight size={13} strokeWidth={1.9} />
        </Link>
      </Rise>

      {/* NO SUB-LINE. It read "picked by hand, not ranked", and the owner asked
          for the small grey text on this tab to go. The qualification it
          carried is real — the `Trek` model holds no popularity field, so the
          order here is editorial and nothing on screen may imply otherwise —
          and it now rests entirely on the heading staying the word "Famous",
          which claims recognition rather than rank. "Top", "Best", "Most
          popular" or a numbered list would each need the sentence back. */}
      <Rise className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5">
        {FAMOUS_TREKS.map((t) => (
          <TrekTile
            key={t.id}
            trek={t}
            selected={t.id === selectedId}
            onSelect={() => onSelect(t.id)}
          />
        ))}
      </Rise>
    </>
  );
}

/**
 * A trek in a horizontal rail — photograph, name, days.
 *
 * A BUTTON, NOT A LINK, and built to match `MountainTile` exactly: same width,
 * same ratio, same selected border. Tapping it chooses what the company list
 * below is about instead of leaving the screen, because the mountain rail two
 * sections above behaves that way and a rail that looks identical must not
 * behave differently.
 */
function TrekTile({
  trek,
  selected = false,
  onSelect,
  to,
}: {
  trek: Trek;
  selected?: boolean;
  onSelect?: () => void;
  /**
   * Render as a link instead of a selector.
   *
   * The rail on the Explore sub-tab SELECTS — it changes what the company list
   * below is about without leaving the page. The Treks sub-tab is a
   * destination grid and opens the route, exactly as the Mountains grid opens
   * a peak. Same tile, two jobs, and the anchor is a real anchor rather than a
   * button wrapped in one.
   */
  to?: string;
}) {
  // Null means the photograph is OF THE ROUTE and needs no qualifier.
  const subject = trekImageSubject(trek);
  const Tag = (to ? Link : "button") as React.ElementType;

  return (
    <Tag
      {...(to ? { to } : { type: "button" as const, onClick: onSelect, "aria-pressed": selected })}
      /* Same treatment as `MountainTile` — see the note there. */
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-tile text-left transition-opacity hover:opacity-[0.92]",
        to ? "w-full" : "w-[142px]",
        selected && "ring-2 ring-inset ring-azure",
      )}
    >
      <div className="aspect-[4/5] w-full bg-slate">
        <img
          src={trekImage(trek)}
          alt=""
          aria-hidden
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>

      {/* A picture of the MOUNTAIN above a route's name quietly claims to be
          the route. Where it is the peak's photograph, the tile names it. */}
      {subject && (
        <p className="absolute inset-x-0 top-0 bg-obsidian/70 px-2 py-1 text-[9.5px] leading-tight text-mist/75 backdrop-blur">
          {subject}
        </p>
      )}

      <div className="absolute inset-x-0 bottom-0 scrim-bottom px-3 pb-2.5 pt-8">
        {/* `clamp-2`, not `line-clamp-2` — see the note in index.css: Tailwind
            v4.2's unprefixed form clips to a height and shows the wrong lines. */}
        <p className="clamp-2 text-[12.5px] leading-tight text-snow">{trek.name}</p>
        <p className="tnum mt-0.5 text-[11px] text-mist">{trekDuration(trek)}</p>
      </div>
    </Tag>
  );
}

/* -------------------------------------------------------------------------- */
/* Mountains                                                                  */
/* -------------------------------------------------------------------------- */

function MountainsTab({
  mountains,
  loading,
  searching,
}: {
  mountains: Peak[];
  loading: boolean;
  searching: boolean;
}) {
  /**
   * Opens on where the athlete last looked, not on "Everywhere".
   *
   * The signal is the last place they searched or located — `lastPlace()` —
   * whose `region` reads "Haute-Savoie, France", so the country is the last
   * comma segment. That is a real record of where they were looking, not a
   * guess at where they live, and it is the only location fact this app holds
   * without asking for a permission it has no other use for.
   *
   * It is a starting chip, never a restriction: "Everywhere" sits first in the
   * row, and a country the catalogue cannot answer for clears itself below.
   */
  const [country, setCountry] = useState(() => countryOfLastPlace());

  /**
   * The bundled catalogue, so a country shows the peaks that are actually in
   * it rather than only the handful ICEFALL has written a page for.
   *
   * "France" used to return one card — Mont Blanc — because the grid could
   * only ever show the fourteen curated objectives. The catalogue holds 636
   * French summits, 1,621 Italian, 1,177 Swiss and 759 Austrian, each with a
   * name, a height and a position from OpenStreetMap. `loadPeakCatalogue`
   * memoises its fetch, so this costs nothing after the first screen to ask.
   */
  const [catalogue, setCatalogue] = useState<Peak[] | null>(null);
  useEffect(() => {
    let live = true;
    loadPeakCatalogue()
      .then((rows) => live && setCatalogue(rows))
      .catch(() => live && setCatalogue([]));
    return () => {
      live = false;
    };
  }, []);

  /**
   * The countries actually present, never a fixed world list.
   *
   * Compound entries are split — Mont Blanc is "France / Italy" and Everest is
   * "Nepal / China", so a border peak belongs under both names rather than
   * under a hyphenated one that matches nothing a person would tap.
   */
  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const m of mountains) for (const c of countriesOf(m.country)) set.add(c);
    // Countries the catalogue can answer for, even where no curated objective
    // sits in them — Austria has 759 peaks and not one written page.
    for (const p of catalogue ?? []) if (p.country) set.add(p.country);
    return [...set].sort((a, b) => a.localeCompare(b, "en-GB"));
  }, [mountains, catalogue]);

  /**
   * A selection that is no longer on offer is dropped rather than left to
   * empty the grid in silence — searching "K2" removes France from the
   * options, and a France chip nobody can see would then hide every result.
   */
  useEffect(() => {
    // `catalogue === null` means it has not loaded yet, and half the countries
    // come from it — clearing before then would drop a valid opening choice.
    if (catalogue !== null && country && !countries.includes(country)) setCountry("");
  }, [catalogue, country, countries]);

  /** How many catalogue peaks a country gets before the list is cut. */
  const CATALOGUE_CAP = 60;

  const inCountry = useMemo(() => {
    if (!country) return { list: mountains, total: mountains.length };

    // Curated first: they carry a photograph, a grade and a written route.
    const curated = mountains.filter((m) => countriesOf(m.country).includes(country));
    const seenNames = new Set(curated.map((m) => m.name.toLowerCase()));
    const seenIds = new Set(curated.map((m) => m.curatedId).filter(Boolean));

    /**
     * De-duplicated on the id AND on every alias in the name.
     *
     * An exact-name test is not enough: the catalogue calls the peak
     * "Mont Blanc / Monte Bianco" and the curated record calls it "Mont
     * Blanc", so France listed it twice at two different heights — 4,806 m
     * from the written page and 4,807 m from OSM — which reads as two
     * mountains. `withCurated` already stamps `curatedId` on the catalogue
     * row, so the id is the reliable half and the aliases catch the rest.
     */
    const rest = (catalogue ?? [])
      .filter(
        (p) =>
          p.country === country &&
          !(p.curatedId && seenIds.has(p.curatedId)) &&
          !p.name
            .toLowerCase()
            .split("/")
            .some((alias) => seenNames.has(alias.trim())),
      )
      .sort((a, b) => b.elevationM - a.elevationM);

    return {
      list: [...curated, ...rest.slice(0, CATALOGUE_CAP)],
      total: curated.length + rest.length,
    };
  }, [mountains, catalogue, country]);

  const shown = inCountry.list;

  /** Peaks the filter can never match, because no country is recorded for them. */
  const unplaced = useMemo(
    () => mountains.filter((m) => countriesOf(m.country).length === 0).length,
    [mountains],
  );

  return (
    <>
      {/* Headed like the Treks sub-tab beside it, and for the same reason: the
          grid shows what this screen holds, and the link is the way to the
          whole library — every mountain with its routes, grades and seasons —
          which is no longer a tab on the Explore bar. */}
      <Rise className="flex items-baseline justify-between pt-6">
        <p className="section-label">{searching ? "Matching mountains" : "Explore mountains"}</p>
        <Link
          to="/explore/mountains"
          className="flex items-center gap-0.5 text-[11.5px] text-azure transition-colors hover:text-azure-bright"
        >
          Search all
          <ChevronRight size={13} strokeWidth={1.9} />
        </Link>
      </Rise>

      {countries.length > 1 && (
        <Rise className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
          {["", ...countries].map((c) => (
            <button
              key={c || "all"}
              type="button"
              onClick={() => setCountry(c)}
              aria-pressed={c === country}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-pill border px-3.5 py-1.5 text-[12px] transition-colors",
                c === country
                  ? "border-azure/70 text-azure"
                  : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
              )}
            >
              {c || "Everywhere"}
            </button>
          ))}
        </Rise>
      )}

      {/* The cap is stated rather than left to look like the whole answer. */}
      {country !== "" && inCountry.total > shown.length && (
        <Rise>
          <p className="tnum mt-2.5 text-[11px] leading-relaxed text-mist-dim">
            The {shown.length} highest of {inCountry.total.toLocaleString("en-GB")} peaks recorded
            in {country}. Search for one by name to reach the rest.
          </p>
        </Rise>
      )}

      {/* Said once, where it matters: a peak with no country recorded cannot
          match any of these chips, so it leaves the grid the moment one is
          chosen. Better to name the omission than let a count quietly drop. */}
      {country !== "" && unplaced > 0 && (
        <Rise>
          <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
            {unplaced} {unplaced === 1 ? "peak has" : "peaks have"} no country recorded and cannot
            be placed, so {unplaced === 1 ? "it is" : "they are"} not shown under any location.
          </p>
        </Rise>
      )}

      {shown.length === 0 ? (
        <Rise className="py-8">
          <p className="text-[12.5px] text-mist">
            {loading
              ? "Searching every peak…"
              : country
                ? `No mountain here is in ${country}.`
                : "No mountain matches that."}
          </p>
        </Rise>
      ) : (
        <div className="grid grid-cols-2 gap-3 pt-3">
          {shown.map((m) => (
            <Rise key={m.id}>
              <MountainTile
                mountain={m}
                to={m.curatedId ? `/explore/mountain/${m.curatedId}` : `/explore/peak/${m.id}`}
              />
            </Rise>
          ))}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Treks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * THE SUB-TAB THAT REPLACED "HIKES TO MOUNTAINS".
 *
 * That tab asked OpenStreetMap for named waymarked routes within 30 km of the
 * selected peak, on a live Overpass call per peak, and drew whatever came
 * back. It was honest and close to useless here: the answer was local path
 * fragments ordered by proximity — "Via Alpina Red R118", "R119" — and nobody
 * on an expeditions screen is looking for the nearest waymarked footpath.
 *
 * What belongs here is the walking people can actually name. Same 31 routes
 * the Explore rail carries; `treks/famous.ts` records what that list does and
 * does not claim, and the heading says "Famous" rather than "Top" for exactly
 * that reason.
 */
function TreksTab() {
  return (
    <>
      <Rise className="flex items-baseline justify-between pt-6">
        <p className="section-label">Famous treks</p>
        <Link
          to="/explore/treks"
          className="flex items-center gap-0.5 text-[11.5px] text-azure transition-colors hover:text-azure-bright"
        >
          All {TREKS.length}
          <ChevronRight size={13} strokeWidth={1.9} />
        </Link>
      </Rise>

      <div className="grid grid-cols-2 gap-3 pt-3">
        {FAMOUS_TREKS.map((t) => (
          <Rise key={t.id}>
            <TrekTile trek={t} to={`/explore/trek/${t.id}`} />
          </Rise>
        ))}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The company card                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The company's mark.
 *
 * Every card draws the monogram, because the ruling in `services/operators.ts`
 * is that no listing sets `logo` — see the note on the field there for why.
 * Marks used to point into `public/img/operators`, gitignored since the start
 * and vercelignored only since 2026-09-04; before that they DID leave the
 * designer's machine. Attaching someone else's trademark to a rating ICEFALL
 * invented would pass their mark off as our content, and the sample listings
 * are invented companies, which have no mark to attach. The three real
 * companies named on the Everest list carry facts only — and no mark either.
 *
 * The image path stays supported for the day a real operator uploads their own,
 * and the `onError` fallback stays because a listing whose logo fails to load
 * must not change the shape of the card.
 */
function OperatorMark({ operator, size }: { operator: Operator; size: number }) {
  return <CompanyMark name={operator.name} logoPath={operator.logo} size={size} />;
}

/**
 * One company.
 *
 * THE RATING AND THE TICK ARE GATED, and that is not a detail. The mockup gives
 * every card a verified tick and "4.9 (128 reviews)" against companies that
 * really exist. ICEFALL has no reviews to average and **vets no company**. So
 * both render only for entries carrying `demo: true`, which `SHOW_DEMO_DATA`
 * resolves to false in any ordinary production build.
 *
 * ⚠️ THIS ARGUMENT USED TO CITE `guide_profiles.credentials_verified` being a
 * `CHECK (= false)`, and that citation is now WRONG — the owner approved guide
 * document checking on 2026-08-31 and the column is being dropped entirely.
 * **The conclusion is unchanged and the reason is different.** What ICEFALL now
 * does is read a GUIDE's certificate and record that it did. It still does not
 * vet a COMPANY, still has no reviews, and a tick here would still be a claim
 * nobody made. Do not read "verification exists now" as licence to ungate this.
 *
 * The layout is block-level rather than inline. `truncate` does nothing on an
 * inline element — `overflow` does not apply to one — so the first version of
 * this card let a long certification spill sideways across the column beside it.
 */
function OperatorCard({
  operator,
  subject,
  objective,
  featured = false,
}: {
  operator: Operator;
  subject: ListingSubject;
  objective: EnquiryObjective | undefined;
  featured?: boolean;
}) {
  const showClaims = SHOW_DEMO_OPERATORS && operator.demo === true;
  // Hooks cannot be conditional — resolved always, drawn only when featured.
  // A trek subject carries no coordinates, so this resolves to terrain art,
  // which `useMountainImage` captions as derived rather than photographic.
  const peakImage = useMountainImage(subject);

  /**
   * The enquiry is about the peak ON SCREEN, not the athlete's saved goal.
   *
   * This read `objective ?? {…peak…}`, so someone training for Mont Blanc who
   * searched Everest and tapped a company got an Everest listing that opened a
   * Mont Blanc enquiry. The goal only contributes its id, and only when it is
   * the same mountain — that is what links the enquiry to the objective without
   * overriding what the person was actually looking at.
   */
  const target: EnquiryObjective = {
    peakName: subject.name,
    elevationM: subject.elevationM,
    countries: countriesOf(subject.country),
    goalId: objective?.peakName === subject.name ? objective.goalId : undefined,
  };

  return (
    /*
     * A COMPANY IS A DISTINCT OBJECT, AND ITS DISTINCTNESS IS NOT A RECTANGLE.
     *
     * Every listing used to be a bordered graphite box, so twelve companies
     * read as twelve identical containers and the ONE that is different — the
     * best match, or a pinned placement — could only say so by changing the
     * colour of its outline. That is the commercial layer carried by geometry,
     * which is exactly the thing gilt exists to carry instead.
     *
     * Now: the plain listing is a row on the page, aligned by the company's own
     * mark down the left. The featured one keeps the mountain photograph at
     * full bleed and the gilt pill on it, and the pill is what says why it is
     * first.
     *
     * `gilt-sheen` STAYS, AND IT IS A BAND RATHER THAN A CARD. It runs the full
     * width of the screen now, which is the difference that matters: a wash and
     * a lit top edge across the whole page is a section the page is showing, not
     * an object floating on it. It is the one gesture the rule asks for by name
     * — a paid or promoted position is told apart by COLOUR and a label, never
     * by a rectangle — and it is what lets every other listing here drop its
     * frame without losing the distinction.
     */
    <Link
      to={operatorHref(operator, target)}
      className={cn(
        "block transition-opacity hover:opacity-90",
        featured && "gilt-sheen -mx-5 px-5 pb-1",
      )}
    >
      {/* The banner belongs to the MOUNTAIN, not the company.
          Operators have no cover image in the model, and inventing one — or
          borrowing a photograph from a real company's own marketing — would put
          a picture on this card that nobody involved chose. The peak is what the
          match is about, and its photograph is already ours. */}
      {featured && (
        <div className="relative -mx-5 aspect-[16/6] w-auto">
          <img
            src={peakImage.src}
            alt=""
            aria-hidden
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 scrim-bottom" />
          <p className="absolute bottom-2.5 left-5 inline-flex items-center gap-1.5 rounded-pill border border-gilt/45 bg-obsidian/70 px-2.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.14em] text-gilt-bright backdrop-blur-sm">
            <Star size={9} strokeWidth={0} fill="currentColor" />
            {operator.featured ? "Featured" : `Best match for ${subject.name}`}
          </p>
        </div>
      )}

      <div className="flex items-start gap-3.5 py-3.5">
        <OperatorMark operator={operator} size={featured ? 66 : 58} />

        <div className="min-w-0 flex-1">
          {/* THE TICK NO LONGER SITS BESIDE THE NAME.
              Beside it, the tick meant "ICEFALL has checked this company", which
              is false for every listing in the directory; and structurally it
              forced the name box narrower than its own text — `min-w-0` with
              nothing to truncate it — so a two-word company name overflowed
              underneath it. It now travels inside the demo chip below, where it
              carries the qualification with it and cannot be read on its own. */}
          <p className="min-w-0 text-[13.5px] leading-tight text-snow">{operator.name}</p>

          {/* Certification, not the marketing blurb.
              It is the short, checkable fact this directory exists to show —
              and it fits one line, where the blurb did not. `line-clamp-2` was
              the first attempt and clipped to the WRONG lines: Tailwind v4.2
              emits the unprefixed `line-clamp`, which this engine resolves with
              `display: flow-root` rather than `-webkit-box`. Other screens in
              the app use line-clamp too and are worth a look. */}
          <p className="mt-1 truncate text-[11.5px] leading-snug text-mist-dim">
            {operator.certification}
          </p>

          {/* THE RATING IS NOT ON THE ROW. IT DOES NOT FIT, AND IT SHOULD NOT.
              Measured: this cell is 114px wide on a card with a long name, and
              chip + star + "4.8" + "(96)" needs 135px, so the review count was
              being clipped — the label did not fit its cell, and the rule is to
              shorten the label rather than let it truncate. Shortening it here
              means dropping the invented figure, which is the right thing to
              drop: a star rating on a scannable row in a safety-critical
              directory is the claim a climber acts on fastest and the one this
              screen can least defend. The demo profile still carries the rating
              and the review count, where there is room for them and the notice
              sits beside them.
              The tick rides inside the chip so it cannot be read as "ICEFALL
              checked this company" on its own. */}
          {showClaims && (
            <p className="mt-1.5">
              <Badge tone="alert">
                <BadgeCheck size={10} strokeWidth={2.4} />
                Demo
              </Badge>
            </p>
          )}
        </div>

        <div className="flex w-[84px] shrink-0 flex-col items-end gap-0.5 text-right">
          {operator.priceFromEur != null && (
            <p className="tnum whitespace-nowrap text-[11.5px] text-snow">
              From {fmtPrice(operator.priceFromEur)}
            </p>
          )}
          <p className="w-full truncate text-[11px] text-mist-dim">
            {operator.coverage ?? operator.certification}
          </p>
          <p className="tnum text-[11px] text-mist-dim">{fmtElevation(subject.elevationM)} m</p>
        </div>

        <ChevronRight
          size={15}
          strokeWidth={1.7}
          className="-mr-0.5 mt-1 shrink-0 self-start text-mist-dim"
        />
      </div>
    </Link>
  );
}

/**
 * Which listing goes in the highlighted slot.
 *
 * ORGANIC, AND NOT FOR SALE. It is the listing that covers this peak most
 * specifically: one that names the mountain among the ground it works, else the
 * one whose minimum working altitude sits closest beneath the summit — a
 * company that operates from 5,000 m is a better answer for Everest than one
 * that starts at sea level. No commercial relationship exists, and if a
 * promoted slot is ever sold it must be labelled and kept OUT of this ranking;
 * a paid position says nothing about a qualification, and this is a directory
 * people choose a mountain partner from.
 */
function bestMatchFor(list: Operator[], subject: ListingSubject): Operator | undefined {
  if (list.length === 0) return undefined;
  const named = list.find((o) => o.popularObjectives?.some((p) => p.includes(subject.name)));
  if (named) return named;

  const capable = list.filter((o) => o.minElevationM <= subject.elevationM);
  const pool = capable.length > 0 ? capable : list;
  return [...pool].sort((a, b) => b.minElevationM - a.minElevationM)[0];
}

/* -------------------------------------------------------------------------- */
/* Hikes to mountains                                                         */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Invitations                                                                */
/* -------------------------------------------------------------------------- */

function InvitationsTab() {
  return (
    <>
      <Rise className="pt-8">
        <div>
          <p className="text-[21px] font-light text-snow">Nothing can invite you here</p>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">
            Invitations need two things ICEFALL does not have: accounts on a server, and operators
            connected to it. Until both exist this tab stays empty — an invitation from a company
            ICEFALL cannot identify would be worth less than nothing.
          </p>
          <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
            If you are approached by an operator claiming ICEFALL sent them, it did not. Verify the
            company through its national guides association before you reply.
          </p>
        </div>
      </Rise>
      <Rise className="pt-4">
        <Disclaimer>
          Your enquiries are never shared. Nothing you write on this screen leaves the device, so no
          operator has your name, your dates or your objective.
        </Disclaimer>
      </Rise>
    </>
  );
}

function CompanyRow({
  operator,
  objective,
}: {
  operator: Operator;
  objective: EnquiryObjective | undefined;
}) {
  return (
    /* A row, aligned by the company's mark — the same treatment the directory
       listing takes. See the note on `OperatorCard`. */
    <div className="border-t border-hairline pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3.5">
        {/* The same component as the directory card. This was a hand-rolled
            monogram, so a company could appear with one set of initials here
            and another two screens away. */}
        <CompanyMark name={operator.name} logoPath={operator.logo} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug text-snow">{operator.name}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-mist">{operator.certification}</p>
          <p className="tnum mt-1.5 text-[11px] text-mist-dim">
            {operator.responseHours !== undefined &&
              `Typically replies within ${operator.responseHours} h · `}
            {operator.minElevationM > 0
              ? `from ${fmtElevation(operator.minElevationM)} m`
              : "any altitude"}
          </p>
        </div>
        {objective && (
          <Link
            to={operatorHref(operator, objective)}
            aria-label={`View ${operator.name}`}
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline text-mist transition-colors hover:border-azure/50 hover:text-azure"
          >
            <MessageSquare size={15} strokeWidth={1.7} />
          </Link>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A disclaimer at reading size. The two service disclaimers are the most
 * important sentences on this screen, so they are not set as footnotes.
 */
function Notice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    /* The app's own note treatment: one rule in the accent down the left,
       never a tinted rectangle. These are the most important sentences on the
       screen and a wash of blue behind them made them read as chrome. */
    <div className="border-l border-azure/40 pl-3.5">
      <p className="section-label text-azure/70">{label}</p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-snow/85">{children}</p>
    </div>
  );
}

/** Three things that are true. No verification claim appears among them. */
function TrustStrip() {
  const items = [
    {
      icon: <ShieldOff size={15} strokeWidth={1.6} />,
      title: "ICEFALL does not vet operators",
      body: "No company here is checked, endorsed or paid for, and ICEFALL takes no part in a booking. The judgement stays with you.",
    },
    {
      icon: <MountainIcon size={15} strokeWidth={1.6} />,
      title: "Insist on IFMGA/UIAGM",
      body: "The only internationally recognised mountain guide qualification. Ask for the guide's carnet, and verify it with the national association.",
    },
    {
      icon: <Smartphone size={15} strokeWidth={1.6} />,
      title: "Enquiries stay on this device",
      body: "No operator network is connected, so nothing you write is transmitted and no reply will arrive.",
    },
  ];

  return (
    /* Three things that are true, set as three statements with air between
       them. The outline said "these belong together", which the spacing says
       already; one hairline per real division is what is left. */
    <div>
      {items.map((it, i) => (
        <div key={it.title} className={cn("flex gap-3 py-4", i > 0 && "border-t border-hairline")}>
          <span className="mt-0.5 shrink-0 text-mist-dim">{it.icon}</span>
          <div className="min-w-0">
            <p className="text-[13px] text-snow/90">{it.title}</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-mist">{it.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Expedition detail — /explore/expeditions/:id                                     */
/* -------------------------------------------------------------------------- */

/**
 * The fixture expeditions carry invented operator names and an indicative
 * price. Neither is presented as an offer here: the operator block has been
 * replaced with the same honest module the directory uses — permit authority,
 * sample listings, the questions to ask — and the figures are labelled as
 * illustrative, because ICEFALL sells nothing and takes no payment.
 */
export function ExpeditionDetail() {
  const { id } = useParams<{ id: string }>();
  const { goals } = useApp();
  const exp = id ? sync.expeditionById(id) : undefined;

  const mountain = exp ? sync.mountainById(exp.mountainId) : undefined;
  const countries = countriesOf(mountain?.country);
  const goal = exp ? goals.find((g) => g.mountainId === exp.mountainId) : undefined;

  const listings = useMemo(() => {
    if (!exp) return [];
    // A summit can straddle a border ("Nepal / China"), and each side has its
    // own permits — ask the model for both, then dedupe.
    const byId = new Map<string, Operator>();
    const scopes: (string | undefined)[] =
      countriesOf(mountain?.country).length > 0 ? countriesOf(mountain?.country) : [undefined];
    for (const country of scopes) {
      for (const o of operatorsFor({ country, elevationM: exp.elevationM })) byId.set(o.id, o);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  }, [exp, mountain]);

  if (!exp) return <Navigate to="/explore/expeditions" replace />;

  const objective: EnquiryObjective = {
    peakName: mountain?.name ?? exp.name,
    elevationM: exp.elevationM,
    goalId: goal?.id,
    countries,
  };

  const questions = accessFor({ requiresGuide: true, elevationM: exp.elevationM }).notes;
  const authority = countries
    .map((country) => ({
      country,
      access: accessFor({ country, requiresGuide: true, elevationM: exp.elevationM }),
    }))
    .filter((a) => a.access.authority);

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title={exp.name} subtitle={exp.difficultyLabel} />
      </div>

      <Stagger className="px-5">
        <Rise>
          <HeroImage src={exp.photo} alt={exp.name} ratio="aspect-[16/10]">
            <div className="tnum text-[30px] font-extralight leading-none text-snow">
              {fmtElevation(exp.elevationM)}
              <span className="ml-1 text-[13px] font-light text-mist">m</span>
            </div>
          </HeroImage>
        </Rise>

        <Rise className="pt-5">
          <p className="text-[13px] leading-relaxed text-mist">{exp.summary}</p>
        </Rise>

        <Rise className="pt-8">
          {/* The facts of the trip, as a definition list on the page. What
              makes them a group is the air above them and the hairline under
              them, not a rectangle. */}
          <div>
            <dl className="space-y-3 text-[13px]">
              <Row label="Duration" value={exp.durationLabel} />
              <Row label="Season" value={exp.seasons.join(", ")} />
              <Row label="Difficulty" value={`${exp.difficulty} / 5 · ${exp.difficultyLabel}`} />
              <Row label="Indicative cost" value={`from ${fmtPrice(exp.priceFromEur)}`} />
            </dl>
            {/* Not a price: nobody is selling this. Real quotes vary by season,
                ratio and what the operator excludes. */}
            <p className="mt-4 border-t border-hairline pt-3.5 text-[11px] leading-relaxed text-mist-dim">
              Illustrative figures for planning only. ICEFALL sells nothing, takes no payment and
              holds no departure dates — a real quote comes from the operator you choose.
            </p>
          </div>
        </Rise>

        <Rise className="pt-8">
          <SectionLabel>Required experience</SectionLabel>
          <p className="mt-3 text-[13px] leading-relaxed text-mist">{exp.requiredExperience}</p>
        </Rise>

        <Rise className="pt-8">
          <SectionLabel>Prerequisites</SectionLabel>
          <div className="mt-3.5">
            <ul className="space-y-2.5">
              {exp.prerequisites.map((p) => (
                <li key={p} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </Rise>

        {authority.length > 0 && (
          <Rise className="pt-8">
            <SectionLabel>Permit authority</SectionLabel>
            <div className="mt-3.5">
              {authority.map((a) => (
                <div
                  key={a.country}
                  className="border-t border-hairline pt-4 first:border-t-0 first:pt-0"
                >
                  <p className="section-label">{a.country}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-snow/85">
                    {a.access.authority}
                  </p>
                  {a.access.authorityNote && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                      {a.access.authorityNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Rise>
        )}

        <Rise className="pt-8">
          <SectionLabel>Operators</SectionLabel>
          <div className="mt-3.5">
            {listings.map((o) => (
              <CompanyRow key={o.id} operator={o} objective={objective} />
            ))}
          </div>
          <Disclaimer className="mt-4">{OPERATOR_DISCLAIMER}</Disclaimer>
          {SHOW_DEMO_OPERATORS && <Disclaimer className="mt-3">{DEMO_NOTICE}</Disclaimer>}
        </Rise>

        <Rise className="pt-8">
          <SectionLabel>Ask before you book</SectionLabel>
          <div className="mt-3.5">
            <ul className="space-y-3">
              {questions.map((q) => (
                <li key={q} className="flex gap-3 text-[12.5px] leading-relaxed text-mist">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                  {q}
                </li>
              ))}
            </ul>
          </div>
        </Rise>

        <Rise className="pt-6">
          <a
            href={operatorSearchUrl(objective.peakName)}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2.5 py-3.5 text-[13px] text-mist transition-colors hover:text-snow"
          >
            <ExternalLink size={15} strokeWidth={1.6} className="shrink-0" />
            <span className="flex-1">Search certified operators for {objective.peakName}</span>
          </a>
          <Disclaimer className="mt-4">{ACCESS_DISCLAIMER}</Disclaimer>
        </Rise>

        <Rise className="pt-5">
          <Disclaimer>
            High-altitude mountaineering carries a genuine risk of serious injury and death. Medical
            clearance, appropriate insurance and honest self-assessment are your responsibility, and
            the operator's judgement on the mountain is final.
          </Disclaimer>
        </Rise>

        <Rise className="pt-6">
          <TrustStrip />
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-mist-dim">{label}</dt>
      <dd className="text-right text-snow">{value}</dd>
    </div>
  );
}
