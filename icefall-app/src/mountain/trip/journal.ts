/**
 * TRIP > JOURNAL (brief M5, plan §3.5) — notes and photos written on the hill.
 *
 * Every entry is stamped with the time, the height and the position AS THEY
 * WERE WHEN IT WAS WRITTEN. A stamp is never back-filled: if the last fix is
 * older than an hour, the entry carries no position at all and says so. An
 * entry that claimed a position it did not have would be worse than one with
 * none (brief rule 2).
 *
 * Photos are downscaled before they are saved, and kept as real files in their
 * own store, so the list can draw without reading a single photo.
 *
 * No network and no AI. Identical in airplane mode. The sync queue is still
 * asked, so that the day the journal gets a server the screen already shows
 * the waiting state; today it answers "kept on this phone".
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { DeviceStorageError, NO_DATABASE_SENTENCE, deviceStore } from "@/device/db";
import type { JournalEntry, JournalPhoto } from "@/device/db";
import { formatBytes } from "@/device/storageStatus";
import { KEPT_ON_THIS_PHONE, enqueueSync, isKeptOnPhoneKind } from "@/device/syncQueue";

import { accuracyLabel, formatSignedDecimal, metresLabel } from "../sos";
import { positionFreshness, type KnownPosition } from "../position";

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

export const NO_ENTRIES_LINE = "Nothing written yet.";

/** Plan §3.5: the journal has no server table, so this is the whole truth. */
export const KEPT_ON_THIS_PHONE_LINE = KEPT_ON_THIS_PHONE;

export const NO_POSITION_LINE = "No position — the last fix was too old to stamp.";

export const STAMP_EXPLAINER =
  "Each note is stamped with the time, the height and the position you were at when you wrote it. Nothing is filled in afterwards.";

/* -------------------------------------------------------------------------- */
/* Stamping                                                                    */
/* -------------------------------------------------------------------------- */

/** The position half of an entry. All five move together or none of them do. */
export interface PositionStamp {
  altitudeM: number | null;
  altitudeAccuracyM: number | null;
  lat: number | null;
  lon: number | null;
  positionAt: number | null;
}

export const NO_STAMP: PositionStamp = {
  altitudeM: null,
  altitudeAccuracyM: null,
  lat: null,
  lon: null,
  positionAt: null,
};

/**
 * Stamp from the last known fix, or stamp nothing.
 *
 * The cut-off is `positionFreshness`'s own "silent" step (an hour), so the
 * journal draws the same line as every other Mountain screen rather than
 * inventing a second rule.
 */
export function stampPosition(pos: KnownPosition | null, now: number = Date.now()): PositionStamp {
  if (!pos) return NO_STAMP;
  if (positionFreshness(pos, now) === "silent") return NO_STAMP;
  return {
    altitudeM: pos.altitudeM,
    altitudeAccuracyM: pos.altitudeAccuracyM,
    lat: pos.lat,
    lon: pos.lon,
    positionAt: pos.at,
  };
}

/** "3,812 m ± 12 m", or "3,812 m" when the phone gave no error bar. Null: no height in the fix. */
export function altitudeLine(stamp: Pick<PositionStamp, "altitudeM" | "altitudeAccuracyM">): string | null {
  if (stamp.altitudeM === null || !Number.isFinite(stamp.altitudeM)) return null;
  const acc = accuracyLabel(stamp.altitudeAccuracyM);
  return acc ? `${metresLabel(stamp.altitudeM)} ${acc}` : metresLabel(stamp.altitudeM);
}

/** "45.83262, 6.86517". Null when the entry carries no position. */
export function positionLine(stamp: Pick<PositionStamp, "lat" | "lon">): string | null {
  if (stamp.lat === null || stamp.lon === null) return null;
  return formatSignedDecimal(stamp.lat, stamp.lon);
}

