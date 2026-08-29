/**
 * A value, or the REASON there isn't one.
 *
 * The honesty doctrine in a type. Every read in this CRM returns one of these,
 * so a screen physically cannot render a figure without having considered what
 * to do when the figure is missing — the failure mode being designed out is a
 * dashboard that shows `0` for "we could not reach the database", "nothing has
 * happened yet" and "the real answer is zero", which are three different
 * statements a person would act on differently.
 *
 * This mirrors `Score` / `Reading<T>` / `Unavailable` in the athlete app.
 */
export type Result<T> =
  | { state: "loading" }
  | { state: "ok"; value: T }
  | { state: "unavailable"; reason: string }
  | { state: "error"; reason: string }
  | { state: "forbidden"; reason: string };

export const loading = <T,>(): Result<T> => ({ state: "loading" });
export const ok = <T,>(value: T): Result<T> => ({ state: "ok", value });
export const unavailable = <T,>(reason: string): Result<T> => ({ state: "unavailable", reason });
export const failed = <T,>(reason: string): Result<T> => ({ state: "error", reason });

/**
 * A proportion, kept as its two halves.
 *
 * A conversion rate with no denominator is NOT 0% — it is unavailable. Keeping
 * the numerator and denominator apart until the moment of rendering is what
 * makes that distinction survivable; a function returning `number` has already
 * thrown the information away.
 */
export interface Ratio {
  numerator: number;
  denominator: number;
}

export function formatRatio(r: Ratio): string | null {
  if (r.denominator <= 0) return null;
  return `${((r.numerator / r.denominator) * 100).toFixed(1)}%`;
}

/**
 * Money. Integer minor units, always — see `money/model.ts`.
 *
 * `null` means "not recorded", and it renders as a phrase, never as a zero.
 */
export function formatCents(cents: number | null | undefined, currency = "EUR"): string | null {
  if (cents === null || cents === undefined) return null;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "USD" ? "$" : "";
  const s = (abs / 100).toLocaleString("en-GB", {
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${negative ? "−" : ""}${symbol}${s}${symbol ? "" : ` ${currency}`}`;
}

/** Compact, for a dashboard tile. Still never invents a figure. */
export function formatCentsShort(cents: number | null | undefined, currency = "EUR"): string | null {
  if (cents === null || cents === undefined) return null;
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  const whole = cents / 100;
  if (Math.abs(whole) >= 1_000_000) return `${symbol}${(whole / 1_000_000).toFixed(1)}m`;
  if (Math.abs(whole) >= 1_000) return `${symbol}${(whole / 1_000).toFixed(whole % 1000 === 0 ? 0 : 1)}k`;
  return `${symbol}${whole.toLocaleString("en-GB")}`;
}
