import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Users, RefreshCw, ExternalLink } from "lucide-react";
import { SiOnlyfans } from "react-icons/si";
import { format } from "date-fns";

export const Route = createFileRoute("/onlyfans")({
  component: OnlyFansPage,
});

type Creator = {
  id: string;
  name: string;
  of_username: string | null;
  avatar_url: string | null;
  status: string;
  onlyfansapi_acct_id: string | null;
};

type InflowwStat = {
  creator_id: string;
  reddit_account_id: string | null;
  campaign_code: number;
  revenue_total: number;
  clicks_count: number;
  subscribers_count: number;
  spenders_count: number;
  synced_at: string;
};

type ContentItem = { creator_id: string };

function OnlyFansPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [inflowwStats, setInflowwStats] = useState<InflowwStat[]>([]);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: ifw }, { data: ci }] = await Promise.all([
      supabase.from("creators").select("id, name, of_username, avatar_url, status, onlyfansapi_acct_id").order("name"),
      supabase.from("infloww_tracking_stats").select("creator_id, reddit_account_id, campaign_code, revenue_total, clicks_count, subscribers_count, spenders_count, synced_at"),
      supabase.from("content_items").select("creator_id"),
    ]);
    setCreators((cs ?? []) as Creator[]);
    setInflowwStats((ifw ?? []) as InflowwStat[]);
    setContentItems((ci ?? []) as ContentItem[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const revenueFor = (cid: string) =>
    inflowwStats
      .filter((s) => s.creator_id === cid && s.reddit_account_id !== null)
      .reduce((s, r) => s + r.revenue_total, 0);

  const subsFor = (cid: string) =>
    inflowwStats
      .filter((s) => s.creator_id === cid && s.reddit_account_id !== null)
      .reduce((s, r) => s + r.subscribers_count, 0);

  const contentCountFor = (cid: string) =>
    contentItems.filter((c) => c.creator_id === cid).length;

  const lastSyncFor = (cid: string) => {
    const stats = inflowwStats.filter((s) => s.creator_id === cid);
    if (stats.length === 0) return null;
    return stats.reduce((l, s) => (s.synced_at > l ? s.synced_at : l), stats[0].synced_at);
  };

  const totalRevenue = creators.reduce((s, c) => s + revenueFor(c.id), 0);
  const totalSubs = creators.reduce((s, c) => s + subsFor(c.id), 0);
  const withOF = creators.filter((c) => c.of_username).length;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <SiOnlyfans className="h-6 w-6" style={{ color: "#00AFF0" }} />
            <h1 className="text-3xl font-bold tracking-tight">OnlyFans</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Creator accounts, content performance, and Infloww revenue.
          </p>
        </div>
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Manage creators →
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Users className="h-4 w-4 text-primary" /> Creators with OF
          </div>
          <div className="text-2xl font-bold">{withOF}</div>
          <div className="text-xs text-muted-foreground mt-1">of {creators.length} total</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4 text-primary" /> Infloww revenue
          </div>
          <div className="text-2xl font-bold">
            ${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-muted-foreground mt-1">all-time, assigned links only</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Users className="h-4 w-4 text-primary" /> Total subscribers
          </div>
          <div className="text-2xl font-bold">{totalSubs.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">from Infloww tracking links</div>
        </div>
      </div>

      {/* Creators grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-card/60 border border-border" />
          ))}
        </div>
      ) : creators.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">No creators yet.</p>
          <Link to="/" className="mt-3 inline-block text-sm text-primary hover:underline">
            Add a creator →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((c) => {
            const revenue = revenueFor(c.id);
            const subs = subsFor(c.id);
            const content = contentCountFor(c.id);
            const lastSync = lastSyncFor(c.id);
            return (
              <Link
                key={c.id}
                to="/creators/$creatorId"
                params={{ creatorId: c.id }}
                className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:bg-secondary/20 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} className="h-10 w-10 rounded-full object-cover border border-border" alt={c.name} />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-primary-glow/30 border border-border flex items-center justify-center text-sm font-semibold">
                        {c.name[0]}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-sm group-hover:text-primary transition-colors">{c.name}</div>
                      {c.of_username ? (
                        <div className="text-xs text-muted-foreground">@{c.of_username}</div>
                      ) : (
                        <div className="text-xs text-muted-foreground/50 italic">No OF username</div>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium uppercase tracking-wide rounded-full px-2 py-0.5 border ${
                    c.status === "active"
                      ? "bg-success/15 text-success border-success/30"
                      : c.status === "paused"
                      ? "bg-warning/15 text-warning border-warning/30"
                      : "bg-muted text-muted-foreground border-border"
                  }`}>
                    {c.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-secondary/40 px-2 py-2">
                    <div className="text-xs text-muted-foreground">Revenue</div>
                    <div className="text-sm font-bold mt-0.5">
                      {revenue > 0
                        ? `$${revenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-secondary/40 px-2 py-2">
                    <div className="text-xs text-muted-foreground">Subs</div>
                    <div className="text-sm font-bold mt-0.5">{subs > 0 ? subs.toLocaleString() : "—"}</div>
                  </div>
                  <div className="rounded-lg bg-secondary/40 px-2 py-2">
                    <div className="text-xs text-muted-foreground">Content</div>
                    <div className="text-sm font-bold mt-0.5">{content > 0 ? content : "—"}</div>
                  </div>
                </div>

                {lastSync && (
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <RefreshCw className="h-3 w-3" />
                    Synced {format(new Date(lastSync), "MMM d, yyyy")}
                  </div>
                )}
                {!lastSync && c.of_username && (
                  <div className="mt-3 text-[10px] text-muted-foreground/50 italic">
                    Not synced — go to creator page to sync Infloww
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
