/**
 * Oura Ring — the shape of what we keep. One place, so the request, the row
 * and the screen cannot disagree about what a number is.
 *
 * ── THE TRAP IN THE BRIEF, WRITTEN DOWN SO IT IS NOT WALKED INTO AGAIN ──────
 *
 * The brief asked for HRV, resting heart rate and respiratory rate, and named
 * `daily_readiness`, `daily_sleep` and `daily_activity` as the endpoints to get
 * them from. THOSE ENDPOINTS CONTAIN NONE OF THOSE NUMBERS.
 *
 * The `daily_*` collections are scores: a 0-100 summary and a set of 0-100
 * "contributors". `daily_readiness.contributors.resting_heart_rate` is a SCORE
 * OUT OF 100 — it is not a heart rate, it has no unit, and 62 does not mean 62
 * beats per minute. Building to the brief as written would have printed that 62
 * on a tile labelled "Resting heart rate, bpm".
 *
 * Every real physiological measurement lives on `/v2/usercollection/sleep`,
 * which is a different endpoint from `/v2/usercollection/daily_sleep`:
 *
 *     average_hrv          milliseconds
 *     lowest_heart_rate    bpm   <- the number a person means by "resting HR"
 *     average_heart_rate   bpm
 *     average_breath       breaths per minute
 *
 * ── SO THE NAMING RULE IS ENFORCED HERE ─────────────────────────────────────
 *
 * Anything that is a 0-100 score ends in `_score`. Anything that is a
 * measurement carries its unit in the name: `_bpm`, `_ms`, `_min`, `_pct`,
 * `_c`. A field with neither suffix is a bug in this file. The point is that a
 * screen reading `resting_heart_rate_score` cannot accidentally render it as a
 * pulse, because the column says what it is.
 *
 * ── NULL MEANS NOT MEASURED ─────────────────────────────────────────────────
 *
 * Oura omits fields it has no value for, and `0` is a real reading. Every
 * mapper below distinguishes them: absent or non-finite becomes `null`, and a
 * genuine zero is kept as `0`. A row of zeros where the ring was in a drawer is
 * the failure this avoids.
 */

/** Absent, null, "" and NaN all become null. A real 0 survives. */
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Seconds to whole minutes, keeping null null. */
const secToMin = (v) => {
  const n = num(v);
  return n === null ? null : Math.round(n / 60);
};

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

const day = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/**
 * The `fields` allowlist sent to Oura with every request.
 *
 * This is data minimisation enforced at the REQUEST rather than at the insert:
 * a column we do not store is a column we do not ask for, so it never exists on
 * an ICEFALL machine at all. Under GDPR that is the difference between not
 * keeping something and not collecting it.
 *
 * `id` and `day` are in every list because the write needs them to be a write
 * to a particular day rather than an append.
 */
export const COLLECTION_FIELDS = {
  daily_sleep: ["id", "day", "score", "timestamp", "contributors"],
  daily_readiness: [
    "id",
    "day",
    "score",
    "timestamp",
    "temperature_deviation",
    "temperature_trend_deviation",
    "contributors",
  ],
  daily_activity: [
    "id",
    "day",
    "score",
    "timestamp",
    "steps",
    "active_calories",
    "total_calories",
    "equivalent_walking_distance",
    "high_activity_time",
    "medium_activity_time",
    "low_activity_time",
    "sedentary_time",
    "resting_time",
    "non_wear_time",
    "average_met_minutes",
    "inactivity_alerts",
    "contributors",
  ],
  daily_spo2: ["id", "day", "spo2_percentage", "breathing_disturbance_index"],
  daily_stress: ["id", "day", "stress_high", "recovery_high", "day_summary"],
  sleep: [
    "id",
    "day",
    "type",
    "bedtime_start",
    "bedtime_end",
    "average_hrv",
    "average_heart_rate",
    "lowest_heart_rate",
    "average_breath",
    "total_sleep_duration",
    "deep_sleep_duration",
    "rem_sleep_duration",
    "light_sleep_duration",
    "awake_time",
    "time_in_bed",
    "latency",
    "efficiency",
    "restless_periods",
    "low_battery_alert",
  ],
};

