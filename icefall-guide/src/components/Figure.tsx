import { Link } from "react-router-dom";
import { fold, type Reading } from "@/domain/honesty";
import { cn } from "@/lib/utils";

/**
 * HOW AN UNMEASURED FIGURE IS DRAWN, and the layout is part of the argument.
 *
 * The sentence explaining an absence takes THE SPACE THE NUMBER WOULD HAVE HAD.
 * It is not a tooltip, not a footnote under a dash, and not a greyed-out zero.
 * A reader scanning tiles reads position before they read content, so an absence
 * hidden in a smaller slot than the numbers beside it reads as a small number.
 *
 * And it never truncates. House rule: when a label does not fit its cell, the
 * label gets shorter — the cell does not get an ellipsis. These sentences are
 * exact claims about what ICEFALL does and does not know, and half of one is a
 * different claim. `StatTile` widens to the full row rather than clipping.
 */

export function Figure<T>({
  reading,
  format,
  size = "lg",
}: {
  reading: Reading<T>;
  format: (v: T) => string;
  size?: "lg" | "md";
}) {
  return fold(
    reading,
    (v) => (
      <span
        className={cn(
          "tnum font-light leading-none tracking-[-0.02em] text-snow",
          size === "lg" ? "text-[26px]" : "text-[19px]",
        )}
      >
        {format(v)}
      </span>
    ),
    (reason) => (
      <span className="block text-[11.5px] leading-relaxed text-mist-dim">{reason}</span>
    ),
  );
}

/**
 * One figure in a row of them.
 *
 * `wideWhenUnavailable` is on by default: a tile carrying a sentence claims the
 * whole row so the sentence can breathe, and the measured tiles beside it keep
 * their own width. The alternative — a fixed three-across grid — would force
 * either a clipped sentence or a paragraph set at nine characters wide.
 */
export function StatTile<T>({
  label,
  reading,
  format,
  footnote,
  href,
  alert,
  wideWhenUnavailable = true,
}: {
  label: string;
  reading: Reading<T>;
  format: (v: T) => string;
  footnote?: string;
  href?: string;
  /** Draws attention without asserting anything — used where a client is waiting. */
  alert?: boolean;
  wideWhenUnavailable?: boolean;
}) {
  const body = (
    <>
      <p className="section-label">{label}</p>
      <div className="mt-2.5 min-h-[30px]">
        {alert && reading.available ? (
          <span className="tnum text-[26px] font-light leading-none tracking-[-0.02em] text-alert">
            {format(reading.value)}
          </span>
        ) : (
          <Figure reading={reading} format={format} />
        )}
      </div>
      {footnote && (
        <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">{footnote}</p>
      )}
    </>
  );

  const cls = cn(
    "block rounded-tile border border-hairline bg-graphite px-3.5 py-3.5",
    !reading.available && wideWhenUnavailable && "col-span-full",
  );

  return href ? (
    <Link to={href} className={cn(cls, "transition-colors hover:border-hairline-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * A plain statement of provenance, set apart from the figures it describes.
 *
 * Deliberately NOT a warning tone. It is not an alert — nothing is wrong and
 * there is nothing for the guide to do about it. A caution styling here would be
 * a false alarm, and a false alarm teaches people to stop reading the real ones.
 */
export function Provenance({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
      {children}
    </p>
  );
}
