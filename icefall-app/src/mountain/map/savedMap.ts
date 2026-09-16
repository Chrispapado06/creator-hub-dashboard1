/**
 * IS A MAP ACTUALLY SAVED? (plan §3.3, §4.2, §4.6)
 *
 * "Map saved 2 days ago" is only ever printed over a map pack that is genuinely
 * on this phone. Printing it over the browser's ordinary cache — which normal
 * browsing empties — would be showing old data as current in the most literal
 * way the app could manage, so with no pack the tab says the plan's sentence
 * instead, and states why no service may be downloaded from.
 *
 * Nothing here makes a network request. Reading the pack is IndexedDB and
 * arithmetic.
 */

import { useEffect, useState } from "react";

import { NO_DATABASE_SENTENCE } from "@/device/db";
import type { TripPackPart } from "@/device/types";

import {
  NO_OFFLINE_MAP_SAVED,
  OFFLINE_MAP_LICENCE,
  isEmptyData,
  packAge,
  readBody,
  readTripPack,
  type PackAgeBand,
} from "../tripPack";

/* -------------------------------------------------------------------------- */
/* The licence position, source by source (plan §4.2)                          */
/* -------------------------------------------------------------------------- */

export type DownloadPosition = "no" | "written-permission" | "asked-not-to" | "yes";

export interface MapSourceLicence {
  source: string;
  usedFor: string;
  mayDownload: DownloadPosition;
  /** What their terms say, in short. The full quotations are in plan §4.2. */
  position: string;
}

/**
 * Every map source the app touches, and whether an area may be saved from it.
 * Six of the seven say no. This is why Mountain mode draws no basemap.
 */
export const MAP_SOURCE_LICENCES: readonly MapSourceLicence[] = [
  {
    source: "OpenFreeMap",
    usedFor: "The house map style in the online app",
    mayDownload: "written-permission",
    position: "Their terms forbid collecting data from the service in automated ways without permission.",
  },
  {
    source: "OpenStreetMap tiles",
    usedFor: "Small map thumbnails in the online app",
    mayDownload: "no",
    position: "Their tile policy forbids offline use and 'save area for later' features by name.",
  },
  {
    source: "Mapbox",
    usedFor: "The 3D satellite view on mountain pages, online only",
    mayDownload: "no",
    position:
      "Its own 30-day cache is allowed; the bulk download that would fill it is not. Mountain mode does not use Mapbox at all.",
  },
  {
    source: "Esri satellite imagery",
    usedFor: "The satellite style in the online app",
    mayDownload: "no",
    position: "Esri says the layer is not intended for exporting tiles offline, and the free tier is non-commercial.",
  },
  {
    source: "OpenTopoMap",
    usedFor: "The paper-map style in the online app",
    mayDownload: "asked-not-to",
    position: "The licence would allow it; the operators ask that their server is not mass-downloaded.",
  },
  {
    source: "AWS Terrain Tiles",
    usedFor: "Hillshade and 3D relief",
    mayDownload: "yes",
    position: "Open data with no caching restriction. Credit goes to the agency each tile names, not to one blanket line.",
  },
  {
    source: "ICEFALL map packs",
    usedFor: "Nothing yet — this is the compliant route, and it is not built",
    mayDownload: "yes",
    position:
      "Map packs cut from OpenStreetMap data and served from ICEFALL's own site. Nobody else's server is touched, and the packs would be published at stable public URLs to satisfy the share-alike licence.",
  },
];

/** The short line the Map tab prints under the plot. */
export const MAP_LICENCE_LINE =
  "No map service ICEFALL uses allows an area to be saved, so none is saved. Nothing on this plot was downloaded from a map service.";

export const PLACE_SOURCE_LINE = "Huts, camps and summits come from records inside the app, each with its own date.";

/* -------------------------------------------------------------------------- */
/* Is one saved?                                                               */
/* -------------------------------------------------------------------------- */

export type SavedMapState =
  | {
      kind: "none";
      /** The plan's own sentence, plus why no service may be downloaded from. */
      sentence: string;
      licence: string;
    }
  | {
      kind: "saved";
      /** "Map saved 2 days ago" — printed only over a pack that is really here. */
      line: string;
      band: PackAgeBand;
      /** True past 30 days: drawn grey and labelled, never hidden (plan §3.0). */
      greyed: boolean;
      sourceNote: string | null;
      savedAt: number;
      sizeBytes: number;
    };

export const NO_MAP_SAVED: SavedMapState = {
  kind: "none",
  sentence: NO_OFFLINE_MAP_SAVED,
  licence: OFFLINE_MAP_LICENCE,
};

/* -------------------------------------------------------------------------- */
/* The caption printed in the plot's own bottom-left corner (mockup §6)        */
/* -------------------------------------------------------------------------- */

/**
 * The mockup prints `MAP SAVED 2 DAYS AGO` down there. That line is only ever
 * true over a real pack, so with nothing saved the same slot says so in as many
 * words, and the full sentence sits in prose under the plot. The slot keeps its
 * shape; the claim does not survive into a screen that cannot back it.
 */
export const NO_MAP_SAVED_CAPTION = "No map saved";
export const MAP_OVER_A_MONTH_OLD = " · over a month old";

export function mapCaption(state: SavedMapState): string {
  if (state.kind !== "saved") return NO_MAP_SAVED_CAPTION;
  return state.greyed ? `${state.line}${MAP_OVER_A_MONTH_OLD}` : state.line;
}

/**
 * A map counts as saved only when a map part exists AND carries real data. An
 * empty part is a download that brought nothing back, and must never be dressed
 * up as a saved map.
 */
export function savedMapState(parts: readonly TripPackPart[], now: number = Date.now()): SavedMapState {
  const part = parts.find((p) => p.kind === "map");
  if (!part) return NO_MAP_SAVED;
  const body = readBody(part);
  if (!body || isEmptyData(body.value)) return NO_MAP_SAVED;

  const age = packAge(part, now);
  return {
    kind: "saved",
    line: `Map ${(age.text ?? "saved").toLowerCase()}`,
    band: age.band,
    greyed: age.greyed,
    sourceNote: part.sourceNote,
    savedAt: part.savedAt,
    sizeBytes: part.sizeBytes,
  };
}

export interface UseSavedMap {
  state: SavedMapState;
  loading: boolean;
  /** False when this phone has no database: the tab says so rather than implying nothing is saved. */
  storageOk: boolean;
  storageSentence: string | null;
}

/** Read-only. It never refreshes a pack, so opening the Map tab downloads nothing. */
export function useSavedMap(tripId: string | null): UseSavedMap {
  const [state, setState] = useState<SavedMapState>(NO_MAP_SAVED);
  const [loading, setLoading] = useState<boolean>(tripId !== null);
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!tripId) {
      setState(NO_MAP_SAVED);
      setLoading(false);
      return;
    }
    setLoading(true);
    readTripPack(tripId)
      .then((parts) => {
        if (cancelled) return;
        setState(savedMapState(parts));
        setStorageOk(true);
      })
      .catch(() => {
        if (!cancelled) setStorageOk(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return { state, loading, storageOk, storageSentence: storageOk ? null : NO_DATABASE_SENTENCE };
}
