// OnlyFinder experiment engine — brief Section 5.
//
// PURE + dependency-free on purpose: this module is imported by the `daily-pull`
// Supabase Edge Function (Deno) AND unit-tested with vitest (Node). It uses no
// imports and no runtime globals beyond `Date` (for UTC date arithmetic), so it
// runs identically in both. All persistence lives in the caller.
//
// Responsibilities (the three things daily-pull asks of it each run):
//   1. computeWindows()  — the Section 5 windows for a change date.
//      (Auto-CREATE of the experiment row on keyword_change insert is done by a
//       DB trigger in 20260615140000_experiment_engine.sql, not here.)
//   2. isConfounded()    — daily confound check: any OTHER change inside window.
//   3. concludeExperiment() — on observation_end, compute the metrics.
//   evaluateExperiment()  — orchestrates 2+3 for one running experiment.
//
// Hard rules honored: confounded experiments never get metrics (rule #4); a
// missing manual spend value yields a null fans-per-dollar, never a crash.

export const BASELINE_DAYS = 7;
export const OBSERVATION_DAYS = 7;
/** Min days of data required IN EACH window to conclude; otherwise insufficient. */
export const DEFAULT_MIN_DAYS_PER_WINDOW = 5;

export type IsoDate = string; // 'YYYY-MM-DD'
export type ExperimentStatus = "running" | "confounded" | "concluded" | "insufficient_data";

export type Windows = {
  baseline_start: IsoDate;
  baseline_end: IsoDate;
  observation_start: IsoDate;
  observation_end: IsoDate;
};

export type DailyDatum = {
  date: IsoDate;
  direct_fans: number;
  direct_income_usd: number;
  onlyfinder_spend_usd: number | null; // null = manual spend not logged for that day
};

export type ConclusionMetrics = {
  baseline_fans_per_day: number;
  observed_fans_per_day: number;
  fans_lift_pct: number | null;
  baseline_income_per_day: number;
  observed_income_per_day: number;
  income_lift_pct: number | null;
  baseline_fans_per_dollar: number | null;
  observed_fans_per_dollar: number | null;
  fans_per_dollar_lift_pct: number | null;
};

