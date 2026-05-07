import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

// ── Types ────────────────────────────────────────────────────────────────────

export type SyncJobId =
  | "reddit_posts"
  | "infloww_revenue"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "onlyfans";

export type SyncStatusRow = {
  id: SyncJobId;
  last_synced_at: string | null;
  last_status: "ok" | "partial" | "failed" | "running" | null;
  last_message: string | null;
  last_actor: string | null;
  items_processed: number;
  errors_count: number;
  locked_until: string | null;
  locked_by: string | null;
  auto_enabled: boolean;
  interval_minutes: number;
};

export type SyncResult = {
  status: "ok" | "partial" | "failed";
  message: string;
  itemsProcessed: number;
  errorsCount: number;
};

// ── Tab identity / lock helpers ──────────────────────────────────────────────

const TAB_ID_KEY = "agency_sync_tab_id";

export function getTabId(): string {
  let id = sessionStorage.getItem(TAB_ID_KEY);
  if (!id) {
    id = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(TAB_ID_KEY, id);
  }
  return id;
}

function getActor(): string | null {
  try {
    const raw = localStorage.getItem("agency_session");
    if (!raw) return null;
    const obj = JSON.parse(raw) as { username?: string };
    return obj?.username ?? null;
  } catch {
    return null;
  }
}

// ── Fetch / mutate sync_status ──────────────────────────────────────────────

export async function listSyncStatus(): Promise<SyncStatusRow[]> {
  const { data, error } = await supabase
    .from("sync_status")
    .select("*")
    .order("id");
  if (error) {
    console.warn("listSyncStatus failed:", error.message);
    return [];
  }
  return (data ?? []) as SyncStatusRow[];
}

/**
 * Optimistically claim a sync lock for this tab. Returns true if the lock was
 * acquired (we should run the job), false if another tab is already running it
 * or it was synced recently.
 *
 * The "lock" is a row update gated on `locked_until` being in the past.
 * `lockMinutes` is how long this tab gets to finish before another tab can
 * claim the job (defaults to 15 — long enough for a full creator sweep).
 */
