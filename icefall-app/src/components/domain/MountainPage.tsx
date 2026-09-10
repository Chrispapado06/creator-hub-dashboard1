import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Backpack,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  ExternalLink,
  MessageSquare,
  MoreHorizontal,
  Mountain as MountainIcon,
  Plus,
  Share,
  ShieldCheck,
  Snowflake,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Disclaimer,
  SectionLabel,
  sharePage,
} from "@/components/ui/primitives";
import { treksForMountain } from "@/treks";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { ProgressRing } from "@/components/ui/charts";
import { Rise, Screen, Stagger, TABBAR_STICKY_BOTTOM } from "@/components/layout/chrome";
import { GearCard } from "@/components/domain/cards";
import { PhotoGallery } from "@/components/domain/PhotoGallery";
import { ObjectiveActions, type MountainRef } from "@/components/domain/ObjectiveActions";
import { useMountainGallery } from "@/components/domain/MountainImage";
import { SaveButton, SaveCircle, SavedToast, useSaveFlash } from "@/components/ui/SaveControl";
import { TerrainMap } from "@/components/map/TerrainMap";
import { cn } from "@/lib/utils";
import { fmtCountdown, fmtDate, fmtElevation } from "@/lib/format";
import { sync } from "@/services/repository";
import { useApp } from "@/state/AppState";
import {
  REFERENCE_NEXT_STEP,
  REFERENCE_NO_READINESS,
  TIER_EYEBROW,
  TIER_STATEMENT,
  tierOf,
} from "@/services/peakTier";
import {
  FACTS_ATTRIBUTION,
  SOURCE_LABEL,
  formatAscentDate,
  usePeakFacts,
  type FactsState,
  type PeakFacts,
} from "@/services/peakFacts";
import { ACCESS_DISCLAIMER, operatorSearchUrl } from "@/services/expeditionAccess";
import {
  DEMO_NOTICE,
  EXPEDITION_TERRAIN_M,
  OPERATOR_DISCLAIMER,
  operatorsFor,
} from "@/services/operators";
import { OperatorCard } from "@/components/domain/OperatorCard";
import { PEAK_ATTRIBUTION, type Peak } from "@/services/peaks";
import type { Goal, Mountain, Season } from "@/types";
import { LogSummitSheet, SummitLogCard } from "@/components/domain/SummitLogKit";
import { logsForPeak, removeSummitLog, useSummitLogs } from "@/social/summitLog";
import { CreatePostSheet, OwnPostCard } from "@/components/domain/PostComposer";
import { postsForMountain, useOwnPosts } from "@/social/posts";
import { useRecordedActivities } from "@/tracking/feed";
import { useSettings } from "@/settings/store";
import { EMPTY_MOUNTAIN_BOARD_BODY, EMPTY_MOUNTAIN_BOARD_TITLE } from "@/social/leaderboard";

/**
 * The mountain page — TWO PAGES, and the difference between them is the point.
 *
 * `services/peakTier.ts` holds the rule and the measurements behind it. In
 * short: fourteen mountains have been surveyed by a person and carry a grade,
 * seasons, technical ground and required experience. Tens of thousands of
 * others are FACTS harvested from OpenStreetMap and Wikidata. A reader must
 * never mistake the second for the first, so:
 *
 *   AN OBJECTIVE  gets the grade, the seasons, the routes, the preparation and
 *                 the equipment — all of it ICEFALL's own, and the page says so.
 *
 *   A REFERENCE   gets facts with their sources, a link to the article they
 *   ENTRY         came from, and NO grade, NO season advice, NO "requires a
 *                 guide" and NO readiness figure. The missing planning
 *                 furniture is the signal, and a line says it in words.
 *
 * WHAT THIS PAGE USED TO DO INSTEAD, and no longer does: it called
 * `assessPeak(elevation, lat, lon)` — a seven-band elevation lookup — and
 * rendered the result in the same chip a curated grade uses. That derived
 * grade also OVERRODE the expert one in places. Verified live on 2026-09-10:
 * Gran Paradiso's record says no professional support is needed and the page
 * printed "Guide advised"; Toubkal's curated seasons (Spring · Autumn ·
 * Winter) sat directly above the derived line "the window is generally June to
 * September". `assessPeak` is no longer imported here.
 *
 * Deliberately absent from both tiers: summit success rates. ICEFALL does not
 * have them and a plausible-looking one changes how somebody plans.
 */

const SEASON_LABEL: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
};

export interface MountainPageData {
  name: string;
  /** The name on the local map, when `name` is its English form. */
  localName?: string;
  /** The English name, when `name` is a Latin-script local one ("Ağrı Dağı" → "Mount Ararat"). */
  englishName?: string;
  elevationM: number;
  lat?: number;
  lon?: number;
  country?: string;
  region?: string;
  wikipedia?: string;
  /** OSM's Wikidata QID — joins this peak to its harvested facts. */
  wikidata?: string;
  /** Which dataset supplied `country`. See `services/peaks.ts`. */
  countrySource?: string;
  curatedId?: string;
  photo?: string;
  /** Attribution for `photo` when ICEFALL did not take it. */
  photoCredit?: string;
  /** Set when the athlete is training for this mountain. */
  goal?: Goal;
  /** Curated mountains carry route, condition and duration data. */
  curated?: Mountain;
  /** The id used by the objectives list. */
  objectiveId?: string;
  backTo: string;
  /**
   * Rendered at the foot of the Preparation tab. Destructive goal actions live
   * with the goal, not pinned to the chrome where they're one mis-tap away.
   */
  preparationFooter?: React.ReactNode;
}

/**
 * OSM's `wikipedia` tag is `<lang>:<Article Title>`. Turning it into a URL is
 * string work, not a request — which is the point: the article is LINKED, never
 * quoted, so the app never holds a sentence somebody else wrote about how hard
 * the mountain is.
 */
function articleUrlFrom(tag?: string): string | null {
  const m = /^([a-z-]{2,12}):(.+)$/i.exec((tag ?? "").trim());
  if (!m) return null;
  return `https://${m[1].toLowerCase()}.wikipedia.org/wiki/${encodeURIComponent(m[2].trim().replace(/ /g, "_"))}`;
}

/* The 3,000 m expedition/guided threshold now lives in `services/operators.ts`,
   beside the altitude filter it describes — this screen and the expeditions
   directory both ask the question and must not drift apart. */

type Tab = "overview" | "routes" | "preparation" | "equipment" | "expeditions";

