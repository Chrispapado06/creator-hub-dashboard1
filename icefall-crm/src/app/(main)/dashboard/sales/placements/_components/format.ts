/**
 * The formatting rules the old CRM's `data/result.ts` and `lib/utils.ts` held,
 * co-located here because this rebuild may not add to `src/lib`.
 */

/**
 * Money. Integer minor units, always.
 *
 * `null` means "not recorded" and returns `null` so the caller has to say what
 * the absence means — it never becomes a zero on the way through.
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

/**
 * A calendar day, formatted for a person.
 *
 * NEVER `new Date("YYYY-MM-DD")` for a calendar day — that parses as UTC
 * midnight and renders as the previous day anywhere west of Greenwich. A
 * placement expiring "on the 30th" showing as the 29th to a reviewer in New
 * York is the kind of bug that gets a slot released a day early. Split the
 * parts and build a local date instead.
 */
export function formatDay(isoDay: string | null | undefined): string | null {
  if (!isoDay) return null;
  const [y, m, d] = isoDay.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A timestamp (which really is an instant, so parsing it directly is correct). */
export function formatMoment(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/**
 * Whole calendar days from today to an ISO day.
 *
 * Both ends are read in UTC. The old CRM took "today" from the reader's local
 * clock, which was right when only a browser ever ran it; this app renders the
 * same component on the server first, and a server in one zone against a
 * browser in another would produce two different day counts for one row and a
 * hydration mismatch with it.
 */
export function daysUntil(isoDay: string): number {
  const [y, m, d] = isoDay.slice(0, 10).split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((then - today) / 86_400_000);
}

/** "··" for a name nobody recorded — never blank, never a guess. */
export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "··";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

/**
 * Position #1 is PREMIUM: the highest featured position on a mountain.
 *
 * It is the most expensive slot. It is NOT a statement that the company holding
 * it is better than the others, and no label in this system should imply it —
 * ICEFALL sells the position, it does not rank the operator.
 */
export const slotLabel = (n: number) => (n === 1 ? "#1 Premium" : `#${n} Featured`);
