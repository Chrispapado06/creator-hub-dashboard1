import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Trash2, Link2, DollarSign, Image, Video, FileText, Globe,
  AlertTriangle, Upload, Play, X, ArrowUp, MessageCircle,
  ExternalLink, RefreshCw, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format, formatDistanceToNow } from "date-fns";
import { SiReddit } from "react-icons/si";

export const Route = createFileRoute("/reddit")({ component: RedditPage });

// ── Types ─────────────────────────────────────────────────────────────────────
type Creator = { id: string; name: string; of_username: string | null; onlyfansapi_acct_id: string | null };
type RedditAccount = { id: string; creator_id: string; username: string; status: string; notes: string | null; infloww_campaign_code: number | null };
type Post = { id: string; reddit_account_id: string; post_id: string; title: string; subreddit: string; posted_at: string; upvotes: number; comments: number; url: string };
type Subreddit = { id: string; reddit_account_id: string; name: string; status: string; notes: string | null };
type TrackingLink = { id: string; reddit_account_id: string; label: string; url: string };
type ContentItem = { id: string; creator_id: string; reddit_account_id: string | null; subreddit_id: string | null; tracking_link_id: string | null; title: string; content_type: string; file_url: string | null; post_url: string | null; posted_at: string | null; notes: string | null; created_at: string };
type InflowwStat = { id: string; creator_id: string; reddit_account_id: string | null; campaign_code: number; campaign_url: string | null; clicks_count: number; subscribers_count: number; revenue_total: number; revenue_per_sub: number; spenders_count: number; synced_at: string };

// ── Style constants ────────────────────────────────────────────────────────────
const accountStatusStyles: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  shadowbanned: "bg-warning/15 text-warning border-warning/30",
  suspended: "bg-destructive/15 text-destructive border-destructive/30",
  inactive: "bg-muted text-muted-foreground border-border",
};
const subStatusStyles: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  banned: "bg-destructive/15 text-destructive border-destructive/30",
};
const contentTypeIcon: Record<string, React.ReactNode> = {
  image: <Image className="h-3.5 w-3.5" />,
  video: <Video className="h-3.5 w-3.5" />,
  text: <FileText className="h-3.5 w-3.5" />,
  link: <Globe className="h-3.5 w-3.5" />,
};
const emptyContentForm = { title: "", content_type: "image", file_url: "", reddit_account_id: "", subreddit_id: "", tracking_link_id: "", post_url: "", posted_at: "", notes: "" };