export function MountainPage({ data }: { data: MountainPageData }) {
  const curated = data.curated;
  const tier = tierOf(curated);
  const { facts, state: factsState } = usePeakFacts(data.wikidata);
  const gallery = useMountainGallery({
    name: data.name,
    elevationM: data.elevationM,
    lat: data.lat,
    lon: data.lon,
    curatedId: data.curatedId,
    wikipedia: data.wikipedia,
    photo: data.photo,
    photoCredit: data.photoCredit,
  });
  /*
   * THE WIKIPEDIA EXTRACT IS NO LONGER FETCHED — see the note in `Overview`.
   * `usePeakSummary` called the REST summary endpoint, and about one peak
   * article in eighteen opens with route guidance. Not displaying it while
   * still requesting it would leave the channel open for the next person who
   * needs "a description" to reach for. The link out is built from the tags,
   * with no request at all.
   */
  const articleUrl = articleUrlFrom(data.wikipedia);

  /*
   * PREPARATION AND EQUIPMENT ARE OBJECTIVE-ONLY TABS NOW.
   *
   * Every line either of them rendered for an unsurveyed peak came from
   * `assessPeak`: the skills, the technical kit, the acclimatisation
   * paragraph, the "at this grade ICEFALL recommends a certified mountain
   * guide" advisory. All of it derived from elevation and latitude, all of it
   * in the category this app does not generate. There is no honest version of
   * those tabs for a peak nobody has been up on ICEFALL's behalf, so they are
   * absent rather than filled.
   *
   * The guides tab stays for both: who will take you up a mountain is a
   * commercial listing, not an assessment of the mountain.
   */
  const tabs = useMemo(() => {
    const list: { value: Tab; label: string }[] = [{ value: "overview", label: "Overview" }];
    if (curated?.routes.length) list.push({ value: "routes", label: "Routes" });
    if (curated) {
      list.push(
        { value: "preparation", label: "Preparation" },
        { value: "equipment", label: "Equipment" },
      );
    }
    // The value stays `expeditions` — it is the "who takes you up" tab either
    // way, and renaming it would churn every reference for a label change.
    list.push({
      value: "expeditions",
      label: data.elevationM >= EXPEDITION_TERRAIN_M ? "Expeditions" : "Guides",
    });
    return list;
  }, [curated, data.elevationM]);

  const [tab, setTab] = useState<Tab>("overview");

  return (
    <Screen padded={false}>
      <MountainHero data={data} gallery={gallery} facts={facts} />

      {curated ? (
        <ObjectiveStats curated={curated} elevationM={data.elevationM} />
      ) : (
        <ReferenceStats data={data} facts={facts} />
      )}

      <div className="sticky top-0 z-20 -mt-px border-b border-hairline bg-obsidian/95 backdrop-blur">
        <div className="no-scrollbar flex gap-5 overflow-x-auto px-5">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "section-label shrink-0 border-b-[1.5px] py-3.5 text-[9px] tracking-[0.13em] transition-colors",
                tab === t.value
                  ? "border-azure text-snow"
                  : "border-transparent text-mist-dim hover:text-mist",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Stagger key={tab} className="px-5 pb-4">
        {tab === "overview" && (
          <>
            <Overview
              data={data}
              gallery={gallery}
              articleUrl={articleUrl}
              facts={facts}
              factsState={factsState}
            />
            <AscentsAndConditions data={data} />
          </>
        )}
        {tab === "routes" && curated && <Routes mountain={curated} />}
        {tab === "preparation" && curated && <Preparation data={data} curated={curated} />}
        {tab === "equipment" && curated && <Equipment curated={curated} />}
        {tab === "expeditions" && <Expeditions data={data} />}
      </Stagger>

      <ActionBar data={data} facts={facts} />
    </Screen>
  );
}

/**
 * The two things you can do with a mountain, always reachable.
 *
 * Sticks to the bottom of the scroller rather than the viewport, so it never
 * covers content on a short screen and never fights the tab bar.
 */
