import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
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

import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
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
  operatorsFor,
  type Operator,
} from "@/services/operators";
import { NETWORK_LABEL, nearbyTrails, type Trail } from "@/services/trails";
import { TrailImage } from "@/components/domain/TrailImage";
import { searchPeaks, type Peak } from "@/services/peaks";
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
function monogram(name: string): string {
  const head = name.split("—")[0] ?? name;
  const words = head.split(/[^A-Za-z]+/).filter(Boolean);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

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

type TabId = "explore" | "mountains" | "hikes";

const TABS: readonly { id: TabId; label: string }[] = [
  { id: "explore", label: "Explore" },
  { id: "mountains", label: "Mountains" },
  { id: "hikes", label: "Hikes to mountains" },
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
}));

export default function Expeditions() {
  const goal = usePrimaryGoal();
  const [tab, setTab] = useState<TabId>("explore");
  const [query, setQuery] = useState("");
  const [peakId, setPeakId] = useState<string>(
    goal?.mountainId ? `curated:${goal.mountainId}` : `curated:${DEFAULT_PEAK}`,
  );
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

  const shownMountains = needle.length >= 2 ? (found ?? []) : CURATED_PEAKS;

  /**
   * The peak in focus.
   *
   * Typing a mountain's name selects it, which is the whole interaction: the
   * search box is how you change what "expeditions on …" is about, rather than
   * a filter applied on top of a selection made somewhere else.
   */
  const peak = useMemo(() => {
    if (needle && shownMountains.length > 0) return shownMountains[0];
    return CURATED_PEAKS.find((m) => m.id === peakId) ?? CURATED_PEAKS[0];
  }, [needle, shownMountains, peakId]);

  /** Every company that works this peak's country at this altitude. */
  const listings = useMemo(() => {
    if (!peak) return [];
    const byId = new Map<string, Operator>();
    const scopes: (string | undefined)[] =
      countriesOf(peak.country).length > 0 ? countriesOf(peak.country) : [undefined];
    for (const country of scopes) {
      for (const o of operatorsFor({ country, elevationM: peak.elevationM })) byId.set(o.id, o);
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
  }, [peak, needle, shownMountains.length]);

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
            peak={peak}
            mountains={shownMountains}
            selectedId={peak?.id}
            onSelect={(id) => {
              setPeakId(id);
              setQuery("");
            }}
            listings={listings}
            objective={objective}
            searching={needle !== ""}
            loading={loadingPeaks}
          />
        )}

        {tab === "mountains" && <MountainsTab mountains={shownMountains} loading={loadingPeaks} />}

        {tab === "hikes" && <HikesTab peak={peak} />}
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Explore                                                                    */
/* -------------------------------------------------------------------------- */

function ExploreTab({
  peak,
  mountains,
  selectedId,
  onSelect,
  listings,
  objective,
  searching,
  loading,
}: {
  peak: Peak | undefined;
  mountains: Peak[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  listings: Operator[];
  objective: EnquiryObjective | undefined;
  searching: boolean;
  loading: boolean;
}) {
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
        <Rise className="pt-3">
          <Card>
            <p className="text-[12.5px] text-mist">
              {loading ? "Searching every peak…" : "No mountain matches that."}
            </p>
          </Card>
        </Rise>
      ) : (
        <Rise className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5">
          {mountains.map((m) => (
            <MountainTile
              key={m.id}
              mountain={m}
              selected={m.id === selectedId}
              onSelect={() => onSelect(m.id)}
            />
          ))}
        </Rise>
      )}

      {/* ---- The companies ---------------------------------------------- */}
      {peak && (
        <>
          <Rise className="pt-8">
            <p className="section-label">Expeditions on {peak.name}</p>
            <p className="mt-1.5 text-[12px] text-mist-dim">
              {listings.length === 0
                ? "No listing covers this peak."
                : `${listings.length} ${listings.length === 1 ? "company" : "companies"} offering expeditions`}
            </p>
          </Rise>

          <div className="mt-3 space-y-2.5">
            {(() => {
              // The best match is lifted out and shown first, highlighted; the
              // rest keep their alphabetical order underneath it.
              const best = bestMatchFor(listings, peak);
              const rest = listings.filter((o) => o.id !== best?.id);
              return (
                <>
                  {best && (
                    <Rise key={best.id}>
                      <OperatorCard operator={best} peak={peak} objective={objective} featured />
                    </Rise>
                  )}
                  {rest.map((o) => (
                    <Rise key={o.id}>
                      <OperatorCard operator={o} peak={peak} objective={objective} />
                    </Rise>
                  ))}
                </>
              );
            })()}
          </div>

          <Rise className="pt-3.5">
            <p className="text-[10.5px] leading-relaxed text-mist-dim">
              Ordered on how specifically a listing covers {peak.name} — the ground it works and
              the altitude it works at. No position here is for sale, and ICEFALL takes no part in
              a booking.
            </p>
          </Rise>

          <Rise className="pt-5">
            <Disclaimer>{OPERATOR_DISCLAIMER}</Disclaimer>
            {SHOW_DEMO_OPERATORS && <Disclaimer className="mt-3">{DEMO_NOTICE}</Disclaimer>}
          </Rise>
        </>
      )}

      <Rise className="pt-8">
        <TrustStrip />
      </Rise>
    </>
  );
}

