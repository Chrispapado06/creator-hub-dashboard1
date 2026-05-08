// Single source of truth for financial roll-ups.
//
// The dashboard calculates "total revenue", "total expenses", and "net
// profit" in three different places (Revenue, Financials, Daily). Each
// used to query its own subset of tables, so the same window could
// surface a different "ad spend" depending on which page you opened —
// auto-synced Meta API spend was missing from Revenue + Financials,
// while Daily counted it. This module fixes that by centralising the
// query layer.
//
// Numbers covered:
//
//   REVENUE
//   • OnlyFans Direct      — live POST /api/analytics/summary/earnings
//   • OF tracking links    — of_tracking_links.revenue_total (lifetime;
//                            no date column on the table, so we either
//                            include or exclude all of it depending
//                            on whether the caller asked for "lifetime"
//                            or a narrower window)
//   • Organic              — organic_entries.amount in [from, to]
//   • Internal             — internal_entries.amount in [from, to]
//   • Ad-attributed rev    — ad_campaigns.revenue_generated in window
//   • Infloww revenue      — revenue_entries (source != 'manual') in window
//
//   EXPENSES
//   • Meta ads (auto)      — meta_insights_daily.spend in window. This
//                            is the auto-synced source — used to be
//                            invisible to financials.
//   • Other ad platforms   — ad_campaigns.amount_spent (non-meta) in window
//   • Manual Meta entries  — ad_campaigns.amount_spent where platform=meta.
//                            Skipped if auto-sync data exists for the
//                            window, otherwise summed (avoids double-
//                            counting when an admin both ran the sync
//                            AND entered the campaign manually).
//   • Staff payouts        — staff_payouts.amount in window
//   • Agency expenses      — agency_expenses.amount in window
//   • Creator payouts      — creator_payouts.net_to_creator in window
//                            (the agency's "cost of goods" — the share
//                            that goes back out to the creators).

import { supabase } from "@/integrations/supabase/client";
import { fetchOfEarnings } from "./of-sync";

export type DateRange = { from: string; to: string }; // YYYY-MM-DD

export type RevenueRollup = {
  ofDirect: number;
  ofTracking: number;       // lifetime — see comment above
  organic: number;
  internal: number;
  adsAttributed: number;    // revenue from ads (NOT spend)
  infloww: number;
  total: number;
};

export type ExpenseRollup = {
  metaAdsAuto: number;      // from meta_insights_daily (auto-synced)
  otherAds: number;         // ad_campaigns.amount_spent for non-meta platforms
  manualMetaAds: number;    // ad_campaigns.amount_spent for meta (only when no auto data)
  totalAdSpend: number;     // metaAdsAuto + otherAds + manualMetaAds
  staffPayouts: number;
  agencyOps: number;
  creatorPayouts: number;
  total: number;
};

export type FinancialsRollup = {
  range: DateRange;
  revenue: RevenueRollup;
  expenses: ExpenseRollup;
  // grossRevenue = sum of every dollar inbound
  // netProfit    = grossRevenue − totalExpenses
  // For "agency net" (after creator payouts), use grossRevenue − total
  // For "ops net" (before creator payouts), use grossRevenue − (total − creatorPayouts)
  netProfit: number;
  // Margin against gross revenue (0–100). Returns 0 if revenue is 0.
  marginPct: number;
};

const ZERO_REVENUE: RevenueRollup = {
  ofDirect: 0, ofTracking: 0, organic: 0, internal: 0,
  adsAttributed: 0, infloww: 0, total: 0,
};
const ZERO_EXPENSES: ExpenseRollup = {
  metaAdsAuto: 0, otherAds: 0, manualMetaAds: 0, totalAdSpend: 0,
  staffPayouts: 0, agencyOps: 0, creatorPayouts: 0, total: 0,
};

// ── Public API ───────────────────────────────────────────────────────

export async function loadFinancialsRollup(range: DateRange): Promise<FinancialsRollup> {
  const [revenue, expenses] = await Promise.all([
    loadRevenueRollup(range),
    loadExpenseRollup(range),
  ]);
  const netProfit = revenue.total - expenses.total;
  const marginPct = revenue.total > 0 ? (netProfit / revenue.total) * 100 : 0;
  return { range, revenue, expenses, netProfit, marginPct };
}

