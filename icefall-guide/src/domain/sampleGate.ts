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
import { guideAccess, onAuthChange } from "@/auth/account";

/**
 * `null` means "not yet known", and it is deliberately distinct from `false`.
 * Callers cannot tell them apart through `sampleAllowed()` — both deny — but the
 * provider needs the difference to know whether it has resolved.
 */
let resolved: boolean | null = null;

const listeners = new Set<() => void>();

/** Set once the session is known. Called only by the identity provider. */
export function setSessionPresent(present: boolean): void {
  const next = SHOW_DEMO_DATA && !present;
  if (next === resolved) return;
  resolved = next;
  for (const fn of listeners) fn();
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
        setSessionPresent(a !== "signed-out" && a !== "offline");
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

