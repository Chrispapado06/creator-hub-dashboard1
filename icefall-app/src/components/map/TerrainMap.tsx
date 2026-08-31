import { useCallback, useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, type GeoJSONSource } from "maplibre-gl";
import { Box, Crosshair, Layers, Loader2 } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";

import { MAP_ATTRIBUTION, TERRAIN_SOURCE, icefallMapStyle, styleFor, type MapStyleId } from "./icefallStyle";
import { RouteMap } from "@/components/ui/RouteMap";
import { cn } from "@/lib/utils";
import { OFFLINE } from "@/offline/offline";
import { MapUnavailable } from "@/offline/MapUnavailable";
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
}

interface TerrainMapProps {
  /** Ordered route so far, in geographic coordinates. */
  track: GeoPointLite[];
  /** Live position. Defaults to the last track point. */
  current?: GeoPointLite | null;
  /** Keep the camera on the athlete instead of framing the whole route. */
  follow?: boolean;
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

    if (head && !hideLiveMarker) {
      if (!liveMarker.current) {
        liveMarker.current = new Marker({ element: dot("live") })
          .setLngLat([head.lon, head.lat])
          .addTo(map);
      } else {
        liveMarker.current.setLngLat([head.lon, head.lat]);
      }
    }

    // Frame the whole route once; after that the camera is the athlete's.
    if (!follow && coords.length > 1 && !didFit.current) {
      didFit.current = true;
      const b = coords.reduce((acc, c) => acc.extend(c), new LngLatBounds(coords[0], coords[0]));
      map.fitBounds(b, { padding: 56, duration: 900, pitch: is3D ? 55 : 0, maxZoom: 16 });
    }
  }, [track, head, ready, follow, is3D, hideLiveMarker]);

  /* Follow the athlete. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !follow || !head) return;
    map.easeTo({
      center: [head.lon, head.lat],
      zoom: Math.max(map.getZoom(), 15),
      pitch: is3D ? 60 : 0,
      bearing:
        typeof head.heading === "number" && Number.isFinite(head.heading)
          ? head.heading
          : map.getBearing(),
      duration: 900,
    });
  }, [head, follow, is3D, ready]);

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
    if (!map || !head) return;
    map.easeTo({ center: [head.lon, head.lat], zoom: Math.max(map.getZoom(), 15), duration: 700 });
  }, [head]);

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
          dangerouslySetInnerHTML={{ __html: MAP_ATTRIBUTION }}
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
