import { Compass, House, MessageCircle, Play, User } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Primary navigation.
 *
 * Starting an activity is the single most important action in the app, so it
 * sits dead centre as a raised control rather than competing as one tab among
 * five. Activity history is still one tap away from Home and Profile — the
 * centre button is the *doing*, the history is the *looking back*.
 */
const TABS = [
  { to: "/home", label: "Home", icon: House },
  { to: "/explore", label: "Explore", icon: Compass },
  null, // centre slot — the start control
  { to: "/coach", label: "Coach", icon: MessageCircle },
  { to: "/profile", label: "Profile", icon: User },
] as const;

/* -------------------------------------------------------------------------- */
/* The summit line                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The mark, measured off the owner's reference.
 *
 * It is not a bare chevron. The reference draws a SHORT HORIZONTAL SHOULDER
 * either side of the summit, in the accent colour, so the mark reads as a
 * mountain standing on its own piece of horizon. A first pass left those
 * shoulders as the 7%-white hairline, which is invisible at this size — so all
 * that showed was a large V floating in the dark, which is exactly what it
 * looked like.
 *
 * Rise is ~2/3 of each leg's horizontal run, as in the drawing. The whole mark
 * is 64px so it sits INSIDE a 75px tab rather than straddling its neighbours.
 */
const PEAK_HALF = 18;
const PEAK_RISE = 12;
/** Accent-coloured horizon either side of the summit. */
const PEAK_SHOULDER = 14;
/** Everything the mark covers, and therefore what the hairline must give up. */
const MARK_HALF = PEAK_HALF + PEAK_SHOULDER;
/** The strip the edge is drawn in — the rise, plus room for the stroke. */
const EDGE_H = PEAK_RISE + 2;
/** Where the horizon sits inside that strip. */
const LINE_Y = EDGE_H - 1;

/**
 * The bar's top edge, which rises into a peak above the tab you are on.
 *
 * WHY THIS REPLACES THE BORDER RATHER THAN SITTING ON IT.
 *
 * The reference draws ONE continuous silhouette: the horizon runs in from the
 * left, climbs to a summit, and runs out to the right — with no line across the
 * base of the mountain. A triangle stacked on an unbroken border reads as a
 * shape resting on a wire, not as a skyline. So the nav's `border-t` is gone and
 * this draws the whole edge: one hairline with a `PEAK_HALF * 2` bite taken out
 * of it by a mask, and the peak's two legs landing exactly in that gap.
 *
 * THAT DESCRIPTION IS OBSOLETE, and is kept only to explain what this is not.
 * There is no full-width rule and no mask any more: the reference has no line
 * beyond the mountain's own shoulders, and a rule running out of the summit was
 * the faint line that kept showing. The mark is now self-contained — a filled
 * summit in the bar's own colour, with short accent shoulders — and the bar is
 * separated from the content beneath by its blur and tint alone.
 *
 * Both move by TRANSFORM rather than by redrawing. An SVG `d` string cannot be
 * tweened, so animating the geometry would mean recomputing the path every
 * frame for a shape that never changes — only its position does.
 */
