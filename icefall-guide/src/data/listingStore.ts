/**
 * THE GUIDE'S LISTING — what they are selling, built and owned by them.
 *
 * This is the supply side. The rest of the app REPORTS on a season; this is
 * where the guide decides what the season can contain: which mountains they will
 * take people up, what they charge, what a client must already be able to do,
 * and how they describe themselves. Nothing here is derived from bookings —
 * it is the guide's own statement of what they offer, which is the thing a
 * booking is made AGAINST.
 *
 * PERSISTED ON THIS DEVICE. Not because local storage is the right home for it,
 * but because the alternative is a form that forgets — a control that writes
 * into nothing, which is indistinguishable to the person using it from one that
 * works (owner decision 14). It saves, and the app says plainly that saving is
 * not publishing.
 *
 * WHAT IS MISSING, AND IT IS NOT SMALL. `icefall-supabase` has
 * `guide_profiles` with `mountains text[]`, `specialities`, `daily_rate_eur` and
 * `bio` — so the PROFILE has a home. What it does not have is:
 *
 *   · per-mountain terms (a guide charges differently for Everest than for the
 *     Breithorn, and the prerequisites are not the same either),
 *   · dated availability,
 *   · listing photographs owned by the guide.
 *
 * All three are filed. Until they land, a guide can build their listing here and
 * nobody else can see it — which the screens state in one line rather than
 * implying otherwise by staying quiet.
 *
 * A NOTE ON WHY PREREQUISITES ARE REQUIRED ON EVERY MOUNTAIN. "What the client
 * must already be able to do" is not marketing copy. A guide advertising the
 * Hörnli with that field blank is how somebody books a route they cannot climb
 * and finds out at 3,000 m. The type makes it non-optional and the editor will
 * not accept an empty one.
 */

import { OFFLINE } from "@/offline/offline";

/* v2: the listing gained treks, so stored shapes from v1 are not readable. A new
   key rather than a migration — nothing is deployed, and a half-understood
   migration of somebody's own listing is worse than starting it again. */
/**
 * AN OFFLINE DEMO GETS ITS OWN DRAWER, and this is not tidiness.
 *
 * The demo runs on the same origin as the real app, so a shared key would mean
 * two things, both bad: the demo would open showing a listing edited against the
 * OTHER seed — a different guide's name on Profile than on Home — and, worse,
 * editing the demo would overwrite a real guide's saved listing on their own
 * device. Sample data must not be able to touch a person's own work.
 *
 * With the flag unset this is the same string it has always been.
 */
const KEY = OFFLINE ? "icefall-guide:offline-demo:listing:v2" : "icefall-guide:listing:v2";

/** How hard the guide grades their own offering on that mountain. */
export type Grade = "Introductory" | "Moderate" | "Technical" | "Expedition";
export const GRADES: Grade[] = ["Introductory", "Moderate", "Technical", "Expedition"];

/**
 * WHAT A GUIDE OFFERS IS NOT ALWAYS A SUMMIT.
 *
 * A trek is the other half of this business — 252 of them against 52 peaks — and
 * a guide who runs the Tour du Mont Blanc is selling something real that the
 * mountain-shaped version of this screen could not express. The `kind` decides
 * which catalogue the id belongs to and which photo library it draws from;
 * everything else about the guide's terms is identical, because the commercial
 * question is the same either way.
 */
export type RouteKind = "mountain" | "trek";

/** One mountain or trek the guide offers, on their own terms. */
export interface OfferedRoute {
  kind: RouteKind;
  /** A peak id or a trek id, per `kind`. */
  routeId: string;
  /** The route or variant they take. Free text — a guide's own words. */
  routes: string;
  grade: Grade;
  /** Their fee per day for this mountain, in whole euros. */
  dayRateEur: number;
  /** Typical trip length in days, as they run it. */
  typicalDays: number;
  /**
   * What a client must already be able to do. REQUIRED — see the header.
   */
  requires: string;
}

export interface ListingProfile {
  name: string;
  title: string;
  nationality: string;
  basedIn: string;
  languages: string[];
  yearsGuiding: number;
  bio: string;
  /** Peak id used as the profile's header photograph. */
  heroPeak: string;
}

export interface Listing {
  profile: ListingProfile | null;
  routes: OfferedRoute[];
}

const EMPTY: Listing = { profile: null, routes: [] };

function read(): Partial<Listing> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Partial<Listing>) : {};
  } catch {
    /* A corrupt store is an empty one, never a crash. The guide loses their
       edits; they do not lose the app in a car park with no signal. */
    return {};
  }
}

function write(v: Partial<Listing>): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

/**
 * The listing, with the seed as a STARTING POINT rather than a floor.
 *
 * A guide who REMOVES a seeded mountain must not find it back on the next
 * reload, so removals are recorded rather than inferred from absence — the same
 * reason the availability store keeps tombstones.
 */
export function loadListing(seed: Listing): Listing {
  const own = read();
  return {
    profile: own.profile ?? seed.profile,
    routes: own.routes ?? seed.routes,
  };
}

export function saveProfile(p: ListingProfile, seed: Listing): boolean {
  const own = read();
  return write({ routes: own.routes ?? seed.routes, profile: p });
}

export function saveRoutes(r: OfferedRoute[], seed: Listing): boolean {
  const own = read();
  return write({ profile: own.profile ?? seed.profile, routes: r });
}

/** Identity is the PAIR — a peak and a trek may legitimately share an id. */
const same = (a: OfferedRoute, kind: RouteKind, id: string) =>
  a.kind === kind && a.routeId === id;

export function upsertRoute(next: OfferedRoute, seed: Listing): boolean {
  const cur = loadListing(seed).routes;
  const i = cur.findIndex((m) => same(m, next.kind, next.routeId));
  const out = i === -1 ? [...cur, next] : cur.map((m) => (same(m, next.kind, next.routeId) ? next : m));
  return saveRoutes(out, seed);
}

export function removeRoute(kind: RouteKind, routeId: string, seed: Listing): boolean {
  return saveRoutes(
    loadListing(seed).routes.filter((m) => !same(m, kind, routeId)),
    seed,
  );
}

/**
 * WHAT IS STOPPING THIS LISTING GOING LIVE, as a list rather than a score.
 *
 * Deliberately NOT a completion percentage. A percentage invites a guide to feel
 * 80% done when the missing 20% is the thing that actually blocks them, and it
 * says nothing about what to do next. This returns the specific missing items,
 * in the order they matter, and returns an empty array when there is genuinely
 * nothing outstanding.
 */
export function whatIsMissing(l: Listing, documentsApproved: boolean): string[] {
  const out: string[] = [];
  if (!l.profile?.bio?.trim()) out.push("a short description of what you guide");
  if (!l.profile?.basedIn?.trim()) out.push("where you work from");
  if (l.routes.length === 0) out.push("at least one mountain or trek you guide");
  if (l.routes.some((m) => !m.requires.trim()))
    out.push("what a client must already be able to do, on everything you offer");
  if (l.routes.some((m) => m.dayRateEur <= 0)) out.push("a day rate on everything you offer");
  if (!documentsApproved) out.push("your documents checked by ICEFALL");
  return out;
}

export { EMPTY as EMPTY_LISTING };
