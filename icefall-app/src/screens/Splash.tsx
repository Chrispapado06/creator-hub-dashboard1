import { motion } from "framer-motion";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { IcefallLockup } from "@/components/ui/IcefallMark";
import { useApp } from "@/state/AppState";
import { useSessionState } from "@/auth/session";
import { APP_RELEASED } from "@/auth/release";
import { DEMO } from "@/offline/offline";

/**
 * Screen 01. Deliberately almost empty: photograph, mark, one line.
 * No spinner — the app is ready, so a loading animation would be theatre.
 *
 * WHY THIS READS THE SESSION NOW, ADDED 12 September 2026. `Holding.tsx`
 * tells a held account it can "close it and come back after launch" instead
 * of leaving the tab open. Closing a PWA doesn't resume the old page, though
 * — it re-mounts fresh, right here. Before this fix, `next` was decided from
 * ONLY the local `onboarded` flag, so a held account (onboarded is false by
 * definition) always landed on `/welcome` — a marketing sign-in screen with
 * no idea an account exists — never back on the holding screen, and never
 * automatically forward once released. That made the screen's own "come
 * back after launch" instruction quietly false. `useSessionState()` is the
 * same zero-network-cost local read `OnboardingGate`/`HoldingGate` already
 * use (Supabase restores it from storage, not the network), so this keeps
 * the "almost empty, no spinner" feel — it only changes which door a held
 * account is pointed at.
 */
export default function Splash() {
  const navigate = useNavigate();
  const { onboarded } = useApp();
  const session = useSessionState();

  // SAME FORMULA as `OnboardingGate`/`HoldingGate` — kept identical on
  // purpose so all three can never disagree about who is still held.
  const stillHeld = !DEMO && !onboarded && !APP_RELEASED && session !== null && session !== undefined;
  const hasSession = session !== null && session !== undefined;
  // Onboarded athletes go straight in. A held account goes back to the
  // holding screen. A session that exists but is neither onboarded nor still
  // held (released, but this device never got to /onboarding yet — e.g. it
  // was closed the moment release happened) goes straight to onboarding
  // rather than /welcome, which would otherwise show a signed-in person a
  // "Create account / Sign in" screen. Only a genuinely absent session meets
  // the door.
  const next = onboarded ? "/home" : stillHeld ? "/auth/holding" : hasSession ? "/onboarding" : "/welcome";

  useEffect(() => {
    // Wait for the local session read to resolve before scheduling the
    // redirect — same reasoning as `OnboardingGate`'s `session === undefined`
    // check: deciding one beat too early is exactly the bug this fixes.
    if (!DEMO && session === undefined) return;
    const t = setTimeout(() => navigate(next, { replace: true }), 2600);
    return () => clearTimeout(t);
  }, [navigate, next, session]);

  return (
    <button
      type="button"
      onClick={() => navigate(next, { replace: true })}
      className="grain relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-obsidian text-left"
      aria-label="Enter ICEFALL"
    >
      <motion.img
        src="/img/splash.jpg"
        alt=""
        initial={{ scale: 1.08, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 2.4, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 scrim-full" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <IcefallLockup size="lg" />
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.4 }}
        className="section-label absolute bottom-24 px-10 text-center leading-[1.9] text-mist"
      >
        Built for those
        <br />
        who go further.
      </motion.p>
    </button>
  );
}
