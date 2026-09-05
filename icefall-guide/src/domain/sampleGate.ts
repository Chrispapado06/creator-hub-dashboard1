/**
 * ONE GATE, NOT TWELVE — whether the invented sample may be shown at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A MODULE AND NOT A CHECK IN EACH SCREEN.
 *
 * The §6aj displacement audit found **twelve screens** still reading the sample
 * with no idea a session existed. Home and Profile had been fixed; everything
 * behind them had not — so the app contradicted itself one tap apart. Home said
 * *"your bookings are not connected to this account"* and the very next tab
 * showed six invented clients with names and phone numbers.
 *
 * Twelve copies of one rule is the drift this codebase has been bitten by
 * repeatedly — five commission models, two trek catalogues, four company lists.
 * So the rule lives once, here, and every seed read passes through it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE RULE: A SESSION DISPLACES THE SAMPLE ENTIRELY. Not merged, not partially
 * overridden. A screen mixing a real account with invented figures is one where
 * no individual number can be trusted, and the "sample data" banner cannot say
 * which half it covers.
 *
 * IT FAILS CLOSED WHILE THE SESSION IS UNKNOWN. Between first paint and the
 * session resolving, the answer is "not allowed". Showing the sample for a
 * moment to somebody who turns out to be signed in is a flash of another
 * person's data on their screen — brief, and still theirs to have seen.
 */

import { useEffect, useSyncExternalStore } from "react";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { currentUserId, guideAccess, onAuthChange } from "@/auth/account";

/**
 * `null` means "not yet known", and it is deliberately distinct from `false`.
 * Callers cannot tell them apart through `sampleAllowed()` — both deny — but the
 * provider needs the difference to know whether it has resolved.
 */
let resolved: boolean | null = null;

/**
 * WHOSE APP THIS IS — not merely whether somebody is here.
 *
 * `resolved` answers "may invented data render". That was enough while the only
 * question was what to SHOW. It is not enough for what a guide SAVES: their own
 * mountains and dates need a drawer of their own, separable from the sample's
 * and from the previous account's on a shared device. `session` is null until
 * known, and `owner` carries the account id when there is one.
 */
let session: boolean | null = null;
let owner: string | null = null;

const listeners = new Set<() => void>();

/** Set once the session is known. Called only by the identity provider. */
export function setSessionPresent(present: boolean, uid: string | null = null): void {
  const next = SHOW_DEMO_DATA && !present;
  if (next === resolved && present === session && uid === owner) return;
  resolved = next;
  session = present;
  owner = uid;
  for (const fn of listeners) fn();
}

/**
 * WHICH DRAWER THE GUIDE'S OWN WORK LIVES IN — `null` while unknown.
 *
 * THE BUG THIS EXISTS TO KILL: the sample gate was fitted to the listing and
 * availability READS and never to their WRITES. A signed-in guide could add a
 * mountain, be told "Saved on this phone", and find the next screen saying they
 * had added nothing — the write succeeded into a drawer the read refused to
 * open. Silent, and on the one screen the whole app exists for.
 *
 * The mistake was treating "this stored data might be the sample's" as a reason
 * to show NOTHING, when it is a reason to keep the sample's work and the
 * account's work APART. One drawer per owner does that:
 *
 *   "sample"      the seeded demo drawer (its existing key, so demo edits live)
 *   "own:<uid>"   this account's own drawer — starts empty, never seeded
 *   "own"         signed out of a non-demo build: still theirs, still separate
 *   null          not yet known — reads give nothing AND writes REFUSE, so the
 *                 screen can say so rather than swallow the edit
 *
 * Keying by uid also closes a leak nobody had hit yet: two guides sharing a
 * phone would otherwise inherit each other's mountains.
 */
export type StoreScope = string | null;

export function storeScope(): StoreScope {
  if (session === null) return null;
  if (sampleAllowed()) return "sample";
  return owner ? `own:${owner}` : "own";
}

export function subscribeSampleGate(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Whether invented data may be rendered right now. False until proven. */
export const sampleAllowed = (): boolean => resolved === true;

/**
 * The one accessor every seed read goes through.
 *
 * Returns the sample when it is allowed and the empty value when it is not, so
 * a caller cannot accidentally read the seed by forgetting a check — the check
 * is the only way to reach it.
 */
export function sample<T>(value: T, whenGated: T): T {
  return sampleAllowed() ? value : whenGated;
}

/** For a nullable single record — the sample guide, an application. */
export const sampleOrNull = <T>(value: T): T | null => (sampleAllowed() ? value : null);

/* -------------------------------------------------------------------------- */
/* Resolving it                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the session once for the whole app and opens or closes the gate.
 *
 * ONE RESOLUTION, NOT ONE PER SCREEN. Twelve screens each asking the auth client
 * whether somebody is signed in is twelve chances to disagree, and they would
 * disagree during the moment between them — which is exactly the window where a
 * signed-in person would see somebody else's data flash past.
 *
 * `useSyncExternalStore` rather than state so every consumer re-renders on the
 * same tick when the gate flips, including the ones that read the sample through
 * a plain function call rather than a hook.
 */
export function useSampleGate(): boolean {
  return useSyncExternalStore(
    subscribeSampleGate,
    sampleAllowed,
    /* Server snapshot: closed. The sample never renders during hydration. */
    () => false,
  );
}

/**
 * Re-render when the OWNER changes, not merely when the sample flips.
 *
 * A screen holding the guide's own work must re-read once the drawer is known:
 * the first paint happens while `storeScope()` is still null, so anything
 * captured then is empty forever. Subscribing here is what turns "not yet
 * known" into "now known" on screen instead of on the next navigation.
 */
export function useStoreScope(): StoreScope {
  return useSyncExternalStore(subscribeSampleGate, storeScope, () => null);
}

/** Mount once, at the app root. Nothing else may call `setSessionPresent`. */
export function SampleGateResolver(): null {
  useEffect(() => {
    let alive = true;
    const resolve = () =>
      void guideAccess().then((a) => {
        if (!alive) return;
        /* signed-out and offline are the only states with no session behind
           them. `unknown` means signed in and the guide check failed — still a
           session, so still no sample. */
        const present = a !== "signed-out" && a !== "offline";
        if (!present) {
          setSessionPresent(false, null);
          return;
        }
        /* The uid names the drawer, so it is fetched before the gate opens
           rather than after — a write landing in "own" and a later read in
           "own:<uid>" would lose the edit exactly as the original bug did. */
        void currentUserId().then((uid) => {
          if (alive) setSessionPresent(true, uid);
        });
      });
    resolve();
    const off = onAuthChange(resolve);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return null;
}
