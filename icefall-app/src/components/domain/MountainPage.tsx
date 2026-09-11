import { useEffect, useMemo, useState } from "react";
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
import { MountainMap3D } from "@/components/map/MountainMap3D";
import {
  BASIS_LABEL,
  NO_COSTS_RECORDED,
  costsFor,
  daysFromDurationLabel,
  money,
  requiredTotal,
  type MountainCostRecord,
} from "@/data/mountainCosts";
import {
  CAMP_KIND_LABEL,
  OSM_ATTRIBUTION,
  OSM_COPYRIGHT_URL,
  campsFor,
  mapCaption,
  osmUrl,
  type MountainCampRecord,
} from "@/data/mountainCamps";
import {
  HAZARD_STANDARD,
  MONTHS,
  MONTH_LABEL,
  MONTH_SHORT,
  NO_HAZARDS_RECORDED,
  NO_MONTH_RATING,
  NO_SEASON_RECORDED,
  RATING_LABEL,
  RATING_MEANING,
  SEVERITY_LABEL,
  monthPictureFor,
  ratedMonthCount,
  seasonComparison,
  seasonFor,
  type Hazard,
  type Month,
  type MonthEntry,
  type MonthRating,
  type MountainSeasonRecord,
} from "@/data/mountainSeason";
import {
  CEILING_KIND_LABEL,
  NO_CEILING_RECORDED,
  NO_CHARGING_RECORDED,
  NO_RESCUE_RECORDED,
  ceilingGapSentence,
  highestCeilingM,
  rescueFor,
  sourcesIn,
  type MountainRescueRecord,
} from "@/data/mountainRescue";
import {
  BACKING_LABEL,
  NO_FACTS_RECORDED,
  backingStrength,
  factsFor,
  figureLabel,
  partyLabel,
  type Backing,
  type LocalName,
  type MountainFactRecord,
} from "@/data/mountainFacts";
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
  /*
   * FOUR GROUPS ON ONE SCROLL, not five tabs.
   *
   * Tabs hid four fifths of the page behind a guess about which word meant
   * what. The four groups below are the four questions somebody actually
   * arrives with — could I, what does it take, who takes me, and when — and
   * every one of them answers itself in a line before it asks you to read
   * anything. Depth that used to be a tab is now behind a row.
   *
   * A reference entry keeps only the two groups it can answer honestly. The
   * chips for the others are ABSENT rather than empty, the same way the page
   * drops the grade: the missing furniture is the signal.
   */
  const groups = useMemo(() => {
    const g: { id: GroupId; label: string }[] = [{ id: "couldi", label: "Could I?" }];
    if (curated) g.push({ id: "takes", label: "What it takes" });
    g.push({ id: "who", label: "Who & how" });
    if (curated) g.push({ id: "when", label: "When & safety" });
    return g;
  }, [curated]);

  const active = useScrollSpy(groups.map((g) => g.id));
  const [routeSheet, setRouteSheet] = useState(false);
  const [aboutSheet, setAboutSheet] = useState(false);
  const [costSheet, setCostSheet] = useState(false);
  const costs = costsFor(data.curatedId);

  const supportLine = curated
    ? curated.requiresProfessionalSupport
      ? "ICEFALL's assessment is that this one wants a certified guide."
      : "ICEFALL's assessment is that this one can be climbed independently, with the skills below."
    : "";

  return (
    <Screen padded={false}>
      <MountainHero
        data={data}
        gallery={gallery}
        facts={facts}
        onOpenRecord={() => setAboutSheet(true)}
      />

      {curated ? (
        <ObjectiveStats curated={curated} elevationM={data.elevationM} />
      ) : (
        <ReferenceStats data={data} facts={facts} />
      )}

      <div className="sticky top-0 z-20 -mt-px border-b border-hairline bg-obsidian/95 backdrop-blur">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 py-2">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => jumpToGroup(g.id)}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-2 text-[11.5px] font-semibold whitespace-nowrap transition-colors",
                active === g.id
                  ? "border-azure/45 bg-azure/15 text-snow"
                  : "border-hairline bg-graphite text-mist-dim hover:text-mist",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pb-4">
        {/* ---- Could I? -------------------------------------------------- */}
        <MountainGroup
          id="couldi"
          kicker="Could I?"
          title={curated ? "Where you stand" : "What ICEFALL knows"}
          lead={curated ? `${curated.difficultyLabel}. ${supportLine}` : REFERENCE_NO_READINESS}
        >
          {curated ? (
            <Preparation data={data} curated={curated} part="standing" />
          ) : (
            <p className="pt-1 text-[13px] leading-relaxed text-mist">{REFERENCE_NEXT_STEP}</p>
          )}
        </MountainGroup>

        {/* ---- What it takes --------------------------------------------- */}
        {curated && (
          <MountainGroup
            id="takes"
            kicker="What it takes"
            title="The climb, and the training for it"
            lead={`${curated.routes.length} ${curated.routes.length === 1 ? "route" : "routes"} on ICEFALL's record. ${curated.typicalDurationLabel}.`}
          >
            <TerrainShowcase data={data} />
            <WalkableRoutes data={data} />
            <Preparation data={data} curated={curated} part="training" />
            <DepthRow
              title="Route details"
              sub="Every route, the technical kit, the recommended system"
              onClick={() => setRouteSheet(true)}
            />
          </MountainGroup>
        )}

        {/* ---- Who & how -------------------------------------------------- */}
        <MountainGroup
          id="who"
          kicker="Who & how"
          title={data.elevationM >= EXPEDITION_TERRAIN_M ? "Expeditions and operators" : "Guides"}
          lead={
            data.elevationM >= EXPEDITION_TERRAIN_M
              ? "Who runs trips here, and what ICEFALL can and cannot check about them."
              : "Who will take you up, and what ICEFALL can and cannot check about them."
          }
        >
          <Expeditions data={data} />
          <CostsBlock data={data} onOpen={() => setCostSheet(true)} />
        </MountainGroup>

        {/* ---- When & safety ---------------------------------------------- */}
        {curated && (
          <MountainGroup
            id="when"
            kicker="When & safety"
            title="Best months"
            lead={`${curated.bestSeasons.map((sn) => SEASON_LABEL[sn]).join(" · ")}. ICEFALL's assessment for this mountain.`}
          >
            <Preparation data={data} curated={curated} part="season" />
            <SeasonSection data={data} curated={curated} />
            <HazardSection data={data} />
            <RescueSection data={data} />
            <AscentsAndConditions data={data} />
          </MountainGroup>
        )}

        {/* ---- the page's own footer: one row ------------------------------ */}
        <div className="border-t border-hairline px-5 pt-4">
          <DepthRow
            title={`About ${data.name}`}
            sub="The facts, their sources, photography and what you have logged here"
            onClick={() => setAboutSheet(true)}
          />
        </div>
      </div>

      <ActionBar data={data} facts={facts} />

      {routeSheet && curated && (
        <Sheet title="Route details" onClose={() => setRouteSheet(false)}>
          <div className="px-5 pb-6">
            <Routes mountain={curated} />
            <Equipment curated={curated} />
          </div>
        </Sheet>
      )}

      {costSheet && costs && (
        <Sheet title="Costs & permits" onClose={() => setCostSheet(false)}>
          <div className="px-5 pb-6">
            <CostBreakdown record={costs} curated={curated} />
          </div>
        </Sheet>
      )}

      {aboutSheet && (
        <Sheet title={`About ${data.name}`} onClose={() => setAboutSheet(false)}>
          <div className="px-5 pb-6">
            <Overview
              data={data}
              gallery={gallery}
              articleUrl={articleUrl}
              facts={facts}
              factsState={factsState}
            />
          </div>
        </Sheet>
      )}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* The terrain showcase, the walkable routes, and what it costs               */
/* -------------------------------------------------------------------------- */

/**
 * THE MOUNTAIN IN 3D, FULL WIDTH, AS THE FIRST THING UNDER "what it takes".
 *
 * Charlie, 11 Sep 2026: "Implement the 3D map with a showcase of camps and
 * trails people can follow." The terrain half was already built — real
 * elevation, a real camera. What it did not have was anything on it.
 *
 * IT NOW HAS CAMPS, AND THAT MOVED THE HONESTY PROBLEM RATHER THAN SOLVING
 * IT. The caption used to be a fixed sentence ending "ICEFALL holds no
 * coordinates for them on this mountain". That sentence was true when nothing
 * was marked and became a lie the moment anything was — on the one screen
 * where a lie about what is and is not surveyed could get somebody hurt. So
 * the caption is no longer written here at all: `mapCaption` derives it from
 * the same record that supplies the markers, and the three cases it has to
 * tell apart — camps marked, harvested-and-none, never-harvested — are that
 * function's problem, next to the data that decides them.
 *
 * WHAT IS STILL NOT DRAWN: the climbing lines. `MountainRoute` carries a name,
 * a grade, a distance and an ascent, and no geometry at all, so there is
 * nothing to draw and nothing is drawn. Joining two real camps with a plausible
 * line would be an invented line over real photography, which is worse than a
 * blank one.
 */
function TerrainShowcase({ data }: { data: MountainPageData }) {
  /* null here means "never harvested", not "has none" — see `campsFor`. Both
     end up with an empty marker array and DIFFERENT captions, which is the
     entire point of keeping the record rather than just its camps. */
  const record = campsFor(data.curatedId);

  /*
   * MEMOISED, AND NOT AS A MICRO-OPTIMISATION. `MountainMap3D` re-frames the
   * camera whenever the `camps` array identity changes. This page re-renders
   * on every scroll tick, because the chip rail is a scroll-spy — so a fresh
   * array here would drag the camera back to its default framing under the
   * reader's finger every time they scrolled or panned. Same record in, same
   * array out.
   */
  const mapCamps = useMemo(
    () =>
      (record?.camps ?? []).map((c) => ({
        name: c.name,
        lat: c.lat,
        lon: c.lon,
        elevationM: c.elevationM,
      })),
    [record],
  );

  /* AFTER the hook, not before it. A peak with no coordinates renders nothing,
     but bailing out above `useMemo` would make the hook conditional and change
     the hook order between two mountains — the same bug the map component
     guards against with its build-time OFFLINE constant. */
  if (data.lat === undefined || data.lon === undefined) return null;

  return (
    <Rise className="pt-5">
      <div className="-mx-5">
        <MountainMap3D
          lat={data.lat}
          lon={data.lon}
          name={data.name}
          camps={mapCamps}
          className="h-[340px] w-full"
        />
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{mapCaption(record)}</p>
      {record && record.camps.length > 0 && <CampRows record={record} />}
    </Rise>
  );
}

/**
 * THE CAMPS AS FLAT ROWS, each one a tap to the OpenStreetMap object it was
 * read off. No cards: a row, a hairline, and the altitude on the right.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO. It does not fill in a missing
 * altitude — "not recorded" is printed where OSM carries no `ele` tag, because
 * a climber reading 3,850 m that ICEFALL interpolated off a DEM has been told
 * something nobody surveyed. And it does not order the rows by walking order,
 * only by altitude, because on Kilimanjaro two routes merge and the
 * acclimatisation day crosses Lava Tower higher than the camps on either side
 * of it — so "lowest first" is the claim, and it is one that is always true.
 *
 * THE ATTRIBUTION IS NOT DECORATION. OpenStreetMap is ODbL, which obliges
 * credit wherever the data is shown; the string is imported required rather
 * than typed here so it cannot go missing in an edit.
 */
function CampRows({ record }: { record: MountainCampRecord }) {
  const n = record.camps.length;
  return (
    <div className="pt-6">
      <SectionLabel>Camps and huts</SectionLabel>
      <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
        {n} {n === 1 ? "place" : "places"} OpenStreetMap maps on the {record.routeBasis}, lowest
        first. Each row opens the map object it was read from.
      </p>
      <div className="mt-2">
        {record.camps.map((c, i) => (
          <a
            key={`${c.osmType}/${c.osmId}`}
            href={osmUrl(c)}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "flex min-h-[44px] items-center gap-3 py-3",
              i !== 0 && "border-t border-hairline",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] text-snow">{c.name}</span>
              <span className="mt-0.5 block truncate text-[11px] text-mist-dim">
                {CAMP_KIND_LABEL[c.kind]}
                {c.nameEn ? ` · ${c.nameEn}` : ""}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-[12px] text-mist-dim">
              {c.elevationM !== null ? `${fmtElevation(c.elevationM)} m` : "not recorded"}
            </span>
            <ExternalLink size={14} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
          </a>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
        Altitudes are OpenStreetMap's own where it carries one; "not recorded" means it carries
        none and ICEFALL has not filled the gap in. {OSM_ATTRIBUTION}{" "}
        <a
          href={OSM_COPYRIGHT_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          Licence
        </a>
        .
      </p>
    </div>
  );
}

/**
 * The lines somebody can actually follow, which are walking routes.
 *
 * These are real: curated treks with real geometry. They are kept visibly
 * apart from the climbing routes above, because a fortnight's valley walking
 * and a summit day are not the same product and were once listed together.
 */
function WalkableRoutes({ data }: { data: MountainPageData }) {
  const treks = data.curatedId ? treksForMountain(data.curatedId) : [];
  if (treks.length === 0) return null;
  return (
    <Rise className="pt-6">
      <SectionLabel>Routes you can follow on the ground</SectionLabel>
      <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
        {treks.length} {treks.length === 1 ? "route walks" : "routes walk"} to or around{" "}
        {data.name}, each with a mapped line. Walking, not climbing.
      </p>
      <div className="mt-2">
        {treks.map((t, i) => (
          <Link
            key={t.id}
            to={`/explore/trek/${t.id}`}
            className={cn(
              "flex min-h-[44px] items-center justify-between gap-3 py-3",
              i !== 0 && "border-t border-hairline",
            )}
          >
            <span className="min-w-0 flex-1 truncate text-[14px] text-snow">{t.name}</span>
            <span className="shrink-0 tabular-nums text-[12px] text-mist-dim">
              {t.durationDays ? `${t.durationDays[0]}–${t.durationDays[1]} days` : "—"}
            </span>
            <ChevronRight size={16} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
          </Link>
        ))}
      </div>
    </Rise>
  );
}

/**
 * WHAT IT COSTS — the permit answer, the required total, and one row in.
 *
 * The figures come from `data/mountainCosts.ts`, where each one was read off a
 * named page on a recorded date. Two things are on the page rather than in the
 * sheet, because they are the two a reader came for: whether a permit is
 * needed at all, and roughly what the unavoidable fees add up to.
 *
 * THE TOTAL SAYS WHAT IT IS. It is the REQUIRED lines only, for the curated
 * duration, per person — not the price of the trip. On Everest that distinction
 * is the difference between USD 15,000 and a six-figure expedition, so the
 * caption says so in words rather than leaving the number to be misread.
 */
function CostsBlock({ data, onOpen }: { data: MountainPageData; onOpen: () => void }) {
  const record = costsFor(data.curatedId);

  if (!record) {
    return (
      <Rise className="pt-6">
        <SectionLabel>Costs &amp; permits</SectionLabel>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{NO_COSTS_RECORDED}</p>
      </Rise>
    );
  }

  const span = data.curated ? daysFromDurationLabel(data.curated.typicalDurationLabel) : null;
  const total = span ? requiredTotal(record, span.days, span.nights) : null;

  return (
    <Rise className="pt-6">
      <SectionLabel>Costs &amp; permits</SectionLabel>

      <p className="mt-1.5 text-[15px] leading-snug font-semibold text-snow">
        {record.permit.statement}
      </p>
      {record.permit.kind === "none" && record.permit.insteadRequired && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
          {record.permit.insteadRequired}
        </p>
      )}
      {record.permit.kind === "required" && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{record.permit.obtainedBy}</p>
      )}

      {total && span && (
        <div className="mt-4 border-t border-hairline pt-3.5">
          <p className="tnum text-[22px] leading-tight font-semibold text-snow">
            {money(total.min, total.max, total.currency)}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-mist-dim">
            Unavoidable fees only, per person, for {span.days} days. Not the price of the trip —
            a guide, travel, insurance and kit are all on top.
          </p>
        </div>
      )}

      <SourceLine {...costSourceProps(record)} />

      <DepthRow
        title="See the full breakdown"
        sub="Every fee, what it covers, and what is not in the total"
        onClick={onOpen}
      />
    </Rise>
  );
}

/**
 * WHO PUBLISHED THIS, AND WHEN WE READ IT. Never omitted, and now ONE
 * component for all five data files rather than one per file.
 *
 * It started life taking a `MountainCostRecord` and reaching into it. Four
 * more sourced files landed the same day — camps, facts, rescue, seasons —
 * and each of them carries the same three things under different field names
 * (`source`/`sourceKind`/`checked` on a cost record, a `SourceRef` with `kind`
 * everywhere else). Copying this component five times is how the five sheet
 * implementations drifted before `Sheet` existed, so it takes the three values
 * instead of a record and the callers unpack.
 *
 * `kind` has THREE values here, because `mountainSeason.ts` has three. A
 * peer-reviewed paper is not a tourist board and is not the park service, and
 * flattening "study" into either would be laundering in one direction or
 * slandering in the other.
 *
 * TWO CLASSES THAT DID NOTHING, fixed on the way past: this line and the
 * caveat bullets in `CostBreakdown` asked for `text-amber` and `bg-alert`.
 * Neither exists in the theme — measured in the live app on 2026-09-11, both
 * computed to the inherited colour, so the one sentence on the costs block
 * warning a reader not to trust the figure rendered in the same grey as the
 * rest of the line. The token is `alert`.
 */
function SourceLine({
  label,
  url,
  kind,
  checked,
  issuerNote,
  secondaryNote,
  className,
}: {
  label: string;
  url: string;
  kind: "issuer" | "study" | "secondary";
  checked: string;
  issuerNote?: string;
  secondaryNote?: string;
  className?: string;
}) {
  return (
    <p className={cn("mt-3 text-[11px] leading-relaxed text-mist-dim", className)}>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-azure underline decoration-azure/40 underline-offset-2"
      >
        {label}
      </a>{" "}
      · read {fmtDate(checked)} ·{" "}
      {kind === "issuer" ? (
        <span className="text-mist">
          {issuerNote ?? "an official publication, not a second-hand summary"}
        </span>
      ) : kind === "study" ? (
        <span className="text-mist">
          a published study — authoritative about its own measurements and nothing else
        </span>
      ) : (
        <span className="text-alert">
          {secondaryNote ?? "not the issuer\u2019s own page — check it before you rely on it"}
        </span>
      )}
    </p>
  );
}

/** A cost record's three source values, in the shape `SourceLine` takes. */
function costSourceProps(record: MountainCostRecord) {
  return {
    label: record.source.label,
    url: record.source.url,
    kind: record.sourceKind,
    checked: record.checked,
    issuerNote: "published by the body that charges it",
    secondaryNote: "not the issuer\u2019s own page — confirm before you pay",
  } as const;
}

/** Every line, what it covers, and everything the total leaves out. */
function CostBreakdown({
  record,
  curated,
}: {
  record: MountainCostRecord;
  curated: Mountain | undefined;
}) {
  const span = curated ? daysFromDurationLabel(curated.typicalDurationLabel) : null;
  const total = span ? requiredTotal(record, span.days, span.nights) : null;

  return (
    <>
      <p className="text-[13px] leading-relaxed text-mist">{record.permit.statement}</p>
      {record.permit.kind === "required" && (
        <div className="mt-3">
          <KV k="Issued by" v={record.permit.issuedBy} />
          <KV k="Obtained by" v={record.permit.obtainedBy} />
          {record.permit.leadTime && <KV k="Lead time" v={record.permit.leadTime} />}
        </div>
      )}
      {record.permit.kind === "none" && record.permit.insteadRequired && (
        <div className="mt-3">
          <KV k="Required instead" v={record.permit.insteadRequired} />
        </div>
      )}

      <p className="section-label mt-6 text-mist-dim">The fees</p>
      <div className="mt-1">
        {record.lines.map((l, i) => (
          <div key={l.label} className={cn("py-3.5", i !== 0 && "border-t border-hairline")}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 flex-1 text-[14px] leading-snug text-snow">{l.label}</p>
              <p className="tnum shrink-0 text-[14px] font-semibold text-snow">
                {money(l.min, l.max, l.currency)}
              </p>
            </div>
            <p className="mt-0.5 text-[12px] text-mist-dim">
              {BASIS_LABEL[l.basis]}
              {l.requirement === "optional" ? " · optional" : " · required"}
            </p>
            {l.note && <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{l.note}</p>}
          </div>
        ))}
      </div>

      {total && span && (
        <div className="mt-2 border-t border-hairline pt-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[14px] text-snow">Required fees, {span.days} days</p>
            <p className="tnum text-[17px] font-semibold text-snow">
              {money(total.min, total.max, total.currency)}
            </p>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-mist-dim">Per person.</p>
        </div>
      )}

      {record.caveats && record.caveats.length > 0 && (
        <>
          <p className="section-label mt-6 text-mist-dim">What this total does not include</p>
          <ul className="mt-1.5 space-y-2">
            {record.caveats.map((c) => (
              <li key={c} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-alert" />
                {c}
              </li>
            ))}
          </ul>
        </>
      )}

      <SourceLine {...costSourceProps(record)} />
    </>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-t border-hairline py-3 first:border-t-0 first:pt-0">
      <p className="section-label text-[9px] text-mist-dim">{k}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-mist">{v}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The group shell, the depth row and the scroll-spy                          */
/* -------------------------------------------------------------------------- */

type GroupId = "couldi" | "takes" | "who" | "when";

/**
 * A group: its question, its one-line answer, then whatever it holds.
 *
 * No card round the group. The hairline and the space are the separation —
 * a border on top of a border is the thing the owner keeps sending back.
 */
function MountainGroup({
  id,
  kicker,
  title,
  lead,
  children,
}: {
  id: GroupId;
  kicker: string;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`mg-${id}`}
      className="scroll-mt-[104px] border-t border-hairline px-5 pt-5 pb-6 first:border-t-0"
    >
      <p className="section-label text-azure">{kicker}</p>
      <h2 className="mt-1.5 text-[19px] leading-tight font-semibold text-snow">{title}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-mist">{lead}</p>
      {children}
    </section>
  );
}

/** One row into depth. The same shape everywhere, so it reads as one idea. */
function DepthRow({
  title,
  sub,
  onClick,
}: {
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 flex min-h-[44px] w-full items-center gap-3 border-t border-hairline pt-4 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-snow">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-mist-dim">{sub}</span>
      </span>
      <ChevronRight size={18} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
    </button>
  );
}

/** Scroll the group under the chips rather than under the sticky bar. */
function jumpToGroup(id: GroupId) {
  const el = document.getElementById(`mg-${id}`);
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

/**
 * Which group is under the chips right now.
 *
 * `Screen` is a scrolling div, not the window, so this listens to the nearest
 * scrolling ancestor and falls back to the window rather than silently never
 * firing.
 */
function useScrollSpy(ids: GroupId[]): GroupId {
  const key = ids.join("|");
  const [activeId, setActiveId] = useState<GroupId>(ids[0]);

  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(`mg-${id}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;

    const root = els[0].closest<HTMLElement>(".overflow-y-auto");
    const onScroll = () => {
      /* Just below the sticky chips, and BELOW where `scroll-mt` parks a
         group after a chip tap — at 112 a jumped-to group landed 6px under
         the line and the chip for the PREVIOUS group stayed lit. */
      const line = (root ? root.getBoundingClientRect().top : 0) + 132;
      let best = els[0];
      for (const el of els) if (el.getBoundingClientRect().top <= line) best = el;
      setActiveId(best.id.replace("mg-", "") as GroupId);
    };

    onScroll();
    const target: HTMLElement | Window = root ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [key]);

  return activeId;
}

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
  onOpenRecord,
}: {
  data: MountainPageData;
  gallery: ReturnType<typeof useMountainGallery>;
  facts: PeakFacts | null;
  onOpenRecord: () => void;
}) {
  const curated = data.curated;
  const tier = tierOf(curated);
  const country = countryOf(data, facts);
  const goal = data.goal;
  const [frame, setFrame] = useState(0);
  const [options, setOptions] = useState(false);
  const images = gallery.images;
  const i = Math.min(frame, Math.max(0, images.length - 1));
  /*
   * THE NAME ON THE LOCAL MAP BELONGS AT THE TOP OF THE PAGE.
   *
   * सगरमाथा is not a footnote about Everest; on the ground it is the name.
   * `mountainFacts.ts` holds the native labels Wikidata carries, with a source
   * and a read date for each, and the first that is not already the title goes
   * under the title here.
   *
   * IT IS A BUTTON, AND THAT IS NOT DECORATION. Rule one of this app is that a
   * sourced fact shows its source; a 13px line over a photograph cannot carry
   * one, so the line opens the record sheet where the name, its language, what
   * it means (or the reason nobody has established what it means) and the page
   * it was read from all sit together.
   */
  const heroLocalName =
    factsFor(data.curatedId)?.localNames.find((n) => n.name !== data.name) ?? null;

  return (
    <div className="relative">
      {/*
        THE PICTURE IS THE FIRST THING, WITH NOTHING ABOVE IT.
        The route is on `isFullScreenRoute` now, so there is no app top bar and
        no Explore header here: this runs edge to edge and up under the status
        bar. Sized exactly as the trek and trail heroes are, because Charlie
        asked for the same treatment and two pages with the same job should not
        drift apart by a handful of pixels.
      */}
      <div
        className="on-dark relative w-full shrink-0 overflow-hidden bg-slate"
        style={{ height: "46vh", maxHeight: "440px", minHeight: "310px" }}
      >
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
              {heroLocalName ? (
                <button
                  type="button"
                  onClick={onOpenRecord}
                  aria-label={`${heroLocalName.name} — the ${heroLocalName.language} name. Open the record to see where it comes from.`}
                  className="mt-1 flex items-center gap-1.5 text-left"
                >
                  <span className="text-[14px] text-mist">{heroLocalName.name}</span>
                  <span className="text-[11px] text-mist-dim">{heroLocalName.language}</span>
                  <ChevronRight size={12} strokeWidth={1.8} className="text-mist-dim" />
                </button>
              ) : data.localName && data.localName !== data.name ? (
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

/**
 * The figures under the hero. NO BOXES.
 *
 * This was a bordered card holding five bordered cells, and Charlie has now
 * rejected that shape twice: "I said no boxes that look ai made". The trail
 * page already had the answer — a plain grid between two hairlines, the figure
 * first and the label under it — so this is that, not a third invention.
 *
 * The value leads because it is what a reader is looking for; the label and
 * its provenance sit underneath in the sizes the trail page uses.
 */
function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <div className="px-5">
      <div className="no-scrollbar flex gap-x-6 overflow-x-auto border-y border-hairline py-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-[92px] shrink-0">
            <p className="tnum text-[17px] leading-tight font-semibold text-snow">{s.value}</p>
            <p className="section-label mt-1.5 text-[9px] text-mist-dim">{s.label}</p>
            {s.hint && <p className="mt-1 text-[10px] leading-snug text-mist-dim">{s.hint}</p>}
          </div>
        ))}
      </div>
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

      {/* THE RECORD — first ascent, prominence, the names it is known by.
          Curated mountains only: `mountainFacts.ts` covers the fourteen, and a
          reference entry's facts already come through `usePeakFacts`. */}
      {curated && <PeakRecord record={factsFor(data.curatedId)} />}

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
      {/* "Treks here" moved to "What it takes" as `WalkableRoutes`, next to the
          3D map, where the routes somebody can actually follow belong. */}

      {/* The terrain map moved to "What it takes", full width and in 3D, where
          it is the showcase Charlie asked for rather than a 240px thumbnail
          buried at the bottom of a tab. See `TerrainShowcase`. */}

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
/**
 * Preparation, split three ways so the chip groups can each take their own
 * half of it. Nothing moved out of this function — the same blocks render,
 * under whichever heading now asks for them:
 *
 *   "standing" → the goal ring, the open gaps, technical ground, required
 *                experience.  This is "Could I?".
 *   "training" → what the mountain asks you to train.  "What it takes".
 *   "season"   → the best-season assessment.  "When & safety".
 */
type PrepPart = "standing" | "training" | "season";

function Preparation({
  data,
  curated,
  part,
}: {
  data: MountainPageData;
  curated: Mountain;
  part: PrepPart;
}) {
  const goal = data.goal;
  return (
    <>
      {part === "standing" && (goal ? (
        <Rise className="pt-5">
          <div className="border-t border-hairline pt-4">
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
          </div>
        </Rise>
      ) : (
        <Rise className="pt-5">
          <p className="border-t border-hairline pt-4 text-[13px] leading-relaxed text-mist">
            Set this mountain as your goal and ICEFALL builds a training plan backwards from your
            target date, then tracks preparation against what you actually complete.
          </p>
        </Rise>
      ))}

      {part === "standing" && goal?.gaps && goal.gaps.length > 0 && (
        <Rise className="pt-6">
          <SectionLabel>What stands between you and the summit</SectionLabel>
          <div className="mt-2">
            <ul>
              {goal.gaps.map((g, i) => {
                // Everything here is outstanding by definition — a gap that
                // closed stops being a gap. The marker says "open", not "done".
                const [title, ...rest] = g.split(" — ");
                return (
                  <li
                    key={g}
                    className={cn(
                      "flex items-start gap-3 py-3",
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
              className="flex min-h-[44px] items-center gap-2 border-t border-hairline py-3 text-[13px] text-azure transition-colors hover:text-azure-bright"
            >
              <span className="flex-1">View full preparation plan</span>
              <ArrowRight size={15} strokeWidth={1.7} />
            </Link>
          </div>
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
      {part === "training" && (
      <Rise className="pt-6">
        <SectionLabel>Training this mountain asks for</SectionLabel>
        <div className="mt-2">
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
        </div>
      </Rise>
      )}

      {part === "standing" && (
      <Rise className="pt-6">
        <SectionLabel>Technical ground</SectionLabel>
        <div className="mt-2">
          <ul className="space-y-2.5">
            {curated.technicalRequirements.map((t) => (
              <li key={t} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </Rise>
      )}

      {part === "standing" && (
      <Rise className="pt-6">
        <SectionLabel>Required experience</SectionLabel>
        <p className="mt-2 text-[13px] leading-relaxed text-mist">{curated.requiredExperience}</p>
      </Rise>
      )}

      {/*
        * THE SEASON NOTE IS GONE, and it was a live contradiction rather than
        * mere duplication. Verified on Toubkal, 2026-09-10: the badges read
        * "Spring · Autumn · Winter" from the curated record and the very next
        * line read "High northern peak — the window is generally June to
        * September" from `assessPeak`. Summer is the one season the expert
        * record excludes. The badges are the assessment; nothing else is.
        */}
      {/*
        * THE BADGE BLOCK NOW STANDS DOWN WHERE A SOURCED MONTH STRIP EXISTS.
        *
        * `SeasonSection` renders directly under this one and its comparison
        * line already names ICEFALL's own seasons in words — as does the
        * group's lead, two rows above. Three statements of "Summer" inside one
        * screen is the kind of repetition that put this page at 13,000px.
        * Where no month record exists (K2, Broad Peak, Annapurna, Eiger,
        * Toubkal) the badges are all there is and they stay.
        */}
      {part === "season" && seasonFor(data.curatedId) === null && (
      <Rise className="pt-6">
        <SectionLabel>Best season</SectionLabel>
        <div className="mt-2">
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
        </div>
      </Rise>

      )}

      {part === "season" && data.preparationFooter && (
        <Rise className="pt-8">{data.preparationFooter}</Rise>
      )}
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
/* -------------------------------------------------------------------------- */
/* The record — first ascent, prominence, the names it is known by            */
/* -------------------------------------------------------------------------- */

/**
 * THE MOUNTAIN'S OWN RECORD, in the "About" sheet, where depth belongs.
 *
 * `data/mountainFacts.ts` is built so that dishonesty is hard to express: its
 * `Maybe<T>` has no null branch, so a missing first ascent carries the REASON
 * it is missing and cannot silently render as a blank. Six of the fourteen
 * curated mountains hold no first ascent — Kilimanjaro and Aconcagua among
 * them — and each says why in its own words.
 *
 * TWO LEVELS OF PROVENANCE, BOTH SHOWN. `SourceLine` says where ICEFALL read
 * the figure; `backing` says what THAT page cites for itself, which for
 * Wikidata is the question that matters. Mount Olympus's height cites a
 * peer-reviewed paper and Gran Paradiso's prominence cites only an import from
 * the German Wikipedia. Printing both as "Wikidata" and stopping there would
 * flatten a real difference into a uniform grey.
 */
/**
 * WHAT A SECONDARY SOURCE IS, IN THE RECORD SHEET SPECIFICALLY.
 *
 * The default warning on `SourceLine` is "check it before you rely on it",
 * which is the right sentence for a hut tariff and the wrong one here: every
 * row in this sheet but one is Wikidata, the reader will see the line eight
 * times, and the useful thing to say is WHY it is secondary rather than what
 * to do about it. What to do about it is the `backing` line directly above.
 */
const AGGREGATOR_NOTE = "an aggregator, never the body whose fact it is";

function BackingLine({ backing }: { backing: Backing | null }) {
  const strength = backingStrength(backing);
  return (
    <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
      {BACKING_LABEL[strength]}
      {backing ? ` — ${backing.text}` : ""}
      {backing?.url && (
        <>
          {" "}
          <a
            href={backing.url}
            target="_blank"
            rel="noreferrer"
            className="text-azure underline decoration-azure/40 underline-offset-2"
          >
            Open it
          </a>
        </>
      )}
    </p>
  );
}

/** One fact, or one named absence. The same shape for both. */
function FactRow({
  k,
  children,
}: {
  k: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-hairline py-3.5 first:border-t-0 first:pt-0">
      <p className="section-label text-[9px] text-mist-dim">{k}</p>
      {children}
    </div>
  );
}

function Absent({ why, consulted }: { why: string; consulted?: { label: string; url: string; kind: "issuer" | "secondary"; checked: string } }) {
  return (
    <>
      <p className="mt-1.5 text-[13px] leading-relaxed text-mist-dim">Not recorded. {why}</p>
      {consulted && (
        <SourceLine
          label={consulted.label}
          url={consulted.url}
          kind={consulted.kind}
          checked={consulted.checked}
          secondaryNote={AGGREGATOR_NOTE}
        />
      )}
    </>
  );
}

function LocalNameRow({ n }: { n: LocalName }) {
  return (
    <>
      <p className="mt-1.5 text-[15px] leading-snug text-snow">{n.name}</p>
      <p className="mt-0.5 text-[12px] text-mist">
        {n.language}
        {n.romanisation
          ? ` · ${n.romanisation}${n.romanisationScheme ? ` (${n.romanisationScheme})` : ""}`
          : ""}
      </p>
      {n.meaning.known ? (
        <>
          <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
            {n.meaning.value.text}
          </p>
          <SourceLine
            label={n.meaning.value.source.label}
            url={n.meaning.value.source.url}
            kind={n.meaning.value.source.kind}
            checked={n.meaning.value.source.checked}
          />
        </>
      ) : (
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
          What it means is not recorded. {n.meaning.why}
        </p>
      )}
      <SourceLine
        label={n.source.label}
        url={n.source.url}
        kind={n.source.kind}
        checked={n.source.checked}
        secondaryNote={AGGREGATOR_NOTE}
        className="mt-2"
      />
    </>
  );
}

function PeakRecord({ record }: { record: MountainFactRecord | null }) {
  if (!record) {
    return (
      <Rise className="pt-6">
        <SectionLabel>The record</SectionLabel>
        <p className="mt-2 text-[13px] leading-relaxed text-mist-dim">{NO_FACTS_RECORDED}</p>
      </Rise>
    );
  }

  return (
    <Rise className="pt-6">
      <SectionLabel>The record</SectionLabel>
      <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
        Read off Wikidata on {fmtDate(record.wikidata.read)}, statement by statement, with what
        each statement cites for itself shown beside it.{" "}
        <a
          href={record.wikidata.url}
          target="_blank"
          rel="noreferrer"
          className="text-azure underline decoration-azure/40 underline-offset-2"
        >
          {record.wikidata.qid}
        </a>
      </p>

      <div className="mt-3">
        <FactRow k="First ascent">
          {record.firstAscent.known ? (
            <>
              <p className="mt-1.5 text-[14px] leading-snug text-snow">
                {record.firstAscent.value.dateLabel}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-mist">
                {partyLabel(record.firstAscent.value.party)}
                {record.firstAscent.value.expedition
                  ? ` · ${record.firstAscent.value.expedition}`
                  : ""}
              </p>
              {record.firstAscent.value.note && (
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
                  {record.firstAscent.value.note}
                </p>
              )}
              <BackingLine backing={record.firstAscent.value.backing} />
              <SourceLine
                label={record.firstAscent.value.source.label}
                url={record.firstAscent.value.source.url}
                kind={record.firstAscent.value.source.kind}
                checked={record.firstAscent.value.source.checked}
                className="mt-2"
              />
            </>
          ) : (
            <Absent
              why={record.firstAscent.why}
              consulted={record.firstAscent.consulted}
            />
          )}
        </FactRow>

        <FactRow k="Prominence">
          {record.prominence.known ? (
            <Figure f={record.prominence.value} />
          ) : (
            <Absent why={record.prominence.why} consulted={record.prominence.consulted} />
          )}
        </FactRow>

        <FactRow k="Topographic isolation">
          {record.isolation.known ? (
            <Figure f={record.isolation.value} />
          ) : (
            <Absent why={record.isolation.why} consulted={record.isolation.consulted} />
          )}
        </FactRow>

        <FactRow k="Parent peak">
          {record.parentPeak.known ? (
            <>
              <p className="mt-1.5 text-[14px] leading-snug text-snow">
                {record.parentPeak.value.name}
              </p>
              {record.parentPeak.value.caution && (
                <p className="mt-1.5 text-[12px] leading-relaxed text-alert">
                  {record.parentPeak.value.caution}
                </p>
              )}
              <BackingLine backing={record.parentPeak.value.backing} />
              <SourceLine
                label={record.parentPeak.value.source.label}
                url={record.parentPeak.value.source.url}
                kind={record.parentPeak.value.source.kind}
                checked={record.parentPeak.value.source.checked}
                secondaryNote={AGGREGATOR_NOTE}
                className="mt-2"
              />
            </>
          ) : (
            <Absent why={record.parentPeak.why} consulted={record.parentPeak.consulted} />
          )}
        </FactRow>

        {/* AN EMPTY LIST MEANS WIKIDATA CARRIES NO NATIVE LABEL. It does not
            mean the mountain has no local name — K2's "Chhogori" sits in
            Wikidata as an unreferenced alias and is deliberately not here. */}
        <FactRow k={record.localNames.length === 1 ? "Local name" : "Local names"}>
          {record.localNames.length === 0 ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-mist-dim">
              Wikidata carries no native-language label for this mountain. That is a gap in the
              record, not evidence that it has no local name.
            </p>
          ) : (
            record.localNames.map((n, i) => (
              <div key={n.name} className={cn(i !== 0 && "mt-4 border-t border-hairline pt-3.5")}>
                <LocalNameRow n={n} />
              </div>
            ))
          )}
        </FactRow>
      </div>

      {record.officialNames && record.officialNames.length > 0 && (
        <>
          <p className="section-label mt-6 text-mist-dim">Its official name, over time</p>
          <div className="mt-1">
            {record.officialNames.map((o, i) => (
              <div
                key={`${o.name}-${o.from ?? "x"}-${o.by}`}
                className={cn("py-3.5", i !== 0 && "border-t border-hairline")}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 flex-1 text-[14px] leading-snug text-snow">{o.name}</p>
                  <p className="tnum shrink-0 text-[12px] text-mist-dim">
                    {o.from ? o.from.slice(0, 4) : "—"}
                    {o.until ? `–${o.until.slice(0, 4)}` : o.from ? "–" : ""}
                  </p>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-mist">Made official by {o.by}.</p>
                {o.disputedBy && o.disputedBy.length > 0 && (
                  <p className="mt-1 text-[12px] leading-relaxed text-alert">
                    Disputed by {o.disputedBy.join(", ")}.
                  </p>
                )}
                <BackingLine backing={o.backing} />
                <SourceLine
                  label={o.source.label}
                  url={o.source.url}
                  kind={o.source.kind}
                  checked={o.source.checked}
                  secondaryNote={AGGREGATOR_NOTE}
                  className="mt-2"
                />
              </div>
            ))}
          </div>
        </>
      )}

      {record.namingNote && (
        <p className="mt-4 text-[12.5px] leading-relaxed text-mist">{record.namingNote}</p>
      )}

      {/* RECORDED, NOT RESOLVED. Three of the four mountains whose height
          Wikidata gives to two decimal places disagree with ICEFALL's own
          card. A reader who can see the disagreement is better off than a
          reader shown one tidy number. */}
      {record.disagreements && record.disagreements.length > 0 && (
        <>
          <p className="section-label mt-6 text-mist-dim">Where the sources disagree</p>
          <ul className="mt-1.5 space-y-2">
            {record.disagreements.map((d) => (
              <li key={d} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-alert" />
                {d}
              </li>
            ))}
          </ul>
        </>
      )}
    </Rise>
  );
}

function Figure({ f }: { f: Parameters<typeof figureLabel>[0] }) {
  return (
    <>
      <p className="tnum mt-1.5 text-[14px] leading-snug text-snow">{figureLabel(f)}</p>
      {f.caution && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-alert">{f.caution}</p>
      )}
      <BackingLine backing={f.backing} />
      <SourceLine
        label={f.source.label}
        url={f.source.url}
        kind={f.source.kind}
        checked={f.source.checked}
        secondaryNote={AGGREGATOR_NOTE}
        className="mt-2"
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* When & safety — the sourced months, the hazards, and who comes             */
/* -------------------------------------------------------------------------- */

/**
 * TWELVE MONTHS, ONE ROW, AND THE STATUS IS A WORD.
 *
 * The prototype put these in a 2x6 grid and the owner sent it back: a year is
 * a line, and reading it as two stacked half-years makes December neighbour
 * June. So: twelve cells across, January on the left, and they get narrow —
 * about 26px each on a 390px screen. Nothing legible fits in 26px except the
 * month's own three letters, which is exactly what goes there.
 *
 * WHICH MEANS THE STATUS CANNOT LIVE IN THE CELL, and ICEFALL's standing rule
 * is that a band is a word, never a colour on its own. The word is on screen
 * twice regardless: in the legend under the strip, where each tint is named,
 * and in the selected month's own line, which always shows "September — Season
 * shut" in full. The tint is a second channel for people scanning, not the
 * only one.
 *
 * A NULL SLOT IS NOT A NEUTRAL SLOT. `monthPictureFor` returns null for a
 * month no source speaks to, and eight of Gran Paradiso's twelve are null.
 * Those cells are empty rather than tinted, the legend names the state, and
 * selecting one prints `NO_MONTH_RATING` — which says it is neither a good
 * month nor a bad one, only an unrecorded one.
 */
const RATING_CELL: Record<MonthRating, string> = {
  best: "bg-azure/35 text-snow",
  possible: "bg-azure/[0.13] text-mist",
  avoid: "bg-white/[0.07] text-mist-dim",
};

const RATING_SWATCH: Record<MonthRating, string> = {
  best: "bg-azure/60",
  possible: "bg-azure/[0.22]",
  avoid: "bg-white/[0.12]",
};

function SeasonSection({ data, curated }: { data: MountainPageData; curated: Mountain }) {
  const record = seasonFor(data.curatedId);
  const picture = monthPictureFor(data.curatedId);
  /* Today's month, so the strip opens on the question the reader is standing
     in. Computed once — a re-render every scroll tick must not move it. */
  const [month, setMonth] = useState<Month>(() => (new Date().getMonth() + 1) as Month);
  const [sheet, setSheet] = useState(false);

  if (!record || !picture) {
    return (
      <Rise className="pt-7">
        <SectionLabel>Month by month</SectionLabel>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{NO_SEASON_RECORDED}</p>
      </Rise>
    );
  }

  const entry: MonthEntry | null = picture[month - 1];
  const ratings = new Set(
    picture.filter((e): e is MonthEntry => e !== null).map((e) => e.rating),
  );
  const hasUnrated = picture.some((e) => e === null);
  const comparison = seasonComparison(record, curated.bestSeasons);
  const rated = ratedMonthCount(record);

  return (
    <Rise className="pt-7">
      <SectionLabel>Month by month</SectionLabel>
      {/* Said only where it is not twelve. "Nine of the twelve" is information;
          "twelve of the twelve" is a sentence the strip already makes. */}
      {rated < 12 && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
          {rated} of the twelve months are rated by a named published source. The rest are blank
          because nothing ICEFALL holds speaks to them.
        </p>
      )}

      <div className="mt-3 flex gap-[3px]">
        {MONTHS.map((m) => {
          const e = picture[m - 1];
          const on = m === month;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMonth(m)}
              aria-pressed={on}
              aria-label={`${MONTH_LABEL[m]} — ${e ? RATING_LABEL[e.rating] : "not rated"}`}
              className={cn(
                "min-w-0 flex-1 rounded-[3px] py-2.5 text-center text-[9px] font-semibold tracking-tight uppercase transition-colors",
                e ? RATING_CELL[e.rating] : "bg-white/[0.02] text-mist-dim/70",
                on && "outline outline-1 outline-snow/70",
              )}
            >
              {MONTH_SHORT[m]}
            </button>
          );
        })}
      </div>

      {/* The word, in full, for whichever month is selected. This line is why
          the 26px cells are allowed to carry only a tint. */}
      <p className="mt-3 text-[14px] leading-snug font-semibold text-snow">
        {MONTH_LABEL[month]} — {entry ? RATING_LABEL[entry.rating] : "Not rated"}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
        {entry ? entry.reason : NO_MONTH_RATING}
      </p>
      {/* The verbatim quote is depth, and it is in the sheet against its own
          window. The sentence above it is the source's claim in ICEFALL's
          words and carries the same source line either way. */}
      {entry?.note && (
        <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">{entry.note}</p>
      )}
      {entry && (
        <SourceLine
          label={entry.source.label}
          url={entry.source.url}
          kind={entry.source.kind}
          checked={entry.source.checked}
          /* The record says whether this issuer SETS the season or merely
             reports on it. The Tanzania Meteorological Authority forecasts the
             rains; it does not decree them, so it carries no role and falls
             back to the neutral issuer wording. */
          issuerNote={entry.source.issuerRole}
        />
      )}

      {/* The legend, which is where the tints get their names. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[10.5px] text-mist-dim">
        {(["best", "possible", "avoid"] as MonthRating[])
          .filter((r) => ratings.has(r))
          .map((r) => (
            <span key={r} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-3.5 rounded-[2px]", RATING_SWATCH[r])} />
              {RATING_LABEL[r]}
            </span>
          ))}
        {hasUnrated && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-3.5 rounded-[2px] bg-white/[0.03]" />
            Not rated
          </span>
        )}
      </div>

      {/*
        * ICEFALL'S OWN SEASON BADGES AND THE SOURCED MONTHS, SIDE BY SIDE.
        *
        * `seasonComparison` reports the difference and has no power to resolve
        * it — which is the whole point, because the last time this page
        * derived a season it printed a line contradicting the curated badges
        * two rows above it. Where they disagree the sentence says so and names
        * both. Where no month is rated "best" at all — Kilimanjaro, where
        * nothing ICEFALL found calls any month good for climbing — the
        * function returns null and that gets its own sentence rather than
        * being read as agreement.
        */}
      <p className="mt-3.5 border-t border-hairline pt-3.5 text-[12px] leading-relaxed text-mist-dim">
        {comparison
          ? comparison.sentence
          : "No source ICEFALL holds names a best month on this mountain. ICEFALL's own seasons are at the top of this section; nothing here confirms or contradicts them."}
      </p>

      <DepthRow
        title="Where these months come from"
        sub="Every window, the source behind it, and what the three words mean"
        onClick={() => setSheet(true)}
      />

      {sheet && (
        <Sheet title="Month by month" onClose={() => setSheet(false)}>
          <div className="px-5 pb-6">
            <p className="section-label mt-1 text-mist-dim">What the words mean</p>
            <div className="mt-1">
              {(["best", "possible", "avoid"] as MonthRating[]).map((r) => (
                <KV key={r} k={RATING_LABEL[r]} v={RATING_MEANING[r]} />
              ))}
              {hasUnrated && <KV k="Not rated" v={NO_MONTH_RATING} />}
            </div>

            <p className="section-label mt-6 text-mist-dim">The windows</p>
            <div className="mt-1">
              {record.windows.map((w, i) => (
                <div
                  key={`${w.rating}-${w.months.join()}`}
                  className={cn("py-3.5", i !== 0 && "border-t border-hairline")}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[14px] leading-snug text-snow">
                      {w.months.map((m) => MONTH_SHORT[m]).join(" · ")}
                    </p>
                    <p className="shrink-0 text-[12px] text-mist-dim">{RATING_LABEL[w.rating]}</p>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{w.reason}</p>
                  {w.quote && (
                    <p className="mt-2 border-l border-hairline pl-3 text-[12px] leading-relaxed text-mist-dim italic">
                      &ldquo;{w.quote}&rdquo;
                    </p>
                  )}
                  {w.note && (
                    <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">{w.note}</p>
                  )}
                  <SourceLine
                    label={w.source.label}
                    url={w.source.url}
                    kind={w.source.kind}
                    checked={w.source.checked}
                    issuerNote={w.source.issuerRole}
                  />
                </div>
              ))}
            </div>

            {comparison?.note && (
              <>
                <p className="section-label mt-6 text-mist-dim">
                  Against ICEFALL&rsquo;s own seasons
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
                  {comparison.sentence}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-mist-dim">
                  {comparison.note}
                </p>
              </>
            )}
          </div>
        </Sheet>
      )}
    </Rise>
  );
}

/**
 * HAZARDS — FLAT ROWS, AND ONLY ONES WITH A PUBLISHED SOURCE BEHIND THEM.
 *
 * This is the section most likely to be filled with plausible sentences, and
 * a plausible sentence here is how somebody gets hurt. `mountainSeason.ts`
 * takes the decision, not this component: a hazard exists in the data only
 * with a name, a place on the route, when it is worst and a named page. Nine
 * of the fourteen curated mountains hold none, including K2, whose Bottleneck
 * serac is real and famous and could not be sourced to a page that says where
 * and when — so nine of them show a sentence saying so instead. That sentence
 * is not "this mountain is safe" and does not read like it.
 */
function HazardSection({ data }: { data: MountainPageData }) {
  const [open, setOpen] = useState<Hazard | null>(null);
  const record: MountainSeasonRecord | null = seasonFor(data.curatedId);
  const hazards = record?.hazards ?? [];

  if (hazards.length === 0) {
    return (
      <Rise className="pt-7">
        <SectionLabel>Hazards</SectionLabel>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
          {record?.hazardsAbsentReason ?? NO_HAZARDS_RECORDED}
        </p>
      </Rise>
    );
  }

  return (
    <Rise className="pt-7">
      <SectionLabel>Hazards</SectionLabel>
      {/* HAZARD_STANDARD — the bar a hazard clears to appear at all — is at the
          top of every hazard's sheet rather than three lines above the rows.
          On a mountain with NO hazards it is the page (`hazardsAbsentReason`
          above), which is where it earns its space. */}
      <div className="mt-2">
        {hazards.map((h, i) => (
          <button
            key={h.name}
            type="button"
            onClick={() => setOpen(h)}
            className={cn(
              "flex min-h-[44px] w-full items-start gap-3 py-3.5 text-left",
              i !== 0 && "border-t border-hairline",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] leading-snug text-snow">{h.name}</span>
              <span className="mt-0.5 line-clamp-1 text-[11.5px] leading-snug text-mist-dim">
                {h.routeScope}
              </span>
              <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-mist">
                Worst &mdash; {h.worst}
              </span>
              <span
                className={cn(
                  "mt-1.5 block text-[10.5px] tracking-[0.08em] uppercase",
                  h.severity === "deaths-recorded" ? "text-alert" : "text-mist-dim",
                )}
              >
                {SEVERITY_LABEL[h.severity]}
              </span>
            </span>
            <ChevronRight
              size={18}
              strokeWidth={1.7}
              className="mt-0.5 shrink-0 text-mist-dim"
            />
          </button>
        ))}
      </div>

      {open && (
        <Sheet title={open.name} onClose={() => setOpen(null)}>
          <div className="px-5 pb-6">
            <p className="mt-1 text-[12px] leading-relaxed text-mist-dim">{HAZARD_STANDARD}</p>
            <div className="mt-4">
              <KV k="Where" v={open.routeScope} />
              <KV k="What it is" v={open.what} />
              <KV k="When it is worst" v={open.worst} />
              <KV k="How hard the evidence is" v={SEVERITY_LABEL[open.severity]} />
            </div>
            <SourceLine
              label={open.source.label}
              url={open.source.url}
              kind={open.source.kind}
              checked={open.source.checked}
            />

            {open.evidence && open.evidence.length > 0 && (
              <>
                <p className="section-label mt-6 text-mist-dim">What has been recorded</p>
                <div className="mt-1">
                  {open.evidence.map((e, i) => (
                    <div
                      key={e.statement}
                      className={cn("py-3.5", i !== 0 && "border-t border-hairline")}
                    >
                      <p className="text-[13px] leading-relaxed text-mist">{e.statement}</p>
                      <SourceLine
                        label={e.source.label}
                        url={e.source.url}
                        kind={e.source.kind}
                        checked={e.source.checked}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* TWO SOURCES, ONE QUESTION, DIFFERENT ANSWERS — and the page shows
                both. On the Grand Couloir one study puts the worst hours at
                18:00–20:00 and another puts 75% of the rockfall between 10:00
                and 16:00. Picking one and printing it would be lying by
                selection on the one section where that matters most. */}
            {open.disagreement && (
              <>
                <p className="section-label mt-6 text-mist-dim">
                  Another published source says otherwise
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
                  {open.disagreement.statement}
                </p>
                <SourceLine
                  label={open.disagreement.source.label}
                  url={open.disagreement.source.url}
                  kind={open.disagreement.source.kind}
                  checked={open.disagreement.source.checked}
                />
              </>
            )}
          </div>
        </Sheet>
      )}
    </Rise>
  );
}

/**
 * IF IT GOES WRONG — the number, who comes, and how high a helicopter reaches.
 *
 * The number is on the page and not behind a row, because a reader looking for
 * it is not browsing. The rest — who pays, what the insurance rule is, every
 * ceiling and its kind, the disagreements — is one tap down.
 *
 * THE CEILING IS THE FACT THIS SECTION EXISTS FOR, and it is the one most
 * easily misread. `highestCeilingM` returns the MAXIMUM recorded figure, which
 * on Everest is a one-off 7,800 m record flight rather than the 6,400 m a
 * helicopter routinely reaches — the best day anybody ever had. So the page
 * prints the KIND beside the number, in words, every time.
 */
function RescueSection({ data }: { data: MountainPageData }) {
  const record = rescueFor(data.curatedId);
  const [sheet, setSheet] = useState(false);

  if (!record) {
    return (
      <Rise className="pt-7">
        <SectionLabel>If it goes wrong</SectionLabel>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{NO_RESCUE_RECORDED}</p>
      </Rise>
    );
  }

  const ceilingM = highestCeilingM(record);
  const top = ceilingM === null ? null : record.helicopter.ceilings.find((c) => c.metres === ceilingM) ?? null;
  const gap = ceilingGapSentence(record, data.elevationM);

  return (
    <Rise className="pt-7">
      <SectionLabel>If it goes wrong</SectionLabel>
      <p className="mt-1.5 text-[13px] leading-relaxed text-mist">{record.summary}</p>

      <div className="mt-2">
        {record.numbers.map((n, i) => (
          <div
            key={`${n.number}-${n.label}`}
            className={cn("py-3.5", i !== 0 && "border-t border-hairline")}
          >
            <div className="flex items-baseline gap-3">
              <p className="tnum shrink-0 text-[17px] leading-none font-semibold text-snow">
                {n.number}
              </p>
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-mist">{n.label}</p>
            </div>
            {n.note && (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">{n.note}</p>
            )}
            <SourceLine
              label={n.source.label}
              url={n.source.url}
              kind={n.source.kind}
              checked={n.source.checked}
              className="mt-2"
            />
          </div>
        ))}
      </div>

      <div className="border-t border-hairline pt-3.5">
        {top ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-mist">
                {CEILING_KIND_LABEL[top.kind]}
              </p>
              <p className="tnum shrink-0 text-[17px] font-semibold text-snow">
                {fmtElevation(top.metres)} m
              </p>
            </div>
            {gap && <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">{gap}</p>}
          </>
        ) : (
          /* The full sentence — why an absent ceiling is not an absent limit —
             is in the sheet under "Helicopter". This line must still say both
             halves, because a row reading only "not published" would be read
             as "there is no limit". */
          <p className="text-[12px] leading-relaxed text-mist-dim">
            No helicopter ceiling is published for this mountain that ICEFALL could find — which
            is not the same as there being none.
          </p>
        )}
      </div>

      <DepthRow
        title="Who comes, who pays"
        sub="The responders by name, the charging rule, every published ceiling"
        onClick={() => setSheet(true)}
      />

      {sheet && (
        <Sheet title="Rescue" onClose={() => setSheet(false)}>
          <div className="px-5 pb-6">
            <p className="text-[13px] leading-relaxed text-mist">{record.summary}</p>

            <p className="section-label mt-6 text-mist-dim">Who turns up</p>
            <div className="mt-1">
              {record.responders.map((r) => (
                <KV key={r.name} k={r.name} v={r.role} />
              ))}
            </div>

            <p className="section-label mt-6 text-mist-dim">Who pays</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
              {record.charging.kind === "not-recorded"
                ? NO_CHARGING_RECORDED
                : record.charging.statement}
            </p>
            {record.charging.kind !== "not-recorded" && (
              <SourceLine
                label={record.charging.source.label}
                url={record.charging.source.url}
                kind={record.charging.source.kind}
                checked={record.charging.source.checked}
              />
            )}

            <p className="section-label mt-6 text-mist-dim">Insurance</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
              {record.insurance.kind === "not-recorded"
                ? "ICEFALL has not established whether rescue insurance is required here. Assume it is, and check with your operator before you travel."
                : record.insurance.statement}
            </p>
            {record.insurance.kind !== "not-recorded" && (
              <SourceLine
                label={record.insurance.source.label}
                url={record.insurance.source.url}
                kind={record.insurance.source.kind}
                checked={record.insurance.source.checked}
              />
            )}

            <p className="section-label mt-6 text-mist-dim">Helicopter</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
              {record.helicopter.availability === "not-recorded"
                ? "ICEFALL has not established what helicopter cover exists here. That is not the same as there being none."
                : record.helicopter.availability === "flown-not-guaranteed"
                  ? `Flown${record.helicopter.operator ? ` by ${record.helicopter.operator}` : ""}, and the operator itself says it cannot be relied on.`
                  : `Flown${record.helicopter.operator ? ` by ${record.helicopter.operator}` : ""}.`}
            </p>
            {record.helicopter.ceilings.length === 0 ? (
              <p className="mt-2 text-[13px] leading-relaxed text-mist-dim">
                {NO_CEILING_RECORDED}
              </p>
            ) : (
              <div className="mt-1">
                {record.helicopter.ceilings.map((c, i) => (
                  <div
                    key={`${c.kind}-${c.metres}`}
                    className={cn("py-3.5", i !== 0 && "border-t border-hairline")}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 flex-1 text-[14px] leading-snug text-snow">
                        {CEILING_KIND_LABEL[c.kind]}
                      </p>
                      <p className="tnum shrink-0 text-[14px] font-semibold text-snow">
                        {fmtElevation(c.metres)} m
                      </p>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-mist">{c.statement}</p>
                    <SourceLine
                      label={c.source.label}
                      url={c.source.url}
                      kind={c.source.kind}
                      checked={c.source.checked}
                    />
                  </div>
                ))}
              </div>
            )}
            {record.helicopter.limits && record.helicopter.limits.length > 0 && (
              <ul className="mt-3 space-y-2">
                {record.helicopter.limits.map((l) => (
                  <li key={l.statement} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-alert" />
                    {l.statement}
                  </li>
                ))}
              </ul>
            )}

            {record.disagreements && record.disagreements.length > 0 && (
              <>
                <p className="section-label mt-6 text-mist-dim">Sources that disagree</p>
                {record.disagreements.map((d) => (
                  <div key={d.about} className="mt-1.5">
                    <p className="text-[13px] leading-snug text-snow">{d.about}</p>
                    {d.positions.map((pos) => (
                      <div key={pos.statement} className="mt-2">
                        <p className="text-[13px] leading-relaxed text-mist">{pos.statement}</p>
                        <SourceLine
                          label={pos.source.label}
                          url={pos.source.url}
                          kind={pos.source.kind}
                          checked={pos.source.checked}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}

            {record.caveats && record.caveats.length > 0 && (
              <>
                <p className="section-label mt-6 text-mist-dim">What this does not tell you</p>
                <ul className="mt-1.5 space-y-2">
                  {record.caveats.map((c) => (
                    <li key={c} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-alert" />
                      {c}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Every page behind this record, including the ones only a caveat
                quotes. `sourcesIn` folds those in so the list is complete
                rather than complete-looking. */}
            <RescueSources record={record} />
          </div>
        </Sheet>
      )}
    </Rise>
  );
}

function RescueSources({ record }: { record: MountainRescueRecord }) {
  const sources = sourcesIn(record);
  return (
    <>
      <p className="section-label mt-6 text-mist-dim">Every page behind this</p>
      <div className="mt-1">
        {sources.map((s, i) => (
          <div key={s.url} className={cn("py-2", i !== 0 && "border-t border-hairline")}>
            <SourceLine
              label={s.label}
              url={s.url}
              kind={s.kind}
              checked={s.checked}
              className="mt-0"
            />
          </div>
        ))}
      </div>
    </>
  );
}

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
