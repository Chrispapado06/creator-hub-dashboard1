import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Trash2, Edit2, Check, X, ExternalLink, RefreshCw,
  Heart, MessageCircle, Eye, Video, Image as ImageIcon, Radio,
  AlertTriangle, Link2, ArrowLeft, Share2, Bookmark, Unlink, Zap,
  Users, TrendingUp, DollarSign,
} from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatorAvatarOption } from "@/components/CreatorAvatarOption";
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
import { AccountAnalyticsHero, ContentTypeBreakdown } from "@/components/AccountAnalyticsHero";

export const Route = createFileRoute("/tiktok")({ component: TikTokPage });

const TT_PINK = "#FE2C55";
const TT_CYAN = "#25F4EE";
const fmtMoney0 = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtMoney2 = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Types ─────────────────────────────────────────────────────────────────────
type Creator = { id: string; name: string; of_username: string | null; onlyfansapi_acct_id: string | null; avatar_url: string | null };
type TTAccountStatus = "active" | "warm_up" | "shadowbanned" | "banned" | "inactive";
type APIProvider = "scrapecreators" | "apify" | "tikapi";
type TTAccount = {
  id: string;
  creator_id: string;
  username: string;
  status: TTAccountStatus;
  followers_count: number;
  following_count: number;
  posts_count: number;
  total_likes: number;
  bio_link: string | null;
  notes: string | null;
  infloww_campaign_code: number | null;
  last_synced_at: string | null;
  api_provider: APIProvider | null;
  api_key: string | null;
  api_connected_at: string | null;
};
type TTMediaType = "video" | "photo" | "live";
type TTPost = {
  id: string;
  tiktok_account_id: string;
  post_id: string | null;
  caption: string | null;
  media_type: TTMediaType;
  posted_at: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  url: string | null;
  notes: string | null;
};
type InflowwStat = {
  id: string;
  creator_id: string;
  reddit_account_id: string | null;
  campaign_code: number;
  campaign_url: string | null;
  clicks_count: number;
  subscribers_count: number;
  revenue_total: number;
  revenue_per_sub: number;
  spenders_count: number;
  synced_at: string;
};

// ── Style constants ────────────────────────────────────────────────────────────
const accountStatusStyles: Record<TTAccountStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  warm_up: "bg-primary/15 text-primary border-primary/30",
  shadowbanned: "bg-warning/15 text-warning border-warning/30",
  banned: "bg-destructive/15 text-destructive border-destructive/30",
  inactive: "bg-muted text-muted-foreground border-border",
};
const statusLabels: Record<TTAccountStatus, string> = {
  active: "Active",
  warm_up: "Warm Up",
  shadowbanned: "Shadowbanned",
  banned: "Banned",
  inactive: "Inactive",
};
const mediaTypeIcon: Record<TTMediaType, React.ReactNode> = {
  video: <Video className="h-3.5 w-3.5" />,
  photo: <ImageIcon className="h-3.5 w-3.5" />,
  live: <Radio className="h-3.5 w-3.5" />,
};

