// Per-page analytics dashboard.
//
// Lives at its own card-level entry point (the "Analytics" button on each
// landing-page card). Designed to mirror the dashboards the user wants to
// see at a glance — KPIs with period comparison, a live ticker, country
// breakdown, traffic sources, and a current-vs-previous period comparison.
//
// Data sources: `landing_views` (one row per visit, with referrer + geo)
// and `landing_clicks` (one row per outbound click).

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft, BarChart3, MousePointerClick, Globe,
  Users, Activity, MapPin, ChartPie,
  TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink, Clock,
  CalendarRange,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import {
  format, startOfDay, endOfDay, subDays, subMinutes, differenceInMinutes,
  differenceInCalendarDays,
} from "date-fns";
import type { DateRange } from "react-day-picker";

// ── ISO country code → flag emoji ────────────────────────────────────────
// 'US' → 🇺🇸. Works because flag emojis are two regional-indicator
// codepoints (127397 + ASCII letter) joined together.
const countryFlag = (cc: string | null): string => {
  if (!cc || cc.length !== 2) return "🌍";
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
};

// Range state. The current window is always a concrete (from, to) pair —
// preset pills (7d/30d/90d) just write into it. "Custom" opens a calendar
// where the user picks an arbitrary span.
type RangeKind = 7 | 30 | 90 | "custom";
type Range = { from: Date; to: Date };

const presetRange = (days: number): Range => {
  const to = endOfDay(new Date());
  const from = startOfDay(subDays(to, days - 1));
  return { from, to };
};

const rangeDays = (r: Range): number =>
  Math.max(1, differenceInCalendarDays(r.to, r.from) + 1);

// "Previous period" is the same-length window immediately before the
// current one. Used for vs-last-period deltas.
const previousRange = (current: Range): Range => {
  const days = rangeDays(current);
  const to = endOfDay(subDays(current.from, 1));
  const from = startOfDay(subDays(to, days - 1));
  return { from, to };
};

const formatRange = (r: Range): string => {
  const sameYear = r.from.getFullYear() === r.to.getFullYear();
  const fromFmt = sameYear ? "MMM d" : "MMM d, yyyy";
  return `${format(r.from, fromFmt)} – ${format(r.to, "MMM d, yyyy")}`;
};

type ViewRow = {
  occurred_at: string;
  referrer: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
};

type ClickRow = {
  occurred_at: string;
  link_url: string;
  link_label: string | null;
  referrer: string | null;
};

// ── Top-level component ──────────────────────────────────────────────────

