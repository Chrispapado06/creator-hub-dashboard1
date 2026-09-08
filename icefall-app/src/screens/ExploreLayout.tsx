import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ScreenHeader, SegmentedTabs, isFullScreenRoute } from "@/components/layout/chrome";
import { useTabSwipe } from "@/hooks/useTabSwipe";

/**
 * Three tabs, and a hub above them.
 *
 * `/explore` is no longer the Mountains list: it is the discovery hub, which
 * sits above the tab set and leads to all three plus conditions and gear. The
 * mountains list moved to `/explore/mountains`.
 *
 * `value` is typed as a plain string so the hub can pass a path that is in no
 * tab — on `/explore` itself, nothing is lit, which is correct: the hub is not
 * one of the three.
 *
 * Events and Community stay out of the tab bar. Their routes still resolve, so
 * nothing breaks and no deep link dies; they simply are not surfaced here.
 */
/**
 * FIND leads, because it is what Explore is for: where can I go from here.
 *
 * SOCIAL IS NOT A TAB HERE ANY MORE, and this is the important one to know
 * about. It used to be the fourth, holding People and Groups as sub-tabs after
 * six tabs ran off the edge of the screen. Then Social took a slot in the
 * BOTTOM tab bar while still rendering inside this layout, and the result was
 * the bug the owner reported on 2026-09-03 — "when you click on social, i dont
 * want it to be shown on explore anymore": a screen titled "Explore", with a
 * back chevron to a hub they had not asked for, and two stacked tab rows.
 *
 * So Social is a top-level destination at `/social` (`screens/social/Social.tsx`)
 * and `/explore/social` redirects there, query string and all. THE CREATE-GROUP
 * + WENT WITH IT — it used to live in this header, conditional on the path, and
 * it is the only way to make a group. It is now unconditional in Social's own
 * header. Do not put one back here: a + beside Find, Expeditions or Guides
 * would promise a create this section does not offer.
 *
 * NOTHING OF SOCIAL'S RENDERS UNDER THIS HEADER ANY MORE, and this paragraph
 * used to say the opposite. `/explore/people/:id`, `/explore/groups`,
 * `/explore/groups/new` and `/explore/groups/:id` were still declared inside the
 * `/explore` block, so opening a climber or a group FROM Social put this
 * header — the word "Explore", the chevron to the hub, the three-tab row — back
 * on screen one tap after the move that was supposed to end it. They are
 * `/social/people/:id`, `/social/groups/new` and `/social/groups/:id` now, flat
 * under `AppShell`, each drawing its own header. The old paths redirect, and
 * those redirects are declared OUTSIDE this layout so they never mount it: a
 * `<Navigate>` nested here renders this header for a frame first.
 */
const TABS: readonly { value: string; label: string }[] = [
  // Order is a claim about what this section is for. Find leads; then the two
  // ways to hire somebody — a company for an expedition, an individual for a
  // day — because that is what most people open Explore to do.
  //
  // MOUNTAINS AND TREKS ARE NOT TABS ANY MORE. Both were removed from this bar
  // at the owner's request. Their ROUTES still exist and still work: the
  // Expeditions screen rails "Explore mountains" and "Famous treks" each carry
  // a "View all" through to them, which is now the only way in. Nothing is
  // orphaned and nothing was deleted — they stopped being top-level
  // destinations and became the depth behind two rails.
  { value: "/explore/routes", label: "Find" },
  { value: "/explore/expeditions", label: "Expeditions" },
  { value: "/explore/guides", label: "Guides" },
];

/** The hub. Reached by the back chevron from any tab. */
const HUB = "/explore/hub";

