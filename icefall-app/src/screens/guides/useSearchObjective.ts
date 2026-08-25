import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { usePrimaryGoal } from "@/state/AppState";
import { sync } from "@/services/repository";
import type { Goal } from "@/types";

/**
 * The mountain the marketplace is matching against.
 *
 * Two sources, in this order, and the screen says which one it used:
 *
 *   ?peak=   the athlete arrived from a mountain's page and asked about THAT
 *            mountain. It wins: they are not browsing, they are asking.
 *   the goal the objective they are actually training for, which is the honest
 *            default when nobody has asked about anything else.
 *
 * Shared by the directory and the profile so the two cannot end up comparing a
 * guide against different mountains on adjacent screens.
 */
export interface SearchObjective {
  peakName: string;
  elevationM?: number;
  lat?: number;
  lon?: number;
  /** May be compound — "France / Italy" — for a peak on a border. */
  country?: string;
  targetDate?: string;
  goalId?: string;
  /** Where it came from, so a screen can state it rather than imply it. */
  source: "query" | "goal";
}

const num = (v: string | null): number | undefined => {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function objectiveFromGoal(goal: Goal): SearchObjective {
  // The goal carries the mountain by id; the curated record is where the
  // coordinates and the country live, and matching needs both to recognise a
  // peak under a second name or across a border.
  const mountain = goal.mountainId ? sync.mountainById(goal.mountainId) : undefined;
  return {
    peakName: goal.name,
    elevationM: goal.elevationM ?? mountain?.elevationM,
    lat: goal.lat ?? mountain?.coords.lat,
    lon: goal.lon ?? mountain?.coords.lon,
    country: goal.country ?? mountain?.country,
    targetDate: goal.targetDate,
    goalId: goal.id,
    source: "goal",
  };
}

export function useSearchObjective(): SearchObjective | null {
  const [params] = useSearchParams();
  const goal = usePrimaryGoal();
  const peakParam = params.get("peak");

  return useMemo<SearchObjective | null>(() => {
    if (peakParam && peakParam.trim() !== "") {
      return {
        peakName: peakParam.trim(),
        elevationM: num(params.get("elevation")),
        lat: num(params.get("lat")),
        lon: num(params.get("lon")),
        country: params.get("country") ?? undefined,
        targetDate: params.get("date") ?? undefined,
        goalId: params.get("goal") ?? undefined,
        source: "query",
      };
    }
    return goal ? objectiveFromGoal(goal) : null;
  }, [peakParam, params, goal]);
}
