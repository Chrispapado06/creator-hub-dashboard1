/**
 * TRIP CONTACTS (brief M5, plan §3.5) — the guide, the operator and the
 * numbers the athlete types in, kept in the on-device database.
 *
 * Two sources, never merged into one editable list:
 *   1. contacts typed here (the `contacts` store, editable, per trip);
 *   2. the athlete's own emergency info (`mountain/emergencyInfo.ts`), which
 *      the SOS screen already owns. It is shown read-only with a link to SOS,
 *      so the same number is never held in two places that can disagree.
 *
 * No network, no server copy, no sync: nothing here ever leaves the phone.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { NO_DATABASE_SENTENCE, deviceStore, type ContactRole, type StoredContact } from "@/device/db";

import { type EmergencyInfo } from "../emergencyInfo";
import { classifyNumber, telHref } from "../sos";

export const ROLE_ORDER: readonly ContactRole[] = ["guide", "operator", "emergency", "insurer", "other"] as const;

export const ROLE_LABEL: Record<ContactRole, string> = {
  guide: "Guide",
  operator: "Operator",
  emergency: "Emergency",
  insurer: "Insurer",
  other: "Other",
};

/** Plain copy, used on every row that is stored here. */
export const KEPT_ON_THIS_PHONE = "Kept on this phone.";

export const NO_SIGNAL_CALL_SENTENCE =
  "With no mobile signal the call will not connect. The number is written out so it can be dialled from another phone or a radio.";

export const EMERGENCY_INFO_SOURCE = "From your emergency info";

const MAX_NAME = 80;
const MAX_NUMBER = 40;
const MAX_NOTE = 300;
/** A phone's worth of numbers. Past this, the list is no longer readable in gloves. */
export const MAX_CONTACTS = 30;

export interface ContactDraft {
  /** Null for a contact being added. */
  id: string | null;
  role: ContactRole;
  name: string;
  number: string;
  note: string;
}

export function emptyContactDraft(role: ContactRole = "guide"): ContactDraft {
  return { id: null, role, name: "", number: "", note: "" };
}

export function draftFrom(c: StoredContact): ContactDraft {
  return { id: c.id, role: c.role, name: c.name, number: c.number, note: c.note ?? "" };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");

export function newContactId(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid;
  } catch {
    /* an old browser: fall through */
  }
  return `c${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Null when it can be saved; otherwise the sentence to show under the form. */
export function contactProblem(d: ContactDraft): string | null {
  const name = d.name.trim();
  const number = d.number.trim();
  if (!name && !number) return "Add a name or a number.";
  if (!number) return "Add a number. A name on its own cannot be called.";
  return null;
}

export function buildContact(d: ContactDraft, tripId: string | null, now: number = Date.now()): StoredContact {
  const note = str(d.note, MAX_NOTE);
  return {
    id: d.id ?? newContactId(),
    tripId,
    role: ROLE_ORDER.includes(d.role) ? d.role : "other",
    name: str(d.name, MAX_NAME),
    number: str(d.number, MAX_NUMBER),
    note: note || null,
    at: now,
  };
}

/** A row read back is re-shaped, so a hand-edited or older record cannot break the screen. */
export function normaliseContact(raw: unknown): StoredContact | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 120);
  if (!id) return null;
  const role = ROLE_ORDER.includes(r.role as ContactRole) ? (r.role as ContactRole) : "other";
  const name = str(r.name, MAX_NAME);
  const number = str(r.number, MAX_NUMBER);
  if (!name && !number) return null;
  const note = str(r.note, MAX_NOTE);
  return {
    id,
    tripId: typeof r.tripId === "string" && r.tripId ? r.tripId : null,
    role,
    name,
    number,
    note: note || null,
    at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0,
  };
}

/** Guides first, then operators, and inside a role the oldest saved first, so the list never reshuffles. */
export function sortContacts(rows: StoredContact[]): StoredContact[] {
  return [...rows].sort((a, b) => {
    const r = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
    if (r !== 0) return r;
    if (a.at !== b.at) return a.at - b.at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** This trip's contacts plus the ones saved for no trip in particular. */
export function visibleContacts(rows: StoredContact[], tripId: string | null): StoredContact[] {
  return sortContacts(rows.filter((c) => c.tripId === null || c.tripId === tripId));
}

export function isDialable(number: string): boolean {
  return telHref(number) !== null;
}

/** What to say beside a number that no phone can dial. Null when it can be dialled. */
export function undialableNote(number: string): string | null {
  const c = classifyNumber(number);
  if (c.kind === "dial") return null;
  if (c.kind === "radio") return "Radio, not a phone number.";
  return "This phone cannot dial it. Read it out or dial it by hand.";
}

/* -------------------------------------------------------------------------- */
/* The athlete's own emergency info, read-only (owned by the SOS screen)       */
/* -------------------------------------------------------------------------- */

export interface ReadOnlyContact {
  key: string;
  label: string;
  number: string;
  note: string | null;
}

export function emergencyInfoContacts(info: EmergencyInfo | null): ReadOnlyContact[] {
  if (!info) return [];
  const out: ReadOnlyContact[] = [];
  info.contacts.forEach((c, i) => {
    if (!c.name && !c.number) return;
    out.push({
      key: `own-${i}`,
      label: c.name || `Your contact ${i + 1}`,
      number: c.number,
      note: null,
    });
  });
  if (info.rescueHotline) {
    out.push({
      key: "rescue-line",
      label: info.insurer ? `${info.insurer} · rescue line` : "Insurer's rescue line",
      number: info.rescueHotline,
      note: info.policyRef ? `Policy ${info.policyRef}` : null,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

export async function readContacts(tripId: string | null): Promise<StoredContact[]> {
  const rows = await deviceStore("contacts").getAll();
  const clean: StoredContact[] = [];
  for (const row of rows) {
    const c = normaliseContact(row);
    if (c) clean.push(c);
  }
  return visibleContacts(clean, tripId);
}

export async function putContact(c: StoredContact): Promise<void> {
  await deviceStore("contacts").put(c);
}

export async function deleteContact(id: string): Promise<void> {
  await deviceStore("contacts").delete(id);
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

export interface UseTripContacts {
  contacts: StoredContact[];
  loading: boolean;
  /** The sentence to show when this phone will not store anything, else null. */
  storageProblem: string | null;
  full: boolean;
  /** False means the phone refused it; the screen says so rather than pretending. */
  save(draft: ContactDraft): Promise<boolean>;
  remove(id: string): Promise<boolean>;
}

export function useTripContacts(tripId: string | null): UseTripContacts {
  const [contacts, setContacts] = useState<StoredContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageProblem, setStorageProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await readContacts(tripId);
      setContacts(rows);
      setStorageProblem(null);
    } catch {
      setContacts([]);
      setStorageProblem(NO_DATABASE_SENTENCE);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void reload().then(() => {
      if (!live) return;
    });
    return () => {
      live = false;
    };
  }, [reload]);

  const save = useCallback(
    async (draft: ContactDraft) => {
      try {
        await putContact(buildContact(draft, draft.id ? (contacts.find((c) => c.id === draft.id)?.tripId ?? tripId) : tripId));
        await reload();
        return true;
      } catch {
        setStorageProblem(NO_DATABASE_SENTENCE);
        return false;
      }
    },
    [contacts, tripId, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteContact(id);
        await reload();
        return true;
      } catch {
        setStorageProblem(NO_DATABASE_SENTENCE);
        return false;
      }
    },
    [reload],
  );

  const full = useMemo(() => contacts.length >= MAX_CONTACTS, [contacts]);

  return { contacts, loading, storageProblem, full, save, remove };
}
