/**
 * WHAT THE BATTERY SAVER IS ALLOWED TO DO TO GPS (brief M10, plan §6.2).
 *
 * One place decides it, so no screen can quietly choose its own settings and
 * no safety screen can be left behind when the rules change.
 *
 * TWO HONEST LIMITS, both measured into the plan:
 *
 *  1. The web has no sampling rate. `watchPosition` takes three settings and
 *     none of them is "every N seconds". So "lower sampling" here means:
 *     high accuracy off, an older fix accepted, and fixes we ignore rather
 *     than draw. Ignoring a fix saves screen redraws and writes — it does NOT
 *     turn the receiver down. Only `enableHighAccuracy: false` does that, by
 *     letting the phone answer from wifi and masts instead of the GPS chip.
 *     The gap only bites while somebody is moving; standing still, the phone
 *     sends far fewer fixes anyway.
 *
 *  2. Because of what (1) really does, it is dangerous in exactly the place
 *     it would save the most. At 4,000 m there is no wifi and there are no
 *     masts, so a phone told it may skip the GPS chip can return nothing.
 *     HIGH ACCURACY IS FORCED BACK ON while recording, on SOS, and whenever
 *     the phone reports no network — whatever the setting says.
 *
 * Nothing here makes a network request. GPS only receives.
 */

import { useEffect, useState } from "react";

import { gpsOptions } from "@/settings/mountain";
import { useBatterySaver } from "@/settings/useMountainSettings";

export type GpsPurpose =
  /** The SOS screen. Never saved on, ever. */
  | "sos"
  /** A recording in progress. The track has to be accurate. */
  | "recording"
  /** A screen showing where you are (Now, Map, Retrace). */
  | "screen"
  /** The background breadcrumb trail, which does its own distance thinning. */
  | "track";

export interface GpsConditions {
  /** Battery saver's resolved GPS lever — `useBatterySaver().gps`. */
  saverGps: boolean;
  /** The phone itself reports no network. Forces full accuracy. */
  offline: boolean;
}

export interface GpsPlan {
  purpose: GpsPurpose;
  highAccuracy: boolean;
  /** Pass straight to `watchPosition` / `getCurrentPosition`. */
  options: PositionOptions;
  /** Ignore a fix arriving sooner than this after the last one we used. 0 = use every fix. */
  minFixGapMs: number;
  /** Drop the watch while the page is hidden. Never true for SOS or a recording. */
  pauseWhenHidden: boolean;
  /** One short line for a settings or status row. */
  reason: string;
  /**
   * Everything above, as one string. Use it as the effect dependency that
   * restarts a GPS watch. A theme or text-size change cannot alter it, so it
   * cannot restart the watch — see `gpsPower.test.ts`.
   */
  key: string;
}

/** A screen redraw every 15 s is enough with gloves on, and it is the only saving on offer. */
export const SAVER_SCREEN_FIX_GAP_MS = 15_000;

export const FULL_GPS_REASON = "Full GPS accuracy.";
export const SAVER_GPS_REASON = "Battery saver: lower GPS accuracy, and the position updates less often.";
export const SOS_GPS_REASON = "Full GPS accuracy on SOS, whatever the battery setting says.";
export const RECORDING_GPS_REASON = "Full GPS accuracy while recording, so your track stays accurate.";
export const NO_SIGNAL_GPS_REASON =
  "Full GPS accuracy because you have no signal. Without a signal, GPS is the only thing that can find you.";

const FULL: PositionOptions = gpsOptions({ gps: false });
const SAVED: PositionOptions = gpsOptions({ gps: true });

function plan(
  purpose: GpsPurpose,
  options: PositionOptions,
  minFixGapMs: number,
  pauseWhenHidden: boolean,
  reason: string,
): GpsPlan {
  const highAccuracy = options.enableHighAccuracy === true;
  return {
    purpose,
    highAccuracy,
    options,
    minFixGapMs,
    pauseWhenHidden,
    reason,
    key: [
      purpose,
      highAccuracy ? "hi" : "lo",
      options.maximumAge ?? 0,
      options.timeout ?? 0,
      minFixGapMs,
      pauseWhenHidden ? "pause" : "keep",
    ].join("|"),
  };
}

/**
 * The whole rule, as one pure function. Order matters: the three overrides are
 * read before the setting is.
 */
export function gpsPlan(purpose: GpsPurpose, c: GpsConditions): GpsPlan {
  if (purpose === "sos") return plan(purpose, FULL, 0, false, SOS_GPS_REASON);
  if (purpose === "recording") return plan(purpose, FULL, 0, false, RECORDING_GPS_REASON);
  if (c.offline) return plan(purpose, FULL, 0, false, NO_SIGNAL_GPS_REASON);
  if (!c.saverGps) return plan(purpose, FULL, 0, false, FULL_GPS_REASON);
  // The breadcrumb trail already drops fixes by distance (`geo.ts`), so a
  // second gap on top of it would punch holes in the retrace line.
  const gap = purpose === "track" ? 0 : SAVER_SCREEN_FIX_GAP_MS;
  return plan(purpose, SAVED, gap, true, SAVER_GPS_REASON);
}

/**
 * Should this fix be used, given when the last one was used?
 *
 * A fix is never thrown away — `position.ts` stores every one. This only says
 * whether to redraw for it.
 */
export function shouldUseFix(lastUsedAt: number | null, fixAt: number, minFixGapMs: number): boolean {
  if (minFixGapMs <= 0 || lastUsedAt === null) return true;
  // The phone's clock moved backwards; waiting for a gap that can never pass
  // would freeze the screen.
  if (fixAt < lastUsedAt) return true;
  return fixAt - lastUsedAt >= minFixGapMs;
}

/** True only when the phone itself says it has no network. A claim of "online" is never trusted. */
export function phoneReportsOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Live plan for a screen. Re-reads when battery saver resolves differently or
 * the phone loses its network; a theme or text-size change leaves `key` alone.
 */
export function useGpsPlan(purpose: GpsPurpose): GpsPlan {
  const saver = useBatterySaver();
  const [offline, setOffline] = useState(phoneReportsOffline);

  useEffect(() => {
    const read = () => setOffline(phoneReportsOffline());
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);

  return gpsPlan(purpose, { saverGps: saver.gps, offline });
}
