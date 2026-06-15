import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign, TrendingUp, Percent, Plus, Trash2, Edit2, Check, X,
  ExternalLink, RefreshCw, Unlink, Megaphone,
} from "lucide-react";
import { SiMeta } from "react-icons/si";
import { MetaAccountView } from "@/components/MetaAccountView";
import { OnlyFinderSection } from "@/components/onlyfinder/OnlyFinderSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";

export const Route = createFileRoute("/ads")({ component: AdsPage });

const META_BLUE = "#0082FB";

const fmt$ = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt$0 = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtNum = (n: number) => n.toLocaleString();

// ── Types ─────────────────────────────────────────────────────────────────────
type Creator = { id: string; name: string };
type AdStatus = "active" | "paused" | "completed" | "cancelled";
type AdCampaign = {
  id: string;
  creator_id: string;
  name: string | null;
  platform: string;
  status: AdStatus;
  amount_spent: number;
  revenue_generated: number;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  infloww_campaign_code: number | null;
  meta_campaign_id: string | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  meta_synced_at: string | null;
};
type InflowwStat = {
  id: string;
  creator_id: string;
  campaign_code: number;
  campaign_url: string | null;
  clicks_count: number;
  subscribers_count: number;
  revenue_total: number;
  revenue_per_sub: number;
  spenders_count: number;
};
type AgencySettings = {
  id: string;
  meta_ads_access_token: string | null;
  meta_ad_account_id: string | null;
  meta_ads_connected_at: string | null;
};

const statusStyles: Record<AdStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  completed: "bg-primary/15 text-primary border-primary/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};
const statusLabels: Record<AdStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PLATFORM_OPTIONS = ["meta", "facebook", "instagram", "reddit", "x", "tiktok", "shoutout", "of_promo", "other"];
const platformLabel = (p: string) => {
  const map: Record<string, string> = { meta: "Meta", facebook: "Facebook", instagram: "Instagram", reddit: "Reddit", x: "X", tiktok: "TikTok", shoutout: "Shoutout", of_promo: "OF Promo", other: "Other" };
  return map[p] ?? p;
};

const roiPct = (spent: number, revenue: number): number | null => {
  if (spent === 0) return null;
  return ((revenue - spent) / spent) * 100;
};

// Effective revenue: prefer Infloww-attributed revenue when a code is assigned.
const effectiveRevenue = (c: AdCampaign, stats: InflowwStat[]): number => {
  if (c.infloww_campaign_code != null) {
    const stat = stats.find((s) => s.creator_id === c.creator_id && s.campaign_code === c.infloww_campaign_code);
    if (stat) return stat.revenue_total;
  }
  return c.revenue_generated;
};

