/**
 * THE TRIP PACK (M8) — everything this trip needs, saved on the phone, each
 * part carrying its own size and its own age.
 *
 * ============================================================================
 * WHY THIS IS A LIST OF PARTS AND NOT ONE "PACK" RECORD
 * ============================================================================
 *
 * The parts age at wildly different rates: a forecast is old in hours, a hut's
 * coordinates in years, a permit price in months. One record would force one
 * date onto all of them, and the first thing a screen would do with that date
 * is caption a nine-month-old price with today's. So one row per part, and the
 * row the athlete sees is built from that part's own dates (plan §3.0).
 *
 * TWO DATES, NOT ONE. `savedAt` is when this phone took the copy. `dataDate`
 * is when the DATA was read from its own source — the OSM harvest, the permit
 * page, the forecast run. Copying a nine-month-old permit price onto the phone
 * this morning does not make the price fresh, so anything whose staleness is a
 * property of the source is aged from `dataDate` and says "Read 9 months ago",
 * never "Saved just now".
 *
 * NOTHING HERE INVENTS A DOWNLOAD. Most of a trip pack is already inside the
 * app file — mountain facts, camps, hazards, costs, rescue numbers — so those
 * parts are copied, marked `in-app`, and the pre-trip screen can say there is
 * nothing to fetch rather than draw a progress bar over a copy (plan §7.2).
 * The only two parts that need a network are the forecast and the offline map,
 * and there is no offline map source yet (plan §4.6 — see `OFFLINE_MAP_LICENCE`).
 *
 * A FAILED DOWNLOAD NEVER REPLACES A GOOD PART. That is the one rule the merge
 * exists for: a refresh that fails, times out, or comes back empty leaves the
 * stored part exactly as it was, with its real age, and the failure is reported
 * separately. Silence beats an old number shown as fresh; an old number shown
 * WITH ITS AGE beats deleting the only copy the athlete has on a mountain.
 *
 * READING A PACK NEEDS NO NETWORK. `readTripPack` and everything that shapes it
 * are IndexedDB and arithmetic. Only `refreshTripPack` reaches out, and only for
 * the forecast, and only when the caller says the connection is confirmed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HARVEST_DATE, OSM_ATTRIBUTION, campsFor } from "@/data/mountainCamps";
import { NO_COSTS_RECORDED, costsFor } from "@/data/mountainCosts";
import { NO_FACTS_RECORDED, READ_DATE as FACTS_READ_DATE, factsFor } from "@/data/mountainFacts";
import { NO_RESCUE_RECORDED, rescueFor } from "@/data/mountainRescue";
import { NO_HAZARDS_RECORDED, NO_SEASON_RECORDED, seasonFor } from "@/data/mountainSeason";
import { mountainById } from "@/data/mock/mountains";
import { NO_DATABASE_SENTENCE, deviceStore } from "@/device/db";
import type { TripPackPart } from "@/device/types";
import { OFFLINE } from "@/offline/offline";
import { FORECAST_AGE_MS, getMountainConditions } from "@/services/conditions";
import type { TrainingDay, TrainingPlan } from "@/types";

import { ageLabel } from "./format";
import type { MountainItineraryDay, MountainTrip } from "./tripModel";

/* -------------------------------------------------------------------------- */
/* Kinds                                                                       */
/* -------------------------------------------------------------------------- */

export type PackKind =
  | "mountain"
  | "route"
  | "camps"
  | "hazards"
  | "itinerary"
  | "costs"
  | "plan"
  | "session"
  | "emergency"
  | "map"
  | "forecast";

export const PACK_KINDS: readonly PackKind[] = [
  "mountain",
  "route",
  "camps",
  "hazards",
  "itinerary",
  "costs",
  "plan",
  "session",
  "emergency",
  "map",
  "forecast",
];

/** What the athlete is shown. Short, no jargon. */
export const PACK_LABEL: Record<PackKind, string> = {
  mountain: "Mountain",
  route: "Route",
  camps: "Huts and camps",
  hazards: "Hazards and season",
  itinerary: "Itinerary",
  costs: "Costs and permits",
  plan: "This week's plan",
  session: "Today's session",
  emergency: "Emergency numbers",
  map: "Offline map",
  forecast: "Forecast",
};

/**
 * Where a part came from.
 *   in-app     it ships inside the app file; the copy costs a download of nothing
 *   on-phone   the athlete typed it; it was never anywhere else
 *   downloaded it crossed the network
 */
export type PackOrigin = "in-app" | "on-phone" | "downloaded";

/** The envelope every part's `data` holds, so a reader never guesses. */
export interface PackBody<T = unknown> {
  origin: PackOrigin;
  /** ISO date the DATA was read from its source, where it has one. Not the copy date. */
  dataDate: string | null;
  value: T;
}

/* -------------------------------------------------------------------------- */
/* Fixed copy                                                                  */
/* -------------------------------------------------------------------------- */

export const NO_ROUTE_LINE =
  "ICEFALL holds no route line for this mountain. There is no geometry to save, and a drawn line nobody surveyed would be worse than none.";

