// Agency-wide Reddit roster + subreddit heatmap.
//
// The existing reddit.tsx page is creator-scoped (pick a creator → see their
// accounts). This component sits at the top of that page as an agency-wide
// view: every account, every sub, every post — across the whole roster.
//
// Three blocks:
//   1. KPI strip: total accounts × status breakdown
//   2. Account roster: filterable table of accounts (creator, status, last
//      posted, post counts, infloww revenue)
//   3. Subreddit heatmap: per-sub aggregated stats — posts × upvotes ×
//      comments — plus referrer traffic from landing_views.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TrendingUp, AlertTriangle, Ban, Pause, Users, Hash,
  ExternalLink, Search, Activity, Zap, Eye, MousePointerClick,
  ChevronDown, ChevronUp, Flame, Snowflake, Skull,
} from "lucide-react";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { SiReddit } from "react-icons/si";

// ── Types ───────────────────────────────────────────────────────────────

type Creator = { id: string; name: string };

type AccountWithStats = {
  id: string;
  creator_id: string;
  creator_name: string;
  username: string;
  status: string;
  notes: string | null;
  // Computed
  posts_30d: number;
  posts_total: number;
  upvotes_total: number;
  last_posted_at: string | null;
  subs_count: number;
  infloww_revenue: number;
  infloww_clicks: number;
  infloww_subs: number;
};

type SubAggregate = {
  name: string;
  posts: number;
  upvotes: number;
  comments: number;
  // Set of creator IDs whose accounts have posted there
  creators: Set<string>;
  landing_views: number;
};

