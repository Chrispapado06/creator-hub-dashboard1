// Meta Marketing Graph API client + Supabase sync layer.
//
// Single source of truth for everything ad-account / campaign / adset /
// ad / insights related. All endpoints go through `gApi` so we have one
// place that handles base URL, error parsing, and the (mild) rate-limit
// headers Meta returns.
//
// Reads run from the browser using the user-supplied access token. Writes
// (pause / resume / budget) ALSO run from the browser today — that's a
// known security tradeoff the project has already accepted by storing
// the token in agency_settings, but write operations are gated behind
// confirm dialogs in the UI to limit blast radius. A future hardening
// move is to proxy writes through a Supabase Edge Function so the token
// never leaves the server.

import { supabase } from "@/integrations/supabase/client";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ── Low-level Graph API call ─────────────────────────────────────────────

type GraphPagingCursor = { after?: string; next?: string };
type GraphResponse<T> = {
  data?: T[];
  paging?: { cursors?: GraphPagingCursor; next?: string };
  error?: { message?: string; code?: number; type?: string };
};

async function gApi<T = Record<string, unknown>>(
  path: string,
  token: string,
  opts: { params?: Record<string, string | number | boolean>; method?: "GET" | "POST" } = {},
): Promise<{ data: T[]; raw: GraphResponse<T> }> {
  const u = new URL(`${GRAPH_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    u.searchParams.set(k, String(v));
  }
  u.searchParams.set("access_token", token);
  // Auto-paginate up to 5 pages per call (250 rows for `limit=50`) — enough
  // for typical ad accounts without burning the rate limit.
  let next: string | null = u.toString();
  let pages = 0;
  const allData: T[] = [];
  let lastRaw: GraphResponse<T> = {};
  while (next && pages < 5) {
    const res = await fetch(next, { method: opts.method ?? "GET" });
    const json = (await res.json()) as GraphResponse<T>;
    lastRaw = json;
    if (json.error) throw new Error(`Meta API: ${json.error.message ?? json.error.type ?? "unknown error"}`);
    if (Array.isArray(json.data)) allData.push(...json.data);
    next = json.paging?.next ?? null;
    pages++;
  }
  return { data: allData, raw: lastRaw };
}

// ── Connection helpers (already used by MetaAdsConnectionPanel) ─────────

export type AdAccountInfo = { id: string; name: string; account_status: number; currency: string; timezone_name: string };

export async function fetchAccount(token: string, accountId: string): Promise<AdAccountInfo | null> {
  const res = await fetch(
    `${GRAPH_BASE}/act_${encodeURIComponent(accountId)}?fields=name,account_status,currency,timezone_name&access_token=${encodeURIComponent(token)}`,
  );
  const json = (await res.json()) as Partial<AdAccountInfo> & { error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "Account fetch failed");
  if (!json.name) return null;
  return {
    id: accountId,
    name: json.name,
    account_status: Number(json.account_status ?? 0),
    currency: String(json.currency ?? ""),
    timezone_name: String(json.timezone_name ?? ""),
  };
}

/** Probe the token's granted permissions — used to warn when write scopes are missing. */
export async function fetchTokenPermissions(token: string): Promise<{ permission: string; status: string }[]> {
  try {
    const { data } = await gApi<{ permission: string; status: string }>("/me/permissions", token);
    return data;
  } catch {
    return [];
  }
}

export const tokenHasWriteScope = (perms: { permission: string; status: string }[]): boolean =>
  perms.some((p) => (p.permission === "ads_management") && p.status === "granted");

// ── Catalog sync (auto-list every campaign in the account) ──────────────

const CAMPAIGN_FIELDS = [
  "id", "name", "status", "effective_status", "objective",
  "daily_budget", "lifetime_budget",
  "start_time", "stop_time", "created_time", "updated_time",
].join(",");

export async function syncCampaignsCatalog(token: string, accountId: string): Promise<{ inserted: number; archived: number }> {
  const { data } = await gApi<{
    id: string; name?: string; status?: string; effective_status?: string; objective?: string;
    daily_budget?: string; lifetime_budget?: string;
    start_time?: string; stop_time?: string; created_time?: string; updated_time?: string;
  }>(
    `/act_${accountId}/campaigns`,
    token,
    { params: { fields: CAMPAIGN_FIELDS, limit: 50 } },
  );

  if (data.length === 0) return { inserted: 0, archived: 0 };

  // Pull lifetime insights for these campaigns in one batched call so we
  // can populate the rollup columns. `?ids=...` supports up to 50 IDs.
  const insightsByCampaign = await fetchInsightsBatch(
    token,
    data.map((c) => c.id),
    "campaign",
    "maximum",
  );

  const upserts = data.map((c) => {
    const ins = insightsByCampaign.get(c.id);
    return {
      meta_campaign_id: c.id,
      account_id: accountId,
      name: c.name ?? null,
      status: c.status ?? null,
      effective_status: c.effective_status ?? null,
      objective: c.objective ?? null,
      daily_budget_cents: c.daily_budget ? Number(c.daily_budget) : null,
      lifetime_budget_cents: c.lifetime_budget ? Number(c.lifetime_budget) : null,
      start_time: c.start_time ?? null,
      stop_time: c.stop_time ?? null,
      created_time: c.created_time ?? null,
      updated_time: c.updated_time ?? null,
      spend: ins?.spend ?? 0,
      impressions: ins?.impressions ?? 0,
      reach: ins?.reach ?? 0,
      clicks: ins?.clicks ?? 0,
      ctr: ins?.ctr ?? null,
      cpc: ins?.cpc ?? null,
      cpm: ins?.cpm ?? null,
      frequency: ins?.frequency ?? null,
      deleted_at: null,
      synced_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from("meta_campaigns_catalog")
    .upsert(upserts, { onConflict: "meta_campaign_id" });
  if (error) throw new Error(`Supabase upsert: ${error.message}`);

  // Mark catalog rows that are missing from the latest sync as deleted.
  // Cheap soft-delete keeps history visible without nuking dependent FKs.
  const liveIds = new Set(data.map((c) => c.id));
  const { data: existing } = await supabase
    .from("meta_campaigns_catalog")
    .select("meta_campaign_id, deleted_at")
    .eq("account_id", accountId);
  const archivedIds = (existing ?? [])
    .filter((r) => !r.deleted_at && !liveIds.has(r.meta_campaign_id))
    .map((r) => r.meta_campaign_id);
  if (archivedIds.length > 0) {
    await supabase
      .from("meta_campaigns_catalog")
      .update({ deleted_at: new Date().toISOString() })
      .in("meta_campaign_id", archivedIds);
  }

  return { inserted: data.length, archived: archivedIds.length };
}

// ── Adsets + Ads sync per campaign ──────────────────────────────────────

const ADSET_FIELDS = [
  "id", "name", "status", "effective_status",
  "daily_budget", "lifetime_budget", "optimization_goal", "billing_event",
  "targeting", "created_time", "updated_time", "campaign_id",
].join(",");

export async function syncAdsetsForCampaign(token: string, campaignId: string): Promise<number> {
  const { data } = await gApi<{
    id: string; name?: string; status?: string; effective_status?: string;
    daily_budget?: string; lifetime_budget?: string;
    optimization_goal?: string; billing_event?: string;
    targeting?: Record<string, unknown>;
    created_time?: string; updated_time?: string;
  }>(`/${campaignId}/adsets`, token, { params: { fields: ADSET_FIELDS, limit: 50 } });

  if (data.length === 0) return 0;

  const insights = await fetchInsightsBatch(token, data.map((a) => a.id), "adset", "maximum");

  const upserts = data.map((a) => {
    const ins = insights.get(a.id);
    return {
      meta_adset_id: a.id,
      meta_campaign_id: campaignId,
      name: a.name ?? null,
      status: a.status ?? null,
      effective_status: a.effective_status ?? null,
      daily_budget_cents: a.daily_budget ? Number(a.daily_budget) : null,
      lifetime_budget_cents: a.lifetime_budget ? Number(a.lifetime_budget) : null,
      optimization_goal: a.optimization_goal ?? null,
      billing_event: a.billing_event ?? null,
      targeting: a.targeting ?? null,
      created_time: a.created_time ?? null,
      updated_time: a.updated_time ?? null,
      spend: ins?.spend ?? 0,
      impressions: ins?.impressions ?? 0,
      reach: ins?.reach ?? 0,
      clicks: ins?.clicks ?? 0,
      ctr: ins?.ctr ?? null,
      cpc: ins?.cpc ?? null,
      cpm: ins?.cpm ?? null,
      frequency: ins?.frequency ?? null,
      deleted_at: null,
      synced_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from("meta_adsets")
    .upsert(upserts, { onConflict: "meta_adset_id" });
  if (error) throw new Error(`Supabase upsert: ${error.message}`);
  return data.length;
}

const AD_FIELDS = [
  "id", "name", "status", "effective_status",
  "creative{id,thumbnail_url,image_url,video_id,object_story_spec,call_to_action_type}",
  "preview_shareable_link",
  "created_time", "updated_time", "adset_id", "campaign_id",
].join(",");

export async function syncAdsForCampaign(token: string, campaignId: string): Promise<number> {
  const { data } = await gApi<{
    id: string; name?: string; status?: string; effective_status?: string;
    creative?: {
      id: string; thumbnail_url?: string; image_url?: string; video_id?: string;
      object_story_spec?: { link_data?: { name?: string; description?: string }; video_data?: { title?: string } };
      call_to_action_type?: string;
    };
    preview_shareable_link?: string;
    created_time?: string; updated_time?: string;
    adset_id?: string;
  }>(`/${campaignId}/ads`, token, { params: { fields: AD_FIELDS, limit: 50 } });

  if (data.length === 0) return 0;

  const insights = await fetchInsightsBatch(token, data.map((a) => a.id), "ad", "maximum");

  const upserts = data.map((a) => {
    const ins = insights.get(a.id);
    const linkData = a.creative?.object_story_spec?.link_data;
    return {
      meta_ad_id: a.id,
      meta_adset_id: a.adset_id ?? "",
      meta_campaign_id: campaignId,
      name: a.name ?? null,
      status: a.status ?? null,
      effective_status: a.effective_status ?? null,
      creative_id: a.creative?.id ?? null,
      thumbnail_url: a.creative?.thumbnail_url ?? null,
      image_url: a.creative?.image_url ?? null,
      video_id: a.creative?.video_id ?? null,
      permalink_url: a.preview_shareable_link ?? null,
      headline: linkData?.name ?? a.creative?.object_story_spec?.video_data?.title ?? null,
      body: linkData?.description ?? null,
      call_to_action_type: a.creative?.call_to_action_type ?? null,
      created_time: a.created_time ?? null,
      updated_time: a.updated_time ?? null,
      spend: ins?.spend ?? 0,
      impressions: ins?.impressions ?? 0,
      reach: ins?.reach ?? 0,
      clicks: ins?.clicks ?? 0,
      ctr: ins?.ctr ?? null,
      cpc: ins?.cpc ?? null,
      cpm: ins?.cpm ?? null,
      frequency: ins?.frequency ?? null,
      deleted_at: null,
      synced_at: new Date().toISOString(),
    };
  });

  // Filter out ads without an adset_id (rare but possible for archived/deleted ads).
  const valid = upserts.filter((u) => u.meta_adset_id);
  if (valid.length === 0) return 0;
  const { error } = await supabase
    .from("meta_ads")
    .upsert(valid, { onConflict: "meta_ad_id" });
  if (error) throw new Error(`Supabase upsert: ${error.message}`);
  return valid.length;
}

// ── Insights — daily time series, breakdowns, batched lifetime ──────────

type InsightRow = {
  spend?: string; impressions?: string; reach?: string; clicks?: string;
  ctr?: string; cpc?: string; cpm?: string; frequency?: string;
};
type Aggregated = { spend: number; impressions: number; reach: number; clicks: number; ctr: number | null; cpc: number | null; cpm: number | null; frequency: number | null };
const parseInsight = (r: InsightRow): Aggregated => ({
  spend: parseFloat(r.spend ?? "0"),
  impressions: parseInt(r.impressions ?? "0"),
  reach: parseInt(r.reach ?? "0"),
  clicks: parseInt(r.clicks ?? "0"),
  ctr: r.ctr ? parseFloat(r.ctr) : null,
  cpc: r.cpc ? parseFloat(r.cpc) : null,
  cpm: r.cpm ? parseFloat(r.cpm) : null,
  frequency: r.frequency ? parseFloat(r.frequency) : null,
});

const INSIGHT_FIELDS = "spend,impressions,reach,clicks,ctr,cpc,cpm,frequency";

/** Lifetime insights, batched up to 50 IDs at a time. Returns map keyed by object id. */
async function fetchInsightsBatch(
  token: string,
  ids: string[],
  level: "campaign" | "adset" | "ad",
  datePreset: string,
): Promise<Map<string, Aggregated>> {
  const result = new Map<string, Aggregated>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    // Per-object insights endpoint via ?ids=... and field-expansion is the
    // cheapest call the Graph API supports. Each ID becomes a key in the
    // top-level response object with its own data array.
    const url = `${GRAPH_BASE}/?ids=${chunk.join(",")}&fields=insights.date_preset(${datePreset}).level(${level}){${INSIGHT_FIELDS}}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const json = (await res.json()) as Record<string, { insights?: { data?: InsightRow[] } } | { error?: { message?: string } }>;
    for (const [id, value] of Object.entries(json)) {
      if (id === "error") continue;
      const insightsData = (value as { insights?: { data?: InsightRow[] } }).insights?.data?.[0];
      if (insightsData) result.set(id, parseInsight(insightsData));
    }
  }
  return result;
}

