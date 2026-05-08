import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign, Users, RefreshCw, ExternalLink, ArrowLeft, Plus,
  Trash2, Edit2, Crown, MessageCircle, TrendingUp, TrendingDown,
  Tag, Calendar as CalendarIcon, AlertTriangle,
} from "lucide-react";
import { SiOnlyfans } from "react-icons/si";
import { OnlyFansInbox } from "@/components/OnlyFansInbox";
import { OnlyFansMassDm } from "@/components/OnlyFansMassDm";
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
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, PieChart, Pie,
} from "recharts";

export const Route = createFileRoute("/onlyfans")({ component: OnlyFansPage });

const OF_BLUE = "#00AFF0";
const fmt$ = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt$0 = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtNum = (n: number) => n.toLocaleString();

// ── Types ─────────────────────────────────────────────────────────────────────
type Creator = {
  id: string;
  name: string;
  of_username: string | null;
  status: string;
  onlyfansapi_acct_id: string | null;
};
type OFStats = {
  creator_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  posts_count: number;
  active_subscribers: number;
  expired_subscribers: number;
  sub_price: number | null;
  total_earnings: number;
  earnings_subs: number;
  earnings_tips: number;
  earnings_ppv: number;
  earnings_messages: number;
  earnings_streams: number;
  earnings_referrals: number;
  synced_at: string;
};
type EarningsDaily = {
  id: string;
  creator_id: string;
  entry_date: string;
  earnings_subs: number;
  earnings_tips: number;
  earnings_ppv: number;
  earnings_messages: number;
  earnings_streams: number;
  earnings_referrals: number;
  total: number;
};
type Subscriber = {
  id: string;
  creator_id: string;
  fan_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_spent: number;
  tips_total: number;
  ppv_total: number;
  messages_total: number;
  subscribed_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  notes: string | null;
};
type SubMetric = {
  id: string;
  creator_id: string;
  entry_date: string;
  active_count: number;
  new_count: number;
  lost_count: number;
  expired_count: number;
};
type PpvMessage = {
  id: string;
  creator_id: string;
  message_id: string | null;
  sent_at: string | null;
  price: number | null;
  recipients_count: number;
  unlocks_count: number;
  revenue: number;
  preview: string | null;
  notes: string | null;
};
type PromoType = "discount" | "free_trial" | "bundle" | "price_change" | "other";
type Promotion = {
  id: string;
  creator_id: string;
  name: string;
  promo_type: PromoType;
  discount_pct: number | null;
  trial_days: number | null;
  starts_at: string;
  ends_at: string | null;
  notes: string | null;
};

const promoTypeLabels: Record<PromoType, string> = {
  discount: "Discount",
  free_trial: "Free trial",
  bundle: "Bundle",
  price_change: "Price change",
  other: "Other",
};

