import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The like, and the small moment it deserves.
 *
 * ── WHAT THE NUMBER MEANS ────────────────────────────────────────────────────
 *
 * This control renders the count it is GIVEN and reports the tap. It never
 * invents a figure, never rounds one up, and never animates a number it was not
 * handed. `count` is the caller's settled total; the only movement this
 * component adds is ±1 for the reader's own tap, held for the moment between
 * the tap and the caller confirming it — and "you liked this" is a fact the app
 * can stand behind even with no likes table behind it yet (see the note in
 * `@/social/types`). A count of zero prints nothing rather than a `0`, because
 * a caller with no count passes `0` and a printed zero would read as a measured
 * result rather than an unasked question.
 *
 * ── OPTIMISTIC, AND WHERE THAT STOPS ─────────────────────────────────────────
 *
 * The tap lands instantly: the mark flips locally, `onToggle(next)` goes out,
 * and the local guess is dropped the moment `liked` changes — whether that
 * change confirms the guess or reverts it. What this cannot see is a caller
 * that rejects a write by leaving `liked` exactly as it was; there is no
 * timeout here that would guess at one, so THE CALLER OWNS THE SETTLED VALUE.
 * That is the contract: pass back what is true, including when the write
 * failed.
 *
 * ── MOTION ───────────────────────────────────────────────────────────────────
 *
 * The mark springs, the fill blooms out of its centre, one azure ring opens and
 * fades. One ring, not a shower — the same restraint as `SaveControl`, whose
 * gesture this is deliberately a lighter cousin of (its `Burst` is private to
 * that file, so this is not a copy that drifted; it is a smaller sibling).
 * Unliking gets a short dip and no ring: undoing something is not a celebration.
 *
 * Under `prefers-reduced-motion` every part of it is skipped — no spring, no
 * ring, no travelling digit — and the control simply changes state.
 */

const SPRING = { type: "spring" as const, stiffness: 520, damping: 16, mass: 0.6 };
const EASE = [0.22, 1, 0.36, 1] as const;

/** How long the ring is on screen. Matches the animation it wraps. */
const RING_MS = 620;

export function LikeButton({
  postId,
  liked,
  count,
  onToggle,
  className,
}: {
  /** Identifies the row. A recycled card must not inherit the last row's guess. */
  postId: string;
  liked: boolean;
  count: number;
  onToggle: (next: boolean) => void;
  className?: string;
}) {
  const still = useReducedMotion();

  /** The tap's prediction, alive only until `liked` settles. `null` = trust props. */
  const [guess, setGuess] = useState<boolean | null>(null);
  /** Counts taps rather than state, so an already-liked card does not pop on mount. */
  const [taps, setTaps] = useState(0);
  /**
   * `null` = no ring. A NUMBER rather than a boolean so a second like inside
   * the first ring's lifetime gets its own ring: keeping a flag meant the
   * re-tap set `true` over `true`, `AnimatePresence` saw no change, and the
   * gesture that most wants feedback — the impatient one — got none.
   */
  const [ring, setRing] = useState<number | null>(null);
  const ringTimer = useRef<number | null>(null);

  // The caller has spoken — confirmed the guess or reverted it — so the guess
  // is finished either way. Also fires when the card is recycled onto a new row.
  useEffect(() => {
    setGuess(null);
  }, [postId, liked]);

  useEffect(
    () => () => {
      if (ringTimer.current !== null) window.clearTimeout(ringTimer.current);
    },
    [],
  );

  const shown = guess ?? liked;
  // Exactly one like moves this figure: the reader's own, for as long as the
  // caller has not caught up with it.
  const total = Math.max(0, count + (shown === liked ? 0 : shown ? 1 : -1));

  const press = () => {
    const next = !shown;
    setGuess(next);
    setTaps((t) => t + 1);
    onToggle(next);

    if (!next || still) return;
    setRing((r) => (r ?? 0) + 1);
    if (ringTimer.current !== null) window.clearTimeout(ringTimer.current);
    ringTimer.current = window.setTimeout(() => setRing(null), RING_MS);
  };

  return (
    <button
      type="button"
      onClick={press}
      aria-pressed={shown}
      aria-label={total > 0 ? `Like, ${total}` : "Like"}
      className={cn(
        "group flex items-center gap-1.5 text-[12.5px] transition-colors",
        shown ? "text-azure" : "text-mist hover:text-snow",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite rounded-pill",
        className,
      )}
    >
      <span className="relative grid h-[15px] w-[15px] place-items-center">
        {/* The ring lives outside the 15px box and must not push the row around. */}
        <AnimatePresence>
          {ring !== null && (
            <motion.span
              key={ring}
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border border-azure"
              initial={{ width: 8, height: 8, opacity: 0.9, x: "-50%", y: "-50%" }}
              animate={{ width: 34, height: 34, opacity: 0, x: "-50%", y: "-50%" }}
              exit={{ opacity: 0 }}
              transition={{ duration: RING_MS / 1000, ease: EASE }}
            />
          )}
        </AnimatePresence>

        <motion.span
          className="relative grid place-items-center"
          animate={
            still || taps === 0 ? { scale: 1 } : { scale: shown ? [1, 1.32, 0.94, 1] : [1, 0.9, 1] }
          }
          transition={still ? { duration: 0 } : SPRING}
        >
          <Heart size={15} strokeWidth={1.7} aria-hidden />
          {/* The fill is a second heart blooming out of the first's centre, so
              the colour arrives rather than snapping on. */}
          <motion.span
            aria-hidden
            className="absolute inset-0 grid place-items-center"
            initial={false}
            animate={{ opacity: shown ? 1 : 0, scale: shown ? 1 : 0.35 }}
            transition={still ? { duration: 0 } : { duration: 0.24, ease: EASE }}
          >
            <Heart size={15} strokeWidth={1.7} fill="currentColor" />
          </motion.span>
        </motion.span>
      </span>

      {/* A zero is not printed — see the header. */}
      {total > 0 && (
        <span aria-hidden className="tnum relative inline-grid">
          {still ? (
            total
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={total}
                initial={{ y: shown ? 7 : -7, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: shown ? -7 : 7, opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
              >
                {total}
              </motion.span>
            </AnimatePresence>
          )}
        </span>
      )}
    </button>
  );
}
