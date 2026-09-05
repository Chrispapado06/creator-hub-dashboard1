import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTabSwipe } from "@/hooks/useTabSwipe";
import { COACH_TABS, activeCoachTab } from "@/screens/coach/shell";

/**
 * Coach owns the surfaces that answer "what should I do today, and why?" —
 * five of them, to the owner's designs of 2026-09-04: Today, Plan, Fuel,
 * Progress, Chat. TODAY IS THE DEFAULT. Chat used to land first ("the Coach is
 * a conversation first"); the owner's redesign opens on the next step instead,
 * and says so in its own brief: "Chat should not open first."
 *
 * The strip is not here any more. It used to be pinned above the outlet;
 * the designs show the serif title, the objective and the strip all scrolling
 * away together, so each tab page draws `CoachHead` at the top of its own
 * scroller. What stays in the layout is only what every route shares:
 *
 *   · NOT the theme. An earlier version stamped `data-theme="light"` here so
 *     the section matched its light designs — which overrode a dark
 *     preference for exactly these pages. The theme is the person's
 *     (Settings › Appearance, or the phone's under "System"), the bootstrap in
 *     index.html is the only thing that sets it, and the pages draw correctly
 *     in both through the editorial palette's per-theme variables;
 *   · the swipe between the five tabs, which needs the layout's wrapper to
 *     bind to and is OFF on detail routes — a session or the check-in must not
 *     slide sideways into Plan mid-task.
 *
 * Fuel's tab used to be `/coach/nutrition`; that path is now the detail view
 * holding the engine's inputs and the food log (see `coach/details.tsx`), so
 * every existing link to it still lands on something true.
 */
const DETAIL_PREFIXES = [
  "/coach/session",
  "/coach/check-in",
  "/coach/readiness",
  "/coach/recovery",
  "/coach/prep",
  "/coach/training",
  "/coach/nutrition",
  "/coach/plan/calendar",
  "/coach/progress/history",
];

export default function CoachLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isDetail = DETAIL_PREFIXES.some((p) => pathname.startsWith(p));
  const active = activeCoachTab(pathname);

  const swipe = useTabSwipe({
    tabs: COACH_TABS.map((t) => t.value),
    current: active,
    enabled: !isDetail,
    onNavigate: (v) => navigate(v),
  });

  return (
    // No header here, so `--screen-safe-top` is NOT zeroed: each page's own
    // `Screen` clears the notch. The detail wrappers zero it themselves.
    // Must be a flex column: `Screen` inside uses `flex-1 overflow-y-auto`,
    // which does nothing under a block parent.
    <div className="flex h-full min-h-0 flex-col" {...(isDetail ? {} : swipe.bind)}>
      <Outlet />
    </div>
  );
}
