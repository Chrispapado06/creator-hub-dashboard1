/**
 * A fetch signal that gives up.
 *
 * True offline fails instantly, which is easy. The case that hurts on a
 * mountain is the OTHER one: a hut wifi or a single bar of signal that accepts
 * the connection and then never answers. Without a deadline those requests hang
 * for as long as the OS allows, and the screen waiting on them shows a spinner
 * that never resolves — worse than an honest "unavailable", because the athlete
 * cannot tell whether to keep waiting.
 *
 * Combines the caller's own AbortSignal (unmount) with a time limit, so both
 * still work.
 */
export function withTimeout(ms: number, signal?: AbortSignal): AbortSignal | undefined {
  const AS = AbortSignal as unknown as {
    timeout?: (ms: number) => AbortSignal;
    any?: (signals: AbortSignal[]) => AbortSignal;
  };
  // Very old engines have neither; the caller's signal is then the best we can do.
  if (typeof AS.timeout !== "function") return signal;

  const timeout = AS.timeout(ms);
  if (!signal) return timeout;
  if (typeof AS.any === "function") return AS.any([signal, timeout]);

  // Manual combination where AbortSignal.any is missing.
  const ctrl = new AbortController();
  if (signal.aborted || timeout.aborted) {
    ctrl.abort();
  } else {
    const abort = () => ctrl.abort();
    signal.addEventListener("abort", abort, { once: true });
    timeout.addEventListener("abort", abort, { once: true });
  }
  return ctrl.signal;
}

/** Forecasts: short — a stale-but-cached reading beats a spinner. */
export const CONDITIONS_TIMEOUT_MS = 8_000;
/** Peak search / lookup: the bundled catalogue is the fallback. */
export const PEAKS_TIMEOUT_MS = 8_000;
/**
 * "Every summit around this point" from Overpass — a far heavier query than a
 * name lookup, and it needs its own budget.
 *
 * Measured 2026-08-22 against a 100 km radius from Bergen: the one mirror that
 * currently answers a browser (maps.mail.ru — the others either time out, 406,
 * or send no CORS header) took **10.2 s**. At the 8 s shared limit the request
 * was killed a beat before it landed, so the search failed intermittently and
 * looked to the user like an empty map.
 *
 * Overpass's own `[timeout:40]` is the server-side cap; this is the client's.
 */
export const OVERPASS_TIMEOUT_MS = 20_000;
/** Summit photography: entirely cosmetic, so it waits the least. */
export const PHOTOS_TIMEOUT_MS = 6_000;
