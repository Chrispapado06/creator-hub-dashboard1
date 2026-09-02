import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, type GeoJSONSource } from "maplibre-gl";
import { Box, Crosshair, Layers, Loader2 } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";

import { attributionFor, TERRAIN_SOURCE, icefallMapStyle, styleFor, type MapStyleId } from "./icefallStyle";
import { RouteMap } from "@/components/ui/RouteMap";
import { cn } from "@/lib/utils";
import { OFFLINE } from "@/offline/offline";
import { MapUnavailable } from "@/offline/MapUnavailable";
import { bearingDelta, cameraSnapM, cameraStepM, followCameraFor } from "@/tracking/display";
import { haversine } from "@/tracking/filters";
import type { ActivityTypeId } from "@/tracking/types";
import type { TrackPoint } from "@/types";

/**
 * Real cartography with true 3D relief.
 *
 * Vector tiles from OpenFreeMap and elevation from the public AWS terrain
 * tiles — both free and keyless, so no token ships with the app. Tilting the
 * camera renders actual terrain: climb a thousand metres and you watch the
 * ground rise underneath the route.
 *
 * Tiles need a network. When they can't load, the component falls back to
 * ICEFALL's own procedural topographic renderer rather than showing a dead
 * grey rectangle — an activity is never blocked by a map.
 */

export interface GeoPointLite {
  lat: number;
  lon: number;
  heading?: number | null;
  /**
   * Reported horizontal accuracy, metres. Optional, and honestly optional: the
   * follow camera uses it to decide how much movement to believe, and a caller
   * that does not know is treated as not knowing rather than as certain.
   */
  accuracy?: number | null;
}

interface TerrainMapProps {
  /** Ordered route so far, in geographic coordinates. */
  track: GeoPointLite[];
  /** Live position. Defaults to the last track point. */
  current?: GeoPointLite | null;
  /** Keep the camera on the athlete instead of framing the whole route. */
  follow?: boolean;
  /**
   * Tunes how reluctantly the follow camera moves. Optional: without it the
   * defaults apply, which are the walking/hiking numbers. See `followCameraFor`
   * in `@/tracking/display` — a bicycle and a belay want different cameras.
   */
  followActivityTypeId?: ActivityTypeId;
  interactive?: boolean;
  showControls?: boolean;
  start3D?: boolean;
  /** Opening zoom when there is no route to frame. */
  initialZoom?: number;
  /** Hides the live marker — used when showing a place rather than a person. */
  hideLiveMarker?: boolean;
  className?: string;
  /**
   * Which basemap to draw. Every style carries the same DEM source, so a
   * switch never flattens the mountain — satellite in 3D is the whole point.
   */
  styleId?: MapStyleId;
  /** Used by the offline fallback renderer. */
  fallbackTrack?: TrackPoint[];
  fallbackSeed?: string;
}

const ROUTE_SOURCE = "icefall-route";
const EXAGGERATION = 1.45;