const STATUS_META: Record<string, { label: string; tone: string; Icon: React.ComponentType<{ className?: string }> }> = {
  active:       { label: "Warm",         tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: Flame },
  shadowbanned: { label: "Shadowbanned", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30",       Icon: AlertTriangle },
  suspended:    { label: "Suspended",    tone: "bg-rose-500/15 text-rose-400 border-rose-500/30",          Icon: Ban },
  inactive:     { label: "Inactive",     tone: "bg-secondary text-muted-foreground border-border",         Icon: Snowflake },
};
const statusMeta = (s: string) => STATUS_META[s] ?? STATUS_META.inactive;

const formatMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Parse a referrer URL like "https://www.reddit.com/r/onlyfans/comments/..."
// → returns "onlyfans". Returns null if it isn't a Reddit URL.
const subredditFromReferrer = (ref: string | null): string | null => {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    if (!u.hostname.includes("reddit.com")) return null;
    const m = u.pathname.match(/^\/r\/([^/]+)/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
};

export function RedditRoster() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountWithStats[]>([]);
  const [subAggregates, setSubAggregates] = useState<SubAggregate[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"recent" | "posts" | "revenue">("revenue");

  const load = async () => {
    setLoading(true);
    const since30d = subDays(new Date(), 30).toISOString();

    // Pull all the relational tables in parallel — they're all small enough
    // that a wholesale select is cheaper than per-account roundtrips.
    const [
      { data: cs },
      { data: ras },
      { data: posts },
      { data: subs },
      { data: infloww },
      { data: views },
    ] = await Promise.all([
      supabase.from("creators").select("id, name").order("name"),
      supabase.from("reddit_accounts").select("id, creator_id, username, status, notes"),
      supabase.from("posts").select("id, reddit_account_id, subreddit, posted_at, upvotes, comments"),
      supabase.from("subreddits").select("id, reddit_account_id, name"),
      supabase.from("infloww_tracking_stats").select("reddit_account_id, revenue_total, clicks_count, subscribers_count"),
      supabase.from("landing_views")
        .select("referrer")
        .gte("occurred_at", since30d)
        .not("referrer", "is", null),
    ]);

    const creators = (cs ?? []) as Creator[];
    const creatorById = new Map(creators.map((c) => [c.id, c.name]));

    type RA = { id: string; creator_id: string; username: string; status: string; notes: string | null };
    const accountList = (ras ?? []) as RA[];

    // Posts grouped by account for per-account stats
    type Post = { reddit_account_id: string; subreddit: string; posted_at: string; upvotes: number; comments: number };
    const postsByAccount = new Map<string, Post[]>();
    for (const p of (posts ?? []) as Post[]) {
      if (!postsByAccount.has(p.reddit_account_id)) postsByAccount.set(p.reddit_account_id, []);
      postsByAccount.get(p.reddit_account_id)!.push(p);
    }

    // Subs grouped by account
    const subsByAccount = new Map<string, number>();
    for (const s of (subs ?? []) as { reddit_account_id: string }[]) {
      subsByAccount.set(s.reddit_account_id, (subsByAccount.get(s.reddit_account_id) ?? 0) + 1);
    }

    // Infloww grouped by account
    const inflowwByAccount = new Map<string, { revenue: number; clicks: number; subs: number }>();
    for (const i of (infloww ?? []) as { reddit_account_id: string | null; revenue_total: number; clicks_count: number; subscribers_count: number }[]) {
      if (!i.reddit_account_id) continue;
      const cur = inflowwByAccount.get(i.reddit_account_id) ?? { revenue: 0, clicks: 0, subs: 0 };
      cur.revenue += Number(i.revenue_total) || 0;
      cur.clicks += Number(i.clicks_count) || 0;
      cur.subs += Number(i.subscribers_count) || 0;
      inflowwByAccount.set(i.reddit_account_id, cur);
    }

    // Build account roster with computed stats
    const since30dDate = subDays(new Date(), 30);
    const enriched: AccountWithStats[] = accountList.map((a) => {
      const ap = postsByAccount.get(a.id) ?? [];
      const recentPosts = ap.filter((p) => new Date(p.posted_at) > since30dDate);
      const lastPostedAt = ap.length === 0
        ? null
        : ap.reduce((max, p) => (p.posted_at > max ? p.posted_at : max), ap[0].posted_at);
      const upvotesTotal = ap.reduce((s, p) => s + (p.upvotes || 0), 0);
      const inf = inflowwByAccount.get(a.id);
      return {
        id: a.id,
        creator_id: a.creator_id,
        creator_name: creatorById.get(a.creator_id) ?? "—",
        username: a.username,
        status: a.status || "inactive",
        notes: a.notes,
        posts_30d: recentPosts.length,
        posts_total: ap.length,
        upvotes_total: upvotesTotal,
        last_posted_at: lastPostedAt,
        subs_count: subsByAccount.get(a.id) ?? 0,
        infloww_revenue: inf?.revenue ?? 0,
        infloww_clicks: inf?.clicks ?? 0,
        infloww_subs: inf?.subs ?? 0,
      };
    });
    setAccounts(enriched);

    // Aggregate per-subreddit stats. We use the subreddit *name* as the key
    // since a single sub may have rows under multiple accounts.
    type Post2 = { reddit_account_id: string; subreddit: string; upvotes: number; comments: number };
    const aggMap = new Map<string, SubAggregate>();
    const accountToCreator = new Map(accountList.map((a) => [a.id, a.creator_id]));
    for (const p of (posts ?? []) as Post2[]) {
      const key = (p.subreddit || "").toLowerCase();
      if (!key) continue;
      if (!aggMap.has(key)) {
        aggMap.set(key, { name: key, posts: 0, upvotes: 0, comments: 0, creators: new Set(), landing_views: 0 });
      }
      const agg = aggMap.get(key)!;
      agg.posts++;
      agg.upvotes += p.upvotes || 0;
      agg.comments += p.comments || 0;
      const cId = accountToCreator.get(p.reddit_account_id);
      if (cId) agg.creators.add(cId);
    }

    // Reddit-attributed landing-page traffic — parses the referrer URL.
    // This works for any landing page across the agency; it doesn't matter
    // who owns it, just that someone clicked through from r/<sub>.
    for (const v of (views ?? []) as { referrer: string | null }[]) {
      const sub = subredditFromReferrer(v.referrer);
      if (!sub) continue;
      if (!aggMap.has(sub)) {
        aggMap.set(sub, { name: sub, posts: 0, upvotes: 0, comments: 0, creators: new Set(), landing_views: 0 });
      }
      aggMap.get(sub)!.landing_views++;
    }

    setSubAggregates([...aggMap.values()]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  // ── Derived data ──────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const counts = { warm: 0, shadowbanned: 0, suspended: 0, inactive: 0 };
    for (const a of accounts) {
      if (a.status === "active") counts.warm++;
      else if (a.status === "shadowbanned") counts.shadowbanned++;
      else if (a.status === "suspended") counts.suspended++;
      else counts.inactive++;
    }
    return counts;
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    let list = accounts;
    if (statusFilter) list = list.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        a.username.toLowerCase().includes(q) ||
        a.creator_name.toLowerCase().includes(q),
      );
    }
    if (sortBy === "recent") {
      list = [...list].sort((a, b) => {
        const ba = a.last_posted_at ? new Date(a.last_posted_at).getTime() : 0;
        const bb = b.last_posted_at ? new Date(b.last_posted_at).getTime() : 0;
        return bb - ba;
      });
    } else if (sortBy === "posts") {
      list = [...list].sort((a, b) => b.posts_30d - a.posts_30d);
    } else {
      list = [...list].sort((a, b) => b.infloww_revenue - a.infloww_revenue);
    }
    return list;
  }, [accounts, statusFilter, search, sortBy]);

  const topSubs = useMemo(() => {
    return [...subAggregates]
      .sort((a, b) => (b.posts + b.landing_views * 2) - (a.posts + a.landing_views * 2))
      .slice(0, 25);
  }, [subAggregates]);

  // Maxes for heatmap intensity scaling
  const maxPosts = Math.max(1, ...subAggregates.map((s) => s.posts));
  const maxUpvotes = Math.max(1, ...subAggregates.map((s) => s.upvotes));
  const maxViews = Math.max(1, ...subAggregates.map((s) => s.landing_views));

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-card/60 border border-border" />
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total accounts"
          value={accounts.length}
          icon={<SiReddit className="h-4 w-4" style={{ color: "#FF4500" }} />}
          tone="primary"
          hint={`across ${new Set(accounts.map((a) => a.creator_id)).size} creators`}
        />
        <KpiCard
          label="Warm"
          value={stats.warm}
          icon={<Flame className="h-4 w-4" />}
          tone="emerald"
          hint={accounts.length > 0 ? `${Math.round((stats.warm / accounts.length) * 100)}% of roster` : undefined}
        />
        <KpiCard
          label="Shadowbanned"
          value={stats.shadowbanned}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="amber"
          hint={stats.shadowbanned > 0 ? "needs cycling" : "none flagged"}
        />
        <KpiCard
          label="Suspended / dead"
          value={stats.suspended + stats.inactive}
          icon={<Skull className="h-4 w-4" />}
          tone="rose"
          hint={stats.suspended > 0 ? `${stats.suspended} actively suspended` : "all inactive"}
        />
      </div>

      {/* Account roster */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" /> Account roster
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Every Reddit account across the agency. Click an account to open it on Reddit.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search account or creator…"
                className="pl-7 h-8 text-xs w-56"
              />
            </div>
          </div>
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterPill active={statusFilter === null} onClick={() => setStatusFilter(null)}>
            All ({accounts.length})
          </FilterPill>
          <FilterPill active={statusFilter === "active"}       onClick={() => setStatusFilter("active")}>
            <Flame className="h-3 w-3 mr-1 inline" /> Warm ({stats.warm})
          </FilterPill>
          <FilterPill active={statusFilter === "shadowbanned"} onClick={() => setStatusFilter("shadowbanned")}>
            <AlertTriangle className="h-3 w-3 mr-1 inline" /> Shadowbanned ({stats.shadowbanned})
          </FilterPill>
          <FilterPill active={statusFilter === "suspended"}    onClick={() => setStatusFilter("suspended")}>
            <Ban className="h-3 w-3 mr-1 inline" /> Suspended ({stats.suspended})
          </FilterPill>
          <FilterPill active={statusFilter === "inactive"}     onClick={() => setStatusFilter("inactive")}>
            <Snowflake className="h-3 w-3 mr-1 inline" /> Inactive ({stats.inactive})
          </FilterPill>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Sort:</span>
            <SortPill active={sortBy === "revenue"} onClick={() => setSortBy("revenue")}>Revenue</SortPill>
            <SortPill active={sortBy === "posts"}   onClick={() => setSortBy("posts")}>Posts (30d)</SortPill>
            <SortPill active={sortBy === "recent"}  onClick={() => setSortBy("recent")}>Last posted</SortPill>
          </div>
        </div>

        {/* Roster table */}
        {filteredAccounts.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-6 text-center border border-dashed border-border rounded-lg">
            {accounts.length === 0
              ? "No Reddit accounts in the system yet. Add some on the per-creator view below."
              : "No accounts match these filters."}
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[2fr_1.5fr_120px_1fr_1fr_1fr] gap-2 px-3 py-2 bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              <div>Account</div>
              <div>Creator</div>
              <div>Status</div>
              <div className="text-right">Posts (30d)</div>
              <div className="text-right">Last posted</div>
              <div className="text-right">Revenue</div>
            </div>
            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {filteredAccounts.map((a) => {
                const meta = statusMeta(a.status);
                const StatusIcon = meta.Icon;
                return (
                  <a
                    key={a.id}
                    href={`https://reddit.com/u/${a.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid grid-cols-[2fr_1.5fr_120px_1fr_1fr_1fr] gap-2 px-3 py-2.5 text-xs hover:bg-secondary/30 transition-colors items-center"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <SiReddit className="h-3.5 w-3.5 shrink-0" style={{ color: "#FF4500" }} />
                      <span className="font-mono font-medium truncate">u/{a.username}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    </div>
                    <div className="truncate text-muted-foreground">{a.creator_name}</div>
                    <div>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${meta.tone}`}>
                        <StatusIcon className="h-2.5 w-2.5" /> {meta.label}
                      </span>
                    </div>
                    <div className="text-right tabular-nums font-medium">
                      {a.posts_30d}
                      {a.posts_total > 0 && (
                        <span className="text-muted-foreground/60 ml-1">/ {a.posts_total}</span>
                      )}
                    </div>
                    <div className="text-right text-muted-foreground tabular-nums" title={a.last_posted_at ?? ""}>
                      {a.last_posted_at
                        ? formatDistanceToNow(new Date(a.last_posted_at), { addSuffix: true })
                        : "—"}
                    </div>
                    <div className="text-right font-semibold tabular-nums">
                      {a.infloww_revenue > 0 ? (
                        <span className="text-emerald-400">{formatMoney(a.infloww_revenue)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Subreddit heatmap */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <Hash className="h-4 w-4 text-primary" /> Subreddit heatmap
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Top 25 subs by activity score (posts × upvotes + 2× landing-page clicks). Last 30 days for traffic.
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1"><div className="h-2 w-2 rounded bg-primary/30" /> low</span>
            <span className="inline-flex items-center gap-1"><div className="h-2 w-2 rounded bg-primary" /> high</span>
          </div>
        </div>

        {topSubs.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-6 text-center border border-dashed border-border rounded-lg">
            No post data yet. Sync Reddit posts on the per-creator view below to populate this.
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-2 bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              <div>Subreddit</div>
              <div className="text-right">Creators</div>
              <div className="text-right">Posts</div>
              <div className="text-right">Upvotes</div>
              <div className="text-right">Comments</div>
              <div className="text-right">Reddit→landing</div>
            </div>
            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {topSubs.map((s) => {
                const postIntensity = Math.min(1, s.posts / maxPosts);
                const viewIntensity = Math.min(1, s.landing_views / maxViews);
                return (
                  <a
                    key={s.name}
                    href={`https://reddit.com/r/${s.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-2.5 text-xs hover:bg-secondary/30 transition-colors items-center"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-medium truncate">r/{s.name}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    </div>
                    <div className="text-right text-muted-foreground tabular-nums">
                      {s.creators.size}
                    </div>
                    <div className="text-right">
                      <HeatCell value={s.posts} intensity={postIntensity} />
                    </div>
                    <div className="text-right tabular-nums text-muted-foreground">
                      {s.upvotes > 0 ? (
                        <span className="inline-flex items-center gap-0.5">
                          <ChevronUp className="h-3 w-3 text-orange-400" />
                          {s.upvotes.toLocaleString()}
                        </span>
                      ) : "—"}
                    </div>
                    <div className="text-right tabular-nums text-muted-foreground">
                      {s.comments > 0 ? s.comments.toLocaleString() : "—"}
                    </div>
                    <div className="text-right">
                      {s.landing_views > 0 ? (
                        <HeatCell value={s.landing_views} intensity={viewIntensity} accent="emerald" />
                      ) : <span className="text-muted-foreground">—</span>}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Tiny presentational helpers ────────────────────────────────────────

const TONE_STYLES: Record<string, string> = {
  primary: "border-primary/20 bg-primary/5 text-primary",
  emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
  amber:   "border-amber-500/20 bg-amber-500/5 text-amber-400",
  rose:    "border-rose-500/20 bg-rose-500/5 text-rose-400",
};

function KpiCard({
  label, value, icon, tone, hint,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "primary" | "emerald" | "amber" | "rose";
  hint?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${TONE_STYLES[tone]}`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</div>
        {icon}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-2 text-foreground">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function FilterPill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SortPill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function HeatCell({
  value, intensity, accent = "primary",
}: { value: number; intensity: number; accent?: "primary" | "emerald" }) {
  // Intensity drives both background opacity and text weight.
  const bg = accent === "emerald"
    ? `rgba(52, 211, 153, ${0.08 + intensity * 0.32})`
    : `rgba(232, 120, 82, ${0.08 + intensity * 0.32})`;
  const color = accent === "emerald" ? "rgb(52,211,153)" : "rgb(232,120,82)";
  return (
    <span
      className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-bold tabular-nums min-w-[2.5rem]"
      style={{ background: bg, color: intensity > 0.5 ? color : undefined }}
    >
      {value.toLocaleString()}
    </span>
  );
}
