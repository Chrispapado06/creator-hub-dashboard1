import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Droplets,
  Info,
  MapPin,
  Mountain as PeakIcon,
  ParkingCircle,
  TreePine,
  Eye,
} from "lucide-react";
import { MAP_ATTRIBUTION, styleFor, type MapStyleId } from "@/components/map/icefallStyle";
import type { TrailWaypoint } from "@/services/trailWaypoints";
import type { LatLon } from "@/services/trails";
import { cn } from "@/lib/utils";
import { OFFLINE } from "@/offline/offline";
import { MapUnavailable } from "@/offline/MapUnavailable";

/**
 * The planning map — the whole route at once, with real numbered stops.
 *
 * This is deliberately NOT `TerrainMap`: that component follows a live or
 * replayed position with a 3D camera, and has no notion of a fixed set of
 * markers. This one fits the whole line in frame and never moves the camera
 * again — it is for looking at the route before you go, the way the athlete's
 * own supplied reference showed a full loop with every stop numbered.
 *
 * Every marker traces back to a real OSM tag — see `trailWaypoints.ts`. A stop
 * with no `name` on OSM gets a plain numbered pin here, never invented text.
 */

const KIND_ICON: Record<TrailWaypoint["kind"], typeof Eye> = {
  viewpoint: Eye,
  peak: PeakIcon,
  water: Droplets,
  parking: ParkingCircle,
  information: Info,
  picnic: TreePine,
  landmark: MapPin,
};

