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
  // Earnings endpoint: POST /analytics/summary/earnings is the working
  // path for current OnlyFansAPI tiers. We try the GET path as a
  // fallback below in case POST fails for any reason.
  const [profileJson, earningsJson, trackingJson] = await Promise.all([
    safeFetch(`${acctId}/me`),
    safePost("analytics/summary/earnings", {
      account_ids: [acctId],
      start_date: lifetimeStart,
      end_date: today,
    }),
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

  // Critical fail-safe: if the earnings endpoint failed (returned null),
  // OR returned an obviously-empty response, DO NOT touch the earnings
  // columns. Earlier behaviour was to write zeros over Marissa's existing
  // good numbers when a transient 429/5xx hit on a multi-creator sync.
  // The trigger was multiple creators causing rate limits, and the symptom
  // was "I added more creators and now Marissa shows $0".
  //
  // Profile fields ARE always updated — those don't have the same
  // overwrite risk because /me is a separate, cheaper endpoint that
  // succeeds independently.
  const earningsAvailable = earningsJson !== null && totalEarnings >= 0
    && (totalEarnings > 0 || (earnings && Object.keys(earnings).length > 0));

  // If the primary POST call also failed, try the GET endpoint as
  // a forward-compat fallback (currently 404s for our accounts but
  // documented — flips on automatically the day OnlyFansAPI ships it).
  let fallbackEarnings: Record<string, unknown> | null = null;
  if (!earningsAvailable) {
    try {
      const r = await fetch(
        `${BASE}/${acctId}/payouts/earnings-statistics?startDate=${lifetimeStart}&endDate=${today}`,
        { headers: { Authorization: `Bearer ${key}` } },
      );
      if (r.ok) {
        const j = await r.json();
        const u = unwrap(j);
        if (u && (num(u.total_earnings) || num(u.totalEarnings))) {
          fallbackEarnings = u;
        }
      }
    } catch { /* swallow — we'll just skip earnings update */ }
  }

  // Build the upsert payload. Earnings columns are added ONLY when we
  // have real data (from primary endpoint OR fallback). Omitted columns
  // are preserved on existing rows (Postgres upsert default), so a sync
  // failure no longer wipes a creator's good numbers.
  type StatsPayload = {
    creator_id: string;
    username: string | null; display_name: string | null;
    avatar_url: string | null; bio: string | null;
    followers_count: number; posts_count: number;
    active_subscribers: number; expired_subscribers: number;
    sub_price: number | null;
    synced_at: string;
    total_earnings?: number; earnings_subs?: number; earnings_tips?: number;
    earnings_ppv?: number; earnings_messages?: number;
    earnings_streams?: number; earnings_referrals?: number;
  };
  const statsPayload: StatsPayload = {
    creator_id: creator.id,
    username: str(profile?.username) ?? creator.of_username,
    display_name: str(profile?.name) ?? str(profile?.display_name),
    avatar_url: str(profile?.avatar)
      ?? str((profile?.avatarThumbs as Record<string, unknown> | undefined)?.c144)
      ?? str(profile?.avatar_url),
    bio: str(profile?.about) ?? str(profile?.bio),
    followers_count: num(profile?.subscribersCount) || num(profile?.subscribers_count) || 0,
    posts_count: num(profile?.postsCount) || num(profile?.posts_count) || 0,
    active_subscribers: num(profile?.subscribersCount) || num(profile?.subscribers_count) || 0,
    expired_subscribers: num(profile?.expired_subscribers) || 0,
    sub_price: profile?.subscribePrice
      ? num(profile.subscribePrice)
      : profile?.subscribe_price
        ? num(profile.subscribe_price)
        : null,
    synced_at: new Date().toISOString(),
  };
  if (earningsAvailable) {
    statsPayload.total_earnings = totalEarnings;
    statsPayload.earnings_subs = pickNum("subscriptions", "subs", "subscription");
    statsPayload.earnings_tips = pickNum("tips");
    statsPayload.earnings_ppv = pickNum("posts", "ppv");
    statsPayload.earnings_messages = pickNum("messages");
    statsPayload.earnings_streams = pickNum("streams", "livestreams");
    statsPayload.earnings_referrals = pickNum("referrals");
  } else if (fallbackEarnings) {
    statsPayload.total_earnings = num(fallbackEarnings.total_earnings) || num(fallbackEarnings.totalEarnings);
    statsPayload.earnings_subs = num(fallbackEarnings.subscriptions) || num(fallbackEarnings.subs);
    statsPayload.earnings_tips = num(fallbackEarnings.tips);
    statsPayload.earnings_ppv = num(fallbackEarnings.posts) || num(fallbackEarnings.ppv);
    statsPayload.earnings_messages = num(fallbackEarnings.messages);
    statsPayload.earnings_streams = num(fallbackEarnings.streams) || num(fallbackEarnings.livestreams);
    statsPayload.earnings_referrals = num(fallbackEarnings.referrals);
  }
  // Else: leave earnings columns untouched (preserves prior good values
  // on update; defaults to 0 only on a fresh insert, which is correct).

  const { error: statsErr } = await supabase
    .from("of_creator_stats")
    .upsert(statsPayload, { onConflict: "creator_id" });
  if (statsErr) {
    return { ok: false, creator_id: creator.id, error: `Stats save failed: ${statsErr.message}` };
  }
  // Surface a clear error message to the caller when ALL earnings paths
  // failed, so the toast tells the truth.
  if (!earningsAvailable && !fallbackEarnings) {
    return {
      ok: false,
      creator_id: creator.id,
      error: "Earnings endpoint failed (likely OF API rate limit). Profile updated, earnings preserved.",
    };
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

  // Report whichever total we ended up using (primary or fallback).
  const reportedTotal = earningsAvailable
    ? totalEarnings
    : (fallbackEarnings ? num(fallbackEarnings.total_earnings) || num(fallbackEarnings.totalEarnings) : 0);
  return { ok: true, creator_id: creator.id, total_earnings: reportedTotal };
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
 * Fetch earnings for a single account, with automatic fallback.
 *
 * Tries the new endpoint first (/payouts/earnings-statistics). If that
 * fails for any reason, falls back to the legacy POST endpoint
 * (/analytics/summary/earnings). Some accounts respond to one but not
 * the other depending on which API tier they're on, so we cover both.
 */
async function fetchEarningsForOneAccount(
  key: string,
  accountId: string,
  startDate: string,
  endDate: string,
): Promise<EarningsBreakdown> {
  // PRIMARY: POST /analytics/summary/earnings.
  // This is the endpoint that's been working in production for these
  // accounts — confirmed via the OF Data Inspector. The supposedly-newer
  // GET /payouts/earnings-statistics returns 404 for accounts on the
  // current OnlyFansAPI tier, even though the docs document it. Try
  // POST first; only fall back to GET if POST fails.
  try {
    const r = await fetch(`${BASE}/analytics/summary/earnings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        account_ids: [accountId],
        start_date: startDate,
        end_date: endDate,
      }),
    });
    if (r.ok) return parseEarnings(await r.json());
  } catch { /* fall through */ }
  // FALLBACK: GET /payouts/earnings-statistics. Documented but currently
  // 404s for our accounts — kept as a forward-compat fallback so the
  // moment OnlyFansAPI flips it on we'll start using it automatically.
  try {
    const r = await fetch(
      `${BASE}/${accountId}/payouts/earnings-statistics?startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (r.ok) return parseEarnings(await r.json());
  } catch { /* both failed */ }
  return ZERO_BREAKDOWN;
}

/**
 * Fetch combined earnings across multiple account_ids for [start, end].
 *
 * Calls the per-account endpoint SERIALLY with a small inter-call delay
 * to stay under OnlyFansAPI's rate limit. Earlier behaviour was
 * Promise.all parallel which tripped 429s once admins had ~3+
 * connected creators (the trigger for the "added more creators and
 * now Marissa shows $0" bug).
 */
export async function fetchOfEarnings(
  accountIds: string[],
  startDate: string,
  endDate: string,
): Promise<EarningsBreakdown> {
  const key = getApiKey();
  if (!key || accountIds.length === 0) return ZERO_BREAKDOWN;
  const out: EarningsBreakdown = { ...ZERO_BREAKDOWN };
  for (const id of accountIds) {
    const r = await fetchEarningsForOneAccount(key, id, startDate, endDate);
    out.total += r.total;
    out.subs += r.subs;
    out.tips += r.tips;
    out.ppv += r.ppv;
    out.messages += r.messages;
    out.streams += r.streams;
    // Gentle 150ms breather between accounts. With 5 creators that's
    // ~750ms of extra latency vs parallel — worth it to keep numbers
    // accurate instead of intermittently zero.
    await new Promise((res) => setTimeout(res, 150));
  }
  return out;
}

/**
 * Per-creator earnings breakdown. Same serial discipline as
 * fetchOfEarnings — one call per creator, sequential, with a small
 * delay between requests.
 */
export async function fetchOfEarningsPerCreator(
  creators: Array<{ id: string; onlyfansapi_acct_id: string | null }>,
  startDate: string,
  endDate: string,
): Promise<Record<string, EarningsBreakdown>> {
  const key = getApiKey();
  const eligible = creators.filter((c) => c.onlyfansapi_acct_id);
  const out: Record<string, EarningsBreakdown> = {};
  if (!key || eligible.length === 0) return out;
  for (const c of eligible) {
    out[c.id] = await fetchEarningsForOneAccount(
      key, c.onlyfansapi_acct_id!, startDate, endDate,
    );
    await new Promise((res) => setTimeout(res, 150));
  }
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
