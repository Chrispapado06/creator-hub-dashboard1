import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  TrackerCreator,
  KeywordChange,
  DailyMetric,
  Experiment,
  DailyDigest,
  DecisionBucket,
  DecisionRow,
} from "./tracker-types";

// Resilient client: if env vars aren't configured yet, return null so pages
// render empty states instead of crashing (supabaseAdmin() throws on missing env).
function sb() {
  try {
    return supabaseAdmin();
  } catch {
    return null;
  }
}

const CREATOR_COLS = "id, name, of_username, onlyfansapi_acct_id, onlyfinder_ref, daily_budget_usd, other_platforms";

export async function listCreators(): Promise<TrackerCreator[]> {
  const db = sb();
  if (!db) return [];
  const { data } = await db.from("creators").select(CREATOR_COLS).order("name");
  return (data ?? []) as TrackerCreator[];
}

export async function getCreator(id: string): Promise<TrackerCreator | null> {
  const db = sb();
  if (!db) return null;
  const { data } = await db.from("creators").select(CREATOR_COLS).eq("id", id).maybeSingle();
  return (data as TrackerCreator | null) ?? null;
}

export async function getCreatorMetrics(id: string, days = 90): Promise<DailyMetric[]> {
  const db = sb();
  if (!db) return [];
  const { data } = await db
    .from("daily_metrics")
    .select("metric_date, total_new_fans, total_income_usd, direct_fans, direct_income_usd, onlyfinder_spend_usd")
    .eq("creator_id", id)
    .order("metric_date", { ascending: true })
    .limit(days);
  return (data ?? []) as DailyMetric[];
}

export async function getCreatorChanges(id: string): Promise<KeywordChange[]> {
  const db = sb();
  if (!db) return [];
  const { data } = await db
    .from("keyword_changes")
    .select("*")
    .eq("creator_id", id)
    .order("changed_on", { ascending: false });
  return (data ?? []) as KeywordChange[];
}

export async function getCreatorExperiments(id: string): Promise<Experiment[]> {
  const db = sb();
  if (!db) return [];
  const { data } = await db
    .from("experiments")
    .select("*")
    .eq("creator_id", id)
    .order("observation_end", { ascending: false });
  return (data ?? []) as Experiment[];
}

/** The most recent stored digest (Section 7 output). */
export async function getLatestDigest(): Promise<DailyDigest | null> {
  const db = sb();
  if (!db) return null;
  const { data } = await db
    .from("daily_digests")
    .select("*")
    .order("digest_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as DailyDigest | null) ?? null;
}

// ── Decisions: bucket concluded experiments into Scale / Hold / Kill ─────────
// Deterministic rule on the clean (direct-fans) lift. ±15% is the default
// threshold — tune to taste. Only CONCLUDED experiments are eligible (a
// confounded / unfinished window never appears here), matching the hard rules.
const DECISION_THRESHOLD_PCT = 15;

export function decisionBucket(fansLiftPct: number | null): DecisionBucket {
  if (fansLiftPct == null) return "hold";
  if (fansLiftPct >= DECISION_THRESHOLD_PCT) return "scale";
  if (fansLiftPct <= -DECISION_THRESHOLD_PCT) return "kill";
  return "hold";
}

export async function getDecisions(): Promise<Record<DecisionBucket, DecisionRow[]>> {
  const out: Record<DecisionBucket, DecisionRow[]> = { scale: [], hold: [], kill: [] };
  const db = sb();
  if (!db) return out;
  const { data } = await db
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