function ActionBar({ data, facts }: { data: MountainPageData; facts: PeakFacts | null }) {
  const { objectives, addObjective, removeObjective } = useApp();
  const objective = objectiveRef(data, facts);
  const saved = objective ? objectives.some((o) => o.id === objective.id) : false;
  const flash = useSaveFlash(saved);

  return (
    <div
      className="sticky mt-2 border-t border-hairline bg-obsidian/95 px-5 py-4 backdrop-blur"
      /* Rests just above the floating tab bar, not under it. */
      style={{ bottom: TABBAR_STICKY_BOTTOM }}
    >
      <SavedToast show={flash} label={`${data.name} saved`} detail="to your objectives" />
      <div className="flex gap-2.5">
        {objective && (
          <SaveButton
            className="flex-1"
            variant="secondary"
            saved={saved}
            onToggle={() => (saved ? removeObjective(objective.id) : addObjective(objective))}
          />
        )}
        {data.goal ? (
          <Link to="/coach/training" className="flex-1">
            <Button className="w-full">Start training plan</Button>
          </Link>
        ) : (
          <Link to="/goals" state={goalSeed(data)} className="flex-1">
            <Button className="w-full">Set as my goal</Button>
          </Link>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * ONE COUNTRY PER PAGE, and a note when the sources disagree.
 *
 * The hero read `data.country` and the stat tile preferred `facts.country`, so
 * a border peak printed two different countries a few centimetres apart.
 * Verified on Makalu, 2026-09-10: the header said "People's Republic of China"
 * (Natural Earth point-in-polygon, which places the summit node on the Chinese
 * side) while the tile said "Nepal" (Wikidata P17). Both are defensible for a
 * summit that IS the border. Showing both without saying so is not.
 *
 * Wikidata leads because its provenance is unambiguous and it names the country
 * as a fact about the mountain rather than about one coordinate. Where the two
 * differ the tile says both, in the same shape the elevation disagreement uses.
 */
/**
 * The same country under two datasets' names is ONE country, not a dispute.
 *
 * Wikidata labels the item "United States of America"; Natural Earth's
 * NAME_EN is "United States". Compared as raw strings the tile on Longs Peak,
 * Grand Teton and Rainier read "United States — Wikidata. Natural Earth says
 * United States of America", which is the disagreement shape used for a
 * summit that genuinely sits on a border (Makalu), spent on a spelling. The
 * names are folded through this list before comparing; the label shown is
 * still the source's own.
 */
const SAME_COUNTRY: Record<string, string> = {
  "united states of america": "united states",
  usa: "united states",
  "united kingdom of great britain and northern ireland": "united kingdom",
  uk: "united kingdom",
  "people's republic of china": "china",
  "russian federation": "russia",
  "czech republic": "czechia",
  "republic of korea": "south korea",
  "kingdom of the netherlands": "netherlands",
  "islamic republic of iran": "iran",
  "republic of north macedonia": "north macedonia",
  "bosnia and herz.": "bosnia and herzegovina",
};
const sameCountry = (a: string, b: string) => {
  const fold = (s: string) => {
    const k = s.trim().toLowerCase();
    return SAME_COUNTRY[k] ?? k;
  };
  return fold(a) === fold(b);
};

function countryOf(
  data: MountainPageData,
  facts: PeakFacts | null,
): { value: string; hint?: string } | null {
  const wd = facts?.country;
  const geo = data.country;
  if (!wd && !geo) return null;
  if (wd && geo && !sameCountry(wd, geo)) {
    return { value: wd, hint: `Wikidata. ${data.countrySource ?? "Boundary data"} says ${geo}` };
  }
  return { value: (wd ?? geo)!, hint: wd ? "Wikidata" : data.countrySource };
}

/**
 * The objectives-list entry for this mountain, when it has coordinates.
 *
 * THE SUBTITLE USED TO BE A GRADE FOR BOTH TIERS — the curated label where one
 * existed and `assessPeak(...).label` everywhere else. So a saved reference
 * peak sat in the objectives list wearing "Alpine — snow and glacier", which is
 * an elevation band dressed as a verdict, next to a curated entry wearing a
 * real one, in the same typeface. A reference entry now carries a FACT instead:
 * its mountain range, or failing that its country. Neither says how hard it is,
 * because ICEFALL does not know.
 */
function objectiveRef(data: MountainPageData, facts: PeakFacts | null): MountainRef | null {
  if (data.lat === undefined || data.lon === undefined) return null;
  return {
    id: data.objectiveId ?? `osm:${data.lat.toFixed(4)},${data.lon.toFixed(4)}`,
    name: data.name,
    elevationM: data.elevationM,
    lat: data.lat,
    lon: data.lon,
    curatedId: data.curatedId,
    photo: data.photo,
    wikipedia: data.wikipedia,
    wikidata: data.wikidata,
    country: data.country,
    subtitle: data.curated?.difficultyLabel ?? facts?.range ?? data.country ?? undefined,
  };
}

/**
 * THE GOAL BUTTON USED TO DROP THE MOUNTAIN.
 *
 * `<Link to="/goals">` landed the athlete on the goals list with an empty
 * search box, and they retyped the mountain they had just been reading about —
 * and if they picked a different search hit, the goal was for a different rock.
 * The goals screen creates a goal from a `Peak`, so the page hands it this one
 * ready-picked: the same shape `searchPeaks` returns, carrying the entity id
 * that resolves its facts and its photograph. Undefined when the page has no
 * position, in which case the plain list is all there is to offer.
 */
function goalSeed(data: MountainPageData): { peak: Peak } | undefined {
  if (data.lat === undefined || data.lon === undefined) return undefined;
  return {
    peak: {
      id: data.objectiveId ?? `osm:${data.lat.toFixed(4)},${data.lon.toFixed(4)}`,
      name: data.name,
      localName: data.localName,
      englishName: data.englishName,
      elevationM: data.elevationM,
      lat: data.lat,
      lon: data.lon,
      country: data.country,
      countrySource: data.countrySource as Peak["countrySource"],
      wikipedia: data.wikipedia,
      wikidata: data.wikidata,
      curatedId: data.curatedId,
      photo: data.photo,
      photoCredit: data.photoCredit,
    },
  };
}

function MountainHero({
  data,
  gallery,
  facts,
}: {
  data: MountainPageData;
  gallery: ReturnType<typeof useMountainGallery>;
  facts: PeakFacts | null;
}) {
  const curated = data.curated;
  const tier = tierOf(curated);
  const country = countryOf(data, facts);
  const goal = data.goal;
  const [frame, setFrame] = useState(0);
  const [options, setOptions] = useState(false);
  const images = gallery.images;
  const i = Math.min(frame, Math.max(0, images.length - 1));

  return (
    <div className="relative">
      <div className="relative h-[330px] w-full overflow-hidden bg-slate">
        <img
          src={images[i]}
          alt={data.name}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            gallery.verified ? "opacity-100" : "opacity-50",
          )}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/70 to-obsidian/40" />
        <div className="absolute inset-0 bg-obsidian/25" />

        <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-4">
          <Link
            to={data.backTo}
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-full border border-hairline bg-obsidian/60 text-snow backdrop-blur transition-colors hover:border-azure/50"
          >
            <ChevronRight size={17} strokeWidth={1.7} className="rotate-180" />
          </Link>
          <span className="flex-1" />
          <HeroSave data={data} facts={facts} />
          <button
            type="button"
            aria-label="Share this mountain"
            onClick={() => sharePage(data.name)}
            className="grid h-9 w-9 place-items-center rounded-full border border-hairline bg-obsidian/60 text-snow backdrop-blur transition-colors hover:border-azure/50"
          >
            <Share size={16} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            aria-label="More options"
            onClick={() => setOptions(true)}
            className="grid h-9 w-9 place-items-center rounded-full border border-hairline bg-obsidian/60 text-snow backdrop-blur transition-colors hover:border-azure/50"
          >
            <MoreHorizontal size={17} strokeWidth={1.7} />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5">
          {/* Who took the photograph, and — just as important — whether it is a
              photograph of THIS mountain at all. Laid out ABOVE the title rather
              than at a fixed offset from the bottom: a two-line name or a local
              name underneath used to be written straight over it. */}
          {gallery.captions[i] && (
            <p className="truncate text-[10px] text-mist">{gallery.captions[i]}</p>
          )}

          {images.length > 1 && (
            <div className="mt-2 flex gap-1.5">
              {images.map((src, n) => (
                <button
                  key={src}
                  type="button"
                  aria-label={`Photo ${n + 1} of ${images.length}`}
                  onClick={() => setFrame(n)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    n === i ? "w-5 bg-snow" : "w-1.5 bg-snow/40",
                  )}
                />
              ))}
            </div>
          )}

          <div className="mt-3 flex items-end gap-4">
            <div className="min-w-0 flex-1">
              {/*
                * The eyebrow used to read "Mountain" or "Your goal" on every
                * page, which told the reader nothing about which of the two
                * kinds of page this is. It now names the tier. On a reference
                * entry it is deliberately NOT azure: the accent colour is what
                * ICEFALL puts behind its own claims.
                */}
              <p
                className={cn(
                  "section-label",
                  tier === "objective" ? "text-azure/85" : "text-mist-dim",
                )}
              >
                {goal ? `Your goal · ${TIER_EYEBROW[tier]}` : TIER_EYEBROW[tier]}
              </p>
              <h1 className="display mt-1.5 text-[34px] leading-[1.05] text-snow">{data.name}</h1>
              {/* The other name the reader may know it by: the local script
                  under an English title (富士山 under Mount Fuji), or the
                  English name under a Latin local one (Mount Ararat under
                  Ağrı Dağı). Never both — a row holds one or the other. */}
              {data.localName && data.localName !== data.name ? (
                <p className="mt-1 text-[13px] text-mist-dim">{data.localName}</p>
              ) : (
                data.englishName &&
                data.englishName !== data.name && (
                  <p className="mt-1 text-[13px] text-mist-dim">{data.englishName}</p>
                )
              )}
              <p className="tnum mt-2 text-[13px] text-mist">
                {fmtElevation(data.elevationM)} m{data.region ? ` · ${data.region}` : ""}
                {country ? ` · ${country.value}` : ""}
              </p>
              {/*
                * THE GRADE CHIP IS FOR SURVEYED MOUNTAINS ONLY.
                *
                * It used to render `curated.difficultyLabel ?? assessment.
                * shortLabel` — an expert grade and an elevation band in an
                * IDENTICAL chip, with nothing to tell them apart. A reference
                * entry gets no chip at all. What replaces it is a fact (the
                * range) or nothing.
                */}
              {curated ? (
                <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-hairline bg-obsidian/50 px-3 py-1.5 backdrop-blur">
                  <MountainIcon size={13} strokeWidth={1.5} className="shrink-0 text-azure" />
                  <span className="section-label whitespace-nowrap text-snow">
                    {curated.difficultyLabel}
                  </span>
                </span>
              ) : (
                facts?.range && (
                  <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-hairline bg-obsidian/40 px-3 py-1.5 backdrop-blur">
                    <MountainIcon size={13} strokeWidth={1.5} className="shrink-0 text-mist-dim" />
                    <span className="section-label whitespace-nowrap text-mist">
                      {facts.range}
                    </span>
                  </span>
                )
              )}
            </div>

            {/*
              * THE READINESS RING IS OBJECTIVE-ONLY, and this is the one
              * removal that is about arithmetic rather than presentation.
              *
              * Readiness is the smaller of two ratios, and one of them needs a
              * route's vertical gain. For an unsurveyed peak
              * `tracking/training.ts:289` has no route, so it substitutes
              * `goal.elevationM * 0.45`. That 0.45 has no source. Every
              * readiness percentage ever shown for a reference peak was
              * measured against a number ICEFALL invented, and rendering it as
              * a confident ring beside a countdown is exactly the failure this
              * page is being rebuilt to stop. The absence is NAMED, below.
              */}
            {goal && curated && (
              <div className="shrink-0 text-right">
                <ProgressRing value={goal.preparation} size={84} stroke={2.5} className="ml-auto">
                  <div className="text-center">
                    <p className="tnum text-[19px] font-extralight leading-none text-snow">
                      {Math.round(goal.preparation)}%
                    </p>
                    <p className="section-label mt-1 text-[8px] text-azure/85">Prepared</p>
                  </div>
                </ProgressRing>
                <p className="mt-2.5 text-[11px] text-mist">{fmtCountdown(goal.targetDate)}</p>
                <p className="tnum text-[11px] text-mist-dim">Target {fmtDate(goal.targetDate)}</p>
              </div>
            )}

            {goal && !curated && (
              <div className="w-[130px] shrink-0 text-right">
                <p className="text-[11px] text-mist">{fmtCountdown(goal.targetDate)}</p>
                <p className="tnum text-[11px] text-mist-dim">Target {fmtDate(goal.targetDate)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {options && (
        <OptionsSheet data={data} facts={facts} onClose={() => setOptions(false)} />
      )}
    </div>
  );
}

/** The animated save control in the hero, wired to the objectives list. */
function HeroSave({ data, facts }: { data: MountainPageData; facts: PeakFacts | null }) {
  const { objectives, addObjective, removeObjective } = useApp();
  const objective = objectiveRef(data, facts);
  const saved = objective ? objectives.some((o) => o.id === objective.id) : false;
  if (!objective) return null;
  return (
    <SaveCircle
      saved={saved}
      onToggle={() => (saved ? removeObjective(objective.id) : addObjective(objective))}
    />
  );
}

/**
 * `navigator.share` only exists on mobile Safari/Chrome; the clipboard is the
 * honest fallback rather than a button that silently does nothing.
 */

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

function OptionsSheet({
  data,
  facts,
  onClose,
}: {
  data: MountainPageData;
  facts: PeakFacts | null;
  onClose: () => void;
}) {
  const { objectives, addObjective, removeObjective } = useApp();
  const objective = objectiveRef(data, facts);
  const saved = objective ? objectives.some((o) => o.id === objective.id) : false;

  const osm =
    data.lat !== undefined && data.lon !== undefined
      ? `https://www.openstreetmap.org/?mlat=${data.lat}&mlon=${data.lon}#map=14/${data.lat}/${data.lon}`
      : null;

  return (
    <Sheet title={data.name} onClose={onClose}>
      {objective && (
        <SheetRow
          icon={Bookmark}
          title={saved ? "Remove from objectives" : "Save to objectives"}
          detail={
            saved
              ? "Stops this mountain driving your preparation"
              : "Adds it to your objectives and your training plan"
          }
          onClick={() => {
            saved ? removeObjective(objective.id) : addObjective(objective);
            onClose();
          }}
        />
      )}
      <SheetRow
        icon={Share}
        title="Share"
        detail="Send this page"
        onClick={() => {
          sharePage(data.name);
          onClose();
        }}
      />
      <SheetRow
        icon={Copy}
        title="Copy link"
        detail={window.location.host}
        onClick={() => {
          void navigator.clipboard?.writeText(window.location.href).catch(() => {});
          onClose();
        }}
      />
      {osm && (
        <SheetRow
          icon={ExternalLink}
          title="View on OpenStreetMap"
          detail={`${data.lat!.toFixed(4)}, ${data.lon!.toFixed(4)}`}
          onClick={() => window.open(osm, "_blank", "noopener,noreferrer")}
        />
      )}
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat strip                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One tile in either strip. `hint` is the provenance line under the value —
 * where the number came from, in words, every time.
 */
interface Stat {
  label: string;
  value: string;
  hint?: string;
  icon: typeof MountainIcon;
}

function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <div className="px-5 py-4">
      <Card inset={false} className="no-scrollbar flex overflow-x-auto">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "min-w-[132px] shrink-0 px-4 py-3.5",
              i !== 0 && "border-l border-hairline",
            )}
          >
            <div className="flex items-center gap-1.5">
              <s.icon size={12} strokeWidth={1.5} className="shrink-0 text-azure/70" />
              <p className="section-label text-[9px] text-mist-dim">{s.label}</p>
            </div>
            <p className="tnum mt-2 text-[14px] leading-snug text-snow">{s.value}</p>
            {s.hint && <p className="mt-1 text-[10px] leading-snug text-mist-dim">{s.hint}</p>}
          </div>
        ))}
      </Card>
    </div>
  );
}