/** Everything beyond your own training lives here. */
export default function ExploreLayout() {
  const { pathname, key } = useLocation();
  const navigate = useNavigate();

  // Longest matching prefix so detail routes keep their parent tab lit. No
  // match — the hub, or a route filed under none of the three — lights nothing
  // rather than falsely lighting the first tab.
  //
  // `/explore/people` and `/explore/groups` used to be aliased onto the Social
  // tab so they lit something. Both the tab and the routes are gone — they live
  // under `/social` — so nothing here needs an alias any more. The hub is the
  // only path left that matches no tab, and lighting Find while somebody reads
  // the hub would say they are somewhere they are not.
  const active =
    [...TABS]
      .sort((a, b) => b.value.length - a.value.length)
      .find((t) => pathname === t.value || pathname.startsWith(`${t.value}/`))?.value ?? "";

  const onHub = pathname === HUB;

  /**
   * Where the chevron goes.
   *
   * On a TAB ROOT it goes to the hub, which is the only way back there.
   *
   * On a DETAIL route it goes back in history instead. This header is shared by
   * every screen under /explore, and mountain, peak and trail pages render no
   * header of their own — so this chevron was the only way off them, and it
   * always went to the hub. Opening Mont Blanc from Expeditions and pressing
   * back landed you on the hub rather than the list you came from, which is the
   * bug this fixes. History is the right answer because the same peak page is
   * reached from Expeditions, from Mountains and from search, and each of them
   * deserves to be returned to.
   *
   * EXCEPT ON A COLD OPEN, WHERE THERE IS NO HISTORY TO STEP BACK INTO.
   * `location.key` is `"default"` exactly when this is the router's first entry
   * — a pasted or shared link, a notification, a bookmark — and `navigate(-1)`
   * there either does nothing or walks the reader out of ICEFALL altogether.
   * The same test guards `/social/post/:id`, and mountain, peak and operator
   * pages all reach this header with no exit of their own.
   *
   * The trail and trek pages no longer do: they render above, with no header at
   * all, and carry their own floating control wired to `useDetailBack` — the
   * same rule, in the one place the two of them share.
   */
  const onTabRoot = TABS.some((t) => t.value === pathname);
  const coldOpen = key === "default";
  const back = onHub ? undefined : onTabRoot || coldOpen ? HUB : true;

  /*
   * Swipe between the three, but ONLY on a tab root.
   *
   * `onTabRoot` already exists above for the back chevron, and it is exactly
   * the right condition: someone reading a trek detail who swiped to Guides
   * would lose their place. Detail routes keep their parent tab lit and stay
   * put — the gesture belongs to the tab set, not to everything filed under it.
   *
   * `current` is `active`, which is "" on the hub and on the People and Groups
   * routes. `onTabRoot` is false for all of those, so the gesture is off there
   * anyway: no swipe rather than a swipe to the wrong place.
   */
  const swipe = useTabSwipe({
    tabs: TABS.map((t) => t.value),
    current: active,
    enabled: onTabRoot,
    onNavigate: (v) => navigate(v),
  });

  /*
   * THE HUB DRAWS ITS OWN HEAD, AND NO TAB ROW.
   *
   * The owner's Explore design (2026-09-04) opens on a large editorial
   * "Explore" with the subtitle and a map button beside it — not the small
   * shared header above a Find / Expeditions / Guides strip. Those three are
   * still the way through the section once you are IN it; on the hub they are
   * the four category cards instead, so drawing the strip as well would show
   * the same doors twice on one screen.
   *
   * `--screen-safe-top` is NOT zeroed on this branch, on purpose. That
   * variable exists so `Screen` does not clear the notch a second time when a
   * layout header has already cleared it — and on this branch there is no
   * header above the outlet, so the screen has to clear it itself. Zeroing it
   * here would push the heading under the status bar on a notched phone.
   */
  if (onHub) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    );
  }

  /*
   * ONE TRAIL, ONE TREK: NOTHING OF THIS LAYOUT AT ALL.
   *
   * Charlie's reference (2026-09-08) opens with a photograph running edge to
   * edge and up under the status bar — no app header, no "Explore" title, no
   * Find / Expeditions / Guides strip. Anything drawn here would be the
   * difference between the reference and the screen.
   *
   * The list is `isFullScreenRoute`'s, the same one that takes the bottom
   * navigation and the top bar off these routes, so all three absences are one
   * decision recorded in one place rather than three conditions that can drift.
   *
   * `--screen-safe-top` is deliberately NOT set here. `AppShell` has already
   * zeroed it for the outlet, which is what lets the hero start at the top
   * edge; the pages pay the notch in their own floating controls.
   */
  if (isFullScreenRoute(pathname)) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Outlet />
      </div>
    );
  }

  /*
   * FIND HAS NO HEADER, AND NO TAB STRIP EITHER. The owner's reference for it
   * (AllTrails' Explore, 2026-09-07) is a map from the top of the screen down
   * with the results in a sheet over it. The first version floated the three
   * section tabs over the map; the owner, the same day: "there should be other
   * pages since we have a hub for it" — the hub is where Expeditions and
   * Guides are reached, and repeating them over the map was noise. So Find
   * keeps one control up here: the way back to the hub.
   */
  if (pathname === "/explore/routes") {
    /*
     * AND NO FLOATING CHEVRON EITHER, ANY MORE.
     *
     * It used to hang here at z-30 over the map, which forced Find's sheet to
     * stop 58px short of the top so the sheet would not swallow it. The owner
     * read that reserved band as dead space twice in one evening, and they were
     * right — nothing was ever drawn in it. The way back now lives in the
     * sheet's own head row, beside the search field (see `Routes.tsx`), where it
     * is on screen at every scroll position and costs no reserved height. So
     * Find is the bare screen: no header, no tab strip, no overlay.
     */
    return (
      <div
        className="relative flex h-full flex-col"
        style={{ "--screen-safe-top": "0px" } as React.CSSProperties}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    // This header clears the notch, so nested `Screen`s must not clear it again.
    <div
      className="flex h-full flex-col"
      style={{ "--screen-safe-top": "0px" } as React.CSSProperties}
    >
      <div className="shrink-0 px-5" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* The chevron is the way back to the hub from a tab. Without it the
            hub would be reachable only by leaving Explore and returning. */}
        {/* No `action`: the create-group + this header used to carry moved to
            Social's own header when Social left Explore. See the TABS comment. */}
        <ScreenHeader title="Explore" back={back} large />
        <SegmentedTabs
          tabs={TABS}
          value={active}
          onChange={(v) => navigate(v)}
          variant="section"
          swipeOffset={swipe.swipeOffset}
        />
      </div>
      {/* Must be a flex column: `Screen` inside uses `flex-1 overflow-y-auto`,
          which does nothing under a block parent — the list grew to its full
          height and was clipped instead of scrolling. */}
      <div className="flex min-h-0 flex-1 flex-col" {...swipe.bind}>
        <Outlet />
      </div>
    </div>
  );
}