export type DailyInsightRow = Aggregated & { date_start: string };

/** Daily time series for a campaign/adset/ad over the last N days. */
export async function syncDailyTimeSeries(
  token: string,
  level: "campaign" | "adset" | "ad" | "account",
  objectId: string,
  days: number = 90,
): Promise<number> {
  const path = level === "account"
    ? `/act_${objectId}/insights`
    : `/${objectId}/insights`;
  const { data } = await gApi<InsightRow & { date_start: string; date_stop: string }>(
    path,
    token,
    {
      params: {
        fields: INSIGHT_FIELDS,
        time_increment: 1,
        date_preset: days <= 7 ? "last_7d" : days <= 30 ? "last_30d" : days <= 90 ? "last_90d" : "last_90d",
        level: level === "account" ? "account" : level,
        limit: 100,
      },
    },
  );
  if (data.length === 0) return 0;
  const upserts = data.map((r) => ({
    level,
    object_id: objectId,
    date_start: r.date_start,
    breakdown_key: "",
    breakdown_value: "",
    ...parseInsight(r),
    synced_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("meta_insights_daily")
    .upsert(upserts, { onConflict: "level,object_id,date_start,breakdown_key,breakdown_value" });
  if (error) throw new Error(`Supabase upsert: ${error.message}`);
  return data.length;
}

export type BreakdownKey = "publisher_platform" | "platform_position" | "age" | "gender" | "country" | "device_platform";

/**
 * Pull a breakdown report (placement, demographics, etc) for one object
 * over the given window. Stored without a date_start dimension — Meta
 * returns the totals for the window. We use date_start = today as a
 * convention for "this is the latest snapshot of this breakdown."
 */
export async function syncBreakdown(
  token: string,
  level: "campaign" | "adset" | "ad",
  objectId: string,
  breakdown: BreakdownKey,
  days: number = 30,
): Promise<number> {
  const { data } = await gApi<InsightRow & Record<string, string>>(
    `/${objectId}/insights`,
    token,
    {
      params: {
        fields: INSIGHT_FIELDS,
        breakdowns: breakdown,
        date_preset: days <= 7 ? "last_7d" : days <= 30 ? "last_30d" : "last_90d",
        level,
        limit: 100,
      },
    },
  );
  if (data.length === 0) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const upserts = data.map((r) => ({
    level,
    object_id: objectId,
    date_start: today,
    breakdown_key: breakdown,
    breakdown_value: String(r[breakdown] ?? "unknown"),
    ...parseInsight(r),
    synced_at: new Date().toISOString(),
  }));
  // Wipe stale rows for this breakdown before re-inserting — otherwise
  // disappearing buckets (e.g. an age range that stopped getting served)
  // linger forever.
  await supabase
    .from("meta_insights_daily")
    .delete()
    .eq("level", level)
    .eq("object_id", objectId)
    .eq("breakdown_key", breakdown);
  const { error } = await supabase
    .from("meta_insights_daily")
    .upsert(upserts, { onConflict: "level,object_id,date_start,breakdown_key,breakdown_value" });
  if (error) throw new Error(`Supabase upsert: ${error.message}`);
  return data.length;
}

// ── Account snapshot ────────────────────────────────────────────────────

export async function syncAccountSnapshot(token: string, accountId: string): Promise<void> {
  const acct = await fetchAccount(token, accountId);
  if (!acct) return;

  // Pull 30d + 7d account-level totals in two cheap calls.
  const [{ data: d30 }, { data: d7 }] = await Promise.all([
    gApi<{ spend?: string }>(`/act_${accountId}/insights`, token, {
      params: { fields: "spend", date_preset: "last_30d", level: "account" },
    }),
    gApi<{ spend?: string }>(`/act_${accountId}/insights`, token, {
      params: { fields: "spend", date_preset: "last_7d", level: "account" },
    }),
  ]);
  const spend30 = parseFloat(d30[0]?.spend ?? "0");
  const spend7 = parseFloat(d7[0]?.spend ?? "0");

  // Active vs paused campaign counts from the catalog table (already synced).
  const { data: campaigns } = await supabase
    .from("meta_campaigns_catalog")
    .select("status, deleted_at")
    .eq("account_id", accountId);
  const live = (campaigns ?? []).filter((c) => !c.deleted_at);
  const active = live.filter((c) => c.status === "ACTIVE").length;
  const paused = live.filter((c) => c.status === "PAUSED").length;

  await supabase.from("meta_account_snapshots").upsert(
    [{
      account_id: accountId,
      account_name: acct.name,
      account_status: acct.account_status,
      currency: acct.currency,
      timezone_name: acct.timezone_name,
      spend_30d: spend30,
      spend_7d: spend7,
      active_campaigns: active,
      paused_campaigns: paused,
      synced_at: new Date().toISOString(),
    }],
    { onConflict: "account_id" },
  );
}

// ── Write operations (status / budget) ──────────────────────────────────
// These require the `ads_management` scope on the access token. The UI
// gates them behind confirm dialogs and surfaces toast errors on failure.

async function gPost(path: string, token: string, body: Record<string, string | number>): Promise<void> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, String(v));
  fd.set("access_token", token);
  const res = await fetch(`${GRAPH_BASE}${path}`, { method: "POST", body: fd });
  const json = await res.json() as { success?: boolean; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "Meta write failed");
  if (json.success === false) throw new Error("Meta returned success=false");
}

export async function setCampaignStatus(token: string, campaignId: string, status: "ACTIVE" | "PAUSED"): Promise<void> {
  await gPost(`/${campaignId}`, token, { status });
  // Reflect locally so the UI updates without a full re-sync.
  await supabase.from("meta_campaigns_catalog")
    .update({ status, effective_status: status, synced_at: new Date().toISOString() })
    .eq("meta_campaign_id", campaignId);
}

export async function setCampaignDailyBudget(token: string, campaignId: string, dollars: number): Promise<void> {
  if (dollars <= 0) throw new Error("Budget must be greater than zero");
  // Meta budgets are in cents (smallest currency unit).
  const cents = Math.round(dollars * 100);
  await gPost(`/${campaignId}`, token, { daily_budget: cents });
  await supabase.from("meta_campaigns_catalog")
    .update({ daily_budget_cents: cents, synced_at: new Date().toISOString() })
    .eq("meta_campaign_id", campaignId);
}

// Same operations at the adset level — Meta accepts budget changes on
// either campaign (CBO) or adset (ABO), depending on the campaign's
// budget_optimization setting.
export async function setAdsetStatus(token: string, adsetId: string, status: "ACTIVE" | "PAUSED"): Promise<void> {
  await gPost(`/${adsetId}`, token, { status });
  await supabase.from("meta_adsets")
    .update({ status, effective_status: status, synced_at: new Date().toISOString() })
    .eq("meta_adset_id", adsetId);
}

export async function setAdsetDailyBudget(token: string, adsetId: string, dollars: number): Promise<void> {
  if (dollars <= 0) throw new Error("Budget must be greater than zero");
  const cents = Math.round(dollars * 100);
  await gPost(`/${adsetId}`, token, { daily_budget: cents });
  await supabase.from("meta_adsets")
    .update({ daily_budget_cents: cents, synced_at: new Date().toISOString() })
    .eq("meta_adset_id", adsetId);
}

// ── Convenience: full sync of one campaign (catalog + adsets + ads + daily + breakdowns) ──

export async function fullSyncCampaign(
  token: string,
  campaignId: string,
  opts?: { breakdowns?: BreakdownKey[]; days?: number },
): Promise<{ adsets: number; ads: number; dailyRows: number; breakdownRows: number }> {
  const days = opts?.days ?? 30;
  const breakdowns = opts?.breakdowns ?? ["publisher_platform", "platform_position", "age", "gender", "country"];

  const [adsets, ads, dailyRows] = await Promise.all([
    syncAdsetsForCampaign(token, campaignId),
    syncAdsForCampaign(token, campaignId),
    syncDailyTimeSeries(token, "campaign", campaignId, days),
  ]);

  let breakdownRows = 0;
  for (const bk of breakdowns) {
    breakdownRows += await syncBreakdown(token, "campaign", campaignId, bk, days);
  }
  return { adsets, ads, dailyRows, breakdownRows };
}
