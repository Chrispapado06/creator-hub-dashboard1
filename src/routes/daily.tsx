import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, RefreshCw, AlertTriangle, CheckCircle2,
  TrendingUp, DollarSign, MousePointerClick, X, Plus, Trash2, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format } from "date-fns";
import { DailyHero } from "@/components/DailyHero";

export const Route = createFileRoute("/daily")({
  component: DailyPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────
type DailySnapshot = {
  id: string;
  creator_id: string;
  campaign_code: number;
  campaign_url: string | null;
  link_name: string | null;
  clicks_count: number;
  subscribers_count: number;
  revenue_total: number;
  spenders_count: number;
  snapshot_date: string;
  synced_at: string;
};

type TrackedLink = {
  id: string;
  creator_id: string;
  campaign_code: number;
  link_name: string | null;
  campaign_url: string | null;
  category: "onlyfinder" | "meta" | "reddit" | "other";
  promo_cost: number;
};

type Creator = {
  id: string;
  name: string;
  of_username: string | null;
  onlyfansapi_acct_id: string | null;
};

type Row = {
  trackedLinkId: string;
  creatorId: string;
  creatorName: string;
  linkName: string;
  campaignUrl: string | null;
  campaignCode: number;
  category: TrackedLink["category"];
  promoCost: number;
  clicks: number;
  subs: number;
  cvr: number;
  revenue: number;
  netProfit: number;
  flags: ("low_clicks" | "low_cvr")[];
  synced: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const KPI_CLICKS = 400;
const KPI_CVR = 0.15;
const CATEGORIES = ["all", "onlyfinder", "meta", "reddit", "other"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  all: "All links",
  onlyfinder: "OnlyFinder",
  meta: "Meta Ads",
  reddit: "Reddit",
  other: "Other",
};

const CATEGORY_STYLES: Record<TrackedLink["category"], string> = {
  onlyfinder: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  meta: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  reddit: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  other: "bg-secondary text-muted-foreground border-border",
};

// ── Page ──────────────────────────────────────────────────────────────────────
function DailyPage() {
  const [todaySnaps, setTodaySnaps] = useState<DailySnapshot[]>([]);
  const [yesterdaySnaps, setYesterdaySnaps] = useState<DailySnapshot[]>([]);
  const [trackedLinks, setTrackedLinks] = useState<TrackedLink[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [selectedCreatorId, setSelectedCreatorId] = useState("all");
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add-form state
  const [newCreatorId, setNewCreatorId] = useState("");
  const [newCampaignCode, setNewCampaignCode] = useState("");
  const [newLinkName, setNewLinkName] = useState("");
  const [newCategory, setNewCategory] = useState<TrackedLink["category"]>("other");
  const [newPromoCost, setNewPromoCost] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  // Inline promo-cost edit
  const [editingPromoCost, setEditingPromoCost] = useState<{ id: string; value: string } | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const [
      { data: todayData },
      { data: yesterdayData },
      { data: creatorData },
      { data: trackedData },
    ] = await Promise.all([
      supabase.from("daily_link_snapshots").select("*").eq("snapshot_date", todayStr),
      supabase.from("daily_link_snapshots").select("*").eq("snapshot_date", yesterdayStr),
      supabase.from("creators").select("id, name, of_username, onlyfansapi_acct_id"),
      supabase.from("tracked_links").select("*").order("created_at"),
    ]);

    const snaps = (todayData ?? []) as DailySnapshot[];
    setTodaySnaps(snaps);
    setYesterdaySnaps((yesterdayData ?? []) as DailySnapshot[]);
    setCreators((creatorData ?? []) as Creator[]);
    setTrackedLinks((trackedData ?? []) as TrackedLink[]);

    if (snaps.length > 0) {
      const latest = snaps.reduce((a, b) => (a.synced_at > b.synced_at ? a : b));
      setLastSynced(new Date(latest.synced_at));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Add link ─────────────────────────────────────────────────────────────────
  const addTrackedLink = async () => {
    if (!newCreatorId) return toast.error("Select a creator");
    const code = parseInt(newCampaignCode);
    if (!code) return toast.error("Enter a valid campaign code");
    setAddingLink(true);
    const { data, error } = await supabase
      .from("tracked_links")
      .insert({
        creator_id: newCreatorId,
        campaign_code: code,
        link_name: newLinkName || null,
        category: newCategory,
        promo_cost: parseFloat(newPromoCost) || 0,
      })
      .select()
      .single();
    setAddingLink(false);
    if (error) return toast.error(error.message);
    setTrackedLinks((prev) => [...prev, data as TrackedLink]);
    setNewCreatorId(""); setNewCampaignCode(""); setNewLinkName("");
    setNewCategory("other"); setNewPromoCost("");
    setShowAddForm(false);
    toast.success("Tracking link added");
  };

  // ── Delete link ───────────────────────────────────────────────────────────────
  const deleteTrackedLink = async (id: string) => {
    const { error } = await supabase.from("tracked_links").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setTrackedLinks((prev) => prev.filter((l) => l.id !== id));
    toast.success("Removed");
  };

  // ── Update category ───────────────────────────────────────────────────────────
  const updateCategory = async (id: string, category: string) => {
    const { error } = await supabase.from("tracked_links").update({ category }).eq("id", id);
    if (error) return toast.error(error.message);
    setTrackedLinks((prev) =>
      prev.map((l) => l.id === id ? { ...l, category: category as TrackedLink["category"] } : l),
    );
  };

  // ── Update promo cost ─────────────────────────────────────────────────────────
  const savePromoCost = async (id: string, value: string) => {
    const cost = parseFloat(value) || 0;
    const { error } = await supabase.from("tracked_links").update({ promo_cost: cost }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTrackedLinks((prev) => prev.map((l) => l.id === id ? { ...l, promo_cost: cost } : l));
    setEditingPromoCost(null);
  };

  // ── Sync ─────────────────────────────────────────────────────────────────────
  const syncAll = async () => {
    if (trackedLinks.length === 0) {
      return toast.error("No tracking links added yet — add some links first.");
    }
    const key = import.meta.env.VITE_ONLYFANSAPI_KEY as string | undefined;
    if (!key) return toast.error("VITE_ONLYFANSAPI_KEY not set in .env");
    setSyncing(true);

    // Group campaign codes by creator
    const byCreator = new Map<string, number[]>();
    for (const tl of trackedLinks) {
      if (!byCreator.has(tl.creator_id)) byCreator.set(tl.creator_id, []);
      byCreator.get(tl.creator_id)!.push(tl.campaign_code);
    }

    let totalLinks = 0;
    let errors = 0;

    for (const [creatorId, campaignCodes] of byCreator.entries()) {
      const creator = creators.find((c) => c.id === creatorId);
      if (!creator) continue;
      try {
        let acctId = creator.onlyfansapi_acct_id;
        if (!acctId && creator.of_username) {
          const res = await fetch("https://app.onlyfansapi.com/api/accounts", {
            headers: { Authorization: `Bearer ${key}` },
          });
          const list = (await res.json()) as { id: string; onlyfans_username: string }[];
          const match = list.find(
            (a) => a.onlyfans_username?.toLowerCase() === creator.of_username?.toLowerCase(),
          );
          if (!match) { errors++; continue; }
          acctId = match.id;
          await supabase.from("creators").update({ onlyfansapi_acct_id: acctId }).eq("id", creatorId);
        }
        if (!acctId) { errors++; continue; }

        type OFLink = {
          campaignCode: number;
          campaignUrl: string;
          name?: string;
          clicksCount: number;
          subscribersCount: number;
          revenue: { total: number; spendersCount: number };
        };

        const allLinks: OFLink[] = [];
        let nextUrl: string | null = `https://app.onlyfansapi.com/api/${acctId}/tracking-links`;
        while (nextUrl) {
          const resp = await fetch(nextUrl, { headers: { Authorization: `Bearer ${key}` } });
          const json = (await resp.json()) as {
            data?: { list?: OFLink[] };
            _pagination?: { next_page?: string };
          };
          allLinks.push(...(json.data?.list ?? []));
          nextUrl = json._pagination?.next_page ?? null;
        }

        // Only sync the campaign codes this user explicitly added
        const filtered = allLinks.filter((l) => campaignCodes.includes(l.campaignCode));
        if (filtered.length === 0) continue;

        // Back-fill link_name / campaign_url on tracked_links if still blank
        for (const l of filtered) {
          const tl = trackedLinks.find(
            (t) => t.creator_id === creatorId && t.campaign_code === l.campaignCode,
          );
          if (tl && !tl.link_name && l.name) {
            await supabase
              .from("tracked_links")
              .update({ link_name: l.name, campaign_url: l.campaignUrl })
              .eq("id", tl.id);
            setTrackedLinks((prev) =>
              prev.map((t) =>
                t.id === tl.id ? { ...t, link_name: l.name ?? null, campaign_url: l.campaignUrl } : t,
              ),
            );
          }
        }

        const snapshots = filtered.map((l) => ({
          creator_id: creatorId,
          campaign_code: l.campaignCode,
          campaign_url: l.campaignUrl ?? null,
          link_name: l.name ?? null,
          clicks_count: l.clicksCount,
          subscribers_count: l.subscribersCount,
          revenue_total: l.revenue.total,
          spenders_count: l.revenue.spendersCount,
          snapshot_date: todayStr,
          synced_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from("daily_link_snapshots")
          .upsert(snapshots, { onConflict: "creator_id,campaign_code,snapshot_date" });

        if (error) { errors++; console.error(error.message); }
        else totalLinks += filtered.length;
      } catch (e) { errors++; console.error(e); }
    }

    setSyncing(false);
    if (errors > 0 && totalLinks === 0) {
      toast.error("Sync failed — check browser console for details");
    } else {
      toast.success(
        `Synced ${totalLinks} link${totalLinks !== 1 ? "s" : ""}` +
        (errors > 0 ? ` (${errors} creator${errors !== 1 ? "s" : ""} failed)` : ""),
      );
      load();
    }
  };

  // ── Rows ─────────────────────────────────────────────────────────────────────
  const rows = useMemo((): Row[] => {
    return trackedLinks.map((tl) => {
      const todaySnap = todaySnaps.find(
        (s) => s.creator_id === tl.creator_id && s.campaign_code === tl.campaign_code,
      );
      const yestSnap = yesterdaySnaps.find(
        (s) => s.creator_id === tl.creator_id && s.campaign_code === tl.campaign_code,
      );
      const creator = creators.find((c) => c.id === tl.creator_id);

      const clicks = todaySnap
        ? (yestSnap ? Math.max(0, todaySnap.clicks_count - yestSnap.clicks_count) : todaySnap.clicks_count)
        : 0;
      const subs = todaySnap
        ? (yestSnap ? Math.max(0, todaySnap.subscribers_count - yestSnap.subscribers_count) : todaySnap.subscribers_count)
        : 0;
      const revenue = todaySnap
        ? (yestSnap ? Math.max(0, todaySnap.revenue_total - yestSnap.revenue_total) : todaySnap.revenue_total)
        : 0;
      const cvr = clicks > 0 ? subs / clicks : 0;
      const netProfit = revenue - tl.promo_cost;
      const synced = !!todaySnap;

      const flags: Row["flags"] = [];
      if (synced && clicks < KPI_CLICKS) flags.push("low_clicks");
      if (synced && cvr < KPI_CVR && clicks > 0) flags.push("low_cvr");

      return {
        trackedLinkId: tl.id,
        creatorId: tl.creator_id,
        creatorName: creator?.name ?? "—",
        linkName: tl.link_name ?? `Campaign #${tl.campaign_code}`,
        campaignUrl: tl.campaign_url,
        campaignCode: tl.campaign_code,
        category: tl.category,
        promoCost: tl.promo_cost,
        clicks, subs, cvr, revenue, netProfit, flags, synced,
      };
    });
  }, [trackedLinks, todaySnaps, yesterdaySnaps, creators]);

  const creatorsWithLinks = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const r of rows) {
      if (!seen.has(r.creatorId)) {
        seen.add(r.creatorId);
        list.push({ id: r.creatorId, name: r.creatorName });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const creatorFiltered = useMemo(
    () => selectedCreatorId === "all" ? rows : rows.filter((r) => r.creatorId === selectedCreatorId),
    [rows, selectedCreatorId],
  );

  const filteredRows = useMemo(
    () =>
      (activeCategory === "all" ? creatorFiltered : creatorFiltered.filter((r) => r.category === activeCategory))
        .sort((a, b) => b.clicks - a.clicks),
    [creatorFiltered, activeCategory],
  );

  const flaggedCount = creatorFiltered.filter((r) => r.flags.length > 0).length;
  const totalClicks = filteredRows.reduce((s, r) => s + r.clicks, 0);
  const totalSubs = filteredRows.reduce((s, r) => s + r.subs, 0);
  const totalRevenue = filteredRows.reduce((s, r) => s + r.revenue, 0);
  const totalPromoCost = filteredRows.reduce((s, r) => s + r.promoCost, 0);
  const totalNetProfit = totalRevenue - totalPromoCost;
  const overallCvr = totalClicks > 0 ? totalSubs / totalClicks : 0;

  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of creatorFiltered) m[r.category] = (m[r.category] ?? 0) + 1;
    return m;
  }, [creatorFiltered]);

  const hasActiveFilters = selectedCreatorId !== "all" || activeCategory !== "all";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <Toaster />

      {/* Command-center hero — pulse, alerts, movers, monthly goal */}
      <DailyHero />

      {/* Sub-header for the link-tracking section that follows */}
      <div className="flex items-end justify-between gap-4 pt-2 border-t border-border/40">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight">Tracking links</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {trackedLinks.length} link{trackedLinks.length !== 1 ? "s" : ""} synced from Infloww · clicks, subscribers, ROI per link.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowAddForm((v) => !v)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add link
          </Button>
          <div className="flex flex-col items-end gap-1">
            <Button size="sm" onClick={syncAll} disabled={syncing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync links"}
            </Button>
            {lastSynced && (
              <p className="text-[10px] text-muted-foreground">Synced {format(lastSynced, "h:mm a")}</p>
            )}
          </div>
        </div>
      </div>

      {/* Add link form */}
      {showAddForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold">Add tracking link</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Creator *</label>
              <Select value={newCreatorId} onValueChange={setNewCreatorId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {creators.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Campaign Code *</label>
              <Input
                className="h-9"
                type="number"
                placeholder="e.g. 12345"
                value={newCampaignCode}
                onChange={(e) => setNewCampaignCode(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Name (optional)</label>
              <Input
                className="h-9"
                placeholder="e.g. OnlyFinder Jan"
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Category</label>
              <Select value={newCategory} onValueChange={(v) => setNewCategory(v as TrackedLink["category"])}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onlyfinder">OnlyFinder</SelectItem>
                  <SelectItem value="meta">Meta Ads</SelectItem>
                  <SelectItem value="reddit">Reddit</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Promo Cost ($)</label>
              <Input
                className="h-9"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={newPromoCost}
                onChange={(e) => setNewPromoCost(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={addTrackedLink} disabled={addingLink}>
              {addingLink ? "Adding…" : "Add link"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && trackedLinks.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-16 text-center">
          <LayoutDashboard className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-semibold mb-1">No tracking links yet</p>
          <p className="text-sm text-muted-foreground mb-6">
            Add tracking links with their Infloww campaign codes, then hit Sync to pull stats.
          </p>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add your first link
          </Button>
        </div>
      )}

      {(loading || trackedLinks.length > 0) && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-medium">Creator:</span>
              <Select value={selectedCreatorId} onValueChange={setSelectedCreatorId}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="All creators" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All creators</SelectItem>
                  {creatorsWithLinks.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => { setSelectedCreatorId("all"); setActiveCategory("all"); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-2.5 py-1.5"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredRows.length} link{filteredRows.length !== 1 ? "s" : ""}{hasActiveFilters && " (filtered)"}
            </span>
          </div>

          {/* KPI banner */}
          {!loading && flaggedCount > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-5 py-3.5">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
              <div>
                <span className="text-sm font-semibold text-warning">
                  {flaggedCount} link{flaggedCount !== 1 ? "s" : ""} need{flaggedCount === 1 ? "s" : ""} attention today
                </span>
                <span className="text-xs text-muted-foreground ml-3">
                  {creatorFiltered.filter((r) => r.flags.includes("low_clicks")).length} under {KPI_CLICKS} clicks
                  {" · "}
                  {creatorFiltered.filter((r) => r.flags.includes("low_cvr")).length} under {(KPI_CVR * 100).toFixed(0)}% CVR
                </span>
              </div>
            </div>
          )}
          {!loading && flaggedCount === 0 && rows.some((r) => r.synced) && (
            <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-5 py-3.5">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              <span className="text-sm font-semibold text-success">All links are hitting their targets today</span>
            </div>
          )}

          {/* Summary cards */}
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-card/60 border border-border" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <SummaryCard
                icon={<MousePointerClick className="h-4 w-4 text-primary" />}
                label="Clicks today"
                value={totalClicks.toLocaleString()}
                sub={`target: ${KPI_CLICKS}+ per link`}
                flag={filteredRows.some((r) => r.flags.includes("low_clicks"))}
              />
              <SummaryCard
                icon={<TrendingUp className="h-4 w-4 text-primary" />}
                label="Overall CVR"
                value={totalClicks > 0 ? `${(overallCvr * 100).toFixed(1)}%` : "—"}
                sub={`target: ≥${(KPI_CVR * 100).toFixed(0)}%`}
                flag={overallCvr < KPI_CVR && totalClicks > 0}
                isPositive={overallCvr >= KPI_CVR && totalClicks > 0}
              />
              <SummaryCard
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
                label="Promo cost"
                value={`$${totalPromoCost.toFixed(2)}`}
                sub="total spend on filtered links"
              />
              <SummaryCard
                icon={<DollarSign className="h-4 w-4 text-success" />}
                label="Net profit"
                value={`${totalNetProfit >= 0 ? "" : "-"}$${Math.abs(totalNetProfit).toFixed(2)}`}
                sub={`revenue $${totalRevenue.toFixed(2)}`}
                isPositive={totalNetProfit > 0 && totalRevenue > 0}
                isNegative={totalNetProfit < 0}
              />
            </div>
          )}

          {/* Category tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-secondary/20 w-fit flex-wrap">
            {CATEGORIES.map((cat) => {
              const count = cat === "all" ? creatorFiltered.length : (categoryCounts[cat] ?? 0);
              const catFlagged = creatorFiltered.filter((r) => r.category === cat && r.flags.length > 0).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeCategory === cat
                      ? "bg-card text-foreground shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                  {count > 0 && (
                    <span className="ml-1.5 text-[10px] bg-secondary rounded-full px-1.5 py-0.5">{count}</span>
                  )}
                  {catFlagged > 0 && cat !== "all" && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-warning" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Table */}
          {loading ? (
            <div className="h-72 animate-pulse rounded-xl bg-card/60 border border-border" />
          ) : filteredRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
              {activeCategory !== "all"
                ? `No ${CATEGORY_LABELS[activeCategory]} links yet. Add a link and set its category to ${CATEGORY_LABELS[activeCategory]}.`
                : "No links found for the selected filters."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Link</th>
                    <th className="text-left font-medium px-4 py-3">Creator</th>
                    <th className="text-left font-medium px-4 py-3">Category</th>
                    <th className="text-right font-medium px-4 py-3">Promo Cost</th>
                    <th className="text-right font-medium px-4 py-3">
                      Clicks{" "}
                      <span className="normal-case font-normal opacity-60 text-[9px]">target {KPI_CLICKS}+</span>
                    </th>
                    <th className="text-right font-medium px-4 py-3">Subs</th>
                    <th className="text-right font-medium px-4 py-3">
                      CVR{" "}
                      <span className="normal-case font-normal opacity-60 text-[9px]">≥{(KPI_CVR * 100).toFixed(0)}%</span>
                    </th>
                    <th className="text-right font-medium px-4 py-3">Revenue</th>
                    <th className="text-right font-medium px-4 py-3">Net Profit</th>
                    <th className="text-center font-medium px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr
                      key={row.trackedLinkId}
                      className={`border-t border-border bg-card hover:bg-secondary/30 transition-colors ${
                        row.flags.length > 0 ? "border-l-[3px] border-l-warning" : ""
                      }`}
                    >
                      {/* Link */}
                      <td className="px-4 py-3">
                        <div className="font-medium">{row.linkName}</div>
                        <div className="text-[11px] text-muted-foreground/50">#{row.campaignCode}</div>
                      </td>

                      {/* Creator */}
                      <td className="px-4 py-3 text-muted-foreground text-sm">{row.creatorName}</td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        <Select
                          value={row.category}
                          onValueChange={(v) => updateCategory(row.trackedLinkId, v)}
                        >
                          <SelectTrigger
                            className={`h-7 w-[120px] text-[11px] font-semibold border rounded-full px-2.5 uppercase tracking-wide ${CATEGORY_STYLES[row.category]}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="onlyfinder">OnlyFinder</SelectItem>
                            <SelectItem value="meta">Meta Ads</SelectItem>
                            <SelectItem value="reddit">Reddit</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Promo cost — click to edit */}
                      <td className="px-4 py-3 text-right">
                        {editingPromoCost?.id === row.trackedLinkId ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              className="h-7 w-24 text-right text-sm"
                              type="number"
                              step="0.01"
                              min="0"
                              value={editingPromoCost.value}
                              onChange={(e) =>
                                setEditingPromoCost({ id: row.trackedLinkId, value: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  savePromoCost(row.trackedLinkId, editingPromoCost.value);
                                if (e.key === "Escape") setEditingPromoCost(null);
                              }}
                              autoFocus
                            />
                            <button
                              onClick={() =>
                                savePromoCost(row.trackedLinkId, editingPromoCost.value)
                              }
                              className="text-success hover:text-success/80"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingPromoCost(null)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setEditingPromoCost({
                                id: row.trackedLinkId,
                                value: row.promoCost.toString(),
                              })
                            }
                            className="tabular-nums text-muted-foreground hover:text-foreground transition-colors group"
                            title="Click to edit"
                          >
                            ${row.promoCost.toFixed(2)}
                            <span className="ml-1 opacity-0 group-hover:opacity-40 text-[10px]">✎</span>
                          </button>
                        )}
                      </td>

                      {/* Clicks */}
                      <td className="px-4 py-3 text-right">
                        {row.synced ? (
                          <>
                            <span
                              className={`font-semibold tabular-nums ${row.flags.includes("low_clicks") ? "text-warning" : ""}`}
                            >
                              {row.clicks.toLocaleString()}
                            </span>
                            {row.flags.includes("low_clicks") && (
                              <div className="text-[10px] text-warning">↓ low</div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>

                      {/* Subs */}
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.synced ? (
                          row.subs.toLocaleString()
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>

                      {/* CVR */}
                      <td className="px-4 py-3 text-right">
                        {row.synced && row.clicks > 0 ? (
                          <>
                            <span
                              className={`font-semibold tabular-nums ${
                                row.flags.includes("low_cvr") ? "text-destructive" : "text-success"
                              }`}
                            >
                              {(row.cvr * 100).toFixed(1)}%
                            </span>
                            {row.flags.includes("low_cvr") && (
                              <div className="text-[10px] text-destructive">↓ low</div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>

                      {/* Revenue */}
                      <td className="px-4 py-3 text-right">
                        {row.synced ? (
                          <span
                            className={`font-semibold tabular-nums ${
                              row.revenue > 0 ? "text-success" : "text-muted-foreground"
                            }`}
                          >
                            ${row.revenue.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>

                      {/* Net profit */}
                      <td className="px-4 py-3 text-right">
                        {row.synced ? (
                          <span
                            className={`font-semibold tabular-nums ${
                              row.netProfit > 0
                                ? "text-success"
                                : row.netProfit < 0
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            {row.netProfit >= 0 ? "" : "-"}${Math.abs(row.netProfit).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-center">
                          {!row.synced ? (
                            <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">
                              Not synced
                            </span>
                          ) : row.flags.length === 0 ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            row.flags.map((f) => (
                              <span
                                key={f}
                                className={`text-[10px] font-semibold rounded-full border px-2 py-0.5 whitespace-nowrap ${
                                  f === "low_cvr"
                                    ? "bg-destructive/15 text-destructive border-destructive/30"
                                    : "bg-warning/15 text-warning border-warning/30"
                                }`}
                              >
                                {f === "low_cvr" ? "Low CVR" : "Low clicks"}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      {/* Delete */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => deleteTrackedLink(row.trackedLinkId)}
                          className="text-muted-foreground/40 hover:text-destructive transition-colors"
                          title="Remove link"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          {!loading && trackedLinks.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {yesterdaySnaps.length > 0
                ? "Numbers show delta vs yesterday's snapshot. Sync daily for accurate 24h data."
                : "No yesterday snapshot found — showing cumulative totals. Sync daily to see true 24h deltas."}
              {" · Click any Promo Cost value to edit it inline."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({
  icon, label, value, sub, flag, isPositive, isNegative,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  flag?: boolean;
  isPositive?: boolean;
  isNegative?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        flag
          ? "border-warning/30 bg-warning/5"
          : isNegative
          ? "border-destructive/20 bg-destructive/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        {icon}
        {label}
      </div>
      <div
        className={`text-2xl font-bold tabular-nums ${
          isNegative
            ? "text-destructive"
            : flag
            ? "text-warning"
            : isPositive
            ? "text-success"
            : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
