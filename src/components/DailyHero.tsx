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
  CheckCircle2, Clock, ChevronRight, Info,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Cell, PieChart, Pie,
} from "recharts";
import {
  format, parseISO, subDays, startOfDay, endOfDay, startOfMonth,
  endOfMonth, isSameDay, eachDayOfInterval, differenceInCalendarDays,
} from "date-fns";
import { getCached, setCached, getCachedAge, TTL_2H } from "@/lib/cache";

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

// ── Snapshot types persisted to localStorage ───────────────────────
// Versioned in the cache key (`daily-main:v1`) so future shape changes
// invalidate cleanly — readers that don't recognize the schema return
// null and the page does a fresh fetch instead of crashing on the
// stale shape.
type DailyMainSnapshot = {
  revenueRows: RevenueRow[];
  creators: Creator[];
  pausedCampaigns: CampaignRow[];
  expiringDocs: DocumentRow[];
  staleLeads: LeadRow[];
  unpaidPayouts: PayoutRow[];
  monthGoal: RevenueGoalRow | null;
  todayClicks: number;
  todaySubs: number;
  yesterdayClicks: number;
  yesterdaySubs: number;
  subs7d: { date: string; count: number }[];
  adSpend14d: { date: string; spend: number }[];
  staffSpend14d: { date: string; amount: number }[];
  opsSpend14d: { date: string; amount: number }[];
};
type DailyOfSnapshot = {
  ofDaily14: Record<string, number>;
  ofToday: number;
  ofYesterday: number;
};
// Bumped to v2 when the subs/clicks math switched from cumulative-sum
// to per-link delta. Old cache entries had the cumulative numbers which
// don't make sense as a "today" KPI — bumping invalidates them so
// users see the corrected math on next load.
const CACHE_MAIN = "daily-main:v2";
const CACHE_OF = "daily-of:v1";

