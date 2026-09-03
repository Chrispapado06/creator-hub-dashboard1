import { useCallback, useEffect, useState } from "react";
import { healthService, type HealthDaySummary } from "./health";
import { ouraService, type OuraState, type OuraSummary } from "./oura";
import { resolveVitals, type Vitals } from "./vitals";

/**
 * React access to the ring, and to the resolved vitals.
 *
 * Two hooks, and the split matters. `useOura` is for the CONNECTION screen —
 * the one place a person manages the ring itself, where Oura's own vocabulary
 * ("your Oura membership has lapsed") is the right thing to show. `useVitals`
 * is for everywhere else, where the question is "what is this athlete's resting
 * heart rate" and the answer must not depend on which screen is asking.
 *
 * Nothing here polls. Sleep and readiness are day-granularity figures that only
 * reach Oura's cloud when the person opens the Oura app, so a timer would spend
 * the application-wide rate limit — shared across every ICEFALL user — to
 * re-read a number that changes once a night. Refresh happens on mount, on
 * sign-in, and when a person asks.
 */

export function useOura(): {
  state: OuraState;
  summary: OuraSummary;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<OuraState>(ouraService.state);
  // `summary()` is recomputed rather than stored, so a held summary ageing past
  // its limit stops being returned without anything having to fire.
  const [, bump] = useState(0);

  useEffect(
    () =>
      ouraService.subscribe((s) => {
        setState(s);
        bump((n) => n + 1);
      }),
    [],
  );

  useEffect(() => {
    void ouraService.refresh();
  }, []);

  const refresh = useCallback(() => ouraService.refresh(), []);

  return { state, summary: ouraService.summary(), refresh };
}

/**
 * The resolved answer per metric, from both sources, with the source named.
 *
 * This is what a coach screen should read. It never exposes which instrument
 * was asked first — that is `vitals.ts`'s fixed order — only which one
 * answered.
 */
export function useVitals(): { vitals: Vitals; loading: boolean } {
  const [oura, setOura] = useState<OuraSummary | null>(null);
  const [phone, setPhone] = useState<HealthDaySummary | null>(null);
  const [platform, setPlatform] = useState(healthService.state.platform);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;

    const unsubscribe = ouraService.subscribe((s) => {
      if (!live) return;
      setPlatform(healthService.state.platform);
      // Only a live connection contributes a summary. Every other state hands
      // the resolver a null, which it reads as "this source was not consulted".
      setOura(s.status === "connected" ? ouraService.summary() : null);
    });

    void ouraService.refresh();

    void healthService.daySummary().then((d) => {
      if (live) {
        setPhone(d);
        setLoading(false);
      }
    });

    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  const known = platform === "health-connect" ? "health-connect" : "apple-health";

  return { vitals: resolveVitals(oura, phone, known), loading };
}
