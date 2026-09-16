import { useEffect, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { MOUNTAINS } from "@/data/mock/mountains";
import type { Mountain } from "@/types";

/**
 * WHICH PLACES A GROUP CAN BE FILED AGAINST, read from the server.
 *
 * ── WHY THIS FILE EXISTS (structure plan D6, R14) ────────────────────────────
 *
 * A group's `destination_id` is a foreign key into `public.destinations`, and
 * the app's own catalogue is NOT that list. Measured 16 Sep 2026:
 *
 *   - `@/data/mock/mountains` holds 14 peaks. THREE of them — `gran-paradiso`,
 *     `mount-olympus` and `triglav` — have no row on the server, so a group
 *     filed against one is refused by the foreign key.
 *   - The server holds 52 mountains and 252 treks. FORTY-ONE of the mountains,
 *     Ama Dablam among them, are absent from the app. (The plan's D6 says 38,
 *     written before anybody counted; `npm run test:groups-mountain-lists`
 *     counts both lists from the seed file and is what keeps this honest.)
 *
 * So a picker built from `MOUNTAINS` offers three peaks that cannot be saved
 * and hides forty-one that can. Group code reads the server list; the app's
 * catalogue is used for two things only, and both are cosmetic: the link to a
 * mountain page ICEFALL actually has, and the photograph on a cover.
 *
 * ── THE NAME OF THIS FILE ────────────────────────────────────────────────────
 *
 * It is `mountains.ts` because the question it mostly answers is "which
 * mountain", and because `test:groups-mountain-lists` guards exactly that. It
 * reads EVERY destination kind, though: the owner's ruling of 16 Sep 2026 is
 * that a group "doesn't have to be mountain related", so a trek is a subject a
 * group may be filed against too, and a region or an identity is a subject with
 * no catalogue row at all (those are a `topic`, which is not a place — see
 * `groups.topic` in the migration).
 *
 * ── WHAT IS NEVER DONE HERE ──────────────────────────────────────────────────
 *
 * Nothing falls back to `MOUNTAINS` when the server list cannot be read. A list
 * of peaks a group cannot be filed against is worse than no list: it fails at
 * the last tap, after somebody has filled in a form. An unreadable catalogue is
 * said out loud, and the group can still be made with its own topic instead.
 */

/** `destinations.kind`, which has exactly these two values. */
export type DestinationKind = "mountain" | "trek";

/** What `groups.about` may say (the migration's check constraint). */
export type GroupAbout = "mountain" | "region" | "trek" | "identity" | "other";

/** One row of `public.destinations`, as the groups feature needs it. */
export interface GroupDestination {
  id: string;
  name: string;
  kind: DestinationKind;
  /** `destinations.range` — a mountain's range. Null on a trek, and on a peak nobody recorded one for. */
  range: string | null;
  region: string | null;
  country: string | null;
  /** `destinations.elevation_m`. ALWAYS null on a trek: a trek has no summit. */
  elevationM: number | null;
}

/**
 * Where the catalogue read stands. The same five absences the rest of the
 * groups code uses, so a screen has one vocabulary rather than two.
 */
export type DestinationsState =
  | { status: "loading" }
  | { status: "ready"; destinations: GroupDestination[] }
  | {
      status: "no-backend" | "signed-out" | "not-provisioned" | "unreachable" | "refused";
      message: string;
    };

export type DestinationsRead = Exclude<DestinationsState, { status: "loading" }>;

/** Every way the catalogue can be absent, and never "ready". */
export type DestinationsAbsence = Exclude<DestinationsRead, { status: "ready" }>;

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

export const DESTINATIONS_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so it cannot read the catalogue of places.";

export const DESTINATIONS_SIGNED_OUT =
  "Your ICEFALL session ended, so the catalogue could not be read. Sign in again and it comes back.";

export const DESTINATIONS_NOT_LIVE =
  "ICEFALL's catalogue of places is not live on its server yet, so there is nothing to choose from.";

export const DESTINATIONS_UNREACHABLE =
  "ICEFALL could not reach the server, so it cannot list the places a group can be filed against.";

export const DESTINATIONS_REFUSED =
  "ICEFALL's server refused the catalogue, so it cannot list the places a group can be filed against.";

/* -------------------------------------------------------------------------- */
/* Pure parts                                                                  */
/* -------------------------------------------------------------------------- */

const untyped = supabase as unknown as SupabaseClient | null;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * One row, or null.
 *
 * A row with no id, no name or a kind this app does not know is DROPPED rather
 * than drawn: an unknown kind is a catalogue this build is older than, and
 * guessing at it would file a group against something it cannot describe.
 */
export function toGroupDestination(raw: unknown): GroupDestination | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = text(row.id);
  const name = text(row.name);
  const kind = row.kind === "mountain" || row.kind === "trek" ? row.kind : null;
  if (!id || !name || !kind) return null;
  return {
    id,
    name,
    kind,
    range: text(row.range),
    region: text(row.region),
    country: text(row.country),
    elevationM:
      typeof row.elevation_m === "number" && Number.isFinite(row.elevation_m)
        ? row.elevation_m
        : null,
  };
}

