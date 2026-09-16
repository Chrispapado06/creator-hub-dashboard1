/**
 * ONE WRITE PATH FOR THE COACHING ANSWERS, USED BY EVERY SCREEN THAT CHANGES
 * ONE.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The questionnaire's answers do not live in one place, and they should not:
 * equipment, days, skills and limitations are `CoachProfile` in `AppState`;
 * weight is `AppState.bodyMassKg`; height and year of birth are
 * `settings/store.ts`, because that is where `fuelDay.dailyEnergyFor` reads
 * them; the objective is a `Goal`. Any screen that wants to change an answer
 * therefore has to know four stores, the server write, and the record of what
 * is waiting to be sent.
 *
 * A second screen learning all of that separately is how two screens start
 * disagreeing — writing one store and not another, or writing the device and
 * never the account. So the mapping is written down once, here, and
 * `screens/settings/CoachingProfile.tsx` and `settings/hydrate.ts` both go
 * through it.
 *
 * ── THE ORDER IS THE POINT ──────────────────────────────────────────────────
 *
 * `save` writes the DEVICE first, synchronously, then marks the fields unsent,
 * then sends. That order is what makes the app work in a hut with no signal and
 * what makes rule 1 of `settings/hydrate.ts` true: between the local write and
 * the send the answer exists only on this phone, and the mark is what stops the
 * next fetch from replacing it with the server's older value.
 *
 * The marks are dropped on ATTEMPT, not on success, and re-applied for whatever
 * did not arrive — the same promise the profile half makes. A mark that stayed
 * set after a successful send would make every later fetch refuse the server
 * for ever.
 *
 * ── WHAT IT DOES NOT TOUCH ─────────────────────────────────────────────────
 *
 * The athlete's NAME, which is `profiles.display_name` and belongs to
 * `settings/sync.ts:saveProfile` and the Edit profile screen; gender, sex at
 * birth and where they heard about ICEFALL, which have their own functions and
 * their own reasons for not being editable here (see the edit screen); and
 * `onboarded_at`, which records that somebody finished the questions and would
 * be a false claim if an edit re-stamped it.
 */
import { useCallback } from "react";

import type { DeviceCoachingAnswers } from "@/settings/hydrate";
import {
  forgetUnsentCoachingFields,
  noteUnsentCoachingField,
  saveCoachingAnswers,
  type CoachingAnswersEdit,
  type CoachingAnswersResult,
  type CoachingFieldName,
} from "@/settings/sync";
/* `currentSettings()` RATHER THAN `useSettings()`, and the difference matters
   at the call site. This hook is used by `AppShell`, which is above the whole
   router; subscribing it to the settings store would re-render the entire app
   every time anybody flipped a visibility toggle or a theme. `device()` is a
   getter called imperatively — never during render — so it reads the live value
   at the moment it is asked, which is also the more correct thing for the
   before-and-after comparison the merge does with it. */
import { currentSettings, patchSettings } from "@/settings/store";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import type { Discipline, ExperienceLevel } from "@/types";

/** The union the app's own `Discipline` type holds, for narrowing raw strings. */
const DISCIPLINE_IDS: readonly Discipline[] = [
  "hiking",
  "trail-running",
  "mountaineering",
  "climbing",
  "ski-touring",
  "alpine-expedition",
];

const EXPERIENCE_IDS: readonly ExperienceLevel[] = ["new", "developing", "experienced", "advanced"];

export interface CoachingBinding {
  /** What this device holds right now, in `sync.ts`'s vocabulary. */
  device: () => DeviceCoachingAnswers;
  /** Write a patch to the device and NOWHERE ELSE. The fetch's landing place. */
  apply: (patch: CoachingAnswersEdit) => void;
  /** Write to the device, mark unsent, send. Returns what the server said. */
  save: (patch: CoachingAnswersEdit) => Promise<CoachingAnswersResult>;
}

