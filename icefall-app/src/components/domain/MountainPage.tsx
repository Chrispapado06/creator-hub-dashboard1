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
import { Badge, Button, Card, Disclaimer, SectionLabel, sharePage } from "@/components/ui/primitives";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { ProgressRing } from "@/components/ui/charts";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { GearCard } from "@/components/domain/cards";
import { PhotoGallery } from "@/components/domain/PhotoGallery";
import { ObjectiveActions, type MountainRef } from "@/components/domain/ObjectiveActions";
import { useMountainGallery, usePeakSummary } from "@/components/domain/MountainImage";
import { SaveButton, SaveCircle, SavedToast, useSaveFlash } from "@/components/ui/SaveControl";
import { TerrainMap } from "@/components/map/TerrainMap";
import { cn } from "@/lib/utils";
import { fmtCountdown, fmtDate, fmtElevation } from "@/lib/format";
import { sync } from "@/services/repository";
import { useApp } from "@/state/AppState";
import { ASSESSMENT_DISCLAIMER, assessPeak } from "@/services/peakAssessment";
import { ACCESS_DISCLAIMER, accessFor, operatorSearchUrl } from "@/services/expeditionAccess";
import { DEMO_NOTICE, OPERATOR_DISCLAIMER, operatorsFor } from "@/services/operators";
import { OperatorCard } from "@/components/domain/OperatorCard";
import { PEAK_ATTRIBUTION } from "@/services/peaks";
import type { Goal, Mountain, Season } from "@/types";
import { LogSummitSheet, SummitLogCard } from "@/components/domain/SummitLogKit";
import { logsForPeak, removeSummitLog, useSummitLogs } from "@/social/summitLog";
import { CreatePostSheet, OwnPostCard } from "@/components/domain/PostComposer";
import { postsForMountain, useOwnPosts } from "@/social/posts";
import { useRecordedActivities } from "@/tracking/feed";
import { useSettings } from "@/settings/store";
import { EMPTY_MOUNTAIN_BOARD_BODY, EMPTY_MOUNTAIN_BOARD_TITLE } from "@/social/leaderboard";

/**
 * The mountain page.
 *
 * One layout for every mountain in ICEFALL, whether you reached it from your
 * goals, from Explore, or from the curated ten — the depth follows the mountain,
 * not the route you took to it. Curated mountains simply have more real data to
 * fill it with, and the page shows exactly what it has rather than padding the
 * gaps with plausible-looking numbers.
 *
 * Deliberately absent: summit success rates and typical durations for
 * discovered peaks. Both are the kind of figure that would look authoritative
 * and change how someone plans, and ICEFALL doesn't have either.
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
  elevationM: number;
  lat?: number;
  lon?: number;
  country?: string;
  region?: string;
  wikipedia?: string;
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

type Tab = "overview" | "routes" | "preparation" | "equipment" | "expeditions";

export function MountainPage({ data }: { data: MountainPageData }) {
  const assessment = assessPeak(data.elevationM, data.lat ?? 46, data.lon);
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
  const { summary, articleUrl } = usePeakSummary({ name: data.name, wikipedia: data.wikipedia });

  const tabs = useMemo(() => {
    const list: { value: Tab; label: string }[] = [{ value: "overview", label: "Overview" }];
    if (data.curated?.routes.length) list.push({ value: "routes", label: "Routes" });
    list.push(
      { value: "preparation", label: "Preparation" },
      { value: "equipment", label: "Equipment" },
      { value: "expeditions", label: "Expeditions" },
    );
    return list;
  }, [data.curated]);

  const [tab, setTab] = useState<Tab>("overview");

  return (
    <Screen padded={false}>
      <MountainHero data={data} gallery={gallery} assessment={assessment} />

      <StatStrip data={data} assessment={assessment} />

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
              summary={summary}
              articleUrl={articleUrl}
              assessment={assessment}
            />
            <AscentsAndConditions data={data} />
          </>
        )}
        {tab === "routes" && data.curated && <Routes mountain={data.curated} />}
        {tab === "preparation" && <Preparation data={data} assessment={assessment} />}
        {tab === "equipment" && <Equipment data={data} assessment={assessment} />}
        {tab === "expeditions" && <Expeditions data={data} assessment={assessment} />}
      </Stagger>

      <ActionBar data={data} assessment={assessment} />
    </Screen>
  );
}

/**
 * The two things you can do with a mountain, always reachable.
 *
 * Sticks to the bottom of the scroller rather than the viewport, so it never
 * covers content on a short screen and never fights the tab bar.
 */
