import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format, formatDistanceToNow, isToday, isTomorrow, isThisWeek, addWeeks, isWithinInterval, startOfWeek, endOfWeek, subDays, parseISO, startOfDay, eachDayOfInterval } from "date-fns";
import {
  Play, Square, LogOut, Clock as ClockIcon, Calendar, LayoutDashboard,
  TrendingUp, DollarSign, GraduationCap, MessageCircle, Sparkles,
  Megaphone, Copy, Check, Target, Wallet, BarChart3, ChevronRight,
} from "lucide-react";
import { logAudit } from "@/lib/audit";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/clock")({
  head: () => ({ meta: [{ title: "Clock — Staff Portal" }] }),
  component: ClockPage,
});

const fmt$ = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Chatter = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  status: string;
  commission_pct: number;
  hourly_rate: number | null;
};
type Creator = { id: string; name: string };
type Assignment = { id: string; chatter_id: string; creator_id: string; active: boolean };
type Shift = {
  id: string;
  chatter_id: string;
  creator_id: string;
  start_at: string;
  end_at: string | null;
  ppv_count: number;
  ppv_revenue: number;
  tips_revenue: number;
  custom_revenue: number;
  total_revenue: number;
  message_count: number;
  posts_count: number;
  upvotes_count: number;
  comments_received: number;
  dms_handled: number;
  target_platform: string | null;
  target_account_id: string | null;
  target_account_name: string | null;
  notes: string | null;
};

type PlatformAccount = { id: string; creator_id: string; label: string; sublabel?: string };

type Announcement = {
  id: string;
  body: string;
  pinned: boolean;
  scope: string;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
};
type Payout = {
  id: string;
  chatter_id: string;
  amount: number;
  hours: number;
  commission_amount: number;
  hourly_amount: number;
  shifts_count: number;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
};
type TrainingMaterial = {
  id: string;
  label: string;
  body: string | null;
  video_url: string | null;
  category: string | null;
  creator_id: string | null;
  scope: string;
  display_order: number;
  created_at: string;
};
type Script = {
  id: string;
  label: string;
  body: string;
  category: string;
  creator_id: string | null;
  display_order: number;
};
type CoachingNote = {
  id: string;
  body: string;
  visible_to_staff: boolean;
  created_by: string | null;
  created_at: string;
};
type Goal = {
  id: string;
  label: string;
  metric: string;
  target_amount: number;
  period_start: string;
  period_end: string;
  set_by: string | null;
};

type StaffTab = "today" | "performance" | "pay" | "schedule" | "training" | "coaching";

const roleLabels: Record<string, string> = {
  chatter: "Chatter",
  reddit_va: "Reddit VA",
  instagram_va: "Instagram VA",
  facebook_va: "Facebook VA",
  x_va: "X VA",
  tiktok_va: "TikTok VA",
  social_media_va: "Social Media VA",
  content_editor: "Content Editor",
  recruiter: "Recruiter",
  manager: "Manager",
  other: "Staff",
};

const targetPlatformForRole = (role: string): string | null => {
  switch (role) {
    case "reddit_va": return "reddit";
    case "instagram_va": return "instagram";
    case "facebook_va": return "facebook";
    case "x_va": return "x";
    case "tiktok_va": return "tiktok";
    default: return null;
  }
};

