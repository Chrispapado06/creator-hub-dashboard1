/**
 * PINS YOU ADDED (plan §3.3, the hazard row).
 *
 * ICEFALL holds no hazard zones for any mountain — not for one of the fourteen.
 * The curated hazard records are written descriptions of what a route is like in
 * a season, with sources; none of them carries a boundary or a coordinate. So
 * the only honest hazard geometry is what the athlete or their guide marks
 * themselves, and every pin is labelled "Added by you · not verified" and
 * carries the date it was added. Snow conditions are the fastest-changing thing
 * in the app, so an old pin says its age loudly rather than sitting there
 * looking like a survey.
 *
 * Pins stay on this phone. They are never sent anywhere, and they need no
 * network to write or to read.
 */

import { useCallback, useEffect, useState } from "react";

import { kvGet, kvSet } from "@/device/db";

import { ageLabel } from "../format";

export const PINS_KEY = "mountain.map.pins.v1";

export interface MapPin {
  id: string;
  /** Which trip it belongs to, so last season's pins are not on this week's plot. */
  tripId: string;
  lat: number;
  lon: number;
  /** Short and fixed — there is no keyboard worth using in gloves. */
  label: string;
  /** The fix's own accuracy when it was dropped, so the plot can draw the doubt. */
  accuracyM: number | null;
  addedAt: number;
}

export const PIN_UNVERIFIED = "Added by you · not verified";

export const NO_HAZARD_GEOMETRY =
  "ICEFALL holds no hazard zones or boundaries for any mountain. What the app has is written hazard notes with their sources, on the Trip tab. Anything drawn here is a pin somebody on this phone added.";

export const PIN_NEEDS_FIX = "Find your position first. A pin is placed where you are standing, not where the plot is.";

/** Past this, a pin about snow is old news and says so. */
export const PIN_OLD_MS = 24 * 3_600_000;

/** The labels a pin may carry. Typing a sentence in gloves is not a feature. */
export const PIN_LABELS = ["Hazard", "Crevasse", "Rockfall", "Turned back here", "Water", "Shelter"] as const;
export type PinLabel = (typeof PIN_LABELS)[number];

export function pinsForTrip(pins: readonly MapPin[], tripId: string | null): MapPin[] {
  if (!tripId) return [];
  return pins.filter((p) => p.tripId === tripId).sort((a, b) => b.addedAt - a.addedAt);
}

export function addPin(pins: readonly MapPin[], pin: MapPin): MapPin[] {
  return [...pins.filter((p) => p.id !== pin.id), pin];
}

export function removePin(pins: readonly MapPin[], id: string): MapPin[] {
  return pins.filter((p) => p.id !== id);
}

export interface PinFix {
  lat: number;
  lon: number;
  accuracyM: number | null;
}

export function pinFromFix(fix: PinFix, tripId: string, label: string, now: number, id?: string): MapPin {
  return {
    id: id ?? `pin-${now}-${Math.round(Math.abs(fix.lat * 1000)) % 1000}`,
    tripId,
    lat: fix.lat,
    lon: fix.lon,
    label,
    accuracyM: fix.accuracyM,
    addedAt: now,
  };
}

/** "Added 3 hours ago · not verified". */
export function pinAddedLine(pin: MapPin, now: number): string {
  return `Added ${ageLabel(Math.max(0, now - pin.addedAt))} · not verified`;
}

export function pinIsOld(pin: MapPin, now: number, olderThanMs: number = PIN_OLD_MS): boolean {
  return now - pin.addedAt >= olderThanMs;
}

export const PIN_OLD_SENTENCE = "Snow changes faster than this pin. Treat it as a note, not as a condition report.";

function isPin(v: unknown): v is MapPin {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.tripId === "string" &&
    typeof r.lat === "number" &&
    Number.isFinite(r.lat) &&
    typeof r.lon === "number" &&
    Number.isFinite(r.lon) &&
    typeof r.label === "string" &&
    typeof r.addedAt === "number" &&
    Number.isFinite(r.addedAt)
  );
}

/** A hand-edited or half-written record cannot break the plot; it is dropped. */
export function readPins(value: unknown): MapPin[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPin).map((p) => ({ ...p, accuracyM: typeof p.accuracyM === "number" ? p.accuracyM : null }));
}

export interface UseMapPins {
  pins: MapPin[];
  /** Null when the pin could not be written; the caller says so rather than pretending. */
  add: (fix: PinFix, label: string) => Promise<MapPin | null>;
  remove: (id: string) => Promise<void>;
  loading: boolean;
  storageOk: boolean;
}

export function useMapPins(tripId: string | null): UseMapPins {
  const [all, setAll] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    let cancelled = false;
    kvGet<MapPin[]>(PINS_KEY)
      .then((rec) => {
        if (!cancelled) setAll(readPins(rec?.value));
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
  }, []);

  const add = useCallback(
    async (fix: PinFix, label: string): Promise<MapPin | null> => {
      if (!tripId) return null;
      const pin = pinFromFix(fix, tripId, label, Date.now());
      const next = addPin(all, pin);
      setAll(next);
      try {
        await kvSet(PINS_KEY, next);
        return pin;
      } catch {
        // It is on the screen for this session, and the screen says it was not kept.
        setStorageOk(false);
        return null;
      }
    },
    [all, tripId],
  );

  const remove = useCallback(
    async (id: string) => {
      const next = removePin(all, id);
      setAll(next);
      try {
        await kvSet(PINS_KEY, next);
      } catch {
        setStorageOk(false);
      }
    },
    [all],
  );

  return { pins: pinsForTrip(all, tripId), add, remove, loading, storageOk };
}
