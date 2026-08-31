import { WifiOff } from "lucide-react";

/**
 * THE OFFLINE BANNER — the one thing on screen that is not sample data.
 *
 * ICEFALL never shows a number it cannot measure. Offline this app can measure
 * nothing at all: the guide is invented, the clients never wrote, the money
 * never moved, and the verification was decided by nobody. Every screen is
 * therefore a claim the app cannot stand behind, and this bar is what makes that
 * honest. It is not chrome and it is not a nicety — it is the load-bearing part
 * of running the app on fixtures.
 *
 * So it is: PERMANENT (rendered above the router, on every route including the
 * sign-in screen), NON-DISMISSABLE (there is no close control, no state, and
 * nothing to remember), and LOUD (a solid alert-amber bar in a dark app where
 * amber is otherwise used only for a warning). It cannot be scrolled away —
 * it is a flex sibling of the scrolling area, not part of it.
 *
 * The wording is fixed across all five ICEFALL apps. Do not soften it, do not
 * shorten it, and do not make it collapsible.
 */
export function OfflineBanner() {
  return (
    <div
      role="note"
      aria-label="Offline demo. The data in this app is sample data and is not real."
      className="relative z-30 flex shrink-0 items-center justify-center gap-2 bg-alert px-3 py-2 text-obsidian"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
    >
      <WifiOff size={13} strokeWidth={2.4} className="shrink-0" />
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em]">
        OFFLINE DEMO · sample data, not real
      </p>
    </div>
  );
}
