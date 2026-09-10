import { Fragment, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * A SENTENCE THAT ARRIVES A WORD AT A TIME.
 *
 * The owner, 2026-09-11, with a reference clip: "I want you to make the ai when
 * it gives out the anwser to be like this word to word spawning in an
 * animation".
 *
 * ── WHY THIS IS NOT THE COMPONENT THEY PASTED ────────────────────────────────
 *
 * The reference was a shadcn component built on
 * `@/components/ui/text-generate-effect` and styled with `bg-card`,
 * `border-border` and `text-muted-foreground`. None of that exists here: there
 * is no `components.json`, no shadcn registry, that dependency is not
 * installed, and a grep for those three tokens in `index.css` returns zero.
 * Pasting it would have added an import that cannot resolve and three colours
 * that resolve to nothing — and it would have wrapped the reply in a bordered
 * card, which is the one thing the owner has objected to three times.
 *
 * So this is the same EFFECT written in the stack already here: framer-motion,
 * which the tab bar and every screen transition already use.
 *
 * ── WHAT IT ANIMATES, AND WHAT IT DELIBERATELY DOES NOT ──────────────────────
 *
 * WHITESPACE IS PRESERVED, NOT COLLAPSED. The coach's replies carry real line
 * breaks and the bubble renders them under `whitespace-pre-line`. A naive
 * `split(" ")` throws those away and turns a three-paragraph answer into one
 * run-on sentence. The split below keeps every whitespace run as its own token
 * and re-emits it verbatim, so the shape of the answer survives the animation.
 *
 * ONLY THE WORDS MOVE, NOT THE BLOCK. Each word carries its own small blur and
 * lift; the container does nothing. Animating the block as well reads as a card
 * sliding in with blurry text on it, which is a different and worse effect.
 *
 * ── IT IS A PRESENTATION, AND IT IS NOT PRETENDING TO BE A STREAM ────────────
 *
 * Worth being plain about, because this app is careful about this sort of
 * thing: the text is already complete before the first word appears. Nothing
 * here streams, and this must never be dressed up as the coach "thinking" or
 * "typing" — it is a reveal of an answer that is already written. If a
 * streaming endpoint is ever wired up this component is the right shape to
 * receive it, but nothing here implies one exists.
 */
export function WordReveal({
  text,
  className,
  /** Seconds between one word and the next. */
  stagger = 0.045,
  /** Seconds each word takes to arrive. */
  duration = 0.38,
}: {
  text: string;
  className?: string;
  stagger?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();

  /*
   * Split into words AND the whitespace between them, keeping both. The capture
   * group is what makes `split` return the separators as well as the pieces —
   * without it every newline in the reply is silently eaten.
   */
  const tokens = useMemo(() => text.split(/(\s+)/), [text]);

  /*
   * REDUCED MOTION GETS THE SENTENCE, NOT A FASTER SENTENCE. Somebody who has
   * asked their phone to stop animating things is not asking for a brisker
   * version of the animation; a staggered reveal at any speed is the thing they
   * switched off. So the text is simply there.
   */
  if (reduce) return <span className={className}>{text}</span>;

  let wordIndex = -1;

  return (
    <span className={className}>
      {tokens.map((token, i) => {
        /* Whitespace is re-emitted exactly as found, unanimated: it carries the
           line breaks, and a blurred newline is not a thing. */
        if (token === "") return null;
        if (/^\s+$/.test(token)) return <Fragment key={i}>{token}</Fragment>;

        wordIndex += 1;
        return (
          <motion.span
            key={i}
            /* `inline-block` so the transform has a box to act on — a plain
               inline span ignores `y` entirely. */
            className="inline-block"
            initial={{ opacity: 0, filter: "blur(6px)", y: 4 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            transition={{
              duration,
              delay: wordIndex * stagger,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {token}
          </motion.span>
        );
      })}
    </span>
  );
}