function SummitEdge({ index }: { index: number | null }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  /*
   * Measured, not assumed.
   *
   * All five slots are `flex-1`, so the centres are evenly spaced — verified in
   * the live DOM at 375: five items of 75px, centres at 38/113/188/263/338. But
   * the bar is as wide as the device, so those pixels are only known at runtime,
   * and the `ResizeObserver` is what keeps the peak under its tab when the
   * viewport changes rather than only when the route does.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /*
     * Observe the NAV, not this wrapper.
     *
     * The wrapper is `absolute inset-x-0` with no height — a 430x0 box. It
     * reports the right width to `getBoundingClientRect`, so the first
     * measurement looked fine, but ResizeObserver never fired for it and the
     * peak stayed parked at its old position when the viewport changed:
     * measured live, the wrapper read 430 while the SVG was still drawn at 375.
     * A box with zero area is not a reliable thing to watch. The nav has real
     * dimensions and is exactly as wide, so it is the honest thing to measure.
     */
    const box = el.parentElement ?? el;
    const read = () => setWidth(box.getBoundingClientRect().width);
    read();

    const ro = new ResizeObserver(read);
    ro.observe(box);
    // Belt and braces: some environments emulate a viewport change without
    // producing an observation. The listener costs nothing and the read is idempotent.
    window.addEventListener("resize", read);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", read);
    };
  }, []);

  // Slot i of five spans [i/5, (i+1)/5], so its centre is (2i+1)/10.
  const centre = index === null || width === 0 ? null : ((index * 2 + 1) / 10) * width;

  /*
   * ONE motion value drives the notch AND the peak.
   *
   * The first attempt gave each its own `animate={{ x }}` prop with a matching
   * transition. It positioned correctly on load and then never moved again:
   * framer-motion does not reliably re-target `x` as a prop on an SVG `<g>`,
   * where `x` is an attribute name on many SVG elements rather than a
   * transform. Verified in the browser — the route changed, `aria-current`
   * moved, and the transform stayed frozen at its first value.
   *
   * Driving a `MotionValue` through `style` applies a real transform, and
   * sharing ONE value between the fill and the stroke makes drift impossible by
   * construction rather than by two transitions happening to agree.
   */
  const x = useMotionValue(0);
  const placed = useRef(false);

  useEffect(() => {
    if (centre === null) return;
    // The first placement is not a slide — nothing was there to slide from.
    if (!placed.current || reduce) {
      placed.current = true;
      x.set(centre);
      return;
    }
    const controls = animate(x, centre, {
      type: "spring",
      stiffness: 420,
      damping: 38,
      mass: 0.7,
    });
    return () => controls.stop();
  }, [centre, reduce, x]);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0">
      {width > 0 && (
        <svg
          width={width}
          height={EDGE_H}
          viewBox={`0 0 ${width} ${EDGE_H}`}
          fill="none"
          /*
           * `bottom-0` on this zero-height wrapper already puts the SVG's
           * bottom edge on the bar's top edge, which lands the horizon exactly
           * where the old border was. An extra `translateY(-EDGE_H)` was ALSO
           * applied, lifting the whole mark a further 17px into the content
           * above — the summit floated well clear of the bar with a visible gap
           * beneath its feet. Two offsets for one position.
           */
          className="absolute left-0 overflow-visible"
          /*
           * `bottom: -1`, not `bottom: 0`.
           *
           * The horizon is drawn at `LINE_Y = EDGE_H - 1`, so with the SVG's
           * bottom edge flush against the bar there was a 1px row of TRANSPARENT
           * SVG left sitting above the bar, right across its width. Content
           * behind showed through it as a faint hairline — visible under the
           * summit itself wherever the content was bright. Dropping the SVG one
           * pixel puts that row over the bar instead of above it, so the horizon
           * lands on the bar's first pixel and there is no gap to see through.
           */
          style={{ bottom: -1 }}
        >
          {/*
            NO FULL-WIDTH HAIRLINE, and no mask to cut a hole in one.

            The bar used to carry a `border-t`, and the first version of this
            replaced it with a drawn hairline plus an SVG mask that bit a gap
            for the summit. Both are gone: the reference has NO line beyond the
            mountain's own shoulders — the horizon simply ends. Keeping a
            full-width rule meant a faint line ran out of the mountain and
            across the whole bar, which is the line that kept being visible.

            The bar is still legible against content beneath it: `obsidian/85`
            with `backdrop-blur-xl` darkens and blurs whatever passes under,
            which is what separates it now.
          */}

          {centre !== null && (
            <motion.g style={{ x }}>
              {/*
                THE SUMMIT IS SOLID, NOT AN OUTLINE.
                Filled first, so the stroke draws over its own edge.

                Without this the triangle was a window: the card behind the bar
                showed straight through the mountain, which made it read as a
                shape drawn ON the screen rather than as the bar itself rising.
                The fill is the bar's own `obsidian`, so the peak is a piece of
                navigation that happens to be mountain-shaped.

                Solid rather than the bar's `obsidian/85`: at 85% the content
                behind would still ghost through, which is the whole complaint.
                The app's canvas is this colour everywhere, so an opaque peak and
                the translucent bar read as one surface.
              */}
              <path
                /* Down to the SVG's bottom edge, not just to the horizon, so
                   the summit's fill meets the bar with nothing between them. */
                d={
                  `M ${-PEAK_HALF} ${EDGE_H}` +
                  ` L ${-PEAK_HALF} ${LINE_Y}` +
                  ` L 0 1` +
                  ` L ${PEAK_HALF} ${LINE_Y}` +
                  ` L ${PEAK_HALF} ${EDGE_H} Z`
                }
                fill="var(--ice-obsidian)"
              />
              <path
                d={
                  `M ${-MARK_HALF} ${LINE_Y}` +
                  ` L ${-PEAK_HALF} ${LINE_Y}` +
                  ` L 0 1` +
                  ` L ${PEAK_HALF} ${LINE_Y}` +
                  ` L ${MARK_HALF} ${LINE_Y}`
                }
                stroke="var(--ice-azure)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.g>
          )}
        </svg>
      )}
    </div>
  );
}

