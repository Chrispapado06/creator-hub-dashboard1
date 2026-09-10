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
/**
 * THE ONE PIECE OF MARKDOWN THIS APP RENDERS: `**bold**`, and only that.
 *
 * The coach is asked, in the house rules on the server, to put double asterisks
 * around the ACTION and nothing else — "**add vertical**", "**skip the long
 * day**". Rendering it costs nothing at the model: a bold pair is a couple of
 * output tokens, and the instruction lives in the system block, which is sent
 * with `cache_control: ephemeral` and therefore read at about a tenth of the
 * input rate.
 *
 * NO MARKDOWN LIBRARY, AND NO WIDER SUBSET. A parser that also does headings,
 * lists, links and code is a parser that will one day render a heading in the
 * middle of a chat bubble because the model felt like it — and it is a
 * dependency, and it is an HTML-injection surface. This splits on `**` and
 * alternates. Anything it does not understand stays as literal text, which is
 * the safe direction: a stray asterisk is ugly, a swallowed sentence is not.
 *
 * An unclosed `**` leaves an odd number of pieces, so the final piece lands on
 * an even index and renders plain. That is deliberate — a half-written bold
 * marker should not turn the rest of the answer bold.
 */
export function parseBold(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/\*\*/)
    /*
     * STRAY SINGLE ASTERISKS ARE STRIPPED, NOT RENDERED.
     *
     * The house rules tell the model bold is the only formatting available and
     * to use no italics — and on the very first test it emitted *volume* and
     * *consistency* anyway. A prompt is guidance, not a guarantee, so the
     * renderer refuses the input rather than trusting the instruction: any
     * asterisk left after the `**` split is markup the model was asked not to
     * write, and showing it raw puts punctuation in the athlete's face that
     * nobody intended.
     *
     * Safe here in a way it would not be generally: this renders COACH OUTPUT
     * only. Nothing an athlete types passes through it.
     */
    .map((piece, i) => ({ text: piece.replace(/\*/g, ""), bold: i % 2 === 1 }))
    .filter((p) => p.text !== "");
}

export function WordReveal({
  text,
  className,
  /**
   * False renders the finished text — same bold, no animation. Every coach
   * message except the one that just arrived takes this path, and without it
   * they would print their `**` markers as literal asterisks.
   */
  animate = true,
  /** Seconds between one word and the next. */
  stagger = 0.045,
  /** Seconds each word takes to arrive. */
  duration = 0.38,
}: {
  text: string;
  className?: string;
  animate?: boolean;
  stagger?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();

  /*
   * Split into words AND the whitespace between them, keeping both. The capture
   * group is what makes `split` return the separators as well as the pieces —
   * without it every newline in the reply is silently eaten.
   */
  const segments = useMemo(() => parseBold(text), [text]);

  /*
   * Flattened to words ACROSS the segments, not within each one, so the stagger
   * is one continuous count over the whole answer. Splitting per segment would
   * restart the delay at every bold phrase and the reveal would stutter, then
   * race, then stutter again.
   */
  const tokens = useMemo(
    () => segments.flatMap((seg) => seg.text.split(/(\s+)/).map((t) => ({ t, bold: seg.bold }))),
    [segments],
  );

  /*
   * REDUCED MOTION GETS THE SENTENCE, NOT A FASTER SENTENCE. Somebody who has
   * asked their phone to stop animating things is not asking for a brisker
   * version of the animation; a staggered reveal at any speed is the thing they
   * switched off. So the text is simply there.
   */
  if (reduce || !animate) {
    return (
      <span className={className}>
        {segments.map((seg, i) =>
          seg.bold ? (
            <strong key={i} className="font-semibold text-snow">
              {seg.text}
            </strong>
          ) : (
            <Fragment key={i}>{seg.text}</Fragment>
          ),
        )}
      </span>
    );
  }

  let wordIndex = -1;

  return (
    <span className={className}>
      {tokens.map(({ t: token, bold }, i) => {
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
            className={bold ? "inline-block font-semibold text-snow" : "inline-block"}
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
