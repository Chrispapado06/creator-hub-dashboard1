import { scoreActivity } from "./points";
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
  pointsTotal: number;
  breakdown: { label: string; points: number; note?: string }[];
  notes: string[];
  records: DetectedRecord[];
  achievements: DetectedAchievement[];
  lifetimePoints: number;
}

export function finalizeActivity(raw: RecordedActivity): FinalizedActivity {
  const history = loadActivities();
  const meta = loadMeta();

  /**
   * A SIMULATED session earns nothing.
   *
   * The simulator emits a plausible ~2.2 m/s track with real distance and real
   * ascent, so left alone it sets personal bests, permanently unlocks
   * achievements and adds lifetime points. Those are claims about what the
   * athlete has done, and an athlete choosing a mountain deserves them to be
   * true. The session is still recorded and still scored for display — it is
   * only barred from the permanent record.
   */
  const simulated = raw.simulated === true;

  // History is filtered too: a simulated session must not raise the bar a later
  // real activity has to clear, nor count toward the weekly-consistency bonus.
  const realHistory = history.filter((h) => !h.simulated);

  const records = simulated ? [] : detectRecords(raw, realHistory);
  const achievements = simulated ? [] : detectAchievements(raw, meta.earnedAchievements);
  const insight = buildInsight(raw);

  const scored = scoreActivity(raw, {
    activeDaysThisWeek: activeDaysThisWeek(realHistory),
    firstOfKind: achievements.length > 0,
  });

  const activity: RecordedActivity = {
    ...raw,
    insight: insight ?? undefined,
    points_awarded: simulated ? 0 : scored.total,
    pointsBreakdown: scored.breakdown,
    records: records.map((r) => r.id),
    achievements: achievements.map((a) => a.id),
  };

  saveActivity(activity);

  const lifetimePoints = simulated ? meta.totalPoints : meta.totalPoints + scored.total;
  if (!simulated) {
    saveMeta({
      totalPoints: lifetimePoints,
      earnedAchievements: [...meta.earnedAchievements, ...achievements.map((a) => a.id)],
    });
  }

  // Every mounted screen re-reads the feed, so the new activity appears at once.
  invalidateFeed();

  return {
    activity,
    pointsTotal: simulated ? 0 : scored.total,
    breakdown: simulated ? [] : scored.breakdown,
    notes: simulated
      ? ["Simulated session — not scored, and not added to your records or totals."]
      : scored.notes,
    records,
    achievements,
    lifetimePoints,
  };
}
