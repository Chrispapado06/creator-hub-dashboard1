/**
 * LOCAL-DEMO FIGURES — doctrine tier 4, constitution §6 #18.
 *
 * ⚠️ DELETE BEFORE ANY REAL OPERATOR SEES THIS APP.
 *
 * The owner chose, knowing it is invented, to show the mockup's profile-view
 * figure while the portal is local-only. This module is the ONLY place that
 * invention lives, and it works at the DISPLAY layer: nothing here writes an
 * analytics row, so the server-source rule (§6d — only rows ICEFALL's server
 * recorded count) is never touched. Flip `DEMO_PROFILE_VIEWS` to false and
 * every surface falls back to the honest reading it always had underneath:
 * "Icefall is not counting listing views yet…"
 *
 * Deterministic on purpose — the same figure every load, so nobody mistakes
 * it for something being measured.
 */

import { measured, type Reading } from "@/domain/honesty";

export const DEMO_PROFILE_VIEWS = true;

const DEMO_VIEWS_FIGURE = 1248; // the mockup's number, verbatim
const DEMO_VIEWS_DELTA = 56; // "+56% vs 1 – 31 Jul 2026", ditto

/**
 * Wraps the honest reading. With the flag on it returns the mockup's figure;
 * with the flag off it returns `honest` untouched.
 */
export function demoViewsReading(honest: Reading<number>): Reading<number> {
  return DEMO_PROFILE_VIEWS ? measured(DEMO_VIEWS_FIGURE) : honest;
}

/** The tile's delta, or null (no delta rendered) when the flag is off. */
export function demoViewsDelta(): number | null {
  return DEMO_PROFILE_VIEWS ? DEMO_VIEWS_DELTA : null;
}

/* -------------------------------------------------------------------------- */
/* Demo customer profiles — photos and verified marks                         */
/* -------------------------------------------------------------------------- */

/**
 * ⚠️ SAME FENCE AS ABOVE — LOCAL DEMO ONLY, DELETE BEFORE REAL OPERATORS.
 *
 * The doctrine's standing rule is initials, never a photograph: an invented
 * face on an invented name is a fabricated person. The owner asked for photo
 * avatars and verified marks on the demo customers anyway (2026-08-29), so
 * they live HERE — display-layer, deterministic, hand-matched to each seeded
 * name so no face contradicts its name, sourced from a stock-portrait set.
 * Nothing below writes to the domain: no `verified` field exists on Lead, and
 * turning the flag off returns every surface to initials.
 *
 * Not every customer gets a photo, on purpose — real customer lists never
 * have full coverage, and the gap is what makes the demo read honestly.
 */
export const DEMO_CUSTOMER_PROFILES = true;

const DEMO_PHOTO: Record<string, string> = {
  "Hanne Bakken": "women/44",
  "Tomás Ferreira": "men/32",
  "Luis Miguel": "men/75",
  "Paulo Almeida": "men/22",
  "Zofia Adamska": "women/65",
  "Sophie Dubois": "women/12",
  "Priya Raman": "women/68",
  "Aoife Brennan": "women/26",
  "Callum Fraser": "men/41",
  "Charlotte Martin": "women/57",
  "Benjamin Lee": "men/86",
  "Ingrid Sundqvist": "women/33",
  "Rafael Duarte": "men/54",
  "Kenji Watanabe": "men/64",
  "Nadia Haddad": "women/81",
  "Helena Ruiz": "women/50",
  "Oskar Nowak": "men/11",
  "Marcus Oyelaran": "men/29",
};

/** A stock portrait for this demo customer, or null → initials as always. */
export function demoCustomerPhoto(name: string): string | null {
  if (!DEMO_CUSTOMER_PROFILES) return null;
  const p = DEMO_PHOTO[name];
  return p ? `https://randomuser.me/api/portraits/${p}.jpg` : null;
}

const DEMO_VERIFIED = new Set([
  "Hanne Bakken",
  "Luis Miguel",
  "Priya Raman",
  "Sophie Dubois",
  "Charlotte Martin",
  "Ingrid Sundqvist",
  "Kenji Watanabe",
]);

/** Whether the demo shows a verified mark beside this customer's name. */
export function demoCustomerVerified(name: string): boolean {
  return DEMO_CUSTOMER_PROFILES && DEMO_VERIFIED.has(name);
}

/* -------------------------------------------------------------------------- */
/* Demo per-listing views                                                     */
/* -------------------------------------------------------------------------- */

/**
 * ⚠️ SAME FENCE — LOCAL DEMO ONLY, DELETE BEFORE REAL OPERATORS.
 *
 * The owner asked to see views per trek and per mountain. NOTHING in the
 * ICEFALL family emits a listing-view event — not the phone app, not the web
 * app — so these are invented, exactly like the 1,248 headline figure and
 * governed by the same flag. When it is off, every one of these falls back to
 * the honest `Unavailable` the adapter already produces.
 *
 * Two deliberate properties, so the demo cannot teach a wrong lesson:
 *
 *  - **Correlated with enquiries.** A trip with 12 enquiries and 3 views would
 *    read as a broken metric; the shape has to be plausible or the screen is
 *    useless as a demo of the screen.
 *  - **Not perfectly correlated.** The whole value of a views column is
 *    spotting the listing that is SEEN and not ENQUIRED ABOUT, so the jitter is
 *    wide enough for that case to appear and be actionable.
 *
 * Deterministic from the id: the same listing shows the same number on every
 * load, so nobody mistakes a moving figure for a live one.
 */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Invented views for one listing, or null when the flag is off. */
export function demoListingViews(id: string, enquiries: number): number | null {
  if (!DEMO_PROFILE_VIEWS) return null;
  const r = hash(id);
  // 14–46 views per enquiry, plus a floor so a listing with no enquiries still
  // shows the traffic that produced none — the most useful row on the screen.
  const perEnquiry = 14 + Math.round(r * 32);
  const floor = 25 + Math.round(hash(`${id}:floor`) * 180);
  return enquiries * perEnquiry + floor;
}
