// Agency-wide Meta Ads view.
//
// Three layers of detail, all on the same /ads page:
//   1. Account snapshot — total spend (7d / 30d), active vs paused
//      campaign counts, daily spend area chart from
//      meta_insights_daily(level='account').
//   2. Campaigns table — every campaign in the ad account, with status,
//      daily budget, and one-click pause/resume + set-budget actions.
//      Click a row to drill in.
//   3. Drill-down dialog (MetaCampaignDetail) — tabs for adsets,
//      creatives (with thumbnails), time series, placement, demographics.
//
// All data comes from the local Supabase tables; the user clicks "Sync"
// to refresh from Meta. This avoids hammering the Graph API on every
// render and keeps the UI snappy.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  RefreshCw, Pause, Play, DollarSign, ExternalLink, Image as ImageIcon,
  TrendingUp, Users, Eye, MousePointerClick, Search, BarChart3,
  Globe, Smartphone, ChevronRight, AlertTriangle, ShieldAlert, ShieldCheck,
} from "lucide-react";
import { SiMeta } from "react-icons/si";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { format, parseISO, subDays } from "date-fns";
import {
  syncCampaignsCatalog, syncAccountSnapshot, syncDailyTimeSeries,
  fullSyncCampaign, setCampaignStatus, setCampaignDailyBudget,
  setAdsetStatus, setAdsetDailyBudget,
  fetchTokenPermissions, tokenHasWriteScope,
  type BreakdownKey,
} from "@/lib/meta-ads";

// ── Types mirroring the Supabase rows ───────────────────────────────────

type CampaignRow = {
  meta_campaign_id: string;
  account_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  frequency: number | null;
  deleted_at: string | null;
  synced_at: string;
};
type AdsetRow = Omit<CampaignRow, "account_id" | "objective" | "lifetime_budget_cents"> & {
  meta_adset_id: string;
  meta_campaign_id: string;
  optimization_goal: string | null;
};
type AdRow = {
  meta_ad_id: string;
  meta_adset_id: string;
  meta_campaign_id: string;
  name: string | null;
  status: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  permalink_url: string | null;
  headline: string | null;
  body: string | null;
  call_to_action_type: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
};
type DailyRow = {
  level: "account" | "campaign" | "adset" | "ad";
  object_id: string;
  date_start: string;
  breakdown_key: string;
  breakdown_value: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
};
type AccountSnapshot = {
  account_id: string;
  account_name: string | null;
  currency: string | null;
  spend_30d: number;
  spend_7d: number;
  active_campaigns: number;
  paused_campaigns: number;
  synced_at: string;
};

// ── Style helpers ────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  PAUSED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  ARCHIVED: "bg-secondary text-muted-foreground border-border",
  DELETED: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};
const statusPill = (s: string | null) => STATUS_PILL[s ?? ""] ?? "bg-secondary text-muted-foreground border-border";

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtBudget = (cents: number | null) =>
  cents == null ? "—" : fmtMoney(cents / 100);
const fmtCount = (n: number) => n.toLocaleString();

// ── Top-level component ─────────────────────────────────────────────────