export function useCoachingBinding(): CoachingBinding {
  const {
    coachProfile,
    updateCoachProfile,
    bodyMassKgSet,
    setBodyMassKg,
    user,
    addGoal,
    updateAthleteBasics,
  } = useApp();
  const primary = usePrimaryGoal();

  const device = useCallback((): DeviceCoachingAnswers => {
    const settings = currentSettings();
    const answers: DeviceCoachingAnswers = {
      experience: user.experience,
      disciplines: user.disciplines,
      disciplineExperience: coachProfile.disciplineExperience,
      availableEquipment: coachProfile.availableEquipment,
      trainingDays: coachProfile.trainingDays,
      technicalSkills: coachProfile.technicalSkills,
      limitations: coachProfile.limitations ?? [],
      limitationsNote: coachProfile.limitationsNote ?? "",
      altitudeIllness: coachProfile.altitudeIllness ?? null,
      trainingBaseline: coachProfile.trainingBaseline ?? null,
      movementExperience: coachProfile.movementExperience ?? null,
    };
    /* Left ABSENT rather than sent as a number when nobody has answered — the
       whole reason `bodyMassKgSet` exists beside `bodyMassKg`, and the reason
       `typicalSessionMin` lost its 60 default. An invented figure here would be
       uploaded as this athlete's own. */
    if (typeof coachProfile.typicalSessionMin === "number") {
      answers.typicalSessionMin = coachProfile.typicalSessionMin;
    }
    if (typeof coachProfile.maxAltitudeM === "number") {
      answers.maxAltitudeM = coachProfile.maxAltitudeM;
    }
    if (bodyMassKgSet !== null) answers.bodyMassKg = bodyMassKgSet;
    if (typeof settings.heightCm === "number") answers.heightCm = settings.heightCm;
    if (typeof settings.birthYear === "number") answers.birthYear = settings.birthYear;
    if (primary) {
      answers.objective = {
        goalName: primary.name,
        ...(primary.mountainId ? { goalMountainId: primary.mountainId } : {}),
        ...(typeof primary.elevationM === "number" ? { goalElevationM: primary.elevationM } : {}),
        goalTargetDate: primary.targetDate,
        ...(primary.trainingStartedAt ? { goalTrainingStartedAt: primary.trainingStartedAt } : {}),
      };
    }
    return answers;
  }, [coachProfile, user.experience, user.disciplines, bodyMassKgSet, primary]);

  const apply = useCallback(
    (patch: CoachingAnswersEdit) => {
      /* One `updateCoachProfile` call, not eight: it merges by key, and eight
         calls would be eight renders and eight localStorage writes for one
         arriving row. */
      const profile: Parameters<typeof updateCoachProfile>[0] = {};
      if (patch.disciplineExperience) {
        const levels: Record<string, "beginner" | "intermediate" | "advanced" | "expert"> = {};
        for (const [id, level] of Object.entries(patch.disciplineExperience)) {
          if (
            level === "beginner" ||
            level === "intermediate" ||
            level === "advanced" ||
            level === "expert"
          ) {
            levels[id] = level;
          }
        }
        profile.disciplineExperience = levels;
      }
      if (patch.availableEquipment) profile.availableEquipment = patch.availableEquipment;
      if (patch.trainingDays) profile.trainingDays = patch.trainingDays;
      if (patch.technicalSkills) profile.technicalSkills = patch.technicalSkills;
      if (patch.limitations) profile.limitations = patch.limitations;
      if (patch.limitationsNote !== undefined) profile.limitationsNote = patch.limitationsNote;
      if (patch.altitudeIllness !== undefined) profile.altitudeIllness = patch.altitudeIllness;
      if (patch.trainingBaseline !== undefined) profile.trainingBaseline = patch.trainingBaseline;
      if (patch.typicalSessionMin !== undefined) {
        profile.typicalSessionMin = patch.typicalSessionMin ?? undefined;
      }
      if (patch.maxAltitudeM !== undefined) profile.maxAltitudeM = patch.maxAltitudeM ?? undefined;
      if (patch.movementExperience !== undefined) {
        /* `null` is the decline and `undefined` is never-asked; the generator
           treats them identically, so the decline is stored as an absence
           rather than as a level the engine would then read. */
        profile.movementExperience = patch.movementExperience ?? undefined;
      }
      if (Object.keys(profile).length > 0) updateCoachProfile(profile);

      if (typeof patch.bodyMassKg === "number") setBodyMassKg(patch.bodyMassKg);
      const body: { heightCm?: number; birthYear?: number } = {};
      if (patch.heightCm !== undefined) body.heightCm = patch.heightCm ?? undefined;
      if (patch.birthYear !== undefined) body.birthYear = patch.birthYear ?? undefined;
      if (Object.keys(body).length > 0) patchSettings(body);

      const basics: { disciplines?: Discipline[]; experience?: ExperienceLevel } = {};
      if (patch.disciplines) {
        basics.disciplines = patch.disciplines.filter((d): d is Discipline =>
          (DISCIPLINE_IDS as readonly string[]).includes(d),
        );
      }
      if (patch.experience && (EXPERIENCE_IDS as readonly string[]).includes(patch.experience)) {
        basics.experience = patch.experience as ExperienceLevel;
      }
      if (Object.keys(basics).length > 0) updateAthleteBasics(basics);

      /*
       * THE OBJECTIVE IS ONLY EVER CREATED, NEVER OVERWRITTEN, and the merge in
       * `settings/hydrate.ts` has already refused to send one to a device that
       * has an objective of its own. This is the second half of that rule
       * standing in its own file: a `Goal` carries a preparation figure derived
       * from sessions somebody actually completed, and a name and a date out of
       * a jsonb column may not replace it.
       */
      if (patch.objective && !primary) {
        addGoal({
          name: patch.objective.goalName,
          subtitle: "Objective",
          ...(typeof patch.objective.goalElevationM === "number"
            ? { elevationM: patch.objective.goalElevationM }
            : {}),
          ...(patch.objective.goalMountainId ? { mountainId: patch.objective.goalMountainId } : {}),
          targetDate: patch.objective.goalTargetDate ?? new Date().toISOString(),
          ...(patch.objective.goalTrainingStartedAt
            ? { trainingStartedAt: patch.objective.goalTrainingStartedAt }
            : {}),
          gaps: ["Restored from your ICEFALL account", "Baseline fitness assessment outstanding"],
        });
      }
    },
    [updateCoachProfile, setBodyMassKg, updateAthleteBasics, addGoal, primary],
  );

  const save = useCallback(
    async (patch: CoachingAnswersEdit): Promise<CoachingAnswersResult> => {
      apply(patch);
      const fields = Object.keys(patch) as CoachingFieldName[];
      for (const field of fields) noteUnsentCoachingField(field);
      const result = await saveCoachingAnswers(patch);
      /* Dropped on attempt, put back for whatever did not arrive. */
      forgetUnsentCoachingFields(fields);
      for (const field of fields) {
        if (result.fields[field]?.state !== "saved") noteUnsentCoachingField(field);
      }
      return result;
    },
    [apply],
  );

  return { device, apply, save };
}
