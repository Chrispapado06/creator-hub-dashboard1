// OnlyFinder daily digest — brief Section 7.
//
// After the daily pull + experiment updates, summarize each creator's running and
// just-concluded keyword experiments. This is a RULE-BASED summary: it reads each
// experiment's status + movement metrics and produces a status line, a read, and a
// recommended action deterministically — no LLM, no external calls, no API key.
//
// PURE + dependency-free (no imports, no runtime globals) so the daily-pull Edge
// Function (Deno) imports it and vitest tests it.
//
// The three hard rules (Section 7) are enforced in code by sanitizeItem(): a
// confounded or unfinished window can NEVER carry a verdict, regardless of the
// raw per-experiment read.

export type ExperimentStatus = "running" | "confounded" | "concluded" | "insufficient_data";
export type RecommendedAction = "hold" | "scale" | "kill" | "unreadable";

/** One experiment, shaped for the digest (DB rows + creator name, joined by caller). */
export type DigestExperiment = {
  id: string;
  creator_name: string;
  status: ExperimentStatus;
  changed_on: string;
  action: string | null;
  new_keywords: string[];
  baseline_start: string;
  baseline_end: string;
  observation_start: string;
  observation_end: string;
  // Present only when concluded; null otherwise:
  metrics: {
    baseline_fans_per_day: number | null;
    observed_fans_per_day: number | null;
    fans_lift_pct: number | null;
    baseline_income_per_day: number | null;
    observed_income_per_day: number | null;
    income_lift_pct: number | null;
    baseline_fans_per_dollar: number | null;
    observed_fans_per_dollar: number | null;
    fans_per_dollar_lift_pct: number | null;
  } | null;
  confounded_reason: string | null;
};

export type DigestItem = {
  experiment_id: string;
  status_line: string;
  read: string;
  recommended_action: RecommendedAction;
  confound_warning: string | null;
};

export type DigestResult = { items: DigestItem[]; prose: string; model: string };

// ── Build the compact per-experiment view ────────────────────────────────────
export function buildDigestInput(experiments: DigestExperiment[]): unknown {
  return {
    note: "Each item is one keyword-change experiment. status drives what may be said (see the hard rules).",
    experiments: experiments.map((e) => ({
      experiment_id: e.id,
      creator: e.creator_name,
      status: e.status,
      keyword_change: { changed_on: e.changed_on, action: e.action, new_keywords: e.new_keywords },
      windows: {
        baseline: `${e.baseline_start}…${e.baseline_end}`,
        observation: `${e.observation_start}…${e.observation_end}`,
      },
      movement: e.metrics, // null unless concluded
      confounded_reason: e.confounded_reason,
    })),
  };
}

// ── The code-enforced guardrail (hard rules, regardless of the raw read) ─────
const ACTIONS = new Set<RecommendedAction>(["hold", "scale", "kill", "unreadable"]);

export function sanitizeItem(rawItem: Partial<DigestItem>, exp: DigestExperiment): DigestItem {
  let action: RecommendedAction =
    rawItem.recommended_action && ACTIONS.has(rawItem.recommended_action)
      ? rawItem.recommended_action
      : "unreadable";
  let warning: string | null = rawItem.confound_warning ?? null;

  // Rule 2, enforced in code — confounded/unfinished windows never carry a verdict.
  if (exp.status === "confounded") {
    action = "unreadable";
    if (!warning) warning = exp.confounded_reason ?? "Window is confounded by another keyword change — no verdict.";
  } else if (exp.status === "insufficient_data") {
    action = "unreadable";
    if (!warning) warning = "Not enough data in the window to produce a verdict.";
  } else if (exp.status === "running") {
    // Still observing — downgrade any winner/loser call to "hold".
    if (action === "scale" || action === "kill") action = "hold";
    if (!warning) warning = "Observation window still open — early read only, not a verdict.";
  }

  return {
    experiment_id: exp.id,
    status_line: String(rawItem.status_line ?? "").slice(0, 280),
    read: String(rawItem.read ?? "").slice(0, 600),
    recommended_action: action,
    confound_warning: warning,
  };
}

export function sanitizeDigest(rawItems: Partial<DigestItem>[], experiments: DigestExperiment[]): DigestItem[] {
  const byId = new Map(experiments.map((e) => [e.id, e]));
  return rawItems
    .filter((it) => it.experiment_id && byId.has(it.experiment_id))
    .map((it) => sanitizeItem(it, byId.get(it.experiment_id as string) as DigestExperiment));
}

