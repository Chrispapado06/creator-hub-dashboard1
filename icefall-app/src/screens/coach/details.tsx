import { ScreenHeader } from "@/components/layout/chrome";
import Nutrition from "@/screens/Nutrition";
import CoachPlan from "@/screens/coach/CoachPlan";

/**
 * THE TWO SCREENS THE REDESIGN REPLACED AS TABS, KEPT AS DETAIL VIEWS.
 *
 * `Nutrition` (every input the energy engine reads, the food log composer,
 * the hydration log) and `CoachPlan` (the phases view and the month calendar)
 * hold real, working functionality that the owner's Fuel and Plan designs do
 * not draw. Deleting them would lose it; leaving them as tabs would show two
 * Fuels. So each becomes the depth behind a link on its redesigned tab —
 * "Adjust" and "Log food" on Fuel, "Full calendar" on Plan — with a back
 * control, because there is no strip above a detail route.
 *
 * Neither screen draws a header of its own that can go back, and both render
 * their own `Screen` scroller, so the wrapper supplies the header above the
 * scroller and zeroes `--screen-safe-top` for the same reason the layouts do:
 * the header has cleared the notch, and the screen must not clear it again.
 */
function DetailShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ "--screen-safe-top": "0px" } as React.CSSProperties}
    >
      <div className="shrink-0 px-5" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <ScreenHeader title={title} back />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** `/coach/nutrition` — the engine's inputs and the food log, behind Fuel. */
export function FuelDetails() {
  return (
    <DetailShell title="Fuel inputs">
      <Nutrition />
    </DetailShell>
  );
}

/** `/coach/plan/calendar` — phases and the month view, behind Plan. */
export function PlanCalendar() {
  return (
    <DetailShell title="Full plan">
      <CoachPlan />
    </DetailShell>
  );
}
