/**
 * WHAT THE ON-DEVICE DATABASE HOLDS — the record types, and nothing that runs.
 *
 * Types only, so a screen can say what it reads without importing the database
 * itself. `db.ts` owns the stores; this file owns their shapes.
 *
 * EVERY RECORD CARRIES THE MOMENT IT WAS WRITTEN. Rule 2 of the brief — never
 * show old data as current — is not something a screen can honour over a record
 * that does not know its own age, so `savedAt`/`at` is required on every one of
 * them rather than optional. A row with no time is a row no screen can label.
 *
 * NOTHING HERE IS UPLOADED. Trips, tracks, journals, photographs and documents
 * live on the phone that recorded them (plan §2.6, and the owner's decision of
 * 15 September 2026). The word for that in the app is "kept on this phone", and
 * the sync queue refuses to pretend otherwise.
 */

import type { RecordedActivity } from "@/tracking/types";

/* -------------------------------------------------------------------------- */
/* Downloaded trip data (M8)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One downloaded PART of a trip, not the whole trip.
 *
 * Each part carries its own `savedAt` because they age at wildly different
 * rates — a forecast is stale in hours, a hut's coordinates in years — and the
 * pre-trip check has to show a size and an age per row. A single "trip pack"
 * record would force one age onto all of them, which is the failure rule 2
 * exists to prevent.
 *
 * `data` is deliberately `unknown`: the shape belongs to whoever downloads that
 * part, and a type here would be a second definition of it, free to drift.
 */
export interface TripPackPart {
  /** `${tripId}:${kind}`. One row per part per trip. */
  id: string;
  tripId: string;
  /** "forecast" | "route" | "camps" | "mountain" | "plan" | "emergency" | "map" | … */
  kind: string;
  /** What the athlete is shown: "Forecast", "Route line", "Offline map". */
  label: string;
  /** When THIS part was downloaded, epoch ms. Never inherited from another part. */
  savedAt: number;
  /** Bytes as measured, never estimated. 0 is a real answer for "nothing to download". */
  sizeBytes: number;
  /** Where it came from, for the credit line the pack must carry. */
  sourceNote: string | null;
  data: unknown;
}

/* -------------------------------------------------------------------------- */
/* Breadcrumbs (M5 retrace)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One GPS fix on a track ICEFALL was watching.
 *
 * THE GAPS ARE THE POINT. GPS stops when the phone is locked or in a pocket, so
 * a breadcrumb line has holes exactly where the athlete was not looking at the
 * phone. Each crumb therefore stands alone with its own time: whoever draws the
 * line decides where the breaks go from the timestamps, and must not join two
 * crumbs that are far apart in time (plan §3.3 CORRECTED).
 */
export interface Breadcrumb {
  /** The track this belongs to: a trip id, or a recording's session id. */
  trackId: string;
  /** Epoch ms of the FIX, not of the write. Part of the key with `trackId`. */
  t: number;
  lat: number;
  lon: number;
  /** Metres, or null when the fix carried no altitude. */
  altitudeM: number | null;
  /** Horizontal accuracy in metres, as the phone reported it. Null when it did not. */
  accuracyM: number | null;
  altitudeAccuracyM: number | null;
}

/* -------------------------------------------------------------------------- */
/* Check-ins, drink and food (M5 Body)                                         */
/* -------------------------------------------------------------------------- */

export type CheckInKind = "check-in" | "drink" | "eat" | "symptom-check";

/**
 * A logged moment on the body tab. The history, not the "last one", which
 * `mountain/body.ts` keeps in the browser bucket so it draws with no wait.
 */
export interface CheckInRecord {
  id: string;
  kind: CheckInKind;
  /** Epoch ms. */
  at: number;
  /** Local calendar date at `at`, YYYY-MM-DD — so "today's check-in" needs no clock maths. */
  date: string;
  tripId: string | null;
  /** "good" | "symptoms" | "unwell" for a check-in; a score band for a symptom check. */
  choice: string | null;
  /** The Lake Louise score, when this row is a symptom check. Never computed here. */
  score: number | null;
  altitudeM: number | null;
  lat: number | null;
  lon: number | null;
  note: string | null;
}

/* -------------------------------------------------------------------------- */
/* Journal and its photographs (M5 Trip)                                       */
/* -------------------------------------------------------------------------- */

export interface JournalEntry {
  id: string;
  tripId: string | null;
  /** Epoch ms the entry was written. */
  at: number;
  text: string;
  /** Stamped from the fix at the time, with its error bar — never back-filled later. */
  altitudeM: number | null;
  altitudeAccuracyM: number | null;
  lat: number | null;
  lon: number | null;
  positionAt: number | null;
  /** Ids into the `journalPhotos` store. The blobs are NOT inlined — see `JournalPhoto`. */
  photoIds: string[];
}

