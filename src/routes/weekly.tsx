import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, TrendingUp, TrendingDown, Activity, Users, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { downloadCSV } from "./creators.$creatorId";

export const Route = createFileRoute("/weekly")({
  head: () => ({ meta: [{ title: "Weekly Summary — Agency Console" }] }),
  component: WeeklyPage,
});

type Creator = { id: string; name: string; status: string };
type Account = { id: string; creator_id: string; username: string; status: string };
type Post7d = { reddit_account_id: string; subreddit: string; upvotes: number; posted_at: string };
type RevEntry = { creator_id: string; amount: number };

function WeeklyPage() {
  const [loading, setLoading] = useState(true);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post7d[]>([]);
  const [revenue, setRevenue] = useState<RevEntry[]>([]);

  const load = async () => {
    setLoading(true);
    const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const since7dDate = since7d.split("T")[0];
    const [
      { data: cs, error: e1 },
      { data: accs },
      { data: ps },
      { data: rev },
    ] = await Promise.all([
      supabase.from("creators").select("id, name, status").order("name"),
      supabase.from("reddit_accounts").select("id, creator_id, username, status"),
      supabase.from("posts")
        .select("reddit_account_id, subreddit, upvotes, posted_at")
        .gte("posted_at", since7d),
      supabase.from("revenue_entries")
        .select("creator_id, amount")
        .gte("entry_date", since7dDate),
    ]);
    if (e1) toast.error(e1.message);
    setCreators((cs ?? []) as Creator[]);
    setAccounts((accs ?? []) as Account[]);
    setPosts((ps ?? []) as Post7d[]);
    setRevenue((rev ?? []) as RevEntry[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const raToCreator = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.creator_id])),
    [accounts],
  );

  // Creator leaderboard
  const creatorStats = useMemo(() => {
    const m: Record<string, { posts: number; upvotes: number; subUpvotes: Record<string, number[]> }> = {};
    for (const c of creators) m[c.id] = { posts: 0, upvotes: 0, subUpvotes: {} };
    for (const p of posts) {
      const cid = raToCreator.get(p.reddit_account_id);
      if (!cid || !m[cid]) continue;
      m[cid].posts++;
      m[cid].upvotes += p.upvotes;
      if (!m[cid].subUpvotes[p.subreddit]) m[cid].subUpvotes[p.subreddit] = [];
      m[cid].subUpvotes[p.subreddit].push(p.upvotes);
    }
    const revMap: Record<string, number> = {};
    for (const r of revenue) revMap[r.creator_id] = (revMap[r.creator_id] ?? 0) + r.amount;

    return creators
      .map((c) => {
        const s = m[c.id] ?? { posts: 0, upvotes: 0, subUpvotes: {} };
        const topSub = Object.entries(s.subUpvotes)
          .map(([name, ups]) => ({ name, avg: ups.reduce((a, b) => a + b, 0) / ups.length }))
          .sort((a, b) => b.avg - a.avg)[0]?.name ?? "—";
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          posts: s.posts,
          upvotes: s.upvotes,
          topSub,
          revenue: revMap[c.id] ?? 0,
        };
      })
      .sort((a, b) => b.upvotes - a.upvotes);
  }, [creators, posts, revenue, raToCreator]);

  // Global subreddit rankings
  const subRankings = useMemo(() => {
    const m: Record<string, { sum: number; count: number }> = {};
    for (const p of posts) {
      if (!m[p.subreddit]) m[p.subreddit] = { sum: 0, count: 0 };
      m[p.subreddit].sum += p.upvotes;
      m[p.subreddit].count++;
    }
    return Object.entries(m)
      .map(([name, { sum, count }]) => ({ name, avg: sum / count, count }))
      .sort((a, b) => b.avg - a.avg);
  }, [posts]);


  const weekStart = format(subDays(new Date(), 6), "MMM d");
  const weekEnd = format(new Date(), "MMM d, yyyy");

  const totalPosts = posts.length;
  const totalUpvotes = posts.reduce((s, p) => s + p.upvotes, 0);
  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);

  const exportWeekly = () => {
    const rows: string[][] = [
      ["Rank", "Creator", "Posts", "Upvotes", "Top Subreddit", "Revenue (USD)"],
      ...creatorStats.map((c, i) => [
        String(i + 1),
        c.name,
        String(c.posts),
        String(c.upvotes),
        c.topSub,
        c.revenue.toFixed(2),
      ]),
    ];
    downloadCSV(`weekly-summary-${format(new Date(), "yyyy-MM-dd")}.csv`, rows);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-card/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Toaster />

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Weekly Summary</h1>
          <p className="mt-1 text-sm text-muted-foreground">{weekStart} – {weekEnd}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportWeekly}>
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Agency stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={<Activity className="h-4 w-4" />} label="Posts this week" value={totalPosts} />
        <StatCard icon={<ArrowUp className="h-4 w-4" />} label="Total upvotes" value={totalUpvotes.toLocaleString()} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Revenue" value={`$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
      </div>


      {/* Creator leaderboard */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Creator leaderboard</h2>
        {creatorStats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">No data yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Rank</th>
                  <th className="text-left font-medium px-4 py-3">Creator</th>
                  <th className="text-right font-medium px-4 py-3">Posts</th>
                  <th className="text-right font-medium px-4 py-3">Upvotes</th>
                  <th className="text-left font-medium px-4 py-3">Top Sub</th>
                  <th className="text-right font-medium px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {creatorStats.map((c, i) => (
                  <tr key={c.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        i === 0 ? "bg-warning/20 text-warning" : i === 1 ? "bg-secondary text-foreground" : i === 2 ? "bg-primary/15 text-primary" : "text-muted-foreground"
                      }`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{c.posts}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <span className="inline-flex items-center gap-1">
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                        {c.upvotes.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.topSub !== "—" ? <span className="rounded-md bg-accent/40 px-2 py-0.5 text-xs">r/{c.topSub}</span> : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {c.revenue > 0 ? `$${c.revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Subreddit rankings */}
      {subRankings.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-success" />
              <h2 className="text-base font-semibold">Top subreddits this week</h2>
            </div>
            <div className="space-y-2">
              {subRankings.slice(0, 3).map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    <span className="font-medium text-sm">r/{s.name}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    avg <span className="font-semibold text-foreground">{Math.round(s.avg)}</span> upvotes · {s.count} posts
                  </div>
                </div>
              ))}
            </div>
          </section>

          {subRankings.length > 3 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="h-4 w-4 text-destructive" />
                <h2 className="text-base font-semibold">Bottom subreddits this week</h2>
              </div>
              <div className="space-y-2">
                {subRankings.slice(-3).reverse().map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      <span className="font-medium text-sm">r/{s.name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      avg <span className="font-semibold text-foreground">{Math.round(s.avg)}</span> upvotes · {s.count} posts
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}
