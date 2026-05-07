// Automation rules engine.
//
// `evaluateRules()` is called by the auto-sync orchestrator. It iterates every
// enabled rule, runs its trigger against current data, and fires actions for
// each matching entity (with cooldown protection so the same rule doesn't
// re-fire constantly for the same entity).
//
// Adding a new trigger:
//   1. Add the trigger key to the CHECK constraint in the migration
//   2. Add a case to evaluateTrigger() below
//   3. Add a case to TRIGGER_TEMPLATES so admins can pick it from the UI

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { subDays, subHours } from "date-fns";

export type AutomationRule = {
  id: string;
  label: string;
  description: string | null;
  enabled: boolean;
  trigger: string;
  trigger_params: Record<string, unknown>;
  action: string;
  action_params: Record<string, unknown>;
  cooldown_hours: number;
  fire_count: number;
  last_fired_at: string | null;
  last_evaluated_at: string | null;
  last_eval_message: string | null;
};

type Match = {
  entity_type: string;
  entity_id: string;
  /** Short human description of why this match fired (goes into audit log + cooldown details) */
  details: string;
  /** Optional context the action can use to render its message */
  context?: Record<string, unknown>;
};

type EvalResult = {
  matchesEvaluated: number;
  matchesFired: number;
  matchesSkippedByCooldown: number;
  errors: number;
};

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);

// ── Triggers ────────────────────────────────────────────────────────────────

async function evaluateTrigger(rule: AutomationRule): Promise<Match[]> {
  switch (rule.trigger) {
    case "creator_dormant":
      return findDormantCreators(num(rule.trigger_params.days, 14));

    case "subreddit_low_cvr":
      return findLowCvrLinks(
        num(rule.trigger_params.cvr_threshold, 0.05),
        num(rule.trigger_params.min_clicks, 100),
        num(rule.trigger_params.days, 14),
      );

    case "shift_zero_revenue":
      return findZeroRevenueShifts(num(rule.trigger_params.min_hours, 4), num(rule.trigger_params.days, 7));

    case "document_expiring":
      return findExpiringDocuments(num(rule.trigger_params.days, 30));

    case "goal_period_ending":
      return findGoalsEnding(num(rule.trigger_params.days, 7));

    case "ads_roas_below":
      return findLowRoasCampaigns(num(rule.trigger_params.roas, 1.5), num(rule.trigger_params.days, 14));

    default:
      return [];
  }
}

async function findDormantCreators(days: number): Promise<Match[]> {
  const since = subDays(new Date(), days).toISOString().slice(0, 10);
  const { data: creators } = await supabase.from("creators").select("id, name, status");
  if (!creators) return [];
  const out: Match[] = [];
  for (const c of creators) {
    if (c.status !== "active") continue;
    // Has any revenue entry in the window?
    const [{ data: r1 }, { data: r2 }, { data: r3 }] = await Promise.all([
      supabase.from("revenue_entries").select("id").eq("creator_id", c.id).gte("entry_date", since).limit(1),
      supabase.from("organic_entries").select("id").eq("creator_id", c.id).gte("entry_date", since).limit(1),
      supabase.from("internal_entries").select("id").eq("creator_id", c.id).gte("entry_date", since).limit(1),
    ]);
    if ((r1?.length ?? 0) === 0 && (r2?.length ?? 0) === 0 && (r3?.length ?? 0) === 0) {
      out.push({
        entity_type: "creator",
        entity_id: c.id,
        details: `${c.name} has no revenue in the last ${days} days`,
        context: { creator_id: c.id, creator_name: c.name, days },
      });
    }
  }
  return out;
}

async function findLowCvrLinks(threshold: number, minClicks: number, _days: number): Promise<Match[]> {
  // The `days` window argument is preserved for back-compat but ignored:
  // daily_link_snapshots was retired and infloww_tracking_stats only stores
  // current cumulative counters. We aggregate across whatever's there now.
  // Low CVR over total lifetime is still a useful signal.
  const { data } = await supabase
    .from("infloww_tracking_stats")
    .select("campaign_code, campaign_url, clicks_count, subscribers_count");
  if (!data) return [];
  const agg = new Map<number, { name: string; clicks: number; subs: number }>();
  for (const r of data) {
    const code = num((r as Record<string, unknown>).campaign_code, 0);
    const fallbackName = str((r as Record<string, unknown>).campaign_url, `Code ${code}`);
    const cur = agg.get(code) ?? { name: fallbackName, clicks: 0, subs: 0 };
    cur.clicks += num((r as Record<string, unknown>).clicks_count, 0);
    cur.subs += num((r as Record<string, unknown>).subscribers_count, 0);
    agg.set(code, cur);
  }
  const out: Match[] = [];
  for (const [code, v] of agg.entries()) {
    if (v.clicks < minClicks) continue; // ignore low-traffic links — too noisy
    const cvr = v.clicks > 0 ? v.subs / v.clicks : 0;
    if (cvr < threshold) {
      out.push({
        entity_type: "tracked_link",
        entity_id: String(code),
        details: `${v.name} (code ${code}) — CVR ${(cvr * 100).toFixed(1)}% over ${v.clicks} clicks`,
        context: { code, name: v.name, cvr, clicks: v.clicks, subs: v.subs, threshold },
      });
    }
  }
  return out;
}