export function RouteWaypointMap({
  line,
  start,
  center,
  waypoints,
  styleId = "icefall",
  className,
}: {
  line: LatLon[];
  start: LatLon;
  /** Where to sit before the line exists — the relation's own coordinates. */
  center: LatLon;
  waypoints: TrailWaypoint[];
  /**
   * Which basemap to draw — the same three the tracker and Find offer.
   *
   * Added for the trail page, where the reference put a control in the map's
   * bottom-left corner. That control on the reference is turn-by-turn
   * directions, which ICEFALL has no routing engine to provide; the style
   * switch is a control that does something, in the slot where the reference
   * showed one.
   */
  styleId?: MapStyleId;
  className?: string;
}) {
  /*
   * OFFLINE: no tiles, so no map. Returned before the hooks below, which is
   * safe here and only here — `OFFLINE` is a build-time constant, so every
   * render of every instance takes the same branch and the hook order never
   * changes. Nothing is faked in its place: see @/offline/MapUnavailable.
   */
  if (OFFLINE) return <MapUnavailable className={cn("h-full w-full", className)} />;

  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  /*
   * `setStyle` REPLACES every source and layer under the same map instance, so
   * the route line drawn below has to be added again after each swap. This
   * counter is what tells that effect to re-run: the style itself is not a
   * value it can watch, because the swap is asynchronous and the sources are
   * only gone once MapLibre says so.
   */
  const [styleEpoch, setStyleEpoch] = useState(0);
  /** The style currently on the map, so a re-render never re-applies the same one. */
  const appliedStyle = useRef<MapStyleId>(styleId);
  /** The line the camera was last framed on, so a style swap does not re-frame. */
  const framedPoints = useRef(-1);

  /*
   * The map mounts on the trail's OWN COORDINATES and never waits for geometry.
   *
   * It used to bail out until `line.length >= 2`, which meant the whole tab sat
   * on "Loading the line…" for however long Overpass took — measured at 7.8s
   * for a 222-point trail and far worse for a big one, with nothing on screen
   * in the meantime. The relation's lat/lon is already in hand the moment the
   * page opens, so the ground can be shown immediately and the route drawn over
   * it when it arrives.
   */
  useEffect(() => {
    if (!holder.current) return;

    const map = new MapLibreMap({
      container: holder.current,
      style: styleFor(appliedStyle.current),
      center: [center.lon, center.lat],
      zoom: 11,
      interactive: true,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("load", () => setReady(true));

    /*
     * The trail page can throw this map full-screen, which changes the
     * container's size without unmounting it. MapLibre's own `trackResize`
     * usually catches that, but the same belt-and-braces observer is already
     * in `AreaMap` for the same reason — a canvas left at the old size is a
     * map with the wrong half of the route in it.
     */
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(holder.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [center.lat, center.lon]);

  /** Swapping the basemap, without rebuilding the map. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || appliedStyle.current === styleId) return;
    appliedStyle.current = styleId;
    map.setStyle(styleFor(styleId));
    const bump = () => setStyleEpoch((n) => n + 1);
    map.once("styledata", bump);
    return () => {
      map.off("styledata", bump);
    };
  }, [ready, styleId]);

  /** The route itself, added the moment the geometry lands. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || line.length < 2) return;

    const data = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: line.map((p) => [p.lon, p.lat]) },
    };

    const existing = map.getSource("route-line");
    if (existing) {
      (existing as GeoJSONSource).setData(data);
    } else {
      map.addSource("route-line", { type: "geojson", data });
      map.addLayer({
        id: "route-line-casing",
        type: "line",
        source: "route-line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#05070B", "line-width": 6, "line-opacity": 0.6 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route-line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#4B9BFF", "line-width": 3.5 },
      });
    }

    /*
     * Frame the route ONCE per line. This used to run on every pass, which was
     * harmless while the only trigger was the line arriving — but a style swap
     * re-runs it too, and snapping the camera back to the whole route every
     * time somebody chose "Satellite" would undo the zoom they made the switch
     * to look at.
     */
    if (framedPoints.current !== line.length) {
      framedPoints.current = line.length;
      const bounds = new LngLatBounds();
      line.forEach((p) => bounds.extend([p.lon, p.lat]));
      map.fitBounds(bounds, { padding: 48, animate: true, maxZoom: 16 });
    }
  }, [ready, line, styleEpoch]);

  // Start marker + numbered waypoints, added once the map is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers: Marker[] = [];

    if (line.length >= 2) {
      markers.push(
        new Marker({ element: startPinEl(), anchor: "bottom" })
          .setLngLat([start.lon, start.lat])
          .addTo(map),
      );
    }

    waypoints.forEach((w, i) => {
      markers.push(
        new Marker({ element: stopPinEl(i + 1), anchor: "bottom" })
          .setLngLat([w.lon, w.lat])
          .addTo(map),
      );
    });

    return () => markers.forEach((m) => m.remove());
  }, [ready, start, waypoints, line.length]);

  return (
    /* `on-dark` — see index.css. The basemap is dark in both themes, so the
       attribution line under it and the pins on it keep the dark palette. */
    <div className={cn("on-dark relative overflow-hidden", className)}>
      <div ref={holder} className="h-full w-full [&_.maplibregl-canvas]:outline-none" />
      <div
        className="pointer-events-none absolute bottom-1.5 left-2 right-2 text-[8.5px] leading-tight text-mist-dim/70 [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: MAP_ATTRIBUTION }}
      />
    </div>
  );
}

/*
 * Plain DOM, not React.
 *
 * `renderToStaticMarkup` (react-dom/server) was here first and it was wrong —
 * that is a Node SSR export, not meant to run in the browser, and pulling it
 * into client code risks exactly the kind of module-graph stall it caused
 * here. MapLibre markers are one-off DOM nodes with no interactivity of their
 * own, so plain `createElement` is not a downgrade, it is the correct tool.
 */
function startPinEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className =
    "grid h-9 w-9 place-items-center rounded-full border-2 border-obsidian bg-azure text-obsidian shadow-[0_2px_8px_rgba(0,0,0,0.4)]";
  el.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>';
  return el;
}

/** A numbered stop. Always just a number — no icon, no label baked into the pin. */
function stopPinEl(n: number): HTMLDivElement {
  const el = document.createElement("div");
  el.className =
    "grid h-7 w-7 place-items-center rounded-full border-2 border-obsidian bg-graphite text-snow shadow-[0_2px_6px_rgba(0,0,0,0.5)] text-[11px] font-medium tabular-nums";
  el.textContent = String(n);
  return el;
}

export { KIND_ICON };
