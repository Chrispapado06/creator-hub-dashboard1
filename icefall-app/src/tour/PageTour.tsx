import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Rise } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import { TOURS, useTour, type TourScreen } from "./tours";

/**
 * THE PAGE GUIDE — a screen introducing itself, once, in its own scroll flow.
 *
 * ONE COMPONENT, FIVE USES. The sentences live in `tours.ts` and nothing about
 * the drawing is per screen, so the five cannot drift apart the way five
 * hand-built introductions would.
 *
 * ------------------------------------------------------------------------
 * WHY IT IS NOT A CARD
 * ------------------------------------------------------------------------
 *
 * The owner has objected to boxes three times, most recently in capitals, and
 * a de-boxing pass is running across the app as this ships. So there is no
 * border, no fill and no radius: the guide is separated from the screen by
 * SPACING, one hairline underneath it, and the fact that its type is quieter
 * than the content below. It reads as a note at the top of the page, which is
 * what it is.
 *
 * ------------------------------------------------------------------------
 * WHY IT IS NOT A MODAL
 * ------------------------------------------------------------------------
 *
 * No popups is a standing rule here. Nothing is dimmed, nothing is trapped,
 * the screen underneath stays scrollable and tappable throughout, and an
 * athlete who ignores it entirely loses nothing — the screen's real content is
 * one short block further down than usual and is visible in the same view.
 * Stepping happens IN PLACE: the sentence changes, the page does not move.
 *
 * ------------------------------------------------------------------------
 * IT MUST NOT SHIFT THE PAGE AS IT STEPS
 * ------------------------------------------------------------------------
 *
 * Every sentence is rendered, stacked in one grid cell, with the two that are
 * not current held at `visibility: hidden`. The block is always as tall as the
 * longest of them, so stepping from a two-line point to a four-line one moves
 * nothing below it. Dragging the page up and down under the reader's thumb is
 * the same complaint as a popup wearing different clothes.
 */
export function PageTour({
  screen,
  hold = false,
  className,
}: {
  screen: TourScreen;
  /**
   * Suppress the guide WITHOUT consuming it.
   *
   * Home needs this: `SubscribeSheet` is a full-screen dialog shown once per
   * install on the first Home, and two first-run things at once is neither.
   * The guide waits for the sheet to close and appears afterwards, still
   * unseen. `hold` is not "dismiss" — nothing is written while it is true.
   */
  hold?: boolean;
  className?: string;
}) {
  const tour = TOURS[screen];
  const { open, dismiss } = useTour(screen, hold);
  const [step, setStep] = useState(0);
  const reduce = useReducedMotion();

  if (!open) return null;

  const total = tour.points.length;
  const last = step === total - 1;

  return (
    /*
     * A `Rise`, so the guide arrives with the rest of the screen rather than
     * on top of it. Every screen it mounts on runs a `Stagger`, and this is a
     * direct child of that stagger — a plain wrapper in between is how a row
     * ends up at opacity 0 with no error to find.
     *
     * Returning `null` above rather than rendering an empty box is why the
     * padding lives HERE and not on a wrapper in each screen: once the guide is
     * dismissed there is no element left, and therefore no dead space where it
     * used to be.
     */
    <Rise className={cn("pt-5", className)}>
      <section aria-label="Page guide">
        <div className="flex items-baseline justify-between gap-4">
          <p className="section-label">{tour.label}</p>
          {/* Quiet, tabular, and never the loudest thing in the block: it is a
              position, not a score. */}
          <p className="tnum text-[10px] leading-none tracking-[0.14em] text-mist-dim">
            {step + 1} of {total}
          </p>
        </div>

        {/*
          ALL THREE SENTENCES ARE IN THE DOM, STACKED IN ONE GRID CELL, and only
          the current one is visible. The block is therefore always as tall as
          the LONGEST point, so stepping cannot move the page under the reader's
          thumb — and it is measured by the browser rather than guessed at as a
          `min-h`, so rewriting a sentence cannot quietly reintroduce the jump.

          `invisible` is `visibility: hidden`, which takes the other two out of
          the accessibility tree as well as off the screen; `aria-hidden` says
          the same thing to anything that reads the DOM directly.

          `aria-live="polite"` because Next replaces the sentence in place rather
          than moving focus — without it a screen reader hears the button press
          and nothing else. Polite, not assertive: it is an introduction, and it
          must not interrupt whatever the athlete is already reading.
        */}
        <div aria-live="polite" className="mt-2.5 grid">
          {tour.points.map((sentence, i) => (
            <motion.p
              key={sentence}
              aria-hidden={i !== step}
              initial={false}
              animate={reduce ? { opacity: 1, y: 0 } : { opacity: i === step ? 1 : 0, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "col-start-1 row-start-1 text-[13px] leading-relaxed text-mist",
                i !== step && "invisible",
              )}
            >
              {sentence}
            </motion.p>
          ))}
        </div>

        {/*
          `-mx-2 px-2` on each control and `min-h-[44px]` on the row: the touch
          targets are the full 44px in both directions while the type stays the
          size the rest of the page uses. A 44px BUTTON drawn as a button would
          be a box, which is the thing this component exists not to be.
        */}
        <div className="mt-1 flex items-center gap-6">
          <button
            type="button"
            onClick={() => (last ? dismiss() : setStep((s) => s + 1))}
            className="-mx-2 flex min-h-[44px] items-center px-2 text-[12px] uppercase tracking-[0.1em] text-azure transition-opacity hover:opacity-70"
          >
            {last ? "Done" : "Next"}
          </button>
          {/*
            SKIP IS ALWAYS THERE, INCLUDING ON THE LAST STEP where it does the
            same thing as Done. Removing it on the last step moves the control
            the thumb is already aimed at, which is how somebody dismisses a
            guide by accident and cannot find it again.
          */}
          <button
            type="button"
            onClick={dismiss}
            className="-mx-2 flex min-h-[44px] items-center px-2 text-[12px] uppercase tracking-[0.1em] text-mist transition-colors hover:text-snow"
          >
            Skip
          </button>
        </div>

        {/* The only line in the component. It is what separates the guide from
            the screen, in place of the border this deliberately does not have. */}
        <div className="mt-1 border-t border-hairline" />
      </section>
    </Rise>
  );
}
