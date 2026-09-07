import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, Loader2, LocateFixed } from "lucide-react";
import { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  attributionFor,
  MAP_STYLE_LABEL,
  saveMapStyle,
  savedMapStyle,
  styleFor,
  type MapStyleId,
} from "@/components/map/icefallStyle";
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
 *
 * ── THE SAME THREE STYLES AS EVERYWHERE ELSE ────────────────────────────────
 * The owner, 2026-09-07: "have options on the map of explore to change via
 * satellite imagery, normal, line etc etc". Those options already existed —
 * `icefallStyle.ts` has held ICEFALL / Satellite / Terrain since the tracker
 * screens got a picker — and this map alone read the saved choice once at
 * construction and then offered no way to change it. So this is the same three
 * styles, the same labels and the same `saveMapStyle` key, surfaced here.
 *
 * ONE PREFERENCE, NOT A SECOND ONE. Choosing Satellite here is the choice the
 * tracker will use on the next recording, and vice versa. A separate Explore-
 * only preference would mean the athlete sets "satellite" twice and still meets
 * a dark map somewhere, which is exactly the kind of half-applied setting that
 * reads as a bug.
 *
 * The switch restyles the LIVE map. Remounting was rejected: this map's whole
 * character is that it is created once and travels (see above), and tearing it
 * down to change a basemap would lose the pan and zoom the athlete has just
 * done and flash the "Loading map…" line at them for a change they made
 * deliberately.
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

  /* The style on screen. Seeded from the shared preference, so the map opens in
     whatever the athlete last chose on any screen. */
  const [mapStyle, setMapStyle] = useState<MapStyleId>(() => savedMapStyle());
  /* The picker is one glyph until asked for. Three permanent pills would sit on
     the map's uncovered half — the half that exists to show where the trails
     are — for a control most people touch once. */
  const [pickerOpen, setPickerOpen] = useState(false);

  /* ---- The map, once ------------------------------------------------------ */
  useEffect(() => {
    if (OFFLINE || !holder.current) return;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: holder.current,
        /* `savedMapStyle()` again rather than the state, because this effect is
           mount-once and reading the state here would be a stale closure the
           day anything else changes it before load. Both resolve to the same
           value on the first paint. */
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

  /* ---- Restyle in place ------------------------------------------------------ */
  /*
   * `setStyle` swaps every source and layer under the same map instance, so the
   * centre, the zoom and the canvas all survive — the ground changes, the view
   * does not.
   *
   * THE PINS SURVIVE THIS, AND THAT IS NOT LUCK. A MapLibre `Marker` is a DOM
   * element appended to the map's canvas CONTAINER, not a style layer: it is
   * held by the Map, and `setStyle` only replaces `map.style`. Verified against
   * `Marker.addTo` in maplibre-gl before relying on it, because the opposite is
   * true of anything drawn as a layer — `TerrainMap` has to redraw its route
   * line after exactly this call, and it does not re-add its markers, which is
   * the same conclusion reached from the other direction. So there is no
   * re-add here: adding one would be a ritual against a problem that does not
   * exist, and it would make the pins blink on every switch.
   *
   * Guarded on `status` so a switch made while the first style is still
   * arriving cannot race the load. The ref is what makes this a no-op on every
   * unrelated re-render, of which this component has many.
   */
  const styleRef = useRef(mapStyle);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready" || styleRef.current === mapStyle) return;
    styleRef.current = mapStyle;
    map.setStyle(styleFor(mapStyle));
  }, [mapStyle, status]);

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

      {/*
        Controls sit on the part of the map the sheet leaves uncovered.

        ANCHORED BY ITS BOTTOM EDGE. This block used to be anchored by its top,
        at the resting line minus the height of the one button it held — which
        worked only while it held one button. Anything added above the button,
        the locate note included, pushed the button DOWN past the resting line
        and under the sheet. `-translate-y-full` pins the bottom of the stack to
        the line instead, so the locate button stays exactly where it has always
        been and everything else grows upward into open map.
      */}
      <div
        className="absolute right-4 flex -translate-y-full flex-col items-end gap-2"
        style={{ top: `calc(${visibleFraction * 100}% - 20px)` }}
      >
        {locateNote && (
          <p className="max-w-[220px] rounded-tile bg-obsidian/85 px-3 py-2 text-right text-[11px] leading-relaxed text-mist backdrop-blur">
            {locateNote}
          </p>
        )}

        {/* The three styles, in the tracker's own vocabulary: the same labels,
            the same pill, the same azure-on-selected. A picker that looked
            different here would read as a different setting. */}
        {pickerOpen && (
          <div className="flex flex-col items-end gap-1.5">
            {(Object.keys(MAP_STYLE_LABEL) as MapStyleId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMapStyle(id);
                  saveMapStyle(id);
                  setPickerOpen(false);
                }}
                aria-pressed={mapStyle === id}
                className={cn(
                  "rounded-pill border px-3 py-1.5 text-[11px] backdrop-blur transition-colors",
                  mapStyle === id
                    ? "border-azure/55 bg-azure/[0.12] text-azure"
                    : "border-hairline-strong bg-obsidian/85 text-mist hover:text-snow",
                )}
              >
                {MAP_STYLE_LABEL[id]}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          aria-expanded={pickerOpen}
          /* The label carries the current style because the glyph cannot: a
             stack of sheets says "styles", never which one is drawn. */
          aria-label={`Map style — ${MAP_STYLE_LABEL[mapStyle]}`}
          className={cn(
            "grid h-11 w-11 place-items-center rounded-full border bg-obsidian/85 shadow-[var(--ice-shadow-pop)] backdrop-blur transition-colors",
            pickerOpen
              ? "border-azure/55 text-azure"
              : "border-hairline-strong text-snow hover:border-azure/50",
          )}
        >
          <Layers size={17} strokeWidth={1.8} aria-hidden />
        </button>

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

      {/* The credit for the tiles ACTUALLY ON SCREEN, which is a licence
          obligation and not a caption. This read `attributionFor(savedMapStyle())`
          — the stored preference rather than the live style — which was right
          only because nothing on this screen could change the style. Now that
          something can, the same call would have credited OpenStreetMap for
          Esri's imagery until the next remount. It follows the state. */}
      <p
        className="pointer-events-auto absolute left-3 text-[9px] text-mist-dim [&_a]:underline"
        style={{ top: `calc(${visibleFraction * 100}% - 22px)` }}
        dangerouslySetInnerHTML={{ __html: attributionFor(mapStyle) }}
      />
    </div>
  );
}
