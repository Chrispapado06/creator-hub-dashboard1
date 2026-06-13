// "Needs attention" feed for the top of the daily dashboard.
//
// Turns the dashboard from a scoreboard into a to-do list: it sweeps the data
// the agency already collects (shifts, heartbeats, time-off, tasks, pipelines,
// social accounts, subreddit catalog) and surfaces only the things that need a
// decision today — sorted by severity, each linking to where you'd act.
//
// Every check is defensive: a table that doesn't exist yet (feature not
// migrated) simply contributes nothing, never an error.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle, Clock, ShieldAlert, CalendarOff, ListTodo, Workflow,
  Radar, ChevronRight, CheckCircle2, Loader2,
} from "lucide-react";

const sb = supabase as unknown as { from: (t: string) => any };

type Sev = "high" | "med" | "low";
type Item = { id: string; sev: Sev; icon: React.ReactNode; title: string; detail?: string; to?: string };

const SEV_RANK: Record<Sev, number> = { high: 0, med: 1, low: 2 };
const SEV_DOT: Record<Sev, string> = {
  high: "bg-destructive",
  med: "bg-amber-500",
  low: "bg-muted-foreground/40",
};

const hoursBetween = (a: number, b: number) => (a - b) / 3_600_000;

async function safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try { return await fn(); } catch { return []; }
}

