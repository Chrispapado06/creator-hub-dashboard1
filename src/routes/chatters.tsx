import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Trash2, Edit2, Check, X, MessageCircle, AlertTriangle,
  DollarSign, Clock, Award, TrendingUp, Flag, Eye, EyeOff, Copy, KeyRound,
  Download, Wallet, History, Search, Briefcase, Globe2, MapPin, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DatePicker, DateTimePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format, formatDistanceToNow, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subWeeks, subMonths, addDays } from "date-fns";
import { logAudit } from "@/lib/audit";
import { StaffPortalAdmin, CoachingDialog } from "@/components/StaffPortalAdmin";
import { GraduationCap, Sparkles, LayoutGrid, Table2, MoreHorizontal, Heart } from "lucide-react";
import { COUNTRIES, flagEmoji, countryByCode } from "@/lib/countries";

export const Route = createFileRoute("/chatters")({ component: ChattersPage });

const fmt$ = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt$0 = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtNum = (n: number) => n.toLocaleString();

// ── Types ─────────────────────────────────────────────────────────────────────
type Creator = { id: string; name: string };
type ChatterStatus = "active" | "paused" | "inactive" | "onboarding";
type Gender = "male" | "female" | "other" | null;
type StaffRole =
  | "chatter"
  | "reddit_va"
  | "instagram_va"
  | "facebook_va"
  | "x_va"
  | "tiktok_va"
  | "social_media_va"
  | "content_editor"
  | "recruiter"
  // Specialized managers
  | "chatter_manager"
  | "reddit_manager"
  | "instagram_manager"
  | "facebook_manager"
  | "x_manager"
  | "tiktok_manager"
  | "social_media_manager"
  | "content_manager"
  // Catch-alls
  | "manager"
  | "other";
type Chatter = {
  id: string;
  name: string;
  email: string | null;
  role: StaffRole;
  status: ChatterStatus;
  commission_pct: number;
  hourly_rate: number | null;
  languages: string | null;
  hire_date: string | null;
  notes: string | null;
  /** ISO 3166-1 alpha-2 country code. Drives the flag chip on the
   *  Subly-style staff card. */
  country: string | null;
  /** Renders ♂ / ♀ next to the name on the card. Optional. */
  gender: Gender;
};
type Assignment = { id: string; chatter_id: string; creator_id: string; active: boolean };
type StaffLogin = { id: string; chatter_id: string | null; username: string; password: string; active: boolean };
type Payout = {
  id: string;
  chatter_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  hours: number | null;
  commission_amount: number | null;
  hourly_amount: number | null;
  shifts_count: number | null;
  paid_at: string;
  paid_by: string | null;
  notes: string | null;
};
type QualityFlag = "off_brand" | "missed_ppv" | "inappropriate" | "late" | "other" | null;
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
  avg_response_seconds: number | null;
  quality_flag: QualityFlag;
  notes: string | null;
};

const statusStyles: Record<ChatterStatus, string> = {
  active:     "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  paused:     "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  inactive:   "bg-muted text-muted-foreground border-border",
  onboarding: "bg-blue-500/12 text-blue-700 dark:text-blue-400 border-blue-500/30",
};
const statusLabels: Record<ChatterStatus, string> = {
  active:     "Active",
  paused:     "Paused",
  inactive:   "Terminated",
  onboarding: "Onboarding",
};
const flagLabels: Record<NonNullable<QualityFlag>, string> = {
  off_brand: "Off-brand",
  missed_ppv: "Missed PPV",
  inappropriate: "Inappropriate",
  late: "Late",
  other: "Other",
};

const roleLabels: Record<StaffRole, string> = {
  chatter: "Chatter",
  reddit_va: "Reddit VA",
  instagram_va: "Instagram VA",
  facebook_va: "Facebook VA",
  x_va: "X VA",
  tiktok_va: "TikTok VA",
  social_media_va: "Social Media VA",
  content_editor: "Content Editor",
  recruiter: "Recruiter",
  chatter_manager: "Chatting Manager",
  reddit_manager: "Reddit Manager",
  instagram_manager: "Instagram Manager",
  facebook_manager: "Facebook Manager",
  x_manager: "X Manager",
  tiktok_manager: "TikTok Manager",
  social_media_manager: "Social Media Manager",
  content_manager: "Content Manager",
  manager: "Manager (general)",
  other: "Other",
};
const roleStyles: Record<StaffRole, string> = {
  chatter: "bg-primary/10 text-primary border-primary/30",
  reddit_va: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  instagram_va: "bg-pink-500/10 text-pink-500 border-pink-500/30",
  facebook_va: "bg-blue-600/10 text-blue-600 border-blue-600/30",
  x_va: "bg-foreground/10 text-foreground border-foreground/30",
  tiktok_va: "bg-cyan-500/10 text-cyan-500 border-cyan-500/30",
  social_media_va: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  content_editor: "bg-purple-500/10 text-purple-500 border-purple-500/30",
  recruiter: "bg-warning/10 text-warning border-warning/30",
  // Managers — same color family as their domain but slightly stronger / saturated
  chatter_manager:      "bg-primary/15 text-primary border-primary/40 ring-1 ring-primary/20",
  reddit_manager:       "bg-orange-500/15 text-orange-500 border-orange-500/40 ring-1 ring-orange-500/20",
  instagram_manager:    "bg-pink-500/15 text-pink-500 border-pink-500/40 ring-1 ring-pink-500/20",
  facebook_manager:     "bg-blue-600/15 text-blue-600 border-blue-600/40 ring-1 ring-blue-600/20",
  x_manager:            "bg-foreground/15 text-foreground border-foreground/40 ring-1 ring-foreground/20",
  tiktok_manager:       "bg-cyan-500/15 text-cyan-500 border-cyan-500/40 ring-1 ring-cyan-500/20",
  social_media_manager: "bg-blue-500/15 text-blue-500 border-blue-500/40 ring-1 ring-blue-500/20",
  content_manager:      "bg-purple-500/15 text-purple-500 border-purple-500/40 ring-1 ring-purple-500/20",
  manager: "bg-success/10 text-success border-success/30",
  other: "bg-muted text-muted-foreground border-border",
};

