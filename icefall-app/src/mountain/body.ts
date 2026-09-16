/**
 * The Body tab's logic (brief M5, plan §3.4), kept apart from the screen so it
 * can be tested with no browser.
 *
 * Nothing here scores, advises or computes a ceiling of its own. The symptom
 * check is `trip/lakeLouise.ts`; the ceiling is `trip/schedule.ts`. This file
 * only walks the form one question at a time and keeps three timestamps on the
 * phone (today's check-in, last drink, last food).
 */

import { useEffect, useState } from "react";

import { deviceStore } from "@/device/db";
import { forgetOffline, saveOffline, savedSentenceFor, type SavedHere } from "@/device/savedHere";
import type { CheckInKind, CheckInRecord } from "@/device/types";
import {
  LAKE_LOUISE_ITEMS,
  RED_FLAG_ORDER,
  emptyAnswers,
  type LakeLouiseAnswers,
  type LakeLouiseItemId,
  type LikertScore,
  type RedFlagId,
} from "@/trip/lakeLouise";
import { buildSchedule, describeTonight, tonight } from "@/trip/schedule";
import { todayISO, type Trip, type TripNight } from "@/trip/trip";
import type { AltitudeIllnessHistory } from "@/services/acclimatisation";

import type { MountainTrip, TripDay } from "./tripModel";

/* -------------------------------------------------------------------------- */
/* The glove-sized check: one question per screen                              */
/* -------------------------------------------------------------------------- */

/**
 * "Not sure" is stored as NOT ANSWERED (null). The scorer already treats null
 * as a real state, never as "no", so a mis-tap in gloves can always be undone.
 */
export type FlagChoice = "yes" | "no" | "unsure";

export type CheckStep =
  | { kind: "flag"; id: RedFlagId }
  | { kind: "item"; id: LakeLouiseItemId }
  | { kind: "functional" };

/** Warning signs first, exactly as the existing screen asks them. Ten steps. */
export const CHECK_STEPS: readonly CheckStep[] = [
  ...RED_FLAG_ORDER.map((id) => ({ kind: "flag", id }) as const),
  ...LAKE_LOUISE_ITEMS.map((id) => ({ kind: "item", id }) as const),
  { kind: "functional" },
];

export interface CheckDraft {
  flags: Record<RedFlagId, FlagChoice | null>;
  items: Record<LakeLouiseItemId, LikertScore | null>;
  functional: LikertScore | null;
}

export function emptyDraft(): CheckDraft {
  const a = emptyAnswers();
  const flags = {} as Record<RedFlagId, FlagChoice | null>;
  for (const id of RED_FLAG_ORDER) flags[id] = null;
  return { flags, items: { ...a.items }, functional: null };
}

/** The draft as the scorer's answers. "Not sure" becomes null. */
export function toAnswers(draft: CheckDraft): LakeLouiseAnswers {
  const out = emptyAnswers();
  for (const id of RED_FLAG_ORDER) {
    const c = draft.flags[id];
    out.redFlags[id] = c === "yes" ? true : c === "no" ? false : null;
  }
  out.items = { ...draft.items };
  out.functional = draft.functional;
  return out;
}

export function unsureFlags(draft: CheckDraft): RedFlagId[] {
  return RED_FLAG_ORDER.filter((id) => draft.flags[id] === "unsure");
}

/* -------------------------------------------------------------------------- */
/* Tonight's ceiling                                                           */
/* -------------------------------------------------------------------------- */

export type TonightView =
  | { kind: "no-trip"; sentence: string }
  | {
      kind: "ceiling";
      ceilingM: number;
      sentence: string;
      caveat: string | null;
      medicalNote: string | null;
    }
  | { kind: "silent"; sentence: string; caveat: string | null; medicalNote: string | null };

export const NO_TRIP_OPEN = "No trip open.";

/**
 * The ceiling as the Body tab shows it. Every sentence is `describeTonight`'s,
 * word for word — the same function the Trip screen uses — except the three
 * lines for no trip and a trip outside its dates, which carry no number.
 */
