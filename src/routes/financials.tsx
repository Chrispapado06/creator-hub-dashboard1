// Financials — accounting-grade P&L for the agency.
//
// This page is the agency's bookkeeper view. It pulls every money-flow
// table in the system and presents:
//
//   • Top KPIs: gross OF volume (total $$ flowing through), agency revenue
//     (the slice the agency keeps), total expenses, net profit, margin %.
//     Each compares to the previous same-length window.
//
//   • Cash-flow chart: income vs expense over time, bucketed by day.
//
//   • Income breakdown: per-creator agency cut donut.
//
//   • Expense breakdown: ad spend (by platform) + staff payouts + ops
//     expenses, donut + table.
//
//   • P&L by creator: every creator's gross / fee / agency cut / ad spend
//     attributable / net to creator. Sortable, the place to spot which
//     creators actually print money after costs.
//
//   • Pending: payouts in flight (drafted/sent but not paid) so the
//     agency knows what's owed.
//
//   • Expenses ledger: inline-add and edit operating expenses.
//
//   • CSV export of every row visible in the period (P&L, expenses,
//     payouts) for hand-off to an accountant.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  Wallet, TrendingUp, TrendingDown, Minus, DollarSign,
  PiggyBank, Receipt, Plus, Trash2, ArrowDownToLine, BarChart3,
  Calendar as CalendarIcon, RefreshCw, Megaphone, Users as UsersIcon,
  Briefcase, Home, Server, Scale, Truck, Package,
  CalendarRange, AlertCircle, Pencil, Save, X,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, Line, ComposedChart,
} from "recharts";
import {
  format, startOfDay, endOfDay, startOfMonth, startOfYear, startOfQuarter,
  subDays, eachDayOfInterval, differenceInCalendarDays,
} from "date-fns";
import type { DateRange } from "react-day-picker";

export const Route = createFileRoute("/financials")({ component: FinancialsPage });

// ── Range model (same pattern as analytics) ────────────────────────────

type RangeKind = "30d" | "90d" | "mtd" | "qtd" | "ytd" | "custom";
type Range = { from: Date; to: Date };

const presetRange = (kind: RangeKind): Range => {
  const now = new Date();
  switch (kind) {
    case "30d": return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "90d": return { from: startOfDay(subDays(now, 89)), to: endOfDay(now) };
    case "mtd": return { from: startOfMonth(now), to: endOfDay(now) };
    case "qtd": return { from: startOfQuarter(now), to: endOfDay(now) };
    case "ytd": return { from: startOfYear(now), to: endOfDay(now) };
    case "custom": return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
  }
};

const previousRange = (current: Range): Range => {
  const days = Math.max(1, differenceInCalendarDays(current.to, current.from) + 1);
  const to = endOfDay(subDays(current.from, 1));
  const from = startOfDay(subDays(to, days - 1));
  return { from, to };
};

const formatRange = (r: Range): string => {
  const sameYear = r.from.getFullYear() === r.to.getFullYear();
  const fromFmt = sameYear ? "MMM d" : "MMM d, yyyy";
  return `${format(r.from, fromFmt)} – ${format(r.to, "MMM d, yyyy")}`;
};

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtMoneyPrecise = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pctChange = (curr: number, prev: number): number | null => {
  if (prev === 0 && curr === 0) return 0;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
};

// ── Source data types ──────────────────────────────────────────────────

type Creator = { id: string; name: string };

type Payout = {
  id: string;
  creator_id: string;
  period_start: string;
  period_end: string;
  gross_revenue: number;
  of_platform_fee: number;
  agency_cut: number;
  net_to_creator: number;
  status: "draft" | "sent" | "paid";
  paid_at: string | null;
};

type AdCampaign = {
  id: string;
  creator_id: string;
  platform: string;
  amount_spent: number;
  revenue_generated: number;
  start_date: string;
  end_date: string | null;
};

type StaffPayout = {
  id: string;
  chatter_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  paid_at: string;
};

type AgencyExpense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  vendor: string | null;
  notes: string | null;
  recurring: boolean;
};

type OrganicEntry = { creator_id: string; amount: number; entry_date: string };
type InternalEntry = { creator_id: string; amount: number; entry_date: string };

const EXPENSE_CATEGORIES = [
  { value: "software",              label: "Software",              Icon: Server },
  { value: "marketing",             label: "Marketing",             Icon: Megaphone },
  { value: "salaries",              label: "Salaries",              Icon: UsersIcon },
  { value: "rent",                  label: "Rent",                  Icon: Home },
  { value: "equipment",             label: "Equipment",             Icon: Package },
  { value: "professional_services", label: "Professional services", Icon: Briefcase },
  { value: "travel",                label: "Travel",                Icon: Truck },
  { value: "legal",                 label: "Legal",                 Icon: Scale },
  { value: "other",                 label: "Other",                 Icon: Receipt },
];

