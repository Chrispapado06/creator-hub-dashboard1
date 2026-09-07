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
import { WATCH_PROVIDER_NAME } from "@/watch/types";

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
   *
   * An IMPORTED activity joins it here, added 2026-09-07 when watch accounts
   * landed, for the same reason applied a different way: ICEFALL did not
   * record it. There is no track, no filtering history, no `capabilities`, and
   * no way to tell a GPS fix a watch's sensor took from a distance somebody
   * typed into their watch app by hand. It is real effort — unlike a simulated
   * session it belongs in the athlete's own feed and totals, and the notes
   * below say so — but "recorded in ICEFALL" is the definition `standingFor`
   * (see `src/social/leaderboard.ts`) is built on, and an import does not meet
   * it.
   */
  const simulated = raw.simulated === true;
  const imported = raw.origin.kind === "imported";

  // History is filtered too: a simulated session must not raise the bar a later
  // real activity has to clear, nor count toward the weekly-consistency bonus.
  // Imports are excluded from the comparison set for the same reason.
  const ownHistory = history.filter((h) => !h.simulated && h.origin.kind === "icefall");

  const records = simulated || imported ? [] : detectRecords(raw, ownHistory);
  const achievements =
    simulated || imported ? [] : detectAchievements(raw, meta.earnedAchievements);
  const insight = buildInsight(raw);

  const activity: RecordedActivity = {
    ...raw,
    insight: insight ?? undefined,
    records: records.map((r) => r.id),
    achievements: achievements.map((a) => a.id),
  };

  saveActivity(activity);

  if (!simulated && !imported) {
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
      : imported && raw.origin.kind === "imported"
        ? [
            `Imported from ${WATCH_PROVIDER_NAME[raw.origin.provider]} — it counts toward your training, not toward records or leaderboards.`,
          ]
        : [],
    records,
    achievements,
  };
}