async function findZeroRevenueShifts(minHours: number, days: number): Promise<Match[]> {
  const since = subDays(new Date(), days).toISOString();
  const { data } = await supabase
    .from("shifts")
    .select("id, chatter_id, creator_id, start_at, end_at, total_revenue, chatters(name), creators(name)")
    .gte("start_at", since)
    .not("end_at", "is", null)
    .eq("total_revenue", 0);
  if (!data) return [];
  const out: Match[] = [];
  for (const row of data as unknown as Array<{
    id: string; chatter_id: string; creator_id: string; start_at: string; end_at: string;
    chatters: { name?: string } | null; creators: { name?: string } | null;
  }>) {
    const hours = (new Date(row.end_at).getTime() - new Date(row.start_at).getTime()) / 3600_000;
    if (hours < minHours) continue;
    out.push({
      entity_type: "shift",
      entity_id: row.id,
      details: `${row.chatters?.name ?? "Chatter"} logged ${hours.toFixed(1)}h on ${row.creators?.name ?? "creator"} with $0 revenue`,
      context: {
        chatter_id: row.chatter_id,
        chatter_name: row.chatters?.name,
        creator_name: row.creators?.name,
        hours,
      },
    });
  }
  return out;
}

async function findExpiringDocuments(days: number): Promise<Match[]> {
  const todayISO = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("creator_documents")
    .select("id, creator_id, label, category, expires_at, creators(name)")
    .gte("expires_at", todayISO)
    .lte("expires_at", cutoff);
  if (!data) return [];
  return (data as unknown as Array<{
    id: string; creator_id: string; label: string; category: string; expires_at: string;
    creators: { name?: string } | null;
  }>).map((d) => ({
    entity_type: "document",
    entity_id: d.id,
    details: `${d.creators?.name ?? "Creator"} — "${d.label}" expires ${d.expires_at}`,
    context: { document_id: d.id, label: d.label, expires_at: d.expires_at, creator_name: d.creators?.name },
  }));
}

async function findGoalsEnding(days: number): Promise<Match[]> {
  const todayISO = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("revenue_goals")
    .select("id, creator_id, channel, target_amount, period_end")
    .gte("period_end", todayISO)
    .lte("period_end", cutoff);
  if (!data) return [];
  return data.map((g) => ({
    entity_type: "goal",
    entity_id: String(g.id),
    details: `Goal ${g.channel} ($${g.target_amount}) ends ${g.period_end}`,
    context: { goal_id: g.id, channel: g.channel, period_end: g.period_end, target: g.target_amount },
  }));
}