export function tonightView(
  trip: MountainTrip | null,
  day: TripDay | null,
  nights: TripNight[],
  history: AltitudeIllnessHistory | null,
  today: string,
): TonightView {
  if (!trip || !day) return { kind: "no-trip", sentence: NO_TRIP_OPEN };

  const record: Trip =
    trip.record ?? {
      id: trip.id,
      name: trip.name,
      goalId: null,
      peakName: trip.peakName,
      peakElevationM: trip.peakElevationM,
      mountainId: trip.mountainId,
      startDate: trip.startDate,
      endDate: trip.endDate,
      createdAt: "",
      endedAt: null,
    };
  // The example trip has no recorded nights, and none are borrowed for it.
  const schedule = buildSchedule(record, trip.record ? nights : [], history, today);
  const notes = { caveat: schedule.caveat, medicalNote: schedule.medicalNote };

  if (day.kind === "before") {
    return {
      kind: "silent",
      sentence: `${trip.name} starts in ${day.daysToGo} day${day.daysToGo === 1 ? "" : "s"}. Tonight's ceiling appears once it starts.`,
      ...notes,
    };
  }
  if (day.kind === "after") {
    return { kind: "silent", sentence: "This trip's dates have ended.", ...notes };
  }

  const sentence = describeTonight(schedule, today);
  const row = schedule.state === "usable" ? tonight(schedule, today) : null;
  if (row && row.ceilingM !== null) {
    return { kind: "ceiling", ceilingM: row.ceilingM, sentence, ...notes };
  }
  return { kind: "silent", sentence, ...notes };
}

/* -------------------------------------------------------------------------- */
/* Check-in, drink, eat — three timestamps on this phone                       */
/* -------------------------------------------------------------------------- */

export type CheckInChoice = "good" | "symptoms" | "unwell";

export const CHECK_IN_LABEL: Record<CheckInChoice, string> = {
  good: "Feeling good",
  symptoms: "Some symptoms",
  unwell: "Unwell",
};

export interface BodyLog {
  checkIn: { choice: CheckInChoice; date: string; at: number } | null;
  drinkAt: number | null;
  eatAt: number | null;
}

export const BODY_LOG_KEY = "icefall.mountain.body.v1";

const EMPTY_LOG: BodyLog = { checkIn: null, drinkAt: null, eatAt: null };

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Anything unreadable becomes "nothing logged" — never a guessed time. */
export function parseBodyLog(raw: string | null): BodyLog {
  if (!raw) return { ...EMPTY_LOG };
  try {
    const r = JSON.parse(raw) as Record<string, unknown>;
    const c = r.checkIn as Record<string, unknown> | null | undefined;
    const checkIn =
      c &&
      (c.choice === "good" || c.choice === "symptoms" || c.choice === "unwell") &&
      typeof c.date === "string" &&
      isTime(c.at)
        ? { choice: c.choice as CheckInChoice, date: c.date, at: c.at }
        : null;
    return {
      checkIn,
      drinkAt: isTime(r.drinkAt) ? r.drinkAt : null,
      eatAt: isTime(r.eatAt) ? r.eatAt : null,
    };
  } catch {
    return { ...EMPTY_LOG };
  }
}

const listeners = new Set<(l: BodyLog) => void>();

export function readBodyLog(store: KeyValueStore | null = defaultStore()): BodyLog {
  try {
    return parseBodyLog(store?.getItem(BODY_LOG_KEY) ?? null);
  } catch {
    return { ...EMPTY_LOG };
  }
}

/** Returns false when the phone refused to keep it, so the screen can say so. */
export function writeBodyLog(next: BodyLog, store: KeyValueStore | null = defaultStore()): boolean {
  let kept = false;
  try {
    if (store) {
      store.setItem(BODY_LOG_KEY, JSON.stringify(next));
      kept = true;
    }
  } catch {
    kept = false;
  }
  listeners.forEach((l) => l(next));
  return kept;
}

export function withCheckIn(log: BodyLog, choice: CheckInChoice, now: number): BodyLog {
  return { ...log, checkIn: { choice, date: todayISO(new Date(now)), at: now } };
}

export function withIntake(log: BodyLog, kind: "drink" | "eat", at: number | null): BodyLog {
  return kind === "drink" ? { ...log, drinkAt: at } : { ...log, eatAt: at };
}

/** Today's check-in, or null — yesterday's is never shown as today's. */
export function checkInToday(log: BodyLog, today: string): BodyLog["checkIn"] {
  return log.checkIn && log.checkIn.date === today ? log.checkIn : null;
}

