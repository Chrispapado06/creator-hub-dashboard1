import { IcefallLockup } from "@/components/ui/IcefallMark";

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
        <p className="section-label mt-3 text-azure">Guide</p>
        <p className="mt-6 max-w-[15rem] text-[13px] leading-relaxed text-mist-dim">
          Run your season — your dates, your clients, your qualifications.
        </p>
        <p className="section-label mt-8">For the people who lead</p>
      </div>

      <div
        className="relative flex h-dvh w-full flex-col overflow-hidden bg-obsidian sm:h-[884px] sm:w-[430px] sm:rounded-[42px] sm:border sm:border-hairline-strong sm:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]"
        data-phone-shell
      >
        {children}
      </div>
    </div>
  );
}