export function LandingAnalytics({
  pageId, pageSlug, pageName, onBack,
}: {
  pageId: string;
  pageSlug: string;
  pageName: string;
  onBack: () => void;
}) {
  const [rangeKind, setRangeKind] = useState<RangeKind>(30);
  const [range, setRange] = useState<Range>(() => presetRange(30));
  const [loading, setLoading] = useState(true);

  // Custom range picker state — held separately so the user can tweak
  // both ends before applying. Empty until they open it.
  const [customDraft, setCustomDraft] = useState<DateRange | undefined>(undefined);
  const [customOpen, setCustomOpen] = useState(false);

  // Current window
  const [views, setViews] = useState<ViewRow[]>([]);
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  // Previous window (for "vs last period" deltas)
  const [prevViews, setPrevViews] = useState<ViewRow[]>([]);
  const [prevClicks, setPrevClicks] = useState<ClickRow[]>([]);

  // Real-time slice (last 30 min) — auto-refreshes every 15s
  const [liveViews, setLiveViews] = useState<ViewRow[]>([]);
  const [liveClicks, setLiveClicks] = useState<ClickRow[]>([]);
  const [livePulse, setLivePulse] = useState(0); // increments to retrigger animation

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined") return `/p/${pageSlug}`;
    return `${window.location.origin}/p/${pageSlug}`;
  }, [pageSlug]);

  const days = rangeDays(range);
  const prev = useMemo(() => previousRange(range), [range]);

  const setPreset = (k: 7 | 30 | 90) => {
    setRangeKind(k);
    setRange(presetRange(k));
  };

  const applyCustomRange = () => {
    if (!customDraft?.from) return;
    const from = startOfDay(customDraft.from);
    const to = endOfDay(customDraft.to ?? customDraft.from);
    setRange({ from, to });
    setRangeKind("custom");
    setCustomOpen(false);
  };

  const load = async () => {
    setLoading(true);
    const sinceCurrent = range.from.toISOString();
    const cutoffCurrent = range.to.toISOString();
    const sincePrevious = prev.from.toISOString();
    const cutoffPrevious = prev.to.toISOString();

    const [
      { data: vCur }, { data: cCur },
      { data: vPrev }, { data: cPrev },
    ] = await Promise.all([
      supabase.from("landing_views")
        .select("occurred_at, referrer, country, city, region")
        .eq("landing_id", pageId)
        .gte("occurred_at", sinceCurrent)
        .lte("occurred_at", cutoffCurrent),
      supabase.from("landing_clicks")
        .select("occurred_at, link_url, link_label, referrer")
        .eq("landing_id", pageId)
        .gte("occurred_at", sinceCurrent)
        .lte("occurred_at", cutoffCurrent),
      supabase.from("landing_views")
        .select("occurred_at, referrer, country, city, region")
        .eq("landing_id", pageId)
        .gte("occurred_at", sincePrevious)
        .lte("occurred_at", cutoffPrevious),
      supabase.from("landing_clicks")
        .select("occurred_at, link_url, link_label, referrer")
        .eq("landing_id", pageId)
        .gte("occurred_at", sincePrevious)
        .lte("occurred_at", cutoffPrevious),
    ]);

    setViews((vCur ?? []) as ViewRow[]);
    setClicks((cCur ?? []) as ClickRow[]);
    setPrevViews((vPrev ?? []) as ViewRow[]);
    setPrevClicks((cPrev ?? []) as ClickRow[]);
    setLoading(false);
  };

  const loadLive = async () => {
    const since = subMinutes(new Date(), 30).toISOString();
    const [{ data: lv }, { data: lc }] = await Promise.all([
      supabase.from("landing_views")
        .select("occurred_at, referrer, country, city, region")
        .eq("landing_id", pageId)
        .gte("occurred_at", since),
      supabase.from("landing_clicks")
        .select("occurred_at, link_url, link_label, referrer")
        .eq("landing_id", pageId)
        .gte("occurred_at", since),
    ]);
    setLiveViews((lv ?? []) as ViewRow[]);
    setLiveClicks((lc ?? []) as ClickRow[]);
    setLivePulse((p) => p + 1);
  };

  useEffect(() => { void load(); }, [pageId, range.from.getTime(), range.to.getTime()]);
  useEffect(() => {
    void loadLive();
    const t = setInterval(() => { void loadLive(); }, 15_000);
    return () => clearInterval(t);
  }, [pageId]);

  // ── Derived KPIs ──────────────────────────────────────────────────────

  const v = views.length, c = clicks.length, totalActivity = v + c;
  const ctr = v > 0 ? (c / v) * 100 : 0;
  const pv = prevViews.length, pc = prevClicks.length, pTotal = pv + pc;
  const pCtr = pv > 0 ? (pc / pv) * 100 : 0;

  const dViews = pctChange(v, pv);
  const dClicks = pctChange(c, pc);
  const dTotal = pctChange(totalActivity, pTotal);
  const dCtr = pctChange(ctr, pCtr);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <button
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 px-2 py-1 -ml-2 rounded hover:bg-secondary mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to landing pages
          </button>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            {pageName} — analytics
          </h3>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-0.5"
          >
            {publicUrl} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <PeriodPill active={rangeKind === 7}  onClick={() => setPreset(7)}>7d</PeriodPill>
          <PeriodPill active={rangeKind === 30} onClick={() => setPreset(30)}>30d</PeriodPill>
          <PeriodPill active={rangeKind === 90} onClick={() => setPreset(90)}>90d</PeriodPill>

          {/* Custom range — opens a calendar in range mode. The "Apply"
              button confirms; closing without applying keeps the previous
              range. */}
          <Popover open={customOpen} onOpenChange={(o) => {
            setCustomOpen(o);
            if (o) setCustomDraft({ from: range.from, to: range.to });
          }}>
            <PopoverTrigger asChild>
              <button
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors inline-flex items-center gap-1 ${
                  rangeKind === "custom"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                {rangeKind === "custom" ? formatRange(range) : "Custom"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={customDraft}
                onSelect={(r) => setCustomDraft(r)}
                numberOfMonths={2}
                disabled={(d) => d > new Date()}
                autoFocus
              />
              <div className="border-t border-border p-2 flex items-center justify-between gap-2">
                <div className="text-[11px] text-muted-foreground pl-1">
                  {customDraft?.from
                    ? customDraft.to
                      ? `${format(customDraft.from, "MMM d")} – ${format(customDraft.to, "MMM d, yyyy")}`
                      : `${format(customDraft.from, "MMM d, yyyy")} – pick end date`
                    : "Pick a start date"}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setCustomDraft(undefined)}>
                    Clear
                  </Button>
                  <Button size="sm" onClick={applyCustomRange} disabled={!customDraft?.from}>
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button size="sm" variant="outline" onClick={() => { void load(); void loadLive(); }} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          tone="violet"
          label="Profile Views"
          value={v}
          delta={dViews}
        />
        <KpiCard
          icon={<MousePointerClick className="h-4 w-4" />}
          tone="rose"
          label="Link Clicks"
          value={c}
          delta={dClicks}
        />
        <KpiCard
          icon={<Globe className="h-4 w-4" />}
          tone="cyan"
          label="Total Interactions"
          value={totalActivity}
          delta={dTotal}
        />
        <KpiCard
          icon={<Activity className="h-4 w-4" />}
          tone="emerald"
          label="Engagement Rate"
          value={`${ctr.toFixed(1)}%`}
          delta={dCtr}
        />
      </div>

      {/* Real-time activity */}
      <RealTimeBlock liveViews={liveViews} liveClicks={liveClicks} pulse={livePulse} />

      {/* Geographic */}
      <GeoBlock views={views} />

      {/* Traffic + Live sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SourcesDonut
          title="Traffic Sources"
          subtitle={formatRange(range)}
          icon={<ChartPie className="h-4 w-4 text-violet-400" />}
          views={views}
        />
        <SourcesDonut
          title="Live Sources"
          subtitle="Last 30 minutes"
          icon={<MapPin className="h-4 w-4 text-amber-400" />}
          views={liveViews}
          live
        />
      </div>

      {/* Period comparison */}
      <PeriodComparison
        days={days}
        currentRange={range}
        previousRange={prev}
        v={v} c={c} pv={pv} pc={pc}
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0 && curr === 0) return 0;
  if (prev === 0) return null; // no baseline → display "—"
  return ((curr - prev) / prev) * 100;
}

