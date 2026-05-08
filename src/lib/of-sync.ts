// OnlyFans → Supabase sync, extracted so it can run from anywhere
// (the OF dashboard, the Revenue page, a cron job, etc.).
//
// One round-trip per creator pulls profile + earnings + fans + PPV
// + tracking links and upserts everything into the local OF tables.
// Each section is best-effort — a failure on one endpoint doesn't kill
// the rest. That matters because OnlyFansAPI sometimes 404s individual
// endpoints when the underlying OF account isn't fully connected yet.
//
// Returns a structured result so the caller can show "X of Y synced,
// Z failed" without parsing toast messages.

import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const BASE = "https://app.onlyfansapi.com/api";

export type CreatorMin = {
  id: string;
  name?: string;
  of_username: string | null;
  onlyfansapi_acct_id: string | null;
};

export type SyncOneResult =
  | { ok: true; creator_id: string; total_earnings: number }
  | { ok: false; creator_id: string; error: string };

export type SyncAllResult = {
  total: number;
  succeeded: number;
  failed: number;
  failures: Array<{ creator_id: string; error: string }>;
  totalEarningsSynced: number;  // sum of total_earnings across successes
};

// Coercion helpers — OF returns numbers as strings sometimes.
const num = (x: unknown): number =>
  typeof x === "number" ? x : typeof x === "string" ? parseFloat(x) || 0 : 0;
const str = (x: unknown): string | null =>
  typeof x === "string" ? x : null;

function getApiKey(): string | null {
  const k = (import.meta.env.VITE_ONLYFANSAPI_KEY as string | undefined) ?? "";
  return k || null;
}