async function claimLock(jobId: SyncJobId, lockMinutes: number = 15): Promise<boolean> {
  const tabId = getTabId();
  const lockUntil = new Date(Date.now() + lockMinutes * 60_000).toISOString();
  const nowISO = new Date().toISOString();

  // Update only if no other tab is currently holding the lock
  const { data, error } = await supabase
    .from("sync_status")
    .update({
      locked_until: lockUntil,
      locked_by: tabId,
      last_status: "running",
      updated_at: nowISO,
    })
    .eq("id", jobId)
    .or(`locked_until.is.null,locked_until.lt.${nowISO}`)
    .select("id");

  if (error) {
    console.warn(`claimLock(${jobId}) failed:`, error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

async function releaseLock(jobId: SyncJobId, result: SyncResult): Promise<void> {
  await supabase
    .from("sync_status")
    .update({
      last_synced_at: new Date().toISOString(),
      last_status: result.status,
      last_message: result.message,
      last_actor: getActor(),
      items_processed: result.itemsProcessed,
      errors_count: result.errorsCount,
      locked_until: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

function isOverdue(row: SyncStatusRow): boolean {
  if (!row.auto_enabled) return false;
  if (row.locked_until && new Date(row.locked_until) > new Date()) return false;
  if (!row.last_synced_at) return true;
  const lastMs = new Date(row.last_synced_at).getTime();
  const interval = (row.interval_minutes ?? 120) * 60_000;
  return Date.now() - lastMs >= interval;
}

// ── Reddit posts sync ────────────────────────────────────────────────────────

type RedditAccountRow = { id: string; username: string; status: string };

async function syncRedditPosts(): Promise<SyncResult> {
  const { data: accounts, error } = await supabase
    .from("reddit_accounts")
    .select("id, username, status")
    .neq("status", "suspended");
  if (error) return { status: "failed", message: error.message, itemsProcessed: 0, errorsCount: 1 };
  const accs = (accounts ?? []) as RedditAccountRow[];
  if (accs.length === 0) return { status: "ok", message: "No Reddit accounts to sync", itemsProcessed: 0, errorsCount: 0 };

  let posts = 0;
  let errors = 0;
  for (const acc of accs) {
    try {
      const res = await fetch(`/reddit-api/user/${acc.username}/submitted.json?limit=100&sort=new`);
      if (!res.ok) {
        console.warn(`Reddit auto-sync u/${acc.username}: HTTP ${res.status}`);
        errors++;
        continue;
      }
      const json = (await res.json()) as {
        data?: { children?: { data: { id: string; title: string; subreddit: string; created_utc: number; score: number; num_comments: number; permalink: string } }[] };
      };
      const children = json.data?.children ?? [];
      if (children.length === 0) continue;
      const upserts = children.map((child) => ({
        reddit_account_id: acc.id,
        post_id: child.data.id,
        title: child.data.title,
        subreddit: child.data.subreddit,
        posted_at: new Date(child.data.created_utc * 1000).toISOString(),
        upvotes: child.data.score,
        comments: child.data.num_comments,
        url: `https://reddit.com${child.data.permalink}`,
      }));
      const { error: upErr } = await supabase.from("posts").upsert(upserts, { onConflict: "post_id" });
      if (upErr) { errors++; continue; }
      posts += upserts.length;
    } catch (err) {
      console.warn(`Reddit auto-sync u/${acc.username} threw:`, err);
      errors++;
    }
  }

  if (errors === accs.length) {
    return {
      status: "failed",
      message: `All ${accs.length} accounts failed (proxy/network — is the dev server running?)`,
      itemsProcessed: 0,
      errorsCount: errors,
    };
  }
  return {
    status: errors > 0 ? "partial" : "ok",
    message: errors > 0
      ? `Synced ${posts} posts across ${accs.length - errors}/${accs.length} accounts (${errors} failed)`
      : `Synced ${posts} posts across ${accs.length} accounts`,
    itemsProcessed: posts,
    errorsCount: errors,
  };
}

// ── Infloww / OnlyFinder revenue sync ────────────────────────────────────────

type CreatorRow = { id: string; name: string; of_username: string | null; onlyfansapi_acct_id: string | null };

type OFLink = {
  campaignCode: number;
  campaignUrl: string;
  clicksCount: number;
  subscribersCount: number;
  revenue: { total: number; revenuePerSubscriber: number; spendersCount: number };
};

async function findOnlyFansAcctId(creator: CreatorRow, key: string): Promise<string | null> {
  if (creator.onlyfansapi_acct_id) return creator.onlyfansapi_acct_id;
  if (!creator.of_username) return null;
  try {
    const res = await fetch("https://app.onlyfansapi.com/api/accounts", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const list = (await res.json()) as { id: string; onlyfans_username: string }[];
    const match = list.find((a) => a.onlyfans_username?.toLowerCase() === creator.of_username!.toLowerCase());
    if (!match) return null;
    await supabase.from("creators").update({ onlyfansapi_acct_id: match.id }).eq("id", creator.id);
    return match.id;
  } catch {
    return null;
  }
}

async function fetchAllTrackingLinks(acctId: string, key: string): Promise<OFLink[]> {
  const all: OFLink[] = [];
  let nextUrl: string | null = `https://app.onlyfansapi.com/api/${acctId}/tracking-links`;
  let safety = 25; // max ~2500 links per creator
  while (nextUrl && safety-- > 0) {
    const resp = await fetch(nextUrl, { headers: { Authorization: `Bearer ${key}` } });
    if (!resp.ok) throw new Error(`OnlyFansAPI ${resp.status}`);
    const json = (await resp.json()) as { data?: { list?: OFLink[] }; _pagination?: { next_page?: string } };
    all.push(...(json.data?.list ?? []));
    nextUrl = json._pagination?.next_page ?? null;
  }
  return all;
}

type PlatformAccountRow = { id: string; infloww_campaign_code: number | null };

async function syncInflowwForCreator(creator: CreatorRow, key: string): Promise<{ links: number; revenue: number }> {
  const acctId = await findOnlyFansAcctId(creator, key);
  if (!acctId) return { links: 0, revenue: 0 };

  const allLinks = await fetchAllTrackingLinks(acctId, key);
  if (allLinks.length === 0) return { links: 0, revenue: 0 };

  // Upsert tracking-link stats
  const stats = allLinks.map((l) => ({
    creator_id: creator.id,
    campaign_code: l.campaignCode,
    campaign_url: l.campaignUrl,
    clicks_count: l.clicksCount,
    subscribers_count: l.subscribersCount,
    revenue_total: l.revenue.total,
    revenue_per_sub: l.revenue.revenuePerSubscriber,
    spenders_count: l.revenue.spendersCount,
    synced_at: new Date().toISOString(),
  }));
  await supabase
    .from("infloww_tracking_stats")
    .upsert(stats, { onConflict: "creator_id,campaign_code" });

  // Pull all platform-account tables to attribute revenue to whichever account
  // owns each campaign code.
  const [reddit, ig, fb, tt] = await Promise.all([
    supabase.from("reddit_accounts").select("id, infloww_campaign_code").eq("creator_id", creator.id),
    supabase.from("instagram_accounts").select("id, infloww_campaign_code").eq("creator_id", creator.id),
    supabase.from("facebook_accounts").select("id, infloww_campaign_code").eq("creator_id", creator.id),
    supabase.from("tiktok_accounts").select("id, infloww_campaign_code").eq("creator_id", creator.id),
  ]);

  const redditAccs = (reddit.data ?? []) as PlatformAccountRow[];
  const igAccs = (ig.data ?? []) as PlatformAccountRow[];
  const fbAccs = (fb.data ?? []) as PlatformAccountRow[];
  const ttAccs = (tt.data ?? []) as PlatformAccountRow[];

  // Wipe today's auto-sync revenue rows for this creator across all platform-flavored sources, then re-insert
  await supabase
    .from("revenue_entries")
    .delete()
    .eq("creator_id", creator.id)
    .in("source", ["infloww", "infloww-instagram", "infloww-facebook", "infloww-tiktok"]);

  const today = new Date().toISOString().slice(0, 10);
  const rows: Array<{
    creator_id: string;
    reddit_account_id?: string;
    instagram_account_id?: string;
    facebook_account_id?: string;
    tiktok_account_id?: string;
    amount: number;
    currency: string;
    entry_date: string;
    source: string;
    notes: string;
  }> = [];

  for (const l of allLinks) {
    if (l.revenue.total <= 0) continue;
    const note = `c${l.campaignCode} — ${l.subscribersCount} subs, ${l.clicksCount} clicks`;
    const reddit = redditAccs.find((a) => a.infloww_campaign_code === l.campaignCode);
    if (reddit) {
      rows.push({ creator_id: creator.id, reddit_account_id: reddit.id, amount: l.revenue.total, currency: "USD", entry_date: today, source: "infloww", notes: note });
      continue;
    }
    const ig = igAccs.find((a) => a.infloww_campaign_code === l.campaignCode);
    if (ig) {
      rows.push({ creator_id: creator.id, instagram_account_id: ig.id, amount: l.revenue.total, currency: "USD", entry_date: today, source: "infloww-instagram", notes: note });
      continue;
    }
    const fb = fbAccs.find((a) => a.infloww_campaign_code === l.campaignCode);
    if (fb) {
      rows.push({ creator_id: creator.id, facebook_account_id: fb.id, amount: l.revenue.total, currency: "USD", entry_date: today, source: "infloww-facebook", notes: note });
      continue;
    }
    const tt = ttAccs.find((a) => a.infloww_campaign_code === l.campaignCode);
    if (tt) {
      rows.push({ creator_id: creator.id, tiktok_account_id: tt.id, amount: l.revenue.total, currency: "USD", entry_date: today, source: "infloww-tiktok", notes: note });
      continue;
    }
    // Unassigned campaign — log as creator-level revenue under "infloww"
    rows.push({ creator_id: creator.id, amount: l.revenue.total, currency: "USD", entry_date: today, source: "infloww", notes: `${note} (unassigned)` });
  }

  if (rows.length > 0) {
    await supabase.from("revenue_entries").insert(rows);
  }

  return {
    links: allLinks.length,
    revenue: rows.reduce((s, r) => s + r.amount, 0),
  };
}

async function syncInflowwRevenue(): Promise<SyncResult> {
  const key = import.meta.env.VITE_ONLYFANSAPI_KEY as string | undefined;
  if (!key) {
    return {
      status: "failed",
      message: "VITE_ONLYFANSAPI_KEY not set in .env — auto-sync skipped",
      itemsProcessed: 0,
      errorsCount: 1,
    };
  }

  const { data, error } = await supabase
    .from("creators")
    .select("id, name, of_username, onlyfansapi_acct_id, status")
    .neq("status", "inactive");
  if (error) {
    return { status: "failed", message: error.message, itemsProcessed: 0, errorsCount: 1 };
  }
  const creators = (data ?? []) as Array<CreatorRow & { status: string }>;
  if (creators.length === 0) {
    return { status: "ok", message: "No creators to sync", itemsProcessed: 0, errorsCount: 0 };
  }

  let totalLinks = 0;
  let totalRevenue = 0;
  let errors = 0;
  let synced = 0;
  for (const c of creators) {
    if (!c.of_username && !c.onlyfansapi_acct_id) continue; // can't sync without an OF account
    try {
      const r = await syncInflowwForCreator(c, key);
      totalLinks += r.links;
      totalRevenue += r.revenue;
      synced++;
    } catch (err) {
      console.warn(`Infloww auto-sync failed for ${c.name}:`, err);
      errors++;
    }
  }

  if (synced === 0 && errors === 0) {
    return { status: "ok", message: "No creators with OnlyFans accounts configured", itemsProcessed: 0, errorsCount: 0 };
  }
  return {
    status: errors === 0 ? "ok" : errors === synced + errors ? "failed" : "partial",
    message: errors === 0
      ? `Synced ${synced} creators · ${totalLinks} links · $${totalRevenue.toFixed(0)} revenue`
      : `Synced ${synced} creators · ${totalLinks} links · $${totalRevenue.toFixed(0)} revenue · ${errors} creator${errors === 1 ? "" : "s"} failed`,
    itemsProcessed: totalLinks,
    errorsCount: errors,
  };
}

// ── Stub syncs (extend later) ────────────────────────────────────────────────

async function syncInstagramPosts(): Promise<SyncResult> {
  // TODO: Pull recent media for each instagram_account where meta_access_token is set,
  // upsert into instagram_posts. The per-account flow is already implemented
  // inline in src/routes/instagram.tsx — extracting it into this module is a
  // straightforward follow-up.
  return { status: "ok", message: "Instagram post sync not yet wired into auto-sync — use the manual button on the Instagram page for now.", itemsProcessed: 0, errorsCount: 0 };
}

async function syncFacebookPosts(): Promise<SyncResult> {
  return { status: "ok", message: "Facebook post sync not yet wired into auto-sync — use the manual button on the Facebook page for now.", itemsProcessed: 0, errorsCount: 0 };
}

async function syncTikTokPosts(): Promise<SyncResult> {
  return { status: "ok", message: "TikTok post sync not yet wired into auto-sync — use the manual button on the TikTok page for now.", itemsProcessed: 0, errorsCount: 0 };
}

async function syncOnlyFansDashboard(): Promise<SyncResult> {
  return { status: "ok", message: "OnlyFans dashboard sync not yet wired into auto-sync — use the manual button on the OnlyFans page for now.", itemsProcessed: 0, errorsCount: 0 };
}

// ── Job registry ─────────────────────────────────────────────────────────────

const JOBS: Record<SyncJobId, () => Promise<SyncResult>> = {
  reddit_posts:    syncRedditPosts,
  infloww_revenue: syncInflowwRevenue,
  instagram:       syncInstagramPosts,
  facebook:        syncFacebookPosts,
  tiktok:          syncTikTokPosts,
  onlyfans:        syncOnlyFansDashboard,
};

export const SYNC_JOB_LABELS: Record<SyncJobId, string> = {
  reddit_posts:    "Reddit posts",
  infloww_revenue: "Tracking links & revenue (Infloww/OnlyFinder)",
  instagram:       "Instagram",
  facebook:        "Facebook",
  tiktok:          "TikTok",
  onlyfans:        "OnlyFans dashboard",
};

// ── Public entry points ──────────────────────────────────────────────────────

/** Run a single sync job, claiming the lock + recording status. */
export async function runSyncJob(jobId: SyncJobId): Promise<SyncResult | null> {
  const claimed = await claimLock(jobId);
  if (!claimed) return null;
  const fn = JOBS[jobId];
  let result: SyncResult;
  try {
    result = await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result = { status: "failed", message: msg, itemsProcessed: 0, errorsCount: 1 };
  }
  await releaseLock(jobId, result);
  void logAudit({
    action: "auto_sync",
    entity_type: "sync_job",
    entity_id: jobId,
    entity_name: SYNC_JOB_LABELS[jobId],
    details: `${result.status} — ${result.message}`,
  });
  return result;
}

/**
 * Run every job whose interval has elapsed (and that's auto-enabled).
 * Other tabs running the same job at the same instant will skip via the lock.
 */
export async function runAutoSync(): Promise<void> {
  const rows = await listSyncStatus();
  for (const row of rows) {
    if (!isOverdue(row)) continue;
    await runSyncJob(row.id);
  }
}