/**
 * A surveyed mountain: ICEFALL's own judgement, and nothing derived.
 *
 * THE SUPPORT TILE IS THE FIX THAT MATTERS HERE. It used to read
 * `assessment.requiresGuide`, which is `band >= 4` — purely "is this peak above
 * 2,900 m". Meanwhile `requiresProfessionalSupport` sits on all fourteen
 * curated records holding the actual guide-deferral judgement, and a grep
 * across the repo found ZERO readers of it: the one field that IS the
 * judgement was the one field nothing read.
 *
 * The two disagree in public. Verified live on 2026-09-10 at
 * /explore/mountain/gran-paradiso: the record says
 * `requiresProfessionalSupport: false` and `requiredExperience: "The standard
 * first 4,000 m peak. Suitable after a glacier skills course."` — and the page
 * printed "Guide advised". Same on mount-olympus and toubkal. Three of
 * fourteen. It was also the one tile with no "Estimated" hint, so the single
 * derived safety claim on the page was the one presented as fact.
 */
function ObjectiveStats({ curated, elevationM }: { curated: Mountain; elevationM: number }) {
  const stats: Stat[] = [
    { label: "Elevation", value: `${fmtElevation(elevationM)} m`, icon: MountainIcon },
    { label: "Difficulty", value: curated.difficultyLabel, icon: TriangleAlert },
    {
      label: "Best season",
      value: curated.bestSeasons.map((sn) => SEASON_LABEL[sn]).join(" · "),
      icon: Snowflake,
    },
    { label: "Duration", value: curated.typicalDurationLabel, icon: Clock },
    {
      label: "Support",
      value: curated.requiresProfessionalSupport ? "Guide required" : "Can be climbed independently",
      hint: curated.requiresProfessionalSupport
        ? "ICEFALL's assessment of this mountain"
        : "ICEFALL's assessment — skills and experience below still apply",
      icon: ShieldCheck,
    },
  ];
  return <StatRow stats={stats} />;
}

