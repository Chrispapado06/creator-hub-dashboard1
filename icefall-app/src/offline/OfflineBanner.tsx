import { OFFLINE } from "./offline";

/**
 * THE OFFLINE BANNER.
 *
 * Permanent, non-dismissable, on every screen. It is not decoration and it is
 * not a nicety: ICEFALL's whole posture is that it never shows a figure it
 * cannot measure, and offline it cannot measure anything at all. Every summit,
 * split, forecast, message and guide in an offline build was written into a
 * fixture file. This one line is what keeps that honest, so it is loud, it sits
 * above the sheets and overlays, and there is no way to close it.
 *
 * Rendered as a normal flex child of the phone frame rather than as an overlay,
 * so it never sits on top of a screen's own header — and given a z-index above
 * the sheet layer (`z-50`, portalled into `[data-phone-shell]`) so a bottom
 * sheet cannot cover it either.
 */
export function OfflineBanner() {
  /* The first word is the build's own claim about itself, and it must be the
     right one. The internet demo saying "Offline demo" over a streaming map is
     the same lie the flag split just fixed, one layer up — a banner that exists
     to keep the build honest must not be the thing on it that is wrong. The
     sample-data half is common to both and does not change. */
  const mode = OFFLINE ? "Offline demo" : "Demo";
  return (
    <div
      role="status"
      aria-live="off"
      className="relative z-[300] flex shrink-0 items-center justify-center gap-2 bg-azure px-4 py-1.5 text-obsidian shadow-[0_6px_18px_-8px_rgba(0,0,0,0.9)]"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)" }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-obsidian/70"
      />
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
        {mode}
      </span>
      <span aria-hidden className="text-[11px] opacity-50">
        ·
      </span>
      <span className="text-[11px] font-medium tracking-[0.02em]">
        sample data, not real
      </span>
    </div>
  );
}
