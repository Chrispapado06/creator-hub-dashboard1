import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  ExternalLink,
  MessageCircle,
  ArrowUp,
  Plus,
  Trash2,
  Link2,
  DollarSign,
  Image,
  Video,
  FileText,
  Globe,
  Pencil,
  AlertTriangle,
  Download,
  MessageSquare,
  Upload,
  Play,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfAccountsEditor } from "@/components/OfAccountsEditor";
import { CreatorRail } from "@/components/CreatorRail";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { format, formatDistanceToNow } from "date-fns";
import { CreatorAvatarUpload } from "@/components/CreatorAvatarUpload";
import { isMissingCreatorAvatarColumnError, normalizeCreatorFromDb } from "@/lib/creator-db";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { CreatorGoals } from "@/components/CreatorGoals";
import { CreatorDocuments } from "@/components/CreatorDocuments";
import { CreatorForms } from "@/components/CreatorForms";
import { CreatorLanding } from "@/components/CreatorLanding";
import { CreatorPayouts } from "@/components/CreatorPayouts";
import { logAudit } from "@/lib/audit";
import { StatTile } from "@/components/StatTile";
import { TrendingUp as TrendingUpIcon, Receipt as ReceiptIcon, Wallet as WalletIcon, Layers } from "lucide-react";
import { SiOnlyfans } from "react-icons/si";
import { Area, AreaChart as RcAreaChart, ResponsiveContainer as RcContainer, Tooltip as RcTooltip, XAxis as RcXAxis, YAxis as RcYAxis } from "recharts";
import { eachDayOfInterval, parseISO } from "date-fns";

export const Route = createFileRoute("/creators/$creatorId")({
  head: () => ({ meta: [{ title: "Creator — Agency Console" }] }),
  component: CreatorDetailPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
        <p className="text-sm">{error.message}</p>
        <Button
          className="mt-3"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="text-center py-20">
      <p className="text-muted-foreground">Creator not found.</p>
      <Link to="/" className="text-primary hover:underline mt-2 inline-block">
        Back to creators
      </Link>
    </div>
  ),
});

// ── Types ────────────────────────────────────────────────────────────────────