/**
 * A photograph, as a real file.
 *
 * SEPARATE STORE, AND STORED AS A BLOB. Two reasons, both measured rather than
 * stylistic: text encoding a photograph costs a third more bytes than the file
 * (plan §2.4), and a journal list that had to load every blob to show a date
 * would read tens of megabytes to draw a screen of text.
 */
export interface JournalPhoto {
  id: string;
  entryId: string;
  at: number;
  blob: Blob;
  mime: string;
  sizeBytes: number;
}

/* -------------------------------------------------------------------------- */
/* Documents (M5 Trip)                                                         */
/* -------------------------------------------------------------------------- */

export type DocumentKind = "permit" | "booking" | "insurance" | "other";

/**
 * A permit, hut booking or insurance policy. THE ONLY COPY.
 *
 * There is no server bucket and no backup, and the copy beside it says so:
 * "This is the only copy. Keep a paper copy and a photo in your phone's own
 * photo library." iPhones can clear a website's data after about a week of not
 * opening it, which is why their presence is checked on every launch and not
 * only in the pre-trip check (plan §3.5 CORRECTED).
 */
export interface StoredDocument {
  id: string;
  tripId: string | null;
  kind: DocumentKind;
  /** What the athlete named it, or the file's own name. */
  name: string;
  addedAt: number;
  blob: Blob;
  mime: string;
  sizeBytes: number;
  note: string | null;
}

/* -------------------------------------------------------------------------- */
/* Gear ticks and contacts (M5 Trip)                                           */
/* -------------------------------------------------------------------------- */

export interface GearTick {
  /** `${scopeId}:${itemId}` — the objective or trip, and the kit row. */
  id: string;
  scopeId: string;
  itemId: string;
  /** The app's own `ItemStatus` words ("packed", "owned", …). Kept loose so the kit list owns them. */
  status: string;
  at: number;
}

export type ContactRole = "guide" | "operator" | "emergency" | "insurer" | "other";

export interface StoredContact {
  id: string;
  tripId: string | null;
  role: ContactRole;
  name: string;
  /** As typed. Whether it can be dialled is decided where it is shown, never here. */
  number: string;
  note: string | null;
  at: number;
}

/* -------------------------------------------------------------------------- */
/* Activities (the migration)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A recorded activity, with the moment it was saved.
 *
 * `savedAt` is not on `RecordedActivity` and is not a property of the activity:
 * it is this database's ordering key, and it exists because the list the app
 * has always shown is in SAVE order, not start order. Migrated records get
 * descending values in the order they sat in the old list, so the order the
 * athlete has always seen survives the move.
 */
export interface StoredActivity {
  id: string;
  savedAt: number;
  activity: RecordedActivity;
}

/* -------------------------------------------------------------------------- */
/* The sync queue                                                              */
/* -------------------------------------------------------------------------- */

export type SyncState = "waiting" | "sending" | "given-up" | "blocked";

/**
 * One thing waiting to reach a server.
 *
 * ONLY THINGS WITH A DESTINATION ARE IN HERE. A trip, a track, a check-in and a
 * journal entry have no server table, so queueing them would be a progress bar
 * in front of a move that never happens (plan §2.6). the queue code refuses them by
 * name and the screen says "kept on this phone" instead.
 */
export interface SyncItem<P = unknown> {
  id: string;
  /** The handler that knows how to send it, e.g. "coach.question". */
  kind: string;
  /** Two items with the same key are the same thing asked twice. Null: never merge. */
  dedupeKey: string | null;
  payload: P;
  createdAt: number;
  attempts: number;
  /** Epoch ms. Nothing is tried before this — the back-off, stored rather than timed. */
  nextAttemptAt: number;
  lastError: string | null;
  state: SyncState;
  /** Set when it stopped trying. The athlete is shown what was given up on, never quietly dropped. */
  finishedAt: number | null;
}

/* -------------------------------------------------------------------------- */
/* Small key/value                                                             */
/* -------------------------------------------------------------------------- */

/** Small settings and markers ("activities migrated", "pack checked at"). Not for anything that must draw on the first frame. */
export interface KvRecord<V = unknown> {
  key: string;
  value: V;
  /** Epoch ms of the write. */
  at: number;
}

/** The record type each store holds, by store name. */
export interface DeviceStoreTypes {
  tripPacks: TripPackPart;
  breadcrumbs: Breadcrumb;
  checkIns: CheckInRecord;
  journal: JournalEntry;
  journalPhotos: JournalPhoto;
  documents: StoredDocument;
  gearTicks: GearTick;
  contacts: StoredContact;
  activities: StoredActivity;
  syncQueue: SyncItem;
  kv: KvRecord;
}

export type DeviceStoreName = keyof DeviceStoreTypes;
