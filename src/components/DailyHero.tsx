// Daily command-center hero section.
//
// Sits at the top of /daily as a "what happened today, what needs my
// attention" panel above the existing link-tracking grid. Rolls every
// money-flow source into a single view:
//
//   • Greeting with the admin's first name + the date
//   • 4 hero tiles (Revenue / Net profit / Subs / Clicks) with vs-
//     yesterday deltas and inline 14-day sparkline trends
//   • 14-day revenue area chart with today highlighted
//   • Today's wins & watchouts — auto-derived alert feed (paused
//     campaigns, dormant creators, stale leads, expiring documents,
//     unpaid payouts)
//   • Top movers — three creators trending up + three trending down vs
//     their 7-day average
//   • Monthly revenue goal progress
//
// All queries hit Supabase only (no live API calls), keep the dashboard
// snappy. Refresh button at the top re-fetches everything.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle, Pause,
  Receipt, FileWarning, MessageCircle as ChatIcon, Wallet,
  ArrowUpRight, ArrowDownRight, Sparkles, Calendar, Target,
  CheckCircle2, Clock, ChevronRight,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import {
  format, parseISO, subDays, startOfDay, endOfDay, startOfMonth,
  endOfMonth, isSameDay, eachDayOfInterval, differenceInCalendarDays,
} from "date-fns";

// ── Types we map Supabase rows into ─────────────────────────────────────

type RevenueRow = { creator_id: string; amount: number; entry_date: string };
type Creator = { id: string; name: string; status: string };
type CampaignRow = { meta_campaign_id: string; name: string | null; status: string | null; daily_budget_cents: number | null };
type DocumentRow = { id: string; creator_id: string; name: string; expires_at: string | null };
type LeadRow = { id: string; name: string; status: string; created_at: string };
type LeadActivity = { lead_id: string; occurred_at: string };
type PayoutRow = { id: string; creator_id: string; net_to_creator: number; status: string; period_end: string };
type RevenueGoalRow = { target_amount: number; period_start: string; period_end: string; channel: string };

// Computed alert
type Alert = {
  id: string;
  level: "warn" | "info" | "danger";
  icon: React.ReactNode;
  label: string;
  detail: string;
  cta?: { label: string; href: string };
};

// ── Public API ───────────────────────────────────────────────────────────