/*
 * NOT REQUESTED, AND WHY.
 *
 * `hrv`, `heart_rate`, `movement_30_sec`, `sleep_phase_5_min` and `met` are
 * five-minute and thirty-second SAMPLE SERIES — hundreds of readings per night
 * per person. ICEFALL has no screen that plots them, so collecting them would
 * be gathering a person's minute-by-minute pulse against a use that does not
 * exist. Add them to the list above when something needs them, and expect the
 * consent wording to need revisiting when that happens.
 *
 * `daily_resilience`, `daily_cardiovascular_age` and `vO2_max` are omitted for
 * a different reason: their scope is not documented anywhere Oura publishes, so
 * whether the grant covers them is unknown until a real token is tried. They
 * are a follow-on, not a gap.
 */

/* -- the mappers ----------------------------------------------------------- */

/**
 * Every mapper returns a flat object whose keys are the column names in
 * `20260903060000_oura_health.sql`. `null` means the ring did not report it.
 */

export function mapDailySleep(r) {
  const c = r?.contributors || {};
  return {
    oura_id: str(r?.id),
    day: day(r?.day),
    sleep_score: num(r?.score),
    deep_sleep_score: num(c.deep_sleep),
    efficiency_score: num(c.efficiency),
    latency_score: num(c.latency),
    rem_sleep_score: num(c.rem_sleep),
    restfulness_score: num(c.restfulness),
    timing_score: num(c.timing),
    total_sleep_score: num(c.total_sleep),
    summary_at: str(r?.timestamp),
  };
}

export function mapDailyReadiness(r) {
  const c = r?.contributors || {};
  return {
    oura_id: str(r?.id),
    day: day(r?.day),
    readiness_score: num(r?.score),
    /*
     * The only two MEASUREMENTS on this endpoint: degrees Celsius away from the
     * person's own baseline, not an absolute temperature. `_c` rather than a
     * bare name because a reader who assumes absolute would see a fever at 0.9.
     */
    temperature_deviation_c: num(r?.temperature_deviation),
    temperature_trend_deviation_c: num(r?.temperature_trend_deviation),
    activity_balance_score: num(c.activity_balance),
    body_temperature_score: num(c.body_temperature),
    hrv_balance_score: num(c.hrv_balance),
    previous_day_activity_score: num(c.previous_day_activity),
    previous_night_score: num(c.previous_night),
    recovery_index_score: num(c.recovery_index),
    /* SCORE, NOT BPM. See the file header. The bpm figure is on `sleep`. */
    resting_heart_rate_score: num(c.resting_heart_rate),
    sleep_balance_score: num(c.sleep_balance),
    sleep_regularity_score: num(c.sleep_regularity),
    summary_at: str(r?.timestamp),
  };
}

export function mapDailyActivity(r) {
  const c = r?.contributors || {};
  return {
    oura_id: str(r?.id),
    day: day(r?.day),
    activity_score: num(r?.score),
    steps: num(r?.steps),
    active_calories_kcal: num(r?.active_calories),
    total_calories_kcal: num(r?.total_calories),
    equivalent_walking_distance_m: num(r?.equivalent_walking_distance),
    high_activity_min: secToMin(r?.high_activity_time),
    medium_activity_min: secToMin(r?.medium_activity_time),
    low_activity_min: secToMin(r?.low_activity_time),
    sedentary_min: secToMin(r?.sedentary_time),
    resting_min: secToMin(r?.resting_time),
    /*
     * Minutes the ring was off. It is the only field that says whether a low
     * step count is a quiet day or a ring on a bedside table, so it is stored
     * even though nothing renders it yet — a zero we cannot explain is worse
     * than a zero we can.
     */
    non_wear_min: secToMin(r?.non_wear_time),
    average_met_minutes: num(r?.average_met_minutes),
    inactivity_alerts: num(r?.inactivity_alerts),
    meet_daily_targets_score: num(c.meet_daily_targets),
    move_every_hour_score: num(c.move_every_hour),
    recovery_time_score: num(c.recovery_time),
    stay_active_score: num(c.stay_active),
    training_frequency_score: num(c.training_frequency),
    training_volume_score: num(c.training_volume),
    summary_at: str(r?.timestamp),
  };
}

