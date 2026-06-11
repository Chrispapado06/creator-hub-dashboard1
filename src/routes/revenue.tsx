import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign, TrendingUp, Users, Plus, Trash2, RefreshCw, Wallet,
  Megaphone, Layers, Link2, Receipt, Calendar, Filter as FilterIcon,
  Download,
} from "lucide-react";
import { PieChart, Pie, Cell as PieCell, ResponsiveContainer as PieRC, Tooltip as PieTooltip } from "recharts";
import { StatTile, DeltaBadge } from "@/components/StatTile";
import { SiOnlyfans } from "react-icons/si";
import { OfDataInspector } from "@/components/OfDataInspector";
import { runSyncJob } from "@/lib/sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, ResponsiveContainer as RcContainer, XAxis as RcXAxis,
  Tooltip as RcTooltip, Cell as RcCell,
} from "recharts";
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
  /** Subscriber columns from of_creator_stats — used by the Overview /
   *  Customers / Retention tabs to compute LTV, churn, retention. */
  active_subscribers: number;
  expired_subscribers: number;
  sub_price: number | null;
  synced_at: string;
};
/** Daily subscriber-count snapshot — feeds churn analysis + MAU bars. */
type OfSubMetric = {
  creator_id: string;
  entry_date: string;
  active_count: number;
  new_count: number;
  lost_count: number;
  expired_count: number;
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
  const [subMetrics, setSubMetrics] = useState<OfSubMetric[]>([]);
  // Active analytics tab — Overview / Revenue / Customers / Retention.
  // Defaults to Overview to match Subly's pattern (high-level first,
  // detail tabs underneath).
  const [analyticsTab, setAnalyticsTab] = useState<"overview" | "revenue" | "customers" | "retention">("overview");
  const [ofDaily, setOfDaily] = useState<OfDailyEarning[]>([]);
  const [ofTracking, setOfTracking] = useState<OfTrackingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [filterCreator, setFilterCreator] = useState("all");
  const [filterSource, setFilterSource] = useState("all");

  // ── Page-level date range ──────────────────────────────────────────
  // Infloww-style preset buttons: Yesterday / Today / This week /
  // This month + Custom. "This month" is the default — most agencies
  // open Revenue to ask "how am I doing this month".
  type RangePreset = "yesterday" | "today" | "week" | "month" | "custom";
  const [rangePreset, setRangePreset] = useState<RangePreset>("month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  // ── Metric selector ─────────────────────────────────────────────────
  // Drops down beside the range pills, like Infloww. Flips which
  // headline number the hero shows: total agency revenue, net
  // earnings (after OF fee + creator split), OF direct only, or
  // ad-channel net. Doesn't filter the breakdown table — that always
  // shows every channel — just the big number at the top.
  type Metric = "total" | "net" | "of" | "ads";
  const [metric, setMetric] = useState<Metric>("total");
  const dateRange = useMemo<{ from: Date; to: Date; startStr: string; endStr: string; label: string }>(() => {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    // Local-tz date string (NOT UTC). Was using d.toISOString().slice(0,10)
    // which shifts the date if local time is east-of-UTC late-night or
    // west-of-UTC early-morning — e.g. EST 8 PM Tuesday becomes
    // "Wednesday" in UTC. Using local date components keeps the API
    // call's start_date / end_date matching the user's wall clock.
    const isoDay = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    if (rangePreset === "today") {
      return { from: startOfDay(now), to: endOfDay(now), startStr: isoDay(now), endStr: isoDay(now), label: "Today" };
    }
    if (rangePreset === "yesterday") {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y), startStr: isoDay(y), endStr: isoDay(y), label: "Yesterday" };
    }
    if (rangePreset === "week") {
      // ISO week: Monday 00:00 (local) → today 23:59:59 (week-to-date).
      // Date.getDay() returns 0=Sunday..6=Saturday, so shift +6 mod 7 to
      // turn it into a 0=Monday..6=Sunday index for the offset back.
      //   - Today is Monday  → dayIdx 0 → from = today
      //   - Today is Tuesday → dayIdx 1 → from = yesterday
      //   - Today is Sunday  → dayIdx 6 → from = 6 days ago (last Mon)
      const dayIdx = (now.getDay() + 6) % 7;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayIdx);
      return {
        from: monday, to: endOfDay(now),
        startStr: isoDay(monday), endStr: isoDay(now),
        label: "This week",
      };
    }
    if (rangePreset === "month") {
      // 1st of current month at 00:00 (local) → today 23:59:59. Always
      // resets on the 1st regardless of how many days elapsed.
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        from: first, to: endOfDay(now),
        startStr: isoDay(first), endStr: isoDay(now),
        label: "This month",
      };
    }
    // custom
    const from = customFrom ? new Date(customFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = customTo ? new Date(customTo) : now;
    return {
      from, to,
      startStr: isoDay(from), endStr: isoDay(to),
      label: `${isoDay(from)} – ${isoDay(to)}`,
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
           { data: ofs }, { data: ofd }, { data: oft }, { data: subm }] = await Promise.all([
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
      // OF subscriber metrics — daily new/lost/active counts. Powers
      // churn rate, MAU, retention curve in the Overview / Customers /
      // Retention tabs.
      supabase.from("of_subscriber_metrics_daily")
        .select("creator_id, entry_date, active_count, new_count, lost_count, expired_count")
        .gte("entry_date", since1y)
        .order("entry_date", { ascending: true }),
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
    setSubMetrics((subm ?? []) as OfSubMetric[]);
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
    // Trust the live range value, full stop. Earlier I had a fallback
    // to lifetime totals when the live call returned $0 — that was
    // meant to handle transient API failures, but it backfires on
    // short ranges like "Today": picking Today with $0 from OF would
    // show LIFETIME numbers as today's hero, which is plainly wrong.
    // The sync's separate fail-safe (skip-on-failure upsert) already
    // protects against permanent data loss; the page should always
    // show the real range value, even if it's $0.
    let ofDirect = 0;
    let ofSubs = 0;
    let ofTips = 0;
    let ofPpv = 0;
    let ofMsgs = 0;
    for (const c of creators) {
      const live = rangeOfEarnings[c.id];
      if (!live) continue;
      ofDirect += live.total;
      ofSubs += live.subs;
      ofTips += live.tips;
      ofPpv += live.ppv;
      ofMsgs += live.messages;
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
      const rangeRow = rangeOfEarnings[c.id];
      // The lifetime stats row is still useful for the "synced X ago"
      // timestamp shown next to each creator's name — it tells admins
      // when OnlyFansAPI data was last pulled, regardless of whether
      // the active range is Today or All time. The earnings number
      // itself comes from the live range fetch.
      const lifetimeRow = ofStats.find((s) => s.creator_id === c.id);
      const ofRev = rangeRow?.total ?? 0;
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
        synced_at: lifetimeRow?.synced_at ?? null,
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

  // ── Nexus-style KPIs for the active range ─────────────────────────────
  // Three tiles match the dashboard contract: Revenue (gross), Net
  // Revenue (after ad spend), Expenses (ad spend total). Sparklines pull
  // from the existing chartData series so the bottom-of-tile mini-graph
  // tracks the same shape as the big chart below.
  const grossRevenue = overview.organic + overview.internal + overview.ads + overview.ofDirect;
  const netRevenue = overview.total;          // = gross − adsSpend (already rolled up)
  const totalExpenses = overview.adsSpend;
  const headlineValue = (() => {
    switch (metric) {
      case "total": return overview.total;
      case "net":   return overview.total - overview.adsSpend;
      case "of":    return overview.ofDirect;
      case "ads":   return overview.adsNet;
    }
  })();
  // Sparkline data from the same chart series — turn `chartData` into the
  // {x,y} shape StatTile expects.
  const revenueSpark = chartData.map((d) => ({ x: d.date, y: d.value }));

  return (
    <div className="space-y-6">
      <Toaster />

      {/* ── Page header — Nexus pattern: title left, action chips right.
          The previous big gradient hero was replaced with a calmer header
          + three KPI tiles below; the headline value still respects the
          metric dropdown so the user can flip between Total / Net / OF /
          Ads without losing the at-a-glance reading. */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Revenue</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <Calendar className="h-3.5 w-3.5" />
            <span>{dateRange.label}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live data
            </span>
            {ofLastSync && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>OF synced {format(new Date(ofLastSync), "MMM d 'at' h:mm a")}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Range pills — Infloww-style row */}
          <div className="inline-flex rounded-full border border-border bg-card p-0.5">
            {([
              { v: "yesterday", label: "Yesterday" },
              { v: "today",     label: "Today" },
              { v: "week",      label: "Week" },
              { v: "month",     label: "Month" },
            ] as const).map((p) => (
              <button
                key={p.v}
                onClick={() => setRangePreset(p.v)}
                className={`px-3 py-1 rounded-full text-xs transition-all ${
                  rangePreset === p.v
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setRangePreset("custom")}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                rangePreset === "custom"
                  ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Custom
            </button>
          </div>
          {/* Metric dropdown */}
          <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <SelectTrigger className="h-8 w-[160px] text-xs rounded-full border-border bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">Total revenue</SelectItem>
              <SelectItem value="net">Net earnings</SelectItem>
              <SelectItem value="of">OnlyFans Direct</SelectItem>
              <SelectItem value="ads">Ads (net)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={onSyncOf}
            disabled={syncingOf}
            className="rounded-full border-border bg-card hover:bg-secondary"
          >
            <SiOnlyfans className={`h-3.5 w-3.5 mr-1.5 ${syncingOf ? "animate-spin" : ""}`} style={{ color: "#00AFF0" }} />
            {syncingOf ? "Syncing OF…" : "Sync OF"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSyncInfloww}
            disabled={syncingInfloww}
            className="rounded-full border-border bg-card hover:bg-secondary"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncingInfloww ? "animate-spin" : ""}`} />
            {syncingInfloww ? "Syncing…" : "Sync Infloww"}
          </Button>
        </div>
      </div>

      {/* Custom range pickers (only when Custom is selected).
          Uses the shadcn popover-style DatePicker (Calendar inside a
          Popover) instead of the native <input type="date">, which
          rendered the boxy slash-separated browser default. The
          DatePicker takes `Date` objects, so we serialize back to the
          same yyyy-MM-dd string the rest of the page expects. */}
      {rangePreset === "custom" && (
        <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-border bg-card p-3">
          <Label className="text-xs font-semibold text-muted-foreground">From</Label>
          <DatePicker
            size="sm"
            placeholder="Start date"
            className="w-[160px] rounded-full"
            value={customFrom ? new Date(customFrom) : null}
            onChange={(d) => setCustomFrom(d ? format(d, "yyyy-MM-dd") : "")}
            clearable
          />
          <Label className="text-xs font-semibold text-muted-foreground ml-2">To</Label>
          <DatePicker
            size="sm"
            placeholder="End date"
            className="w-[160px] rounded-full"
            value={customTo ? new Date(customTo) : null}
            onChange={(d) => setCustomTo(d ? format(d, "yyyy-MM-dd") : "")}
            clearable
          />
          {loadingRangeOf && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 ml-2">
              <RefreshCw className="h-3 w-3 animate-spin" /> Loading OF…
            </span>
          )}
        </div>
      )}

      {/* ── Analytics tabs (Subly pattern).
          Pill-shaped tab strip below the date controls, four sections:
            • Overview  — high-level health check (this is what the user
              sees first; layout copies Subly's MRR / Conversions /
              Retention / MAU / LTV / Channels grid)
            • Revenue   — the existing 5-KPI row + donut + manual entries
            • Customers — top spenders, active vs expired subs
            • Retention — churn rate over time, retention curves
          Each tab shares the same dateRange / metric state, so flipping
          tabs is instant — no reload. */}
      <Tabs value={analyticsTab} onValueChange={(v) => setAnalyticsTab(v as typeof analyticsTab)}>
        <TabsList className="bg-transparent p-0 h-auto gap-1 mb-4 flex-wrap">
          {([
            { v: "overview", label: "Overview" },
            { v: "revenue", label: "Revenue" },
            { v: "customers", label: "Customers" },
            { v: "retention", label: "Retention" },
          ] as const).map((t) => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="rounded-full px-4 py-1.5 text-xs font-semibold border border-transparent data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary/30 data-[state=active]:shadow-sm hover:bg-secondary/40 transition-colors"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Overview tab — Subly layout.
            Top: 3-column grid (MRR Growth Target / Trial Conversions / Retention & Churn)
            Middle: 2-column (MAU bar chart / right rail with Projected LTV + Top 3 Channels) */}
        <TabsContent value="overview" className="space-y-4 mt-0">
          <OverviewTabContent
            grossRevenue={grossRevenue}
            netRevenue={netRevenue}
            adsSpend={overview.adsSpend}
            ofStats={ofStats}
            subMetrics={subMetrics}
            organicEntries={organicEntries}
            internalEntries={internalEntries}
            entries={entries}
            ofDaily={ofDaily}
            adCampaigns={adCampaigns}
            channelOverview={overview}
            dateLabel={dateRange.label}
          />
        </TabsContent>

        {/* ── Revenue tab — keeps the existing detail layout. */}
        <TabsContent value="revenue" className="space-y-4 mt-0">

      {/* Top KPI row — Boxera analytics pattern: 5 tiles in a single
          row (sm: 2-up, lg: 5-up). Each tile shows the metric, the
          period delta vs the previous comparable period, and a soft
          spark trend underneath. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile
          tone="emerald"
          icon={<Wallet className="h-4 w-4" />}
          label="Total Revenue"
          value={`$${grossRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          delta={null}
          deltaSubtitle={`${dateRange.label.toLowerCase()} · gross`}
          sparkline={revenueSpark}
          loading={loading}
        />
        <StatTile
          tone={netRevenue >= 0 ? "violet" : "rose"}
          icon={<TrendingUp className="h-4 w-4" />}
          label="Net Revenue"
          value={`$${netRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          delta={null}
          deltaSubtitle={
            overview.adsSpend > 0
              ? `after $${overview.adsSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })} ads`
              : "after ad spend"
          }
          sparkline={revenueSpark}
          loading={loading}
        />
        <StatTile
          tone="amber"
          icon={<Receipt className="h-4 w-4" />}
          label="Expenses"
          value={`$${totalExpenses.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          delta={null}
          deltaSubtitle="ad spend this range"
          loading={loading}
        />
        <StatTile
          tone="cyan"
          icon={<SiOnlyfans className="h-4 w-4" />}
          label="OnlyFans Direct"
          value={`$${overview.ofDirect.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          delta={null}
          deltaSubtitle={
            overview.ofDirect > 0
              ? `${((overview.ofDirect / Math.max(grossRevenue, 1)) * 100).toFixed(0)}% of revenue`
              : "no OF data yet"
          }
          loading={loading}
        />
        <StatTile
          tone="indigo"
          icon={<Users className="h-4 w-4" />}
          label="Avg per creator"
          value={`$${(grossRevenue / Math.max(creators.length || 1, 1)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          delta={null}
          deltaSubtitle={`across ${creators.length} creator${creators.length === 1 ? "" : "s"}`}
          loading={loading}
        />
      </div>

      {/* Headline metric strip — small contextual value driven by the
          Metric dropdown. Lives BELOW the 3-tile row so the standardized
          KPIs always come first; this strip is the "pick your view" lens. */}
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 font-bold">
            {metric === "total" ? "Total revenue" :
             metric === "net" ? "Net earnings" :
             metric === "of" ? "OnlyFans Direct" : "Ads net"}
          </div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span className="text-3xl font-bold tabular-nums leading-none">
              ${headlineValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
            <span className="text-xs text-muted-foreground">{dateRange.label.toLowerCase()}</span>
          </div>
        </div>
        {/* Bucket pills — same data, cleaner Nexus-flat style */}
        <div className="flex flex-wrap gap-1.5">
          <BucketPill icon={<SiOnlyfans className="h-3 w-3" />} label="OF Direct" value={overview.ofDirect} tone="of" />
          <BucketPill icon={<Layers className="h-3 w-3" />} label="Organic" value={overview.organic} tone="organic" />
          <BucketPill icon={<Wallet className="h-3 w-3" />} label="Internal" value={overview.internal} tone="internal" />
          <BucketPill icon={<Megaphone className="h-3 w-3" />} label="Ads" value={overview.ads} tone="ads" />
          {overview.ofTrackingTotal > 0 && (
            <BucketPill icon={<Link2 className="h-3 w-3" />} label="OF tracking" value={overview.ofTrackingTotal} tone="of-track" />
          )}
        </div>
      </div>

      {/* Hidden legacy form — kept disabled so the file references for
          `form` / `setForm` / `onAdd` still type-check, but rendered
          nowhere. The new layout doesn't expose the manual entry dialog
          here; admins log Reddit entries from the creator detail page. */}
      <div className="hidden">
        {false && (
          <button onClick={() => { setOpen(true); setForm(emptyForm); onAdd(); }}>
            placeholder
          </button>
        )}
      </div>


      {/* ── Revenue by Channel — donut chart, full-width slot.
          Sales Overview / Per-creator breakdown / OF data inspector
          were removed so this is the only chart on the page right now.
          The user is going to spec what fills the rest of this page
          next. */}
      <RevenueByChannelCard overview={overview} />

      {/* ── Manual revenue entries — single Nexus-style card.
          Replaces the previous loose 3-tile mini-grid + share-bar block +
          filter row + table. Now everything lives inside one rounded
          card with a clear icon-chip header. */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <span className="h-7 w-7 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center">
              <Receipt className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Manual revenue entries</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Reddit-attributed revenue logged from creator detail pages
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterCreator} onValueChange={setFilterCreator}>
              <SelectTrigger className="h-8 w-[150px] text-xs rounded-full border-border">
                <SelectValue placeholder="Creator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All creators</SelectItem>
                {creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="h-8 w-[130px] text-xs rounded-full border-border">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {Object.entries(sourceLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Mini-stats — Total / Entries / Top account */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/40 p-3.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" /> Filtered total
            </div>
            <div className="text-2xl font-bold mt-1 tabular-nums">
              ${totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" /> Entries
            </div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{filtered.length}</div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold flex items-center gap-1.5">
              <Users className="h-3 w-3" /> Top account
            </div>
            <div className="text-base font-bold mt-1 truncate">
              {byAccount.length > 0
                ? byAccount[0][0] === "__none__" ? "Unattributed" : `u/${accountName(byAccount[0][0])}`
                : "—"}
            </div>
            {byAccount.length > 0 && (
              <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                ${byAccount[0][1].toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </div>
            )}
          </div>
        </div>

        {/* Per-account share bars */}
        {byAccount.length > 1 && (
          <div className="rounded-xl border border-border bg-background/50 p-4 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold mb-1">
              Revenue by account
            </div>
            {byAccount.map(([id, total]) => {
              const pct = totalRevenue > 0 ? (total / totalRevenue) * 100 : 0;
              return (
                <div key={id} className="flex items-center gap-3 text-xs">
                  <div className="w-28 text-muted-foreground truncate font-medium">
                    {id === "__none__" ? "Unattributed" : `u/${accountName(id)}`}
                  </div>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-20 text-right font-semibold tabular-nums">
                    ${total.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </div>
                  <div className="w-10 text-right text-muted-foreground tabular-nums">
                    {pct.toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Entries table */}
        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-muted/30" />
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No revenue entries match the current filters.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 font-bold">
                <tr>
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-4 py-2.5">Creator</th>
                  <th className="text-left px-4 py-2.5">Account</th>
                  <th className="text-left px-4 py-2.5">Link</th>
                  <th className="text-left px-4 py-2.5">Source</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                  <th className="text-left px-4 py-2.5">Notes</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-t border-border bg-card hover:bg-secondary/40 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {format(new Date(e.entry_date), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to="/creators/$creatorId"
                        params={{ creatorId: e.creator_id }}
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {creatorName(e.creator_id)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {e.reddit_account_id ? `u/${accountName(e.reddit_account_id)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[140px] truncate">
                      {e.tracking_link_id ? linkLabel(e.tracking_link_id) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sourceStyles[e.source] ?? sourceStyles.other}`}>
                        {sourceLabel[e.source] ?? e.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      ${e.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[180px] truncate">
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
        </TabsContent>

        {/* ── Customers tab ──────────────────────────────────────── */}
        <TabsContent value="customers" className="space-y-4 mt-0">
          <CustomersTabContent ofStats={ofStats} creators={creators} />
        </TabsContent>

        {/* ── Retention tab ──────────────────────────────────────── */}
        <TabsContent value="retention" className="space-y-4 mt-0">
          <RetentionTabContent ofStats={ofStats} subMetrics={subMetrics} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Reusable building blocks ────────────────────────────────────────────────

/** Compact pastel pill used in the headline strip to show each bucket's
 *  contribution. Pastel-tinted background + bold tabular value, matching
 *  the Nexus delta-pill aesthetic. */
function BucketPill({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "of" | "of-track" | "organic" | "internal" | "ads";
}) {
  const toneCls = {
    of:        "bg-blue-500/12 text-blue-600",
    "of-track":"bg-cyan-500/12 text-cyan-600",
    organic:   "bg-emerald-500/12 text-emerald-600",
    internal:  "bg-amber-500/15 text-amber-600",
    ads:       "bg-violet-500/12 text-violet-600",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${toneCls}`}>
      {icon}
      <span>{label}</span>
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
    <div className="flex items-center justify-between lg:justify-end gap-2 lg:gap-0 text-xs py-0.5 lg:py-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 lg:hidden">
        {accent.includes("blue") ? "OF" : accent.includes("emerald") ? "Organic" : accent.includes("amber") ? "Internal" : "Ads"}
      </span>
      <span className={`tabular-nums ${zero ? "text-muted-foreground/40" : `${accent} font-semibold`}`}>
        ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

// ── Revenue by Channel donut ─────────────────────────────────────────────
// Boxera's "Orders by Channel" port — donut chart on the left, color
// dots + labels + percentages on the right. Maps OFM's four buckets
// (OF Direct / Organic / Internal / Ads) to the same visual treatment.
const CHANNEL_PALETTE = [
  { key: "of",       label: "OnlyFans Direct", color: "rgb(99 102 241)" },   // indigo-500
  { key: "organic",  label: "Organic",         color: "rgb(139 92 246)" },   // violet-500
  { key: "internal", label: "Internal",        color: "rgb(167 139 250)" },  // violet-400
  { key: "ads",      label: "Ads (net)",       color: "rgb(196 181 253)" },  // violet-300
];

function RevenueByChannelCard({
  overview,
}: {
  overview: {
    organic: number;
    internal: number;
    adsNet: number;
    ofDirect: number;
  };
}) {
  const slices = [
    { key: "of",       value: overview.ofDirect, label: "OnlyFans Direct", color: CHANNEL_PALETTE[0].color },
    { key: "organic",  value: overview.organic,  label: "Organic",         color: CHANNEL_PALETTE[1].color },
    { key: "internal", value: overview.internal, label: "Internal",        color: CHANNEL_PALETTE[2].color },
    { key: "ads",      value: overview.adsNet,   label: "Ads (net)",       color: CHANNEL_PALETTE[3].color },
  ].filter((s) => s.value > 0);
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3 flex flex-col">
      <div className="flex items-center gap-2.5">
        <span className="h-7 w-7 rounded-lg bg-violet-500/15 text-violet-600 flex items-center justify-center">
          <Layers className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Revenue by Channel</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Where the money came in
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground italic py-12 border border-dashed border-border rounded-xl">
          No revenue in this range yet.
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 flex-1 justify-center">
          {/* Donut — Recharts pie with thick stroke between slices for the
              clean separators Boxera shows. */}
          <div className="relative h-44 w-44">
            <PieRC width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={56}
                  outerRadius={84}
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={3}
                >
                  {slices.map((s) => (
                    <PieCell key={s.key} fill={s.color} />
                  ))}
                </Pie>
                <PieTooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 11,
                    boxShadow: "0 8px 24px -8px rgba(0,0,0,0.10)",
                  }}
                  formatter={(v: number, name: string) => [
                    `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
                    name,
                  ]}
                />
              </PieChart>
            </PieRC>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
              <div className="text-base font-bold tabular-nums">
                ${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          {/* Legend — color dot + label + percentage, one row each */}
          <div className="w-full space-y-1.5">
            {slices.map((s) => {
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              return (
                <div key={s.key} className="flex items-center gap-2.5 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="flex-1 truncate font-medium">{s.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Overview tab — Subly layout port ─────────────────────────────────────
//
// Top: 3-column grid
//   [ MRR Growth Target | Trial Conversions | Retention & Churn (spans 2 rows) ]
// Bottom: 2-column grid (left col already taken)
//   [ MAU & Cohort Trends                    | Projected LTV / Top 3 Channels ]
//
// All numbers come from data already in scope on the parent — we just
// re-bucket. When data is missing (e.g. no OF subs synced yet), each
// card shows a calm "needs sync" message instead of a 0.

function OverviewTabContent({
  grossRevenue, netRevenue, adsSpend, ofStats, subMetrics,
  organicEntries, internalEntries, entries, ofDaily, adCampaigns,
  channelOverview, dateLabel,
}: {
  grossRevenue: number;
  netRevenue: number;
  adsSpend: number;
  ofStats: OfCreatorStat[];
  subMetrics: OfSubMetric[];
  organicEntries: OrganicEntry[];
  internalEntries: InternalEntry[];
  entries: RevenueEntry[];
  ofDaily: OfDailyEarning[];
  adCampaigns: AdCampaign[];
  channelOverview: { organic: number; internal: number; adsNet: number; ofDirect: number };
  dateLabel: string;
}) {
  // ── Monthly revenue rollup (last 12 months) ──
  // Used by both "MRR Growth Target" mini-bar chart and the big MAU
  // chart at the bottom. Each month = sum of all revenue sources for
  // entries dated in that month.
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; revenue: number; subs: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleString("en-US", { month: "short" }), revenue: 0, subs: 0 });
    }
    const monthMap = new Map(months.map((m) => [m.key, m]));
    const bump = (date: string, amount: number) => {
      const key = date.slice(0, 7);
      const m = monthMap.get(key);
      if (m) m.revenue += amount;
    };
    for (const e of organicEntries) bump(e.entry_date, e.amount);
    for (const e of internalEntries) bump(e.entry_date, e.amount);
    for (const e of entries) bump(e.entry_date, e.amount);
    for (const e of ofDaily) bump(e.entry_date, e.total);
    for (const c of adCampaigns) {
      const sd = (c as unknown as { start_date?: string | null }).start_date;
      if (sd) bump(sd, c.revenue_generated - c.amount_spent);
    }
    // New subs per month — sum new_count from sub metrics
    for (const r of subMetrics) {
      const key = r.entry_date.slice(0, 7);
      const m = monthMap.get(key);
      if (m) m.subs += r.new_count;
    }
    return months;
  }, [organicEntries, internalEntries, entries, ofDaily, adCampaigns, subMetrics]);

  const thisMonth = monthlyRevenue[monthlyRevenue.length - 1];
  const lastMonth = monthlyRevenue[monthlyRevenue.length - 2];
  const monthGrowthPct = lastMonth && lastMonth.revenue > 0
    ? ((thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100
    : null;

  // ── Subscriber rollups ──
  const totalActive = ofStats.reduce((s, r) => s + (r.active_subscribers ?? 0), 0);
  const totalExpired = ofStats.reduce((s, r) => s + (r.expired_subscribers ?? 0), 0);
  const totalSubs = totalActive + totalExpired;
  const avgSubPrice = (() => {
    const valid = ofStats.filter((r) => r.sub_price && r.sub_price > 0);
    if (valid.length === 0) return 0;
    return valid.reduce((s, r) => s + (r.sub_price ?? 0), 0) / valid.length;
  })();

  // Last-30-day churn snapshot from sub metrics
  const recent30 = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    return subMetrics.filter((r) => r.entry_date >= cutoff);
  }, [subMetrics]);
  const recentNew = recent30.reduce((s, r) => s + r.new_count, 0);
  const recentLost = recent30.reduce((s, r) => s + r.lost_count, 0);
  const recentExpired = recent30.reduce((s, r) => s + r.expired_count, 0);
  const grossChurnPct = totalActive > 0
    ? ((recentLost + recentExpired) / Math.max(totalActive, 1)) * 100
    : null;
  const retentionPct = totalSubs > 0 ? (totalActive / totalSubs) * 100 : null;

  // LTV — assume avg sub_price × 3 months as a baseline; replace with
  // real cohort math once we have it.
  const avgLifetimeMonths = 3;
  const projectedLtv = avgSubPrice * avgLifetimeMonths + (totalActive > 0 ? grossRevenue / Math.max(totalActive, 1) : 0);

  // Conversion rate — paid subs / clicks. If we don't have clicks yet,
  // use new subs / total subs as a rough proxy.
  const paidConversionsTarget = Math.max(60, recentNew); // at least 60 to show a goal-driven feel
  const newTrialsTarget = Math.max(150, recentNew + recentExpired);
  const conversionRate = newTrialsTarget > 0 ? (recentNew / newTrialsTarget) * 100 : 0;

  // ── Top 3 acquisition channels (donut) ──
  const channelSlices = [
    { key: "of", label: "OnlyFans Direct", value: channelOverview.ofDirect, color: "rgb(99 102 241)" },
    { key: "organic", label: "Organic", value: channelOverview.organic, color: "rgb(139 92 246)" },
    { key: "internal", label: "Internal", value: channelOverview.internal, color: "rgb(167 139 250)" },
    { key: "ads", label: "Ads (net)", value: channelOverview.adsNet, color: "rgb(196 181 253)" },
  ].filter((s) => s.value > 0).sort((a, b) => b.value - a.value).slice(0, 3);
  const channelTotal = channelSlices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ── MRR Growth Target ───────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-1">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-sm font-bold tracking-tight">Revenue Growth</h3>
        </div>
        <div className="text-3xl font-bold tabular-nums leading-none mt-3">
          ${thisMonth.revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {monthGrowthPct !== null && (
            <span className={`font-bold ${monthGrowthPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {monthGrowthPct >= 0 ? "+" : ""}{monthGrowthPct.toFixed(1)}%
            </span>
          )}
          <span className="text-muted-foreground">vs last month</span>
        </div>
        <div className="mt-4 rounded-xl bg-muted/40 p-3 flex items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div className="text-[11px]">
            <div className="text-muted-foreground">Period</div>
            <div className="font-semibold">{thisMonth.label} · {dateLabel}</div>
          </div>
        </div>
        {/* Mini bar chart — last 6 months */}
        <div className="h-24 mt-4">
          <RcContainer width="100%" height="100%">
            <BarChart data={monthlyRevenue.slice(-6)} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <RcXAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <RcTooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, "Revenue"]}
              />
              <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={28}>
                {monthlyRevenue.slice(-6).map((_m, i) => (
                  <RcCell
                    key={i}
                    fill={i === 5 ? "rgb(99 102 241)" : "rgb(196 181 253)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </RcContainer>
        </div>
      </section>

      {/* ── Trial Conversions ──────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold tracking-tight mb-3">Conversions</h3>
        <div className="text-[11px] text-muted-foreground mb-1.5">Conversion Rate Goal</div>
        {/* Gradient progress bar */}
        <div className="h-3 rounded-full bg-muted overflow-hidden relative">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-300 via-violet-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(2, conversionRate))}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1.5 mb-4">
          <span>0%</span><span>25%</span><span>75%</span><span>100%</span>
        </div>
        {/* Three mini stat cards inside */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border bg-background/50 p-3">
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center mb-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">New Trials</div>
            <div className="text-sm font-bold tabular-nums mt-0.5">
              {recentNew} / {newTrialsTarget}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-3">
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center mb-1.5">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">Paid Subs</div>
            <div className="text-sm font-bold tabular-nums mt-0.5">
              {recentNew} / {paidConversionsTarget}
            </div>
          </div>
          <div className="rounded-xl bg-foreground text-background p-3 flex flex-col justify-between">
            <div className="text-[10px] uppercase tracking-wider text-background/70 font-bold">Avg LTV</div>
            <div className="text-sm font-bold tabular-nums">
              ${projectedLtv.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Retention & Churn Analysis (spans 2 rows on lg+) ── */}
      <section className="rounded-2xl border border-border bg-card p-5 lg:row-span-2">
        <h3 className="text-sm font-bold tracking-tight">Retention &<br />Churn Analysis</h3>
        {/* Visual tier bars — three colored bars representing churn,
            retention, ltv tiers (Subly's pastel-bar visual). */}
        <div className="mt-4 flex gap-2 items-end h-32">
          {[
            { label: `${(retentionPct ?? 0).toFixed(0)}%`, color: "bg-amber-300", h: "h-full" },
            { label: `${(grossChurnPct ?? 0).toFixed(0)}%`, color: "bg-violet-400", h: "h-2/3" },
            { label: `${100 - (grossChurnPct ?? 0)}%`.length > 4 ? "—" : `${(100 - (grossChurnPct ?? 0)).toFixed(0)}%`, color: "bg-cyan-300", h: "h-1/2" },
          ].map((b, i) => (
            <div key={i} className={`flex-1 rounded-t-lg ${b.color} ${b.h} relative flex items-start justify-center pt-1`}>
              <span className="text-[10px] font-bold text-foreground/80 bg-card rounded px-1.5 py-0.5 -mt-3">
                {b.label}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-2">
          <span className="flex-1 h-1 bg-amber-300 rounded-full" />
          <span className="flex-1 h-1 bg-violet-400 rounded-full" />
          <span className="flex-1 h-1 bg-cyan-300 rounded-full" />
        </div>

        {/* Detail rows — like Subly's labeled stats */}
        <div className="mt-5 space-y-2.5 text-xs">
          <RetentionRow
            label="Gross Churn (User)"
            value={grossChurnPct !== null ? `${grossChurnPct.toFixed(1)}%` : "—"}
          />
          <RetentionRow
            label="Net Revenue Churn"
            value={grossChurnPct !== null && monthGrowthPct !== null
              ? `${(grossChurnPct - Math.max(0, monthGrowthPct)).toFixed(1)}%`
              : "—"}
          />
          <RetentionRow
            label="Customer Retention Rate"
            value={retentionPct !== null ? `${retentionPct.toFixed(1)}%` : "—"}
          />
          <RetentionRow
            label="Customer Lifetime Value (LTV)"
            value={`$${projectedLtv.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          />
        </div>

        <div className="mt-5 rounded-xl border border-border bg-background/50 p-3.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold">Projected LTV</h4>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">
              ${projectedLtv.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
            {monthGrowthPct !== null && (
              <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${monthGrowthPct >= 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
                {monthGrowthPct >= 0 ? "↑" : "↓"} {Math.abs(monthGrowthPct).toFixed(1)}%
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
            Estimated revenue per customer over their entire lifecycle.
          </p>
        </div>

        {/* Top 3 Acquisition Channels — donut */}
        <div className="mt-4 rounded-xl border border-border bg-background/50 p-3.5">
          <h4 className="text-xs font-bold mb-2">Top 3 Acquisition Channels</h4>
          {channelTotal === 0 ? (
            <div className="text-[11px] text-muted-foreground italic py-4 text-center">
              No revenue split available yet.
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="relative h-24 w-24 shrink-0">
                <RcContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channelSlices}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={32}
                      outerRadius={48}
                      paddingAngle={2}
                      stroke="var(--card)"
                      strokeWidth={2}
                    >
                      {channelSlices.map((s) => <PieCell key={s.key} fill={s.color} />)}
                    </Pie>
                    <PieTooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 10 }}
                      formatter={(v: number, name: string) => [
                        `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
                        name,
                      ]}
                    />
                  </PieChart>
                </RcContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-[8px] uppercase tracking-wider text-muted-foreground">Total</div>
                  <div className="text-[11px] font-bold tabular-nums">
                    ${channelTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                {channelSlices.map((s) => {
                  const pct = channelTotal > 0 ? (s.value / channelTotal) * 100 : 0;
                  return (
                    <div key={s.key} className="flex items-center gap-2 text-[10px]">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="flex-1 truncate font-medium">{s.label}</span>
                      <span className="text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Monthly Active Users (MAU) & Cohort Trends ──────── */}
      <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-bold tracking-tight">Monthly Active Users (MAU) &<br />Cohort Trends</h3>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">
                {totalActive.toLocaleString()}
              </span>
              {monthGrowthPct !== null && (
                <span className={`text-xs font-bold ${monthGrowthPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {monthGrowthPct >= 0 ? "+" : ""}{monthGrowthPct.toFixed(1)}%
                </span>
              )}
              <span className="text-xs text-muted-foreground">vs last month</span>
            </div>
          </div>
          <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            {new Date().getFullYear()}
          </span>
        </div>

        {/* The big chart — 12 months of revenue (proxy for MAU since
            we don't always have full sub history). Today's month is
            highlighted with a richer color. */}
        <div className="h-72 mt-4">
          <RcContainer width="100%" height="100%">
            <BarChart data={monthlyRevenue} margin={{ top: 16, right: 0, left: 0, bottom: 0 }}>
              <RcXAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <RcTooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 11, boxShadow: "0 8px 24px -8px rgba(0,0,0,0.10)" }}
                formatter={(v: number, name: string) => {
                  if (name === "revenue") return [`$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, "Revenue"];
                  return [v.toLocaleString(), "New subs"];
                }}
              />
              <Bar dataKey="revenue" radius={[8, 8, 0, 0]} maxBarSize={42}>
                {monthlyRevenue.map((_m, i) => (
                  <RcCell
                    key={i}
                    fill={i === monthlyRevenue.length - 1 ? "rgb(99 102 241)" : "rgb(196 181 253)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </RcContainer>
        </div>
      </section>
    </div>
  );
}

function RetentionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

// ── Customers tab ─────────────────────────────────────────────
function CustomersTabContent({
  ofStats, creators,
}: {
  ofStats: OfCreatorStat[];
  creators: { id: string; name: string }[];
}) {
  const totalActive = ofStats.reduce((s, r) => s + (r.active_subscribers ?? 0), 0);
  const totalExpired = ofStats.reduce((s, r) => s + (r.expired_subscribers ?? 0), 0);
  const total = totalActive + totalExpired;
  const totalSpend = ofStats.reduce((s, r) => s + r.total_earnings, 0);
  const avgPerCreator = creators.length > 0 ? totalActive / creators.length : 0;

  // Per-creator subscriber leaderboard
  const rows = useMemo(() => {
    return creators.map((c) => {
      const stat = ofStats.find((s) => s.creator_id === c.id);
      return {
        id: c.id,
        name: c.name,
        active: stat?.active_subscribers ?? 0,
        expired: stat?.expired_subscribers ?? 0,
        earnings: stat?.total_earnings ?? 0,
      };
    }).sort((a, b) => b.active - a.active);
  }, [creators, ofStats]);
  const maxActive = rows[0]?.active ?? 1;

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">Active Subscribers</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{totalActive.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1">across {creators.length} creators</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">Expired / Churned</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{totalExpired.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{total > 0 ? `${((totalExpired / total) * 100).toFixed(1)}% of total` : ""}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">Avg per Creator</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{avgPerCreator.toFixed(0)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">active subscribers</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">Lifetime Spend</div>
          <div className="text-2xl font-bold tabular-nums mt-1">
            ${totalSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">all creators · all time</div>
        </div>
      </div>

      {/* Per-creator leaderboard */}
      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="h-7 w-7 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Subscribers by Creator</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Active subscribers + lifetime spend, top to bottom</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-12 text-center border border-dashed border-border rounded-xl">
            Sync OnlyFans to populate subscriber data.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = maxActive > 0 ? (r.active / maxActive) * 100 : 0;
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3 transition-colors hover:bg-secondary/30">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white flex items-center justify-center font-semibold text-xs">
                    {r.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.active} active · {r.expired} expired
                    </div>
                  </div>
                  <div className="hidden sm:block flex-1 max-w-[200px]">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold tabular-nums">
                      ${r.earnings.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-[10px] text-muted-foreground">lifetime</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Retention tab ─────────────────────────────────────────────
function RetentionTabContent({
  ofStats, subMetrics,
}: {
  ofStats: OfCreatorStat[];
  subMetrics: OfSubMetric[];
}) {
  const totalActive = ofStats.reduce((s, r) => s + (r.active_subscribers ?? 0), 0);
  const totalExpired = ofStats.reduce((s, r) => s + (r.expired_subscribers ?? 0), 0);
  const total = totalActive + totalExpired;
  const retention = total > 0 ? (totalActive / total) * 100 : 0;

  // 30-day churn / new subs flow
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const recent = subMetrics.filter((r) => r.entry_date >= cutoff);
  const newSubs = recent.reduce((s, r) => s + r.new_count, 0);
  const lost = recent.reduce((s, r) => s + r.lost_count, 0);
  const expired = recent.reduce((s, r) => s + r.expired_count, 0);
  const grossChurn = totalActive > 0 ? ((lost + expired) / Math.max(totalActive, 1)) * 100 : 0;
  const netChurn = newSubs > 0 ? Math.max(0, lost + expired - newSubs) / Math.max(totalActive, 1) * 100 : grossChurn;

  // Daily new vs lost — paired bars over the 30-day window
  const dailySeries = useMemo(() => {
    const map = new Map<string, { date: string; new_subs: number; lost: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      map.set(d, { date: d, new_subs: 0, lost: 0 });
    }
    for (const r of recent) {
      const row = map.get(r.entry_date);
      if (row) {
        row.new_subs += r.new_count;
        row.lost += r.lost_count + r.expired_count;
      }
    }
    return Array.from(map.values());
  }, [recent]);

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">Retention Rate</div>
          <div className="text-2xl font-bold tabular-nums mt-1 text-emerald-600">
            {retention.toFixed(1)}%
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">{totalActive.toLocaleString()} of {total.toLocaleString()} subs</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">Gross Churn (30d)</div>
          <div className="text-2xl font-bold tabular-nums mt-1 text-rose-600">{grossChurn.toFixed(1)}%</div>
          <div className="text-[11px] text-muted-foreground mt-1">{(lost + expired).toLocaleString()} subs lost</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">Net Churn (30d)</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{netChurn.toFixed(1)}%</div>
          <div className="text-[11px] text-muted-foreground mt-1">after accounting for new subs</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">New Subs (30d)</div>
          <div className="text-2xl font-bold tabular-nums mt-1 text-emerald-600">+{newSubs.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1">net flow: {newSubs - (lost + expired) >= 0 ? "+" : ""}{(newSubs - (lost + expired)).toLocaleString()}</div>
        </div>
      </div>

      {/* Daily new vs lost */}
      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="h-7 w-7 rounded-lg bg-violet-500/15 text-violet-600 flex items-center justify-center">
            <TrendingUp className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">New vs lost subscribers</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Last 30 days · daily flow</p>
          </div>
        </div>

        {subMetrics.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-12 text-center border border-dashed border-border rounded-xl">
            No subscriber metrics synced yet — run an OnlyFans sync to populate the churn chart.
          </div>
        ) : (
          <div className="h-64">
            <RcContainer width="100%" height="100%">
              <BarChart data={dailySeries} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
                <RcXAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  axisLine={false}
                  tickLine={false}
                  interval={3}
                />
                <RcTooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 11 }}
                  labelFormatter={(v) => new Date(v as string).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                />
                <Bar dataKey="new_subs" stackId="a" fill="rgb(16 185 129)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lost" stackId="a" fill="rgb(244 63 94)" />
              </BarChart>
            </RcContainer>
          </div>
        )}
      </section>
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