// ── Main page ─────────────────────────────────────────────────────────────────
function OnlyFansPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [stats, setStats] = useState<OFStats[]>([]);
  const [earnings, setEarnings] = useState<EarningsDaily[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subMetrics, setSubMetrics] = useState<SubMetric[]>([]);
  const [ppvMessages, setPpvMessages] = useState<PpvMessage[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [detailCreatorId, setDetailCreatorId] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const [{ data: cs, error: csErr }, { data: st }, { data: ed }, { data: sb }, { data: sm }, { data: pp }, { data: pr }] = await Promise.all([
      supabase.from("creators").select("id, name, of_username, status, onlyfansapi_acct_id").order("name"),
      supabase.from("of_creator_stats").select("*"),
      supabase.from("of_earnings_daily").select("*").order("entry_date", { ascending: false }).limit(2000),
      supabase.from("of_subscribers").select("*").order("total_spent", { ascending: false }).limit(2000),
      supabase.from("of_subscriber_metrics_daily").select("*").order("entry_date", { ascending: false }).limit(1000),
      supabase.from("of_ppv_messages").select("*").order("sent_at", { ascending: false }).limit(500),
      supabase.from("of_promotions").select("*").order("starts_at", { ascending: false }),
    ]);
    if (csErr) toast.error(`Failed to load creators: ${csErr.message}`);
    setCreators((cs ?? []) as Creator[]);
    setStats((st ?? []) as OFStats[]);
    setEarnings((ed ?? []) as EarningsDaily[]);
    setSubscribers((sb ?? []) as Subscriber[]);
    setSubMetrics((sm ?? []) as SubMetric[]);
    setPpvMessages((pp ?? []) as PpvMessage[]);
    setPromotions((pr ?? []) as Promotion[]);
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(); }, []);
  const refresh = () => load(true);

  // ── Sync from OnlyFansAPI ────────────────────────────────────────────────
  const syncOne = async (creator: Creator): Promise<{ ok: true } | { ok: false; error: string }> => {
    const key = import.meta.env.VITE_ONLYFANSAPI_KEY as string | undefined;
    if (!key) return { ok: false, error: "VITE_ONLYFANSAPI_KEY not set" };
    if (!creator.of_username) return { ok: false, error: "No OF username set" };

    // Resolve acct_id if missing
    let acctId = creator.onlyfansapi_acct_id;
    if (!acctId) {
      const res = await fetch("https://app.onlyfansapi.com/api/accounts", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const list = (await res.json()) as { id: string; onlyfans_username: string }[];
      const match = list.find((a) => a.onlyfans_username?.toLowerCase() === creator.of_username!.toLowerCase());
      if (!match) return { ok: false, error: `Creator ${creator.of_username} not found in OnlyFansAPI accounts` };
      acctId = match.id;
      await supabase.from("creators").update({ onlyfansapi_acct_id: acctId }).eq("id", creator.id);
    }

    const baseHeaders = { Authorization: `Bearer ${key}` };
    const safeFetch = async (path: string): Promise<unknown | null> => {
      try {
        const r = await fetch(`https://app.onlyfansapi.com/api/${acctId}/${path}`, { headers: baseHeaders });
        if (!r.ok) return null;
        return await r.json();
      } catch {
        return null;
      }
    };

    // Best-effort: pull profile, earnings, subscribers, ppv. Each endpoint is
    // optional — if it fails we skip that section gracefully.
    const profileJson = (await safeFetch("")) as { data?: Record<string, unknown> } | Record<string, unknown> | null;
    const earningsJson = (await safeFetch("earnings")) as { data?: Record<string, unknown>; total?: number } | null;
    const fansJson = (await safeFetch("fans?limit=200")) as { data?: { list?: unknown[] }; list?: unknown[] } | null;
    const ppvJson = (await safeFetch("messages?type=ppv&limit=100")) as { data?: { list?: unknown[] }; list?: unknown[] } | null;

    // ── Profile + lifetime earnings ────────────────────────────────────────
    const profile = (profileJson && "data" in profileJson ? (profileJson as { data: Record<string, unknown> }).data : profileJson) as Record<string, unknown> | null;
    const earningsData = (earningsJson && "data" in earningsJson ? (earningsJson as { data: Record<string, unknown> }).data : earningsJson) as Record<string, unknown> | null;
    const num = (x: unknown): number => typeof x === "number" ? x : typeof x === "string" ? parseFloat(x) || 0 : 0;
    const str = (x: unknown): string | null => typeof x === "string" ? x : null;

    const statsPayload = {
      creator_id: creator.id,
      username: str(profile?.username) ?? creator.of_username,
      display_name: str(profile?.name) ?? str(profile?.display_name),
      avatar_url: str(profile?.avatar) ?? str(profile?.avatar_url),
      bio: str(profile?.about) ?? str(profile?.bio),
      followers_count: num(profile?.followers_count) || num(profile?.subscribers_count) || 0,
      posts_count: num(profile?.posts_count) || 0,
      active_subscribers: num(profile?.active_subscribers) || num(profile?.subscribers_count) || 0,
      expired_subscribers: num(profile?.expired_subscribers) || 0,
      sub_price: profile?.subscribe_price ? num(profile.subscribe_price) : null,
      total_earnings: num(earningsData?.total) || num(earningsData?.lifetime),
      earnings_subs: num(earningsData?.subscriptions) || num(earningsData?.subs),
      earnings_tips: num(earningsData?.tips),
      earnings_ppv: num(earningsData?.ppv) || num(earningsData?.posts),
      earnings_messages: num(earningsData?.messages),
      earnings_streams: num(earningsData?.streams) || num(earningsData?.livestreams),
      earnings_referrals: num(earningsData?.referrals),
      synced_at: new Date().toISOString(),
    };
    const { error: statsErr } = await supabase.from("of_creator_stats").upsert(statsPayload, { onConflict: "creator_id" });
    if (statsErr) return { ok: false, error: `Stats save failed: ${statsErr.message}` };

    // ── Daily earnings (best-effort — if API returns a daily series) ───────
    const dailyArr =
      (earningsData?.daily as unknown[] | undefined)
      ?? (earningsData?.byDay as unknown[] | undefined)
      ?? (earningsData?.history as unknown[] | undefined)
      ?? [];
    if (Array.isArray(dailyArr) && dailyArr.length > 0) {
      const dailyRows = (dailyArr as Record<string, unknown>[]).map((d) => {
        const dateStr = str(d.date) ?? str(d.day) ?? str(d.entry_date);
        const subs = num(d.subscriptions) || num(d.subs);
        const tips = num(d.tips);
        const ppv = num(d.ppv) || num(d.posts);
        const msgs = num(d.messages);
        const streams = num(d.streams) || num(d.livestreams);
        const refs = num(d.referrals);
        const total = num(d.total) || subs + tips + ppv + msgs + streams + refs;
        return {
          creator_id: creator.id,
          entry_date: dateStr ?? format(new Date(), "yyyy-MM-dd"),
          earnings_subs: subs,
          earnings_tips: tips,
          earnings_ppv: ppv,
          earnings_messages: msgs,
          earnings_streams: streams,
          earnings_referrals: refs,
          total,
        };
      }).filter((r) => r.entry_date);
      if (dailyRows.length > 0) {
        await supabase.from("of_earnings_daily").upsert(dailyRows, { onConflict: "creator_id,entry_date" });
      }
    }

    // ── Subscribers ────────────────────────────────────────────────────────
    const fansArr =
      (fansJson && "data" in fansJson && (fansJson as { data: { list?: unknown[] } }).data?.list)
      ?? (fansJson?.list as unknown[] | undefined)
      ?? [];
    if (Array.isArray(fansArr) && fansArr.length > 0) {
      const fanRows = (fansArr as Record<string, unknown>[]).map((f) => {
        const fanId = str(f.id) ?? str(f.user_id) ?? str(f.fan_id);
        if (!fanId) return null;
        return {
          creator_id: creator.id,
          fan_id: fanId,
          username: str(f.username) ?? str(f.handle),
          display_name: str(f.name) ?? str(f.display_name),
          avatar_url: str(f.avatar) ?? str(f.avatar_url),
          total_spent: num(f.total_spent) || num(f.spent),
          tips_total: num(f.tips_total) || num(f.tips),
          ppv_total: num(f.ppv_total) || num(f.ppv_spent),
          messages_total: num(f.messages_total) || num(f.messages_spent),
          subscribed_at: str(f.subscribed_at) ?? str(f.created_at),
          expires_at: str(f.expires_at) ?? str(f.expired_at),
          is_active: typeof f.is_active === "boolean" ? f.is_active : (f.subscribed_is_expired_now !== true),
          last_seen_at: str(f.last_seen) ?? str(f.last_active),
          synced_at: new Date().toISOString(),
        };
      }).filter((r): r is NonNullable<typeof r> => r !== null);
      if (fanRows.length > 0) {
        await supabase.from("of_subscribers").upsert(fanRows, { onConflict: "creator_id,fan_id" });
      }
    }

    // ── PPV messages ───────────────────────────────────────────────────────
    const ppvArr =
      (ppvJson && "data" in ppvJson && (ppvJson as { data: { list?: unknown[] } }).data?.list)
      ?? (ppvJson?.list as unknown[] | undefined)
      ?? [];
    if (Array.isArray(ppvArr) && ppvArr.length > 0) {
      const ppvRows = (ppvArr as Record<string, unknown>[]).map((m) => {
        const msgId = str(m.id) ?? str(m.message_id);
        return {
          creator_id: creator.id,
          message_id: msgId,
          sent_at: str(m.sent_at) ?? str(m.created_at),
          price: m.price != null ? num(m.price) : null,
          recipients_count: num(m.recipients_count) || num(m.recipients),
          unlocks_count: num(m.unlocks_count) || num(m.purchased_count) || num(m.unlocks),
          revenue: num(m.revenue) || num(m.earned),
          preview: str(m.text) ?? str(m.preview),
          synced_at: new Date().toISOString(),
        };
      });
      if (ppvRows.length > 0) {
        // Use upsert only when message_id exists; otherwise insert
        const withId = ppvRows.filter((p) => p.message_id);
        const withoutId = ppvRows.filter((p) => !p.message_id);
        if (withId.length > 0) {
          await supabase.from("of_ppv_messages").upsert(withId, { onConflict: "creator_id,message_id" });
        }
        if (withoutId.length > 0) {
          await supabase.from("of_ppv_messages").insert(withoutId);
        }
      }
    }

    // ── Daily subscriber metric snapshot ───────────────────────────────────
    const today = format(new Date(), "yyyy-MM-dd");
    await supabase.from("of_subscriber_metrics_daily").upsert({
      creator_id: creator.id,
      entry_date: today,
      active_count: statsPayload.active_subscribers,
      new_count: 0, // would need historical compare to compute; skipped for v1
      lost_count: 0,
      expired_count: statsPayload.expired_subscribers,
    }, { onConflict: "creator_id,entry_date" });

    // ── OF native tracking links (campaign codes) ───────────────────────────
    // These are the real OF campaign tracking links — not the manually-
    // entered Reddit ones. Each row has clicks / subs / revenue per
    // campaign. Mirrored locally so the Revenue page can show them
    // without an API call on every render.
    const trackingJson = (await safeFetch("tracking-links")) as
      { data?: unknown[]; list?: unknown[] } | unknown[] | null;
    const trackingArr = Array.isArray(trackingJson)
      ? trackingJson
      : (trackingJson?.data ?? trackingJson?.list ?? []);
    if (Array.isArray(trackingArr) && trackingArr.length > 0) {
      const trackingRows = (trackingArr as Record<string, unknown>[]).map((t) => {
        const code = num(t.campaignCode) || num(t.campaign_code) || num(t.code);
        if (!code) return null;
        const revObj = (t.revenue as Record<string, unknown> | undefined) ?? {};
        return {
          creator_id: creator.id,
          campaign_code: code,
          campaign_url: str(t.campaignUrl) ?? str(t.campaign_url) ?? str(t.url),
          name: str(t.name) ?? str(t.label) ?? null,
          clicks_count: num(t.clicksCount) || num(t.clicks_count) || num(t.clicks),
          subscribers_count: num(t.subscribersCount) || num(t.subscribers_count) || num(t.subs),
          spenders_count: num(t.spendersCount) || num(t.spenders_count)
            || num(revObj.spendersCount) || num(revObj.spenders_count),
          revenue_total: num(revObj.total) || num(t.revenue_total) || num(t.revenue),
          revenue_per_subscriber: num(revObj.revenuePerSubscriber)
            || num(revObj.revenue_per_subscriber) || 0,
          synced_at: new Date().toISOString(),
        };
      }).filter((r): r is NonNullable<typeof r> => r !== null);
      if (trackingRows.length > 0) {
        await supabase.from("of_tracking_links")
          .upsert(trackingRows, { onConflict: "creator_id,campaign_code" });
      }
    }

    return { ok: true };
  };

  const onSyncOne = async (creator: Creator) => {
    setSyncingId(creator.id);
    const result = await syncOne(creator);
    setSyncingId(null);
    if (!result.ok) {
      toast.error(`Sync failed for ${creator.name}: ${result.error}`);
      return;
    }
    toast.success(`Synced ${creator.name}`);
    refresh();
  };

  const onSyncAll = async () => {
    const eligible = creators.filter((c) => c.of_username);
    if (eligible.length === 0) return toast.info("No creators with OF usernames to sync");
    setSyncingAll(true);
    let ok = 0;
    let fail = 0;
    for (const c of eligible) {
      const r = await syncOne(c);
      if (r.ok) ok++; else fail++;
    }
    setSyncingAll(false);
    if (fail === 0) toast.success(`Synced all ${ok} creator${ok === 1 ? "" : "s"}`);
    else toast.warning(`Synced ${ok} · ${fail} failed`);
    refresh();
  };

  const detailCreator = detailCreatorId ? creators.find((c) => c.id === detailCreatorId) : null;

  return (
    <div className="space-y-6">
      <Toaster />

      {!detailCreator && (
        <>
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <SiOnlyfans className="h-6 w-6" style={{ color: OF_BLUE }} />
                <h1 className="text-3xl font-bold tracking-tight">OnlyFans</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Live OnlyFansAPI dashboards — real earnings, subscribers, top fans, and PPV performance per creator.
              </p>
            </div>
            <Button onClick={onSyncAll} disabled={syncingAll}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${syncingAll ? "animate-spin" : ""}`} />
              {syncingAll ? "Syncing all…" : "Sync all creators"}
            </Button>
          </div>

          {loading ? (
            <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
          ) : (
            <Tabs defaultValue="creators">
              <TabsList>
                <TabsTrigger value="creators">Creators</TabsTrigger>
                <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
              </TabsList>
              <TabsContent value="creators" className="mt-6">
                <CreatorsTab
                  creators={creators}
                  stats={stats}
                  syncingId={syncingId}
                  onSyncOne={onSyncOne}
                  onOpenDetail={(id) => setDetailCreatorId(id)}
                />
              </TabsContent>
              <TabsContent value="leaderboard" className="mt-6">
                <LeaderboardTab creators={creators} stats={stats} earnings={earnings} subscribers={subscribers} />
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

      {detailCreator && (
        <CreatorDetailView
          creator={detailCreator}
          stats={stats.find((s) => s.creator_id === detailCreator.id) ?? null}
          earnings={earnings.filter((e) => e.creator_id === detailCreator.id)}
          subscribers={subscribers.filter((s) => s.creator_id === detailCreator.id)}
          subMetrics={subMetrics.filter((m) => m.creator_id === detailCreator.id)}
          ppvMessages={ppvMessages.filter((m) => m.creator_id === detailCreator.id)}
          promotions={promotions.filter((p) => p.creator_id === detailCreator.id)}
          syncing={syncingId === detailCreator.id}
          onBack={() => setDetailCreatorId(null)}
          onSync={() => onSyncOne(detailCreator)}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}

// ── Creators tab (grid of cards) ──────────────────────────────────────────────
function CreatorsTab({
  creators, stats, syncingId, onSyncOne, onOpenDetail,
}: {
  creators: Creator[];
  stats: OFStats[];
  syncingId: string | null;
  onSyncOne: (c: Creator) => void;
  onOpenDetail: (id: string) => void;
}) {
  const statFor = (cid: string) => stats.find((s) => s.creator_id === cid) ?? null;
  const totalEarnings = stats.reduce((s, x) => s + x.total_earnings, 0);
  const totalSubs = stats.reduce((s, x) => s + x.active_subscribers, 0);
  const withOF = creators.filter((c) => c.of_username).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Creators with OF" value={withOF} sub={`of ${creators.length} total`} icon={<Users className="h-3.5 w-3.5" />} />
        <KpiCard label="Total earnings" value={fmt$0(totalEarnings)} sub="lifetime, all sources" icon={<DollarSign className="h-3.5 w-3.5" />} valueClass="text-success" />
        <KpiCard label="Active subscribers" value={fmtNum(totalSubs)} sub="across all creators" icon={<Users className="h-3.5 w-3.5" />} />
      </div>

      {creators.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">No creators yet.</p>
          <Link to="/" className="mt-3 inline-block text-sm text-primary hover:underline">
            Add a creator →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((c) => {
            const st = statFor(c.id);
            const isSyncing = syncingId === c.id;
            return (
              <div
                key={c.id}
                className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-all group"
              >
                <button
                  onClick={() => onOpenDetail(c.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {st?.avatar_url ? (
                        <img src={st.avatar_url} className="h-10 w-10 rounded-full object-cover border border-border" alt={c.name} />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-primary-glow/30 border border-border flex items-center justify-center text-sm font-semibold">
                          {c.name[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-sm group-hover:text-primary transition-colors truncate">{c.name}</div>
                        {c.of_username ? (
                          <div className="text-xs text-muted-foreground truncate">@{c.of_username}</div>
                        ) : (
                          <div className="text-xs text-muted-foreground/50 italic">No OF username</div>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium uppercase tracking-wide rounded-full px-2 py-0.5 border shrink-0 ${
                      c.status === "active" ? "bg-success/15 text-success border-success/30"
                        : c.status === "paused" ? "bg-warning/15 text-warning border-warning/30"
                        : "bg-muted text-muted-foreground border-border"
                    }`}>
                      {c.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-secondary/40 px-2 py-2">
                      <div className="text-xs text-muted-foreground">Earnings</div>
                      <div className="text-sm font-bold mt-0.5 text-success">
                        {st && st.total_earnings > 0 ? fmt$0(st.total_earnings) : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg bg-secondary/40 px-2 py-2">
                      <div className="text-xs text-muted-foreground">Active subs</div>
                      <div className="text-sm font-bold mt-0.5">{st && st.active_subscribers > 0 ? fmtNum(st.active_subscribers) : "—"}</div>
                    </div>
                    <div className="rounded-lg bg-secondary/40 px-2 py-2">
                      <div className="text-xs text-muted-foreground">Sub price</div>
                      <div className="text-sm font-bold mt-0.5">
                        {st?.sub_price != null ? fmt$0(st.sub_price) : "—"}
                      </div>
                    </div>
                  </div>
                </button>

                <div className="mt-3 flex items-center justify-between gap-2">
                  {st?.synced_at ? (
                    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      synced {formatDistanceToNow(new Date(st.synced_at), { addSuffix: true })}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50 italic">Never synced</span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); onSyncOne(c); }}
                    disabled={isSyncing || !c.of_username}
                  >
                    <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────
function LeaderboardTab({
  creators, stats, earnings, subscribers,
}: {
  creators: Creator[];
  stats: OFStats[];
  earnings: EarningsDaily[];
  subscribers: Subscriber[];
}) {
  type SortKey = "earnings" | "active_subs" | "tips" | "ppv" | "avg_fan_spend" | "expired";
  const [sort, setSort] = useState<SortKey>("earnings");

  const rows = useMemo(() => {
    return creators
      .map((c) => {
        const s = stats.find((x) => x.creator_id === c.id);
        const fans = subscribers.filter((x) => x.creator_id === c.id);
        const fanCount = fans.length;
        const fanSpendTotal = fans.reduce((sum, f) => sum + f.total_spent, 0);
        const avgFanSpend = fanCount > 0 ? fanSpendTotal / fanCount : 0;
        const last30dStart = Date.now() - 30 * 24 * 3600_000;
        const last30dEarnings = earnings
          .filter((e) => e.creator_id === c.id && new Date(e.entry_date).getTime() >= last30dStart)
          .reduce((sum, e) => sum + e.total, 0);
        return {
          creator: c,
          stats: s,
          earnings: s?.total_earnings ?? 0,
          tips: s?.earnings_tips ?? 0,
          ppv: s?.earnings_ppv ?? 0,
          active_subs: s?.active_subscribers ?? 0,
          expired: s?.expired_subscribers ?? 0,
          last30d: last30dEarnings,
          avg_fan_spend: avgFanSpend,
          fan_count: fanCount,
        };
      })
      .filter((r) => r.stats)
      .sort((a, b) => {
        const av = a[sort] ?? 0;
        const bv = b[sort] ?? 0;
        return Number(bv) - Number(av);
      });
  }, [creators, stats, earnings, subscribers, sort]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
        No synced creators yet — hit "Sync all creators" above.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Sort by:</span>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="earnings">Total earnings</SelectItem>
            <SelectItem value="active_subs">Active subs</SelectItem>
            <SelectItem value="tips">Tips</SelectItem>
            <SelectItem value="ppv">PPV revenue</SelectItem>
            <SelectItem value="avg_fan_spend">Avg fan spend</SelectItem>
            <SelectItem value="expired">Expired subs</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-3">#</th>
              <th className="text-left font-medium px-3 py-3">Creator</th>
              <th className="text-right font-medium px-3 py-3">Total earnings</th>
              <th className="text-right font-medium px-3 py-3">Last 30d</th>
              <th className="text-right font-medium px-3 py-3">Active subs</th>
              <th className="text-right font-medium px-3 py-3">Expired</th>
              <th className="text-right font-medium px-3 py-3">Tips</th>
              <th className="text-right font-medium px-3 py-3">PPV rev</th>
              <th className="text-right font-medium px-3 py-3">Avg fan spend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.creator.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    {r.stats?.avatar_url ? (
                      <img src={r.stats.avatar_url} className="h-6 w-6 rounded-full object-cover border border-border" alt="" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-semibold">
                        {r.creator.name[0]}
                      </div>
                    )}
                    <div>
                      <div className="font-medium">{r.creator.name}</div>
                      {r.creator.of_username && (
                        <div className="text-[10px] text-muted-foreground">@{r.creator.of_username}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-bold text-success">{fmt$0(r.earnings)}</td>
                <td className="px-3 py-3 text-right">{r.last30d > 0 ? fmt$0(r.last30d) : "—"}</td>
                <td className="px-3 py-3 text-right">{fmtNum(r.active_subs)}</td>
                <td className="px-3 py-3 text-right text-muted-foreground">{fmtNum(r.expired)}</td>
                <td className="px-3 py-3 text-right text-muted-foreground">{fmt$0(r.tips)}</td>
                <td className="px-3 py-3 text-right text-muted-foreground">{fmt$0(r.ppv)}</td>
                <td className="px-3 py-3 text-right">{r.fan_count > 0 ? fmt$(r.avg_fan_spend) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Creator detail view (drill-in) ────────────────────────────────────────────
function CreatorDetailView({
  creator, stats, earnings, subscribers, subMetrics, ppvMessages, promotions,
  syncing, onBack, onSync, onRefresh,
}: {
  creator: Creator;
  stats: OFStats | null;
  earnings: EarningsDaily[];
  subscribers: Subscriber[];
  subMetrics: SubMetric[];
  ppvMessages: PpvMessage[];
  promotions: Promotion[];
  syncing: boolean;
  onBack: () => void;
  onSync: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to creators
        </Button>
        <div className="flex items-center gap-2">
          {creator.of_username && (
            <a
              href={`https://onlyfans.com/${creator.of_username}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              Open on OnlyFans <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <Button size="sm" variant="outline" onClick={onSync} disabled={syncing || !creator.of_username}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync from OnlyFans"}
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-border flex-wrap">
        <SiOnlyfans className="h-7 w-7" style={{ color: OF_BLUE }} />
        {stats?.avatar_url ? (
          <img src={stats.avatar_url} className="h-12 w-12 rounded-full object-cover border border-border" alt="" />
        ) : (
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/30 to-primary-glow/30 border border-border flex items-center justify-center text-base font-semibold">
            {creator.name[0]}
          </div>
        )}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{stats?.display_name ?? creator.name}</h2>
          {creator.of_username && (
            <div className="text-sm text-muted-foreground">@{creator.of_username}</div>
          )}
        </div>
        {stats?.synced_at && (
          <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Synced {formatDistanceToNow(new Date(stats.synced_at), { addSuffix: true })}
          </span>
        )}
      </div>

      {!stats ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <p className="text-sm text-muted-foreground mb-3">No OF data synced yet.</p>
          <Button onClick={onSync} disabled={syncing || !creator.of_username}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            {creator.of_username ? "Sync now" : "Set OF username first"}
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
            <TabsTrigger value="topfans">Top fans</TabsTrigger>
            <TabsTrigger value="ppv">PPV</TabsTrigger>
            <TabsTrigger value="promotions">Promotions</TabsTrigger>
            {/* New tabs powered by the typed of-api client */}
            <TabsTrigger value="inbox" disabled={!creator.onlyfansapi_acct_id}>Inbox</TabsTrigger>
            <TabsTrigger value="massdm" disabled={!creator.onlyfansapi_acct_id}>Mass DM</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewSubtab stats={stats} earnings={earnings} />
          </TabsContent>
          <TabsContent value="subscribers" className="mt-6">
            <SubscribersSubtab stats={stats} subscribers={subscribers} subMetrics={subMetrics} />
          </TabsContent>
          <TabsContent value="topfans" className="mt-6">
            <TopFansSubtab subscribers={subscribers} />
          </TabsContent>
          <TabsContent value="ppv" className="mt-6">
            <PpvSubtab ppvMessages={ppvMessages} />
          </TabsContent>
          <TabsContent value="promotions" className="mt-6">
            <PromotionsSubtab creatorId={creator.id} promotions={promotions} earnings={earnings} onRefresh={onRefresh} />
          </TabsContent>
          <TabsContent value="inbox" className="mt-6">
            {creator.onlyfansapi_acct_id ? (
              <OnlyFansInbox accountId={creator.onlyfansapi_acct_id} creatorName={creator.name} />
            ) : (
              <NotConnectedHint />
            )}
          </TabsContent>
          <TabsContent value="massdm" className="mt-6">
            {creator.onlyfansapi_acct_id ? (
              <OnlyFansMassDm
                accountId={creator.onlyfansapi_acct_id}
                creatorId={creator.id}
                creatorName={creator.name}
              />
            ) : (
              <NotConnectedHint />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ── Overview subtab ───────────────────────────────────────────────────────────
function OverviewSubtab({ stats, earnings }: { stats: OFStats; earnings: EarningsDaily[] }) {
  const dailyChart = useMemo(() => {
    const last30 = earnings
      .filter((e) => Date.now() - new Date(e.entry_date).getTime() < 30 * 24 * 3600_000)
      .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());
    return last30.map((e) => ({
      date: format(new Date(e.entry_date), "MMM d"),
      total: Math.round(e.total),
    }));
  }, [earnings]);

  const breakdown = useMemo(() => {
    return [
      { name: "Subscriptions", value: Math.round(stats.earnings_subs), color: "#3B82F6" },
      { name: "Tips", value: Math.round(stats.earnings_tips), color: "#10B981" },
      { name: "PPV", value: Math.round(stats.earnings_ppv), color: "#F59E0B" },
      { name: "Messages", value: Math.round(stats.earnings_messages), color: "#EC4899" },
      { name: "Streams", value: Math.round(stats.earnings_streams), color: "#8B5CF6" },
      { name: "Referrals", value: Math.round(stats.earnings_referrals), color: "#6B7280" },
    ].filter((b) => b.value > 0);
  }, [stats]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Total earnings" value={fmt$0(stats.total_earnings)} sub="all-time" valueClass="text-success" icon={<DollarSign className="h-3.5 w-3.5" />} />
        <KpiCard label="Active subscribers" value={fmtNum(stats.active_subscribers)} sub={`${stats.expired_subscribers} expired`} icon={<Users className="h-3.5 w-3.5" />} />
        <KpiCard label="Sub price" value={stats.sub_price != null ? fmt$0(stats.sub_price) : "—"} sub="current" />
        <KpiCard label="Posts" value={fmtNum(stats.posts_count)} sub={`${fmtNum(stats.followers_count)} followers`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Daily earnings" sub="last 30 days">
          {dailyChart.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
              No daily data yet — sync to populate.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(v: number) => [fmt$0(v), "Total"]}
                />
                <Bar dataKey="total" fill={OF_BLUE} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Earnings breakdown" sub="all-time by source">
          {breakdown.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
              No earnings recorded yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={breakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={2}
                  label={(e: { name?: string; percent?: number }) => `${e.name ?? ""} ${e.percent != null ? (e.percent * 100).toFixed(0) : 0}%`}
                  labelLine={false}
                >
                  {breakdown.map((b) => (
                    <Cell key={b.name} fill={b.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt$0(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {stats.bio && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bio</div>
          <p className="text-sm whitespace-pre-wrap">{stats.bio}</p>
        </div>
      )}
    </div>
  );
}

// ── Subscribers subtab ────────────────────────────────────────────────────────
function SubscribersSubtab({
  stats, subscribers, subMetrics,
}: {
  stats: OFStats;
  subscribers: Subscriber[];
  subMetrics: SubMetric[];
}) {
  const activeFans = subscribers.filter((s) => s.is_active);
  const expiredFans = subscribers.filter((s) => !s.is_active);
  const churnRate = stats.active_subscribers + stats.expired_subscribers > 0
    ? (stats.expired_subscribers / (stats.active_subscribers + stats.expired_subscribers)) * 100
    : 0;

  // Recent expiring (active but expiring within 7 days)
  const expiringSoon = subscribers.filter((s) => {
    if (!s.is_active || !s.expires_at) return false;
    const daysLeft = differenceInDays(new Date(s.expires_at), new Date());
    return daysLeft >= 0 && daysLeft <= 7;
  });

  const metricsChart = useMemo(() => {
    return [...subMetrics]
      .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime())
      .slice(-30)
      .map((m) => ({
        date: format(new Date(m.entry_date), "MMM d"),
        active: m.active_count,
      }));
  }, [subMetrics]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Active subscribers" value={fmtNum(stats.active_subscribers)} sub="paying right now" valueClass="text-success" icon={<TrendingUp className="h-3.5 w-3.5" />} />
        <KpiCard label="Expired" value={fmtNum(stats.expired_subscribers)} sub="lapsed subs" icon={<TrendingDown className="h-3.5 w-3.5" />} />
        <KpiCard label="Churn rate" value={`${churnRate.toFixed(1)}%`} sub="expired / total" valueClass={churnRate > 30 ? "text-warning" : ""} />
        <KpiCard label="Expiring in 7 days" value={expiringSoon.length} sub="needs renewal push" valueClass={expiringSoon.length > 5 ? "text-warning" : ""} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
      </div>

      {metricsChart.length > 0 && (
        <ChartCard title="Active subscribers over time" sub={`last ${metricsChart.length} snapshots`}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={metricsChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [v.toLocaleString(), "Active subs"]}
              />
              <Bar dataKey="active" fill={OF_BLUE} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {expiringSoon.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Expiring in the next 7 days
          </h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Fan</th>
                  <th className="text-right font-medium px-3 py-2">Total spent</th>
                  <th className="text-left font-medium px-3 py-2">Expires</th>
                </tr>
              </thead>
              <tbody>
                {expiringSoon.slice(0, 20).map((s) => (
                  <tr key={s.id} className="border-t border-border bg-card">
                    <td className="px-3 py-2">
                      <span className="font-medium">{s.display_name ?? s.username ?? "—"}</span>
                      {s.username && s.display_name && (
                        <span className="text-xs text-muted-foreground ml-1.5">@{s.username}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-success">{fmt$(s.total_spent)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {s.expires_at && format(new Date(s.expires_at), "MMM d, h:mm a")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Synced fans (active)</div>
          <div className="text-2xl font-bold">{fmtNum(activeFans.length)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            of {fmtNum(stats.active_subscribers)} total reported
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground mb-2">Synced fans (expired)</div>
          <div className="text-2xl font-bold text-muted-foreground">{fmtNum(expiredFans.length)}</div>
          <div className="text-xs text-muted-foreground mt-1">click "Sync" to refresh</div>
        </div>
      </div>
    </div>
  );
}

// ── Top Fans subtab ───────────────────────────────────────────────────────────
function TopFansSubtab({ subscribers }: { subscribers: Subscriber[] }) {
  const top = useMemo(
    () => [...subscribers].sort((a, b) => b.total_spent - a.total_spent).slice(0, 50),
    [subscribers]
  );

  if (top.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
        No subscriber data synced yet.
      </div>
    );
  }

  const totalSpent = top.reduce((s, f) => s + f.total_spent, 0);

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Top 50 fans by total spend · {fmt$0(totalSpent)} combined.
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2 w-10">#</th>
              <th className="text-left font-medium px-3 py-2">Fan</th>
              <th className="text-right font-medium px-3 py-2">Total spent</th>
              <th className="text-right font-medium px-3 py-2">Tips</th>
              <th className="text-right font-medium px-3 py-2">PPV</th>
              <th className="text-right font-medium px-3 py-2">Messages</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {top.map((f, i) => (
              <tr key={f.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {i < 3 ? <Crown className={`h-4 w-4 ${i === 0 ? "text-yellow-500" : i === 1 ? "text-zinc-400" : "text-amber-700"}`} /> : i + 1}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {f.avatar_url ? (
                      <img src={f.avatar_url} className="h-6 w-6 rounded-full border border-border" alt="" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-secondary text-[10px] flex items-center justify-center font-semibold">
                        {(f.display_name ?? f.username ?? "?")[0]}
                      </div>
                    )}
                    <div>
                      <div className="font-medium">{f.display_name ?? f.username ?? "—"}</div>
                      {f.username && f.display_name && (
                        <div className="text-[10px] text-muted-foreground">@{f.username}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-bold text-success">{fmt$(f.total_spent)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{f.tips_total > 0 ? fmt$0(f.tips_total) : "—"}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{f.ppv_total > 0 ? fmt$0(f.ppv_total) : "—"}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{f.messages_total > 0 ? fmt$0(f.messages_total) : "—"}</td>
                <td className="px-3 py-2">
                  {f.is_active ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-success/30 bg-success/10 text-success">ACTIVE</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground">EXPIRED</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── PPV subtab ────────────────────────────────────────────────────────────────
function PpvSubtab({ ppvMessages }: { ppvMessages: PpvMessage[] }) {
  const sorted = useMemo(() => [...ppvMessages].sort((a, b) => b.revenue - a.revenue), [ppvMessages]);

  const totalRev = sorted.reduce((s, m) => s + m.revenue, 0);
  const totalUnlocks = sorted.reduce((s, m) => s + m.unlocks_count, 0);
  const totalRecipients = sorted.reduce((s, m) => s + m.recipients_count, 0);
  const conversionRate = totalRecipients > 0 ? (totalUnlocks / totalRecipients) * 100 : null;

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
        No PPV messages synced yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="PPV revenue" value={fmt$0(totalRev)} sub={`across ${sorted.length} messages`} valueClass="text-success" />
        <KpiCard label="Unlocks" value={fmtNum(totalUnlocks)} sub="purchases" />
        <KpiCard label="Recipients" value={fmtNum(totalRecipients)} sub="sent to" />
        <KpiCard label="Conversion" value={conversionRate != null ? `${conversionRate.toFixed(1)}%` : "—"} sub="unlocks / recipients" />
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Top PPV messages by revenue</h3>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Preview</th>
                <th className="text-left font-medium px-3 py-2">Sent</th>
                <th className="text-right font-medium px-3 py-2">Price</th>
                <th className="text-right font-medium px-3 py-2">Recipients</th>
                <th className="text-right font-medium px-3 py-2">Unlocks</th>
                <th className="text-right font-medium px-3 py-2">Conversion</th>
                <th className="text-right font-medium px-3 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 50).map((m) => {
                const conv = m.recipients_count > 0 ? (m.unlocks_count / m.recipients_count) * 100 : null;
                return (
                  <tr key={m.id} className="border-t border-border bg-card">
                    <td className="px-3 py-2 max-w-[280px]">
                      <div className="truncate text-xs">{m.preview ?? <span className="italic text-muted-foreground">(no preview)</span>}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {m.sent_at ? format(new Date(m.sent_at), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{m.price != null ? fmt$0(m.price) : "—"}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{fmtNum(m.recipients_count)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(m.unlocks_count)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {conv != null ? `${conv.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-success">{fmt$0(m.revenue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Promotions subtab ─────────────────────────────────────────────────────────
function PromotionsSubtab({
  creatorId, promotions, earnings, onRefresh,
}: {
  creatorId: string;
  promotions: Promotion[];
  earnings: EarningsDaily[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    promo_type: "discount" as PromoType,
    discount_pct: "",
    trial_days: "",
    starts_at: format(new Date(), "yyyy-MM-dd"),
    ends_at: "",
    notes: "",
  });

  const startEdit = (p: Promotion) => {
    setForm({
      name: p.name,
      promo_type: p.promo_type,
      discount_pct: p.discount_pct?.toString() ?? "",
      trial_days: p.trial_days?.toString() ?? "",
      starts_at: p.starts_at,
      ends_at: p.ends_at ?? "",
      notes: p.notes ?? "",
    });
    setEditingId(p.id);
    setOpen(true);
  };

  const onSubmit = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    if (!form.starts_at) return toast.error("Start date required");
    const payload = {
      creator_id: creatorId,
      name: form.name.trim(),
      promo_type: form.promo_type,
      discount_pct: form.discount_pct ? parseFloat(form.discount_pct) : null,
      trial_days: form.trial_days ? parseInt(form.trial_days) : null,
      starts_at: form.starts_at,
      ends_at: form.ends_at || null,
      notes: form.notes.trim() || null,
    };
    if (editingId) {
      const { error } = await supabase.from("of_promotions").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Promotion updated");
    } else {
      const { error } = await supabase.from("of_promotions").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Promotion added");
    }
    setForm({ name: "", promo_type: "discount", discount_pct: "", trial_days: "", starts_at: format(new Date(), "yyyy-MM-dd"), ends_at: "", notes: "" });
    setEditingId(null);
    setOpen(false);
    onRefresh();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("of_promotions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Promotion deleted");
    onRefresh();
  };

  // Compute earnings during each promo period for quick lift visibility
  const earningsForPromo = (p: Promotion): number => {
    const start = new Date(p.starts_at).getTime();
    const end = p.ends_at ? new Date(p.ends_at).getTime() + 24 * 3600_000 : Date.now();
    return earnings
      .filter((e) => {
        const t = new Date(e.entry_date).getTime();
        return t >= start && t <= end;
      })
      .reduce((s, e) => s + e.total, 0);
  };

  const sorted = [...promotions].sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Track sub-price changes, free trials, and discount campaigns. Earnings during the period auto-populate so you can see promo impact.
        </p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm({ name: "", promo_type: "discount", discount_pct: "", trial_days: "", starts_at: format(new Date(), "yyyy-MM-dd"), ends_at: "", notes: "" }); } }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />New promotion
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? "Edit promotion" : "New promotion"}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="50% off Black Friday" />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={form.promo_type} onValueChange={(v) => setForm({ ...form, promo_type: v as PromoType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discount">Discount</SelectItem>
                      <SelectItem value="free_trial">Free trial</SelectItem>
                      <SelectItem value="bundle">Bundle</SelectItem>
                      <SelectItem value="price_change">Price change</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(form.promo_type === "discount" || form.promo_type === "bundle") && (
                  <div className="space-y-1.5">
                    <Label>Discount %</Label>
                    <Input type="number" value={form.discount_pct} onChange={(e) => setForm({ ...form, discount_pct: e.target.value })} placeholder="50" />
                  </div>
                )}
                {form.promo_type === "free_trial" && (
                  <div className="space-y-1.5">
                    <Label>Trial days</Label>
                    <Input type="number" value={form.trial_days} onChange={(e) => setForm({ ...form, trial_days: e.target.value })} placeholder="7" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Starts</Label>
                  <DatePicker
                    value={form.starts_at ? new Date(form.starts_at) : null}
                    onChange={(d) => setForm({ ...form, starts_at: d ? format(d, "yyyy-MM-dd") : "" })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Ends <span className="text-muted-foreground text-xs">(opt)</span></Label>
                  <DatePicker
                    value={form.ends_at ? new Date(form.ends_at) : null}
                    onChange={(d) => setForm({ ...form, ends_at: d ? format(d, "yyyy-MM-dd") : "" })}
                    clearable
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What's the goal of this promo?" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onSubmit}>{editingId ? "Save" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
          No promotions tracked yet.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((p) => {
            const lift = earningsForPromo(p);
            const isActive = !p.ends_at || new Date(p.ends_at).getTime() >= Date.now();
            const days = p.ends_at
              ? differenceInDays(new Date(p.ends_at), new Date(p.starts_at)) + 1
              : differenceInDays(new Date(), new Date(p.starts_at)) + 1;
            return (
              <div key={p.id} className={`rounded-xl border bg-card p-4 ${isActive ? "border-primary/30" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag className="h-3.5 w-3.5 text-primary" />
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary/40 text-muted-foreground">
                        {promoTypeLabels[p.promo_type]}
                      </span>
                      {isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-success/40 bg-success/10 text-success">
                          ACTIVE
                        </span>
                      )}
                      {p.discount_pct != null && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-warning/40 bg-warning/10 text-warning">
                          {p.discount_pct}% off
                        </span>
                      )}
                      {p.trial_days != null && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-warning/40 bg-warning/10 text-warning">
                          {p.trial_days}-day trial
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      {format(new Date(p.starts_at), "MMM d, yyyy")}
                      {p.ends_at ? <> → {format(new Date(p.ends_at), "MMM d, yyyy")} · {days} days</> : <> · ongoing ({days} days)</>}
                    </div>
                    {p.notes && <div className="text-xs text-muted-foreground mt-1.5 italic">"{p.notes}"</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Earnings during period</div>
                    <div className="text-lg font-bold text-success">{fmt$0(lift)}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1">
                  <button
                    onClick={() => startEdit(p)}
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
                        <AlertDialogTitle>Delete "{p.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(p.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Shared cards ──────────────────────────────────────────────────────────────
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

// Shared empty state for the new tabs that need an OF account id
function NotConnectedHint() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
      <SiOnlyfans className="h-7 w-7 mx-auto mb-3" style={{ color: "#00AFF0", opacity: 0.5 }} />
      <div className="text-sm font-medium">Not connected to OnlyFansAPI yet</div>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Set this creator's OnlyFans username and click <strong>Sync</strong> on the
        Overview tab — that resolves their OnlyFansAPI account id and unlocks
        the Inbox and Mass DM tools.
      </p>
    </div>
  );
}
