import {
  OURA_METRICS,
  OURA_UNAVAILABLE_COPY,
  type OuraMetricId,
  type OuraSummary,
  type OuraUnavailable,
} from "./oura";
import type { HealthDaySummary, HealthValue } from "./health";

/**
 * The resolver: one answer per metric, from a fixed order of sources.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PROBLEM THIS FILE EXISTS FOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ICEFALL now has two ways to learn a resting heart rate: the Oura API, and
 * Apple Health or Health Connect through `HealthBridge`. They will disagree,
 * and worse, they will often AGREE BY DUPLICATION — Oura's own app writes into
 * Apple Health, so the same reading can arrive twice by two routes and look
 * like corroboration from two independent instruments.
 *
 * "Whichever wrote last" is not a decision. It makes the number on the recovery
 * screen depend on which app the person happened to open that morning, so the
 * same night reads 48 on Tuesday and 51 on Wednesday with nothing having
 * changed about the athlete. On a screen that shapes whether somebody goes up a
 * mountain, that is worse than showing nothing.
 *
 * So: A FIXED ORDER PER METRIC, WRITTEN DOWN, AND THE WINNING SOURCE TRAVELS
 * WITH THE NUMBER. Three rules follow from it.
 *
 *   1. The order never depends on recency, on which source answered first, or
 *      on which value looks healthier. It is the constant `SOURCE_ORDER` below
 *      and nothing at runtime may reorder it.
 *   2. Values are NEVER merged, averaged or reconciled. A resolved vital comes
 *      from exactly one instrument, and `source` names it.
 *   3. When a second source also had a number, the disagreement is KEPT, in
 *      `alsoFrom`. Hiding it would make one instrument's reading look like a
 *      settled fact. Showing it lets a screen say "Oura 48 bpm · Apple Health
 *      also reports 51", which is the truth.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE ORDER IS WHAT IT IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * OVERNIGHT PHYSIOLOGY — HRV, resting heart rate, sleep, respiratory rate,
 * blood oxygen, temperature deviation — OURA FIRST. The ring is on a finger for
 * the whole night and measures these directly and continuously. The phone store
 * frequently holds the very same reading (Oura wrote it there), and where it
 * does not, it holds a watch's or a phone's estimate. Preferring the ring means
 * preferring the instrument that took the measurement over the filing cabinet
 * that was told about it.
 *
 * DAYTIME MOVEMENT — steps, distance, floors, exercise minutes, active energy —
 * PHONE STORE FIRST. Apple Health and Health Connect aggregate every source the
 * person has, including Oura itself if they allow it, so they are the place a
 * whole day adds up. A ring's step count is an accelerometer on a hand and is
 * also blind to every hour it spends on a charger.
 *
 * There is no metric where the order is a coin toss, and if one appears the
 * answer is a new row in the table, not a runtime heuristic.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ABSENCE, AND WHAT COUNTS AS AN ANSWER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A stale reading is not a reading. The Oura server already refuses to return
 * anything older than its freshness window and sends `no-recent-data` instead,
 * so a stale value never reaches this file as a value. Nothing here resurrects
 * one, and nothing here falls back to "the last number we saw".
 *
 * A source that is absent is skipped and the NEXT source is asked. That is not
 * "whichever wrote last": the order is still fixed, we are simply walking down
 * it. The source that answered is always named, so a resting heart rate that
 * came from the phone because the ring was on a charger says so on screen.
 */

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

export type VitalSource = "oura" | "apple-health" | "health-connect";

export type VitalId =
  /* Both sources can report these. */
  | "restingHeartRate"
  | "sleepMinutes"
  | "steps"
  | "activeEnergy"
  /* Oura only. */
  | "hrv"
  | "respiratoryRate"
  | "spo2"
  | "temperatureDeviation"
  | "deepSleepMinutes"
  | "remSleepMinutes"
  | "sleepEfficiency"
  /* Phone store only. */
  | "distance"
  | "floors"
  | "exerciseMinutes";

/**
 * Every reason a vital can be missing.
 *
 * Oura's twelve plus `unsupported`, which only the phone bridge can be: there
 * is no browser API for a step count, and that is a permanent property of the
 * platform rather than a state of a device.
 */
export type VitalUnavailable = OuraUnavailable | "unsupported";

export const VITAL_UNAVAILABLE_COPY: Record<VitalUnavailable, string> = {
  ...OURA_UNAVAILABLE_COPY,
  unsupported:
    "Apple Health and Health Connect are only reachable from the ICEFALL mobile app.",
};