export function TerrainMap({
  track,
  current,
  follow = false,
  followActivityTypeId,
  interactive = true,
  showControls = true,
  start3D = true,
  styleId,
  initialZoom,
  hideLiveMarker = false,
  className,
  fallbackTrack = [],
  fallbackSeed = "icefall",
}: TerrainMapProps) {
  /*
   * OFFLINE: no tiles, so no map. Returned before the hooks below, which is
   * safe here and only here — `OFFLINE` is a build-time constant, so every
   * render of every instance takes the same branch and the hook order never
   * changes. Nothing is faked in its place: see @/offline/MapUnavailable.
   */
  if (OFFLINE) return <MapUnavailable className={cn("h-full w-full", className)} />;

  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const startMarker = useRef<Marker | null>(null);
  const liveMarker = useRef<Marker | null>(null);
  const didFit = useRef(false);
  /** True once MapLibre has fired `load`. The only reliable readiness signal. */
  const loadedRef = useRef(false);
  /** Any tile traffic at all — proof the map is working, just not finished. */
  const sawDataRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [is3D, setIs3D] = useState(start3D);
  const [showPeaks, setShowPeaks] = useState(true);

  const head = current ?? track[track.length - 1] ?? null;

  /*
   * The head as VALUES, not as an object.
   *
   * `current` is rebuilt by the caller on every snapshot — LiveTracker maps the
   * point list into fresh objects — so effects keyed on `head` re-ran on every
   * emit even when the athlete had not moved a centimetre. Keying on the three
   * numbers means an effect runs when the POSITION changes, which is the thing
   * it actually cares about.
   */
  const headLat = head ? head.lat : null;
  const headLon = head ? head.lon : null;
  const headHeading =
    head && typeof head.heading === "number" && Number.isFinite(head.heading) ? head.heading : null;
  const headAccuracy =
    head && typeof head.accuracy === "number" && Number.isFinite(head.accuracy)
      ? head.accuracy
      : null;

  const camera = useMemo(() => followCameraFor(followActivityTypeId), [followActivityTypeId]);

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!holder.current || mapRef.current) return;

    let cancelled = false;
    let map: MapLibreMap;

    try {
      map = new MapLibreMap({
        container: holder.current,
        style: styleId ? styleFor(styleId) : icefallMapStyle,
        center: head ? [head.lon, head.lat] : [6.8694, 45.9237], // Chamonix
        zoom: initialZoom ?? (head ? 14 : 11),
        pitch: start3D ? 58 : 0,
        bearing: 0,
        maxPitch: 75,
        attributionControl: false,
        interactive,
        // Dev-only: lets the canvas be read back for verification. Off in
        // production because it costs frame time on mobile GPUs.
        canvasContextAttributes: { preserveDrawingBuffer: import.meta.env.DEV },
      });
    } catch {
      setFailed(true);
      return;
    }

    mapRef.current = map;

    // Dev-only handle. WebGL canvases don't appear in some screenshot tools, so
    // being able to interrogate the live map is the only way to confirm it is
    // genuinely painting rather than sitting blank.
    if (import.meta.env.DEV) {
      (window as unknown as { __icefallMap?: MapLibreMap }).__icefallMap = map;
    }

    // Readiness is the `load` event, NOT `isStyleLoaded()` — the latter flickers
    // false while tiles stream in, which produced a false "tiles unavailable"
    // fallback on a perfectly healthy map.
    //
    // The guard also has to tell "slow" from "broken": on a weak connection —
    // exactly where an athlete will be — tiles can take far longer than any
    // fixed timeout. If data is still arriving we keep waiting; only total
    // silence counts as failure.
    map.on("dataloading", () => {
      sawDataRef.current = true;
    });

    // Offline, the wait is short. Tiles already viewed are served from the
    // service-worker cache and the map still loads normally; but for ground
    // never visited there is nothing to stream, and `dataloading` still fires
    // for requests that are about to fail — so the "saw data" test cannot tell
    // silence from failure here. A brief guard drops to the procedural
    // topographic map in a couple of seconds instead of leaving a climber
    // watching a spinner for twenty.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    const guard = setTimeout(
      () => {
        if (cancelled || loadedRef.current) return;
        if (offline || !sawDataRef.current) setFailed(true);
      },
      offline ? 2_500 : 20_000,
    );

    map.on("error", (e) => {
      if (loadedRef.current) return;
      // Tile-level errors carry a sourceId and are routine — a DEM tile that
      // doesn't exist over the sea is not a broken map. Matching on the message
      // text instead meant one missing tile tore the whole map down.
      const ev = e as unknown as { sourceId?: string; error?: Error };
      if (ev.sourceId) return;
      setFailed(true);
    });

    map.on("load", () => {
      if (cancelled) return;
      loadedRef.current = true;
      clearTimeout(guard);

      try {
        map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: start3D ? EXAGGERATION : 0 });
      } catch {
        /* terrain is an enhancement, not a requirement */
      }

      map.addSource(ROUTE_SOURCE, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      });

      // Glow beneath the line so the route reads over snow and rock alike.
      map.addLayer({
        id: "route-glow",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#4B9BFF", // --ice-azure
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 14],
          "line-opacity": 0.28,
          "line-blur": 6,
        },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#8FC2FF", // --ice-azure-bright
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 4.5],
        },
      });

      setReady(true);
    });

    return () => {
      cancelled = true;
      clearTimeout(guard);
      startMarker.current?.remove();
      liveMarker.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // Deliberately mount-once; updates are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------------ */
  /* Style switching                                                     */
  /* ------------------------------------------------------------------ */

  /*
   * `setStyle` tears down every source and layer, terrain included. So the 3D
   * mesh has to be re-applied once the new style has loaded, and `ready` is
   * dropped and re-raised so the route effect below redraws the line onto the
   * fresh style — otherwise switching to satellite silently flattens the
   * mountain and loses the track, which is the one thing this feature exists
   * to show.
   */
  const styleRef = useRef(styleId);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || styleRef.current === styleId) return;
    styleRef.current = styleId;
    setReady(false);
    map.setStyle(styleId ? styleFor(styleId) : icefallMapStyle);
    map.once("styledata", () => {
      try {
        map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: is3D ? EXAGGERATION : 0 });
      } catch {
        /* terrain is an enhancement, not a requirement */
      }
      setReady(true);
    });
  }, [styleId, is3D]);

  /* ------------------------------------------------------------------ */
  /* Route + markers                                                     */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const coords = track.map((p) => [p.lon, p.lat] as [number, number]);
    const src = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    src?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });

    if (track.length) {
      const s = track[0];
      if (!startMarker.current) {
        startMarker.current = new Marker({ element: dot("start") })
          .setLngLat([s.lon, s.lat])
          .addTo(map);
      } else {
        startMarker.current.setLngLat([s.lon, s.lat]);
      }
    }

    // The MARKER always tells the truth, at full rate. It is the camera that is
    // held back below — a dot that twitches two metres is honest reporting of a
    // two-metre fix; a horizon that swings with it is not.
    if (headLat !== null && headLon !== null && !hideLiveMarker) {
      if (!liveMarker.current) {
        liveMarker.current = new Marker({ element: dot("live") })
          .setLngLat([headLon, headLat])
          .addTo(map);
      } else {
        liveMarker.current.setLngLat([headLon, headLat]);
      }
    }

    // Frame the whole route once; after that the camera is the athlete's.
    if (!follow && coords.length > 1 && !didFit.current) {
      didFit.current = true;
      const b = coords.reduce((acc, c) => acc.extend(c), new LngLatBounds(coords[0], coords[0]));
      map.fitBounds(b, { padding: 56, duration: 900, pitch: is3D ? 55 : 0, maxZoom: 16 });
    }
  }, [track, headLat, headLon, ready, follow, is3D, hideLiveMarker]);

  /* ------------------------------------------------------------------ */
  /* Follow camera                                                       */
  /* ------------------------------------------------------------------ */

  /** Where the camera last chose to look — the anchor movement is measured from. */
  const cameraAnchor = useRef<{ lat: number; lon: number } | null>(null);
  /** The smoothed aim point. NOT a position: see `targetAlpha` in display.ts. */
  const cameraTarget = useRef<{ lat: number; lon: number } | null>(null);
  /** Where the map last turned — bearing needs more travel than centring does. */
  const bearingAnchor = useRef<{ lat: number; lon: number } | null>(null);
  const lastCameraAt = useRef(0);
  const lastBearingAt = useRef(0);
  /** Until when the camera belongs to the hand on the glass, not to us. */
  const userHeldUntil = useRef(0);
  const lockedOn = useRef(false);

  /*
   * A gesture takes the camera.
   *
   * Following an athlete and honouring a pinch are the same actuator, so one of
   * them has to yield. It is always the app: an athlete who pans ahead to read
   * the next col is asking a question, and snapping the view back a second
   * later answers it with "no". The Crosshair control hands the camera back.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const take = (e: { originalEvent?: unknown }) => {
      // Our own `easeTo` fires these too, but without an originalEvent — only a
      // real pointer, wheel or touch counts as the user taking over.
      if (!e?.originalEvent) return;
      userHeldUntil.current = Date.now() + camera.userControlGraceMs;
    };
    map.on("dragstart", take);
    map.on("zoomstart", take);
    map.on("rotatestart", take);
    map.on("pitchstart", take);
    return () => {
      map.off("dragstart", take);
      map.off("zoomstart", take);
      map.off("rotatestart", take);
      map.off("pitchstart", take);
    };
  }, [ready, camera.userControlGraceMs]);

  /*
   * Follow the athlete — deliberately reluctant.
   *
   * What this replaced: an `easeTo` on every change of the `head` OBJECT, which
   * the caller rebuilt on every emit. So the camera was re-ordered about once a
   * second with a 900 ms animation, restarting before it had arrived, and it
   * did that whether or not the athlete had moved — a stationary GPS wanders
   * metres a second, and the map faithfully chased the wander. That is the
   * shaking. It also re-applied zoom and pitch every time, undoing whatever the
   * athlete had just pinched, and re-aimed the bearing at a heading that is
   * derived from noise at walking speed.
   *
   * The rule now: the camera moves only when the ATHLETE has moved, at most
   * once per `minCameraGapMs`, and it never touches zoom or pitch again after
   * the first frame. Stopped means still.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !follow || headLat === null || headLon === null) return;
    const here = { lat: headLat, lon: headLon };

    // First lock-on: the one and only time the follow camera sets a zoom.
    if (!lockedOn.current) {
      lockedOn.current = true;
      cameraAnchor.current = here;
      cameraTarget.current = here;
      bearingAnchor.current = here;
      lastCameraAt.current = Date.now();
      map.easeTo({
        center: [headLon, headLat],
        zoom: Math.max(map.getZoom(), camera.firstFollowZoom),
        duration: camera.easeMs,
      });
      return;
    }

    const now = Date.now();
    if (now < userHeldUntil.current) return;

    /*
     * The AIM POINT, smoothed. This is not a claim about where the athlete is —
     * the marker, the drawn track and every recorded metre stay on the raw fix
     * — it is only where a camera points. Without it a stationary fix random-
     * walks past any fixed gate and ratchets the camera along behind it.
     */
    const previous = cameraTarget.current;
    const target =
      !previous || haversine(previous, here) > cameraSnapM(headAccuracy, camera)
        ? here // too far to be noise: a real relocation, so go, don't crawl
        : {
            lat: previous.lat + camera.targetAlpha * (headLat - previous.lat),
            lon: previous.lon + camera.targetAlpha * (headLon - previous.lon),
          };
    cameraTarget.current = target;

    // Has the athlete actually gone anywhere? Measured from the position the
    // camera last acted on, not from the previous fix, so a slow walker's small
    // steps accumulate towards a move instead of each being dismissed.
    const anchor = cameraAnchor.current;
    if (anchor && haversine(anchor, target) < cameraStepM(headAccuracy, camera)) return;
    if (now - lastCameraAt.current < camera.minCameraGapMs) return;
    cameraAnchor.current = target;

    // Bearing is priced separately and far higher: centring slides the ground,
    // rotation moves every pixel on the screen.
    let bearing: number | undefined;
    if (
      camera.rotateWithHeading &&
      headHeading !== null &&
      now - lastBearingAt.current >= camera.minBearingGapMs
    ) {
      const from = bearingAnchor.current;
      if (!from || haversine(from, target) >= camera.bearingStepM) {
        bearingAnchor.current = target;
        if (bearingDelta(headHeading, map.getBearing()) >= camera.bearingDeltaDeg) {
          bearing = headHeading;
          lastBearingAt.current = now;
        }
      }
    }

    lastCameraAt.current = now;
    // No `zoom`, no `pitch`, and not `essential`: the first two are the
    // athlete's to set, and leaving the animation non-essential means a phone
    // asking for reduced motion gets an instant cut rather than a glide.
    map.easeTo({
      center: [target.lon, target.lat],
      ...(bearing === undefined ? {} : { bearing }),
      duration: camera.easeMs,
    });
  }, [headLat, headLon, headHeading, headAccuracy, follow, ready, camera]);

  // Leaving follow mode releases the lock, so re-entering it frames the athlete
  // again rather than silently inheriting a camera from the last session.
  useEffect(() => {
    if (!follow) lockedOn.current = false;
  }, [follow]);

  /* ------------------------------------------------------------------ */
  /* Controls                                                            */
  /* ------------------------------------------------------------------ */

  const toggle3D = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3D;
    setIs3D(next);
    try {
      map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: next ? EXAGGERATION : 0 });
    } catch {
      /* ignore */
    }
    map.easeTo({ pitch: next ? 60 : 0, duration: 700 });
  }, [is3D]);

  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (!map || headLat === null || headLon === null) return;
    // Asking for the camera back ends the gesture hold at once — that is the
    // whole purpose of this control, and it is the only way back other than
    // waiting out `userControlGraceMs`.
    userHeldUntil.current = 0;
    // A deliberate request goes to the RAW position, and re-seeds the smoother
    // there: the athlete asked where they are, not where the average says.
    cameraAnchor.current = { lat: headLat, lon: headLon };
    cameraTarget.current = { lat: headLat, lon: headLon };
    lastCameraAt.current = Date.now();
    map.easeTo({
      center: [headLon, headLat],
      zoom: Math.max(map.getZoom(), camera.firstFollowZoom),
      duration: camera.easeMs,
    });
  }, [headLat, headLon, camera.firstFollowZoom, camera.easeMs]);

  const togglePeaks = useCallback(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const next = !showPeaks;
    setShowPeaks(next);
    for (const id of ["mountain-peak", "peak-marker"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", next ? "visible" : "none");
    }
  }, [showPeaks, ready]);

  /* ------------------------------------------------------------------ */

  if (failed) {
    return (
      <div className={cn("relative", className)}>
        <RouteMap
          track={fallbackTrack}
          seed={fallbackSeed}
          animate={false}
          className="h-full w-full"
          showMarkers={fallbackTrack.length > 0}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
          <p className="rounded-tile bg-obsidian/80 px-2.5 py-1.5 text-center text-[10px] text-mist-dim backdrop-blur">
            Map tiles unavailable — showing ICEFALL's offline topographic view
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden bg-obsidian", className)}>
      <div ref={holder} className="h-full w-full [&_.maplibregl-canvas]:outline-none" />

      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-obsidian">
          <Loader2 size={18} className="animate-spin text-mist-dim" />
        </div>
      )}

      {showControls && ready && (
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <MapButton
            onClick={toggle3D}
            active={is3D}
            label={is3D ? "Switch to flat map" : "Switch to 3D terrain"}
          >
            <Box size={15} strokeWidth={1.6} />
          </MapButton>
          <MapButton onClick={togglePeaks} active={showPeaks} label="Toggle peak names">
            <Layers size={15} strokeWidth={1.6} />
          </MapButton>
          {head && (
            <MapButton onClick={recenter} label="Recentre on your position">
              <Crosshair size={15} strokeWidth={1.6} />
            </MapButton>
          )}
        </div>
      )}

      {/* Attribution is a licence condition for both sources. */}
      {ready && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-1 text-[8px] leading-tight text-mist-dim/70 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: attributionFor(styleId) }}
        />
      )}
    </div>
  );
}

function MapButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full border backdrop-blur-xl transition-colors",
        active
          ? "border-azure/50 bg-obsidian/80 text-azure"
          : "border-hairline-strong bg-obsidian/70 text-mist hover:text-snow",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Brand markers, built as DOM.
 *
 * The hex is restated inline, so it does NOT inherit anything — which is how
 * the start dot, the live dot and its pulse were still drawing the retired
 * champagne gold after the alpine-azure rebrand. Values are `src/index.css`.
 */
function dot(kind: "start" | "live") {
  const el = document.createElement("div");
  if (kind === "start") {
    el.style.cssText =
      "width:12px;height:12px;border-radius:9999px;background:#05070B;border:2px solid #EAEEF5;box-shadow:0 0 0 2px rgba(5,7,11,.6)";
  } else {
    el.style.cssText = "position:relative;width:16px;height:16px";
    el.innerHTML = `
      <span style="position:absolute;inset:-8px;border-radius:9999px;background:rgba(75,155,255,.22);animation:icefall-pulse 2.4s ease-out infinite"></span>
      <span style="position:absolute;inset:0;border-radius:9999px;background:#4B9BFF;border:2px solid #05070B"></span>`;
  }
  return el;
}
