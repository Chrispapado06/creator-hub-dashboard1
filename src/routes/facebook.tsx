import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Trash2, Edit2, Check, X, ExternalLink, RefreshCw,
  ThumbsUp, MessageCircle, Eye, Image as ImageIcon, Video, Film,
  Link as LinkIcon, FileText, AlertTriangle, Link2, ArrowLeft, Unlink,
  Share2, Users, TrendingUp, DollarSign,
} from "lucide-react";
import { SiFacebook, SiMeta } from "react-icons/si";
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

export const Route = createFileRoute("/facebook")({ component: FacebookPage });

const FB_BLUE = "#1877F2";
const fmtMoney0 = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtMoney2 = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Types ─────────────────────────────────────────────────────────────────────
type Creator = { id: string; name: string; of_username: string | null; onlyfansapi_acct_id: string | null; avatar_url: string | null };
type FBAccountStatus = "active" | "warm_up" | "shadowbanned" | "banned" | "inactive";
type FBAccount = {
  id: string;
  creator_id: string;
  name: string;
  page_url: string | null;
  status: FBAccountStatus;
  followers_count: number;
  likes_count: number;
  posts_count: number;
  about_link: string | null;
  notes: string | null;
  infloww_campaign_code: number | null;
  last_synced_at: string | null;
  meta_access_token: string | null;
  meta_page_id: string | null;
  meta_connected_at: string | null;
};
type FBMediaType = "photo" | "video" | "reel" | "link" | "status";
type FBPost = {
  id: string;
  facebook_account_id: string;
  post_id: string | null;
  message: string | null;
  media_type: FBMediaType;
  posted_at: string;
  reactions_count: number;
  comments_count: number;
  shares_count: number;
  reach_count: number;
  video_views: number;
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
const accountStatusStyles: Record<FBAccountStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  warm_up: "bg-primary/15 text-primary border-primary/30",
  shadowbanned: "bg-warning/15 text-warning border-warning/30",
  banned: "bg-destructive/15 text-destructive border-destructive/30",
  inactive: "bg-muted text-muted-foreground border-border",
};
const statusLabels: Record<FBAccountStatus, string> = {
  active: "Active",
  warm_up: "Warm Up",
  shadowbanned: "Shadowbanned",
  banned: "Banned",
  inactive: "Inactive",
};
const mediaTypeIcon: Record<FBMediaType, React.ReactNode> = {
  photo: <ImageIcon className="h-3.5 w-3.5" />,
  video: <Video className="h-3.5 w-3.5" />,
  reel: <Film className="h-3.5 w-3.5" />,
  link: <LinkIcon className="h-3.5 w-3.5" />,
  status: <FileText className="h-3.5 w-3.5" />,
};

