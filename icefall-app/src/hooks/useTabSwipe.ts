import { useCallback, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Swiping left and right between the tabs of a section.
 *
 * ONE implementation, consumed by both `ExploreLayout` and `CoachLayout`. The
 * two tab arrays are already the same shape, and §6u is explicit: once two
 * trees are deliberately identical, improving one alone is a regression. A feel
 * adjustment — a threshold, a spring — has to land in both, so there is only
 * one place to make it.
 *
 * ── WHAT IT MUST NOT TAKE ───────────────────────────────────────────────────
 *
 * A horizontal drag that begins inside something which already owns horizontal
 * movement belongs to that thing. Explore holds maps; several screens carry
 * scrolling rails; the tab strip itself scrolls when six tabs overflow 375px.
 * A map you cannot pan is worse than no swipe at all.
 *
 * The stand-down test is STRUCTURAL rather than a list of class names. Walking
 * the ancestors and asking "is this element actually scrollable sideways right
 * now?" catches every rail in the app — including ones added next month —
 * whereas a list of selectors only catches the ones somebody remembered. The
 * inventory of known rails is a way to CHECK this, not the mechanism.
 */

/** Ignore drags starting this close to a screen edge — iOS owns those. */
const EDGE_GUARD_PX = 24;
/** Pixels of travel before the axis is decided. */
const AXIS_LOCK_PX = 8;
/** Fraction of the width that commits the move on release. */
const COMMIT_FRACTION = 0.25;
/** A flick commits regardless of distance, in px per millisecond. */
const FLICK_VELOCITY = 0.5;
/** How far past the last tab the content may be dragged, as a fraction. */
const RUBBER_BAND = 0.22;

/**
 * Does this element own horizontal gestures?
 *
 * `canvas` covers the maps — they render into one and read raw pointer events.
 * A range input and anything with `role="slider"` are dragged sideways by
 * definition. `[data-swipe-ignore]` is the explicit opt-out for anything these
 * three miss.
 *
 * The scroll test asks whether the element can ACTUALLY scroll right now, not
 * whether it is styled to allow it: a rail whose contents happen to fit is not
 * carrying a gesture, and standing down for it would disable the swipe on
 * screens that merely COULD have overflowed.
 */
function ownsHorizontalGesture(el: Element): boolean {
  if (el.tagName === "CANVAS") return true;
  if (el.getAttribute("role") === "slider") return true;
  if (el instanceof HTMLInputElement && el.type === "range") return true;
  if (el.hasAttribute("data-swipe-ignore")) return true;

  /*
   * The maps are MapLibre, and their canvas does not exist in the source — the
   * library builds it at runtime, so a touch usually lands on a `<canvas>` and
   * the check above catches it. These two classes are the insurance for a touch
   * that lands on a marker or control overlaid ON the map instead, which is a
   * div and would otherwise fall through.
   */
  if (el.classList.contains("maplibregl-map")) return true;
  if (el.classList.contains("maplibregl-canvas-container")) return true;

  const style = getComputedStyle(el);

  /*
   * `touch-action: none` is an element declaring that it handles every gesture
   * itself — the graph scrubber does exactly this alongside `setPointerCapture`.
   * Reading the declaration is better than matching its class, because it is the
   * element stating its own intent rather than us recognising one instance of it.
   */
  if (style.touchAction === "none") return true;

  /*
   * A scroller only owns the gesture when it has somewhere to scroll.
   *
   * Two traps sit here, and the ORDER of these two tests is what avoids both.
   * Matching `overflow-x` alone would stand down over pill rails whose contents
   * happen to fit, disabling the swipe on whole screens for no reason. And
   * matching the codebase's `no-scrollbar` class would be worse still: it is on
   * `Screen` itself, which wraps essentially every page — the swipe would never
   * fire anywhere. Asking whether this element can actually scroll sideways
   * right now answers both.
   */
  if (el.scrollWidth > el.clientWidth + 2) {
    if (style.overflowX === "auto" || style.overflowX === "scroll") return true;
  }
  return false;
}

/** Walks from the touched element up to (and excluding) the swipe container. */
function gestureBelongsElsewhere(target: EventTarget | null, root: HTMLElement): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== root) {
    if (ownsHorizontalGesture(el)) return true;
    el = el.parentElement;
  }
  return false;
}