function PeriodPill({
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

// ── KPI card ─────────────────────────────────────────────────────────────

const TONE_CLASSES: Record<string, { bg: string; ring: string; text: string }> = {
  violet:  { bg: "from-violet-500/10 to-violet-500/0",  ring: "border-violet-500/20",  text: "text-violet-400"  },
  rose:    { bg: "from-rose-500/10 to-rose-500/0",      ring: "border-rose-500/20",    text: "text-rose-400"    },
  cyan:    { bg: "from-cyan-500/10 to-cyan-500/0",      ring: "border-cyan-500/20",    text: "text-cyan-400"    },
  emerald: { bg: "from-emerald-500/10 to-emerald-500/0",ring: "border-emerald-500/20", text: "text-emerald-400" },
};

function KpiCard({
  icon, tone, label, value, delta,
}: {
  icon: React.ReactNode;
  tone: "violet" | "rose" | "cyan" | "emerald";
  label: string;
  value: number | string;
  delta: number | null;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <div className={`relative rounded-xl border ${t.ring} bg-gradient-to-br ${t.bg} p-4 overflow-hidden`}>
      <div className="flex items-center justify-between">
        <div className={`h-8 w-8 rounded-lg bg-secondary flex items-center justify-center ${t.text}`}>
          {icon}
        </div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
          {label}
        </div>
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <DeltaBadge delta={delta} />
        <span className="text-[10px] text-muted-foreground">vs last period</span>
      </div>
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
  const cls = positive
    ? "bg-emerald-500/15 text-emerald-400"
    : negative
    ? "bg-rose-500/15 text-rose-400"
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

// ── Real-time activity block ─────────────────────────────────────────────

function RealTimeBlock({
  liveViews, liveClicks, pulse,
}: {
  liveViews: ViewRow[];
  liveClicks: ClickRow[];
  pulse: number;
}) {
  const data = useMemo(() => {
    // Bucket by minute, last 30 min
    const now = new Date();
    const buckets = Array.from({ length: 30 }, (_, i) => {
      const minute = subMinutes(now, 29 - i);
      return { minute: format(minute, "HH:mm"), at: minute, visits: 0, clicks: 0 };
    });
    const bucketIndex = (iso: string) => {
      const dt = new Date(iso);
      const diff = differenceInMinutes(now, dt);
      const idx = 29 - diff;
      return idx >= 0 && idx < 30 ? idx : -1;
    };
    for (const v of liveViews) {
      const i = bucketIndex(v.occurred_at);
      if (i >= 0) buckets[i].visits++;
    }
    for (const cl of liveClicks) {
      const i = bucketIndex(cl.occurred_at);
      if (i >= 0) buckets[i].clicks++;
    }
    return buckets;
  }, [liveViews, liveClicks, pulse]);

  const total = liveViews.length + liveClicks.length;
  const visitsPerMin = (liveViews.length / 30).toFixed(1);
  const clicksPerMin = (liveClicks.length / 30).toFixed(1);
  const totalPerMin = (total / 30).toFixed(1);

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-primary" /> Real-Time Activity
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Last 30 minutes</div>
        </div>
        <span className="text-[11px] inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          Live
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <LiveStat icon={<Users className="h-4 w-4" />} label="Total Visits" value={liveViews.length} rate={visitsPerMin} tone="violet" />
        <LiveStat icon={<MousePointerClick className="h-4 w-4" />} label="Total Clicks" value={liveClicks.length} rate={clicksPerMin} tone="rose" />
        <LiveStat icon={<Clock className="h-4 w-4" />} label="Total Activity" value={total} rate={totalPerMin} tone="cyan" />
      </div>

      <div className="flex items-center gap-4 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-violet-400" /> Profile Visits
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-400" /> Link Clicks
        </span>
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="liveVisits" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(167,139,250)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="rgb(167,139,250)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="liveClicks" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(251,113,133)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="rgb(251,113,133)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="minute"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.1)" }}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Area
              type="monotone"
              dataKey="visits"
              stroke="rgb(167,139,250)"
              strokeWidth={2}
              fill="url(#liveVisits)"
            />
            <Area
              type="monotone"
              dataKey="clicks"
              stroke="rgb(251,113,133)"
              strokeWidth={2}
              fill="url(#liveClicks)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function LiveStat({
  icon, label, value, rate, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  rate: string;
  tone: "violet" | "rose" | "cyan";
}) {
  const t = TONE_CLASSES[tone];
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</div>
        <div className={`h-7 w-7 rounded-md bg-secondary flex items-center justify-center ${t.text}`}>{icon}</div>
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      <div className="text-[10px] text-emerald-400 mt-0.5 inline-flex items-center gap-0.5">
        <TrendingUp className="h-2.5 w-2.5" /> {rate} / min
      </div>
    </div>
  );
}

// ── Geographic ──────────────────────────────────────────────────────────

function GeoBlock({ views }: { views: ViewRow[] }) {
  const { countries, cities } = useMemo(() => {
    const cMap = new Map<string, number>();
    const cityMap = new Map<string, { city: string; country: string | null; count: number }>();
    for (const v of views) {
      if (v.country) cMap.set(v.country, (cMap.get(v.country) ?? 0) + 1);
      if (v.city) {
        const key = `${v.city}|${v.country ?? ""}`;
        if (!cityMap.has(key)) cityMap.set(key, { city: v.city, country: v.country, count: 0 });
        cityMap.get(key)!.count++;
      }
    }
    return {
      countries: [...cMap.entries()].map(([cc, count]) => ({ cc, count })).sort((a, b) => b.count - a.count),
      cities: [...cityMap.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    };
  }, [views]);

  const total = views.length;
  const totalGeo = countries.reduce((s, c) => s + c.count, 0);
  const [tab, setTab] = useState<"countries" | "cities">("countries");

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Globe className="h-4 w-4 text-primary" /> Geographic Analytics
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {countries.length} {countries.length === 1 ? "country" : "countries"} · {totalGeo} {totalGeo === 1 ? "event" : "events"}
            {total > totalGeo && (
              <span className="ml-1 text-muted-foreground/60">({total - totalGeo} unknown)</span>
            )}
          </div>
        </div>
        <div className="inline-flex items-center rounded-md bg-secondary p-0.5">
          <button
            onClick={() => setTab("countries")}
            className={`text-xs px-2.5 py-1 rounded font-medium ${tab === "countries" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Countries
          </button>
          <button
            onClick={() => setTab("cities")}
            className={`text-xs px-2.5 py-1 rounded font-medium ${tab === "cities" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Cities
          </button>
        </div>
      </div>

      {tab === "countries" ? (
        countries.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-6 text-center border border-dashed border-border rounded-lg">
            No geographic data yet. Visits start populating this once visitors arrive.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {countries.map((c, i) => {
              const pct = totalGeo > 0 ? (c.count / totalGeo) * 100 : 0;
              return (
                <div key={c.cc} className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] text-muted-foreground font-mono">#{i + 1}</span>
                    <span className="text-2xl leading-none">{countryFlag(c.cc)}</span>
                    <span className="text-sm font-semibold flex-1">{c.cc}</span>
                    <span className="text-sm font-bold tabular-nums text-primary">{c.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">{pct.toFixed(1)}% of geo events</div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        cities.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-6 text-center border border-dashed border-border rounded-lg">
            No city data yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {cities.map((c) => {
              const pct = totalGeo > 0 ? (c.count / totalGeo) * 100 : 0;
              return (
                <div key={`${c.city}-${c.country}`} className="flex items-center gap-3 text-xs">
                  <span className="text-base leading-none">{countryFlag(c.country)}</span>
                  <div className="w-32 truncate font-medium" title={c.city}>{c.city}</div>
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-10 text-right font-medium tabular-nums">{c.count}</div>
                </div>
              );
            })}
          </div>
        )
      )}
    </section>
  );
}

// ── Sources donut ────────────────────────────────────────────────────────

const DONUT_COLORS = [
  "rgb(167,139,250)", "rgb(96,165,250)", "rgb(52,211,153)",
  "rgb(251,191,36)",  "rgb(251,113,133)", "rgb(244,114,182)",
  "rgb(56,189,248)",  "rgb(232,120,82)",
];

function hostFromReferrer(ref: string | null): string {
  if (!ref) return "Direct";
  try { return new URL(ref).hostname.replace(/^www\./, ""); }
  catch { return "Direct"; }
}

function SourcesDonut({
  title, subtitle, icon, views, live,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  views: ViewRow[];
  live?: boolean;
}) {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of views) {
      const host = hostFromReferrer(v.referrer);
      map.set(host, (map.get(host) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [views]);

  const topCountries = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of views) {
      if (v.country) map.set(v.country, (map.get(v.country) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [views]);

  const total = views.length;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            {icon} {title}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
        </div>
        {live && (
          <span className="text-[11px] inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            Live
          </span>
        )}
        {!live && <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{total} visits</span>}
      </div>

      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-8 text-center border border-dashed border-border rounded-lg">
          {live ? "No traffic in the last 30 minutes." : "No traffic in this window."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4 items-center">
          <div className="h-32 sm:h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  innerRadius="55%"
                  outerRadius="90%"
                  paddingAngle={3}
                  dataKey="value"
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v: number) => [`${v} visits`, ""]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            {data.map((d, i) => {
              const pct = total > 0 ? (d.value / total) * 100 : 0;
              return (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                  />
                  <span className="font-medium truncate flex-1" title={d.name}>{d.name}</span>
                  <span className="text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                  <span className="font-semibold tabular-nums w-8 text-right">{d.value}</span>
                </div>
              );
            })}
            {live && topCountries.length > 0 && (
              <div className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border">
                Top countries: {topCountries.map(([cc]) => cc).join(", ")}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Period comparison ──────────────────────────────────────────────────

function PeriodComparison({
  days, currentRange, previousRange, v, c, pv, pc,
}: {
  days: number;
  currentRange: Range;
  previousRange: Range;
  v: number; c: number; pv: number; pc: number;
}) {
  const compareData = [
    { name: "Views",  Current: v, Previous: pv },
    { name: "Clicks", Current: c, Previous: pc },
  ];
  const totalCurrent = v + c;
  const distData = [
    { name: "Profile Visits", value: v },
    { name: "Link Clicks", value: c },
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div>
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4 text-primary" /> Period Comparison
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {formatRange(currentRange)} <span className="opacity-50">vs</span> {formatRange(previousRange)}
          <span className="ml-1 opacity-60">({days}-day window)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Comparison bar chart */}
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-2">
            Comparison Overview
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Current"  fill="rgb(96,165,250)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Previous" fill="rgb(186,212,247)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity distribution */}
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-2">
            Activity Distribution
          </div>
          {totalCurrent === 0 ? (
            <div className="text-xs text-muted-foreground italic py-12 text-center">
              No activity in this period yet.
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2 items-center h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distData}
                    innerRadius="50%"
                    outerRadius="85%"
                    dataKey="value"
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    <Cell fill="rgb(52,211,153)" />
                    <Cell fill="rgb(96,165,250)" />
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 text-xs pr-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgb(52,211,153)" }} />
                  <div>
                    <div className="text-emerald-400 font-medium">Profile Visits</div>
                    <div className="text-muted-foreground tabular-nums">
                      {v} ({totalCurrent > 0 ? ((v / totalCurrent) * 100).toFixed(0) : 0}%)
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgb(96,165,250)" }} />
                  <div>
                    <div className="text-blue-400 font-medium">Link Clicks</div>
                    <div className="text-muted-foreground tabular-nums">
                      {c} ({totalCurrent > 0 ? ((c / totalCurrent) * 100).toFixed(0) : 0}%)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