export function mapDailySpo2(r) {
  return {
    oura_id: str(r?.id),
    day: day(r?.day),
    /* Nested one level in Oura's payload: `spo2_percentage: { average }`. */
    spo2_average_pct: num(r?.spo2_percentage?.average),
    breathing_disturbance_index: num(r?.breathing_disturbance_index),
  };
}

export function mapDailyStress(r) {
  const summary = str(r?.day_summary);
  return {
    oura_id: str(r?.id),
    day: day(r?.day),
    stress_high_min: secToMin(r?.stress_high),
    recovery_high_min: secToMin(r?.recovery_high),
    /* One of restored | normal | stressful, or null. Not scored, not ranked. */
    day_summary: ["restored", "normal", "stressful"].includes(summary) ? summary : null,
  };
}

/**
 * The biometric row. This is the endpoint the brief was actually asking for.
 *
 * A day can hold several of these — a night plus a nap — so the key is the Oura
 * object id and the day is a column, not the identity. Collapsing them onto one
 * row per day would make an afternoon nap overwrite a night's HRV.
 */
export function mapSleepPeriod(r) {
  return {
    oura_id: str(r?.id),
    day: day(r?.day),
    /* long_sleep | sleep | late_nap | rest | deleted — a nap is not a night. */
    period_type: str(r?.type),
    bedtime_start: str(r?.bedtime_start),
    bedtime_end: str(r?.bedtime_end),
    average_hrv_ms: num(r?.average_hrv),
    average_heart_rate_bpm: num(r?.average_heart_rate),
    lowest_heart_rate_bpm: num(r?.lowest_heart_rate),
    /* Respiratory rate. Oura calls it `average_breath`; the unit is breaths per
     * minute and it is a decimal, so it is stored as one. */
    average_breath_per_min: num(r?.average_breath),
    total_sleep_min: secToMin(r?.total_sleep_duration),
    deep_sleep_min: secToMin(r?.deep_sleep_duration),
    rem_sleep_min: secToMin(r?.rem_sleep_duration),
    light_sleep_min: secToMin(r?.light_sleep_duration),
    awake_min: secToMin(r?.awake_time),
    time_in_bed_min: secToMin(r?.time_in_bed),
    latency_min: secToMin(r?.latency),
    efficiency_pct: num(r?.efficiency),
    restless_periods: num(r?.restless_periods),
    /*
     * The ring ran out of charge during this night. It is the honest reason a
     * night has no HRV, and without it the screen would have to guess between
     * "not worn" and "battery died".
     */
    low_battery_alert: r?.low_battery_alert === true ? true : r?.low_battery_alert === false ? false : null,
  };
}

/** Oura's collection name -> our mapper and the kind the store writes. */
export const COLLECTIONS = {
  daily_sleep: { kind: "daily_sleep", map: mapDailySleep },
  daily_readiness: { kind: "daily_readiness", map: mapDailyReadiness },
  daily_activity: { kind: "daily_activity", map: mapDailyActivity },
  daily_spo2: { kind: "daily_spo2", map: mapDailySpo2 },
  daily_stress: { kind: "daily_stress", map: mapDailyStress },
  sleep: { kind: "sleep", map: mapSleepPeriod },
};

/** The order a backfill walks them: the ones a screen is waiting for first. */
export const BACKFILL_ORDER = [
  "sleep",
  "daily_readiness",
  "daily_sleep",
  "daily_activity",
  "daily_stress",
  "daily_spo2",
];

/**
 * The webhook `data_type` values we act on, mapped to the collection to fetch.
 *
 * Oura's enum is longer. `meal` is in it and has no endpoint to fetch — a
 * notification about an object that cannot be read. Anything not in this map is
 * acknowledged and dropped, which is deliberate: an unknown type is not an
 * error, it is Oura shipping something we have not built for yet.
 */
export const WEBHOOK_TO_COLLECTION = {
  sleep: "sleep",
  daily_sleep: "daily_sleep",
  daily_readiness: "daily_readiness",
  daily_activity: "daily_activity",
  daily_spo2: "daily_spo2",
  daily_stress: "daily_stress",
};
