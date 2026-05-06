import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, Percent } from "lucide-react";
import { SiMeta } from "react-icons/si";
import { format } from "date-fns";

export const Route = createFileRoute("/ads")({
  component: AdsPage,
});

type Creator = { id: string; name: string; avatar_url: string | null };
type AdCampaign = {
  id: string;
  creator_id: string;
  platform: string;
  amount_spent: number;
  revenue_generated: number;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function roiPct(spent: number, revenue: number) {
  if (spent === 0) return null;
  return ((revenue - spent) / spent) * 100;
}

function RoiBadge({ spent, revenue }: { spent: number; revenue: number }) {
  const roi = roiPct(spent, revenue);
  if (roi === null) return <span className="text-muted-foreground">—</span>;
  const positive = roi >= 0;
  return (
    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${
      positive
        ? "bg-success/15 text-success border-success/30"
        : "bg-destructive/15 text-destructive border-destructive/30"
    }`}>
      {positive ? "+" : ""}{roi.toFixed(0)}%
    </span>
  );
}

function AdsPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCreator, setFilterCreator] = useState("all");
  const [filterPlatform, setFilterPlatform] = useState("all");

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: ads }] = await Promise.all([
      supabase.from("creators").select("id, name, avatar_url").order("name"),
      supabase.from("ad_campaigns").select("*").order("start_date", { ascending: false }),
    ]);
    setCreators((cs ?? []) as Creator[]);
    setCampaigns((ads ?? []) as AdCampaign[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const platforms = useMemo(
    () => Array.from(new Set(campaigns.map((c) => c.platform))).sort(),
    [campaigns],
  );

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (filterCreator !== "all" && c.creator_id !== filterCreator) return false;
      if (filterPlatform !== "all" && c.platform !== filterPlatform) return false;
      return true;
    });
  }, [campaigns, filterCreator, filterPlatform]);

  const totalSpent = filtered.reduce((s, c) => s + c.amount_spent, 0);
  const totalRevenue = filtered.reduce((s, c) => s + c.revenue_generated, 0);
  const overallRoi = roiPct(totalSpent, totalRevenue);

  const byCreator = useMemo(() => {
    const map = new Map<string, { spent: number; revenue: number; count: number }>();
    for (const c of campaigns) {
      const existing = map.get(c.creator_id) ?? { spent: 0, revenue: 0, count: 0 };
      map.set(c.creator_id, {
        spent: existing.spent + c.amount_spent,
        revenue: existing.revenue + c.revenue_generated,
        count: existing.count + 1,
      });
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].revenue - b[1].spent - (a[1].revenue - a[1].spent))
      .slice(0, 5);
  }, [campaigns]);

  const creatorName = (id: string) => creators.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <SiMeta className="h-6 w-6" style={{ color: "#0082FB" }} />
          <h1 className="text-3xl font-bold tracking-tight">Paid Ads</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Ad campaign spend, revenue generated, and ROI across all platforms and creators.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4 text-primary" /> Total spent
          </div>
          <div className="text-2xl font-bold">{fmt$(totalSpent)}</div>
          <div className="text-xs text-muted-foreground mt-1">{filtered.length} campaigns</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Revenue generated
          </div>
          <div className="text-2xl font-bold">{fmt$(totalRevenue)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4 text-primary" /> Net profit
          </div>
          <div className={`text-2xl font-bold ${totalRevenue - totalSpent >= 0 ? "text-success" : "text-destructive"}`}>
            {fmt$(totalRevenue - totalSpent)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Percent className="h-4 w-4 text-primary" /> Overall ROI
          </div>
          <div className={`text-2xl font-bold ${(overallRoi ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
            {overallRoi !== null ? `${overallRoi >= 0 ? "+" : ""}${overallRoi.toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      {/* Top creators by net profit */}
      {byCreator.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-semibold mb-4">Net profit by creator</div>
          <div className="space-y-3">
            {byCreator.map(([cid, stats]) => {
              const net = stats.revenue - stats.spent;
              const maxNet = Math.max(
                ...byCreator.map(([, s]) => Math.abs(s.revenue - s.spent)), 1,
              );
              const pct = Math.abs(net) / maxNet * 100;
              return (
                <div key={cid} className="flex items-center gap-3">
                  <Link
                    to="/creators/$creatorId"
                    params={{ creatorId: cid }}
                    className="w-28 text-xs truncate hover:text-primary transition-colors"
                  >
                    {creatorName(cid)}
                  </Link>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full ${net >= 0 ? "bg-success" : "bg-destructive"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className={`w-24 text-right text-xs font-semibold ${net >= 0 ? "text-success" : "text-destructive"}`}>
                    {net >= 0 ? "+" : ""}{fmt$(net)}
                  </div>
                  <div className="w-12 text-right">
                    <RoiBadge spent={stats.spent} revenue={stats.revenue} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterCreator}
          onChange={(e) => setFilterCreator(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">All creators</option>
          {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {platforms.length > 0 && (
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All platforms</option>
            {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {/* Campaigns table */}
      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add campaigns from a creator's detail page under the Ads tab.
          </p>
          <Link to="/" className="mt-3 inline-block text-sm text-primary hover:underline">
            Go to creators →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Creator</th>
                <th className="text-left font-medium px-4 py-3">Platform</th>
                <th className="text-left font-medium px-4 py-3">Period</th>
                <th className="text-right font-medium px-4 py-3">Spent</th>
                <th className="text-right font-medium px-4 py-3">Revenue</th>
                <th className="text-right font-medium px-4 py-3">Net</th>
                <th className="text-center font-medium px-4 py-3">ROI</th>
                <th className="text-left font-medium px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const net = c.revenue_generated - c.amount_spent;
                return (
                  <tr key={c.id} className="border-t border-border bg-card hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to="/creators/$creatorId"
                        params={{ creatorId: c.creator_id }}
                        className="hover:text-primary transition-colors font-medium"
                      >
                        {creatorName(c.creator_id)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{c.platform}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {format(new Date(c.start_date), "MMM d, yyyy")}
                      {c.end_date && ` — ${format(new Date(c.end_date), "MMM d, yyyy")}`}
                    </td>
                    <td className="px-4 py-3 text-right">{fmt$(c.amount_spent)}</td>
                    <td className="px-4 py-3 text-right">{fmt$(c.revenue_generated)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${net >= 0 ? "text-success" : "text-destructive"}`}>
                      {net >= 0 ? "+" : ""}{fmt$(net)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <RoiBadge spent={c.amount_spent} revenue={c.revenue_generated} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">
                      {c.notes ?? "—"}
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
