import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MlMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { SATELLITE_CREDIT, TILE_URL, tileFor } from "./mapTiles";

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
  className,
}: {
  pins: MapPin[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
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
      marker.getElement().dataset.selected = String(p.id === selectedId);
    }
  }, [pins, selectedId, onSelect]);

  // Fly to whatever the reader picked in the list.
  useEffect(() => {
    const m = map.current;
    const pin = pins.find((p) => p.id === selectedId);
    if (m === null || pin === undefined) return;
    m.flyTo({ center: [pin.lon, pin.lat], zoom: 8.5, duration: 900 });
  }, [selectedId, pins]);

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
