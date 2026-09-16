/**
 * WHAT ICEFALL KNOWS ABOUT THE MOUNTAIN BEHIND A GROUP SAVED ON THIS PHONE.
 *
 * Moved out of `screens/explore/GroupWorkspace.tsx` unchanged (structure plan
 * §5.2) so that the read-only summary of a phone group can draw the same
 * photograph as the workspace it replaces, without either file importing the
 * other. The workspace still uses it, until §2.5 retires that screen.
 */
import { useMemo } from "react";

import type { Expedition } from "@/network/types";
import { useApp } from "@/state/AppState";

export interface GroupPeak {
  name: string;
  /** Only ever the figure recorded on the group itself. Never borrowed. */
  elevationM?: number;
  lat?: number;
  lon?: number;
  country?: string;
  photo?: string;
  wikipedia?: string;
  /** The athlete's goal for this mountain, when they have one. */
  goalId?: string;
  /**
   * The curated record's id, when the group's mountain is one ICEFALL has
   * surveyed. Readiness and the shared kit list are derived from an elevation
   * band, and for a reference entry that band is the only "assessment" there
   * is — so both are withheld without it, the same as on the goal's own pages.
   */
  curatedId?: string;
}

/**
 * What ICEFALL knows about the group's mountain.
 *
 * The elevation is ONLY ever the one stored on the group when it was created —
 * it came from OpenStreetMap through the create form, and every assessment
 * downstream is derived from it. The coordinates, photograph and country are
 * borrowed from the athlete's own goal or saved objective of the same name, and
 * ONLY when that record's elevation agrees with the group's to within 50 m.
 * Without that check a name collision — two peaks called Pico Norte — would
 * quietly hand this screen the wrong latitude, and latitude decides the permit
 * region on the kit list and the season on the assessment.
 */
export function useGroupPeak(group: Expedition): GroupPeak {
  const { goals, objectives } = useApp();

  return useMemo(() => {
    const name = group.peakName;
    const needle = name.trim().toLowerCase();
    const elevationM = group.elevationM;

    const agrees = (candidate: number | undefined) =>
      typeof elevationM === "number" &&
      typeof candidate === "number" &&
      Math.abs(candidate - elevationM) <= 50;

    const goal = goals.find((g) => g.name.trim().toLowerCase() === needle && agrees(g.elevationM));
    const objective = objectives.find(
      (o) => o.name.trim().toLowerCase() === needle && agrees(o.elevationM),
    );

    return {
      name,
      elevationM,
      lat: goal?.lat ?? objective?.lat,
      lon: goal?.lon ?? objective?.lon,
      country: goal?.country,
      photo: goal?.photo ?? objective?.photo,
      wikipedia: goal?.wikipedia ?? objective?.wikipedia,
      goalId: goal?.id,
      curatedId: goal?.mountainId ?? objective?.curatedId,
    };
  }, [group.peakName, group.elevationM, goals, objectives]);
}
