import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { animate, motion, useMotionValue, useMotionValueEvent, type MotionValue } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { tabStripScrollLeft } from "./tabStripScroll";

export { scrollContentToTop } from "./tabStripScroll";

/* -------------------------------------------------------------------------- */
/* Screen — scroll container with safe-area aware padding                     */
/* -------------------------------------------------------------------------- */

export function Screen({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar relative flex-1 overflow-y-auto overscroll-contain",
        padded && "px-5",
        className,
      )}
      /*
       * The notch, counted ONCE.
       *
       * `Screen` is used two ways: as a whole screen, where it owns the top
       * edge and must clear the notch itself; and nested inside a layout that
       * already has a header — ExploreLayout, CoachLayout — where the header
       * has cleared it. Applying `env(safe-area-inset-top)` in both places
       * added the inset twice on a notched iPhone, injecting a dead ~47px band
       * between the layout's tabs and the screen's own content and giving the
       * sticky tab bar a gap to slide content through. It was invisible in a
       * desktop browser, where `env()` resolves to 0.
       *
       * Those layouts now set `--screen-safe-top: 0px`, so the inset is applied
       * by whichever element actually touches the top of the display.
       */
      style={{ paddingTop: "var(--screen-safe-top, env(safe-area-inset-top, 0px))" }}
    >
      {children}
      {/* Clears the raised Start control in the tab bar. */}
      <div className="h-14" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ScreenHeader — title row, optional back button and trailing action         */
/* -------------------------------------------------------------------------- */

