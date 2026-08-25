/**
 * Star ratings and "N people" counts.
 *
 * ⚠️ THESE NUMBERS ARE INVENTED. ICEFALL has no accounts, so nobody has rated
 * anything. They exist because the layout was designed against a reference that
 * has them and the product owner asked for them to be shown; they are not a
 * measurement of anything.
 *
 * This follows the same pattern as `DEMO_OPERATORS` in `services/operators.ts`:
 * placeholder figures behind one named flag, with a notice the screens are
 * required to print wherever the figure could change a decision.
 *
 * Two rules make this as safe as invented data can be:
 *
 *   1. **Deterministic.** Derived from the route id, so a card does not change
 *      its rating as you scroll or reopen it. Random numbers here would be
 *      obviously broken, and a rating that moves is a rating nobody trusts.
 *   2. **Never a safety signal.** The spread is deliberately narrow and high
 *      (4.3–4.9) so it reads as decoration rather than as a verdict, and the
 *      detail page says in words that it is not a measure of how safe or how
 *      hard the line is. A crowd's enthusiasm has never made a mountain safer.
 *
 * When accounts ship, delete this file and read the real figures instead.
 */

export const SHOW_DEMO_RATINGS = true;

export const RATING_NOTICE =
  "Ratings and follower counts are placeholder figures for this layout — ICEFALL has no accounts yet, so nobody has rated anything. They are not a measure of how safe, how hard or how well-conditioned a line is.";

export interface Rating {
  /** 4.3–4.9, one decimal. */
  stars: number;
  /** The "N people" figure beside it. */
  people: number;
}

/** Stable 32-bit hash, so the same id always yields the same figures. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function ratingFor(id: string): Rating | null {
  if (!SHOW_DEMO_RATINGS) return null;
  const h = hash(id);
  return {
    // 43..49 → 4.3..4.9
    stars: (43 + (h % 7)) / 10,
    // 40..900, weighted low so the numbers look like a real long tail.
    people: 40 + ((h >>> 8) % 861),
  };
}

export const fmtPeople = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
