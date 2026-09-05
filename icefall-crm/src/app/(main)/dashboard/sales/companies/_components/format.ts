/**
 * The four formatting rules this area shares with the rest of ICEFALL.
 *
 * Ported from the old CRM's lib/utils.ts and data/result.ts so the roster, the
 * record, the editor and the intake form cannot drift into printing the same
 * fact four different ways.
 */

/**
 * A date, formatted for a person.
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

export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "··";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", GBP: "£", USD: "$" };

/**
 * Money. Integer minor units, always.
 *
 * `null` means "not recorded", and it renders as a phrase, never as a zero —
 * which is why this returns `string | null` and the caller must decide what
 * the absence says.
 */
export function formatCents(cents: number | null | undefined, currency = "EUR"): string | null {
  if (cents === null || cents === undefined) return null;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  // A currency with no symbol of its own gets its ISO code appended instead.
  const symbol = CURRENCY_SYMBOLS[currency] ?? "";
  const s = (abs / 100).toLocaleString("en-GB", {
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${negative ? "−" : ""}${symbol}${s}${symbol ? "" : ` ${currency}`}`;
}

/** Matches the database CHECK grammar on `companies.slug`: lowercase, hyphenated. */
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
