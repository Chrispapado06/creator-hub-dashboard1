// OnlyFinder experiment tracker — data layer for the /ads section.
//
// Reads/writes the tables created by the supabase/migrations Stage 1–6 files,
// client-side via the anon key under "Public full access" RLS (the house
// pattern). The OFAPI / Anthropic secrets are NOT used here — they live only in
// the daily-pull Edge Function. The generated Supabase types don't include the
// new tables yet, so we use an untyped accessor (same trick as src/lib/tasks.ts).

import { supabase } from "@/integrations/supabase/client";

const sb = supabase as unknown as { from: (t: string) => any };

// ── Types ────────────────────────────────────────────────────────────────────
export type TrackerCreator = {
  id: string;
  name: string;
  of_username: string | null;
  onlyfansapi_acct_id: string | null;
  onlyfinder_ref: string | null;
  daily_budget_usd: number | null;
  other_platforms: string[] | null;
};

export type KeywordChange = {
  id: string;
  creator_id: string;
  changed_on: string;
  previous_keywords: string[];
  new_keywords: string[];
  action: string | null;
  note: string | null;
  created_at: string;
};

export type DailyMetric = {
  metric_date: string;
  total_new_fans: number;
  total_income_usd: number;
  direct_fans: number;
  direct_income_usd: number;
  onlyfinder_spend_usd: number | null;
};

export type ExperimentStatus = "running" | "confounded" | "concluded" | "insufficient_data";

export type Experiment = {
  id: string;
  creator_id: string;
  keyword_change_id: string;
  status: ExperimentStatus;
  baseline_start: string;
  baseline_end: string;
  observation_start: string;
  observation_end: string;
  fans_lift_pct: number | null;
  income_lift_pct: number | null;
  fans_per_dollar_lift_pct: number | null;
  baseline_fans_per_day: number | null;
  observed_fans_per_day: number | null;
  confounded_reason: string | null;
  concluded_at: string | null;
};

export type DigestItem = {
  experiment_id: string;
  status_line: string;
  read: string;
  recommended_action: "hold" | "scale" | "kill" | "unreadable";
  confound_warning: string | null;
};

export type DailyDigest = {
  digest_date: string;
  prose_summary: string;
  items: DigestItem[];
  model: string | null;
};

export type DecisionBucket = "scale" | "hold" | "kill";
export type DecisionRow = {
  id: string;
  creator_id: string;
  creator_name: string;
  fans_lift_pct: number | null;
  income_lift_pct: number | null;
  observation_end: string;
};

const CREATOR_COLS = "id, name, of_username, onlyfansapi_acct_id, onlyfinder_ref, daily_budget_usd, other_platforms";

// ── Reads ────────────────────────────────────────────────────────────────────
export async function listCreators(): Promise<TrackerCreator[]> {
  const { data } = await sb.from("creators").select(CREATOR_COLS).order("name");
  return (data ?? []) as TrackerCreator[];
}

export async function getCreatorMetrics(creatorId: string, days = 90): Promise<DailyMetric[]> {
  const { data } = await sb
    .from("daily_metrics")
    .select("metric_date, total_new_fans, total_income_usd, direct_fans, direct_income_usd, onlyfinder_spend_usd")
    .eq("creator_id", creatorId)
    .order("metric_date", { ascending: true })
    .limit(days);
  return (data ?? []) as DailyMetric[];
}

export async function getCreatorChanges(creatorId: string): Promise<KeywordChange[]> {
  const { data } = await sb.from("keyword_changes").select("*").eq("creator_id", creatorId).order("changed_on", { ascending: false });
  return (data ?? []) as KeywordChange[];
}

export async function getCreatorExperiments(creatorId: string): Promise<Experiment[]> {
  const { data } = await sb.from("experiments").select("*").eq("creator_id", creatorId).order("observation_end", { ascending: false });
  return (data ?? []) as Experiment[];
}