// ── Main component ─────────────────────────────────────────────────────────────
function RedditPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>("");
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [accounts, setAccounts] = useState<RedditAccount[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [inflowwStats, setInflowwStats] = useState<InflowwStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingReddit, setSyncingReddit] = useState(false);

  const loadCreatorData = async (creatorId: string) => {
    if (!creatorId) return;
    setLoading(true);
    const { data: ras } = await supabase
      .from("reddit_accounts")
      .select("id, creator_id, username, status, notes, infloww_campaign_code")
      .eq("creator_id", creatorId)
      .order("created_at");
    const raList = (ras ?? []) as RedditAccount[];
    setAccounts(raList);
    const raIds = raList.map((r) => r.id);
    if (raIds.length) {
      const [{ data: ps }, { data: subs }, { data: tls }] = await Promise.all([
        supabase.from("posts").select("*").in("reddit_account_id", raIds).order("posted_at", { ascending: false }),
        supabase.from("subreddits").select("*").in("reddit_account_id", raIds).order("name"),
        supabase.from("tracking_links").select("*").in("reddit_account_id", raIds).order("label"),
      ]);
      setPosts((ps ?? []) as Post[]);
      setSubreddits((subs ?? []) as Subreddit[]);
      setTrackingLinks((tls ?? []) as TrackingLink[]);
    } else {
      setPosts([]); setSubreddits([]); setTrackingLinks([]);
    }
    const [{ data: ci }, { data: inflowwData }] = await Promise.all([
      supabase.from("content_items").select("*").eq("creator_id", creatorId).order("created_at", { ascending: false }),
      supabase.from("infloww_tracking_stats").select("*").eq("creator_id", creatorId),
    ]);
    setContentItems((ci ?? []) as ContentItem[]);
    setInflowwStats((inflowwData ?? []) as InflowwStat[]);
    setLoading(false);
  };

  const loadCreators = async () => {
    const { data, error } = await supabase.from("creators").select("id, name, of_username, onlyfansapi_acct_id").order("name");
    if (error) { toast.error(`Failed to load creators: ${error.message}`); setLoading(false); return; }
    const cs = (data ?? []) as Creator[];
    setCreators(cs);
    if (cs.length > 0) {
      const first = cs[0];
      setSelectedCreatorId(first.id);
      setSelectedCreator(first);
      await loadCreatorData(first.id);
    } else { setLoading(false); }
  };

  useEffect(() => { loadCreators(); }, []);

  const handleCreatorChange = (id: string) => {
    const creator = creators.find((c) => c.id === id) ?? null;
    setSelectedCreatorId(id);
    setSelectedCreator(creator);
    loadCreatorData(id);
  };

  const refresh = () => loadCreatorData(selectedCreatorId);

  const syncRedditPosts = async () => {
    if (accounts.length === 0) return toast.error("No Reddit accounts to sync");
    setSyncingReddit(true);
    let totalNew = 0;
    let empty = 0;
    const failures: { username: string; reason: string }[] = [];
    for (const account of accounts) {
      try {
        const res = await fetch(`/reddit-api/user/${account.username}/submitted.json?limit=100&sort=new`);
        if (!res.ok) {
          let reason = `HTTP ${res.status}`;
          if (res.status === 404) reason = "404 — proxy not found (is the Vite dev server running?)";
          else if (res.status === 403) reason = "403 — Reddit blocked the request (rate-limited or account private)";
          else if (res.status === 429) reason = "429 — Reddit rate-limit hit, slow down and retry";
          else if (res.status >= 500) reason = `${res.status} — Reddit upstream error`;
          console.error(`Reddit sync failed for u/${account.username}:`, reason);
          failures.push({ username: account.username, reason });
          continue;
        }
        const json = await res.json() as { data?: { children?: { data: { id: string; title: string; subreddit: string; created_utc: number; score: number; num_comments: number; url: string; permalink: string } }[] } };
        const children = json.data?.children ?? [];
        if (children.length === 0) {
          console.warn(`Reddit sync: u/${account.username} returned 0 posts (suspended, private, or genuinely empty)`);
          empty++;
          continue;
        }
        const upserts = children.map((child) => ({
          reddit_account_id: account.id,
          post_id: child.data.id,
          title: child.data.title,
          subreddit: child.data.subreddit,
          posted_at: new Date(child.data.created_utc * 1000).toISOString(),
          upvotes: child.data.score,
          comments: child.data.num_comments,
          url: `https://reddit.com${child.data.permalink}`,
        }));
        const { error } = await supabase.from("posts").upsert(upserts, { onConflict: "post_id" });
        if (error) {
          console.error(`Supabase upsert failed for u/${account.username}:`, error);
          failures.push({ username: account.username, reason: `DB error: ${error.message}` });
        } else {
          totalNew += upserts.length;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const reason = msg.toLowerCase().includes("failed to fetch")
          ? "Network/proxy unreachable — Vite dev server may be stopped"
          : msg;
        console.error(`Reddit sync threw for u/${account.username}:`, err);
        failures.push({ username: account.username, reason });
      }
    }
    setSyncingReddit(false);

    const succeeded = accounts.length - failures.length - empty;
    if (failures.length === accounts.length) {
      const sample = failures[0];
      toast.error(`All ${accounts.length} account${accounts.length !== 1 ? "s" : ""} failed — first error: ${sample.reason}`);
    } else if (failures.length > 0) {
      toast.error(`Synced ${totalNew} posts · ${failures.length} failed (${failures[0].username}: ${failures[0].reason})`);
      refresh();
    } else if (empty === accounts.length) {
      toast.info(`All ${accounts.length} account${accounts.length !== 1 ? "s" : ""} returned 0 posts — accounts may be private, suspended, or empty`);
    } else {
      toast.success(`Synced ${totalNew} posts across ${succeeded} account${succeeded !== 1 ? "s" : ""}${empty > 0 ? ` · ${empty} empty` : ""}`);
      refresh();
    }
  };

  const syncInfloww = async () => {
    if (!selectedCreator) return;
    const key = import.meta.env.VITE_ONLYFANSAPI_KEY as string | undefined;
    if (!key) return toast.error("VITE_ONLYFANSAPI_KEY not set in .env");
    let acctId = selectedCreator.onlyfansapi_acct_id;
    if (!acctId) {
      if (!selectedCreator.of_username) return toast.error("Set the OnlyFans username first on the creator page");
      const res = await fetch("https://app.onlyfansapi.com/api/accounts", { headers: { Authorization: `Bearer ${key}` } });
      const accounts_list = (await res.json()) as { id: string; onlyfans_username: string }[];
      const match = accounts_list.find((a) => a.onlyfans_username?.toLowerCase() === selectedCreator.of_username!.toLowerCase());
      if (!match) return toast.error("Creator not found in OnlyFans API accounts");
      acctId = match.id;
      await supabase.from("creators").update({ onlyfansapi_acct_id: acctId }).eq("id", selectedCreatorId);
    }
    setSyncing(true);
    type OFLink = { campaignCode: number; campaignUrl: string; clicksCount: number; subscribersCount: number; revenue: { total: number; revenuePerSubscriber: number; spendersCount: number } };
    const allLinks: OFLink[] = [];
    let nextUrl: string | null = `https://app.onlyfansapi.com/api/${acctId}/tracking-links`;
    while (nextUrl) {
      const resp = await fetch(nextUrl, { headers: { Authorization: `Bearer ${key}` } });
      const json = (await resp.json()) as { data?: { list?: OFLink[] }; _pagination?: { next_page?: string } };
      allLinks.push(...(json.data?.list ?? []));
      nextUrl = json._pagination?.next_page ?? null;
    }
    if (allLinks.length === 0) { setSyncing(false); return toast.info("No tracking links found"); }
    const upserts = allLinks.map((l) => ({ creator_id: selectedCreatorId, campaign_code: l.campaignCode, campaign_url: l.campaignUrl, clicks_count: l.clicksCount, subscribers_count: l.subscribersCount, revenue_total: l.revenue.total, revenue_per_sub: l.revenue.revenuePerSubscriber, spenders_count: l.revenue.spendersCount, synced_at: new Date().toISOString() }));
    const { error } = await supabase.from("infloww_tracking_stats").upsert(upserts, { onConflict: "creator_id,campaign_code" });
    if (error) { setSyncing(false); return toast.error(error.message); }
    await supabase.from("revenue_entries").delete().eq("creator_id", selectedCreatorId).eq("source", "infloww");
    const today = new Date().toISOString().slice(0, 10);
    const assignedLinks = allLinks.filter((l) => accounts.some((a) => a.infloww_campaign_code === l.campaignCode));
    const revenueRows = assignedLinks.filter((l) => l.revenue.total > 0).map((l) => {
      const matched = accounts.find((a) => a.infloww_campaign_code === l.campaignCode)!;
      return { creator_id: selectedCreatorId, reddit_account_id: matched.id, amount: l.revenue.total, currency: "USD", entry_date: today, source: "infloww", notes: `c${l.campaignCode} — ${l.subscribersCount} subs, ${l.clicksCount} clicks` };
    });
    if (revenueRows.length > 0) {
      const { error: revErr } = await supabase.from("revenue_entries").insert(revenueRows);
      if (revErr) { setSyncing(false); return toast.error(revErr.message); }
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
          <SiReddit className="h-6 w-6" style={{ color: "#FF4500" }} />
          <h1 className="text-3xl font-bold tracking-tight">Reddit</h1>
        </div>
        <p className="text-sm text-muted-foreground">Manage Reddit accounts, posts, revenue, and performance per creator.</p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Creator:</span>
        <Select value={selectedCreatorId} onValueChange={handleCreatorChange}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select creator" /></SelectTrigger>
          <SelectContent>{creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {loading && !selectedCreatorId ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      ) : !selectedCreatorId ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          Select a creator above to manage their Reddit presence.
        </div>
      ) : loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="subreddits">Subreddits</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab creatorId={selectedCreatorId} accounts={accounts} posts={posts} subreddits={subreddits} trackingLinks={trackingLinks} inflowwStats={inflowwStats} syncing={syncing} syncingReddit={syncingReddit} onSyncInfloww={syncInfloww} onSyncReddit={syncRedditPosts} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="accounts" className="mt-6">
            <AccountsTab creatorId={selectedCreatorId} accounts={accounts} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="posts" className="mt-6">
            <PostsTab accounts={accounts} posts={posts} />
          </TabsContent>
          <TabsContent value="subreddits" className="mt-6">
            <SubredditsTab accounts={accounts} subreddits={subreddits} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="content" className="mt-6">
            <ContentTab creatorId={selectedCreatorId} accounts={accounts} subreddits={subreddits} trackingLinks={trackingLinks} contentItems={contentItems} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="revenue" className="mt-6">
            <RevenueTab accounts={accounts} trackingLinks={trackingLinks} inflowwStats={inflowwStats} syncing={syncing} onSyncInfloww={syncInfloww} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="analytics" className="mt-6">
            <AnalyticsTab accounts={accounts} posts={posts} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────────────
function OverviewTab({ creatorId, accounts, posts, subreddits, trackingLinks, inflowwStats, syncing, syncingReddit, onSyncInfloww, onSyncReddit, onRefresh }: {
  creatorId: string;
  accounts: RedditAccount[]; posts: Post[]; subreddits: Subreddit[]; trackingLinks: TrackingLink[]; inflowwStats: InflowwStat[];
  syncing: boolean; syncingReddit: boolean; onSyncInfloww: () => void; onSyncReddit: () => void; onRefresh: () => void;
}) {
  const totalRevenue = inflowwStats.reduce((s, i) => s + i.revenue_total, 0);
  const activeSubs = subreddits.filter((s) => s.status === "active").length;
  const posts30d = posts.filter((p) => Date.now() - new Date(p.posted_at).getTime() < 30 * 24 * 3600_000).length;
  const topPost = posts.length > 0 ? posts.reduce((a, b) => (a.upvotes > b.upvotes ? a : b)) : null;

  // ── Add-account / add-link / inline-note state for the cards grid ──
  const [addAccOpen, setAddAccOpen] = useState(false);
  const [accForm, setAccForm] = useState({ username: "", status: "active" });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ reddit_account_id: "", label: "", url: "" });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");

  const onAddAccount = async () => {
    if (!accForm.username.trim()) return toast.error("Username is required");
    const { error } = await supabase.from("reddit_accounts").insert({
      creator_id: creatorId,
      username: accForm.username.trim(),
      status: accForm.status as "active" | "shadowbanned" | "suspended" | "inactive",
    });
    if (error) return toast.error(error.message);
    toast.success("Reddit account added");
    setAccForm({ username: "", status: "active" });
    setAddAccOpen(false);
    onRefresh();
  };

  const onDeleteAccount = async (id: string) => {
    const { error } = await supabase.from("reddit_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Account removed");
    onRefresh();
  };

  const onAddLink = async () => {
    if (!linkForm.reddit_account_id) return toast.error("Pick an account");
    if (!linkForm.label.trim()) return toast.error("Label is required");
    if (!linkForm.url.trim()) return toast.error("URL is required");
    const { error } = await supabase.from("tracking_links").insert({
      reddit_account_id: linkForm.reddit_account_id,
      label: linkForm.label.trim(),
      url: linkForm.url.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Tracking link added");
    setLinkForm({ reddit_account_id: "", label: "", url: "" });
    setLinkOpen(false);
    onRefresh();
  };

  const onDeleteLink = async (id: string) => {
    const { error } = await supabase.from("tracking_links").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Link removed");
    onRefresh();
  };

  const saveAccountNote = async (accId: string, note: string) => {
    const { error } = await supabase
      .from("reddit_accounts")
      .update({ notes: note.trim() || null })
      .eq("id", accId);
    if (error) return toast.error(error.message);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
        <span className="text-sm font-medium text-muted-foreground">Sync:</span>
        <Button variant="outline" size="sm" onClick={onSyncReddit} disabled={syncingReddit}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncingReddit ? "animate-spin" : ""}`} />
          {syncingReddit ? "Syncing posts…" : "Sync Reddit posts"}
        </Button>
        <Button variant="outline" size="sm" onClick={onSyncInfloww} disabled={syncing}>
          <Upload className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-pulse" : ""}`} />
          {syncing ? "Syncing…" : "Sync Infloww"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Reddit accounts</div>
          <div className="text-2xl font-bold">{accounts.length}</div>
          <div className="text-xs text-muted-foreground mt-1">linked</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Posts (30d)</div>
          <div className="text-2xl font-bold">{posts30d}</div>
          <div className="text-xs text-muted-foreground mt-1">{posts.length} total tracked</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Active subreddits</div>
          <div className="text-2xl font-bold">{activeSubs}</div>
          <div className="text-xs text-muted-foreground mt-1">of {subreddits.length} tracked</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Infloww revenue</div>
          <div className="text-2xl font-bold text-success">${totalRevenue.toFixed(0)}</div>
          <div className="text-xs text-muted-foreground mt-1">total earned</div>
        </div>
      </div>

      {topPost && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Best performing post</div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-medium">{topPost.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                r/{topPost.subreddit} · {formatDistanceToNow(new Date(topPost.posted_at), { addSuffix: true })}
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="font-semibold flex items-center gap-1 justify-end">
                  <ArrowUp className="h-3.5 w-3.5 text-primary" />{topPost.upvotes.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">upvotes</div>
              </div>
              <a href={topPost.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      )}

      <HealthWarnings accounts={accounts} posts={posts} />

      {/* Reddit Accounts cards */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Reddit accounts</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onSyncInfloww} disabled={syncing}>
              <Upload className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-pulse" : ""}`} />
              {syncing ? "Syncing…" : "Sync Infloww"}
            </Button>
            <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Link2 className="h-4 w-4 mr-1.5" />Add tracking link
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add tracking link</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label>Account</Label>
                    <Select value={linkForm.reddit_account_id} onValueChange={(v) => setLinkForm({ ...linkForm, reddit_account_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>u/{a.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Label</Label>
                    <Input placeholder="e.g. Bio link" value={linkForm.label} onChange={(e) => setLinkForm({ ...linkForm, label: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>URL</Label>
                    <Input placeholder="https://infloww.me/..." value={linkForm.url} onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
                  <Button onClick={onAddLink}>Add</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={addAccOpen} onOpenChange={setAddAccOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />Add account
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Reddit account</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label>Username</Label>
                    <Input value={accForm.username} onChange={(e) => setAccForm({ ...accForm, username: e.target.value })} placeholder="luna_xo" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={accForm.status} onValueChange={(v) => setAccForm({ ...accForm, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="shadowbanned">Shadowbanned</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAddAccOpen(false)}>Cancel</Button>
                  <Button onClick={onAddAccount}>Add</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No Reddit accounts linked yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => {
              const acctLinks = trackingLinks.filter((l) => l.reddit_account_id === a.id);
              const acctPosts = posts.filter((p) => p.reddit_account_id === a.id);
              const acctStat = a.infloww_campaign_code != null
                ? inflowwStats.find((s) => s.campaign_code === a.infloww_campaign_code) ?? null
                : null;
              return (
                <div key={a.id} className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">u/{a.username}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{acctPosts.length} posts</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${accountStatusStyles[a.status]}`}>
                        {a.status}
                      </span>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove u/{a.username}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will also delete all posts, subreddits, and tracking links for this account.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDeleteAccount(a.id)}>Remove</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {acctLinks.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Tracking links</div>
                      {acctLinks.map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-2">
                          <a href={l.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate flex items-center gap-1">
                            <Link2 className="h-3 w-3 shrink-0" />
                            {l.label}
                          </a>
                          <button onClick={() => onDeleteLink(l.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Infloww</span>
                      {acctStat && (
                        <span className="text-[10px] text-muted-foreground">
                          synced {new Date(acctStat.synced_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {acctStat ? (
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        <div className="rounded-lg bg-secondary/60 px-2 py-1.5">
                          <div className="text-sm font-semibold">{acctStat.clicks_count.toLocaleString()}</div>
                          <div className="text-[10px] text-muted-foreground">Clicks</div>
                        </div>
                        <div className="rounded-lg bg-secondary/60 px-2 py-1.5">
                          <div className="text-sm font-semibold">{acctStat.subscribers_count.toLocaleString()}</div>
                          <div className="text-[10px] text-muted-foreground">Subs</div>
                        </div>
                        <div className="rounded-lg bg-success/15 px-2 py-1.5">
                          <div className="text-sm font-semibold text-success">${acctStat.revenue_total.toFixed(0)}</div>
                          <div className="text-[10px] text-muted-foreground">Earned</div>
                        </div>
                        {acctStat.spenders_count > 0 && (
                          <div className="col-span-3 flex justify-between text-[11px] text-muted-foreground px-1">
                            <span>{acctStat.spenders_count} spenders</span>
                            {acctStat.subscribers_count > 0 && (
                              <span>${acctStat.revenue_per_sub.toFixed(2)}/sub</span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground italic">
                        {a.infloww_campaign_code != null ? `c${a.infloww_campaign_code} — not synced yet` : "No campaign code set"}
                      </div>
                    )}
                    <InflowwCodeInput accountId={a.id} currentCode={a.infloww_campaign_code} onRefresh={onRefresh} />
                  </div>

                  <div className="mt-2 pt-2 border-t border-border/50">
                    {editingNoteId === a.id ? (
                      <input
                        autoFocus
                        className="w-full rounded border border-border bg-secondary/40 px-2 py-1 text-xs outline-none focus:border-primary"
                        value={noteValue}
                        onChange={(e) => setNoteValue(e.target.value)}
                        onBlur={() => { saveAccountNote(a.id, noteValue); setEditingNoteId(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { saveAccountNote(a.id, noteValue); setEditingNoteId(null); }
                          if (e.key === "Escape") setEditingNoteId(null);
                        }}
                        placeholder="Add a note…"
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingNoteId(a.id); setNoteValue(a.notes ?? ""); }}
                        className="flex w-full items-center gap-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <MessageSquare className="h-3 w-3 shrink-0" />
                        <span className={a.notes ? "" : "italic"}>{a.notes || "Add note…"}</span>
                      </button>
                    )}
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

// ── Accounts Tab ───────────────────────────────────────────────────────────────
function AccountsTab({ creatorId, accounts, onRefresh }: { creatorId: string; accounts: RedditAccount[]; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [accForm, setAccForm] = useState({ username: "", status: "active" });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");

  const saveAccountNote = async (accId: string, note: string) => {
    const { error } = await supabase.from("reddit_accounts").update({ notes: note.trim() || null }).eq("id", accId);
    if (error) toast.error(error.message); else onRefresh();
  };

  const onAddAccount = async () => {
    if (!accForm.username.trim()) return toast.error("Username is required");
    const { error } = await supabase.from("reddit_accounts").insert({ creator_id: creatorId, username: accForm.username.trim(), status: accForm.status });
    if (error) return toast.error(error.message);
    toast.success("Reddit account added");
    setAccForm({ username: "", status: "active" });
    setOpen(false);
    onRefresh();
  };

  const onDeleteAccount = async (id: string) => {
    const { error } = await supabase.from("reddit_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Account removed");
    onRefresh();
  };

  const onUpdateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("reddit_accounts").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{accounts.length} account{accounts.length !== 1 ? "s" : ""} linked.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Reddit account</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input value={accForm.username} onChange={(e) => setAccForm({ ...accForm, username: e.target.value })} placeholder="luna_xo" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={accForm.status} onValueChange={(v) => setAccForm({ ...accForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="shadowbanned">Shadowbanned</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
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
          No Reddit accounts linked yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Username</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Campaign code</th>
                <th className="text-left font-medium px-4 py-3">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 font-medium">u/{a.username}</td>
                  <td className="px-4 py-3">
                    <Select value={a.status} onValueChange={(v) => onUpdateStatus(a.id, v)}>
                      <SelectTrigger className={`h-7 w-34 text-xs border rounded-full px-2 ${accountStatusStyles[a.status] ?? ""}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="shadowbanned">Shadowbanned</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <InflowwCodeInput accountId={a.id} currentCode={a.infloww_campaign_code} onRefresh={onRefresh} />
                  </td>
                  <td className="px-4 py-3">
                    {editingNoteId === a.id ? (
                      <input autoFocus
                        className="w-full rounded border border-border bg-secondary/40 px-2 py-1 text-xs outline-none focus:border-primary"
                        value={noteValue}
                        onChange={(e) => setNoteValue(e.target.value)}
                        onBlur={() => { saveAccountNote(a.id, noteValue); setEditingNoteId(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { saveAccountNote(a.id, noteValue); setEditingNoteId(null); }
                          if (e.key === "Escape") setEditingNoteId(null);
                        }}
                        placeholder="Add a note…"
                      />
                    ) : (
                      <button onClick={() => { setEditingNoteId(a.id); setNoteValue(a.notes ?? ""); }}
                        className="text-left text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <span className={a.notes ? "" : "italic opacity-50"}>{a.notes || "Add note…"}</span>
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove u/{a.username}?</AlertDialogTitle>
                          <AlertDialogDescription>This will also delete all posts, subreddits, and tracking links for this account.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDeleteAccount(a.id)}>Remove</AlertDialogAction>
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

// ── Posts Tab ──────────────────────────────────────────────────────────────────
function PostsTab({ accounts, posts }: { accounts: RedditAccount[]; posts: Post[] }) {
  const [accountFilter, setAccountFilter] = useState("all");
  const [subFilter, setSubFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const postSubreddits = useMemo(() => Array.from(new Set(posts.map((p) => p.subreddit))).sort(), [posts]);

  const filteredPosts = useMemo(() => {
    const now = Date.now();
    const ranges: Record<string, number> = { "24h": 24 * 3600_000, "7d": 7 * 24 * 3600_000, "30d": 30 * 24 * 3600_000 };
    return posts.filter((p) => {
      if (accountFilter !== "all" && p.reddit_account_id !== accountFilter) return false;
      if (subFilter !== "all" && p.subreddit !== subFilter) return false;
      if (dateFilter !== "all") { const r = ranges[dateFilter]; if (r && now - new Date(p.posted_at).getTime() > r) return false; }
      return true;
    });
  }, [posts, accountFilter, subFilter, dateFilter]);

  const accountUsername = (id: string) => accounts.find((a) => a.id === id)?.username ?? "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Account" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>u/{a.username}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={subFilter} onValueChange={setSubFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Subreddit" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subreddits</SelectItem>
            {postSubreddits.map((s) => <SelectItem key={s} value={s}>r/{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Date" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">{filteredPosts.length} post{filteredPosts.length !== 1 ? "s" : ""}</span>
      </div>

      {filteredPosts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No posts match the current filters. Try syncing posts from the Overview tab.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Post</th>
                <th className="text-left font-medium px-4 py-3">Subreddit</th>
                <th className="text-left font-medium px-4 py-3">Account</th>
                <th className="text-left font-medium px-4 py-3">Posted</th>
                <th className="text-right font-medium px-4 py-3">Upvotes</th>
                <th className="text-right font-medium px-4 py-3">Comments</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredPosts.map((p) => (
                <tr key={p.id} className="border-t border-border bg-card hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 max-w-[260px]">
                    <div className="font-medium truncate">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground/60">{p.post_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-accent/40 px-2 py-0.5 text-xs">r/{p.subreddit}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">u/{accountUsername(p.reddit_account_id)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap" title={format(new Date(p.posted_at), "PPpp")}>
                    {formatDistanceToNow(new Date(p.posted_at), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <ArrowUp className="h-3.5 w-3.5 text-primary" />{p.upvotes.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <MessageCircle className="h-3.5 w-3.5" />{p.comments.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a href={p.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary inline-flex">
                      <ExternalLink className="h-4 w-4" />
                    </a>
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

// ── Subreddits Tab ────────────────────────────────────────────────────────────
function SubredditsTab({ accounts, subreddits, onRefresh }: { accounts: RedditAccount[]; subreddits: Subreddit[]; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ reddit_account_id: "", name: "", status: "active", notes: "" });
  const [editingSubNoteId, setEditingSubNoteId] = useState<string | null>(null);
  const [subNoteValue, setSubNoteValue] = useState("");

  const saveSubNote = async (subId: string, note: string) => {
    const { error } = await supabase.from("subreddits").update({ notes: note.trim() || null }).eq("id", subId);
    if (error) toast.error(error.message); else onRefresh();
  };

  const onAdd = async () => {
    if (!form.reddit_account_id) return toast.error("Select an account");
    if (!form.name.trim()) return toast.error("Subreddit name is required");
    const clean = form.name.trim().replace(/^r\//, "").toLowerCase();
    const { error } = await supabase.from("subreddits").insert({ reddit_account_id: form.reddit_account_id, name: clean, status: form.status, notes: form.notes.trim() || null });
    if (error) return toast.error(error.message);
    toast.success(`r/${clean} added`);
    setForm({ reddit_account_id: "", name: "", status: "active", notes: "" });
    setOpen(false);
    onRefresh();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("subreddits").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Subreddit removed");
    onRefresh();
  };

  const onUpdateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("subreddits").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    onRefresh();
  };

  if (accounts.length === 0) {
    return <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">Add a Reddit account first before adding subreddits.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Subreddits are tracked per Reddit account.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add subreddit</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add subreddit</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Reddit account</Label>
                <Select value={form.reddit_account_id} onValueChange={(v) => setForm({ ...form, reddit_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>u/{a.username}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subreddit name</Label>
                <Input placeholder="gonewild (no r/ needed)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Input placeholder="e.g. strict mods" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onAdd}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.map((a) => {
        const acctSubs = subreddits.filter((s) => s.reddit_account_id === a.id);
        return (
          <div key={a.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">u/{a.username}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${accountStatusStyles[a.status]}`}>{a.status}</span>
              </div>
              <span className="text-xs text-muted-foreground">{acctSubs.length} subreddits</span>
            </div>
            {acctSubs.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">No subreddits yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {acctSubs.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">r/{s.name}</div>
                      {editingSubNoteId === s.id ? (
                        <input autoFocus className="mt-0.5 w-full rounded border border-border bg-secondary/40 px-2 py-0.5 text-xs outline-none focus:border-primary"
                          value={subNoteValue} onChange={(e) => setSubNoteValue(e.target.value)}
                          onBlur={() => { saveSubNote(s.id, subNoteValue); setEditingSubNoteId(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { saveSubNote(s.id, subNoteValue); setEditingSubNoteId(null); } if (e.key === "Escape") setEditingSubNoteId(null); }}
                          placeholder="Add note…" />
                      ) : (
                        <button onClick={() => { setEditingSubNoteId(s.id); setSubNoteValue(s.notes ?? ""); }}
                          className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <span className={s.notes ? "" : "italic opacity-50"}>{s.notes || "Add note…"}</span>
                        </button>
                      )}
                    </div>
                    <Select value={s.status} onValueChange={(v) => onUpdateStatus(s.id, v)}>
                      <SelectTrigger className={`h-7 w-28 text-xs border rounded-full px-2 ${subStatusStyles[s.status] ?? ""}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="banned">Banned</SelectItem>
                      </SelectContent>
                    </Select>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><button className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove r/{s.name}?</AlertDialogTitle>
                          <AlertDialogDescription>Historical data is unaffected.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(s.id)}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Content Tab ───────────────────────────────────────────────────────────────
function ContentTab({ creatorId, accounts, subreddits, trackingLinks, contentItems, onRefresh }: {
  creatorId: string; accounts: RedditAccount[]; subreddits: Subreddit[]; trackingLinks: TrackingLink[]; contentItems: ContentItem[]; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyContentForm);

  const subsForAccount = useMemo(() => subreddits.filter((s) => s.reddit_account_id === form.reddit_account_id), [subreddits, form.reddit_account_id]);
  const linksForAccount = useMemo(() => trackingLinks.filter((l) => l.reddit_account_id === form.reddit_account_id), [trackingLinks, form.reddit_account_id]);

  const onAdd = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    const { error } = await supabase.from("content_items").insert({
      creator_id: creatorId, title: form.title.trim(), content_type: form.content_type,
      file_url: form.file_url.trim() || null, reddit_account_id: form.reddit_account_id || null,
      subreddit_id: form.subreddit_id || null, tracking_link_id: form.tracking_link_id || null,
      post_url: form.post_url.trim() || null, posted_at: form.posted_at || null, notes: form.notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Content item added");
    setForm(emptyContentForm);
    setOpen(false);
    onRefresh();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("content_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Item deleted");
    onRefresh();
  };

  const accountName = (id: string | null) => id ? (accounts.find((a) => a.id === id)?.username ?? "—") : "—";
  const subName = (id: string | null) => id ? (subreddits.find((s) => s.id === id)?.name ?? "—") : "—";
  const linkName = (id: string | null) => id ? (trackingLinks.find((l) => l.id === id)?.label ?? "—") : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manually log content pieces posted across Reddit accounts.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add content</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add content item</DialogTitle></DialogHeader>
            <div className="max-h-[75vh] overflow-y-auto space-y-4 py-2 pr-1">
              <div className="space-y-1.5">
                <Label>File <span className="text-muted-foreground">(optional)</span></Label>
                <FileDropZone value={form.file_url} onChange={(url, mimeHint) => {
                  const ct = mimeHint?.startsWith("video") ? "video" : mimeHint?.startsWith("image") ? "image" : form.content_type;
                  setForm({ ...form, file_url: url, content_type: ct });
                }} />
              </div>
              <div className="space-y-1.5">
                <Label>Title / description</Label>
                <Input placeholder="e.g. Bikini set – poolside shoot" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Content type</Label>
                <Select value={form.content_type} onValueChange={(v) => setForm({ ...form, content_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="text">Text post</SelectItem>
                    <SelectItem value="link">Link</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reddit account <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={form.reddit_account_id} onValueChange={(v) => setForm({ ...form, reddit_account_id: v, subreddit_id: "", tracking_link_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>u/{a.username}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subreddit <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={form.subreddit_id} onValueChange={(v) => setForm({ ...form, subreddit_id: v })} disabled={!form.reddit_account_id}>
                  <SelectTrigger><SelectValue placeholder="Select subreddit" /></SelectTrigger>
                  <SelectContent>{subsForAccount.map((s) => <SelectItem key={s.id} value={s.id}>r/{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tracking link <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={form.tracking_link_id} onValueChange={(v) => setForm({ ...form, tracking_link_id: v })} disabled={!form.reddit_account_id}>
                  <SelectTrigger><SelectValue placeholder="Select link" /></SelectTrigger>
                  <SelectContent>{linksForAccount.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Post URL <span className="text-muted-foreground">(optional)</span></Label>
                <Input placeholder="https://reddit.com/r/..." value={form.post_url} onChange={(e) => setForm({ ...form, post_url: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Posted at <span className="text-muted-foreground">(optional)</span></Label>
                <Input type="datetime-local" value={form.posted_at} onChange={(e) => setForm({ ...form, posted_at: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Input placeholder="e.g. performed well, repost next week" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onAdd}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {contentItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">No content logged yet.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 w-14" />
                <th className="text-left font-medium px-4 py-3">Title</th>
                <th className="text-left font-medium px-4 py-3">Type</th>
                <th className="text-left font-medium px-4 py-3">Account</th>
                <th className="text-left font-medium px-4 py-3">Subreddit</th>
                <th className="text-left font-medium px-4 py-3">Link</th>
                <th className="text-left font-medium px-4 py-3">Posted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {contentItems.map((item) => (
                <tr key={item.id} className="border-t border-border bg-card hover:bg-secondary/30 transition-colors">
                  <td className="px-3 py-2 w-14"><ContentPreview url={item.file_url} /></td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <div className="font-medium truncate">{item.title}</div>
                    {item.notes && <div className="text-xs text-muted-foreground truncate">{item.notes}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-md bg-accent/40 px-2 py-0.5 text-xs capitalize">
                      {contentTypeIcon[item.content_type]}{item.content_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{item.reddit_account_id ? `u/${accountName(item.reddit_account_id)}` : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{item.subreddit_id ? `r/${subName(item.subreddit_id)}` : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[120px] truncate text-xs">{linkName(item.tracking_link_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{item.posted_at ? format(new Date(item.posted_at), "MMM d, yyyy") : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.post_url && <a href={item.post_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-4 w-4" /></a>}
                      <AlertDialog>
                        <AlertDialogTrigger asChild><button className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete content item?</AlertDialogTitle>
                            <AlertDialogDescription>"{item.title}" will be permanently removed.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(item.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
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

// ── Revenue Tab ────────────────────────────────────────────────────────────────
function RevenueTab({ accounts, trackingLinks, inflowwStats, syncing, onSyncInfloww, onRefresh }: {
  accounts: RedditAccount[]; trackingLinks: TrackingLink[]; inflowwStats: InflowwStat[];
  syncing: boolean; onSyncInfloww: () => void; onRefresh: () => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ reddit_account_id: "", label: "", url: "" });

  const totalRevenue = inflowwStats.reduce((s, i) => s + i.revenue_total, 0);
  const totalClicks = inflowwStats.reduce((s, i) => s + i.clicks_count, 0);
  const totalSubs = inflowwStats.reduce((s, i) => s + i.subscribers_count, 0);
  const lastSynced = inflowwStats.length > 0 ? inflowwStats.reduce((a, b) => (a.synced_at > b.synced_at ? a : b)).synced_at : null;

  const onAddLink = async () => {
    if (!linkForm.reddit_account_id) return toast.error("Select an account");
    if (!linkForm.label.trim()) return toast.error("Label is required");
    if (!linkForm.url.trim()) return toast.error("URL is required");
    const { error } = await supabase.from("tracking_links").insert({ reddit_account_id: linkForm.reddit_account_id, label: linkForm.label.trim(), url: linkForm.url.trim() });
    if (error) return toast.error(error.message);
    toast.success("Tracking link added");
    setLinkForm({ reddit_account_id: "", label: "", url: "" });
    setLinkOpen(false);
    onRefresh();
  };

  const onDeleteLink = async (id: string) => {
    const { error } = await supabase.from("tracking_links").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Link removed");
    onRefresh();
  };

  return (
    <div className="space-y-10">

      {/* ── Infloww ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Infloww stats</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lastSynced ? `Last synced ${format(new Date(lastSynced), "MMM d, yyyy 'at' h:mm a")}` : "Not synced yet"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onSyncInfloww} disabled={syncing}>
            <Upload className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-pulse" : ""}`} />
            {syncing ? "Syncing…" : "Sync Infloww"}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1.5">Total revenue</div>
            <div className="text-xl font-bold text-success">${totalRevenue.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1.5">Total clicks</div>
            <div className="text-xl font-bold">{totalClicks.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1.5">Total subscribers</div>
            <div className="text-xl font-bold">{totalSubs.toLocaleString()}</div>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">Add Reddit accounts first.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Account</th>
                  <th className="text-left font-medium px-4 py-3">Campaign</th>
                  <th className="text-right font-medium px-4 py-3">Clicks</th>
                  <th className="text-right font-medium px-4 py-3">Subs</th>
                  <th className="text-right font-medium px-4 py-3">Spenders</th>
                  <th className="text-right font-medium px-4 py-3">$/sub</th>
                  <th className="text-right font-medium px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const stat = a.infloww_campaign_code != null
                    ? (inflowwStats.find((s) => s.campaign_code === a.infloww_campaign_code) ?? null)
                    : null;
                  return (
                    <tr key={a.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-medium">u/{a.username}</td>
                      <td className="px-4 py-3">
                        <InflowwCodeInput accountId={a.id} currentCode={a.infloww_campaign_code} onRefresh={onRefresh} />
                      </td>
                      <td className="px-4 py-3 text-right">{stat ? stat.clicks_count.toLocaleString() : <Dash />}</td>
                      <td className="px-4 py-3 text-right">{stat ? stat.subscribers_count.toLocaleString() : <Dash />}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{stat ? stat.spenders_count.toLocaleString() : <Dash />}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{stat ? `$${stat.revenue_per_sub.toFixed(2)}` : <Dash />}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${stat && stat.revenue_total > 0 ? "text-success" : ""}`}>
                        {stat ? `$${stat.revenue_total.toFixed(2)}` : <Dash />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Tracking Links ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Tracking links</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Links attached to each Reddit account for click tracking.</p>
          </div>
          <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Link2 className="h-4 w-4 mr-1.5" />Add link</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add tracking link</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Account</Label>
                  <Select value={linkForm.reddit_account_id} onValueChange={(v) => setLinkForm({ ...linkForm, reddit_account_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>u/{a.username}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Label</Label>
                  <Input placeholder="e.g. Bio link" value={linkForm.label} onChange={(e) => setLinkForm({ ...linkForm, label: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>URL</Label>
                  <Input placeholder="https://infloww.me/..." value={linkForm.url} onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
                <Button onClick={onAddLink}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {trackingLinks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">No tracking links yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Account</th>
                  <th className="text-left font-medium px-4 py-3">Label</th>
                  <th className="text-left font-medium px-4 py-3">URL</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {trackingLinks.map((l) => {
                  const acc = accounts.find((a) => a.id === l.reddit_account_id);
                  return (
                    <tr key={l.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground">u/{acc?.username ?? "—"}</td>
                      <td className="px-4 py-3 font-medium">{l.label}</td>
                      <td className="px-4 py-3">
                        <a href={l.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 max-w-[320px] truncate">
                          <Link2 className="h-3 w-3 shrink-0" />{l.url}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => onDeleteLink(l.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Analytics Tab ──────────────────────────────────────────────────────────────
function AnalyticsTab({ accounts, posts }: { accounts: RedditAccount[]; posts: Post[] }) {
  const [selectedAccount, setSelectedAccount] = useState("all");

  const filteredPosts = useMemo(
    () => selectedAccount === "all" ? posts : posts.filter((p) => p.reddit_account_id === selectedAccount),
    [posts, selectedAccount],
  );

  const selectedAccObj = accounts.find((a) => a.id === selectedAccount);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
        <span className="text-sm font-medium">View analytics for:</span>
        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>u/{a.username}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filteredPosts.length} posts</span>
        {selectedAccObj && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${accountStatusStyles[selectedAccObj.status]}`}>
            {selectedAccObj.status}
          </span>
        )}
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-1">Subreddit performance</h2>
        <p className="text-sm text-muted-foreground mb-4">Last 7 days — average upvotes per subreddit.</p>
        <SubredditScorecards posts={filteredPosts} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-1">Best time to post</h2>
        <p className="text-sm text-muted-foreground mb-4">Average upvotes by day of week and hour.</p>
        <BestTimeHeatmap posts={filteredPosts} />
      </section>
    </div>
  );
}

// ── Subreddit Scorecards ───────────────────────────────────────────────────────
function SubredditScorecards({ posts }: { posts: Post[] }) {
  const since7d = Date.now() - 7 * 24 * 3600_000;
  const stats = useMemo(() => {
    const m: Record<string, { sum: number; count: number }> = {};
    for (const p of posts) {
      if (new Date(p.posted_at).getTime() < since7d) continue;
      if (!m[p.subreddit]) m[p.subreddit] = { sum: 0, count: 0 };
      m[p.subreddit].sum += p.upvotes;
      m[p.subreddit].count++;
    }
    return m;
  }, [posts]);

  const subList = Object.entries(stats).map(([name, { sum, count }]) => ({ name, avg: sum / count, count })).sort((a, b) => b.avg - a.avg);
  if (subList.length === 0) return <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">No posts in the last 7 days.</div>;

  const creatorAvg = subList.reduce((s, x) => s + x.avg, 0) / subList.length;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-4 py-2.5">Subreddit</th>
            <th className="text-right font-medium px-4 py-2.5">Posts (7d)</th>
            <th className="text-right font-medium px-4 py-2.5">Avg upvotes</th>
            <th className="text-right font-medium px-4 py-2.5">vs avg</th>
            <th className="text-center font-medium px-4 py-2.5">Score</th>
          </tr>
        </thead>
        <tbody>
          {subList.map((s, i) => {
            const pct = ((s.avg - creatorAvg) / creatorAvg) * 100;
            const color = s.avg >= creatorAvg ? "success" : s.avg >= creatorAvg * 0.5 ? "warning" : "destructive";
            return (
              <tr key={i} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                <td className="px-4 py-2.5 font-medium">r/{s.name}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{s.count}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{Math.round(s.avg)}</td>
                <td className={`px-4 py-2.5 text-right text-xs font-medium ${pct >= 0 ? "text-success" : "text-destructive"}`}>{pct >= 0 ? "+" : ""}{Math.round(pct)}%</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-block h-3 w-3 rounded-full ${color === "success" ? "bg-success" : color === "warning" ? "bg-warning" : "bg-destructive"}`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Best Time Heatmap ─────────────────────────────────────────────────────────
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function BestTimeHeatmap({ posts }: { posts: Post[] }) {
  const [subFilter, setSubFilter] = useState("all");
  const subredditOptions = useMemo(() => Array.from(new Set(posts.map((p) => p.subreddit))).sort(), [posts]);
  const filtered = subFilter === "all" ? posts : posts.filter((p) => p.subreddit === subFilter);

  const grid = useMemo(() => {
    const g: { count: number; sum: number }[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ count: 0, sum: 0 })));
    for (const p of filtered) {
      const d = new Date(p.posted_at);
      const day = (d.getDay() + 6) % 7;
      const hour = d.getHours();
      g[day][hour].count++;
      g[day][hour].sum += p.upvotes;
    }
    return g;
  }, [filtered]);

  const maxAvg = useMemo(() => { let m = 0; for (const row of grid) for (const cell of row) if (cell.count > 0) m = Math.max(m, cell.sum / cell.count); return m || 1; }, [grid]);

  if (posts.length === 0) return <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">No posts to analyse yet.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Subreddit:</span>
        <Select value={subFilter} onValueChange={setSubFilter}>
          <SelectTrigger className="w-[200px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subreddits</SelectItem>
            {subredditOptions.map((s) => <SelectItem key={s} value={s}>r/{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
        <div className="inline-block min-w-full">
          <div className="flex">
            <div className="w-10 shrink-0" />
            {Array.from({ length: 24 }, (_, i) => <div key={i} className="w-7 text-center text-[10px] text-muted-foreground leading-none mb-1">{i % 4 === 0 ? i : ""}</div>)}
          </div>
          {DAYS.map((day, di) => (
            <div key={di} className="flex items-center">
              <div className="w-10 shrink-0 text-[11px] text-muted-foreground">{day}</div>
              {grid[di].map((cell, hi) => {
                const avg = cell.count > 0 ? cell.sum / cell.count : 0;
                return (
                  <div key={hi} className="w-7 h-6 rounded-sm mx-px"
                    style={{ backgroundColor: cell.count > 0 ? `oklch(0.72 0.18 30 / ${(0.15 + (avg / maxAvg) * 0.85).toFixed(2)})` : "oklch(0.5 0 0 / 0.07)" }}
                    title={cell.count > 0 ? `${day} ${hi}:00 — ${cell.count} post${cell.count !== 1 ? "s" : ""}, avg ${Math.round(avg)} upvotes` : `${day} ${hi}:00 — no data`}
                  />
                );
              })}
            </div>
          ))}
          <div className="flex items-center gap-3 mt-4 ml-10">
            <span className="text-[10px] text-muted-foreground">Fewer upvotes</span>
            <div className="flex gap-px">{[0.15, 0.35, 0.55, 0.75, 1.0].map((o, i) => <div key={i} className="h-3 w-5 rounded-sm" style={{ backgroundColor: `oklch(0.72 0.18 30 / ${o})` }} />)}</div>
            <span className="text-[10px] text-muted-foreground">More upvotes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Health Warnings ────────────────────────────────────────────────────────────
function HealthWarnings({ accounts, posts }: { accounts: RedditAccount[]; posts: Post[] }) {
  const warnings = useMemo(() => {
    const w: { type: string; message: string }[] = [];
    const now = Date.now();
    const since48h = now - 48 * 3600_000;
    const since24h = now - 24 * 3600_000;
    const since7d = now - 7 * 24 * 3600_000;
    const since14d = now - 14 * 24 * 3600_000;
    const lastPost: Record<string, number> = {};
    const subCount24h: Record<string, Record<string, number>> = {};
    const perfMap: Record<string, { tw: number[]; lw: number[] }> = {};
    for (const p of posts) {
      const pt = new Date(p.posted_at).getTime();
      if (!lastPost[p.reddit_account_id] || pt > lastPost[p.reddit_account_id]) lastPost[p.reddit_account_id] = pt;
      if (pt >= since24h) {
        if (!subCount24h[p.reddit_account_id]) subCount24h[p.reddit_account_id] = {};
        subCount24h[p.reddit_account_id][p.subreddit] = (subCount24h[p.reddit_account_id][p.subreddit] ?? 0) + 1;
      }
      if (pt >= since14d) {
        if (!perfMap[p.reddit_account_id]) perfMap[p.reddit_account_id] = { tw: [], lw: [] };
        if (pt >= since7d) perfMap[p.reddit_account_id].tw.push(p.upvotes);
        else perfMap[p.reddit_account_id].lw.push(p.upvotes);
      }
    }
    for (const acc of accounts) {
      const u = `u/${acc.username}`;
      const last = lastPost[acc.id];
      if (!last || last < since48h) {
        const h = last ? Math.round((now - last) / 3600_000) : null;
        w.push({ type: "idle", message: h ? `${u} hasn't posted in ${h}h` : `${u} has no tracked posts` });
      }
      for (const [sub, cnt] of Object.entries(subCount24h[acc.id] ?? {})) {
        if (cnt >= 3) w.push({ type: "spam", message: `${u}: ${cnt} posts in r/${sub} in 24h — ban risk` });
      }
      const perf = perfMap[acc.id];
      if (perf && perf.tw.length >= 3 && perf.lw.length >= 3) {
        const tAvg = perf.tw.reduce((a, b) => a + b, 0) / perf.tw.length;
        const lAvg = perf.lw.reduce((a, b) => a + b, 0) / perf.lw.length;
        if (tAvg < lAvg * 0.7) w.push({ type: "perf", message: `${u}: avg upvotes down ${Math.round((1 - tAvg / lAvg) * 100)}% vs last week` });
      }
    }
    return w;
  }, [accounts, posts]);

  if (warnings.length === 0) return null;
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
      </div>
      <ul className="space-y-1">
        {warnings.map((w, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-destructive/80">
            <span className="shrink-0">{w.type === "spam" ? "🚨" : w.type === "perf" ? "📉" : "⏰"}</span>
            {w.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Infloww Code Input ─────────────────────────────────────────────────────────
function InflowwCodeInput({ accountId, currentCode, onRefresh }: { accountId: string; currentCode: number | null; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(currentCode != null ? String(currentCode) : "");

  const save = async () => {
    const parsed = val.replace(/^c/i, "").trim();
    const code = parsed === "" ? null : parseInt(parsed, 10);
    if (parsed !== "" && isNaN(code!)) { toast.error("Enter a number (e.g. 6 or c6)"); return; }
    const { error } = await supabase.from("reddit_accounts").update({ infloww_campaign_code: code }).eq("id", accountId);
    if (error) return toast.error(error.message);
    setEditing(false);
    onRefresh();
  };

  if (editing) {
    return (
      <div className="flex gap-1.5 items-center">
        <input autoFocus className="w-20 rounded border border-border bg-secondary/40 px-2 py-1 text-xs font-mono outline-none focus:border-primary"
          value={val} onChange={(e) => setVal(e.target.value)} placeholder="c69"
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} />
        <button onClick={save} className="text-xs text-primary hover:underline shrink-0">Save</button>
        <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">✕</button>
      </div>
    );
  }
  return (
    <button onClick={() => { setVal(currentCode != null ? String(currentCode) : ""); setEditing(true); }}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
      <DollarSign className="h-3 w-3" />
      {currentCode != null ? `c${currentCode}` : <span className="italic opacity-50">Set code…</span>}
    </button>
  );
}

// ── File helpers ───────────────────────────────────────────────────────────────
function urlIsImage(url: string) { return /\.(jpg|jpeg|png|gif|webp|avif|bmp)(\?|$)/i.test(url); }
function urlIsVideo(url: string) { return /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url) || /redgifs\.com/i.test(url); }

function ContentPreview({ url }: { url: string | null }) {
  if (!url) return null;
  if (urlIsImage(url)) return <a href={url} target="_blank" rel="noreferrer"><img src={url} className="h-10 w-10 rounded-md object-cover border border-border bg-secondary" loading="lazy" /></a>;
  return <a href={url} target="_blank" rel="noreferrer" className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground hover:text-primary transition-colors" title={url}><Play className="h-4 w-4" /></a>;
}

function FileDropZone({ value, onChange }: { value: string; onChange: (url: string, mimeHint?: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("content-files").upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("content-files").getPublicUrl(path);
    onChange(publicUrl, file.type);
    setUploading(false);
  };

  if (value) {
    return (
      <div className="relative rounded-xl border border-border overflow-hidden bg-secondary/30">
        {urlIsImage(value) ? <img src={value} className="max-h-40 w-full object-cover" /> : urlIsVideo(value) ? <video src={value} className="max-h-40 w-full rounded-none" controls /> : <div className="flex items-center gap-2 p-3"><Play className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="text-xs text-muted-foreground truncate">{value}</span></div>}
        <button type="button" onClick={() => onChange("")} className="absolute right-2 top-2 rounded-full border border-border bg-background/80 p-1 text-muted-foreground transition-colors hover:text-destructive"><X className="h-3 w-3" /></button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
        onClick={() => inputRef.current?.click()}>
        <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        {uploading ? <p className="text-sm text-muted-foreground">Uploading…</p> : (
          <><Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">Drop image or video here, or click to browse</p><p className="mt-1 text-[11px] text-muted-foreground/60">JPG, PNG, GIF, MP4, WEBM · max 100 MB</p></>
        )}
      </div>
      <div className="flex items-center gap-2"><div className="h-px flex-1 bg-border" /><span className="text-[10px] uppercase tracking-wide text-muted-foreground">or paste URL</span><div className="h-px flex-1 bg-border" /></div>
      <input type="url" placeholder="https://redgifs.com/watch/… or direct image/video URL"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
        onBlur={(e) => { if (e.target.value.trim()) { onChange(e.target.value.trim()); e.target.value = ""; } }}
        onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) { onChange(e.currentTarget.value.trim()); e.currentTarget.value = ""; } }} />
    </div>
  );
}

// ── Misc ───────────────────────────────────────────────────────────────────────
function Dash() { return <span className="text-muted-foreground/40">—</span>; }
