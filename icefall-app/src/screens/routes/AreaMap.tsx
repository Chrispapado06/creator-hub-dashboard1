import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Maximize2 } from "lucide-react";
import { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { attributionFor, icefallMapStyle } from "@/components/map/icefallStyle";
import { OFFLINE } from "@/offline/offline";

/**
 * THE MAP ABOVE FIND'S RESULTS — the panel you pull down to.
 *
 * The owner, 2026-09-06: "when you click on find a new trail and you are on
 * that page i want it so if you scroll down when you are the top then a map of
 * your location is seen. 1:1 like all trails".
 *
 * ── HOW THE GESTURE WORKS, AND WHY IT IS NOT A GESTURE ───────────────────────
 *
 * There is no drag handler anywhere in this feature, and that is the whole
 * trick. This panel is simply the FIRST CHILD of Find's scroller, and Find sets
 * `scrollTop` to exactly this panel's height on mount — so the screen opens
 * looking as it always did, with the search bar at the top, and the map is
 * sitting just above the fold. Pulling the list down scrolls it into view with
 * the browser's own scrolling: no touch listeners, no `preventDefault`, no
 * rubber-band fight, and it works identically with a mouse wheel, a trackpad,
 * a keyboard and a screen reader.
 *
 * The alternative — a pointer-driven reveal with a spring — needs non-passive
 * touch listeners on a scrolling element, which is precisely the combination
 * that stutters on iOS and blocks the compositor.
 *
 * ── THE MAP DOES NOT PAN, AND THAT IS DELIBERATE ─────────────────────────────
 *
 * `interactive: false`. A pannable map inside a vertical scroller swallows the
 * drag that was meant to close it, so the panel would be a trap: you pull it
 * open and cannot push it shut. AllTrails does not have this problem because
 * there the map IS the page and the results are a sheet over it. Here the
 * results are the page.
 *
 * So this is an ORIENTATION VIEW — real tiles, the real place, at a zoom that
 * matches the radius being searched — and the whole panel is a link into
 * `/explore/map`, which is the map that does pan.
 *
 * ── WHAT IS PINNED ───────────────────────────────────────────────────────────
 *
 * ONE PIN: the place the search is centred on. Nothing else, because nothing
 * else on this screen has a position ICEFALL is willing to assert — the trail
 * and summit results carry coordinates, but they arrive and change as the
 * search reruns, and a map that redrew its pins under you while you were
 * reading it is worse than a map that shows you where you are looking.
 */

/** How tall the panel is. Enough to read as a map, short enough to pull past. */
export const AREA_MAP_HEIGHT = 260;

/**
 * Zoom for the radius being searched, so the circle you asked for roughly fills
 * the panel rather than being a dot in an ocean or a street corner.
 *
 * Measured against web-mercator: at zoom z one tile spans 40075/2^z km at the
 * equator. The panel is ~260px tall, so it shows about one tile; matching the
 * DIAMETER (2 × radius) to that gives z = log2(40075 / (2·r)). Clamped so a
 * 1 km search does not zoom into a car park and a 500 km one does not show the
 * whole hemisphere.
 */
function zoomForRadius(radiusKm: number | null): number {
  if (radiusKm === null || !Number.isFinite(radiusKm) || radiusKm <= 0) return 9;
  const z = Math.log2(40075 / (2 * radiusKm));
  return Math.min(12, Math.max(4, Math.round(z * 2) / 2));
}

export function AreaMap({
  lat,
  lon,
  name,
  radiusKm,
}: {
  lat: number;
  lon: number;
  name: string;
  radiusKm: number | null;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (OFFLINE || !holder.current) return;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: holder.current,
        style: icefallMapStyle,
        center: [lon, lat],
        zoom: zoomForRadius(radiusKm),
        attributionControl: false,
        /* See the header. The panel is a link, not a canvas. */
        interactive: false,
      });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;

    /*
     * A DOT, NOT A LABEL. `ExploreMap` labels its pins because each one is a
     * different mountain and the name is the point. Here there is one pin and
     * the place is already named twice on the screen above it — in the search
     * bar and in the results count — so a third copy floating on the map is
     * clutter, and it would cover the ground it is meant to be showing.
     */
    const el = document.createElement("div");
    el.className = "h-3.5 w-3.5 rounded-full border-2 border-obsidian bg-azure shadow-lg";
    el.setAttribute("aria-hidden", "true");
    const marker = new Marker({ element: el }).setLngLat([lon, lat]).addTo(map);

    /*
     * The panel starts ABOVE the fold, so the map is laid out inside a
     * container the browser has never shown. MapLibre measures its canvas on
     * creation; `resize` on the first idle catches the case where that
     * measurement happened before the scroller settled.
     */
    map.once("idle", () => map.resize());

    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lon, radiusKm]);

  if (OFFLINE) {
    return (
      <div
        style={{ height: AREA_MAP_HEIGHT }}
        className="flex flex-col justify-end bg-slate px-5 pb-5"
      >
        <p className="text-[13px] text-snow">The map needs a connection.</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-mist">
          This is the offline bundle and tiles are fetched as you pan, so there is nothing to draw
          here rather than a grey rectangle pretending to be a map.
        </p>
      </div>
    );
  }

  return (
    <div style={{ height: AREA_MAP_HEIGHT }} className="relative overflow-hidden bg-slate">
      <div ref={holder} className="absolute inset-0" />

      {/* The bottom of the map fades into the page so the search bar below it
          has a ground to sit on rather than a hard seam across the screen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-obsidian"
      />

      {failed ? (
        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <p className="text-[12.5px] leading-relaxed text-mist">
            The map could not start on this device. The results below are unaffected.
          </p>
        </div>
      ) : (
        <>
          {/* The way out to the map that DOES pan. A link over the whole panel
              would swallow a scroll that started on the map, so it is a chip. */}
          <Link
            to="/explore/map"
            className="absolute right-3 top-3 flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-obsidian/80 px-3 py-1.5 text-[11.5px] text-snow backdrop-blur transition-colors hover:border-azure/50"
          >
            <Maximize2 size={12} strokeWidth={1.9} aria-hidden />
            Full map
          </Link>

          <p className="absolute left-3 top-3 max-w-[55%] truncate rounded-pill border border-hairline-strong bg-obsidian/80 px-3 py-1.5 text-[11.5px] text-snow backdrop-blur">
            {name}
          </p>

          {/* OpenFreeMap and OpenStreetMap are credited because their licences
              require it, and `attributionFor` is the style's own markup so the
              credit always matches the tiles actually drawn. */}
          <p
            className="absolute bottom-1 right-2 text-[9px] text-mist-dim [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: attributionFor("icefall") }}
          />
        </>
      )}
    </div>
  );
}