export interface Vital {
  id: VitalId;
  label: string;
  /** Empty string for a count. Never the word "score" — no score is a vital. */
  unit: string;
  value: number | null;
  /** The one instrument this number came from. Absent when there is no number. */
  source?: VitalSource;
  /** The day the instrument attributes it to, where the source knows. */
  measuredOn?: string;
  reason?: VitalUnavailable;
  /**
   * Other sources that ALSO had a number for this, and what they said.
   *
   * Kept rather than discarded, because a disagreement is information. Two
   * instruments differing by 3 bpm is worth a person seeing; silently binning
   * the loser makes one reading look like a consensus.
   */
  alsoFrom?: { source: VitalSource; value: number }[];
}

export type Vitals = Record<VitalId, Vital>;

/* -------------------------------------------------------------------------- */
/* The order                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Which sources can answer, in the order they are asked. FIXED.
 *
 * "phone" stands for whichever of Apple Health or Health Connect this device
 * has; there is only ever one, so they never compete with each other.
 */
type Candidate = "oura" | "phone";

const SOURCE_ORDER: Record<VitalId, Candidate[]> = {
  /* Overnight physiology — the ring measured it. */
  restingHeartRate: ["oura", "phone"],
  sleepMinutes: ["oura", "phone"],
  hrv: ["oura"],
  respiratoryRate: ["oura"],
  spo2: ["oura"],
  temperatureDeviation: ["oura"],
  deepSleepMinutes: ["oura"],
  remSleepMinutes: ["oura"],
  sleepEfficiency: ["oura"],

  /* Daytime movement — the phone store adds the whole day up. */
  steps: ["phone", "oura"],
  activeEnergy: ["phone", "oura"],
  distance: ["phone"],
  floors: ["phone"],
  exerciseMinutes: ["phone"],
};

/** Labels and units, owned here so the two sources cannot disagree about them. */
const VITAL_DEF: Record<VitalId, { label: string; unit: string }> = {
  restingHeartRate: { label: "Resting heart rate", unit: "bpm" },
  sleepMinutes: { label: "Sleep", unit: "min" },
  steps: { label: "Steps", unit: "" },
  activeEnergy: { label: "Active energy", unit: "kcal" },
  hrv: { label: "HRV", unit: "ms" },
  respiratoryRate: { label: "Respiratory rate", unit: "breaths/min" },
  spo2: { label: "Blood oxygen", unit: "%" },
  temperatureDeviation: { label: "Body temperature", unit: "°C" },
  deepSleepMinutes: { label: "Deep sleep", unit: "min" },
  remSleepMinutes: { label: "REM sleep", unit: "min" },
  sleepEfficiency: { label: "Sleep efficiency", unit: "%" },
  distance: { label: "Walking distance", unit: "m" },
  floors: { label: "Floors climbed", unit: "" },
  exerciseMinutes: { label: "Exercise", unit: "min" },
};

/** Which Oura metric answers a vital, where one does. */
const OURA_FOR: Partial<Record<VitalId, OuraMetricId>> = {
  restingHeartRate: "restingHeartRate",
  sleepMinutes: "sleepMinutes",
  steps: "steps",
  activeEnergy: "activeCalories",
  hrv: "hrv",
  respiratoryRate: "respiratoryRate",
  spo2: "spo2",
  temperatureDeviation: "temperatureDeviation",
  deepSleepMinutes: "deepSleepMinutes",
  remSleepMinutes: "remSleepMinutes",
  sleepEfficiency: "sleepEfficiency",
};

/** Which phone-store field answers a vital, where one does. */
const PHONE_FOR: Partial<Record<VitalId, keyof Omit<HealthDaySummary, "date">>> = {
  restingHeartRate: "restingHeartRate",
  sleepMinutes: "sleep",
  steps: "steps",
  activeEnergy: "activeEnergy",
  distance: "distance",
  floors: "floors",
  exerciseMinutes: "exerciseMinutes",
};

/**
 * The phone bridge's four reasons, in this file's vocabulary.
 *
 * `unsupported` is the one that does not collapse: it means no native shell
 * exists, which is a different sentence from "you have not connected anything"
 * and points at a different fix (install the app, not link a device).
 */