/** Sync a single creator. Returns success/failure with optional reason. */
export async function syncCreatorOnlyFans(creator: CreatorMin): Promise<SyncOneResult> {
  const key = getApiKey();
  if (!key) return { ok: false, creator_id: creator.id, error: "VITE_ONLYFANSAPI_KEY not set" };
  if (!creator.of_username) return { ok: false, creator_id: creator.id, error: "No OF username set" };

  // 1. Resolve onlyfansapi_acct_id if missing
  let acctId = creator.onlyfansapi_acct_id;
  if (!acctId) {
    try {
      const r = await fetch(`${BASE}/accounts`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const j = await r.json();
      const arr = (Array.isArray(j) ? j : j?.data ?? []) as
        Array<{ id: string; onlyfans_username?: string }>;
      const match = arr.find(
        (a) => a.onlyfans_username?.toLowerCase() === creator.of_username!.toLowerCase(),
      );
      if (!match) {
        return {
          ok: false, creator_id: creator.id,
          error: `Creator ${creator.of_username} not found in OnlyFansAPI accounts. Connect on app.onlyfansapi.com first.`,
        };
      }
      acctId = match.id;
      await supabase.from("creators").update({ onlyfansapi_acct_id: acctId }).eq("id", creator.id);
    } catch (e) {
      return {
        ok: false, creator_id: creator.id,
        error: e instanceof Error ? e.message : "Couldn't resolve OF account id",
      };
    }
  }

  // 2. Best-effort fetch helpers — null on any error.
  const baseHeaders = { Authorization: `Bearer ${key}` };
  const safeFetch = async (path: string): Promise<unknown | null> => {
    try {
      const r = await fetch(`${BASE}/${path.replace(/^\//, "")}`, { headers: baseHeaders });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  };
  const safePost = async (path: string, body: unknown): Promise<unknown | null> => {
    try {
      const r = await fetch(`${BASE}/${path.replace(/^\//, "")}`, {
        method: "POST",
        headers: { ...baseHeaders, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  };

  // 3. Pull every endpoint we need in parallel.
  //
  // OnlyFansAPI's documented endpoints:
  //   GET  /api/{account}/me                              → profile
  //   GET  /api/{account}/payouts/earnings-statistics     → totals + DAILY series
  //                                                         (this replaces the old
  //                                                         /api/analytics/summary/earnings
  //                                                         POST that only returned aggregates)
  //   GET  /api/{account}/tracking-links                  → campaign codes + revenue
  //
  // earnings-statistics returns: { data: { totalEarnings, breakdown:
  // {subscriptions, tips, messages, posts, streams}, timeSeries: [...] } }.
  // We use groupBy=day so the chart finally gets actual daily granularity
  // instead of the monthly buckets the old endpoint forced.
  const today = format(new Date(), "yyyy-MM-dd");
  const lifetimeStart = "2018-01-01";
  const earningsParams = `?startDate=${lifetimeStart}&endDate=${today}&groupBy=day`;
  const [profileJson, earningsJson, trackingJson] = await Promise.all([
    safeFetch(`${acctId}/me`),
    safeFetch(`${acctId}/payouts/earnings-statistics${earningsParams}`),
    safeFetch(`${acctId}/tracking-links`),
  ]);

  // Helpers to unwrap { data: ... } envelopes that OnlyFansAPI uses
  const unwrap = (j: unknown): Record<string, unknown> | null => {
    if (!j || typeof j !== "object") return null;
    const obj = j as Record<string, unknown>;
    return (obj.data && typeof obj.data === "object") ? obj.data as Record<string, unknown> : obj;
  };

  // 4. Upsert profile + lifetime earnings
  //
  // Both endpoints wrap in { data: ... }. The earnings-statistics shape:
  //   { data: { totalEarnings, breakdown: { subscriptions, tips,
  //                                          messages, posts, streams },
  //             timeSeries: [{ date, earnings, type }] } }
  // The breakdown object is where the per-category numbers live — we
  // also fall back to top-level keys for resilience.
  const profile = unwrap(profileJson);
  const earnings = unwrap(earningsJson);
  const breakdown = (earnings?.breakdown && typeof earnings.breakdown === "object")
    ? earnings.breakdown as Record<string, unknown>
    : earnings;
  const pickNum = (...keys: string[]): number => {
    for (const k of keys) {
      const v = num(earnings?.[k]) || num(breakdown?.[k]);
      if (v) return v;
    }
    return 0;
  };
  const totalEarnings = pickNum("totalEarnings", "total_earnings", "total");
  const statsPayload = {
    creator_id: creator.id,
    username: str(profile?.username) ?? creator.of_username,
    display_name: str(profile?.name) ?? str(profile?.display_name),
    // /me returns avatar at the top level; thumbnails nested in avatarThumbs.
    avatar_url: str(profile?.avatar)
      ?? str((profile?.avatarThumbs as Record<string, unknown> | undefined)?.c144)
      ?? str(profile?.avatar_url),
    bio: str(profile?.about) ?? str(profile?.bio),
    // OF /me uses subscribersCount (without underscore). Keep the
    // snake_case fallback for older accounts.
    followers_count: num(profile?.subscribersCount) || num(profile?.subscribers_count) || 0,
    posts_count: num(profile?.postsCount) || num(profile?.posts_count) || 0,
    active_subscribers: num(profile?.subscribersCount) || num(profile?.subscribers_count) || 0,
    expired_subscribers: num(profile?.expired_subscribers) || 0,
    sub_price: profile?.subscribePrice
      ? num(profile.subscribePrice)
      : profile?.subscribe_price
        ? num(profile.subscribe_price)
        : null,
    total_earnings: totalEarnings,
    earnings_subs: pickNum("subscriptions", "subs", "subscription"),
    earnings_tips: pickNum("tips"),
    // OF API names PPV revenue "posts" in the analytics summary.
    earnings_ppv: pickNum("posts", "ppv"),
    earnings_messages: pickNum("messages"),
    earnings_streams: pickNum("streams", "livestreams"),
    earnings_referrals: pickNum("referrals"),
    synced_at: new Date().toISOString(),
  };
  const { error: statsErr } = await supabase
    .from("of_creator_stats")
    .upsert(statsPayload, { onConflict: "creator_id" });
  if (statsErr) {
    return { ok: false, creator_id: creator.id, error: `Stats save failed: ${statsErr.message}` };
  }

  // 5. Daily earnings series for the chart.
  //
  // The earnings-statistics response includes a timeSeries array where
  // each entry is one day (because we passed groupBy=day). Shape:
  //   [{ date: "2025-05-01", earnings: 123.45, type: "subscription"|...
  //      |"tip"|"message"|"post"|"stream" }]
  //
  // Multiple entries can share the same date (one per type). We bucket
  // by date and split into the per-category columns of of_earnings_daily.
  const seriesRaw = (earnings?.timeSeries as unknown[] | undefined)
    ?? (earnings?.history as unknown[] | undefined)
    ?? (earnings?.daily as unknown[] | undefined)
    ?? [];
  if (Array.isArray(seriesRaw) && seriesRaw.length > 0) {
    type DailyAccumulator = {
      subs: number; tips: number; ppv: number; messages: number;
      streams: number; referrals: number; total: number;
    };
    const buckets = new Map<string, DailyAccumulator>();
    const ensure = (date: string): DailyAccumulator => {
      let b = buckets.get(date);
      if (!b) {
        b = { subs: 0, tips: 0, ppv: 0, messages: 0, streams: 0, referrals: 0, total: 0 };
        buckets.set(date, b);
      }
      return b;
    };
    for (const row of seriesRaw as Record<string, unknown>[]) {
      const dateStr = str(row.date) ?? str(row.day) ?? str(row.entry_date);
      if (!dateStr) continue;
      const day = dateStr.slice(0, 10);
      const amt = num(row.earnings) || num(row.amount) || num(row.total);
      const type = String(row.type ?? "").toLowerCase();
      const b = ensure(day);
      switch (type) {
        case "subscription": case "subscriptions": case "subs":
          b.subs += amt; break;
        case "tip": case "tips":
          b.tips += amt; break;
        case "message": case "messages":
          b.messages += amt; break;
        case "post": case "posts": case "ppv":
          b.ppv += amt; break;
        case "stream": case "streams": case "livestream":
          b.streams += amt; break;
        case "referral": case "referrals":
          b.referrals += amt; break;
      }
      b.total += amt;
    }
    const dailyRows = [...buckets.entries()].map(([entry_date, b]) => ({
      creator_id: creator.id,
      entry_date,
      earnings_subs: b.subs,
      earnings_tips: b.tips,
      earnings_ppv: b.ppv,
      earnings_messages: b.messages,
      earnings_streams: b.streams,
      earnings_referrals: b.referrals,
      total: b.total,
    }));
    if (dailyRows.length > 0) {
      await supabase.from("of_earnings_daily")
        .upsert(dailyRows, { onConflict: "creator_id,entry_date" });
    }
  }

  // 6. Subscribers / PPV messages skipped — those endpoints aren't
  // exposed under /api/{account}/ in the current OnlyFansAPI surface.
  // The /onlyfans page sync still uses the inline path that hits them
  // directly (kept as-is for backward compatibility); this shared lib
  // sticks to the documented endpoints.

  // 7. Daily subscriber metric snapshot (today's row)
  await supabase.from("of_subscriber_metrics_daily").upsert({
    creator_id: creator.id,
    entry_date: today,
    active_count: statsPayload.active_subscribers,
    new_count: 0,
    lost_count: 0,
    expired_count: statsPayload.expired_subscribers,
  }, { onConflict: "creator_id,entry_date" });

  // 9. OF native tracking-link campaigns
  const trackingArr: unknown[] = (() => {
    if (!trackingJson) return [];
    if (Array.isArray(trackingJson)) return trackingJson;
    const j = trackingJson as { data?: unknown[]; list?: unknown[] };
    return j.data ?? j.list ?? [];
  })();
  if (trackingArr.length > 0) {
    const trackingRows = (trackingArr as Record<string, unknown>[]).map((t) => {
      const code = num(t.campaignCode) || num(t.campaign_code) || num(t.code);
      if (!code) return null;
      const revObj = (t.revenue as Record<string, unknown> | undefined) ?? {};
      return {
        creator_id: creator.id,
        campaign_code: code,
        campaign_url: str(t.campaignUrl) ?? str(t.campaign_url) ?? str(t.url),
        name: str(t.name) ?? str(t.label) ?? null,
        clicks_count: num(t.clicksCount) || num(t.clicks_count) || num(t.clicks),
        subscribers_count: num(t.subscribersCount) || num(t.subscribers_count) || num(t.subs),
        spenders_count: num(t.spendersCount) || num(t.spenders_count)
          || num(revObj.spendersCount) || num(revObj.spenders_count),
        revenue_total: num(revObj.total) || num(t.revenue_total) || num(t.revenue),
        revenue_per_subscriber: num(revObj.revenuePerSubscriber)
          || num(revObj.revenue_per_subscriber) || 0,
        synced_at: new Date().toISOString(),
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
    if (trackingRows.length > 0) {
      await supabase.from("of_tracking_links")
        .upsert(trackingRows, { onConflict: "creator_id,campaign_code" });
    }
  }

  return { ok: true, creator_id: creator.id, total_earnings: totalEarnings };
}

// ── Date-range earnings (live, no DB write) ──────────────────────────
//
// Used by the Revenue / Financials / Daily pages to show "earnings in
// this date range" without re-running the full sync. Hits the same
// /api/analytics/summary/earnings endpoint as the sync, but with a
// caller-chosen window and returns the data straight back rather than
// upserting it. Deliberately skips the DB so a date-picker change is
// instant and doesn't blow away the lifetime totals saved by the
// sync.

export type EarningsBreakdown = {
  total: number;
  subs: number;
  tips: number;
  ppv: number;
  messages: number;
  streams: number;
};

const ZERO_BREAKDOWN: EarningsBreakdown = {
  total: 0, subs: 0, tips: 0, ppv: 0, messages: 0, streams: 0,
};

function parseEarnings(json: unknown): EarningsBreakdown {
  if (!json || typeof json !== "object") return ZERO_BREAKDOWN;
  const obj = json as Record<string, unknown>;
  const e = (obj.data && typeof obj.data === "object")
    ? (obj.data as Record<string, unknown>)
    : obj;
  // earnings-statistics nests the per-category numbers in `breakdown`
  const bd = (e.breakdown && typeof e.breakdown === "object")
    ? (e.breakdown as Record<string, unknown>)
    : e;
  return {
    total: num(e.totalEarnings) || num(e.total_earnings) || num(e.total),
    subs: num(bd.subscriptions) || num(bd.subs),
    tips: num(bd.tips),
    ppv: num(bd.posts) || num(bd.ppv),
    messages: num(bd.messages),
    streams: num(bd.streams) || num(bd.livestreams),
  };
}

/**
 * Fetch one combined earnings summary across the given account_ids
 * for [start, end]. Hits /api/{account}/payouts/earnings-statistics
 * once per account in parallel and sums the totals — same total as
 * the old POST /api/analytics/summary/earnings endpoint, but the new
 * endpoint is officially documented and returns more detail.
 */
export async function fetchOfEarnings(
  accountIds: string[],
  startDate: string,
  endDate: string,
): Promise<EarningsBreakdown> {
  const key = getApiKey();
  if (!key || accountIds.length === 0) return ZERO_BREAKDOWN;
  const params = `?startDate=${startDate}&endDate=${endDate}`;
  const results = await Promise.all(accountIds.map(async (id) => {
    try {
      const r = await fetch(`${BASE}/${id}/payouts/earnings-statistics${params}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) return ZERO_BREAKDOWN;
      return parseEarnings(await r.json());
    } catch {
      return ZERO_BREAKDOWN;
    }
  }));
  // Sum per-account breakdowns into one combined total
  return results.reduce((acc, r) => ({
    total: acc.total + r.total,
    subs: acc.subs + r.subs,
    tips: acc.tips + r.tips,
    ppv: acc.ppv + r.ppv,
    messages: acc.messages + r.messages,
    streams: acc.streams + r.streams,
  }), ZERO_BREAKDOWN);
}

/**
 * Fetch one earnings breakdown PER creator. The analytics endpoint
 * accepts an array of account_ids but returns combined totals — there's
 * no per-account split in the response — so to get per-creator numbers
 * we have to fire one call per creator. With 5–10 creators this is
 * fine; for larger agencies we'd batch and rate-limit, but that's a
 * future problem.
 *
 * Returns a map keyed by creator_id (NOT account_id) so the caller
 * can render directly against their creator list.
 */
export async function fetchOfEarningsPerCreator(
  creators: Array<{ id: string; onlyfansapi_acct_id: string | null }>,
  startDate: string,
  endDate: string,
): Promise<Record<string, EarningsBreakdown>> {
  const eligible = creators.filter((c) => c.onlyfansapi_acct_id);
  const results = await Promise.all(eligible.map(async (c) => {
    const breakdown = await fetchOfEarnings([c.onlyfansapi_acct_id!], startDate, endDate);
    return [c.id, breakdown] as const;
  }));
  const out: Record<string, EarningsBreakdown> = {};
  for (const [id, b] of results) out[id] = b;
  return out;
}

/** Sync every creator that has an of_username set. */
export async function syncAllCreatorsOnlyFans(
  creators: CreatorMin[],
): Promise<SyncAllResult> {
  const eligible = creators.filter((c) => c.of_username);
  const results = await Promise.all(eligible.map(syncCreatorOnlyFans));
  const succeeded = results.filter((r) => r.ok).length;
  const failures = results
    .filter((r): r is Extract<SyncOneResult, { ok: false }> => !r.ok)
    .map((r) => ({ creator_id: r.creator_id, error: r.error }));
  const totalEarningsSynced = results
    .filter((r): r is Extract<SyncOneResult, { ok: true }> => r.ok)
    .reduce((s, r) => s + r.total_earnings, 0);
  return {
    total: eligible.length,
    succeeded,
    failed: failures.length,
    failures,
    totalEarningsSynced,
  };
}