// ── Main component ─────────────────────────────────────────────────────────────
function FacebookPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>("");
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [accounts, setAccounts] = useState<FBAccount[]>([]);
  const [posts, setPosts] = useState<FBPost[]>([]);
  const [inflowwStats, setInflowwStats] = useState<InflowwStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadCreatorData = async (creatorId: string, silent = false) => {
    if (!creatorId) return;
    if (!silent) setLoading(true);
    const { data: ias } = await supabase
      .from("facebook_accounts")
      .select("*")
      .eq("creator_id", creatorId)
      .order("created_at");
    const accList = (ias ?? []) as FBAccount[];
    setAccounts(accList);
    const accIds = accList.map((a) => a.id);
    if (accIds.length) {
      const { data: ps } = await supabase
        .from("facebook_posts")
        .select("*")
        .in("facebook_account_id", accIds)
        .order("posted_at", { ascending: false });
      setPosts((ps ?? []) as FBPost[]);
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
      // Permissive shape parsing — see reddit.tsx for the full rule.
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
      .eq("source", "infloww-facebook");
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
          facebook_account_id: matched.id,
          amount: l.revenue.total,
          currency: "USD",
          entry_date: today,
          source: "infloww-facebook",
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
          <SiFacebook className="h-6 w-6" style={{ color: FB_BLUE }} />
          <h1 className="text-3xl font-bold tracking-tight">Facebook</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage Facebook Pages, posts, and revenue per creator.
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
          Select a creator above to manage their Facebook presence.
        </div>
      ) : loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts">Pages</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
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
// Sync Infloww moved out of this hero — lives on the Revenue tab where
// it's been historically. Avoids a duplicate button two clicks apart.
function OverviewTab({
  accounts, posts, inflowwStats,
}: {
  accounts: FBAccount[];
  posts: FBPost[];
  inflowwStats: InflowwStat[];
}) {
  const totalFollowers = accounts.reduce((s, a) => s + a.followers_count, 0);
  const totalReactions = posts.reduce((s, p) => s + p.reactions_count, 0);
  const totalRevenue = inflowwStats
    .filter((s) => accounts.some((a) => a.infloww_campaign_code === s.campaign_code))
    .reduce((s, i) => s + i.revenue_total, 0);
  const posts30d = posts.filter(
    (p) => Date.now() - new Date(p.posted_at).getTime() < 30 * 24 * 3600_000
  ).length;
  const activeAccounts = accounts.filter((a) => a.status === "active").length;
  const topPost = posts.length > 0
    ? posts.reduce((a, b) => (a.reactions_count > b.reactions_count ? a : b))
    : null;
  const topPostAccount = topPost ? accounts.find((a) => a.id === topPost.facebook_account_id) : null;

  return (
    <div className="space-y-6">
      {/* Brand hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card/80 to-[#1877F2]/10 p-6">
        <div aria-hidden className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[#1877F2]/15 blur-3xl pointer-events-none" />
        <div aria-hidden className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-[#42B72A]/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <SiFacebook className="h-3.5 w-3.5" style={{ color: FB_BLUE }} />
              Facebook presence
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
                <span className="text-muted-foreground">/ {accounts.length} pages</span>
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {posts.length.toLocaleString()} posts tracked · {posts30d} in last 30d · {totalReactions.toLocaleString()} reactions
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ModernStat
          icon={<Users className="h-3.5 w-3.5" />}
          tone="blue"
          label="Followers"
          value={totalFollowers.toLocaleString()}
          sub={`${activeAccounts} active`}
        />
        <ModernStat
          icon={<ThumbsUp className="h-3.5 w-3.5" />}
          tone="blue"
          label="Reactions"
          value={totalReactions.toLocaleString()}
          sub={`${posts.length} posts`}
        />
        <ModernStat
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone="amber"
          label="Posts (30d)"
          value={posts30d.toLocaleString()}
          sub={`${posts.length} all-time`}
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
            <span className="h-1 w-1 rounded-full bg-[#1877F2]" />
            Best performing post
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary/40 text-muted-foreground capitalize">
                  {mediaTypeIcon[topPost.media_type]}
                  {topPost.media_type}
                </span>
                <span className="truncate">{topPost.message ?? "(no message)"}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {topPostAccount ? `${topPostAccount.name} · ` : ""}
                {formatDistanceToNow(new Date(topPost.posted_at), { addSuffix: true })}
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="font-bold text-lg flex items-center gap-1 justify-end">
                  <ThumbsUp className="h-3.5 w-3.5" style={{ color: FB_BLUE }} />
                  {topPost.reactions_count.toLocaleString()}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">reactions</div>
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

function ModernStat({
  icon, label, value, sub, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  tone: "blue" | "emerald" | "amber" | "violet";
}) {
  const toneCls = {
    blue:    { chip: "bg-[#1877F2]/15 text-[#1877F2]",  value: "" },
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

function HealthWarnings({ accounts, posts }: { accounts: FBAccount[]; posts: FBPost[] }) {
  const flagged = accounts.filter((a) => a.status === "shadowbanned" || a.status === "banned" || a.status === "inactive");
  const inactiveAccounts = accounts.filter((a) => {
    if (a.status !== "active") return false;
    const accountPosts = posts.filter((p) => p.facebook_account_id === a.id);
    if (accountPosts.length === 0) return false;
    const lastPost = accountPosts.reduce((latest, p) =>
      new Date(p.posted_at) > new Date(latest.posted_at) ? p : latest
    );
    return Date.now() - new Date(lastPost.posted_at).getTime() > 14 * 24 * 3600_000;
  });
  if (flagged.length === 0 && inactiveAccounts.length === 0) return null;
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-5">
      <div className="flex items-center gap-2 text-warning mb-3">
        <AlertTriangle className="h-4 w-4" />
        <div className="text-sm font-semibold">Page health</div>
      </div>
      <div className="space-y-2 text-sm">
        {flagged.map((a) => (
          <div key={a.id} className="flex items-center justify-between">
            <span>{a.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded border ${accountStatusStyles[a.status]}`}>
              {statusLabels[a.status]}
            </span>
          </div>
        ))}
        {inactiveAccounts.map((a) => (
          <div key={a.id} className="flex items-center justify-between text-muted-foreground">
            <span>{a.name}</span>
            <span className="text-xs">No posts in 14+ days</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Accounts (Pages) Tab ───────────────────────────────────────────────────────
function AccountsTab({
  creatorId, accounts, posts, inflowwStats, onRefresh,
}: {
  creatorId: string;
  accounts: FBAccount[];
  posts: FBPost[];
  inflowwStats: InflowwStat[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [accForm, setAccForm] = useState({ name: "", status: "active" as FBAccountStatus, page_url: "", about_link: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    page_url: "",
    followers_count: "",
    likes_count: "",
    posts_count: "",
    about_link: "",
    notes: "",
    infloww_campaign_code: "",
  });
  const [detailAccount, setDetailAccount] = useState<FBAccount | null>(null);

  const onAddAccount = async () => {
    if (!accForm.name.trim()) return toast.error("Page name is required");
    const { error } = await supabase.from("facebook_accounts").insert({
      creator_id: creatorId,
      name: accForm.name.trim(),
      status: accForm.status,
      page_url: accForm.page_url.trim() || null,
      about_link: accForm.about_link.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Facebook page added");
    setAccForm({ name: "", status: "active", page_url: "", about_link: "" });
    setOpen(false);
    onRefresh();
  };

  const onDeleteAccount = async (id: string) => {
    const { error } = await supabase.from("facebook_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Page removed");
    onRefresh();
  };

  const onUpdateStatus = async (id: string, status: FBAccountStatus) => {
    const { error } = await supabase.from("facebook_accounts").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    onRefresh();
  };

  const startEdit = (a: FBAccount) => {
    setEditForm({
      name: a.name,
      page_url: a.page_url ?? "",
      followers_count: a.followers_count.toString(),
      likes_count: a.likes_count.toString(),
      posts_count: a.posts_count.toString(),
      about_link: a.about_link ?? "",
      notes: a.notes ?? "",
      infloww_campaign_code: a.infloww_campaign_code?.toString() ?? "",
    });
    setEditingId(a.id);
  };

  const saveEdit = async (id: string) => {
    const code = editForm.infloww_campaign_code.trim();
    const payload = {
      name: editForm.name.trim(),
      page_url: editForm.page_url.trim() || null,
      followers_count: parseInt(editForm.followers_count) || 0,
      likes_count: parseInt(editForm.likes_count) || 0,
      posts_count: parseInt(editForm.posts_count) || 0,
      about_link: editForm.about_link.trim() || null,
      notes: editForm.notes.trim() || null,
      infloww_campaign_code: code ? parseInt(code) : null,
      last_synced_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("facebook_accounts").update(payload).eq("id", id);
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
          {accounts.length} page{accounts.length !== 1 ? "s" : ""} linked.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />Add page
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Facebook page</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Page name</Label>
                <Input
                  value={accForm.name}
                  onChange={(e) => setAccForm({ ...accForm, name: e.target.value })}
                  placeholder="Luna XO Official"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={accForm.status} onValueChange={(v) => setAccForm({ ...accForm, status: v as FBAccountStatus })}>
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
                <Label>Page URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  value={accForm.page_url}
                  onChange={(e) => setAccForm({ ...accForm, page_url: e.target.value })}
                  placeholder="https://facebook.com/lunaxoofficial"
                />
              </div>
              <div className="space-y-1.5">
                <Label>About link <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  value={accForm.about_link}
                  onChange={(e) => setAccForm({ ...accForm, about_link: e.target.value })}
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
          No Facebook pages linked yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Page</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Followers</th>
                <th className="text-right font-medium px-4 py-3">Likes</th>
                <th className="text-right font-medium px-4 py-3">Posts</th>
                <th className="text-left font-medium px-4 py-3">About link</th>
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
                          <div className="space-y-1">
                            <Input
                              className="h-7 text-xs w-40"
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              placeholder="Page name"
                            />
                            <Input
                              className="h-7 text-xs w-40"
                              value={editForm.page_url}
                              onChange={(e) => setEditForm({ ...editForm, page_url: e.target.value })}
                              placeholder="Page URL"
                            />
                          </div>
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
                            value={editForm.likes_count}
                            onChange={(e) => setEditForm({ ...editForm, likes_count: e.target.value })}
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
                        <td className="px-4 py-2">
                          <Input
                            className="h-7 text-xs w-40"
                            placeholder="https://…"
                            value={editForm.about_link}
                            onChange={(e) => setEditForm({ ...editForm, about_link: e.target.value })}
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
                              {a.name}
                            </button>
                            {a.page_url && (
                              <a
                                href={a.page_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground/60 hover:text-primary"
                                title="Open on Facebook"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Select value={a.status} onValueChange={(v) => onUpdateStatus(a.id, v as FBAccountStatus)}>
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
                        <td className="px-4 py-3 text-right text-muted-foreground">{a.likes_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{a.posts_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                          {a.about_link ? (
                            <a href={a.about_link} target="_blank" rel="noreferrer" className="hover:text-primary inline-flex items-center gap-1">
                              <Link2 className="h-3 w-3" />
                              <span className="truncate">{a.about_link.replace(/^https?:\/\//, "")}</span>
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
                                  <AlertDialogTitle>Remove {a.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will also delete all posts tracked under this page.
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
  account: FBAccount;
  posts: FBPost[];
  inflowwStats: InflowwStat[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  const accountPosts = useMemo(
    () => posts.filter((p) => p.facebook_account_id === account.id),
    [account, posts]
  );

  const [metaDialogOpen, setMetaDialogOpen] = useState(false);
  const [metaForm, setMetaForm] = useState({ page_id: "", access_token: "" });
  const [metaSyncing, setMetaSyncing] = useState(false);

  const isConnected = !!(account.meta_access_token && account.meta_page_id);

  const stats = useMemo(() => {
    if (accountPosts.length === 0) return null;
    const totalReactions = accountPosts.reduce((s, p) => s + p.reactions_count, 0);
    const totalComments = accountPosts.reduce((s, p) => s + p.comments_count, 0);
    const totalShares = accountPosts.reduce((s, p) => s + p.shares_count, 0);
    const totalReach = accountPosts.reduce((s, p) => s + p.reach_count, 0);
    const totalVideoViews = accountPosts.reduce((s, p) => s + p.video_views, 0);
    const avgReactions = totalReactions / accountPosts.length;
    const avgComments = totalComments / accountPosts.length;
    const avgReach = totalReach / accountPosts.length;
    const engagement =
      totalReach > 0 ? ((totalReactions + totalComments + totalShares) / totalReach) * 100 : null;
    const last30d = accountPosts.filter(
      (p) => Date.now() - new Date(p.posted_at).getTime() < 30 * 24 * 3600_000
    ).length;
    return { totalReactions, totalComments, totalShares, totalReach, totalVideoViews, avgReactions, avgComments, avgReach, engagement, last30d };
  }, [accountPosts]);

  const byMediaType = useMemo(() => {
    const groups: Record<FBMediaType, { count: number; reactions: number; comments: number; reach: number }> = {
      photo: { count: 0, reactions: 0, comments: 0, reach: 0 },
      video: { count: 0, reactions: 0, comments: 0, reach: 0 },
      reel: { count: 0, reactions: 0, comments: 0, reach: 0 },
      link: { count: 0, reactions: 0, comments: 0, reach: 0 },
      status: { count: 0, reactions: 0, comments: 0, reach: 0 },
    };
    for (const p of accountPosts) {
      const g = groups[p.media_type];
      g.count++;
      g.reactions += p.reactions_count;
      g.comments += p.comments_count;
      g.reach += p.reach_count;
    }
    return groups;
  }, [accountPosts]);

  const recentPosts = useMemo(
    () => [...accountPosts]
      .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
      .slice(0, 5),
    [accountPosts]
  );

  const revenueStat = useMemo(
    () => account?.infloww_campaign_code != null
      ? inflowwStats.find((s) => s.campaign_code === account.infloww_campaign_code) ?? null
      : null,
    [account, inflowwStats]
  );

  const cadenceData = useMemo(() => {
    const weeks: { label: string; posts: number; avgReactions: number; weekStart: number }[] = [];
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
      const totalReactions = weekPosts.reduce((s, p) => s + p.reactions_count, 0);
      weeks.push({
        label: format(start, "MMM d"),
        posts: weekPosts.length,
        avgReactions: weekPosts.length > 0 ? Math.round(totalReactions / weekPosts.length) : 0,
        weekStart: start.getTime(),
      });
    }
    return weeks;
  }, [accountPosts]);

  const dayOfWeekData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const buckets = days.map((d) => ({ day: d, totalReactions: 0, totalComments: 0, count: 0 }));
    for (const p of accountPosts) {
      const dow = new Date(p.posted_at).getDay();
      buckets[dow].totalReactions += p.reactions_count;
      buckets[dow].totalComments += p.comments_count;
      buckets[dow].count++;
    }
    return buckets.map((b) => ({
      day: b.day,
      avgEngagement: b.count > 0 ? Math.round((b.totalReactions + b.totalComments) / b.count) : 0,
      posts: b.count,
    }));
  }, [accountPosts]);

  const mediaTypeChart = useMemo(() => {
    return (Object.entries(byMediaType) as [FBMediaType, { count: number; reactions: number; comments: number; reach: number }][])
      .filter(([, g]) => g.count > 0)
      .map(([type, g]) => ({
        type: type[0].toUpperCase() + type.slice(1),
        avgReactions: Math.round(g.reactions / g.count),
        avgComments: Math.round(g.comments / g.count),
        count: g.count,
      }))
      .sort((a, b) => b.avgReactions - a.avgReactions);
  }, [byMediaType]);

  const topPosts = useMemo(() => {
    return [...accountPosts]
      .sort(
        (a, b) =>
          b.reactions_count + b.comments_count + b.shares_count -
          (a.reactions_count + a.comments_count + a.shares_count)
      )
      .slice(0, 10);
  }, [accountPosts]);

  const insights = useMemo(() => {
    const out: string[] = [];
    if (mediaTypeChart.length >= 2) {
      const best = mediaTypeChart[0];
      const worst = mediaTypeChart[mediaTypeChart.length - 1];
      if (best.avgReactions > 0 && worst.avgReactions > 0 && best.avgReactions >= worst.avgReactions * 1.5) {
        const ratio = (best.avgReactions / worst.avgReactions).toFixed(1);
        out.push(`${best.type}s get ${ratio}× more reactions on average than ${worst.type}s — lean into ${best.type}s.`);
      }
    }
    const dowSorted = [...dayOfWeekData].filter((d) => d.posts > 0).sort((a, b) => b.avgEngagement - a.avgEngagement);
    if (dowSorted.length >= 2) {
      const best = dowSorted[0];
      const overallAvg = dowSorted.reduce((s, d) => s + d.avgEngagement, 0) / dowSorted.length;
      if (best.avgEngagement > overallAvg * 1.25) {
        const pct = Math.round(((best.avgEngagement - overallAvg) / overallAvg) * 100);
        out.push(`Posts on ${best.day} perform ${pct}% above your average — schedule peak content for ${best.day}s.`);
      }
    }
    const recent4 = cadenceData.slice(-4).reduce((s, w) => s + w.posts, 0);
    const previous8 = cadenceData.slice(0, 8).reduce((s, w) => s + w.posts, 0);
    const recentRate = recent4 / 4;
    const previousRate = previous8 / 8;
    if (previousRate > 0 && recentRate < previousRate * 0.7) {
      out.push(`Posting frequency dropped to ${recentRate.toFixed(1)}/week (was ${previousRate.toFixed(1)}/week) — risk of audience drift.`);
    } else if (recentRate >= 4) {
      out.push(`Strong cadence: ${recentRate.toFixed(1)} posts/week over the last 4 weeks. Keep it up.`);
    } else if (recentRate < 1 && accountPosts.length > 0) {
      out.push(`Only ${recentRate.toFixed(1)} posts/week recently — Facebook penalizes inactive Pages. Aim for 3–5/week.`);
    }
    if (stats?.engagement != null) {
      if (stats.engagement >= 5) {
        out.push(`Engagement rate of ${stats.engagement.toFixed(1)}% is excellent (FB Pages average ~0.5–2%).`);
      } else if (stats.engagement < 0.5) {
        out.push(`Engagement rate of ${stats.engagement.toFixed(2)}% is below the ~0.5–2% FB Pages benchmark — consider stronger hooks or video content.`);
      }
    }
    return out;
  }, [mediaTypeChart, dayOfWeekData, cadenceData, accountPosts.length, stats]);

  const runMetaSync = async (
    pageId: string,
    accessToken: string
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const base = "https://graph.facebook.com/v21.0";
    try {
      const profileFields = "name,about,fan_count,followers_count,link,website";
      const profileRes = await fetch(
        `${base}/${encodeURIComponent(pageId)}?fields=${profileFields}&access_token=${encodeURIComponent(accessToken)}`
      );
      const profile = (await profileRes.json()) as {
        name?: string;
        about?: string;
        fan_count?: number;
        followers_count?: number;
        link?: string;
        website?: string;
        error?: { message?: string; type?: string; code?: number };
      };
      if (profile.error) {
        return { ok: false, error: profile.error.message ?? "Graph API rejected the request" };
      }

      const mediaFields =
        "id,message,created_time,permalink_url,attachments{media_type,type},reactions.summary(total_count),comments.summary(total_count),shares";
      const mediaRes = await fetch(
        `${base}/${encodeURIComponent(pageId)}/posts?fields=${mediaFields}&limit=25&access_token=${encodeURIComponent(accessToken)}`
      );
      const mediaJson = (await mediaRes.json()) as {
        data?: {
          id: string;
          message?: string;
          created_time: string;
          permalink_url?: string;
          attachments?: { data?: { media_type?: string; type?: string }[] };
          reactions?: { summary?: { total_count?: number } };
          comments?: { summary?: { total_count?: number } };
          shares?: { count?: number };
        }[];
        error?: { message?: string };
      };
      if (mediaJson.error) {
        return { ok: false, error: mediaJson.error.message ?? "Failed to fetch posts" };
      }

      const mapMediaType = (att?: { media_type?: string; type?: string }[]): FBMediaType => {
        if (!att || att.length === 0) return "status";
        const first = att[0];
        const t = first.type ?? "";
        const mt = first.media_type ?? "";
        if (t === "video_inline" || t === "video_autoplay" || mt === "video") return "video";
        if (t === "share" || t === "link" || mt === "link") return "link";
        if (mt === "photo" || t === "photo") return "photo";
        return "status";
      };

      const updatePayload = {
        followers_count: profile.followers_count ?? account.followers_count,
        likes_count: profile.fan_count ?? account.likes_count,
        about_link: profile.website ?? account.about_link,
        page_url: profile.link ?? account.page_url,
        meta_access_token: accessToken,
        meta_page_id: pageId,
        meta_connected_at: account.meta_connected_at ?? new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      };
      const { error: updErr } = await supabase
        .from("facebook_accounts")
        .update(updatePayload)
        .eq("id", account.id);
      if (updErr) return { ok: false, error: updErr.message };

      const mediaItems = mediaJson.data ?? [];
      if (mediaItems.length > 0) {
        const upserts = mediaItems.map((m) => ({
          facebook_account_id: account.id,
          post_id: m.id,
          message: m.message ?? null,
          media_type: mapMediaType(m.attachments?.data),
          posted_at: m.created_time,
          reactions_count: m.reactions?.summary?.total_count ?? 0,
          comments_count: m.comments?.summary?.total_count ?? 0,
          shares_count: m.shares?.count ?? 0,
          url: m.permalink_url ?? null,
        }));
        const { error: postErr } = await supabase
          .from("facebook_posts")
          .upsert(upserts, { onConflict: "facebook_account_id,post_id" });
        if (postErr) return { ok: false, error: postErr.message };
      }

      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Network error" };
    }
  };

  const onConnectMeta = async () => {
    const pageId = metaForm.page_id.trim();
    const accessToken = metaForm.access_token.trim();
    if (!pageId || !accessToken) {
      toast.error("Both Page ID and access token are required.");
      return;
    }
    setMetaSyncing(true);
    const result = await runMetaSync(pageId, accessToken);
    setMetaSyncing(false);
    if (!result.ok) {
      toast.error(`Meta connect failed: ${result.error}`);
      return;
    }
    toast.success("Connected to Meta — page data and recent posts synced");
    setMetaDialogOpen(false);
    setMetaForm({ page_id: "", access_token: "" });
    onRefresh();
  };

  const onRefreshFromMeta = async () => {
    if (!account.meta_access_token || !account.meta_page_id) return;
    setMetaSyncing(true);
    const result = await runMetaSync(account.meta_page_id, account.meta_access_token);
    setMetaSyncing(false);
    if (!result.ok) {
      toast.error(`Meta sync failed: ${result.error}`);
      return;
    }
    toast.success("Synced from Meta");
    onRefresh();
  };

  const onDisconnectMeta = async () => {
    const { error } = await supabase
      .from("facebook_accounts")
      .update({ meta_access_token: null, meta_page_id: null, meta_connected_at: null })
      .eq("id", account.id);
    if (error) return toast.error(error.message);
    toast.success("Disconnected from Meta");
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to pages
        </Button>
        {account.page_url && (
          <a
            href={account.page_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            Open on Facebook
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <div className="flex items-center gap-3 pb-4 border-b border-border flex-wrap">
        <SiFacebook className="h-7 w-7" style={{ color: FB_BLUE }} />
        <h2 className="text-2xl font-bold tracking-tight">{account.name}</h2>
        <span className={`text-xs px-2 py-0.5 rounded border ${accountStatusStyles[account.status]}`}>
          {statusLabels[account.status]}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {isConnected ? (
            <>
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Connected to Meta
                {account.meta_connected_at && (
                  <span className="text-muted-foreground/60">
                    · {formatDistanceToNow(new Date(account.meta_connected_at), { addSuffix: true })}
                  </span>
                )}
              </span>
              <Button variant="outline" size="sm" onClick={onRefreshFromMeta} disabled={metaSyncing}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${metaSyncing ? "animate-spin" : ""}`} />
                {metaSyncing ? "Syncing…" : "Refresh from Meta"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect from Meta?</AlertDialogTitle>
                    <AlertDialogDescription>
                      We'll clear the saved Page Access Token and Page ID. Synced posts and follower counts stay; auto-refresh stops working.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDisconnectMeta}>Disconnect</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <Button size="sm" onClick={() => setMetaDialogOpen(true)}>
              <SiMeta className="h-3.5 w-3.5 mr-1.5" />
              Connect with Meta
            </Button>
          )}
        </div>
      </div>

      <Dialog open={metaDialogOpen} onOpenChange={setMetaDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SiMeta className="h-5 w-5" />
              Connect {account.name} to Meta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground space-y-2">
              <div>This pulls page name, follower / like counts, and the last 25 posts (reactions, comments, shares, captions, type) directly from Meta's Graph API.</div>
              <div className="font-medium text-foreground">Requirements:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>You must be an admin of the Facebook Page.</li>
                <li>You need a <strong>long-lived Page Access Token</strong> with <code className="bg-card px-1 rounded">pages_show_list</code>, <code className="bg-card px-1 rounded">pages_read_engagement</code>, <code className="bg-card px-1 rounded">pages_read_user_content</code> scopes.</li>
              </ul>
              <div className="font-medium text-foreground pt-1">Where to get them:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Open <a className="text-primary hover:underline" href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer">Graph API Explorer</a>, pick your app, generate a User Access Token with the scopes above.</li>
                <li>Call <code className="bg-card px-1 rounded">/me/accounts</code> — returns your pages with each page's <code className="bg-card px-1 rounded">id</code> and <code className="bg-card px-1 rounded">access_token</code>.</li>
                <li>Page Access Tokens generated this way from a long-lived User Token don't expire as long as you remain an admin.</li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label>Page ID</Label>
              <Input
                placeholder="102876543210987"
                value={metaForm.page_id}
                onChange={(e) => setMetaForm({ ...metaForm, page_id: e.target.value })}
              />
              <div className="text-xs text-muted-foreground">
                Numeric Facebook Page ID — visible in <code className="bg-card px-1 rounded">/me/accounts</code> response.
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Page Access Token</Label>
              <Input
                type="password"
                placeholder="EAAB..."
                value={metaForm.access_token}
                onChange={(e) => setMetaForm({ ...metaForm, access_token: e.target.value })}
              />
              <div className="text-xs text-muted-foreground">
                Stored in your Supabase DB. Treat this like a password — rotate if it leaks.
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMetaDialogOpen(false)}>Cancel</Button>
            <Button onClick={onConnectMeta} disabled={metaSyncing}>
              {metaSyncing ? "Connecting…" : "Connect & sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Followers" value={account.followers_count.toLocaleString()} sub="page followers" />
        <StatCard label="Page likes" value={account.likes_count.toLocaleString()} sub="fan count" />
        <StatCard label="Posts on FB" value={account.posts_count.toLocaleString()} sub="reported count" />
        <StatCard
          label="Tracked posts"
          value={accountPosts.length}
          sub={stats ? `${stats.last30d} in last 30d` : "none yet"}
        />
      </div>

      {accountPosts.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-center text-sm text-muted-foreground">
          No posts tracked yet — charts and insights below will populate as soon as you add posts on the <strong>Posts</strong> tab or sync from Meta.
        </div>
      )}

      {/* Performance */}
      <div>
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Performance</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Avg reactions" value={stats ? Math.round(stats.avgReactions).toLocaleString() : "—"} sub={stats ? `${stats.totalReactions.toLocaleString()} total` : "no posts yet"} />
          <StatCard label="Avg comments" value={stats ? Math.round(stats.avgComments).toLocaleString() : "—"} sub={stats ? `${stats.totalComments.toLocaleString()} total` : ""} />
          <StatCard label="Avg reach" value={stats ? Math.round(stats.avgReach).toLocaleString() : "—"} sub={stats ? `${stats.totalReach.toLocaleString()} total` : ""} />
          <StatCard
            label="Engagement"
            value={stats?.engagement != null ? `${stats.engagement.toFixed(2)}%` : "—"}
            sub="(reactions+comments+shares)/reach"
          />
        </div>
      </div>

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
        <ChartCard title="Posting cadence" sub="posts per week, last 12 weeks">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cadenceData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar dataKey="posts" fill={FB_BLUE} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Avg reactions per week" sub="momentum check, last 12 weeks">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cadenceData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(v: number) => [v.toLocaleString(), "Avg reactions"]}
              />
              <Bar dataKey="avgReactions" fill="#42A5F5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Best day to post" sub="avg engagement (reactions + comments) by day of week">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dayOfWeekData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(v: number) => [v.toLocaleString(), "Avg engagement"]}
              />
              <Bar dataKey="avgEngagement" radius={[3, 3, 0, 0]}>
                {dayOfWeekData.map((d, i) => {
                  const max = Math.max(...dayOfWeekData.map((x) => x.avgEngagement));
                  const isMax = d.avgEngagement > 0 && d.avgEngagement === max;
                  return <Cell key={i} fill={isMax ? FB_BLUE : "#42A5F580"} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Performance by media type" sub="avg reactions per post (best at top)">
          {mediaTypeChart.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
              No posts yet
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
                  formatter={(v: number) => [v.toLocaleString(), "Avg reactions"]}
                />
                <Bar dataKey="avgReactions" fill={FB_BLUE} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Top performing posts */}
      {topPosts.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Top performing posts <span className="text-muted-foreground/60 normal-case font-normal">(by total engagement)</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">#</th>
                  <th className="text-left font-medium px-3 py-2">Message</th>
                  <th className="text-left font-medium px-3 py-2">Type</th>
                  <th className="text-right font-medium px-3 py-2">Reactions</th>
                  <th className="text-right font-medium px-3 py-2">Comments</th>
                  <th className="text-right font-medium px-3 py-2">Shares</th>
                  <th className="text-right font-medium px-3 py-2">Reach</th>
                  <th className="text-right font-medium px-3 py-2">Eng %</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {topPosts.map((p, i) => {
                  const eng =
                    p.reach_count > 0
                      ? ((p.reactions_count + p.comments_count + p.shares_count) / p.reach_count) * 100
                      : null;
                  return (
                    <tr key={p.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{i + 1}</td>
                      <td className="px-3 py-2 max-w-[260px]">
                        <div className="truncate">{p.message ?? <span className="italic text-muted-foreground">(no message)</span>}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(p.posted_at), "MMM d, yyyy")}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-border bg-secondary/40 text-muted-foreground capitalize">
                          {mediaTypeIcon[p.media_type]}
                          {p.media_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{p.reactions_count.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{p.comments_count.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{p.shares_count.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{p.reach_count.toLocaleString()}</td>
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
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">By media type</div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Type</th>
                  <th className="text-right font-medium px-3 py-2">Posts</th>
                  <th className="text-right font-medium px-3 py-2">Avg reactions</th>
                  <th className="text-right font-medium px-3 py-2">Avg comments</th>
                  <th className="text-right font-medium px-3 py-2">Avg reach</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(byMediaType) as FBMediaType[])
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
                        <td className="px-3 py-2 text-right">{safe(g.reactions)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{safe(g.comments)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{safe(g.reach)}</td>
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
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Latest activity <span className="text-muted-foreground/60 normal-case font-normal">(5 most recent posts)</span></div>
          <div className="space-y-1.5">
            {recentPosts.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{p.message ?? <span className="italic text-muted-foreground">(no message)</span>}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {p.media_type} · {format(new Date(p.posted_at), "MMM d, yyyy")}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs ml-3">
                  <span className="inline-flex items-center gap-1">
                    <ThumbsUp className="h-3 w-3" style={{ color: FB_BLUE }} />
                    {p.reactions_count.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <MessageCircle className="h-3 w-3" />
                    {p.comments_count.toLocaleString()}
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

      {/* Revenue */}
      {account.infloww_campaign_code != null && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Infloww revenue</div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Campaign code</div>
                <div className="font-mono font-semibold">c{account.infloww_campaign_code}</div>
                {revenueStat?.campaign_url && (
                  <a
                    href={revenueStat.campaign_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-1"
                  >
                    <Link2 className="h-3 w-3" />
                    {revenueStat.campaign_url.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
              {revenueStat ? (
                <div className="grid grid-cols-3 gap-4 text-right">
                  <div>
                    <div className="text-xs text-muted-foreground">Clicks</div>
                    <div className="font-semibold">{revenueStat.clicks_count.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Subs</div>
                    <div className="font-semibold">{revenueStat.subscribers_count.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Revenue</div>
                    <div className="font-semibold text-success">${fmtMoney2(revenueStat.revenue_total)}</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic">Sync Infloww to load stats</div>
              )}
            </div>
          </div>
        </div>
      )}

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

// ── Posts Tab ──────────────────────────────────────────────────────────────────
const emptyPostForm = {
  facebook_account_id: "",
  message: "",
  media_type: "photo" as FBMediaType,
  posted_at: "",
  reactions_count: "",
  comments_count: "",
  shares_count: "",
  reach_count: "",
  video_views: "",
  url: "",
  notes: "",
};

function PostsTab({
  accounts, posts, onRefresh,
}: { accounts: FBAccount[]; posts: FBPost[]; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyPostForm);
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterMedia, setFilterMedia] = useState<string>("all");

  const onAddPost = async () => {
    if (!form.facebook_account_id) return toast.error("Pick a page");
    const payload = {
      facebook_account_id: form.facebook_account_id,
      message: form.message.trim() || null,
      media_type: form.media_type,
      posted_at: form.posted_at ? new Date(form.posted_at).toISOString() : new Date().toISOString(),
      reactions_count: parseInt(form.reactions_count) || 0,
      comments_count: parseInt(form.comments_count) || 0,
      shares_count: parseInt(form.shares_count) || 0,
      reach_count: parseInt(form.reach_count) || 0,
      video_views: parseInt(form.video_views) || 0,
      url: form.url.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error } = await supabase.from("facebook_posts").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Post added");
    setForm(emptyPostForm);
    setOpen(false);
    onRefresh();
  };

  const onDeletePost = async (id: string) => {
    const { error } = await supabase.from("facebook_posts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Post deleted");
    onRefresh();
  };

  const filtered = posts.filter((p) => {
    if (filterAccount !== "all" && p.facebook_account_id !== filterAccount) return false;
    if (filterMedia !== "all" && p.media_type !== filterMedia) return false;
    return true;
  });

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
        Add a Facebook page first before tracking posts.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Select value={filterAccount} onValueChange={setFilterAccount}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All pages</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterMedia} onValueChange={setFilterMedia}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All media types</SelectItem>
              <SelectItem value="photo">Photo</SelectItem>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="reel">Reel</SelectItem>
              <SelectItem value="link">Link</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} post{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add post</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Track a new Facebook post</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Page</Label>
                  <Select value={form.facebook_account_id} onValueChange={(v) => setForm({ ...form, facebook_account_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Media type</Label>
                  <Select value={form.media_type} onValueChange={(v) => setForm({ ...form, media_type: v as FBMediaType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="photo">Photo</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="reel">Reel</SelectItem>
                      <SelectItem value="link">Link</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Message</Label>
                <Input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Post text" />
              </div>
              <div className="space-y-1.5">
                <Label>Post URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://facebook.com/…/posts/…" />
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
                  <Label>Reach</Label>
                  <Input type="number" value={form.reach_count} onChange={(e) => setForm({ ...form, reach_count: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label>Reactions</Label>
                  <Input type="number" value={form.reactions_count} onChange={(e) => setForm({ ...form, reactions_count: e.target.value })} placeholder="0" />
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
                  <Label>Video views</Label>
                  <Input type="number" value={form.video_views} onChange={(e) => setForm({ ...form, video_views: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any context" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onAddPost}>Add post</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No posts tracked yet for this filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Message</th>
                <th className="text-left font-medium px-4 py-3">Page</th>
                <th className="text-left font-medium px-4 py-3">Type</th>
                <th className="text-left font-medium px-4 py-3">Posted</th>
                <th className="text-right font-medium px-4 py-3">Reactions</th>
                <th className="text-right font-medium px-4 py-3">Comments</th>
                <th className="text-right font-medium px-4 py-3">Shares</th>
                <th className="text-right font-medium px-4 py-3">Reach</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const acct = accounts.find((a) => a.id === p.facebook_account_id);
                return (
                  <tr key={p.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="font-medium truncate">{p.message ?? <span className="text-muted-foreground italic">(no message)</span>}</div>
                      {p.notes && <div className="text-xs text-muted-foreground truncate">{p.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{acct ? acct.name : "—"}</td>
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
                        <ThumbsUp className="h-3 w-3" style={{ color: FB_BLUE }} />
                        {p.reactions_count.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <MessageCircle className="h-3 w-3" />
                        {p.comments_count.toLocaleString()}
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
                        <Eye className="h-3 w-3" />
                        {p.reach_count.toLocaleString()}
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
                              <AlertDialogTitle>Delete this post?</AlertDialogTitle>
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
  accounts: FBAccount[];
  inflowwStats: InflowwStat[];
  syncing: boolean;
  onSyncInfloww: () => void;
  onRefresh: () => void;
}) {
  const assignAccount = async (accountId: string, code: number | null) => {
    const { error } = await supabase
      .from("facebook_accounts")
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
        <h3 className="text-sm font-semibold mb-3">Assign campaign codes to pages</h3>
        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            Add a Facebook page first.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Page</th>
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
                      <td className="px-4 py-3 font-medium align-top">{a.name}</td>
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
  accounts: FBAccount[];
  posts: FBPost[];
  inflowwStats: InflowwStat[];
}) {
  // Per-account revenue from Infloww attribution. Same shape as the
  // TikTok / IG analytics revenue strips.
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
    const totalReactions = posts.reduce((s, p) => s + p.reactions_count, 0);
    const totalComments = posts.reduce((s, p) => s + p.comments_count, 0);
    const totalShares = posts.reduce((s, p) => s + p.shares_count, 0);
    const totalReach = posts.reduce((s, p) => s + p.reach_count, 0);
    const avgEngagement = totalReach > 0
      ? ((totalReactions + totalComments + totalShares) / totalReach) * 100
      : null;
    return { total, totalReactions, totalComments, totalShares, totalReach, avgEngagement };
  }, [posts]);

  const byMediaType = useMemo(() => {
    const groups: Record<FBMediaType, { count: number; reactions: number; comments: number; reach: number }> = {
      photo: { count: 0, reactions: 0, comments: 0, reach: 0 },
      video: { count: 0, reactions: 0, comments: 0, reach: 0 },
      reel: { count: 0, reactions: 0, comments: 0, reach: 0 },
      link: { count: 0, reactions: 0, comments: 0, reach: 0 },
      status: { count: 0, reactions: 0, comments: 0, reach: 0 },
    };
    for (const p of posts) {
      const g = groups[p.media_type];
      g.count++;
      g.reactions += p.reactions_count;
      g.comments += p.comments_count;
      g.reach += p.reach_count;
    }
    return groups;
  }, [posts]);

  const topPosts = useMemo(() => {
    return [...posts]
      .sort((a, b) => b.reactions_count + b.comments_count + b.shares_count - (a.reactions_count + a.comments_count + a.shares_count))
      .slice(0, 5);
  }, [posts]);

  const accountLeaderboard = useMemo(() => {
    return [...accounts]
      .map((a) => {
        const accPosts = posts.filter((p) => p.facebook_account_id === a.id);
        const reactions = accPosts.reduce((s, p) => s + p.reactions_count, 0);
        const reach = accPosts.reduce((s, p) => s + p.reach_count, 0);
        return { account: a, postCount: accPosts.length, reactions, reach };
      })
      .sort((x, y) => y.reactions - x.reactions);
  }, [accounts, posts]);

  return (
    <div className="space-y-6">
      {/* Revenue from Facebook — total agency income across every page
          this creator runs, with per-page breakdown. */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              Revenue from Facebook
            </div>
            <div className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
              ${fmtMoney0(totalPlatformRevenue)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Across {accounts.length} page{accounts.length === 1 ? "" : "s"} · {totalClicks.toLocaleString()} clicks · {totalSubs.toLocaleString()} subscribers
            </div>
          </div>
        </div>
        {revenueByAccount.length > 0 && (
          <div className="mt-5 space-y-1.5">
            {revenueByAccount.map(({ account, revenue, clicks, subscribers, hasCode }) => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-card/60 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{account.name}</span>
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
        <StatCard label="Total posts" value={stats.total} sub="tracked" />
        <StatCard label="Total reactions" value={stats.totalReactions.toLocaleString()} sub="across posts" />
        <StatCard label="Total reach" value={stats.totalReach.toLocaleString()} sub="impressions" />
        <StatCard
          label="Avg engagement"
          value={stats.avgEngagement != null ? `${stats.avgEngagement.toFixed(2)}%` : "—"}
          sub="(reactions+comments+shares)/reach"
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Performance by media type</h3>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Type</th>
                <th className="text-right font-medium px-4 py-3">Posts</th>
                <th className="text-right font-medium px-4 py-3">Avg reactions</th>
                <th className="text-right font-medium px-4 py-3">Avg comments</th>
                <th className="text-right font-medium px-4 py-3">Avg reach</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(byMediaType) as FBMediaType[]).map((mt) => {
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
                    <td className="px-4 py-3 text-right">{safe(g.reactions)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{safe(g.comments)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{safe(g.reach)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Page leaderboard</h3>
        {accountLeaderboard.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No pages yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Page</th>
                  <th className="text-right font-medium px-4 py-3">Followers</th>
                  <th className="text-right font-medium px-4 py-3">Posts tracked</th>
                  <th className="text-right font-medium px-4 py-3">Total reactions</th>
                  <th className="text-right font-medium px-4 py-3">Total reach</th>
                </tr>
              </thead>
              <tbody>
                {accountLeaderboard.map(({ account, postCount, reactions, reach }) => (
                  <tr key={account.id} className="border-t border-border bg-card">
                    <td className="px-4 py-3">
                      <div className="font-medium">{account.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{statusLabels[account.status]}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{account.followers_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{postCount}</td>
                    <td className="px-4 py-3 text-right">{reactions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{reach.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Top posts by engagement</h3>
        {topPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No posts yet.
          </div>
        ) : (
          <div className="space-y-2">
            {topPosts.map((p) => {
              const acct = accounts.find((a) => a.id === p.facebook_account_id);
              return (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.message ?? <span className="italic text-muted-foreground">(no message)</span>}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {acct ? `${acct.name} · ` : ""}
                      <span className="capitalize">{p.media_type}</span>
                      {" · "}
                      {format(new Date(p.posted_at), "MMM d")}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-sm">
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp className="h-3 w-3" style={{ color: FB_BLUE }} />
                      {p.reactions_count.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <MessageCircle className="h-3 w-3" />
                      {p.comments_count.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Share2 className="h-3 w-3" />
                      {p.shares_count.toLocaleString()}
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
