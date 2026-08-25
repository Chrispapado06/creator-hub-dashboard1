import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { SegmentedTabs } from "@/components/layout/chrome";

const TABS = [
  { value: "/coach", label: "Chat" },
  { value: "/coach/today", label: "Today" },
  { value: "/coach/plan", label: "Plan" },
  { value: "/coach/progress", label: "Progress" },
] as const;

/**
 * Coach owns the surfaces that answer "what should I do today, and why?".
 *
 * The tab strip belongs to the four top-level surfaces only. Everything reached
 * from them — a session, the check-in, readiness, recovery — is a detail view
 * with its own back control, and showing tabs there would offer an escape hatch
 * that loses the athlete's place mid-task.
 */
const DETAIL_PREFIXES = [
  "/coach/session",
  "/coach/check-in",
  "/coach/readiness",
  "/coach/recovery",
  "/coach/nutrition",
  "/coach/prep",
  // Linked from Home and from empty session states; without this it rendered
  // under the strip with the CHAT tab lit, since unmatched paths fall back to
  // "/coach".
  "/coach/training",
];

export default function CoachLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isDetail = DETAIL_PREFIXES.some((p) => pathname.startsWith(p));
  // `/coach` and `/coach/chat` are the same surface, so both light the Chat tab.
  const normalised = pathname === "/coach/chat" ? "/coach" : pathname;
  const active = (TABS.find((t) => t.value === normalised)?.value ??
    "/coach") as (typeof TABS)[number]["value"];

  return (
    // When the tab strip is showing it clears the notch, so a nested `Screen`
    // must not clear it a second time. On a detail route there is no strip, so
    // the screen keeps the inset and owns the top edge itself.
    <div
      className="flex h-full flex-col"
      style={isDetail ? undefined : ({ "--screen-safe-top": "0px" } as React.CSSProperties)}
    >
      {!isDetail && (
        <div
          className="shrink-0 px-5"
          // The inset alone left the strip flush against the top edge wherever
          // there is no notch; the added space is what gives it room to breathe.
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)", paddingBottom: "2px" }}
        >
          <SegmentedTabs tabs={TABS} value={active} onChange={(v) => navigate(v)} />
        </div>
      )}
      {/* Must be a flex column: `Screen` inside uses `flex-1 overflow-y-auto`,
          which does nothing under a block parent — the content grew to its full
          height and was clipped instead of scrolling. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