export function DailyHero() {
  // Source data (raw)
  const [revenueRows, setRevenueRows] = useState<RevenueRow[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [pausedCampaigns, setPausedCampaigns] = useState<CampaignRow[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<DocumentRow[]>([]);
  const [staleLeads, setStaleLeads] = useState<LeadRow[]>([]);
  const [unpaidPayouts, setUnpaidPayouts] = useState<PayoutRow[]>([]);
  const [monthGoal, setMonthGoal] = useState<RevenueGoalRow | null>(null);
  const [todayClicks, setTodayClicks] = useState<number>(0);
  const [todaySubs, setTodaySubs] = useState<number>(0);
  const [yesterdayClicks, setYesterdayClicks] = useState<number>(0);
  const [yesterdaySubs, setYesterdaySubs] = useState<number>(0);
  const [adSpend14d, setAdSpend14d] = useState<{ date: string; spend: number }[]>([]);
  // Same 14-day series for staff payouts + agency operating expenses,
  // bucketed by their natural date columns (staff_payouts.period_end,
  // agency_expenses.expense_date). Used so "Net profit today" matches
  // the formula on the Financials page instead of only deducting ad spend.
  const [staffSpend14d, setStaffSpend14d] = useState<{ date: string; amount: number }[]>([]);
  const [opsSpend14d, setOpsSpend14d] = useState<{ date: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Greeting name from the localStorage session (same source as Bernard)
  const userName = useMemo(() => {
    if (typeof window === "undefined") return "there";
    try {
      const raw = localStorage.getItem("agency_session");
      if (!raw) return "there";
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.username) return String(parsed.username);
      } catch {
        if (raw) return raw;
      }
    } catch {
      /* ignore */
    }
    return "there";
  }, []);

  const today = startOfDay(new Date());
  const todayStr = format(today, "yyyy-MM-dd");
  const yesterdayStr = format(subDays(today, 1), "yyyy-MM-dd");
  const fourteenDaysAgoStr = format(subDays(today, 13), "yyyy-MM-dd");
  const sevenDaysAgoStr = format(subDays(today, 7), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Fan out all of the dashboard queries in parallel so the panel
      // appears as one cohesive load rather than waterfalling.
      const [
        { data: organic },
        { data: internal },
        { data: cs },
        { data: paused },
        { data: docs },
        { data: leads },
        { data: lActs },
        { data: payouts },
        { data: goals },
        { data: dailySnaps },
        { data: adsDaily },
        { data: staffDaily },
        { data: opsDaily },
      ] = await Promise.all([
        supabase.from("organic_entries").select("creator_id, amount, entry_date").gte("entry_date", fourteenDaysAgoStr),
        supabase.from("internal_entries").select("creator_id, amount, entry_date").gte("entry_date", fourteenDaysAgoStr),
        supabase.from("creators").select("id, name, status"),
        supabase.from("meta_campaigns_catalog").select("meta_campaign_id, name, status, daily_budget_cents").eq("status", "PAUSED").is("deleted_at", null).limit(20),
        supabase.from("creator_documents").select("id, creator_id, name, expires_at").not("expires_at", "is", null).gte("expires_at", todayStr).lte("expires_at", format(subDays(today, -30), "yyyy-MM-dd")).limit(20),
        supabase.from("creator_leads").select("id, name, status, created_at").not("status", "in", "(signed,lost)").limit(50),
        supabase.from("lead_activities").select("lead_id, occurred_at"),
        supabase.from("creator_payouts").select("id, creator_id, net_to_creator, status, period_end").neq("status", "paid").limit(20),
        supabase.from("revenue_goals").select("target_amount, period_start, period_end, channel").lte("period_start", monthEnd).gte("period_end", monthStart).limit(5),
        supabase.from("daily_link_snapshots").select("clicks_count, subscribers_count, snapshot_date").gte("snapshot_date", yesterdayStr),
        supabase.from("meta_insights_daily").select("date_start, spend").eq("level", "account").eq("breakdown_key", "").gte("date_start", fourteenDaysAgoStr),
        // Staff payouts + agency operating expenses, last 14 days. Used
        // so the "Net profit today" tile matches the formula on /financials
        // (revenue − ad spend − staff − ops) instead of only deducting ads.
        supabase.from("staff_payouts").select("amount, period_end").gte("period_end", fourteenDaysAgoStr),
        supabase.from("agency_expenses").select("amount, expense_date").gte("expense_date", fourteenDaysAgoStr),
      ]);
      if (cancelled) return;

      const allRev: RevenueRow[] = [];
      for (const r of (organic ?? []) as RevenueRow[]) allRev.push(r);
      for (const r of (internal ?? []) as RevenueRow[]) allRev.push(r);
      setRevenueRows(allRev);
      setCreators((cs ?? []) as Creator[]);
      setPausedCampaigns((paused ?? []) as CampaignRow[]);
      setExpiringDocs((docs ?? []) as DocumentRow[]);

      // Stale leads = no activity in 7+ days. Derive from lead_activities.
      const lastByLead = new Map<string, string>();
      for (const a of (lActs ?? []) as LeadActivity[]) {
        const cur = lastByLead.get(a.lead_id);
        if (!cur || a.occurred_at > cur) lastByLead.set(a.lead_id, a.occurred_at);
      }
      const stale = ((leads ?? []) as LeadRow[]).filter((l) => {
        const last = lastByLead.get(l.id) ?? l.created_at;
        return differenceInCalendarDays(today, parseISO(last)) >= 7;
      });
      setStaleLeads(stale);

      setUnpaidPayouts((payouts ?? []) as PayoutRow[]);
      // Pick the broadest goal (channel = total) covering the current month
      const monthGoals = (goals ?? []) as RevenueGoalRow[];
      const totalGoal = monthGoals.find((g) => g.channel === "total") ?? monthGoals[0] ?? null;
      setMonthGoal(totalGoal);

      // Daily link snapshots — today + yesterday
      type Snap = { clicks_count: number; subscribers_count: number; snapshot_date: string };
      const snaps = (dailySnaps ?? []) as Snap[];
      let tc = 0, ts = 0, yc = 0, ys = 0;
      for (const s of snaps) {
        if (s.snapshot_date === todayStr) {
          tc += Number(s.clicks_count || 0);
          ts += Number(s.subscribers_count || 0);
        } else if (s.snapshot_date === yesterdayStr) {
          yc += Number(s.clicks_count || 0);
          ys += Number(s.subscribers_count || 0);
        }
      }
      setTodayClicks(tc); setTodaySubs(ts);
      setYesterdayClicks(yc); setYesterdaySubs(ys);

      // Ad spend (14-day series) for the cost line
      type AdsRow = { date_start: string; spend: number };
      const adsByDay = new Map<string, number>();
      for (const r of (adsDaily ?? []) as AdsRow[]) {
        adsByDay.set(r.date_start, (adsByDay.get(r.date_start) ?? 0) + Number(r.spend || 0));
      }
      const adsSeries = eachDayOfInterval({ start: subDays(today, 13), end: today })
        .map((d) => ({ date: format(d, "yyyy-MM-dd"), spend: adsByDay.get(format(d, "yyyy-MM-dd")) ?? 0 }));
      setAdSpend14d(adsSeries);

      // Staff payouts (14-day series) bucketed by period_end. Most days
      // will be $0 with one big spike on payroll day — that's accurate.
      type DayAmount = { date: string; amount: number };
      const staffByDay = new Map<string, number>();
      for (const r of (staffDaily ?? []) as Array<{ period_end: string; amount: number }>) {
        staffByDay.set(r.period_end, (staffByDay.get(r.period_end) ?? 0) + Number(r.amount || 0));
      }
      const staffSeries: DayAmount[] = eachDayOfInterval({ start: subDays(today, 13), end: today })
        .map((d) => ({ date: format(d, "yyyy-MM-dd"), amount: staffByDay.get(format(d, "yyyy-MM-dd")) ?? 0 }));
      setStaffSpend14d(staffSeries);

      // Agency operating expenses (14-day series) bucketed by expense_date.
      const opsByDay = new Map<string, number>();
      for (const r of (opsDaily ?? []) as Array<{ expense_date: string; amount: number }>) {
        opsByDay.set(r.expense_date, (opsByDay.get(r.expense_date) ?? 0) + Number(r.amount || 0));
      }
      const opsSeries: DayAmount[] = eachDayOfInterval({ start: subDays(today, 13), end: today })
        .map((d) => ({ date: format(d, "yyyy-MM-dd"), amount: opsByDay.get(format(d, "yyyy-MM-dd")) ?? 0 }));
      setOpsSpend14d(opsSeries);

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // ── Derived: revenue rollups + sparklines + movers ────────────────────

  const creatorsById = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);

  // OF state declared FIRST so the `dailyRevenue` useMemo below can
  // reference it in its deps array. Moving these declarations after
  // the useMemo would trigger a TDZ error ("cannot access uninitialized
  // variable") because deps are evaluated immediately.
  const [ofToday, setOfToday] = useState(0);
  const [ofYesterday, setOfYesterday] = useState(0);
  // Daily OF earnings series for the last 14 days, used to enrich the
  // revenue chart so it shows actual money flowing through OnlyFans
  // each day (was empty before because the chart only summed manual
  // entry tables). Keyed by date string `yyyy-MM-dd`.
  const [ofDaily14, setOfDaily14] = useState<Record<string, number>>({});

  // Revenue per day (last 14)
  const dailyRevenue = useMemo(() => {
    const days = eachDayOfInterval({ start: subDays(today, 13), end: today });
    const map = new Map<string, number>();
    for (const d of days) map.set(format(d, "yyyy-MM-dd"), 0);
    // Manual entries (Reddit / IG / FB / X / TikTok organic + internal)
    for (const r of revenueRows) {
      if (map.has(r.entry_date)) {
        map.set(r.entry_date, (map.get(r.entry_date) ?? 0) + Number(r.amount || 0));
      }
    }
    // Live OnlyFans daily series — one entry per day from the
    // analytics endpoint. Ensures the chart actually shows OF revenue
    // instead of leaving every bar empty when admins haven't typed in
    // any manual entries.
    for (const [date, amount] of Object.entries(ofDaily14)) {
      if (map.has(date)) {
        map.set(date, (map.get(date) ?? 0) + amount);
      }
    }
    return [...map.entries()].map(([date, amount]) => ({ date, amount }));
  }, [revenueRows, today, ofDaily14]);

  const todayRevenue = dailyRevenue.find((d) => d.date === todayStr)?.amount ?? 0;
  const yesterdayRevenue = dailyRevenue.find((d) => d.date === yesterdayStr)?.amount ?? 0;

  // ── Live OnlyFans Direct earnings (today + yesterday) ─────────────
  // Hits /api/analytics/summary/earnings with a 1-day window for each.
  // OnlyFans data lags by ~1 hour for live numbers, so today's value
  // may be small until late afternoon. The state is hoisted above
  // dailyRevenue (see top of this component) — the effect that
  // populates it lives below for readability.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Pull every OF page (multi-account + legacy fallback)
      const [{ data: multi }, { data: legacy }] = await Promise.all([
        supabase.from("creator_of_accounts")
          .select("onlyfansapi_acct_id")
          .not("onlyfansapi_acct_id", "is", null),
        supabase.from("creators")
          .select("onlyfansapi_acct_id")
          .not("onlyfansapi_acct_id", "is", null),
      ]);
      const idSet = new Set<string>();
      for (const row of (multi ?? []) as Array<{ onlyfansapi_acct_id: string | null }>) {
        if (row.onlyfansapi_acct_id) idSet.add(row.onlyfansapi_acct_id);
      }
      for (const row of (legacy ?? []) as Array<{ onlyfansapi_acct_id: string | null }>) {
        if (row.onlyfansapi_acct_id) idSet.add(row.onlyfansapi_acct_id);
      }
      const ids = [...idSet];
      if (cancelled || ids.length === 0) return;

      // Per-day calls to /analytics/summary/earnings give us the daily
      // breakdown we need for the chart. We make ONE call per day with
      // ALL account_ids in the body — that's 14 sequential calls total
      // (vs 14 × N if we per-creator'd it), well within rate limits and
      // takes ~1.5s end-to-end.
      const key = (import.meta.env.VITE_ONLYFANSAPI_KEY as string | undefined) ?? "";
      if (!key) return;
      const dayBuckets: Record<string, number> = {};
      const days = eachDayOfInterval({ start: subDays(today, 13), end: today });
      for (const d of days) {
        const dateStr = format(d, "yyyy-MM-dd");
        try {
          const r = await fetch("https://app.onlyfansapi.com/api/analytics/summary/earnings", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              account_ids: ids,
              start_date: dateStr,
              end_date: dateStr,
            }),
          });
          if (r.ok) {
            const j = await r.json();
            const u = (j?.data ?? j) as Record<string, unknown>;
            const total = Number(u.totalEarnings ?? u.total_earnings ?? u.total ?? 0);
            dayBuckets[dateStr] = total;
          } else {
            dayBuckets[dateStr] = 0;
          }
        } catch {
          dayBuckets[dateStr] = 0;
        }
        // Tiny breather between calls. Cumulatively ~150ms × 13 = ~2s
        // of latency for the chart, which is fine — it loads in the
        // background while the rest of the hero is already on screen.
        await new Promise((res) => setTimeout(res, 150));
        if (cancelled) return;
      }
      if (!cancelled) {
        setOfDaily14(dayBuckets);
        setOfToday(dayBuckets[todayStr] ?? 0);
        setOfYesterday(dayBuckets[yesterdayStr] ?? 0);
      }
    })();
    return () => { cancelled = true; };
  }, [todayStr, yesterdayStr, today]);
  const sevenDayAvgRevenue = useMemo(() => {
    const last7 = dailyRevenue.filter((d) => d.date >= sevenDaysAgoStr && d.date < todayStr);
    if (last7.length === 0) return 0;
    return last7.reduce((s, d) => s + d.amount, 0) / last7.length;
  }, [dailyRevenue, todayStr, sevenDaysAgoStr]);

  // Today's net profit. Now uses the same formula as the Financials
  // page rollup so the numbers reconcile across pages:
  //   profit = (organic + internal + OF direct)
  //          − (ad spend + staff payouts + agency ops)
  //
  // Staff and ops are bucketed by their natural date columns
  // (period_end / expense_date). Most days they'll be $0 with one
  // big spike on payroll/invoice day — that's accurate, not a bug.
  // The tile's tooltip shows the breakdown so admins can read why a
  // particular day is high or low.
  const todayAdSpend = adSpend14d.find((d) => d.date === todayStr)?.spend ?? 0;
  const yesterdayAdSpend = adSpend14d.find((d) => d.date === yesterdayStr)?.spend ?? 0;
  const todayStaff = staffSpend14d.find((d) => d.date === todayStr)?.amount ?? 0;
  const yesterdayStaff = staffSpend14d.find((d) => d.date === yesterdayStr)?.amount ?? 0;
  const todayOps = opsSpend14d.find((d) => d.date === todayStr)?.amount ?? 0;
  const yesterdayOps = opsSpend14d.find((d) => d.date === yesterdayStr)?.amount ?? 0;
  // todayRevenue already includes OF earnings (ofDaily14 is folded
  // into dailyRevenue above), so DON'T add ofToday again — that would
  // double-count. The separate `ofToday` state is still used by the
  // dedicated "OnlyFans today" tile to show the OF portion only.
  const todayTotalRevenue = todayRevenue;
  const yesterdayTotalRevenue = yesterdayRevenue;
  const todayTotalExpenses = todayAdSpend + todayStaff + todayOps;
  const yesterdayTotalExpenses = yesterdayAdSpend + yesterdayStaff + yesterdayOps;
  const todayNetProfit = todayTotalRevenue - todayTotalExpenses;
  const yesterdayNetProfit = yesterdayTotalRevenue - yesterdayTotalExpenses;

  // Per-creator today vs 7-day avg → top movers
  const movers = useMemo(() => {
    const todayByCreator = new Map<string, number>();
    const last7ByCreator = new Map<string, number[]>();
    for (const r of revenueRows) {
      if (r.entry_date === todayStr) {
        todayByCreator.set(r.creator_id, (todayByCreator.get(r.creator_id) ?? 0) + Number(r.amount || 0));
      } else if (r.entry_date >= sevenDaysAgoStr && r.entry_date < todayStr) {
        const arr = last7ByCreator.get(r.creator_id) ?? [];
        arr.push(Number(r.amount || 0));
        last7ByCreator.set(r.creator_id, arr);
      }
    }
    const out: { id: string; name: string; today: number; avg: number; delta: number; deltaPct: number | null }[] = [];
    const allIds = new Set<string>([...todayByCreator.keys(), ...last7ByCreator.keys()]);
    for (const id of allIds) {
      const todayVal = todayByCreator.get(id) ?? 0;
      const arr = last7ByCreator.get(id) ?? [];
      const avg = arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / 7 : 0;
      const delta = todayVal - avg;
      const pct = avg > 0 ? (delta / avg) * 100 : null;
      out.push({
        id,
        name: creatorsById.get(id)?.name ?? "Unknown",
        today: todayVal,
        avg,
        delta,
        deltaPct: pct,
      });
    }
    // Only consider creators with non-trivial activity to avoid noise
    const meaningful = out.filter((m) => m.today > 0 || m.avg > 5);
    const ups = [...meaningful].sort((a, b) => b.delta - a.delta).slice(0, 3);
    const downs = [...meaningful].sort((a, b) => a.delta - b.delta).filter((m) => m.delta < 0).slice(0, 3);
    return { ups, downs };
  }, [revenueRows, creatorsById, todayStr, sevenDaysAgoStr]);

  // Auto-generated alerts
  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];

    // Paused Meta campaigns (not 0 budget — those are intentional)
    if (pausedCampaigns.length > 0) {
      out.push({
        id: "paused-campaigns",
        level: "info",
        icon: <Pause className="h-4 w-4" />,
        label: `${pausedCampaigns.length} Meta campaign${pausedCampaigns.length === 1 ? "" : "s"} paused`,
        detail: pausedCampaigns.slice(0, 3).map((c) => c.name ?? c.meta_campaign_id).join(" · "),
        cta: { label: "Review", href: "/ads" },
      });
    }

    // Documents expiring in next 30 days
    if (expiringDocs.length > 0) {
      const next = expiringDocs.slice(0, 3).map((d) => d.name).join(" · ");
      out.push({
        id: "expiring-docs",
        level: "warn",
        icon: <FileWarning className="h-4 w-4" />,
        label: `${expiringDocs.length} document${expiringDocs.length === 1 ? "" : "s"} expiring soon`,
        detail: next,
        cta: { label: "View", href: "/" },
      });
    }

    // Stale leads
    if (staleLeads.length > 0) {
      out.push({
        id: "stale-leads",
        level: "info",
        icon: <ChatIcon className="h-4 w-4" />,
        label: `${staleLeads.length} stale lead${staleLeads.length === 1 ? "" : "s"} (7+ days no activity)`,
        detail: staleLeads.slice(0, 3).map((l) => l.name).join(" · "),
        cta: { label: "Reach out", href: "/leads" },
      });
    }

    // Unpaid payouts
    if (unpaidPayouts.length > 0) {
      const owed = unpaidPayouts.reduce((s, p) => s + Number(p.net_to_creator || 0), 0);
      out.push({
        id: "unpaid-payouts",
        level: "warn",
        icon: <Wallet className="h-4 w-4" />,
        label: `${unpaidPayouts.length} payout${unpaidPayouts.length === 1 ? "" : "s"} pending`,
        detail: `${formatMoney(owed)} owed across ${unpaidPayouts.length} creator${unpaidPayouts.length === 1 ? "" : "s"}`,
        cta: { label: "Resolve", href: "/financials" },
      });
    }

    // Dormant creators — active in roster but no revenue in 7d
    const last7Set = new Set(revenueRows.filter((r) => r.entry_date >= sevenDaysAgoStr).map((r) => r.creator_id));
    const dormant = creators.filter((c) => c.status === "active" && !last7Set.has(c.id));
    if (dormant.length > 0) {
      out.push({
        id: "dormant-creators",
        level: "danger",
        icon: <AlertCircle className="h-4 w-4" />,
        label: `${dormant.length} active creator${dormant.length === 1 ? "" : "s"} dormant 7+ days`,
        detail: dormant.slice(0, 3).map((c) => c.name).join(" · "),
        cta: { label: "Triage", href: "/" },
      });
    }

    return out;
  }, [pausedCampaigns, expiringDocs, staleLeads, unpaidPayouts, revenueRows, creators, sevenDaysAgoStr]);

  // Monthly revenue goal progress
  const monthlyRevenue = useMemo(() => {
    return revenueRows
      .filter((r) => r.entry_date >= monthStart && r.entry_date <= monthEnd)
      .reduce((s, r) => s + Number(r.amount || 0), 0);
  }, [revenueRows, monthStart, monthEnd]);

  const goalAmount = monthGoal ? Number(monthGoal.target_amount) : 0;
  const goalPct = goalAmount > 0 ? Math.min(100, (monthlyRevenue / goalAmount) * 100) : 0;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <section className="space-y-6">
      {/* Greeting + refresh */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
            <Calendar className="h-3 w-3" />
            <span>{format(today, "EEEE, MMMM d, yyyy")}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>Live data</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            Good {timeOfDay()}, <span className="capitalize">{userName}</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Here's where the agency stands today.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* Helper: when today is $0 (OF data lag — typical for the first
          few hours of the day), fall back to the most recent day in
          the 14-day window that has data. Returns the value to display,
          the date it represents, and whether we're showing today or
          a fallback. Used by the OnlyFans / Today's revenue / Net
          profit tiles so admins see meaningful numbers instead of $0. */}
      {(() => null)() /* IIFE-style separator — comments only */}
      {/* (The real helpers are inlined below per-tile to keep the
          render block self-contained. dailyRevenue is already merged
          across manual entries + OF, so we walk it back to find the
          most recent non-zero day.) */}

      {/* Hero KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* OnlyFans tile — falls back to the most recent day with OF
            earnings if today is still $0 (data lag). */}
        {(() => {
          // Walk dailyRevenue from the end (today) backwards looking for
          // the most recent day where ofDaily14 had a value. Falls back
          // to today when nothing else exists.
          const ofRecent = (() => {
            for (let i = dailyRevenue.length - 1; i >= 0; i--) {
              const d = dailyRevenue[i].date;
              const v = ofDaily14[d] ?? 0;
              if (v > 0) return { date: d, amount: v, isToday: d === todayStr };
            }
            return { date: todayStr, amount: 0, isToday: true };
          })();
          const subtitle = ofRecent.isToday
            ? "vs yesterday"
            : `as of ${ofRecent.date.slice(5)} · today still updating`;
          return (
            <HeroTile
              tone="cyan"
              icon={<Wallet className="h-4 w-4" />}
              label={ofRecent.isToday ? "OnlyFans today" : "OnlyFans (latest)"}
              value={formatMoney(ofRecent.amount)}
              delta={ofRecent.isToday ? pctChange(ofToday, ofYesterday) : null}
              deltaSubtitle={subtitle}
              sparkline={[]}
              sparkColor="rgb(56,189,248)"
              loading={loading}
            />
          );
        })()}
        {(() => {
          // Same fall-back rule for the combined revenue tile.
          const recent = (() => {
            for (let i = dailyRevenue.length - 1; i >= 0; i--) {
              const r = dailyRevenue[i];
              if (r.amount > 0) return { ...r, isToday: r.date === todayStr };
            }
            return { date: todayStr, amount: 0, isToday: true };
          })();
          return (
            <HeroTile
              tone="emerald"
              icon={<Wallet className="h-4 w-4" />}
              label={recent.isToday ? "Today's revenue" : "Latest revenue"}
              value={formatMoney(recent.amount)}
              delta={recent.isToday ? pctChange(todayTotalRevenue, yesterdayTotalRevenue) : null}
              deltaSubtitle={
                recent.isToday
                  ? (ofToday > 0 ? `incl. ${formatMoney(ofToday)} OF` : "vs yesterday")
                  : `as of ${recent.date.slice(5)} · today still updating`
              }
              sparkline={dailyRevenue.map((d) => ({ x: d.date, y: d.amount }))}
              sparkColor="rgb(52,211,153)"
              loading={loading}
            />
          );
        })()}
        {(() => {
          // Net profit follows the revenue fallback: pick the same
          // recent day so all three tiles tell a coherent story.
          const recent = (() => {
            for (let i = dailyRevenue.length - 1; i >= 0; i--) {
              const r = dailyRevenue[i];
              const ad = adSpend14d.find((a) => a.date === r.date)?.spend ?? 0;
              const sf = staffSpend14d.find((a) => a.date === r.date)?.amount ?? 0;
              const op = opsSpend14d.find((a) => a.date === r.date)?.amount ?? 0;
              if (r.amount > 0) {
                return {
                  date: r.date,
                  profit: r.amount - ad - sf - op,
                  ad, sf, op,
                  isToday: r.date === todayStr,
                };
              }
            }
            return {
              date: todayStr, profit: 0,
              ad: todayAdSpend, sf: todayStaff, op: todayOps,
              isToday: true,
            };
          })();
          const breakdown = [
            `ads ${formatMoney(recent.ad)}`,
            ...(recent.sf > 0 ? [`staff ${formatMoney(recent.sf)}`] : []),
            ...(recent.op > 0 ? [`ops ${formatMoney(recent.op)}`] : []),
          ].join(" · ");
          return (
            <HeroTile
              tone={recent.profit >= 0 ? "violet" : "rose"}
              icon={<TrendingUp className="h-4 w-4" />}
              label={recent.isToday ? "Net profit today" : "Net profit (latest)"}
              value={formatMoney(recent.profit)}
              delta={recent.isToday ? pctChange(todayNetProfit, yesterdayNetProfit) : null}
              deltaSubtitle={recent.isToday ? breakdown : `as of ${recent.date.slice(5)} · ${breakdown}`}
              sparkline={dailyRevenue.map((d) => {
                const ad = adSpend14d.find((a) => a.date === d.date)?.spend ?? 0;
                const sf = staffSpend14d.find((a) => a.date === d.date)?.amount ?? 0;
                const op = opsSpend14d.find((a) => a.date === d.date)?.amount ?? 0;
                return { x: d.date, y: d.amount - ad - sf - op };
              })}
              sparkColor="rgb(167,139,250)"
              loading={loading}
            />
          );
        })()}
        <HeroTile
          tone="cyan"
          icon={<ArrowUpRight className="h-4 w-4" />}
          label="Subscribers today"
          value={String(todaySubs)}
          delta={pctChange(todaySubs, yesterdaySubs)}
          deltaSubtitle="vs yesterday"
          sparkline={[]}
          sparkColor="rgb(56,189,248)"
          loading={loading}
        />
        <HeroTile
          tone="amber"
          icon={<Sparkles className="h-4 w-4" />}
          label="Clicks today"
          value={String(todayClicks)}
          delta={pctChange(todayClicks, yesterdayClicks)}
          deltaSubtitle="vs yesterday"
          sparkline={[]}
          sparkColor="rgb(251,191,36)"
          loading={loading}
        />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Today's wins & watchouts</h3>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide ml-1">
              {alerts.length} item{alerts.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-2">
            {alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
          </div>
        </section>
      )}
      {alerts.length === 0 && !loading && (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-emerald-400">All clear today.</span>{" "}
            <span className="text-muted-foreground">No paused campaigns, no stale leads, no unpaid payouts, no dormant creators.</span>
          </div>
        </section>
      )}

      {/* 14-day revenue chart + goal progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <section className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-primary" /> Revenue — last 14 days
              </h3>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Today's bar highlighted. 7-day avg: {formatMoney(sevenDayAvgRevenue)}.
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {dailyRevenue.length > 0 && (
                <>Total: <span className="font-semibold text-foreground">{formatMoney(dailyRevenue.reduce((s, d) => s + d.amount, 0))}</span></>
              )}
            </div>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyRevenue} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="dailyHeroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(52,211,153)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="rgb(52,211,153)" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => format(parseISO(v as string), "MMM d")}
                  axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} width={40} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  labelFormatter={(v) => format(parseISO(v as string), "EEEE, MMM d")}
                  formatter={(v: number) => [formatMoney(v), "Revenue"]}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {dailyRevenue.map((d) => (
                    <Cell key={d.date} fill={d.date === todayStr ? "rgb(232,120,82)" : "url(#dailyHeroGrad)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Monthly goal progress */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4 flex flex-col">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Target className="h-4 w-4 text-primary" /> Monthly goal
            </h3>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {format(today, "MMMM yyyy")}
            </div>
          </div>
          {goalAmount > 0 ? (
            <div className="space-y-3 flex-1 flex flex-col justify-center">
              <div className="text-2xl font-bold tabular-nums">
                {formatMoney(monthlyRevenue)}
                <span className="text-sm text-muted-foreground font-normal"> / {formatMoney(goalAmount)}</span>
              </div>
              <div className="space-y-1.5">
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${goalPct >= 100 ? "bg-emerald-500" : goalPct >= 75 ? "bg-primary" : goalPct >= 50 ? "bg-amber-500" : "bg-rose-500"}`}
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className={`font-semibold ${goalPct >= 100 ? "text-emerald-400" : goalPct >= 75 ? "text-primary" : "text-muted-foreground"}`}>
                    {goalPct.toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">
                    {goalPct < 100 ? `${formatMoney(goalAmount - monthlyRevenue)} to go` : "Goal hit"}
                  </span>
                </div>
              </div>
              <PaceMeter monthlyRevenue={monthlyRevenue} goalAmount={goalAmount} today={today} monthEnd={parseISO(monthEnd)} monthStart={parseISO(monthStart)} />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic flex-1 flex items-center justify-center text-center px-4">
              Set a monthly goal in any creator's Plan tab → Goals to track progress here.
            </div>
          )}
        </section>
      </div>

      {/* Top movers */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" /> Top movers
          </h3>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Today vs each creator's 7-day average.
          </div>
        </div>
        {movers.ups.length === 0 && movers.downs.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-4 text-center border border-dashed border-border rounded-lg">
            Not enough activity today to detect movers yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Up movers */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3" /> Trending up
              </div>
              {movers.ups.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">Quiet day — nobody's spiking yet.</div>
              ) : (
                movers.ups.map((m) => <MoverRow key={m.id} mover={m} direction="up" />)
              )}
            </div>
            {/* Down movers */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold flex items-center gap-1">
                <ArrowDownRight className="h-3 w-3" /> Trending down
              </div>
              {movers.downs.length === 0 ? (
                <div className="text-xs text-emerald-400/80 italic">No downturns — clean day so far.</div>
              ) : (
                movers.downs.map((m) => <MoverRow key={m.id} mover={m} direction="down" />)
              )}
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

const TILE_TONES: Record<string, { ring: string; bg: string; text: string }> = {
  emerald: { ring: "border-emerald-500/20", bg: "from-emerald-500/10 to-emerald-500/0", text: "text-emerald-400" },
  violet:  { ring: "border-violet-500/20",  bg: "from-violet-500/10 to-violet-500/0",   text: "text-violet-400" },
  cyan:    { ring: "border-cyan-500/20",    bg: "from-cyan-500/10 to-cyan-500/0",       text: "text-cyan-400" },
  amber:   { ring: "border-amber-500/20",   bg: "from-amber-500/10 to-amber-500/0",     text: "text-amber-400" },
  rose:    { ring: "border-rose-500/20",    bg: "from-rose-500/10 to-rose-500/0",       text: "text-rose-400" },
};

function HeroTile({
  tone, icon, label, value, delta, deltaSubtitle, sparkline, sparkColor, loading,
}: {
  tone: keyof typeof TILE_TONES;
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: number | null;
  deltaSubtitle: string;
  sparkline: { x: string; y: number }[];
  sparkColor: string;
  loading: boolean;
}) {
  const t = TILE_TONES[tone];
  return (
    <div className={`relative rounded-xl border ${t.ring} bg-gradient-to-br ${t.bg} p-4 overflow-hidden`}>
      <div className="flex items-center justify-between">
        <div className={`h-8 w-8 rounded-lg bg-secondary flex items-center justify-center ${t.text}`}>{icon}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</div>
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums">
        {loading ? <span className="inline-block h-7 w-24 rounded bg-secondary/50 animate-pulse" /> : value}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <DeltaBadge delta={delta} />
        <span className="text-[10px] text-muted-foreground truncate">{deltaSubtitle}</span>
      </div>
      {/* Inline sparkline — runs along the bottom of the tile */}
      {sparkline.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-10 opacity-60 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Area type="monotone" dataKey="y" stroke={sparkColor} strokeWidth={1.5} fill={sparkColor} fillOpacity={0.18} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground inline-flex items-center gap-0.5">
        <Minus className="h-2.5 w-2.5" /> —
      </span>
    );
  }
  const positive = delta > 0;
  const negative = delta < 0;
  const cls = positive ? "bg-emerald-500/15 text-emerald-400"
    : negative ? "bg-rose-500/15 text-rose-400"
    : "bg-secondary text-muted-foreground";
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Minus;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-0.5 ${cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {positive && "+"}
      {delta.toFixed(1)}%
    </span>
  );
}

function AlertRow({ alert: a }: { alert: Alert }) {
  const tone = a.level === "danger"
    ? "border-rose-500/20 bg-rose-500/5 text-rose-400"
    : a.level === "warn"
    ? "border-amber-500/20 bg-amber-500/5 text-amber-400"
    : "border-border bg-secondary/30 text-muted-foreground";
  return (
    <div className={`flex items-center gap-3 rounded-lg border ${tone} px-3 py-2.5`}>
      <div className="shrink-0">{a.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{a.label}</div>
        {a.detail && <div className="text-[11px] text-muted-foreground truncate">{a.detail}</div>}
      </div>
      {a.cta && (
        <a href={a.cta.href} className="text-[11px] font-medium hover:underline inline-flex items-center gap-0.5 shrink-0">
          {a.cta.label} <ChevronRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function MoverRow({ mover, direction }: { mover: { id: string; name: string; today: number; avg: number; deltaPct: number | null; delta: number }; direction: "up" | "down" }) {
  const positive = direction === "up";
  return (
    <a
      href={`/creators/${mover.id}`}
      className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-secondary/30 ${positive ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"}`}
    >
      <div className={`h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs ${positive ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
        {mover.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{mover.name}</div>
        <div className="text-[10px] text-muted-foreground">
          today {formatMoney(mover.today)} · avg {formatMoney(mover.avg)}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-bold tabular-nums ${positive ? "text-emerald-400" : "text-rose-400"}`}>
          {positive ? "+" : ""}{formatMoney(mover.delta)}
        </div>
        {mover.deltaPct !== null && (
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {mover.deltaPct > 0 ? "+" : ""}{mover.deltaPct.toFixed(0)}%
          </div>
        )}
      </div>
    </a>
  );
}

function PaceMeter({
  monthlyRevenue, goalAmount, today, monthEnd, monthStart,
}: {
  monthlyRevenue: number;
  goalAmount: number;
  today: Date;
  monthEnd: Date;
  monthStart: Date;
}) {
  const totalDays = differenceInCalendarDays(monthEnd, monthStart) + 1;
  const elapsed = Math.max(1, differenceInCalendarDays(today, monthStart) + 1);
  const expectedToDate = (goalAmount / totalDays) * elapsed;
  const onPace = monthlyRevenue >= expectedToDate;
  const diff = monthlyRevenue - expectedToDate;
  return (
    <div className={`text-[11px] mt-1 inline-flex items-center gap-1 ${onPace ? "text-emerald-400" : "text-amber-400"}`}>
      <Clock className="h-3 w-3" />
      <span>
        {onPace ? "On pace" : "Behind pace"} ·{" "}
        <span className="text-muted-foreground">
          {onPace ? `+${formatMoney(diff)}` : `${formatMoney(diff)}`} vs day-{elapsed} target
        </span>
      </span>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0 && curr === 0) return 0;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 5) return "evening";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
