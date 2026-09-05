/**
 * Every read on these screens returns one of five states, so that "there is
 * nothing to read" can never be rendered by the same code path as "the figure
 * is zero". The data layer is not connected yet; today the screens hand
 * `ok(...)` the placeholder arrays, and swapping those for real reads is the
 * only change these files need.
 */
export type Result<T> =
  | { state: "loading" }
  | { state: "ok"; value: T }
  | { state: "unavailable"; reason: string }
  | { state: "error"; reason: string }
  | { state: "forbidden"; reason: string };

export const loading = { state: "loading" } as const;
export const ok = <T>(value: T): Result<T> => ({ state: "ok", value });
export const unavailable = <T>(reason: string): Result<T> => ({ state: "unavailable", reason });
export const failed = <T>(reason: string): Result<T> => ({ state: "error", reason });
export const forbidden = <T>(reason: string): Result<T> => ({ state: "forbidden", reason });
