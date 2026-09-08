import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  BadgeCheck,
  Calendar,
  ChevronLeft,
  Clock,
  CloudSun,
  Flame,
  Gauge,
  Heart,
  Layers,
  Maximize2,
  MapPin,
  Mountain as MountainIcon,
  MoreHorizontal,
  Pause,
  Play,
  Share2,
  Timer,
  TrendingUp,
} from "lucide-react";

import { TerrainMap } from "@/components/map/TerrainMap";
import {
  MAP_STYLE_LABEL,
  saveMapStyle,
  savedMapStyle,
  type MapStyleId,
} from "@/components/map/icefallStyle";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDistance, fmtDuration, fmtElevation, fmtPace, fmtTime } from "@/lib/format";
import { loadActivities } from "@/tracking/store";
import { activityById } from "@/tracking/activities";
import { useMountainImage } from "@/components/domain/MountainImage";

/**
 * ACTIVITY COMPLETE — built to the owner's 1:1 mockup, 2026-09-01.
 *
 * The screen this replaced was a centred celebration: a drawing ring, three
 * headline numbers, then achievement and personal-best cards. The mockup is a
 * different thing entirely — a scrolling record of the activity — and the brief
 * was "1:1, nothing more", so the achievement and record cards are gone from
 * here along with the staged reveal. They are still detected and still stored
 * on the activity; nothing computes them for a screen that no longer shows
 * them, and `ActivitySummary` remains their home.
 *
 * ── WHAT THE MOCKUP DRAWS AND WHAT THE RECORDER ACTUALLY HAS ────────────────
 * The mockup is filled in with a complete activity: 12.46 km, 928 m, 132 bpm,
 * 784 kcal, "Gran Paradiso, Italy · Alpine Route", "12°C · Clear". Those are
 * sample VALUES, and every tile that holds one is built here. What is NOT done
 * is printing them when the recording has nothing behind them:
 *
 *   · AVG HR      `avgHeartRateBpm` is null unless a strap was paired. ICEFALL
 *                 does pair one (`tracking/sources/heartRate.ts`, connected
 *                 from LiveTracker), so this tile is filled on a recording made
 *                 with a strap and says "Not connected" on one made without.
 *   · CALORIES    modelled, not measured — MET × mass × hours. Where the mass
 *                 was assumed rather than set, the footnote says so.
 *   · WEATHER     the recorder stores `temperatureC` and no sky condition, so
 *                 the tile shows the temperature it has and nothing it doesn't.
 *   · ROUTE       there is no route field on a recording. The line under the
 *                 location is the activity's own title, which is real.
 *
 * A tile with no data renders its absence rather than disappearing, so the
 * layout is the mockup's on every activity, and the reason is on screen.
 */
export default function ActivityComplete() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const all = useMemo(() => loadActivities(), []);
  const activity = all.find((a) => a.id === id);

  if (!activity) return <Navigate to="/activity" replace />;

  const type = activityById(activity.activityTypeId);

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-obsidian pb-10">
      <Header activity={activity} typeLabel={type.label} onBack={() => navigate("/activity")} />

      <div className="px-5">
        <SummarySection activity={activity} />
        <Replay activity={activity} />
        <ShareSection onShare={() => navigate(`/activity/${activity.id}/share`)} />
        <FactsRow activity={activity} />
      </div>
    </div>
  );
}

type Activity = ReturnType<typeof loadActivities>[number];

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The backdrop pool — ten photographs, so finishing two activities in a week
 * does not show the same picture twice.
 *
 * IT IS ONLY A FALLBACK. When the recording names a mountain this app holds a
 * photograph of, that photograph wins, because a Gran Paradiso ascent should
 * show Gran Paradiso. The pool covers everything else, which is most
 * activities — nothing in the catalogue knows what a Tuesday evening run past
 * the reservoir looks like.
 *
 * PURELY DECORATIVE, AND NEVER CAPTIONED. These are real photographs of named
 * peaks, and none of them is claimed to be where the athlete was: the location
 * on this screen comes from the recording and sits in its own line with its
 * own icon. If a caption is ever added under this image it has to name the
 * mountain in the FILE, not the one in the activity, or the picture starts
 * lying about where somebody has been.
 */
