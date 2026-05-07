import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format, formatDistanceToNow, isToday, isTomorrow, isThisWeek, addWeeks, isWithinInterval, startOfWeek, endOfWeek } from "date-fns";
import { Play, Square, LogOut, Clock as ClockIcon, Calendar } from "lucide-react";
import { logAudit } from "@/lib/audit";

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

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {/* Top bar */}
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{agencyName}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              Hi, {chatter.name} · {roleLabels[chatter.role] ?? "Staff"}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        {/* Active shifts */}
        {activeShifts.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              You're clocked in
            </h2>
            {activeShifts.map((s) => (
              <div key={s.id} className="rounded-2xl border-2 border-success/40 bg-success/5 p-6">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Working with</div>
                    <div className="text-2xl font-bold">{creatorName(s.creator_id)}</div>
                    {s.target_account_name && (
                      <div className="text-xs text-primary mt-0.5 font-medium">
                        on {s.target_account_name}
                      </div>
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
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                    creators.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {assignments.length === 0 && (
                <div className="text-[11px] text-muted-foreground">
                  No specific creators assigned to you — pick any.
                </div>
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

        {/* Schedule (upcoming shifts assigned by admin) */}
        {groupedSchedule.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Your schedule
              </h2>
              <span className="text-[10px] text-muted-foreground/60">
                Times in your local time {localTzAbbr ? `(${localTzAbbr})` : ""}
              </span>
            </div>
            {groupedSchedule.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider px-1">
                  {group.label}
                </div>
                {group.shifts.map((s) => {
                  const start = new Date(s.start_at);
                  const end = s.end_at ? new Date(s.end_at) : null;
                  const durationHours = end
                    ? (end.getTime() - start.getTime()) / 3600_000
                    : null;
                  return (
                    <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">
                            {format(start, "EEE, MMM d")} · {format(start, "h:mm a")}
                            {end && <> – {format(end, "h:mm a")}</>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            for {creatorName(s.creator_id)}
                            {s.target_account_name && <> · on {s.target_account_name}</>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {durationHours != null && (
                            <div className="text-xs font-medium text-muted-foreground">
                              {durationHours.toFixed(1)}h
                            </div>
                          )}
                          <div className="text-[10px] text-muted-foreground/70">
                            in {formatDistanceToNow(start)}
                          </div>
                        </div>
                      </div>
                      {s.notes && (
                        <div className="text-xs text-muted-foreground mt-1.5 italic">"{s.notes}"</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        )}

        {/* Recent shifts */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Your recent shifts
          </h2>
          {closedShifts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
              No completed shifts yet.
            </div>
          ) : (
            <div className="space-y-2">
              {closedShifts.slice(0, 10).map((s) => {
                const hours = s.end_at
                  ? (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600_000
                  : 0;
                return (
                  <div key={s.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-medium">{creatorName(s.creator_id)}</div>
                        {s.target_account_name && (
                          <div className="text-xs text-primary">on {s.target_account_name}</div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(s.start_at), "MMM d, h:mm a")}
                          {s.end_at && <> → {format(new Date(s.end_at), "h:mm a")}</>}
                          {" · "}
                          {hours.toFixed(1)}h
                          {" · "}
                          {formatDistanceToNow(new Date(s.start_at), { addSuffix: true })}
                        </div>
                      </div>
                      <div className="text-right space-y-0.5">
                        {s.total_revenue > 0 && (
                          <>
                            <div className="text-sm font-semibold text-success">{fmt$(s.total_revenue)}</div>
                            <div className="text-[10px] text-muted-foreground">{s.ppv_count} PPVs</div>
                          </>
                        )}
                        {s.posts_count > 0 && (
                          <div className="text-xs">
                            <span className="font-semibold">{s.posts_count}</span> posts
                            {s.upvotes_count > 0 && <> · <span className="font-semibold">{s.upvotes_count.toLocaleString()}</span> {chatter.role === "reddit_va" ? "upvotes" : "likes"}</>}
                          </div>
                        )}
                        {s.dms_handled > 0 && (
                          <div className="text-[10px] text-muted-foreground">{s.dms_handled} DMs</div>
                        )}
                      </div>
                    </div>
                    {s.notes && (
                      <div className="text-xs text-muted-foreground mt-2 italic">"{s.notes}"</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="text-[11px] text-muted-foreground/60 text-center pt-4">
          Need help? Ask your admin. <ClockIcon className="h-3 w-3 inline" /> Times shown in your local timezone.
        </p>
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
