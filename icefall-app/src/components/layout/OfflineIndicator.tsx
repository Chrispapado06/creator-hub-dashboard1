import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff } from "lucide-react";
import { useOnline } from "@/lib/useOnline";
import { activeSessionSummary } from "@/tracking/activeSession";

/**
 * The offline pill.
 *
 * Mounted in the phone shell, so it appears on every screen including the live
 * tracker. It exists to answer the only question that matters when the signal
 * drops mid-climb: "is it still recording?" — because GPS is a satellite fix,
 * not a network request, and the answer is yes.
 *
 * Deliberately quiet: no red alert bar, no modal, nothing to dismiss. Losing
 * signal on a mountain is the expected condition, not an error.
 */
export function OfflineIndicator() {
  const online = useOnline();
  const [recording, setRecording] = useState(false);

  // Re-checked when connectivity flips rather than polled — the pill only ever
  // renders on that transition.
  useEffect(() => {
    if (online) return;
    const s = activeSessionSummary();
    setRecording(Boolean(s));
  }, [online]);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-x-0 z-50 flex justify-center px-5"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
          role="status"
        >
          <span className="flex items-center gap-2 rounded-full border border-hairline-strong bg-elevated/95 py-1.5 pl-3 pr-3.5 shadow-[var(--ice-shadow-chip)] backdrop-blur">
            <CloudOff size={13} strokeWidth={1.7} className="shrink-0 text-mist" />
            <span className="text-[11.5px] leading-none text-mist">
              Offline{recording ? " — still recording" : ""}
            </span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
