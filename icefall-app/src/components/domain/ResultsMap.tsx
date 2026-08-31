import { useEffect, useRef } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, type GeoJSONSource } from "maplibre-gl";
import { MAP_ATTRIBUTION, icefallMapStyle } from "@/components/map/icefallStyle";
import type { LatLon } from "@/services/trails";
import { cn } from "@/lib/utils";
import { OFFLINE } from "@/offline/offline";
import { MapUnavailable } from "@/offline/MapUnavailable";

/**
 * The search results, on a map.
 *
 * Komoot's planner draws its results as PINS and only strokes the one you have
 * selected — and its own attribution reads "Maplibre | © komoot | Map data ©
 * OpenStreetMap contributors", which is the stack ICEFALL already runs. That
 * matters for cost: a pin needs only a centre point, which every trail in the
 * list already carries, so the whole map is free of extra requests. The line is
 * fetched once, for the one trail the athlete taps.
 *
 * Segments rather than a single line, for the same reason the detail page draws
 * them separately: the gaps between a relation's member ways are real, and
 * joining them would draw the route across ground it does not cross.
 */

export interface MapItem {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Right-hand line on the pin's label — a length, a height, a distance. */
  meta?: string;
}

const LINE_SOURCE = "icefall-results-line";

export function ResultsMap({
  items,
  selectedId,
  onSelect,
  segments,
  className,
}: {
  items: MapItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** The selected item's line, once it has been fetched. */
  segments?: LatLon[][];
  className?: string;
}) {
  /*
   * OFFLINE: no tiles, so no map. Returned before the hooks below, which is
   * safe here and only here — `OFFLINE` is a build-time constant, so every
   * render of every instance takes the same branch and the hook order never
   * changes. Nothing is faked in its place: see @/offline/MapUnavailable.
   */
  if (OFFLINE) return <MapUnavailable className={cn("h-full w-full", className)} />;

  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const ready = useRef(false);
  // Read inside map callbacks, which are created once and must not close over
  // a stale prop.
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!host.current || map.current) return;
    const m = new MapLibreMap({
      container: host.current,
      style: icefallMapStyle,
      center: [items[0]?.lon ?? 0, items[0]?.lat ?? 0],
      zoom: 8,
      attributionControl: { customAttribution: MAP_ATTRIBUTION },
    });
    map.current = m;
    m.on("load", () => {
      ready.current = true;
      m.addSource(LINE_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: `${LINE_SOURCE}-casing`,
        type: "line",
        source: LINE_SOURCE,
        paint: { "line-color": "#05070B", "line-width": 5, "line-opacity": 0.7 }, // --ice-obsidian
        layout: { "line-cap": "round", "line-join": "round" },
      });
      m.addLayer({
        id: `${LINE_SOURCE}-line`,
        type: "line",
        source: LINE_SOURCE,
        paint: { "line-color": "#4B9BFF", "line-width": 2.4 }, // --ice-azure
        layout: { "line-cap": "round", "line-join": "round" },
      });
    });
    return () => {
      markers.current.forEach((mk) => mk.remove());
      markers.current.clear();
      m.remove();
      map.current = null;
      ready.current = false;
    };
    // Built once. Items are reconciled by the effect below.
  }, []);

  /* ---- Pins ------------------------------------------------------------ */
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const wanted = new Set(items.map((i) => i.id));
    for (const [id, marker] of markers.current) {
      if (!wanted.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }

    for (const item of items) {
      let marker = markers.current.get(item.id);
      if (!marker) {
        const el = document.createElement("button");
        el.type = "button";
        el.setAttribute("aria-label", item.name);
        el.className = "icefall-pin";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          select.current?.(item.id);
        });
        marker = new Marker({ element: el }).setLngLat([item.lon, item.lat]).addTo(m);
        markers.current.set(item.id, marker);
      }
      marker.getElement().dataset.selected = String(item.id === selectedId);
    }

    if (items.length === 0) return;
    const b = new LngLatBounds();
    for (const i of items) b.extend([i.lon, i.lat]);
    m.fitBounds(b, { padding: 48, maxZoom: 13, duration: 600 });
  }, [items, selectedId]);

  /* ---- The selected line ----------------------------------------------- */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const source = m.getSource(LINE_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;

    const features = (segments ?? [])
      .filter((seg) => seg.length > 1)
      .map((seg) => ({
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: seg.map((p) => [p.lon, p.lat] as [number, number]),
        },
      }));
    source.setData({ type: "FeatureCollection", features });

    if (features.length === 0) return;
    const b = new LngLatBounds();
    for (const f of features) for (const c of f.geometry.coordinates) b.extend(c);
    m.fitBounds(b, { padding: 56, maxZoom: 15, duration: 700 });
  }, [segments]);

  return <div ref={host} className={cn("h-full w-full", className)} />;
}
