import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Pause, Play } from "lucide-react";
import { Screen, ScreenHeader } from "@/components/layout/chrome";
import { TerrainMap } from "@/components/map/TerrainMap";
import {
  MAP_STYLE_LABEL, saveMapStyle, savedMapStyle, type MapStyleId,
} from "@/components/map/icefallStyle";
import { useActivityById } from "@/tracking/feed";
import { fmtDistance, fmtElevation } from "@/lib/format";
import { steepestPct } from "@/tracking/analysis";
import { cn } from "@/lib/utils";

/**
 * 3D REPLAY — the activity flown back over its own terrain.
 *
 * It reuses `TerrainMap`, which already renders MapLibre with a raster-DEM
 * terrain source, pitch and exaggeration: the route is drawn ON the mountain
 * rather than on a flat tile, so a 1,200 m climb looks like a 1,200 m climb.
 * The replay walks a cursor through the recorded points and hands the map the
 * current position, which keeps the camera following the athlete.
 *
 * Everything the overlay reports is read from the point under the cursor —
 * elapsed time, altitude, distance, climb so far. Nothing is interpolated into
 * existence: at 60% through the track the numbers are the ones recorded at 60%
 * through the track.
 *
 * Rendering is deliberately post-activity only. The live screen must not carry
 * a terrain mesh while it is also holding a GPS fix and a wake lock.
 */
