import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LocateFixed } from "lucide-react";
import { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { attributionFor, savedMapStyle, styleFor } from "@/components/map/icefallStyle";
import { OFFLINE } from "@/offline/offline";
import { cn } from "@/lib/utils";

/**
 * THE FIND MAP — full-bleed, behind the results sheet.
 *
 * The owner, 2026-09-07, with a recording of AllTrails' Explore tab: "1:1 like
 * alltrails please". In that recording the map is the whole screen and the
 * results are a sheet drawn over its lower half; drag the sheet up and it
 * covers the map, drag it down and the map is back. This is the map half of
 * that. The sheet is `Routes.tsx`.
 *
 * It replaces a 260px panel that was parked off the top of the list and
 * revealed by pulling down. That panel was `interactive: false` — a picture of
 * a map with a "Full map" link on it. This one pans and zooms, because on the
 * reference the map IS the control: it is where you look to see where the
 * trails are.
 *
 * ── CREATED ONCE, MOVED THEREAFTER ──────────────────────────────────────────
 * The old panel tore the map down and rebuilt it on every change of place or
 * radius. Here it is created on mount and `easeTo`'d when the place changes,
 * which is what makes choosing a new town feel like the map travelling there
 * rather than a new map appearing.
 *
 * ── IT SAYS WHEN IT IS STILL LOADING ────────────────────────────────────────
 * The owner's own phone showed a black rectangle where this map should have
 * been — tiles that had not arrived over a weak signal, on a dark style, with
 * nothing on screen to say so. A map that has not loaded now says "Loading
 * map…", and one that cannot load says that instead of staying black.
 *
 * ── PINS ARE THE RESULTS ─────────────────────────────────────────────────────
 * Every trail and summit in the list below is a pin here, and tapping a pin
 * opens the same page the card opens. Nothing is pinned that is not in the
 * list, so the map never shows a trail the list cannot name.
 */

export interface MapPin {
  id: string;
  lat: number;
  lon: number;
  name: string;
  href: string;
}

/**
 * Zoom for the radius being searched, so the circle you asked for roughly fills
 * the visible half of the map rather than being a dot in an ocean or a street
 * corner. Web-mercator: at zoom z one tile spans 40075/2^z km at the equator;
 * matching the DIAMETER (2 × radius) to roughly one tile gives z = log2(40075 /
 * (2·r)). Clamped so a 1 km search does not zoom into a car park and a 500 km
 * one does not show the whole hemisphere.
 */
function zoomForRadius(radiusKm: number | null): number {
  if (radiusKm === null || !Number.isFinite(radiusKm) || radiusKm <= 0) return 9;
  const z = Math.log2(40075 / (2 * radiusKm));
  return Math.min(12, Math.max(4, Math.round(z * 2) / 2));
}

export function FindMap({
  lat,
  lon,
  radiusKm,
  pins,
  visibleFraction,
  locating,
  onLocate,
  locateNote,
}: {
  lat: number;
  lon: number;
  radiusKm: number | null;
  pins: readonly MapPin[];
  /** How much of the map the sheet leaves uncovered at rest, 0–1. Controls sit above that line. */
  visibleFraction: number;
  locating: boolean;
  onLocate: () => void;
  /** Why the last locate did not land, in a sentence — or null. */
  locateNote: string | null;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const navigate = useNavigate();

  /* ---- The map, once ------------------------------------------------------ */
  useEffect(() => {
    if (OFFLINE || !holder.current) return;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: holder.current,
        style: styleFor(savedMapStyle()),
        center: [lon, lat],
        zoom: zoomForRadius(radiusKm),
        attributionControl: false,
        /* Pan and pinch, no rotate or tilt: a rotated map under a results list
           is disorienting and nothing on this screen needs it. */
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch {
      setStatus("failed");
      return;
    }
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    let ready = false;
    map.once("load", () => {
      ready = true;
      setStatus("ready");
    });
    /*
     * "Failed" is only declared when nothing has loaded after a long wait. A
     * single tile 404 also fires `error`, and calling the whole map broken on
     * one missing tile would be wrong far more often than right.
     */
    const giveUp = window.setTimeout(() => {
      if (!ready) setStatus("failed");
    }, 20_000);

    /* The stage this sits in changes height with the viewport; MapLibre only
       measures its canvas on creation. */
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(holder.current);

    return () => {
      window.clearTimeout(giveUp);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // Created once; the place is followed by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Follow the place ---------------------------------------------------- */
  useEffect(() => {
    mapRef.current?.easeTo({ center: [lon, lat], zoom: zoomForRadius(radiusKm), duration: 650 });
  }, [lat, lon, radiusKm]);

  /* ---- Pins ------------------------------------------------------------------ */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = pins.map((p) => {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", p.name);
      el.className =
        "h-3.5 w-3.5 rounded-full border-2 border-obsidian bg-azure shadow-lg transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60";
      el.addEventListener("click", () => navigate(p.href));
      return new Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [pins, navigate]);

  if (OFFLINE) {
    return (
      <div className="absolute inset-0 flex flex-col justify-start bg-slate px-5 pt-24">
        <p className="text-[13px] text-snow">The map needs a connection.</p>
        <p className="mt-1 max-w-[30ch] text-[11.5px] leading-relaxed text-mist">
          This is the offline bundle and tiles are fetched as you pan, so there is nothing to draw
          here rather than a grey rectangle pretending to be a map.
        </p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-slate">
      <div ref={holder} className="absolute inset-0" />

      {/* Said while it is true, and gone the moment it is not. */}
      {status !== "ready" && (
        <div
          className="pointer-events-none absolute inset-x-0 flex justify-center"
          style={{ top: `calc(${visibleFraction * 100}% / 2)` }}
        >
          <p className="flex items-center gap-2 rounded-pill bg-obsidian/70 px-3.5 py-2 text-[12px] text-mist backdrop-blur">
            {status === "loading" ? (
              <>
                <Loader2 size={13} strokeWidth={2} className="animate-spin" aria-hidden />
                Loading map…
              </>
            ) : (
              "The map could not load on this device. The list below is unaffected."
            )}
          </p>
        </div>
      )}

      {/* Controls sit on the part of the map the sheet leaves uncovered. */}
      <div
        className="absolute right-4 flex flex-col items-end gap-2"
        style={{ top: `calc(${visibleFraction * 100}% - 64px)` }}
      >
        {locateNote && (
          <p className="max-w-[220px] rounded-tile bg-obsidian/85 px-3 py-2 text-right text-[11px] leading-relaxed text-mist backdrop-blur">
            {locateNote}
          </p>
        )}
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          aria-label="Search around my location"
          className={cn(
            "grid h-11 w-11 place-items-center rounded-full border border-hairline-strong bg-obsidian/85 text-snow shadow-[var(--ice-shadow-pop)] backdrop-blur transition-colors hover:border-azure/50",
            locating && "text-azure",
          )}
        >
          {locating ? (
            <Loader2 size={17} strokeWidth={2} className="animate-spin" aria-hidden />
          ) : (
            <LocateFixed size={17} strokeWidth={1.8} aria-hidden />
          )}
        </button>
      </div>

      {/* OpenFreeMap and OpenStreetMap are credited because their licences
          require it, and `attributionFor` is the style's own markup so the
          credit always matches the tiles actually drawn. */}
      <p
        className="pointer-events-auto absolute left-3 text-[9px] text-mist-dim [&_a]:underline"
        style={{ top: `calc(${visibleFraction * 100}% - 22px)` }}
        dangerouslySetInnerHTML={{ __html: attributionFor(savedMapStyle()) }}
      />
    </div>
  );
}