type Creator = {
  id: string;
  name: string;
  of_username: string | null;
  status: string;
  avatar_url: string | null;
  onlyfansapi_acct_id: string | null;
};
type RedditAccount = {
  id: string;
  username: string;
  status: string;
  notes: string | null;
  infloww_campaign_code: number | null;
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
type Post = {
  id: string;
  reddit_account_id: string;
  post_id: string;
  title: string;
  subreddit: string;
  posted_at: string;
  upvotes: number;
  comments: number;
  url: string;
};
type Subreddit = {
  id: string;
  reddit_account_id: string;
  name: string;
  status: string;
  notes: string | null;
};
type TrackingLink = { id: string; reddit_account_id: string; label: string; url: string };
type ContentItem = {
  id: string;
  creator_id: string;
  reddit_account_id: string | null;
  subreddit_id: string | null;
  tracking_link_id: string | null;
  title: string;
  content_type: string;
  file_url: string | null;
  post_url: string | null;
  posted_at: string | null;
  notes: string | null;
  created_at: string;
};
type RevenueEntry = {
  id: string;
  creator_id: string;
  reddit_account_id: string | null;
  tracking_link_id: string | null;
  amount: number;
  currency: string;
  entry_date: string;
  source: string;
  notes: string | null;
};
type OrganicEntry = {
  id: string;
  creator_id: string;
  amount: number;
  sub_count: number | null;
  entry_date: string;
  notes: string | null;
  created_at: string;
};
type InternalEntry = {
  id: string;
  creator_id: string;
  amount: number;
  entry_type: string;
  entry_date: string;
  notes: string | null;
  created_at: string;
};
type AdCampaign = {
  id: string;
  creator_id: string;
  platform: string;
  amount_spent: number;
  revenue_generated: number;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
};
type RevenueGoal = {
  id: string;
  creator_id: string;
  channel: string;
  target_amount: number;
  period_start: string;
  period_end: string;
  created_at: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const accountStatusStyles: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  shadowbanned: "bg-warning/15 text-warning border-warning/30",
  suspended: "bg-destructive/15 text-destructive border-destructive/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

const creatorStatusStyles: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

const subStatusStyles: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  banned: "bg-destructive/15 text-destructive border-destructive/30",
};

const sourceLabel: Record<string, string> = {
  new_sub: "New Sub",
  renewal: "Renewal",
  tip: "Tip",
  ppv: "PPV",
  infloww: "Infloww",
  other: "Other",
};

const sourceStyles: Record<string, string> = {
  new_sub: "bg-success/15 text-success border-success/30",
  renewal: "bg-primary/15 text-primary border-primary/30",
  tip: "bg-warning/15 text-warning border-warning/30",
  ppv: "bg-accent text-accent-foreground border-border",
  infloww: "bg-primary/15 text-primary border-primary/30",
  other: "bg-muted text-muted-foreground border-border",
};

const contentTypeIcon: Record<string, React.ReactNode> = {
  image: <Image className="h-3.5 w-3.5" />,
  video: <Video className="h-3.5 w-3.5" />,
  text: <FileText className="h-3.5 w-3.5" />,
  link: <Globe className="h-3.5 w-3.5" />,
};

// ── Main component ────────────────────────────────────────────────────────────

function CreatorDetailPage() {
  const { creatorId } = Route.useParams();
  const navigate = useNavigate();

  const [creator, setCreator] = useState<Creator | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    of_username: "",
    status: "active",
    avatar_url: null as string | null,
    onlyfansapi_acct_id: null as string | null,
  });
  const [accounts, setAccounts] = useState<RedditAccount[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [revenueEntries, setRevenueEntries] = useState<RevenueEntry[]>([]);
  const [organicEntries, setOrganicEntries] = useState<OrganicEntry[]>([]);
  const [internalEntries, setInternalEntries] = useState<InternalEntry[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaign[]>([]);
  const [revenueGoals, setRevenueGoals] = useState<RevenueGoal[]>([]);
  const [inflowwStats, setInflowwStats] = useState<InflowwStat[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creatorLoadError, setCreatorLoadError] = useState<string | null>(null);

  // Cross-platform accounts + staff data
  type CrossAccount = { id: string; label: string; status: string; followers: number };
  const [igAccounts, setIgAccounts] = useState<CrossAccount[]>([]);
  const [fbAccounts, setFbAccounts] = useState<CrossAccount[]>([]);
  const [ttAccounts, setTtAccounts] = useState<CrossAccount[]>([]);
  type AssignedStaff = { id: string; name: string; role: string; status: string; commission_pct: number };
  const [assignedStaff, setAssignedStaff] = useState<AssignedStaff[]>([]);
  type CreatorShift = {
    id: string;
    chatter_id: string;
    chatter_name: string;
    start_at: string;
    end_at: string | null;
    total_revenue: number;
    target_account_name: string | null;
    notes: string | null;
  };
  const [creatorShifts, setCreatorShifts] = useState<CreatorShift[]>([]);

  const headerMtd = useMemo(() => {
    // Three rollup buckets:
    //   • Organic = social posts (Reddit, IG, FB, X, TikTok) — organic_revenue_entries
    //   • Internal = internal tracking links — internal_revenue_entries
    //   • Ads = Meta ads (ad_campaigns) + OnlyFinder paid traffic (revenue_entries from Infloww sync)
    const mtdStart = new Date();
    mtdStart.setDate(1);
    mtdStart.setHours(0, 0, 0, 0);
    const mtdStartStr = mtdStart.toISOString().slice(0, 10);
    let mtdOrganic = 0;
    let mtdInternal = 0;
    let mtdAdsRevenue = 0;
    let mtdAdsSpend = 0;
    for (const e of organicEntries) {
      if (e.entry_date >= mtdStartStr) mtdOrganic += e.amount;
    }
    for (const e of internalEntries) {
      if (e.entry_date >= mtdStartStr) mtdInternal += e.amount;
    }
    for (const e of revenueEntries) {
      // OnlyFinder/Infloww-synced revenue counts as Ads (paid traffic)
      if (e.entry_date >= mtdStartStr) mtdAdsRevenue += e.amount;
    }
    for (const e of adCampaigns) {
      if (e.start_date >= mtdStartStr) {
        mtdAdsRevenue += e.revenue_generated;
        mtdAdsSpend += e.amount_spent;
      }
    }
    const mtdAdsNet = mtdAdsRevenue - mtdAdsSpend;
    const total = mtdOrganic + mtdInternal + mtdAdsNet;
    return { mtdOrganic, mtdInternal, mtdAdsNet, mtdAdsRevenue, mtdAdsSpend, total };
  }, [revenueEntries, organicEntries, internalEntries, adCampaigns]);

  const load = async () => {
    setLoading(true);
    const [
      cr,
      { data: ras },
      { data: subs },
      { data: tls },
      { data: ci },
      { data: rev },
      { data: org },
      { data: int_ },
      { data: ads },
      { data: goals },
      { data: igAccs },
      { data: fbAccs },
      { data: ttAccs },
      { data: assignmentsRaw },
      { data: shiftsRaw },
    ] = await Promise.all([
      supabase.from("creators").select("*").eq("id", creatorId).maybeSingle(),
      supabase
        .from("reddit_accounts")
        .select("id, username, status, notes, infloww_campaign_code")
        .eq("creator_id", creatorId)
        .order("created_at"),
      supabase.from("subreddits").select("*").order("name"),
      supabase.from("tracking_links").select("*").order("label"),
      supabase
        .from("content_items")
        .select("*")
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false }),
      supabase
        .from("revenue_entries")
        .select("*")
        .eq("creator_id", creatorId)
        .neq("source", "infloww")
        .order("entry_date", { ascending: false }),
      supabase
        .from("organic_entries")
        .select("*")
        .eq("creator_id", creatorId)
        .order("entry_date", { ascending: false }),
      supabase
        .from("internal_entries")
        .select("*")
        .eq("creator_id", creatorId)
        .order("entry_date", { ascending: false }),
      supabase
        .from("ad_campaigns")
        .select("*")
        .eq("creator_id", creatorId)
        .order("start_date", { ascending: false }),
      supabase
        .from("revenue_goals")
        .select("*")
        .eq("creator_id", creatorId)
        .order("period_start", { ascending: false }),
      supabase
        .from("instagram_accounts")
        .select("id, username, status, followers_count")
        .eq("creator_id", creatorId)
        .order("followers_count", { ascending: false }),
      supabase
        .from("facebook_accounts")
        .select("id, name, status, followers_count")
        .eq("creator_id", creatorId)
        .order("followers_count", { ascending: false }),
      supabase
        .from("tiktok_accounts")
        .select("id, username, status, followers_count")
        .eq("creator_id", creatorId)
        .order("followers_count", { ascending: false }),
      supabase
        .from("chatter_assignments")
        .select("chatter_id, active, chatters(id, name, role, status, commission_pct)")
        .eq("creator_id", creatorId)
        .eq("active", true),
      supabase
        .from("shifts")
        .select("id, chatter_id, start_at, end_at, total_revenue, target_account_name, notes, chatters(name)")
        .eq("creator_id", creatorId)
        .order("start_at", { ascending: false })
        .limit(50),
    ]);
    const { data: c, error: creatorErr } = cr;
    if (creatorErr) {
      setCreatorLoadError(creatorErr.message);
      toast.error(creatorErr.message);
      setCreator(null);
    } else {
      setCreatorLoadError(null);
      setCreator(normalizeCreatorFromDb(c) as Creator | null);
    }
    const raList = (ras ?? []) as RedditAccount[];
    setAccounts(raList);
    const raIds = raList.map((r) => r.id);
    if (raIds.length) {
      const { data: ps } = await supabase
        .from("posts")
        .select("*")
        .in("reddit_account_id", raIds)
        .order("posted_at", { ascending: false });
      setPosts((ps ?? []) as Post[]);
      setSubreddits(
        ((subs ?? []) as Subreddit[]).filter((s) => raIds.includes(s.reddit_account_id)),
      );
      setTrackingLinks(
        ((tls ?? []) as TrackingLink[]).filter((l) => raIds.includes(l.reddit_account_id)),
      );
    } else {
      setPosts([]);
      setSubreddits([]);
      setTrackingLinks([]);
    }
    setContentItems((ci ?? []) as ContentItem[]);
    setRevenueEntries((rev ?? []) as RevenueEntry[]);
    setOrganicEntries((org ?? []) as OrganicEntry[]);
    setInternalEntries((int_ ?? []) as InternalEntry[]);
    setAdCampaigns((ads ?? []) as AdCampaign[]);
    setRevenueGoals((goals ?? []) as RevenueGoal[]);

    // Cross-platform account snapshots
    setIgAccounts(
      ((igAccs ?? []) as { id: string; username: string; status: string; followers_count: number }[])
        .map((a) => ({ id: a.id, label: `@${a.username}`, status: a.status, followers: a.followers_count }))
    );
    setFbAccounts(
      ((fbAccs ?? []) as { id: string; name: string; status: string; followers_count: number }[])
        .map((a) => ({ id: a.id, label: a.name, status: a.status, followers: a.followers_count }))
    );
    setTtAccounts(
      ((ttAccs ?? []) as { id: string; username: string; status: string; followers_count: number }[])
        .map((a) => ({ id: a.id, label: `@${a.username}`, status: a.status, followers: a.followers_count }))
    );

    // Assigned staff (chatter_assignments where creator_id matches, joined to chatters)
    type AssignmentRow = {
      chatter_id: string;
      active: boolean;
      chatters: { id: string; name: string; role: string; status: string; commission_pct: number } | null;
    };
    const assigns = (assignmentsRaw ?? []) as AssignmentRow[];
    setAssignedStaff(
      assigns
        .map((a) => a.chatters)
        .filter((c): c is NonNullable<typeof c> => c !== null)
    );

    // Recent shifts for this creator (with chatter name)
    type ShiftRow = {
      id: string;
      chatter_id: string;
      start_at: string;
      end_at: string | null;
      total_revenue: number;
      target_account_name: string | null;
      notes: string | null;
      chatters: { name: string } | null;
    };
    const shifts = (shiftsRaw ?? []) as ShiftRow[];
    setCreatorShifts(
      shifts.map((s) => ({
        id: s.id,
        chatter_id: s.chatter_id,
        chatter_name: s.chatters?.name ?? "—",
        start_at: s.start_at,
        end_at: s.end_at,
        total_revenue: s.total_revenue,
        target_account_name: s.target_account_name,
        notes: s.notes,
      }))
    );

    const { data: inflowwData } = await supabase
      .from("infloww_tracking_stats")
      .select("*")
      .eq("creator_id", creatorId);
    setInflowwStats((inflowwData ?? []) as InflowwStat[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [creatorId]);

  const onEditCreator = async () => {
    if (!editForm.name.trim()) return toast.error("Name is required");
    const base = {
      name: editForm.name.trim(),
      of_username: editForm.of_username.trim() || null,
      status: editForm.status as "active" | "paused" | "inactive",
    };
    let missingAvatarFallback = false;
    let error = (
      await supabase
        .from("creators")
        .update({ ...base, avatar_url: editForm.avatar_url ?? null, onlyfansapi_acct_id: editForm.onlyfansapi_acct_id ?? null })
        .eq("id", creatorId)
    ).error;
    if (error && isMissingCreatorAvatarColumnError(error)) {
      missingAvatarFallback = true;
      error = (await supabase.from("creators").update({ ...base, onlyfansapi_acct_id: editForm.onlyfansapi_acct_id ?? null }).eq("id", creatorId)).error;
    }
    if (error) return toast.error(error.message);
    toast.success("Creator updated");
    const statusChanged = creator?.status !== base.status;
    void logAudit({
      action: statusChanged ? "creator_status_changed" : "creator_updated",
      entity_type: "creator",
      entity_id: creatorId,
      entity_name: base.name,
      details: statusChanged ? `${creator?.status ?? "?"} → ${base.status}` : null,
    });
    if (missingAvatarFallback && editForm.avatar_url) {
      toast.info("Photos need the creators avatar migration in Supabase (`avatar_url` column + storage).");
    }
    setEditOpen(false);
    load();
  };

  const onDeleteCreator = async () => {
    const { error } = await supabase.from("creators").delete().eq("id", creatorId);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "creator_deleted",
      entity_type: "creator",
      entity_id: creatorId,
      entity_name: creator?.name,
    });
    toast.success("Creator deleted");
    navigate({ to: "/" });
  };

  const syncInfloww = async () => {
    if (!creator) return;
    const key = import.meta.env.VITE_ONLYFANSAPI_KEY as string | undefined;
    if (!key) return toast.error("VITE_ONLYFANSAPI_KEY not set in .env");
    let acctId = creator.onlyfansapi_acct_id;
    if (!acctId) {
      if (!creator.of_username) return toast.error("Set the OnlyFans username first");
      const res = await fetch("https://app.onlyfansapi.com/api/accounts", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const accounts_list = (await res.json()) as { id: string; onlyfans_username: string }[];
      const match = accounts_list.find(
        (a) => a.onlyfans_username?.toLowerCase() === creator.of_username!.toLowerCase(),
      );
      if (!match) return toast.error("Creator not found in OnlyFans API accounts");
      acctId = match.id;
      await supabase.from("creators").update({ onlyfansapi_acct_id: acctId }).eq("id", creatorId);
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
      const json = (await resp.json()) as { data?: { list?: OFLink[] }; _pagination?: { next_page?: string } };
      allLinks.push(...(json.data?.list ?? []));
      nextUrl = json._pagination?.next_page ?? null;
    }
    if (allLinks.length === 0) {
      setSyncing(false);
      return toast.info("No tracking links found for this creator");
    }
    const upserts = allLinks.map((l) => ({
      creator_id: creatorId,
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
    if (error) { setSyncing(false); return toast.error(error.message); }

    // Write revenue into revenue_entries so charts update automatically.
    // Delete previous infloww entries for this creator, then insert fresh ones.
    await supabase
      .from("revenue_entries")
      .delete()
      .eq("creator_id", creatorId)
      .eq("source", "infloww");

    const today = new Date().toISOString().slice(0, 10);
    // Only write revenue entries for links explicitly assigned to a Reddit account
    const assignedLinks = allLinks.filter((l) =>
      accounts.some((a) => a.infloww_campaign_code === l.campaignCode),
    );
    const revenueRows = assignedLinks
      .filter((l) => l.revenue.total > 0)
      .map((l) => {
        const matchedAccount = accounts.find((a) => a.infloww_campaign_code === l.campaignCode)!;
        return {
          creator_id: creatorId,
          reddit_account_id: matchedAccount.id,
          amount: l.revenue.total,
          currency: "USD",
          entry_date: today,
          source: "infloww",
          notes: `c${l.campaignCode} — ${l.subscribersCount} subs, ${l.clicksCount} clicks`,
        };
      });

    if (revenueRows.length > 0) {
      const { error: revErr } = await supabase.from("revenue_entries").insert(revenueRows);
      if (revErr) { setSyncing(false); return toast.error(revErr.message); }
    }

    setSyncing(false);
    const assignedRevenue = assignedLinks.reduce((s, l) => s + l.revenue.total, 0);
    toast.success(`Synced ${assignedLinks.length} assigned link${assignedLinks.length !== 1 ? "s" : ""} · $${assignedRevenue.toFixed(2)} revenue (${allLinks.length} total links on account)`);
    load();
  };

  const exportCreator = () => {
    const accountUsername = (id: string) => accounts.find((a) => a.id === id)?.username ?? "";
    const rows: string[][] = [
      ["Account", "Subreddit", "Post ID", "Title", "Posted At", "Upvotes", "Comments", "URL"],
      ...posts.map((p) => [
        `u/${accountUsername(p.reddit_account_id)}`,
        p.subreddit,
        p.post_id,
        p.title,
        p.posted_at,
        String(p.upvotes),
        String(p.comments),
        p.url,
      ]),
    ];
    downloadCSV(`${creator?.name.replace(/\s+/g, "-") ?? "creator"}-export.csv`, rows);
  };

  if (loading && !creator) {
    return (
      <div className="flex gap-5 items-start">
        <CreatorRail activeId={creatorId} />
        <div className="flex-1 min-w-0">
          <div className="h-64 animate-pulse rounded-xl bg-card/60" />
        </div>
      </div>
    );
  }

  if (!loading && creatorLoadError) {
    return (
      <div className="flex gap-5 items-start">
        <CreatorRail activeId={creatorId} />
        <div className="flex-1 min-w-0 space-y-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            All creators
          </Link>
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-8 text-center">
            <p className="text-sm font-medium text-destructive">Couldn&apos;t load this creator</p>
            <p className="mt-2 text-xs text-muted-foreground">{creatorLoadError}</p>
            <Button className="mt-4" onClick={() => load()}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="flex gap-5 items-start">
        <CreatorRail activeId={creatorId} />
        <div className="flex-1 min-w-0 text-center py-20">
          <p className="text-muted-foreground">Creator not found.</p>
          <Link to="/" className="text-primary hover:underline mt-2 inline-block">
            Back to creators
          </Link>
        </div>
      </div>
    );
  }

  const totalUpvotes = posts.reduce((s, p) => s + p.upvotes, 0);
  // Three rollup buckets (lifetime):
  //   • Organic = social posts (Reddit, IG, FB, X, TikTok) → organic_revenue_entries
  //   • Internal = internal tracking links → internal_revenue_entries
  //   • Ads = Meta ad campaigns + OnlyFinder paid traffic (revenue_entries from Infloww sync)
  const totalOrganicRev = organicEntries.reduce((s, e) => s + e.amount, 0);
  const totalInternalRev = internalEntries.reduce((s, e) => s + e.amount, 0);
  const totalOnlyFinderRev = revenueEntries.reduce((s, e) => s + e.amount, 0);
  const totalMetaAdsRev = adCampaigns.reduce((s, c) => s + c.revenue_generated, 0);
  const totalAdsSpend = adCampaigns.reduce((s, c) => s + c.amount_spent, 0);
  const totalAdsRevenue = totalOnlyFinderRev + totalMetaAdsRev;
  const totalRevenue = totalOrganicRev + totalInternalRev + totalAdsRevenue;

  return (
    <div className="flex gap-5 items-start">
      <CreatorRail activeId={creatorId} />
      <div className="flex-1 min-w-0 space-y-8">
      <Toaster />

      {/* Edit creator dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit creator</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Photo</Label>
              <CreatorAvatarUpload
                creatorId={creatorId}
                value={editForm.avatar_url}
                name={editForm.name || "?"}
                onChange={(url) => setEditForm({ ...editForm, avatar_url: url })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>OnlyFans username</Label>
              <Input
                value={editForm.of_username}
                onChange={(e) => setEditForm({ ...editForm, of_username: e.target.value })}
                placeholder="lunarivers"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm({ ...editForm, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>OnlyFans API account ID</Label>
              <div className="flex gap-2">
                <Input
                  value={editForm.onlyfansapi_acct_id ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, onlyfansapi_acct_id: e.target.value.trim() || null })}
                  placeholder="acct_…"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={async () => {
                    const key = import.meta.env.VITE_ONLYFANSAPI_KEY;
                    if (!key) return toast.error("VITE_ONLYFANSAPI_KEY not set in .env");
                    const res = await fetch("https://app.onlyfansapi.com/api/accounts", {
                      headers: { Authorization: `Bearer ${key}` },
                    });
                    const json = await res.json();
                    const match = (json as { id: string; onlyfans_username: string }[]).find(
                      (a) => a.onlyfans_username?.toLowerCase() === editForm.of_username.toLowerCase().trim(),
                    );
                    if (match) {
                      setEditForm((f) => ({ ...f, onlyfansapi_acct_id: match.id }));
                      toast.success(`Found: ${match.id}`);
                    } else {
                      toast.error("No matching account found for this OF username");
                    }
                  }}
                >
                  Auto-detect
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Used to sync tracking link stats from Infloww</p>
            </div>
            {/* Multi-account editor — let admins add a second / third
                OnlyFans page to the same creator. The earnings sync
                fans out across every account here and rolls up the
                totals under this creator. */}
            <OfAccountsEditor creatorId={creatorId} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onEditCreator}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All creators
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-[image:var(--gradient-surface)] p-6">
        <div className="flex flex-wrap items-center gap-4">
          {creator.avatar_url ? (
            <img
              src={creator.avatar_url}
              alt={creator.name}
              className="h-16 w-16 rounded-full object-cover border-2 border-border shadow-[var(--shadow-glow)]"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-xl font-bold shadow-[var(--shadow-glow)]">
              {creator.name.charAt(0)}
            </div>
          )}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{creator.name}</h1>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0 ${
                  creatorStatusStyles[creator.status] ??
                  creatorStatusStyles.inactive
                }`}
              >
                {creator.status}
              </span>
              <button
                onClick={() => {
                  setEditForm({
                    name: creator.name,
                    of_username: creator.of_username ?? "",
                    status: creator.status,
                    avatar_url: creator.avatar_url ?? null,
                    onlyfansapi_acct_id: creator.onlyfansapi_acct_id ?? null,
                  });
                  setEditOpen(true);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Edit creator"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete creator"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {creator.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes {creator.name} and all their accounts, posts,
                      content, and revenue entries.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDeleteCreator}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {creator.of_username && (
              <a
                href={`https://onlyfans.com/${creator.of_username}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
              >
                @{creator.of_username} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="grid grid-cols-4 gap-6 text-right">
              <Stat label="Accounts" value={accounts.length} />
              <Stat label="Posts" value={posts.length} />
              <Stat label="Upvotes" value={totalUpvotes.toLocaleString()} />
              <Stat
                label="Total Revenue"
                value={`$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              />
            </div>
            <Button size="sm" variant="outline" onClick={exportCreator} title="Export posts as CSV">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {headerMtd.total > 0 && (
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            {headerMtd.total > 0 && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    MTD revenue
                  </span>
                  <span className="text-sm font-bold">
                    $
                    {headerMtd.total.toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden flex bg-secondary">
                  {headerMtd.mtdOrganic > 0 && (
                    <div
                      className="h-full bg-success"
                      style={{ width: `${(headerMtd.mtdOrganic / headerMtd.total) * 100}%` }}
                      title={`Organic (Reddit / IG / FB / X / TikTok) $${headerMtd.mtdOrganic.toFixed(0)}`}
                    />
                  )}
                  {headerMtd.mtdInternal > 0 && (
                    <div
                      className="h-full bg-warning"
                      style={{ width: `${(headerMtd.mtdInternal / headerMtd.total) * 100}%` }}
                      title={`Internal $${headerMtd.mtdInternal.toFixed(0)}`}
                    />
                  )}
                  {headerMtd.mtdAdsNet > 0 && (
                    <div
                      className="h-full bg-ads"
                      style={{ width: `${(headerMtd.mtdAdsNet / headerMtd.total) * 100}%` }}
                      title={`Ads net (Meta + OnlyFinder) $${headerMtd.mtdAdsNet.toFixed(0)}`}
                    />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {headerMtd.mtdOrganic > 0 && (
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success" />Organic ${headerMtd.mtdOrganic.toFixed(0)}</span>
                  )}
                  {headerMtd.mtdInternal > 0 && (
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-warning" />Internal ${headerMtd.mtdInternal.toFixed(0)}</span>
                  )}
                  {headerMtd.mtdAdsNet !== 0 && (
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-ads" />Ads net ${headerMtd.mtdAdsNet.toFixed(0)}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-6 flex-wrap h-auto gap-1 overflow-x-auto max-w-full min-h-10">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="landing">Landing page</TabsTrigger>
          <TabsTrigger value="organic">Organic</TabsTrigger>
          <TabsTrigger value="internal">Internal</TabsTrigger>
          <TabsTrigger value="ads">Ads</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            accounts={accounts}
            posts={posts}
            subreddits={subreddits}
            trackingLinks={trackingLinks}
            creatorId={creatorId}
            onRefresh={load}
            organicRev={totalOrganicRev}
            internalRev={totalInternalRev}
            adsRev={totalAdsRevenue}
            adsSpend={totalAdsSpend}
            adsBreakdown={{ onlyfinder: totalOnlyFinderRev, meta: totalMetaAdsRev }}
            inflowwStats={inflowwStats}
            syncing={syncing}
            onSyncInfloww={syncInfloww}
            organicEntries={organicEntries}
            internalEntries={internalEntries}
            revenueEntries={revenueEntries}
            adCampaigns={adCampaigns}
          />
        </TabsContent>

        <TabsContent value="plan">
          <PlanTab
            creatorId={creatorId}
            creatorName={creator?.name}
            revenueEntries={revenueEntries}
            organicEntries={organicEntries}
            internalEntries={internalEntries}
            adCampaigns={adCampaigns}
          />
        </TabsContent>

        <TabsContent value="platforms">
          <PlatformsTab
            creatorId={creatorId}
            redditAccounts={accounts}
            igAccounts={igAccounts}
            fbAccounts={fbAccounts}
            ttAccounts={ttAccounts}
            ofUsername={creator?.of_username ?? null}
          />
        </TabsContent>

        <TabsContent value="staff">
          <StaffTab
            creatorId={creatorId}
            assignedStaff={assignedStaff}
            shifts={creatorShifts}
          />
        </TabsContent>

        <TabsContent value="documents" className="space-y-10">
          <CreatorForms creatorId={creatorId} creatorName={creator?.name} />
          <div className="border-t border-border pt-8">
            <CreatorDocuments creatorId={creatorId} creatorName={creator?.name} />
          </div>
        </TabsContent>

        <TabsContent value="landing">
          <CreatorLanding creatorId={creatorId} creatorName={creator?.name} />
        </TabsContent>

        <TabsContent value="organic">
          <OrganicTab
            creatorId={creatorId}
            entries={organicEntries}
            goals={revenueGoals.filter((g) => g.channel === "organic" || g.channel === "total")}
            onRefresh={load}
          />
        </TabsContent>

        <TabsContent value="internal">
          <InternalTab creatorId={creatorId} entries={internalEntries} onRefresh={load} />
        </TabsContent>

        <TabsContent value="ads">
          <AdsTab creatorId={creatorId} campaigns={adCampaigns} onRefresh={load} />
        </TabsContent>

        <TabsContent value="payouts">
          <CreatorPayouts creatorId={creatorId} creatorName={creator?.name} />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

// ── Plan Tab (onboarding + goals) ─────────────────────────────────────────────

function PlanTab({
  creatorId,
  creatorName,
  revenueEntries,
  organicEntries,
  internalEntries,
  adCampaigns,
}: {
  creatorId: string;
  creatorName?: string;
  revenueEntries: RevenueEntry[];
  organicEntries: OrganicEntry[];
  internalEntries: InternalEntry[];
  adCampaigns: AdCampaign[];
}) {
  const actuals = useMemo(() => {
    const monthOf = (iso: string) => iso.slice(0, 7);
    const bucket = (rows: { entry_date?: string; start_date?: string; amount: number }[], dateKey: "entry_date" | "start_date") => {
      const m: Record<string, number> = {};
      for (const r of rows) {
        const d = r[dateKey];
        if (!d) continue;
        const k = monthOf(d);
        m[k] = (m[k] ?? 0) + (r.amount ?? 0);
      }
      return m;
    };
    const adsNetByMonth: Record<string, number> = {};
    for (const c of adCampaigns) {
      const k = c.start_date.slice(0, 7);
      adsNetByMonth[k] = (adsNetByMonth[k] ?? 0) + (c.revenue_generated - c.amount_spent);
    }
    return {
      redditByMonth: bucket(revenueEntries, "entry_date"),
      organicByMonth: bucket(organicEntries, "entry_date"),
      internalByMonth: bucket(internalEntries, "entry_date"),
      adsNetByMonth,
    };
  }, [revenueEntries, organicEntries, internalEntries, adCampaigns]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <section className="rounded-xl border border-border bg-card/30 p-5">
        <CreatorGoals creatorId={creatorId} creatorName={creatorName} actuals={actuals} />
      </section>
      <section className="rounded-xl border border-border bg-card/30 p-5">
        <OnboardingChecklist creatorId={creatorId} creatorName={creatorName} />
      </section>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  accounts,
  posts,
  subreddits,
  trackingLinks,
  creatorId,
  onRefresh,
  organicRev,
  internalRev,
  adsRev,
  adsSpend,
  adsBreakdown,
  inflowwStats,
  syncing,
  onSyncInfloww,
  organicEntries,
  internalEntries,
  revenueEntries,
  adCampaigns,
}: {
  accounts: RedditAccount[];
  posts: Post[];
  subreddits: Subreddit[];
  trackingLinks: TrackingLink[];
  creatorId: string;
  onRefresh: () => void;
  organicRev: number;
  internalRev: number;
  adsRev: number;
  adsSpend: number;
  adsBreakdown: { onlyfinder: number; meta: number };
  inflowwStats: InflowwStat[];
  syncing: boolean;
  onSyncInfloww: () => void;
  /** Raw entry arrays — used to build the 30-day daily-revenue series
   *  feeding the sparklines on the personal-revenue tiles. */
  organicEntries: OrganicEntry[];
  internalEntries: InternalEntry[];
  revenueEntries: RevenueEntry[];
  adCampaigns: AdCampaign[];
}) {
  const [open, setOpen] = useState(false);
  const [accForm, setAccForm] = useState({ username: "", status: "active" });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ reddit_account_id: "", label: "", url: "" });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");

  const saveAccountNote = async (accId: string, note: string) => {
    const { error } = await supabase
      .from("reddit_accounts")
      .update({ notes: note.trim() || null })
      .eq("id", accId);
    if (error) toast.error(error.message);
    else onRefresh();
  };

  const [subFilter, setSubFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");

  const postSubreddits = useMemo(
    () => Array.from(new Set(posts.map((p) => p.subreddit))).sort(),
    [posts],
  );

  const filteredPosts = useMemo(() => {
    const now = Date.now();
    const ranges: Record<string, number> = {
      "24h": 24 * 3600_000,
      "7d": 7 * 24 * 3600_000,
      "30d": 30 * 24 * 3600_000,
    };
    return posts.filter((p) => {
      if (subFilter !== "all" && p.subreddit !== subFilter) return false;
      if (accountFilter !== "all" && p.reddit_account_id !== accountFilter) return false;
      if (dateFilter !== "all") {
        const range = ranges[dateFilter];
        if (range && now - new Date(p.posted_at).getTime() > range) return false;
      }
      return true;
    });
  }, [posts, subFilter, dateFilter, accountFilter]);

  const accountUsername = (id: string) => accounts.find((a) => a.id === id)?.username ?? "—";

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
    setOpen(false);
    onRefresh();
  };

  const onDeleteAccount = async (id: string) => {
    const { error } = await supabase.from("reddit_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Account removed");
    onRefresh();
  };

  const onAddLink = async () => {
    if (!linkForm.reddit_account_id) return toast.error("Select an account");
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

  // OnlyFans lifetime earnings — pulled from the synced of_creator_stats
  // table (one row per creator + OF page). Declared up here so the
  // `channelTotal` and `grossRevenue` calcs immediately below can read
  // it without hitting a "Cannot access uninitialized variable" TDZ
  // error (which is what happened the first time around — these
  // variables ran in module order, the state was declared further down).
  const [ofLifetime, setOfLifetime] = useState<number>(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: rows } = await supabase
        .from("of_creator_stats")
        .select("total_earnings")
        .eq("creator_id", creatorId);
      if (cancelled) return;
      const total = (rows ?? []).reduce(
        (s, r) => s + Number((r as { total_earnings?: number }).total_earnings ?? 0),
        0,
      );
      setOfLifetime(total);
    })();
    return () => { cancelled = true; };
  }, [creatorId]);

  // Channel total includes OF direct so the breakdown bar reconciles
  // with the gross revenue tile above.
  const channelTotal = organicRev + internalRev + adsRev + ofLifetime;
  const adsTooltip = `Ads $${adsRev.toFixed(2)} — Meta $${adsBreakdown.meta.toFixed(2)} · OnlyFinder $${adsBreakdown.onlyfinder.toFixed(2)}`;

  // ── Personal-revenue rollup (Nexus pattern, mirrors /revenue page) ──
  // Three KPIs: Revenue (gross), Net Revenue (gross − ad spend),
  // Expenses (ad spend). Sparklines come from a 30-day daily series
  // built from the entry arrays so the tiles feel alive without an
  // extra Supabase round-trip.
  //
  // Gross revenue NOW includes OF direct lifetime earnings — same
  // formula the /revenue page's per-creator breakdown uses
  // (organic + internal + ads + OF direct). Without this, the Overview
  // tab under-reported by the OF amount and disagreed with the Revenue
  // dashboard.
  const grossRevenue = organicRev + internalRev + adsRev + ofLifetime;
  const netRevenue = grossRevenue - adsSpend;
  const totalExpenses = adsSpend;

  const dailyRevenueSeries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today.getTime() - 29 * 86400_000);
    const days = eachDayOfInterval({ start, end: today });
    const isoDay = (d: Date | string) => {
      const date = typeof d === "string" ? parseISO(d) : d;
      return format(date, "yyyy-MM-dd");
    };
    const map = new Map<string, { rev: number; spend: number }>();
    for (const d of days) map.set(isoDay(d), { rev: 0, spend: 0 });
    const add = (key: string, rev: number, spend = 0) => {
      const cur = map.get(key);
      if (!cur) return;        // outside the 30-day window
      cur.rev += rev;
      cur.spend += spend;
    };
    for (const e of organicEntries) add(isoDay(e.entry_date), e.amount);
    for (const e of internalEntries) add(isoDay(e.entry_date), e.amount);
    for (const e of revenueEntries) add(isoDay(e.entry_date), e.amount);
    for (const c of adCampaigns) {
      // Bucket each ad campaign by start_date — close enough for a 30-day
      // sparkline; precise per-day attribution lives on /revenue.
      const sd = (c as unknown as { start_date?: string | null }).start_date ?? null;
      if (sd) add(isoDay(sd), c.revenue_generated, c.amount_spent);
    }
    return Array.from(map.entries()).map(([date, v]) => ({
      x: date,
      rev: v.rev,
      net: v.rev - v.spend,
      spend: v.spend,
    }));
  }, [organicEntries, internalEntries, revenueEntries, adCampaigns]);

  const sparkRev = dailyRevenueSeries.map((d) => ({ x: d.x, y: d.rev }));
  const sparkNet = dailyRevenueSeries.map((d) => ({ x: d.x, y: d.net }));
  const sparkSpend = dailyRevenueSeries.map((d) => ({ x: d.x, y: d.spend }));

  // ── OnlyFans Direct earnings (last 30d / 7d / today) ──────────────
  // Fires three small analytics calls in parallel so the user sees
  // OF performance at a glance on the creator detail page.
  const [ofData, setOfData] = useState<{
    today: number; sevenD: number; thirtyD: number; loaded: boolean;
  }>({ today: 0, sevenD: 0, thirtyD: 0, loaded: false });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Pull every OF page connected to this creator (could be 1+).
      // The earnings card sums across all of them.
      const { data: rows } = await supabase
        .from("creator_of_accounts")
        .select("onlyfansapi_acct_id")
        .eq("creator_id", creatorId)
        .not("onlyfansapi_acct_id", "is", null);
      let acctIds = (rows ?? [])
        .map((r) => r.onlyfansapi_acct_id as string)
        .filter(Boolean);
      // Legacy fallback for creators not yet migrated into creator_of_accounts.
      if (acctIds.length === 0) {
        const { data: row } = await supabase
          .from("creators")
          .select("onlyfansapi_acct_id")
          .eq("id", creatorId)
          .maybeSingle();
        const acctId = row?.onlyfansapi_acct_id as string | null | undefined;
        if (acctId) acctIds = [acctId];
      }
      if (acctIds.length === 0 || cancelled) return;
      const { fetchOfEarnings } = await import("@/lib/of-sync");
      const today = new Date().toISOString().slice(0, 10);
      const sevenAgo = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
      const thirtyAgo = new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10);
      const [t, w, m] = await Promise.all([
        fetchOfEarnings(acctIds, today, today),
        fetchOfEarnings(acctIds, sevenAgo, today),
        fetchOfEarnings(acctIds, thirtyAgo, today),
      ]);
      if (!cancelled) {
        setOfData({ today: t.total, sevenD: w.total, thirtyD: m.total, loaded: true });
      }
    })();
    return () => { cancelled = true; };
  }, [creatorId]);

  return (
    <div className="space-y-8">
      {/* ── Personal revenue (Nexus pattern, mirrors /revenue page).
          Three white KPI tiles: Revenue (gross), Net Revenue (after ad
          spend), Expenses (ad spend). Sparklines = last 30 days of
          per-day rollups. */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="h-7 w-7 rounded-lg bg-primary/12 text-primary flex items-center justify-center">
            <DollarSign className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Personal revenue</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              All-time roll-up across every channel · sparklines show last 30 days
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatTile
            tone="emerald"
            icon={<WalletIcon className="h-4 w-4" />}
            label="Revenue"
            value={`$${grossRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            delta={null}
            deltaSubtitle="all-time · all channels gross"
            sparkline={sparkRev}
          />
          <StatTile
            tone={netRevenue >= 0 ? "violet" : "rose"}
            icon={<TrendingUpIcon className="h-4 w-4" />}
            label="Net Revenue"
            value={`$${netRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            delta={null}
            deltaSubtitle={
              adsSpend > 0
                ? `gross − $${adsSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })} ad spend`
                : "no ad spend recorded"
            }
            sparkline={sparkNet}
          />
          <StatTile
            tone="amber"
            icon={<ReceiptIcon className="h-4 w-4" />}
            label="Expenses"
            value={`$${totalExpenses.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            delta={null}
            deltaSubtitle="lifetime ad spend"
            sparkline={sparkSpend}
          />
        </div>
      </section>

      {/* ── OnlyFans Direct earnings — pulled live from OnlyFansAPI.
          Cleaner Nexus card with a blue OF icon chip in the header
          and three rounded-xl mini-stats inside. Only shown when there's
          actual OF data; otherwise the card just stays hidden. */}
      {ofData.loaded && (ofData.today + ofData.sevenD + ofData.thirtyD > 0) && (
        <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="h-7 w-7 rounded-lg bg-blue-500/15 text-blue-600 flex items-center justify-center">
              <SiOnlyfans className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">OnlyFans direct earnings</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Live data from OnlyFansAPI · subs + tips + PPV + messages
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Today", value: ofData.today },
              { label: "Last 7 days", value: ofData.sevenD },
              { label: "Last 30 days", value: ofData.thirtyD },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-3.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">
                  {s.label}
                </div>
                <div className="text-2xl font-bold mt-1 tabular-nums">
                  ${s.value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Channel breakdown (cleaner Nexus pattern). Stacked bar +
          legend chips, with adjusted colors that read on the white
          theme. */}
      {channelTotal > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="h-7 w-7 rounded-lg bg-violet-500/15 text-violet-600 flex items-center justify-center">
                <Layers className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Revenue by channel</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  All-time rollup · click any tab to drill into the channel
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums leading-none">
                ${channelTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">grand total</div>
            </div>
          </div>

          {/* Stacked bar */}
          <div className="h-2.5 rounded-full overflow-hidden flex gap-px bg-muted">
            {ofLifetime > 0 && (
              <div
                className="h-full bg-blue-500"
                style={{ width: `${(ofLifetime / channelTotal) * 100}%` }}
                title={`OnlyFans direct $${ofLifetime.toFixed(2)}`}
              />
            )}
            {organicRev > 0 && (
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${(organicRev / channelTotal) * 100}%` }}
                title={`Organic $${organicRev.toFixed(2)}`}
              />
            )}
            {internalRev > 0 && (
              <div
                className="h-full bg-amber-500"
                style={{ width: `${(internalRev / channelTotal) * 100}%` }}
                title={`Internal $${internalRev.toFixed(2)}`}
              />
            )}
            {adsRev > 0 && (
              <div
                className="h-full bg-violet-500"
                style={{ width: `${(adsRev / channelTotal) * 100}%` }}
                title={adsTooltip}
              />
            )}
          </div>

          {/* Legend pills */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-2">
            {[
              { label: "OnlyFans", sublabel: "Direct earnings (subs + tips + PPV)", value: ofLifetime, dot: "bg-blue-500", chipBg: "bg-blue-500/8" },
              { label: "Organic", sublabel: "Reddit · IG · FB · X · TikTok", value: organicRev, dot: "bg-emerald-500", chipBg: "bg-emerald-500/8" },
              { label: "Internal", sublabel: "Tracking links", value: internalRev, dot: "bg-amber-500", chipBg: "bg-amber-500/8" },
              { label: "Ads", sublabel: `Meta $${adsBreakdown.meta.toFixed(0)} · OF Finder $${adsBreakdown.onlyfinder.toFixed(0)}`, value: adsRev, dot: "bg-violet-500", chipBg: "bg-violet-500/8" },
            ].map((ch) => (
              <div key={ch.label} className={`rounded-xl border border-border ${ch.chipBg} p-3`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${ch.dot}`} />
                  <span className="text-[11px] text-muted-foreground font-medium">{ch.label}</span>
                  <span className="text-[10px] text-muted-foreground/60 ml-auto tabular-nums">
                    {Math.round((ch.value / channelTotal) * 100)}%
                  </span>
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  ${ch.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </div>
                <div className="text-[10px] text-muted-foreground/70 truncate">{ch.sublabel}</div>
              </div>
            ))}
          </div>

          {/* Ad spend footer */}
          {adsSpend > 0 && (
            <div className="flex items-center justify-end gap-2 text-xs pt-1 border-t border-border">
              <span className="text-muted-foreground">Ad spend:</span>
              <span className="font-bold text-rose-600 tabular-nums">
                -${adsSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ── Subreddits Tab ────────────────────────────────────────────────────────────

function SubredditsTab({
  accounts,
  subreddits,
  onRefresh,
}: {
  accounts: RedditAccount[];
  subreddits: Subreddit[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    reddit_account_id: "",
    name: "",
    status: "active",
    notes: "",
  });
  const [editingSubNoteId, setEditingSubNoteId] = useState<string | null>(null);
  const [subNoteValue, setSubNoteValue] = useState("");

  const saveSubNote = async (subId: string, note: string) => {
    const { error } = await supabase
      .from("subreddits")
      .update({ notes: note.trim() || null })
      .eq("id", subId);
    if (error) toast.error(error.message);
    else onRefresh();
  };

  const onAdd = async () => {
    if (!form.reddit_account_id) return toast.error("Select an account");
    if (!form.name.trim()) return toast.error("Subreddit name is required");
    const clean = form.name.trim().replace(/^r\//, "").toLowerCase();
    const { error } = await supabase.from("subreddits").insert({
      reddit_account_id: form.reddit_account_id,
      name: clean,
      status: form.status,
      notes: form.notes.trim() || null,
    });
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
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
        Add a Reddit account first before adding subreddits.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Subreddits are tracked per Reddit account — each account may post to different subs.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add subreddit
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add subreddit</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Reddit account</Label>
                <Select
                  value={form.reddit_account_id}
                  onValueChange={(v) => setForm({ ...form, reddit_account_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        u/{a.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subreddit name</Label>
                <Input
                  placeholder="gonewild (no r/ needed)"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Notes <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  placeholder="e.g. strict mods, no tracking links in title"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
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
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${accountStatusStyles[a.status]}`}
                >
                  {a.status}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{acctSubs.length} subreddits</span>
            </div>
            {acctSubs.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No subreddits yet for this account.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {acctSubs.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">r/{s.name}</div>
                      {editingSubNoteId === s.id ? (
                        <input
                          autoFocus
                          className="mt-0.5 w-full rounded border border-border bg-secondary/40 px-2 py-0.5 text-xs outline-none focus:border-primary"
                          value={subNoteValue}
                          onChange={(e) => setSubNoteValue(e.target.value)}
                          onBlur={() => {
                            saveSubNote(s.id, subNoteValue);
                            setEditingSubNoteId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              saveSubNote(s.id, subNoteValue);
                              setEditingSubNoteId(null);
                            }
                            if (e.key === "Escape") setEditingSubNoteId(null);
                          }}
                          placeholder="Add note…"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingSubNoteId(s.id);
                            setSubNoteValue(s.notes ?? "");
                          }}
                          className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <MessageSquare className="h-3 w-3 shrink-0" />
                          <span className={s.notes ? "" : "italic"}>{s.notes || "Add note…"}</span>
                        </button>
                      )}
                    </div>
                    <Select value={s.status} onValueChange={(v) => onUpdateStatus(s.id, v)}>
                      <SelectTrigger
                        className={`h-7 w-28 text-xs border rounded-full px-2 ${subStatusStyles[s.status] ?? ""}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="banned">Banned</SelectItem>
                      </SelectContent>
                    </Select>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove r/{s.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove it from tracking. Historical data is unaffected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(s.id)}>
                            Remove
                          </AlertDialogAction>
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

const emptyContentForm = {
  title: "",
  content_type: "image",
  file_url: "",
  reddit_account_id: "",
  subreddit_id: "",
  tracking_link_id: "",
  post_url: "",
  posted_at: "",
  notes: "",
};

function ContentTab({
  creatorId,
  accounts,
  subreddits,
  trackingLinks,
  contentItems,
  onRefresh,
}: {
  creatorId: string;
  accounts: RedditAccount[];
  subreddits: Subreddit[];
  trackingLinks: TrackingLink[];
  contentItems: ContentItem[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyContentForm);

  const subsForAccount = useMemo(
    () => subreddits.filter((s) => s.reddit_account_id === form.reddit_account_id),
    [subreddits, form.reddit_account_id],
  );

  const linksForAccount = useMemo(
    () => trackingLinks.filter((l) => l.reddit_account_id === form.reddit_account_id),
    [trackingLinks, form.reddit_account_id],
  );

  const onAdd = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    const { error } = await supabase.from("content_items").insert({
      creator_id: creatorId,
      title: form.title.trim(),
      content_type: form.content_type,
      file_url: form.file_url.trim() || null,
      reddit_account_id: form.reddit_account_id || null,
      subreddit_id: form.subreddit_id || null,
      tracking_link_id: form.tracking_link_id || null,
      post_url: form.post_url.trim() || null,
      posted_at: form.posted_at || null,
      notes: form.notes.trim() || null,
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

  const accountName = (id: string | null) =>
    id ? (accounts.find((a) => a.id === id)?.username ?? "—") : "—";
  const subName = (id: string | null) =>
    id ? (subreddits.find((s) => s.id === id)?.name ?? "—") : "—";
  const linkName = (id: string | null) =>
    id ? (trackingLinks.find((l) => l.id === id)?.label ?? "—") : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manually log content pieces posted across Reddit accounts.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add content
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add content item</DialogTitle>
            </DialogHeader>
            <div className="max-h-[75vh] overflow-y-auto space-y-4 py-2 pr-1">
              <div className="space-y-1.5">
                <Label>
                  File <span className="text-muted-foreground">(optional)</span>
                </Label>
                <FileDropZone
                  value={form.file_url}
                  onChange={(url, mimeHint) => {
                    const ct = mimeHint?.startsWith("video")
                      ? "video"
                      : mimeHint?.startsWith("image")
                        ? "image"
                        : form.content_type;
                    setForm({ ...form, file_url: url, content_type: ct });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Title / description</Label>
                <Input
                  placeholder="e.g. Bikini set – poolside shoot"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Content type</Label>
                <Select
                  value={form.content_type}
                  onValueChange={(v) => setForm({ ...form, content_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="text">Text post</SelectItem>
                    <SelectItem value="link">Link</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Reddit account <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Select
                  value={form.reddit_account_id}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      reddit_account_id: v,
                      subreddit_id: "",
                      tracking_link_id: "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        u/{a.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Subreddit <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Select
                  value={form.subreddit_id}
                  onValueChange={(v) => setForm({ ...form, subreddit_id: v })}
                  disabled={!form.reddit_account_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subreddit" />
                  </SelectTrigger>
                  <SelectContent>
                    {subsForAccount.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        r/{s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Tracking link <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Select
                  value={form.tracking_link_id}
                  onValueChange={(v) => setForm({ ...form, tracking_link_id: v })}
                  disabled={!form.reddit_account_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select link" />
                  </SelectTrigger>
                  <SelectContent>
                    {linksForAccount.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Post URL <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  placeholder="https://reddit.com/r/..."
                  value={form.post_url}
                  onChange={(e) => setForm({ ...form, post_url: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Posted at <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={form.posted_at}
                  onChange={(e) => setForm({ ...form, posted_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Notes <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  placeholder="e.g. performed well, repost next week"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onAdd}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {contentItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No content logged yet. Add your first piece.
        </div>
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
                <tr
                  key={item.id}
                  className="border-t border-border bg-card hover:bg-secondary/30 transition-colors"
                >
                  <td className="px-3 py-2 w-14">
                    <ContentPreview url={item.file_url} />
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <div className="font-medium truncate">{item.title}</div>
                    {item.notes && (
                      <div className="text-xs text-muted-foreground truncate">{item.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-md bg-accent/40 px-2 py-0.5 text-xs capitalize">
                      {contentTypeIcon[item.content_type]}
                      {item.content_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.reddit_account_id ? `u/${accountName(item.reddit_account_id)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.subreddit_id ? `r/${subName(item.subreddit_id)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[120px] truncate">
                    {linkName(item.tracking_link_id)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.posted_at ? format(new Date(item.posted_at), "MMM d, yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.post_url && (
                        <a
                          href={item.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-primary"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete content item?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{item.title}" will be permanently removed.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(item.id)}>
                              Delete
                            </AlertDialogAction>
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

// ── Revenue Tab ───────────────────────────────────────────────────────────────

const emptyRevenueForm = {
  amount: "",
  source: "new_sub",
  entry_date: new Date().toISOString().slice(0, 10),
  reddit_account_id: "",
  tracking_link_id: "",
  notes: "",
};

function RevenueTable({
  rows,
  accountName,
  linkLabel,
  onDelete,
  deletable,
}: {
  rows: RevenueEntry[];
  accountName: (id: string | null) => string;
  linkLabel: (id: string | null) => string;
  onDelete: (id: string) => void;
  deletable: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-4 py-3">Date</th>
            <th className="text-left font-medium px-4 py-3">Source</th>
            <th className="text-left font-medium px-4 py-3">Account</th>
            <th className="text-left font-medium px-4 py-3">Link</th>
            <th className="text-right font-medium px-4 py-3">Amount</th>
            <th className="text-left font-medium px-4 py-3">Notes</th>
            {deletable && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr
              key={e.id}
              className="border-t border-border bg-card hover:bg-secondary/30 transition-colors"
            >
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                {format(new Date(e.entry_date), "MMM d, yyyy")}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${sourceStyles[e.source] ?? sourceStyles.other}`}
                >
                  {sourceLabel[e.source] ?? e.source}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {e.reddit_account_id ? `u/${accountName(e.reddit_account_id)}` : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground max-w-[140px] truncate">
                {linkLabel(e.tracking_link_id)}
              </td>
              <td className="px-4 py-3 text-right font-semibold">
                $
                {e.amount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">
                {e.notes ?? "—"}
              </td>
              {deletable && (
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
                          This removes the ${e.amount} entry. Cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(e.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevenueTab({
  creatorId,
  accounts,
  trackingLinks,
  entries,
  inflowwStats,
  onRefresh,
}: {
  creatorId: string;
  accounts: RedditAccount[];
  trackingLinks: TrackingLink[];
  entries: RevenueEntry[];
  inflowwStats: InflowwStat[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyRevenueForm);

  const linksForAccount = useMemo(
    () => trackingLinks.filter((l) => l.reddit_account_id === form.reddit_account_id),
    [trackingLinks, form.reddit_account_id],
  );

  const manualEntries = entries;
  const manualTotal = manualEntries.reduce((s, e) => s + e.amount, 0);
  const inflowwTotal = inflowwStats.reduce((s, r) => s + r.revenue_total, 0);

  const byAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const key = e.reddit_account_id ?? "__none__";
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const accountName = (id: string | null) =>
    id ? (accounts.find((a) => a.id === id)?.username ?? "—") : "Unattributed";
  const linkLabel = (id: string | null) =>
    id ? (trackingLinks.find((l) => l.id === id)?.label ?? "—") : "—";

  const onAdd = async () => {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return toast.error("Enter a valid amount");
    const { error } = await supabase.from("revenue_entries").insert({
      creator_id: creatorId,
      reddit_account_id: form.reddit_account_id || null,
      tracking_link_id: form.tracking_link_id || null,
      amount,
      source: form.source,
      entry_date: form.entry_date,
      notes: form.notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Revenue entry added");
    setForm(emptyRevenueForm);
    setOpen(false);
    onRefresh();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("revenue_entries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Entry deleted");
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {inflowwStats.length > 0
            ? "Infloww totals are synced automatically. Manual entries can be added below."
            : "Manually log OF revenue and attribute it to a Reddit account or tracking link."}
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add entry
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
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="49.99"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.entry_date}
                    onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(sourceLabel).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Reddit account <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Select
                  value={form.reddit_account_id}
                  onValueChange={(v) =>
                    setForm({ ...form, reddit_account_id: v, tracking_link_id: "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        u/{a.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Tracking link <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Select
                  value={form.tracking_link_id}
                  onValueChange={(v) => setForm({ ...form, tracking_link_id: v })}
                  disabled={!form.reddit_account_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select link" />
                  </SelectTrigger>
                  <SelectContent>
                    {linksForAccount.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Notes <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  placeholder="e.g. from r/gonewild push"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onAdd}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Infloww all-time totals */}
      {inflowwStats.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Infloww — all-time totals</div>
            <div className="text-lg font-bold">
              ${inflowwTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {inflowwStats.map((s) => {
              const acct = accounts.find((a) => a.id === s.reddit_account_id);
              return (
                <div key={s.id} className="rounded-lg bg-card border border-border px-3 py-2 text-xs">
                  <div className="font-medium truncate mb-1">
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
          <div className="text-[10px] text-muted-foreground">
            Last synced {format(new Date(inflowwStats.reduce((l, s) => s.synced_at > l ? s.synced_at : l, inflowwStats[0].synced_at)), "MMM d, yyyy 'at' h:mm a")}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <DollarSign className="h-4 w-4 text-primary" />
            Manual revenue
          </div>
          <div className="mt-2 text-2xl font-bold">
            {manualEntries.length > 0
              ? `$${manualTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{manualEntries.length} entr{manualEntries.length !== 1 ? "ies" : "y"}</div>
        </div>
        {byAccount.length > 1 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs text-muted-foreground mb-3">By account</div>
            <div className="space-y-2">
              {byAccount.map(([id, total]) => {
                const pct = manualTotal > 0 ? (total / manualTotal) * 100 : 0;
                return (
                  <div key={id} className="flex items-center gap-3">
                    <div className="w-32 text-xs text-muted-foreground truncate">
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
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No manual entries yet.
        </div>
      ) : (
        <RevenueTable
          rows={manualEntries}
          accountName={accountName}
          linkLabel={linkLabel}
          onDelete={onDelete}
          deletable={true}
        />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

export function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Health Warnings ───────────────────────────────────────────────────────────

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
      if (!lastPost[p.reddit_account_id] || pt > lastPost[p.reddit_account_id])
        lastPost[p.reddit_account_id] = pt;
      if (pt >= since24h) {
        if (!subCount24h[p.reddit_account_id]) subCount24h[p.reddit_account_id] = {};
        subCount24h[p.reddit_account_id][p.subreddit] =
          (subCount24h[p.reddit_account_id][p.subreddit] ?? 0) + 1;
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
        w.push({
          type: "idle",
          message: h ? `${u} hasn't posted in ${h}h` : `${u} has no tracked posts`,
        });
      }
      for (const [sub, cnt] of Object.entries(subCount24h[acc.id] ?? {})) {
        if (cnt >= 3)
          w.push({ type: "spam", message: `${u}: ${cnt} posts in r/${sub} in 24h — ban risk` });
      }
      const perf = perfMap[acc.id];
      if (perf && perf.tw.length >= 3 && perf.lw.length >= 3) {
        const tAvg = perf.tw.reduce((a, b) => a + b, 0) / perf.tw.length;
        const lAvg = perf.lw.reduce((a, b) => a + b, 0) / perf.lw.length;
        if (tAvg < lAvg * 0.7)
          w.push({
            type: "perf",
            message: `${u}: avg upvotes down ${Math.round((1 - tAvg / lAvg) * 100)}% vs last week`,
          });
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
            <span className="shrink-0">
              {w.type === "spam" ? "🚨" : w.type === "perf" ? "📉" : "⏰"}
            </span>
            {w.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({ posts }: { accounts: RedditAccount[]; posts: Post[] }) {
  return (
    <div className="space-y-10">
      {/* Subreddit Scorecards */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Subreddit scorecards — last 7 days</h2>
        <SubredditScorecards posts={posts} />
      </section>

      {/* Best Time to Post heatmap */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Best time to post</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Avg upvotes by day and hour, across all tracked posts.
        </p>
        <BestTimeHeatmap posts={posts} />
      </section>
    </div>
  );
}

// ── Subreddit Scorecards ──────────────────────────────────────────────────────

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

  const subList = Object.entries(stats)
    .map(([name, { sum, count }]) => ({ name, avg: sum / count, count }))
    .sort((a, b) => b.avg - a.avg);

  if (subList.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        No posts in the last 7 days.
      </div>
    );
  }

  const creatorAvg = subList.reduce((s, x) => s + x.avg, 0) / subList.length;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-4 py-2.5">Subreddit</th>
            <th className="text-right font-medium px-4 py-2.5">Posts (7d)</th>
            <th className="text-right font-medium px-4 py-2.5">Avg upvotes</th>
            <th className="text-right font-medium px-4 py-2.5">vs creator avg</th>
            <th className="text-center font-medium px-4 py-2.5">Score</th>
          </tr>
        </thead>
        <tbody>
          {subList.map((s, i) => {
            const pct = ((s.avg - creatorAvg) / creatorAvg) * 100;
            const color =
              s.avg >= creatorAvg
                ? "success"
                : s.avg >= creatorAvg * 0.5
                  ? "warning"
                  : "destructive";
            return (
              <tr
                key={i}
                className="border-t border-border bg-card hover:bg-secondary/20 transition-colors"
              >
                <td className="px-4 py-2.5 font-medium">r/{s.name}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{s.count}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{Math.round(s.avg)}</td>
                <td
                  className={`px-4 py-2.5 text-right text-xs font-medium ${pct >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {pct >= 0 ? "+" : ""}
                  {Math.round(pct)}%
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${color === "success" ? "bg-success" : color === "warning" ? "bg-warning" : "bg-destructive"}`}
                    title={
                      color === "success"
                        ? "Above average"
                        : color === "warning"
                          ? "Below average"
                          : "Poor — below 50% of avg"
                    }
                  />
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

  const subredditOptions = useMemo(
    () => Array.from(new Set(posts.map((p) => p.subreddit))).sort(),
    [posts],
  );

  const filtered = subFilter === "all" ? posts : posts.filter((p) => p.subreddit === subFilter);

  const grid = useMemo(() => {
    const g: { count: number; sum: number }[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ count: 0, sum: 0 })),
    );
    for (const p of filtered) {
      const d = new Date(p.posted_at);
      const day = (d.getDay() + 6) % 7;
      const hour = d.getHours();
      g[day][hour].count++;
      g[day][hour].sum += p.upvotes;
    }
    return g;
  }, [filtered]);

  const maxAvg = useMemo(() => {
    let m = 0;
    for (const row of grid)
      for (const cell of row) if (cell.count > 0) m = Math.max(m, cell.sum / cell.count);
    return m || 1;
  }, [grid]);

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        No posts to analyse yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Subreddit:</span>
        <Select value={subFilter} onValueChange={setSubFilter}>
          <SelectTrigger className="w-[200px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subreddits</SelectItem>
            {subredditOptions.map((s) => (
              <SelectItem key={s} value={s}>
                r/{s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
        <div className="inline-block min-w-full">
          {/* Hour header */}
          <div className="flex">
            <div className="w-10 shrink-0" />
            {Array.from({ length: 24 }, (_, i) => (
              <div
                key={i}
                className="w-7 text-center text-[10px] text-muted-foreground leading-none mb-1"
              >
                {i % 4 === 0 ? i : ""}
              </div>
            ))}
          </div>
          {/* Rows */}
          {DAYS.map((day, di) => (
            <div key={di} className="flex items-center">
              <div className="w-10 shrink-0 text-[11px] text-muted-foreground">{day}</div>
              {grid[di].map((cell, hi) => {
                const avg = cell.count > 0 ? cell.sum / cell.count : 0;
                const intensity = avg / maxAvg;
                return (
                  <div
                    key={hi}
                    className="w-7 h-6 rounded-sm mx-px"
                    style={{
                      backgroundColor:
                        cell.count > 0
                          ? `oklch(0.72 0.18 30 / ${(0.15 + intensity * 0.85).toFixed(2)})`
                          : "oklch(0.5 0 0 / 0.07)",
                    }}
                    title={
                      cell.count > 0
                        ? `${day} ${hi}:00 — ${cell.count} post${cell.count !== 1 ? "s" : ""}, avg ${Math.round(avg)} upvotes`
                        : `${day} ${hi}:00 — no data`
                    }
                  />
                );
              })}
            </div>
          ))}
          {/* Legend */}
          <div className="flex items-center gap-3 mt-4 ml-10">
            <span className="text-[10px] text-muted-foreground">Fewer upvotes</span>
            <div className="flex gap-px">
              {[0.15, 0.35, 0.55, 0.75, 1.0].map((o, i) => (
                <div
                  key={i}
                  className="h-3 w-5 rounded-sm"
                  style={{ backgroundColor: `oklch(0.72 0.18 30 / ${o})` }}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">More upvotes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── File helpers ──────────────────────────────────────────────────────────────

function urlIsImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|avif|bmp)(\?|$)/i.test(url);
}
function urlIsVideo(url: string) {
  return /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url) || /redgifs\.com/i.test(url);
}

// ── Content Preview (table cell) ─────────────────────────────────────────────

function ContentPreview({ url }: { url: string | null }) {
  if (!url) return null;
  if (urlIsImage(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          className="h-10 w-10 rounded-md object-cover border border-border bg-secondary"
          loading="lazy"
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground hover:text-primary transition-colors"
      title={url}
    >
      <Play className="h-4 w-4" />
    </a>
  );
}

// ── File Drop Zone ────────────────────────────────────────────────────────────

function FileDropZone({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string, mimeHint?: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("content-files").upload(path, file);
    if (error) {
      toast.error(error.message);
      setUploading(false);
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from("content-files").getPublicUrl(path);
    onChange(publicUrl, file.type);
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  };

  if (value) {
    return (
      <div className="relative rounded-xl border border-border overflow-hidden bg-secondary/30">
        {urlIsImage(value) ? (
          <img src={value} className="max-h-40 w-full object-cover" />
        ) : urlIsVideo(value) ? (
          <video src={value} className="max-h-40 w-full rounded-none" controls />
        ) : (
          <div className="flex items-center gap-2 p-3">
            <Play className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">{value}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-2 rounded-full border border-border bg-background/80 p-1 text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
        {uploading ? (
          <p className="text-sm text-muted-foreground">Uploading…</p>
        ) : (
          <>
            <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop image or video here, or click to browse
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/60">
              JPG, PNG, GIF, MP4, WEBM · max 100 MB
            </p>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          or paste URL
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <input
        ref={urlInputRef}
        type="url"
        placeholder="https://redgifs.com/watch/… or direct image/video URL"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
        onBlur={(e) => {
          if (e.target.value.trim()) {
            onChange(e.target.value.trim());
            e.target.value = "";
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.currentTarget.value.trim()) {
            onChange(e.currentTarget.value.trim());
            e.currentTarget.value = "";
          }
        }}
      />
    </div>
  );
}

// ── Organic Tab ───────────────────────────────────────────────────────────────

const emptyOrganicForm = {
  amount: "",
  sub_count: "",
  entry_date: new Date().toISOString().slice(0, 10),
  notes: "",
};

function OrganicTab({
  creatorId,
  entries,
  goals,
  onRefresh,
}: {
  creatorId: string;
  entries: OrganicEntry[];
  goals: RevenueGoal[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyOrganicForm);

  const total = entries.reduce((s, e) => s + e.amount, 0);

  const currentMonthGoal = useMemo(() => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return goals.find((g) => g.period_start <= monthStart && g.period_end >= monthStart);
  }, [goals]);

  const mtdTotal = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return entries.filter((e) => new Date(e.entry_date) >= start).reduce((s, e) => s + e.amount, 0);
  }, [entries]);

  const onAdd = async () => {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return toast.error("Enter a valid amount");
    const { error } = await supabase.from("organic_entries").insert({
      creator_id: creatorId,
      amount,
      sub_count: form.sub_count ? parseInt(form.sub_count) : null,
      entry_date: form.entry_date,
      notes: form.notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Entry added");
    setForm(emptyOrganicForm);
    setOpen(false);
    onRefresh();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("organic_entries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Entry deleted");
    onRefresh();
  };

  const goalPct = currentMonthGoal
    ? Math.min(100, (mtdTotal / currentMonthGoal.target_amount) * 100)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Organic OF revenue — natural subscribers, direct traffic, non-attributed growth.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add organic entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount (USD)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="120.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.entry_date}
                    onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Subscriber count <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 340"
                  value={form.sub_count}
                  onChange={(e) => setForm({ ...form, sub_count: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Notes <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  placeholder="e.g. spike from viral post"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onAdd}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">All-time</div>
          <div className="mt-1 text-2xl font-bold text-success">
            ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">MTD</div>
          <div className="mt-1 text-2xl font-bold">
            $
            {mtdTotal.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          {goalPct !== null && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Goal progress</span>
                <span>{Math.round(goalPct)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${goalPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">Entries</div>
          <div className="mt-1 text-2xl font-bold">{entries.length}</div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No organic entries yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Date</th>
                <th className="text-right font-medium px-4 py-3">Amount</th>
                <th className="text-right font-medium px-4 py-3">Subs</th>
                <th className="text-left font-medium px-4 py-3">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-border bg-card hover:bg-secondary/30 transition-colors"
                >
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(e.entry_date), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-success">
                    $
                    {e.amount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {e.sub_count ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
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
                            This removes the ${e.amount} organic entry. Cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(e.id)}>
                            Delete
                          </AlertDialogAction>
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

// ── Internal Tab ──────────────────────────────────────────────────────────────

const internalTypeLabel: Record<string, string> = {
  ppv: "PPV",
  tip: "Tip",
  messages: "Messages",
  custom: "Custom Content",
  other: "Other",
};

const emptyInternalForm = {
  amount: "",
  entry_type: "ppv",
  entry_date: new Date().toISOString().slice(0, 10),
  notes: "",
};

function InternalTab({
  creatorId,
  entries,
  onRefresh,
}: {
  creatorId: string;
  entries: InternalEntry[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyInternalForm);

  const total = entries.reduce((s, e) => s + e.amount, 0);

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.entry_type, (map.get(e.entry_type) ?? 0) + e.amount);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const mtdTotal = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return entries.filter((e) => new Date(e.entry_date) >= start).reduce((s, e) => s + e.amount, 0);
  }, [entries]);

  const onAdd = async () => {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return toast.error("Enter a valid amount");
    const { error } = await supabase.from("internal_entries").insert({
      creator_id: creatorId,
      amount,
      entry_type: form.entry_type,
      entry_date: form.entry_date,
      notes: form.notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Entry added");
    setForm(emptyInternalForm);
    setOpen(false);
    onRefresh();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("internal_entries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Entry deleted");
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Internal OF revenue — chatting, PPV, tips, custom content requests.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add internal entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount (USD)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="75.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.entry_date}
                    onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.entry_type}
                  onValueChange={(v) => setForm({ ...form, entry_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(internalTypeLabel).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Notes <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  placeholder="e.g. custom video, 3 min"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onAdd}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">All-time</div>
          <div className="mt-1 text-2xl font-bold text-warning">
            ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">MTD</div>
          <div className="mt-1 text-2xl font-bold">
            $
            {mtdTotal.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">Entries</div>
          <div className="mt-1 text-2xl font-bold">{entries.length}</div>
        </div>
      </div>

      {byType.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-semibold mb-3">By type</div>
          <div className="space-y-2">
            {byType.map(([type, amt]) => {
              const pct = total > 0 ? (amt / total) * 100 : 0;
              return (
                <div key={type} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-muted-foreground">
                    {internalTypeLabel[type] ?? type}
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-20 text-right text-xs font-medium">
                    $
                    {amt.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No internal entries yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Date</th>
                <th className="text-left font-medium px-4 py-3">Type</th>
                <th className="text-right font-medium px-4 py-3">Amount</th>
                <th className="text-left font-medium px-4 py-3">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-border bg-card hover:bg-secondary/30 transition-colors"
                >
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(e.entry_date), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-warning/30 bg-warning/15 text-warning px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                      {internalTypeLabel[e.entry_type] ?? e.entry_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-warning">
                    $
                    {e.amount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
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
                            This removes the ${e.amount} internal entry. Cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(e.id)}>
                            Delete
                          </AlertDialogAction>
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

// ── Ads Tab ───────────────────────────────────────────────────────────────────

const adPlatformLabel: Record<string, string> = {
  reddit_ads: "Reddit Ads",
  twitter: "Twitter/X",
  tiktok: "TikTok",
  instagram: "Instagram",
  other: "Other",
};

const emptyAdsForm = {
  platform: "reddit_ads",
  amount_spent: "",
  revenue_generated: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  notes: "",
};

function AdsTab({
  creatorId,
  campaigns,
  onRefresh,
}: {
  creatorId: string;
  campaigns: AdCampaign[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyAdsForm);

  const totalSpend = campaigns.reduce((s, c) => s + c.amount_spent, 0);
  const totalRevGen = campaigns.reduce((s, c) => s + c.revenue_generated, 0);
  const overallROAS = totalSpend > 0 ? totalRevGen / totalSpend : 0;

  const onAdd = async () => {
    const spent = parseFloat(form.amount_spent);
    const revGen = parseFloat(form.revenue_generated || "0");
    if (isNaN(spent) || spent <= 0) return toast.error("Enter a valid spend amount");
    const { error } = await supabase.from("ad_campaigns").insert({
      creator_id: creatorId,
      platform: form.platform,
      amount_spent: spent,
      revenue_generated: isNaN(revGen) ? 0 : revGen,
      start_date: form.start_date,
      end_date: form.end_date || null,
      notes: form.notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Campaign added");
    setForm(emptyAdsForm);
    setOpen(false);
    onRefresh();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("ad_campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Campaign deleted");
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Paid ad campaigns — track spend vs revenue generated to monitor ROAS.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add ad campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Platform</Label>
                <Select
                  value={form.platform}
                  onValueChange={(v) => setForm({ ...form, platform: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(adPlatformLabel).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount spent (USD)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="200.00"
                    value={form.amount_spent}
                    onChange={(e) => setForm({ ...form, amount_spent: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Revenue generated</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="600.00"
                    value={form.revenue_generated}
                    onChange={(e) => setForm({ ...form, revenue_generated: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    End date <span className="text-muted-foreground">(opt.)</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Notes <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  placeholder="e.g. bio link test, r/gone targeting"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onAdd}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">Total spend</div>
          <div className="mt-1 text-2xl font-bold text-destructive">
            $
            {totalSpend.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">Revenue generated</div>
          <div className="mt-1 text-2xl font-bold text-ads">
            $
            {totalRevGen.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div
          className={`rounded-xl border p-5 ${overallROAS > 0 && overallROAS < 2 ? "border-destructive/40 bg-destructive/8" : "border-border bg-card"}`}
        >
          <div className="text-xs text-muted-foreground">Overall ROAS</div>
          <div
            className={`mt-1 text-2xl font-bold ${overallROAS >= 2 ? "text-success" : overallROAS > 0 ? "text-destructive" : ""}`}
          >
            {overallROAS > 0 ? `${overallROAS.toFixed(2)}x` : "—"}
          </div>
          {overallROAS > 0 && overallROAS < 2 && (
            <div className="text-[11px] text-destructive mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              ROAS below 2x — review campaigns
            </div>
          )}
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No ad campaigns yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Platform</th>
                <th className="text-left font-medium px-4 py-3">Dates</th>
                <th className="text-right font-medium px-4 py-3">Spend</th>
                <th className="text-right font-medium px-4 py-3">Revenue</th>
                <th className="text-right font-medium px-4 py-3">ROAS</th>
                <th className="text-left font-medium px-4 py-3">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const roas = c.amount_spent > 0 ? c.revenue_generated / c.amount_spent : 0;
                return (
                  <tr
                    key={c.id}
                    className="border-t border-border bg-card hover:bg-secondary/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">
                      {adPlatformLabel[c.platform] ?? c.platform}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {format(new Date(c.start_date), "MMM d")}
                      {c.end_date
                        ? ` – ${format(new Date(c.end_date), "MMM d, yyyy")}`
                        : " – ongoing"}
                    </td>
                    <td className="px-4 py-3 text-right text-destructive font-semibold">
                      $
                      {c.amount_spent.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3 text-right text-ads font-semibold">
                      $
                      {c.revenue_generated.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold ${roas >= 2 ? "text-success" : roas > 0 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {roas > 0 ? `${roas.toFixed(2)}x` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">
                      {c.notes ?? "—"}
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
                            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes this ad campaign record. Cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(c.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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


// ── Infloww campaign code inline editor ──────────────────────────────────────

function InflowwCodeInput({
  accountId,
  currentCode,
  onRefresh,
}: {
  accountId: string;
  currentCode: number | null;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(currentCode != null ? String(currentCode) : "");

  const save = async () => {
    const parsed = val.replace(/^c/i, "").trim();
    const code = parsed === "" ? null : parseInt(parsed, 10);
    if (parsed !== "" && isNaN(code!)) {
      toast.error("Enter a number (e.g. 6 or c6)");
      return;
    }
    const { error } = await supabase
      .from("reddit_accounts")
      .update({ infloww_campaign_code: code })
      .eq("id", accountId);
    if (error) return toast.error(error.message);
    setEditing(false);
    onRefresh();
  };

  if (editing) {
    return (
      <div className="flex gap-1.5 items-center">
        <input
          autoFocus
          className="w-full rounded border border-border bg-secondary/40 px-2 py-1 text-xs font-mono outline-none focus:border-primary"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="c69 or 69"
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button onClick={save} className="text-xs text-primary hover:underline shrink-0">Save</button>
        <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">✕</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setVal(currentCode != null ? String(currentCode) : ""); setEditing(true); }}
      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
    >
      <DollarSign className="h-3 w-3" />
      {currentCode != null ? `Campaign c${currentCode}` : "Set campaign code…"}
    </button>
  );
}

// ── Platforms Tab ─────────────────────────────────────────────────────────────
function PlatformsTab({
  redditAccounts, igAccounts, fbAccounts, ttAccounts, ofUsername,
}: {
  creatorId: string;
  redditAccounts: RedditAccount[];
  igAccounts: { id: string; label: string; status: string; followers: number }[];
  fbAccounts: { id: string; label: string; status: string; followers: number }[];
  ttAccounts: { id: string; label: string; status: string; followers: number }[];
  ofUsername: string | null;
}) {
  type CrossAccount = { id: string; label: string; status: string; followers: number };
  const platforms: { name: string; route: string; color: string; accounts: CrossAccount[]; openHandle?: (label: string) => string }[] = [
    {
      name: "Reddit",
      route: "/reddit",
      color: "#FF4500",
      accounts: redditAccounts.map((a) => ({ id: a.id, label: `u/${a.username}`, status: a.status, followers: 0 })),
      openHandle: (label) => `https://reddit.com/${label}`,
    },
    {
      name: "Instagram",
      route: "/instagram",
      color: "#E1306C",
      accounts: igAccounts,
      openHandle: (label) => `https://instagram.com/${label.replace(/^@/, "")}`,
    },
    {
      name: "Facebook",
      route: "/facebook",
      color: "#1877F2",
      accounts: fbAccounts,
    },
    {
      name: "TikTok",
      route: "/tiktok",
      color: "#FE2C55",
      accounts: ttAccounts,
      openHandle: (label) => `https://tiktok.com/${label}`,
    },
  ];

  const totalAccounts = platforms.reduce((s, p) => s + p.accounts.length, 0);
  const totalFollowers = platforms.reduce((s, p) => s + p.accounts.reduce((x, a) => x + a.followers, 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Linked accounts</div>
          <div className="text-2xl font-bold">{totalAccounts}</div>
          <div className="text-xs text-muted-foreground mt-1">across {platforms.filter((p) => p.accounts.length > 0).length} platforms</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Total followers</div>
          <div className="text-2xl font-bold">{totalFollowers.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">IG + FB + TikTok</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">OnlyFans handle</div>
          <div className="text-2xl font-bold truncate">
            {ofUsername ? <a href={`https://onlyfans.com/${ofUsername}`} target="_blank" rel="noreferrer" className="hover:text-primary">@{ofUsername}</a> : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">primary destination</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Active accounts</div>
          <div className="text-2xl font-bold text-success">
            {platforms.reduce((s, p) => s + p.accounts.filter((a) => a.status === "active").length, 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">healthy + posting</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {platforms.map((p) => (
          <div key={p.name} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                <h3 className="text-sm font-semibold">{p.name}</h3>
                <span className="text-xs text-muted-foreground">
                  ({p.accounts.length} {p.accounts.length === 1 ? "account" : "accounts"})
                </span>
              </div>
              <Link to={p.route} className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                Manage <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            {p.accounts.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-3">
                No {p.name} accounts linked yet. Add one on the {p.name} page.
              </div>
            ) : (
              <div className="space-y-1.5">
                {p.accounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/30 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sm truncate">{a.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${statusPill(a.status)}`}>
                        {a.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.followers > 0 && (
                        <span className="text-xs text-muted-foreground">{a.followers.toLocaleString()} followers</span>
                      )}
                      {p.openHandle && (
                        <a
                          href={p.openHandle(a.label)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground/60 hover:text-primary"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function statusPill(status: string): string {
  switch (status) {
    case "active": return "bg-success/15 text-success border-success/30";
    case "warm_up": return "bg-primary/15 text-primary border-primary/30";
    case "shadowbanned": return "bg-warning/15 text-warning border-warning/30";
    case "banned":
    case "suspended": return "bg-destructive/15 text-destructive border-destructive/30";
    case "inactive": return "bg-muted text-muted-foreground border-border";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

// ── Staff Tab ─────────────────────────────────────────────────────────────────
const roleLabelsCD: Record<string, string> = {
  chatter: "Chatter",
  reddit_va: "Reddit VA",
  instagram_va: "Instagram VA",
  facebook_va: "Facebook VA",
  x_va: "X VA",
  tiktok_va: "TikTok VA",
  social_media_va: "Social Media VA",
  content_editor: "Content Editor",
  recruiter: "Recruiter",
  manager: "Manager",
  other: "Staff",
};

function StaffTab({
  assignedStaff, shifts,
}: {
  creatorId: string;
  assignedStaff: { id: string; name: string; role: string; status: string; commission_pct: number }[];
  shifts: {
    id: string;
    chatter_id: string;
    chatter_name: string;
    start_at: string;
    end_at: string | null;
    total_revenue: number;
    target_account_name: string | null;
    notes: string | null;
  }[];
}) {
  const now = Date.now();
  const activeShifts = shifts.filter((s) => !s.end_at && new Date(s.start_at).getTime() <= now);
  const upcoming = shifts
    .filter((s) => !s.end_at && new Date(s.start_at).getTime() > now)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  const completed = shifts.filter((s) => s.end_at).slice(0, 15);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayShifts = shifts.filter((s) => new Date(s.start_at).getTime() >= todayStart.getTime());
  const todayHours = todayShifts.reduce((sum, s) => {
    if (!s.end_at) return sum + (now - new Date(s.start_at).getTime()) / 3600_000;
    return sum + (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600_000;
  }, 0);
  const todayRevenue = todayShifts.reduce((s, sh) => s + sh.total_revenue, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Assigned staff</div>
          <div className="text-2xl font-bold">{assignedStaff.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{assignedStaff.filter((s) => s.status === "active").length} active</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Clocked in now</div>
          <div className={`text-2xl font-bold ${activeShifts.length > 0 ? "text-success" : ""}`}>{activeShifts.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{activeShifts.length === 1 ? "person working" : "people working"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Hours today</div>
          <div className="text-2xl font-bold">{todayHours.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground mt-1">{todayShifts.length} shifts logged</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Revenue today</div>
          <div className="text-2xl font-bold text-success">
            ${todayRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-muted-foreground mt-1">from logged shifts</div>
        </div>
      </div>

      {activeShifts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            Working right now
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {activeShifts.map((s) => {
              const elapsedMs = now - new Date(s.start_at).getTime();
              const h = Math.floor(elapsedMs / 3600_000);
              const m = Math.floor((elapsedMs % 3600_000) / 60_000);
              return (
                <div key={s.id} className="rounded-xl border-2 border-success/40 bg-success/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{s.chatter_name}</div>
                      {s.target_account_name && (
                        <div className="text-xs text-primary mt-0.5">on {s.target_account_name}</div>
                      )}
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Started {format(new Date(s.start_at), "h:mm a")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-mono font-bold tabular-nums">{h}:{m.toString().padStart(2, "0")}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-3">Assigned staff</h3>
        {assignedStaff.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No staff assigned to this creator yet. Assign staff on the <Link to="/chatters" className="text-primary hover:underline">Staff page</Link>.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Name</th>
                  <th className="text-left font-medium px-4 py-3">Role</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-right font-medium px-4 py-3">Commission</th>
                </tr>
              </thead>
              <tbody>
                {assignedStaff.map((s) => (
                  <tr key={s.id} className="border-t border-border bg-card">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{roleLabelsCD[s.role] ?? s.role}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded border capitalize ${statusPill(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{s.commission_pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Upcoming schedule</h3>
        {upcoming.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No upcoming shifts scheduled. Schedule shifts on the <Link to="/chatters" className="text-primary hover:underline">Staff → Shifts</Link> tab.
          </div>
        ) : (
          <div className="space-y-1.5">
            {upcoming.slice(0, 10).map((s) => {
              const start = new Date(s.start_at);
              const end = s.end_at ? new Date(s.end_at) : null;
              return (
                <div key={s.id} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      {format(start, "EEE, MMM d")} · {format(start, "h:mm a")}
                      {end && <> – {format(end, "h:mm a")}</>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.chatter_name}
                      {s.target_account_name && <> · on {s.target_account_name}</>}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    in {formatDistanceToNow(start)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Recent shifts</h3>
        {completed.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No completed shifts yet for this creator.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Staff</th>
                  <th className="text-left font-medium px-4 py-3">When</th>
                  <th className="text-right font-medium px-4 py-3">Duration</th>
                  <th className="text-right font-medium px-4 py-3">Revenue</th>
                  <th className="text-left font-medium px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((s) => {
                  const hours = s.end_at ? (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600_000 : 0;
                  return (
                    <tr key={s.id} className="border-t border-border bg-card">
                      <td className="px-4 py-3 font-medium">{s.chatter_name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(s.start_at), "MMM d, h:mm a")}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{hours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right font-medium text-success">
                        {s.total_revenue > 0
                          ? `$${s.total_revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[240px] truncate">
                        {s.notes ?? <span className="text-muted-foreground/40">—</span>}
                      </td>
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
