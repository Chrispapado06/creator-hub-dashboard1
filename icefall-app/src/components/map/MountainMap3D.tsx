/**
 * THE MOUNTAIN, AS A MOUNTAIN.
 *
 * Charlie, 11 September 2026, looking at the MapLibre terrain view on the
 * mountain page: "thats a shit 3d map, i need it to be showing terrain".
 *
 * He was right, and the diagnosis matters because the old map was not broken.
 * `TerrainMap` renders genuine elevation from the AWS terrain tiles and tilts
 * a real camera through it. What it drapes over that elevation is a DARK
 * VECTOR BASEMAP — lines, labels and a flat fill. Relief shading on a dark
 * ground reads as a technical diagram of a mountain. There is no snow, no
 * rock, no glacier, so nothing about it looks like the place.
 *
 * This component changes exactly one thing: what is painted on the terrain.
 * Same idea, satellite photography instead of vector fill, and the mountain
 * looks like the mountain.
 *
 * ── WHY THIS IS MAPBOX AND NOT MAPLIBRE ─────────────────────────────────────
 *
 * Mapbox licenses its tiles and styles FOR USE WITH MAPBOX'S OWN SDK. Pointing
 * MapLibre at a Mapbox style with a Mapbox token works perfectly and is
 * outside their terms, which is a bad way to build a business on somebody
 * else's imagery. So this file imports `mapbox-gl`.
 *
 * IT DOES NOT REPLACE `TerrainMap`. Trails, treks, activity replays and the
 * live tracker all keep the MapLibre map on free tiles, because they are
 * rendered constantly and Mapbox bills per map load. One page — the mountain
 * page — is worth paying for, and the blast radius of this file is that page.
 *
 * ── THE TOKEN ───────────────────────────────────────────────────────────────
 *
 * `VITE_MAPBOX_TOKEN` is a PUBLIC (pk.) token. Public tokens are designed to
 * ship inside a client bundle and there is no way to hide one in a web app —
 * anybody can read it out of the JavaScript. The control that actually works
 * is a URL restriction set on the token in the Mapbox account, and that is the
 * owner's to apply. Do not "secure" this by proxying it; that would cost a
 * round trip per tile and protect nothing.
 *
 * ── WHAT IT REFUSES TO DRAW ─────────────────────────────────────────────────
 *
 * Camps, huts and climbing lines, unless it is handed real coordinates. The
 * curated `MountainRoute` records carry a name, a grade, a distance and an
 * ascent, and no geometry at all. A convincing satellite image with pins in
 * plausible places is the most persuasive lie this app could tell, so the
 * `camps` prop is the only thing that puts a marker on this map, and the
 * caller tells the reader which case they are looking at.
 */

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapUnavailable } from "@/offline/MapUnavailable";
import { OFFLINE } from "@/offline/offline";
import { cn } from "@/lib/utils";

/** Public token. Absent in a build that was never given one — see below. */
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

/**
 * Satellite WITH labels. The plain `satellite-v9` style has no place names at
 * all, and an unlabelled photograph of a glaciated massif is beautiful and
 * useless — a reader cannot tell the Dôme du Goûter from the Aiguille du Midi.
 */
const STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

/**
 * Terrain exaggeration.
 *
 * 1.0 is the truth and it looks flat in a 300px-tall viewport on a phone,
 * because the eye reads a shallow angle as flat ground. 2.0 turns the Alps
 * into a cartoon. 1.5 is the value that reads as the mountain without lying
 * about its shape, checked against the real profile of Mont Blanc rather than
 * picked because it sounded reasonable.
 */
const EXAGGERATION = 1.5;

/** The camera the mountain is meant to be seen from. One definition, so the
    opening view and the camps fit cannot drift apart. */
const RESTING_PITCH = 67;
const RESTING_BEARING = 180;

export interface MapCamp {
  name: string;
  lat: number;
  lon: number;
  /** From OSM's `ele` tag. Null means OSM had none — never interpolated. */
  elevationM: number | null;
}