// ── Main component ─────────────────────────────────────────────────────────────
function TikTokPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>("");
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [accounts, setAccounts] = useState<TTAccount[]>([]);
  const [posts, setPosts] = useState<TTPost[]>([]);
  const [inflowwStats, setInflowwStats] = useState<InflowwStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadCreatorData = async (creatorId: string, silent = false) => {
    if (!creatorId) return;
    if (!silent) setLoading(true);
    const { data: tas } = await supabase
      .from("tiktok_accounts")
      .select("*")
      .eq("creator_id", creatorId)
      .order("created_at");
    const accList = (tas ?? []) as TTAccount[];
    setAccounts(accList);
    const accIds = accList.map((a) => a.id);
    if (accIds.length) {
      const { data: ps } = await supabase
        .from("tiktok_posts")
        .select("*")
        .in("tiktok_account_id", accIds)
        .order("posted_at", { ascending: false });
      setPosts((ps ?? []) as TTPost[]);
    } else {
      setPosts([]);
    }
    const { data: stats } = await supabase
      .from("infloww_tracking_stats")
      .select("*")
      .eq("creator_id", creatorId);
    setInflowwStats((stats ?? []) as InflowwStat[]);
    if (!silent) setLoading(false);
  };

  const loadCreators = async () => {
    const { data, error } = await supabase
      .from("creators")
      .select("id, name, of_username, onlyfansapi_acct_id, avatar_url")
      .order("name");
    if (error) {
      toast.error(`Failed to load creators: ${error.message}`);
      setLoading(false);
      return;
    }
    const cs = (data ?? []) as Creator[];
    setCreators(cs);
    if (cs.length > 0) {
      const first = cs[0];
      setSelectedCreatorId(first.id);
      setSelectedCreator(first);
      await loadCreatorData(first.id);
    } else {
      setLoading(false);
    }
  };

  useEffect(() => { loadCreators(); }, []);

  const handleCreatorChange = (id: string) => {
    const creator = creators.find((c) => c.id === id) ?? null;
    setSelectedCreatorId(id);
    setSelectedCreator(creator);
    loadCreatorData(id);
  };

  const refresh = () => loadCreatorData(selectedCreatorId, true);

  const syncInfloww = async () => {
    if (!selectedCreator) return;
    const key = import.meta.env.VITE_ONLYFANSAPI_KEY as string | undefined;
    if (!key) return toast.error("VITE_ONLYFANSAPI_KEY not set in .env");
    let acctId = selectedCreator.onlyfansapi_acct_id;
    if (!acctId) {
      if (!selectedCreator.of_username) return toast.error("Set the OnlyFans username first on the creator page");
      const res = await fetch("https://app.onlyfansapi.com/api/accounts", { headers: { Authorization: `Bearer ${key}` } });
      const accounts_list = (await res.json()) as { id: string; onlyfans_username: string }[];
      const match = accounts_list.find(
        (a) => a.onlyfans_username?.toLowerCase() === selectedCreator.of_username!.toLowerCase()
      );
      if (!match) return toast.error("Creator not found in OnlyFans API accounts");
      acctId = match.id;
      await supabase.from("creators").update({ onlyfansapi_acct_id: acctId }).eq("id", selectedCreatorId);
    }
    setSyncing(true);
    type OFLink = {
      campaignCode: number;
      campaignUrl: string;
      clicksCount: number;
      subscribersCount: number;
      revenue: { total: number; revenuePerSubscriber: number; spendersCount: number };
    };
    const allLinks: OFLink[] = [];
    let nextUrl: string | null = `https://app.onlyfansapi.com/api/${acctId}/tracking-links`;
    while (nextUrl) {
      const resp = await fetch(nextUrl, { headers: { Authorization: `Bearer ${key}` } });
      const json = await resp.json() as Record<string, unknown>;
      // OnlyFansAPI's tracking-links endpoint ships multiple shapes;
      // accept all of them so the sync doesn't silently parse zero
      // links and freeze cached numbers. See reddit.tsx for the rule.
      const data = json.data;
      let pageLinks: OFLink[] = [];
      if (Array.isArray(data)) pageLinks = data as OFLink[];
      else if (data && typeof data === "object" && Array.isArray((data as { list?: unknown }).list)) pageLinks = (data as { list: OFLink[] }).list;
      else if (Array.isArray(json.list)) pageLinks = json.list as OFLink[];
      else if (Array.isArray(json)) pageLinks = json as unknown as OFLink[];
      allLinks.push(...pageLinks);
      const pagination = json._pagination as { next_page?: string } | undefined;
      nextUrl = pagination?.next_page ?? null;
    }
    if (allLinks.length === 0) {
      setSyncing(false);
      return toast.info("No tracking links found");
    }
    // Dedupe by campaign_code BEFORE the upsert.
    //
    // OnlyFansAPI's /tracking-links endpoint can return the same code
    // more than once when a creator runs multiple OF pages — the
    // campaign exists on each connected account. Postgres rejects an
    // UPSERT batch where two rows share the conflict key
    // (creator_id, campaign_code) with: "ON CONFLICT DO UPDATE
    // command cannot affect row a second time". Keeping the first
    // occurrence per code is fine — the rows are identical.
    const dedupedLinks = Array.from(
      new Map(allLinks.map((l) => [l.campaignCode, l])).values(),
    );
    const upserts = dedupedLinks.map((l) => ({
      creator_id: selectedCreatorId,
      campaign_code: l.campaignCode,
      campaign_url: l.campaignUrl,
      clicks_count: l.clicksCount,
      subscribers_count: l.subscribersCount,
      revenue_total: l.revenue.total,
      revenue_per_sub: l.revenue.revenuePerSubscriber,
      spenders_count: l.revenue.spendersCount,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("infloww_tracking_stats")
      .upsert(upserts, { onConflict: "creator_id,campaign_code" });
    if (error) {
      setSyncing(false);
      return toast.error(error.message);
    }
    await supabase
      .from("revenue_entries")
      .delete()
      .eq("creator_id", selectedCreatorId)
      .eq("source", "infloww-tiktok");
    const today = new Date().toISOString().slice(0, 10);
    const assignedLinks = allLinks.filter((l) =>
      accounts.some((a) => a.infloww_campaign_code === l.campaignCode)
    );
    const revenueRows = assignedLinks
      .filter((l) => l.revenue.total > 0)
      .map((l) => {
        const matched = accounts.find((a) => a.infloww_campaign_code === l.campaignCode)!;
        return {
          creator_id: selectedCreatorId,
          tiktok_account_id: matched.id,
          amount: l.revenue.total,
          currency: "USD",
          entry_date: today,
          source: "infloww-tiktok",
          notes: `c${l.campaignCode} — ${l.subscribersCount} subs, ${l.clicksCount} clicks`,
        };
      });
    if (revenueRows.length > 0) {
      const { error: revErr } = await supabase.from("revenue_entries").insert(revenueRows);
      if (revErr) {
        setSyncing(false);
        return toast.error(revErr.message);
      }
    }
    setSyncing(false);
    const assignedRevenue = assignedLinks.reduce((s, l) => s + l.revenue.total, 0);
    toast.success(`Synced ${assignedLinks.length} assigned links · $${assignedRevenue.toFixed(2)} revenue`);
    refresh();
  };

  return (
    <div className="space-y-6">
      <Toaster />
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <SiTiktok className="h-6 w-6" style={{ color: TT_PINK }} />
          <h1 className="text-3xl font-bold tracking-tight">TikTok</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage TikTok accounts, videos, and revenue per creator.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Creator:</span>
        <Select value={selectedCreatorId} onValueChange={handleCreatorChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select creator" />
          </SelectTrigger>
          <SelectContent>
            {creators.map((c) => (
              <SelectItem key={c.id} value={c.id} textValue={c.name}>
                <CreatorAvatarOption creator={c} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && !selectedCreatorId ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      ) : !selectedCreatorId ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          Select a creator above to manage their TikTok presence.
        </div>
      ) : loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="posts">Videos</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab
              accounts={accounts}
              posts={posts}
              inflowwStats={inflowwStats}
            />
          </TabsContent>
          <TabsContent value="accounts" className="mt-6">
            <AccountsTab
              creatorId={selectedCreatorId}
              accounts={accounts}
              posts={posts}
              inflowwStats={inflowwStats}
              onRefresh={refresh}
            />
          </TabsContent>
          <TabsContent value="posts" className="mt-6">
            <PostsTab accounts={accounts} posts={posts} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="revenue" className="mt-6">
            <RevenueTab
              accounts={accounts}
              inflowwStats={inflowwStats}
              syncing={syncing}
              onSyncInfloww={syncInfloww}
              onRefresh={refresh}
            />
          </TabsContent>
          <TabsContent value="analytics" className="mt-6">
            <AnalyticsTab accounts={accounts} posts={posts} inflowwStats={inflowwStats} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────────────
// Sync Infloww moved out of this hero — it lives on the Revenue tab
// where it's been historically. Keeps the Overview presentation clean
// and avoids a duplicate button two clicks apart.
function OverviewTab({
  accounts, posts, inflowwStats,
}: {
  accounts: TTAccount[];
  posts: TTPost[];
  inflowwStats: InflowwStat[];
}) {
  const totalFollowers = accounts.reduce((s, a) => s + a.followers_count, 0);
  const totalViews = posts.reduce((s, p) => s + p.views_count, 0);
  const totalLikes = posts.reduce((s, p) => s + p.likes_count, 0);
  const totalRevenue = inflowwStats
    .filter((s) => accounts.some((a) => a.infloww_campaign_code === s.campaign_code))
    .reduce((s, i) => s + i.revenue_total, 0);
  const posts30d = posts.filter(
    (p) => Date.now() - new Date(p.posted_at).getTime() < 30 * 24 * 3600_000
  ).length;
  const activeAccounts = accounts.filter((a) => a.status === "active").length;
  const avgEngagement = totalViews > 0 ? (totalLikes / totalViews) * 100 : null;
  const topPost = posts.length > 0 ? posts.reduce((a, b) => (a.views_count > b.views_count ? a : b)) : null;
  const topPostAccount = topPost ? accounts.find((a) => a.id === topPost.tiktok_account_id) : null;

  return (
    <div className="space-y-6">
      {/* ── Brand hero ─────────────────────────────────────────────
          Gradient panel with brand colors; condenses the headline
          numbers into a single glance. Sync button lives here too
          so it's always reachable from the top of the tab. */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card/80 to-[#FE2C55]/10 p-6">
        <div aria-hidden className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[#FE2C55]/15 blur-3xl pointer-events-none" />
        <div aria-hidden className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-[#25F4EE]/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <SiTiktok className="h-3.5 w-3.5" style={{ color: TT_PINK }} />
              TikTok presence
            </div>
            <div className="mt-2 flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl sm:text-4xl font-bold tracking-tight">
                {totalFollowers.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground font-medium">followers</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-sm">
                <span className="font-semibold text-foreground">{activeAccounts}</span>
                <span className="text-muted-foreground"> active </span>
                <span className="text-muted-foreground">/ {accounts.length} total</span>
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {posts.length.toLocaleString()} videos tracked · {posts30d} in last 30d · {totalViews.toLocaleString()} views all-time
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI tiles — gradient icons, denser text hierarchy ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ModernStat
          icon={<Users className="h-3.5 w-3.5" />}
          tone="cyan"
          label="Followers"
          value={totalFollowers.toLocaleString()}
          sub={`${activeAccounts} active`}
        />
        <ModernStat
          icon={<Eye className="h-3.5 w-3.5" />}
          tone="pink"
          label="Total views"
          value={totalViews.toLocaleString()}
          sub={`${posts.length} videos`}
        />
        <ModernStat
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone="amber"
          label="Avg engagement"
          value={avgEngagement != null ? `${avgEngagement.toFixed(2)}%` : "—"}
          sub="likes ÷ views"
        />
        <ModernStat
          icon={<DollarSign className="h-3.5 w-3.5" />}
          tone="emerald"
          label="Infloww revenue"
          value={`$${fmtMoney0(totalRevenue)}`}
          sub="from assigned codes"
        />
      </div>

      {topPost && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-[#FE2C55]" />
            Best performing video
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary/40 text-muted-foreground capitalize">
                  {mediaTypeIcon[topPost.media_type]}
                  {topPost.media_type}
                </span>
                <span className="truncate">{topPost.caption ?? "(no caption)"}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {topPostAccount ? `@${topPostAccount.username} · ` : ""}
                {formatDistanceToNow(new Date(topPost.posted_at), { addSuffix: true })}
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="font-bold text-lg flex items-center gap-1 justify-end">
                  <Eye className="h-3.5 w-3.5" style={{ color: TT_CYAN }} />
                  {topPost.views_count.toLocaleString()}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">views</div>
              </div>
              {topPost.url && (
                <a href={topPost.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <HealthWarnings accounts={accounts} posts={posts} />
    </div>
  );
}

// Polished KPI tile shared across platform Overview tabs. The tone
// param drives a tinted icon chip + matching value color so each
// tile has a hint of its category without clutter.
function ModernStat({
  icon, label, value, sub, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  tone: "pink" | "cyan" | "emerald" | "amber" | "violet";
}) {
  const toneCls = {
    pink:    { chip: "bg-[#FE2C55]/15 text-[#FE2C55]",  value: "" },
    cyan:    { chip: "bg-[#25F4EE]/15 text-[#25F4EE]",  value: "" },
    emerald: { chip: "bg-emerald-500/15 text-emerald-400", value: "text-emerald-400" },
    amber:   { chip: "bg-amber-500/15 text-amber-400",  value: "" },
    violet:  { chip: "bg-violet-500/15 text-violet-400",value: "" },
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:border-border/80 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-7 w-7 rounded-lg flex items-center justify-center ${toneCls.chip}`}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${toneCls.value}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>
    </div>
  );
}

function StatCard({
  label, value, sub, valueClass,
}: {
  label: string;
  value: string | number;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      <div className={`text-2xl font-bold ${valueClass ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

// ── Modern KPI tile shared by Revenue Performance + Engagement Performance.
// Mirrors IG/FB version — uses bg-background/60 to nest cleanly inside a
// parent card section.
function RevKpiCard({
  icon, tone, label, value, sub,
}: {
  icon: React.ReactNode;
  tone: "emerald" | "violet" | "cyan" | "amber" | "pink" | "rose";
  label: string;
  value: string | number;
  sub: string;
}) {
  const TONE_CLS = {
    emerald: "bg-emerald-500/12 text-emerald-600",
    violet:  "bg-violet-500/12 text-violet-600",
    cyan:    "bg-cyan-500/12 text-cyan-600",
    amber:   "bg-amber-500/15 text-amber-600",
    pink:    "bg-pink-500/12 text-pink-600",
    rose:    "bg-rose-500/12 text-rose-600",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4 transition-all hover:bg-background hover:shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-7 w-7 rounded-lg flex items-center justify-center ${TONE_CLS}`}>
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold truncate">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1.5 truncate">{sub}</div>
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

function HealthWarnings({ accounts, posts }: { accounts: TTAccount[]; posts: TTPost[] }) {
  const flagged = accounts.filter((a) => a.status === "shadowbanned" || a.status === "banned" || a.status === "inactive");
  const inactiveAccounts = accounts.filter((a) => {
    if (a.status !== "active") return false;
    const accountPosts = posts.filter((p) => p.tiktok_account_id === a.id);
    if (accountPosts.length === 0) return false;
    const lastPost = accountPosts.reduce((latest, p) =>
      new Date(p.posted_at) > new Date(latest.posted_at) ? p : latest
    );
    return Date.now() - new Date(lastPost.posted_at).getTime() > 7 * 24 * 3600_000;
  });
  if (flagged.length === 0 && inactiveAccounts.length === 0) return null;
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-5">
      <div className="flex items-center gap-2 text-warning mb-3">
        <AlertTriangle className="h-4 w-4" />
        <div className="text-sm font-semibold">Account health</div>
      </div>
      <div className="space-y-2 text-sm">
        {flagged.map((a) => (
          <div key={a.id} className="flex items-center justify-between">
            <span>@{a.username}</span>
            <span className={`text-xs px-2 py-0.5 rounded border ${accountStatusStyles[a.status]}`}>
              {statusLabels[a.status]}
            </span>
          </div>
        ))}
        {inactiveAccounts.map((a) => (
          <div key={a.id} className="flex items-center justify-between text-muted-foreground">
            <span>@{a.username}</span>
            <span className="text-xs">No videos in 7+ days</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Accounts Tab ───────────────────────────────────────────────────────────────
function AccountsTab({
  creatorId, accounts, posts, inflowwStats, onRefresh,
}: {
  creatorId: string;
  accounts: TTAccount[];
  posts: TTPost[];
  inflowwStats: InflowwStat[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [accForm, setAccForm] = useState({ username: "", status: "active" as TTAccountStatus, bio_link: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    username: "",
    followers_count: "",
    following_count: "",
    posts_count: "",
    total_likes: "",
    bio_link: "",
    notes: "",
    infloww_campaign_code: "",
  });
  const [detailAccount, setDetailAccount] = useState<TTAccount | null>(null);

  const onAddAccount = async () => {
    if (!accForm.username.trim()) return toast.error("Username is required");
    const { error } = await supabase.from("tiktok_accounts").insert({
      creator_id: creatorId,
      username: accForm.username.trim().replace(/^@/, ""),
      status: accForm.status,
      bio_link: accForm.bio_link.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("TikTok account added");
    setAccForm({ username: "", status: "active", bio_link: "" });
    setOpen(false);
    onRefresh();
  };

  const onDeleteAccount = async (id: string) => {
    const { error } = await supabase.from("tiktok_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Account removed");
    onRefresh();
  };

  const onUpdateStatus = async (id: string, status: TTAccountStatus) => {
    const { error } = await supabase.from("tiktok_accounts").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    onRefresh();
  };

  const startEdit = (a: TTAccount) => {
    setEditForm({
      username: a.username,
      followers_count: a.followers_count.toString(),
      following_count: a.following_count.toString(),
      posts_count: a.posts_count.toString(),
      total_likes: a.total_likes.toString(),
      bio_link: a.bio_link ?? "",
      notes: a.notes ?? "",
      infloww_campaign_code: a.infloww_campaign_code?.toString() ?? "",
    });
    setEditingId(a.id);
  };

  const saveEdit = async (id: string) => {
    const code = editForm.infloww_campaign_code.trim();
    const payload = {
      username: editForm.username.trim().replace(/^@/, ""),
      followers_count: parseInt(editForm.followers_count) || 0,
      following_count: parseInt(editForm.following_count) || 0,
      posts_count: parseInt(editForm.posts_count) || 0,
      total_likes: parseInt(editForm.total_likes) || 0,
      bio_link: editForm.bio_link.trim() || null,
      notes: editForm.notes.trim() || null,
      infloww_campaign_code: code ? parseInt(code) : null,
      last_synced_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("tiktok_accounts").update(payload).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditingId(null);
    onRefresh();
  };

  if (detailAccount) {
    const live = accounts.find((a) => a.id === detailAccount.id) ?? detailAccount;
    return (
      <AccountDetailView
        account={live}
        posts={posts}
        inflowwStats={inflowwStats}
        onBack={() => setDetailAccount(null)}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {accounts.length} account{accounts.length !== 1 ? "s" : ""} linked.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />Add account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add TikTok account</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input
                  value={accForm.username}
                  onChange={(e) => setAccForm({ ...accForm, username: e.target.value })}
                  placeholder="luna_xo"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={accForm.status} onValueChange={(v) => setAccForm({ ...accForm, status: v as TTAccountStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="warm_up">Warm Up</SelectItem>
                    <SelectItem value="shadowbanned">Shadowbanned</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bio link <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  value={accForm.bio_link}
                  onChange={(e) => setAccForm({ ...accForm, bio_link: e.target.value })}
                  placeholder="https://onlyfans.com/luna_xo"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onAddAccount}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No TikTok accounts linked yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Username</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Followers</th>
                <th className="text-right font-medium px-4 py-3">Following</th>
                <th className="text-right font-medium px-4 py-3">Videos</th>
                <th className="text-right font-medium px-4 py-3">Total likes</th>
                <th className="text-left font-medium px-4 py-3">Bio link</th>
                <th className="text-right font-medium px-4 py-3">Campaign</th>
                <th className="text-left font-medium px-4 py-3">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const isEdit = editingId === a.id;
                return (
                  <tr key={a.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                    {isEdit ? (
                      <>
                        <td className="px-4 py-2">
                          <Input
                            className="h-7 text-xs w-32"
                            value={editForm.username}
                            onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs text-muted-foreground italic">use status pill →</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            className="h-7 text-xs w-24 text-right ml-auto"
                            type="number"
                            value={editForm.followers_count}
                            onChange={(e) => setEditForm({ ...editForm, followers_count: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            className="h-7 text-xs w-24 text-right ml-auto"
                            type="number"
                            value={editForm.following_count}
                            onChange={(e) => setEditForm({ ...editForm, following_count: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            className="h-7 text-xs w-20 text-right ml-auto"
                            type="number"
                            value={editForm.posts_count}
                            onChange={(e) => setEditForm({ ...editForm, posts_count: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            className="h-7 text-xs w-24 text-right ml-auto"
                            type="number"
                            value={editForm.total_likes}
                            onChange={(e) => setEditForm({ ...editForm, total_likes: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            className="h-7 text-xs w-40"
                            placeholder="https://…"
                            value={editForm.bio_link}
                            onChange={(e) => setEditForm({ ...editForm, bio_link: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            className="h-7 text-xs w-20 text-right ml-auto"
                            type="number"
                            placeholder="69"
                            value={editForm.infloww_campaign_code}
                            onChange={(e) => setEditForm({ ...editForm, infloww_campaign_code: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            className="h-7 text-xs w-36"
                            placeholder="Notes"
                            value={editForm.notes}
                            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => saveEdit(a.id)}
                              className="rounded p-1 hover:bg-success/20 text-success transition-colors"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded p-1 hover:bg-secondary text-muted-foreground transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setDetailAccount(a)}
                              className="font-medium hover:text-primary text-left"
                              title="View analytics"
                            >
                              @{a.username}
                            </button>
                            <a
                              href={`https://tiktok.com/@${a.username}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground/60 hover:text-primary"
                              title="Open on TikTok"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Select value={a.status} onValueChange={(v) => onUpdateStatus(a.id, v as TTAccountStatus)}>
                            <SelectTrigger className={`h-6 w-32 text-xs px-2 border ${accountStatusStyles[a.status]}`}>
                              <SelectValue>{statusLabels[a.status]}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="warm_up">Warm Up</SelectItem>
                              <SelectItem value="shadowbanned">Shadowbanned</SelectItem>
                              <SelectItem value="banned">Banned</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{a.followers_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{a.following_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{a.posts_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{a.total_likes.toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                          {a.bio_link ? (
                            <a href={a.bio_link} target="_blank" rel="noreferrer" className="hover:text-primary inline-flex items-center gap-1">
                              <Link2 className="h-3 w-3" />
                              <span className="truncate">{a.bio_link.replace(/^https?:\/\//, "")}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {a.infloww_campaign_code != null ? `c${a.infloww_campaign_code}` : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">
                          {a.notes ?? <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(a)}
                              className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
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
                                  <AlertDialogTitle>Remove @{a.username}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will also delete all videos tracked under this account.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => onDeleteAccount(a.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </>
                    )}
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

// ── Account Detail View (full-page) ────────────────────────────────────────────
function AccountDetailView({
  account, posts, inflowwStats, onBack, onRefresh,
}: {
  account: TTAccount;
  posts: TTPost[];
  inflowwStats: InflowwStat[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  const accountPosts = useMemo(
    () => posts.filter((p) => p.tiktok_account_id === account.id),
    [account, posts]
  );

  // ── TikTok API connection state + sync ────────────────────────────────────
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [apiForm, setApiForm] = useState<{ provider: APIProvider; key: string }>({
    provider: "scrapecreators",
    key: "",
  });
  const [apiSyncing, setApiSyncing] = useState(false);
  const isApiConnected = !!(account.api_provider && account.api_key);

  const runTikTokSync = async (
    provider: APIProvider,
    key: string,
    username: string
  ): Promise<{ ok: true; profile: { followers: number; following: number; posts: number; totalLikes: number; bio: string | null }; videos: { id: string; caption: string | null; postedAt: string; views: number; likes: number; comments: number; shares: number; saves: number; url: string | null }[] } | { ok: false; error: string }> => {
    try {
      if (provider === "scrapecreators") {
        const base = "https://api.scrapecreators.com/v1";
        const headers = { "x-api-key": key };
        const profRes = await fetch(`${base}/tiktok/profile?handle=${encodeURIComponent(username)}`, { headers });
        if (!profRes.ok) {
          return { ok: false, error: `ScrapeCreators profile request failed: ${profRes.status}` };
        }
        const profJson = (await profRes.json()) as {
          user?: { uniqueId?: string; nickname?: string; signature?: string; followerCount?: number; followingCount?: number; videoCount?: number; heartCount?: number };
          stats?: { followerCount?: number; followingCount?: number; videoCount?: number; heartCount?: number };
          error?: string;
        };
        if (profJson.error) return { ok: false, error: profJson.error };
        const stats = profJson.stats ?? {};
        const user = profJson.user ?? {};
        const profile = {
          followers: stats.followerCount ?? user.followerCount ?? account.followers_count,
          following: stats.followingCount ?? user.followingCount ?? account.following_count,
          posts: stats.videoCount ?? user.videoCount ?? account.posts_count,
          totalLikes: stats.heartCount ?? user.heartCount ?? account.total_likes,
          bio: user.signature ?? null,
        };
        const vidRes = await fetch(
          `${base}/tiktok/profile/videos?handle=${encodeURIComponent(username)}&trim=true`,
          { headers }
        );
        if (!vidRes.ok) {
          return { ok: false, error: `ScrapeCreators videos request failed: ${vidRes.status}` };
        }
        const vidJson = (await vidRes.json()) as {
          videos?: {
            id?: string;
            desc?: string;
            createTime?: number;
            stats?: { playCount?: number; diggCount?: number; commentCount?: number; shareCount?: number; collectCount?: number };
          }[];
          error?: string;
        };
        if (vidJson.error) return { ok: false, error: vidJson.error };
        const videos = (vidJson.videos ?? []).slice(0, 25).map((v) => ({
          id: v.id ?? "",
          caption: v.desc ?? null,
          postedAt: v.createTime
            ? new Date(v.createTime * 1000).toISOString()
            : new Date().toISOString(),
          views: v.stats?.playCount ?? 0,
          likes: v.stats?.diggCount ?? 0,
          comments: v.stats?.commentCount ?? 0,
          shares: v.stats?.shareCount ?? 0,
          saves: v.stats?.collectCount ?? 0,
          url: v.id ? `https://tiktok.com/@${username}/video/${v.id}` : null,
        }));
        return { ok: true, profile, videos };
      }
      // Future providers go here
      return { ok: false, error: `Provider "${provider}" is recognized but not yet implemented. Use ScrapeCreators for v1.` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Network error" };
    }
  };

  const applySync = async (provider: APIProvider, key: string) => {
    const result = await runTikTokSync(provider, key, account.username);
    if (!result.ok) return result;
    const { profile, videos } = result;
    const updatePayload = {
      followers_count: profile.followers,
      following_count: profile.following,
      posts_count: profile.posts,
      total_likes: profile.totalLikes,
      bio_link: account.bio_link ?? profile.bio ?? null,
      api_provider: provider,
      api_key: key,
      api_connected_at: account.api_connected_at ?? new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    };
    const { error: updErr } = await supabase
      .from("tiktok_accounts")
      .update(updatePayload)
      .eq("id", account.id);
    if (updErr) return { ok: false as const, error: updErr.message };
    const validVideos = videos.filter((v) => v.id);
    if (validVideos.length > 0) {
      const upserts = validVideos.map((v) => ({
        tiktok_account_id: account.id,
        post_id: v.id,
        caption: v.caption,
        media_type: "video" as const,
        posted_at: v.postedAt,
        views_count: v.views,
        likes_count: v.likes,
        comments_count: v.comments,
        shares_count: v.shares,
        saves_count: v.saves,
        url: v.url,
      }));
      const { error: postErr } = await supabase
        .from("tiktok_posts")
        .upsert(upserts, { onConflict: "tiktok_account_id,post_id" });
      if (postErr) return { ok: false as const, error: postErr.message };
    }
    return { ok: true as const, videoCount: validVideos.length };
  };

  const onConnectAPI = async () => {
    if (!apiForm.key.trim()) {
      toast.error("API key is required.");
      return;
    }
    setApiSyncing(true);
    const result = await applySync(apiForm.provider, apiForm.key.trim());
    setApiSyncing(false);
    if (!result.ok) {
      toast.error(`API sync failed: ${result.error}`);
      return;
    }
    toast.success(`Connected — ${result.videoCount} video${result.videoCount === 1 ? "" : "s"} synced`);
    setApiDialogOpen(false);
    setApiForm({ provider: "scrapecreators", key: "" });
    onRefresh();
  };

  const onRefreshAPI = async () => {
    if (!account.api_provider || !account.api_key) return;
    setApiSyncing(true);
    const result = await applySync(account.api_provider, account.api_key);
    setApiSyncing(false);
    if (!result.ok) {
      toast.error(`Sync failed: ${result.error}`);
      return;
    }
    toast.success(`Synced — ${result.videoCount} video${result.videoCount === 1 ? "" : "s"} refreshed`);
    onRefresh();
  };

  const onDisconnectAPI = async () => {
    const { error } = await supabase
      .from("tiktok_accounts")
      .update({ api_provider: null, api_key: null, api_connected_at: null })
      .eq("id", account.id);
    if (error) return toast.error(error.message);
    toast.success("API disconnected");
    onRefresh();
  };

  const stats = useMemo(() => {
    if (accountPosts.length === 0) return null;
    const totalViews = accountPosts.reduce((s, p) => s + p.views_count, 0);
    const totalLikes = accountPosts.reduce((s, p) => s + p.likes_count, 0);
    const totalComments = accountPosts.reduce((s, p) => s + p.comments_count, 0);
    const totalShares = accountPosts.reduce((s, p) => s + p.shares_count, 0);
    const totalSaves = accountPosts.reduce((s, p) => s + p.saves_count, 0);
    const avgViews = totalViews / accountPosts.length;
    const avgLikes = totalLikes / accountPosts.length;
    const avgComments = totalComments / accountPosts.length;
    const engagement =
      totalViews > 0 ? ((totalLikes + totalComments + totalShares + totalSaves) / totalViews) * 100 : null;
    const last30d = accountPosts.filter(
      (p) => Date.now() - new Date(p.posted_at).getTime() < 30 * 24 * 3600_000
    ).length;
    return { totalViews, totalLikes, totalComments, totalShares, totalSaves, avgViews, avgLikes, avgComments, engagement, last30d };
  }, [accountPosts]);

  const byMediaType = useMemo(() => {
    const groups: Record<TTMediaType, { count: number; views: number; likes: number; comments: number }> = {
      video: { count: 0, views: 0, likes: 0, comments: 0 },
      photo: { count: 0, views: 0, likes: 0, comments: 0 },
      live: { count: 0, views: 0, likes: 0, comments: 0 },
    };
    for (const p of accountPosts) {
      const g = groups[p.media_type];
      g.count++;
      g.views += p.views_count;
      g.likes += p.likes_count;
      g.comments += p.comments_count;
    }
    return groups;
  }, [accountPosts]);

  const recentPosts = useMemo(
    () => [...accountPosts]
      .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
      .slice(0, 5),
    [accountPosts]
  );

  // (revenueStat memo removed — the new Revenue Performance card
  // computes its own roll-up across *all* matching tracking-link rows.)

  // Posting cadence: posts per week, last 12 weeks
  const cadenceData = useMemo(() => {
    const weeks: { label: string; posts: number; avgViews: number }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dow = now.getDay();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - dow);
    for (let i = 11; i >= 0; i--) {
      const start = new Date(thisWeekStart);
      start.setDate(thisWeekStart.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const weekPosts = accountPosts.filter((p) => {
        const t = new Date(p.posted_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      });
      const totalViews = weekPosts.reduce((s, p) => s + p.views_count, 0);
      weeks.push({
        label: format(start, "MMM d"),
        posts: weekPosts.length,
        avgViews: weekPosts.length > 0 ? Math.round(totalViews / weekPosts.length) : 0,
      });
    }
    return weeks;
  }, [accountPosts]);

  // Avg engagement by day of week
  const dayOfWeekData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const buckets = days.map((d) => ({ day: d, totalViews: 0, count: 0 }));
    for (const p of accountPosts) {
      const dow = new Date(p.posted_at).getDay();
      buckets[dow].totalViews += p.views_count;
      buckets[dow].count++;
    }
    return buckets.map((b) => ({
      day: b.day,
      avgViews: b.count > 0 ? Math.round(b.totalViews / b.count) : 0,
      posts: b.count,
    }));
  }, [accountPosts]);

  // By media type chart-friendly
  const mediaTypeChart = useMemo(() => {
    return (Object.entries(byMediaType) as [TTMediaType, { count: number; views: number; likes: number; comments: number }][])
      .filter(([, g]) => g.count > 0)
      .map(([type, g]) => ({
        type: type[0].toUpperCase() + type.slice(1),
        avgViews: Math.round(g.views / g.count),
        avgLikes: Math.round(g.likes / g.count),
        count: g.count,
      }))
      .sort((a, b) => b.avgViews - a.avgViews);
  }, [byMediaType]);

  // Top posts by total engagement (views weighted heavy)
  const topPosts = useMemo(() => {
    return [...accountPosts]
      .sort(
        (a, b) =>
          b.views_count - a.views_count
      )
      .slice(0, 10);
  }, [accountPosts]);

  // Auto-generated insights
  const insights = useMemo(() => {
    const out: string[] = [];
    if (mediaTypeChart.length >= 2) {
      const best = mediaTypeChart[0];
      const worst = mediaTypeChart[mediaTypeChart.length - 1];
      if (best.avgViews > 0 && worst.avgViews > 0 && best.avgViews >= worst.avgViews * 1.5) {
        const ratio = (best.avgViews / worst.avgViews).toFixed(1);
        out.push(`${best.type}s get ${ratio}× more views on average than ${worst.type}s — lean into ${best.type}s.`);
      }
    }
    const dowSorted = [...dayOfWeekData].filter((d) => d.posts > 0).sort((a, b) => b.avgViews - a.avgViews);
    if (dowSorted.length >= 2) {
      const best = dowSorted[0];
      const overallAvg = dowSorted.reduce((s, d) => s + d.avgViews, 0) / dowSorted.length;
      if (best.avgViews > overallAvg * 1.25) {
        const pct = Math.round(((best.avgViews - overallAvg) / overallAvg) * 100);
        out.push(`Posts on ${best.day} average ${pct}% more views — schedule peak content for ${best.day}s.`);
      }
    }
    const recent4 = cadenceData.slice(-4).reduce((s, w) => s + w.posts, 0);
    const previous8 = cadenceData.slice(0, 8).reduce((s, w) => s + w.posts, 0);
    const recentRate = recent4 / 4;
    const previousRate = previous8 / 8;
    if (previousRate > 0 && recentRate < previousRate * 0.7) {
      out.push(`Posting frequency dropped to ${recentRate.toFixed(1)}/week (was ${previousRate.toFixed(1)}/week) — TikTok algo punishes inconsistency.`);
    } else if (recentRate >= 7) {
      out.push(`Strong cadence: ${recentRate.toFixed(1)} posts/week. Keep it daily.`);
    } else if (recentRate < 3 && accountPosts.length > 0) {
      out.push(`Only ${recentRate.toFixed(1)} posts/week recently — TikTok favors daily posting. Aim for 1–3/day.`);
    }
    if (stats?.engagement != null) {
      if (stats.engagement >= 10) {
        out.push(`Engagement rate of ${stats.engagement.toFixed(1)}% is exceptional (TikTok average ~5–9%).`);
      } else if (stats.engagement < 4) {
        out.push(`Engagement rate of ${stats.engagement.toFixed(2)}% is below the ~5–9% TikTok benchmark — try stronger hooks in the first 3 seconds.`);
      }
    }
    return out;
  }, [mediaTypeChart, dayOfWeekData, cadenceData, accountPosts.length, stats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to accounts
        </Button>
        <a
          href={`https://tiktok.com/@${account.username}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          Open on TikTok
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="flex items-center gap-3 pb-4 border-b border-border flex-wrap">
        <SiTiktok className="h-7 w-7" style={{ color: TT_PINK }} />
        <h2 className="text-2xl font-bold tracking-tight">@{account.username}</h2>
        <span className={`text-xs px-2 py-0.5 rounded border ${accountStatusStyles[account.status]}`}>
          {statusLabels[account.status]}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {isApiConnected ? (
            <>
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Connected via {account.api_provider}
                {account.api_connected_at && (
                  <span className="text-muted-foreground/60">
                    · {formatDistanceToNow(new Date(account.api_connected_at), { addSuffix: true })}
                  </span>
                )}
              </span>
              <Button variant="outline" size="sm" onClick={onRefreshAPI} disabled={apiSyncing}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${apiSyncing ? "animate-spin" : ""}`} />
                {apiSyncing ? "Syncing…" : "Refresh from API"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect API?</AlertDialogTitle>
                    <AlertDialogDescription>
                      We'll clear the saved API key. Synced videos and follower counts stay; auto-refresh stops working.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDisconnectAPI}>Disconnect</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <Button size="sm" onClick={() => setApiDialogOpen(true)}>
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Connect API
            </Button>
          )}
        </div>
      </div>

      <Dialog open={apiDialogOpen} onOpenChange={setApiDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Connect API for @{account.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground space-y-2">
              <div>
                Auto-pulls follower count, total likes, and the last 25 videos (views, likes, comments, shares, saves) from a third-party scraper API.
              </div>
              <div className="font-medium text-foreground">Pick a provider:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  <strong>ScrapeCreators</strong> (recommended for v1) — pay per request, ~$0.001/profile, ~$0.001/video.
                  Sign up at <a className="text-primary hover:underline" href="https://scrapecreators.com" target="_blank" rel="noreferrer">scrapecreators.com</a>, copy your API key from the dashboard.
                </li>
                <li>
                  <strong>Apify</strong> & <strong>TikAPI</strong> — credentials saved but sync isn't wired yet. ScrapeCreators is the only end-to-end option in v1.
                </li>
              </ul>
              <div className="text-foreground font-medium pt-1">No TikTok app review needed</div>
              <div>The third-party API does the scraping. You only need their API key.</div>
            </div>
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={apiForm.provider} onValueChange={(v) => setApiForm({ ...apiForm, provider: v as APIProvider })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scrapecreators">ScrapeCreators</SelectItem>
                  <SelectItem value="apify">Apify (saves key only — manual sync)</SelectItem>
                  <SelectItem value="tikapi">TikAPI (saves key only — manual sync)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>API key</Label>
              <Input
                type="password"
                placeholder="sk-..."
                value={apiForm.key}
                onChange={(e) => setApiForm({ ...apiForm, key: e.target.value })}
              />
              <div className="text-xs text-muted-foreground">
                Stored in your Supabase DB. Treat like a password.
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApiDialogOpen(false)}>Cancel</Button>
            <Button onClick={onConnectAPI} disabled={apiSyncing}>
              {apiSyncing ? "Connecting…" : "Connect & sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Flux-style Detailed Analytics hero.
          Profile photo + handle + bio on the left, stat cards (Total Likes
          / Engagement Rate / Revenue) on the right. Drops a Content Type
          Breakdown panel below. */}
      {(() => {
        // Revenue per account = sum of revenue_total from infloww
        // tracking-link rows whose campaign_code matches this account's
        // infloww_campaign_code.
        const accountRevenue = account.infloww_campaign_code != null
          ? inflowwStats
              .filter((s) => s.campaign_code === account.infloww_campaign_code)
              .reduce((sum, s) => sum + (s.revenue_total ?? 0), 0)
          : 0;
        // Aggregate post-level metrics for the breakdown panel.
        const totalViews = accountPosts.reduce((s, p) => s + (p.views_count ?? 0), 0);
        const totalLikes = accountPosts.reduce((s, p) => s + (p.likes_count ?? 0), 0);
        const totalComments = accountPosts.reduce((s, p) => s + (p.comments_count ?? 0), 0);
        const totalShares = accountPosts.reduce((s, p) => s + (p.shares_count ?? 0), 0);
        const totalSaves = accountPosts.reduce((s, p) => s + (p.saves_count ?? 0), 0);
        const avgViews = accountPosts.length > 0 ? totalViews / accountPosts.length : 0;
        const avgEngagementPerPost = accountPosts.length > 0
          ? (totalLikes + totalComments + totalShares + totalSaves) / accountPosts.length
          : 0;
        const engagementPct = stats?.engagement ?? 0;
        return (
          <>
            <AccountAnalyticsHero
              avatarUrl={null}
              displayName={account.username.toUpperCase()}
              username={account.username}
              verified={account.followers_count >= 10000}
              bio={account.bio_link ?? account.notes ?? null}
              joinedLabel={account.api_connected_at
                ? `Connected ${format(new Date(account.api_connected_at), "MMM yyyy")}`
                : null}
              brandIcon={<SiTiktok className="h-3.5 w-3.5" style={{ color: TT_PINK }} />}
              brandColor={TT_PINK}
              totalLikes={{
                value: account.total_likes >= 1_000_000
                  ? `${(account.total_likes / 1_000_000).toFixed(1)}M`
                  : account.total_likes >= 1_000
                    ? `${(account.total_likes / 1_000).toFixed(1)}K`
                    : account.total_likes.toLocaleString(),
                delta: null,
              }}
              engagementRate={{
                value: engagementPct > 0 ? `${engagementPct.toFixed(2)}%` : "—",
                delta: null,
              }}
              revenue={{
                value: `$${fmtMoney0(accountRevenue)}`,
                delta: null,
                deltaLabel: account.infloww_campaign_code
                  ? `from campaign ${account.infloww_campaign_code}`
                  : "no campaign linked",
              }}
            />
            <ContentTypeBreakdown
              brandColor={TT_PINK}
              leftStats={[
                { label: "Total Views", value: totalViews.toLocaleString() },
                { label: "Unique Posts", value: accountPosts.length.toLocaleString() },
                { label: "Avg Views", value: Math.round(avgViews).toLocaleString() },
                { label: "Followers", value: account.followers_count.toLocaleString() },
              ]}
              rightStats={[
                { label: "Avg Likes", value: stats ? Math.round(stats.avgLikes).toLocaleString() : "—" },
                { label: "Avg Comments", value: stats ? Math.round(stats.avgComments).toLocaleString() : "—" },
                { label: "Total Shares", value: totalShares.toLocaleString() },
                { label: "Avg Engagement", value: Math.round(avgEngagementPerPost).toLocaleString() },
              ]}
            />
          </>
        );
      })()}

      {accountPosts.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-center text-sm text-muted-foreground">
          No videos tracked yet — charts and insights below will populate as soon as you add videos on the <strong>Videos</strong> tab.
        </div>
      )}

      {/* ── Revenue performance card ───────────────────────────────
          Big modern panel showing every dollar this specific account
          has driven via Infloww tracking links matched on
          campaign_code. Empty state when no campaign is linked. */}
      {(() => {
        const accountLinks = account.infloww_campaign_code != null
          ? inflowwStats.filter((s) => s.campaign_code === account.infloww_campaign_code)
          : [];
        const totalRevenue = accountLinks.reduce((s, r) => s + (r.revenue_total ?? 0), 0);
        const totalClicks = accountLinks.reduce((s, r) => s + (r.clicks_count ?? 0), 0);
        const totalSubs = accountLinks.reduce((s, r) => s + (r.subscribers_count ?? 0), 0);
        const totalSpenders = accountLinks.reduce((s, r) => s + (r.spenders_count ?? 0), 0);
        const conversion = totalClicks > 0 ? (totalSubs / totalClicks) * 100 : 0;
        const revenuePerSub = totalSubs > 0 ? totalRevenue / totalSubs : 0;
        const revenuePerClick = totalClicks > 0 ? totalRevenue / totalClicks : 0;
        return (
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <span
                className="h-7 w-7 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${TT_PINK}20`, color: TT_PINK }}
              >
                <DollarSign className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Revenue Performance</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Every dollar this account has driven, sourced from Infloww tracking
                </p>
              </div>
            </div>
            {account.infloww_campaign_code == null ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                Set this account's <strong>Infloww campaign code</strong> in the Edit dialog to attribute revenue here.
              </div>
            ) : accountLinks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                Campaign <span className="font-mono">{account.infloww_campaign_code}</span> is linked but Infloww hasn't returned any traffic for it yet. Click <strong>Sync Infloww</strong> on the Revenue page to refresh.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <RevKpiCard
                    icon={<DollarSign className="h-4 w-4" />}
                    tone="emerald"
                    label="Total Revenue"
                    value={`$${fmtMoney0(totalRevenue)}`}
                    sub={`${accountLinks.length} link${accountLinks.length === 1 ? "" : "s"} active`}
                  />
                  <RevKpiCard
                    icon={<Users className="h-4 w-4" />}
                    tone="violet"
                    label="Subscribers"
                    value={totalSubs.toLocaleString()}
                    sub={`${totalSpenders.toLocaleString()} spent money`}
                  />
                  <RevKpiCard
                    icon={<Eye className="h-4 w-4" />}
                    tone="cyan"
                    label="Total Clicks"
                    value={totalClicks.toLocaleString()}
                    sub={`$${revenuePerClick.toFixed(2)} per click`}
                  />
                  <RevKpiCard
                    icon={<TrendingUp className="h-4 w-4" />}
                    tone="amber"
                    label="Click → Sub"
                    value={`${conversion.toFixed(2)}%`}
                    sub={`$${revenuePerSub.toFixed(2)} per sub`}
                  />
                </div>
                {accountLinks.length > 1 && (
                  <div className="overflow-hidden rounded-xl border border-border">
                    <div className="px-3 py-2 border-b border-border bg-muted/30">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                        Per-link breakdown
                      </div>
                    </div>
                    <table className="w-full text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">
                        <tr>
                          <th className="text-left px-3 py-2">Campaign</th>
                          <th className="text-right px-3 py-2">Clicks</th>
                          <th className="text-right px-3 py-2">Subs</th>
                          <th className="text-right px-3 py-2">CVR</th>
                          <th className="text-right px-3 py-2">Revenue</th>
                          <th className="text-right px-3 py-2">$ / sub</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountLinks
                          .slice()
                          .sort((a, b) => b.revenue_total - a.revenue_total)
                          .map((l) => {
                            const cvr = l.clicks_count > 0
                              ? (l.subscribers_count / l.clicks_count) * 100
                              : 0;
                            return (
                              <tr key={l.id} className="border-t border-border bg-card hover:bg-secondary/30">
                                <td className="px-3 py-2 font-mono">c{l.campaign_code}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{l.clicks_count.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{l.subscribers_count.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{cvr.toFixed(2)}%</td>
                                <td className="px-3 py-2 text-right font-bold tabular-nums">${fmtMoney0(l.revenue_total)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                  {l.subscribers_count > 0 ? `$${(l.revenue_total / l.subscribers_count).toFixed(2)}` : "—"}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        );
      })()}

      {/* ── Engagement Performance ─────────────────────────────────
          Modern 4-tile KPI strip — Avg Views / Avg Likes / Avg
          Comments / Engagement Rate. Replaces the old plain
          StatCard row with the same brand-tinted icon-chip pattern
          used on the dashboard. */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <span
            className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${TT_PINK}20`, color: TT_PINK }}
          >
            <Heart className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold tracking-tight">Engagement Performance</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Per-post averages and engagement rate across {accountPosts.length} tracked post{accountPosts.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <RevKpiCard
            icon={<Eye className="h-4 w-4" />}
            tone="cyan"
            label="Avg Views"
            value={stats ? Math.round(stats.avgViews).toLocaleString() : "—"}
            sub={stats ? `${stats.totalViews.toLocaleString()} total` : "no posts yet"}
          />
          <RevKpiCard
            icon={<Heart className="h-4 w-4" />}
            tone="rose"
            label="Avg Likes"
            value={stats ? Math.round(stats.avgLikes).toLocaleString() : "—"}
            sub={stats ? `${stats.totalLikes.toLocaleString()} total` : ""}
          />
          <RevKpiCard
            icon={<MessageCircle className="h-4 w-4" />}
            tone="violet"
            label="Avg Comments"
            value={stats ? Math.round(stats.avgComments).toLocaleString() : "—"}
            sub={stats ? `${stats.totalComments.toLocaleString()} total` : ""}
          />
          <RevKpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            tone="emerald"
            label="Engagement Rate"
            value={stats?.engagement != null ? `${stats.engagement.toFixed(2)}%` : "—"}
            sub="(L+C+S+Sv) / views"
          />
        </div>
      </section>

      {/* Insights */}
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

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Posting cadence" sub="videos per week, last 12 weeks">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cadenceData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar dataKey="posts" fill={TT_PINK} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Avg views per week" sub="momentum check, last 12 weeks">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cadenceData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(v: number) => [v.toLocaleString(), "Avg views"]}
              />
              <Bar dataKey="avgViews" fill={TT_CYAN} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Best day to post" sub="avg views by day of week">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dayOfWeekData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(v: number) => [v.toLocaleString(), "Avg views"]}
              />
              <Bar dataKey="avgViews" radius={[3, 3, 0, 0]}>
                {dayOfWeekData.map((d, i) => {
                  const max = Math.max(...dayOfWeekData.map((x) => x.avgViews));
                  const isMax = d.avgViews > 0 && d.avgViews === max;
                  return <Cell key={i} fill={isMax ? TT_PINK : `${TT_CYAN}80`} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Performance by type" sub="avg views per video (best at top)">
          {mediaTypeChart.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
              No videos yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mediaTypeChart} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="type" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={70} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(v: number) => [v.toLocaleString(), "Avg views"]}
                />
                <Bar dataKey="avgViews" fill={TT_PINK} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Top performing posts */}
      {topPosts.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Top performing videos <span className="text-muted-foreground/60 normal-case font-normal">(by views)</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">#</th>
                  <th className="text-left font-medium px-3 py-2">Caption</th>
                  <th className="text-left font-medium px-3 py-2">Type</th>
                  <th className="text-right font-medium px-3 py-2">Views</th>
                  <th className="text-right font-medium px-3 py-2">Likes</th>
                  <th className="text-right font-medium px-3 py-2">Comments</th>
                  <th className="text-right font-medium px-3 py-2">Shares</th>
                  <th className="text-right font-medium px-3 py-2">Saves</th>
                  <th className="text-right font-medium px-3 py-2">Eng %</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {topPosts.map((p, i) => {
                  const eng =
                    p.views_count > 0
                      ? ((p.likes_count + p.comments_count + p.shares_count + p.saves_count) / p.views_count) * 100
                      : null;
                  return (
                    <tr key={p.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{i + 1}</td>
                      <td className="px-3 py-2 max-w-[260px]">
                        <div className="truncate">{p.caption ?? <span className="italic text-muted-foreground">(no caption)</span>}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(p.posted_at), "MMM d, yyyy")}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-border bg-secondary/40 text-muted-foreground capitalize">
                          {mediaTypeIcon[p.media_type]}
                          {p.media_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{p.views_count.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{p.likes_count.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{p.comments_count.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{p.shares_count.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{p.saves_count.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {eng != null ? `${eng.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.url && (
                          <a href={p.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By media type */}
      {mediaTypeChart.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">By type</div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Type</th>
                  <th className="text-right font-medium px-3 py-2">Posts</th>
                  <th className="text-right font-medium px-3 py-2">Avg views</th>
                  <th className="text-right font-medium px-3 py-2">Avg likes</th>
                  <th className="text-right font-medium px-3 py-2">Avg comments</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(byMediaType) as TTMediaType[])
                  .filter((mt) => byMediaType[mt].count > 0)
                  .map((mt) => {
                    const g = byMediaType[mt];
                    const safe = (n: number) => Math.round(n / g.count).toLocaleString();
                    return (
                      <tr key={mt} className="border-t border-border bg-card">
                        <td className="px-3 py-2 capitalize">
                          <span className="inline-flex items-center gap-1.5">
                            {mediaTypeIcon[mt]}
                            {mt}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{g.count}</td>
                        <td className="px-3 py-2 text-right">{safe(g.views)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{safe(g.likes)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{safe(g.comments)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent posts */}
      {recentPosts.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Latest activity <span className="text-muted-foreground/60 normal-case font-normal">(5 most recent videos)</span></div>
          <div className="space-y-1.5">
            {recentPosts.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{p.caption ?? <span className="italic text-muted-foreground">(no caption)</span>}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {p.media_type} · {format(new Date(p.posted_at), "MMM d, yyyy")}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs ml-3">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3 w-3" style={{ color: TT_CYAN }} />
                    {p.views_count.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Heart className="h-3 w-3" />
                    {p.likes_count.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Share2 className="h-3 w-3" />
                    {p.shares_count.toLocaleString()}
                  </span>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* (Old "Infloww revenue" card removed — superseded by the
          Revenue Performance section above, which shows the same
          campaign data in a fuller, modernized layout.) */}

      {account.notes && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</div>
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground whitespace-pre-wrap">
            {account.notes}
          </div>
        </div>
      )}

      {account.last_synced_at && (
        <div className="text-xs text-muted-foreground/60">
          Last edit/sync: {format(new Date(account.last_synced_at), "MMM d, yyyy 'at' h:mm a")}
        </div>
      )}
    </div>
  );
}

// ── Posts (Videos) Tab ─────────────────────────────────────────────────────────
const emptyPostForm = {
  tiktok_account_id: "",
  caption: "",
  media_type: "video" as TTMediaType,
  posted_at: "",
  views_count: "",
  likes_count: "",
  comments_count: "",
  shares_count: "",
  saves_count: "",
  url: "",
  notes: "",
};

function PostsTab({
  accounts, posts, onRefresh,
}: { accounts: TTAccount[]; posts: TTPost[]; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyPostForm);
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterMedia, setFilterMedia] = useState<string>("all");

  const onAddPost = async () => {
    if (!form.tiktok_account_id) return toast.error("Pick an account");
    const payload = {
      tiktok_account_id: form.tiktok_account_id,
      caption: form.caption.trim() || null,
      media_type: form.media_type,
      posted_at: form.posted_at ? new Date(form.posted_at).toISOString() : new Date().toISOString(),
      views_count: parseInt(form.views_count) || 0,
      likes_count: parseInt(form.likes_count) || 0,
      comments_count: parseInt(form.comments_count) || 0,
      shares_count: parseInt(form.shares_count) || 0,
      saves_count: parseInt(form.saves_count) || 0,
      url: form.url.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error } = await supabase.from("tiktok_posts").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Video added");
    setForm(emptyPostForm);
    setOpen(false);
    onRefresh();
  };

  const onDeletePost = async (id: string) => {
    const { error } = await supabase.from("tiktok_posts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Video deleted");
    onRefresh();
  };

  const filtered = posts.filter((p) => {
    if (filterAccount !== "all" && p.tiktok_account_id !== filterAccount) return false;
    if (filterMedia !== "all" && p.media_type !== filterMedia) return false;
    return true;
  });

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
        Add a TikTok account first before tracking videos.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Select value={filterAccount} onValueChange={setFilterAccount}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterMedia} onValueChange={setFilterMedia}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="photo">Photo</SelectItem>
              <SelectItem value="live">Live</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} video{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add video</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Track a new TikTok</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Account</Label>
                  <Select value={form.tiktok_account_id} onValueChange={(v) => setForm({ ...form, tiktok_account_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={form.media_type} onValueChange={(v) => setForm({ ...form, media_type: v as TTMediaType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="photo">Photo</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Caption</Label>
                <Input value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="Caption text" />
              </div>
              <div className="space-y-1.5">
                <Label>Video URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://tiktok.com/@…/video/…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Posted at</Label>
                  <Input
                    type="datetime-local"
                    value={form.posted_at}
                    onChange={(e) => setForm({ ...form, posted_at: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Views</Label>
                  <Input type="number" value={form.views_count} onChange={(e) => setForm({ ...form, views_count: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label>Likes</Label>
                  <Input type="number" value={form.likes_count} onChange={(e) => setForm({ ...form, likes_count: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Comments</Label>
                  <Input type="number" value={form.comments_count} onChange={(e) => setForm({ ...form, comments_count: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Shares</Label>
                  <Input type="number" value={form.shares_count} onChange={(e) => setForm({ ...form, shares_count: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Saves</Label>
                  <Input type="number" value={form.saves_count} onChange={(e) => setForm({ ...form, saves_count: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any context" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onAddPost}>Add video</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No videos tracked yet for this filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Caption</th>
                <th className="text-left font-medium px-4 py-3">Account</th>
                <th className="text-left font-medium px-4 py-3">Type</th>
                <th className="text-left font-medium px-4 py-3">Posted</th>
                <th className="text-right font-medium px-4 py-3">Views</th>
                <th className="text-right font-medium px-4 py-3">Likes</th>
                <th className="text-right font-medium px-4 py-3">Shares</th>
                <th className="text-right font-medium px-4 py-3">Saves</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const acct = accounts.find((a) => a.id === p.tiktok_account_id);
                return (
                  <tr key={p.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="font-medium truncate">{p.caption ?? <span className="text-muted-foreground italic">(no caption)</span>}</div>
                      {p.notes && <div className="text-xs text-muted-foreground truncate">{p.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{acct ? `@${acct.username}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-border bg-secondary/40 text-muted-foreground capitalize">
                        {mediaTypeIcon[p.media_type]}
                        {p.media_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {format(new Date(p.posted_at), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Eye className="h-3 w-3" style={{ color: TT_CYAN }} />
                        {p.views_count.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Heart className="h-3 w-3" />
                        {p.likes_count.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Share2 className="h-3 w-3" />
                        {p.shares_count.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Bookmark className="h-3 w-3" />
                        {p.saves_count.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {p.url && (
                          <a href={p.url} target="_blank" rel="noreferrer" className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this video?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDeletePost(p.id)}>Delete</AlertDialogAction>
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

// ── Revenue Tab ────────────────────────────────────────────────────────────────
function RevenueTab({
  accounts, inflowwStats, syncing, onSyncInfloww, onRefresh,
}: {
  accounts: TTAccount[];
  inflowwStats: InflowwStat[];
  syncing: boolean;
  onSyncInfloww: () => void;
  onRefresh: () => void;
}) {
  const assignAccount = async (accountId: string, code: number | null) => {
    const { error } = await supabase
      .from("tiktok_accounts")
      .update({ infloww_campaign_code: code })
      .eq("id", accountId);
    if (error) return toast.error(error.message);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
        <span className="text-sm font-medium text-muted-foreground">Pull latest Infloww data:</span>
        <Button variant="outline" size="sm" onClick={onSyncInfloww} disabled={syncing}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync Infloww"}
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {inflowwStats.length} campaign{inflowwStats.length === 1 ? "" : "s"} cached
        </span>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Assign campaign codes to accounts</h3>
        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            Add a TikTok account first.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Account</th>
                  <th className="text-left font-medium px-4 py-3">Campaign code</th>
                  <th className="text-right font-medium px-4 py-3">Clicks</th>
                  <th className="text-right font-medium px-4 py-3">Subs</th>
                  <th className="text-right font-medium px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const stat = inflowwStats.find((s) => s.campaign_code === a.infloww_campaign_code);
                  return (
                    <tr key={a.id} className="border-t border-border bg-card">
                      <td className="px-4 py-3 font-medium align-top">@{a.username}</td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          <Input
                            type="number"
                            className="h-7 text-xs w-24"
                            placeholder="69"
                            value={a.infloww_campaign_code ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              assignAccount(a.id, v ? parseInt(v) : null);
                            }}
                          />
                          {stat?.campaign_url ? (
                            <a
                              href={stat.campaign_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1 max-w-[220px] truncate"
                              title={stat.campaign_url}
                            >
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{stat.campaign_url.replace(/^https?:\/\//, "")}</span>
                            </a>
                          ) : a.infloww_campaign_code != null ? (
                            <span className="text-[11px] text-muted-foreground/60 italic">no synced URL</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground align-top">{stat ? stat.clicks_count.toLocaleString() : "—"}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground align-top">{stat ? stat.subscribers_count.toLocaleString() : "—"}</td>
                      <td className="px-4 py-3 text-right font-medium text-success align-top">{stat ? `$${fmtMoney2(stat.revenue_total)}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Analytics Tab ──────────────────────────────────────────────────────────────
function AnalyticsTab({
  accounts, posts, inflowwStats,
}: {
  accounts: TTAccount[];
  posts: TTPost[];
  inflowwStats: InflowwStat[];
}) {
  // Per-account revenue: match each account's infloww_campaign_code
  // against the synced Infloww stats. Accounts without a code show
  // $0 — those are still listed so admins can see what's missing.
  const revenueByAccount = useMemo(() => {
    return accounts.map((a) => {
      const stat = inflowwStats.find((s) => s.campaign_code === a.infloww_campaign_code);
      return {
        account: a,
        revenue: stat?.revenue_total ?? 0,
        clicks: stat?.clicks_count ?? 0,
        subscribers: stat?.subscribers_count ?? 0,
        hasCode: !!a.infloww_campaign_code,
      };
    }).sort((x, y) => y.revenue - x.revenue);
  }, [accounts, inflowwStats]);
  const totalPlatformRevenue = revenueByAccount.reduce((s, r) => s + r.revenue, 0);
  const totalClicks = revenueByAccount.reduce((s, r) => s + r.clicks, 0);
  const totalSubs = revenueByAccount.reduce((s, r) => s + r.subscribers, 0);
  const stats = useMemo(() => {
    const total = posts.length;
    const totalViews = posts.reduce((s, p) => s + p.views_count, 0);
    const totalLikes = posts.reduce((s, p) => s + p.likes_count, 0);
    const totalComments = posts.reduce((s, p) => s + p.comments_count, 0);
    const totalShares = posts.reduce((s, p) => s + p.shares_count, 0);
    const totalSaves = posts.reduce((s, p) => s + p.saves_count, 0);
    const avgEngagement = totalViews > 0
      ? ((totalLikes + totalComments + totalShares + totalSaves) / totalViews) * 100
      : null;
    return { total, totalViews, totalLikes, totalComments, totalShares, totalSaves, avgEngagement };
  }, [posts]);

  const byMediaType = useMemo(() => {
    const groups: Record<TTMediaType, { count: number; views: number; likes: number; comments: number }> = {
      video: { count: 0, views: 0, likes: 0, comments: 0 },
      photo: { count: 0, views: 0, likes: 0, comments: 0 },
      live: { count: 0, views: 0, likes: 0, comments: 0 },
    };
    for (const p of posts) {
      const g = groups[p.media_type];
      g.count++;
      g.views += p.views_count;
      g.likes += p.likes_count;
      g.comments += p.comments_count;
    }
    return groups;
  }, [posts]);

  const topPosts = useMemo(() => {
    return [...posts]
      .sort((a, b) => b.views_count - a.views_count)
      .slice(0, 5);
  }, [posts]);

  const accountLeaderboard = useMemo(() => {
    return [...accounts]
      .map((a) => {
        const accPosts = posts.filter((p) => p.tiktok_account_id === a.id);
        const views = accPosts.reduce((s, p) => s + p.views_count, 0);
        const likes = accPosts.reduce((s, p) => s + p.likes_count, 0);
        return { account: a, postCount: accPosts.length, views, likes };
      })
      .sort((x, y) => y.views - x.views);
  }, [accounts, posts]);

  return (
    <div className="space-y-6">
      {/* ── Revenue from TikTok ─────────────────────────────────
          The agency's bottom line on this platform: total Infloww-
          attributed revenue across every account this creator runs.
          Sits at the top because "did this platform make money" is
          the most important question. */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              Revenue from TikTok
            </div>
            <div className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
              ${fmtMoney0(totalPlatformRevenue)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Across {accounts.length} account{accounts.length === 1 ? "" : "s"} · {totalClicks.toLocaleString()} clicks · {totalSubs.toLocaleString()} subscribers
            </div>
          </div>
        </div>
        {/* Per-account income breakdown */}
        {revenueByAccount.length > 0 && (
          <div className="mt-5 space-y-1.5">
            {revenueByAccount.map(({ account, revenue, clicks, subscribers, hasCode }) => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-card/60 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">@{account.username}</span>
                  {!hasCode && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      no campaign code
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {statusLabels[account.status]}
                  </span>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground tabular-nums">
                  <span>{clicks.toLocaleString()} clicks</span>
                  <span>{subscribers.toLocaleString()} subs</span>
                  <span className={`font-bold text-sm tabular-nums ${revenue > 0 ? "text-emerald-400" : "text-muted-foreground/60"}`}>
                    ${fmtMoney0(revenue)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total videos" value={stats.total} sub="tracked" />
        <StatCard label="Total views" value={stats.totalViews.toLocaleString()} sub="across videos" valueClass="text-primary" />
        <StatCard label="Total likes" value={stats.totalLikes.toLocaleString()} sub="across videos" />
        <StatCard
          label="Avg engagement"
          value={stats.avgEngagement != null ? `${stats.avgEngagement.toFixed(2)}%` : "—"}
          sub="(L+C+S+Sv)/views"
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Performance by type</h3>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Type</th>
                <th className="text-right font-medium px-4 py-3">Videos</th>
                <th className="text-right font-medium px-4 py-3">Avg views</th>
                <th className="text-right font-medium px-4 py-3">Avg likes</th>
                <th className="text-right font-medium px-4 py-3">Avg comments</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(byMediaType) as TTMediaType[]).map((mt) => {
                const g = byMediaType[mt];
                const safe = (n: number) => (g.count > 0 ? Math.round(n / g.count).toLocaleString() : "—");
                return (
                  <tr key={mt} className="border-t border-border bg-card">
                    <td className="px-4 py-3 capitalize">
                      <span className="inline-flex items-center gap-1.5">
                        {mediaTypeIcon[mt]}
                        {mt}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{g.count}</td>
                    <td className="px-4 py-3 text-right">{safe(g.views)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{safe(g.likes)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{safe(g.comments)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Account leaderboard</h3>
        {accountLeaderboard.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No accounts yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Account</th>
                  <th className="text-right font-medium px-4 py-3">Followers</th>
                  <th className="text-right font-medium px-4 py-3">Videos tracked</th>
                  <th className="text-right font-medium px-4 py-3">Total views</th>
                  <th className="text-right font-medium px-4 py-3">Total likes</th>
                </tr>
              </thead>
              <tbody>
                {accountLeaderboard.map(({ account, postCount, views, likes }) => (
                  <tr key={account.id} className="border-t border-border bg-card">
                    <td className="px-4 py-3">
                      <div className="font-medium">@{account.username}</div>
                      <div className="text-xs text-muted-foreground capitalize">{statusLabels[account.status]}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{account.followers_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{postCount}</td>
                    <td className="px-4 py-3 text-right">{views.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{likes.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Top videos by views</h3>
        {topPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No videos yet.
          </div>
        ) : (
          <div className="space-y-2">
            {topPosts.map((p) => {
              const acct = accounts.find((a) => a.id === p.tiktok_account_id);
              return (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.caption ?? <span className="italic text-muted-foreground">(no caption)</span>}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {acct ? `@${acct.username} · ` : ""}
                      <span className="capitalize">{p.media_type}</span>
                      {" · "}
                      {format(new Date(p.posted_at), "MMM d")}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-sm">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" style={{ color: TT_CYAN }} />
                      {p.views_count.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Heart className="h-3 w-3" />
                      {p.likes_count.toLocaleString()}
                    </span>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
