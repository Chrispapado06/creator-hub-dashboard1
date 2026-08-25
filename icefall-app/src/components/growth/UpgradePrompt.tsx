import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { FEATURES, type FeatureId } from "@/growth/tiers";

/**
 * The upgrade moment.
 *
 * READ THIS BEFORE EDITING. This is the one place in ICEFALL that asks an
 * athlete for money, so the constraints are tighter here than anywhere else and
 * none of them is a style preference:
 *
 *   - INLINE ONLY. No modal, no popup, no interstitial, no bottom sheet, no
 *     "×" that dismisses a thing which then returns tomorrow. A prompt you have
 *     to close is an advert, and it interrupts a person who came here to train.
 *     One quiet block, at the point where the locked feature would have been.
 *   - IT NEVER COVERS WHAT THE ATHLETE HAS ALREADY EARNED. `LockedPreview` may
 *     only wrap a growth surface — a plan that has not been generated for this
 *     tier, an analysis that Pro would add. It must NEVER wrap recorded
 *     activity, history, check-ins, readiness they have already been shown, or
 *     anything else that is theirs. Blurring a person's own training back at
 *     them to sell a subscription is indefensible, and no product argument
 *     changes that.
 *   - NOTHING IS WITHDRAWN. A feature that worked yesterday must not appear
 *     behind this today. `AppState.can()` gates growth surfaces only.
 *   - NO PRESSURE. No countdown, no "offer ends", no scarcity, no urgency
 *     colour. ICEFALL has no payment processor, so a deadline would be pressure
 *     towards something that cannot even happen yet — which is why the prompt
 *     says plainly that nothing is charged before it links anywhere.
 *
 * The gate is `can(featureId)` from AppState, which resolves through
 * `hasFeature` in `@/growth/tiers`. See src/screens/growth/Pricing.tsx for the
 * plans themselves and the commercial disclosure.
 */

/** The overlay copy. Written once so two surfaces cannot drift apart. */
const DEFAULT_TITLE = "Your full preparation plan is ready.";
const DEFAULT_BODY = "Unlock your complete adaptive plan with ICEFALL Pro.";
const CTA_LABEL = "Unlock my plan";

/**
 * Said before the athlete follows the link, not after.
 *
 * ICEFALL takes no payment method and charges nothing — a person deciding
 * whether to tap "unlock" should know that at the moment they decide, rather
 * than discovering it a screen later.
 */
const BILLING_LINE = "Billing is not connected yet — nothing is charged.";

/** Warn about a given id once, not on every render. */
const warned = new Set<string>();

/**
 * Whether this feature should be gated for the athlete right now.
 *
 * Deliberately fails OPEN. Two cases return false — never lock:
 *
 *   1. An id that matches no feature. Almost always a typo, and a typo must not
 *      quietly blur a screen in production.
 *   2. A `comingSoon` feature. It does not exist, so no plan grants it. Blurring
 *      it and offering an upgrade would be selling something that no amount of
 *      money can unlock, which is the definition of a false claim.
 */
function useLocked(featureId: FeatureId): boolean {
  const { can } = useApp();

  const feature = FEATURES.find((f) => f.id === featureId);

  if (!feature) {
    if (import.meta.env.DEV && !warned.has(featureId)) {
      warned.add(featureId);

      console.warn(`[growth] Unknown featureId "${featureId}" — rendering unlocked.`);
    }
    return false;
  }

  if (feature.comingSoon) return false;

  return !can(featureId);
}

/* -------------------------------------------------------------------------- */
/* UpgradePrompt — one quiet line at the point of use                         */
/* -------------------------------------------------------------------------- */

export interface UpgradePromptProps {
  /** A feature id from `@/growth/tiers`. Growth surfaces only — never data. */
  featureId: FeatureId;
  title?: string;
  body?: string;
  className?: string;
}

/**
 * Renders NOTHING when the athlete's tier already includes the feature, so it
 * can sit permanently in a screen without a caller having to check first.
 */
export function UpgradePrompt({
  featureId,
  title = DEFAULT_TITLE,
  body = DEFAULT_BODY,
  className,
}: UpgradePromptProps) {
  const locked = useLocked(featureId);
  if (!locked) return null;

  return (
    <div
      className={cn("rounded-tile border border-hairline bg-elevated/40 p-4", className)}
      // Not a banner and not an alert: it interrupts nothing and announces
      // nothing. It is a note in the flow of the page.
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-azure/30 text-azure/80"
          aria-hidden
        >
          <Lock size={11} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug text-snow">{title}</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{body}</p>
          <Link
            to="/pricing"
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-azure transition-colors hover:text-azure-bright"
          >
            {CTA_LABEL}
            <ArrowRight size={13} strokeWidth={1.8} />
          </Link>
          <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{BILLING_LINE}</p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* LockedPreview — the shape of the thing, without the thing                  */
/* -------------------------------------------------------------------------- */

export interface LockedPreviewProps {
  /** A feature id from `@/growth/tiers`. Growth surfaces only — never data. */
  featureId: FeatureId;
  children: React.ReactNode;
  title?: string;
  body?: string;
}

/**
 * Wraps a growth surface. When the tier includes the feature the children are
 * returned UNTOUCHED — no wrapper element, no blur, no measurable difference —
 * so this can be left in place permanently rather than branched around.
 *
 * When it does not, the children are softened behind a scrim and a quiet panel
 * explains what unlocks them. The children are made `inert` and hidden from
 * assistive technology rather than merely blurred: a control an athlete cannot
 * see but can still tab into and press is worse than no control at all.
 */
export function LockedPreview({
  featureId,
  children,
  title = DEFAULT_TITLE,
  body = DEFAULT_BODY,
}: LockedPreviewProps) {
  const locked = useLocked(featureId);

  // The unlocked path is deliberately not wrapped in a <div>: a growth gate must
  // not change the layout of a screen the moment someone subscribes.
  if (!locked) return <>{children}</>;

  return (
    // A one-cell grid rather than absolute positioning: both layers occupy the
    // same cell, so the block is as tall as the TALLER of the two. Absolute
    // positioning clipped the last line of the notice whenever the preview
    // underneath was shorter than the notice itself — and the line it cut was
    // the one saying nothing is charged.
    <div className="grid overflow-hidden rounded-card">
      <div
        aria-hidden
        inert
        className="pointer-events-none select-none opacity-70 blur-[3px] saturate-[0.85] [grid-area:1/1]"
      >
        {children}
      </div>

      {/* A scrim, not decoration — the same treatment photographs get where they
          meet type in this app. Deliberately light: the athlete should still be
          able to see the SHAPE of what they would get, which is the whole point
          of a preview. It only has to keep the notice readable. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="z-10 flex items-center justify-center bg-gradient-to-t from-obsidian/95 via-obsidian/75 to-obsidian/50 p-5 [grid-area:1/1]"
      >
        <div className="max-w-[280px] text-center">
          <span
            className="mx-auto grid h-7 w-7 place-items-center rounded-full border border-azure/30 text-azure/80"
            aria-hidden
          >
            <Lock size={12} strokeWidth={1.8} />
          </span>
          <p className="mt-3 text-[13px] leading-snug text-snow">{title}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-mist">{body}</p>
          {/* Secondary, not the azure call to action: a screen is allowed one of
              those and it belongs to whatever the athlete came here to do. */}
          <Button asChild variant="secondary" size="sm" className="mt-4">
            <Link to="/pricing">{CTA_LABEL}</Link>
          </Button>
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{BILLING_LINE}</p>
        </div>
      </motion.div>
    </div>
  );
}
