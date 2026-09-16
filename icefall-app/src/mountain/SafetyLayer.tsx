/**
 * THE TURNAROUND ALARM, MOUNTED ABOVE THE ROUTES (plan §2.8, §3.7, §10.4 item 8).
 *
 * Rendered once in `App.tsx`, outside `<Routes>`, so it does not depend on which
 * layout a screen sits in: "an alarm that only fires where you happen to be
 * standing is not an alarm". It draws nothing unless a turnaround time is set
 * and near or passed, so the full app is unchanged for everyone else.
 *
 *   Mountain mode   alarm · SOS is in the shell's top bar
 *   Live tracker    alarm · SOS is in the tracker's own header, while in
 *                   Mountain mode or on a trip day (`LiveTracker.tsx`)
 *   Everywhere else alarm · the full-screen alarm carries its own SOS
 *
 * The SOS is not floated over the tracker: every free corner of it holds a
 * control or a reading, so it sits in the header rows instead.
 */

import { useLocation } from "react-router-dom";

import TurnaroundAlarm from "./TurnaroundAlarm";
import { isLiveTrackerPath, isMountainModePath } from "./paths";

export function SafetyLayer() {
  const { pathname } = useLocation();
  const placement = isMountainModePath(pathname) ? "mountain" : isLiveTrackerPath(pathname) ? "tracker" : "app";
  return <TurnaroundAlarm placement={placement} />;
}