function phoneReason(v: HealthValue | undefined): VitalUnavailable {
  switch (v?.reason) {
    case "unsupported":
      return "unsupported";
    case "needs-permission":
      // The phone store has no separate word for this; the closest true
      // statement is that permission is what is missing, and Oura's
      // `consent-not-given` sentence says exactly that.
      return "consent-not-given";
    case "not-connected":
      return "not-connected";
    default:
      return "no-data";
  }
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

interface Offer {
  source: VitalSource;
  value: number | null;
  measuredOn?: string;
  reason?: VitalUnavailable;
}

/**
 * Resolves every vital from whichever sources are present.
 *
 * Both arguments are nullable and mean "this source was not consulted at all",
 * which is different from a source that answered with nothing. A null Oura
 * summary produces `not-connected`; an Oura summary whose HRV is absent
 * produces whatever Oura said about it.
 *
 * @param oura    the summary from `ouraService.summary()`, or null
 * @param phone   the day summary from `healthService.daySummary()`, or null
 * @param platform which phone store this device has, for the source label
 */
export function resolveVitals(
  oura: OuraSummary | null,
  phone: HealthDaySummary | null,
  platform: "apple-health" | "health-connect" = "apple-health",
): Vitals {
  const out = {} as Vitals;

  for (const id of Object.keys(SOURCE_ORDER) as VitalId[]) {
    const def = VITAL_DEF[id];
    const offers: Offer[] = [];

    for (const candidate of SOURCE_ORDER[id]) {
      if (candidate === "oura") {
        const metricId = OURA_FOR[id];
        if (!metricId) continue;
        if (!oura) {
          offers.push({ source: "oura", value: null, reason: "not-connected" });
          continue;
        }
        const r = oura.metrics[metricId];
        offers.push({
          source: "oura",
          value: r.value,
          measuredOn: r.measuredOn,
          reason: r.value === null ? (r.reason ?? "no-data") : undefined,
        });
      } else {
        const field = PHONE_FOR[id];
        if (!field) continue;
        if (!phone) {
          offers.push({ source: platform, value: null, reason: "not-connected" });
          continue;
        }
        const v = phone[field];
        offers.push({
          source: platform,
          value: v.value,
          measuredOn: phone.date,
          reason: v.value === null ? phoneReason(v) : undefined,
        });
      }
    }

    const answered = offers.filter((o) => o.value !== null);
    const winner = answered[0];

    if (winner) {
      out[id] = {
        id,
        label: def.label,
        unit: def.unit,
        value: winner.value,
        source: winner.source,
        measuredOn: winner.measuredOn,
        alsoFrom: answered
          .slice(1)
          .map((o) => ({ source: o.source, value: o.value as number })),
      };
      continue;
    }

    /*
      Nothing answered. Which absence do we report?

      The most informative one. A source that was CONSULTED and had nothing
      ("your ring did not record this") tells the person more than a source
      that was never reachable, so a `no-data`-family reason is preferred over
      a setup-family one. This is a choice about copy, not about data: no
      number exists either way.
    */
    const consulted = offers.find((o) => o.reason === "no-data" || o.reason === "no-recent-data");
    const reason = consulted?.reason ?? offers[0]?.reason ?? "not-connected";

    out[id] = {
      id,
      label: def.label,
      unit: def.unit,
      value: null,
      reason,
      measuredOn: consulted?.measuredOn,
    };
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* The coach's two fields                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The exact shape `assessRecovery` wants, with the distinction it depends on.
 *
 * `coach/hooks.ts` passes `restingHeartRateBpm: undefined` today and explains
 * why in a comment worth preserving:
 *
 *   "undefined, not null: null claims the source was consulted and had no data
 *    for last night, which reads to the athlete as 'you failed to log it'.
 *    There is no source at all."
 *
 * That distinction is now load-bearing rather than decorative, because with a
 * ring connected there IS a source and it CAN come back empty. So:
 *
 *   undefined  no source is connected that could have measured this
 *   null       a source was connected, was asked, and had nothing
 *   number     a measurement, from the source named in `sources`
 *
 * `sources` is returned alongside so a screen can say which instrument the
 * coach used. A recovery score computed partly from a ring should not look
 * identical to one computed from a phone.
 */
export interface CoachVitalInputs {
  restingHeartRateBpm: number | null | undefined;
  sleepMinutes: number | null | undefined;
  sources: { restingHeartRate?: VitalSource; sleep?: VitalSource };
}

/** Reasons that mean "nothing is connected", as opposed to "nothing recorded". */
const NO_SOURCE: VitalUnavailable[] = [
  "not-configured",
  "signed-out",
  "consent-not-given",
  "consent-withdrawn",
  "not-connected",
  "unsupported",
  "reauthorise",
  "membership-lapsed",
  "rotation-lost",
  "token-unreadable",
  "unreachable",
];

function coachField(v: Vital): number | null | undefined {
  if (v.value !== null) return v.value;
  return v.reason && NO_SOURCE.includes(v.reason) ? undefined : null;
}

export function coachVitalInputs(vitals: Vitals): CoachVitalInputs {
  const rhr = vitals.restingHeartRate;
  const sleep = vitals.sleepMinutes;

  return {
    restingHeartRateBpm: coachField(rhr),
    sleepMinutes: coachField(sleep),
    sources: { restingHeartRate: rhr.source, sleep: sleep.source },
  };
}
