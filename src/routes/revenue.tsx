import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, Users, Plus, Trash2, RefreshCw, Wallet, Megaphone, Layers, Link2 } from "lucide-react";
import { SiOnlyfans } from "react-icons/si";
import { OfDataInspector } from "@/components/OfDataInspector";
import { runSyncJob } from "@/lib/sync";
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
// OF lifetime totals (one row per creator, upserted by the OF sync)
type OfCreatorStat = {
  creator_id: string;
  total_earnings: number;
  earnings_subs: number;
  earnings_tips: number;
  earnings_ppv: number;
  earnings_messages: number;
  earnings_streams: number;
  earnings_referrals: number;
  synced_at: string;
};
// One row per creator per day from /earnings.daily
type OfDailyEarning = {
  creator_id: string;
  entry_date: string;
  total: number;
};
// OF native tracking-link campaigns (synced from /tracking-links)
type OfTrackingLink = {
  id: string;
  creator_id: string;
  campaign_code: number;
  campaign_url: string | null;
  name: string | null;
  clicks_count: number;
  subscribers_count: number;
  spenders_count: number;
  revenue_total: number;
  revenue_per_subscriber: number;
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

// Revenue is grouped into three rollup buckets:
//   • Organic = social posts (Reddit, IG, FB, X, TikTok) — from organic_revenue_entries
//   • Internal = internal tracking links — from internal_revenue_entries
//   • Ads = Meta ad campaigns + OnlyFinder paid traffic (revenue_entries from Infloww sync)
const STAT_OPTIONS = [
  { value: "total_revenue", label: "Total Revenue", color: "oklch(0.72 0.18 30)" },
  { value: "organic_rev",   label: "Organic (Reddit / IG / FB / X / TikTok)", color: "oklch(0.7 0.16 155)" },
  { value: "internal_rev",  label: "Internal (tracking links)", color: "oklch(0.78 0.16 75)" },
  { value: "ads_revenue",   label: "Ads Revenue (Meta + OnlyFinder)", color: "oklch(0.7 0.18 250)" },
  { value: "ads_net",       label: "Ads Net (Rev − Spend)", color: "oklch(0.6 0.18 250)" },
  { value: "of_direct",     label: "OnlyFans Direct (subs + tips + PPV + msgs)", color: "oklch(0.65 0.2 240)" },
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
  const [ofStats, setOfStats] = useState<OfCreatorStat[]>([]);
  const [ofDaily, setOfDaily] = useState<OfDailyEarning[]>([]);
  const [ofTracking, setOfTracking] = useState<OfTrackingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [filterCreator, setFilterCreator] = useState("all");
  const [filterSource, setFilterSource] = useState("all");

  // ── Page-level date range ──────────────────────────────────────────
  // Drives the OnlyFans Direct numbers in the hero / breakdown table /
  // chart. Defaults to the last 30 days. "lifetime" maps to a 2018→now
  // window which is far enough back to cover every realistic creator.
  type RangePreset = "7d" | "30d" | "90d" | "365d" | "lifetime" | "custom";
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const dateRange = useMemo<{ from: Date; to: Date; startStr: string; endStr: string; label: string }>(() => {
    const today = new Date();
    if (rangePreset === "lifetime") {
      const from = new Date("2018-01-01");
      return { from, to: today, startStr: "2018-01-01", endStr: today.toISOString().slice(0, 10), label: "Lifetime" };
    }
    if (rangePreset === "custom") {
      const from = customFrom ? new Date(customFrom) : new Date(Date.now() - 30 * 86400_000);
      const to = customTo ? new Date(customTo) : today;
      return {
        from, to,
        startStr: from.toISOString().slice(0, 10),
        endStr: to.toISOString().slice(0, 10),
        label: `${from.toISOString().slice(0,10)} – ${to.toISOString().slice(0,10)}`,
      };
    }
    const days = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[rangePreset];
    const from = new Date(Date.now() - days * 86400_000);
    return {
      from, to: today,
      startStr: from.toISOString().slice(0, 10),
      endStr: today.toISOString().slice(0, 10),
      label: `Last ${days} days`,
    };
  }, [rangePreset, customFrom, customTo]);

  // Per-creator OF earnings for the active range, fetched live from
  // OnlyFansAPI when the range changes. Keyed by creator_id.
  const [rangeOfEarnings, setRangeOfEarnings] = useState<Record<string, {
    total: number; subs: number; tips: number; ppv: number; messages: number; streams: number;
  }>>({});
  const [loadingRangeOf, setLoadingRangeOf] = useState(false);

  // Chart controls (separate from page-level range — but defaults to it)
  const [chartStat, setChartStat] = useState("total_revenue");
  const [chartRange, setChartRange] = useState("30d");
  const [chartFrom, setChartFrom] = useState("");
  const [chartTo, setChartTo] = useState("");
  const [chartCreator, setChartCreator] = useState("all");

  const load = async () => {
    setLoading(true);
    const since1y = new Date(Date.now() - 366 * 24 * 3600_000).toISOString().slice(0, 10);

    const [{ data: cs }, { data: ras }, { data: tls }, { data: rev },
           { data: org }, { data: int_ }, { data: ads }, { data: ifw },
           { data: ofs }, { data: ofd }, { data: oft }] = await Promise.all([
      supabase.from("creators").select("id, name").order("name"),
      supabase.from("reddit_accounts").select("id, creator_id, username"),
      supabase.from("tracking_links").select("id, reddit_account_id, label, url"),
      supabase.from("revenue_entries").select("*").neq("source", "infloww").order("entry_date", { ascending: false }),
      supabase.from("organic_entries").select("creator_id, amount, entry_date").gte("entry_date", since1y),
      supabase.from("internal_entries").select("creator_id, amount, entry_date").gte("entry_date", since1y),
      supabase.from("ad_campaigns").select("creator_id, amount_spent, revenue_generated, start_date").gte("start_date", since1y),
      supabase.from("infloww_tracking_stats").select("*").order("revenue_total", { ascending: false }),
      // OF lifetime totals (one row per creator)
      supabase.from("of_creator_stats").select("*"),
      // OF daily earnings — feeds the chart "OnlyFans Direct" series
      supabase.from("of_earnings_daily").select("creator_id, entry_date, total").gte("entry_date", since1y),
      // OF native tracking-link campaigns
      supabase.from("of_tracking_links").select("*").order("revenue_total", { ascending: false }),
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
    setOfStats((ofs ?? []) as OfCreatorStat[]);
    setOfDaily((ofd ?? []) as OfDailyEarning[]);
    setOfTracking((oft ?? []) as OfTrackingLink[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Fetch OF earnings for the chosen date range whenever it changes
  // (or after a fresh creator list loads). Lazy-imports the helper so
  // /revenue stays light on first paint.
  useEffect(() => {
    if (creators.length === 0) return;
    let cancelled = false;
    setLoadingRangeOf(true);
    void (async () => {
      const { fetchOfEarningsPerCreator } = await import("@/lib/of-sync");
      // We need each creator's onlyfansapi_acct_id to call analytics —
      // pull the full row from supabase since the load() above only
      // selects id+name.
      const { data: full } = await supabase
        .from("creators")
        .select("id, onlyfansapi_acct_id");
      if (cancelled) return;
      const map = await fetchOfEarningsPerCreator(
        (full ?? []) as Array<{ id: string; onlyfansapi_acct_id: string | null }>,
        dateRange.startStr,
        dateRange.endStr,
      );
      if (!cancelled) {
        setRangeOfEarnings(map);
        setLoadingRangeOf(false);
      }
    })();
    return () => { cancelled = true; };
  }, [creators.length, dateRange.startStr, dateRange.endStr]);

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

  // ── 3-bucket overview totals (across ALL data, not just the table filter) ──
  // Organic = organic_revenue_entries (Reddit / IG / FB / X / TikTok organic posts)
  // Internal = internal_revenue_entries (internal tracking links)
  // Ads = ad_campaigns.revenue_generated (Meta paid) + revenue_entries.amount (OnlyFinder/Infloww sync)
  // Auto-synced Meta API ad spend for the active page range — pulled
  // from meta_insights_daily so we stay consistent with the Financials
  // page rollup (and don't under-report when admins haven't entered a
  // manual ad_campaigns row but the Meta sync has been running).
  const [metaAutoSpend, setMetaAutoSpend] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("meta_insights_daily")
        .select("spend")
        .eq("level", "account")
        .eq("breakdown_key", "")
        .gte("date_start", dateRange.startStr)
        .lte("date_start", dateRange.endStr);
      if (!cancelled) {
        const total = (data ?? []).reduce((s, r) => s + Number((r as { spend?: number }).spend ?? 0), 0);
        setMetaAutoSpend(total);
      }
    })();
    return () => { cancelled = true; };
  }, [dateRange.startStr, dateRange.endStr]);

  const overview = useMemo(() => {
    const inflowwTotal = entries.reduce((s, e) => s + e.amount, 0);
    const metaAdsTotal = adCampaigns.reduce((s, c) => s + c.revenue_generated, 0);
    const manualAdsSpend = adCampaigns.reduce((s, c) => s + c.amount_spent, 0);
    // De-dupe manual Meta entries when auto-sync data exists for the
    // window — same rule as financials-rollup.ts. Other-platform manual
    // ad spend (e.g. OnlyFinder) still counts on top of the auto Meta.
    const manualNonMetaSpend = adCampaigns
      .filter((c) => {
        const p = String(((c as unknown) as { platform?: string }).platform ?? "other").toLowerCase();
        return !(p === "meta" || p === "facebook" || p === "instagram");
      })
      .reduce((s, c) => s + c.amount_spent, 0);
    const effectiveAdSpend = metaAutoSpend > 0
      ? metaAutoSpend + manualNonMetaSpend
      : manualAdsSpend;
    const adsTotal = inflowwTotal + metaAdsTotal;
    const adsNet = adsTotal - effectiveAdSpend;
    const organic = organicEntries.reduce((s, e) => s + e.amount, 0);
    const internal = internalEntries.reduce((s, e) => s + e.amount, 0);
    // OnlyFans direct = earnings in the active date range, fetched live
    // from /payouts/earnings-statistics. Per-creator fallback rule: if
    // the live call returned $0 for a creator BUT the synced lifetime
    // total is non-zero, use the lifetime number for that creator.
    // This handles transient API failures (rate limits, intermittent
    // 5xx) — the user never sees a creator's earnings disappear just
    // because the live fetch hiccupped on this page load.
    let ofDirect = 0;
    let ofSubs = 0;
    let ofTips = 0;
    let ofPpv = 0;
    let ofMsgs = 0;
    for (const c of creators) {
      const live = rangeOfEarnings[c.id];
      const lifetime = ofStats.find((s) => s.creator_id === c.id);
      const liveTotal = live?.total ?? 0;
      const lifetimeTotal = lifetime?.total_earnings ?? 0;
      // Trust the live number when it's non-zero. Otherwise fall back
      // to the lifetime sync (only meaningful when the active range
      // covers most of the creator's history).
      const useLive = liveTotal > 0 || lifetimeTotal === 0;
      if (useLive && live) {
        ofDirect += live.total;
        ofSubs += live.subs;
        ofTips += live.tips;
        ofPpv += live.ppv;
        ofMsgs += live.messages;
      } else if (lifetime) {
        ofDirect += lifetime.total_earnings ?? 0;
        ofSubs += lifetime.earnings_subs ?? 0;
        ofTips += lifetime.earnings_tips ?? 0;
        ofPpv += lifetime.earnings_ppv ?? 0;
        ofMsgs += lifetime.earnings_messages ?? 0;
      }
    }
    // OF tracking-link revenue (the campaigns shown on onlyfans.com →
    // Statistics → Tracking links). Treated as a sub-bucket of OnlyFans
    // direct rather than a separate "Ads" line because it's still
    // money OF attributes to the creator account.
    const ofTrackingTotal = ofTracking.reduce((s, r) => s + (r.revenue_total ?? 0), 0);
    return {
      organic,
      internal,
      ads: adsTotal,
      adsNet,
      adsSpend: effectiveAdSpend,
      meta: metaAdsTotal,
      infloww: inflowwTotal,
      ofDirect,
      ofSubs,
      ofTips,
      ofPpv,
      ofMsgs,
      ofTrackingTotal,
      // Grand total now includes OF earnings — without this, agencies
      // running OF as their primary channel saw $0 on the dashboard.
      total: organic + internal + adsNet + ofDirect,
    };
  }, [entries, organicEntries, internalEntries, adCampaigns, ofStats, ofTracking, rangeOfEarnings, metaAutoSpend]);

  const [syncingInfloww, setSyncingInfloww] = useState(false);
  const onSyncInfloww = async () => {
    setSyncingInfloww(true);
    try {
      const result = await runSyncJob("infloww_revenue");
      if (!result) {
        toast.info("Another tab is already syncing — try again in a moment");
      } else if (result.status === "ok") {
        toast.success(`Infloww sync · ${result.message}`);
        await load();
      } else if (result.status === "partial") {
        toast.warning(`Infloww sync · ${result.message}`);
        await load();
      } else {
        toast.error(`Infloww sync failed: ${result.message}`);
      }
    } finally {
      setSyncingInfloww(false);
    }
  };

  // ── OnlyFans sync (right here on the Revenue page) ─────────────────
  const [syncingOf, setSyncingOf] = useState(false);
  const onSyncOf = async () => {
    setSyncingOf(true);
    try {
      // Lazy-load to keep this route's bundle tight when nobody syncs.
      const { syncAllCreatorsOnlyFans } = await import("@/lib/of-sync");
      // Pull the full creator rows we need (sync function reads their
      // OF username + stored acct id).
      const { data: cs } = await supabase
        .from("creators")
        .select("id, name, of_username, onlyfansapi_acct_id");
      if (!cs || cs.length === 0) {
        toast.info("No creators found");
        return;
      }
      const result = await syncAllCreatorsOnlyFans(cs);
      if (result.succeeded === 0) {
        toast.error(
          `OF sync failed for all ${result.total} creator(s)` +
          (result.failures[0] ? ` · ${result.failures[0].error}` : ""),
        );
      } else if (result.failed > 0) {
        toast.warning(
          `OF sync · ${result.succeeded}/${result.total} succeeded · $${result.totalEarningsSynced.toLocaleString()} lifetime`,
        );
      } else {
        toast.success(
          `OF sync complete · ${result.succeeded} creator(s) · $${result.totalEarningsSynced.toLocaleString()} lifetime`,
        );
      }
      await load();
    } catch (e) {
      toast.error(`OF sync error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSyncingOf(false);
    }
  };

  // Last sync timestamp — newest synced_at across of_creator_stats
  const ofLastSync = useMemo(() => {
    if (ofStats.length === 0) return null;
    return ofStats.reduce((latest, r) => r.synced_at > latest ? r.synced_at : latest, ofStats[0].synced_at);
  }, [ofStats]);

  // ── Per-creator revenue rollup (driving the modern breakdown table) ──
  const creatorBreakdown = useMemo(() => {
    return creators.map((c) => {
      const ofRow = ofStats.find((s) => s.creator_id === c.id);
      const rangeRow = rangeOfEarnings[c.id];
      // Same fallback rule as the hero: prefer the live range number
      // when it's non-zero, fall back to lifetime when the live fetch
      // came back empty (transient API failure). Avoids the "I added
      // a creator and now Marissa shows $0" surprise.
      const liveTotal = rangeRow?.total ?? 0;
      const lifetimeTotal = ofRow?.total_earnings ?? 0;
      const ofRev = liveTotal > 0 ? liveTotal : lifetimeTotal;
      const ofTrackRev = ofTracking
        .filter((t) => t.creator_id === c.id)
        .reduce((s, t) => s + t.revenue_total, 0);
      const orgRev = organicEntries
        .filter((e) => e.creator_id === c.id)
        .reduce((s, e) => s + e.amount, 0);
      const intRev = internalEntries
        .filter((e) => e.creator_id === c.id)
        .reduce((s, e) => s + e.amount, 0);
      const adsRev = adCampaigns
        .filter((a) => a.creator_id === c.id)
        .reduce((s, a) => s + a.revenue_generated, 0);
      const adsSpend = adCampaigns
        .filter((a) => a.creator_id === c.id)
        .reduce((s, a) => s + a.amount_spent, 0);
      const inflowwRev = entries
        .filter((e) => e.creator_id === c.id)
        .reduce((s, e) => s + e.amount, 0);
      const total = ofRev + orgRev + intRev + adsRev + inflowwRev;
      return {
        creator: c,
        ofRev, ofTrackRev, orgRev, intRev,
        adsRev, adsSpend, inflowwRev,
        total,
        synced_at: ofRow?.synced_at ?? null,
      };
    }).sort((a, b) => b.total - a.total);
  }, [creators, ofStats, ofTracking, organicEntries, internalEntries, adCampaigns, entries, rangeOfEarnings]);

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

    // Organic bucket — social posts (Reddit / IG / FB / X / TikTok)
    if (chartStat === "organic_rev" || chartStat === "total_revenue") {
      for (const e of organicEntries) {
        if (!matchCreator(e.creator_id)) continue;
        if (valueMap[e.entry_date] !== undefined) valueMap[e.entry_date] += e.amount;
      }
    }
    // Internal bucket — internal tracking links
    if (chartStat === "internal_rev" || chartStat === "total_revenue") {
      for (const e of internalEntries) {
        if (!matchCreator(e.creator_id)) continue;
        if (valueMap[e.entry_date] !== undefined) valueMap[e.entry_date] += e.amount;
      }
    }
    // Ads bucket — OnlyFinder paid traffic (revenue_entries) + Meta ad campaigns
    if (chartStat === "ads_revenue" || chartStat === "ads_net" || chartStat === "total_revenue") {
      // OnlyFinder/Infloww-synced revenue (paid traffic, no separate spend column here)
      for (const e of entries) {
        if (!matchCreator(e.creator_id)) continue;
        if (valueMap[e.entry_date] !== undefined) valueMap[e.entry_date] += e.amount;
      }
      // Meta ad campaigns
      for (const c of adCampaigns) {
        if (!matchCreator(c.creator_id)) continue;
        if (valueMap[c.start_date] === undefined) continue;
        valueMap[c.start_date] += chartStat === "ads_net" || chartStat === "total_revenue"
          ? (c.revenue_generated - c.amount_spent)
          : c.revenue_generated;
      }
    }
    // OnlyFans Direct — the live earnings stream from the OF API,
    // synced daily into of_earnings_daily. Included in total_revenue
    // alongside organic/internal/ads, or shown solo via "of_direct".
    if (chartStat === "of_direct" || chartStat === "total_revenue") {
      for (const e of ofDaily) {
        if (!matchCreator(e.creator_id)) continue;
        if (valueMap[e.entry_date] !== undefined) valueMap[e.entry_date] += e.total ?? 0;
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
  }, [chartStat, chartDateRange, chartCreator, entries, organicEntries, internalEntries, adCampaigns, allPosts, ofDaily, raToCreator]);

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

      {/* ── Modern hero ───────────────────────────────────────────────────
          Big gradient panel with the live grand total front-and-centre,
          plus the per-bucket breakdown as horizontal pills underneath.
          Sync controls live here so admins don't have to bounce between
          pages to refresh the numbers. */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card/80 to-primary/5 p-6 sm:p-8">
        {/* Decorative gradient blobs */}
        <div aria-hidden className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <DollarSign className="h-3.5 w-3.5 text-primary" />
              Total revenue · all time
            </div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-r from-foreground to-primary/70 bg-clip-text text-transparent">
                ${overview.total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              {overview.adsSpend > 0 && (
                <span className="text-xs text-muted-foreground">
                  Net of ${overview.adsSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })} ad spend
                </span>
              )}
            </div>
            {/* Bucket pills */}
            <div className="mt-4 flex flex-wrap gap-2">
              <BucketPill icon={<SiOnlyfans className="h-3 w-3" />} label="OnlyFans Direct" value={overview.ofDirect} tone="of" />
              <BucketPill icon={<Layers className="h-3 w-3" />} label="Organic" value={overview.organic} tone="organic" />
              <BucketPill icon={<Wallet className="h-3 w-3" />} label="Internal" value={overview.internal} tone="internal" />
              <BucketPill icon={<Megaphone className="h-3 w-3" />} label="Ads" value={overview.ads} tone="ads" />
              {overview.ofTrackingTotal > 0 && (
                <BucketPill icon={<Link2 className="h-3 w-3" />} label="OF tracking links" value={overview.ofTrackingTotal} tone="of-track" />
              )}
            </div>
            {/* Date range picker — controls the OF Direct numbers
                in the bucket pills above and the per-creator breakdown
                below. Defaults to last 30 days. */}
            <div className="mt-4 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mr-1">
                Range
              </span>
              {(["7d","30d","90d","365d","lifetime"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setRangePreset(p)}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                    rangePreset === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-secondary/30 hover:bg-secondary/60"
                  }`}
                >
                  {p === "7d" ? "7d" : p === "30d" ? "30d" : p === "90d" ? "90d" : p === "365d" ? "1y" : "All time"}
                </button>
              ))}
              {/* Custom range — date inputs appear when picked */}
              <button
                onClick={() => setRangePreset("custom")}
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                  rangePreset === "custom"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border bg-secondary/30 hover:bg-secondary/60"
                }`}
              >
                Custom
              </button>
              {rangePreset === "custom" && (
                <>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="text-xs border border-border bg-background rounded-md px-2 py-1 h-7"
                  />
                  <span className="text-xs text-muted-foreground">→</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="text-xs border border-border bg-background rounded-md px-2 py-1 h-7"
                  />
                </>
              )}
              {loadingRangeOf && (
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 ml-2">
                  <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Updating…
                </span>
              )}
            </div>
            {/* Sync status strip */}
            <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
              {ofLastSync ? (
                <span>OF synced {format(new Date(ofLastSync), "MMM d 'at' h:mm a")} · {ofStats.length} creator{ofStats.length === 1 ? "" : "s"} · showing <span className="text-foreground font-medium">{dateRange.label.toLowerCase()}</span></span>
              ) : (
                <span className="text-amber-400">⚠ No OF data synced yet — hit "Sync OnlyFans" →</span>
              )}
            </div>
          </div>

          {/* Action column */}
          <div className="flex flex-col gap-2 sm:items-end shrink-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Revenue</h1>
            <p className="text-xs text-muted-foreground sm:text-right max-w-[280px]">
              All channels in one view. Sync directly from this page.
            </p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={onSyncOf}
                disabled={syncingOf}
                className="bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300"
              >
                <SiOnlyfans className={`mr-1.5 h-3.5 w-3.5 ${syncingOf ? "animate-spin" : ""}`} />
                {syncingOf ? "Syncing OF…" : "Sync OnlyFans"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onSyncInfloww}
                disabled={syncingInfloww}
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncingInfloww ? "animate-spin" : ""}`} />
                {syncingInfloww ? "Syncing…" : "Sync Infloww"}
              </Button>
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
            </div> {/* end action buttons row */}
          </div> {/* end action column */}
        </div> {/* end hero flex container */}
      </div> {/* end hero panel */}

      {/* ── OnlyFans data inspector ─────────────────────────────────────
          Collapsible diagnostic panel. Shows what's in the database vs
          what the OnlyFansAPI is actually returning, so a non-technical
          admin can self-diagnose "I synced but see $0" without opening
          the browser dev tools. */}
      <OfDataInspector />

      {/* ── Per-creator revenue breakdown ───────────────────────────────
          Sortable mini-table showing every creator's revenue split
          across OF Direct / Organic / Internal / Ads. Click a row to
          jump to the creator's detail page. */}
      {creatorBreakdown.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Revenue by creator
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                All channels combined, sorted by total. Click a creator to drill in.
              </p>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {creatorBreakdown.filter((b) => b.total > 0).length} of {creatorBreakdown.length} creator{creatorBreakdown.length === 1 ? "" : "s"} earning
            </div>
          </div>
          {/* Header row — desktop only */}
          <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1.2fr] px-5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold border-b border-border/50 bg-secondary/20">
            <div>Creator</div>
            <div className="text-right">OnlyFans</div>
            <div className="text-right">Organic</div>
            <div className="text-right">Internal</div>
            <div className="text-right">Ads (net)</div>
            <div className="text-right">Total</div>
          </div>
          <div className="divide-y divide-border/40">
            {creatorBreakdown.map((b) => {
              const adsNetCreator = b.adsRev + b.inflowwRev - b.adsSpend;
              const grand = b.ofRev + b.orgRev + b.intRev + adsNetCreator;
              const ofPct = grand > 0 ? (b.ofRev / grand) * 100 : 0;
              return (
                <Link
                  key={b.creator.id}
                  to="/creators/$creatorId"
                  params={{ creatorId: b.creator.id }}
                  className="block lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1.2fr] px-5 py-3 hover:bg-secondary/30 transition-colors"
                >
                  {/* Creator — with sync status */}
                  <div className="flex items-center gap-3 min-w-0 mb-2 lg:mb-0">
                    <span className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-blue-500/20 flex items-center justify-center text-[11px] font-bold text-foreground shrink-0">
                      {b.creator.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{b.creator.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {b.synced_at
                          ? `OF synced ${format(new Date(b.synced_at), "MMM d, h:mm a")}`
                          : "OF not synced"}
                      </div>
                    </div>
                  </div>
                  {/* Channel cells */}
                  <ChannelCell value={b.ofRev} accent="text-blue-400" />
                  <ChannelCell value={b.orgRev} accent="text-success" />
                  <ChannelCell value={b.intRev} accent="text-warning" />
                  <ChannelCell value={adsNetCreator} accent="text-ads" />
                  {/* Total + share-bar */}
                  <div className="text-right">
                    <div className="text-sm font-bold tabular-nums">
                      ${grand.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    {grand > 0 && (
                      <div className="mt-1.5 h-1 rounded-full bg-secondary/40 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 to-primary"
                          style={{ width: `${Math.min(100, ofPct)}%` }}
                          title={`OF share ${ofPct.toFixed(0)}%`}
                        />
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

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

      {/* ── OnlyFans tracking links (synced from /tracking-links) ──────────── */}
      {/* Each row is a campaign code the creator set up on
          onlyfans.com → Statistics → Tracking links. We mirror clicks /
          subscribers / spenders / revenue on every OF sync, so the
          numbers here are always at most one sync stale. */}
      {ofTracking.length > 0 && (() => {
        const grouped = creators.map((c) => {
          const rows = ofTracking.filter((t) => t.creator_id === c.id);
          if (rows.length === 0) return null;
          const totalRev = rows.reduce((s, r) => s + r.revenue_total, 0);
          const totalClicks = rows.reduce((s, r) => s + r.clicks_count, 0);
          const totalSubs = rows.reduce((s, r) => s + r.subscribers_count, 0);
          const lastSync = rows.reduce(
            (latest, r) => r.synced_at > latest ? r.synced_at : latest,
            rows[0].synced_at,
          );
          return { creator: c, rows, totalRev, totalClicks, totalSubs, lastSync };
        }).filter(Boolean) as {
          creator: Creator; rows: OfTrackingLink[];
          totalRev: number; totalClicks: number; totalSubs: number; lastSync: string;
        }[];
        const grandTotal = grouped.reduce((s, g) => s + g.totalRev, 0);
        return (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <SiOnlyfans className="h-4 w-4" style={{ color: "#00AFF0" }} />
                  OnlyFans tracking links
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Real campaign-code revenue from OnlyFans → Statistics → Tracking links.
                  Synced on every OF sync.
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
              {grouped.map(({ creator, rows, totalRev, totalClicks, totalSubs, lastSync }) => (
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
                    {rows.map((r) => (
                      <div key={r.id} className="rounded-lg bg-secondary/40 px-3 py-2 text-xs">
                        <div className="font-medium text-muted-foreground truncate mb-1 flex items-center gap-1">
                          <Link2 className="h-2.5 w-2.5" />
                          {r.name ?? `c${r.campaign_code}`}
                        </div>
                        <div className="font-bold text-sm">
                          ${r.revenue_total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          {r.clicks_count.toLocaleString()} clicks · {r.subscribers_count.toLocaleString()} subs
                        </div>
                        {r.spenders_count > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {r.spenders_count} spenders · ${r.revenue_per_subscriber.toFixed(2)}/sub
                          </div>
                        )}
                      </div>
                    ))}
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

      {/* ── OnlyFinder-attributed revenue (the Ads bucket's main feed) ────── */}

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
          <div className="text-sm font-semibold mb-3">OnlyFinder revenue by account</div>
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

// ── Reusable building blocks ────────────────────────────────────────────────

/** Compact pill used in the hero to show a bucket's contribution. */
function BucketPill({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "of" | "of-track" | "organic" | "internal" | "ads";
}) {
  const toneCls = {
    of:        "border-blue-500/30 bg-blue-500/10 text-blue-300",
    "of-track":"border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    organic:   "border-success/30 bg-success/10 text-success",
    internal:  "border-warning/30 bg-warning/10 text-warning",
    ads:       "border-ads/30 bg-ads/10 text-ads",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${toneCls}`}>
      {icon}
      <span className="font-medium">{label}</span>
      <span className="font-bold tabular-nums">
        ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </span>
    </span>
  );
}

/** One revenue cell in the per-creator breakdown row. Greys out zeros. */
function ChannelCell({ value, accent }: { value: number; accent: string }) {
  const zero = value === 0;
  return (
    <div className="flex items-center justify-between lg:justify-end gap-2 lg:gap-0 text-xs lg:text-sm py-0.5 lg:py-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 lg:hidden">
        {accent.includes("blue") ? "OF" : accent.includes("success") ? "Organic" : accent.includes("warning") ? "Internal" : "Ads"}
      </span>
      <span className={`tabular-nums ${zero ? "text-muted-foreground/40" : `${accent} font-medium`}`}>
        ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
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
