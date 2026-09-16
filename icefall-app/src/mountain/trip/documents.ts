/**
 * TRIP > DOCUMENTS (brief M5, plan §3.5) — permits, hut bookings, insurance.
 *
 * The files live in the `documents` store of the on-device database as real
 * blobs. There is no bucket and no backup anywhere in ICEFALL, so every
 * sentence here says so rather than implying a copy exists somewhere.
 *
 * No network, no AI. Everything below works in airplane mode.
 */

import { useCallback, useEffect, useState } from "react";

import { DeviceStorageError, NO_DATABASE_SENTENCE, deviceStore } from "@/device/db";
import type { DocumentKind, StoredDocument } from "@/device/db";
import { formatBytes } from "@/device/storageStatus";

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

/** The line the brief asks for, word for word. */
export const KEPT_ON_THIS_PHONE_LINE = "Kept on this phone — not backed up.";

/** Plan §3.5. Said next to the files, not buried in a settings page. */
export const ONLY_COPY_NOTE =
  "This is the only copy. Keep a paper copy and a photo in your phone's own photo library.";

/** Backup is not built. Saying "not yet" would imply a date nobody has set. */
export const NO_BACKUP_NOTE =
  "ICEFALL has nowhere to back these up. There is no server copy, so nothing here can be restored if you lose the phone.";

/** Plan §3.5 CORRECTED, and plan §4 table: iPhones clear a site's files. */
export const IOS_CLEARING_NOTE =
  "An iPhone can clear a website's saved files after about a week of not opening it. Add ICEFALL to your Home Screen and open it before you travel.";

/** Plan §3.5: the camera leaves the app, which costs the recording and the alarm. */
export const CAMERA_LEAVES_APP =
  "Taking a photo leaves ICEFALL for a moment. Your recording and your turnaround alarm pause until you come back.";

export const NO_DOCUMENTS_LINE = "Nothing saved on this phone.";

export const DOCUMENT_KINDS: readonly DocumentKind[] = ["permit", "booking", "insurance", "other"];

export const KIND_LABEL: Record<DocumentKind, string> = {
  permit: "Permit",
  booking: "Hut booking",
  insurance: "Insurance",
  other: "Other",
};

/* -------------------------------------------------------------------------- */
/* Small pure helpers                                                          */
/* -------------------------------------------------------------------------- */

/** "1.4 MB". Never a blank: a file with no readable size says so. */
export function sizeLabel(bytes: number | null | undefined): string {
  return formatBytes(bytes) ?? "size unknown";
}

/** Plan §3.5 CORRECTED: checked on every launch, so the Trip row can say it. */
export function documentsRowLabel(count: number): string {
  if (count <= 0) return `Documents · ${NO_DOCUMENTS_LINE.toLowerCase()}`;
  return `Documents · ${count} saved`;
}

/** Newest first. Ties fall back to the id so the order never flickers. */
export function sortDocuments(docs: readonly StoredDocument[]): StoredDocument[] {
  return [...docs].sort((a, b) => b.addedAt - a.addedAt || (a.id < b.id ? 1 : -1));
}

/** What the athlete typed, else the file's own name, else a plain fallback. */
export function documentName(given: string | null | undefined, fileName: string | null | undefined): string {
  const typed = (given ?? "").trim();
  if (typed) return typed;
  const own = (fileName ?? "").trim();
  return own || "Untitled document";
}

export function newDocumentId(now: number, rand: () => number = Math.random): string {
  return `doc_${now.toString(36)}_${Math.floor(rand() * 0xffffff).toString(36)}`;
}

/** Big files fill the space the browser grants ICEFALL; the save then fails. */
export const LARGE_FILE_BYTES = 25 * 1024 * 1024;

export function largeFileWarning(bytes: number): string | null {
  if (bytes < LARGE_FILE_BYTES) return null;
  return `${sizeLabel(bytes)} is large. If ICEFALL runs out of the space your phone gives it, the save fails — you will see that here, not silently.`;
}

/** Only these can be drawn on the screen. Everything else opens elsewhere. */
export function canShowInline(mime: string): boolean {
  return mime.startsWith("image/");
}

/** Plain warning for a file the phone will hand to another app instead. */
export function openNote(mime: string): string | null {
  if (canShowInline(mime)) return null;
  if (mime === "application/pdf") return "Opens in a new tab. Some phones save the PDF instead of showing it.";
  return "ICEFALL cannot show this kind of file. Your phone will open it in another app, or save it.";
}

/** Copy for a failed read or write. Never "something went wrong". */
export function failureSentence(err: unknown): string {
  if (err instanceof DeviceStorageError) return NO_DATABASE_SENTENCE;
  const message = err instanceof Error ? err.message : String(err);
  return `This phone refused to save the file: ${message}`;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

const store = () => deviceStore("documents");

const listeners = new Set<() => void>();
function announce() {
  for (const fn of [...listeners]) fn();
}

/** Fires after a document is added or deleted, so the Trip row can re-count. */
export function onDocumentsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Newest first. With a trip id you also get the documents attached to no trip,
 * because an insurance policy belongs to the athlete, not to one week.
 */
export async function listDocuments(tripId: string | null = null): Promise<StoredDocument[]> {
  const all = await store().getAll();
  const kept = tripId === null ? all : all.filter((d) => d.tripId === tripId || d.tripId === null);
  return sortDocuments(kept);
}

export async function countDocuments(): Promise<number> {
  return store().count();
}

export interface AddDocumentInput {
  file: Blob & { name?: string };
  kind: DocumentKind;
  name?: string | null;
  note?: string | null;
  tripId?: string | null;
}

export type AddDocumentResult = { ok: true; doc: StoredDocument } | { ok: false; sentence: string };

export async function addDocument(input: AddDocumentInput, now: number = Date.now()): Promise<AddDocumentResult> {
  const doc: StoredDocument = {
    id: newDocumentId(now),
    tripId: input.tripId ?? null,
    kind: input.kind,
    name: documentName(input.name, input.file.name),
    addedAt: now,
    blob: input.file,
    mime: input.file.type || "application/octet-stream",
    sizeBytes: input.file.size,
    note: (input.note ?? "").trim() || null,
  };
  try {
    await store().put(doc);
  } catch (err) {
    return { ok: false, sentence: failureSentence(err) };
  }
  announce();
  return { ok: true, doc };
}

export async function deleteDocument(id: string): Promise<{ ok: true } | { ok: false; sentence: string }> {
  try {
    await store().delete(id);
  } catch (err) {
    return { ok: false, sentence: failureSentence(err) };
  }
  announce();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

export interface UseDocuments {
  docs: StoredDocument[];
  loading: boolean;
  /** Plain copy when the phone has no database, or null. */
  error: string | null;
  add(input: AddDocumentInput): Promise<AddDocumentResult>;
  remove(id: string): Promise<{ ok: true } | { ok: false; sentence: string }>;
  refresh(): void;
}

export function useDocuments(tripId: string | null = null): UseDocuments {
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    listDocuments(tripId)
      .then((rows) => {
        if (!live) return;
        setDocs(rows);
        setError(null);
      })
      .catch((err) => {
        if (!live) return;
        setDocs([]);
        setError(failureSentence(err));
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tripId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => onDocumentsChange(refresh), [refresh]);

  const add = useCallback(async (input: AddDocumentInput) => {
    const res = await addDocument(input);
    setError(res.ok ? null : res.sentence);
    return res;
  }, []);

  const remove = useCallback(async (id: string) => {
    const res = await deleteDocument(id);
    setError(res.ok ? null : res.sentence);
    return res;
  }, []);

  return { docs, loading, error, add, remove, refresh };
}
