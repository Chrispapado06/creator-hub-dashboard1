import { OFFLINE } from "@/offline/offline";
import { useSampleGate } from "@/domain/sampleGate";

/**
 * THE SAMPLE-DATA STRIP — mounted ONCE, above the router, on every route.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS HERE AND NOT ON THE SCREENS.
 *
 * The disclosure used to be added screen by screen, and the arithmetic of that
 * approach is the whole argument against it: it reached three of eighteen
 * screens. Four of the five main tabs had none — so a guide could open Clients
 * and read six invented people with phone numbers, open Analytics and read an
 * invented season, open Profile and be told their listing was live, and never
 * once be told that any of it was made up. The fix is not fifteen more copies of
 * the notice; fifteen more copies is the same mistake with better coverage until
 * the nineteenth screen is written. It is ONE strip, above the router, that no
 * new screen can be added without.
 *
 * Same placement and the same reasoning as `OfflineBanner` beside it, and as the
 * athlete app's own strip: a flex SIBLING of the scrolling area rather than
 * something inside it, so it cannot be scrolled away; no close control and no
 * stored state, so it cannot be dismissed.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * IT READS THE SAME GATE THE DATA READS — `sampleAllowed()`, through
 * `useSampleGate()` — and that is the point of the file, not an implementation
 * detail. A disclosure gated more tightly than the thing it discloses is a
 * screen showing invented figures with the sentence explaining them switched
 * off; the only way to guarantee that never happens is for the notice and the
 * data to ask one function. It also inherits the gate's fail-closed behaviour
 * for free: while the session is still resolving, `sampleAllowed()` is false,
 * and so is the sample — neither renders, so neither can appear without the
 * other.
 *
 * NOT SHOWN ON AN OFFLINE BUILD, because `OfflineBanner` is already saying it
 * ("OFFLINE DEMO · sample data, not real") one line up. Two permanent bars
 * stacked is how a permanent bar stops being read (§6h). The wording each of
 * them carries is fixed across the ICEFALL apps — do not soften it, shorten it,
 * or make it collapsible.
 */
export function SampleBanner() {
  const showingSample = useSampleGate();
  if (!showingSample || OFFLINE) return null;

  return (
    <div
      role="note"
      aria-label="Demo. The data in this app is sample data and is not real."
      className="relative z-40 flex shrink-0 items-center justify-center gap-2 bg-azure px-4 py-2 text-obsidian"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-obsidian/70" />
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em]">DEMO</p>
      <span aria-hidden className="text-[10.5px] opacity-50">
        ·
      </span>
      <p className="text-[10.5px] font-medium tracking-[0.02em]">sample data, not real</p>
    </div>
  );
}
