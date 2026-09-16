/**
 * Battery level — where the browser exposes it, and nowhere else.
 *
 * Safari has never implemented the Battery Status API, on any version, and
 * every iPhone browser is Safari underneath. So `null` means "draw nothing":
 * not a dash, not a blank (plan §3.1). A native wrapper would add a second
 * implementation here; no screen changes.
 */

import { useEffect, useState } from "react";

export interface BatteryReading {
  /** 0–100, whole percent. */
  percent: number;
  charging: boolean;
}

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

export function useBattery(): BatteryReading | null {
  const [reading, setReading] = useState<BatteryReading | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
    if (typeof nav.getBattery !== "function") return;
    let battery: BatteryManagerLike | null = null;
    let cancelled = false;
    const update = () => {
      if (!battery || cancelled) return;
      setReading({ percent: Math.round(battery.level * 100), charging: battery.charging });
    };
    nav
      .getBattery()
      .then((b) => {
        battery = b;
        update();
        b.addEventListener("levelchange", update);
        b.addEventListener("chargingchange", update);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      battery?.removeEventListener("levelchange", update);
      battery?.removeEventListener("chargingchange", update);
    };
  }, []);

  return reading;
}