// ── Main component ─────────────────────────────────────────────────────────────
function AdsPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [inflowwStats, setInflowwStats] = useState<InflowwStat[]>([]);
  const [settings, setSettings] = useState<AgencySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const [{ data: cs }, { data: ads }, { data: stats }, { data: s }] = await Promise.all([
      supabase.from("creators").select("id, name").order("name"),
      supabase.from("ad_campaigns").select("*").order("start_date", { ascending: false }),
      supabase.from("infloww_tracking_stats").select("*"),
      supabase.from("agency_settings").select("id, meta_ads_access_token, meta_ad_account_id, meta_ads_connected_at").maybeSingle(),
    ]);
    setCreators((cs ?? []) as Creator[]);
    setCampaigns((ads ?? []) as AdCampaign[]);
    setInflowwStats((stats ?? []) as InflowwStat[]);
    setSettings(s as AgencySettings | null);
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const refresh = () => load(true);

  const isMetaConnected = !!(settings?.meta_ads_access_token && settings?.meta_ad_account_id);

  return (
    <div className="space-y-6">
      <Toaster />
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <Megaphone className="h-6 w-6" style={{ color: META_BLUE }} />
          <h1 className="text-3xl font-bold tracking-tight">Paid Ads</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Spend, revenue, and ROI across every paid channel — with Infloww attribution and live Meta Marketing API sync.
        </p>
      </div>

      <MetaAdsConnectionPanel settings={settings} campaigns={campaigns} onRefresh={refresh} />

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="meta" disabled={!isMetaConnected}>Meta Account</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="onlyfinder">OnlyFinder</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab creators={creators} campaigns={campaigns} inflowwStats={inflowwStats} />
          </TabsContent>
          <TabsContent value="meta" className="mt-6">
            {/* Meta Account view — auto-listed campaigns, daily charts,
                adset/creative/placement/demographics drill-down, plus
                pause/resume/budget controls. Disabled tab if Meta isn't
                connected yet (the connection panel above is the entry point). */}
            {isMetaConnected && settings?.meta_ads_access_token && settings.meta_ad_account_id ? (
              <MetaAccountView
                accessToken={settings.meta_ads_access_token}
                accountId={settings.meta_ad_account_id}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
                <SiMeta className="h-7 w-7 mx-auto mb-2" style={{ color: "#0866FF", opacity: 0.5 }} />
                <div className="text-sm font-medium">Connect Meta Ads to use this view</div>
                <p className="text-xs text-muted-foreground mt-1">Use the connection panel above.</p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="campaigns" className="mt-6">
            <CampaignsTab
              creators={creators}
              campaigns={campaigns}
              inflowwStats={inflowwStats}
              settings={settings}
              metaConnected={isMetaConnected}
              onRefresh={refresh}
            />
          </TabsContent>
          <TabsContent value="analytics" className="mt-6">
            <AnalyticsTab creators={creators} campaigns={campaigns} inflowwStats={inflowwStats} />
          </TabsContent>
          <TabsContent value="onlyfinder" className="mt-6">
            <OnlyFinderSection />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ── Meta Ads connection panel (top of page) ────────────────────────────────────
function MetaAdsConnectionPanel({
  settings, campaigns, onRefresh,
}: { settings: AgencySettings | null; campaigns: AdCampaign[]; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ad_account_id: "", access_token: "" });
  const [submitting, setSubmitting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  const isConnected = !!(settings?.meta_ads_access_token && settings?.meta_ad_account_id);
  const linkedCount = campaigns.filter((c) => c.meta_campaign_id).length;

  const onConnect = async () => {
    const accountId = form.ad_account_id.trim().replace(/^act_/, "");
    const token = form.access_token.trim();
    if (!accountId || !token) {
      toast.error("Both Ad Account ID and access token are required.");
      return;
    }
    setSubmitting(true);
    // Validate by fetching ad account info
    const res = await fetch(
      `https://graph.facebook.com/v21.0/act_${encodeURIComponent(accountId)}?fields=name,account_status&access_token=${encodeURIComponent(token)}`
    );
    const data = (await res.json()) as { name?: string; account_status?: number; error?: { message?: string } };
    if (data.error) {
      setSubmitting(false);
      toast.error(`Meta rejected: ${data.error.message ?? "Unknown error"}`);
      return;
    }
    if (!settings?.id) {
      // Insert new settings row
      const { error } = await supabase.from("agency_settings").insert({
        meta_ads_access_token: token,
        meta_ad_account_id: accountId,
        meta_ads_connected_at: new Date().toISOString(),
      });
      if (error) {
        setSubmitting(false);
        return toast.error(error.message);
      }
    } else {
      const { error } = await supabase.from("agency_settings").update({
        meta_ads_access_token: token,
        meta_ad_account_id: accountId,
        meta_ads_connected_at: new Date().toISOString(),
      }).eq("id", settings.id);
      if (error) {
        setSubmitting(false);
        return toast.error(error.message);
      }
    }
    setSubmitting(false);
    toast.success(`Connected to Meta Ad Account: ${data.name ?? accountId}`);
    setForm({ ad_account_id: "", access_token: "" });
    setOpen(false);
    onRefresh();
  };

  const onDisconnect = async () => {
    if (!settings?.id) return;
    const { error } = await supabase
      .from("agency_settings")
      .update({ meta_ads_access_token: null, meta_ad_account_id: null, meta_ads_connected_at: null })
      .eq("id", settings.id);
    if (error) return toast.error(error.message);
    toast.success("Disconnected from Meta Ads");
    onRefresh();
  };

  const onSyncAll = async () => {
    if (!settings?.meta_ads_access_token || !settings.meta_ad_account_id) return;
    const linked = campaigns.filter((c) => c.meta_campaign_id);
    if (linked.length === 0) {
      toast.info("No campaigns linked to a Meta campaign ID yet.");
      return;
    }
    setSyncingAll(true);
    const token = settings.meta_ads_access_token;
    let okCount = 0;
    let errCount = 0;
    for (const c of linked) {
      const result = await syncOneMetaCampaign(c.id, c.meta_campaign_id!, token);
      if (result.ok) okCount++; else errCount++;
    }
    setSyncingAll(false);
    if (errCount === 0) toast.success(`Synced ${okCount} campaign${okCount !== 1 ? "s" : ""} from Meta`);
    else toast.warning(`Synced ${okCount} · ${errCount} failed — check console for details`);
    onRefresh();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <SiMeta className="h-5 w-5" style={{ color: META_BLUE }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">
            Meta Ads
            {isConnected ? (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Connected
              </span>
            ) : (
              <span className="text-xs font-normal text-muted-foreground">Not connected</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {isConnected ? (
              <>
                Ad account <code className="bg-secondary/40 px-1 rounded">act_{settings!.meta_ad_account_id}</code>
                {" · "}{linkedCount} campaign{linkedCount === 1 ? "" : "s"} linked
                {settings?.meta_ads_connected_at && (
                  <> · since {formatDistanceToNow(new Date(settings.meta_ads_connected_at), { addSuffix: true })}</>
                )}
              </>
            ) : (
              <>Pull live spend, impressions, clicks, CTR/CPC/CPM from your Meta ad account.</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Button variant="outline" size="sm" onClick={onSyncAll} disabled={syncingAll || linkedCount === 0}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncingAll ? "animate-spin" : ""}`} />
                {syncingAll ? "Syncing…" : `Sync ${linkedCount} linked`}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect Meta Ads?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Existing spend/insight data on campaigns stays intact. Sync stops working until you reconnect.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDisconnect}>Disconnect</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <Button size="sm" onClick={() => setOpen(true)}>
              <SiMeta className="h-3.5 w-3.5 mr-1.5" />
              Connect Meta Ads
            </Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SiMeta className="h-5 w-5" />
              Connect Meta Marketing API
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground space-y-2">
              <div>This pulls live spend, impressions, clicks, CTR/CPC/CPM from the Meta Marketing API for any campaign you link by Meta Campaign ID.</div>
              <div className="font-medium text-foreground">Requirements:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Be an admin of the Meta Ad Account.</li>
                <li>Generate a User Access Token with the <code className="bg-card px-1 rounded">ads_read</code> scope (and ideally <code className="bg-card px-1 rounded">ads_management</code> if you'll edit later).</li>
                <li>Long-lived tokens recommended — exchange via <code className="bg-card px-1 rounded">/oauth/access_token</code>.</li>
              </ul>
              <div className="font-medium text-foreground pt-1">How to get the IDs:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Ad Account ID is in <a className="text-primary hover:underline" href="https://business.facebook.com/adsmanager" target="_blank" rel="noreferrer">Ads Manager</a> URL — the number after <code className="bg-card px-1 rounded">act=</code>.</li>
                <li>Campaign IDs you'll add per-campaign in the campaign editor below.</li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label>Ad Account ID</Label>
              <Input
                placeholder="123456789012345 (or act_123456789012345)"
                value={form.ad_account_id}
                onChange={(e) => setForm({ ...form, ad_account_id: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Access token</Label>
              <Input
                type="password"
                placeholder="EAAB..."
                value={form.access_token}
                onChange={(e) => setForm({ ...form, access_token: e.target.value })}
              />
              <div className="text-xs text-muted-foreground">
                Stored in your Supabase DB. Treat like a password.
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={onConnect} disabled={submitting}>
              {submitting ? "Validating…" : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sync one Meta campaign's insights into ad_campaigns.
async function syncOneMetaCampaign(
  rowId: string,
  metaCampaignId: string,
  accessToken: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const fields = "spend,impressions,clicks,ctr,cpc,cpm";
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(metaCampaignId)}/insights?fields=${fields}&date_preset=maximum&access_token=${encodeURIComponent(accessToken)}`
    );
    const json = (await res.json()) as {
      data?: { spend?: string; impressions?: string; clicks?: string; ctr?: string; cpc?: string; cpm?: string }[];
      error?: { message?: string };
    };
    if (json.error) return { ok: false, error: json.error.message ?? "Graph API error" };
    const insights = json.data?.[0];
    if (!insights) {
      // No data returned — campaign exists but has no spend yet. Mark synced anyway.
      await supabase
        .from("ad_campaigns")
        .update({ meta_synced_at: new Date().toISOString() })
        .eq("id", rowId);
      return { ok: true };
    }
    const payload = {
      amount_spent: parseFloat(insights.spend ?? "0"),
      impressions: parseInt(insights.impressions ?? "0"),
      clicks: parseInt(insights.clicks ?? "0"),
      ctr: insights.ctr ? parseFloat(insights.ctr) : null,
      cpc: insights.cpc ? parseFloat(insights.cpc) : null,
      cpm: insights.cpm ? parseFloat(insights.cpm) : null,
      meta_synced_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("ad_campaigns").update(payload).eq("id", rowId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

// ── Overview Tab ───────────────────────────────────────────────────────────────
function OverviewTab({
  creators, campaigns, inflowwStats,
}: { creators: Creator[]; campaigns: AdCampaign[]; inflowwStats: InflowwStat[] }) {
  const totals = useMemo(() => {
    const spend = campaigns.reduce((s, c) => s + c.amount_spent, 0);
    const revenue = campaigns.reduce((s, c) => s + effectiveRevenue(c, inflowwStats), 0);
    const impressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    return {
      spend,
      revenue,
      net: revenue - spend,
      roas: roiPct(spend, revenue),
      impressions,
      clicks,
      activeCount: campaigns.filter((c) => c.status === "active").length,
    };
  }, [campaigns, inflowwStats]);

  const byCreator = useMemo(() => {
    const map = new Map<string, { spent: number; revenue: number; count: number }>();
    for (const c of campaigns) {
      const existing = map.get(c.creator_id) ?? { spent: 0, revenue: 0, count: 0 };
      map.set(c.creator_id, {
        spent: existing.spent + c.amount_spent,
        revenue: existing.revenue + effectiveRevenue(c, inflowwStats),
        count: existing.count + 1,
      });
    }
    return Array.from(map.entries())
      .sort((a, b) => (b[1].revenue - b[1].spent) - (a[1].revenue - a[1].spent))
      .slice(0, 8);
  }, [campaigns, inflowwStats]);

  const creatorName = (id: string) => creators.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Total spend" value={fmt$(totals.spend)} sub={`${campaigns.length} campaigns`} icon={<DollarSign className="h-3.5 w-3.5" />} />
        <KpiCard label="Total revenue" value={fmt$(totals.revenue)} sub="Infloww-attributed where set" icon={<TrendingUp className="h-3.5 w-3.5" />} />
        <KpiCard
          label="Net profit"
          value={fmt$(totals.net)}
          sub={totals.activeCount + " active"}
          valueClass={totals.net >= 0 ? "text-success" : "text-destructive"}
        />
        <KpiCard
          label="Overall ROAS"
          value={totals.roas != null ? `${totals.roas >= 0 ? "+" : ""}${totals.roas.toFixed(1)}%` : "—"}
          sub="(rev - spend) / spend"
          valueClass={(totals.roas ?? 0) >= 0 ? "text-success" : "text-destructive"}
          icon={<Percent className="h-3.5 w-3.5" />}
        />
      </div>

      {(totals.impressions > 0 || totals.clicks > 0) && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="Impressions" value={fmtNum(totals.impressions)} sub="from Meta-synced campaigns" />
          <KpiCard label="Clicks" value={fmtNum(totals.clicks)} sub={totals.impressions > 0 ? `${((totals.clicks / totals.impressions) * 100).toFixed(2)}% CTR` : "—"} />
          <KpiCard label="Avg CPC" value={totals.clicks > 0 ? fmt$(totals.spend / totals.clicks) : "—"} sub="cost per click" />
          <KpiCard label="Avg CPM" value={totals.impressions > 0 ? fmt$(totals.spend / (totals.impressions / 1000)) : "—"} sub="cost per 1k impressions" />
        </div>
      )}

      {byCreator.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-semibold mb-4">Net profit by creator (top 8)</div>
          <div className="space-y-3">
            {byCreator.map(([cid, stats]) => {
              const net = stats.revenue - stats.spent;
              const maxNet = Math.max(...byCreator.map(([, s]) => Math.abs(s.revenue - s.spent)), 1);
              const pct = (Math.abs(net) / maxNet) * 100;
              return (
                <div key={cid} className="flex items-center gap-3">
                  <Link
                    to="/creators/$creatorId"
                    params={{ creatorId: cid }}
                    className="w-32 text-xs truncate hover:text-primary transition-colors"
                  >
                    {creatorName(cid)}
                  </Link>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full ${net >= 0 ? "bg-success" : "bg-destructive"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className={`w-24 text-right text-xs font-semibold ${net >= 0 ? "text-success" : "text-destructive"}`}>
                    {net >= 0 ? "+" : ""}{fmt$(net)}
                  </div>
                  <div className="w-16 text-right">
                    <RoasBadge spent={stats.spent} revenue={stats.revenue} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label, value, sub, icon, valueClass,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        {icon && <span className="text-primary">{icon}</span>}
        {label}
      </div>
      <div className={`text-2xl font-bold ${valueClass ?? ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function RoasBadge({ spent, revenue }: { spent: number; revenue: number }) {
  const roi = roiPct(spent, revenue);
  if (roi == null) return <span className="text-muted-foreground text-xs">—</span>;
  const positive = roi >= 0;
  return (
    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${
      positive
        ? "bg-success/15 text-success border-success/30"
        : "bg-destructive/15 text-destructive border-destructive/30"
    }`}>
      {positive ? "+" : ""}{roi.toFixed(0)}%
    </span>
  );
}

// ── Campaigns Tab ──────────────────────────────────────────────────────────────
const emptyForm = {
  creator_id: "",
  name: "",
  platform: "meta",
  status: "active" as AdStatus,
  amount_spent: "",
  revenue_generated: "",
  start_date: format(new Date(), "yyyy-MM-dd"),
  end_date: "",
  notes: "",
  infloww_campaign_code: "",
  meta_campaign_id: "",
};

function CampaignsTab({
  creators, campaigns, inflowwStats, settings, metaConnected, onRefresh,
}: {
  creators: Creator[];
  campaigns: AdCampaign[];
  inflowwStats: InflowwStat[];
  settings: AgencySettings | null;
  metaConnected: boolean;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCreator, setFilterCreator] = useState("all");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const platformsInUse = useMemo(
    () => Array.from(new Set(campaigns.map((c) => c.platform))).sort(),
    [campaigns]
  );

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (filterCreator !== "all" && c.creator_id !== filterCreator) return false;
      if (filterPlatform !== "all" && c.platform !== filterPlatform) return false;
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      return true;
    });
  }, [campaigns, filterCreator, filterPlatform, filterStatus]);

  const startEdit = (c: AdCampaign) => {
    setForm({
      creator_id: c.creator_id,
      name: c.name ?? "",
      platform: c.platform,
      status: c.status,
      amount_spent: c.amount_spent.toString(),
      revenue_generated: c.revenue_generated.toString(),
      start_date: c.start_date,
      end_date: c.end_date ?? "",
      notes: c.notes ?? "",
      infloww_campaign_code: c.infloww_campaign_code?.toString() ?? "",
      meta_campaign_id: c.meta_campaign_id ?? "",
    });
    setEditingId(c.id);
    setOpen(true);
  };

  const onSubmit = async () => {
    if (!form.creator_id) return toast.error("Pick a creator");
    if (!form.amount_spent && !editingId) return toast.error("Enter spend amount (or 0 if Meta-synced)");
    const code = form.infloww_campaign_code.trim();
    const payload = {
      creator_id: form.creator_id,
      name: form.name.trim() || null,
      platform: form.platform,
      status: form.status,
      amount_spent: parseFloat(form.amount_spent) || 0,
      revenue_generated: parseFloat(form.revenue_generated) || 0,
      start_date: form.start_date,
      end_date: form.end_date || null,
      notes: form.notes.trim() || null,
      infloww_campaign_code: code ? parseInt(code) : null,
      meta_campaign_id: form.meta_campaign_id.trim() || null,
    };
    if (editingId) {
      const { error } = await supabase.from("ad_campaigns").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Campaign updated");
    } else {
      const { error } = await supabase.from("ad_campaigns").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Campaign added");
    }
    setForm(emptyForm);
    setEditingId(null);
    setOpen(false);
    onRefresh();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("ad_campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Campaign deleted");
    onRefresh();
  };

  const onSyncOne = async (c: AdCampaign) => {
    if (!settings?.meta_ads_access_token || !c.meta_campaign_id) return;
    setSyncingId(c.id);
    const result = await syncOneMetaCampaign(c.id, c.meta_campaign_id, settings.meta_ads_access_token);
    setSyncingId(null);
    if (!result.ok) {
      toast.error(`Sync failed: ${result.error}`);
      return;
    }
    toast.success("Synced from Meta");
    onRefresh();
  };

  const creatorName = (id: string) => creators.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterCreator} onValueChange={setFilterCreator}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All creators</SelectItem>
              {creators.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {platformsInUse.length > 0 && (
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                {platformsInUse.map((p) => (
                  <SelectItem key={p} value={p}>{platformLabel(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} campaign{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add campaign</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit campaign" : "Add ad campaign"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Creator</Label>
                  <Select value={form.creator_id} onValueChange={(v) => setForm({ ...form, creator_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                    <SelectContent>
                      {creators.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Platform</Label>
                  <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORM_OPTIONS.map((p) => (
                        <SelectItem key={p} value={p}>{platformLabel(p)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Campaign name <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Marissa Q2 conversion test"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AdStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End date <span className="text-muted-foreground text-xs">(opt)</span></Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount spent ($) <span className="text-muted-foreground text-xs">{form.meta_campaign_id ? "(auto from Meta)" : ""}</span></Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.amount_spent}
                    onChange={(e) => setForm({ ...form, amount_spent: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Revenue generated ($) <span className="text-muted-foreground text-xs">{form.infloww_campaign_code ? "(overridden by Infloww)" : ""}</span></Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.revenue_generated}
                    onChange={(e) => setForm({ ...form, revenue_generated: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Infloww campaign code <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    type="number"
                    value={form.infloww_campaign_code}
                    onChange={(e) => setForm({ ...form, infloww_campaign_code: e.target.value })}
                    placeholder="69"
                  />
                  <div className="text-[11px] text-muted-foreground">
                    Pulls live revenue from Infloww (overrides manual revenue).
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Meta campaign ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={form.meta_campaign_id}
                    onChange={(e) => setForm({ ...form, meta_campaign_id: e.target.value })}
                    placeholder="23857892374237"
                    disabled={!metaConnected && !editingId}
                  />
                  <div className="text-[11px] text-muted-foreground">
                    {metaConnected ? "Sync spend / impressions / clicks live." : "Connect Meta Ads to enable."}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal context" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setOpen(false); setEditingId(null); setForm(emptyForm); }}>Cancel</Button>
              <Button onClick={onSubmit}>{editingId ? "Save" : "Add campaign"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No campaigns yet — click "Add campaign" to track one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Campaign</th>
                <th className="text-left font-medium px-4 py-3">Creator</th>
                <th className="text-left font-medium px-4 py-3">Platform</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Period</th>
                <th className="text-right font-medium px-4 py-3">Spend</th>
                <th className="text-right font-medium px-4 py-3">Revenue</th>
                <th className="text-right font-medium px-4 py-3">Net</th>
                <th className="text-center font-medium px-4 py-3">ROAS</th>
                <th className="text-right font-medium px-4 py-3">Imp / Clicks</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const rev = effectiveRevenue(c, inflowwStats);
                const net = rev - c.amount_spent;
                const isInfloww = c.infloww_campaign_code != null;
                const isMeta = !!c.meta_campaign_id;
                return (
                  <tr key={c.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {c.name ?? <span className="italic text-muted-foreground">(unnamed)</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        {isMeta && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-primary">
                            <SiMeta className="h-2.5 w-2.5" /> {c.meta_synced_at ? "synced" : "linked"}
                          </span>
                        )}
                        {isInfloww && (
                          <span className="text-[10px] text-success">c{c.infloww_campaign_code} attribution</span>
                        )}
                      </div>
                      {c.notes && <div className="text-xs text-muted-foreground mt-0.5 max-w-[220px] truncate">{c.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <Link to="/creators/$creatorId" params={{ creatorId: c.creator_id }} className="hover:text-primary">
                        {creatorName(c.creator_id)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{platformLabel(c.platform)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded border ${statusStyles[c.status]}`}>
                        {statusLabels[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {format(new Date(c.start_date), "MMM d, yyyy")}
                      {c.end_date && <><br />→ {format(new Date(c.end_date), "MMM d, yyyy")}</>}
                    </td>
                    <td className="px-4 py-3 text-right">{fmt$(c.amount_spent)}</td>
                    <td className="px-4 py-3 text-right">
                      <div>{fmt$(rev)}</div>
                      {isInfloww && (
                        <div className="text-[10px] text-success">live</div>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${net >= 0 ? "text-success" : "text-destructive"}`}>
                      {net >= 0 ? "+" : ""}{fmt$(net)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <RoasBadge spent={c.amount_spent} revenue={rev} />
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs whitespace-nowrap">
                      {c.impressions > 0 ? (
                        <>
                          <div>{fmtNum(c.impressions)}</div>
                          <div className="text-[10px]">{fmtNum(c.clicks)} clicks{c.ctr != null ? ` · ${c.ctr.toFixed(2)}%` : ""}</div>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isMeta && metaConnected && (
                          <button
                            onClick={() => onSyncOne(c)}
                            disabled={syncingId === c.id}
                            className="rounded p-1.5 text-muted-foreground hover:text-primary hover:bg-secondary transition-colors disabled:opacity-50"
                            title="Sync from Meta"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${syncingId === c.id ? "animate-spin" : ""}`} />
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(c)}
                          className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDelete(c.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Analytics Tab ──────────────────────────────────────────────────────────────
function AnalyticsTab({
  creators, campaigns, inflowwStats,
}: { creators: Creator[]; campaigns: AdCampaign[]; inflowwStats: InflowwStat[] }) {
  // Spend / revenue / ROAS by week, last 12 weeks, anchored on start_date
  const weeklyData = useMemo(() => {
    const weeks: { label: string; spend: number; revenue: number; net: number; roas: number }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay());
    for (let i = 11; i >= 0; i--) {
      const start = new Date(thisWeekStart);
      start.setDate(thisWeekStart.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      let spend = 0;
      let revenue = 0;
      for (const c of campaigns) {
        const t = new Date(c.start_date).getTime();
        if (t >= start.getTime() && t < end.getTime()) {
          spend += c.amount_spent;
          revenue += effectiveRevenue(c, inflowwStats);
        }
      }
      weeks.push({
        label: format(start, "MMM d"),
        spend: Math.round(spend),
        revenue: Math.round(revenue),
        net: Math.round(revenue - spend),
        roas: spend > 0 ? Math.round(((revenue - spend) / spend) * 100) : 0,
      });
    }
    return weeks;
  }, [campaigns, inflowwStats]);

  // Spend by platform
  const platformData = useMemo(() => {
    const map = new Map<string, { spend: number; revenue: number; count: number }>();
    for (const c of campaigns) {
      const existing = map.get(c.platform) ?? { spend: 0, revenue: 0, count: 0 };
      map.set(c.platform, {
        spend: existing.spend + c.amount_spent,
        revenue: existing.revenue + effectiveRevenue(c, inflowwStats),
        count: existing.count + 1,
      });
    }
    return Array.from(map.entries())
      .map(([platform, s]) => ({
        platform: platformLabel(platform),
        spend: Math.round(s.spend),
        revenue: Math.round(s.revenue),
        net: Math.round(s.revenue - s.spend),
        count: s.count,
        roas: s.spend > 0 ? Math.round(((s.revenue - s.spend) / s.spend) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [campaigns, inflowwStats]);

  // Top campaigns by ROAS (with at least $50 spend so we don't get noise)
  const topCampaigns = useMemo(() => {
    return [...campaigns]
      .filter((c) => c.amount_spent >= 50)
      .map((c) => ({
        c,
        rev: effectiveRevenue(c, inflowwStats),
        roas: roiPct(c.amount_spent, effectiveRevenue(c, inflowwStats)) ?? 0,
      }))
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 10);
  }, [campaigns, inflowwStats]);

  const creatorName = (id: string) => creators.find((c) => c.id === id)?.name ?? "—";

  // Insights
  const insights = useMemo(() => {
    const out: string[] = [];
    if (platformData.length >= 2) {
      const best = platformData[0];
      const worst = platformData[platformData.length - 1];
      if (best.spend > 0 && worst.spend > 0) {
        const bestRoas = best.spend > 0 ? ((best.revenue - best.spend) / best.spend) * 100 : 0;
        const worstRoas = worst.spend > 0 ? ((worst.revenue - worst.spend) / worst.spend) * 100 : 0;
        if (bestRoas > worstRoas + 50) {
          out.push(`${best.platform} ROAS (${bestRoas.toFixed(0)}%) beats ${worst.platform} (${worstRoas.toFixed(0)}%) — consider shifting budget from ${worst.platform} to ${best.platform}.`);
        }
      }
    }
    const recent4 = weeklyData.slice(-4).reduce((s, w) => s + w.spend, 0);
    const previous8 = weeklyData.slice(0, 8).reduce((s, w) => s + w.spend, 0);
    if (previous8 > 0 && recent4 > previous8 * 0.6) {
      out.push(`Spend in the last 4 weeks ($${fmt$0(recent4).slice(1)}) is high relative to prior 8 weeks — make sure ROAS is keeping pace.`);
    }
    const totalSpend = campaigns.reduce((s, c) => s + c.amount_spent, 0);
    const totalRev = campaigns.reduce((s, c) => s + effectiveRevenue(c, inflowwStats), 0);
    const overallRoas = totalSpend > 0 ? ((totalRev - totalSpend) / totalSpend) * 100 : 0;
    if (overallRoas < 0 && totalSpend > 100) {
      out.push(`Overall portfolio is losing money (${overallRoas.toFixed(0)}% ROAS). Audit campaigns spending >$50 with negative ROAS and pause the worst.`);
    } else if (overallRoas > 100) {
      out.push(`Portfolio ROAS is ${overallRoas.toFixed(0)}% — strong. Consider scaling top platforms.`);
    }
    const losers = campaigns.filter((c) => c.amount_spent >= 50 && effectiveRevenue(c, inflowwStats) < c.amount_spent && c.status === "active");
    if (losers.length > 0) {
      out.push(`${losers.length} active campaign${losers.length === 1 ? " is" : "s are"} unprofitable with ≥$50 spend — review on the Campaigns tab.`);
    }
    return out;
  }, [platformData, weeklyData, campaigns, inflowwStats]);

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
        Add campaigns first to see analytics.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {insights.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-2 text-primary">Insights</div>
          <ul className="space-y-1.5 text-sm">
            {insights.map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary mt-1.5 h-1 w-1 rounded-full bg-primary shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Weekly spend" sub="$ spent per week, last 12 weeks">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(v: number) => [fmt$0(v), "Spend"]}
              />
              <Bar dataKey="spend" fill={META_BLUE} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Weekly revenue" sub="Infloww-attributed where set, manual otherwise">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(v: number) => [fmt$0(v), "Revenue"]}
              />
              <Bar dataKey="revenue" fill="#10B981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Weekly net (revenue – spend)" sub="positive = profit, negative = loss">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(v: number) => [fmt$0(v), "Net"]}
              />
              <Bar dataKey="net" radius={[3, 3, 0, 0]}>
                {weeklyData.map((d, i) => (
                  <Cell key={i} fill={d.net >= 0 ? "#10B981" : "#EF4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Spend by platform" sub="total $ across all campaigns">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={platformData} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="platform" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={80} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(v: number) => [fmt$0(v), "Spend"]}
              />
              <Bar dataKey="spend" fill={META_BLUE} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Platform performance</h3>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Platform</th>
                <th className="text-right font-medium px-4 py-3">Campaigns</th>
                <th className="text-right font-medium px-4 py-3">Spend</th>
                <th className="text-right font-medium px-4 py-3">Revenue</th>
                <th className="text-right font-medium px-4 py-3">Net</th>
                <th className="text-center font-medium px-4 py-3">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {platformData.map((p) => (
                <tr key={p.platform} className="border-t border-border bg-card">
                  <td className="px-4 py-3 capitalize font-medium">{p.platform}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{p.count}</td>
                  <td className="px-4 py-3 text-right">{fmt$(p.spend)}</td>
                  <td className="px-4 py-3 text-right">{fmt$(p.revenue)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${p.net >= 0 ? "text-success" : "text-destructive"}`}>
                    {p.net >= 0 ? "+" : ""}{fmt$(p.net)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <RoasBadge spent={p.spend} revenue={p.revenue} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {topCampaigns.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">
            Top campaigns by ROAS <span className="text-muted-foreground font-normal text-xs">(min $50 spend)</span>
          </h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Campaign</th>
                  <th className="text-left font-medium px-4 py-3">Creator</th>
                  <th className="text-left font-medium px-4 py-3">Platform</th>
                  <th className="text-right font-medium px-4 py-3">Spend</th>
                  <th className="text-right font-medium px-4 py-3">Revenue</th>
                  <th className="text-center font-medium px-4 py-3">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {topCampaigns.map(({ c, rev }) => (
                  <tr key={c.id} className="border-t border-border bg-card">
                    <td className="px-4 py-3">{c.name ?? <span className="italic text-muted-foreground">(unnamed)</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{creatorName(c.creator_id)}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{platformLabel(c.platform)}</td>
                    <td className="px-4 py-3 text-right">{fmt$(c.amount_spent)}</td>
                    <td className="px-4 py-3 text-right">{fmt$(rev)}</td>
                    <td className="px-4 py-3 text-center">
                      <RoasBadge spent={c.amount_spent} revenue={rev} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title, sub, children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      {children}
    </div>
  );
}
