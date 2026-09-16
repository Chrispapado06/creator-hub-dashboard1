/**
 * "No signal — switch to Mountain mode?" — the offer in the full app.
 *
 * Losing signal mid-session never yanks the screen (plan §2.2). This row
 * offers the switch instead, and DISMISSING MEANS "NOT NOW", NEVER "NOT AGAIN":
 * it comes back on the next screen change and the next return to the
 * foreground. It cannot be dismissed at all while a trip is running today or
 * the turnaround is within the hour.
 *
 * Mounted only while the phone reports no network, so the online app renders
 * exactly what it rendered before.
 *
 * ON A TRIP DATE IT NAMES THE TRIP AND THE DAY (brief M3) — see `offerCopy.ts`.
 * The automatic switch is `useAutoMountainSwitch`; this row is what somebody
 * sees when that has already been spent, or when they left the mode by hand.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { WifiOff } from "lucide-react";

import { enterMountainMode } from "./mode";
import { offerMessage } from "./offerCopy";
import { MOUNTAIN_PATHS } from "./paths";
import { useMountainTrip } from "./trip";
import { OFFER_WINDOW_MS, msUntilTurnaround, useTurnaround } from "./turnaround";

export function MountainModeOffer() {
  const { pathname } = useLocation();
  const { trip, runningToday, day } = useMountainTrip();
  const { setting, now } = useTurnaround(runningToday ? trip?.id : null);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  useEffect(() => {
    const reoffer = () => {
      if (document.visibilityState === "visible") setDismissedAt(null);
    };
    document.addEventListener("visibilitychange", reoffer);
    return () => document.removeEventListener("visibilitychange", reoffer);
  }, []);

  const left = msUntilTurnaround(setting, now);
  const dismissible = !runningToday && !(left !== null && left <= OFFER_WINDOW_MS);
  const dismissed = dismissible && dismissedAt === pathname;

  return (
    <div
      role="status"
      className="flex shrink-0 flex-col gap-2 bg-alert/15 px-4 pb-2 text-alert"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <div className="flex items-center justify-center gap-2 text-center text-[13px] leading-snug">
        <WifiOff size={14} strokeWidth={2} aria-hidden className="shrink-0" />
        <span>
          {offerMessage({
            dismissed,
            tripName: runningToday ? (trip?.name ?? null) : null,
            dayNumber: runningToday && day?.kind === "during" ? day.dayNumber : null,
          })}
        </span>
      </div>
      {!dismissed && (
        <div className="flex gap-2">
          <Link
            to={MOUNTAIN_PATHS.root}
            onClick={enterMountainMode}
            className="flex min-h-16 flex-1 items-center justify-center rounded-full bg-alert text-[17px] font-medium text-obsidian"
          >
            Switch
          </Link>
          {dismissible && (
            <button
              type="button"
              onClick={() => setDismissedAt(pathname)}
              className="min-h-16 flex-1 rounded-full text-[17px] text-alert"
            >
              Not now
            </button>
          )}
        </div>
      )}
    </div>
  );
}