function ClockPage() {
  const navigate = useNavigate();
  const [chatter, setChatter] = useState<Chatter | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [agencyName, setAgencyName] = useState("Agency Console");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Platform accounts (loaded based on role)
  const [redditAccounts, setRedditAccounts] = useState<PlatformAccount[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<PlatformAccount[]>([]);
  const [facebookAccounts, setFacebookAccounts] = useState<PlatformAccount[]>([]);

  const [pickedCreatorId, setPickedCreatorId] = useState("");
  const [pickedAccountId, setPickedAccountId] = useState("");
  const [clockingIn, setClockingIn] = useState(false);
  const [clockOutShift, setClockOutShift] = useState<Shift | null>(null);
  const [clockOutForm, setClockOutForm] = useState({
    // Chatter fields
    ppv_count: "", ppv_revenue: "", tips_revenue: "",
    custom_revenue: "", message_count: "",
    // VA fields
    posts_count: "", upvotes_count: "", comments_received: "", dms_handled: "",
    notes: "",
  });
  const [savingClockOut, setSavingClockOut] = useState(false);

  // ── New v2 state: tab + portal data ─────────────────────────────────────
  const [tab, setTab] = useState<StaffTab>("today");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [trainingMaterials, setTrainingMaterials] = useState<TrainingMaterial[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [coachingNotes, setCoachingNotes] = useState<CoachingNote[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]); // last 90d for performance charts

  // Live timer for active shifts
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Read session and load own data
  useEffect(() => {
    const raw = localStorage.getItem("agency_session");
    if (!raw) {
      navigate({ to: "/login" });
      return;
    }
    let chatterId: string | null = null;
    try {
      const obj = JSON.parse(raw);
      if (obj?.type !== "staff" || !obj.chatter_id) {
        navigate({ to: "/" });
        return;
      }
      chatterId = obj.chatter_id;
    } catch {
      navigate({ to: "/" });
      return;
    }
    if (!chatterId) {
      navigate({ to: "/login" });
      return;
    }
    const cid = chatterId;
    void load(cid);
  }, []);

  const load = async (chatterId: string) => {
    setLoading(true);
    const [{ data: ch }, { data: ag }, { data: ass }, { data: sh }] = await Promise.all([
      supabase.from("chatters").select("*").eq("id", chatterId).maybeSingle(),
      supabase.from("agency_settings").select("agency_name").maybeSingle(),
      supabase.from("chatter_assignments").select("*").eq("chatter_id", chatterId).eq("active", true),
      supabase.from("shifts").select("*").eq("chatter_id", chatterId).order("start_at", { ascending: false }).limit(20),
    ]);
    if (!ch) {
      toast.error("Your staff record is missing — contact your admin.");
      setLoading(false);
      return;
    }
    setChatter(ch as Chatter);
    if (ag?.agency_name) setAgencyName(ag.agency_name);
    const assignList = (ass ?? []) as Assignment[];
    setAssignments(assignList);

    // Load creator names — only for creators they're assigned to
    const creatorIds = assignList.map((a) => a.creator_id);
    if (creatorIds.length > 0) {
      const { data: cs } = await supabase
        .from("creators")
        .select("id, name")
        .in("id", creatorIds);
      setCreators((cs ?? []) as Creator[]);
    } else {
      const { data: cs } = await supabase.from("creators").select("id, name").order("name");
      setCreators((cs ?? []) as Creator[]);
    }
    setShifts((sh ?? []) as Shift[]);

    // Load platform accounts based on the chatter's role
    const role = (ch as Chatter).role;
    if (role === "reddit_va") {
      const { data: ra } = await supabase
        .from("reddit_accounts")
        .select("id, creator_id, username")
        .eq("status", "active");
      setRedditAccounts(((ra ?? []) as { id: string; creator_id: string; username: string }[])
        .map((r) => ({ id: r.id, creator_id: r.creator_id, label: `u/${r.username}` })));
    } else if (role === "instagram_va") {
      const { data: ia } = await supabase
        .from("instagram_accounts")
        .select("id, creator_id, username, followers_count")
        .neq("status", "banned");
      setInstagramAccounts(((ia ?? []) as { id: string; creator_id: string; username: string; followers_count: number }[])
        .map((i) => ({ id: i.id, creator_id: i.creator_id, label: `@${i.username}`, sublabel: `${i.followers_count.toLocaleString()} followers` })));
    } else if (role === "facebook_va") {
      const { data: fa } = await supabase
        .from("facebook_accounts")
        .select("id, creator_id, name, followers_count")
        .neq("status", "banned");
      setFacebookAccounts(((fa ?? []) as { id: string; creator_id: string; name: string; followers_count: number }[])
        .map((f) => ({ id: f.id, creator_id: f.creator_id, label: f.name, sublabel: `${f.followers_count.toLocaleString()} followers` })));
    }

    // ── v2: load portal data (announcements, payouts, training, scripts, coaching, goals, 90d shifts) ──
    const role = (ch as Chatter).role;
    const since90d = subDays(new Date(), 90).toISOString();
    const todayISO = new Date().toISOString();
    const [
      { data: anns },
      { data: pos },
      { data: tm },
      { data: scr },
      { data: cn },
      { data: gs },
      { data: shAll },
    ] = await Promise.all([
      supabase
        .from("staff_announcements")
        .select("*")
        .or(`scope.eq.all,scope.eq.${role},scope.eq.${chatterId}`)
        .or(`expires_at.is.null,expires_at.gt.${todayISO}`)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("staff_payouts")
        .select("*")
        .eq("chatter_id", chatterId)
        .order("period_end", { ascending: false }),
      supabase
        .from("staff_training_materials")
        .select("*")
        .or(`scope.eq.all,scope.eq.${role}`)
        .order("category")
        .order("display_order"),
      supabase
        .from("staff_scripts")
        .select("*")
        .order("category")
        .order("display_order"),
      supabase
        .from("staff_coaching_notes")
        .select("id, body, visible_to_staff, created_by, created_at")
        .eq("chatter_id", chatterId)
        .eq("visible_to_staff", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("staff_goals")
        .select("id, label, metric, target_amount, period_start, period_end, set_by")
        .eq("chatter_id", chatterId)
        .order("period_end", { ascending: false }),
      supabase
        .from("shifts")
        .select("*")
        .eq("chatter_id", chatterId)
        .gte("start_at", since90d)
        .order("start_at", { ascending: false }),
    ]);
    setAnnouncements((anns ?? []) as Announcement[]);
    setPayouts((pos ?? []) as Payout[]);
    setTrainingMaterials((tm ?? []) as TrainingMaterial[]);
    setScripts((scr ?? []) as Script[]);
    setCoachingNotes((cn ?? []) as CoachingNote[]);
    setGoals((gs ?? []) as Goal[]);
    setAllShifts((shAll ?? []) as Shift[]);

    setLoading(false);
  };

  const refresh = () => chatter && load(chatter.id);

  // Active = clocked in right now (start in the past, no end yet)
  // Scheduled = future shifts created by an admin (start in the future)
  // Closed = ended shifts
  const activeShifts = useMemo(
    () => shifts.filter((s) => !s.end_at && new Date(s.start_at).getTime() <= Date.now()),
    [shifts, now]
  );
  const scheduledShifts = useMemo(
    () => shifts
      .filter((s) => !s.end_at && new Date(s.start_at).getTime() > Date.now())
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [shifts, now]
  );
  const closedShifts = useMemo(() => shifts.filter((s) => s.end_at), [shifts]);

  // Group scheduled shifts into buckets for calendar-like display
  const groupedSchedule = useMemo(() => {
    const groups: { label: string; shifts: Shift[] }[] = [];
    const today: Shift[] = [];
    const tomorrow: Shift[] = [];
    const thisWeek: Shift[] = [];
    const nextWeek: Shift[] = [];
    const later: Shift[] = [];
    const nextWeekStart = startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 0 });
    const nextWeekEnd = endOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 0 });
    for (const s of scheduledShifts) {
      const d = new Date(s.start_at);
      if (isToday(d)) today.push(s);
      else if (isTomorrow(d)) tomorrow.push(s);
      else if (isThisWeek(d, { weekStartsOn: 0 })) thisWeek.push(s);
      else if (isWithinInterval(d, { start: nextWeekStart, end: nextWeekEnd })) nextWeek.push(s);
      else later.push(s);
    }
    if (today.length) groups.push({ label: "Today", shifts: today });
    if (tomorrow.length) groups.push({ label: "Tomorrow", shifts: tomorrow });
    if (thisWeek.length) groups.push({ label: "Later this week", shifts: thisWeek });
    if (nextWeek.length) groups.push({ label: "Next week", shifts: nextWeek });
    if (later.length) groups.push({ label: "Later", shifts: later });
    return groups;
  }, [scheduledShifts]);

  const localTzAbbr = useMemo(() => {
    try {
      // E.g. "EST", "PST", "GMT+5", etc. — best-effort, browser-dependent.
      const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date());
      return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    } catch {
      return "";
    }
  }, []);

  // Pick the right account list based on role + selected creator
  const availableAccounts = useMemo((): PlatformAccount[] => {
    if (!chatter) return [];
    let pool: PlatformAccount[] = [];
    if (chatter.role === "reddit_va") pool = redditAccounts;
    else if (chatter.role === "instagram_va") pool = instagramAccounts;
    else if (chatter.role === "facebook_va") pool = facebookAccounts;
    if (!pickedCreatorId) return pool;
    return pool.filter((a) => a.creator_id === pickedCreatorId);
  }, [chatter, pickedCreatorId, redditAccounts, instagramAccounts, facebookAccounts]);

  const needsAccountPicker = !!chatter && ["reddit_va", "instagram_va", "facebook_va"].includes(chatter.role);

  const onClockIn = async () => {
    if (!chatter) return;
    if (!pickedCreatorId) return toast.error("Pick a creator before clocking in.");
    if (needsAccountPicker && !pickedAccountId) {
      return toast.error(`Pick which ${roleLabels[chatter.role]?.replace(" VA", "") ?? "platform"} account.`);
    }
    setClockingIn(true);
    const platform = targetPlatformForRole(chatter.role);
    const acct = availableAccounts.find((a) => a.id === pickedAccountId);
    const { error } = await supabase.from("shifts").insert({
      chatter_id: chatter.id,
      creator_id: pickedCreatorId,
      start_at: new Date().toISOString(),
      target_platform: platform,
      target_account_id: pickedAccountId || null,
      target_account_name: acct?.label ?? null,
    });
    setClockingIn(false);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "clock_in",
      entity_type: "shift",
      entity_name: `${chatter.name} → ${creators.find((c) => c.id === pickedCreatorId)?.name ?? "creator"}`,
      details: acct?.label ? `on ${acct.label}` : null,
    });
    toast.success("Clocked in");
    setPickedCreatorId("");
    setPickedAccountId("");
    refresh();
  };

  const openClockOut = (shift: Shift) => {
    setClockOutShift(shift);
    setClockOutForm({
      ppv_count: "", ppv_revenue: "", tips_revenue: "",
      custom_revenue: "", message_count: "",
      posts_count: "", upvotes_count: "", comments_received: "", dms_handled: "",
      notes: "",
    });
  };

  const onClockOut = async () => {
    if (!clockOutShift || !chatter) return;
    setSavingClockOut(true);
    const ppv = parseFloat(clockOutForm.ppv_revenue) || 0;
    const tips = parseFloat(clockOutForm.tips_revenue) || 0;
    const custom = parseFloat(clockOutForm.custom_revenue) || 0;
    const payload = {
      end_at: new Date().toISOString(),
      ppv_count: parseInt(clockOutForm.ppv_count) || 0,
      ppv_revenue: ppv,
      tips_revenue: tips,
      custom_revenue: custom,
      total_revenue: ppv + tips + custom,
      message_count: parseInt(clockOutForm.message_count) || 0,
      posts_count: parseInt(clockOutForm.posts_count) || 0,
      upvotes_count: parseInt(clockOutForm.upvotes_count) || 0,
      comments_received: parseInt(clockOutForm.comments_received) || 0,
      dms_handled: parseInt(clockOutForm.dms_handled) || 0,
      notes: clockOutForm.notes.trim() || null,
    };
    const { error } = await supabase.from("shifts").update(payload).eq("id", clockOutShift.id);
    setSavingClockOut(false);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "clock_out",
      entity_type: "shift",
      entity_id: clockOutShift.id,
      entity_name: chatter.name,
      details: payload.total_revenue > 0 ? `Logged $${payload.total_revenue.toFixed(0)} this shift` : null,
    });
    toast.success("Clocked out");
    setClockOutShift(null);
    refresh();
  };

  const onLogout = () => {
    localStorage.removeItem("agency_session");
    window.dispatchEvent(new Event("agency-auth-changed"));
    navigate({ to: "/login" });
  };

  const elapsed = (startAt: string): string => {
    const ms = now - new Date(startAt).getTime();
    if (ms < 0) return "0:00:00";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const creatorName = (id: string) => creators.find((c) => c.id === id)?.name ?? "—";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-32 w-32 rounded-full bg-card border border-border animate-pulse" />
      </div>
    );
  }

  if (!chatter) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <p className="text-sm text-muted-foreground">Your staff record can't be found. Contact your admin.</p>
          <Button onClick={onLogout} variant="outline">Sign out</Button>
        </div>
      </div>
    );
  }

  const isChatter = chatter.role === "chatter";
  const isVA = ["reddit_va", "instagram_va", "facebook_va", "x_va", "tiktok_va", "social_media_va"].includes(chatter.role);

  // ── Tab content (all defined as fragments to capture closure state) ───────

  const todayContent = (
    <TodayTab
      chatter={chatter}
      creators={creators}
      assignments={assignments}
      announcements={announcements}
      activeShifts={activeShifts}
      groupedSchedule={groupedSchedule}
      pickedCreatorId={pickedCreatorId}
      setPickedCreatorId={setPickedCreatorId}
      pickedAccountId={pickedAccountId}
      setPickedAccountId={setPickedAccountId}
      availableAccounts={availableAccounts}
      needsAccountPicker={needsAccountPicker}
      clockingIn={clockingIn}
      onClockIn={onClockIn}
      openClockOut={openClockOut}
      elapsed={elapsed}
      creatorName={creatorName}
      localTzAbbr={localTzAbbr}
    />
  );

  const performanceContent = (
    <PerformanceTab
      chatter={chatter}
      shifts={allShifts}
      goals={goals}
    />
  );

  const payContent = (
    <PayTab chatter={chatter} payouts={payouts} shifts={allShifts} />
  );

  const scheduleContent = (
    <ScheduleTab
      groupedSchedule={groupedSchedule}
      closedShifts={closedShifts}
      creatorName={creatorName}
      chatter={chatter}
    />
  );

  const trainingContent = (
    <TrainingTab
      chatter={chatter}
      creators={creators}
      assignments={assignments}
      materials={trainingMaterials}
      scripts={scripts}
    />
  );

  const coachingContent = (
    <CoachingTab notes={coachingNotes} goals={goals} />
  );

  const navItems: Array<{ id: StaffTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: "today",       label: "Today",          icon: LayoutDashboard },
    { id: "performance", label: "My Performance", icon: TrendingUp },
    { id: "pay",         label: "Pay",            icon: DollarSign },
    { id: "schedule",    label: "Schedule",       icon: Calendar },
    { id: "training",    label: "Training",       icon: GraduationCap },
    { id: "coaching",    label: "Coaching",       icon: MessageCircle },
  ];

  // Pinned, non-expired announcement count (a small badge in the sidebar)
  const newAnnouncementCount = announcements.filter((a) => a.pinned).length;

  return (
    <div className="flex min-h-screen bg-background">
      <Toaster />

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-card/30 backdrop-blur-sm">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary-glow shadow-[0_4px_20px_-4px_oklch(0.6_0.15_35/0.5)] shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate">{agencyName}</div>
            <div className="text-[10px] text-muted-foreground -mt-0.5 tracking-wide">Staff portal</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-0.5">
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`relative flex w-full items-center gap-3 rounded-lg pl-4 pr-3 py-2 text-sm transition-all duration-150 ease-out hover:translate-x-px before:content-[''] before:absolute before:left-1 before:top-1/2 before:-translate-y-1/2 before:h-1/2 before:w-[3px] before:rounded-full before:transition-colors ${
                  active
                    ? "bg-primary/10 text-foreground font-medium before:bg-primary"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground before:bg-transparent"
                }`}
              >
                <span className={`h-4 w-4 shrink-0 flex items-center justify-center ${active ? "text-primary" : ""}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-left">{label}</span>
                {id === "today" && newAnnouncementCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold">
                    {newAnnouncementCount}
                  </span>
                )}
                {id === "coaching" && coachingNotes.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                    {coachingNotes.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom: profile + sign out */}
        <div className="border-t border-border px-3 py-3 space-y-1">
          <div className="px-3 py-2">
            <div className="text-xs font-semibold truncate">{chatter.name}</div>
            <div className="text-[10px] text-muted-foreground truncate">{roleLabels[chatter.role] ?? "Staff"}</div>
            {(chatter.commission_pct > 0 || chatter.hourly_rate != null) && (
              <div className="text-[10px] text-muted-foreground/80 mt-1 space-x-1">
                {chatter.commission_pct > 0 && <span>{chatter.commission_pct}% comm</span>}
                {chatter.commission_pct > 0 && chatter.hourly_rate != null && <span>·</span>}
                {chatter.hourly_rate != null && <span>${chatter.hourly_rate}/hr</span>}
              </div>
            )}
          </div>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-lg pl-4 pr-3 py-2 text-sm text-muted-foreground transition-all duration-150 ease-out hover:bg-destructive/10 hover:text-destructive hover:translate-x-px"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="ml-60 flex-1 min-h-screen">
        <div className="mx-auto max-w-5xl px-8 py-8 space-y-8">
        {tab === "today" && todayContent}
        {tab === "performance" && performanceContent}
        {tab === "pay" && payContent}
        {tab === "schedule" && scheduleContent}
        {tab === "training" && trainingContent}
        {tab === "coaching" && coachingContent}
        </div>
      </main>

      {/* Clock out dialog with role-specific fields */}
      <Dialog open={!!clockOutShift} onOpenChange={(o) => { if (!o) setClockOutShift(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Square className="h-4 w-4" />
              Clock out — {clockOutShift && creatorName(clockOutShift.creator_id)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {clockOutShift?.target_account_name && (
              <div className="rounded-md bg-secondary/40 px-2 py-1.5 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                Account: <span className="font-medium text-foreground">{clockOutShift.target_account_name}</span>
              </div>
            )}

            {/* Chatter form */}
            {isChatter && (
              <>
                <p className="text-xs text-muted-foreground">
                  Optional: log what you sold this shift. Leave blank if you didn't track.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">PPVs sold</Label>
                    <Input
                      type="number"
                      value={clockOutForm.ppv_count}
                      onChange={(e) => setClockOutForm({ ...clockOutForm, ppv_count: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">PPV revenue ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={clockOutForm.ppv_revenue}
                      onChange={(e) => setClockOutForm({ ...clockOutForm, ppv_revenue: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tips ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={clockOutForm.tips_revenue}
                      onChange={(e) => setClockOutForm({ ...clockOutForm, tips_revenue: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Custom content ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={clockOutForm.custom_revenue}
                      onChange={(e) => setClockOutForm({ ...clockOutForm, custom_revenue: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Messages sent <span className="text-muted-foreground">(opt)</span></Label>
                  <Input
                    type="number"
                    value={clockOutForm.message_count}
                    onChange={(e) => setClockOutForm({ ...clockOutForm, message_count: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </>
            )}

            {/* Reddit VA form */}
            {chatter.role === "reddit_va" && (
              <>
                <p className="text-xs text-muted-foreground">
                  Log your Reddit activity for this shift.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Posts made</Label>
                    <Input
                      type="number"
                      value={clockOutForm.posts_count}
                      onChange={(e) => setClockOutForm({ ...clockOutForm, posts_count: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Total upvotes earned</Label>
                    <Input
                      type="number"
                      value={clockOutForm.upvotes_count}
                      onChange={(e) => setClockOutForm({ ...clockOutForm, upvotes_count: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Comments received <span className="text-muted-foreground">(opt)</span></Label>
                  <Input
                    type="number"
                    value={clockOutForm.comments_received}
                    onChange={(e) => setClockOutForm({ ...clockOutForm, comments_received: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </>
            )}

            {/* Instagram / Facebook / X / TikTok / generic Social VA form */}
            {(chatter.role === "instagram_va" || chatter.role === "facebook_va" || chatter.role === "x_va" || chatter.role === "tiktok_va" || chatter.role === "social_media_va") && (
              <>
                <p className="text-xs text-muted-foreground">
                  Log your activity on this shift.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Posts/stories made</Label>
                    <Input
                      type="number"
                      value={clockOutForm.posts_count}
                      onChange={(e) => setClockOutForm({ ...clockOutForm, posts_count: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {chatter.role === "facebook_va" ? "Reactions" : chatter.role === "x_va" ? "Likes/retweets" : "Likes earned"}
                    </Label>
                    <Input
                      type="number"
                      value={clockOutForm.upvotes_count}
                      onChange={(e) => setClockOutForm({ ...clockOutForm, upvotes_count: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Comments received</Label>
                    <Input
                      type="number"
                      value={clockOutForm.comments_received}
                      onChange={(e) => setClockOutForm({ ...clockOutForm, comments_received: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">DMs handled</Label>
                    <Input
                      type="number"
                      value={clockOutForm.dms_handled}
                      onChange={(e) => setClockOutForm({ ...clockOutForm, dms_handled: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Content editor / recruiter / manager / other - just notes */}
            {!isChatter && !isVA && (
              <p className="text-xs text-muted-foreground">
                Optional: leave a note about what you got done this shift.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input
                value={clockOutForm.notes}
                onChange={(e) => setClockOutForm({ ...clockOutForm, notes: e.target.value })}
                placeholder="What got done, any context"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClockOutShift(null)}>Cancel</Button>
            <Button onClick={onClockOut} disabled={savingClockOut} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {savingClockOut ? "Saving…" : "Clock out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Tab components
// ════════════════════════════════════════════════════════════════════════════

// ── Today tab: announcements + clock in/out + today's schedule ─────────────

function TodayTab(props: {
  chatter: Chatter;
  creators: Creator[];
  assignments: Assignment[];
  announcements: Announcement[];
  activeShifts: Shift[];
  groupedSchedule: { label: string; shifts: Shift[] }[];
  pickedCreatorId: string;
  setPickedCreatorId: (v: string) => void;
  pickedAccountId: string;
  setPickedAccountId: (v: string) => void;
  availableAccounts: PlatformAccount[];
  needsAccountPicker: boolean;
  clockingIn: boolean;
  onClockIn: () => void;
  openClockOut: (s: Shift) => void;
  elapsed: (s: string) => string;
  creatorName: (id: string) => string;
  localTzAbbr: string;
}) {
  const {
    chatter, creators, assignments, announcements, activeShifts, groupedSchedule,
    pickedCreatorId, setPickedCreatorId, pickedAccountId, setPickedAccountId,
    availableAccounts, needsAccountPicker, clockingIn, onClockIn, openClockOut,
    elapsed, creatorName, localTzAbbr,
  } = props;

  const today = groupedSchedule.find((g) => g.label === "Today");

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hi {chatter.name.split(" ")[0]} — {format(new Date(), "EEEE, MMM d")}.
        </p>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            Announcements
          </h2>
          <div className="space-y-2">
            {announcements.map((a) => (
              <div
                key={a.id}
                className={`rounded-xl border p-4 ${
                  a.pinned
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <Megaphone className={`h-4 w-4 shrink-0 mt-0.5 ${a.pinned ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm whitespace-pre-wrap text-foreground/90">{a.body}</div>
                    <div className="text-[11px] text-muted-foreground mt-1.5">
                      {a.created_by ? `${a.created_by} · ` : ""}
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active shifts */}
      {activeShifts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            You're clocked in
          </h2>
          {activeShifts.map((s) => (
            <div key={s.id} className="rounded-2xl border-2 border-success/40 bg-success/5 p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Working with</div>
                  <div className="text-2xl font-bold">{creatorName(s.creator_id)}</div>
                  {s.target_account_name && (
                    <div className="text-xs text-primary mt-0.5 font-medium">on {s.target_account_name}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    Started {format(new Date(s.start_at), "h:mm a")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Elapsed</div>
                  <div className="text-3xl font-mono font-bold tabular-nums">{elapsed(s.start_at)}</div>
                </div>
              </div>
              <Button
                size="lg"
                className="w-full mt-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={() => openClockOut(s)}
              >
                <Square className="h-4 w-4 mr-2" fill="currentColor" />
                Clock out
              </Button>
            </div>
          ))}
        </section>
      )}

      {/* Clock in */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          {activeShifts.length > 0 ? "Start another shift" : "Start a shift"}
        </h2>
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Working for which creator?</Label>
            <Select value={pickedCreatorId} onValueChange={(v) => { setPickedCreatorId(v); setPickedAccountId(""); }}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Pick a creator" /></SelectTrigger>
              <SelectContent>
                {creators.length === 0 ? (
                  <SelectItem value="none" disabled>No creators available</SelectItem>
                ) : (
                  creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
                )}
              </SelectContent>
            </Select>
            {assignments.length === 0 && (
              <div className="text-[11px] text-muted-foreground">No specific creators assigned to you — pick any.</div>
            )}
          </div>

          {needsAccountPicker && (
            <div className="space-y-1.5">
              <Label>
                Which {chatter.role === "reddit_va" ? "Reddit" : chatter.role === "instagram_va" ? "Instagram" : "Facebook"} account?
              </Label>
              <Select
                value={pickedAccountId}
                onValueChange={setPickedAccountId}
                disabled={!pickedCreatorId}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={pickedCreatorId ? "Pick an account" : "Pick a creator first"} />
                </SelectTrigger>
                <SelectContent>
                  {availableAccounts.length === 0 ? (
                    <SelectItem value="none" disabled>
                      {pickedCreatorId ? "No accounts available for this creator" : "Pick a creator first"}
                    </SelectItem>
                  ) : (
                    availableAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}{a.sublabel ? ` · ${a.sublabel}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <div className="text-[11px] text-muted-foreground">
                You'll log this account's stats when you clock out.
              </div>
            </div>
          )}

          <Button
            size="lg"
            className="w-full"
            disabled={!pickedCreatorId || (needsAccountPicker && !pickedAccountId) || clockingIn}
            onClick={onClockIn}
          >
            <Play className="h-4 w-4 mr-2" fill="currentColor" />
            {clockingIn ? "Starting…" : "Clock in"}
          </Button>
        </div>
      </section>

      {/* Today's scheduled shifts */}
      {today && today.shifts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            On your schedule today {localTzAbbr ? `(${localTzAbbr})` : ""}
          </h2>
          <div className="space-y-1.5">
            {today.shifts.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-semibold">{format(new Date(s.start_at), "h:mm a")}</div>
                  <div className="text-xs text-muted-foreground">
                    for {creatorName(s.creator_id)}
                    {s.target_account_name && <> · on {s.target_account_name}</>}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  in {formatDistanceToNow(new Date(s.start_at))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── My Performance tab: personal stats from shifts data ─────────────────────

function PerformanceTab({ chatter, shifts, goals }: { chatter: Chatter; shifts: Shift[]; goals: Goal[] }) {
  const closedShifts = shifts.filter((s) => s.end_at);

  const sumFor = (sinceDays: number) => {
    const cutoff = subDays(new Date(), sinceDays);
    const filtered = closedShifts.filter((s) => new Date(s.start_at) >= cutoff);
    const totalRevenue = filtered.reduce((sum, s) => sum + s.total_revenue, 0);
    const totalHours = filtered.reduce((sum, s) => sum + (s.end_at ? (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600_000 : 0), 0);
    const totalPpv = filtered.reduce((sum, s) => sum + s.ppv_count, 0);
    return {
      revenue: totalRevenue,
      hours: totalHours,
      shifts: filtered.length,
      perHour: totalHours > 0 ? totalRevenue / totalHours : 0,
      ppv: totalPpv,
    };
  };

  const week = sumFor(7);
  const month = sumFor(30);
  const ninety = sumFor(90);

  // Daily revenue chart for last 30 days
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfDay(subDays(new Date(), 29)), end: startOfDay(new Date()) });
    const map: Record<string, number> = {};
    for (const d of days) map[format(d, "yyyy-MM-dd")] = 0;
    for (const s of closedShifts) {
      const day = format(parseISO(s.start_at), "yyyy-MM-dd");
      if (map[day] !== undefined) map[day] += s.total_revenue;
    }
    return days.map((d) => ({ day: format(d, "MMM d"), value: map[format(d, "yyyy-MM-dd")] ?? 0 }));
  }, [closedShifts]);

  const activeGoals = goals.filter((g) => parseISO(g.period_end) >= new Date());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">Your numbers — across the last 7, 30, and 90 days.</p>
      </div>

      {/* KPI cards: 7d / 30d / 90d */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Last 7 days", data: week },
          { label: "Last 30 days", data: month },
          { label: "Last 90 days", data: ninety },
        ].map((p) => (
          <div key={p.label} className="rounded-xl border border-border bg-card p-5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.label}</div>
            <div className="mt-2 text-2xl font-bold">${Math.round(p.data.revenue).toLocaleString()}</div>
            <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
              <div className="flex justify-between"><span>Hours</span><span className="font-medium text-foreground">{p.data.hours.toFixed(1)}h</span></div>
              <div className="flex justify-between"><span>Shifts</span><span className="font-medium text-foreground">{p.data.shifts}</span></div>
              <div className="flex justify-between"><span>$ per hour</span><span className="font-medium text-foreground">${Math.round(p.data.perHour)}</span></div>
              {chatter.role === "chatter" && (
                <div className="flex justify-between"><span>PPVs sold</span><span className="font-medium text-foreground">{p.data.ppv}</span></div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Goals */}
      {activeGoals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Active goals
          </h2>
          <div className="space-y-2">
            {activeGoals.map((g) => {
              // Compute progress across the goal period
              const start = parseISO(g.period_start);
              const end = parseISO(g.period_end);
              const inRange = closedShifts.filter((s) => {
                const d = parseISO(s.start_at);
                return d >= start && d <= end;
              });
              const actual =
                g.metric === "hours"
                  ? inRange.reduce((sum, s) => sum + (s.end_at ? (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600_000 : 0), 0)
                  : g.metric === "shifts"
                    ? inRange.length
                    : g.metric === "ppv_count"
                      ? inRange.reduce((sum, s) => sum + s.ppv_count, 0)
                      : inRange.reduce((sum, s) => sum + s.total_revenue, 0);
              const pct = g.target_amount === 0 ? 0 : Math.min(150, Math.round((actual / g.target_amount) * 100));
              const onTrack = actual >= g.target_amount;
              const fmtVal = (v: number) =>
                g.metric === "revenue" ? `$${Math.round(v).toLocaleString()}` :
                g.metric === "hours" ? `${v.toFixed(1)}h` :
                v.toString();
              return (
                <div key={g.id} className={`rounded-xl border p-4 ${onTrack ? "border-success/30 bg-success/5" : "border-border bg-card"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{g.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(start, "MMM d")} – {format(end, "MMM d, yyyy")} · set by {g.set_by || "manager"}
                      </div>
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${onTrack ? "text-success" : "text-foreground"}`}>{pct}%</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{fmtVal(actual)} / <span className="text-foreground font-medium">{fmtVal(g.target_amount)}</span></span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${onTrack ? "bg-success" : "bg-gradient-to-r from-primary to-primary-glow"}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Daily revenue chart */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" /> Daily revenue · last 30 days
        </h2>
        <div className="rounded-xl border border-border bg-card p-4">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.5 0 0 / 0.15)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={3} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(v: number) => `$${v.toFixed(0)}`}
                contentStyle={{ background: "oklch(0.22 0.014 55)", border: "1px solid oklch(0.30 0.014 55)", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="value" fill="oklch(0.7 0.16 38)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Recent shifts */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Last 10 shifts</h2>
        {closedShifts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No completed shifts yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {closedShifts.slice(0, 10).map((s) => {
              const hours = s.end_at ? (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600_000 : 0;
              return (
                <div key={s.id} className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-xs font-semibold">{format(new Date(s.start_at), "EEE, MMM d · h:mm a")}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {hours.toFixed(1)}h · ${hours > 0 ? Math.round(s.total_revenue / hours) : 0}/hr
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-success">${s.total_revenue.toFixed(0)}</div>
                    {s.ppv_count > 0 && <div className="text-[10px] text-muted-foreground">{s.ppv_count} PPVs</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Pay tab: payouts + current period accrued ──────────────────────────────

function PayTab({ chatter, payouts, shifts }: { chatter: Chatter; payouts: Payout[]; shifts: Shift[] }) {
  // Period accrued = shifts since the last paid period_end
  const lastPaid = payouts.find((p) => p.paid_at);
  const sinceDate = lastPaid ? parseISO(lastPaid.period_end) : subDays(new Date(), 14);
  const accruedShifts = shifts.filter((s) => s.end_at && parseISO(s.start_at) > sinceDate);
  const accruedRevenue = accruedShifts.reduce((sum, s) => sum + s.total_revenue, 0);
  const accruedHours = accruedShifts.reduce((sum, s) => sum + (s.end_at ? (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600_000 : 0), 0);
  const accruedCommission = (chatter.commission_pct / 100) * accruedRevenue;
  const accruedHourly = (chatter.hourly_rate ?? 0) * accruedHours;
  const accruedTotal = accruedCommission + accruedHourly;

  const totalPaid = payouts.filter((p) => p.paid_at).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pay</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your earnings — what's accrued this period, plus full payout history.
        </p>
      </div>

      {/* Rate card */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Your rate</div>
        <div className="flex flex-wrap gap-6">
          {chatter.commission_pct > 0 && (
            <div>
              <div className="text-2xl font-bold">{chatter.commission_pct}%</div>
              <div className="text-[11px] text-muted-foreground">commission on revenue logged</div>
            </div>
          )}
          {chatter.hourly_rate != null && chatter.hourly_rate > 0 && (
            <div>
              <div className="text-2xl font-bold">${chatter.hourly_rate}/hr</div>
              <div className="text-[11px] text-muted-foreground">flat hourly</div>
            </div>
          )}
          {chatter.commission_pct === 0 && (chatter.hourly_rate == null || chatter.hourly_rate === 0) && (
            <div className="text-sm text-muted-foreground">Your rate isn't configured yet — ask your manager.</div>
          )}
        </div>
      </div>

      {/* Current period accrued */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">This period · accrued</h2>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="text-3xl font-bold">${accruedTotal.toFixed(2)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            since {format(sinceDate, "MMM d")} · {accruedShifts.length} shift{accruedShifts.length === 1 ? "" : "s"} · {accruedHours.toFixed(1)}h · ${Math.round(accruedRevenue)} revenue logged
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            {accruedCommission > 0 && (
              <div>
                <div className="text-muted-foreground">Commission</div>
                <div className="font-semibold">${accruedCommission.toFixed(2)}</div>
              </div>
            )}
            {accruedHourly > 0 && (
              <div>
                <div className="text-muted-foreground">Hourly</div>
                <div className="font-semibold">${accruedHourly.toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Payout history */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold flex items-center justify-between">
          <span>Payout history</span>
          <span className="text-xs font-normal text-muted-foreground">
            ${totalPaid.toFixed(0)} paid total
          </span>
        </h2>
        {payouts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No payouts yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {payouts.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold">${p.amount.toFixed(2)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {format(parseISO(p.period_start), "MMM d")} – {format(parseISO(p.period_end), "MMM d, yyyy")} · {p.shifts_count} shift{p.shifts_count === 1 ? "" : "s"} · {p.hours.toFixed(1)}h
                    </div>
                  </div>
                  <div className="text-right">
                    {p.paid_at ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-success/30 bg-success/10 text-success">
                        <Check className="h-2.5 w-2.5" />
                        Paid {format(parseISO(p.paid_at), "MMM d")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded border border-warning/30 bg-warning/10 text-warning">
                        Pending
                      </span>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-0.5 space-x-1">
                      {p.commission_amount > 0 && <span>${p.commission_amount.toFixed(0)} comm</span>}
                      {p.commission_amount > 0 && p.hourly_amount > 0 && <span>·</span>}
                      {p.hourly_amount > 0 && <span>${p.hourly_amount.toFixed(0)} hourly</span>}
                    </div>
                  </div>
                </div>
                {p.notes && <div className="text-[11px] text-muted-foreground mt-2 italic">{p.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Schedule tab ────────────────────────────────────────────────────────────

function ScheduleTab({
  groupedSchedule, closedShifts, creatorName, chatter,
}: {
  groupedSchedule: { label: string; shifts: Shift[] }[];
  closedShifts: Shift[];
  creatorName: (id: string) => string;
  chatter: Chatter;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
        <p className="text-sm text-muted-foreground mt-1">Your upcoming and past shifts.</p>
      </div>

      {/* Upcoming */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Upcoming</h2>
        {groupedSchedule.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No upcoming shifts scheduled.
          </div>
        ) : (
          groupedSchedule.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <div className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-[0.18em] px-1">
                {group.label}
              </div>
              {group.shifts.map((s) => {
                const start = new Date(s.start_at);
                const end = s.end_at ? new Date(s.end_at) : null;
                const dur = end ? (end.getTime() - start.getTime()) / 3600_000 : null;
                return (
                  <div key={s.id} className="rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-semibold">
                        {format(start, "EEE, MMM d")} · {format(start, "h:mm a")}
                        {end && <> – {format(end, "h:mm a")}</>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        for {creatorName(s.creator_id)}
                        {s.target_account_name && <> · on {s.target_account_name}</>}
                      </div>
                    </div>
                    <div className="text-right">
                      {dur != null && <div className="text-xs font-medium">{dur.toFixed(1)}h</div>}
                      <div className="text-[10px] text-muted-foreground">in {formatDistanceToNow(start)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </section>

      {/* Past */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Past</h2>
        {closedShifts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No past shifts yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {closedShifts.slice(0, 30).map((s) => {
              const hours = s.end_at ? (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600_000 : 0;
              return (
                <div key={s.id} className="rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold">{creatorName(s.creator_id)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {format(new Date(s.start_at), "EEE, MMM d · h:mm a")}
                      {s.end_at && <> → {format(new Date(s.end_at), "h:mm a")}</>}
                      {" · "}
                      {hours.toFixed(1)}h
                    </div>
                  </div>
                  <div className="text-right">
                    {s.total_revenue > 0 && <div className="text-sm font-semibold text-success">${s.total_revenue.toFixed(0)}</div>}
                    {chatter.role !== "chatter" && s.posts_count > 0 && (
                      <div className="text-[11px] text-muted-foreground">{s.posts_count} posts</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Training tab ────────────────────────────────────────────────────────────

const TRAINING_CATEGORY_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  policies: "Policies",
  playbook: "Per-creator playbooks",
  tactics: "Tactics & best practices",
  compliance: "Compliance",
  other: "Other",
};

const SCRIPT_CATEGORY_LABELS: Record<string, string> = {
  opener: "Openers",
  tease: "Teases",
  ppv_unlock: "PPV unlocks",
  tip_bait: "Tip bait",
  vip_recovery: "VIP recovery",
  custom_request: "Custom requests",
  other: "Other",
};

function TrainingTab({
  chatter, creators, assignments, materials, scripts,
}: {
  chatter: Chatter;
  creators: Creator[];
  assignments: Assignment[];
  materials: TrainingMaterial[];
  scripts: Script[];
}) {
  // Materials are filtered server-side to scope=all or scope=role.
  // Per-creator playbooks: only show materials whose creator_id is in this chatter's assigned set
  // (or is unassigned — meaning agency-wide).
  const assignedCreatorIds = new Set(assignments.map((a) => a.creator_id));
  const generalMaterials = materials.filter((m) => !m.creator_id);
  const playbooks = materials.filter((m) => m.creator_id && (assignedCreatorIds.size === 0 || assignedCreatorIds.has(m.creator_id)));

  // Group materials by category
  const grouped = useMemo(() => {
    const out: Record<string, TrainingMaterial[]> = {};
    for (const m of generalMaterials) {
      const c = m.category ?? "other";
      if (!out[c]) out[c] = [];
      out[c].push(m);
    }
    return out;
  }, [generalMaterials]);

  // Group scripts by category, scoped to creators assigned to this chatter
  const filteredScripts = scripts.filter((s) => !s.creator_id || assignedCreatorIds.size === 0 || assignedCreatorIds.has(s.creator_id));
  const groupedScripts = useMemo(() => {
    const out: Record<string, Script[]> = {};
    for (const s of filteredScripts) {
      if (!out[s.category]) out[s.category] = [];
      out[s.category].push(s);
    }
    return out;
  }, [filteredScripts]);

  const playbooksByCreator = useMemo(() => {
    const out: Record<string, TrainingMaterial[]> = {};
    for (const m of playbooks) {
      const k = m.creator_id ?? "general";
      if (!out[k]) out[k] = [];
      out[k].push(m);
    }
    return out;
  }, [playbooks]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Training</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Onboarding modules, per-creator playbooks, and the script library.
        </p>
      </div>

      {/* General training materials (by category) */}
      {Object.keys(grouped).length > 0 ? (
        Object.entries(grouped).map(([cat, items]) => (
          <section key={cat} className="space-y-3">
            <h2 className="text-base font-semibold">{TRAINING_CATEGORY_LABELS[cat] ?? cat}</h2>
            <div className="space-y-2">
              {items.map((m) => <TrainingMaterialCard key={m.id} m={m} />)}
            </div>
          </section>
        ))
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
          No training materials posted yet. Your manager will add them here.
        </div>
      )}

      {/* Per-creator playbooks */}
      {Object.keys(playbooksByCreator).length > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Per-creator playbooks
          </h2>
          {Object.entries(playbooksByCreator).map(([cid, items]) => {
            const cName = creators.find((c) => c.id === cid)?.name ?? "(unknown creator)";
            return (
              <div key={cid} className="space-y-2">
                <div className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-[0.18em]">
                  {cName}
                </div>
                <div className="space-y-2">
                  {items.map((m) => <TrainingMaterialCard key={m.id} m={m} />)}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Script library — only for chatter role */}
      {chatter.role === "chatter" && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Script library</h2>
          {Object.keys(groupedScripts).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
              No scripts in the library yet. Your manager will add them here.
            </div>
          ) : (
            Object.entries(groupedScripts).map(([cat, items]) => (
              <div key={cat} className="space-y-2">
                <div className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-[0.18em]">
                  {SCRIPT_CATEGORY_LABELS[cat] ?? cat}
                </div>
                <div className="space-y-1.5">
                  {items.map((s) => <ScriptCard key={s.id} s={s} creatorName={creators.find((c) => c.id === s.creator_id)?.name} />)}
                </div>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}

function TrainingMaterialCard({ m }: { m: TrainingMaterial }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-sm font-semibold">{m.label}</div>
      {m.video_url && (
        <a
          href={m.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Play className="h-3 w-3" fill="currentColor" /> Watch video
        </a>
      )}
      {m.body && (
        <div className="mt-2 text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">
          {m.body}
        </div>
      )}
    </div>
  );
}

function ScriptCard({ s, creatorName }: { s: Script; creatorName?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    await navigator.clipboard.writeText(s.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="group rounded-xl border border-border bg-card p-3 hover:bg-secondary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold flex items-center gap-2">
            {s.label}
            {creatorName && <span className="text-[10px] font-normal text-muted-foreground">· {creatorName}</span>}
          </div>
          <div className="text-xs text-foreground/85 mt-1 whitespace-pre-wrap leading-relaxed">{s.body}</div>
        </div>
        <button
          onClick={onCopy}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all text-[11px] flex items-center gap-1 shrink-0"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// ── Coaching tab: manager notes + goals visible to staff ────────────────────

function CoachingTab({ notes, goals }: { notes: CoachingNote[]; goals: Goal[] }) {
  const activeGoals = goals.filter((g) => parseISO(g.period_end) >= new Date());
  const pastGoals = goals.filter((g) => parseISO(g.period_end) < new Date());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Coaching</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Notes from your manager and goals set for you.
        </p>
      </div>

      {/* Goals */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Goals
        </h2>
        {activeGoals.length === 0 && pastGoals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No goals set yet.
          </div>
        ) : (
          <>
            {activeGoals.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-[0.18em]">Active</div>
                {activeGoals.map((g) => (
                  <div key={g.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="text-sm font-semibold">{g.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Target: <span className="text-foreground font-medium">
                        {g.metric === "revenue" ? `$${Math.round(g.target_amount).toLocaleString()}` :
                         g.metric === "hours" ? `${g.target_amount}h` :
                         `${g.target_amount} ${g.metric}`}
                      </span>
                      {" · "}
                      {format(parseISO(g.period_start), "MMM d")} – {format(parseISO(g.period_end), "MMM d, yyyy")}
                      {g.set_by && ` · set by ${g.set_by}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {pastGoals.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-[0.18em]">Past</div>
                {pastGoals.slice(0, 5).map((g) => (
                  <div key={g.id} className="rounded-xl border border-border/50 bg-card/50 p-3 opacity-70">
                    <div className="text-xs font-medium">{g.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      ended {format(parseISO(g.period_end), "MMM d, yyyy")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Coaching notes */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" /> Notes from your manager
        </h2>
        {notes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No coaching notes yet.
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-border bg-card p-4">
                <div className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">{n.body}</div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  {n.created_by ? `${n.created_by} · ` : ""}
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
