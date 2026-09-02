import type { StyleSpecification } from "maplibre-gl";

/**
 * ICEFALL cartography.
 *
 * A hand-written dark alpine style rather than a stock basemap — an
 * off-the-shelf style would fight the palette on every screen. Built on the
 * OpenMapTiles schema served by OpenFreeMap, with elevation from the public AWS
 * terrain tiles for hillshading and true 3D relief.
 *
 * Both sources are free and keyless, so nothing has to ship a token. Both
 * require attribution, which `TerrainMap` renders.
 */

const VECTOR_URL = "https://tiles.openfreemap.org/planet";
const DEM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const OSM_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
const DEM_ATTRIBUTION = "Elevation: Mapzen / AWS Terrain Tiles";

export const MAP_ATTRIBUTION = `${OSM_ATTRIBUTION} · ${DEM_ATTRIBUTION}`;

const OPENTOPO_ATTRIBUTION =
  'Map data © OpenStreetMap contributors · <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)';

/**
 * The credit line for the style ACTUALLY ON SCREEN.
 *
 * `TerrainMap` printed `MAP_ATTRIBUTION` unconditionally, so switching to
 * satellite left Esri's imagery credited to OpenFreeMap and OpenStreetMap —
 * crediting the wrong people for someone else's work, and omitting the one
 * party whose licence requires the credit. It also made the line useless as a
 * signal: it read the same whatever style was live, which is how a satellite
 * map that was not rendering went unnoticed.
 *
 * The DEM is appended to every one of them because the terrain mesh is the
 * same AWS source under all three styles.
 */
export function attributionFor(id: MapStyleId | undefined): string {
  switch (id) {
    case "satellite":
      return `${ESRI_ATTRIBUTION} · ${DEM_ATTRIBUTION}`;
    case "terrain":
      return `${OPENTOPO_ATTRIBUTION} · ${DEM_ATTRIBUTION}`;
    default:
      return MAP_ATTRIBUTION;
  }
}

/** Terrain source id, referenced when toggling 3D. */
export const TERRAIN_SOURCE = "icefall-dem";

/*
 * THE MAP PALETTE, KEPT IN STEP WITH `index.css`.
 *
 * A MapLibre style spec takes no CSS variables, so the tokens are restated as
 * hex — and being restated, they went stale silently. These four held the
 * retired champagne gold under azure NAMES, so the terrain map, the route line
 * and the live position marker all still drew in the old brand while a grep for
 * "gold" across the tree returned nothing.
 *
 * Values are `src/index.css` converted from oklch, and that file decides.
 */
const OBSIDIAN = "#05070B"; /* --ice-obsidian */
const AZURE = "#4B9BFF"; /* --ice-azure    */
const SNOW = "#EAEEF5"; /* --ice-snow     */
const MIST = "#8B94A6"; /* --ice-mist     */