/** A peak in the horizontal rail — photo, name, height. */
function MountainTile({
  mountain,
  selected,
  onSelect,
}: {
  mountain: Peak;
  selected: boolean;
  onSelect: () => void;
}) {
  // `useMountainImage` returns { src, real } — `real: false` means it fell back
  // to generated terrain art rather than a photograph of this peak.
  const image = useMountainImage(mountain);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative w-[128px] shrink-0 overflow-hidden rounded-card border text-left transition-colors",
        selected ? "border-azure/70" : "border-hairline hover:border-hairline-strong",
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
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* The company card                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The company's mark.
 *
 * Every card now draws the monogram, because no listing carries a logo. The
 * four demo entries used to point at four real businesses' marks in
 * `public/img/operators` — gitignored and vercelignored, so they never left the
 * designer's machine — and attaching someone else's trademark to a rating
 * ICEFALL invented would have passed their mark off as our content. The
 * companies are invented now and an invented company has no mark.
 *
 * The image path stays supported for the day a real operator uploads their own,
 * and the `onError` fallback stays because a listing whose logo fails to load
 * must not change the shape of the card.
 */
function OperatorMark({ operator, size }: { operator: Operator; size: number }) {
  const [failed, setFailed] = useState(false);
  const showLogo = Boolean(operator.logo) && !failed;

  return (
    <div
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center overflow-hidden rounded-tile border border-hairline bg-elevated"
    >
      {showLogo ? (
        <img
          src={operator.logo}
          alt=""
          aria-hidden
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-1.5"
        />
      ) : (
        <span className="text-[14px] tracking-[0.06em] text-mist">{monogram(operator.name)}</span>
      )}
    </div>
  );
}

/**
 * One company.
 *
 * THE RATING AND THE TICK ARE GATED, and that is not a detail. The mockup gives
 * every card a verified tick and "4.9 (128 reviews)" against companies that
 * really exist. ICEFALL has no reviews to average and vets nobody —
 * `guide_profiles.credentials_verified` is a `CHECK (= false)` in the schema for
 * the same reason. So both render only for entries carrying `demo: true`, which
 * `SHOW_DEMO_DATA` resolves to false in any ordinary production build.
 *
 * The layout is block-level rather than inline. `truncate` does nothing on an
 * inline element — `overflow` does not apply to one — so the first version of
 * this card let a long certification spill sideways across the column beside it.
 */
function OperatorCard({
  operator,
  peak,
  objective,
  featured = false,
}: {
  operator: Operator;
  peak: Peak;
  objective: EnquiryObjective | undefined;
  featured?: boolean;
}) {
  const showClaims = SHOW_DEMO_OPERATORS && operator.demo === true;
  // Hooks cannot be conditional — resolved always, drawn only when featured.
  const peakImage = useMountainImage(peak);

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
    peakName: peak.name,
    elevationM: peak.elevationM,
    countries: countriesOf(peak.country),
    goalId: objective?.peakName === peak.name ? objective.goalId : undefined,
  };

  return (
    <Link
      to={operatorHref(operator, target)}
      className={cn(
        "block overflow-hidden rounded-card border transition-colors",
        featured
          ? "gilt-sheen border-gilt/45 bg-graphite hover:border-gilt/75"
          : "border-hairline bg-graphite hover:border-hairline-strong",
      )}
    >
      {/* The banner belongs to the MOUNTAIN, not the company.
          Operators have no cover image in the model, and inventing one — or
          borrowing a photograph from a real company's own marketing — would put
          a picture on this card that nobody involved chose. The peak is what the
          match is about, and its photograph is already ours. */}
      {featured && (
        <div className="relative aspect-[16/6] w-full">
          <img
            src={peakImage.src}
            alt=""
            aria-hidden
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 scrim-bottom" />
          <p className="absolute bottom-2.5 left-3 inline-flex items-center gap-1.5 rounded-pill border border-gilt/45 bg-obsidian/70 px-2.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.14em] text-gilt-bright backdrop-blur-sm">
            <Star size={9} strokeWidth={0} fill="currentColor" />
            Best match for {peak.name}
          </p>
        </div>
      )}

      <div className="flex items-start gap-3 p-3.5">
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
            <p className="tnum whitespace-nowrap text-[11.5px] text-snow">From {fmtPrice(operator.priceFromEur)}</p>
          )}
          <p className="w-full truncate text-[11px] text-mist-dim">
            {operator.coverage ?? operator.certification}
          </p>
          <p className="tnum text-[11px] text-mist-dim">{fmtElevation(peak.elevationM)} m</p>
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
function bestMatchFor(list: Operator[], peak: Peak): Operator | undefined {
  if (list.length === 0) return undefined;
  const named = list.find((o) => o.popularObjectives?.some((p) => p.includes(peak.name)));
  if (named) return named;

  const capable = list.filter((o) => o.minElevationM <= peak.elevationM);
  const pool = capable.length > 0 ? capable : list;
  return [...pool].sort((a, b) => b.minElevationM - a.minElevationM)[0];
}

