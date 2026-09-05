import { IcefallLockup } from "@/components/ui/IcefallMark";
import { OfflineIndicator } from "@/components/layout/OfflineIndicator";

/**
 * On a phone the app is full-bleed. On a desktop it sits in a 430 × 884 frame
 * on an ambient page, which reads as deliberate rather than as a stretched
 * mobile layout. Follows the house pattern from the dashboard's public creator
 * page (`src/routes/p.$slug.tsx`): rounding and shadow are `sm:`-gated so a
 * real handset never shows a double bezel.
 */
export function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh w-full bg-obsidian sm:grid sm:place-items-center sm:py-10">
      {/* Ambient alpine glow — desktop only */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 hidden sm:block"
        style={{
          background:
            "radial-gradient(120% 80% at 50% -10%, oklch(0.28 0.03 250 / 55%) 0%, transparent 60%)," +
            "radial-gradient(80% 60% at 80% 110%, oklch(0.30 0.05 80 / 22%) 0%, transparent 65%)",
        }}
      />

      {/* Brand lockup beside the device on wide screens */}
      <div className="pointer-events-none fixed left-[8%] top-1/2 hidden -translate-y-1/2 xl:block">
        <IcefallLockup size="lg" className="items-start" />
        <p className="mt-6 max-w-[15rem] text-[13px] leading-relaxed text-mist-dim">
          The digital ecosystem for outdoor athletes and mountaineers.
        </p>
        <p className="section-label mt-8">Built for those who go further</p>
      </div>

      <div
        className="relative flex h-dvh w-full flex-col overflow-hidden bg-obsidian sm:h-[884px] sm:w-[430px] sm:rounded-[42px] sm:border sm:border-hairline-strong sm:shadow-[var(--ice-shadow-shell)]"
        data-phone-shell
      >
        {/* Shows on every screen, including the live tracker — the one place
            you need to know that recording survives a lost signal. */}
        <OfflineIndicator />
        {/*
          The offline banner takes the top edge of the frame on every screen.
          It is in normal flow — a flex child, not an overlay — so it displaces
          content rather than sitting on top of a screen's own header, and the
          unchanged branch below renders `children` exactly as before so an
          ordinary build's DOM is untouched.
        */}
        {/*
          THE DEMO BANNER IS OFF — owner's instruction, 2026-09-04: "remove demo
          as well. no one is seeing it so need to know how it looks."

          TO PUT IT BACK: import `OfflineBanner` from "@/offline/OfflineBanner"
          and `DEMO` from "@/offline/offline", then render
          `{DEMO && <OfflineBanner />}` directly above `children`. The component
          itself is untouched. IF IT COMES BACK, READ THIS FIRST, because it
          took a real handset to find what it broke:

          `OfflineBanner` pads itself by `env(safe-area-inset-top)` and takes the
          top edge — that is why the status bar sat inside the blue strip. But
          every layout and screen underneath ALSO clears that inset, so the
          notch was counted TWICE: ~50px of dead space between the banner and
          every screen's title on a phone, and nothing at all in a desktop
          browser, where `env()` resolves to 0. It was invisible in every check
          that was not a phone. The fix, if the banner returns, is to wrap
          `children` in a div carrying `--screen-safe-top: 0px`, because
          `Screen` and the layouts all read `var(--screen-safe-top, env(...))` —
          the banner has already cleared the notch, so nothing below it should.

          WHAT THE APP LOSES WHILE IT IS OFF, stated plainly: the one persistent,
          screen-independent label saying the data is sample data. The per-screen
          honesty lines remain — "sample listings", the network-not-connected
          notices, the em dashes for unmeasured figures — but a person landing
          mid-app no longer has a standing marker. That is a fine trade for a
          link the owner is reviewing alone, and a poor one for a link shared
          with somebody who might take a figure at face value.
        */}
        {children}
      </div>
    </div>
  );
}
