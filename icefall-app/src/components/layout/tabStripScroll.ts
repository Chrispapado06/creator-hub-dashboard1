/**
 * Keeping the selected tab visible SIDEWAYS — and only sideways.
 *
 * WHY THIS IS ITS OWN FILE.
 *
 * `SegmentedTabs` used to keep the active tab on screen with
 *
 *     active.scrollIntoView({ inline: "nearest", block: "nearest" })
 *
 * `scrollIntoView` does not scroll one element. It scrolls EVERY scrollable
 * ancestor until the element is visible, and `block` is a VERTICAL instruction
 * — so on the screens where the tab row sits below the fold, the nearest
 * scrollable ancestor is the `Screen` container and the effect scrolled the
 * whole page down on mount to bring the tab row into view.
 *
 * MEASURED IN THE RUNNING APP, 4 September 2026, at 375 × 667:
 *
 *   /explore/guides/:id   opened at scrollTop 1422 (tab row at 1852)
 *   /coach/plan           opened at scrollTop 1205 (tab row at 1704)
 *   /explore/trek/:id     opened at scrollTop  131 (tab row at  558)
 *   /mountain/:id/conditions opened at scrollTop 115
 *
 * On a guide's profile that put "40% of this comparison" at the top of the
 * first paint and scrolled off, unseen, the guide's name, the notice that the
 * portrait is a computer-generated face of a person who does not exist, the
 * CLAIMED marker on the licence line and "ICEFALL has checked none of it".
 * What the scroll hid was exactly the honesty layer. Coach → Plan → Phases
 * looked blank for the same reason: the tab content swapped in above the
 * viewport, so the visible part of the screen was the end of the page.
 *
 * The strip now moves its OWN `scrollLeft` and nothing else. The geometry is
 * split out here, importing nothing, so `npm test` can drive it on node —
 * `chrome.tsx` cannot be bundled for node, it pulls in React and framer-motion.
 */

/** Just enough of a horizontal scroller to place a tab inside it. */
export interface TabStripBox {
  /** How far the strip is scrolled sideways, now. */
  scrollLeft: number;
  /** The strip's visible width. Zero before it has been laid out. */
  clientWidth: number;
}

/**
 * Just enough of a tab button to place it.
 *
 * `offsetLeft` is layout-relative, so it is unaffected by the strip already
 * being scrolled — which it is whenever six Explore tabs overflow 375 px.
 */
export interface TabBox {
  offsetLeft: number;
  offsetWidth: number;
}

/**
 * The `scrollLeft` the strip should hold for `tab` to be fully visible, or
 * `null` when it already holds it.
 *
 * "nearest" semantics, horizontally and only horizontally: a tab off the left
 * edge comes to the left edge, a tab off the right edge comes to the right
 * edge, and a tab already inside the strip does not move it at all.
 *
 * NULL RATHER THAN THE CURRENT VALUE IS DELIBERATE. The caller writes only when
 * this returns a number, so the common case — three tabs that fit — performs no
 * write at all. An unconditional assignment to `scrollLeft` cancels a momentum
 * scroll that is still running under somebody's finger.
 */
export function tabStripScrollLeft(strip: TabStripBox, tab: TabBox): number | null {
  // Not laid out yet: nothing is off screen because there is no screen. A
  // measurement of 0 here would otherwise read as "the tab does not fit" and
  // yank the strip to its first tab on the frame before layout.
  if (strip.clientWidth <= 0) return null;

  const viewLeft = strip.scrollLeft;
  const viewRight = viewLeft + strip.clientWidth;
  const tabLeft = tab.offsetLeft;
  const tabRight = tabLeft + tab.offsetWidth;

  // A tab wider than the strip can satisfy one edge only. Show its start: the
  // label reads from the left, so its first characters are the ones that carry
  // which tab this is.
  if (tab.offsetWidth >= strip.clientWidth) {
    return tabLeft === viewLeft ? null : Math.max(0, tabLeft);
  }
  if (tabLeft < viewLeft) return Math.max(0, tabLeft);
  if (tabRight > viewRight) return Math.max(0, tabRight - strip.clientWidth);
  return null;
}

/**
 * Return the scrolling content behind `from` to the top.
 *
 * WHY THIS EXISTS AT ALL: `window.scrollTo({ top: 0 })` CANNOT WORK IN THIS
 * APP. `PhoneShell` is a fixed-height frame with `overflow-hidden`, so the
 * document itself never scrolls — the scrolling element is always a `Screen`,
 * or a screen's own `overflow-y-auto` container, several levels down. Two
 * screens called `window.scrollTo` on a photo tap and neither had ever moved
 * anything. This walks up to whichever element is actually doing the scrolling
 * and moves that one.
 *
 * Takes the clicked element rather than searching the document, because more
 * than one scroller can be mounted at once and the right one is the ancestor of
 * whatever the athlete just touched.
 */
export function scrollContentToTop(from: Element | null | undefined): void {
  let el: Element | null = from?.parentElement ?? null;
  while (el) {
    const style = el.ownerDocument.defaultView?.getComputedStyle(el);
    const overflowY = style?.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight
    ) {
      el.scrollTop = 0;
      return;
    }
    el = el.parentElement;
  }
}
