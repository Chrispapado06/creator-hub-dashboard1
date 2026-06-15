// OnlyFinder daily digest — brief Section 7.
//
// After the daily pull + experiment updates, summarize each creator's running and
// just-concluded experiments with claude-haiku-4-5 via the Anthropic Messages API.
// The model returns, per experiment: a one-line status, an early/final read, a
// recommended action (hold/scale/kill/unreadable), and a confound warning — plus a
// short prose summary. We store both.
//
// PURE + dependency-free (no imports, no runtime globals beyond `fetch`, which is
// injectable) so the daily-pull Edge Function (Deno) imports it and vitest tests it.
//
// DEFENSE IN DEPTH: the three hard rules live in the system prompt AND are RE-ENFORCED
// in code by sanitizeDigest(). A system prompt is advisory — the model can ignore it.
// The sanitizer cannot be ignored: a confounded/unfinished window can NEVER carry a
// verdict no matter what the model returns.

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

export class DigestError extends Error {}

// ── System prompt — the three hard rules (Section 7) ─────────────────────────
export const SYSTEM_PROMPT = `You are the analyst for an OnlyFinder keyword EXPERIMENT tracker. Each item is one experiment: a single keyword change for one creator, with before/after windows and the MOVEMENT in DIRECT (non-tracked) fans, income, and fans-per-dollar of OnlyFinder spend.

HARD RULES — these override everything else:
1. NEVER invent or imply per-keyword attribution. You do not know which fan came from which keyword. Speak only about MOVEMENT within the windows, never about a specific keyword causing a specific fan or sale.
2. NEVER declare a winner, recommend scale/kill, or give a confident "final read" on a CONFOUNDED or UNFINISHED window. If status is "confounded" or "insufficient_data", recommended_action MUST be "unreadable". If status is "running", the experiment is still observing — recommend "hold" at most (never "scale"/"kill") and frame the read as EARLY and tentative. Only a "concluded", non-confounded experiment may receive "scale" or "kill".
3. Reason in 5–7 day windows. Treat short-window noise with caution; do not over-read day-to-day wiggles.

For each experiment return: a one-line status, an early/final read, a recommended action (hold / scale / kill / unreadable), and a confound warning (string, or null if none). Then write a short prose summary of the day across all experiments. Call the submit_digest tool exactly once.`;

// ── Tool schema (forced structured output) ───────────────────────────────────
export const DIGEST_TOOL = {
  name: "submit_digest",
  description: "Return the structured daily experiment digest.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      experiments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            experiment_id: { type: "string" },
            status_line: { type: "string", description: "One short line on where this experiment stands." },
            read: { type: "string", description: "Early read if running; final read if concluded." },
            recommended_action: { type: "string", enum: ["hold", "scale", "kill", "unreadable"] },
            confound_warning: { type: ["string", "null"], description: "Warning if confounded/unfinished; else null." },
          },
          required: ["experiment_id", "status_line", "read", "recommended_action", "confound_warning"],
        },
      },
      prose_summary: { type: "string", description: "A short paragraph summarizing the day across all experiments." },
    },
    required: ["experiments", "prose_summary"],
  },
} as const;

// ── Build the compact input the model sees ───────────────────────────────────
export function buildDigestInput(experiments: DigestExperiment[]): unknown {
  return {
    note: "Each item is one keyword-change experiment. status drives what you may say (see the hard rules).",
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

// ── The code-enforced guardrail (hard rules, regardless of model output) ─────
const ACTIONS = new Set<RecommendedAction>(["hold", "scale", "kill", "unreadable"]);

export function sanitizeItem(modelItem: Partial<DigestItem>, exp: DigestExperiment): DigestItem {
  let action: RecommendedAction =
    modelItem.recommended_action && ACTIONS.has(modelItem.recommended_action)
      ? modelItem.recommended_action
      : "unreadable";
  let warning: string | null = modelItem.confound_warning ?? null;

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
    status_line: String(modelItem.status_line ?? "").slice(0, 280),
    read: String(modelItem.read ?? "").slice(0, 600),
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

// ── The Anthropic call ───────────────────────────────────────────────────────
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<any>;
}>;

/**
 * Generate the digest. `apiKey` is read from a server-side env var by the caller
 * (Deno: `Deno.env.get("ANTHROPIC_API_KEY")`) and passed in — never hard-coded,
 * never client-side. `fetchImpl` is injectable so tests run without a network.
 */
export async function generateDailyDigest(
  experiments: DigestExperiment[],
  opts: { apiKey: string; fetchImpl?: FetchLike; model?: string },
): Promise<DigestResult> {
  const model = opts.model ?? "claude-haiku-4-5";
  const doFetch = (opts.fetchImpl ?? (fetch as unknown as FetchLike));

  if (experiments.length === 0) {
    return { items: [], prose: "No running or recently concluded experiments today.", model };
  }
  if (!opts.apiKey) throw new DigestError("ANTHROPIC_API_KEY not set");

  const body = {
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [DIGEST_TOOL],
    tool_choice: { type: "tool", name: "submit_digest" },
    messages: [{ role: "user", content: JSON.stringify(buildDigestInput(experiments), null, 2) }],
  };

  const res = await doFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new DigestError(`anthropic ${res.status}: ${t.slice(0, 300)}`);
  }

  const json = await res.json();
  const toolBlock = (json?.content ?? []).find(
    (b: any) => b && b.type === "tool_use" && b.name === "submit_digest",
  );
  if (!toolBlock) throw new DigestError("model returned no submit_digest tool_use block");

  const raw = (toolBlock.input ?? {}) as { experiments?: Partial<DigestItem>[]; prose_summary?: string };
  const items = sanitizeDigest(raw.experiments ?? [], experiments); // <-- hard rules re-enforced here
  const prose = String(raw.prose_summary ?? "").slice(0, 4000);
  return { items, prose, model };
}
