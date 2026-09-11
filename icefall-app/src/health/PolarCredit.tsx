import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "Source: Polar" — the credit Polar's API agreement requires
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Polar's licence, as recorded in ICEFALL-INTEGRATIONS.md §1A, carries two
 * display duties and this file is both halves of the first one:
 *
 *     "Must show a text credit 'Source: Polar' wherever Polar data appears
 *      (no Polar logo without written consent)"
 *
 * ── THE WORDS ARE THE OBLIGATION, SO THEY ARE A CONSTANT ────────────────────
 *
 * `POLAR_SOURCE_CREDIT` is not a label somebody may improve. "Data from
 * Polar", "via Polar" and "Polar" are all better English and none of them is
 * the sentence the agreement names. It is exported as a string as well as a
 * component because one Polar surface is a plain label rather than JSX — see
 * `tracking/adapt.ts` — and both must say the identical thing.
 *
 * ── AND THERE IS NO LOGO, ANYWHERE ──────────────────────────────────────────
 *
 * A TEXT credit. Not a mark, not a wordmark set in Polar's typeface, not an
 * icon that resembles one. ICEFALL has no written consent for a Polar logo and
 * this component must never grow into one — `WatchTile.tsx` records the same
 * rule for the tile beside it, and `BrandMarks.tsx` records why Garmin's mark
 * is never drawn either.
 *
 * ── WHERE IT IS RENDERED ────────────────────────────────────────────────────
 *
 * Everywhere Polar-sourced data reaches a screen:
 *
 *   • `tracking/adapt.ts` — appended to the provenance label that travels with
 *     an imported activity, so it follows that activity onto the history
 *     cards, the search results and the completion screen without each of
 *     those having to remember;
 *   • `screens/ActivitySummary.tsx` — the provenance block, which builds its
 *     own sentence and so needs its own credit;
 *   • `screens/settings/Connections.tsx` — the Polar cards, which show the
 *     account and connection date Polar supplied.
 *
 * If a new screen ever draws a Polar reading, it renders this. That is the
 * whole reason it is one component and not three inline strings.
 */
export const POLAR_SOURCE_CREDIT = "Source: Polar";

export function PolarCredit({ className }: { className?: string }) {
  return (
    <span className={cn("text-[11px] leading-relaxed text-mist-dim", className)}>
      {POLAR_SOURCE_CREDIT}
    </span>
  );
}