export async function getLatestDigest(): Promise<DailyDigest | null> {
  const { data } = await sb.from("daily_digests").select("*").order("digest_date", { ascending: false }).limit(1).maybeSingle();
  return (data as DailyDigest | null) ?? null;
}

const DECISION_THRESHOLD_PCT = 15;
export function decisionBucket(fansLiftPct: number | null): DecisionBucket {
  if (fansLiftPct == null) return "hold";
  if (fansLiftPct >= DECISION_THRESHOLD_PCT) return "scale";
  if (fansLiftPct <= -DECISION_THRESHOLD_PCT) return "kill";
  return "hold";
}

export async function getDecisions(): Promise<Record<DecisionBucket, DecisionRow[]>> {
  const out: Record<DecisionBucket, DecisionRow[]> = { scale: [], hold: [], kill: [] };
  const { data } = await sb
    .from("experiments")
    .select("id, creator_id, fans_lift_pct, income_lift_pct, observation_end, creators(name)")
    .eq("status", "concluded")
    .order("observation_end", { ascending: false });
  for (const r of (data ?? []) as any[]) {
    out[decisionBucket(r.fans_lift_pct)].push({
      id: r.id,
      creator_id: r.creator_id,
      creator_name: r.creators?.name ?? "—",
      fans_lift_pct: r.fans_lift_pct,
      income_lift_pct: r.income_lift_pct,
      observation_end: r.observation_end,
    });
  }
  return out;
}

// ── Writes ───────────────────────────────────────────────────────────────────
export async function addCreator(input: {
  name: string;
  of_username?: string;
  onlyfansapi_acct_id?: string;
  onlyfinder_ref?: string;
  daily_budget_usd?: string;
  other_platforms?: string; // comma-separated
}): Promise<{ error: string | null }> {
  if (!input.name.trim()) return { error: "Name is required." };
  const other = (input.other_platforms ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const { error } = await sb.from("creators").insert({
    name: input.name.trim(),
    of_username: input.of_username?.trim() || null,
    onlyfansapi_acct_id: input.onlyfansapi_acct_id?.trim() || null,
    onlyfinder_ref: input.onlyfinder_ref?.trim() || null,
    daily_budget_usd: input.daily_budget_usd?.trim() ? Number(input.daily_budget_usd) : null,
    other_platforms: other,
  });
  return { error: error?.message ?? null };
}

export async function logKeywordChange(input: {
  creator_id: string;
  changed_on: string;
  new_keywords: string;
  action?: string;
  note?: string;
}): Promise<{ error: string | null }> {
  const keywords = input.new_keywords.split(",").map((s) => s.trim()).filter(Boolean);
  if (!input.changed_on) return { error: "Pick the date the keyword changed." };
  if (keywords.length === 0) return { error: "Enter at least one keyword." };
  const { error } = await sb.from("keyword_changes").insert({
    creator_id: input.creator_id,
    changed_on: input.changed_on,
    new_keywords: keywords,
    action: input.action?.trim() || null,
    note: input.note?.trim() || null,
  });
  return { error: error?.message ?? null };
}

export async function logDailySpend(input: {
  creator_id: string;
  metric_date: string;
  spend_usd: string;
}): Promise<{ error: string | null }> {
  if (!input.metric_date) return { error: "Pick a date." };
  if (input.spend_usd === "" || Number.isNaN(Number(input.spend_usd))) return { error: "Enter a spend amount." };
  const spend = Number(input.spend_usd);

  const { data: existing } = await sb
    .from("daily_metrics")
    .select("id")
    .eq("creator_id", input.creator_id)
    .eq("metric_date", input.metric_date)
    .maybeSingle();

  const { error } = existing
    ? await sb.from("daily_metrics").update({ onlyfinder_spend_usd: spend, spend_missing: false }).eq("id", existing.id)
    : await sb.from("daily_metrics").insert({ creator_id: input.creator_id, metric_date: input.metric_date, onlyfinder_spend_usd: spend, spend_missing: false });

  return { error: error?.message ?? null };
}
