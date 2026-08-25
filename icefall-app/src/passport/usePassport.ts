import { useMemo } from "react";
import { useApp } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";
import { buildPassport, type Passport } from "./model";

/**
 * The passport, assembled from what the app already holds.
 *
 * Wiring only — every judgement lives in `model.ts`, which is pure and testable.
 * Nothing is read here that the athlete has not either recorded or entered.
 *
 * `user.experience` is passed alongside `user.onboarded` rather than on its own
 * because AppState falls back to the demo fixture's experience level for anyone
 * who has not been through onboarding; the model refuses to print that as a
 * claim the athlete made. See `PassportInput.onboarded`.
 */
export function usePassport(): Passport {
  const { user, goals, objectives, coachProfile, expeditions } = useApp();
  const activities = useRecordedActivities();

  return useMemo(
    () =>
      buildPassport({
        name: user.name,
        memberSince: user.memberSince,
        onboarded: user.onboarded,
        declaredExperience: user.experience,
        summitsLogged: user.summits,
        objectives,
        goals,
        activities,
        coachProfile,
        expeditions,
      }),
    [
      user.name,
      user.memberSince,
      user.onboarded,
      user.experience,
      user.summits,
      objectives,
      goals,
      activities,
      coachProfile,
      expeditions,
    ],
  );
}