export default function ActivityReplay() {
  const { id } = useParams<{ id: string }>();
  const { activity, recorded } = useActivityById(id);

  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0); // 0..1
  const [speed, setSpeed] = useState(2);
  const [mapStyle, setMapStyle] = useState<MapStyleId>(() => savedMapStyle());
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  const points = useMemo(
    () => (recorded?.points ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)),
    [recorded],
  );

  const track = useMemo(() => points.map((p) => ({ lat: p.lat, lon: p.lon })), [points]);

  /** How long the replay takes at 1× — a fixed 30 s, not the activity's hours. */
  const REPLAY_SEC = 30;

  useEffect(() => {
    if (!playing || points.length < 2) return;
    const tick = (now: number) => {
      if (last.current !== null) {
        /*
         * The frame delta is CLAMPED, and it has to be.
         *
         * `requestAnimationFrame` stops while a tab is backgrounded or the
         * phone is locked, so the first frame after coming back carries a delta
         * of however long that was — seconds, or minutes. Unclamped, that one
         * frame advances the replay past the end, and the athlete returns to a
         * finished flyover they never saw. A tenth of a second is longer than
         * any real frame and short enough that a pause looks like a pause.
         */
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
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = null;
    };
  }, [playing, speed, points.length]);

  if (activity === undefined) return null;
  if (!recorded || points.length < 2) {
    return (
      <Screen padded={false}>
        <div className="px-5">
          <ScreenHeader title="Replay" back={id ? `/activity/${id}` : "/activity"} />
        </div>
        <div className="px-5">
          <p className="text-[13px] leading-relaxed text-mist">
            This activity has no usable GPS track, so there is nothing to fly over. Replay needs a
            recording with position data.
          </p>
        </div>
      </Screen>
    );
  }
  if (!id) return <Navigate to="/activity" replace />;

  const index = Math.min(points.length - 1, Math.floor(progress * (points.length - 1)));
  const at = points[index];
  const t0 = points[0].t;
  const elapsedSec = Math.max(0, (at.t - t0) / 1000);

  // Climb accumulated up to the cursor — the honest "so far" figure.
  let gain = 0;
  let lastAlt = points[0].altitudeSmoothed ?? points[0].altitude ?? 0;
  for (let i = 1; i <= index; i++) {
    const alt = points[i].altitudeSmoothed ?? points[i].altitude ?? lastAlt;
    if (alt - lastAlt > 1) gain += alt - lastAlt;
    lastAlt = alt;
  }

  const altitude = at.altitudeSmoothed ?? at.altitude;
  const steepest = steepestPct(recorded);
  const highest = recorded.maxAltitudeM;
  const atHighest = altitude !== null && highest !== null && Math.abs(altitude - highest) < 8;

  const hhmmss = (s: number) =>
    `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(
      Math.floor(s % 60),
    ).padStart(2, "0")}`;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title="Replay" back={`/activity/${id}`} />
      </div>

      {/*
        An explicit height, not `flex-1`.

        `Screen` is a scrolling container (`overflow-y-auto`) and not a flex
        column, so a `flex-1` child collapses to its content and the
        absolutely-positioned map had nothing to fill — the flyover rendered
        onto black with the overlay floating over it.
      */}
      <div className="relative h-[calc(100vh-var(--tabbar-h)-160px)] min-h-[440px]">
        {/* The track so far, so the line draws itself as the camera moves. */}
        <TerrainMap
          track={track.slice(0, index + 1)}
          current={{ lat: at.lat, lon: at.lon }}
          follow
          start3D
          styleId={mapStyle}
          interactive
          showControls={false}
          className="absolute inset-0"
        />

        {/* ---- Readout ---------------------------------------------------- */}
        <div className="pointer-events-none absolute inset-x-0 top-0 px-5 pt-3">
          <div className="flex gap-2.5">
            <Metric label="Distance" value={`${fmtDistance(at.distanceM / 1000, 2)} km`} />
            <Metric
              label="Elevation"
              value={altitude !== null ? `${fmtElevation(altitude)} m` : "—"}
            />
            <Metric label="Time" value={hhmmss(elapsedSec)} />
          </div>
          <p className="tnum mt-2 text-center text-[11px] text-mist">
            +{fmtElevation(gain)} m climbed
          </p>

          {/* Callouts, only where the recording justifies one. */}
          {atHighest && (
            <p className="mt-2 text-center text-[11px] uppercase tracking-[0.14em] text-azure">
              Highest point · {fmtElevation(highest!)} m
            </p>
          )}
        </div>

        {/* ---- Transport --------------------------------------------------- */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-obsidian via-obsidian/85 to-transparent px-5 pb-5 pt-8">
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 1000)}
            onChange={(e) => {
              setPlaying(false);
              setProgress(Number(e.target.value) / 1000);
            }}
            aria-label="Scrub the replay"
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-[var(--ice-azure)]"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (progress >= 1) setProgress(0);
                setPlaying((p) => !p);
              }}
              aria-label={playing ? "Pause" : "Play"}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-azure text-obsidian transition-colors hover:bg-azure-bright"
            >
              {playing ? (
                <Pause size={18} strokeWidth={2} fill="currentColor" />
              ) : (
                <Play size={18} strokeWidth={2} fill="currentColor" />
              )}
            </button>
            <span className="tnum text-[12px] text-mist">
              {hhmmss(elapsedSec)} / {hhmmss((points[points.length - 1].t - t0) / 1000)}
            </span>
            <span className="flex-1" />
            {(Object.keys(MAP_STYLE_LABEL) as MapStyleId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMapStyle(id);
                  saveMapStyle(id);
                }}
                className={cn(
                  "rounded-pill border px-2.5 py-1.5 text-[10.5px] transition-colors",
                  mapStyle === id
                    ? "border-azure/55 bg-azure/[0.12] text-azure"
                    : "border-hairline-strong text-mist-dim hover:text-snow",
                )}
              >
                {MAP_STYLE_LABEL[id]}
              </button>
            ))}
            <span className="w-px" />
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={cn(
                  "rounded-pill border px-3 py-1.5 text-[12px] transition-colors",
                  speed === s
                    ? "border-azure/55 bg-azure/[0.12] text-azure"
                    : "border-hairline-strong text-mist hover:text-snow",
                )}
              >
                {s}×
              </button>
            ))}
          </div>
          {steepest !== null && (
            <p className="mt-2.5 text-[10.5px] text-mist-dim">
              Steepest sustained section on this route: {steepest}%. Elevation is an estimate from
              the device's sensors and GPS.
            </p>
          )}
        </div>
      </div>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-tile border border-hairline bg-obsidian/70 px-3 py-2 backdrop-blur">
      <p className="tnum text-[15px] font-light leading-none text-snow">{value}</p>
      <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-mist-dim">{label}</p>
    </div>
  );
}