function ActionBar({ data, assessment }: { data: MountainPageData; assessment: Assessment }) {
  const { objectives, addObjective, removeObjective } = useApp();
  const objective = objectiveRef(data, assessment);
  const saved = objective ? objectives.some((o) => o.id === objective.id) : false;
  const flash = useSaveFlash(saved);

  return (
    <div className="sticky bottom-0 mt-2 border-t border-hairline bg-obsidian/95 px-5 py-4 backdrop-blur">
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
          <Link to="/goals" className="flex-1">
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

type Assessment = ReturnType<typeof assessPeak>;

/** The objectives-list entry for this mountain, when it has coordinates. */
function objectiveRef(data: MountainPageData, assessment: Assessment): MountainRef | null {
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
    country: data.country,
    subtitle: data.curated?.difficultyLabel ?? assessment.label,
  };
}

function MountainHero({
  data,
  gallery,
  assessment,
}: {
  data: MountainPageData;
  gallery: ReturnType<typeof useMountainGallery>;
  assessment: Assessment;
}) {
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
          <HeroSave data={data} assessment={assessment} />
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
            <p className="section-label text-azure/85">{goal ? "Your goal" : "Mountain"}</p>
            <h1 className="display mt-1.5 text-[34px] leading-[1.05] text-snow">{data.name}</h1>
            {data.localName && data.localName !== data.name && (
              <p className="mt-1 text-[13px] text-mist-dim">{data.localName}</p>
            )}
            <p className="tnum mt-2 text-[13px] text-mist">
              {fmtElevation(data.elevationM)} m{data.region ? ` · ${data.region}` : ""}
              {data.country ? ` · ${data.country}` : ""}
            </p>
            <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-hairline bg-obsidian/50 px-3 py-1.5 backdrop-blur">
              <MountainIcon size={13} strokeWidth={1.5} className="shrink-0 text-azure" />
              <span className="section-label whitespace-nowrap text-snow">
                {data.curated?.difficultyLabel ?? assessment.shortLabel}
              </span>
            </span>
          </div>

          {goal && (
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
          </div>
        </div>
      </div>

      {options && (
        <OptionsSheet data={data} assessment={assessment} onClose={() => setOptions(false)} />
      )}
    </div>
  );
}

/** The animated save control in the hero, wired to the objectives list. */
function HeroSave({ data, assessment }: { data: MountainPageData; assessment: Assessment }) {
  const { objectives, addObjective, removeObjective } = useApp();
  const objective = objectiveRef(data, assessment);
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
  assessment,
  onClose,
}: {
  data: MountainPageData;
  assessment: Assessment;
  onClose: () => void;
}) {
  const { objectives, addObjective, removeObjective } = useApp();
  const objective = objectiveRef(data, assessment);
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

function StatStrip({ data, assessment }: { data: MountainPageData; assessment: Assessment }) {
  const seasons = data.curated?.bestSeasons ?? assessment.seasons;
  const stats: {
    label: string;
    value: string;
    hint?: string;
    icon: typeof MountainIcon;
  }[] = [
    { label: "Elevation", value: `${fmtElevation(data.elevationM)} m`, icon: MountainIcon },
    {
      label: "Difficulty",
      value: data.curated?.difficultyLabel ?? assessment.shortLabel,
      hint: data.curated ? undefined : "Estimated",
      icon: TriangleAlert,
    },
    {
      label: "Best season",
      value: seasons.map((s) => SEASON_LABEL[s]).join(" · "),
      hint: data.curated ? undefined : "Estimated",
      icon: Snowflake,
    },
    // Duration is real data ICEFALL holds for the curated ten and has no basis
    // for anywhere else, so the tile is absent rather than guessed. The same
    // goes for the summit success rates a page like this usually carries.
    ...(data.curated
      ? [
          {
            label: "Duration",
            value: data.curated.typicalDurationLabel,
            icon: Clock,
          },
        ]
      : []),
    {
      label: "Support",
      value: assessment.requiresGuide ? "Guide advised" : "Independent",
      icon: ShieldCheck,
    },
  ];

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
            {s.hint && <p className="mt-1 text-[10px] text-mist-dim">{s.hint}</p>}
          </div>
        ))}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

