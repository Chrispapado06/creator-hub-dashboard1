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
  // OnlyFansAPI uses two different patterns:
  //   • Per-account profile data sits at /api/{account}/me
  //   • Money / earnings data sits at /api/analytics/* (POST endpoints
  //     that take an account_ids array in the body — NOT GETs against
  //     /api/{account}/earnings, which returns 404).
  //
  // For lifetime earnings we ask for a wide date range (2018-now —
  // pre-2018 OF wasn't paying out meaningful sums and 2018 covers any
  // realistic creator). For the chart series we also ask the
  // financial/profitability/{account}/history endpoint which is the
  // only per-account historical series exposed.
  const today = format(new Date(), "yyyy-MM-dd");
  const lifetimeStart = "2018-01-01";
  const [profileJson, earningsJson, historyJson, trackingJson] = await Promise.all([
    safeFetch(`${acctId}/me`),
    safePost("analytics/summary/earnings", {
      account_ids: [acctId],
      start_date: lifetimeStart,
      end_date: today,
    }),
    safeFetch(`analytics/financial/profitability/${acctId}/history?months=24`),
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
  // /api/{account}/me wraps profile in `data:` and adds a `_meta` envelope.
  // /api/analytics/summary/earnings sometimes wraps and sometimes doesn't —
  // we strip both layers below.
  const profile = unwrap(profileJson);
  const earnings = unwrap(earningsJson);
  // The analytics earnings response uses the field names: total_earnings,
  // subscriptions, posts, messages, tips, streams. Older docs also
  // documented totalEarnings / subs / ppv as variants — try them all
  // for resilience across API versions.
  const pickNum = (...keys: string[]): number => {
    for (const k of keys) {
      const v = num(earnings?.[k]);
      if (v) return v;
    }
    return 0;
  };
  const totalEarnings = pickNum("total_earnings", "totalEarnings", "total");
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

  // 5. Historical earnings for the chart.
  //
  // OnlyFansAPI's only per-account time series is monthly:
  //   GET /api/analytics/financial/profitability/{account}/history?months=24
  // Response: [{ year, month, gross_revenue, net_revenue, profit, margin }]
  //
  // We don't have daily data, so we synthesize one row per month at
  // the 1st-of-the-month into of_earnings_daily.total. The chart
  // bucket-by-day is fine with sparse data — it just shows non-zero
  // dots on the first of each month. Better than $0 across the board.
  const historyData = unwrap(historyJson);
  const historyRows = Array.isArray(historyData) ? historyData
    : Array.isArray((historyData as { data?: unknown })?.data) ? (historyData as { data: unknown[] }).data
    : [];
  if (historyRows.length > 0) {
    const dailyRows = (historyRows as Record<string, unknown>[]).map((m) => {
      const year = num(m.year);
      const month = num(m.month);
      if (!year || !month) return null;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const grossRev = num(m.gross_revenue) || num(m.grossRevenue);
      const netRev = num(m.net_revenue) || num(m.netRevenue);
      // Use gross by default — net subtracts OF's 20% cut, which is
      // what hits the bank, but the rest of the app reports gross
      // numbers consistently.
      const total = grossRev || netRev;
      return {
        creator_id: creator.id,
        entry_date: dateStr,
        earnings_subs: 0,
        earnings_tips: 0,
        earnings_ppv: 0,
        earnings_messages: 0,
        earnings_streams: 0,
        earnings_referrals: 0,
        total,
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
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
