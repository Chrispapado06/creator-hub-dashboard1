import { Outlet } from "react-router-dom";

/**
 * Coach owns the surfaces that answer "what should I do today, and why?".
 *
 * `/coach` IS THE HUB — the owner's mockup of 2026-09-06. A hero with the
 * current objective, an ask bar into the chat, today's session, and cards
 * through to Today, Chat, Progress, Fuel and Plan. The five pages built on
 * 2026-09-04 are unchanged; they are reached by tapping a card instead of by a
 * tab strip, and every one of them carries a chevron back to the hub (see
 * `CoachHead` in `coach/shell.tsx`).
 *
 * WHAT THIS LAYOUT USED TO DO, AND WHY IT NO LONGER DOES IT.
 *
 *   · THE SWIPE. `useTabSwipe` was bound to this wrapper and moved sideways
 *     between the five tab roots. Its only affordance was the strip that has
 *     now been removed, so keeping it would leave an invisible second way to
 *     navigate that contradicts the cards. It also never tracked anything:
 *     `ExploreLayout` hands its `swipe.swipeOffset` to `SegmentedTabs` so the
 *     underline follows the finger, and this layout had nowhere to hand it,
 *     because Coach's strip lived inside each page's own scroller rather than
 *     up here. And it would now be actively wrong: `activeCoachTab("/coach")`
 *     resolved to `/coach/today`, index 1 of five, so a left-drag ON THE HUB
 *     would have navigated to `/coach/plan`.
 *   · `DETAIL_PREFIXES`. Nine paths whose only job was `enabled: !isDetail` —
 *     a session or the check-in must not slide sideways into Plan mid-task. It
 *     goes with the swipe. For the record, one of its nine entries
 *     ("/coach/prep") had matched no route in `App.tsx` for some time.
 *   · NOT the theme, and this one is worth keeping written down. An earlier
 *     version stamped `data-theme="light"` here so the section matched its
 *     light designs — which overrode a dark preference for exactly these
 *     pages. The theme is the person's (Settings › Appearance, or the phone's
 *     under "System"), the bootstrap in index.html is the only thing that sets
 *     it, and the pages draw correctly in both through the editorial palette's
 *     per-theme variables.
 *
 * WHAT IS LEFT IS LOAD-BEARING AND IS THE WHOLE REASON THIS FILE STILL EXISTS:
 * the flex column. `Screen` inside uses `flex-1 overflow-y-auto`, which does
 * nothing under a block parent — the page would grow to its full height and be
 * clipped instead of scrolling.
 *
 * The notch is not cleared here and must not be: `AppTopBar` is the only thing
 * that touches the top of the display, and `AppShell` sets `--screen-safe-top:
 * 0px` on the wrapper holding this outlet. Adding an inset back here is the
 * "counted twice" bug — invisible in a desktop browser, ~47px of dead band on a
 * notched iPhone. The detail wrappers in `coach/details.tsx` zero it themselves
 * because they draw their own header and are their own scroller.
 *
 * Fuel's tab used to be `/coach/nutrition`; that path is now the detail view
 * holding the engine's inputs and the food log (see `coach/details.tsx`), so
 * every existing link to it still lands on something true.
 */
export default function CoachLayout() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Outlet />
    </div>
  );
}