export function ScreenHeader({
  title,
  subtitle,
  back,
  action,
  className,
  large,
}: {
  title: string;
  subtitle?: string;
  back?: boolean | string;
  action?: React.ReactNode;
  className?: string;
  large?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <header className={cn("flex items-start gap-3 pb-5 pt-6", className)}>
      {back && (
        <button
          type="button"
          onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}
          aria-label="Back"
          className="-ml-2 mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1
          className={cn(
            "truncate font-light tracking-[-0.02em] text-snow",
            large ? "text-[28px]" : "text-[22px]",
          )}
        >
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[13px] text-mist">{subtitle}</p>}
      </div>
      {action && <div className="mt-0.5 shrink-0">{action}</div>}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* SegmentedTabs — ACTIVE / COMPLETED style switcher                          */
/* -------------------------------------------------------------------------- */

/** The commit slide, matched to the `layoutId` transition on the untracked path. */
const SLIDE = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  variant = "compact",
  swipeOffset,
}: {
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /**
   * `compact` is the in-screen filter strip this component was built for.
   * `section` is the larger top-level strip a layout owns — bigger caps, and
   * the active tab carries the accent itself rather than only its underline.
   * Additive: every existing call site keeps `compact` untouched.
   */
  variant?: "compact" | "section";
  /**
   * Live swipe progress, for a layout whose content follows the finger.
   *
   * Signed fraction of one tab's worth of travel: negative is dragging toward
   * the NEXT tab, positive toward the previous. `undefined` — which is every
   * existing call site — takes the `layoutId` path below, unchanged and
   * unaware. That is the point: this is a capability the component gained, not
   * a swipe feature wearing its clothes.
   */
  swipeOffset?: MotionValue<number>;
}) {
  const section = variant === "section";
  const scroller = useRef<HTMLDivElement | null>(null);
  const [clipped, setClipped] = useState(false);

  // Written when Explore carried six tabs and they overflowed 375 px: the strip
  // had always scrolled, but silently — the fifth label was clipped with
  // nothing to say it could be reached, and selecting it from elsewhere left it
  // off-screen. Explore is down to three tabs now and, measured on 4 Sep 2026,
  // NO STRIP IN THE APP OVERFLOWS AT 375 px any more. This is kept because the
  // next tab added to any of them brings the clipping straight back, and
  // because the strip must not be the reason a tab is unreachable.
  //
  // SIDEWAYS ONLY, AND NEVER `scrollIntoView`. This line used to read
  // `active.scrollIntoView({ inline: "nearest", block: "nearest" })`, which
  // scrolls every scrollable ancestor — including the page — so on the screens
  // whose tab row sits below the fold the whole screen opened scrolled past its
  // own header and its own disclosures. Measurements and the full account are
  // in `tabStripScroll.ts`; a test in `scroll.test.ts` fails if it comes back.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;
    const left = tabStripScrollLeft(el, active);
    // `scrollLeft` rather than `scrollTo`, because it cannot move the page even
    // by accident: there is no vertical axis on this property to get wrong.
    if (left !== null) el.scrollLeft = left;
  }, [value]);

  // The fade is a scroll affordance, so it may only exist while there is
  // something to scroll to. Shown unconditionally it dimmed the last tab of a
  // strip that already fitted — the label looked cut off when it was whole.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setClipped(el.scrollWidth - el.clientWidth > 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs]);

  /*
   * ── TRACKING THE FINGER ───────────────────────────────────────────────────
   *
   * Only runs for a caller that passes `swipeOffset`. Everything below is inert
   * otherwise: `tracking` is false, no rect is measured, and the `layoutId`
   * underline renders exactly as it always has.
   *
   * The indicator tracks the ATTEMPT, not the outcome. It is driven by the same
   * number that moves the content, so a drag released below the threshold
   * carries the indicator back with the page rather than committing to a tab
   * the content never reached. The strip is what people read to know where they
   * are; it disagreeing with the screen would be worse than not tracking at all.
   */
  const tracking = swipeOffset !== undefined;
  const idle = useMotionValue(0);
  const offset = swipeOffset ?? idle;
  const [rects, setRects] = useState<{ left: number; width: number }[]>([]);

  useEffect(() => {
    if (!tracking) return;
    const el = scroller.current;
    if (!el) return;
    // `offsetLeft` is layout-relative, so it survives the strip being scrolled
    // — which it is, whenever six tabs overflow the screen.
    const measure = () =>
      setRects(
        Array.from(el.querySelectorAll<HTMLElement>("button")).map((b) => ({
          left: b.offsetLeft,
          width: b.offsetWidth,
        })),
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tracking, tabs]);


  /*
   * Position driven IMPERATIVELY, and this is a correction rather than a style
   * preference.
   *
   * The first attempt derived left/width with `useTransform(offset, …)` reading
   * `rects` from the render closure. It rendered at left:0 width:0 and stayed
   * there: the rects are measured in an effect AFTER first paint, and a
   * transform's output only recomputes when its SOURCE motion value changes.
   * `offset` had not moved, so the underline kept the zero it was born with —
   * an invisible indicator on both layouts. Caught by measuring the rendered
   * element against the active button rather than by looking at it.
   *
   * So: refs for the inputs, so the maths always reads current values, and both
   * a resting effect and a drag subscription write the same two values. One
   * position, two things that can move it, no stale closure between them.
   */
  const left = useMotionValue(0);
  const width = useMotionValue(0);
  const rectsRef = useRef(rects);
  rectsRef.current = rects;
  const activeIndex = tabs.findIndex((t) => t.value === value);
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;

  /** Where the underline sits for a given drag offset. Ends damp in place. */
  const positionFor = (o: number): { left: number; width: number } | null => {
    const r = rectsRef.current;
    const from = r[activeRef.current];
    if (!from) return null;
    const neighbour = r[activeRef.current + (o < 0 ? 1 : -1)];
    const f = Math.min(1, Math.abs(o));
    if (!neighbour) return { left: from.left + (o < 0 ? -1 : 1) * f * 6, width: from.width };
    return {
      left: from.left + (neighbour.left - from.left) * f,
      width: from.width + (neighbour.width - from.width) * f,
    };
  };

  // Resting position: after measuring, and after a commit changes the tab.
  useEffect(() => {
    if (!tracking) return;
    const at = positionFor(offset.get());
    if (!at) return;
    // The first placement is not a slide — there was nothing to slide from.
    const settled = left.get() === 0 && width.get() === 0;
    if (settled) {
      left.set(at.left);
      width.set(at.width);
      return;
    }
    const a = animate(left, at.left, SLIDE);
    const b = animate(width, at.width, SLIDE);
    return () => {
      a.stop();
      b.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking, rects, activeIndex]);

  // Under the finger: follow it exactly, no spring, no lag.
  useMotionValueEvent(offset, "change", (o) => {
    if (!tracking) return;
    const at = positionFor(o);
    if (!at) return;
    left.set(at.left);
    width.set(at.width);
  });

  return (
    <div className={cn("relative", className)}>
      <div
        ref={scroller}
        className={cn(
          "no-scrollbar relative flex overflow-x-auto border-b border-hairline",
          // `section` runs larger caps, so it buys the width back from the gaps
          // — five Explore tabs have to reach both edges of a 375 px screen.
          section ? "gap-2.5" : "gap-4",
        )}
      >
        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              data-active={active}
              onClick={() => onChange(t.value)}
              className={cn(
                "relative shrink-0 pb-3 font-medium uppercase transition-colors",
                section
                  ? "text-[12px] tracking-[0.1em]"
                  : "text-[10px] tracking-[0.12em]",
                active
                  ? section
                    ? "text-azure"
                    : "text-snow"
                  : section
                    ? "text-mist hover:text-snow"
                    : "text-mist-dim hover:text-mist",
              )}
            >
              {t.label}
              {active && !tracking && (
                <motion.span
                  layoutId={`seg-${tabs.map((x) => x.value).join("")}`}
                  className={cn(
                    "absolute inset-x-0 -bottom-px bg-azure",
                    section ? "h-0.5 rounded-full" : "h-px",
                  )}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </button>
          );
        })}

        {/* The tracked underline — one element for the whole strip, positioned
            in the scroller rather than inside a button, because it has to be
            able to sit BETWEEN two of them mid-drag. Only rendered for a caller
            that opted in; the untracked path keeps its per-button `layoutId`
            span above. */}
        {tracking && rects[activeIndex] && (
          <motion.span
            aria-hidden
            style={{ left, width }}
            className={cn(
              "pointer-events-none absolute -bottom-px bg-azure",
              section ? "h-0.5 rounded-full" : "h-px",
            )}
          />
        )}
      </div>
      {/* A hairline fade so a clipped tab reads as scrollable rather than broken. */}
      {clipped && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-obsidian to-transparent"
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stagger helpers — the house entrance motion                                */
/* -------------------------------------------------------------------------- */

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

export const rise = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const } },
};

export function Stagger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

export function Rise({
  children,
  className,
  ...rest
}: { children: React.ReactNode; className?: string } & React.ComponentProps<typeof motion.div>) {
  return (
    <motion.div variants={rise} className={className} {...rest}>
      {children}
    </motion.div>
  );
}