const BACKDROPS: readonly string[] = [
  "/img/mont-blanc-2.jpg",
  "/img/everest-1.jpg",
  "/img/matterhorn.jpg",
  "/img/denali-1.jpg",
  "/img/gran-paradiso-2.jpg",
  "/img/toubkal-2.jpg",
  "/img/eiger.jpg",
  "/img/mount-olympus-2.jpg",
  "/img/aconcagua.jpg",
  "/img/triglav.jpg",
];

/**
 * Which backdrop this activity gets — stable, from its own id.
 *
 * Deterministic on purpose: `Math.random()` would deal a different photograph
 * on every render and every revisit, so the screen would never look the same
 * twice and a screenshot would not match what the athlete saw a moment ago.
 */
function backdropFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100_003;
  return BACKDROPS[h % BACKDROPS.length]!;
}

function Header({
  activity,
  typeLabel,
  onBack,
}: {
  activity: Activity;
  typeLabel: string;
  onBack: () => void;
}) {
  /*
   * The backdrop is the mountain the activity was on, when the recording says
   * which. `useMountainImage` captions its own fallback as derived terrain, so
   * an unnamed activity gets art rather than a photograph of somewhere else.
   */
  const fallback = backdropFor(activity.id);

  const image = useMountainImage({
    // The PEAK, not the place string. `location` reads "Gran Paradiso, Italy"
    // and the curated record is "Gran Paradiso" — matching on the whole string
    // failed every time and quietly fell back to a contour plate.
    name: activity.location?.split(",")[0]?.trim() || typeLabel,
    elevationM: activity.maxAltitudeM ?? undefined,
    lat: activity.points[0]?.lat,
    lon: activity.points[0]?.lon,
  });

  return (
    <div className="relative">
      <div className="absolute inset-0 overflow-hidden">
        {/* `image.real` is false when `useMountainImage` fell back to generated
            terrain art — that is where the rotating pool belongs, rather than
            over a genuine photograph of the peak the athlete was actually on. */}
        <img
          src={image.real ? image.src : fallback}
          alt=""
          aria-hidden
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/85 to-obsidian/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-transparent to-obsidian/40" />
      </div>

      <div
        className="relative px-5 pb-7"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="-ml-1.5 grid h-10 w-10 place-items-center rounded-full text-snow transition-colors hover:bg-white/[0.06]"
          >
            <ChevronLeft size={22} strokeWidth={1.8} />
          </button>

          <div className="flex items-center gap-2.5">
            <IconButton label="Share activity" onClick={() => undefined}>
              <Share2 size={17} strokeWidth={1.6} />
            </IconButton>
            <IconButton label="More" onClick={() => undefined}>
              <MoreHorizontal size={17} strokeWidth={1.6} />
            </IconButton>
          </div>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.16em] text-azure">
          Activity complete
          <BadgeCheck size={14} strokeWidth={0} fill="currentColor" className="text-azure" />
        </p>

        <h1 className="mt-2 text-[34px] font-light leading-[1.05] tracking-[-0.02em] text-snow">
          {typeLabel}
        </h1>

        <p className="tnum mt-1.5 text-[14px] text-mist">
          {fmtDate(activity.startedAt, { day: "numeric", month: "short", year: "numeric" })} ·{" "}
          {fmtTime(activity.startedAt)}
          {activity.simulated && " · simulated"}
        </p>

        {/* The location line, and only where the recording carries one. */}
        {activity.location && (
          <div className="mt-4 flex items-start gap-2.5">
            <MountainIcon size={17} strokeWidth={1.6} className="mt-0.5 shrink-0 text-azure" />
            <div className="min-w-0">
              <p className="truncate text-[15px] text-snow">{activity.location}</p>
              <p className="truncate text-[13.5px] text-mist">{activity.title}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full border border-hairline-strong bg-obsidian/40 text-snow backdrop-blur transition-colors hover:border-azure/45"
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Your Summary — a section on the page, not a card. See below.              */
/* -------------------------------------------------------------------------- */

function SummarySection({ activity }: { activity: Activity }) {
  const assumedMass = activity.calories !== null && activity.caloriesForKg !== undefined;

  return (
    /*
     * A HEADING AND SIX FIGURES, ON THE PAGE.
     *
     * This was `rounded-card border border-hairline bg-graphite/70 p-5` with the
     * `<h2>` inside it — two section markers competing, and the weaker one
     * (a rectangle) drawn around the stronger one (a heading). The heading and
     * the air above it are the announcement; the numbers underneath read as a
     * row of figures rather than as the contents of a panel.
     */
    <section className="mt-2">
      <h2 className="text-[19px] font-normal text-snow">Your Summary</h2>

      <div className="mt-5 grid grid-cols-3 gap-x-5 gap-y-7">
        <Stat
          icon={MapPin}
          label="Distance"
          value={fmtDistance(activity.distanceM / 1000, 2)}
          unit="km"
        />
        <Stat
          icon={TrendingUp}
          label="Total ascent"
          value={fmtElevation(activity.elevationGainM)}
          unit="m"
        />
        <Stat icon={Timer} label="Time" value={fmtDuration(activity.durationSec)} />

        <Stat
          icon={Gauge}
          label="Avg pace"
          value={activity.avgPaceSecPerKm ? fmtPace(activity.avgPaceSecPerKm) : null}
          unit="/km"
          absent="No GPS"
        />
        <Stat
          icon={Heart}
          label="Avg HR"
          value={activity.avgHeartRateBpm !== null ? String(activity.avgHeartRateBpm) : null}
          unit="bpm"
          absent="Not connected"
        />
        <Stat
          icon={Flame}
          label="Calories"
          value={activity.calories !== null ? String(Math.round(activity.calories)) : null}
          unit="kcal"
          absent="Needs weight"
        />
      </div>

      {/* THE ONE HAIRLINE ON THIS BLOCK, at the one real division: the figures
          stop and the statement about how they were arrived at begins. */}
      <p className="mt-6 border-t border-hairline pt-4 text-[12px] leading-relaxed text-mist">
        All stats are calculations based on your device data.
        {assumedMass &&
          ` Energy is estimated for ${activity.caloriesForKg} kg — set your weight and it is calculated for you.`}
      </p>
    </section>
  );
}

/**
 * One figure.
 *
 * `value === null` means the recording has nothing for it, and the tile prints
 * the REASON rather than a dash or a zero — "Not connected" is a different
 * statement from "0 bpm", and only one of them is true.
 */
function Stat({
  icon: Icon,
  label,
  value,
  unit,
  absent,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | null;
  unit?: string;
  absent?: string;
}) {
  /* NO COLUMN RULES. Four vertical hairlines used to separate the six figures,
     which drew the block as a table of cells; the gap between the columns
     already separates them, and a figure with a rule down its left side reads
     as a tile rather than as a number. */
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 whitespace-nowrap text-[10px] uppercase tracking-[0.06em] text-mist-dim">
        <Icon size={12} strokeWidth={1.6} className="shrink-0" />
        {label}
      </p>
      {value === null ? (
        /* `text-mist`: this sentence is the whole point of the tile when there
           is no figure, and it lost the graphite fill that was carrying it. */
        <p className="mt-1.5 text-[14px] text-mist">{absent ?? "—"}</p>
      ) : (
        <p className="tnum mt-1.5 whitespace-nowrap text-[23px] font-semibold leading-none text-snow">
          {value}
          {unit && <span className="ml-1 text-[13px] font-normal text-mist">{unit}</span>}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Replay                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The flyover runs 10 s at 1×, not the activity's hours.
 *
 * It is a fixed wall-clock length on purpose: a replay that lasted as long as
 * the walk would be unwatchable, and one that scaled with distance would make
 * a long day feel slow and a short one feel rushed. Ten seconds is what the
 * owner asked for; the speed control multiplies it, so 2× is five seconds.
 *
 * The elapsed time under the scrubber still counts the REAL activity duration —
 * this constant governs how fast the camera moves through it, never what the
 * clock reports.
 */
const REPLAY_SEC = 10;
const SPEEDS = [1, 2, 4] as const;

function Replay({ activity }: { activity: Activity }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"3d" | "map">("3d");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [styleId, setStyleId] = useState<MapStyleId>("satellite");

  /**
   * 3D means SATELLITE, which is what the mockup draws and what the mode is
   * for — a flyover over the ground as it actually looks. Flipping to Map
   * hands it back to whatever style the athlete keeps, and the layers button
   * still overrides either. Keyed on `mode` alone, so it re-points when the
   * toggle moves and never fights a manual choice made afterwards.
   */
  useEffect(() => {
    setStyleId(mode === "3d" ? "satellite" : savedMapStyle());
  }, [mode]);
  const last = useRef<number | null>(null);

  const points = useMemo(
    () => activity.points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)),
    [activity.points],
  );

  useEffect(() => {
    if (!playing || points.length < 2) return;
    let raf = 0;
    const tick = (now: number) => {
      if (last.current !== null) {
        // Clamped for the same reason the full replay clamps it: rAF stops
        // while the tab is backgrounded, and one giant delta would jump the
        // flyover to its end.
        const dt = Math.min(0.1, (now - last.current) / 1000);
        setProgress((p) => {
          const next = p + (dt * speed) / REPLAY_SEC;
          if (next >= 1) {
            setPlaying(false);
            return 1;
          }
          return next;
        });
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      last.current = null;
    };
  }, [playing, speed, points.length]);

  const index = Math.max(
    0,
    Math.min(points.length - 1, Math.round(progress * (points.length - 1))),
  );
  const at = points[index];
  const elapsed = Math.round(progress * activity.durationSec);

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-[19px] font-normal text-snow">Replay</h2>
        <div className="flex overflow-hidden rounded-tile border border-hairline">
          {(["3d", "map"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "px-5 py-2 text-[13px] transition-colors",
                mode === m ? "border border-azure/70 text-azure" : "text-mist hover:text-snow",
              )}
            >
              {m === "3d" ? "3D" : "Map"}
            </button>
          ))}
        </div>
      </div>

      {points.length < 2 ? (
        /* Withheld rather than shown empty: a replay of a track with no
           positions is a black rectangle that looks broken. */
        /* The sentence on the page. A box drawn around "there is nothing
           here" is a container built to hold nothing. */
        <p className="mt-4 text-[13px] leading-relaxed text-mist">
          No replay for this activity — the recording holds no positions, so there is no route to
          fly back over.
        </p>
      ) : (
        /* A MAP IS A PICTURE, SO IT GOES EDGE TO EDGE.
           It was a framed, radiused panel on a fill — a photograph of the
           ground inset inside a box, which is the box wearing the picture.
           `-mx-5` cancels the screen's gutter so the terrain reaches the glass;
           the transport row underneath puts the gutter back for its own
           controls, so they stay on the page's one left edge. */
        <div className="-mx-5 mt-4">
          <div className="relative h-[330px]">
            {/*
             * AT REST, THE WHOLE ROUTE. Following from the first point put the
             * camera on the ground at the trailhead, pitched into the sky — a
             * black rectangle with a strip of terrain along the bottom. The
             * flyover only makes sense once it is moving, so the map fits the
             * complete track until then and follows while playing.
             */}
            <TerrainMap
              track={(playing ? points.slice(0, index + 1) : points).map((p) => ({
                lat: p.lat,
                lon: p.lon,
              }))}
              current={playing && at ? { lat: at.lat, lon: at.lon } : undefined}
              follow={playing}
              start3D={mode === "3d"}
              styleId={styleId}
              interactive
              showControls={false}
              className="absolute inset-0"
            />

            {/* Speed. Inset to 16px rather than 12 now that the map reaches
                the glass — a control 12px from a phone's bezel is a mis-tap. */}
            <div className="absolute left-4 top-4">
              <button
                type="button"
                onClick={() =>
                  setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length] ?? 1)
                }
                className="flex items-center gap-2.5 rounded-pill bg-obsidian/70 py-2 pl-3.5 pr-3 text-[13px] text-snow backdrop-blur"
              >
                <span className="text-mist">Speed</span>
                <span className="tnum">{speed}.0x</span>
              </button>
            </div>

            {/* North indicator — static, because the recording has no heading. */}
            <div className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full border border-hairline-strong bg-obsidian/80 backdrop-blur">
              <span className="absolute top-1 text-[8.5px] uppercase tracking-[0.1em] text-mist">
                N
              </span>
              <span className="mt-1.5 h-4 w-[3px] rounded-full bg-danger" />
            </div>

            {/* Map style */}
            <button
              type="button"
              onClick={() => {
                const ids = Object.keys(MAP_STYLE_LABEL) as MapStyleId[];
                const next = ids[(ids.indexOf(styleId) + 1) % ids.length] ?? styleId;
                setStyleId(next);
                saveMapStyle(next);
              }}
              aria-label={`Map style — ${MAP_STYLE_LABEL[styleId]}`}
              className="absolute bottom-4 right-4 grid h-11 w-11 place-items-center rounded-full bg-obsidian/70 text-snow backdrop-blur"
            >
              <Layers size={18} strokeWidth={1.6} />
            </button>
          </div>

          {/* ---- Transport ------------------------------------------------ */}
          <div className="flex items-center gap-3 px-5 py-3.5">
            <button
              type="button"
              onClick={() => {
                if (progress >= 1) setProgress(0);
                setPlaying((p) => !p);
              }}
              aria-label={playing ? "Pause replay" : "Play replay"}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-hairline-strong text-snow transition-colors hover:border-azure/50"
            >
              {playing ? (
                <Pause size={16} strokeWidth={1.8} />
              ) : (
                <Play size={16} strokeWidth={1.8} className="ml-0.5" />
              )}
            </button>

            <span className="tnum shrink-0 text-[12.5px] text-mist">{hhmmss(elapsed)}</span>

            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(progress * 1000)}
              onChange={(e) => {
                setPlaying(false);
                setProgress(Number(e.target.value) / 1000);
              }}
              aria-label="Replay position"
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.12] accent-azure"
            />

            <span className="tnum shrink-0 text-[12.5px] text-mist">
              {hhmmss(activity.durationSec)}
            </span>

            <button
              type="button"
              onClick={() => navigate(`/activity/${activity.id}/replay`)}
              aria-label="Open full replay"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-mist transition-colors hover:text-snow"
            >
              <Maximize2 size={16} strokeWidth={1.7} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function hhmmss(total: number): string {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/* -------------------------------------------------------------------------- */
/* Share                                                                      */
/* -------------------------------------------------------------------------- */

function ShareSection({ onShare }: { onShare: () => void }) {
  return (
    /* Heading, one line, and the control. The panel around it was a second,
       weaker section marker drawn around the `<h2>` that was already doing the
       job — see `SummarySection`. The button keeps its border, because a border
       that says "you may press this" is a role rather than a grouping; it drops
       to the control radius so it can never read as the same object as a
       container. */
    <section className="mt-10 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[19px] font-normal text-snow">Share Your Activity</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-mist">
          Share your replay and stats with friends.
        </p>
      </div>
      <button
        type="button"
        onClick={onShare}
        className="flex h-11 shrink-0 items-center gap-2 rounded-[10px] border border-azure/60 px-5 text-[14px] text-azure transition-colors hover:bg-azure/[0.08]"
      >
        <Share2 size={16} strokeWidth={1.7} />
        Share
      </button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Date · Start time · Weather                                                */
/* -------------------------------------------------------------------------- */

function FactsRow({ activity }: { activity: Activity }) {
  return (
    /* Three facts about the recording, as a row of figures with quiet labels.
       They were tiles in an outlined box; the hairline above is the one real
       division on this screen — the activity's own record, after everything
       offered to do something with it. */
    <section className="mt-10 grid grid-cols-3 gap-x-5 border-t border-hairline pt-6">
      <Fact
        icon={Calendar}
        label="Date"
        value={fmtDate(activity.startedAt, { day: "numeric", month: "short", year: "2-digit" })}
      />
      <Fact icon={Clock} label="Start Time" value={fmtTime(activity.startedAt)} />
      {/*
       * TEMPERATURE ONLY. The mockup reads "12°C · Clear", but a recording
       * stores `temperatureC` and no sky condition — there is no observation
       * behind the word "Clear", so it is not printed.
       */}
      <Fact
        icon={CloudSun}
        label="Weather"
        value={
          activity.temperatureC !== null ? `${Math.round(activity.temperatureC)}°C` : "Not recorded"
        }
      />
    </section>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={17} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
      <div className="min-w-0">
        <p className="text-[12.5px] text-mist">{label}</p>
        <p className="mt-1 text-[13.5px] leading-snug text-snow">{value}</p>
      </div>
    </div>
  );
}