/* -------------------------------------------------------------------------- */
/* Mountains                                                                  */
/* -------------------------------------------------------------------------- */

function MountainsTab({ mountains, loading }: { mountains: Peak[]; loading: boolean }) {
  if (mountains.length === 0) {
    return (
      <Rise className="pt-6">
        <Card>
          <p className="text-[12.5px] text-mist">
            {loading ? "Searching every peak…" : "No mountain matches that."}
          </p>
        </Card>
      </Rise>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 pt-6">
      {mountains.map((m) => (
        <Rise key={m.id}>
          <Link
            to={m.curatedId ? `/explore/mountain/${m.curatedId}` : `/explore/peak/${m.id}`}
            className="block"
          >
            <MountainTile mountain={m} selected={false} onSelect={() => {}} />
          </Link>
        </Rise>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hikes to mountains                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The walk-in.
 *
 * Every expedition on this screen starts with days of approach, and those are
 * ordinary waymarked paths that OpenStreetMap already holds — so this tab is
 * real data about the real ground around the peak, not another directory. It is
 * the one thing on this screen that needs no company to exist.
 */
/**
 * Which paths are worth showing beside an expedition.
 *
 * Somebody researching who to climb a mountain with wants the named approaches
 * and the long-distance routes that reach it — not the 400 m link path between
 * two car parks, which is what "nearest first" surfaces around any trailhead in
 * the Alps. So a local walking network (`lwn`) is dropped outright, a trail
 * needs a name to be worth a card, and a broken or missing measurement means it
 * cannot be judged and is left out too.
 */
function isResearchWorthy(t: Trail): boolean {
  if (t.network === "lwn") return false;
  if (t.name.trim() === "") return false;
  if (t.lengthBroken === true || t.lengthKm == null) return false;
  return true;
}

function HikesTab({ peak }: { peak: Peak | undefined }) {
  const [trails, setTrails] = useState<Trail[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!peak) return;
    let live = true;
    setTrails(null);
    setFailed(false);

    nearbyTrails(peak.lat, peak.lon, {
      radiusM: 30_000,
      // Ask for plenty, because the filter below throws most of them away.
      limit: 40,
      rank: "significant",
    })
      .then((found: Trail[]) => {
        if (live) setTrails(found.filter(isResearchWorthy).slice(0, 8));
      })
      .catch(() => live && setFailed(true));

    return () => {
      live = false;
    };
  }, [peak]);

  if (!peak) return null;

  return (
    <>
      <Rise className="pt-6">
        <p className="section-label">Approaches to {peak.name}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
          Named and waymarked routes within 30 km, from OpenStreetMap. These are the walk-ins and
          long-distance routes that reach the mountain — not the climb itself.
        </p>
      </Rise>

      {failed && (
        <Rise className="pt-4">
          <Card>
            <p className="text-[12.5px] text-mist">
              Couldn't reach the trail database. Try again in a moment.
            </p>
          </Card>
        </Rise>
      )}

      {trails === null && !failed && (
        <Rise className="pt-4">
          <Card>
            <p className="text-[12.5px] text-mist-dim">Looking for routes around {peak.name}…</p>
          </Card>
        </Rise>
      )}

      {trails?.length === 0 && (
        <Rise className="pt-4">
          <Card>
            <p className="text-[12.5px] leading-relaxed text-mist">
              No named route within 30 km of {peak.name} is recorded with a usable length. The local
              paths around it were left out rather than padding this list.
            </p>
          </Card>
        </Rise>
      )}

      <div className="mt-3 space-y-3">
        {trails?.map((t) => (
          <Rise key={t.id}>
            <HikeCard trail={t} peak={peak} />
          </Rise>
        ))}
      </div>
    </>
  );
}

/**
 * A hike, drawn the way Explore draws one.
 *
 * `TrailImage` is the same three-layer component the Find tab uses — contour
 * plate first so the card is never blank, satellite over it, and a verified
 * photograph on top if Wikidata vouches for this exact relation. Deliberately a
 * SMALLER card than Find's: that one carries a distance-away badge and a
 * directions control which make sense when you are standing somewhere choosing
 * a walk, and make none when you are reading about an expedition company.
 */
function HikeCard({ trail, peak }: { trail: Trail; peak: Peak }) {
  const [caption, setCaption] = useState("Contours — no verified photograph of this trail");

  /**
   * The peak travels with the link.
   *
   * A `Trail` records no country and no summit altitude, so the trail page has
   * nothing to match a guiding company against on its own — and matching on
   * altitude alone would list companies with no connection to where the path
   * is. Arriving from an expedition carries that context along, and the trail
   * page shows companies only when it has it.
   */
  const href = `/explore/trail/${trail.osmId}?${new URLSearchParams({
    peak: peak.name,
    elevation: String(peak.elevationM),
    ...(peak.country !== undefined ? { country: peak.country } : {}),
  }).toString()}`;

  return (
    <Link to={href} className="block">
      <div className="overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-hairline-strong">
        <div className="relative h-[124px] bg-slate">
          <TrailImage
            osmId={trail.osmId}
            lat={trail.lat}
            lon={trail.lon}
            name={trail.name}
            onCaption={setCaption}
            className="absolute inset-0 h-full w-full"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-graphite/95 via-transparent to-obsidian/40" />

          {trail.network !== undefined && (
            <span className="absolute left-3 top-3 rounded-pill border border-hairline-strong bg-obsidian/75 px-2.5 py-1 text-[10.5px] text-snow backdrop-blur">
              {NETWORK_LABEL[trail.network]}
            </span>
          )}
          {trail.ref !== undefined && /[a-z]/i.test(trail.ref) && (
            <span className="absolute right-3 top-3 rounded-pill border border-azure/45 bg-obsidian/75 px-2.5 py-1 text-[10.5px] text-azure backdrop-blur">
              {trail.ref}
            </span>
          )}
          <span className="absolute bottom-2.5 left-3 right-3 truncate text-[10px] text-mist">
            {caption}
          </span>
        </div>

        <div className="flex items-center gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] leading-snug text-snow">{trail.name}</h3>
            <p className="tnum mt-1 text-[11.5px] text-mist-dim">
              {trail.lengthKm != null ? `${trail.lengthKm.toFixed(1)} km` : "Length not recorded"}
            </p>
          </div>
          <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
        </div>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Invitations                                                                */
/* -------------------------------------------------------------------------- */

function InvitationsTab() {
  return (
    <>
      <Rise className="pt-5">
        <Card>
          <p className="text-[14px] font-light text-snow">Nothing can invite you here</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
            Invitations need two things ICEFALL does not have: accounts on a server, and operators
            connected to it. Until both exist this tab stays empty — an invitation from a company
            ICEFALL cannot identify would be worth less than nothing.
          </p>
          <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
            If you are approached by an operator claiming ICEFALL sent them, it did not. Verify the
            company through its national guides association before you reply.
          </p>
        </Card>
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
    <Card>
      <div className="flex items-start gap-3.5">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-tile border border-hairline bg-elevated/40 text-[13px] font-light tracking-[0.08em] text-mist"
          aria-hidden="true"
        >
          {monogram(operator.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug text-snow">{operator.name}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-mist">{operator.certification}</p>
          <p className="tnum mt-1.5 text-[11px] text-mist-dim">
            Typically replies within {operator.responseHours} h ·{" "}
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
    </Card>
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
    <div className="rounded-card border border-azure/20 bg-azure/[0.04] p-4">
      <p className="section-label text-azure/70">{label}</p>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-snow/85">{children}</p>
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
    <div className="rounded-card border border-hairline bg-graphite">
      {items.map((it, i) => (
        <div key={it.title} className={cn("flex gap-3 p-4", i > 0 && "border-t border-hairline")}>
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

        <Rise className="pt-6">
          <Card>
            <dl className="space-y-3 text-[13px]">
              <Row label="Duration" value={exp.durationLabel} />
              <Row label="Season" value={exp.seasons.join(", ")} />
              <Row label="Difficulty" value={`${exp.difficulty} / 5 · ${exp.difficultyLabel}`} />
              <Row label="Indicative cost" value={`from ${fmtPrice(exp.priceFromEur)}`} />
            </dl>
            {/* Not a price: nobody is selling this. Real quotes vary by season,
                ratio and what the operator excludes. */}
            <p className="mt-3.5 text-[11px] leading-relaxed text-mist-dim">
              Illustrative figures for planning only. ICEFALL sells nothing, takes no payment and
              holds no departure dates — a real quote comes from the operator you choose.
            </p>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Required experience</SectionLabel>
          <Card className="mt-3">
            <p className="text-[13px] leading-relaxed text-mist">{exp.requiredExperience}</p>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Prerequisites</SectionLabel>
          <Card className="mt-3">
            <ul className="space-y-2.5">
              {exp.prerequisites.map((p) => (
                <li key={p} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                  {p}
                </li>
              ))}
            </ul>
          </Card>
        </Rise>

        {authority.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Permit authority</SectionLabel>
            <div className="mt-3 space-y-2.5">
              {authority.map((a) => (
                <Card key={a.country}>
                  <p className="section-label">{a.country}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-snow/85">
                    {a.access.authority}
                  </p>
                  {a.access.authorityNote && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                      {a.access.authorityNote}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </Rise>
        )}

        <Rise className="pt-6">
          <SectionLabel>Operators</SectionLabel>
          <div className="mt-3 space-y-2.5">
            {listings.map((o) => (
              <CompanyRow key={o.id} operator={o} objective={objective} />
            ))}
          </div>
          <Disclaimer className="mt-4">{OPERATOR_DISCLAIMER}</Disclaimer>
          {SHOW_DEMO_OPERATORS && <Disclaimer className="mt-3">{DEMO_NOTICE}</Disclaimer>}
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Ask before you book</SectionLabel>
          <Card className="mt-3">
            <ul className="space-y-3">
              {questions.map((q) => (
                <li key={q} className="flex gap-3 text-[12.5px] leading-relaxed text-mist">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                  {q}
                </li>
              ))}
            </ul>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <a
            href={operatorSearchUrl(objective.peakName)}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2.5 rounded-card border border-hairline bg-graphite px-4 py-3.5 text-[13px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
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