export function useBodyLog(): BodyLog {
  const [log, setLog] = useState<BodyLog>(readBodyLog);
  useEffect(() => {
    const l = (next: BodyLog) => setLog(next);
    listeners.add(l);
    setLog(readBodyLog());
    return () => {
      listeners.delete(l);
    };
  }, []);
  return log;
}

/* -------------------------------------------------------------------------- */
/* The history, and what the queue makes of it                                 */
/* -------------------------------------------------------------------------- */

/**
 * `BodyLog` above is the LAST one of each thing, in the browser bucket, so the
 * tab draws with no wait. This is the HISTORY: every check-in, drink, food and
 * symptom check as its own dated row in the on-device database.
 *
 * Each row is also offered to the sync queue under its kind. Today every one of
 * those kinds is refused as "kept on this phone" — there is no server table for
 * a check-in — and that refusal is what the screen shows. It is offered anyway
 * rather than skipped, so the day a table exists nothing here has to change.
 */
export const BODY_SYNC_KIND: Record<CheckInKind, string> = {
  "check-in": "checkIn",
  "symptom-check": "checkIn",
  drink: "drinkEat",
  eat: "drinkEat",
};

/**
 * WHY THE DAY IS NOT THE KEY. A second check-in in the afternoon is a new fact
 * about the athlete, not the morning's repeated, and merging the two would
 * throw away the one that says they got worse. Only the same event at the same
 * millisecond — a double tap in gloves — merges.
 */
export function bodyDedupeKey(kind: CheckInKind, at: number): string {
  return `${kind}:${at}`;
}

export interface BodyEvent {
  kind: CheckInKind;
  at: number;
  tripId: string | null;
  /** "good" | "symptoms" | "unwell", or the escalation band of a symptom check. */
  choice: string | null;
  /** The Lake Louise total, for a symptom check. Never computed here. */
  score?: number | null;
  altitudeM?: number | null;
}

let rowCount = 0;

export function bodyRecord(e: BodyEvent): CheckInRecord {
  const c = globalThis.crypto as Crypto | undefined;
  rowCount += 1;
  return {
    id: c?.randomUUID ? c.randomUUID() : `body-${e.at.toString(36)}-${rowCount}`,
    kind: e.kind,
    at: e.at,
    date: todayISO(new Date(e.at)),
    tripId: e.tripId,
    choice: e.choice,
    score: e.score ?? null,
    altitudeM: e.altitudeM ?? null,
    lat: null,
    lon: null,
    note: null,
  };
}

export interface BodyEventSaved {
  record: CheckInRecord;
  where: SavedHere;
}

/**
 * Writes one body event to the phone and offers it to the queue.
 *
 * Never throws and never blocks the screen: a phone with no database still has
 * the browser-bucket log the tab reads, so the athlete's tap is not lost and
 * nothing is shown as an error.
 */
export async function recordBodyEvent(e: BodyEvent): Promise<BodyEventSaved> {
  const record = bodyRecord(e);
  try {
    await deviceStore("checkIns").put(record);
  } catch {
    // The last-one log in the browser bucket is what the tab shows, and that
    // write already reported for itself. Only the history row is missing.
  }
  const where = await saveOffline({
    kind: BODY_SYNC_KIND[e.kind],
    payload: record,
    dedupeKey: bodyDedupeKey(e.kind, e.at),
  });
  return { record, where };
}

/** Undo of a mis-tap: the row goes, and so does anything queued for it. */
export async function forgetBodyEvent(saved: BodyEventSaved | null): Promise<void> {
  if (!saved) return;
  try {
    await deviceStore("checkIns").delete(saved.record.id);
  } catch {
    // Nothing to say: the screen has already put the earlier time back.
  }
  await forgetOffline(saved.where);
}

/**
 * The line the Body tab shows about where all this goes. It reads the queue's
 * own answer for these kinds rather than stating one, so it cannot drift from
 * what actually happens.
 */
export function bodyStorageSentence(): string {
  const kinds = [...new Set(Object.values(BODY_SYNC_KIND))];
  const sentences = new Set(kinds.map(savedSentenceFor));
  return sentences.size === 1 ? [...sentences][0] : "Some of this waits to send; the rest is kept on this phone.";
}

/** The wall clock, re-read every 30 s and whenever the screen comes back. */
export function useNowMs(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const t = setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);
  return now;
}