export interface TabSwipe {
  /** Spread onto the element that holds the tab's content. */
  bind: {
    ref: (node: HTMLElement | null) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
  /** True while a horizontal drag is being tracked. */
  dragging: boolean;
}

export function useTabSwipe({
  tabs,
  current,
  enabled,
  onNavigate,
}: {
  /** Tab values in display order. */
  tabs: readonly string[];
  /** The value currently showing. */
  current: string;
  /** False on detail routes — see the note in each layout. */
  enabled: boolean;
  onNavigate: (value: string) => void;
}): TabSwipe {
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLElement | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  /** null until the first few pixels decide; false means "not ours". */
  const horizontal = useRef<boolean | null>(null);

  const index = tabs.indexOf(current);

  const settle = useCallback(() => {
    start.current = null;
    horizontal.current = null;
    setDragging(false);
    setDx(0);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || index === -1) return;
      // A mouse drag is not a swipe; leave text selection alone.
      if (e.pointerType === "mouse") return;

      const w = window.innerWidth;
      // The system back gesture lives here. Never compete with it.
      if (e.clientX < EDGE_GUARD_PX || e.clientX > w - EDGE_GUARD_PX) return;

      const root = rootRef.current;
      if (!root) return;
      if (gestureBelongsElsewhere(e.target, root)) return;

      start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      horizontal.current = null;
    },
    [enabled, index],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = start.current;
      if (!s) return;

      const moveX = e.clientX - s.x;
      const moveY = e.clientY - s.y;

      if (horizontal.current === null) {
        if (Math.abs(moveX) < AXIS_LOCK_PX && Math.abs(moveY) < AXIS_LOCK_PX) return;
        // Vertical wins ties: a scroll must never be stolen by a swipe, and
        // the ambiguous case is far more often somebody scrolling a list.
        horizontal.current = Math.abs(moveX) > Math.abs(moveY);
        if (!horizontal.current) {
          start.current = null;
          return;
        }
        setDragging(true);
      }

      if (!horizontal.current) return;

      // Nothing lies beyond the ends, so resist rather than travel. A hard stop
      // reads as a broken gesture; a little give reads as "there is no more".
      const atStart = index === 0 && moveX > 0;
      const atEnd = index === tabs.length - 1 && moveX < 0;
      setDx(atStart || atEnd ? moveX * RUBBER_BAND : moveX);
    },
    [index, tabs.length],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const s = start.current;
      if (!s || !horizontal.current) {
        settle();
        return;
      }

      const moveX = e.clientX - s.x;
      const elapsed = Math.max(1, e.timeStamp - s.t);
      const velocity = Math.abs(moveX) / elapsed;
      const committed =
        Math.abs(moveX) > window.innerWidth * COMMIT_FRACTION || velocity > FLICK_VELOCITY;

      if (committed) {
        // Drag LEFT (negative) reveals the tab to the right.
        const next = moveX < 0 ? index + 1 : index - 1;
        const target = tabs[next];
        if (target !== undefined) onNavigate(target);
      }
      settle();
    },
    [index, tabs, onNavigate, settle],
  );

  return {
    bind: {
      ref: (node: HTMLElement | null) => {
        rootRef.current = node;
      },
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: settle,
      style: {
        // Tells the browser we handle horizontal and it keeps vertical. Without
        // it the scroller and this gesture fight, and the page stutters.
        touchAction: enabled ? "pan-y" : undefined,
        /*
         * The transform is set ONLY while dragging, and removed at rest.
         *
         * A transform on an ancestor — even `translateX(0)` — creates a
         * containing block and breaks `position: sticky` inside it. Several
         * screens under these layouts have sticky headers, so leaving a
         * permanent transform here would quietly unstick them. Reduced motion
         * skips the follow entirely: the navigation still happens, the content
         * just does not travel.
         */
        ...(dragging && !reduce
          ? { transform: `translateX(${dx}px)`, willChange: "transform" }
          : null),
      },
    },
    dragging,
  };
}