/** "14:32". The phone's own clock and locale — the same one the athlete reads on the summit. */
export function timeLabel(at: number, locale = "en-GB"): string {
  return new Date(at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/**
 * How far the stamped fix was from the moment of writing.
 *
 * A fix 40 minutes old attached to a note written now is honest only if the
 * gap is shown, so anything past two minutes says so.
 */
export const STAMP_GAP_SHOWN_MS = 2 * 60_000;

export function stampGapNote(stamp: Pick<PositionStamp, "positionAt">, writtenAt: number): string | null {
  if (stamp.positionAt === null) return null;
  const gap = writtenAt - stamp.positionAt;
  if (gap < STAMP_GAP_SHOWN_MS) return null;
  const minutes = Math.round(gap / 60_000);
  return `Position was ${minutes} min old when this was written.`;
}

/* -------------------------------------------------------------------------- */
/* Photos: size before saving                                                  */
/* -------------------------------------------------------------------------- */

/** A phone camera gives 12 MP; 1,600 px on the long edge is plenty for a note. */
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_QUALITY = 0.72;

export interface ScaledSize {
  width: number;
  height: number;
  scaled: boolean;
}

/** Keeps the shape, never enlarges, and never rounds an edge down to zero. */
export function scaledSize(width: number, height: number, maxEdge: number = PHOTO_MAX_EDGE): ScaledSize {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (!Number.isFinite(longest) || longest <= maxEdge) return { width: w, height: h, scaled: false };
  const factor = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(w * factor)),
    height: Math.max(1, Math.round(h * factor)),
    scaled: true,
  };
}

export interface DownscaledPhoto {
  blob: Blob;
  mime: string;
  sizeBytes: number;
  /** False when the original was kept — `reason` then says why. */
  scaled: boolean;
  reason: string | null;
}

/**
 * Shrink a photo before it is saved.
 *
 * Three ways this ends with the ORIGINAL file kept, each of them stated rather
 * than hidden: the browser has no canvas or `createImageBitmap`, the decode
 * fails, or the re-encoded file came out no smaller than what came in.
 */
export async function downscalePhoto(
  file: Blob,
  maxEdge: number = PHOTO_MAX_EDGE,
  quality: number = PHOTO_QUALITY,
): Promise<DownscaledPhoto> {
  const keep = (reason: string | null): DownscaledPhoto => ({
    blob: file,
    mime: file.type || "image/jpeg",
    sizeBytes: file.size,
    scaled: false,
    reason,
  });

  const g = globalThis as {
    createImageBitmap?: (b: Blob) => Promise<{ width: number; height: number; close?: () => void }>;
    document?: { createElement(tag: string): unknown };
  };
  if (typeof g.createImageBitmap !== "function" || !g.document) {
    return keep("This browser cannot resize photos, so the full-size file was saved.");
  }

  try {
    const bitmap = await g.createImageBitmap(file);
    const size = scaledSize(bitmap.width, bitmap.height, maxEdge);
    const canvas = g.document.createElement("canvas") as HTMLCanvasElement;
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return keep("This browser cannot resize photos, so the full-size file was saved.");
    }
    ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, size.width, size.height);
    bitmap.close?.();
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!out || out.size >= file.size) return keep(null);
    return { blob: out, mime: "image/jpeg", sizeBytes: out.size, scaled: true, reason: null };
  } catch {
    return keep("This photo could not be resized, so the full-size file was saved.");
  }
}

/* -------------------------------------------------------------------------- */
/* Photos: the storage warning                                                 */
/* -------------------------------------------------------------------------- */

/** About 100 photos at this app's quality (plan §4.7 measured 20 photos ≈ 8 MB). */
export const PHOTO_WARN_BYTES = 40 * 1024 * 1024;

/** Below this the next photo is the one that fails, so the warning comes first. */
export const LOW_SPACE_BYTES = 100 * 1024 * 1024;

/** "Photos use 12 MB of this phone." Null when there are none. */
export function photoUseLine(photoBytes: number): string | null {
  if (!Number.isFinite(photoBytes) || photoBytes <= 0) return null;
  return `Photos use ${formatBytes(photoBytes) ?? "an unknown amount"} of this phone.`;
}

/**
 * The space warning. `available` is the browser's own estimate, or null when
 * it will not say — in which case only the size of the photos can be judged.
 */