export const NO_ITINERARY =
  "ICEFALL holds no day-by-day itinerary for this trip. Your operator's itinerary is the one to carry.";

export const NO_OFFLINE_MAP_SAVED =
  "ICEFALL shows the part of the map you have already looked at. It has not saved this area.";

/** The licence position, stated rather than implied (plan §4.2 and §4.4). */
export const OFFLINE_MAP_LICENCE =
  "No map service ICEFALL uses lets an area be downloaded: OpenFreeMap needs written permission, OpenStreetMap's tile policy forbids offline use by name, and Mapbox allows its own 30-day cache but forbids the bulk download that would fill it. A saved map means map packs built from OpenStreetMap data and served from ICEFALL's own site, and that is not built yet.";

export const FORECAST_NEEDS_SIGNAL =
  "A forecast needs a signal. The last one saved is shown with its age until a new one arrives.";

const OFFLINE_BUILD_NO_FORECAST =
  "This review build has no forecast. Its weather figures are made up for review, so none of them is saved.";

/* -------------------------------------------------------------------------- */
/* Size                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Bytes, measured. `sizeBytes` is never an estimate and never a guess: it is the
 * UTF-8 length of the part as it is stored, so two parts can be compared and a
 * total can be added up.
 */
export function measureBytes(value: unknown): number {
  if (value === undefined) return 0;
  let text: string;
  try {
    text = JSON.stringify(value) ?? "";
  } catch {
    return 0;
  }
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
  // No TextEncoder (old runtimes): count UTF-8 bytes by hand rather than report characters.
  let bytes = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Empty is not a download. An empty answer must never replace a stored part. */
export function isEmptyData(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/* -------------------------------------------------------------------------- */
/* Age                                                                         */
/* -------------------------------------------------------------------------- */

export type PackAgeBand = "fresh" | "aged" | "stale" | "silent";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Months are counted as 30 days. Nothing here needs calendar months, and saying so beats implying precision. */
const MONTH = 30 * DAY;

export interface PackAgeRule {
  aged: number;
  stale: number;
  silent: number;
}

/**
 * The plan's table (§3.0), one row per kind.
 *
 * `Infinity` means "never": a hut's coordinates and a phone number do not stop
 * being true, so their age is information, not a defect. Only the forecast can
 * go silent, because it is the only part an athlete could act on as if it
 * described now.
 */
export const PACK_AGE_RULES: Record<PackKind, PackAgeRule> = {
  forecast: { aged: FORECAST_AGE_MS.aged, stale: FORECAST_AGE_MS.stale, silent: FORECAST_AGE_MS.silent },
  map: { aged: 7 * DAY, stale: 30 * DAY, silent: Infinity },
  camps: { aged: 12 * MONTH, stale: 12 * MONTH, silent: Infinity },
  costs: { aged: 6 * MONTH, stale: 12 * MONTH, silent: Infinity },
  hazards: { aged: 6 * MONTH, stale: 12 * MONTH, silent: Infinity },
  mountain: { aged: 12 * MONTH, stale: Infinity, silent: Infinity },
  route: { aged: 12 * MONTH, stale: Infinity, silent: Infinity },
  itinerary: { aged: Infinity, stale: Infinity, silent: Infinity },
  plan: { aged: 7 * DAY, stale: Infinity, silent: Infinity },
  session: { aged: DAY, stale: Infinity, silent: Infinity },
  // Emergency numbers carry their own wording from the rescue dataset (plan §5),
  // never a bare date, so no band here ever greys one out.
  emergency: { aged: Infinity, stale: Infinity, silent: Infinity },
};

/** Kinds that show a plain age line. Emergency numbers do not — see plan §5.4. */
export const SHOWS_AGE: Record<PackKind, boolean> = {
  mountain: true,
  route: true,
  camps: true,
  hazards: true,
  itinerary: true,
  costs: true,
  plan: true,
  session: true,
  emergency: false,
  map: true,
  forecast: true,
};

export function packBand(kind: PackKind, ageMs: number): PackAgeBand {
  const r = PACK_AGE_RULES[kind];
  if (ageMs < r.aged) return "fresh";
  if (ageMs < r.stale) return "aged";
  if (ageMs < r.silent) return "stale";
  return "silent";
}

/** The envelope, checked rather than trusted — a hand-edited row cannot break a screen. */
export function readBody(part: Pick<TripPackPart, "data">): PackBody | null {
  const d = part.data;
  if (typeof d !== "object" || d === null) return null;
  const b = d as Partial<PackBody>;
  if (b.origin !== "in-app" && b.origin !== "on-phone" && b.origin !== "downloaded") return null;
  return { origin: b.origin, dataDate: typeof b.dataDate === "string" ? b.dataDate : null, value: b.value };
}

function isoToMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Which date this part is aged from.
 *
 * "read" — the source's own date, for anything whose staleness belongs to the
 * source rather than to this phone. "saved" — when the bytes arrived, for a
 * forecast or a map pack, where the copy time IS the data time.
 */
export function ageAt(part: TripPackPart): { at: number; basis: "read" | "saved" } {
  const body = readBody(part);
  const read = body?.origin === "downloaded" ? null : isoToMs(body?.dataDate ?? null);
  return read === null ? { at: part.savedAt, basis: "saved" } : { at: read, basis: "read" };
}

export interface PackAge {
  ageMs: number;
  band: PackAgeBand;
  basis: "read" | "saved";
  /** "Saved 2 days ago" / "Read 9 months ago", or null where this kind carries no bare date. */
  text: string | null;
  greyed: boolean;
  silent: boolean;
}

export function packAge(part: TripPackPart, now: number = Date.now()): PackAge {
  const kind = part.kind as PackKind;
  const { at, basis } = ageAt(part);
  const ageMs = Math.max(0, now - at);
  const band = packBand(kind, ageMs);
  return {
    ageMs,
    band,
    basis,
    text: SHOWS_AGE[kind] === false ? null : `${basis === "read" ? "Read" : "Saved"} ${ageLabel(ageMs)}`,
    greyed: band === "stale",
    silent: band === "silent",
  };
}

/* -------------------------------------------------------------------------- */
/* What a collector returns                                                    */
/* -------------------------------------------------------------------------- */

export interface CollectedPart {
  kind: PackKind;
  origin: PackOrigin;
  /** ISO date the data was read from its source, where it has one. */
  dataDate: string | null;
  /** Who it came from, for the credit line the pack must carry. */
  sourceNote: string | null;
  value: unknown;
}

export type PartOutcome =
  | { status: "collected"; part: CollectedPart }
  /** There is genuinely nothing to fetch. Honest, and not a failure. */
  | { status: "nothing-to-download"; kind: PackKind; sentence: string }
  /** It was tried and it did not arrive. Whatever is stored stays exactly as it is. */
  | { status: "failed"; kind: PackKind; reason: string };

/* -------------------------------------------------------------------------- */
/* Rows — what a screen draws                                                  */
/* -------------------------------------------------------------------------- */

export interface PackRow {
  kind: PackKind;
  label: string;
  status: "saved" | "nothing-to-download" | "missing";
  origin: PackOrigin | null;
  /** Measured bytes, or null where nothing is saved. */
  sizeBytes: number | null;
  savedAt: number | null;
  age: PackAge | null;
  sourceNote: string | null;
  /** The sentence shown instead of a figure: why there is nothing, or why the last try failed. */
  sentence: string | null;
}

function rowFor(part: TripPackPart, now: number, sentence: string | null = null): PackRow {
  const body = readBody(part);
  return {
    kind: part.kind as PackKind,
    label: part.label,
    status: "saved",
    origin: body?.origin ?? null,
    sizeBytes: part.sizeBytes,
    savedAt: part.savedAt,
    age: packAge(part, now),
    sourceNote: part.sourceNote,
    sentence,
  };
}

/* -------------------------------------------------------------------------- */
/* The merge — the rule this module exists for                                 */
/* -------------------------------------------------------------------------- */

export interface MergedPart {
  /** The row to write, or null when nothing should be written. */
  write: TripPackPart | null;
  row: PackRow;
  /** True when a download failed and a good stored part was kept instead. */
  keptExisting: boolean;
}

export function partId(tripId: string, kind: PackKind): string {
  return `${tripId}:${kind}`;
}

/**
 * One part, merged against what is already stored.
 *
 *   collected           → written, UNLESS the bytes are identical to the stored
 *                         part, in which case the stored date stands: nothing
 *                         newer reached this phone, and re-stamping it would
 *                         make an unchanged forecast look fresh.
 *   collected but empty → treated as a failure. An empty answer is not data.
 *   failed              → the stored part is kept, with its real age.
 *   nothing-to-download → the stored part is kept (it may be a real older copy);
 *                         otherwise the honest sentence, with no figure.
 */
export function mergePackPart(
  existing: TripPackPart | undefined,
  outcome: PartOutcome,
  tripId: string,
  now: number = Date.now(),
): MergedPart {
  const kind = outcome.status === "collected" ? outcome.part.kind : outcome.kind;
  const label = PACK_LABEL[kind];

  if (outcome.status === "collected" && !isEmptyData(outcome.part.value)) {
    const body: PackBody = {
      origin: outcome.part.origin,
      dataDate: outcome.part.dataDate,
      value: outcome.part.value,
    };
    const sizeBytes = measureBytes(body);
    // The BYTES decide, not the size: two parts of the same length are not the
    // same part, and a stored row whose size was written wrong is not a reason
    // to restamp the date on data that has not changed.
    const unchanged = existing !== undefined && JSON.stringify(existing.data) === JSON.stringify(body);
    if (unchanged) return { write: null, row: rowFor(existing, now), keptExisting: false };

    const part: TripPackPart = {
      id: partId(tripId, kind),
      tripId,
      kind,
      label,
      savedAt: now,
      sizeBytes,
      sourceNote: outcome.part.sourceNote,
      data: body,
    };
    return { write: part, row: rowFor(part, now), keptExisting: false };
  }

  const failure =
    outcome.status === "failed"
      ? outcome.reason
      : outcome.status === "collected"
        ? "Nothing came back."
        : null;

  if (existing) {
    return { write: null, row: rowFor(existing, now, failure), keptExisting: failure !== null };
  }

  return {
    write: null,
    row: {
      kind,
      label,
      status: outcome.status === "nothing-to-download" ? "nothing-to-download" : "missing",
      origin: null,
      sizeBytes: null,
      savedAt: null,
      age: null,
      sourceNote: null,
      sentence: outcome.status === "nothing-to-download" ? outcome.sentence : failure,
    },
    keptExisting: false,
  };
}

export interface MergedPack {
  writes: TripPackPart[];
  rows: PackRow[];
  failed: { kind: PackKind; reason: string }[];
  keptExisting: PackKind[];
}

export function mergePack(
  existing: TripPackPart[],
  outcomes: PartOutcome[],
  tripId: string,
  now: number = Date.now(),
): MergedPack {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const seen = new Set<PackKind>();
  const out: MergedPack = { writes: [], rows: [], failed: [], keptExisting: [] };

  for (const outcome of outcomes) {
    const kind = outcome.status === "collected" ? outcome.part.kind : outcome.kind;
    seen.add(kind);
    const merged = mergePackPart(byId.get(partId(tripId, kind)), outcome, tripId, now);
    if (merged.write) out.writes.push(merged.write);
    out.rows.push(merged.row);
    if (merged.keptExisting) out.keptExisting.push(kind);
    if (outcome.status === "failed") out.failed.push({ kind, reason: outcome.reason });
  }

  // Stored parts nobody collected this time are still the athlete's data. They
  // are shown with their age and never dropped.
  for (const part of existing) {
    if (!seen.has(part.kind as PackKind)) out.rows.push(rowFor(part, now));
  }

  out.rows.sort((a, b) => PACK_KINDS.indexOf(a.kind) - PACK_KINDS.indexOf(b.kind));
  return out;
}

/**
 * The rows for a stored pack, with the last refresh's sentences laid over them.
 *
 * Ages are recomputed from the stored parts every time this is called, so a
 * screen that sits open for an hour does not keep showing an hour-old "Saved 2
 * min ago" from the report that wrote it.
 */
export function packRows(parts: TripPackPart[], now: number = Date.now(), report?: PackReport | null): PackRow[] {
  const tripId = parts[0]?.tripId ?? report?.tripId ?? "";
  const rows = mergePack(parts, [], tripId, now).rows;
  if (!report) return rows;

  const stored = new Set(rows.map((r) => r.kind));
  const bySentence = new Map(report.rows.map((r) => [r.kind, r]));
  const merged = rows.map((r) => {
    const reported = bySentence.get(r.kind);
    return reported && reported.sentence ? { ...r, sentence: reported.sentence } : r;
  });
  for (const r of report.rows) if (!stored.has(r.kind)) merged.push(r);
  merged.sort((a, b) => PACK_KINDS.indexOf(a.kind) - PACK_KINDS.indexOf(b.kind));
  return merged;
}

/* -------------------------------------------------------------------------- */
/* Totals                                                                      */
/* -------------------------------------------------------------------------- */

export interface PackTotals {
  saved: number;
  bytes: number;
  /** Kinds with nothing stored, in display order. */
  missing: PackKind[];
  /** The oldest saved part's age, so one line can summarise the pack. */
  oldestAgeMs: number | null;
  greyed: PackKind[];
  silent: PackKind[];
}

export function packTotals(rows: PackRow[]): PackTotals {
  const t: PackTotals = { saved: 0, bytes: 0, missing: [], oldestAgeMs: null, greyed: [], silent: [] };
  for (const r of rows) {
    if (r.status !== "saved") {
      t.missing.push(r.kind);
      continue;
    }
    t.saved += 1;
    t.bytes += r.sizeBytes ?? 0;
    if (r.age) {
      if (t.oldestAgeMs === null || r.age.ageMs > t.oldestAgeMs) t.oldestAgeMs = r.age.ageMs;
      if (r.age.greyed) t.greyed.push(r.kind);
      if (r.age.silent) t.silent.push(r.kind);
    }
  }
  return t;
}

/** "41 KB" / "3.7 MB" / "0 B". Bytes as measured, never rounded up to look bigger. */
export function packSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* -------------------------------------------------------------------------- */
/* The offline map hook — a seam, not a promise                                */
/* -------------------------------------------------------------------------- */

export interface OfflineMapRequest {
  tripId: string;
  mountainId: string | null;
  centre: { lat: number; lon: number } | null;
  name: string;
}

export interface OfflineMapPack {
  /** What was saved, in whatever shape the source uses. */
  value: unknown;
  /** Measured bytes of the pack as downloaded, where the source knows them. */
  sizeBytes?: number;
  /** ISO date the map data itself was built. */
  dataDate: string | null;
  /** Who made it and under what terms. Required — the pack shows the credit its own source declares. */
  sourceNote: string;
}

/**
 * Whoever ships offline maps registers one of these and nothing else changes.
 *
 * Nothing is registered today and nothing may be until the packs are built and
 * served from our own site: every tile service the app uses forbids downloading
 * an area (see `OFFLINE_MAP_LICENCE`). With no source registered the map part
 * says so, in words, and saves nothing.
 */
export interface OfflineMapSource {
  id: string;
  /** The licence position for THIS source, shown wherever its pack is. */
  licenceNote: string;
  download(request: OfflineMapRequest, signal?: AbortSignal): Promise<OfflineMapPack | null>;
}

let mapSource: OfflineMapSource | null = null;

export function registerOfflineMapSource(source: OfflineMapSource | null): void {
  mapSource = source;
}

export function offlineMapSource(): OfflineMapSource | null {
  return mapSource;
}

/* -------------------------------------------------------------------------- */
/* The subject — what a pack is for                                            */
/* -------------------------------------------------------------------------- */

export interface TripPackSubject {
  tripId: string;
  tripName: string;
  /** The curated mountain, which keys every in-app record. Null: most parts have nothing to copy. */
  mountainId: string | null;
  peakName: string | null;
  peakElevationM: number | null;
  summit: { lat: number; lon: number } | null;
  routeName: string | null;
  /** Local date, for picking this week and today's session. */
  today: string;
  itinerary: MountainItineraryDay[] | null;
  plan: TrainingPlan | null;
  /**
   * Whether the athlete's own emergency card is filled in, and when.
   *
   * The card ITSELF is not copied in here. It is already on this phone in
   * localStorage where the SOS screen draws it on the first frame, and a second
   * copy of somebody's insurance policy number and next of kin in a second store
   * is a second thing to leak and a second thing to erase.
   */
  ownEmergencyInfo: { filled: boolean; savedAt: number } | null;
}

export function subjectFromTrip(
  trip: MountainTrip | null,
  opts: {
    today: string;
    plan?: TrainingPlan | null;
    ownEmergencyInfo?: { filled: boolean; savedAt: number } | null;
  },
): TripPackSubject | null {
  if (!trip) return null;
  return {
    tripId: trip.id,
    tripName: trip.name,
    mountainId: trip.mountainId,
    peakName: trip.peakName,
    peakElevationM: trip.peakElevationM,
    summit: trip.summit,
    routeName: trip.routeName,
    today: opts.today,
    itinerary: trip.itinerary,
    plan: opts.plan ?? null,
    ownEmergencyInfo: opts.ownEmergencyInfo ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Collectors — everything that needs no network                               */
/* -------------------------------------------------------------------------- */

const NO_MOUNTAIN =
  "This trip is not tied to one of the mountains ICEFALL holds, so there is nothing recorded to save for it.";

function noMountainOr(kind: PackKind, sentence: string, mountainId: string | null): PartOutcome {
  return { status: "nothing-to-download", kind, sentence: mountainId ? sentence : NO_MOUNTAIN };
}

/**
 * Everything a pack can hold that is already on this phone. No network, no
 * promises, no throwing: every branch ends in an outcome a screen can draw.
 */
export function collectLocalParts(subject: TripPackSubject): PartOutcome[] {
  const id = subject.mountainId ?? undefined;
  const mountain = id ? mountainById(id) : undefined;
  const out: PartOutcome[] = [];

  /* ---- Mountain page ---------------------------------------------------- */
  const facts = factsFor(id);
  if (mountain || facts) {
    out.push({
      status: "collected",
      part: {
        kind: "mountain",
        origin: "in-app",
        dataDate: facts ? FACTS_READ_DATE : null,
        sourceNote: facts ? "Mountain facts, each figure with its own source, as shipped with the app." : null,
        value: {
          mountainId: subject.mountainId,
          name: mountain?.name ?? subject.peakName,
          country: mountain?.country ?? null,
          range: mountain?.range ?? null,
          elevationM: mountain?.elevationM ?? subject.peakElevationM,
          summit: subject.summit,
          difficultyLabel: mountain?.difficultyLabel ?? null,
          typicalDurationLabel: mountain?.typicalDurationLabel ?? null,
          facts: facts ?? null,
        },
      },
    });
  } else {
    out.push(noMountainOr("mountain", NO_FACTS_RECORDED, subject.mountainId));
  }

  /* ---- Route ------------------------------------------------------------ */
  const routes = mountain?.routes ?? [];
  const route = subject.routeName ? routes.find((r) => r.name === subject.routeName) : undefined;
  const routeValue = route ? [route] : routes;
  if (routeValue.length) {
    out.push({
      status: "collected",
      part: {
        kind: "route",
        origin: "in-app",
        dataDate: null,
        // Rule 3 of the brief lives with the geometry, and there is none to draw.
        sourceNote: NO_ROUTE_LINE,
        value: { chosen: subject.routeName, lineHeld: false, routes: routeValue },
      },
    });
  } else {
    out.push(noMountainOr("route", NO_ROUTE_LINE, subject.mountainId));
  }

  /* ---- Camps ------------------------------------------------------------ */
  const camps = campsFor(id);
  if (camps && camps.camps.length) {
    out.push({
      status: "collected",
      part: {
        kind: "camps",
        origin: "in-app",
        dataDate: HARVEST_DATE,
        sourceNote: OSM_ATTRIBUTION,
        value: { routeBasis: camps.routeBasis, camps: camps.camps },
      },
    });
  } else {
    out.push(
      noMountainOr(
        "camps",
        "ICEFALL has no huts or camps recorded on this route. That is what is missing from the data, not a statement that there are none.",
        subject.mountainId,
      ),
    );
  }

  /* ---- Hazards and season ---------------------------------------------- */
  const season = seasonFor(id);
  if (season && (season.hazards.length || season.windows.length)) {
    out.push({
      status: "collected",
      part: {
        kind: "hazards",
        origin: "in-app",
        // Every hazard and window carries its own source date; the record's
        // freshest one would flatter the oldest, so the app's own read date is used.
        dataDate: FACTS_READ_DATE,
        sourceNote: "Hazards and season windows, each with the page it came from.",
        value: {
          hazards: season.hazards,
          hazardsAbsentReason: season.hazardsAbsentReason ?? null,
          windows: season.windows,
        },
      },
    });
  } else {
    out.push(noMountainOr("hazards", season ? NO_HAZARDS_RECORDED : NO_SEASON_RECORDED, subject.mountainId));
  }

  /* ---- Itinerary -------------------------------------------------------- */
  if (subject.itinerary && subject.itinerary.length) {
    out.push({
      status: "collected",
      part: {
        kind: "itinerary",
        origin: "on-phone",
        dataDate: null,
        sourceNote: null,
        value: subject.itinerary,
      },
    });
  } else {
    out.push({ status: "nothing-to-download", kind: "itinerary", sentence: NO_ITINERARY });
  }

  /* ---- Costs and permits ------------------------------------------------ */
  const costs = costsFor(id);
  if (costs) {
    out.push({
      status: "collected",
      part: {
        kind: "costs",
        origin: "in-app",
        // The issuer's page date — a nine-month-old price copied today is still nine months old.
        dataDate: costs.checked,
        sourceNote: `${costs.source.label} — read ${costs.checked}.`,
        value: { permit: costs.permit, lines: costs.lines, caveats: costs.caveats ?? null, source: costs.source },
      },
    });
  } else {
    out.push(noMountainOr("costs", NO_COSTS_RECORDED, subject.mountainId));
  }

  /* ---- This week's plan and today's session ----------------------------- */
  const week = weekFor(subject.plan, subject.today);
  if (week) {
    out.push({
      status: "collected",
      part: {
        kind: "plan",
        origin: "on-phone",
        dataDate: null,
        sourceNote: null,
        value: { title: subject.plan?.title ?? null, week },
      },
    });
  } else {
    out.push({
      status: "nothing-to-download",
      kind: "plan",
      sentence: "There is no training week covering today, so there is nothing to save.",
    });
  }

  const session = sessionFor(subject.plan, subject.today);
  if (session) {
    out.push({
      status: "collected",
      part: { kind: "session", origin: "on-phone", dataDate: null, sourceNote: null, value: session },
    });
  } else {
    out.push({
      status: "nothing-to-download",
      kind: "session",
      sentence: "No session is planned for today.",
    });
  }

  /* ---- Emergency numbers ------------------------------------------------ */
  const rescue = rescueFor(id);
  if (rescue) {
    out.push({
      status: "collected",
      part: {
        kind: "emergency",
        origin: "in-app",
        dataDate: null,
        sourceNote: "Every number carries the page it was read from. See the SOS screen for its review state.",
        value: {
          summary: rescue.summary,
          numbers: rescue.numbers,
          responders: rescue.responders,
          helicopter: rescue.helicopter,
          charging: rescue.charging,
          insurance: rescue.insurance,
          caveats: rescue.caveats ?? null,
          // A flag, never the card itself — see `TripPackSubject.ownEmergencyInfo`.
          ownInfoOnThisPhone: subject.ownEmergencyInfo?.filled ?? false,
        },
      },
    });
  } else {
    out.push(noMountainOr("emergency", NO_RESCUE_RECORDED, subject.mountainId));
  }

  return out;
}

/** The training week containing `today`, or null. */
export function weekFor(plan: TrainingPlan | null | undefined, today: string) {
  if (!plan) return null;
  return plan.weeks.find((w) => w.days.some((d) => d.date === today)) ?? null;
}

/** Today's session, or null when the day is not in the plan. */
export function sessionFor(plan: TrainingPlan | null | undefined, today: string): TrainingDay | null {
  if (!plan) return null;
  for (const w of plan.weeks) {
    const d = w.days.find((day) => day.date === today);
    if (d) return d;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The two parts that need a connection                                        */
/* -------------------------------------------------------------------------- */

export type ForecastFetch = (req: {
  peakName: string;
  elevationM: number;
  lat: number;
  lon: number;
  signal?: AbortSignal;
}) => Promise<unknown>;

const defaultForecastFetch: ForecastFetch = async (req) => {
  // The offline review build answers with invented weather (see
  // services/conditions). Saving that into a trip pack would put a made-up
  // forecast on a mountain with a real date on it.
  if (OFFLINE) throw new Error(OFFLINE_BUILD_NO_FORECAST);
  return getMountainConditions({
    peakName: req.peakName,
    elevationM: req.elevationM,
    lat: req.lat,
    lon: req.lon,
    signal: req.signal,
  });
};

/** True when a forecast came back with no readings at all — an answer, but not data. */
export function forecastIsEmpty(value: unknown): boolean {
  if (isEmptyData(value)) return true;
  const c = (value as { current?: Record<string, { value?: unknown } | null> }).current;
  if (!c || typeof c !== "object") return true;
  return Object.values(c).every((r) => r === null || r === undefined || (typeof r === "object" && r.value === null));
}

export async function collectForecast(
  subject: TripPackSubject,
  fetchForecast: ForecastFetch = defaultForecastFetch,
  signal?: AbortSignal,
): Promise<PartOutcome> {
  const lat = subject.summit?.lat;
  const lon = subject.summit?.lon;
  const elevationM = subject.peakElevationM;
  if (lat === undefined || lon === undefined || elevationM === null) {
    return {
      status: "nothing-to-download",
      kind: "forecast",
      sentence: "ICEFALL has no coordinates for this trip, so it cannot ask for a forecast.",
    };
  }
  try {
    const value = await fetchForecast({
      peakName: subject.peakName ?? subject.tripName,
      elevationM,
      lat,
      lon,
      signal,
    });
    if (forecastIsEmpty(value)) return { status: "failed", kind: "forecast", reason: "The forecast came back empty." };
    return {
      status: "collected",
      part: {
        kind: "forecast",
        origin: "downloaded",
        dataDate: null,
        sourceNote: "Forecast data from Open-Meteo, derived from national weather services.",
        value,
      },
    };
  } catch (err) {
    return {
      status: "failed",
      kind: "forecast",
      reason: err instanceof Error && err.message ? err.message : FORECAST_NEEDS_SIGNAL,
    };
  }
}

export async function collectMap(subject: TripPackSubject, signal?: AbortSignal): Promise<PartOutcome> {
  const source = offlineMapSource();
  if (!source) {
    return {
      status: "nothing-to-download",
      kind: "map",
      sentence: `${NO_OFFLINE_MAP_SAVED} ${OFFLINE_MAP_LICENCE}`,
    };
  }
  try {
    const pack = await source.download(
      {
        tripId: subject.tripId,
        mountainId: subject.mountainId,
        centre: subject.summit,
        name: subject.tripName,
      },
      signal,
    );
    if (!pack) return { status: "failed", kind: "map", reason: "No map pack came back." };
    return {
      status: "collected",
      part: {
        kind: "map",
        origin: "downloaded",
        dataDate: pack.dataDate,
        sourceNote: `${pack.sourceNote} ${source.licenceNote}`.trim(),
        value: pack.value,
      },
    };
  } catch (err) {
    return {
      status: "failed",
      kind: "map",
      reason: err instanceof Error && err.message ? err.message : "The map pack did not download.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Reading and refreshing                                                      */
/* -------------------------------------------------------------------------- */

export async function readTripPack(tripId: string): Promise<TripPackPart[]> {
  return deviceStore("tripPacks").byIndex("tripId", tripId);
}

export interface PackReport {
  at: number;
  tripId: string;
  rows: PackRow[];
  totals: PackTotals;
  written: PackKind[];
  failed: { kind: PackKind; reason: string }[];
  /** False when this phone has no database: nothing was saved and the screen must say so. */
  storageOk: boolean;
  storageSentence: string | null;
}

export interface RefreshOptions {
  /** Confirmed by the reachability check, never `navigator.onLine`. Off: local parts only. */
  confirmedOnline?: boolean;
  now?: number;
  fetchForecast?: ForecastFetch;
  signal?: AbortSignal;
}

/**
 * Bring the pack up to date. Local parts always; the forecast and the map only
 * when the connection is confirmed. Nothing stored is deleted, and nothing good
 * is overwritten by a failure.
 */
export async function refreshTripPack(subject: TripPackSubject, opts: RefreshOptions = {}): Promise<PackReport> {
  const now = opts.now ?? Date.now();
  const outcomes: PartOutcome[] = collectLocalParts(subject);

  if (opts.confirmedOnline) {
    outcomes.push(await collectForecast(subject, opts.fetchForecast ?? defaultForecastFetch, opts.signal));
    outcomes.push(await collectMap(subject, opts.signal));
  } else {
    outcomes.push({ status: "failed", kind: "forecast", reason: FORECAST_NEEDS_SIGNAL });
    outcomes.push({
      status: "nothing-to-download",
      kind: "map",
      sentence: `${NO_OFFLINE_MAP_SAVED} ${OFFLINE_MAP_LICENCE}`,
    });
  }

  const store = deviceStore("tripPacks");
  let existing: TripPackPart[] = [];
  let storageOk = true;
  try {
    existing = await store.byIndex("tripId", subject.tripId);
  } catch {
    storageOk = false;
  }

  const merged = mergePack(existing, outcomes, subject.tripId, now);

  if (storageOk && merged.writes.length) {
    try {
      await store.putAll(merged.writes);
    } catch {
      storageOk = false;
    }
  }

  return {
    at: now,
    tripId: subject.tripId,
    rows: merged.rows,
    totals: packTotals(merged.rows),
    written: storageOk ? merged.writes.map((w) => w.kind as PackKind) : [],
    failed: merged.failed,
    storageOk,
    storageSentence: storageOk ? null : NO_DATABASE_SENTENCE,
  };
}

/** Never hammer a mountain hut's one bar of signal: no automatic retry inside this gap. */
export const REFRESH_MIN_GAP_MS = 10 * 60_000;

/**
 * Whether an automatic refresh is due. Deliberately conservative: with no
 * confirmed connection the answer is always no, because a refresh with no
 * signal is a failed download and a flat battery.
 */
export function shouldRefreshPack(input: {
  parts: TripPackPart[];
  now: number;
  confirmedOnline: boolean;
  lastAttemptAt?: number | null;
}): boolean {
  if (!input.confirmedOnline) return false;
  if (input.lastAttemptAt && input.now - input.lastAttemptAt < REFRESH_MIN_GAP_MS) return false;
  if (input.parts.length === 0) return true;
  const forecast = input.parts.find((p) => p.kind === "forecast");
  if (!forecast) return true;
  return packAge(forecast, input.now).band !== "fresh";
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

export interface UseTripPack {
  rows: PackRow[];
  parts: TripPackPart[];
  totals: PackTotals;
  loading: boolean;
  refreshing: boolean;
  lastReport: PackReport | null;
  storageOk: boolean;
  storageSentence: string | null;
  /** Download what can be downloaded now. Safe to call with no signal: local parts still refresh. */
  refresh: () => Promise<PackReport | null>;
}

/**
 * The trip pack for a subject, read from the phone and refreshed when the
 * connection is confirmed.
 *
 * Reading never needs a network. `confirmedOnline` must come from the
 * reachability check (M2), never from `navigator.onLine`.
 */
export function useTripPack(
  subject: TripPackSubject | null,
  opts: { confirmedOnline?: boolean; auto?: boolean; fetchForecast?: ForecastFetch } = {},
): UseTripPack {
  const { confirmedOnline = false, auto = true, fetchForecast } = opts;
  const [parts, setParts] = useState<TripPackPart[]>([]);
  const [loading, setLoading] = useState<boolean>(subject !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastReport, setLastReport] = useState<PackReport | null>(null);
  const [storage, setStorage] = useState<{ ok: boolean; sentence: string | null }>({ ok: true, sentence: null });
  const running = useRef(false);
  const lastAttempt = useRef<number | null>(null);
  const tripId = subject?.tripId ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!tripId) {
      setParts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    readTripPack(tripId)
      .then((rows) => {
        if (!cancelled) setParts(rows);
      })
      .catch(() => {
        if (!cancelled) setStorage({ ok: false, sentence: NO_DATABASE_SENTENCE });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const refresh = useCallback(async () => {
    if (!subject || running.current) return null;
    running.current = true;
    lastAttempt.current = Date.now();
    setRefreshing(true);
    try {
      const report = await refreshTripPack(subject, { confirmedOnline, fetchForecast });
      setLastReport(report);
      setStorage({ ok: report.storageOk, sentence: report.storageSentence });
      try {
        setParts(await readTripPack(subject.tripId));
      } catch {
        /* The report already carries what happened; a failed re-read changes nothing. */
      }
      return report;
    } finally {
      running.current = false;
      setRefreshing(false);
    }
    // `subject` is rebuilt by its owner each render; the trip id is what identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, confirmedOnline, fetchForecast]);

  useEffect(() => {
    if (!auto || loading || !subject) return;
    if (!shouldRefreshPack({ parts, now: Date.now(), confirmedOnline, lastAttemptAt: lastAttempt.current })) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, loading, tripId, confirmedOnline, parts, refresh]);

  // Ages shown in `rows` must never freeze at mount time — a trip pack that
  // was fresh when the screen opened must still turn stale/silent while the
  // screen just sits there. `now` ticks on its own (mirrors useTurnaround).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    const id = setInterval(update, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  const rows = useMemo(() => packRows(parts, now, lastReport), [parts, lastReport, now]);

  return {
    rows,
    parts,
    totals: useMemo(() => packTotals(rows), [rows]),
    loading,
    refreshing,
    lastReport,
    storageOk: storage.ok,
    storageSentence: storage.sentence,
    refresh,
  };
}
