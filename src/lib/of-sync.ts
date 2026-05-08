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

  // 2. Best-effort fetch helper — null on any error.
  const baseHeaders = { Authorization: `Bearer ${key}` };
  const safeFetch = async (path: string): Promise<unknown | null> => {
    try {
      const r = await fetch(`${BASE}/${acctId}/${path}`, { headers: baseHeaders });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  };

  // 3. Pull each endpoint in parallel
  const [profileJson, earningsJson, fansJson, ppvJson, trackingJson] = await Promise.all([
    safeFetch(""),
    safeFetch("earnings"),
    safeFetch("fans?limit=200"),
    safeFetch("messages?type=ppv&limit=100"),
    safeFetch("tracking-links"),
  ]);

  // Helpers to unwrap { data: ... } envelopes that OnlyFansAPI uses
  const unwrap = (j: unknown): Record<string, unknown> | null => {
    if (!j || typeof j !== "object") return null;
    const obj = j as Record<string, unknown>;
    return (obj.data && typeof obj.data === "object") ? obj.data as Record<string, unknown> : obj;
  };

  // 4. Upsert profile + lifetime earnings
  //
  // OnlyFansAPI's /earnings endpoint has shipped at least three response
  // shapes across the lifetime of the API. We've seen all of these in
  // the wild:
  //   { data: { total, subscriptions, tips, ... } }
  //   { data: { earnings: { total: ..., breakdown: {...} } } }
  //   { total, subscriptions, tips, ... }   (older accounts, flat)
  // The unwrap() above peels off `data:`. Then we drill once more in
  // case there's a nested `earnings:` envelope. Field names are also
  // inconsistent — try every documented variant before giving up.
  const profile = unwrap(profileJson);
  const earningsOuter = unwrap(earningsJson);
  // Drill into a nested `earnings:` if present (some accounts return that)
  const earnings = (earningsOuter?.earnings && typeof earningsOuter.earnings === "object")
    ? earningsOuter.earnings as Record<string, unknown>
    : earningsOuter;
  // OnlyFansAPI sometimes nests the breakdown one more level under
  // `breakdown:` or `byType:`. Pull the leaf object that actually
  // contains numeric fields.
  const breakdown = (earnings?.breakdown && typeof earnings.breakdown === "object")
    ? earnings.breakdown as Record<string, unknown>
    : (earnings?.byType && typeof earnings.byType === "object")
      ? earnings.byType as Record<string, unknown>
      : earnings;
  const pickNum = (...keys: string[]): number => {
    for (const k of keys) {
      const v = num(earnings?.[k]) || num(breakdown?.[k]) || num(earningsOuter?.[k]);
      if (v) return v;
    }
    return 0;
  };
  const totalEarnings = pickNum("total", "lifetime", "lifetimeEarnings", "totalEarnings", "earnings", "amount");
  const statsPayload = {
    creator_id: creator.id,
    username: str(profile?.username) ?? creator.of_username,
    display_name: str(profile?.name) ?? str(profile?.display_name),
    avatar_url: str(profile?.avatar) ?? str(profile?.avatar_url),
    bio: str(profile?.about) ?? str(profile?.bio),
    followers_count: num(profile?.followers_count) || num(profile?.subscribers_count) || 0,
    posts_count: num(profile?.posts_count) || 0,
    active_subscribers: num(profile?.active_subscribers) || num(profile?.subscribers_count) || 0,
    expired_subscribers: num(profile?.expired_subscribers) || 0,
    sub_price: profile?.subscribe_price ? num(profile.subscribe_price) : null,
    total_earnings: totalEarnings,
    earnings_subs: pickNum("subscriptions", "subs", "subscription", "subscriptionEarnings"),
    earnings_tips: pickNum("tips", "tipsEarnings"),
    earnings_ppv: pickNum("ppv", "posts", "ppvEarnings", "postEarnings"),
    earnings_messages: pickNum("messages", "messageEarnings", "msgs"),
    earnings_streams: pickNum("streams", "livestreams", "streamEarnings"),
    earnings_referrals: pickNum("referrals", "referralEarnings"),
    synced_at: new Date().toISOString(),
  };
  const { error: statsErr } = await supabase
    .from("of_creator_stats")
    .upsert(statsPayload, { onConflict: "creator_id" });
  if (statsErr) {
    return { ok: false, creator_id: creator.id, error: `Stats save failed: ${statsErr.message}` };
  }

  // 5. Daily earnings (best-effort — many OF accounts return a history)
  const dailyArr =
    (earnings?.daily as unknown[] | undefined)
    ?? (earnings?.byDay as unknown[] | undefined)
    ?? (earnings?.history as unknown[] | undefined)
    ?? [];
  if (Array.isArray(dailyArr) && dailyArr.length > 0) {
    const dailyRows = (dailyArr as Record<string, unknown>[]).map((d) => {
      const dateStr = str(d.date) ?? str(d.day) ?? str(d.entry_date);
      const subs = num(d.subscriptions) || num(d.subs);
      const tips = num(d.tips);
      const ppv = num(d.ppv) || num(d.posts);
      const msgs = num(d.messages);
      const streams = num(d.streams) || num(d.livestreams);
      const refs = num(d.referrals);
      const total = num(d.total) || subs + tips + ppv + msgs + streams + refs;
      return {
        creator_id: creator.id,
        entry_date: dateStr ?? format(new Date(), "yyyy-MM-dd"),
        earnings_subs: subs,
        earnings_tips: tips,
        earnings_ppv: ppv,
        earnings_messages: msgs,
        earnings_streams: streams,
        earnings_referrals: refs,
        total,
      };
    }).filter((r) => r.entry_date);
    if (dailyRows.length > 0) {
      await supabase.from("of_earnings_daily")
        .upsert(dailyRows, { onConflict: "creator_id,entry_date" });
    }
  }

  // 6. Subscribers
  const fansArr = (() => {
    if (!fansJson) return [] as unknown[];
    const j = fansJson as { data?: { list?: unknown[] }; list?: unknown[] };
    return (j.data?.list ?? j.list ?? []) as unknown[];
  })();
  if (fansArr.length > 0) {
    const fanRows = (fansArr as Record<string, unknown>[]).map((f) => {
      const fanId = str(f.id) ?? str(f.user_id) ?? str(f.fan_id);
      if (!fanId) return null;
      return {
        creator_id: creator.id,
        fan_id: fanId,
        username: str(f.username) ?? str(f.handle),
        display_name: str(f.name) ?? str(f.display_name),
        avatar_url: str(f.avatar) ?? str(f.avatar_url),
        total_spent: num(f.total_spent) || num(f.spent),
        tips_total: num(f.tips_total) || num(f.tips),
        ppv_total: num(f.ppv_total) || num(f.ppv_spent),
        messages_total: num(f.messages_total) || num(f.messages_spent),
        subscribed_at: str(f.subscribed_at) ?? str(f.created_at),
        expires_at: str(f.expires_at) ?? str(f.expired_at),
        is_active: typeof f.is_active === "boolean"
          ? f.is_active
          : (f.subscribed_is_expired_now !== true),
        last_seen_at: str(f.last_seen) ?? str(f.last_active),
        synced_at: new Date().toISOString(),
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
    if (fanRows.length > 0) {
      await supabase.from("of_subscribers")
        .upsert(fanRows, { onConflict: "creator_id,fan_id" });
    }
  }

  // 7. PPV messages
  const ppvArr = (() => {
    if (!ppvJson) return [] as unknown[];
    const j = ppvJson as { data?: { list?: unknown[] }; list?: unknown[] };
    return (j.data?.list ?? j.list ?? []) as unknown[];
  })();
  if (ppvArr.length > 0) {
    const ppvRows = (ppvArr as Record<string, unknown>[]).map((m) => {
      const msgId = str(m.id) ?? str(m.message_id);
      return {
        creator_id: creator.id,
        message_id: msgId,
        sent_at: str(m.sent_at) ?? str(m.created_at),
        price: m.price != null ? num(m.price) : null,
        recipients_count: num(m.recipients_count) || num(m.recipients),
        unlocks_count: num(m.unlocks_count) || num(m.purchased_count) || num(m.unlocks),
        revenue: num(m.revenue) || num(m.earned),
        preview: str(m.text) ?? str(m.preview),
        synced_at: new Date().toISOString(),
      };
    });
    const withId = ppvRows.filter((p) => p.message_id);
    const withoutId = ppvRows.filter((p) => !p.message_id);
    if (withId.length > 0) {
      await supabase.from("of_ppv_messages")
        .upsert(withId, { onConflict: "creator_id,message_id" });
    }
    if (withoutId.length > 0) {
      await supabase.from("of_ppv_messages").insert(withoutId);
    }
  }

  // 8. Daily subscriber metric snapshot (today's row)
  const today = format(new Date(), "yyyy-MM-dd");
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
