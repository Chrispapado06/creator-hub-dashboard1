import {
  detectAchievements,
  detectRecords,
  type DetectedAchievement,
  type DetectedRecord,
} from "./records";
import { buildInsight } from "./insights";
import { activeDaysThisWeek, loadActivities, loadMeta, saveActivity, saveMeta } from "./store";
import { invalidateFeed } from "./feed";
import type { RecordedActivity } from "./types";

/**
 * Everything that happens the moment an activity ends: score it, look for
 * records and achievements, write the insight, persist it, and update the
 * athlete's running totals.
 *
 * Kept out of the UI so the completion screen just renders a result.
 */

export interface FinalizedActivity {
  activity: RecordedActivity;
  notes: string[];
  records: DetectedRecord[];
  achievements: DetectedAchievement[];
}

export function finalizeActivity(raw: RecordedActivity): FinalizedActivity {
  const history = loadActivities();
  const meta = loadMeta();

  /**
   * A SIMULATED session earns nothing.
   *
   * The simulator emits a plausible ~2.2 m/s track with real distance and real
   * ascent, so left alone it sets personal bests, permanently unlocks
   * achievements. Those are claims about what the athlete has done, and an
   * athlete choosing a mountain deserves them to be true. The session is still
   * recorded — it is only barred from the permanent record.
   *
   * THIS GUARD STAYS. It gated points as well as records and achievements;
   * points are gone (PH-01) and the guard is not.
   */
  const simulated = raw.simulated === true;

  // History is filtered too: a simulated session must not raise the bar a later
  // real activity has to clear, nor count toward the weekly-consistency bonus.
  const realHistory = history.filter((h) => !h.simulated);

  const records = simulated ? [] : detectRecords(raw, realHistory);
  const achievements = simulated ? [] : detectAchievements(raw, meta.earnedAchievements);
  const insight = buildInsight(raw);

  const activity: RecordedActivity = {
    ...raw,
    insight: insight ?? undefined,
    records: records.map((r) => r.id),
    achievements: achievements.map((a) => a.id),
  };

  saveActivity(activity);

  if (!simulated) {
    saveMeta({
      earnedAchievements: [...meta.earnedAchievements, ...achievements.map((a) => a.id)],
    });
  }

  // Every mounted screen re-reads the feed, so the new activity appears at once.
  invalidateFeed();

  return {
    activity,
    notes: simulated
      ? ["Simulated session — not added to your records or totals."]
      : [],
    records,
    achievements,
  };
}