export function MountainMap3D({
  lat,
  lon,
  name,
  camps = [],
  className,
}: {
  lat: number;
  lon: number;
  name: string;
  camps?: MapCamp[];
  className?: string;
}) {
  /*
   * OFFLINE is a build-time constant, so every render of every instance takes
   * the same branch and the hook order below can never change. Same pattern,
   * and the same reasoning, as TerrainMap.
   */
  if (OFFLINE) return <MapUnavailable className={cn("h-full w-full", className)} />;

  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [failed, setFailed] = useState<null | "token" | "webgl" | "load">(
    TOKEN ? null : "token",
  );

  useEffect(() => {
    if (!TOKEN || !holder.current || mapRef.current) return;

    /* A refused WebGL context is not a map bug and must not be reported as
       one. Mapbox has its own check; asking it first gives a clearer state. */
    if (!mapboxgl.supported?.()) {
      setFailed("webgl");
      return;
    }

    mapboxgl.accessToken = TOKEN;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: holder.current,
        style: STYLE,
        center: [lon, lat],
        /* Close enough that the summit fills the frame, far enough that the
           ridges leading to it are still in it. */
        zoom: 11.9,
        /*
         * THE CAMERA HAS TO LOOK AT THE MOUNTAIN, which is not what centring
         * on the summit does. At pitch 68 the camera sits behind the centre
         * and looks PAST it into the distance — the first build framed the
         * Chamonix valley and Lake Geneva with Mont Blanc behind the lens.
         *
         * bearing 180 puts south at the top of the screen, which places the
         * camera NORTH of the summit looking south: the massif rises out of
         * the frame towards the viewer. That is the view from Chamonix, and
         * it is the one every photograph of this mountain is taken from.
         *
         * `padding` lifts the focal point so the summit sits in the upper
         * third rather than dead centre, leaving the face in the frame.
         */
        pitch: RESTING_PITCH,
        bearing: RESTING_BEARING + 16,
        attributionControl: true,
        cooperativeGestures: false,
        /* The page scrolls; a map that grabs the wheel traps the reader. */
        scrollZoom: false,
      });
    } catch {
      setFailed("webgl");
      return;
    }

    mapRef.current = map;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    map.on("style.load", () => {
      /* THE ELEVATION. Without this the satellite image is a flat photograph
         and the pitch buys nothing. 512px tiles at maxzoom 14 is Mapbox's own
         recommended DEM configuration. */
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: "mapbox-dem", exaggeration: EXAGGERATION });

      /* Atmosphere. Without a sky the horizon is a hard line against the page
         background and the whole thing reads as a cut-out. */
      if (!map.getLayer("sky")) {
        map.addLayer({
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [0.0, 88.0],
            "sky-atmosphere-sun-intensity": 6,
          },
        });
      }
    });

    /*
     * THE SUMMIT MARKER GOES ON NOW, NOT ON `load`.
     *
     * It used to be added inside the `load` handler, which meant it appeared
     * only once the style and first tiles had arrived. Measured in headless
     * Chrome against this dev server: the camp markers — added in their own
     * effect, which does not wait — were on screen while `.mm3d-summit` was
     * still absent, because `load` had not fired. The caption underneath says
     * "The summit is marked", so a slow or failed style load turned a caption
     * about what IS and IS NOT surveyed into a false one, on the screen where
     * that matters most. Markers do not need the style; they are DOM nodes
     * positioned by projection, which is why the camps worked. So this is
     * added the same way, and the two can no longer disagree.
     */
    const summit = document.createElement("div");
    summit.className = "mm3d-summit";
    summit.setAttribute("aria-hidden", "true");
    new mapboxgl.Marker({ element: summit, anchor: "center" })
      .setLngLat([lon, lat])
      .addTo(map);

    map.on("load", () => {
      /* Lift the focal point so the summit is not dead centre. */
      map.setPadding({ top: 0, right: 0, bottom: 150, left: 0 });

      if (!reduced) {
        /* A slow settle on arrival, once, to show it is three-dimensional.
           It rotates TOWARDS the mountain (196 -> 180), never away from it,
           and it is not a loop: an endlessly spinning map is a toy. */
        map.easeTo({ bearing: RESTING_BEARING, duration: 4200, essential: false });
      }
    });

    map.on("error", (e) => {
      /* 401 means the token was refused. Anything else is a tile that failed,
         which the map recovers from on its own — do not blank the page for it. */
      const status = (e as unknown as { error?: { status?: number } })?.error?.status;
      if (status === 401 || status === 403) setFailed("token");
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lon]);

  /* Camps arrive after the map; adding them in their own effect means a later
     harvest lands without rebuilding the map underneath the reader. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || camps.length === 0) return;

    const markers = camps.map((c) => {
      const el = document.createElement("div");
      el.className = "mm3d-camp";
      el.innerHTML =
        '<span class="mm3d-camp-dot" aria-hidden="true"></span>' +
        '<span class="mm3d-camp-label">' +
        escapeHtml(c.name) +
        (c.elevationM !== null
          ? ' <b>' + c.elevationM.toLocaleString("en-GB") + " m</b>"
          : "") +
        "</span>";
      /*
       * THE LABEL GOES UNDER THE DOT, CENTRED, AND WRAPS.
       *
       * A label running sideways off the dot gets clipped at whichever edge of
       * a 390px map it happens to be near — "Refuge du Goûter 3,81…". The
       * obvious fix, flipping the side based on whether the camp is east or
       * west of the summit, IS WRONG AND WAS TRIED: this camera is rotated
       * 180°, so east renders on the LEFT of the screen and the flip clipped
       * the other end of the word instead. Screen position is not longitude.
       *
       * Centred under the point, wrapping to two lines, a label has half the
       * horizontal reach and no side to fall off.
       */
      return new mapboxgl.Marker({ element: el, anchor: "top", offset: [0, -5] })
        .setLngLat([c.lon, c.lat])
        .addTo(map);
    });

    /*
     * FRAME THE MOUNTAIN AND ITS CAMPS — but only once the map is actually
     * ready, and without re-stating the camera angle.
     *
     * The first version of this called fitBounds immediately with its own
     * pitch, bearing and padding. Measured result: the map requested the
     * style, the DEM manifest and the fonts, and then NOT ONE RASTER TILE —
     * a black canvas on a container that was the right size, which looks
     * exactly like a broken map and was in fact a camera nobody could see
     * from. Two causes, both avoidable: the fit ran before `load`, and its
     * padding compounded with the `setPadding` applied on load, which at
     * pitch 64 pushed the viewport off the world.
     *
     * So: wait for load, pass ONLY the bounds and a modest uniform padding,
     * and leave pitch and bearing to the camera that is already correct.
     */
    const fit = () => {
      const bounds = new mapboxgl.LngLatBounds([lon, lat], [lon, lat]);
      for (const c of camps) bounds.extend([c.lon, c.lat]);
      /* fitBounds RESETS pitch and bearing to 0 unless it is given them, so
         omitting them does not "leave the camera alone" — it flattens it.
         Measured: centre and zoom correct, pitch 0, bearing 0, and the whole
         point of the map gone. They are passed explicitly, from the same
         constants the opening camera uses. */
      map.fitBounds(bounds, {
        padding: 48,
        duration: 0,
        maxZoom: 13.2,
        pitch: RESTING_PITCH,
        bearing: RESTING_BEARING,
      });
    };
    if (map.loaded()) fit();
    else map.once("load", fit);

    return () => {
      for (const m of markers) m.remove();
    };
  }, [camps, lat, lon]);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-graphite px-6 text-center",
          className,
        )}
      >
        <p className="max-w-[36ch] text-[12px] leading-relaxed text-mist-dim">
          {failed === "token"
            ? "The satellite map is not configured in this build, so there is nothing here rather than a placeholder of somewhere else."
            : failed === "webgl"
              ? "This browser will not give the page a 3D canvas, so the terrain cannot be drawn. The figures on this page are unaffected."
              : "The map did not load."}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/*
        h-full, NOT `absolute inset-0`. mapbox-gl.css sets
        `.mapboxgl-map { position: relative }` on whatever element it is given,
        which overrode the absolute positioning and collapsed this div to
        402x0 — the canvas rendered real terrain behind a zero-height box and
        the section looked like a black band. Measured, not guessed: the
        container read 402x0 while readPixels on the canvas returned
        (77,93,61) green and (200,208,214) snow.
      */}
      <div ref={holder} className="h-full w-full" aria-label={`3D terrain around ${name}`} />
      <style>{MARKER_CSS}</style>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

/* Scoped to this map's markers. Inline because they are created as DOM nodes
   by Mapbox rather than rendered by React, so Tailwind's scanner never sees
   them and would purge the classes. */
const MARKER_CSS = `
.mm3d-summit{
  width:13px;height:13px;border-radius:50%;
  background:#5B8DEF;border:2px solid #fff;
  box-shadow:0 0 0 4px rgba(91,141,239,.35);
}
.mm3d-camp{
  display:flex;flex-direction:column;align-items:center;gap:3px;
  pointer-events:none;width:118px;text-align:center;
}
.mm3d-camp-dot{
  width:8px;height:8px;border-radius:50%;flex:0 0 auto;
  background:#fff;border:1.5px solid #11141C;
  box-shadow:0 0 0 3px rgba(0,0,0,.35);
}
.mm3d-camp-label{
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  font-size:10.5px;line-height:1.25;color:#fff;
  text-shadow:0 1px 3px rgba(0,0,0,.95),0 0 8px rgba(0,0,0,.8);
}
.mm3d-camp-label b{font-weight:600;opacity:.85}
`;