/**
 * A reference entry: harvested facts, each with the source it came from.
 *
 * There is no Difficulty tile, no Best season tile and no Support tile, and
 * that is the whole design. Those three were the derived ones. What replaces
 * them is not a softer version of the same claim — it is a different KIND of
 * claim: prominence, range, first ascent. Facts a reader can check.
 *
 * Where Wikidata and OSM disagree about the elevation by more than 10 metres,
 * the tile SAYS THEY DISAGREE rather than picking a winner. Measured: that is
 * 31% of peaks at 1 m, 7 of 209 at more than 50 m, worst case 296 m.
 */
function ReferenceStats({ data, facts }: { data: MountainPageData; facts: PeakFacts | null }) {
  const stats: Stat[] = [
    {
      label: "Elevation",
      value: `${fmtElevation(data.elevationM)} m`,
      hint: facts?.elevationDisputed
        ? `OpenStreetMap. Wikidata says ${fmtElevation(Math.round(facts.elevationWikidata!.m))} m — sources differ`
        : facts?.elevationWikidata
          ? "OpenStreetMap, agreed by Wikidata"
          : "OpenStreetMap",
      icon: MountainIcon,
    },
  ];

  if (facts?.prominence) {
    stats.push({
      label: "Prominence",
      value: `${fmtElevation(facts.prominence.m)} m`,
      hint: SOURCE_LABEL[facts.prominence.src],
      // Not `TriangleAlert`: that is the Difficulty tile's icon on the curated
      // strip, and a warning sign on a fact tile is the one visual the two
      // strips must not share.
      icon: MountainIcon,
    });
  }
  if (facts?.range) {
    stats.push({ label: "Range", value: facts.range, hint: "Wikidata", icon: MountainIcon });
  }
  const country = countryOf(data, facts);
  if (country) {
    stats.push({ label: "Country", value: country.value, hint: country.hint, icon: MountainIcon });
  }
  if (facts?.firstAscent?.date) {
    stats.push({
      label: "First ascent",
      value: formatAscentDate(facts.firstAscent.date),
      hint: facts.firstAscent.party?.length
        ? facts.firstAscent.party.join(", ")
        : "Wikidata",
      icon: Clock,
    });
  }
  if (facts?.isolation) {
    stats.push({
      label: "Isolation",
      value: `${fmtElevation(facts.isolation.km)} km`,
      hint: `Nearest higher ground · ${SOURCE_LABEL[facts.isolation.src]}`,
      icon: Circle,
    });
  }

  return <StatRow stats={stats} />;
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

function Overview({
  data,
  gallery,
  articleUrl,
  facts,
  factsState,
}: {
  data: MountainPageData;
  gallery: ReturnType<typeof useMountainGallery>;
  articleUrl: string | null;
  facts: PeakFacts | null;
  factsState: FactsState;
}) {
  const curated = data.curated;
  const tier = tierOf(curated);
  const objective = objectiveRef(data, facts);
  const article = articleUrl ?? (facts?.article || null);

  return (
    <>
      {/*
        * THE PAGE SAYS WHICH KIND OF PAGE IT IS, IN WORDS, ABOVE EVERYTHING.
        *
        * Both tiers carry the line. A curated page saying nothing would leave a
        * reader to infer ICEFALL stands behind every page equally, which is the
        * confusion this whole change exists to end — the claim has to be made
        * explicitly where it is true, or its absence elsewhere means nothing.
        */}
      <Rise className="pt-1">
        <Card
          className={cn(
            "flex gap-3",
            tier === "objective" ? "border-azure/25" : undefined,
          )}
        >
          {tier === "objective" ? (
            <ShieldCheck size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
          ) : (
            <Circle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
          )}
          <div className="min-w-0 flex-1">
            <p className="section-label text-[9px] text-mist-dim">{TIER_EYEBROW[tier]}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{TIER_STATEMENT[tier]}</p>
            {tier === "reference" && (
              <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
                {REFERENCE_NEXT_STEP}
              </p>
            )}
          </div>
        </Card>
      </Rise>

      {data.goal && tier === "reference" && (
        <Rise className="pt-4">
          <Disclaimer>{REFERENCE_NO_READINESS}</Disclaimer>
        </Rise>
      )}

      <Rise className="pt-6">
        <SectionLabel>About {data.name}</SectionLabel>
        <Card className="mt-3">
          {curated ? (
            <>
              {/*
                * ICEFALL'S OWN WRITING WINS ON ICEFALL'S OWN OBJECTIVE.
                *
                * This used to read `summary ? wikipedia : curated.summary` —
                * so a curated mountain showed the WIKIPEDIA extract whenever
                * one resolved, and the expert summary only appeared when the
                * fetch failed. The page ranked an anonymous editor above the
                * person who wrote the record.
                */}
              <p className="text-[13px] leading-relaxed text-mist">{curated.summary}</p>
              {article && (
                <a
                  href={article}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-flex items-center gap-2 text-[12px] text-azure transition-colors hover:text-azure-bright"
                >
                  Read the Wikipedia article
                  <ExternalLink size={13} strokeWidth={1.6} />
                </a>
              )}
            </>
          ) : (
            <>
              {/*
                * A REFERENCE ENTRY LINKS TO WIKIPEDIA. IT DOES NOT QUOTE IT.
                *
                * The inlined extract used to come from the REST summary
                * endpoint. Measured across 175 peaks with an article on
                * 2026-09-10, TEN OF THEM (5.7%, about one page in eighteen)
                * carry route guidance or a difficulty verdict in that first
                * paragraph, verbatim from the live API:
                *
                *   Täschhorn  "There are no easy mountaineering routes to its
                *              summit"
                *   Rocher de  "can be most easily reached on an ascent of Mont
                *   la Tournette  Blanc via the Goûter Route"
                *   Sgùrr Mòr  "mostly gentle sloped and fairly accessible"
                *
                * Unattributed, undated, and on the page it reads as ICEFALL's
                * view of the mountain. A regex cannot be the defence — it must
                * catch every phrasing in every language and it will not. Not
                * fetching it is the defence.
                *
                * What stands in its place is Wikidata's one-line description:
                * CC0, about a dozen words, and measured clean of judgement on
                * 170 of 170 peaks that had one.
                */}
              {facts?.description ? (
                <>
                  <p className="text-[13px] leading-relaxed text-mist">{facts.description}</p>
                  <p className="mt-2 text-[10px] text-mist-dim">Wikidata description, CC0.</p>
                </>
              ) : (
                /*
                 * FOUR REASONS FOR A BLANK, FOUR SENTENCES. This used to be one
                 * sentence — "No description recorded for this peak in
                 * Wikidata" — for every case, including the one where the facts
                 * file simply failed to load. Verified on Mount Robson,
                 * 2026-09-10: a description, a range, a cited prominence and a
                 * first ascent on disk, and the page asserting Wikidata had
                 * nothing. `services/peakFacts.ts` now says which it is.
                 */
                <p className="text-[13px] leading-relaxed text-mist-dim">
                  {factsState === "none"
                    ? "OpenStreetMap links no Wikidata entity to this peak, so ICEFALL holds no harvested facts for it — only its position and elevation."
                    : factsState === "loading"
                      ? "Loading this peak's facts…"
                      : factsState === "failed"
                        ? "This peak's facts could not be loaded just now. That says nothing about what Wikidata holds — try again with a connection."
                        : "No description recorded for this peak in Wikidata."}
                </p>
              )}
              {article ? (
                <a
                  href={article}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-flex items-center gap-2 text-[12px] text-azure transition-colors hover:text-azure-bright"
                >
                  Read about it on Wikipedia
                  <ExternalLink size={13} strokeWidth={1.6} />
                </a>
              ) : (
                <p className="mt-3 text-[12px] text-mist-dim">
                  No Wikipedia article is linked to this peak.
                </p>
              )}
              {facts?.commons && (
                <a
                  href={`https://commons.wikimedia.org/wiki/${encodeURIComponent(facts.commons)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 flex items-center gap-2 text-[12px] text-azure transition-colors hover:text-azure-bright"
                >
                  Photographs on Wikimedia Commons
                  <ExternalLink size={13} strokeWidth={1.6} />
                </a>
              )}
            </>
          )}
        </Card>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>Photography</SectionLabel>
        <PhotoGallery
          className="mt-3"
          images={gallery.images}
          captions={gallery.captions}
          alt={data.name}
        />
      </Rise>

      {/*
       * WALKING ROUTES, KEPT SEPARATE FROM CLIMBING ROUTES.
       *
       * The Routes tab above is how you climb this mountain. These are walks
       * to and around it, and they belong to people who are not climbing it at
       * all. Listing them together would put a fortnight's valley walking under
       * the same heading as a summit route.
       */}
      {data.curatedId && treksForMountain(data.curatedId).length > 0 && (
        <Rise className="pt-6">
          <SectionLabel>Treks here</SectionLabel>
          <Card className="mt-3">
            <p className="text-sm text-mist/70">
              {treksForMountain(data.curatedId).length}{" "}
              {treksForMountain(data.curatedId).length === 1 ? "route" : "routes"} walk to or around{" "}
              {data.name} — walking, not climbing.
            </p>
            <div className="mt-3 space-y-1.5">
              {treksForMountain(data.curatedId).map((t) => (
                <Link
                  key={t.id}
                  to={`/explore/trek/${t.id}`}
                  className="flex items-baseline justify-between gap-3 rounded-xl bg-obsidian/40 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-mist">{t.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-mist/45">
                    {t.durationDays ? `${t.durationDays[0]}–${t.durationDays[1]} days` : "—"}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </Rise>
      )}

      {data.lat !== undefined && data.lon !== undefined && (
        <Rise className="pt-6">
          <SectionLabel>Terrain</SectionLabel>
          <div className="mt-3 overflow-hidden rounded-card border border-hairline">
            <TerrainMap
              track={[{ lat: data.lat, lon: data.lon }]}
              current={{ lat: data.lat, lon: data.lon }}
              follow={false}
              className="h-[240px]"
            />
          </div>
        </Rise>
      )}

      {objective && (
        <Rise className="pt-6">
          <ObjectiveActions mountain={objective} />
        </Rise>
      )}

      {/*
        * REMOVING A REFERENCE GOAL. The button arrives as `preparationFooter`
        * and is rendered at the foot of the Preparation tab — a tab a
        * reference entry does not have. So a goal set on an unsurveyed peak
        * could be made and never unmade: /goals/<id> offered Overview and
        * Expeditions and no control at all. For that tier it lives here.
        */}
      {!curated && data.preparationFooter && <Rise className="pt-8">{data.preparationFooter}</Rise>}

      <Rise className="pt-6">
        <Card>
          <div className="flex items-center gap-3">
            <MountainIcon size={15} strokeWidth={1.5} className="shrink-0 text-mist-dim" />
            <p className="flex-1 text-[11px] leading-relaxed text-mist-dim">{PEAK_ATTRIBUTION}</p>
          </div>
        </Card>
      </Rise>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Routes — curated mountains only, because only they have route data          */
/* -------------------------------------------------------------------------- */

function Routes({ mountain }: { mountain: Mountain }) {
  return (
    <>
      {mountain.routes.map((r) => (
        <Rise key={r.name} className="pt-4 first:pt-1">
          <Card>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] text-snow">{r.name}</h3>
                <p className="tnum mt-1 text-[12px] text-mist-dim">
                  {r.gradeLabel} · {r.durationLabel}
                </p>
              </div>
              <Badge size="md">{r.distanceKm} km</Badge>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-mist">{r.description}</p>
            <div className="tnum mt-3 flex gap-5 border-t border-hairline pt-3 text-[12px] text-mist-dim">
              <span>{fmtElevation(r.elevationGainM)} m gain</span>
              <span>{r.distanceKm} km</span>
            </div>
          </Card>
        </Rise>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Preparation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Preparation — SURVEYED MOUNTAINS ONLY, so everything here is ICEFALL's own.
 *
 * The tab is no longer rendered for a reference entry. Every line it used to
 * show one came out of `assessPeak`: the skills list, the "at this grade
 * ICEFALL recommends a certified mountain guide" advisory, the acclimatisation
 * paragraph, the season window. All derived from elevation and latitude.
 */
function Preparation({ data, curated }: { data: MountainPageData; curated: Mountain }) {
  const goal = data.goal;
  return (
    <>
      {goal ? (
        <Rise className="pt-1">
          <Card>
            <div className="flex items-center gap-5">
              <ProgressRing value={goal.preparation} size={78} stroke={3} />
              <div className="min-w-0">
                <p className="section-label">Preparation</p>
                <p className="mt-1.5 text-[15px] text-snow">
                  {goal.status === "completed" ? "Completed" : fmtCountdown(goal.targetDate)}
                </p>
                <p className="tnum mt-1 text-[12px] text-mist-dim">
                  Target {fmtDate(goal.targetDate)}
                </p>
              </div>
            </div>
            <Link
              to="/coach/training"
              className="mt-4 flex items-center gap-2.5 border-t border-hairline pt-3.5 text-[13px] text-azure transition-colors hover:text-azure-bright"
            >
              <Sparkles size={14} strokeWidth={1.6} />
              <span className="flex-1">View the full training plan</span>
              <ChevronRight size={15} strokeWidth={1.7} />
            </Link>
          </Card>
        </Rise>
      ) : (
        <Rise className="pt-1">
          <Card>
            <p className="text-[13px] leading-relaxed text-mist">
              Set this mountain as your goal and ICEFALL builds a training plan backwards from your
              target date, then tracks preparation against what you actually complete.
            </p>
          </Card>
        </Rise>
      )}

      {goal?.gaps && goal.gaps.length > 0 && (
        <Rise className="pt-6">
          <SectionLabel>What stands between you and the summit</SectionLabel>
          <Card className="mt-3" inset={false}>
            <ul>
              {goal.gaps.map((g, i) => {
                // Everything here is outstanding by definition — a gap that
                // closed stops being a gap. The marker says "open", not "done".
                const [title, ...rest] = g.split(" — ");
                return (
                  <li
                    key={g}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3.5",
                      i !== 0 && "border-t border-hairline",
                    )}
                  >
                    <Circle
                      size={16}
                      strokeWidth={1.4}
                      className="mt-[1px] shrink-0 text-azure/70"
                      strokeDasharray="3 3"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-snow">{title}</p>
                      {rest.length > 0 && (
                        <p className="mt-0.5 text-[12px] leading-relaxed text-mist-dim">
                          {rest.join(" — ")}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Link
              to="/coach/training"
              className="flex items-center gap-2 border-t border-hairline px-4 py-3.5 text-[13px] text-azure transition-colors hover:text-azure-bright"
            >
              <span className="flex-1">View full preparation plan</span>
              <ArrowRight size={15} strokeWidth={1.7} />
            </Link>
          </Card>
        </Rise>
      )}

      {/*
        * THE HEADING USED TO SAY "Skills this class of mountain demands" AND
        * RENDER TRAINING VOLUME UNDER IT. On a curated page the list is
        * `trainingRequirements` — "8–10 h aerobic volume per week" — which is
        * not a skill; the actual skills (`technicalRequirements`) were over on
        * the Equipment tab under "Equipment essentials". Two headings, both
        * describing the other one's contents. They now say what they hold.
        */}
      <Rise className="pt-6">
        <SectionLabel>Training this mountain asks for</SectionLabel>
        <Card className="mt-3">
          <ul className="space-y-2.5">
            {curated.trainingRequirements.map((s) => (
              <li key={s} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                {s}
              </li>
            ))}
          </ul>
          {/*
            * THE GUIDE ADVISORY NOW READS THE FIELD THAT HOLDS THE JUDGEMENT.
            * It used to fire on `assessment.requiresGuide` — `band >= 4`, i.e.
            * "above 2,900 m" — and so appeared on Gran Paradiso, whose record
            * says the opposite.
            */}
          {curated.requiresProfessionalSupport && (
            <Disclaimer className="mt-4">
              ICEFALL's assessment of this mountain is that it should be climbed with a certified
              guide unless you already hold these skills and have current experience on comparable
              ground.
            </Disclaimer>
          )}
        </Card>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>Technical ground</SectionLabel>
        <Card className="mt-3">
          <ul className="space-y-2.5">
            {curated.technicalRequirements.map((t) => (
              <li key={t} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                {t}
              </li>
            ))}
          </ul>
        </Card>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>Required experience</SectionLabel>
        <Card className="mt-3">
          <p className="text-[13px] leading-relaxed text-mist">{curated.requiredExperience}</p>
        </Card>
      </Rise>

      {/*
        * THE SEASON NOTE IS GONE, and it was a live contradiction rather than
        * mere duplication. Verified on Toubkal, 2026-09-10: the badges read
        * "Spring · Autumn · Winter" from the curated record and the very next
        * line read "High northern peak — the window is generally June to
        * September" from `assessPeak`. Summer is the one season the expert
        * record excludes. The badges are the assessment; nothing else is.
        */}
      <Rise className="pt-6">
        <SectionLabel>Best season</SectionLabel>
        <Card className="mt-3">
          <div className="flex flex-wrap gap-2">
            {curated.bestSeasons.map((sn) => (
              <Badge key={sn} tone="azure" size="md">
                {SEASON_LABEL[sn]}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
            ICEFALL's assessment for this mountain. Conditions in any given year can close a season
            entirely — check a mountain forecast and the local guides office before committing.
          </p>
        </Card>
      </Rise>

      {data.preparationFooter && <Rise className="pt-8">{data.preparationFooter}</Rise>}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Equipment                                                                  */
/* -------------------------------------------------------------------------- */

/** Equipment — surveyed mountains only; the derived kit list is gone with the rest. */
function Equipment({ curated }: { curated: Mountain }) {
  const kit = curated.technicalRequirements;
  const products = curated.recommendedGearIds
    .map((id) => sync.productById(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <>
      <Rise className="pt-1">
        <SectionLabel>Equipment essentials</SectionLabel>
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2.5 overflow-x-auto px-5">
          {kit.map((k) => (
            <div key={k} className="w-[92px] shrink-0">
              <div className="grid aspect-square place-items-center rounded-tile border border-hairline bg-graphite">
                <Backpack size={22} strokeWidth={1.2} className="text-mist-dim" />
              </div>
              <p className="mt-2 text-[11px] leading-snug text-mist">{k}</p>
            </div>
          ))}
          <Link to="/gear" className="w-[92px] shrink-0">
            <div className="grid aspect-square place-items-center rounded-tile border border-dashed border-hairline-strong bg-graphite text-mist-dim transition-colors hover:border-azure/50 hover:text-azure">
              <Plus size={20} strokeWidth={1.4} />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-mist">View all gear</p>
          </Link>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
          ICEFALL doesn't make the technical kit — it's listed so the list is complete. The tiles
          are icons, not photographs of specific products.
        </p>
      </Rise>

      {products.length > 0 && (
        <Rise className="pt-6">
          <SectionLabel>Recommended ICEFALL system</SectionLabel>
          <div className="mt-3 space-y-2.5">
            {products.map((p) => (
              <GearCard key={p.id} product={p} />
            ))}
          </div>
        </Rise>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Expeditions                                                                */
/* -------------------------------------------------------------------------- */

function Expeditions({ data }: { data: MountainPageData }) {
  /*
   * `accessFor(...)` was computed here and never rendered — dead since
   * `noUnusedLocals` is off, so nothing complained. Removed rather than left
   * for the next reader to wonder about. `ACCESS_DISCLAIMER` below is a
   * constant and does not need it.
   */
  const expeditionGround = data.elevationM >= EXPEDITION_TERRAIN_M;
  const operators = expeditionGround
    ? operatorsFor({ country: data.country, elevationM: data.elevationM })
    : [];

  return (
    <>
      {/* Guides before companies: an individual guide suits an independent
          climber on a technical line, a company suits a full expedition. The
          athlete should meet both, and the distinction is spelled out on the
          guides screen itself. */}
      <Rise className="pt-1">
        <SectionLabel>Guides for {data.name}</SectionLabel>
        <Link
          to={`/explore/guides?peak=${encodeURIComponent(data.name)}&elevation=${data.elevationM}${data.lat !== undefined ? `&lat=${data.lat}` : ""}${data.lon !== undefined ? `&lon=${data.lon}` : ""}${data.country ? `&country=${encodeURIComponent(data.country)}` : ""}${data.goal ? `&goal=${data.goal.id}` : ""}`}
          className="mt-3 flex items-center gap-3.5 rounded-card border border-hairline bg-graphite p-4 transition-colors hover:border-azure/50"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-tile border border-hairline bg-elevated/40 text-mist">
            <MountainIcon size={17} strokeWidth={1.4} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] text-snow">Find a guide</span>
            <span className="mt-0.5 block text-[12px] leading-relaxed text-mist">
              Individual professional guides, matched to {data.name} and your dates.
            </span>
          </span>
          <ChevronRight size={16} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
        </Link>
      </Rise>

      {!expeditionGround && (
        <Rise className="pt-6">
          <p className="text-[12px] leading-relaxed text-mist-dim">
            {/*
              * REPHRASED SO THE SENTENCE IS ABOUT THE LISTINGS, NOT THE
              * MOUNTAIN. It used to open "{name} is a guided objective rather
              * than an expedition", which is a statement about what kind of
              * undertaking the peak is — and for an unsurveyed peak that
              * verdict came from its elevation and nothing else. What is
              * actually known here is a fact about the directory: no company
              * in it works this low.
              */}
            No expedition company is listed for {data.name}. Expedition companies organise permits,
            base camps and logistics for high peaks, and the lowest altitude any of them works at is
            above this summit. That is a fact about the directory, not a judgement about the
            mountain.
          </p>
          <Disclaimer className="mt-4">{ACCESS_DISCLAIMER}</Disclaimer>
        </Rise>
      )}

      {expeditionGround && (
        <Rise className="pt-1">
          <SectionLabel>Companies that work on this mountain</SectionLabel>
          <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
            Matched to {data.name} by region and working altitude. Ordered by that match, then
            alphabetically — no listing is promoted, sponsored or paid for.
          </p>

          {/* Placeholder businesses render first only because they are the fuller
            cards for evaluating this layout; they are badged DEMO and every
            number on them is invented. */}
          {operators.some((o) => o.demo) && <Disclaimer className="mt-3">{DEMO_NOTICE}</Disclaimer>}

          <div className="mt-3 space-y-2.5">
            {operators.map((o, i) => (
              <OperatorCard
                key={o.id}
                operator={o}
                lead={i === 0}
                rank={i === 0 ? undefined : i + 1}
                peak={{
                  name: data.name,
                  elevationM: data.elevationM,
                  lat: data.lat,
                  lon: data.lon,
                  goalId: data.goal?.id,
                }}
              />
            ))}
          </div>

          {operators.length === 0 && (
            <Card className="mt-3">
              <p className="text-[13px] leading-relaxed text-mist">
                No listing covers this objective. Use the search below to find IFMGA-certified
                operators who actually work here.
              </p>
            </Card>
          )}

          <Disclaimer className="mt-4">{OPERATOR_DISCLAIMER}</Disclaimer>
        </Rise>
      )}

      {expeditionGround && (
        <Rise className="pt-6">
          <SectionLabel>Find a real operator</SectionLabel>
          <a
            href={operatorSearchUrl(data.name)}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 flex items-center gap-2.5 rounded-card border border-hairline bg-graphite px-4 py-3.5 text-[13px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
          >
            <ExternalLink size={15} strokeWidth={1.6} className="shrink-0" />
            <span className="flex-1">Search certified operators for {data.name}</span>
          </a>
          <Disclaimer className="mt-4">{ACCESS_DISCLAIMER}</Disclaimer>
        </Rise>
      )}

      <Rise className="pt-6">
        <Link to="/messages">
          <Button variant="secondary" className="w-full">
            <MessageSquare size={15} strokeWidth={1.8} />
            Open your enquiries
          </Button>
        </Link>
      </Rise>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Ascents & conditions — the mountain's own log book                          */
/* -------------------------------------------------------------------------- */

/**
 * Place-anchored, deliberately. With few users, a feed with one post reads as
 * a dead app — but one conditions report on the mountain it describes reads as
 * signal, and it keeps its value for a season rather than a day. This is the
 * same design Camptocamp's outings and komoot's Highlights proved: attach the
 * content to the place, and the place's page becomes the community.
 */
function AscentsAndConditions({ data }: { data: MountainPageData }) {
  useSummitLogs(); // subscribe, so a new log appears without a reload
  useOwnPosts();
  const [logging, setLogging] = useState(false);
  const [posting, setPosting] = useState(false);
  const recorded = useRecordedActivities();
  const { settings } = useSettings();
  const { user } = useApp();
  const logs = logsForPeak(data.name, data.objectiveId);
  const posts = postsForMountain(data.name, data.objectiveId);
  const me = {
    name: user.name,
    region: settings.region || user.homeBase || undefined,
    avatar: settings.avatar,
  };

  return (
    <Rise className="pt-7">
      <div className="flex items-baseline justify-between">
        <SectionLabel>Ascents &amp; conditions</SectionLabel>
        {logs.length + posts.length > 0 && (
          <span className="tnum text-[11.5px] text-mist-dim">{logs.length + posts.length}</span>
        )}
      </div>

      {logs.length > 0 && (
        <div className="mt-3 space-y-2.5">
          {logs.map((log) => (
            <SummitLogCard
              key={log.id}
              log={log}
              compact
              showPeakLink={false}
              onRemove={() => removeSummitLog(log.id)}
            />
          ))}
        </div>
      )}

      {posts.length > 0 && (
        <div className="mt-3 space-y-3">
          {posts.map((post) => (
            <OwnPostCard key={post.id} post={post} author={me} recorded={recorded} />
          ))}
        </div>
      )}

      {/* The mockup's recruiting card. When logs exist it collapses to the
          button alone — the invitation has been answered. */}
      {logs.length === 0 && posts.length === 0 ? (
        <div className="mt-3 rounded-card border border-hairline bg-graphite p-5 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-azure/40 text-azure">
            <MountainIcon size={20} strokeWidth={1.5} />
          </span>
          <p className="mt-3 text-[14.5px] text-snow">Be the first to log conditions this season</p>
          <p className="mx-auto mt-1.5 max-w-[260px] text-[11.5px] leading-relaxed text-mist-dim">
            A route note and a snow line is all another climber needs.
          </p>
          <button
            type="button"
            onClick={() => setLogging(true)}
            className="mt-4 rounded-card bg-azure px-5 py-3 text-[12.5px] uppercase tracking-[0.08em] text-obsidian transition-colors hover:bg-azure-bright"
          >
            I've made it to this summit
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLogging(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-card border border-azure/45 bg-azure/[0.07] py-3.5 text-[13px] text-azure transition-colors hover:bg-azure/[0.13]"
        >
          I've made it to this summit
        </button>
      )}

      <button
        type="button"
        onClick={() => setPosting(true)}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-card border border-hairline-strong py-3 text-[12.5px] text-mist transition-colors hover:border-azure/45 hover:text-snow"
      >
        Post about {data.name}
      </button>

      {/* ---- This mountain's board ------------------------------------- */}
      <div className="mt-6">
        <p className="section-label text-mist">Most ascents</p>
        <div className="mt-2.5 rounded-card border border-hairline bg-graphite p-5 text-center">
          <p className="text-[13.5px] text-snow">{EMPTY_MOUNTAIN_BOARD_TITLE}</p>
          <p className="mx-auto mt-1.5 max-w-[270px] text-[11.5px] leading-relaxed text-mist-dim">
            {EMPTY_MOUNTAIN_BOARD_BODY}
          </p>
        </div>
      </div>

      {posting && (
        <CreatePostSheet
          presetMountain={{
            name: data.name,
            peakId: data.objectiveId,
            elevationM: data.elevationM,
          }}
          onClose={() => setPosting(false)}
        />
      )}

      {logging && (
        <LogSummitSheet
          prefill={{ peakName: data.name, peakId: data.objectiveId, elevationM: data.elevationM }}
          onClose={() => setLogging(false)}
        />
      )}
    </Rise>
  );
}
