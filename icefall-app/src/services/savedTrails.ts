import type { Trail } from "./trails";

/**
 * Trails the athlete has saved.
 *
 * A Save button that forgets the moment you leave the page is worse than no
 * Save button: it looks like it worked. This persists to localStorage, which is
 * where every other piece of ICEFALL state lives until there is an account to
 * sync to — and the screens say so rather than implying a cloud.
 */

const KEY = "icefall.trails.saved.v1";

/** The subset worth keeping. Geometry is re-fetched; it is far too big to store. */
export interface SavedTrail {
  id: string;
  osmId: number;
  name: string;
  localName?: string;
  ref?: string;
  network?: Trail["network"];
  lengthKm: number | null;
  lat: number;
  lon: number;
  savedAt: string;
}

export function savedTrails(): SavedTrail[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedTrail[]) : [];
  } catch {
    return [];
  }
}

export const isTrailSaved = (osmId: number) => savedTrails().some((t) => t.osmId === osmId);

export function saveTrail(trail: Trail): SavedTrail[] {
  const entry: SavedTrail = {
    id: trail.id,
    osmId: trail.osmId,
    name: trail.name,
    localName: trail.localName,
    ref: trail.ref,
    network: trail.network,
    lengthKm: trail.lengthKm,
    lat: trail.lat,
    lon: trail.lon,
    savedAt: new Date().toISOString(),
  };
  const next = [entry, ...savedTrails().filter((t) => t.osmId !== trail.osmId)];
  write(next);
  return next;
}

export function unsaveTrail(osmId: number): SavedTrail[] {
  const next = savedTrails().filter((t) => t.osmId !== osmId);
  write(next);
  return next;
}

function write(list: SavedTrail[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode — saving is best-effort, and the UI says it is device-local */
  }
}

export const SAVED_NOTICE = "Saved on this device — syncing needs an account.";
