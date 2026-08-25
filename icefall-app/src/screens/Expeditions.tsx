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
  OPERATOR_DISCLAIMER,
  SHOW_DEMO_OPERATORS,
  allOperators,
  operatorsFor,
  type Operator,
} from "@/services/operators";
import { nearbyTrails, type Trail } from "@/services/trails";
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
 * gave, can end up on a glacier with the wrong people. So this screen renders
 * only what `operators.ts` actually holds — sample listings, each named as a
 * sample — and refuses, individually and on purpose:
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
function enquiryHref(operator: Operator, objective: EnquiryObjective): string {
  const params = new URLSearchParams({
    operator: operator.id,
    peak: objective.peakName,
    elevation: String(objective.elevationM),
  });
  if (objective.goalId) params.set("goal", objective.goalId);
  return `/inbox/new?${params.toString()}`;
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

export default function Expeditions() {
  const goal = usePrimaryGoal();
  const [tab, setTab] = useState<TabId>("explore");
  const [query, setQuery] = useState("");
  const [peakId, setPeakId] = useState<string>(goal?.mountainId ?? DEFAULT_PEAK);

  const mountains = sync.mountains;
  const needle = query.trim().toLowerCase();

  /** Peaks matching the search — and the rail when nothing is typed. */
  const shownMountains = useMemo(() => {
    if (!needle) return mountains;
    return mountains.filter((m) =>
      [m.name, m.range, m.country, m.difficultyLabel].some((f) =>
        f?.toLowerCase().includes(needle),
      ),
    );
  }, [mountains, needle]);

  /**
   * The peak in focus.
   *
   * Typing a mountain's name selects it, which is the whole interaction: the
   * search box is how you change what "expeditions on …" is about, rather than
   * a filter applied on top of a selection made somewhere else.
   */
  const peak = useMemo(() => {
    if (needle && shownMountains.length > 0) return shownMountains[0];
    return mountains.find((m) => m.id === peakId) ?? mountains[0];
  }, [needle, shownMountains, mountains, peakId]);

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
            to="/messages"
            aria-label="Messages"
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
          />
        )}

        {tab === "mountains" && <MountainsTab mountains={shownMountains} />}

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
}: {
  peak: Mountain | undefined;
  mountains: Mountain[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  listings: Operator[];
  objective: EnquiryObjective | undefined;
  searching: boolean;
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
            <p className="text-[12.5px] text-mist">No mountain matches that.</p>
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
            {listings.map((o) => (
              <Rise key={o.id}>
                <OperatorCard operator={o} peak={peak} objective={objective} />
              </Rise>
            ))}
          </div>

          <Rise className="pt-5">
            <Disclaimer>{OPERATOR_DISCLAIMER}</Disclaimer>
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
  mountain: Mountain;
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
 * One company, laid out as the mockup draws it: mark, name, one line about
 * them, then price / coverage / peak down the right.
 *
 * THE RATING AND THE TICK ARE GATED, and that is not a detail.
 *
 * The mockup shows every card with a verified tick and "4.9 ★ (128 reviews)"
 * against companies that really exist. ICEFALL has no reviews to average and
 * vets nobody — `guide_profiles.credentials_verified` is a `CHECK (= false)` in
 * the schema for the same reason. Publishing an invented rating and a
 * verification badge against a named business is a commercial claim about a
 * real company that nobody made and nobody can check, and someone choosing who
 * to follow onto a glacier is the last person who should be reading one.
 *
 * So both render only for entries carrying `demo: true`, which `SHOW_DEMO_DATA`
 * resolves to false in any ordinary production build. In development the card
 * is pixel-for-pixel the mockup; shipped, it shows what is actually known.
 */
function OperatorCard({
  operator,
  peak,
  objective,
}: {
  operator: Operator;
  peak: Mountain;
  objective: EnquiryObjective | undefined;
}) {
  const showClaims = SHOW_DEMO_OPERATORS && operator.demo === true;
  const target: EnquiryObjective = objective ?? {
    peakName: peak.name,
    elevationM: peak.elevationM,
    countries: countriesOf(peak.country),
  };

  return (
    <Link
      to={enquiryHref(operator, target)}
      className="flex gap-3.5 rounded-card border border-hairline bg-graphite p-3.5 transition-colors hover:border-hairline-strong"
    >
      {/* The mark. Real companies' logos are gitignored and never shipped, so
          this is a monogram — their trademarks do not sit on ICEFALL's server. */}
      <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-tile border border-hairline bg-elevated text-[13px] tracking-[0.06em] text-mist">
        {monogram(operator.name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-1.5">
          <span className="text-[14px] leading-tight text-snow">{operator.name}</span>
          {showClaims && (
            <BadgeCheck size={13} strokeWidth={2} className="mt-px shrink-0 text-azure" />
          )}
        </span>

        <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">
          {operator.blurb ?? operator.certification}
        </span>

        {showClaims && operator.rating != null && (
          <span className="mt-1.5 flex items-center gap-1.5">
            <Star size={11} strokeWidth={0} fill="currentColor" className="text-azure" />
            <span className="tnum text-[11.5px] text-snow">{operator.rating.toFixed(1)}</span>
            <span className="tnum text-[11px] text-mist-dim">({operator.reviewCount})</span>
          </span>
        )}
      </span>

      <span className="flex w-[104px] shrink-0 flex-col items-end gap-0.5 text-right">
        {operator.priceFromEur != null && (
          <span className="tnum text-[12px] text-snow">From {fmtPrice(operator.priceFromEur)}</span>
        )}
        <span className="truncate text-[11px] text-mist-dim">
          {operator.coverage ?? operator.certification}
        </span>
        <span className="tnum text-[11px] text-mist-dim">{fmtElevation(peak.elevationM)} m</span>
      </span>

      <ChevronRight size={16} strokeWidth={1.7} className="mt-4 shrink-0 self-start text-mist-dim" />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Mountains                                                                  */
/* -------------------------------------------------------------------------- */

function MountainsTab({ mountains }: { mountains: Mountain[] }) {
  if (mountains.length === 0) {
    return (
      <Rise className="pt-6">
        <Card>
          <p className="text-[12.5px] text-mist">No mountain matches that.</p>
        </Card>
      </Rise>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 pt-6">
      {mountains.map((m) => (
        <Rise key={m.id}>
          <Link to={`/explore/mountain/${m.id}`} className="block">
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
function HikesTab({ peak }: { peak: Mountain | undefined }) {
  const [trails, setTrails] = useState<Trail[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!peak) return;
    let live = true;
    setTrails(null);
    setFailed(false);

    nearbyTrails(peak.coords.lat, peak.coords.lon, {
      radiusM: 30_000,
      limit: 12,
      rank: "significant",
    })
      .then((found: Trail[]) => live && setTrails(found))
      .catch(() => live && setFailed(true));

    return () => {
      live = false;
    };
  }, [peak]);

  if (!peak) return null;

  return (
    <>
      <Rise className="pt-6">
        <p className="section-label">Approaches near {peak.name}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
          Waymarked paths within 30 km, from OpenStreetMap. These are the walk-ins and valley
          approaches — not the climb itself.
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
            <p className="text-[12.5px] text-mist-dim">Looking for paths around {peak.name}…</p>
          </Card>
        </Rise>
      )}

      {trails?.length === 0 && (
        <Rise className="pt-4">
          <Card>
            <p className="text-[12.5px] text-mist">
              No waymarked path is recorded within 30 km of {peak.name}.
            </p>
          </Card>
        </Rise>
      )}

      <div className="mt-3 space-y-2.5">
        {trails?.map((t) => (
          <Rise key={t.id}>
            <Link
              to={`/explore/trail/${t.osmId}`}
              className="flex items-center gap-3.5 rounded-card border border-hairline bg-graphite p-3.5 transition-colors hover:border-hairline-strong"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline text-azure">
                <MountainIcon size={15} strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-snow">{t.name}</span>
                <span className="tnum mt-0.5 block text-[11.5px] text-mist-dim">
                  {t.lengthKm != null && !t.lengthBroken
                    ? `${t.lengthKm.toFixed(1)} km`
                    : "Length not recorded"}
                  {t.ref && /[a-z]/i.test(t.ref) ? ` · ${t.ref}` : ""}
                </span>
              </span>
              <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
            </Link>
          </Rise>
        ))}
      </div>
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
            to={enquiryHref(operator, objective)}
            aria-label={`View ${operator.name} and start an enquiry`}
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
        <ScreenHeader title={exp.name} subtitle={exp.difficultyLabel} back="/explore/expeditions" />
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
