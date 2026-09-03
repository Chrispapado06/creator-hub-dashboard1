import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { ScreenHeader, SegmentedTabs } from "@/components/layout/chrome";
import { useTabSwipe } from "@/hooks/useTabSwipe";

/**
 * Four tabs, and a hub above them.
 *
 * `/explore` is no longer the Mountains list: it is the discovery hub, which
 * sits above the tab set and leads to all four plus conditions and gear. The
 * mountains list moved to `/explore/mountains`, so it now has a tab of its own
 * like the others.
 *
 * GROUPS returns to the tab bar as a real destination rather than a blank room:
 * an athlete's own expedition groups exist locally, so the screen has something
 * true to show even at zero network members. Finding OTHER people's groups
 * still needs a network ICEFALL has not connected, and that screen says so
 * itself rather than being hidden behind a missing tab.
 *
 * `value` is typed as a plain string so the hub can pass a path that is in no
 * tab — on `/explore` itself, nothing is lit, which is correct: the hub is not
 * one of the four.
 *
 * Events and Community stay out of the tab bar. Their routes still resolve, so
 * nothing breaks and no deep link dies; they simply are not surfaced here.
 */
/**
 * FIND leads, because it is what Explore is for: where can I go from here.
 * PEOPLE and GROUPS merged into SOCIAL — six tabs ran off the edge of the
 * screen, and they are the same question twice (who is out there, who am I
 * going with).
 */
const TABS: readonly { value: string; label: string }[] = [
  // Order is a claim about what this section is for. Find leads; then the two
  // ways to hire somebody — a company for an expedition, an individual for a
  // day — because that is what most people open Explore to do, and Social last.
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
  { value: "/explore/social", label: "Social" },
];

/** The hub. Reached by the back chevron from any tab. */
const HUB = "/explore/hub";

/** Everything beyond your own training lives here. */
export default function ExploreLayout() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // Longest matching prefix so detail routes keep their parent tab lit. No
  // match — the hub, or a route filed under none of the four — lights nothing
  // rather than falsely lighting the first tab.
  const active =
    [...TABS]
      .sort((a, b) => b.value.length - a.value.length)
      .find((t) => pathname === t.value || pathname.startsWith(`${t.value}/`))?.value ?? "";

  const onHub = pathname === HUB;
  // Social keeps its tab lit on the old /people and /groups paths, which still
  // resolve for anything already linking to them.
  const lit = /^\/explore\/(people|groups)\b/.test(pathname) ? "/explore/social" : active;

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
   */
  const onTabRoot = TABS.some((t) => t.value === pathname);
  const back = onHub ? undefined : onTabRoot ? HUB : true;

  /*
   * Swipe between the six, but ONLY on a tab root.
   *
   * `onTabRoot` already exists above for the back chevron, and it is exactly
   * the right condition: someone reading a trek detail who swiped to Mountains
   * would lose their place. Detail routes keep their parent tab lit and stay
   * put — the gesture belongs to the tab set, not to everything filed under it.
   *
   * `/explore/people` and `/explore/groups` are legacy aliases that light Social
   * without being tab values, so they get no swipe either. That is the safe
   * side of the line: no gesture rather than a gesture to the wrong place.
   */
  const swipe = useTabSwipe({
    tabs: TABS.map((t) => t.value),
    current: lit,
    enabled: onTabRoot,
    onNavigate: (v) => navigate(v),
  });

  /* Social is one route with sub-tabs in the query string, so the test is the
     PATH, not the tab: the + should be there whichever sub-tab is showing, and
     tapping it switches to Groups and opens the flow. */
  const onGroupsSurface = pathname.startsWith("/explore/social");

  return (
    // This header clears the notch, so nested `Screen`s must not clear it again.
    <div className="flex h-full flex-col" style={{ "--screen-safe-top": "0px" } as React.CSSProperties}>
      <div className="shrink-0 px-5" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* The chevron is the way back to the hub from a tab. Without it the
            hub would be reachable only by leaving Explore and returning. */}
        {/*
          THE CREATE-GROUP +, WHICH WAS DOCUMENTED AS BUILT AND WAS NOT.
          The owner, 2026-09-02: "to create group, need to be added a + sign next
          and above seocial page, not under discover." The floating + was duly
          removed and `Groups.tsx` records the whole contract in its guard block
          — including that this header must navigate to `?tab=groups&create=1`.
          Nobody wrote either half. `Plus` was imported here and never rendered;
          `useSearchParams` was imported there and never called; and nothing in
          the app called `setCreating(true)`, so the create flow — card, privacy
          choice, server write and all — was unreachable. A group could not be
          made at all.

          It shows only on Social, because a + beside Guides or Expeditions would
          promise a create this app does not offer there.
        */}
        <ScreenHeader
          title="Explore"
          back={back}
          large
          action={
            onGroupsSurface ? (
              <button
                type="button"
                aria-label="Create a group"
                onClick={() => navigate("/explore/social?tab=groups&create=1")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
              >
                <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            ) : undefined
          }
        />
        <SegmentedTabs
          tabs={TABS}
          value={lit}
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