export const icefallMapStyle: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",

  sources: {
    openmaptiles: {
      type: "vector",
      url: VECTOR_URL,
      attribution: OSM_ATTRIBUTION,
    },
    [TERRAIN_SOURCE]: {
      type: "raster-dem",
      tiles: [DEM_TILES],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 14,
      attribution: DEM_ATTRIBUTION,
    },
  },

  // Atmosphere for the tilted 3D view.
  sky: {
    "sky-color": "#0C1219",
    "horizon-color": "#1B232D",
    "fog-color": OBSIDIAN,
    "sky-horizon-blend": 0.7,
    "horizon-fog-blend": 0.6,
    "fog-ground-blend": 0.7,
  },

  layers: [
    { id: "background", type: "background", paint: { "background-color": OBSIDIAN } },

    // ---- Landcover -------------------------------------------------------
    {
      id: "landcover-wood",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "wood"],
      paint: { "fill-color": "#0C1310", "fill-opacity": 0.85 },
    },
    {
      id: "landcover-grass",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["grass", "scrub", "farmland"]]],
      paint: { "fill-color": "#0B1012", "fill-opacity": 0.7 },
    },
    // Glacier and permanent snow — the terrain ICEFALL actually cares about.
    {
      id: "landcover-ice",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["in", ["get", "subclass"], ["literal", ["glacier", "ice_shelf"]]],
      paint: { "fill-color": "#243040", "fill-opacity": 0.75 },
    },

    // ---- Water -----------------------------------------------------------
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": "#0A1219" },
    },
    {
      id: "waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: {
        "line-color": "#16222C",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 16, 2.2],
      },
    },

    // ---- Relief ----------------------------------------------------------
    // The layer that makes a mountain read as a mountain even in 2D.
    {
      id: "hillshade",
      type: "hillshade",
      source: TERRAIN_SOURCE,
      paint: {
        "hillshade-exaggeration": 0.42,
        "hillshade-shadow-color": "#000000",
        "hillshade-highlight-color": "#39414B",
        "hillshade-accent-color": "#0A0E13",
      },
    },

    // ---- Ways ------------------------------------------------------------
    {
      id: "road-minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["minor", "service", "tertiary"]]],
      paint: {
        "line-color": "rgba(230,230,230,0.10)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 18, 3],
      },
    },
    {
      id: "road-major",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary"]]],
      paint: {
        "line-color": "rgba(230,230,230,0.20)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 18, 5],
      },
    },
    // Trails and tracks get the accent — they are what an ICEFALL athlete follows.
    {
      id: "path",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["path", "track"]]],
      minzoom: 11,
      paint: {
        "line-color": "rgba(167,139,92,0.32)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 18, 2.4],
        "line-dasharray": [2, 2],
      },
    },
    {
      id: "building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 14,
      paint: { "fill-color": "#12161A", "fill-opacity": 0.7 },
    },

    // ---- Labels ----------------------------------------------------------
    {
      id: "place-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      filter: ["in", ["get", "class"], ["literal", ["city", "town", "village"]]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 14, 13],
        "text-letter-spacing": 0.08,
        "text-max-width": 8,
      },
      paint: {
        "text-color": MIST,
        "text-halo-color": OBSIDIAN,
        "text-halo-width": 1.2,
      },
    },
    // Peaks, with their elevation. The single most ICEFALL thing on the map.
    {
      id: "mountain-peak",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "mountain_peak",
      minzoom: 9,
      layout: {
        // `to-string` rather than `number-format`: OpenMapTiles types `ele`
        // inconsistently across sources, and a type mismatch would spam
        // expression warnings for every peak on screen.
        "text-field": [
          "case",
          ["has", "ele"],
          ["concat", ["get", "name"], "\n", ["to-string", ["get", "ele"]], " m"],
          ["get", "name"],
        ],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 9.5, 14, 12],
        "text-letter-spacing": 0.06,
        "text-offset": [0, 0.7],
        "text-anchor": "top",
        "text-max-width": 9,
        "icon-optional": true,
      },
      paint: {
        "text-color": SNOW,
        "text-halo-color": OBSIDIAN,
        "text-halo-width": 1.4,
      },
    },
    {
      id: "peak-marker",
      type: "circle",
      source: "openmaptiles",
      "source-layer": "mountain_peak",
      minzoom: 9,
      paint: {
        "circle-radius": 2.2,
        "circle-color": AZURE,
        "circle-opacity": 0.9,
      },
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Map styles the athlete can choose                                           */
/* -------------------------------------------------------------------------- */

/**
 * Three ways to see the same ground, all of them terrain-capable.
 *
 * The DEM source is identical in every one, so switching style never flattens
 * the mountain — satellite in 3D is the point: it shows the athlete what the
 * ground actually looks like, draped over its real shape.
 *
 * Imagery is Esri World Imagery, which serves keyless with an
 * `Access-Control-Allow-Origin: *` header (probed 2026-08-24) and requires the
 * attribution rendered below. No token ships, and nothing here costs anything.
 */
export type MapStyleId = "icefall" | "satellite" | "terrain";

export const MAP_STYLE_LABEL: Record<MapStyleId, string> = {
  icefall: "ICEFALL",
  satellite: "Satellite",
  terrain: "Terrain",
};

export const MAP_STYLE_DETAIL: Record<MapStyleId, string> = {
  icefall: "The dark house map",
  satellite: "How the ground really looks",
  terrain: "Contours and relief",
};

const ESRI_IMAGERY =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const ESRI_ATTRIBUTION =
  'Imagery © <a href="https://www.esri.com" target="_blank">Esri</a>, Vantor, Earthstar Geographics';

/** A raster style over the same terrain source, used by satellite and terrain. */
function rasterStyle(tiles: string[], attribution: string): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      base: { type: "raster", tiles, tileSize: 256, maxzoom: 18, attribution },
      [TERRAIN_SOURCE]: {
        type: "raster-dem",
        tiles: [DEM_TILES],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 14,
        attribution: DEM_ATTRIBUTION,
      },
    },
    sky: {
      "sky-color": "#0C1219",
      "horizon-color": "#1B232D",
      "fog-color": OBSIDIAN,
      "fog-ground-blend": 0.6,
      "horizon-fog-blend": 0.6,
      "sky-horizon-blend": 0.8,
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": OBSIDIAN } },
      { id: "base", type: "raster", source: "base", paint: { "raster-opacity": 1 } },
    ],
  } as StyleSpecification;
}

export function styleFor(id: MapStyleId): StyleSpecification {
  switch (id) {
    case "satellite":
      return rasterStyle([ESRI_IMAGERY], ESRI_ATTRIBUTION);
    case "terrain":
      // OpenTopoMap: contour lines and hillshade, the paper-map look.
      return rasterStyle(["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"], OPENTOPO_ATTRIBUTION);
    default:
      return icefallMapStyle;
  }
}

const STYLE_KEY = "icefall.map-style.v1";

export function savedMapStyle(): MapStyleId {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    return v === "satellite" || v === "terrain" ? v : "icefall";
  } catch {
    return "icefall";
  }
}

export function saveMapStyle(id: MapStyleId) {
  try {
    localStorage.setItem(STYLE_KEY, id);
  } catch {
    /* private mode — the choice lasts the session */
  }
}

/* -------------------------------------------------------------------------- */
/* Style previews                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A real tile from each style, so the chooser shows the ground rather than
 * describing it.
 *
 * Every preview is the SAME PLACE at the same zoom — the Mont Blanc massif —
 * because three thumbnails of three different mountains compare the mountains,
 * not the styles. They are plain `<img>` tiles, the trick `MiniMap` already
 * uses: no WebGL context, no map instance, nothing to tear down.
 *
 * ICEFALL's own style is vector and has no raster endpoint, so its card is
 * drawn from the style's own tokens instead of photographed. It is labelled as
 * a swatch rather than passed off as a screenshot — see `PREVIEW_IS_SWATCH`.
 */
const PREVIEW_Z = 12;
/** Mont Blanc massif — recognisable, and genuinely mountainous at this zoom. */
const PREVIEW_TILE = { x: 2124, y: 1452 };

export const PREVIEW_IS_SWATCH: Record<MapStyleId, boolean> = {
  icefall: true,
  satellite: false,
  terrain: false,
};

export function previewTile(id: MapStyleId): string | null {
  const { x, y } = PREVIEW_TILE;
  switch (id) {
    case "satellite":
      return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${PREVIEW_Z}/${y}/${x}`;
    case "terrain":
      return `https://a.tile.opentopomap.org/${PREVIEW_Z}/${x}/${y}.png`;
    default:
      return null;
  }
}