// ── date helpers (UTC, deterministic — no timezone/DST surprises) ─────────────
export function addDays(iso: IsoDate, n: number): IsoDate {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
// ISO 'YYYY-MM-DD' sorts lexicographically == chronologically.
function inRange(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return start <= date && date <= end;
}

// ── (1) windows ──────────────────────────────────────────────────────────────
/** Section 5: baseline = D-7…D-1, observation = D+1…D+7 (change day excluded). */
export function computeWindows(changeDate: IsoDate): Windows {
  return {
    baseline_start: addDays(changeDate, -BASELINE_DAYS),
    baseline_end: addDays(changeDate, -1),
    observation_start: addDays(changeDate, 1),
    observation_end: addDays(changeDate, OBSERVATION_DAYS),
  };
}

// ── (2) confound check ───────────────────────────────────────────────────────
/**
 * Confounded iff ANY other keyword change for the same creator has a change_date
 * inside [baseline_start, observation_end] (inclusive). `otherChangeDates` must
 * already EXCLUDE this experiment's own change (filter by id at the caller).
 */
export function isConfounded(
  windows: Windows,
  otherChangeDates: IsoDate[],
): { confounded: boolean; reason: string | null } {
  const hits = otherChangeDates
    .filter((d) => inRange(d, windows.baseline_start, windows.observation_end))
    .sort();
  if (hits.length === 0) return { confounded: false, reason: null };
  return {
    confounded: true,
    reason: `Another keyword change on ${hits[0]} falls inside this window (${windows.baseline_start}…${windows.observation_end}).`,
  };
}

// ── (3) conclusion ───────────────────────────────────────────────────────────
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
/** Percent change; null when the baseline is 0 (an undefined percentage). */
function liftPct(baseline: number, observed: number): number | null {
  if (baseline === 0) return null;
  return round(((observed - baseline) / baseline) * 100, 2);
}

export type ConcludeResult =
  | { status: "concluded"; metrics: ConclusionMetrics }
  | { status: "insufficient_data"; metrics: null; reason: string };

export function concludeExperiment(
  windows: Windows,
  daily: DailyDatum[],
  minDaysPerWindow: number = DEFAULT_MIN_DAYS_PER_WINDOW,
): ConcludeResult {
  const baseline = daily.filter((r) => inRange(r.date, windows.baseline_start, windows.baseline_end));
  const observation = daily.filter((r) => inRange(r.date, windows.observation_start, windows.observation_end));

  if (baseline.length < minDaysPerWindow || observation.length < minDaysPerWindow) {
    return {
      status: "insufficient_data",
      metrics: null,
      reason: `Need ≥${minDaysPerWindow} data-days per window; have ${baseline.length} baseline / ${observation.length} observation.`,
    };
  }

  const baseFansPerDay = round(mean(baseline.map((r) => r.direct_fans)), 4);
  const obsFansPerDay = round(mean(observation.map((r) => r.direct_fans)), 4);
  const baseIncomePerDay = round(mean(baseline.map((r) => r.direct_income_usd)), 4);
  const obsIncomePerDay = round(mean(observation.map((r) => r.direct_income_usd)), 4);

  // Fans per dollar of OnlyFinder spend = Σfans / Σspend over the window.
  // Tolerate a missing day's spend (null) or zero spend by returning null —
  // never divide by zero, never surface NaN.
  const fansPerDollar = (rows: DailyDatum[]): number | null => {
    if (rows.some((r) => r.onlyfinder_spend_usd == null)) return null;
    const spend = rows.reduce((a, r) => a + (r.onlyfinder_spend_usd as number), 0);
    if (spend <= 0) return null;
    const fans = rows.reduce((a, r) => a + r.direct_fans, 0);
    return round(fans / spend, 4);
  };
  const baseFpd = fansPerDollar(baseline);
  const obsFpd = fansPerDollar(observation);

  return {
    status: "concluded",
    metrics: {
      baseline_fans_per_day: baseFansPerDay,
      observed_fans_per_day: obsFansPerDay,
      fans_lift_pct: liftPct(baseFansPerDay, obsFansPerDay),
      baseline_income_per_day: baseIncomePerDay,
      observed_income_per_day: obsIncomePerDay,
      income_lift_pct: liftPct(baseIncomePerDay, obsIncomePerDay),
      baseline_fans_per_dollar: baseFpd,
      observed_fans_per_dollar: obsFpd,
      fans_per_dollar_lift_pct: baseFpd != null && obsFpd != null ? liftPct(baseFpd, obsFpd) : null,
    },
  };
}

// ── orchestrator ─────────────────────────────────────────────────────────────
export type ExperimentRow = {
  status: ExperimentStatus;
  baseline_start: IsoDate;
  baseline_end: IsoDate;
  observation_start: IsoDate;
  observation_end: IsoDate;
};

export type EvaluateContext = {
  today: IsoDate;              // the date daily-pull is processing (data loaded through here)
  otherChangeDates: IsoDate[]; // change dates of the creator's OTHER keyword_changes
  daily: DailyDatum[];         // creator's daily_metrics spanning the windows
  minDaysPerWindow?: number;
};

export type EvaluateResult =
  | { changed: false }
  | { changed: true; status: "confounded"; confounded_reason: string; metrics: null }
  | { changed: true; status: "concluded"; metrics: ConclusionMetrics }
  | { changed: true; status: "insufficient_data"; metrics: null; reason: string };

/**
 * Decide what should happen to ONE experiment on a given daily-pull run.
 * The caller persists the result (and is the only thing that touches the DB).
 */
export function evaluateExperiment(exp: ExperimentRow, ctx: EvaluateContext): EvaluateResult {
  if (exp.status !== "running") return { changed: false }; // terminal states are immutable

  const windows: Windows = {
    baseline_start: exp.baseline_start,
    baseline_end: exp.baseline_end,
    observation_start: exp.observation_start,
    observation_end: exp.observation_end,
  };

  // (2) Confound check first — a confound found on ANY day kills the verdict,
  //     even if the observation window has otherwise elapsed.
  const cf = isConfounded(windows, ctx.otherChangeDates);
  if (cf.confounded) {
    return { changed: true, status: "confounded", confounded_reason: cf.reason as string, metrics: null };
  }

  // (3) Conclude only once the observation window has fully elapsed.
  if (ctx.today >= exp.observation_end) {
    const res = concludeExperiment(windows, ctx.daily, ctx.minDaysPerWindow);
    return res.status === "insufficient_data"
      ? { changed: true, status: "insufficient_data", metrics: null, reason: res.reason }
      : { changed: true, status: "concluded", metrics: res.metrics };
  }

  return { changed: false }; // still observing — nothing to do today
}