async function findLowRoasCampaigns(threshold: number, days: number): Promise<Match[]> {
  const since = subDays(new Date(), days).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("ad_campaigns")
    .select("id, creator_id, platform, amount_spent, revenue_generated, start_date, creators(name)")
    .gte("start_date", since);
  if (!data) return [];
  const out: Match[] = [];
  for (const c of data as unknown as Array<{
    id: string; creator_id: string; platform: string; amount_spent: number; revenue_generated: number;
    start_date: string; creators: { name?: string } | null;
  }>) {
    if (c.amount_spent < 50) continue; // ignore tiny tests
    const roas = c.amount_spent > 0 ? c.revenue_generated / c.amount_spent : 0;
    if (roas < threshold) {
      out.push({
        entity_type: "ad_campaign",
        entity_id: c.id,
        details: `${c.creators?.name ?? "Creator"} — ${c.platform} campaign ROAS ${roas.toFixed(2)}x ($${c.revenue_generated} on $${c.amount_spent} spend)`,
        context: { roas, spend: c.amount_spent, revenue: c.revenue_generated, creator_name: c.creators?.name },
      });
    }
  }
  return out;
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function executeAction(rule: AutomationRule, match: Match): Promise<void> {
  // Each action has a templated message. Tokens are replaced from match.context.
  const renderTemplate = (tpl: string, ctx: Record<string, unknown>): string => {
    return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const v = ctx[key];
      return v == null ? "" : String(v);
    });
  };

  const ctx = match.context ?? {};

  switch (rule.action) {
    case "audit_entry": {
      const message = str(rule.action_params.message, rule.label);
      await logAudit({
        action: "automation_rule_fired",
        entity_type: match.entity_type,
        entity_id: match.entity_id,
        entity_name: rule.label,
        details: `${renderTemplate(message, ctx)} — ${match.details}`,
      });
      return;
    }
    case "coaching_note": {
      // Only meaningful for chatter-related triggers (shift_zero_revenue).
      const chatterId = str(ctx.chatter_id, "");
      if (!chatterId) return;
      const message = str(rule.action_params.message, rule.label);
      await supabase.from("staff_coaching_notes").insert({
        chatter_id: chatterId,
        body: `[automation: ${rule.label}]\n\n${renderTemplate(message, ctx)}\n\n${match.details}`,
        visible_to_staff: !!rule.action_params.visible_to_staff,
        created_by: "automation",
      });
      return;
    }
    case "lead_task": {
      // Creates an UNATTACHED task (lead_id = null is allowed since the FK is nullable).
      const message = str(rule.action_params.message, rule.label);
      const dueDays = num(rule.action_params.due_days, 1);
      await supabase.from("lead_tasks").insert({
        lead_id: null,
        description: `[${rule.label}] ${renderTemplate(message, ctx)} — ${match.details}`,
        due_at: new Date(Date.now() + dueDays * 86_400_000).toISOString(),
      });
      return;
    }
    case "pin_announcement": {
      const message = str(rule.action_params.message, rule.label);
      const scope = str(rule.action_params.scope, "all");
      await supabase.from("staff_announcements").insert({
        body: `${renderTemplate(message, ctx)}\n\n(Auto-posted by rule: ${rule.label})`,
        scope,
        pinned: true,
        created_by: "automation",
        // Auto-expire announcements 24 hours later so the feed doesn't fill up
        expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      });
      return;
    }
  }
}

// ── Public entry point ──────────────────────────────────────────────────────

