import {
  detectAchievements,
  detectRecords,
  type DetectedAchievement,
  type DetectedRecord,
} from "./records";
import { buildInsight } from "./insights";
import { saveOffline, savedSentenceFor } from "@/device/savedHere";
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
  /**
   * Where this session went, in one line for the completion screen: "Kept on
   * this phone. Not uploaded." today, because a recorded activity has no server
   * table. The sync queue's kinds decide the wording, not this file.
   */
  storageNote: string;
}

/** The sync queue's name for a recorded session, and one row per session id. */
export const ACTIVITY_SYNC_KIND = "activity";
export const activityDedupeKey = (id: string) => `${ACTIVITY_SYNC_KIND}:${id}`;

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
  /* A MANUAL ENTRY IS BARRED ON THE SAME GROUND AS AN IMPORT, and the ground is
     stated rather than inherited: ICEFALL did not record it. The figures are a
     sentence the athlete typed — or, with the coach's `log_activity` tool, a
     sentence the athlete said and a model transcribed. A personal best is a
     claim about what somebody did, and it has to be a claim ICEFALL can stand
     behind. The session still counts as training: it is in the feed, in the
     load curve, in weekly totals and in preparation against the plan. */
  const manual = raw.origin.kind === "manual";

  // History is filtered too: a simulated session must not raise the bar a later
  // real activity has to clear, nor count toward the weekly-consistency bonus.
  // Imports are excluded from the comparison set for the same reason.
  const ownHistory = history.filter((h) => !h.simulated && h.origin.kind === "icefall");

  const unverified = simulated || imported || manual;
  const records = unverified ? [] : detectRecords(raw, ownHistory);
  const achievements = unverified ? [] : detectAchievements(raw, meta.earnedAchievements);
  const insight = buildInsight(raw);

  const activity: RecordedActivity = {
    ...raw,
    insight: insight ?? undefined,
    records: records.map((r) => r.id),
    achievements: achievements.map((a) => a.id),
  };

  saveActivity(activity);

  /* Offered to the sync queue, which refuses it by name: there is no activities
     table, so the answer is "kept on this phone" and nothing is stored in the
     queue. It is offered rather than skipped so that the day a table exists,
     the kind moving out of KEPT_ON_PHONE_KINDS is the whole change — here, and
     on every screen that shows the sentence below. The payload is a reference,
     not the track: the session itself is already saved above. */
  void saveOffline({
    kind: ACTIVITY_SYNC_KIND,
    payload: { id: activity.id, endedAt: activity.endedAt },
    dedupeKey: activityDedupeKey(activity.id),
  });

  if (!unverified) {
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
        : manual
          ? [
              "Added from what you reported — it counts toward your training, not toward records or leaderboards.",
            ]
          : [],
    records,
    achievements,
    storageNote: savedSentenceFor(ACTIVITY_SYNC_KIND),
  };
}