export async function loadRevenueRollup(range: DateRange): Promise<RevenueRollup> {
  const { from, to } = range;
  const [{ data: orgRows }, { data: intRows }, { data: adRows }, { data: revRows },
         { data: trackRows }, { data: creators }] = await Promise.all([
    supabase.from("organic_entries").select("amount").gte("entry_date", from).lte("entry_date", to),
    supabase.from("internal_entries").select("amount").gte("entry_date", from).lte("entry_date", to),
    supabase.from("ad_campaigns").select("revenue_generated").gte("start_date", from).lte("start_date", to),
    supabase.from("revenue_entries").select("amount").gte("entry_date", from).lte("entry_date", to),
    supabase.from("of_tracking_links").select("revenue_total"),
    // Multi-account aware: pull every connected OF page, not just the
    // primary on the legacy creators column.
    supabase.from("creator_of_accounts")
      .select("onlyfansapi_acct_id")
      .not("onlyfansapi_acct_id", "is", null),
  ]);

  const acctIds = (creators ?? [])
    .map((c) => c.onlyfansapi_acct_id as string)
    .filter(Boolean);
  const ofBreakdown = acctIds.length > 0
    ? await fetchOfEarnings(acctIds, from, to)
    : { total: 0, subs: 0, tips: 0, ppv: 0, messages: 0, streams: 0 };

  const sum = <T extends Record<string, unknown>>(rows: T[] | null, key: keyof T) =>
    (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);

  const organic = sum(orgRows ?? [], "amount");
  const internal = sum(intRows ?? [], "amount");
  const adsAttributed = sum(adRows ?? [], "revenue_generated");
  const infloww = sum(revRows ?? [], "amount");
  const ofTracking = sum(trackRows ?? [], "revenue_total");
  const ofDirect = ofBreakdown.total;
  const total = organic + internal + adsAttributed + infloww + ofDirect;
  return { ...ZERO_REVENUE, ofDirect, ofTracking, organic, internal, adsAttributed, infloww, total };
}

export async function loadExpenseRollup(range: DateRange): Promise<ExpenseRollup> {
  const { from, to } = range;
  const [{ data: metaInsights }, { data: adRows },
         { data: staffRows }, { data: opsRows }, { data: payoutRows }] = await Promise.all([
    // Auto-synced Meta API spend for the window
    supabase.from("meta_insights_daily")
      .select("spend, date_start")
      .eq("level", "account")
      .eq("breakdown_key", "")
      .gte("date_start", from)
      .lte("date_start", to),
    // Manual ad campaigns
    supabase.from("ad_campaigns")
      .select("platform, amount_spent, start_date")
      .gte("start_date", from)
      .lte("start_date", to),
    supabase.from("staff_payouts")
      .select("amount, period_end")
      .gte("period_end", from)
      .lte("period_end", to),
    supabase.from("agency_expenses")
      .select("amount, expense_date")
      .gte("expense_date", from)
      .lte("expense_date", to),
    supabase.from("creator_payouts")
      .select("net_to_creator, period_end")
      .gte("period_end", from)
      .lte("period_end", to),
  ]);

  const metaAdsAuto = (metaInsights ?? []).reduce((s, r) => s + Number(r.spend ?? 0), 0);

  // Split manual ad campaigns by platform
  let otherAds = 0;
  let manualMetaAds = 0;
  for (const r of adRows ?? []) {
    const platform = String(r.platform ?? "other").toLowerCase();
    const amt = Number(r.amount_spent ?? 0);
    if (platform === "meta" || platform === "facebook" || platform === "instagram") {
      manualMetaAds += amt;
    } else {
      otherAds += amt;
    }
  }
  // De-dupe: if we have auto-synced Meta data for the window, ignore
  // manual Meta entries (admin's likely double-tracking). If no auto
  // data, the manual entries are the only Meta number we have.
  const effectiveManualMeta = metaAdsAuto > 0 ? 0 : manualMetaAds;
  const totalAdSpend = metaAdsAuto + otherAds + effectiveManualMeta;

  const staffPayouts = (staffRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const agencyOps = (opsRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const creatorPayouts = (payoutRows ?? []).reduce((s, r) => s + Number(r.net_to_creator ?? 0), 0);

  const total = totalAdSpend + staffPayouts + agencyOps + creatorPayouts;
  return {
    ...ZERO_EXPENSES,
    metaAdsAuto,
    otherAds,
    manualMetaAds: effectiveManualMeta,
    totalAdSpend,
    staffPayouts,
    agencyOps,
    creatorPayouts,
    total,
  };
}

// ── Convenience: previous-period comparison ──────────────────────────

/**
 * Build the immediately-preceding window of equal length, suitable for
 * "prev period" deltas in KPI cards.
 */
export function previousRange(range: DateRange): DateRange {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  const span = toMs - fromMs;
  const prevFrom = new Date(fromMs - span - 86_400_000);
  const prevTo = new Date(fromMs - 86_400_000);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

export function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}