export async function evaluateRules(): Promise<EvalResult> {
  const summary: EvalResult = { matchesEvaluated: 0, matchesFired: 0, matchesSkippedByCooldown: 0, errors: 0 };

  const { data: rulesData, error } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("enabled", true);
  if (error) {
    console.warn("[automation] couldn't load rules:", error.message);
    return summary;
  }
  const rules = (rulesData ?? []) as AutomationRule[];
  if (rules.length === 0) return summary;

  for (const rule of rules) {
    const startedAt = new Date().toISOString();
    let matches: Match[] = [];
    let evalErr: string | null = null;
    try {
      matches = await evaluateTrigger(rule);
    } catch (err) {
      evalErr = err instanceof Error ? err.message : String(err);
      console.warn(`[automation] trigger error in rule ${rule.label}:`, evalErr);
      summary.errors++;
    }

    summary.matchesEvaluated += matches.length;

    let firedThisRound = 0;
    for (const m of matches) {
      // Cooldown check — skip if we've fired for this entity within rule.cooldown_hours
      const cooldownStart = subHours(new Date(), rule.cooldown_hours).toISOString();
      const { data: existing } = await supabase
        .from("rule_fires")
        .select("id")
        .eq("rule_id", rule.id)
        .eq("entity_id", m.entity_id)
        .gte("fired_at", cooldownStart)
        .limit(1);
      if (existing && existing.length > 0) {
        summary.matchesSkippedByCooldown++;
        continue;
      }

      // Fire
      try {
        await executeAction(rule, m);
        await supabase.from("rule_fires").insert({
          rule_id: rule.id,
          entity_type: m.entity_type,
          entity_id: m.entity_id,
          details: m.details,
        });
        firedThisRound++;
        summary.matchesFired++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[automation] action error in rule ${rule.label}:`, msg);
        summary.errors++;
      }
    }

    // Bookkeeping
    await supabase
      .from("automation_rules")
      .update({
        last_evaluated_at: startedAt,
        last_fired_at: firedThisRound > 0 ? new Date().toISOString() : rule.last_fired_at,
        fire_count: rule.fire_count + firedThisRound,
        last_eval_message: evalErr
          ? `error: ${evalErr.slice(0, 200)}`
          : `${matches.length} matches · ${firedThisRound} fired · ${matches.length - firedThisRound} on cooldown`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rule.id);
  }

  return summary;
}

// ── Templates the admin UI offers ──────────────────────────────────────────

export type RuleTemplate = {
  trigger: string;
  trigger_label: string;
  trigger_description: string;
  /** Render the trigger params input UI. Defaults shipped with the template. */
  default_trigger_params: Record<string, unknown>;
  /** Suggested actions for this trigger. */
  suggested_actions: Array<{
    action: string;
    action_label: string;
    default_action_params: Record<string, unknown>;
  }>;
  default_label: string;
  default_description: string;
};

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    trigger: "creator_dormant",
    trigger_label: "Creator goes dormant",
    trigger_description: "Fires when an active creator has zero revenue in the last N days.",
    default_trigger_params: { days: 14 },
    default_label: "Dormant creator alert",
    default_description: "Pings the team when a creator's revenue stalls, so we can intervene early.",
    suggested_actions: [
      { action: "audit_entry", action_label: "Log to audit", default_action_params: { message: "Dormant: {{creator_name}} ({{days}}d no revenue)" } },
      { action: "lead_task", action_label: "Create follow-up task", default_action_params: { message: "Check in with {{creator_name}} — dormant {{days}}d", due_days: 1 } },
      { action: "pin_announcement", action_label: "Pin announcement", default_action_params: { message: "⚠ {{creator_name}} dormant {{days}}d — manager on call", scope: "manager" } },
    ],
  },
  {
    trigger: "subreddit_low_cvr",
    trigger_label: "Tracking link CVR drops",
    trigger_description: "Fires when a tracking link's CVR (subs/clicks) is below threshold over the last N days.",
    default_trigger_params: { cvr_threshold: 0.05, min_clicks: 100, days: 14 },
    default_label: "Low CVR link",
    default_description: "Catches dead links before we keep wasting clicks on them.",
    suggested_actions: [
      { action: "audit_entry", action_label: "Log to audit", default_action_params: { message: "Low CVR: {{name}} at {{cvr}}" } },
      { action: "lead_task", action_label: "Create review task", default_action_params: { message: "Review {{name}} — CVR {{cvr}}, {{clicks}} clicks", due_days: 2 } },
    ],
  },
  {
    trigger: "shift_zero_revenue",
    trigger_label: "Chatter shift logged $0",
    trigger_description: "Fires when a chatter logs a shift of N+ hours with no revenue.",
    default_trigger_params: { min_hours: 4, days: 7 },
    default_label: "Zero-revenue shift",
    default_description: "Flags coaching opportunities — long shifts with nothing to show for it.",
    suggested_actions: [
      { action: "coaching_note", action_label: "Add coaching note", default_action_params: { message: "Logged {{hours}}h with $0 — let's review what happened.", visible_to_staff: false } },
      { action: "audit_entry", action_label: "Log to audit", default_action_params: { message: "Zero-rev shift: {{chatter_name}} — {{hours}}h" } },
    ],
  },
  {
    trigger: "document_expiring",
    trigger_label: "Document expiring",
    trigger_description: "Fires when a creator document is within N days of expiring.",
    default_trigger_params: { days: 30 },
    default_label: "Document expiry warning",
    default_description: "Reminds the team to renew contracts / IDs / DMCAs before they lapse.",
    suggested_actions: [
      { action: "lead_task", action_label: "Create renewal task", default_action_params: { message: "Renew {{label}} for {{creator_name}} (expires {{expires_at}})", due_days: 7 } },
      { action: "audit_entry", action_label: "Log to audit", default_action_params: { message: "{{label}} for {{creator_name}} expires {{expires_at}}" } },
    ],
  },
  {
    trigger: "goal_period_ending",
    trigger_label: "Revenue goal period ending",
    trigger_description: "Fires when a creator goal's period_end is within N days.",
    default_trigger_params: { days: 7 },
    default_label: "Goal review reminder",
    default_description: "Triggers a check-in N days before a goal period closes.",
    suggested_actions: [
      { action: "lead_task", action_label: "Create review task", default_action_params: { message: "Goal {{channel}} ends {{period_end}} — check progress", due_days: 1 } },
      { action: "audit_entry", action_label: "Log to audit", default_action_params: { message: "Goal {{channel}} (${{target}}) ends {{period_end}}" } },
    ],
  },
  {
    trigger: "ads_roas_below",
    trigger_label: "Meta ad ROAS drops",
    trigger_description: "Fires when a Meta ad campaign's ROAS is below threshold over the last N days.",
    default_trigger_params: { roas: 1.5, days: 14 },
    default_label: "Low ROAS alert",
    default_description: "Flag campaigns burning money so we can pause or rework creative.",
    suggested_actions: [
      { action: "lead_task", action_label: "Create review task", default_action_params: { message: "Pause/review campaign for {{creator_name}} — ROAS {{roas}}x", due_days: 1 } },
      { action: "audit_entry", action_label: "Log to audit", default_action_params: { message: "Low ROAS for {{creator_name}}: {{roas}}x" } },
    ],
  },
];

export const ACTION_LABELS: Record<string, string> = {
  audit_entry: "Log to audit",
  coaching_note: "Add coaching note",
  lead_task: "Create task",
  pin_announcement: "Pin announcement",
};
