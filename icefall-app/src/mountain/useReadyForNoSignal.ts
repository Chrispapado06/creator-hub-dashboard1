/**
 * The one reading of "Ready for no signal" (brief M8).
 *
 * The page and the small card both call this, so the card can never say two
 * things are missing while the page it opens says three. The arithmetic itself
 * is in `readyModel.ts`; this only gathers the facts.
 *
 * It reads. It downloads nothing on its own unless asked to (`auto`), because
 * the card sits on screens the athlete did not open to start a download.
 */

import { useCallback, useEffect, useState } from "react";

import { useReachability } from "@/connection/reachability";
import { useStorageStatus } from "@/device/storageStatus";
import { useInstall } from "@/lib/install";
import { peekLocationPermission } from "@/tracking/sources/geolocation";
import { useTraining } from "@/tracking/training";

import { useEmergencyInfo } from "./emergencyInfo";
import { readyItems, readySummary, type ReadyItem, type ReadySummary } from "./readyModel";
import { offlineMapSource, subjectFromTrip, useTripPack, type UseTripPack } from "./tripPack";
import { useMountainTrip } from "./trip";
import { readTurnaround } from "./turnaround";
import type { TripDay } from "./tripModel";

export type LocationPermission = "granted" | "denied" | "prompt" | "unknown";

export interface UseReadyForNoSignal {
  items: ReadyItem[];
  summary: ReadySummary;
  trip: { id: string; name: string } | null;
  day: TripDay | null;
  pack: UseTripPack;
  storage: ReturnType<typeof useStorageStatus>;
  install: ReturnType<typeof useInstall>;
  location: LocationPermission;
  /** Ask for one position, which is the only way to answer the location line. */
  askLocation: () => void;
  /** From the reachability check (M2), never `navigator.onLine`. */
  confirmedOnline: boolean;
}

export function useReadyForNoSignal({ auto = false }: { auto?: boolean } = {}): UseReadyForNoSignal {
  const { trip, today, day } = useMountainTrip();
  const { plan } = useTraining();
  const info = useEmergencyInfo();
  const storage = useStorageStatus();
  const install = useInstall();
  const reach = useReachability();
  const [location, setLocation] = useState<LocationPermission>("unknown");

  // Read once and whenever the app comes back: a setting changed in the phone's
  // own settings is not an event this page can hear.
  useEffect(() => {
    let alive = true;
    const read = () => {
      void peekLocationPermission().then((state) => {
        if (alive) setLocation(state === "unknown" ? "unknown" : (state as LocationPermission));
      });
    };
    read();
    window.addEventListener("focus", read);
    return () => {
      alive = false;
      window.removeEventListener("focus", read);
    };
  }, []);

  const askLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocation("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setLocation("granted"),
      (err) => setLocation(err.code === err.PERMISSION_DENIED ? "denied" : "prompt"),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  }, []);

  const subject = subjectFromTrip(trip, {
    today,
    plan,
    ownEmergencyInfo: info ? { filled: true, savedAt: info.savedAt } : null,
  });

  const confirmedOnline = reach.state === "reachable";
  const pack = useTripPack(subject, { confirmedOnline, auto });

  const setting = trip ? readTurnaround(trip.id) : null;

  const items = readyItems({
    trip: trip ? { id: trip.id, name: trip.name } : null,
    pack: {
      rows: pack.rows,
      loading: pack.loading,
      storageOk: pack.storageOk,
      storageSentence: pack.storageSentence,
    },
    offlineMapSource: offlineMapSource() !== null,
    emergency: info
      ? {
          contacts: info.contacts.length,
          insurance: Boolean(info.insurer || info.policyRef || info.rescueHotline),
        }
      : null,
    turnaround: { set: Boolean(setting), label: setting ? setting.time : null },
    storage,
    install: install.mode,
    location,
  });

  return {
    items,
    summary: readySummary(items),
    trip: trip ? { id: trip.id, name: trip.name } : null,
    day,
    pack,
    storage,
    install,
    location,
    askLocation,
    confirmedOnline,
  };
}
