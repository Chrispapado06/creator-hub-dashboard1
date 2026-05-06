import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, Users, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format, eachDayOfInterval, parseISO, startOfDay } from "date-fns";

export const Route = createFileRoute("/revenue")({
  head: () => ({
    meta: [{ title: "Revenue — Agency Console" }],
  }),
  component: RevenuePage,
});

// ── Types ────────────────────────────────────────────────────────────────────

type Creator = { id: string; name: string };
type RedditAccount = { id: string; creator_id: string; username: string };
type TrackingLink = { id: string; reddit_account_id: string; label: string; url: string };
type RevenueEntry = {
  id: string; creator_id: string; reddit_account_id: string | null;
  tracking_link_id: string | null; amount: number; currency: string;
  entry_date: string; source: string; notes: string | null;
};
type OrganicEntry = { creator_id: string; amount: number; entry_date: string };
type InternalEntry = { creator_id: string; amount: number; entry_date: string };
type AdCampaign = { creator_id: string; amount_spent: number; revenue_generated: number; start_date: string };
type PostStat = { reddit_account_id: string; upvotes: number; posted_at: string };
type InflowwStat = {
  id: string;
  creator_id: string;
  reddit_account_id: string | null;
  campaign_code: number;
  campaign_url: string | null;
  clicks_count: number;
  subscribers_count: number;
  revenue_total: number;
  spenders_count: number;
  synced_at: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const sourceLabel: Record<string, string> = {
  new_sub: "New Sub", renewal: "Renewal", tip: "Tip", ppv: "PPV", other: "Other",
};

const sourceStyles: Record<string, string> = {
  new_sub: "bg-success/15 text-success border-success/30",
  renewal: "bg-primary/15 text-primary border-primary/30",
  tip: "bg-warning/15 text-warning border-warning/30",
  ppv: "bg-accent text-accent-foreground border-border",
  other: "bg-muted text-muted-foreground border-border",
};

const emptyForm = {
  creator_id: "", reddit_account_id: "", tracking_link_id: "",
  amount: "", source: "new_sub",
  entry_date: new Date().toISOString().slice(0, 10),
  notes: "",
};

const STAT_OPTIONS = [
  { value: "total_revenue", label: "Total Revenue", color: "oklch(0.72 0.18 30)" },
  { value: "reddit_rev",    label: "Reddit Revenue", color: "oklch(0.72 0.18 30)" },
  { value: "organic_rev",   label: "Organic Revenue", color: "oklch(0.7 0.16 155)" },
  { value: "internal_rev",  label: "Internal Revenue", color: "oklch(0.78 0.16 75)" },
  { value: "ads_net",       label: "Ads Net (Rev − Spend)", color: "oklch(0.7 0.18 250)" },
  { value: "posts",         label: "Posts Count", color: "oklch(0.72 0.18 30)" },
  { value: "upvotes",       label: "Total Upvotes", color: "oklch(0.7 0.16 155)" },
];

const RANGE_OPTIONS = [
  { value: "7d",     label: "Last 7 days" },
  { value: "30d",    label: "Last 30 days" },
  { value: "90d",    label: "Last 90 days" },
  { value: "365d",   label: "Last year" },
  { value: "custom", label: "Custom" },
];

// ── Main component ────────────────────────────────────────────────────────────

function RevenuePage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [accounts, setAccounts] = useState<RedditAccount[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [organicEntries, setOrganicEntries] = useState<OrganicEntry[]>([]);
  const [internalEntries, setInternalEntries] = useState<InternalEntry[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaign[]>([]);
  const [allPosts, setAllPosts] = useState<PostStat[]>([]);
  const [inflowwStats, setInflowwStats] = useState<InflowwStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [filterCreator, setFilterCreator] = useState("all");
  const [filterSource, setFilterSource] = useState("all");

  // Chart controls
  const [chartStat, setChartStat] = useState("total_revenue");
  const [chartRange, setChartRange] = useState("30d");
  const [chartFrom, setChartFrom] = useState("");
  const [chartTo, setChartTo] = useState("");
  const [chartCreator, setChartCreator] = useState("all");

  const load = async () => {
    setLoading(true);
    const since1y = new Date(Date.now() - 366 * 24 * 3600_000).toISOString().slice(0, 10);

    const [{ data: cs }, { data: ras }, { data: tls }, { data: rev },
           { data: org }, { data: int_ }, { data: ads }, { data: ifw }] = await Promise.all([
      supabase.from("creators").select("id, name").order("name"),
      supabase.from("reddit_accounts").select("id, creator_id, username"),
      supabase.from("tracking_links").select("id, reddit_account_id, label, url"),
      supabase.from("revenue_entries").select("*").neq("source", "infloww").order("entry_date", { ascending: false }),
      supabase.from("organic_entries").select("creator_id, amount, entry_date").gte("entry_date", since1y),
      supabase.from("internal_entries").select("creator_id, amount, entry_date").gte("entry_date", since1y),
      supabase.from("ad_campaigns").select("creator_id, amount_spent, revenue_generated, start_date").gte("start_date", since1y),
      supabase.from("infloww_tracking_stats").select("*").order("revenue_total", { ascending: false }),
    ]);

    const raIds = (ras ?? []).map((r) => r.id);
    const { data: ps } = raIds.length
      ? await supabase.from("posts")
          .select("reddit_account_id, upvotes, posted_at")
          .in("reddit_account_id", raIds)
          .gte("posted_at", new Date(Date.now() - 366 * 24 * 3600_000).toISOString())
      : { data: [] as PostStat[] };

    setCreators(cs ?? []);
    setAccounts(ras ?? []);
    setTrackingLinks(tls ?? []);
    setEntries((rev ?? []) as RevenueEntry[]);
    setOrganicEntries((org ?? []) as OrganicEntry[]);
    setInternalEntries((int_ ?? []) as InternalEntry[]);
    setAdCampaigns((ads ?? []) as AdCampaign[]);
    setAllPosts((ps ?? []) as PostStat[]);
    setInflowwStats((ifw ?? []) as InflowwStat[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const accountsForCreator = useMemo(
    () => accounts.filter((a) => a.creator_id === form.creator_id),
    [accounts, form.creator_id],
  );

  const linksForAccount = useMemo(
    () => trackingLinks.filter((l) => l.reddit_account_id === form.reddit_account_id),
    [trackingLinks, form.reddit_account_id],
  );

  const raToCreator = useMemo(() => new Map(accounts.map((a) => [a.id, a.creator_id])), [accounts]);

  const onAdd = async () => {
    if (!form.creator_id) return toast.error("Select a creator");
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return toast.error("Enter a valid amount");
    const { error } = await supabase.from("revenue_entries").insert({
      creator_id: form.creator_id,
      reddit_account_id: form.reddit_account_id || null,
      tracking_link_id: form.tracking_link_id || null,
      amount,
      source: form.source,
      entry_date: form.entry_date,
      notes: form.notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Entry added");
    setForm(emptyForm);
    setOpen(false);
    load();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("revenue_entries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Entry deleted");
    load();
  };

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterCreator !== "all" && e.creator_id !== filterCreator) return false;
      if (filterSource !== "all" && e.source !== filterSource) return false;
      return true;
    });
  }, [entries, filterCreator, filterSource]);

  const totalRevenue = filtered.reduce((s, e) => s + e.amount, 0);

  const byAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) {
      const key = e.reddit_account_id ?? "__none__";
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filtered]);

  // ── Chart data ───────────────────────────────────────────────────────────

  const chartDateRange = useMemo(() => {
    if (chartRange === "custom") {
      if (!chartFrom || !chartTo) {
        const to = new Date();
        const from = new Date(Date.now() - 30 * 24 * 3600_000);
        return { from, to };
      }
      return { from: new Date(chartFrom), to: new Date(chartTo) };
    }
    const days = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[chartRange] ?? 30;
    return { from: new Date(Date.now() - days * 24 * 3600_000), to: new Date() };
  }, [chartRange, chartFrom, chartTo]);

  const chartData = useMemo(() => {
    const { from, to } = chartDateRange;
    const days = eachDayOfInterval({ start: startOfDay(from), end: startOfDay(to) });
    const valueMap: Record<string, number> = {};
    for (const d of days) valueMap[d.toISOString().slice(0, 10)] = 0;

    const matchCreator = (cid: string) => chartCreator === "all" || cid === chartCreator;
    const matchCreatorByRa = (raId: string) => {
      const cid = raToCreator.get(raId);
      return cid ? matchCreator(cid) : false;
    };

    if (chartStat === "reddit_rev" || chartStat === "total_revenue") {
      for (const e of entries) {
        if (!matchCreator(e.creator_id)) continue;
        if (valueMap[e.entry_date] !== undefined) valueMap[e.entry_date] += e.amount;
      }
    }
    if (chartStat === "organic_rev" || chartStat === "total_revenue") {
      for (const e of organicEntries) {
        if (!matchCreator(e.creator_id)) continue;
        if (valueMap[e.entry_date] !== undefined) valueMap[e.entry_date] += e.amount;
      }
    }
    if (chartStat === "internal_rev" || chartStat === "total_revenue") {
      for (const e of internalEntries) {
        if (!matchCreator(e.creator_id)) continue;
        if (valueMap[e.entry_date] !== undefined) valueMap[e.entry_date] += e.amount;
      }
    }
    if (chartStat === "ads_net" || chartStat === "total_revenue") {
      for (const c of adCampaigns) {
        if (!matchCreator(c.creator_id)) continue;
        if (valueMap[c.start_date] !== undefined) valueMap[c.start_date] += (c.revenue_generated - c.amount_spent);
      }
    }
    if (chartStat === "posts") {
      for (const p of allPosts) {
        if (!matchCreatorByRa(p.reddit_account_id)) continue;
        const day = p.posted_at.slice(0, 10);
        if (valueMap[day] !== undefined) valueMap[day] += 1;
      }
    }
    if (chartStat === "upvotes") {
      for (const p of allPosts) {
        if (!matchCreatorByRa(p.reddit_account_id)) continue;
        const day = p.posted_at.slice(0, 10);
        if (valueMap[day] !== undefined) valueMap[day] += p.upvotes;
      }
    }

    return days.map((d) => {
      const key = d.toISOString().slice(0, 10);
      return { date: key, value: valueMap[key] ?? 0 };
    });
  }, [chartStat, chartDateRange, chartCreator, entries, organicEntries, internalEntries, adCampaigns, allPosts, raToCreator]);

  const statOption = STAT_OPTIONS.find((s) => s.value === chartStat) ?? STAT_OPTIONS[0];
  const chartTotal = chartData.reduce((s, d) => s + d.value, 0);
  const chartAvg = chartData.length > 0 ? chartTotal / chartData.length : 0;
  const chartPeak = Math.max(...chartData.map((d) => d.value), 0);
  const isMonetary = !["posts", "upvotes"].includes(chartStat);

  const fmt = (n: number) =>
    isMonetary
      ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : n.toLocaleString();

  const creatorName = (id: string) => creators.find((c) => c.id === id)?.name ?? "—";
  const accountName = (id: string | null) =>
    id ? (accounts.find((a) => a.id === id)?.username ?? "—") : "—";
  const linkLabel = (id: string | null) =>
    id ? (trackingLinks.find((l) => l.id === id)?.label ?? "—") : "—";

  return (
    <div className="space-y-8">
      <Toaster />

      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Revenue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track revenue across all channels and monitor performance over time.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 shadow-[0_0_20px_oklch(0.72_0.18_30/0.3)]">
              <Plus className="mr-1.5 h-4 w-4" />
              Add Reddit entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add revenue entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount (USD)</Label>
                  <Input type="number" min="0" step="0.01" placeholder="49.99"
                    value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={form.entry_date}
                    onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(sourceLabel).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Creator</Label>
                <Select value={form.creator_id}
                  onValueChange={(v) => setForm({ ...form, creator_id: v, reddit_account_id: "", tracking_link_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select creator" /></SelectTrigger>
                  <SelectContent>
                    {creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reddit account <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={form.reddit_account_id}
                  onValueChange={(v) => setForm({ ...form, reddit_account_id: v, tracking_link_id: "" })}
                  disabled={!form.creator_id}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accountsForCreator.map((a) => <SelectItem key={a.id} value={a.id}>u/{a.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tracking link <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={form.tracking_link_id}
                  onValueChange={(v) => setForm({ ...form, tracking_link_id: v })}
                  disabled={!form.reddit_account_id}>
                  <SelectTrigger><SelectValue placeholder="Select link" /></SelectTrigger>
                  <SelectContent>
                    {linksForAccount.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Input placeholder="e.g. from r/gonewild push" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onAdd}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Infloww (all-time totals from API) ──────────────────────────────── */}
      {inflowwStats.length > 0 && (() => {
        const inflowwByCreator = creators.map((c) => {
          // Only show tracking links assigned to a Reddit account
          const stats = inflowwStats.filter(
            (s) => s.creator_id === c.id && s.reddit_account_id !== null,
          );
          if (stats.length === 0) return null;
          const totalRev = stats.reduce((s, r) => s + r.revenue_total, 0);
          const totalClicks = stats.reduce((s, r) => s + r.clicks_count, 0);
          const totalSubs = stats.reduce((s, r) => s + r.subscribers_count, 0);
          const lastSync = stats.reduce((latest, r) => r.synced_at > latest ? r.synced_at : latest, stats[0].synced_at);
          return { creator: c, stats, totalRev, totalClicks, totalSubs, lastSync };
        }).filter(Boolean) as { creator: Creator; stats: InflowwStat[]; totalRev: number; totalClicks: number; totalSubs: number; lastSync: string }[];

        const grandTotal = inflowwByCreator.reduce((s, r) => s + r.totalRev, 0);

        return (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Infloww — All-time totals</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cumulative revenue from tracking links. Synced per creator from Infloww.
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">
                  ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-muted-foreground">grand total</div>
              </div>
            </div>
            <div className="space-y-3">
              {inflowwByCreator.map(({ creator, stats, totalRev, totalClicks, totalSubs, lastSync }) => (
                <div key={creator.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Link to="/creators/$creatorId" params={{ creatorId: creator.id }}
                      className="font-medium hover:text-primary transition-colors">
                      {creator.name}
                    </Link>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">{totalClicks.toLocaleString()} clicks</span>
                      <span className="text-muted-foreground">{totalSubs.toLocaleString()} subs</span>
                      <span className="font-bold text-primary">
                        ${totalRev.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {stats.map((s) => {
                      const acct = accounts.find((a) => a.id === s.reddit_account_id);
                      return (
                        <div key={s.id} className="rounded-lg bg-secondary/40 px-3 py-2 text-xs">
                          <div className="font-medium text-muted-foreground truncate mb-1">
                            {acct ? `u/${acct.username}` : `c${s.campaign_code}`}
                          </div>
                          <div className="font-bold text-sm">
                            ${s.revenue_total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-muted-foreground mt-0.5">
                            {s.clicks_count} clicks · {s.subscribers_count} subs
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    Last synced {format(new Date(lastSync), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Performance Chart ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-[image:var(--gradient-surface)] p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <h2 className="text-base font-semibold">Performance</h2>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2">
          {/* Stat pills */}
          <div className="flex flex-wrap gap-1.5">
            {STAT_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => setChartStat(s.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  chartStat === s.value
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {/* Creator filter */}
            <Select value={chartCreator} onValueChange={setChartCreator}>
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="All creators" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All creators</SelectItem>
                {creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Range presets */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {RANGE_OPTIONS.filter((r) => r.value !== "custom").map((r) => (
                <button
                  key={r.value}
                  onClick={() => setChartRange(r.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-0 ${
                    chartRange === r.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {r.value}
                </button>
              ))}
              <button
                onClick={() => setChartRange("custom")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  chartRange === "custom"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                Custom
              </button>
            </div>
          </div>
        </div>

        {/* Custom date pickers */}
        {chartRange === "custom" && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">From</Label>
              <Input type="date" className="h-8 text-xs w-36"
                value={chartFrom} onChange={(e) => setChartFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">To</Label>
              <Input type="date" className="h-8 text-xs w-36"
                value={chartTo} onChange={(e) => setChartTo(e.target.value)} />
            </div>
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-xl font-bold mt-0.5">{fmt(chartTotal)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Daily avg</div>
            <div className="text-xl font-bold mt-0.5">{fmt(chartAvg)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Peak day</div>
            <div className="text-xl font-bold mt-0.5">{fmt(chartPeak)}</div>
          </div>
        </div>

        {/* Chart */}
        {loading ? (
          <div className="h-48 animate-pulse rounded-xl bg-card/60" />
        ) : (
          <PerformanceLineChart
            data={chartData}
            color={statOption.color}
            isMonetary={isMonetary}
          />
        )}
      </div>

      {/* ── Existing Reddit revenue table ────────────────────────────────────── */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <DollarSign className="h-4 w-4 text-primary" />
            Manual revenue (filtered)
          </div>
          <div className="mt-2 text-2xl font-bold">
            ${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-primary" />
            Entries (filtered)
          </div>
          <div className="mt-2 text-2xl font-bold">{filtered.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-4 w-4 text-primary" />
            Top account
          </div>
          <div className="mt-2 text-lg font-bold truncate">
            {byAccount.length > 0
              ? byAccount[0][0] === "__none__" ? "Unattributed" : `u/${accountName(byAccount[0][0])}`
              : "—"}
          </div>
          {byAccount.length > 0 && (
            <div className="text-xs text-muted-foreground">
              ${byAccount[0][1].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
        </div>
      </div>

      {byAccount.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-semibold mb-3">Reddit revenue by account</div>
          <div className="space-y-2">
            {byAccount.map(([id, total]) => {
              const pct = totalRevenue > 0 ? (total / totalRevenue) * 100 : 0;
              return (
                <div key={id} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-muted-foreground truncate">
                    {id === "__none__" ? "Unattributed" : `u/${accountName(id)}`}
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-20 text-right text-xs font-medium">
                    ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Select value={filterCreator} onValueChange={setFilterCreator}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Creator" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All creators</SelectItem>
            {creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {Object.entries(sourceLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">No revenue entries yet. Add your first one.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Date</th>
                <th className="text-left font-medium px-4 py-3">Creator</th>
                <th className="text-left font-medium px-4 py-3">Account</th>
                <th className="text-left font-medium px-4 py-3">Link</th>
                <th className="text-left font-medium px-4 py-3">Source</th>
                <th className="text-right font-medium px-4 py-3">Amount</th>
                <th className="text-left font-medium px-4 py-3">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-border bg-card hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {format(new Date(e.entry_date), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <Link to="/creators/$creatorId" params={{ creatorId: e.creator_id }}
                      className="hover:text-primary transition-colors">
                      {creatorName(e.creator_id)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {e.reddit_account_id ? `u/${accountName(e.reddit_account_id)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[140px] truncate">
                    {e.tracking_link_id ? linkLabel(e.tracking_link_id) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${sourceStyles[e.source] ?? sourceStyles.other}`}>
                      {sourceLabel[e.source] ?? e.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    ${e.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">
                    {e.notes ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete entry?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the ${e.amount} entry. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(e.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Performance Line Chart ────────────────────────────────────────────────────

type ChartPoint = { date: string; value: number };

function PerformanceLineChart({
  data,
  color,
  isMonetary,
}: {
  data: ChartPoint[];
  color: string;
  isMonetary: boolean;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: ChartPoint } | null>(null);

  const W = 800, H = 220, pL = 60, pR = 16, pT = 12, pB = 32;
  const plotW = W - pL - pR;
  const plotH = H - pT - pB;

  const values = data.map((d) => d.value);
  const maxV = Math.max(...values, 0.01);

  const toX = (i: number) =>
    data.length < 2 ? pL + plotW / 2 : pL + (i / (data.length - 1)) * plotW;
  const toY = (v: number) => pT + plotH - (v / maxV) * plotH;

  const points = data.map((d, i) => ({ ...d, x: toX(i), y: toY(d.value) }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaD = points.length > 0
    ? `${pathD} L${points[points.length - 1].x.toFixed(1)},${(pT + plotH).toFixed(1)} L${points[0].x.toFixed(1)},${(pT + plotH).toFixed(1)} Z`
    : "";

  // Y-axis gridlines (5 levels)
  const ySteps = 4;
  const yGridLines = Array.from({ length: ySteps + 1 }, (_, i) => {
    const v = (i / ySteps) * maxV;
    const y = toY(v);
    const label = isMonetary
      ? v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`
      : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
    return { v, y, label };
  });

  // X-axis labels — show ~6 evenly spaced
  const xLabelCount = Math.min(data.length, 6);
  const xLabelStep = data.length > 1 ? Math.floor((data.length - 1) / (xLabelCount - 1)) : 1;
  const xLabels = data
    .filter((_, i) => i === 0 || i === data.length - 1 || (xLabelStep > 0 && i % xLabelStep === 0))
    .map((d, _, arr) => {
      const idx = data.indexOf(d);
      return { idx, label: format(parseISO(d.date), data.length > 60 ? "MMM d" : "MMM d") };
    });

  // Dot density: skip dots when many points
  const showDot = (i: number) => data.length <= 30 || i % Math.ceil(data.length / 20) === 0;

  const hasData = values.some((v) => v > 0);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
        <p className="text-sm text-muted-foreground">No data for this period.</p>
      </div>
    );
  }

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        style={{ height: "220px" }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Gridlines + Y labels */}
        {yGridLines.map(({ y, label }, i) => (
          <g key={i}>
            <line
              x1={pL} y1={y} x2={W - pR} y2={y}
              stroke="currentColor" strokeOpacity={0.07} strokeWidth={1}
            />
            <text
              x={pL - 6} y={y + 4}
              textAnchor="end" fontSize={10}
              fill="currentColor" fillOpacity={0.45}
            >
              {label}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xLabels.map(({ idx, label }) => (
          <text
            key={idx}
            x={toX(idx)} y={H - 6}
            textAnchor="middle" fontSize={10}
            fill="currentColor" fillOpacity={0.45}
          >
            {label}
          </text>
        ))}

        {hasData && (
          <>
            {/* Area fill */}
            <path d={areaD} fill={color} fillOpacity={0.08} />
            {/* Line */}
            <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {/* Dots */}
            {points.map((p, i) =>
              showDot(i) ? (
                <circle
                  key={i}
                  cx={p.x} cy={p.y} r={3}
                  fill={color} fillOpacity={0.9}
                  stroke="var(--background)" strokeWidth={1.5}
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setTooltip({ x: p.x, y: p.y, point: p })}
                />
              ) : null,
            )}
            {/* Invisible hover targets */}
            {points.map((p, i) => (
              <rect
                key={`ht-${i}`}
                x={p.x - (plotW / data.length / 2)}
                y={pT}
                width={plotW / data.length}
                height={plotH}
                fill="transparent"
                style={{ cursor: "crosshair" }}
                onMouseEnter={() => setTooltip({ x: p.x, y: p.y, point: p })}
              />
            ))}
          </>
        )}

        {/* No-data label */}
        {!hasData && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="currentColor" fillOpacity={0.3}>
            No data in this range
          </text>
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-3 py-2 shadow-lg text-xs"
          style={{
            left: `${(tooltip.x / W) * 100}%`,
            top: `${(tooltip.y / H) * 100}%`,
            transform: tooltip.x > W * 0.7 ? "translate(-110%, -50%)" : "translate(10%, -50%)",
          }}
        >
          <div className="font-semibold text-foreground">
            {format(parseISO(tooltip.point.date), "EEE, MMM d, yyyy")}
          </div>
          <div className="mt-0.5" style={{ color }}>
            {isMonetary
              ? `$${tooltip.point.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : tooltip.point.value.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