export function photoStorageWarning(photoBytes: number, available: number | null): string | null {
  const used = formatBytes(photoBytes) ?? "an unknown amount";
  if (available !== null && Number.isFinite(available) && available < LOW_SPACE_BYTES) {
    return `Photos use ${used}. This phone has about ${formatBytes(available) ?? "very little"} left for ICEFALL — an estimate. Delete a few, or the next save will fail, and you will see it fail here.`;
  }
  if (photoBytes >= PHOTO_WARN_BYTES) {
    return `Photos use ${used} on this phone. They are the only copy — nothing backs them up.`;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The sync state of one entry                                                 */
/* -------------------------------------------------------------------------- */

export const JOURNAL_KIND = "journal";
export const JOURNAL_PHOTO_KIND = "journalPhoto";

/** `kept` = there is no server for this, so nothing is waiting. */
export type JournalSyncState = "kept" | "waiting" | "stopped";

export function syncStateLabel(state: JournalSyncState): string {
  if (state === "waiting") return "Waiting to sync";
  if (state === "stopped") return "Not sent — stopped trying";
  return "Kept on this phone";
}

/**
 * Ask the queue what it made of an entry. Today `journal` is a kept-on-phone
 * kind, so nothing is stored and the answer is always "kept"; the call stays
 * because the day a server exists this screen already shows "waiting".
 */
export async function queueJournalEntry(entry: JournalEntry): Promise<JournalSyncState> {
  const res = await enqueueSync(
    { kind: JOURNAL_KIND, payload: { id: entry.id, at: entry.at, tripId: entry.tripId }, dedupeKey: entry.id },
    entry.at,
  );
  return res.status === "kept-on-phone" ? "kept" : "waiting";
}

/**
 * One state per entry id. Entries the queue has never heard of are "kept".
 *
 * It reads the queue's own store rather than `readSyncQueue`, which counts the
 * waiting items instead of naming them — this screen needs to know WHICH entry.
 */
export async function readJournalSyncStates(): Promise<Record<string, JournalSyncState>> {
  if (isKeptOnPhoneKind(JOURNAL_KIND)) return {};
  const rows = await deviceStore("syncQueue").getAll();
  const out: Record<string, JournalSyncState> = {};
  for (const item of rows) {
    if (item.kind !== JOURNAL_KIND || !item.dedupeKey) continue;
    out[item.dedupeKey] = item.state === "given-up" || item.state === "blocked" ? "stopped" : "waiting";
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

const entries = () => deviceStore("journal");
const photos = () => deviceStore("journalPhotos");

const listeners = new Set<() => void>();
function announce() {
  for (const fn of [...listeners]) fn();
}

export function onJournalChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function failureSentence(err: unknown): string {
  if (err instanceof DeviceStorageError) return NO_DATABASE_SENTENCE;
  const message = err instanceof Error ? err.message : String(err);
  return `This phone refused to save the note: ${message}`;
}

export function newEntryId(now: number, rand: () => number = Math.random): string {
  return `jrn_${now.toString(36)}_${Math.floor(rand() * 0xffffff).toString(36)}`;
}

export function newPhotoId(now: number, rand: () => number = Math.random): string {
  return `jph_${now.toString(36)}_${Math.floor(rand() * 0xffffff).toString(36)}`;
}

/** Newest first, with the id breaking ties so the order never flickers. */
export function sortEntries(rows: readonly JournalEntry[]): JournalEntry[] {
  return [...rows].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
}

/** With a trip id you also get the notes that belong to no trip. */
export async function listJournal(tripId: string | null = null): Promise<JournalEntry[]> {
  const all = await entries().getAll();
  const kept = tripId === null ? all : all.filter((e) => e.tripId === tripId || e.tripId === null);
  return sortEntries(kept);
}

export async function countJournal(): Promise<number> {
  return entries().count();
}

export async function listEntryPhotos(entryId: string): Promise<JournalPhoto[]> {
  const rows = await photos().byIndex("entryId", entryId);
  return [...rows].sort((a, b) => a.at - b.at);
}

/** What every photo in the journal adds up to, for the storage warning. */
export async function journalPhotoBytes(): Promise<number> {
  const all = await photos().getAll();
  return all.reduce((n, p) => n + (Number.isFinite(p.sizeBytes) ? p.sizeBytes : 0), 0);
}

export interface AddEntryInput {
  text: string;
  /** Already-downscaled photos. The screen shrinks them before it gets here. */
  photos?: readonly DownscaledPhoto[];
  tripId?: string | null;
  position?: KnownPosition | null;
}

export type AddEntryResult =
  | { ok: true; entry: JournalEntry; sync: JournalSyncState }
  | { ok: false; sentence: string };

/**
 * Write one entry. The photos are saved first: an entry that listed a photo
 * the database never took would show a gap the athlete cannot explain.
 */
export async function addJournalEntry(input: AddEntryInput, now: number = Date.now()): Promise<AddEntryResult> {
  const text = input.text.trim();
  const pics = input.photos ?? [];
  if (!text && pics.length === 0) return { ok: false, sentence: "Write something, or add a photo." };

  const id = newEntryId(now);
  const stamp = stampPosition(input.position ?? null, now);
  const rows: JournalPhoto[] = pics.map((p, i) => ({
    id: newPhotoId(now + i),
    entryId: id,
    at: now,
    blob: p.blob,
    mime: p.mime,
    sizeBytes: p.sizeBytes,
  }));

  const entry: JournalEntry = {
    id,
    tripId: input.tripId ?? null,
    at: now,
    text,
    ...stamp,
    photoIds: rows.map((r) => r.id),
  };

  try {
    if (rows.length) await photos().putAll(rows);
    await entries().put(entry);
  } catch (err) {
    // A photo that got in without its entry would be an orphan blob; drop it.
    await photos()
      .deleteAll(rows.map((r) => r.id))
      .catch(() => undefined);
    return { ok: false, sentence: failureSentence(err) };
  }

  const sync = await queueJournalEntry(entry).catch((): JournalSyncState => "kept");
  announce();
  return { ok: true, entry, sync };
}

export async function deleteJournalEntry(id: string): Promise<{ ok: true } | { ok: false; sentence: string }> {
  try {
    const entry = await entries().get(id);
    if (entry?.photoIds.length) await photos().deleteAll(entry.photoIds);
    await entries().delete(id);
  } catch (err) {
    return { ok: false, sentence: failureSentence(err) };
  }
  announce();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

export interface UseJournal {
  entries: JournalEntry[];
  loading: boolean;
  error: string | null;
  /** Bytes every journal photo takes on this phone. */
  photoBytes: number;
  syncStates: Record<string, JournalSyncState>;
  add(input: AddEntryInput): Promise<AddEntryResult>;
  remove(id: string): Promise<{ ok: true } | { ok: false; sentence: string }>;
  refresh(): void;
}

export function useJournal(tripId: string | null = null): UseJournal {
  const [rows, setRows] = useState<JournalEntry[]>([]);
  const [photoBytes, setPhotoBytes] = useState(0);
  const [syncStates, setSyncStates] = useState<Record<string, JournalSyncState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([listJournal(tripId), journalPhotoBytes(), readJournalSyncStates()])
      .then(([list, bytes, states]) => {
        if (!live) return;
        setRows(list);
        setPhotoBytes(bytes);
        setSyncStates(states);
        setError(null);
      })
      .catch((err) => {
        if (!live) return;
        setRows([]);
        setError(failureSentence(err));
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tripId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => onJournalChange(refresh), [refresh]);

  const add = useCallback(async (input: AddEntryInput) => {
    const res = await addJournalEntry(input);
    setError(res.ok ? null : res.sentence);
    return res;
  }, []);

  const remove = useCallback(async (id: string) => {
    const res = await deleteJournalEntry(id);
    setError(res.ok ? null : res.sentence);
    return res;
  }, []);

  return useMemo(
    () => ({ entries: rows, loading, error, photoBytes, syncStates, add, remove, refresh }),
    [rows, loading, error, photoBytes, syncStates, add, remove, refresh],
  );
}
