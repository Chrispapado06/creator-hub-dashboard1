/**
 * THE FORECAST ON THE NOW TAB — the one thing on that screen that wants a
 * signal (brief M3: "with signal, extras light up").
 *
 * IT IS NOT A SAFETY FEATURE AND NOTHING SAFE DEPENDS ON IT. SOS, the symptom
 * check, the turnaround alarm, daylight, altitude and every distance are worked
 * out on the phone and never come through here. This file is kept OUT of
 * `nowModel.ts` for that reason: the pure model may not reach a module that can
 * make a request (plan §8.1 #1, enforced by `trip/offline.test.ts`), and the
 * wording and arithmetic of the row live there where they can be tested.
 *
 * WHEN IT ASKS. Only when the reachability check has CONFIRMED a connection —
 * never on `navigator.onLine`, which reads true on a mountain. Never on a timer.
 * With no signal it asks for nothing, says so, and whatever was fetched earlier
 * in this session stays on screen WITH ITS AGE until the age rules withhold it.
 *
 * IT IS NOT SAVED. Keeping a forecast across launches is the trip pack's job
 * (M8), which stamps and ages it properly. This is a session cache so that
 * moving between tabs does not re-ask.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useReachability } from "@/connection/reachability";
import { OFFLINE } from "@/offline/offline";
import {
  CONDITIONS_ATTRIBUTION,
  CONDITIONS_DISCLAIMER,
  currentAgeSentence,
  describeWeatherCode,
  forecastAge,
  getMountainConditions,
  type MountainConditions,
} from "@/services/conditions";
import { useBatterySaver } from "@/settings/useMountainSettings";
import { useConnectivity } from "@/trip/connectivity";

import {
  FORECAST_EMPTY,
  FORECAST_FAILED,
  forecastView,
  type ForecastSubject,
  type ForecastView,
} from "./nowModel";
import { confirmedOnline } from "./signal";

/** A review build's weather figures are invented. Mountain mode shows none of them. */
const OFFLINE_BUILD_FAILURE = "This review build has no real forecast, so none is shown here.";

interface Held {
  conditions: MountainConditions;
  /** The instant the reading describes, or — when the provider did not say — when it arrived. */
  at: number;
  conditionWord: string | null;
}

const key = (s: ForecastSubject) => `${s.lat.toFixed(3)},${s.lon.toFixed(3)},${s.elevationM}`;

/** Session only. Cleared by a reload, exactly like everything else the tab holds. */
const held = new Map<string, Held>();
const failures = new Map<string, string>();

function isEmpty(c: MountainConditions): boolean {
  const v = c.current;
  return (
    v.temperatureC.value === null &&
    v.windKph.value === null &&
    v.freezingLevelM.value === null &&
    v.visibilityM.value === null &&
    v.weatherCode.value === null
  );
}

export interface UseNowForecast {
  view: ForecastView;
  /** Shown under anything the provider sent, never on its own. */
  attribution: string;
  disclaimer: string;
  /** Null with no signal: a button that cannot work must not be offered. */
  refresh: (() => void) | null;
  refreshing: boolean;
  /** True only when the check confirmed a connection. */
  online: boolean;
}

/**
 * `now` comes from the screen's own tick so the age ages, and so this hook
 * starts no clock of its own.
 */
export function useNowForecast(subject: ForecastSubject | null, now: number): UseNowForecast {
  const signal = useConnectivity();
  const reach = useReachability();
  const online = confirmedOnline(reach, signal.state === "unreachable");
  const saver = useBatterySaver();

  const [, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const running = useRef<string | null>(null);

  const k = subject ? key(subject) : null;
  const have = k ? (held.get(k) ?? null) : null;
  const age = have ? forecastAge(have.at, now) : null;

  const fetchNow = useCallback(async (subj: ForecastSubject, id: string) => {
    if (running.current === id) return;
    running.current = id;
    setRefreshing(true);
    try {
      const c = await getMountainConditions({
        peakName: subj.peakName,
        elevationM: subj.elevationM,
        lat: subj.lat,
        lon: subj.lon,
      });
      if (c.error) failures.set(id, FORECAST_FAILED);
      else if (isEmpty(c)) failures.set(id, FORECAST_EMPTY);
      else {
        failures.delete(id);
        held.set(id, {
          conditions: c,
          /* The provider's own stamp when it sent one. Without it, the moment
               it reached this phone — which is what "read 2 h ago" then means. */
          at: c.readAt ?? Date.now(),
          conditionWord: describeWeatherCode(c.current.weatherCode.value),
        });
      }
    } catch {
      // getMountainConditions catches its own failures; this is belt and braces.
      failures.set(id, FORECAST_FAILED);
    } finally {
      running.current = null;
      setRefreshing(false);
      setVersion((n) => n + 1);
    }
  }, []);

  /*
   * ONE DECISION, NO TIMER: ask when there is a confirmed connection and
   * nothing fresh on the phone. Battery saver stops the REPEAT ask, not the
   * first one — a saver that leaves the screen permanently saying "no forecast"
   * while the phone has a signal is not saving battery, it is withholding
   * weather (plan §6.2).
   */
  useEffect(() => {
    if (!subject || !k || !online || OFFLINE) return;
    if (failures.has(k)) return;
    const current = held.get(k);
    if (current) {
      if (saver.pauseBackgroundRefresh) return;
      if (forecastAge(current.at, Date.now())?.current === "fresh") return;
    }
    void fetchNow(subject, k);
  }, [subject, k, online, saver.pauseBackgroundRefresh, fetchNow]);

  const refresh = useCallback(() => {
    if (!subject || !k || !online) return;
    failures.delete(k);
    void fetchNow(subject, k);
  }, [subject, k, online, fetchNow]);

  const failure = OFFLINE ? OFFLINE_BUILD_FAILURE : k ? (failures.get(k) ?? null) : null;

  return {
    view: forecastView({
      hasCoords: subject !== null,
      conditions: OFFLINE ? null : (have?.conditions ?? null),
      conditionWord: have?.conditionWord ?? null,
      band: age?.current ?? null,
      ageSentence: currentAgeSentence(age),
      loading: refreshing && !have,
      online,
      failure,
    }),
    attribution: CONDITIONS_ATTRIBUTION,
    disclaimer: CONDITIONS_DISCLAIMER,
    refresh: online && !OFFLINE ? refresh : null,
    refreshing,
    online,
  };
}