function Overview({
  data,
  gallery,
  summary,
  articleUrl,
  assessment,
}: {
  data: MountainPageData;
  gallery: ReturnType<typeof useMountainGallery>;
  summary: string | null;
  articleUrl: string | null;
  assessment: Assessment;
}) {
  const objective = objectiveRef(data, assessment);
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <Rise className="pt-1">
        <SectionLabel>About {data.name}</SectionLabel>
        <Card className="mt-3">
          {summary ? (
            <>
              <p
                className={cn("text-[13px] leading-relaxed text-mist", !expanded && "line-clamp-4")}
              >
                {summary}
              </p>
              {summary.length > 240 && (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="mt-2.5 flex items-center gap-1.5 text-[12px] text-azure transition-colors hover:text-azure-bright"
                >
                  {expanded ? "Show less" : "Read more"}
                  <ChevronDown
                    size={13}
                    strokeWidth={1.8}
                    className={cn("transition-transform", expanded && "rotate-180")}
                  />
                </button>
              )}
              {articleUrl && (
                <a
                  href={articleUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-flex items-center gap-2 text-[12px] text-azure transition-colors hover:text-azure-bright"
                >
                  Read the full article
                  <ExternalLink size={13} strokeWidth={1.6} />
                </a>
              )}
              <p className="mt-3 text-[10px] text-mist-dim">
                Description from Wikipedia, CC BY-SA. ICEFALL has not written or verified it.
              </p>
            </>
          ) : data.curated ? (
            <p className="text-[13px] leading-relaxed text-mist">{data.curated.summary}</p>
          ) : (
            <p className="text-[13px] leading-relaxed text-mist-dim">
              No description available for this peak.
            </p>
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

function Preparation({ data, assessment }: { data: MountainPageData; assessment: Assessment }) {
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

      <Rise className="pt-6">
        <SectionLabel>Skills this class of mountain demands</SectionLabel>
        <Card className="mt-3">
          <ul className="space-y-2.5">
            {(data.curated?.trainingRequirements ?? assessment.skills).map((s) => (
              <li key={s} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                {s}
              </li>
            ))}
          </ul>
          {assessment.requiresGuide && (
            <Disclaimer className="mt-4">
              At this grade ICEFALL recommends a certified mountain guide unless you already hold
              these skills and have current experience on comparable ground.
            </Disclaimer>
          )}
        </Card>
      </Rise>

      {data.curated && (
        <Rise className="pt-6">
          <SectionLabel>Required experience</SectionLabel>
          <Card className="mt-3">
            <p className="text-[13px] leading-relaxed text-mist">
              {data.curated.requiredExperience}
            </p>
          </Card>
        </Rise>
      )}

      {assessment.acclimatisation && (
        <Rise className="pt-6">
          <SectionLabel>Acclimatisation</SectionLabel>
          <Card className="mt-3">
            <p className="text-[13px] leading-relaxed text-mist">{assessment.acclimatisation}</p>
            <Disclaimer className="mt-4">
              Altitude illness can become life-threatening quickly. Discuss any high-altitude plan
              with a doctor experienced in altitude medicine.
            </Disclaimer>
          </Card>
        </Rise>
      )}

      <Rise className="pt-6">
        <SectionLabel>Season</SectionLabel>
        <Card className="mt-3">
          <div className="flex flex-wrap gap-2">
            {(data.curated?.bestSeasons ?? assessment.seasons).map((s) => (
              <Badge key={s} tone="azure" size="md">
                {SEASON_LABEL[s]}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-mist">{assessment.seasonNote}</p>
        </Card>
      </Rise>

      {!data.curated && (
        <Rise className="pt-6">
          <Disclaimer>{ASSESSMENT_DISCLAIMER}</Disclaimer>
        </Rise>
      )}

      {data.preparationFooter && <Rise className="pt-8">{data.preparationFooter}</Rise>}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Equipment                                                                  */
/* -------------------------------------------------------------------------- */

function Equipment({ data, assessment }: { data: MountainPageData; assessment: Assessment }) {
  const kit = data.curated?.technicalRequirements ?? assessment.technicalKit;
  const products = (data.curated?.recommendedGearIds ?? assessment.equipmentIds)
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

function Expeditions({ data, assessment }: { data: MountainPageData; assessment: Assessment }) {
  const access = accessFor({
    country: data.country,
    requiresGuide: assessment.requiresGuide,
    elevationM: data.elevationM,
  });
  const operators = operatorsFor({ country: data.country, elevationM: data.elevationM });

  return (
    <>
      {/* Guides before companies: an individual guide suits an independent
          climber on a technical line, a company suits a full expedition. The
          athlete should meet both, and the distinction is spelled out on the
          guides screen itself. */}
      <Rise className="pt-1">
        <SectionLabel>Guides for this objective</SectionLabel>
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

      <Rise className="pt-1">
        <SectionLabel>Companies that run this objective</SectionLabel>
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