const categoryMeta = (c: string) => EXPENSE_CATEGORIES.find((e) => e.value === c) ?? EXPENSE_CATEGORIES.at(-1)!;

// Distinct, accounting-friendly palette (recharts doesn't generate these for you)
const PALETTE = [
  "rgb(167,139,250)", "rgb(96,165,250)", "rgb(52,211,153)",
  "rgb(251,191,36)",  "rgb(251,113,133)", "rgb(244,114,182)",
  "rgb(56,189,248)",  "rgb(232,120,82)",  "rgb(168,85,247)",
];

// ── Page ───────────────────────────────────────────────────────────────

function FinancialsPage() {
  const [rangeKind, setRangeKind] = useState<RangeKind>("mtd");
  const [range, setRange] = useState<Range>(() => presetRange("mtd"));
  const [customDraft, setCustomDraft] = useState<DateRange | undefined>();
  const [customOpen, setCustomOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Source data — current window
  const [creators, setCreators] = useState<Creator[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<Payout[]>([]); // ALL pending regardless of date
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [staffPayouts, setStaffPayouts] = useState<StaffPayout[]>([]);
  const [expenses, setExpenses] = useState<AgencyExpense[]>([]);
  const [organicEntries, setOrganicEntries] = useState<OrganicEntry[]>([]);
  const [internalEntries, setInternalEntries] = useState<InternalEntry[]>([]);

  // Source data — previous window (for deltas)
  const [prevPayouts, setPrevPayouts] = useState<Payout[]>([]);
  const [prevAds, setPrevAds] = useState<AdCampaign[]>([]);
  const [prevStaff, setPrevStaff] = useState<StaffPayout[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<AgencyExpense[]>([]);
  const [prevOrganic, setPrevOrganic] = useState<OrganicEntry[]>([]);
  const [prevInternal, setPrevInternal] = useState<InternalEntry[]>([]);

  const prev = useMemo(() => previousRange(range), [range]);
  const days = Math.max(1, differenceInCalendarDays(range.to, range.from) + 1);

  const setPreset = (k: Exclude<RangeKind, "custom">) => {
    setRangeKind(k);
    setRange(presetRange(k));
  };

  const applyCustom = () => {
    if (!customDraft?.from) return;
    const from = startOfDay(customDraft.from);
    const to = endOfDay(customDraft.to ?? customDraft.from);
    setRange({ from, to });
    setRangeKind("custom");
    setCustomOpen(false);
  };

  const load = async () => {
    setLoading(true);
    const [cFrom, cTo] = [format(range.from, "yyyy-MM-dd"), format(range.to, "yyyy-MM-dd")];
    const [pFrom, pTo] = [format(prev.from, "yyyy-MM-dd"), format(prev.to, "yyyy-MM-dd")];

    const queries = await Promise.all([
      supabase.from("creators").select("id, name").order("name"),

      // Current window — scoped by each table's natural date column
      supabase.from("creator_payouts")
        .select("id, creator_id, period_start, period_end, gross_revenue, of_platform_fee, agency_cut, net_to_creator, status, paid_at")
        .gte("period_end", cFrom).lte("period_end", cTo),
      supabase.from("creator_payouts")
        .select("id, creator_id, period_start, period_end, gross_revenue, of_platform_fee, agency_cut, net_to_creator, status, paid_at")
        .neq("status", "paid"),
      supabase.from("ad_campaigns")
        .select("id, creator_id, platform, amount_spent, revenue_generated, start_date, end_date")
        .gte("start_date", cFrom).lte("start_date", cTo),
      supabase.from("staff_payouts")
        .select("id, chatter_id, period_start, period_end, amount, paid_at")
        .gte("period_end", cFrom).lte("period_end", cTo),
      supabase.from("agency_expenses")
        .select("id, category, description, amount, expense_date, vendor, notes, recurring")
        .gte("expense_date", cFrom).lte("expense_date", cTo)
        .order("expense_date", { ascending: false }),
      supabase.from("organic_entries").select("creator_id, amount, entry_date").gte("entry_date", cFrom).lte("entry_date", cTo),
      supabase.from("internal_entries").select("creator_id, amount, entry_date").gte("entry_date", cFrom).lte("entry_date", cTo),

      // Previous window
      supabase.from("creator_payouts")
        .select("id, creator_id, period_start, period_end, gross_revenue, of_platform_fee, agency_cut, net_to_creator, status, paid_at")
        .gte("period_end", pFrom).lte("period_end", pTo),
      supabase.from("ad_campaigns")
        .select("id, creator_id, platform, amount_spent, revenue_generated, start_date, end_date")
        .gte("start_date", pFrom).lte("start_date", pTo),
      supabase.from("staff_payouts")
        .select("id, chatter_id, period_start, period_end, amount, paid_at")
        .gte("period_end", pFrom).lte("period_end", pTo),
      supabase.from("agency_expenses")
        .select("id, category, description, amount, expense_date, vendor, notes, recurring")
        .gte("expense_date", pFrom).lte("expense_date", pTo),
      supabase.from("organic_entries").select("creator_id, amount, entry_date").gte("entry_date", pFrom).lte("entry_date", pTo),
      supabase.from("internal_entries").select("creator_id, amount, entry_date").gte("entry_date", pFrom).lte("entry_date", pTo),
    ]);

    setCreators((queries[0].data ?? []) as Creator[]);
    setPayouts((queries[1].data ?? []) as Payout[]);
    setPendingPayouts(((queries[2].data ?? []) as Payout[]).sort(
      (a, b) => (b.period_end > a.period_end ? 1 : -1),
    ));
    setAds((queries[3].data ?? []) as AdCampaign[]);
    setStaffPayouts((queries[4].data ?? []) as StaffPayout[]);
    setExpenses((queries[5].data ?? []) as AgencyExpense[]);
    setOrganicEntries((queries[6].data ?? []) as OrganicEntry[]);
    setInternalEntries((queries[7].data ?? []) as InternalEntry[]);

    setPrevPayouts((queries[8].data ?? []) as Payout[]);
    setPrevAds((queries[9].data ?? []) as AdCampaign[]);
    setPrevStaff((queries[10].data ?? []) as StaffPayout[]);
    setPrevExpenses((queries[11].data ?? []) as AgencyExpense[]);
    setPrevOrganic((queries[12].data ?? []) as OrganicEntry[]);
    setPrevInternal((queries[13].data ?? []) as InternalEntry[]);

    setLoading(false);
  };

  useEffect(() => { void load(); }, [range.from.getTime(), range.to.getTime()]);

  // ── Aggregates ────────────────────────────────────────────────────────

  const creatorById = useMemo(() => new Map(creators.map((c) => [c.id, c.name])), [creators]);

  // ── OnlyFans Direct earnings (live from analytics endpoint) ────────
  // Range-filtered, fetched on every range change. Counts every dollar
  // OnlyFans itself attributes to the creator's account in the window
  // — subscriptions + tips + PPV posts + DM unlocks + streams. This is
  // separate from the per-entry "gross volume" above, which only
  // captures manually-tagged Reddit/social revenue.
  const [ofDirectInRange, setOfDirectInRange] = useState(0);
  const [loadingOfDirect, setLoadingOfDirect] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoadingOfDirect(true);
    void (async () => {
      const { fetchOfEarnings } = await import("@/lib/of-sync");
      const { data: cs } = await supabase
        .from("creators")
        .select("onlyfansapi_acct_id")
        .not("onlyfansapi_acct_id", "is", null);
      const ids = (cs ?? []).map((c) => c.onlyfansapi_acct_id as string);
      if (cancelled) return;
      const breakdown = await fetchOfEarnings(
        ids,
        format(range.from, "yyyy-MM-dd"),
        format(range.to, "yyyy-MM-dd"),
      );
      if (!cancelled) {
        setOfDirectInRange(breakdown.total);
        setLoadingOfDirect(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  // Gross OF volume — every dollar that flowed through OnlyFans in the
  // window (per creator entries; not the sum of payouts because payouts
  // can lag behind the entries date-wise).
  const grossVolume = useMemo(
    () =>
      organicEntries.reduce((s, e) => s + Number(e.amount || 0), 0) +
      internalEntries.reduce((s, e) => s + Number(e.amount || 0), 0),
    [organicEntries, internalEntries],
  );
  const prevGrossVolume = useMemo(
    () =>
      prevOrganic.reduce((s, e) => s + Number(e.amount || 0), 0) +
      prevInternal.reduce((s, e) => s + Number(e.amount || 0), 0),
    [prevOrganic, prevInternal],
  );

  // Agency revenue — sum of agency_cut from payouts whose period_end falls
  // in the window. This is the agency's actual income.
  const agencyRevenue = useMemo(
    () => payouts.reduce((s, p) => s + Number(p.agency_cut || 0), 0),
    [payouts],
  );
  const prevAgencyRevenue = useMemo(
    () => prevPayouts.reduce((s, p) => s + Number(p.agency_cut || 0), 0),
    [prevPayouts],
  );

  const adSpend = useMemo(() => ads.reduce((s, a) => s + Number(a.amount_spent || 0), 0), [ads]);
  const staffComp = useMemo(() => staffPayouts.reduce((s, sp) => s + Number(sp.amount || 0), 0), [staffPayouts]);
  const opsExpenses = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount || 0), 0), [expenses]);
  const totalExpenses = adSpend + staffComp + opsExpenses;

  const prevAdSpend = useMemo(() => prevAds.reduce((s, a) => s + Number(a.amount_spent || 0), 0), [prevAds]);
  const prevStaffComp = useMemo(() => prevStaff.reduce((s, sp) => s + Number(sp.amount || 0), 0), [prevStaff]);
  const prevOpsExpenses = useMemo(() => prevExpenses.reduce((s, e) => s + Number(e.amount || 0), 0), [prevExpenses]);
  const prevTotalExpenses = prevAdSpend + prevStaffComp + prevOpsExpenses;

  const netProfit = agencyRevenue - totalExpenses;
  const prevNetProfit = prevAgencyRevenue - prevTotalExpenses;
  const margin = agencyRevenue > 0 ? (netProfit / agencyRevenue) * 100 : 0;
  const prevMargin = prevAgencyRevenue > 0 ? (prevNetProfit / prevAgencyRevenue) * 100 : 0;

  // Daily cash-flow series — bucket every income/expense to its day so the
  // chart shows the rhythm of the period instead of just totals.
  const dailySeries = useMemo(() => {
    const dayList = eachDayOfInterval({ start: startOfDay(range.from), end: startOfDay(range.to) });
    const buckets = new Map<string, { date: string; income: number; expense: number }>();
    for (const d of dayList) {
      buckets.set(format(d, "yyyy-MM-dd"), { date: format(d, "yyyy-MM-dd"), income: 0, expense: 0 });
    }
    const bump = (key: string, kind: "income" | "expense", amt: number) => {
      const b = buckets.get(key);
      if (b) b[kind] += amt;
    };
    // Income — agency_cut bucketed at period_end
    for (const p of payouts) bump(p.period_end, "income", Number(p.agency_cut));
    // Expenses
    for (const a of ads) bump(a.start_date, "expense", Number(a.amount_spent));
    for (const sp of staffPayouts) bump(sp.period_end, "expense", Number(sp.amount));
    for (const e of expenses) bump(e.expense_date, "expense", Number(e.amount));
    return [...buckets.values()].map((b) => ({
      ...b,
      net: b.income - b.expense,
    }));
  }, [payouts, ads, staffPayouts, expenses, range]);

  // Income breakdown: agency cut per creator
  const incomeByCreator = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payouts) {
      m.set(p.creator_id, (m.get(p.creator_id) ?? 0) + Number(p.agency_cut));
    }
    return [...m.entries()]
      .map(([id, v]) => ({ name: creatorById.get(id) ?? "Unknown", value: v }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [payouts, creatorById]);

  // Expense breakdown — by major bucket
  const expenseBuckets = useMemo(() => {
    const adsByPlatform = new Map<string, number>();
    for (const a of ads) {
      const platform = (a.platform || "other").toLowerCase();
      adsByPlatform.set(platform, (adsByPlatform.get(platform) ?? 0) + Number(a.amount_spent));
    }
    const expensesByCategory = new Map<string, number>();
    for (const e of expenses) {
      expensesByCategory.set(e.category, (expensesByCategory.get(e.category) ?? 0) + Number(e.amount));
    }
    const list: { name: string; value: number; group: string }[] = [];
    for (const [p, v] of adsByPlatform) list.push({ name: `Ads: ${p}`, value: v, group: "ads" });
    if (staffComp > 0) list.push({ name: "Staff payouts", value: staffComp, group: "staff" });
    for (const [c, v] of expensesByCategory) {
      const meta = categoryMeta(c);
      list.push({ name: meta.label, value: v, group: "ops" });
    }
    return list.sort((a, b) => b.value - a.value);
  }, [ads, staffComp, expenses]);

  // Per-creator P&L
  const creatorPL = useMemo(() => {
    const byCreator = new Map<string, {
      id: string; name: string; gross: number; ofFee: number; agencyCut: number; netToCreator: number; adSpend: number;
    }>();
    const ensure = (id: string) => {
      if (!byCreator.has(id)) {
        byCreator.set(id, {
          id, name: creatorById.get(id) ?? "Unknown",
          gross: 0, ofFee: 0, agencyCut: 0, netToCreator: 0, adSpend: 0,
        });
      }
      return byCreator.get(id)!;
    };
    for (const p of payouts) {
      const r = ensure(p.creator_id);
      r.gross += Number(p.gross_revenue);
      r.ofFee += Number(p.of_platform_fee);
      r.agencyCut += Number(p.agency_cut);
      r.netToCreator += Number(p.net_to_creator);
    }
    for (const a of ads) {
      const r = ensure(a.creator_id);
      r.adSpend += Number(a.amount_spent);
    }
    return [...byCreator.values()]
      .map((r) => ({ ...r, agencyProfit: r.agencyCut - r.adSpend }))
      .sort((a, b) => b.agencyProfit - a.agencyProfit);
  }, [payouts, ads, creatorById]);

  const totalPending = pendingPayouts.reduce((s, p) => s + Number(p.net_to_creator), 0);

  // ── Export to CSV ─────────────────────────────────────────────────────

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push(`Financials — ${formatRange(range)}`);
    lines.push("");
    lines.push("SUMMARY");
    lines.push(`"Gross OF volume",${grossVolume}`);
    lines.push(`"Agency revenue",${agencyRevenue}`);
    lines.push(`"Ad spend",${adSpend}`);
    lines.push(`"Staff payouts",${staffComp}`);
    lines.push(`"Operating expenses",${opsExpenses}`);
    lines.push(`"Net profit",${netProfit}`);
    lines.push(`"Margin %",${margin.toFixed(2)}`);
    lines.push("");
    lines.push("P&L BY CREATOR");
    lines.push("Creator,Gross,OF Fee,Agency Cut,Ad Spend,Agency Profit,Net to Creator");
    for (const r of creatorPL) {
      lines.push([
        `"${r.name.replace(/"/g, '""')}"`, r.gross, r.ofFee, r.agencyCut, r.adSpend, r.agencyProfit, r.netToCreator,
      ].join(","));
    }
    lines.push("");
    lines.push("EXPENSES");
    lines.push("Date,Category,Description,Vendor,Amount,Recurring");
    for (const e of expenses) {
      lines.push([
        e.expense_date,
        e.category,
        `"${(e.description ?? "").replace(/"/g, '""')}"`,
        `"${(e.vendor ?? "").replace(/"/g, '""')}"`,
        e.amount,
        e.recurring,
      ].join(","));
    }
    lines.push("");
    lines.push("PAYOUTS (paid in window)");
    lines.push("Period start,Period end,Creator,Gross,OF Fee,Agency Cut,Net to Creator,Status");
    for (const p of payouts) {
      lines.push([
        p.period_start, p.period_end,
        `"${(creatorById.get(p.creator_id) ?? "").replace(/"/g, '""')}"`,
        p.gross_revenue, p.of_platform_fee, p.agency_cut, p.net_to_creator, p.status,
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financials-${format(range.from, "yyyy-MM-dd")}-to-${format(range.to, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Toaster />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <PiggyBank className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Financials</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            P&L, cash flow, and expense ledger for the agency. Pulls from creator payouts,
            ad campaigns, staff payouts, and operating expenses. {formatRange(range)}.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <PeriodPill active={rangeKind === "mtd"} onClick={() => setPreset("mtd")}>MTD</PeriodPill>
          <PeriodPill active={rangeKind === "qtd"} onClick={() => setPreset("qtd")}>QTD</PeriodPill>
          <PeriodPill active={rangeKind === "ytd"} onClick={() => setPreset("ytd")}>YTD</PeriodPill>
          <PeriodPill active={rangeKind === "30d"} onClick={() => setPreset("30d")}>30d</PeriodPill>
          <PeriodPill active={rangeKind === "90d"} onClick={() => setPreset("90d")}>90d</PeriodPill>
          <Popover open={customOpen} onOpenChange={(o) => {
            setCustomOpen(o);
            if (o) setCustomDraft({ from: range.from, to: range.to });
          }}>
            <PopoverTrigger asChild>
              <button className={`text-xs px-2.5 py-1 rounded-md font-medium inline-flex items-center gap-1 ${
                rangeKind === "custom" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}>
                <CalendarRange className="h-3.5 w-3.5" />
                {rangeKind === "custom" ? formatRange(range) : "Custom"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="range" selected={customDraft} onSelect={setCustomDraft} numberOfMonths={2} disabled={(d) => d > new Date()} autoFocus />
              <div className="border-t border-border p-2 flex items-center justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setCustomDraft(undefined)}>Clear</Button>
                <Button size="sm" onClick={applyCustom} disabled={!customDraft?.from}>Apply</Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={exportCSV}>
            <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard
          tone="cyan"
          icon={<DollarSign className="h-4 w-4" />}
          label="OnlyFans Direct"
          value={loadingOfDirect ? "…" : fmtMoney(ofDirectInRange)}
          delta={null}
          hint="from /analytics/summary/earnings"
        />
        <KpiCard
          tone="cyan"
          icon={<DollarSign className="h-4 w-4" />}
          label="Gross OF volume"
          value={fmtMoney(grossVolume)}
          delta={pctChange(grossVolume, prevGrossVolume)}
          hint="all $ flowing through"
        />
        <KpiCard
          tone="emerald"
          icon={<TrendingUp className="h-4 w-4" />}
          label="Agency revenue"
          value={fmtMoney(agencyRevenue)}
          delta={pctChange(agencyRevenue, prevAgencyRevenue)}
          hint="agency's share"
        />
        <KpiCard
          tone="rose"
          icon={<TrendingDown className="h-4 w-4" />}
          label="Total expenses"
          value={fmtMoney(totalExpenses)}
          delta={pctChange(totalExpenses, prevTotalExpenses)}
          deltaInverse
          hint={`${fmtMoney(adSpend)} ads · ${fmtMoney(staffComp)} staff · ${fmtMoney(opsExpenses)} ops`}
        />
        <KpiCard
          tone={netProfit >= 0 ? "emerald" : "rose"}
          icon={<Wallet className="h-4 w-4" />}
          label="Net profit"
          value={fmtMoney(netProfit)}
          delta={pctChange(netProfit, prevNetProfit)}
          hint="revenue − expenses"
        />
        <KpiCard
          tone={margin >= 50 ? "emerald" : margin >= 25 ? "amber" : "rose"}
          icon={<BarChart3 className="h-4 w-4" />}
          label="Margin"
          value={`${margin.toFixed(1)}%`}
          delta={pctChange(margin, prevMargin)}
          hint={`prev ${prevMargin.toFixed(1)}%`}
        />
      </div>

      {/* Pending payouts strip */}
      {pendingPayouts.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400" />
            <div>
              <div className="text-sm font-semibold text-amber-400">
                {fmtMoney(totalPending)} owed across {pendingPayouts.length} payout{pendingPayouts.length === 1 ? "" : "s"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {pendingPayouts.filter((p) => p.status === "draft").length} draft ·{" "}
                {pendingPayouts.filter((p) => p.status === "sent").length} sent — none paid yet
              </div>
            </div>
          </div>
          <a href="/" className="text-xs text-amber-400 hover:underline">Review on creator pages →</a>
        </div>
      )}

      {/* Cash flow chart */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" /> Cash flow
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Daily income vs expense. Net line shows profit or loss per day.
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-emerald-400" /> Income</span>
            <span className="inline-flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-rose-400" /> Expenses</span>
            <span className="inline-flex items-center gap-1.5"><div className="h-1 w-3 rounded bg-violet-400" /> Net</span>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dailySeries} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(52,211,153)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="rgb(52,211,153)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(251,113,133)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="rgb(251,113,133)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => format(new Date(v), days > 60 ? "MMM" : "MMM d")}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                width={48}
              />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                labelFormatter={(v) => format(new Date(v as string), "MMM d, yyyy")}
                formatter={(v: number, name) => [fmtMoney(v), name]}
              />
              <Area type="monotone" dataKey="income" name="Income" stroke="rgb(52,211,153)" strokeWidth={2} fill="url(#incomeGrad)" />
              <Area type="monotone" dataKey="expense" name="Expenses" stroke="rgb(251,113,133)" strokeWidth={2} fill="url(#expenseGrad)" />
              <Line type="monotone" dataKey="net" name="Net" stroke="rgb(167,139,250)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Income / Expense breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Income by creator */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> Income by creator
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Agency cut per creator from payouts in this window.
            </div>
          </div>
          {incomeByCreator.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-10 text-center border border-dashed border-border rounded-lg">
              No payouts in this window. Generate one from a creator's Payouts tab.
            </div>
          ) : (
            <DonutWithLegend
              data={incomeByCreator}
              total={agencyRevenue}
              fmt={fmtMoney}
            />
          )}
        </section>

        {/* Expense breakdown */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-rose-400" /> Expenses by category
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Ad spend (per platform) + staff payouts + operating expenses.
            </div>
          </div>
          {expenseBuckets.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-10 text-center border border-dashed border-border rounded-lg">
              No expenses in this window. Add one in the Expenses ledger below.
            </div>
          ) : (
            <DonutWithLegend
              data={expenseBuckets.map((b) => ({ name: b.name, value: b.value }))}
              total={totalExpenses}
              fmt={fmtMoney}
            />
          )}
        </section>
      </div>

      {/* P&L by creator */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <UsersIcon className="h-4 w-4 text-primary" /> P&L by creator
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Sorted by agency profit (cut − attributable ad spend). Shows which creators actually print money after their costs.
          </div>
        </div>
        {creatorPL.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-10 text-center border border-dashed border-border rounded-lg">
            No creator activity in this window.
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.2fr] gap-2 px-3 py-2 bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              <div>Creator</div>
              <div className="text-right">Gross</div>
              <div className="text-right">OF fee</div>
              <div className="text-right">Agency cut</div>
              <div className="text-right">Ad spend</div>
              <div className="text-right">Agency profit</div>
            </div>
            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {creatorPL.map((r) => (
                <div key={r.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.2fr] gap-2 px-3 py-2.5 text-xs items-center">
                  <a href={`/creators/${r.id}`} className="font-medium truncate hover:text-primary">{r.name}</a>
                  <div className="text-right tabular-nums text-muted-foreground">{fmtMoney(r.gross)}</div>
                  <div className="text-right tabular-nums text-muted-foreground">{fmtMoney(r.ofFee)}</div>
                  <div className="text-right tabular-nums">{fmtMoney(r.agencyCut)}</div>
                  <div className="text-right tabular-nums text-rose-400">
                    {r.adSpend > 0 ? `−${fmtMoney(r.adSpend)}` : "—"}
                  </div>
                  <div className={`text-right tabular-nums font-semibold ${r.agencyProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {fmtMoney(r.agencyProfit)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Expenses ledger — inline editable */}
      <ExpensesLedger expenses={expenses} onChanged={() => void load()} />
    </div>
  );
}

// ── Donut + legend pair ─────────────────────────────────────────────────

function DonutWithLegend({
  data, total, fmt,
}: {
  data: { name: string; value: number }[];
  total: number;
  fmt: (n: number) => string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4 items-center">
      <div className="h-40 sm:h-44 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius="60%"
              outerRadius="92%"
              paddingAngle={2}
              dataKey="value"
              stroke="var(--card)"
              strokeWidth={2}
            >
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number, name) => [fmt(v), name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-base font-bold tabular-nums">{fmt(total)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</div>
          </div>
        </div>
      </div>
      <div className="space-y-1.5 max-h-44 overflow-y-auto">
        {data.slice(0, 8).map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="font-medium truncate flex-1" title={d.name}>{d.name}</span>
              <span className="text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
              <span className="font-semibold tabular-nums w-20 text-right">{fmt(d.value)}</span>
            </div>
          );
        })}
        {data.length > 8 && (
          <div className="text-[10px] text-muted-foreground italic pt-1">
            +{data.length - 8} more (in CSV export)
          </div>
        )}
      </div>
    </div>
  );
}

// ── Expenses ledger ────────────────────────────────────────────────────

function ExpensesLedger({
  expenses, onChanged,
}: {
  expenses: AgencyExpense[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<AgencyExpense>>({
    category: "software",
    description: "",
    amount: 0,
    expense_date: format(new Date(), "yyyy-MM-dd"),
    vendor: "",
    notes: "",
    recurring: false,
  });

  const onSave = async () => {
    if (!draft.description?.trim()) return toast.error("Add a description");
    if (!draft.amount || draft.amount <= 0) return toast.error("Amount must be greater than zero");
    const payload = {
      category: draft.category ?? "other",
      description: draft.description.trim(),
      amount: Number(draft.amount),
      expense_date: draft.expense_date ?? format(new Date(), "yyyy-MM-dd"),
      vendor: draft.vendor?.trim() || null,
      notes: draft.notes?.trim() || null,
      recurring: !!draft.recurring,
    };
    if (editingId) {
      const { error } = await supabase.from("agency_expenses").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Expense updated");
    } else {
      const { error } = await supabase.from("agency_expenses").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Expense added");
    }
    setAdding(false);
    setEditingId(null);
    setDraft({ category: "software", description: "", amount: 0, expense_date: format(new Date(), "yyyy-MM-dd"), vendor: "", notes: "", recurring: false });
    onChanged();
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this expense? This is permanent.")) return;
    const { error } = await supabase.from("agency_expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Expense deleted");
    onChanged();
  };

  const onEdit = (e: AgencyExpense) => {
    setEditingId(e.id);
    setAdding(true);
    setDraft({
      category: e.category,
      description: e.description,
      amount: e.amount,
      expense_date: e.expense_date,
      vendor: e.vendor ?? "",
      notes: e.notes ?? "",
      recurring: e.recurring,
    });
  };

  const onCancel = () => {
    setAdding(false);
    setEditingId(null);
    setDraft({ category: "software", description: "", amount: 0, expense_date: format(new Date(), "yyyy-MM-dd"), vendor: "", notes: "", recurring: false });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Receipt className="h-4 w-4 text-primary" /> Expenses ledger
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Operating expenses for the agency — software, rent, legal, etc. Ad spend lives in Ads, staff comp in Staff payouts.
          </div>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add expense
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide">Category</Label>
              <Select
                value={draft.category ?? "other"}
                onValueChange={(v) => setDraft({ ...draft, category: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => {
                    const Icon = c.Icon;
                    return (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="inline-flex items-center gap-2"><Icon className="h-3.5 w-3.5" /> {c.label}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide">Date</Label>
              <DatePicker
                value={draft.expense_date ? new Date(draft.expense_date) : null}
                onChange={(d) => setDraft({ ...draft, expense_date: d ? format(d, "yyyy-MM-dd") : undefined })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide">Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.amount ?? 0}
                onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide">Description</Label>
              <Input
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="e.g. Slack annual subscription"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide">Vendor (optional)</Label>
              <Input
                value={draft.vendor ?? ""}
                onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
                placeholder="e.g. Slack Inc."
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide">Notes (optional)</Label>
            <Textarea
              rows={2}
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={!!draft.recurring}
                onChange={(e) => setDraft({ ...draft, recurring: e.target.checked })}
                className="rounded border-border"
              />
              <span>Recurring (monthly subscription / fixed cost)</span>
            </label>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={onCancel}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={onSave}>
                <Save className="h-3.5 w-3.5 mr-1" /> {editingId ? "Update" : "Add"} expense
              </Button>
            </div>
          </div>
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-6 text-center border border-dashed border-border rounded-lg">
          No expenses logged in this window.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[100px_1.5fr_2fr_1fr_120px_80px] gap-2 px-3 py-2 bg-secondary/40 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            <div>Date</div>
            <div>Category</div>
            <div>Description</div>
            <div>Vendor</div>
            <div className="text-right">Amount</div>
            <div></div>
          </div>
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {expenses.map((e) => {
              const meta = categoryMeta(e.category);
              const Icon = meta.Icon;
              return (
                <div key={e.id} className="grid grid-cols-[100px_1.5fr_2fr_1fr_120px_80px] gap-2 px-3 py-2.5 text-xs items-center">
                  <div className="text-muted-foreground tabular-nums">
                    {format(new Date(e.expense_date), "MMM d, yy")}
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    <span>{meta.label}</span>
                    {e.recurring && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-primary/15 text-primary">recurring</span>
                    )}
                  </div>
                  <div className="font-medium truncate" title={e.description}>{e.description}</div>
                  <div className="text-muted-foreground truncate" title={e.vendor ?? ""}>{e.vendor || "—"}</div>
                  <div className="text-right tabular-nums font-semibold text-rose-400">−{fmtMoneyPrecise(Number(e.amount))}</div>
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      onClick={() => onEdit(e)}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-primary"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onDelete(e.id)}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Tiny helpers ────────────────────────────────────────────────────────

function PeriodPill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

const KPI_TONES: Record<string, { ring: string; bg: string; text: string }> = {
  cyan:    { ring: "border-cyan-500/20",    bg: "from-cyan-500/10 to-cyan-500/0",       text: "text-cyan-400"    },
  emerald: { ring: "border-emerald-500/20", bg: "from-emerald-500/10 to-emerald-500/0", text: "text-emerald-400" },
  rose:    { ring: "border-rose-500/20",    bg: "from-rose-500/10 to-rose-500/0",       text: "text-rose-400"    },
  amber:   { ring: "border-amber-500/20",   bg: "from-amber-500/10 to-amber-500/0",     text: "text-amber-400"   },
};

function KpiCard({
  icon, tone, label, value, delta, hint, deltaInverse,
}: {
  icon: React.ReactNode;
  tone: "cyan" | "emerald" | "rose" | "amber";
  label: string;
  value: string;
  delta: number | null;
  hint?: string;
  /** When true, increases are bad (e.g. "expenses went up") and shown red */
  deltaInverse?: boolean;
}) {
  const t = KPI_TONES[tone];
  return (
    <div className={`relative rounded-xl border ${t.ring} bg-gradient-to-br ${t.bg} p-4`}>
      <div className="flex items-center justify-between">
        <div className={`h-8 w-8 rounded-lg bg-secondary flex items-center justify-center ${t.text}`}>{icon}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</div>
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-2 flex items-center gap-1.5">
        <DeltaBadge delta={delta} inverse={deltaInverse} />
        {hint && <span className="text-[10px] text-muted-foreground truncate">{hint}</span>}
      </div>
    </div>
  );
}

function DeltaBadge({ delta, inverse }: { delta: number | null; inverse?: boolean }) {
  if (delta === null) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground inline-flex items-center gap-0.5">
        <Minus className="h-2.5 w-2.5" /> —
      </span>
    );
  }
  const positive = delta > 0;
  const negative = delta < 0;
  // Inverse semantics — for expenses, "up" should look bad
  const good = inverse ? negative : positive;
  const bad = inverse ? positive : negative;
  const cls = good ? "bg-emerald-500/15 text-emerald-400"
    : bad ? "bg-rose-500/15 text-rose-400"
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
