import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ScreenHeader, SegmentedTabs } from "@/components/layout/chrome";

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
  { value: "/explore/routes", label: "Find" },
  { value: "/explore/mountains", label: "Mountains" },
  { value: "/explore/social", label: "Social" },
  { value: "/explore/expeditions", label: "Expeditions" },
  { value: "/explore/guides", label: "Guides" },
];

/** The hub. Reached by the back chevron from any tab. */
const HUB = "/explore/hub";

/** Everything beyond your own training lives here. */
export default function ExploreLayout() {
  const { pathname } = useLocation();
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

  return (
    // This header clears the notch, so nested `Screen`s must not clear it again.
    <div className="flex h-full flex-col" style={{ "--screen-safe-top": "0px" } as React.CSSProperties}>
      <div className="shrink-0 px-5" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* The chevron is the way back to the hub from a tab. Without it the
            hub would be reachable only by leaving Explore and returning. */}
        <ScreenHeader title="Explore" back={onHub ? undefined : HUB} large />
        <SegmentedTabs tabs={TABS} value={lit} onChange={(v) => navigate(v)} variant="section" />
      </div>
      {/* Must be a flex column: `Screen` inside uses `flex-1 overflow-y-auto`,
          which does nothing under a block parent — the list grew to its full
          height and was clipped instead of scrolling. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
