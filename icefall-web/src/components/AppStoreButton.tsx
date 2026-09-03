import { Apple } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Coming to the App Store", and the reason it does not say "Download".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THERE IS NO APP STORE LISTING. This is not a missing URL somebody can fill in
 * later — the app does not exist as a native binary. `icefall-app` is a Vite
 * PWA with no Capacitor config and no `ios/` directory, and two places in that
 * codebase already say so outright:
 *
 *   lib/install.ts:6      "ICEFALL is a PWA. There is no App Store listing and
 *                          no Play listing"
 *   Onboarding.tsx:549    "The App Store — this is a web build. There is no
 *                          listing, so nobody…"
 *
 * The component this was adapted from is a "Download on the App Store" button.
 * Shipping that wording on a public pre-launch page would be a promise of a
 * thing that does not exist, on the first surface a stranger sees — and it would
 * be discovered by the person tapping it, which is the worst way to find out.
 *
 * So this states a future, which is TRUE, and is deliberately not a link. When a
 * listing exists, `href` arrives, the label becomes "Download on the", and this
 * comment is what tells the next person that the change is now honest rather
 * than that it always was.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY IT IS NOT BUILT ON THE SHADCN BUTTON THE COMPONENT SHIPPED WITH.
 * `components/ui.tsx` already exports this app's Button, with the four variants
 * this project converged on across the phone app and the web (primary /
 * secondary / ghost / danger). The vendored one brings a fifth vocabulary
 * (default / destructive / outline / link) plus four dependencies, and two
 * button components with different variant names is how a design system quietly
 * forks. The layout is the part worth taking; the button underneath is not.
 */

export function AppStoreButton({ className }: { className?: string }) {
  return (
    <div
      /* NOT a <button> and NOT an <a>. It does nothing, so it must not look
         like it does: a disabled button still invites a tap and still reports
         itself as a control to a screen reader. This is a statement of fact
         sitting in a row of controls, and it is marked as such. */
      role="note"
      className={cn(
        "inline-flex h-11 items-center gap-2.5 rounded-tile border border-hairline",
        "bg-white/[0.03] px-4 text-mist",
        className,
      )}
    >
      <Apple size={19} strokeWidth={1.5} aria-hidden="true" />
      <span className="flex flex-col items-start justify-center leading-none">
        <span className="text-[10px] tracking-[0.02em] text-mist-dim">Coming to the</span>
        <span className="mt-[3px] text-[15px] font-medium text-snow">App Store</span>
      </span>
    </div>
  );
}

/**
 * The install path that actually works today.
 *
 * ICEFALL is a PWA, so "add to home screen" genuinely puts it on somebody's
 * phone, with an icon, full screen, and working offline — everything the App
 * Store button promises and cannot yet deliver. Placed BESIDE the coming-soon
 * note rather than instead of it: the note manages the expectation, this does
 * the job.
 *
 * The wording is lifted from the phone app's own `IOS_INSTALL_STEPS` rather
 * than rewritten, so the two surfaces cannot describe the same three taps
 * differently.
 */
export function AddToHomeScreenNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11.5px] leading-[1.6] text-mist-dim", className)}>
      Works on your phone today — open this page in Safari, tap Share, then{" "}
      <span className="text-mist">Add to Home Screen</span>. It opens like an app and works
      without a signal.
    </p>
  );
}