export function AttentionFeed() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = Date.now();
      const todayStr = new Date(now).toISOString().slice(0, 10);
      const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();

      // Names for shift items.
      const chattersP = safe(async () => {
        const { data } = await sb.from("chatters").select("id, name");
        return (data ?? []) as { id: string; name: string }[];
      });

      const results = await Promise.all([
        chattersP,
        // 1) Active shifts over the agency cap.
        safe(async () => {
          const { data: settings } = await sb.from("agency_settings").select("default_max_shift_hours").maybeSingle();
          const cap = Number(settings?.default_max_shift_hours) || 8;
          const { data } = await sb.from("shifts").select("id, chatter_id, start_at").is("end_at", null);
          return ((data ?? []) as { id: string; chatter_id: string; start_at: string }[])
            .map((s) => ({ ...s, h: hoursBetween(now, new Date(s.start_at).getTime()) }))
            .filter((s) => s.h > cap)
            .map((s) => ({ ...s, cap }));
        }),
        // 2) Recently-closed shifts with low verified hours (<60%).
        safe(async () => {
          const { data } = await sb.from("shifts")
            .select("id, chatter_id, start_at, end_at, heartbeat_minutes, last_heartbeat_at")
            .gte("start_at", sevenDaysAgo).not("end_at", "is", null);
          return ((data ?? []) as any[])
            .map((s) => {
              const loggedMin = (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 60_000;
              const hb = Number(s.heartbeat_minutes) || 0;
              const hasSignal = s.last_heartbeat_at != null || hb > 0;
              const pct = loggedMin > 0 ? Math.min(hb, loggedMin) / loggedMin * 100 : 100;
              return { id: s.id, chatter_id: s.chatter_id, loggedH: loggedMin / 60, pct, hasSignal, loggedMin };
            })
            .filter((s) => s.hasSignal && s.loggedMin >= 45 && s.pct < 60);
        }),
        // 3) Pending time-off requests.
        safe(async () => {
          const { data } = await sb.from("time_off_requests").select("id").eq("status", "pending");
          return (data ?? []) as { id: string }[];
        }),
        // 4) Overdue open one-off tasks.
        safe(async () => {
          const { data } = await sb.from("standalone_tasks").select("id").eq("status", "open").lt("due_date", todayStr);
          return (data ?? []) as { id: string }[];
        }),
        // 5) Pipeline steps stuck active >2 days.
        safe(async () => {
          const { data } = await sb.from("task_pipeline_steps")
            .select("id, step_name, updated_at, task_pipelines(title, status)")
            .eq("status", "active");
          return ((data ?? []) as any[])
            .filter((s) => s.task_pipelines?.status === "active" && hoursBetween(now, new Date(s.updated_at).getTime()) > 48)
            .map((s) => ({ id: s.id, title: s.task_pipelines?.title ?? "Pipeline", step: s.step_name, days: Math.floor(hoursBetween(now, new Date(s.updated_at).getTime()) / 24) }));
        }),
        // 6) Flagged social accounts (banned / shadowbanned) across platforms.
        safe(async () => {
          const tables = ["reddit_accounts", "instagram_accounts", "facebook_accounts", "tiktok_accounts"];
          let total = 0;
          await Promise.all(tables.map(async (t) => {
            const { data } = await sb.from(t).select("id, status").in("status", ["banned", "shadowbanned"]);
            total += (data ?? []).length;
          }));
          return total > 0 ? [{ id: "flagged", count: total }] : [];
        }),
        // 7) Stale subreddits (catalog).
        safe(async () => {
          const { data } = await sb.from("subreddit_catalog").select("id, last_verified").eq("active", true);
          const cut = now - 45 * 86_400_000;
          const stale = ((data ?? []) as { last_verified: string | null }[])
            .filter((s) => !s.last_verified || new Date(s.last_verified).getTime() <= cut).length;
          return stale > 0 ? [{ id: "stale", count: stale }] : [];
        }),
      ]);

      const [chatters, overCap, lowVerified, timeOff, overdue, stuck, flagged, stale] = results as any[];
      const nameOf = (id: string) => (chatters as any[]).find((c) => c.id === id)?.name ?? "Someone";

      const out: Item[] = [];

      for (const s of overCap) {
        out.push({ id: `cap-${s.id}`, sev: "high", icon: <Clock className="h-4 w-4" />,
          title: `${nameOf(s.chatter_id)} is over the shift cap`,
          detail: `${s.h.toFixed(1)}h into a ${s.cap}h shift — likely forgot to clock out`, to: "/chatters" });
      }
      for (const s of lowVerified) {
        out.push({ id: `ver-${s.id}`, sev: "high", icon: <ShieldAlert className="h-4 w-4" />,
          title: `${nameOf(s.chatter_id)} — low verified hours`,
          detail: `Logged ${s.loggedH.toFixed(1)}h but only ${Math.round(s.pct)}% verified by the portal`, to: "/chatters" });
      }
      if (flagged.length) {
        out.push({ id: "flagged", sev: "high", icon: <Radar className="h-4 w-4" />,
          title: `${flagged[0].count} social account${flagged[0].count === 1 ? "" : "s"} flagged`,
          detail: "Banned or shadowbanned — pause posting and review", to: "/reddit" });
      }
      for (const p of stuck) {
        out.push({ id: `stuck-${p.id}`, sev: "med", icon: <Workflow className="h-4 w-4" />,
          title: `Pipeline stuck: ${p.title}`,
          detail: `"${p.step}" has been active ${p.days}d`, to: "/tasks" });
      }
      if (timeOff.length) {
        out.push({ id: "timeoff", sev: "med", icon: <CalendarOff className="h-4 w-4" />,
          title: `${timeOff.length} time-off request${timeOff.length === 1 ? "" : "s"} to review`,
          detail: "Awaiting approve / deny", to: "/chatters" });
      }
      if (overdue.length) {
        out.push({ id: "overdue", sev: "med", icon: <ListTodo className="h-4 w-4" />,
          title: `${overdue.length} task${overdue.length === 1 ? "" : "s"} overdue`,
          detail: "Past their due date and still open", to: "/tasks" });
      }
      if (stale.length) {
        out.push({ id: "stale", sev: "low", icon: <AlertTriangle className="h-4 w-4" />,
          title: `${stale[0].count} subreddit${stale[0].count === 1 ? "" : "s"} need re-verifying`,
          detail: "Not checked in 45+ days — rules may have changed", to: "/reddit-scorer" });
      }

      out.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
      if (!cancelled) { setItems(out); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Scanning for things that need attention…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-5 flex items-center gap-2.5">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <div>
          <div className="text-sm font-semibold">All clear</div>
          <div className="text-xs text-muted-foreground">No over-cap shifts, flagged accounts, stuck pipelines, or overdue items right now.</div>
        </div>
      </div>
    );
  }

  const highCount = items.filter((i) => i.sev === "high").length;
  const shown = expanded ? items : items.slice(0, 5);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Needs attention</h2>
            <p className="text-[11px] text-muted-foreground">
              {items.length} item{items.length === 1 ? "" : "s"}{highCount > 0 ? ` · ${highCount} urgent` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {shown.map((it) => {
          const row = (
            <div className="group flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5 transition-colors hover:bg-background">
              <span className={`h-2 w-2 shrink-0 rounded-full ${SEV_DOT[it.sev]}`} />
              <span className="shrink-0 text-muted-foreground">{it.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{it.title}</div>
                {it.detail && <div className="truncate text-[11px] text-muted-foreground">{it.detail}</div>}
              </div>
              {it.to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />}
            </div>
          );
          return it.to
            ? <Link key={it.id} to={it.to} className="block">{row}</Link>
            : <div key={it.id}>{row}</div>;
        })}
      </div>

      {items.length > 5 && (
        <button onClick={() => setExpanded((v) => !v)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
          {expanded ? "Show less" : `Show ${items.length - 5} more`}
        </button>
      )}
    </section>
  );
}
