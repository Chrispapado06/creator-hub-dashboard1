import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MlMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { SATELLITE_CREDIT, TILE_URL, tileFor } from "./mapTiles";
import { OFFLINE } from "@/offline/offline";
import { MapPlaceholder } from "@/offline/MapPlaceholder";

export interface MapPin {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * The satellite map beside the route list.
 *
 * Raster tiles rather than a vector style: a vector basemap needs a styling
 * service and a key, and the imagery is the point here — a hiker reading this
 * wants to see the ground, not a rendering of it.
 *
 * The map is created ONCE. Pins are diffed on every render instead, because
 * rebuilding the map when a filter changes throws away the pan and zoom the
 * reader just set, which is the most annoying thing a map can do.
 */
export function RouteMap({
  pins,
  selectedId,
  onSelect,
  fit,
  line,
  className,
}: {
  pins: MapPin[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  /**
   * A place to frame, as the manifest stores it: [minLat, minLon, maxLat, maxLon].
   * LATITUDE FIRST — MapLibre wants longitude first, so this is swapped below
   * rather than passed through. Getting that wrong puts Cyprus in Somalia.
   */
  fit?: [number, number, number, number];
  /** The selected trail's own course. Empty means "not known", so draw nothing. */
  line?: { lat: number; lon: number }[];
  className?: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    /*
     * OFFLINE DEMO. Nothing here can work without a connection — the basemap is
     * raster tiles streamed from Esri, and the static <img> fallback below is
     * the same tiles by another route. Building the map anyway would leave a
     * slate rectangle with a zoom control on it, which reads as a broken page
     * rather than an absent network, so the component renders a placeholder
     * that says which of the two it is (see the early return further down).
     */
    if (OFFLINE) return;
    if (host.current === null || map.current !== null) return;

    /*
     * MapLibre needs WebGL and THROWS when it cannot get a context — on a
     * machine with hardware acceleration off, an old GPU, or a locked-down
     * browser. Uncaught, that throw took the whole Explore page down to a blank
     * screen: one unavailable graphics context and the route list disappeared
     * too. Caught here, the page keeps its list and the map degrades to static
     * imagery, which is the half a hiker can still use.
     */
    try {
      map.current = new maplibregl.Map({
        container: host.current,
        style: {
          version: 8,
          sources: {
            sat: {
              type: "raster",
              tiles: [TILE_URL],
              tileSize: 256,
              maxzoom: 18,
              attribution: SATELLITE_CREDIT,
            },
          },
          layers: [{ id: "sat", type: "raster", source: "sat" }],
        },
        center: [8.5, 46],
        zoom: 3.4,
        attributionControl: false,
      });
      map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.current.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    } catch {
      map.current = null;
      setFailed(true);
      return;
    }

    return () => {
      map.current?.remove();
      map.current = null;
      markers.current.clear();
    };
  }, []);

  // Diff the pins against what is already on the map.
  useEffect(() => {
    const m = map.current;
    if (m === null) return;

    const wanted = new Set(pins.map((p) => p.id));
    for (const [id, marker] of markers.current) {
      if (!wanted.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }

    for (const p of pins) {
      let marker = markers.current.get(p.id);
      if (marker === undefined) {
        const el = document.createElement("button");
        el.type = "button";
        el.setAttribute("aria-label", p.name);
        el.className = "icefall-pin";
        el.addEventListener("click", () => onSelect?.(p.id));
        marker = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(m);
        markers.current.set(p.id, marker);
      }
      const el = marker.getElement();
      el.dataset.selected = String(p.id === selectedId);
      /*
        Push the surroundings back the moment a route is chosen.

        Keyed off the SELECTION, not off the line arriving: the line is a round
        trip to Overpass that can take seconds or never come, and tying the
        dimming to it left the map unchanged after a click, which reads as a
        dead control. Selection is instant and is what the reader actually did.

        **NOT `style.opacity`.** MapLibre's Marker OWNS that property — it
        rewrites `element.style.opacity` on every render to fade markers behind
        terrain — so an inline opacity set here is silently overwritten on the
        next frame. Measured, not guessed: `dataset.selected` on the line above
        took effect while `style.opacity` on the line below it did not, on the
        same element in the same loop. So the dim is a data attribute the CSS
        answers with COLOUR, which MapLibre does not touch — the same mechanism
        `data-selected` already uses two lines up.
      */
      el.dataset.dim = String(selectedId !== undefined && p.id !== selectedId);
    }
  }, [pins, selectedId, onSelect]);

  /*
    THE SELECTED TRAIL'S LINE, and the surrounding pins pushed back.

    Two things happen together because they are one idea: showing where this
    route actually goes, and getting everything else out of its way. The other
    markers drop to a quarter opacity rather than disappearing — they are still
    real routes and the reader may want to click one — but they stop competing
    with the line for attention.

    An EMPTY line draws nothing at all. Offline, on an Overpass timeout, or for
    a relation whose members carry no geometry, there is no course to show, and
    a straight line between the first and last point would be a route ICEFALL
    invented. Nothing is the honest picture.
  */
  useEffect(() => {
    const m = map.current;
    if (m === null || !m.isStyleLoaded()) return;
    const coords = (line ?? []).map((p) => [p.lon, p.lat] as [number, number]);
    const data = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: coords },
    };
    const existing = m.getSource("trail-line");
    if (existing === undefined) {
      m.addSource("trail-line", { type: "geojson", data });
      m.addLayer({
        id: "trail-line-casing",
        type: "line",
        source: "trail-line",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#05070B", "line-width": 6, "line-opacity": 0.85 },
      });
      m.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail-line",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#4B9BFF", "line-width": 3 },
      });
    } else {
      (existing as maplibregl.GeoJSONSource).setData(data);
    }

    // Frame the route once it is known, so "where to where" is actually visible.
    if (coords.length > 1) {
      const lons = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      m.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 64, duration: 900, maxZoom: 14 },
      );
    }
  }, [line]);

  /*
    Frame a whole place when one is picked from the suggestions.

    `fitBounds` rather than a centre and a zoom, because the right zoom for a
    country is a property of the country: Cyprus needs a different one from
    Norway, and a single hardcoded number is wrong for twenty of the twenty-two.
    The box is the manifest's own extent for that country's routes.
  */
  useEffect(() => {
    const m = map.current;
    if (m === null || fit === undefined) return;
    const [minLat, minLon, maxLat, maxLon] = fit;
    m.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding: 56, duration: 900, maxZoom: 11 },
    );
  }, [fit]);

  // Fly to whatever the reader picked in the list.
  useEffect(() => {
    const m = map.current;
    const pin = pins.find((p) => p.id === selectedId);
    if (m === null || pin === undefined) return;
    m.flyTo({ center: [pin.lon, pin.lat], zoom: 8.5, duration: 900 });
  }, [selectedId, pins]);

  if (OFFLINE) {
    const pin = pins.find((p) => p.id === selectedId) ?? pins[0];
    return (
      <MapPlaceholder
        className={className}
        caption={
          pin === undefined
            ? "The route list beside it is stored on this device and works as normal."
            : `${pin.name} is in the list beside this, with everything known about it.`
        }
      />
    );
  }

  if (failed) {
    const pin = pins.find((p) => p.id === selectedId) ?? pins[0];
    return (
      <div className={`${className ?? ""} relative bg-slate`}>
        {pin !== undefined && (
          <img
            src={tileFor(pin.lat, pin.lon, 9)}
            alt=""
            aria-hidden
            className="h-full w-full object-cover opacity-80"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-obsidian/85 px-4 py-3">
          <p className="text-[12px] text-snow">{pin?.name ?? "No route selected"}</p>
          <p className="mt-1 text-[10.5px] text-mist-dim">
            Static imagery — this browser has no WebGL.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={host} className={className} />;
}
