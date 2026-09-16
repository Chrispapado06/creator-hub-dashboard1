/**
 * THE ATHLETE'S OWN EMERGENCY INFO (plan §5.7). On this phone only.
 *
 * localStorage, not a database, because the SOS screen draws it on the first
 * frame with no wait (plan §2.4). It never syncs and nothing imports it that
 * could send it anywhere — there is no server copy to back it up to, so there
 * is no "back up" control either.
 *
 * Deliberately absent: blood group, allergies, conditions, medication. Health
 * data needs consent wording served from the database, which cannot be fetched
 * with no signal.
 */

import { useEffect, useState } from "react";

export const MAX_CONTACTS = 3;

export interface EmergencyContact {
  name: string;
  number: string;
}

export interface EmergencyInfo {
  name: string;
  destinationCountry: string;
  contacts: EmergencyContact[];
  insurer: string;
  policyRef: string;
  rescueHotline: string;
  coverNote: string;
  savedAt: number;
}

export const EMERGENCY_INFO_KEY = "icefall.mountain.emergency-info.v1";

export const NO_HEALTH_DATA =
  "ICEFALL does not hold anything about your health. Allergies, medication and blood group belong on a card in your jacket, where somebody can read them without your phone.";

export function emptyEmergencyInfo(): EmergencyInfo {
  return {
    name: "",
    destinationCountry: "",
    contacts: [],
    insurer: "",
    policyRef: "",
    rescueHotline: "",
    coverNote: "",
    savedAt: 0,
  };
}

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");

/** Anything read back is re-shaped, so a hand-edited or old record cannot break the SOS screen. */
export function normaliseEmergencyInfo(raw: unknown): EmergencyInfo | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const contacts = Array.isArray(r.contacts)
    ? r.contacts
        .map((c) => {
          const o = (typeof c === "object" && c !== null ? c : {}) as Record<string, unknown>;
          return { name: str(o.name, 80).trim(), number: str(o.number, 40).trim() };
        })
        .filter((c) => c.name || c.number)
        .slice(0, MAX_CONTACTS)
    : [];
  const info: EmergencyInfo = {
    name: str(r.name, 120).trim(),
    destinationCountry: str(r.destinationCountry, 80).trim(),
    contacts,
    insurer: str(r.insurer, 120).trim(),
    policyRef: str(r.policyRef, 80).trim(),
    rescueHotline: str(r.rescueHotline, 40).trim(),
    coverNote: str(r.coverNote, 1000).trim(),
    savedAt: typeof r.savedAt === "number" && Number.isFinite(r.savedAt) ? r.savedAt : 0,
  };
  return isEmpty(info) ? null : info;
}

export function isEmpty(info: EmergencyInfo): boolean {
  return (
    !info.name &&
    !info.destinationCountry &&
    info.contacts.length === 0 &&
    !info.insurer &&
    !info.policyRef &&
    !info.rescueHotline &&
    !info.coverNote
  );
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function storage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const listeners = new Set<(i: EmergencyInfo | null) => void>();

export function readEmergencyInfo(store: StorageLike | null = storage()): EmergencyInfo | null {
  try {
    const raw = store?.getItem(EMERGENCY_INFO_KEY);
    return raw ? normaliseEmergencyInfo(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Saves, or deletes when everything is blank. Returns false when the phone would not store it. */
export function saveEmergencyInfo(
  info: EmergencyInfo,
  store: StorageLike | null = storage(),
  now: number = Date.now(),
): boolean {
  const clean = normaliseEmergencyInfo({ ...info, savedAt: now });
  if (!clean) return deleteEmergencyInfo(store);
  try {
    if (!store) return false;
    store.setItem(EMERGENCY_INFO_KEY, JSON.stringify(clean));
  } catch {
    return false;
  }
  listeners.forEach((l) => l(clean));
  return true;
}

export function deleteEmergencyInfo(store: StorageLike | null = storage()): boolean {
  try {
    store?.removeItem(EMERGENCY_INFO_KEY);
  } catch {
    return false;
  }
  listeners.forEach((l) => l(null));
  return true;
}

export function useEmergencyInfo(): EmergencyInfo | null {
  const [info, setInfo] = useState<EmergencyInfo | null>(() => readEmergencyInfo());
  useEffect(() => {
    const l = (i: EmergencyInfo | null) => setInfo(i);
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === EMERGENCY_INFO_KEY || e.key === null) setInfo(readEmergencyInfo());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return info;
}
