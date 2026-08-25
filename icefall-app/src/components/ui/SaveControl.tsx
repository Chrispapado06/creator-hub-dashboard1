import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bookmark, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Saving something, with a moment.
 *
 * Saving is the one thing an athlete does on a route page that has a
 * consequence — it is what puts a line into their objectives and their plan —
 * and it was landing with no more feedback than an icon quietly filling in.
 *
 * The gesture: the mark springs, a single azure ring opens out of it and fades,
 * and a short confirmation rises from the bottom. One ring, not a shower of
 * particles; this is a brand that trims rather than adds.
 *
 * Under `prefers-reduced-motion` every part of it is skipped and the control
 * simply changes state — the ring never draws, the spring becomes a cut, and
 * the confirmation appears without travelling.
 */

const SPRING = { type: "spring" as const, stiffness: 520, damping: 16, mass: 0.6 };

/** The expanding ring. Rendered only for the instant it is animating. */
function Burst({ show, size = 44 }: { show: boolean; size?: number }) {
  const still = useReducedMotion();
  if (still) return null;
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border border-azure"
          initial={{ width: size * 0.4, height: size * 0.4, opacity: 0.9, x: "-50%", y: "-50%" }}
          animate={{ width: size * 2.1, height: size * 2.1, opacity: 0, x: "-50%", y: "-50%" }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </AnimatePresence>
  );
}

/** The mark itself: springs on the way in, settles on the way out. */
function Mark({ saved, size = 15 }: { saved: boolean; size?: number }) {
  const still = useReducedMotion();
  return (
    <motion.span
      className="relative grid place-items-center"
      animate={still ? {} : { scale: saved ? [1, 1.35, 1] : [1, 0.88, 1] }}
      transition={still ? { duration: 0 } : SPRING}
    >
      <Bookmark size={size} strokeWidth={1.8} fill={saved ? "currentColor" : "none"} />
    </motion.span>
  );
}

/* -------------------------------------------------------------------------- */
/* The confirmation                                                           */
/* -------------------------------------------------------------------------- */

export function SavedToast({
  show,
  label = "Saved",
  detail,
}: {
  show: boolean;
  label?: string;
  detail?: string;
}) {
  const still = useReducedMotion();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={still ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
          animate={still ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={still ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-5"
          style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px) + var(--tabbar-h, 0px))" }}
        >
          <div className="flex items-center gap-2.5 rounded-pill border border-azure/40 bg-graphite/95 px-4 py-2.5 shadow-lg backdrop-blur">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-azure text-obsidian">
              <Check size={12} strokeWidth={2.6} />
            </span>
            <span className="text-[12.5px] text-snow">{label}</span>
            {detail && <span className="text-[11px] text-mist-dim">{detail}</span>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Fires `true` for a moment after `saved` turns on, so a burst and a toast can
 * be shown once per save rather than for as long as the thing stays saved.
 */
export function useSaveFlash(saved: boolean, ms = 1600) {
  const [flash, setFlash] = useState(false);
  const [was, setWas] = useState(saved);

  useEffect(() => {
    if (saved === was) return;
    setWas(saved);
    if (!saved) return; // unsaving is not a celebration
    setFlash(true);
    const t = setTimeout(() => setFlash(false), ms);
    return () => clearTimeout(t);
  }, [saved, was, ms]);

  return flash;
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

/** The wide button in a pinned bar. */
export function SaveButton({
  saved,
  onToggle,
  label = "Save",
  savedLabel = "Saved",
  variant = "primary",
  className,
}: {
  saved: boolean;
  onToggle: () => void;
  label?: string;
  savedLabel?: string;
  /** `secondary` where the bar already has a primary action beside it. */
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const flash = useSaveFlash(saved);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      className={cn(
        "relative flex h-11 items-center justify-center gap-2 overflow-visible rounded-pill px-5 text-[13.5px] transition-colors",
        saved
          ? "border border-azure/50 bg-azure/[0.12] text-azure"
          : variant === "secondary"
            ? "border border-hairline-strong text-snow hover:border-azure/50"
            : "bg-azure text-obsidian hover:bg-azure-bright",
        className,
      )}
    >
      <Burst show={flash} size={44} />
      <span className="relative">{saved ? savedLabel : label}</span>
      <span className="relative">
        <Mark saved={saved} />
      </span>
    </button>
  );
}

/** The icon in an action row. */
export function SaveAction({
  saved,
  onToggle,
  className,
}: {
  saved: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const flash = useSaveFlash(saved);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      className={cn(
        "relative flex flex-col items-center gap-1.5 px-4 transition-colors",
        saved ? "text-azure" : "text-mist hover:text-snow",
        className,
      )}
    >
      <span className="relative grid h-[19px] w-[19px] place-items-center">
        <Burst show={flash} size={30} />
        <Mark saved={saved} size={19} />
      </span>
      <span className="text-[10.5px]">{saved ? "Saved" : "Save"}</span>
    </button>
  );
}

/** The small circular one that sits on a hero photograph. */
export function SaveCircle({
  saved,
  onToggle,
  className,
}: {
  saved: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const flash = useSaveFlash(saved);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save"}
      className={cn(
        "relative grid h-9 w-9 place-items-center rounded-full border bg-obsidian/70 backdrop-blur transition-colors",
        saved ? "border-azure/50 text-azure" : "border-hairline-strong text-snow hover:border-azure/50",
        className,
      )}
    >
      <Burst show={flash} size={36} />
      <Mark saved={saved} size={16} />
    </button>
  );
}