export function MetaAccountView({
  accessToken, accountId,
}: {
  accessToken: string;
  accountId: string;
}) {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [accountDaily, setAccountDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [drillCampaign, setDrillCampaign] = useState<CampaignRow | null>(null);
  const [hasWriteScope, setHasWriteScope] = useState<boolean | null>(null);

  const reload = async () => {
    setLoading(true);
    const [{ data: snap }, { data: cs }, { data: daily }] = await Promise.all([
      supabase.from("meta_account_snapshots").select("*").eq("account_id", accountId).maybeSingle(),
      supabase.from("meta_campaigns_catalog").select("*").eq("account_id", accountId).is("deleted_at", null).order("spend", { ascending: false }),
      supabase.from("meta_insights_daily").select("*").eq("level", "account").eq("object_id", accountId).eq("breakdown_key", "").order("date_start"),
    ]);
    setSnapshot(snap as AccountSnapshot | null);
    setCampaigns((cs ?? []) as CampaignRow[]);
    setAccountDaily((daily ?? []) as DailyRow[]);
    setLoading(false);
  };

  // Token permission probe — surfaces a warning if pause/scale won't work
  useEffect(() => {
    void fetchTokenPermissions(accessToken).then((perms) => {
      setHasWriteScope(tokenHasWriteScope(perms));
    });
  }, [accessToken]);

  useEffect(() => { void reload(); }, [accountId]);

  const onFullSync = async () => {
    setSyncing(true);
    try {
      // 1) Catalog: every campaign in the account + lifetime rollup
      const r = await syncCampaignsCatalog(accessToken, accountId);
      // 2) Account-level: snapshot + 90d daily series for the chart
      await syncAccountSnapshot(accessToken, accountId);
      await syncDailyTimeSeries(accessToken, "account", accountId, 90);
      toast.success(`Synced ${r.inserted} campaign${r.inserted === 1 ? "" : "s"}${r.archived > 0 ? ` · ${r.archived} archived` : ""}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  // ── Filtering ───────────────────────────────────────────────────────

  const filteredCampaigns = useMemo(() => {
    let list = campaigns;
    if (statusFilter) list = list.filter((c) => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.objective ?? "").toLowerCase().includes(q) ||
        c.meta_campaign_id.includes(q),
      );
    }
    return list;
  }, [campaigns, search, statusFilter]);

  const counts = useMemo(() => {
    return {
      active: campaigns.filter((c) => c.status === "ACTIVE").length,
      paused: campaigns.filter((c) => c.status === "PAUSED").length,
      archived: campaigns.filter((c) => c.status === "ARCHIVED").length,
    };
  }, [campaigns]);

  // ── Render ──────────────────────────────────────────────────────────

  if (loading && campaigns.length === 0) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-card/60 border border-border" />
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Permission warning */}
      {hasWriteScope === false && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-3">
          <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="text-xs">
            <span className="font-medium text-amber-400">Read-only token.</span>{" "}
            <span className="text-muted-foreground">Pause / scale will fail until the token has the <code className="text-foreground">ads_management</code> scope. Re-issue the token with that permission in Business Manager.</span>
          </div>
        </div>
      )}

      {/* Account KPIs + sync */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <SiMeta className="h-4 w-4" style={{ color: "#0866FF" }} />
              <span className="text-sm font-semibold">{snapshot?.account_name ?? `act_${accountId}`}</span>
              {hasWriteScope ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                  <ShieldCheck className="h-3 w-3" /> write
                </span>
              ) : null}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {snapshot?.synced_at
                ? `Last synced ${format(parseISO(snapshot.synced_at), "MMM d, HH:mm")}`
                : "Never synced — click Sync to populate"}
            </div>
          </div>
          <Button size="sm" onClick={onFullSync} disabled={syncing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync from Meta"}
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile icon={<DollarSign className="h-4 w-4" />} tone="violet" label="Spend (30d)" value={fmtMoney(snapshot?.spend_30d ?? 0)} />
          <KpiTile icon={<DollarSign className="h-4 w-4" />} tone="cyan"   label="Spend (7d)"  value={fmtMoney(snapshot?.spend_7d ?? 0)} />
          <KpiTile icon={<Play className="h-4 w-4" />}        tone="emerald" label="Active"    value={String(counts.active)} hint={`${counts.paused} paused`} />
          <KpiTile icon={<Eye className="h-4 w-4" />}         tone="rose"   label="Total campaigns" value={String(campaigns.length)} hint={`${counts.archived} archived`} />
        </div>

        {/* Daily spend area chart */}
        {accountDaily.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-6 text-center border border-dashed border-border rounded-lg">
            No daily data yet. Hit Sync to pull the last 90 days.
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={accountDaily} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="metaSpendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(8,102,255)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="rgb(8,102,255)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date_start" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => format(parseISO(v as string), "MMM d")} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} width={48} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  labelFormatter={(v) => format(parseISO(v as string), "MMM d, yyyy")}
                  formatter={(v: number) => [fmtMoney(v), "Spend"]}
                />
                <Area type="monotone" dataKey="spend" stroke="rgb(8,102,255)" strokeWidth={2} fill="url(#metaSpendGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Campaigns table */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" /> Campaigns
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Click a row for adsets / creatives / time series / placement / demographics.
            </div>
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-7 h-8 text-xs w-56" />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterPill active={statusFilter === null} onClick={() => setStatusFilter(null)}>All ({campaigns.length})</FilterPill>
          <FilterPill active={statusFilter === "ACTIVE"} onClick={() => setStatusFilter("ACTIVE")}>Active ({counts.active})</FilterPill>
          <FilterPill active={statusFilter === "PAUSED"} onClick={() => setStatusFilter("PAUSED")}>Paused ({counts.paused})</FilterPill>
          <FilterPill active={statusFilter === "ARCHIVED"} onClick={() => setStatusFilter("ARCHIVED")}>Archived ({counts.archived})</FilterPill>
        </div>

        {filteredCampaigns.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-8 text-center border border-dashed border-border rounded-lg">
            {campaigns.length === 0 ? "No campaigns yet — click Sync from Meta to populate." : "Nothing matches these filters."}
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[2.5fr_90px_100px_1fr_1fr_1fr_140px] gap-2 px-3 py-2 bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              <div>Campaign</div>
              <div>Status</div>
              <div className="text-right">Daily $</div>
              <div className="text-right">Spend</div>
              <div className="text-right">Impr.</div>
              <div className="text-right">CTR</div>
              <div className="text-right">Actions</div>
            </div>
            <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
              {filteredCampaigns.map((c) => (
                <CampaignRowView
                  key={c.meta_campaign_id}
                  campaign={c}
                  accessToken={accessToken}
                  hasWriteScope={!!hasWriteScope}
                  onOpen={() => setDrillCampaign(c)}
                  onChanged={reload}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Drill-down dialog */}
      {drillCampaign && (
        <Dialog open={!!drillCampaign} onOpenChange={(open) => !open && setDrillCampaign(null)}>
          <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SiMeta className="h-4 w-4" style={{ color: "#0866FF" }} />
                {drillCampaign.name ?? drillCampaign.meta_campaign_id}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${statusPill(drillCampaign.status)}`}>
                  {drillCampaign.status}
                </span>
              </DialogTitle>
            </DialogHeader>
            <MetaCampaignDetail
              campaign={drillCampaign}
              accessToken={accessToken}
              hasWriteScope={!!hasWriteScope}
              onChanged={reload}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Campaign row with inline pause/resume + budget ──────────────────────

function CampaignRowView({
  campaign, accessToken, hasWriteScope, onOpen, onChanged,
}: {
  campaign: CampaignRow;
  accessToken: string;
  hasWriteScope: boolean;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const onToggle = async () => {
    setBusy(true);
    try {
      const next = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
      await setCampaignStatus(accessToken, campaign.meta_campaign_id, next);
      toast.success(`Campaign ${next.toLowerCase()}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="grid grid-cols-[2.5fr_90px_100px_1fr_1fr_1fr_140px] gap-2 px-3 py-2.5 text-xs items-center hover:bg-secondary/20 transition-colors cursor-pointer"
      onClick={onOpen}
    >
      <div className="min-w-0">
        <div className="font-medium truncate">{campaign.name ?? campaign.meta_campaign_id}</div>
        <div className="text-[10px] text-muted-foreground truncate">{campaign.objective ?? "—"}</div>
      </div>
      <div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${statusPill(campaign.status)}`}>
          {campaign.status}
        </span>
      </div>
      <div className="text-right tabular-nums">{fmtBudget(campaign.daily_budget_cents)}</div>
      <div className="text-right tabular-nums font-semibold">{fmtMoney(campaign.spend)}</div>
      <div className="text-right tabular-nums text-muted-foreground">{fmtCount(campaign.impressions)}</div>
      <div className="text-right tabular-nums text-muted-foreground">
        {campaign.ctr != null ? `${campaign.ctr.toFixed(2)}%` : "—"}
      </div>
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {/* Pause / Resume — gated behind confirm */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={busy || !hasWriteScope || campaign.status === "ARCHIVED"}
              title={hasWriteScope ? (campaign.status === "ACTIVE" ? "Pause" : "Resume") : "Token lacks ads_management scope"}
            >
              {campaign.status === "ACTIVE" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {campaign.status === "ACTIVE" ? "Pause this campaign?" : "Resume this campaign?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {campaign.status === "ACTIVE"
                  ? `${campaign.name ?? "Campaign"} will stop spending immediately.`
                  : `${campaign.name ?? "Campaign"} will start spending again at its configured daily budget.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onToggle}>
                {campaign.status === "ACTIVE" ? "Pause" : "Resume"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Budget */}
        <BudgetDialog
          currentCents={campaign.daily_budget_cents}
          name={campaign.name ?? "Campaign"}
          disabled={!hasWriteScope}
          onSave={async (dollars) => {
            await setCampaignDailyBudget(accessToken, campaign.meta_campaign_id, dollars);
            toast.success(`Daily budget set to ${fmtMoney(dollars)}`);
            onChanged();
          }}
        />

        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
    </div>
  );
}

// ── Budget dialog (campaign-or-adset shared) ───────────────────────────

function BudgetDialog({
  currentCents, name, disabled, onSave,
}: {
  currentCents: number | null;
  name: string;
  disabled: boolean;
  onSave: (dollars: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>(currentCents != null ? (currentCents / 100).toString() : "");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(currentCents != null ? (currentCents / 100).toString() : ""); }}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={disabled} title={disabled ? "Token lacks ads_management scope" : "Set daily budget"}>
          <DollarSign className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Daily budget — {name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Daily budget ($)</Label>
            <Input
              type="number"
              step="0.01"
              min="1"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              Current: {fmtBudget(currentCents)}. Meta enforces a $1 minimum.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={busy || !val || Number(val) <= 0}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(Number(val));
                setOpen(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Budget update failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Drill-down: tabs for adsets / creatives / time / placement / demographics ──

function MetaCampaignDetail({
  campaign, accessToken, hasWriteScope, onChanged,
}: {
  campaign: CampaignRow;
  accessToken: string;
  hasWriteScope: boolean;
  onChanged: () => void;
}) {
  const [adsets, setAdsets] = useState<AdsetRow[]>([]);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [breakdowns, setBreakdowns] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadFromDb = async () => {
    setLoading(true);
    const [{ data: a }, { data: d }, { data: ts }, { data: bd }] = await Promise.all([
      supabase.from("meta_adsets").select("*").eq("meta_campaign_id", campaign.meta_campaign_id).is("deleted_at", null).order("spend", { ascending: false }),
      supabase.from("meta_ads").select("*").eq("meta_campaign_id", campaign.meta_campaign_id).is("deleted_at", null).order("spend", { ascending: false }),
      supabase.from("meta_insights_daily").select("*").eq("level", "campaign").eq("object_id", campaign.meta_campaign_id).eq("breakdown_key", "").order("date_start"),
      supabase.from("meta_insights_daily").select("*").eq("level", "campaign").eq("object_id", campaign.meta_campaign_id).neq("breakdown_key", ""),
    ]);
    setAdsets((a ?? []) as AdsetRow[]);
    setAds((d ?? []) as AdRow[]);
    setDaily((ts ?? []) as DailyRow[]);
    setBreakdowns((bd ?? []) as DailyRow[]);
    setLoading(false);
  };

  useEffect(() => { void loadFromDb(); }, [campaign.meta_campaign_id]);

  const onSyncDetail = async () => {
    setSyncing(true);
    try {
      const r = await fullSyncCampaign(accessToken, campaign.meta_campaign_id, { days: 30 });
      toast.success(`Synced ${r.adsets} adset${r.adsets === 1 ? "" : "s"}, ${r.ads} ad${r.ads === 1 ? "" : "s"}, ${r.dailyRows} daily rows, ${r.breakdownRows} breakdowns`);
      await loadFromDb();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Detail sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
        <div className="text-muted-foreground">
          Spend <span className="font-semibold text-foreground">{fmtMoney(campaign.spend)}</span> ·{" "}
          {fmtCount(campaign.impressions)} impressions · {fmtCount(campaign.clicks)} clicks ·{" "}
          CTR {campaign.ctr != null ? `${campaign.ctr.toFixed(2)}%` : "—"}
          {campaign.frequency != null && <> · Freq {campaign.frequency.toFixed(2)}</>}
          {campaign.reach > 0 && <> · Reach {fmtCount(campaign.reach)}</>}
        </div>
        <Button size="sm" variant="outline" onClick={onSyncDetail} disabled={syncing}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync detail"}
        </Button>
      </div>

      <Tabs defaultValue="adsets">
        <TabsList>
          <TabsTrigger value="adsets">Adsets ({adsets.length})</TabsTrigger>
          <TabsTrigger value="creatives">Creatives ({ads.length})</TabsTrigger>
          <TabsTrigger value="time">Daily</TabsTrigger>
          <TabsTrigger value="placement">Placement</TabsTrigger>
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
        </TabsList>

        {/* Adsets */}
        <TabsContent value="adsets" className="mt-4">
          {loading ? (
            <div className="h-32 animate-pulse rounded-lg bg-card/60" />
          ) : adsets.length === 0 ? (
            <EmptyHint syncing={syncing} />
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[2fr_90px_100px_1fr_1fr_120px] gap-2 px-3 py-2 bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                <div>Adset</div>
                <div>Status</div>
                <div className="text-right">Daily $</div>
                <div className="text-right">Spend</div>
                <div className="text-right">CTR</div>
                <div className="text-right">Actions</div>
              </div>
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {adsets.map((a) => (
                  <AdsetRowView key={a.meta_adset_id} adset={a} accessToken={accessToken} hasWriteScope={hasWriteScope} onChanged={loadFromDb} />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Creatives */}
        <TabsContent value="creatives" className="mt-4">
          {loading ? (
            <div className="h-32 animate-pulse rounded-lg bg-card/60" />
          ) : ads.length === 0 ? (
            <EmptyHint syncing={syncing} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
              {ads.map((ad) => (
                <CreativeCard key={ad.meta_ad_id} ad={ad} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Daily time series */}
        <TabsContent value="time" className="mt-4">
          {daily.length === 0 ? (
            <EmptyHint syncing={syncing} />
          ) : (
            <div className="space-y-3">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="campaignSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(8,102,255)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="rgb(8,102,255)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="date_start" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      tickFormatter={(v) => format(parseISO(v as string), "MMM d")}
                      axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} width={48} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                      labelFormatter={(v) => format(parseISO(v as string), "MMM d, yyyy")}
                    />
                    <Area type="monotone" dataKey="spend" name="Spend $" stroke="rgb(8,102,255)" strokeWidth={2} fill="url(#campaignSpend)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="date_start" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      tickFormatter={(v) => format(parseISO(v as string), "MMM d")}
                      axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                      labelFormatter={(v) => format(parseISO(v as string), "MMM d, yyyy")}
                    />
                    <Bar dataKey="clicks" name="Clicks" fill="rgb(52,211,153)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Placement */}
        <TabsContent value="placement" className="mt-4">
          <BreakdownTable
            rows={breakdowns.filter((b) => b.breakdown_key === "publisher_platform" || b.breakdown_key === "platform_position")}
            label="Placement"
            empty={syncing ? "Syncing…" : "No placement data — run Sync detail."}
          />
        </TabsContent>

        {/* Demographics */}
        <TabsContent value="demographics" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BreakdownDonut rows={breakdowns.filter((b) => b.breakdown_key === "age")} label="Age" />
            <BreakdownDonut rows={breakdowns.filter((b) => b.breakdown_key === "gender")} label="Gender" />
            <BreakdownTable
              rows={breakdowns.filter((b) => b.breakdown_key === "country")}
              label="Country"
              empty={syncing ? "Syncing…" : "No country data — run Sync detail."}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Adset row with inline pause + budget ────────────────────────────────

function AdsetRowView({
  adset, accessToken, hasWriteScope, onChanged,
}: {
  adset: AdsetRow;
  accessToken: string;
  hasWriteScope: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const onToggle = async () => {
    setBusy(true);
    try {
      const next = adset.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
      await setAdsetStatus(accessToken, adset.meta_adset_id, next);
      toast.success(`Adset ${next.toLowerCase()}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status update failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid grid-cols-[2fr_90px_100px_1fr_1fr_120px] gap-2 px-3 py-2.5 text-xs items-center hover:bg-secondary/20">
      <div className="min-w-0">
        <div className="font-medium truncate">{adset.name ?? adset.meta_adset_id}</div>
        <div className="text-[10px] text-muted-foreground truncate">{adset.optimization_goal ?? "—"}</div>
      </div>
      <div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${statusPill(adset.status)}`}>{adset.status}</span>
      </div>
      <div className="text-right tabular-nums">{fmtBudget(adset.daily_budget_cents)}</div>
      <div className="text-right tabular-nums font-semibold">{fmtMoney(adset.spend)}</div>
      <div className="text-right tabular-nums text-muted-foreground">
        {adset.ctr != null ? `${adset.ctr.toFixed(2)}%` : "—"}
      </div>
      <div className="flex items-center justify-end gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy || !hasWriteScope} onClick={onToggle}
          title={hasWriteScope ? (adset.status === "ACTIVE" ? "Pause" : "Resume") : "Read-only token"}>
          {adset.status === "ACTIVE" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <BudgetDialog
          currentCents={adset.daily_budget_cents}
          name={adset.name ?? "Adset"}
          disabled={!hasWriteScope}
          onSave={async (dollars) => {
            await setAdsetDailyBudget(accessToken, adset.meta_adset_id, dollars);
            toast.success(`Daily budget set to ${fmtMoney(dollars)}`);
            onChanged();
          }}
        />
      </div>
    </div>
  );
}

// ── Creative card (image + headline + insight strip) ─────────────────────

function CreativeCard({ ad }: { ad: AdRow }) {
  const [imgError, setImgError] = useState(false);
  const img = ad.thumbnail_url ?? ad.image_url;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="relative aspect-square bg-secondary/40 flex items-center justify-center">
        {img && !imgError ? (
          <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
        )}
        <span className={`absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded font-medium border ${statusPill(ad.status)}`}>
          {ad.status}
        </span>
        {ad.permalink_url && (
          <a
            href={ad.permalink_url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 p-1.5 rounded bg-card/80 text-muted-foreground hover:text-primary"
            title="Open ad preview"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="p-3 space-y-2 flex-1">
        <div className="text-xs font-medium truncate" title={ad.name ?? undefined}>
          {ad.name ?? "Untitled"}
        </div>
        {ad.headline && (
          <div className="text-[11px] text-foreground/80 line-clamp-2" title={ad.headline}>{ad.headline}</div>
        )}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
          <Mini label="Spend" value={fmtMoney(ad.spend)} />
          <Mini label="Clicks" value={fmtCount(ad.clicks)} />
          <Mini label="CTR" value={ad.ctr != null ? `${ad.ctr.toFixed(2)}%` : "—"} />
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ── Breakdown helpers ────────────────────────────────────────────────────

const PIE_COLORS = ["rgb(8,102,255)", "rgb(167,139,250)", "rgb(52,211,153)", "rgb(251,113,133)", "rgb(251,191,36)", "rgb(56,189,248)"];

function BreakdownTable({ rows, label, empty }: { rows: DailyRow[]; label: string; empty: string }) {
  if (rows.length === 0) return <div className="text-xs text-muted-foreground italic py-6 text-center border border-dashed border-border rounded-lg">{empty}</div>;
  // Group by breakdown_key + value (a row per dimension value)
  const total = rows.reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const sorted = [...rows].sort((a, b) => b.spend - a.spend);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_2fr_100px_100px_100px] gap-2 px-3 py-2 bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        <div>{label}</div>
        <div>Share</div>
        <div className="text-right">Spend</div>
        <div className="text-right">Clicks</div>
        <div className="text-right">Impr.</div>
      </div>
      <div className="divide-y divide-border max-h-72 overflow-y-auto">
        {sorted.map((r, i) => {
          const pct = total > 0 ? (r.spend / total) * 100 : 0;
          return (
            <div key={`${r.breakdown_key}-${r.breakdown_value}-${i}`} className="grid grid-cols-[1fr_2fr_100px_100px_100px] gap-2 px-3 py-2 text-xs items-center">
              <div className="font-medium truncate" title={r.breakdown_value}>{r.breakdown_value}</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
              </div>
              <div className="text-right tabular-nums font-semibold">{fmtMoney(r.spend)}</div>
              <div className="text-right tabular-nums text-muted-foreground">{fmtCount(r.clicks)}</div>
              <div className="text-right tabular-nums text-muted-foreground">{fmtCount(r.impressions)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BreakdownDonut({ rows, label }: { rows: DailyRow[]; label: string }) {
  if (rows.length === 0) return null;
  const data = rows
    .map((r) => ({ name: r.breakdown_value, value: Number(r.spend ?? 0) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} innerRadius="55%" outerRadius="92%" dataKey="value" stroke="var(--card)" strokeWidth={2}>
                {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [fmtMoney(v), "Spend"]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1.5">
          {data.slice(0, 5).map((d, i) => {
            const pct = total > 0 ? (d.value / total) * 100 : 0;
            return (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="font-medium truncate flex-1">{d.name}</span>
                <span className="tabular-nums text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Tiny helpers ─────────────────────────────────────────────────────────

const TILE_TONE: Record<string, string> = {
  violet: "border-violet-500/20 bg-violet-500/5 text-violet-400",
  cyan: "border-cyan-500/20 bg-cyan-500/5 text-cyan-400",
  emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
  rose: "border-rose-500/20 bg-rose-500/5 text-rose-400",
};
function KpiTile({ icon, tone, label, value, hint }: { icon: React.ReactNode; tone: keyof typeof TILE_TONE; label: string; value: string; hint?: string }) {
  return (
    <div className={`rounded-xl border p-4 ${TILE_TONE[tone]}`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</div>
        {icon}
      </div>
      <div className="text-xl font-bold tabular-nums mt-2 text-foreground">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyHint({ syncing }: { syncing: boolean }) {
  return (
    <div className="text-xs text-muted-foreground italic py-8 text-center border border-dashed border-border rounded-lg">
      {syncing ? "Syncing from Meta…" : "No data yet — click Sync detail above."}
    </div>
  );
}