// ── Rule-based per-experiment read (no LLM) ──────────────────────────────────
function fmtPct(n: number | null): string {
  if (n === null || typeof n !== "number" || !isFinite(n)) return "n/a";
  const r = Math.round(n);
  return (r > 0 ? "+" : "") + r + "%";
}

/**
 * Base recommended action from movement. Only meaningful for a concluded,
 * non-confounded window; sanitizeItem() forces unreadable/hold for the rest.
 * Scale needs a real income gain without losing spend-efficiency; kill needs a
 * clear income drop or a big efficiency drop. Everything else holds.
 */
function baseAction(e: DigestExperiment): RecommendedAction {
  const m = e.metrics;
  if (e.status !== "concluded" || !m) return "hold";
  const income = m.income_lift_pct;
  const eff = m.fans_per_dollar_lift_pct;
  if (income !== null && income >= 10 && (eff === null || eff >= 0)) return "scale";
  if ((income !== null && income <= -10) || (eff !== null && eff <= -25)) return "kill";
  return "hold";
}

/** Deterministic per-experiment read; the guardrail in sanitizeItem() finalizes it. */
function templateItem(e: DigestExperiment): Partial<DigestItem> {
  const m = e.metrics;
  let status_line: string;
  let read: string;
  switch (e.status) {
    case "concluded":
      status_line = `${e.creator_name}: experiment concluded (${e.observation_start}…${e.observation_end}).`;
      read = m
        ? `Movement vs baseline — fans/day ${fmtPct(m.fans_lift_pct)}, income/day ${fmtPct(m.income_lift_pct)}, fans per $ ${fmtPct(m.fans_per_dollar_lift_pct)}.`
        : `Concluded, but no movement metrics were recorded for the window.`;
      break;
    case "running":
      status_line = `${e.creator_name}: experiment running (observing through ${e.observation_end}).`;
      read = `Observation window still open — early read only, no verdict yet.`;
      break;
    case "confounded":
      status_line = `${e.creator_name}: window confounded.`;
      read = e.confounded_reason
        ? `Not readable — ${e.confounded_reason}`
        : `Not readable — another keyword change overlaps this window.`;
      break;
    default: // insufficient_data
      status_line = `${e.creator_name}: not enough data in the window yet.`;
      read = `Not enough data in the window to produce a verdict.`;
      break;
  }
  return { status_line, read, recommended_action: baseAction(e), confound_warning: null };
}

/** One-paragraph roll-up of the day across all experiments. */
function buildProse(experiments: DigestExperiment[], items: DigestItem[]): string {
  const n = experiments.length;
  const count = (s: ExperimentStatus) => experiments.filter((e) => e.status === s).length;
  const running = count("running");
  const concluded = count("concluded");
  const confounded = count("confounded");
  const insufficient = count("insufficient_data");
  const scale = items.filter((i) => i.recommended_action === "scale").length;
  const kill = items.filter((i) => i.recommended_action === "kill").length;

  const parts: string[] = [
    `${n} experiment${n === 1 ? "" : "s"} tracked today: ${running} running, ${concluded} concluded, ${confounded} confounded, ${insufficient} awaiting data.`,
  ];
  if (scale || kill) {
    const recs: string[] = [];
    if (scale) recs.push(`${scale} to scale`);
    if (kill) recs.push(`${kill} to kill`);
    parts.push(`From concluded windows: ${recs.join(", ")}.`);
  } else if (concluded) {
    parts.push(`No concluded window is a clear scale or kill — hold and keep observing.`);
  }
  return parts.join(" ");
}

/**
 * Generate the daily digest — rule-based, no network, no API key. Kept async and
 * tolerant of extra opts so existing callers (which `await` it and may pass a
 * model/key) keep working unchanged.
 */
export async function generateDailyDigest(
  experiments: DigestExperiment[],
  _opts?: { model?: string; [k: string]: unknown },
): Promise<DigestResult> {
  const model = "rule-based";
  if (experiments.length === 0) {
    return { items: [], prose: "No running or recently concluded experiments today.", model };
  }
  const items = experiments.map((e) => sanitizeItem(templateItem(e), e));
  const prose = buildProse(experiments, items);
  return { items, prose, model };
}