/** Does this place answer what somebody typed? Name, range, region or country. */
export function destinationMatches(destination: GroupDestination, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return [destination.name, destination.range, destination.region, destination.country].some(
    (field) => field !== null && field.toLowerCase().includes(q),
  );
}

/**
 * The app's own record of a peak, for the mountain page link and the catalogue
 * photograph — and for nothing else.
 *
 * NULL FOR MOST SERVER MOUNTAINS, which is the ordinary case rather than a
 * fault: ICEFALL's server holds 52 and this app draws 14. A group on Ama Dablam
 * is a real group; it simply has no mountain page here to link to yet.
 */
export function appPeakFor(destinationId: string | null): Mountain | null {
  if (!destinationId) return null;
  return MOUNTAINS.find((m) => m.id === destinationId) ?? null;
}

/**
 * What a group filed against this place is ABOUT.
 *
 * It is the destination's own kind, because the database says so: the coherence
 * trigger in `group_type_and_trip.sql` derives `about` from the destination and
 * refuses a row that disagrees with it.
 */
export function aboutForKind(kind: DestinationKind): GroupAbout {
  return kind;
}

/** Mountains first, then treks, each alphabetically. */
export function sortDestinations(list: GroupDestination[]): GroupDestination[] {
  return [...list].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "mountain" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/* -------------------------------------------------------------------------- */
/* Reading it                                                                  */
/* -------------------------------------------------------------------------- */

/** The same three-way test the rest of the groups code makes. */
function classify(error: PostgrestError | null): DestinationsAbsence["status"] {
  if (!error) return "refused";
  const code = error.code ?? "";
  if (code === "PGRST205" || code === "42P01" || code === "42703" || code === "PGRST204") {
    return "not-provisioned";
  }
  if (code === "42501") return "refused";
  if ((error.message ?? "").toLowerCase().includes("fetch")) return "unreachable";
  return "refused";
}

function sentenceFor(status: DestinationsAbsence["status"]): string {
  switch (status) {
    case "no-backend":
      return DESTINATIONS_NO_BACKEND;
    case "signed-out":
      return DESTINATIONS_SIGNED_OUT;
    case "not-provisioned":
      return DESTINATIONS_NOT_LIVE;
    case "unreachable":
      return DESTINATIONS_UNREACHABLE;
    default:
      return DESTINATIONS_REFUSED;
  }
}

/**
 * How many rows are asked for.
 *
 * The catalogue is 52 mountains and 252 treks today. The ceiling is well clear
 * of that and is stated rather than left to PostgREST's own default, so a
 * catalogue that grows past it is a list that visibly stops rather than one
 * that quietly loses its last entries.
 */
const CATALOGUE_LIMIT = 1000;

/**
 * The last list the server gave, kept for the life of the tab.
 *
 * The catalogue is staff-written and changes a few times a year, so re-reading
 * 300 rows every time somebody opens a picker buys nothing. NOTHING BUT A
 * SUCCESSFUL READ IS CACHED: an absence is asked again next time, because the
 * reason for it — no signal, an expired session — is usually over by then.
 */
let cached: GroupDestination[] | null = null;

/**
 * The read that is already in flight, so a screen with several rows on it asks
 * once rather than once per row. Cleared the moment it settles, and never used
 * to remember a failure — the next caller asks again, as the cache rule says.
 */
let inflight: Promise<DestinationsRead> | null = null;

export async function readGroupDestinations(): Promise<DestinationsRead> {
  if (cached) return { status: "ready", destinations: cached };
  if (inflight) return inflight;
  inflight = readCatalogue().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function readCatalogue(): Promise<DestinationsRead> {
  if (!supabase || !untyped) {
    return { status: "no-backend", message: DESTINATIONS_NO_BACKEND };
  }
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user.id) {
    return { status: "signed-out", message: DESTINATIONS_SIGNED_OUT };
  }

  const { data, error } = await untyped
    .from("destinations")
    .select("id, name, kind, range, region, country, elevation_m")
    .in("kind", ["mountain", "trek"])
    .order("name", { ascending: true })
    .limit(CATALOGUE_LIMIT);

  if (error) {
    const status = classify(error);
    return { status, message: sentenceFor(status) };
  }

  const rows = Array.isArray(data) ? data : [];
  const destinations = sortDestinations(
    rows.map(toGroupDestination).filter((d): d is GroupDestination => d !== null),
  );
  cached = destinations;
  return { status: "ready", destinations };
}

/** Test seam: forget the cached catalogue. Used by nothing in the app. */
export function forgetDestinationCache(): void {
  cached = null;
  inflight = null;
}

/**
 * The catalogue, for a screen.
 *
 * One read per mount, served from the cache after the first. There is no
 * refresh and no polling: this is a list ICEFALL's own staff maintain, not
 * something that changes while somebody fills in a form.
 */
export function useGroupDestinations(): DestinationsState {
  const [state, setState] = useState<DestinationsState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void readGroupDestinations().then((result) => {
      if (alive) setState(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