// ── Helpers ─────────────────────────────────────────────────────────────────────
const shiftHours = (s: Shift): number => {
  if (!s.end_at) return 0;
  return Math.max(0, (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600_000);
};

const earningsFor = (shifts: Shift[], chatter: Chatter | undefined): number => {
  if (!chatter) return 0;
  const totalRev = shifts.reduce((s, sh) => s + sh.total_revenue, 0);
  const commission = totalRev * (chatter.commission_pct / 100);
  if (chatter.hourly_rate != null) {
    const totalHours = shifts.reduce((s, sh) => s + shiftHours(sh), 0);
    return commission + totalHours * chatter.hourly_rate;
  }
  return commission;
};

// ── Main component ─────────────────────────────────────────────────────────────
function ChattersPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [logins, setLogins] = useState<StaffLogin[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const [{ data: cs }, { data: chs }, { data: as }, { data: shs }, { data: ls }, { data: ps }] = await Promise.all([
      supabase.from("creators").select("id, name").order("name"),
      supabase.from("chatters").select("*").order("name"),
      supabase.from("chatter_assignments").select("*"),
      supabase.from("shifts").select("*").order("start_at", { ascending: false }),
      supabase.from("access_codes").select("id, chatter_id, username, password, active").eq("account_type", "staff"),
      supabase.from("staff_payouts").select("*").order("paid_at", { ascending: false }),
    ]);
    setCreators((cs ?? []) as Creator[]);
    setChatters((chs ?? []) as Chatter[]);
    setAssignments((as ?? []) as Assignment[]);
    setShifts((shs ?? []) as Shift[]);
    setLogins((ls ?? []) as StaffLogin[]);
    setPayouts((ps ?? []) as Payout[]);
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(); }, []);
  const refresh = () => load(true);

  return (
    <div className="space-y-6">
      <Toaster />
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <MessageCircle className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Staff</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your team — chatters, social media VAs, editors, recruiters, and managers. Track shifts, performance, and payroll.
        </p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      ) : (
        <Tabs defaultValue="timeclock">
          <TabsList>
            <TabsTrigger value="timeclock">Time Clock</TabsTrigger>
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="shifts">Shifts</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="pay">Pay</TabsTrigger>
            <TabsTrigger value="portal" className="flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" /> Portal Content
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeclock" className="mt-6">
            <TimeClockTab chatters={chatters} creators={creators} shifts={shifts} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="roster" className="mt-6">
            <RosterTab
              chatters={chatters}
              creators={creators}
              assignments={assignments}
              shifts={shifts}
              logins={logins}
              onRefresh={refresh}
            />
          </TabsContent>
          <TabsContent value="shifts" className="mt-6">
            <ShiftsTab
              chatters={chatters}
              creators={creators}
              shifts={shifts}
              onRefresh={refresh}
            />
          </TabsContent>
          <TabsContent value="leaderboard" className="mt-6">
            <LeaderboardTab chatters={chatters} shifts={shifts} />
          </TabsContent>
          <TabsContent value="pay" className="mt-6">
            <PayTab chatters={chatters} shifts={shifts} payouts={payouts} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="portal" className="mt-6">
            <StaffPortalAdmin creators={creators} chatters={chatters} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ── Roster Tab ─────────────────────────────────────────────────────────────────
function RosterTab({
  chatters, creators, assignments, shifts, logins, onRefresh,
}: {
  chatters: Chatter[];
  creators: Creator[];
  assignments: Assignment[];
  shifts: Shift[];
  logins: StaffLogin[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", email: "",
    role: "chatter" as StaffRole,
    status: "active" as ChatterStatus,
    commission_pct: "10", hourly_rate: "",
    languages: "", hire_date: "", notes: "",
    country: "" as string,
    gender: "" as "" | "male" | "female" | "other",
    create_login: false,
    login_username: "",
    login_password: "",
  });
  const [assignDialogOpen, setAssignDialogOpen] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<string>("all");
  // View toggle — table (existing detail-rich layout) or card grid
  // (new Subly-style layout the user just asked for).
  const [viewMode, setViewMode] = useState<"table" | "card">("card");
  // Top-level status filter pills, Subly pattern. "current" = active +
  // onboarding (i.e. not yet terminated/paused).
  const [statusFilter, setStatusFilter] = useState<"current" | ChatterStatus | "all">("current");
  const [searchQuery, setSearchQuery] = useState("");
  const [revealedLogin, setRevealedLogin] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [genLoginFor, setGenLoginFor] = useState<Chatter | null>(null);
  const [coachingFor, setCoachingFor] = useState<Chatter | null>(null);
  const [genForm, setGenForm] = useState({ username: "", password: "" });

  // ── Multi-select state for bulk delete ──────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const visibleChatters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return chatters.filter((c) => {
      if (filterRole !== "all" && c.role !== filterRole) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "current") {
          if (c.status !== "active" && c.status !== "onboarding") return false;
        } else if (c.status !== statusFilter) {
          return false;
        }
      }
      if (q) {
        const hay = `${c.name} ${c.email ?? ""} ${roleLabels[c.role]} ${c.country ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [chatters, filterRole, statusFilter, searchQuery]);
  const allVisibleSelected = visibleChatters.length > 0
    && visibleChatters.every((c) => selectedIds.has(c.id));
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const c of visibleChatters) next.delete(c.id);
        return next;
      }
      const next = new Set(prev);
      for (const c of visibleChatters) next.add(c.id);
      return next;
    });
  };
  const onBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("chatters").delete().in("id", ids);
    setBulkDeleting(false);
    setBulkConfirmOpen(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Removed ${ids.length} staff member${ids.length === 1 ? "" : "s"}`);
    setSelectedIds(new Set());
    onRefresh();
  };

  const startEdit = (c: Chatter) => {
    setForm({
      name: c.name,
      email: c.email ?? "",
      role: c.role,
      status: c.status,
      commission_pct: c.commission_pct.toString(),
      hourly_rate: c.hourly_rate?.toString() ?? "",
      languages: c.languages ?? "",
      hire_date: c.hire_date ?? "",
      notes: c.notes ?? "",
      country: c.country ?? "",
      gender: (c.gender ?? "") as "" | "male" | "female" | "other",
      create_login: false,
      login_username: "",
      login_password: "",
    });
    setEditingId(c.id);
    setOpen(true);
  };

  const onSubmit = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (form.create_login && (!form.login_username.trim() || !form.login_password.trim())) {
      return toast.error("Username and password are required when creating a login");
    }
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      role: form.role,
      status: form.status,
      commission_pct: parseFloat(form.commission_pct) || 0,
      hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
      languages: form.languages.trim() || null,
      hire_date: form.hire_date || null,
      notes: form.notes.trim() || null,
      country: form.country || null,
      gender: form.gender || null,
    };
    let chatterId: string | null = editingId;
    if (editingId) {
      const { error } = await supabase.from("chatters").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Staff updated");
    } else {
      const { data, error } = await supabase.from("chatters").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      toast.success("Staff added");
      chatterId = data?.id ?? null;
    }
    if (form.create_login && chatterId) {
      const { error: loginErr } = await supabase.from("access_codes").insert({
        username: form.login_username.trim(),
        password: form.login_password,
        label: form.name.trim(),
        account_type: "staff",
        chatter_id: chatterId,
      });
      if (loginErr) {
        toast.error(`Staff saved but login failed: ${loginErr.message}`);
      } else {
        toast.success(`Login created — ${form.login_username.trim()}`);
      }
    }
    setForm({ name: "", email: "", role: "chatter" as StaffRole, status: "active" as ChatterStatus, commission_pct: "10", hourly_rate: "", languages: "", hire_date: "", notes: "", country: "", gender: "", create_login: false, login_username: "", login_password: "" });
    setEditingId(null);
    setOpen(false);
    onRefresh();
  };

  const onGenerateLogin = async () => {
    if (!genLoginFor) return;
    if (!genForm.username.trim() || !genForm.password.trim()) {
      return toast.error("Username and password required");
    }
    const { error } = await supabase.from("access_codes").insert({
      username: genForm.username.trim(),
      password: genForm.password,
      label: genLoginFor.name,
      account_type: "staff",
      chatter_id: genLoginFor.id,
    });
    if (error) return toast.error(error.message);
    toast.success(`Login created — ${genForm.username.trim()}`);
    setGenLoginFor(null);
    setGenForm({ username: "", password: "" });
    onRefresh();
  };

  const onDeleteLogin = async (loginId: string) => {
    const { error } = await supabase.from("access_codes").delete().eq("id", loginId);
    if (error) return toast.error(error.message);
    toast.success("Login removed");
    onRefresh();
  };

  const copyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("chatters").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Chatter removed");
    onRefresh();
  };

  const onUpdateStatus = async (id: string, status: ChatterStatus) => {
    const { error } = await supabase.from("chatters").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    onRefresh();
  };

  const lastShiftFor = (chatterId: string): Shift | null => {
    const list = shifts.filter((s) => s.chatter_id === chatterId);
    if (list.length === 0) return null;
    return list.reduce((latest, s) =>
      new Date(s.start_at) > new Date(latest.start_at) ? s : latest
    );
  };

  const last30dRevenue = (chatterId: string): number => {
    const cutoff = Date.now() - 30 * 24 * 3600_000;
    return shifts
      .filter((s) => s.chatter_id === chatterId && new Date(s.start_at).getTime() > cutoff)
      .reduce((sum, s) => sum + s.total_revenue, 0);
  };

  const assignmentsFor = (chatterId: string) =>
    assignments.filter((a) => a.chatter_id === chatterId && a.active);

  // Status counts feed the filter pills' tooltips + the empty-state copy.
  const statusCounts = {
    current: chatters.filter((c) => c.status === "active" || c.status === "onboarding").length,
    active: chatters.filter((c) => c.status === "active").length,
    onboarding: chatters.filter((c) => c.status === "onboarding").length,
    paused: chatters.filter((c) => c.status === "paused").length,
    inactive: chatters.filter((c) => c.status === "inactive").length,
    all: chatters.length,
  };

  return (
    <div className="space-y-5">
      {/* ── Subly-style toolbar — search + view toggle + filter pills + role + Add Staff. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
          {/* Search */}
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="pl-8 h-9 rounded-full"
            />
          </div>
          {/* View toggle: table | card */}
          <div className="inline-flex rounded-full border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              title="Table view"
              className={`h-7 w-9 rounded-full flex items-center justify-center transition-all ${
                viewMode === "table" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("card")}
              title="Card grid view"
              className={`h-7 w-9 rounded-full flex items-center justify-center transition-all ${
                viewMode === "card" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Status filter pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {([
              { v: "current",    label: "Current Staff" },
              { v: "active",     label: "Active" },
              { v: "onboarding", label: "Onboarding" },
              { v: "paused",     label: "Paused" },
              { v: "inactive",   label: "Terminated" },
              { v: "all",        label: "All Staff" },
            ] as const).map((p) => (
              <button
                key={p.v}
                onClick={() => setStatusFilter(p.v)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  statusFilter === p.v
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {p.label}
                <span className="ml-1.5 text-[10px] opacity-70 tabular-nums">
                  {statusCounts[p.v as keyof typeof statusCounts]}
                </span>
              </button>
            ))}
          </div>
        </div>
        {/* Add Staff button — the actual Dialog is rendered further
            down (with its full DialogContent). This button just opens
            the same `open` state. */}
        <Button
          size="sm"
          className="rounded-full h-9"
          onClick={() => { setEditingId(null); setOpen(true); }}
        >
          <Plus className="h-4 w-4 mr-1.5" />Add Staff
        </Button>
      </div>

      {/* ── Secondary toolbar — role filter + count summary. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider">Operations (IC)</SelectLabel>
                <SelectItem value="chatter">Chatter</SelectItem>
                <SelectItem value="reddit_va">Reddit VA</SelectItem>
                <SelectItem value="instagram_va">Instagram VA</SelectItem>
                <SelectItem value="facebook_va">Facebook VA</SelectItem>
                <SelectItem value="x_va">X VA</SelectItem>
                <SelectItem value="tiktok_va">TikTok VA</SelectItem>
                <SelectItem value="social_media_va">Social Media VA (generic)</SelectItem>
                <SelectItem value="content_editor">Content Editor</SelectItem>
                <SelectItem value="recruiter">Recruiter</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider">Managers</SelectLabel>
                <SelectItem value="chatter_manager">Chatting Manager</SelectItem>
                <SelectItem value="reddit_manager">Reddit Manager</SelectItem>
                <SelectItem value="instagram_manager">Instagram Manager</SelectItem>
                <SelectItem value="facebook_manager">Facebook Manager</SelectItem>
                <SelectItem value="x_manager">X Manager</SelectItem>
                <SelectItem value="tiktok_manager">TikTok Manager</SelectItem>
                <SelectItem value="social_media_manager">Social Media Manager</SelectItem>
                <SelectItem value="content_manager">Content Manager</SelectItem>
                <SelectItem value="manager">Manager (general)</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {chatters.length} staff · {chatters.filter((c) => c.status === "active").length} active
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm({ name: "", email: "", role: "chatter" as StaffRole, status: "active" as ChatterStatus, commission_pct: "10", hourly_rate: "", languages: "", hire_date: "", notes: "", country: "", gender: "", create_login: false, login_username: "", login_password: "" }); } }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add staff</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? "Edit staff member" : "Add staff member"}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Smith" />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as StaffRole })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase tracking-wider">Operations (IC)</SelectLabel>
                        <SelectItem value="chatter">Chatter</SelectItem>
                        <SelectItem value="reddit_va">Reddit VA</SelectItem>
                        <SelectItem value="instagram_va">Instagram VA</SelectItem>
                        <SelectItem value="facebook_va">Facebook VA</SelectItem>
                        <SelectItem value="x_va">X VA</SelectItem>
                        <SelectItem value="tiktok_va">TikTok VA</SelectItem>
                        <SelectItem value="social_media_va">Social Media VA (generic)</SelectItem>
                        <SelectItem value="content_editor">Content Editor</SelectItem>
                        <SelectItem value="recruiter">Recruiter</SelectItem>
                      </SelectGroup>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase tracking-wider">Managers</SelectLabel>
                        <SelectItem value="chatter_manager">Chatting Manager</SelectItem>
                        <SelectItem value="reddit_manager">Reddit Manager</SelectItem>
                        <SelectItem value="instagram_manager">Instagram Manager</SelectItem>
                        <SelectItem value="facebook_manager">Facebook Manager</SelectItem>
                        <SelectItem value="x_manager">X Manager</SelectItem>
                        <SelectItem value="tiktok_manager">TikTok Manager</SelectItem>
                        <SelectItem value="social_media_manager">Social Media Manager</SelectItem>
                        <SelectItem value="content_manager">Content Manager</SelectItem>
                        <SelectItem value="manager">Manager (general)</SelectItem>
                      </SelectGroup>
                      <SelectSeparator />
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email <span className="text-muted-foreground text-xs">(opt)</span></Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@…" />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ChatterStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="onboarding">Onboarding</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="inactive">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Commission %</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={form.commission_pct}
                    onChange={(e) => setForm({ ...form, commission_pct: e.target.value })}
                    placeholder="10"
                  />
                  <div className="text-[11px] text-muted-foreground">% of tracked revenue from their shifts.</div>
                </div>
                <div className="space-y-1.5">
                  <Label>Hourly rate <span className="text-muted-foreground text-xs">(opt, $)</span></Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.hourly_rate}
                    onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Languages</Label>
                  <Input value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} placeholder="EN, ES" />
                </div>
                <div className="space-y-1.5">
                  <Label>Hire date</Label>
                  <Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
                </div>
              </div>
              {/* Country + gender — drives the flag chip + ♂/♀ icon
                  on the new staff card layout. Both optional. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Country</Label>
                  <Select
                    value={form.country || "none"}
                    onValueChange={(v) => setForm({ ...form, country: v === "none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Pick a country" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="none">— Not set —</SelectItem>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {flagEmoji(c.code)}  {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select
                    value={form.gender || "none"}
                    onValueChange={(v) => setForm({ ...form, gender: (v === "none" ? "" : v) as typeof form.gender })}
                  >
                    <SelectTrigger><SelectValue placeholder="Pick a gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Not set —</SelectItem>
                      <SelectItem value="male">♂ Male</SelectItem>
                      <SelectItem value="female">♀ Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal context" />
              </div>

              {!editingId && (
                <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.create_login}
                      onChange={(e) => setForm({ ...form, create_login: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <KeyRound className="h-3.5 w-3.5 text-primary" />
                    Create a login for this staff member
                  </label>
                  {form.create_login && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Username</Label>
                        <Input
                          placeholder="e.g. jane.chatter"
                          value={form.login_username}
                          onChange={(e) => setForm({ ...form, login_username: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Password</Label>
                        <Input
                          type="text"
                          placeholder="Set a password"
                          value={form.login_password}
                          onChange={(e) => setForm({ ...form, login_password: e.target.value })}
                          autoComplete="new-password"
                        />
                      </div>
                      <div className="col-span-2 text-[11px] text-muted-foreground">
                        They'll log in at the same URL with these credentials and only see the clock in/out portal.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setOpen(false); setEditingId(null); }}>Cancel</Button>
              <Button onClick={onSubmit}>{editingId ? "Save" : "Add"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {chatters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No staff added yet — click "Add chatter" to start.
        </div>
      ) : (
        <>
          {/* Bulk action bar — slides in when any rows are selected. */}
          {selectedIds.size > 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <span className="font-semibold">{selectedIds.size}</span>
                <span className="text-muted-foreground"> staff selected</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                  Clear selection
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setBulkConfirmOpen(true)}
                  disabled={bulkDeleting}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete {selectedIds.size}
                </Button>
              </div>
            </div>
          )}

          {viewMode === "card" && (
            <StaffCardGrid
              chatters={visibleChatters}
              logins={logins}
              onEdit={startEdit}
              onDelete={onDelete}
              onCreateLogin={(c) => setGenLoginFor(c)}
              onCoaching={(c) => setCoachingFor(c)}
            />
          )}

          {viewMode === "table" && (
          <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {/* Select-all checkbox in the header — toggles every
                    row currently visible (after the role filter). */}
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all"
                    className="h-4 w-4 accent-primary cursor-pointer"
                  />
                </th>
                <th className="text-left font-medium px-4 py-3">Name</th>
                <th className="text-left font-medium px-4 py-3">Role</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Login</th>
                <th className="text-right font-medium px-4 py-3">Commission</th>
                <th className="text-left font-medium px-4 py-3">Assigned creators</th>
                <th className="text-right font-medium px-4 py-3">Last 30d revenue</th>
                <th className="text-left font-medium px-4 py-3">Last shift</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleChatters.map((c) => {
                const accs = assignmentsFor(c.id);
                const last = lastShiftFor(c.id);
                const isSelected = selectedIds.has(c.id);
                return (
                  <tr key={c.id} className={`border-t border-border transition-colors align-top ${
                    isSelected ? "bg-primary/5 hover:bg-primary/10" : "bg-card hover:bg-secondary/20"
                  }`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(c.id)}
                        aria-label={`Select ${c.name}`}
                        className="h-4 w-4 accent-primary cursor-pointer mt-1"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.email ?? <span className="italic">no email</span>}
                        {c.languages && <> · {c.languages}</>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded border ${roleStyles[c.role]}`}>
                        {roleLabels[c.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Select value={c.status} onValueChange={(v) => onUpdateStatus(c.id, v as ChatterStatus)}>
                        <SelectTrigger className={`h-6 w-24 text-xs px-2 border ${statusStyles[c.status]}`}>
                          <SelectValue>{statusLabels[c.status]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const login = logins.find((l) => l.chatter_id === c.id);
                        if (!login) {
                          return (
                            <button
                              onClick={() => { setGenLoginFor(c); setGenForm({ username: "", password: "" }); }}
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                            >
                              <KeyRound className="h-3 w-3" />
                              Generate login
                            </button>
                          );
                        }
                        const isRevealed = !!revealedLogin[login.id];
                        const userKey = `lu:${login.id}`;
                        const passKey = `lp:${login.id}`;
                        return (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="font-mono font-medium">{login.username}</span>
                              <button
                                onClick={() => copyText(userKey, login.username)}
                                className="text-muted-foreground hover:text-primary"
                                aria-label="Copy username"
                              >
                                {copied === userKey ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className="font-mono">
                                {isRevealed ? login.password : "•".repeat(Math.max(8, Math.min(login.password.length, 12)))}
                              </span>
                              <button
                                onClick={() => setRevealedLogin({ ...revealedLogin, [login.id]: !isRevealed })}
                                className="hover:text-foreground"
                                aria-label={isRevealed ? "Hide password" : "Show password"}
                              >
                                {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </button>
                              <button
                                onClick={() => copyText(passKey, login.password)}
                                className="hover:text-foreground"
                                aria-label="Copy password"
                              >
                                {copied === passKey ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                              </button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button className="hover:text-destructive ml-0.5" aria-label="Remove login">
                                    <X className="h-3 w-3" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove this login?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {c.name} won't be able to sign in to the staff portal. Their staff record stays.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDeleteLogin(login.id)}>Remove</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-medium">{c.commission_pct.toFixed(1)}%</div>
                      {c.hourly_rate != null && (
                        <div className="text-[11px] text-muted-foreground">+ {fmt$(c.hourly_rate)}/hr</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      <div className="flex flex-wrap gap-1">
                        {accs.length === 0 ? (
                          <span className="italic text-muted-foreground/60">none</span>
                        ) : (
                          accs.map((a) => {
                            const cr = creators.find((cc) => cc.id === a.creator_id);
                            return (
                              <span key={a.id} className="px-1.5 py-0.5 rounded border border-border bg-secondary/40">
                                {cr?.name ?? "—"}
                              </span>
                            );
                          })
                        )}
                        <button
                          onClick={() => setAssignDialogOpen(c.id)}
                          className="px-1.5 py-0.5 rounded border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary"
                        >
                          edit
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-success">
                      {fmt$(last30dRevenue(c.id))}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {last ? formatDistanceToNow(new Date(last.start_at), { addSuffix: true }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setCoachingFor(c)}
                          className="rounded p-1.5 text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                          title="Coach (notes + goals)"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => startEdit(c)}
                          className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove {c.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This deletes the staff member and all their shifts. Cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDelete(c.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          )}
        </>
      )}

      {/* Bulk delete confirm dialog */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} staff member{selectedIds.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every selected staff member and all of their shifts.
              Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? "Deleting…" : `Delete ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {assignDialogOpen && (
        <AssignmentsDialog
          chatterId={assignDialogOpen}
          chatterName={chatters.find((c) => c.id === assignDialogOpen)?.name ?? ""}
          creators={creators}
          assignments={assignments.filter((a) => a.chatter_id === assignDialogOpen)}
          onClose={() => setAssignDialogOpen(null)}
          onRefresh={onRefresh}
        />
      )}

      <Dialog open={!!genLoginFor} onOpenChange={(o) => { if (!o) setGenLoginFor(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Generate login {genLoginFor && `for ${genLoginFor.name}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              They'll log in at the same URL with these credentials and only see the staff clock in/out portal.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Username</Label>
              <Input
                value={genForm.username}
                onChange={(e) => setGenForm({ ...genForm, username: e.target.value })}
                placeholder="e.g. jane.chatter"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Password</Label>
              <Input
                type="text"
                value={genForm.password}
                onChange={(e) => setGenForm({ ...genForm, password: e.target.value })}
                placeholder="Set a password"
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGenLoginFor(null)}>Cancel</Button>
            <Button onClick={onGenerateLogin}>Create login</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coaching dialog — opened from the Sparkles button on each row */}
      {coachingFor && (
        <CoachingDialog
          chatter={{ id: coachingFor.id, name: coachingFor.name }}
          open={!!coachingFor}
          onClose={() => setCoachingFor(null)}
        />
      )}
    </div>
  );
}

function AssignmentsDialog({
  chatterId, chatterName, creators, assignments, onClose, onRefresh,
}: {
  chatterId: string;
  chatterName: string;
  creators: Creator[];
  assignments: Assignment[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const isAssigned = (creatorId: string) =>
    assignments.some((a) => a.creator_id === creatorId && a.active);

  const toggle = async (creatorId: string) => {
    const existing = assignments.find((a) => a.creator_id === creatorId);
    if (existing) {
      const { error } = await supabase
        .from("chatter_assignments")
        .update({ active: !existing.active })
        .eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("chatter_assignments").insert({
        chatter_id: chatterId,
        creator_id: creatorId,
        active: true,
      });
      if (error) return toast.error(error.message);
    }
    onRefresh();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign creators to {chatterName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 py-2 max-h-96 overflow-y-auto">
          {creators.map((c) => (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm border transition-colors ${
                isAssigned(c.id)
                  ? "bg-success/10 border-success/30 text-foreground"
                  : "bg-card border-border hover:bg-secondary/30"
              }`}
            >
              <span>{c.name}</span>
              {isAssigned(c.id) && <Check className="h-4 w-4 text-success" />}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Shifts Tab ─────────────────────────────────────────────────────────────────
const emptyShiftForm = {
  chatter_id: "",
  creator_id: "",
  start_at: "",
  end_at: "",
  ppv_count: "",
  ppv_revenue: "",
  tips_revenue: "",
  custom_revenue: "",
  message_count: "",
  avg_response_seconds: "",
  quality_flag: "" as "" | NonNullable<QualityFlag>,
  notes: "",
};

function ShiftsTab({
  chatters, creators, shifts, onRefresh,
}: {
  chatters: Chatter[];
  creators: Creator[];
  shifts: Shift[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyShiftForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterChatter, setFilterChatter] = useState("all");
  const [filterCreator, setFilterCreator] = useState("all");

  const filtered = useMemo(() => {
    return shifts.filter((s) => {
      if (filterChatter !== "all" && s.chatter_id !== filterChatter) return false;
      if (filterCreator !== "all" && s.creator_id !== filterCreator) return false;
      return true;
    });
  }, [shifts, filterChatter, filterCreator]);

  const startEdit = (s: Shift) => {
    setForm({
      chatter_id: s.chatter_id,
      creator_id: s.creator_id,
      start_at: format(new Date(s.start_at), "yyyy-MM-dd'T'HH:mm"),
      end_at: s.end_at ? format(new Date(s.end_at), "yyyy-MM-dd'T'HH:mm") : "",
      ppv_count: s.ppv_count.toString(),
      ppv_revenue: s.ppv_revenue.toString(),
      tips_revenue: s.tips_revenue.toString(),
      custom_revenue: s.custom_revenue.toString(),
      message_count: s.message_count.toString(),
      avg_response_seconds: s.avg_response_seconds?.toString() ?? "",
      quality_flag: (s.quality_flag ?? "") as "" | NonNullable<QualityFlag>,
      notes: s.notes ?? "",
    });
    setEditingId(s.id);
    setOpen(true);
  };

  const onSubmit = async () => {
    if (!form.chatter_id) return toast.error("Pick a chatter");
    if (!form.creator_id) return toast.error("Pick a creator");
    if (!form.start_at?.trim()) return toast.error("Start time required — click the start field and pick a date/time");
    const startDate = new Date(form.start_at);
    if (isNaN(startDate.getTime())) {
      return toast.error("Start time format is invalid — clear it and use the date/time picker");
    }
    let endDate: Date | null = null;
    if (form.end_at?.trim()) {
      endDate = new Date(form.end_at);
      if (isNaN(endDate.getTime())) {
        return toast.error("End time format is invalid — clear it or use the date/time picker");
      }
    }
    const ppv = parseFloat(form.ppv_revenue) || 0;
    const tips = parseFloat(form.tips_revenue) || 0;
    const custom = parseFloat(form.custom_revenue) || 0;
    const payload = {
      chatter_id: form.chatter_id,
      creator_id: form.creator_id,
      start_at: startDate.toISOString(),
      end_at: endDate ? endDate.toISOString() : null,
      ppv_count: parseInt(form.ppv_count) || 0,
      ppv_revenue: ppv,
      tips_revenue: tips,
      custom_revenue: custom,
      total_revenue: ppv + tips + custom,
      message_count: parseInt(form.message_count) || 0,
      avg_response_seconds: form.avg_response_seconds ? parseInt(form.avg_response_seconds) : null,
      quality_flag: form.quality_flag || null,
      notes: form.notes.trim() || null,
    };
    if (editingId) {
      const { error } = await supabase.from("shifts").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Shift updated");
    } else {
      const { error } = await supabase.from("shifts").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Shift logged");
    }
    setForm(emptyShiftForm);
    setEditingId(null);
    setOpen(false);
    onRefresh();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("shifts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Shift deleted");
    onRefresh();
  };

  if (chatters.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
        Add a chatter on the Roster tab before logging shifts.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterChatter} onValueChange={setFilterChatter}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All chatters</SelectItem>
              {chatters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCreator} onValueChange={setFilterCreator}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All creators</SelectItem>
              {creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} shift{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(emptyShiftForm); } }}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              onClick={() => {
                setForm({ ...emptyShiftForm, start_at: format(new Date(), "yyyy-MM-dd'T'HH:mm") });
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />Log shift
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editingId ? "Edit shift" : "Log new shift"}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Chatter</Label>
                  <Select value={form.chatter_id} onValueChange={(v) => setForm({ ...form, chatter_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                    <SelectContent>
                      {chatters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Creator</Label>
                  <Select value={form.creator_id} onValueChange={(v) => setForm({ ...form, creator_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                    <SelectContent>
                      {creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start</Label>
                  <DateTimePicker
                    value={form.start_at ? new Date(form.start_at) : null}
                    onChange={(d) => setForm({ ...form, start_at: d ? format(d, "yyyy-MM-dd'T'HH:mm") : "" })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End <span className="text-muted-foreground text-xs">(blank = ongoing)</span></Label>
                  <DateTimePicker
                    value={form.end_at ? new Date(form.end_at) : null}
                    onChange={(d) => setForm({ ...form, end_at: d ? format(d, "yyyy-MM-dd'T'HH:mm") : "" })}
                    clearable
                    placeholder="Leave blank if ongoing"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label>PPV count</Label>
                  <Input type="number" value={form.ppv_count} onChange={(e) => setForm({ ...form, ppv_count: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>PPV revenue ($)</Label>
                  <Input type="number" step="0.01" value={form.ppv_revenue} onChange={(e) => setForm({ ...form, ppv_revenue: e.target.value })} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tips ($)</Label>
                  <Input type="number" step="0.01" value={form.tips_revenue} onChange={(e) => setForm({ ...form, tips_revenue: e.target.value })} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Custom ($)</Label>
                  <Input type="number" step="0.01" value={form.custom_revenue} onChange={(e) => setForm({ ...form, custom_revenue: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Messages sent</Label>
                  <Input type="number" value={form.message_count} onChange={(e) => setForm({ ...form, message_count: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Avg response (sec)</Label>
                  <Input type="number" value={form.avg_response_seconds} onChange={(e) => setForm({ ...form, avg_response_seconds: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Quality flag</Label>
                  <Select value={form.quality_flag || "none"} onValueChange={(v) => setForm({ ...form, quality_flag: (v === "none" ? "" : v) as "" | NonNullable<QualityFlag> })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="off_brand">Off-brand</SelectItem>
                      <SelectItem value="missed_ppv">Missed PPV</SelectItem>
                      <SelectItem value="inappropriate">Inappropriate</SelectItem>
                      <SelectItem value="late">Late</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What went well, what didn't" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setOpen(false); setEditingId(null); }}>Cancel</Button>
              <Button onClick={onSubmit}>{editingId ? "Save" : "Log shift"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No shifts logged yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Chatter</th>
                <th className="text-left font-medium px-4 py-3">Creator</th>
                <th className="text-left font-medium px-4 py-3">When</th>
                <th className="text-right font-medium px-4 py-3">Hours</th>
                <th className="text-right font-medium px-4 py-3">PPVs</th>
                <th className="text-right font-medium px-4 py-3">Revenue</th>
                <th className="text-right font-medium px-4 py-3">$/hr</th>
                <th className="text-left font-medium px-4 py-3">Flag</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const chatter = chatters.find((c) => c.id === s.chatter_id);
                const creator = creators.find((c) => c.id === s.creator_id);
                const hours = shiftHours(s);
                const perHour = hours > 0 ? s.total_revenue / hours : null;
                return (
                  <tr key={s.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{chatter?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{creator?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(s.start_at), "MMM d, h:mm a")}
                      {s.end_at ? <> → {format(new Date(s.end_at), "h:mm a")}</> : <span className="text-success"> · ongoing</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {hours > 0 ? hours.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{s.ppv_count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-success">{fmt$(s.total_revenue)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {perHour != null ? fmt$0(perHour) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {s.quality_flag ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-warning/30 bg-warning/10 text-warning">
                          <Flag className="h-2.5 w-2.5" />
                          {flagLabels[s.quality_flag]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(s)}
                          className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
                              <AlertDialogDescription>Cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDelete(s.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
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

// ── Leaderboard Tab ────────────────────────────────────────────────────────────
function LeaderboardTab({ chatters, shifts }: { chatters: Chatter[]; shifts: Shift[] }) {
  // Only count chatters who are still on the team. Paused / inactive
  // staff stay in the chatters table for historical payout records,
  // but they shouldn't clutter the leaderboard with stale numbers
  // from before they were removed. If you genuinely want to see a
  // departed chatter's totals, look at their row in the Roster tab
  // (which shows everyone) or the Pay tab.
  const stats = useMemo(() => {
    return chatters
      .filter((c) => c.status === "active")
      .map((c) => {
        const cShifts = shifts.filter((s) => s.chatter_id === c.id);
        const totalRev = cShifts.reduce((s, sh) => s + sh.total_revenue, 0);
        const totalPpvs = cShifts.reduce((s, sh) => s + sh.ppv_count, 0);
        const totalHours = cShifts.reduce((s, sh) => s + shiftHours(sh), 0);
        const totalMessages = cShifts.reduce((s, sh) => s + sh.message_count, 0);
        const flags = cShifts.filter((s) => s.quality_flag).length;
        const ppvCloseRate = totalMessages > 0 ? (totalPpvs / totalMessages) * 100 : 0;
        return {
          chatter: c,
          shifts: cShifts.length,
          revenue: totalRev,
          ppvs: totalPpvs,
          hours: totalHours,
          perHour: totalHours > 0 ? totalRev / totalHours : 0,
          messages: totalMessages,
          ppvCloseRate,
          flags,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [chatters, shifts]);
  const hiddenInactive = chatters.filter((c) => c.status !== "active").length;

  if (stats.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
        Add chatters and log shifts to see the leaderboard.
      </div>
    );
  }

  const totalRevenue = stats.reduce((s, x) => s + x.revenue, 0);
  const topPerformer = stats[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Total revenue tracked" value={fmt$(totalRevenue)} icon={<DollarSign className="h-3.5 w-3.5" />} />
        <KpiCard label="Total shifts" value={fmtNum(shifts.length)} icon={<Clock className="h-3.5 w-3.5" />} />
        <KpiCard
          label="Top performer"
          value={topPerformer?.chatter.name ?? "—"}
          sub={topPerformer ? `${fmt$(topPerformer.revenue)} driven` : undefined}
          icon={<Award className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Quality flags"
          value={stats.reduce((s, x) => s + x.flags, 0)}
          sub="across all shifts"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-sm font-semibold mb-4">Revenue driven by chatter</div>
        <div className="space-y-3">
          {stats.map((s) => {
            const max = stats[0]?.revenue || 1;
            const pct = (s.revenue / max) * 100;
            return (
              <div key={s.chatter.id} className="flex items-center gap-3">
                <div className="w-32 text-sm font-medium truncate">{s.chatter.name}</div>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-24 text-right text-sm font-semibold text-success">{fmt$(s.revenue)}</div>
                <div className="w-20 text-right text-xs text-muted-foreground">
                  {s.hours > 0 ? `${fmt$0(s.perHour)}/hr` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3">#</th>
              <th className="text-left font-medium px-4 py-3">Chatter</th>
              <th className="text-right font-medium px-4 py-3">Shifts</th>
              <th className="text-right font-medium px-4 py-3">Hours</th>
              <th className="text-right font-medium px-4 py-3">PPVs</th>
              <th className="text-right font-medium px-4 py-3">Revenue</th>
              <th className="text-right font-medium px-4 py-3">$/hr</th>
              <th className="text-right font-medium px-4 py-3">PPV close</th>
              <th className="text-right font-medium px-4 py-3">Flags</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={s.chatter.id} className="border-t border-border bg-card">
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{s.chatter.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{statusLabels[s.chatter.status]}</div>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{s.shifts}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{s.hours.toFixed(1)}</td>
                <td className="px-4 py-3 text-right">{s.ppvs}</td>
                <td className="px-4 py-3 text-right font-semibold text-success">{fmt$(s.revenue)}</td>
                <td className="px-4 py-3 text-right">{s.hours > 0 ? fmt$0(s.perHour) : "—"}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {s.messages > 0 ? `${s.ppvCloseRate.toFixed(2)}%` : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.flags > 0 ? (
                    <span className="text-warning font-medium">{s.flags}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hiddenInactive > 0 && (
        <p className="text-xs text-muted-foreground italic">
          {hiddenInactive} paused or inactive staff hidden — switch them back to Active
          on the Roster tab to include them here.
        </p>
      )}
    </div>
  );
}

function KpiCard({
  label, value, sub, icon, valueClass,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        {icon && <span className="text-primary">{icon}</span>}
        {label}
      </div>
      <div className={`text-2xl font-bold truncate ${valueClass ?? ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

// ── Pay Tab ────────────────────────────────────────────────────────────────────
function PayTab({
  chatters, shifts, payouts, onRefresh,
}: {
  chatters: Chatter[];
  shifts: Shift[];
  payouts: Payout[];
  onRefresh: () => void;
}) {
  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(today), "yyyy-MM-dd"));

  const presets: { label: string; range: () => [Date, Date] }[] = [
    { label: "This week", range: () => [startOfWeek(new Date(), { weekStartsOn: 1 }), endOfWeek(new Date(), { weekStartsOn: 1 })] },
    { label: "Last week", range: () => {
      const prev = subWeeks(new Date(), 1);
      return [startOfWeek(prev, { weekStartsOn: 1 }), endOfWeek(prev, { weekStartsOn: 1 })];
    }},
    { label: "Last 2 weeks", range: () => [startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), endOfWeek(new Date(), { weekStartsOn: 1 })] },
    { label: "This month", range: () => [startOfMonth(new Date()), endOfMonth(new Date())] },
    { label: "Last month", range: () => {
      const prev = subMonths(new Date(), 1);
      return [startOfMonth(prev), endOfMonth(prev)];
    }},
  ];

  const applyPreset = (preset: typeof presets[number]) => {
    const [s, e] = preset.range();
    setFrom(format(s, "yyyy-MM-dd"));
    setTo(format(e, "yyyy-MM-dd"));
  };

  const periodShifts = useMemo(() => {
    const fromTs = new Date(from).getTime();
    const toTs = new Date(to).getTime() + 24 * 3600_000;
    return shifts.filter((s) => {
      const t = new Date(s.start_at).getTime();
      return t >= fromTs && t < toTs;
    });
  }, [shifts, from, to]);

  // Has this exact period (from..to) already been paid for this chatter?
  const findExistingPayout = (chatterId: string): Payout | null => {
    return payouts.find(
      (p) => p.chatter_id === chatterId && p.period_start === from && p.period_end === to
    ) ?? null;
  };

  const lastPaidAt = (chatterId: string): Date | null => {
    const list = payouts.filter((p) => p.chatter_id === chatterId);
    if (list.length === 0) return null;
    return new Date(Math.max(...list.map((p) => new Date(p.paid_at).getTime())));
  };

  const payRows = useMemo(() => {
    return chatters
      .map((c) => {
        const chShifts = periodShifts.filter((s) => s.chatter_id === c.id);
        const revenue = chShifts.reduce((s, sh) => s + sh.total_revenue, 0);
        const hours = chShifts.reduce((s, sh) => s + shiftHours(sh), 0);
        const commission = revenue * (c.commission_pct / 100);
        const hourly = c.hourly_rate != null ? hours * c.hourly_rate : 0;
        const total = commission + hourly;
        return { chatter: c, shifts: chShifts.length, revenue, hours, commission, hourly, total };
      })
      .filter((r) => r.shifts > 0 || r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [chatters, periodShifts]);

  const grandTotal = payRows.reduce((s, r) => s + r.total, 0);
  const grandRevenue = payRows.reduce((s, r) => s + r.revenue, 0);
  const grandCommission = payRows.reduce((s, r) => s + r.commission, 0);
  const grandHourly = payRows.reduce((s, r) => s + r.hourly, 0);

  const unpaidCount = payRows.filter((r) => !findExistingPayout(r.chatter.id) && r.total > 0).length;
  const unpaidTotal = payRows
    .filter((r) => !findExistingPayout(r.chatter.id))
    .reduce((s, r) => s + r.total, 0);

  const onMarkPaid = async (
    row: typeof payRows[number],
    note?: string
  ) => {
    const adminUsername = (() => {
      try {
        const raw = localStorage.getItem("agency_session");
        if (!raw) return null;
        const obj = JSON.parse(raw);
        return obj?.username ?? raw;
      } catch {
        return localStorage.getItem("agency_session");
      }
    })();
    const { error } = await supabase.from("staff_payouts").insert({
      chatter_id: row.chatter.id,
      period_start: from,
      period_end: to,
      amount: Number(row.total.toFixed(2)),
      hours: Number(row.hours.toFixed(2)),
      commission_amount: Number(row.commission.toFixed(2)),
      hourly_amount: Number(row.hourly.toFixed(2)),
      shifts_count: row.shifts,
      paid_by: adminUsername,
      notes: note ?? null,
    });
    if (error) return toast.error(error.message);
    void logAudit({
      action: "staff_payout_marked",
      entity_type: "staff_payout",
      entity_name: row.chatter.name,
      details: `${fmt$(row.total)} for ${from} → ${to} (${row.shifts} shift${row.shifts === 1 ? "" : "s"})`,
    });
    toast.success(`${row.chatter.name} marked paid · ${fmt$(row.total)}`);
    onRefresh();
  };

  const onMarkAllPaid = async () => {
    const rowsToPay = payRows.filter((r) => !findExistingPayout(r.chatter.id) && r.total > 0);
    if (rowsToPay.length === 0) return toast.info("Everyone in this period is already paid.");
    for (const r of rowsToPay) {
      await onMarkPaid(r);
    }
    toast.success(`Marked ${rowsToPay.length} staff paid for this period`);
  };

  const onUnmarkPaid = async (payoutId: string) => {
    const { error } = await supabase.from("staff_payouts").delete().eq("id", payoutId);
    if (error) return toast.error(error.message);
    toast.success("Payout reverted");
    onRefresh();
  };

  const onExportCSV = () => {
    const header = ["Staff", "Role", "Shifts", "Hours", "Revenue", "Commission %", "Commission $", "Hourly $", "Total payout", "Period start", "Period end", "Status"];
    const rows = payRows.map((r) => {
      const paid = findExistingPayout(r.chatter.id);
      return [
        r.chatter.name,
        r.chatter.role,
        r.shifts,
        r.hours.toFixed(2),
        r.revenue.toFixed(2),
        r.chatter.commission_pct.toFixed(2),
        r.commission.toFixed(2),
        r.hourly.toFixed(2),
        r.total.toFixed(2),
        from,
        to,
        paid ? "PAID" : "UNPAID",
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${from}-to-${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Period control */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick periods:</span>
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="text-xs px-2 py-1 rounded border border-border bg-secondary/40 hover:bg-secondary hover:border-primary/40 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Period:</span>
          <div className="w-[200px]">
            <DatePicker
              value={from ? new Date(from) : null}
              onChange={(d) => setFrom(d ? format(d, "yyyy-MM-dd") : "")}
            />
          </div>
          <span className="text-muted-foreground">→</span>
          <div className="w-[200px]">
            <DatePicker
              value={to ? new Date(to) : null}
              onChange={(d) => setTo(d ? format(d, "yyyy-MM-dd") : "")}
            />
          </div>
          <span className="text-xs text-muted-foreground">{periodShifts.length} shift{periodShifts.length !== 1 ? "s" : ""}</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onExportCSV} disabled={payRows.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
            <Button size="sm" onClick={onMarkAllPaid} disabled={unpaidCount === 0}>
              <Wallet className="h-3.5 w-3.5 mr-1.5" />
              {unpaidCount === 0 ? "All paid" : `Mark all ${unpaidCount} paid`}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Total payout" value={fmt$(grandTotal)} icon={<DollarSign className="h-3.5 w-3.5" />} />
        <KpiCard
          label="Still owed"
          value={fmt$(unpaidTotal)}
          sub={`${unpaidCount} ${unpaidCount === 1 ? "person" : "people"} unpaid`}
          icon={<Wallet className="h-3.5 w-3.5" />}
          valueClass={unpaidTotal > 0 ? "text-warning" : "text-success"}
        />
        <KpiCard label="Commission portion" value={fmt$(grandCommission)} sub={grandRevenue > 0 ? `${((grandCommission / grandRevenue) * 100).toFixed(1)}% of rev` : "—"} />
        <KpiCard label="Hourly portion" value={fmt$(grandHourly)} sub="for staff with hourly rate" icon={<Clock className="h-3.5 w-3.5" />} />
      </div>

      {payRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No shifts in this period.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Staff</th>
                <th className="text-right font-medium px-4 py-3">Shifts</th>
                <th className="text-right font-medium px-4 py-3">Hours</th>
                <th className="text-right font-medium px-4 py-3">Revenue</th>
                <th className="text-right font-medium px-4 py-3">Commission</th>
                <th className="text-right font-medium px-4 py-3">Hourly</th>
                <th className="text-right font-medium px-4 py-3">Total payout</th>
                <th className="text-right font-medium px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {payRows.map((r) => {
                const paid = findExistingPayout(r.chatter.id);
                const lastPaid = lastPaidAt(r.chatter.id);
                return (
                  <tr key={r.chatter.id} className={`border-t border-border ${paid ? "bg-success/5" : "bg-card"}`}>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium">{r.chatter.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.chatter.commission_pct.toFixed(1)}%
                        {r.chatter.hourly_rate != null && <> + {fmt$(r.chatter.hourly_rate)}/hr</>}
                      </div>
                      {lastPaid && !paid && (
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                          last paid {formatDistanceToNow(lastPaid, { addSuffix: true })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground align-top">{r.shifts}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground align-top">{r.hours.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right align-top">{fmt$(r.revenue)}</td>
                    <td className="px-4 py-3 text-right align-top">{fmt$(r.commission)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground align-top">{r.hourly > 0 ? fmt$(r.hourly) : "—"}</td>
                    <td className={`px-4 py-3 text-right font-bold align-top ${paid ? "text-success" : ""}`}>{fmt$(r.total)}</td>
                    <td className="px-4 py-3 text-right align-top">
                      {paid ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-success/40 bg-success/10 text-success">
                          <Check className="h-2.5 w-2.5" />
                          PAID {format(new Date(paid.paid_at), "MMM d")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-warning/40 bg-warning/10 text-warning">
                          UNPAID
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      {paid ? (
                        <button
                          onClick={() => onUnmarkPaid(paid.id)}
                          className="text-[11px] text-muted-foreground hover:text-destructive"
                          title="Revert this payout"
                        >
                          undo
                        </button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => onMarkPaid(r)} disabled={r.total === 0}>
                          Mark paid
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-border bg-secondary/40">
                <td className="px-4 py-3 font-bold">Total</td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {payRows.reduce((s, r) => s + r.shifts, 0)}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {payRows.reduce((s, r) => s + r.hours, 0).toFixed(1)}
                </td>
                <td className="px-4 py-3 text-right font-bold">{fmt$(grandRevenue)}</td>
                <td className="px-4 py-3 text-right font-bold">{fmt$(grandCommission)}</td>
                <td className="px-4 py-3 text-right font-bold">{fmt$(grandHourly)}</td>
                <td className="px-4 py-3 text-right font-bold text-success">{fmt$(grandTotal)}</td>
                <td className="px-4 py-3" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Commission = revenue × commission %. Hourly = hours × hourly rate (when set). Total = commission + hourly.
        Marking someone paid records the payout in history; click "undo" to revert.
      </p>

      {/* Pay history */}
      <div className="pt-4 border-t border-border">
        <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-1.5">
          <History className="h-4 w-4" />
          Pay history
          <span className="text-xs font-normal text-muted-foreground">(last 20 payouts)</span>
        </h3>
        {payouts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No payouts recorded yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Staff</th>
                  <th className="text-left font-medium px-4 py-3">Period</th>
                  <th className="text-right font-medium px-4 py-3">Hours</th>
                  <th className="text-right font-medium px-4 py-3">Commission</th>
                  <th className="text-right font-medium px-4 py-3">Hourly</th>
                  <th className="text-right font-medium px-4 py-3">Amount</th>
                  <th className="text-left font-medium px-4 py-3">Paid</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {payouts.slice(0, 20).map((p) => {
                  const ch = chatters.find((c) => c.id === p.chatter_id);
                  return (
                    <tr key={p.id} className="border-t border-border bg-card">
                      <td className="px-4 py-3 font-medium">{ch?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(p.period_start), "MMM d")} → {format(new Date(p.period_end), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{p.hours?.toFixed(1) ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {p.commission_amount != null ? fmt$(p.commission_amount) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {p.hourly_amount != null && p.hourly_amount > 0 ? fmt$(p.hourly_amount) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-success">{fmt$(p.amount)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(p.paid_at), "MMM d, yyyy")}
                        {p.paid_by && <span className="text-muted-foreground/60"> · by {p.paid_by}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => onUnmarkPaid(p.id)}
                          className="text-[11px] text-muted-foreground hover:text-destructive"
                          title="Revert this payout"
                        >
                          undo
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Time Clock Tab (admin live view) ───────────────────────────────────────────
function TimeClockTab({
  chatters, creators, shifts, onRefresh,
}: {
  chatters: Chatter[];
  creators: Creator[];
  shifts: Shift[];
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const activeShifts = useMemo(
    () => shifts.filter((s) => !s.end_at).sort(
      (a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
    ),
    [shifts]
  );

  const todayActivity = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return shifts
      .filter((s) => new Date(s.start_at).getTime() >= todayStart.getTime())
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
  }, [shifts]);

  const todaySummary = useMemo(() => {
    const map = new Map<string, { shifts: number; hours: number; revenue: number; active: number }>();
    for (const s of todayActivity) {
      const existing = map.get(s.chatter_id) ?? { shifts: 0, hours: 0, revenue: 0, active: 0 };
      const hrs = s.end_at
        ? (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600_000
        : (now - new Date(s.start_at).getTime()) / 3600_000;
      map.set(s.chatter_id, {
        shifts: existing.shifts + 1,
        hours: existing.hours + hrs,
        revenue: existing.revenue + s.total_revenue,
        active: existing.active + (s.end_at ? 0 : 1),
      });
    }
    return Array.from(map.entries())
      .map(([cid, stats]) => ({ chatter: chatters.find((c) => c.id === cid), ...stats }))
      .filter((r) => r.chatter)
      .sort((a, b) => b.revenue - a.revenue);
  }, [todayActivity, chatters, now]);

  const elapsed = (startAt: string): string => {
    const ms = now - new Date(startAt).getTime();
    if (ms < 0) return "0:00:00";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const sec = totalSec % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const onForceClockOut = async (shiftId: string) => {
    const { error } = await supabase
      .from("shifts")
      .update({ end_at: new Date().toISOString() })
      .eq("id", shiftId);
    if (error) return toast.error(error.message);
    toast.success("Shift closed");
    onRefresh();
  };

  const creatorName = (id: string) => creators.find((c) => c.id === id)?.name ?? "—";
  const chatterName = (id: string) => chatters.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Clocked in now"
          value={activeShifts.length}
          sub={activeShifts.length === 1 ? "person working" : "people working"}
          icon={<Clock className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Shifts today"
          value={todayActivity.length}
          sub={`${todayActivity.filter((s) => s.end_at).length} completed`}
        />
        <KpiCard
          label="Hours today"
          value={todayActivity.reduce((s, sh) => {
            const hrs = sh.end_at
              ? (new Date(sh.end_at).getTime() - new Date(sh.start_at).getTime()) / 3600_000
              : (now - new Date(sh.start_at).getTime()) / 3600_000;
            return s + hrs;
          }, 0).toFixed(1)}
          sub="across all staff"
        />
        <KpiCard
          label="Revenue today"
          value={fmt$(todayActivity.reduce((s, sh) => s + sh.total_revenue, 0))}
          sub="from logged shifts"
        />
      </div>

      {/* Active shifts */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Currently clocked in</h3>
        {activeShifts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No one is clocked in right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {activeShifts.map((s) => (
              <div key={s.id} className="rounded-xl border-2 border-success/40 bg-success/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {chatterName(s.chatter_id)} · for
                    </div>
                    <div className="text-lg font-bold truncate">{creatorName(s.creator_id)}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Started {format(new Date(s.start_at), "h:mm a")}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-mono font-bold tabular-nums">{elapsed(s.start_at)}</div>
                    <button
                      onClick={() => onForceClockOut(s.id)}
                      className="text-[11px] text-destructive hover:underline mt-0.5"
                    >
                      force clock out
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today summary */}
      {todaySummary.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Today by staff member</h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Staff</th>
                  <th className="text-right font-medium px-4 py-3">Shifts</th>
                  <th className="text-right font-medium px-4 py-3">Hours</th>
                  <th className="text-right font-medium px-4 py-3">Revenue</th>
                  <th className="text-left font-medium px-4 py-3">Currently</th>
                </tr>
              </thead>
              <tbody>
                {todaySummary.map((r) => (
                  <tr key={r.chatter!.id} className="border-t border-border bg-card">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.chatter!.name}</div>
                      <div className="text-[11px] text-muted-foreground">{roleLabels[r.chatter!.role]}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.shifts}</td>
                    <td className="px-4 py-3 text-right">{r.hours.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-success">{fmt$(r.revenue)}</td>
                    <td className="px-4 py-3">
                      {r.active > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                          <span className="text-success font-medium">on shift</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">clocked out</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Today activity log */}
      <div>
        <h3 className="text-sm font-semibold mb-3">
          Today's activity <span className="font-normal text-muted-foreground text-xs">(most recent first)</span>
        </h3>
        {todayActivity.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No shifts started today yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Staff</th>
                  <th className="text-left font-medium px-4 py-3">Creator</th>
                  <th className="text-left font-medium px-4 py-3">Clocked in</th>
                  <th className="text-left font-medium px-4 py-3">Clocked out</th>
                  <th className="text-right font-medium px-4 py-3">Duration</th>
                  <th className="text-right font-medium px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {todayActivity.map((s) => {
                  const hrs = s.end_at
                    ? (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600_000
                    : (now - new Date(s.start_at).getTime()) / 3600_000;
                  return (
                    <tr key={s.id} className="border-t border-border bg-card">
                      <td className="px-4 py-3 font-medium">{chatterName(s.chatter_id)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{creatorName(s.creator_id)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(s.start_at), "h:mm a")}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {s.end_at ? (
                          <span className="text-muted-foreground">{format(new Date(s.end_at), "h:mm a")}</span>
                        ) : (
                          <span className="text-success font-medium">still on shift</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{hrs.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right">{s.total_revenue > 0 ? fmt$(s.total_revenue) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Staff card grid (Subly pattern) ───────────────────────────────────────
//
// Per-staff card with avatar bubble + name + gender chip + heart + ⋯ menu,
// then job title / nationality / location / status rows, and the staff
// member's login credentials (username + show/hide password) tucked under
// the status row. 1-col on mobile → 2-col sm → 3-col md → 4-col lg.

function StaffCardGrid({
  chatters, logins, onEdit, onDelete, onCreateLogin, onCoaching,
}: {
  chatters: Chatter[];
  logins: StaffLogin[];
  onEdit: (c: Chatter) => void;
  onDelete: (id: string) => void;
  onCreateLogin: (c: Chatter) => void;
  onCoaching: (c: Chatter) => void;
}) {
  if (chatters.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center text-sm text-muted-foreground">
        No staff match the current filters. Adjust the search or status pills above.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {chatters.map((c) => (
        <StaffCard
          key={c.id}
          chatter={c}
          loginsForChatter={logins.filter((l) => l.chatter_id === c.id && l.active)}
          onEdit={() => onEdit(c)}
          onDelete={() => onDelete(c.id)}
          onCreateLogin={() => onCreateLogin(c)}
          onCoaching={() => onCoaching(c)}
        />
      ))}
    </div>
  );
}

function StaffCard({
  chatter, loginsForChatter, onEdit, onDelete, onCreateLogin, onCoaching,
}: {
  chatter: Chatter;
  loginsForChatter: StaffLogin[];
  onEdit: () => void;
  onDelete: () => void;
  onCreateLogin: () => void;
  onCoaching: () => void;
}) {
  const [showPwd, setShowPwd] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const country = countryByCode(chatter.country);
  const genderIcon =
    chatter.gender === "male" ? "♂"
    : chatter.gender === "female" ? "♀"
    : null;
  const initials = chatter.name.slice(0, 2).toUpperCase();
  const login = loginsForChatter[0] ?? null;

  return (
    <div className="group relative rounded-2xl border border-border bg-card p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.10)]">
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white flex items-center justify-center font-semibold text-xs shrink-0">
            {initials}
          </div>
          <div className="font-semibold text-sm truncate">{chatter.name}</div>
          {genderIcon && (
            <span
              className={`text-sm shrink-0 ${chatter.gender === "male" ? "text-blue-500" : "text-pink-500"}`}
              title={chatter.gender ?? undefined}
            >
              {genderIcon}
            </span>
          )}
        </div>
        <button
          onClick={() => setFavorite((v) => !v)}
          className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
            favorite ? "text-rose-500" : "text-muted-foreground/40 hover:text-rose-500"
          }`}
          title={favorite ? "Unfavorite" : "Favorite"}
        >
          <Heart className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} />
        </button>
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 min-w-[160px] rounded-xl border border-border bg-card shadow-lg overflow-hidden text-xs">
                <button onClick={() => { onEdit(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-secondary">
                  Edit details
                </button>
                {!login && (
                  <button onClick={() => { onCreateLogin(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-secondary">
                    Create login
                  </button>
                )}
                <button onClick={() => { onCoaching(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-secondary">
                  Coaching note
                </button>
                <div className="h-px bg-border" />
                <button onClick={() => { onDelete(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-rose-500/10 text-rose-500">
                  Remove staff
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2 text-xs">
        <CardRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Job Title" value={roleLabels[chatter.role]} />
        <CardRow
          icon={<Globe2 className="h-3.5 w-3.5" />}
          label="Nationality"
          value={country ? `${flagEmoji(country.code)}  ${country.name}` : "—"}
        />
        <CardRow
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Location"
          value={country ? `${flagEmoji(country.code)}  ${country.name}` : "—"}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            Status
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${statusStyles[chatter.status]}`}>
            ● {statusLabels[chatter.status]}
          </span>
        </div>
      </div>

      {login && (
        <div className="mt-3 pt-3 border-t border-border space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
            <KeyRound className="h-3 w-3" />
            Login
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-mono text-muted-foreground truncate flex-1">{login.username}</span>
            <button
              onClick={() => navigator.clipboard.writeText(login.username)}
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-secondary"
              title="Copy username"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-mono text-muted-foreground truncate flex-1">
              {showPwd ? login.password : "•".repeat(Math.min(login.password.length, 12))}
            </span>
            <button
              onClick={() => setShowPwd((v) => !v)}
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-secondary"
              title={showPwd ? "Hide" : "Reveal"}
            >
              {showPwd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(login.password)}
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-secondary"
              title="Copy password"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CardRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium truncate" title={value}>{value}</span>
    </div>
  );
}