/** One predicate, so the peak and the highlight cannot land on different tabs. */
function isActivePath(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function TabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  /*
   * Which of the five slots the peak belongs over — the index in TABS, because
   * the centre slot occupies a position too and the arithmetic counts all five.
   *
   * `null` on a route no tab owns (recording an activity, say). The peak then
   * has nowhere honest to point, so the edge draws as a plain horizon rather
   * than parking over whichever tab happened to be last.
   */
  const activeIndex = ((): number | null => {
    const i = TABS.findIndex((t) => t !== null && isActivePath(pathname, t.to));
    return i === -1 ? null : i;
  })();

  return (
    <nav
      /* No `border-t`: `SummitEdge` draws the whole top edge now, notch and all.
         Keeping the border too would put a straight line back through the base
         of the mountain — the exact thing the notch exists to remove. */
      className="relative z-20 shrink-0 bg-obsidian/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary"
    >
      <SummitEdge index={activeIndex} />

      <ul className="flex h-[var(--tabbar-h)] items-stretch">
        {TABS.map((tab, i) => {
          if (!tab) {
            return (
              <li key="start" className="relative flex-1">
                <button
                  type="button"
                  onClick={() => navigate("/activity/select")}
                  aria-label="Start an activity"
                  className="group absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[22px]"
                >
                  {/* Obsidian ring punches the button through the bar. */}
                  <span className="grid h-[62px] w-[62px] place-items-center rounded-full bg-obsidian">
                    <span
                      className={cn(
                        "grid h-[54px] w-[54px] place-items-center rounded-full text-snow",
                        "bg-gradient-to-b from-azure to-azure-deep",
                        "transition-all duration-200 ease-[cubic-bezier(.22,1,.36,1)]",
                        "group-hover:from-azure-bright group-hover:to-azure group-active:scale-95",
                        // The glow is the control's whole presence in the bar.
                        "shadow-[0_8px_28px_-6px_var(--ice-azure-glow)]",
                      )}
                    >
                      <Play size={20} strokeWidth={2} className="ml-0.5" fill="currentColor" />
                    </span>
                  </span>
                  <span className="section-label absolute inset-x-0 -bottom-[18px] text-center text-azure">
                    Start
                  </span>
                </button>
              </li>
            );
          }

          const active = isActivePath(pathname, tab.to);
          const Icon = tab.icon;

          return (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                className="group relative flex h-full flex-col items-center justify-center gap-1.5"
                aria-current={active ? "page" : undefined}
              >
                {/* The old `layoutId` underline lived here. The summit line is
                    the indicator now, and two sliding markers for one selection
                    is one more than the eye can follow. */}
                <Icon
                  size={20}
                  strokeWidth={active ? 1.7 : 1.4}
                  className={cn(
                    "transition-colors duration-200",
                    active ? "text-azure" : "text-mist-dim group-hover:text-mist",
                  )}
                />
                <span
                  className={cn(
                    "text-[9px] font-medium uppercase tracking-[0.14em] transition-colors duration-200",
                    active ? "text-azure" : "text-mist-dim group-hover:text-mist",
                  )}
                >
                  {tab.label}
                </span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
