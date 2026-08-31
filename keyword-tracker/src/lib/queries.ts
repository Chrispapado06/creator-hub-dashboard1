import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as mock from "@/lib/mock";
import type {
  Creator,
  TrackingLink,
  KeywordCost,
  SubscriberSnapshot,
  DashboardRow,
} from "@/lib/types";

// ── Creators (read from the existing dashboard's table) ──────────────

export async function getCreators(): Promise<Creator[]> {
  if (mock.isPreview) return mock.mockCreators;
  const { data, error } = await supabaseAdmin()
    .from("creators")
    .select("id, name, of_username")
    .order("name");
  if (error) throw new Error(`Failed to load creators: ${error.message}`);
  return (data ?? []) as Creator[];
}

// ── Tracking links ───────────────────────────────────────────────────

export async function getTrackingLinks(creatorId?: string): Promise<TrackingLink[]> {
  if (mock.isPreview) {
    return creatorId ? mock.mockLinks.filter((l) => l.creator_id === creatorId) : mock.mockLinks;
  }
  let q = supabaseAdmin()
    .from("tracking_links")
    .select("*")
    .order("created_at", { ascending: false });
  if (creatorId) q = q.eq("creator_id", creatorId);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load tracking links: ${error.message}`);
  return (data ?? []) as TrackingLink[];
}

export async function getCostsForLink(trackingLinkId: string): Promise<KeywordCost[]> {
  const { data, error } = await supabaseAdmin()
    .from("keyword_costs")
    .select("*")
    .eq("tracking_link_id", trackingLinkId)
    .order("date", { ascending: false });
  if (error) throw new Error(`Failed to load costs: ${error.message}`);
  return (data ?? []) as KeywordCost[];
}

/** Cost rows joined with a human label (creator · keyword), newest first. */
export async function getCostHistory(limit = 200): Promise<
  (KeywordCost & { label: string })[]
> {
  if (mock.isPreview) return mock.mockCostHistory();
  const [costs, links, creators] = await Promise.all([
    supabaseAdmin()
      .from("keyword_costs")
      .select("*")
      .order("date", { ascending: false })
      .limit(limit),
    getTrackingLinks(),
    getCreators(),
  ]);
  if (costs.error) throw new Error(`Failed to load cost history: ${costs.error.message}`);

  const creatorName = new Map(creators.map((c) => [c.id, c.name]));
  const linkLabel = new Map(
    links.map((l) => [l.id, `${creatorName.get(l.creator_id) ?? "?"} · ${l.keyword}`]),
  );

  return ((costs.data ?? []) as KeywordCost[]).map((c) => ({
    ...c,
    label: linkLabel.get(c.tracking_link_id) ?? "Unknown link",
  }));
}

// ── Dashboard aggregation ────────────────────────────────────────────

type DateRange = { from?: string; to?: string };

/**
 * Build the dashboard rows: every tracking link joined with its summed cost
 * data (optionally bounded by a date range) and its single latest subscriber
 * snapshot, then the derived Cost/Sub and ROI%.
 */
export async function getDashboardRows(opts: {
  creatorId?: string;
  range?: DateRange;
}): Promise<DashboardRow[]> {
  if (mock.isPreview) {
    const rows = mock.mockDashboardRows();
    return opts.creatorId ? rows.filter((r) => r.link.creator_id === opts.creatorId) : rows;
  }
  const db = supabaseAdmin();

  const [creators, links] = await Promise.all([
    getCreators(),
    getTrackingLinks(opts.creatorId),
  ]);
  const creatorName = new Map(creators.map((c) => [c.id, c.name]));

  if (links.length === 0) return [];
  const linkIds = links.map((l) => l.id);

  // Costs within the (optional) date range.
  let costQ = db.from("keyword_costs").select("*").in("tracking_link_id", linkIds);
  if (opts.range?.from) costQ = costQ.gte("date", opts.range.from);
  if (opts.range?.to) costQ = costQ.lte("date", opts.range.to);
  const { data: costs, error: costErr } = await costQ;
  if (costErr) throw new Error(`Failed to load costs: ${costErr.message}`);

  // All snapshots (we pick the latest per link in JS).
  const { data: snaps, error: snapErr } = await db
    .from("subscriber_snapshots")
    .select("*")
    .in("tracking_link_id", linkIds)
    .order("date_pulled", { ascending: false });
  if (snapErr) throw new Error(`Failed to load snapshots: ${snapErr.message}`);

  // Roll costs up per link.
  const costByLink = new Map<string, { clicks: number; spend: number }>();
  for (const c of (costs ?? []) as KeywordCost[]) {
    const agg = costByLink.get(c.tracking_link_id) ?? { clicks: 0, spend: 0 };
    agg.clicks += c.clicks ?? 0;
    agg.spend += Number(c.spend_usd ?? 0);
    costByLink.set(c.tracking_link_id, agg);
  }

  // Latest snapshot per link (snaps are sorted desc, so first wins).
  const latestSnap = new Map<string, SubscriberSnapshot>();
  for (const s of (snaps ?? []) as SubscriberSnapshot[]) {
    if (!latestSnap.has(s.tracking_link_id)) latestSnap.set(s.tracking_link_id, s);
  }

  return links.map((link): DashboardRow => {
    const cost = costByLink.get(link.id) ?? { clicks: 0, spend: 0 };
    const snap = latestSnap.get(link.id);
    const subscribers = snap?.subscriber_count ?? 0;
    const revenue = Number(snap?.total_revenue_usd ?? 0);
    const spend = cost.spend;

    return {
      link,
      creatorName: creatorName.get(link.creator_id) ?? "Unknown",
      clicks: cost.clicks,
      spend,
      subscribers,
      revenue,
      costPerSub: subscribers > 0 ? spend / subscribers : null,
      roi: spend > 0 ? ((revenue - spend) / spend) * 100 : null,
    };
  });
}

/** Most recent snapshot time across all links, for the /sync "last synced" line. */
export async function getLastSyncedAt(): Promise<string | null> {
  if (mock.isPreview) return "2026-06-05T09:42:00Z";
  const { data, error } = await supabaseAdmin()
    .from("subscriber_snapshots")
    .select("date_pulled")
    .order("date_pulled", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load last sync: ${error.message}`);
  return data?.date_pulled ?? null;
}
