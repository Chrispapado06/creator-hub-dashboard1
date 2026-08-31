/**
 * OFFLINE FIXTURES — the whole of what the site knows when it has no network.
 *
 * Nothing in this file is real. Every name here was invented for the offline
 * demo, and the permanent banner (`OfflineBanner.tsx`) says so on every screen
 * so that nobody can mistake a fixture for a measurement.
 *
 * ── RULES THIS FILE LIVES BY ────────────────────────────────────────────────
 *
 *  1. NOTHING HERE MAY NAME A REAL BUSINESS. ICEFALL's demo catalogue carries
 *     one deliberate exception — `Elite Exped`, a real operator used as a
 *     worked example in `src/data/companies.ts` — and putting a real company's
 *     name under a banner reading "sample data, not real" attaches invented
 *     commercial figures to an identifiable business. Offline that listing is
 *     filtered out at the source rather than relabelled; see the `OFFLINE`
 *     branches in `src/data/companies.ts` and `src/data/demo.ts`.
 *
 *  2. NOTHING HERE IS IMPORTED ON A PRODUCTION PATH. Every import of this file
 *     sits behind `if (OFFLINE)`. With `VITE_ICEFALL_OFFLINE` unset, not one
 *     value below is ever read.
 *
 *  3. WRITES ARE ACCEPTED, NOT PERSISTED. The stores below are plain
 *     module-level state: a form submitted offline updates them, the UI moves
 *     on to its real success state, and a reload forgets it. That is the
 *     honest offline contract — accept the input, never invent a receipt, and
 *     never fail in a way that looks like the visitor's fault.
 */

import type { Session } from "@/lib/auth";
import type { JoinResult } from "@/lib/waitlist";
import type { SupportResult } from "@/lib/support";

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Who you are offline.
 *
 * Deliberately not a person's name. The marketplace shows this in the header
 * pill and on the booking confirmation, and an invented human name there reads
 * like a real account; "Demo Climber" cannot.
 *
 * Seeding this is also what removes every sign-in wall offline — the local
 * session is already present, so `BookingConfirm`'s "Sign in to confirm your
 * trip" screen and `requireAuth`'s modal never open. See `src/lib/auth.tsx`.
 */
export const OFFLINE_SESSION: Session = {
  // A fixed, obviously-fake id. The offline build never talks to Supabase, so
  // nothing resolves this — but `Session.id` is required now that sessions are
  // real, and a blank would flow into "read my own rows" queries as a valid
  // string. `offline-` prefixed so it can never be mistaken for a uuid.
  id: "offline-demo-climber",
  name: "Demo Climber",
  email: "demo@icefall.example",
};

/* -------------------------------------------------------------------------- */
/* The waitlist                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Addresses submitted to the waitlist in this session.
 *
 * A Set rather than a counter because the real endpoint distinguishes a new
 * signup from a repeat one, and the success card reads differently for each
 * ("You're on the list." / "You're already on the list."). Reproducing that
 * distinction offline is the difference between a form that works and a form
 * that always says the same thing.
 */
const joined = new Set<string>();

/** Everything submitted, in order. Kept so a reader can see the write landed. */
export const offlineWaitlistJoins: { email: string; name: string; source: string; at: string }[] = [];

export function offlineJoinWaitlist(input: {
  email: string;
  name?: string;
  source: string;
}): JoinResult {
  const email = input.email.trim().toLowerCase();
  const already = joined.has(email);
  joined.add(email);
  offlineWaitlistJoins.push({
    email,
    name: input.name?.trim() ?? "",
    source: input.source,
    at: new Date().toISOString(),
  });
  // Never `ok: false`. Offline there is nothing that could have gone wrong,
  // and an error here would be a fabricated failure.
  return { ok: true, already };
}

/* -------------------------------------------------------------------------- */
/* Support                                                                    */
/* -------------------------------------------------------------------------- */

export const offlineSupportMessages: {
  email: string;
  name: string;
  subject: string;
  body: string;
  at: string;
}[] = [];

export function offlineSendSupportMessage(input: {
  email: string;
  name?: string;
  subject: string;
  body: string;
}): SupportResult {
  offlineSupportMessages.push({
    email: input.email.trim().toLowerCase(),
    name: input.name?.trim() ?? "",
    subject: input.subject.trim(),
    body: input.body.trim(),
    at: new Date().toISOString(),
  });
  /*
   * The success card says "We have it, and we'll reply to …". Offline that is
   * true of this browser tab and of nothing else — which is exactly what the
   * banner above it is for. The alternative, an error, would tell a visitor
   * their message failed when the demo never intended to send one.
   */
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * No flight or hotel provider is connected offline — which is the literal
 * truth, and it is also what `getHealth()` already returns whenever the API
 * server is absent.
 *
 * Returning `null` here is what keeps `resolveFlights` / `resolveStays` from
 * ever reaching their `fetch` calls: both only try the network when health
 * reports "live". Everything then falls to the app's own local generators —
 * `searchFlights()` in `src/lib/flights.ts` and `lodgesForObjective()` in
 * `src/lib/trip.ts` — which are deterministic, entirely local, and already
 * labelled "demo" wherever they are shown. The priced results on
 * `/plan` therefore stay fully populated with no network at all.
 */
export function offlineHealth(): Promise<null> {
  return Promise.resolve(null);
}

/* -------------------------------------------------------------------------- */
/* Maps                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The one thing offline genuinely cannot do.
 *
 * Satellite imagery is streamed from Esri a tile at a time; there is no local
 * copy and there is no honest substitute. Every map surface renders the calm
 * placeholder in `MapPlaceholder.tsx` carrying this line rather than a grey
 * void or, worse, a drawing of terrain nobody has surveyed.
 */
export const OFFLINE_MAP_NOTICE = "Satellite imagery needs a connection.";
