import { motion, useReducedMotion } from "framer-motion";

/**
 * A line of text with a highlight sweeping across it, left to right, for as
 * long as it is mounted.
 *
 * WHAT IT IS FOR: saying that something is happening which has no progress to
 * report. The coach's reply is the case it was built for — a model is composing
 * an answer, there is no percentage to show and no way to know how long it will
 * take, and a spinner claims neither. A sweep says "still working" and stops
 * when the work stops, which is the whole of what is actually known.
 *
 * BE CAREFUL WHAT YOU MOUNT IT FOR. It is only strictly honest while it is up
 * for exactly as long as the work runs. Mount it on a timer, or hold it after
 * the answer has arrived, and it asserts the app is busy when it is not.
 *
 * `CoachChat` DOES hold it, for 5-10 seconds, AT THE OWNER'S EXPLICIT
 * INSTRUCTION — asked for twice, after the objection above was put to them in
 * those words. That is a decision, not a bug, and the reasoning is written at
 * the call site. Do not copy the pattern to a new caller on the strength of it
 * existing there; the default for anything new is still "up for as long as the
 * work runs, and no longer".
 *
 * ── WHY IT LOOKS LIKE THIS ───────────────────────────────────────────────────
 *
 * The technique is a gradient painted onto the TEXT rather than the box —
 * `bg-clip-text` with a transparent foreground — and then the background
 * position is animated. Nothing moves in the layout, so it cannot reflow the
 * message list it sits under, and there is no second element to keep in sync.
 *
 * THE COLOURS ARE THE APP'S OWN TOKENS, NOT THE ONES THIS PATTERN IS USUALLY
 * WRITTEN WITH. The version this came from sweeps #404040 to #fff, a neutral
 * grey on black. Every surface in ICEFALL carries a blue cast — the greys are
 * hue 259-264 — so a neutral sweep reads as a foreign element sitting on top of
 * the app rather than part of it. `--ice-mist-dim` is the tertiary text colour
 * this line would be if it were static, and `--ice-snow` is the primary, so the
 * sweep is the text brightening to full strength and falling back rather than
 * an effect in a colour the app does not otherwise use.
 *
 * REDUCED MOTION IS HONOURED HERE RATHER THAN LEFT TO THE STYLESHEET. The
 * global `prefers-reduced-motion` rule in `index.css` neutralises CSS
 * animation, but this is a JS-driven framer-motion value and that rule cannot
 * reach it. Somebody who has asked their device for less movement gets the same
 * words, held still, at the brighter of the two colours so it does not read as
 * disabled text.
 */
export function ShiningText({ text, className = "" }: { text: string; className?: string }) {
  const reduceMotion = useReducedMotion();

  /*
   * `aria-live="polite"` rather than "assertive": a screen reader should
   * mention this when it reaches a natural pause, not interrupt what it is
   * already reading. The sweep itself is decorative and carries no information
   * the words do not, which is why there is nothing else to announce.
   */
  if (reduceMotion) {
    return (
      <p aria-live="polite" className={`text-base font-normal text-mist ${className}`}>
        {text}
      </p>
    );
  }

  return (
    <motion.p
      aria-live="polite"
      className={
        "bg-[linear-gradient(110deg,var(--ice-mist-dim),35%,var(--ice-snow),50%,var(--ice-mist-dim),75%,var(--ice-mist-dim))] " +
        "bg-[length:200%_100%] bg-clip-text text-base font-normal text-transparent " +
        className
      }
      initial={{ backgroundPosition: "200% 0" }}
      animate={{ backgroundPosition: "-200% 0" }}
      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
    >
      {text}
    </motion.p>
  );
}