export function DailyHero() {
  // ── Cache hydration on first render ────────────────────────────────
  // We read the snapshot SYNCHRONOUSLY before the first paint so the
  // dashboard appears instantly with the last-known numbers — no
  // skeleton flash, no spinner. The fetch effects below decide whether
  // to revalidate (cache fresh = skip; cache stale = re-fetch in the
  // background, which then writes the new snapshot).
  const cachedMain = getCached<DailyMainSnapshot>(CACHE_MAIN, Infinity);
  const cachedOf = getCached<DailyOfSnapshot>(CACHE_OF, Infinity);

  // Source data (raw) — initial values come from the cache when present.
  const [revenueRows, setRevenueRows] = useState<RevenueRow[]>(cachedMain?.revenueRows ?? []);
  const [creators, setCreators] = useState<Creator[]>(cachedMain?.creators ?? []);
  const [pausedCampaigns, setPausedCampaigns] = useState<CampaignRow[]>(cachedMain?.pausedCampaigns ?? []);
  const [expiringDocs, setExpiringDocs] = useState<DocumentRow[]>(cachedMain?.expiringDocs ?? []);
  const [staleLeads, setStaleLeads] = useState<LeadRow[]>(cachedMain?.staleLeads ?? []);
  const [unpaidPayouts, setUnpaidPayouts] = useState<PayoutRow[]>(cachedMain?.unpaidPayouts ?? []);
  const [monthGoal, setMonthGoal] = useState<RevenueGoalRow | null>(cachedMain?.monthGoal ?? null);
  const [todayClicks, setTodayClicks] = useState<number>(cachedMain?.todayClicks ?? 0);
  const [todaySubs, setTodaySubs] = useState<number>(cachedMain?.todaySubs ?? 0);
  const [yesterdayClicks, setYesterdayClicks] = useState<number>(cachedMain?.yesterdayClicks ?? 0);
  const [yesterdaySubs, setYesterdaySubs] = useState<number>(cachedMain?.yesterdaySubs ?? 0);
  // 7-day subscriber count, bucketed by snapshot_date — feeds the
  // "Total Subscriber" weekly bar chart (Nexus pattern).
  const [subs7d, setSubs7d] = useState<{ date: string; count: number }[]>(cachedMain?.subs7d ?? []);
  const [adSpend14d, setAdSpend14d] = useState<{ date: string; spend: number }[]>(cachedMain?.adSpend14d ?? []);
  // Same 14-day series for staff payouts + agency operating expenses,
  // bucketed by their natural date columns (staff_payouts.period_end,
  // agency_expenses.expense_date). Used so "Net profit today" matches
  // the formula on the Financials page instead of only deducting ad spend.
  const [staffSpend14d, setStaffSpend14d] = useState<{ date: string; amount: number }[]>(cachedMain?.staffSpend14d ?? []);
  const [opsSpend14d, setOpsSpend14d] = useState<{ date: string; amount: number }[]>(cachedMain?.opsSpend14d ?? []);
  // Loading is `false` whenever we have ANY cached data — the user
  // sees real numbers immediately and a tiny "syncing…" indicator
  // appears only while a background revalidation is in flight.
  const [loading, setLoading] = useState(!cachedMain);
  const [refreshKey, setRefreshKey] = useState(0);
  // The "synced X ago" pill in the header reads this. Updated after
  // every successful fetch.
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    const age = getCachedAge(CACHE_MAIN);
    return age == null ? null : Date.now() - age;
  });

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
    // TTL gate: skip the fetch when the cache is < 2h old and the
    // user hasn't manually clicked Refresh. Manual refresh increments
    // refreshKey so we always re-fetch on click.
    if (refreshKey === 0) {
      const age = getCachedAge(CACHE_MAIN);
      if (age !== null && age < TTL_2H) {
        // We already hydrated from cache in the useState initializers
        // — nothing to do. Keep loading = false (already is).
        setLoading(false);
        return;
      }
    }
    let cancelled = false;
    (async () => {
      // Only show the loading skeleton when there's NO cached data.
      // If we have a stale cache, the page shows the old numbers
      // while we refresh in the background — much smoother than
      // wiping back to a spinner.
      if (!cachedMain) setLoading(true);
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
        // Pull a full 8 days of link snapshots — used for the "new subs
        // today" KPI deltas AND the "Total Subscriber" weekly bar chart.
        // We need 8 days (not 7) because each day's "new subs" is
        // computed as today's cumulative count minus yesterday's, so the
        // first chart day needs a previous-day baseline.
        //
        // We also pull `creator_id` + `campaign_code` so we can group by
        // link — each link's subscribers_count is cumulative lifetime,
        // so the only correct way to get "new subs today" is per-link
        // deltas summed across links.
        supabase.from("daily_link_snapshots")
          .select("creator_id, campaign_code, clicks_count, subscribers_count, snapshot_date")
          .gte("snapshot_date", format(subDays(today, 7), "yyyy-MM-dd")),
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

      // Daily link snapshots → "new subs / new clicks per day".
      //
      // Each (creator_id, campaign_code) row stores CUMULATIVE lifetime
      // counts (that's what OnlyFansAPI's /tracking-links returns). So
      // summing today's rows would tell us "lifetime subs across all
      // tracked links", which is what was glitching the dashboard —
      // the number barely moved day-to-day.
      //
      // The fix: bucket snapshots by (creator, campaign), then for each
      // link compute today_total − yesterday_total. Sum those deltas
      // across links to get the real "new today" number. Same for
      // clicks. Negative deltas (rare — OF cumulative is gross, not
      // net) are clamped to 0 so churn on one link doesn't fake-drag
      // gains on another. Brand-new links default to a yesterday
      // baseline of 0 — every sub on day 1 counts as new.
      type Snap = {
        creator_id: string;
        campaign_code: number;
        clicks_count: number;
        subscribers_count: number;
        snapshot_date: string;
      };
      const snaps = (dailySnaps ?? []) as Snap[];

      // linkKey → date → { clicks, subs }
      const byLink = new Map<string, Map<string, { c: number; s: number }>>();
      for (const r of snaps) {
        const key = `${r.creator_id}:${r.campaign_code}`;
        const day = byLink.get(key) ?? new Map();
        day.set(r.snapshot_date, {
          c: Number(r.clicks_count || 0),
          s: Number(r.subscribers_count || 0),
        });
        byLink.set(key, day);
      }

      // Sum per-link deltas across the 7-day window we want to chart.
      // Always emit a row for every day so the chart x-axis is stable
      // (otherwise sparse days would compress the bars).
      const days = eachDayOfInterval({ start: subDays(today, 6), end: today })
        .map((d) => format(d, "yyyy-MM-dd"));
      const newSubsByDay = new Map<string, number>();
      const newClicksByDay = new Map<string, number>();
      for (const d of days) {
        newSubsByDay.set(d, 0);
        newClicksByDay.set(d, 0);
      }
      for (const [, day] of byLink) {
        for (const d of days) {
          const cur = day.get(d);
          if (!cur) continue;            // no snapshot for that day, no delta
          const yKey = format(subDays(parseISO(d), 1), "yyyy-MM-dd");
          const prev = day.get(yKey);
          // First-ever snapshot for this link → use 0 baseline; any other
          // missing yesterday treats today's count as fully new.
          const baseS = prev?.s ?? 0;
          const baseC = prev?.c ?? 0;
          const dS = Math.max(0, cur.s - baseS);
          const dC = Math.max(0, cur.c - baseC);
          newSubsByDay.set(d, (newSubsByDay.get(d) ?? 0) + dS);
          newClicksByDay.set(d, (newClicksByDay.get(d) ?? 0) + dC);
        }
      }

      const tc = newClicksByDay.get(todayStr) ?? 0;
      const ts = newSubsByDay.get(todayStr) ?? 0;
      const yc = newClicksByDay.get(yesterdayStr) ?? 0;
      const ys = newSubsByDay.get(yesterdayStr) ?? 0;
      setTodayClicks(tc); setTodaySubs(ts);
      setYesterdayClicks(yc); setYesterdaySubs(ys);

      // 7-day series for the "Total Subscriber" weekly bar chart — now
      // counts NEW subs each day instead of cumulative totals, which
      // matches the chart's intent (visualize the spike days).
      const subsSeries = days.map((d) => ({
        date: d,
        count: newSubsByDay.get(d) ?? 0,
      }));
      setSubs7d(subsSeries);

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

      // ── Persist to localStorage cache ────────────────────────────
      // Snapshot every state we just set so the next page load can
      // hydrate from disk and skip this whole batch (until the 2h
      // TTL expires or the user clicks Refresh).
      const snapshot: DailyMainSnapshot = {
        revenueRows: allRev,
        creators: (cs ?? []) as Creator[],
        pausedCampaigns: (paused ?? []) as CampaignRow[],
        expiringDocs: (docs ?? []) as DocumentRow[],
        staleLeads: stale,
        unpaidPayouts: (payouts ?? []) as PayoutRow[],
        monthGoal: totalGoal,
        todayClicks: tc,
        todaySubs: ts,
        yesterdayClicks: yc,
        yesterdaySubs: ys,
        subs7d: subsSeries,
        adSpend14d: adsSeries,
        staffSpend14d: staffSeries,
        opsSpend14d: opsSeries,
      };
      setCached(CACHE_MAIN, snapshot);
      setLastSyncedAt(Date.now());

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey, cachedMain]);

  // ── Derived: revenue rollups + sparklines + movers ────────────────────

  const creatorsById = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);

  // OF state declared FIRST so the `dailyRevenue` useMemo below can
  // reference it in its deps array. Moving these declarations after
  // the useMemo would trigger a TDZ error ("cannot access uninitialized
  // variable") because deps are evaluated immediately.
  const [ofToday, setOfToday] = useState<number>(cachedOf?.ofToday ?? 0);
  const [ofYesterday, setOfYesterday] = useState<number>(cachedOf?.ofYesterday ?? 0);
  // Daily OF earnings series for the last 14 days, used to enrich the
  // revenue chart so it shows actual money flowing through OnlyFans
  // each day (was empty before because the chart only summed manual
  // entry tables). Keyed by date string `yyyy-MM-dd`.
  const [ofDaily14, setOfDaily14] = useState<Record<string, number>>(cachedOf?.ofDaily14 ?? {});

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
    // Same TTL gate as the main fetch — the OF earnings call is the
    // expensive one (14 sequential API calls = ~2s) so caching this
    // is what actually makes the dashboard "instant". Bypassed when
    // the user hits Refresh.
    if (refreshKey === 0) {
      const age = getCachedAge(CACHE_OF);
      if (age !== null && age < TTL_2H) return;
    }
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
        setCached<DailyOfSnapshot>(CACHE_OF, {
          ofDaily14: dayBuckets,
          ofToday: dayBuckets[todayStr] ?? 0,
          ofYesterday: dayBuckets[yesterdayStr] ?? 0,
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr, yesterdayStr, today, refreshKey]);
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

  // ── Top performers + sales distribution ───────────────────────────────
  // Both feed the bottom row of the dashboard (Nexus pattern: donut chart
  // beside a leaderboard table). Window: today's revenue per creator. If
  // today is too early to have data we silently fall back to "yesterday"
  // so the cards stay populated.
  const performerWindow = useMemo(() => {
    const todayCount = revenueRows.filter((r) => r.entry_date === todayStr).length;
    return todayCount > 0 ? "today" : "yesterday";
  }, [revenueRows, todayStr]);

  const topPerformers = useMemo(() => {
    const targetDate = performerWindow === "today" ? todayStr : yesterdayStr;
    const byCreator = new Map<string, number>();
    for (const r of revenueRows) {
      if (r.entry_date === targetDate) {
        byCreator.set(r.creator_id, (byCreator.get(r.creator_id) ?? 0) + Number(r.amount || 0));
      }
    }
    return Array.from(byCreator.entries())
      .map(([creator_id, amount]) => ({
        creator_id,
        name: creatorsById.get(creator_id)?.name ?? "Unknown",
        amount,
      }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [revenueRows, creatorsById, performerWindow, todayStr, yesterdayStr]);

  // Sales distribution donut: top 4 creators by today's (or yesterday's
  // if today is empty) revenue + an aggregated "Others" slice. Same data
  // window as topPerformers so the two cards always agree.
  const salesDistribution = useMemo(() => {
    const targetDate = performerWindow === "today" ? todayStr : yesterdayStr;
    const byCreator = new Map<string, number>();
    for (const r of revenueRows) {
      if (r.entry_date === targetDate) {
        byCreator.set(r.creator_id, (byCreator.get(r.creator_id) ?? 0) + Number(r.amount || 0));
      }
    }
    const sorted = Array.from(byCreator.entries())
      .map(([id, amount]) => ({ id, amount, name: creatorsById.get(id)?.name ?? "Unknown" }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const top = sorted.slice(0, 4);
    const others = sorted.slice(4).reduce((s, r) => s + r.amount, 0);
    const slices = others > 0
      ? [...top, { id: "others", amount: others, name: "Others" }]
      : top;
    const total = slices.reduce((s, r) => s + r.amount, 0);
    return { slices, total };
  }, [revenueRows, creatorsById, performerWindow, todayStr, yesterdayStr]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <section className="space-y-5">
      {/* Header — Nexus pattern: title left, subtitle, action chips right */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Good {timeOfDay()}, <span className="capitalize">{userName}</span>
          </h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{format(today, "EEEE, MMMM d, yyyy")}</span>
            <span className="text-muted-foreground/40">·</span>
            {/* Sync-state pill: shows when we last fetched + how soon
                the cache will auto-revalidate. Loading dot pulses while
                a background refresh is in flight. */}
            <span className="inline-flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
              {loading
                ? "Syncing…"
                : lastSyncedAt
                  ? `Synced ${formatRelativeAge(Date.now() - lastSyncedAt)} ago`
                  : "Live data"}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="rounded-full border-border bg-card hover:bg-secondary"
          title="Force-refresh now (otherwise auto-updates every 2 hours)"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Syncing…" : "Refresh"}
        </Button>
      </div>

      {/* Top KPI row — Nexus pattern: exactly three wide tiles.
          Revenue (gross today), Net Revenue (after expenses), Expenses. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HeroTile
          tone="emerald"
          icon={<Wallet className="h-4 w-4" />}
          label="Revenue"
          value={formatMoney(todayTotalRevenue)}
          delta={pctChange(todayTotalRevenue, yesterdayTotalRevenue)}
          deltaSubtitle={ofToday > 0 ? `today · incl. ${formatMoney(ofToday)} OF` : "today vs yesterday"}
          sparkline={dailyRevenue.map((d) => ({ x: d.date, y: d.amount }))}
          loading={loading}
        />
        <HeroTile
          tone={todayNetProfit >= 0 ? "violet" : "rose"}
          icon={<TrendingUp className="h-4 w-4" />}
          label="Net Revenue"
          value={formatMoney(todayNetProfit)}
          delta={pctChange(todayNetProfit, yesterdayNetProfit)}
          deltaSubtitle={
            // Compact breakdown of today's costs so users can see what
            // makes up the deduction. Ads always shown; staff + ops
            // only appear when non-zero (most days they're $0).
            [
              `ads ${formatMoney(todayAdSpend)}`,
              ...(todayStaff > 0 ? [`staff ${formatMoney(todayStaff)}`] : []),
              ...(todayOps > 0 ? [`ops ${formatMoney(todayOps)}`] : []),
            ].join(" · ")
          }
          sparkline={dailyRevenue.map((d) => {
            const ad = adSpend14d.find((a) => a.date === d.date)?.spend ?? 0;
            const sf = staffSpend14d.find((a) => a.date === d.date)?.amount ?? 0;
            const op = opsSpend14d.find((a) => a.date === d.date)?.amount ?? 0;
            return { x: d.date, y: d.amount - ad - sf - op };
          })}
          loading={loading}
        />
        <HeroTile
          tone="amber"
          icon={<Receipt className="h-4 w-4" />}
          label="Expenses"
          value={formatMoney(todayTotalExpenses)}
          delta={pctChange(todayTotalExpenses, yesterdayTotalExpenses)}
          deltaSubtitle="today · ads + staff + ops"
          sparkline={dailyRevenue.map((d) => {
            const ad = adSpend14d.find((a) => a.date === d.date)?.spend ?? 0;
            const sf = staffSpend14d.find((a) => a.date === d.date)?.amount ?? 0;
            const op = opsSpend14d.find((a) => a.date === d.date)?.amount ?? 0;
            return { x: d.date, y: ad + sf + op };
          })}
          loading={loading}
        />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-7 w-7 rounded-lg bg-amber-500/12 text-amber-600 flex items-center justify-center">
              <AlertCircle className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold">Today's wins & watchouts</h3>
            <span className="ml-1 text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {alerts.length}
            </span>
          </div>
          <div className="space-y-2">
            {alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
          </div>
        </section>
      )}
      {alerts.length === 0 && !loading && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
          <span className="h-9 w-9 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="text-sm">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">All clear today.</span>{" "}
            <span className="text-muted-foreground">No paused campaigns, no stale leads, no unpaid payouts, no dormant creators.</span>
          </div>
        </section>
      )}

      {/* Sales Overview (wide) + Total Subscriber (right column).
          Mirrors the Nexus dashboard's main analytics row. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="h-7 w-7 rounded-lg bg-violet-500/15 text-violet-600 flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Sales Overview</h3>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Last 14 days · 7-day avg <span className="font-medium text-foreground">{formatMoney(sevenDayAvgRevenue)}</span>
                </div>
              </div>
            </div>
            {dailyRevenue.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums leading-none">
                    {formatMoney(dailyRevenue.reduce((s, d) => s + d.amount, 0))}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">14-day total</div>
                </div>
                <DeltaBadge delta={pctChange(todayTotalRevenue, sevenDayAvgRevenue)} />
              </div>
            )}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyRevenue} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="dailyHeroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity={0.10} />
                  </linearGradient>
                  <linearGradient id="dailyHeroToday" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity={1} />
                    <stop offset="100%" stopColor="rgb(139 92 246)" stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => format(parseISO(v as string), "MMM d")}
                  axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} width={40} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 11, boxShadow: "0 8px 24px -8px rgba(0,0,0,0.10)" }}
                  labelFormatter={(v) => format(parseISO(v as string), "EEEE, MMM d")}
                  formatter={(v: number) => [formatMoney(v), "Revenue"]}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {dailyRevenue.map((d) => (
                    <Cell key={d.date} fill={d.date === todayStr ? "url(#dailyHeroToday)" : "url(#dailyHeroGrad)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Total Subscriber — Nexus's "weekly bar chart" pattern.
            Highlights today's bar with a violet→indigo gradient,
            other days fade into the muted background. */}
        <section className="rounded-2xl border border-border bg-card p-5 space-y-3 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="h-7 w-7 rounded-lg bg-cyan-500/15 text-cyan-600 flex items-center justify-center">
                <ArrowUpRight className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-semibold">Total Subscriber</h3>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              Weekly
            </span>
          </div>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="text-3xl font-bold tabular-nums leading-none">
              {subs7d.reduce((s, d) => s + d.count, 0).toLocaleString()}
            </span>
            <DeltaBadge delta={pctChange(todaySubs, yesterdaySubs)} />
          </div>
          <div className="text-[11px] text-muted-foreground">
            +{todaySubs.toLocaleString()} new today · last 7 days
          </div>
          <div className="h-44 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subs7d} margin={{ top: 16, right: 0, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="subsToday" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity={1} />
                    <stop offset="100%" stopColor="rgb(139 92 246)" stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => format(parseISO(v as string), "EEE")}
                  axisLine={false} tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 11, boxShadow: "0 8px 24px -8px rgba(0,0,0,0.10)" }}
                  labelFormatter={(v) => format(parseISO(v as string), "EEEE, MMM d")}
                  formatter={(v: number) => [v.toLocaleString(), "Subscribers"]}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={26}>
                  {subs7d.map((d) => (
                    <Cell key={d.date} fill={d.date === todayStr ? "url(#subsToday)" : "var(--muted)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Bottom row: Sales Distribution donut + Top Performers list.
          Direct port of Nexus's "Sales Distribution" + "List of Integration"
          row, retargeted to OFM data (per-creator revenue split). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SalesDistributionCard
          slices={salesDistribution.slices}
          total={salesDistribution.total}
          windowLabel={performerWindow === "today" ? "Today" : "Yesterday"}
        />
        <TopPerformersCard
          rows={topPerformers}
          windowLabel={performerWindow === "today" ? "Today" : "Yesterday"}
        />
      </div>

      {/* Top movers */}
      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="h-7 w-7 rounded-lg bg-primary/12 text-primary flex items-center justify-center">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Top movers</h3>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Today vs each creator's 7-day average.
            </div>
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
              <div className="text-[10px] uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
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
              <div className="text-[10px] uppercase tracking-[0.14em] text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                <ArrowDownRight className="h-3 w-3" /> Trending down
              </div>
              {movers.downs.length === 0 ? (
                <div className="text-xs text-emerald-600/80 dark:text-emerald-400/80 italic">No downturns — clean day so far.</div>
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

// Tone palette maps each tile to a soft icon-chip color. Tiles themselves
// stay pure white (Nexus aesthetic) — the tone is just for the icon chip
// so the user gets a faint hint of category without busy gradient backdrops.
const TILE_TONES: Record<string, { chipBg: string; chipFg: string; sparkRgb: string }> = {
  emerald: { chipBg: "bg-emerald-500/12",  chipFg: "text-emerald-600",  sparkRgb: "16 185 129" },
  violet:  { chipBg: "bg-violet-500/12",   chipFg: "text-violet-600",   sparkRgb: "139 92 246" },
  cyan:    { chipBg: "bg-cyan-500/12",     chipFg: "text-cyan-600",     sparkRgb: "8 145 178" },
  amber:   { chipBg: "bg-amber-500/15",    chipFg: "text-amber-600",    sparkRgb: "245 158 11" },
  rose:    { chipBg: "bg-rose-500/12",     chipFg: "text-rose-600",     sparkRgb: "244 63 94" },
};

/** Clean white KPI tile — Nexus dashboard pattern.
 *  Icon chip + label on one line, info (i) right; big number; pill % delta;
 *  optional inline sparkline at the bottom. Hovering lifts a soft shadow. */
function HeroTile({
  tone, icon, label, value, delta, deltaSubtitle, sparkline, loading,
}: {
  tone: keyof typeof TILE_TONES;
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: number | null;
  deltaSubtitle: string;
  sparkline: { x: string; y: number }[];
  sparkColor?: string;          // unused now; kept in API to avoid breaking callers
  loading: boolean;
}) {
  const t = TILE_TONES[tone];
  return (
    <div className="group relative rounded-2xl border border-border bg-card p-5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.10)]">
      {/* Top row: icon chip + label, info hint right */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${t.chipBg} ${t.chipFg}`}>
            {icon}
          </span>
          <span className="text-sm font-medium text-foreground/90 truncate">{label}</span>
        </div>
        <Info className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
      </div>

      {/* Number + delta pill on the same baseline */}
      <div className="mt-4 flex items-end gap-2.5 flex-wrap">
        <span className="text-3xl font-bold tabular-nums leading-none">
          {loading ? <span className="inline-block h-7 w-24 rounded bg-muted animate-pulse" /> : value}
        </span>
        <DeltaBadge delta={delta} />
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground truncate">{deltaSubtitle}</div>

      {/* Sparkline — sits at the bottom, low contrast */}
      {sparkline.length > 0 && (
        <div className="mt-3 -mx-2 h-10 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`rgb(${t.sparkRgb})`} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={`rgb(${t.sparkRgb})`} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="y"
                stroke={`rgb(${t.sparkRgb})`}
                strokeWidth={1.75}
                fill={`url(#spark-${tone})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Pastel pill for percentage change — Nexus pattern: bg tint + diagonal
 *  arrow + percent, no leading sign (the arrow conveys direction). */
function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground inline-flex items-center gap-1 font-semibold">
        <Minus className="h-2.5 w-2.5" /> —
      </span>
    );
  }
  const positive = delta > 0;
  const negative = delta < 0;
  const cls = positive
    ? "bg-emerald-500/12 text-emerald-600"
    : negative
      ? "bg-rose-500/12 text-rose-600"
      : "bg-muted text-muted-foreground";
  const Arrow = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;
  return (
    <span className={`text-[10px] px-2 py-1 rounded-full font-semibold inline-flex items-center gap-0.5 tabular-nums ${cls}`}>
      {Math.abs(delta).toFixed(1)}%
      <Arrow className="h-2.5 w-2.5" />
    </span>
  );
}

function AlertRow({ alert: a }: { alert: Alert }) {
  const tone = a.level === "danger"
    ? "border-rose-500/25 bg-rose-500/5 text-rose-600 dark:text-rose-400"
    : a.level === "warn"
    ? "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400"
    : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div className={`flex items-center gap-3 rounded-xl border ${tone} px-3 py-2.5 transition-colors hover:bg-secondary/40`}>
      <div className="shrink-0">{a.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{a.label}</div>
        {a.detail && <div className="text-[11px] text-muted-foreground truncate">{a.detail}</div>}
      </div>
      {a.cta && (
        <a href={a.cta.href} className="text-[11px] font-semibold hover:underline inline-flex items-center gap-0.5 shrink-0">
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
      className={`flex items-center gap-3 rounded-xl border p-3 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-sm ${
        positive
          ? "border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10"
          : "border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10"
      }`}
    >
      <div className={`h-9 w-9 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 ${
        positive
          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
          : "bg-rose-500/20 text-rose-700 dark:text-rose-400"
      }`}>
        {mover.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{mover.name}</div>
        <div className="text-[10px] text-muted-foreground">
          today {formatMoney(mover.today)} · avg {formatMoney(mover.avg)}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-bold tabular-nums ${
          positive ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
        }`}>
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

/** Donut + legend matching Nexus's "Sales Distribution" card.
 *  Top 4 creators + "Others" bucket; center label shows the total. */
const DONUT_PALETTE = [
  "rgb(99 102 241)",   // indigo-500
  "rgb(139 92 246)",   // violet-500
  "rgb(20 184 166)",   // teal-500
  "rgb(56 189 248)",   // sky-400
  "rgb(244 114 182)",  // pink-400 (others)
];

function SalesDistributionCard({
  slices, total, windowLabel,
}: {
  slices: { id: string; name: string; amount: number }[];
  total: number;
  windowLabel: string;
}) {
  // Recharts gives every slice the same gap by default; we want a thin
  // divider so the donut reads as a clean ring on a white card.
  const data = slices.map((s, i) => ({ ...s, color: DONUT_PALETTE[i % DONUT_PALETTE.length] }));
  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="h-7 w-7 rounded-lg bg-violet-500/15 text-violet-600 flex items-center justify-center">
            <Wallet className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold">Sales Distribution</h3>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {windowLabel}
        </span>
      </div>

      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-12 text-center border border-dashed border-border rounded-xl">
          No revenue logged for {windowLabel.toLowerCase()} yet.
        </div>
      ) : (
        <div className="flex items-center gap-5 flex-wrap">
          {/* Donut */}
          <div className="relative h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={84}
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={3}
                >
                  {data.map((s) => (
                    <Cell key={s.id} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 11, boxShadow: "0 8px 24px -8px rgba(0,0,0,0.10)" }}
                  formatter={(v: number, name: string) => [formatMoney(v), name]}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
              <div className="text-lg font-bold tabular-nums">{formatMoney(total)}</div>
            </div>
          </div>

          {/* Legend list */}
          <div className="flex-1 min-w-0 space-y-2">
            {data.map((s) => {
              const pct = total > 0 ? (s.amount / total) * 100 : 0;
              return (
                <div key={s.id} className="flex items-center gap-3 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="flex-1 truncate font-medium">{s.name}</span>
                  <span className="font-semibold tabular-nums">{formatMoney(s.amount)}</span>
                  <span className="w-10 text-right text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** Leaderboard table — Nexus's "List of Integration" recast as the agency
 *  top performers. Each row gets an avatar bubble + a thin progress bar
 *  to make the relative scale obvious without reading the numbers. */
function TopPerformersCard({
  rows, windowLabel,
}: {
  rows: { creator_id: string; name: string; amount: number }[];
  windowLabel: string;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.amount), 0);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="h-7 w-7 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold">Top Performers</h3>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {windowLabel}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-12 text-center border border-dashed border-border rounded-xl">
          No earners {windowLabel.toLowerCase()} yet.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column header */}
          <div className="grid grid-cols-[auto_1fr_minmax(120px,160px)_auto] items-center gap-3 px-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">
            <span className="w-9" />
            <span>Creator</span>
            <span>Share</span>
            <span className="text-right">Revenue</span>
          </div>
          {rows.map((r, i) => {
            const pct = max > 0 ? (r.amount / max) * 100 : 0;
            return (
              <a
                key={r.creator_id}
                href={`/creators/${r.creator_id}`}
                className="grid grid-cols-[auto_1fr_minmax(120px,160px)_auto] items-center gap-3 rounded-xl border border-border bg-background/50 p-3 transition-all hover:-translate-y-0.5 hover:bg-secondary/40 hover:shadow-sm"
              >
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white flex items-center justify-center font-semibold text-xs shadow-sm">
                  {r.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{r.name}</div>
                  <div className="text-[10px] text-muted-foreground">#{i + 1} · top earner</div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-sm font-bold tabular-nums text-right">
                  {formatMoney(r.amount)}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
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

/** Compact "30s" / "5m" / "2h" / "1d" formatter for the cached-age
 *  pill. Avoids the heavier date-fns formatDistance dependency for
 *  this one tiny use case. */
function formatRelativeAge(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}
