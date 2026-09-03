import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The header call to action — a pill whose filled circle expands across it.
 *
 * Adapted from a 21st.dev component. What was kept is the MOTION, which is the
 * only part that was ever the point: a circle at the left grows to fill the
 * pill on hover, the arrow slides a few pixels, and the label crosses from ink
 * to ground as the fill passes under it.
 *
 * ── WHAT WAS CHANGED, AND WHY EACH ────────────────────────────────────────
 *
 * IT DEFINED ITS OWN `cn` WITH clsx + twMerge. This app's `cn` is the narrow
 * join-the-truthy-strings kind that every other component here uses, and
 * introducing conflict-merging would change how existing conflicting classes
 * resolve on every surface in the app — to ship one button. Uses the app's.
 *
 * ITS COLOURS WERE SHADCN'S (`bg-primary`, `text-foreground`, `bg-background`).
 * This app has no such tokens; it has azure, snow and obsidian. A component
 * pasted in with a foreign vocabulary either renders unstyled or quietly
 * introduces a second palette.
 *
 * IT ASKED FOR `font-manrope`, WHICH THIS SITE DOES NOT LOAD. A missing family
 * falls back silently, so the button would have looked almost right and been
 * set in the wrong face. Dropped; it inherits.
 *
 * IT WAS A `<button>` WITH NO BEHAVIOUR. A control that does nothing is the
 * thing this project keeps finding shipped, so `onClick` is REQUIRED here — you
 * cannot render it without saying what it does.
 *
 * `w-50` was also not a real Tailwind class (there is no 50 in the spacing
 * scale). Replaced with a real width.
 */
export function MotionButton({
  label,
  onClick,
  className,
}: {
  label: string;
  /** Required. There is no such thing as a decorative call to action. */
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative h-14 w-[206px] cursor-pointer rounded-full border-0 bg-transparent p-1 outline-none",
        "focus-visible:ring-2 focus-visible:ring-azure/60 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian",
        className,
      )}
    >
      {/* The fill. `motion-reduce:` on the transition rather than on the layout,
          so somebody who has asked for less motion still gets the hover state —
          it simply arrives at once instead of sweeping. */}
      <span
        aria-hidden="true"
        className={cn(
          "block h-12 w-12 rounded-full bg-azure",
          "transition-[width] duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:w-full",
          "motion-reduce:transition-none",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-[22px] top-1/2 -translate-y-1/2 text-obsidian",
          "transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-x-1",
          "motion-reduce:transition-none",
        )}
      >
        <ArrowRight size={20} strokeWidth={2} />
      </span>
      {/* Sits above the fill and inverts as it passes underneath. `ml-4` offsets
          the label past the resting circle so it reads centred in the pill
          rather than centred in the button. */}
      <span
        className={cn(
          "absolute left-1/2 top-1/2 ml-4 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap",
          "text-[15px] font-medium tracking-[-0.01em] text-snow",
          "transition-colors duration-500 group-hover:text-obsidian",
          "motion-reduce:transition-none",
        )}
      >
        {label}
      </span>
    </button>
  );
}
