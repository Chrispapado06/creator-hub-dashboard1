import { motion } from "framer-motion";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { IcefallLockup } from "@/components/ui/IcefallMark";
import { useApp } from "@/state/AppState";

/**
 * Screen 01. Deliberately almost empty: photograph, mark, one line.
 * No spinner — the app is ready, so a loading animation would be theatre.
 */
export default function Splash() {
  const navigate = useNavigate();
  const { onboarded } = useApp();
  // Onboarded athletes go straight in; everyone else meets the door first.
  const next = onboarded ? "/home" : "/welcome";

  useEffect(() => {
    const t = setTimeout(() => navigate(next, { replace: true }), 2600);
    return () => clearTimeout(t);
  }, [navigate, next]);

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
