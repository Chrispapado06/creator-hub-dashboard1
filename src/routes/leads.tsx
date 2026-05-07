import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Trash2, ExternalLink, UserPlus, Users as UsersIcon,
  TrendingUp, Mail, Send, ArrowRight, AlertTriangle, Clock,
  Phone, Video, FileText, MessageCircle, StickyNote, Activity,
  Copy, Check, Edit2, Upload, Zap, ListChecks, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/leads")({ component: LeadsPage });

const fmtNum = (n: number) => n.toLocaleString();

type LeadStatus = "new" | "outreach" | "replied" | "negotiating" | "signed" | "lost";
type Lead = {
  id: string;
  name: string;
  handle: string | null;
  status: LeadStatus;
  source_platform: string | null;
  contact_method: string | null;
  contact_value: string | null;
  follower_estimate: number | null;
  notes: string | null;
  signed_at: string | null;
  lost_reason: string | null;
  creator_id: string | null;
  created_at: string;
  updated_at: string;
};
type Creator = { id: string; name: string };
type ActivityType =
  | "dm_sent" | "reply_received" | "call" | "meeting"
  | "contract_sent" | "follow_up" | "note" | "status_change" | "other";
type LeadActivity = {
  id: string;
  lead_id: string;
  activity_type: ActivityType;
  description: string | null;
  occurred_at: string;
  created_at: string;
};
type LeadTask = {
  id: string;
  lead_id: string | null;
  description: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
};
type LeadTemplate = {
  id: string;
  name: string;
  body: string;
  category: string | null;
  created_at: string;
  updated_at: string;
};
type AgencySettings = {
  id: string;
  scrapecreators_api_key: string | null;
};

const statusOrder: LeadStatus[] = ["new", "outreach", "replied", "negotiating", "signed", "lost"];
const statusLabels: Record<LeadStatus, string> = {
  new: "New",
  outreach: "Outreach",
  replied: "Replied",
  negotiating: "Negotiating",
  signed: "Signed",
  lost: "Lost",
};
const statusStyles: Record<LeadStatus, { header: string; column: string }> = {
  new: { header: "bg-muted text-muted-foreground border-border", column: "border-border" },
  outreach: { header: "bg-primary/15 text-primary border-primary/30", column: "border-primary/20" },
  replied: { header: "bg-blue-500/15 text-blue-500 border-blue-500/30", column: "border-blue-500/20" },
  negotiating: { header: "bg-warning/15 text-warning border-warning/30", column: "border-warning/20" },
  signed: { header: "bg-success/15 text-success border-success/30", column: "border-success/30" },
  lost: { header: "bg-destructive/15 text-destructive border-destructive/30", column: "border-destructive/20" },
};

// Stale lead thresholds (days since last activity / update)
const STALE_THRESHOLDS: Partial<Record<LeadStatus, number>> = {
  outreach: 7,
  replied: 3,
  negotiating: 14,
};

const SOURCE_OPTIONS = ["instagram", "tiktok", "twitter", "reddit", "onlyfans", "referral", "agency_outreach", "other"];
const CONTACT_OPTIONS = ["ig_dm", "tiktok_dm", "twitter_dm", "email", "telegram", "whatsapp", "phone", "other"];

const sourceLabel = (s: string | null) => {
  if (!s) return "—";
  const map: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", twitter: "X / Twitter", reddit: "Reddit", onlyfans: "OnlyFans", referral: "Referral", agency_outreach: "Outreach", other: "Other" };
  return map[s] ?? s;
};
const contactLabel = (s: string | null) => {
  if (!s) return "—";
  const map: Record<string, string> = { ig_dm: "IG DM", tiktok_dm: "TikTok DM", twitter_dm: "Twitter DM", email: "Email", telegram: "Telegram", whatsapp: "WhatsApp", phone: "Phone", other: "Other" };
  return map[s] ?? s;
};

const activityTypeLabels: Record<ActivityType, string> = {
  dm_sent: "DM sent",
  reply_received: "Reply received",
  call: "Call",
  meeting: "Meeting",
  contract_sent: "Contract sent",
  follow_up: "Follow-up",
  note: "Note",
  status_change: "Status change",
  other: "Other",
};
const activityTypeIcons: Record<ActivityType, React.ReactNode> = {
  dm_sent: <Send className="h-3 w-3" />,
  reply_received: <MessageCircle className="h-3 w-3" />,
  call: <Phone className="h-3 w-3" />,
  meeting: <Video className="h-3 w-3" />,
  contract_sent: <FileText className="h-3 w-3" />,
  follow_up: <Clock className="h-3 w-3" />,
  note: <StickyNote className="h-3 w-3" />,
  status_change: <ArrowRight className="h-3 w-3" />,
  other: <Activity className="h-3 w-3" />,
};

// Last-touch timestamp = max(updated_at, latest activity occurred_at)
const lastTouch = (lead: Lead, activities: LeadActivity[]): Date => {
  const updatedTs = new Date(lead.updated_at).getTime();
  const acts = activities.filter((a) => a.lead_id === lead.id);
  if (acts.length === 0) return new Date(updatedTs);
  const maxAct = Math.max(...acts.map((a) => new Date(a.occurred_at).getTime()));
  return new Date(Math.max(updatedTs, maxAct));
};

const isStale = (lead: Lead, activities: LeadActivity[]): boolean => {
  const threshold = STALE_THRESHOLDS[lead.status];
  if (!threshold) return false;
  const ageDays = (Date.now() - lastTouch(lead, activities).getTime()) / (24 * 3600_000);
  return ageDays > threshold;
};

const emptyForm = {
  name: "",
  handle: "",
  status: "new" as LeadStatus,
  source_platform: "instagram",
  contact_method: "ig_dm",
  contact_value: "",
  follower_estimate: "",
  notes: "",
  lost_reason: "",
};

function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [templates, setTemplates] = useState<LeadTemplate[]>([]);
  const [settings, setSettings] = useState<AgencySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterSource, setFilterSource] = useState("all");
  const [showStaleOnly, setShowStaleOnly] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const [{ data: ls }, { data: cs }, { data: acts }, { data: tks }, { data: tpls }, { data: s }] = await Promise.all([
      supabase.from("creator_leads").select("*").order("created_at", { ascending: false }),
      supabase.from("creators").select("id, name").order("name"),
      supabase.from("lead_activities").select("*").order("occurred_at", { ascending: false }),
      supabase.from("lead_tasks").select("*").order("due_at", { ascending: true }),
      supabase.from("lead_templates").select("*").order("name"),
      supabase.from("agency_settings").select("id, scrapecreators_api_key").maybeSingle(),
    ]);
    setLeads((ls ?? []) as Lead[]);
    setCreators((cs ?? []) as Creator[]);
    setActivities((acts ?? []) as LeadActivity[]);
    setTasks((tks ?? []) as LeadTask[]);
    setTemplates((tpls ?? []) as LeadTemplate[]);
    setSettings(s as AgencySettings | null);
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(); }, []);
  const refresh = () => load(true);

  // ── Enrichment via ScrapeCreators ────────────────────────────────────────
  const enrichHandle = async (handle: string, platform: string): Promise<{ ok: true; followers: number; bio: string | null } | { ok: false; error: string }> => {
    if (!settings?.scrapecreators_api_key) {
      return { ok: false, error: "Set the ScrapeCreators API key first (button in the Pipeline tab)" };
    }
    if (!handle.trim()) return { ok: false, error: "Handle is required" };
    const cleanHandle = handle.replace(/^@/, "").trim();
    const base = "https://api.scrapecreators.com/v1";
    const headers = { "x-api-key": settings.scrapecreators_api_key };
    try {
      if (platform === "instagram") {
        const res = await fetch(`${base}/instagram/profile?handle=${encodeURIComponent(cleanHandle)}`, { headers });
        if (!res.ok) return { ok: false, error: `IG profile request failed: ${res.status}` };
        const json = (await res.json()) as { data?: { user?: { edge_followed_by?: { count?: number }; biography?: string } }; user?: { edge_followed_by?: { count?: number }; biography?: string } };
        const user = json.data?.user ?? json.user;
        if (!user) return { ok: false, error: "Profile not found" };
        return { ok: true, followers: user.edge_followed_by?.count ?? 0, bio: user.biography ?? null };
      } else if (platform === "tiktok") {
        const res = await fetch(`${base}/tiktok/profile?handle=${encodeURIComponent(cleanHandle)}`, { headers });
        if (!res.ok) return { ok: false, error: `TikTok profile request failed: ${res.status}` };
        const json = (await res.json()) as { user?: { followerCount?: number; signature?: string }; stats?: { followerCount?: number } };
        const followers = json.stats?.followerCount ?? json.user?.followerCount ?? 0;
        return { ok: true, followers, bio: json.user?.signature ?? null };
      }
      return { ok: false, error: `Enrichment not supported for ${platform}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Network error" };
    }
  };

  const onEnrich = async () => {
    if (!form.handle.trim()) return toast.error("Enter a handle first");
    setEnriching(true);
    const r = await enrichHandle(form.handle, form.source_platform);
    setEnriching(false);
    if (!r.ok) return toast.error(r.error);
    setForm({
      ...form,
      follower_estimate: r.followers.toString(),
      notes: r.bio ? (form.notes ? `${form.notes}\n\nBio: ${r.bio}` : `Bio: ${r.bio}`) : form.notes,
    });
    toast.success(`Enriched: ${r.followers.toLocaleString()} followers`);
  };

  // ── Stats / derived data ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filterSource !== "all" && l.source_platform !== filterSource) return false;
      if (showStaleOnly && !isStale(l, activities)) return false;
      return true;
    });
  }, [leads, filterSource, showStaleOnly, activities]);

  const byStatus = useMemo(() => {
    const map: Record<LeadStatus, Lead[]> = {
      new: [], outreach: [], replied: [], negotiating: [], signed: [], lost: [],
    };
    for (const l of filtered) map[l.status].push(l);
    return map;
  }, [filtered]);

  const stats = useMemo(() => {
    const total = leads.length;
    const signed = leads.filter((l) => l.status === "signed").length;
    const lost = leads.filter((l) => l.status === "lost").length;
    const closed = signed + lost;
    const conversionRate = closed > 0 ? (signed / closed) * 100 : null;
    const inPipeline = total - closed;
    const stale = leads.filter((l) => isStale(l, activities)).length;
    return { total, signed, lost, conversionRate, inPipeline, stale };
  }, [leads, activities]);

  const tasksDueToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tasks.filter((t) => {
      if (t.completed_at) return false;
      if (!t.due_at) return false;
      const d = new Date(t.due_at).getTime();
      return d >= today.getTime() && d < tomorrow.getTime();
    });
  }, [tasks]);

  const tasksOverdue = useMemo(() => {
    const now = Date.now();
    return tasks.filter((t) => !t.completed_at && t.due_at && new Date(t.due_at).getTime() < now - 24 * 3600_000);
  }, [tasks]);

  // ── Lead CRUD ────────────────────────────────────────────────────────────
  const startEdit = (l: Lead) => {
    setForm({
      name: l.name,
      handle: l.handle ?? "",
      status: l.status,
      source_platform: l.source_platform ?? "instagram",
      contact_method: l.contact_method ?? "ig_dm",
      contact_value: l.contact_value ?? "",
      follower_estimate: l.follower_estimate?.toString() ?? "",
      notes: l.notes ?? "",
      lost_reason: l.lost_reason ?? "",
    });
    setEditingId(l.id);
    setOpen(true);
  };

  const onSubmit = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    const followers = form.follower_estimate.trim();
    const payload = {
      name: form.name.trim(),
      handle: form.handle.trim() || null,
      status: form.status,
      source_platform: form.source_platform || null,
      contact_method: form.contact_method || null,
      contact_value: form.contact_value.trim() || null,
      follower_estimate: followers ? parseInt(followers) : null,
      notes: form.notes.trim() || null,
      lost_reason: form.status === "lost" ? form.lost_reason.trim() || null : null,
      signed_at: form.status === "signed" ? format(new Date(), "yyyy-MM-dd") : null,
    };
    if (editingId) {
      const previousStatus = leads.find((l) => l.id === editingId)?.status;
      const { error } = await supabase.from("creator_leads").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      if (previousStatus && previousStatus !== form.status) {
        await supabase.from("lead_activities").insert({
          lead_id: editingId,
          activity_type: "status_change",
          description: `${statusLabels[previousStatus]} → ${statusLabels[form.status]}`,
        });
      }
      toast.success("Lead updated");
    } else {
      const { error } = await supabase.from("creator_leads").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Lead added");
    }
    setForm(emptyForm);
    setEditingId(null);
    setOpen(false);
    refresh();
  };

  const onDelete = async (id: string) => {
    const lead = leads.find((l) => l.id === id);
    const { error } = await supabase.from("creator_leads").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "lead_deleted",
      entity_type: "lead",
      entity_id: id,
      entity_name: lead?.name,
    });
    toast.success("Lead deleted");
    refresh();
  };

  const moveToStatus = async (lead: Lead, newStatus: LeadStatus) => {
    const updates: Partial<Lead> = { status: newStatus };
    if (newStatus === "signed") updates.signed_at = format(new Date(), "yyyy-MM-dd");
    const { error } = await supabase.from("creator_leads").update(updates).eq("id", lead.id);
    if (error) return toast.error(error.message);
    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      activity_type: "status_change",
      description: `${statusLabels[lead.status]} → ${statusLabels[newStatus]}`,
    });
    void logAudit({
      action: "lead_status_changed",
      entity_type: "lead",
      entity_id: lead.id,
      entity_name: lead.name,
      details: `${statusLabels[lead.status]} → ${statusLabels[newStatus]}`,
    });
    refresh();
  };

  const convertToCreator = async (lead: Lead) => {
    const { data, error } = await supabase
      .from("creators")
      .insert({ name: lead.name, status: "active" })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    if (data) {
      await supabase
        .from("creator_leads")
        .update({ status: "signed", signed_at: format(new Date(), "yyyy-MM-dd"), creator_id: data.id })
        .eq("id", lead.id);
      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        activity_type: "status_change",
        description: `Converted to creator profile`,
      });
      void logAudit({
        action: "lead_converted",
        entity_type: "lead",
        entity_id: lead.id,
        entity_name: lead.name,
        details: `Created creator profile`,
      });
      toast.success(`Created creator profile for ${lead.name}`);
      refresh();
    }
  };

  // ── Activity / Task / Template handlers (passed down) ────────────────────
  const onAddActivity = async (leadId: string, type: ActivityType, description: string, occurredAt: Date) => {
    const { error } = await supabase.from("lead_activities").insert({
      lead_id: leadId,
      activity_type: type,
      description: description.trim() || null,
      occurred_at: occurredAt.toISOString(),
    });
    if (error) return toast.error(error.message);
    toast.success("Activity logged");
    refresh();
  };

  const onDeleteActivity = async (id: string) => {
    const { error } = await supabase.from("lead_activities").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const onAddTask = async (leadId: string | null, description: string, dueAt: Date | null) => {
    const { error } = await supabase.from("lead_tasks").insert({
      lead_id: leadId,
      description: description.trim(),
      due_at: dueAt?.toISOString() ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Task added");
    refresh();
  };

  const onCompleteTask = async (id: string) => {
    const { error } = await supabase.from("lead_tasks").update({ completed_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const onUncompleteTask = async (id: string) => {
    const { error } = await supabase.from("lead_tasks").update({ completed_at: null }).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const onDeleteTask = async (id: string) => {
    const { error } = await supabase.from("lead_tasks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <div className="space-y-6">
      <Toaster />
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <UserPlus className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Client Acquisition</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Pipeline for signing new creators — track every lead from first DM to signed contract.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <KpiCard label="Total leads" value={fmtNum(stats.total)} sub={`${stats.inPipeline} in pipeline`} icon={<UsersIcon className="h-3.5 w-3.5" />} />
        <KpiCard label="Signed" value={fmtNum(stats.signed)} sub="creators acquired" valueClass="text-success" />
        <KpiCard label="Lost" value={fmtNum(stats.lost)} sub="closed w/o signing" />
        <KpiCard
          label="Conversion rate"
          value={stats.conversionRate != null ? `${stats.conversionRate.toFixed(1)}%` : "—"}
          sub="of closed leads"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Stale leads"
          value={fmtNum(stats.stale)}
          sub="need follow-up"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          valueClass={stats.stale > 0 ? "text-warning" : ""}
        />
      </div>

      {/* Stale alert banner */}
      {stats.stale > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold">{stats.stale} lead{stats.stale === 1 ? "" : "s"} need follow-up</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Outreach &gt; 7 days · Replied &gt; 3 days · Negotiating &gt; 14 days
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant={showStaleOnly ? "default" : "outline"}
            onClick={() => setShowStaleOnly(!showStaleOnly)}
          >
            {showStaleOnly ? "Show all" : "Filter to stale"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      ) : (
        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="activity">
              Activity
              {(tasksDueToday.length + tasksOverdue.length) > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-warning text-warning-foreground text-[10px] font-bold">
                  {tasksDueToday.length + tasksOverdue.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="mt-6">
            <PipelineTab
              leads={leads}
              filtered={filtered}
              byStatus={byStatus}
              activities={activities}
              creators={creators}
              filterSource={filterSource}
              setFilterSource={setFilterSource}
              showStaleOnly={showStaleOnly}
              hasApiKey={!!settings?.scrapecreators_api_key}
              onOpenAdd={() => { setEditingId(null); setForm(emptyForm); setOpen(true); }}
              onOpenBulk={() => setBulkOpen(true)}
              onOpenApiKey={() => setApiKeyOpen(true)}
              onClickLead={startEdit}
              onMove={moveToStatus}
              onConvert={convertToCreator}
              onDelete={onDelete}
            />
          </TabsContent>

          <TabsContent value="activity" className="mt-6">
            <ActivityTab
              leads={leads}
              activities={activities}
              tasks={tasks}
              tasksDueToday={tasksDueToday}
              tasksOverdue={tasksOverdue}
              onAddTask={onAddTask}
              onCompleteTask={onCompleteTask}
              onUncompleteTask={onUncompleteTask}
              onDeleteTask={onDeleteTask}
              onClickLead={startEdit}
            />
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <AnalyticsTab leads={leads} activities={activities} />
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <TemplatesTab templates={templates} onRefresh={refresh} />
          </TabsContent>
        </Tabs>
      )}

      {/* Lead detail / edit dialog */}
      <LeadDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(emptyForm); } }}
        editingId={editingId}
        form={form}
        setForm={setForm}
        onSubmit={onSubmit}
        onEnrich={onEnrich}
        enriching={enriching}
        hasApiKey={!!settings?.scrapecreators_api_key}
        // Activity log + tasks for this lead
        activities={activities.filter((a) => editingId && a.lead_id === editingId)}
        leadTasks={tasks.filter((t) => editingId && t.lead_id === editingId)}
        templates={templates}
        onAddActivity={onAddActivity}
        onDeleteActivity={onDeleteActivity}
        onAddTask={onAddTask}
        onCompleteTask={onCompleteTask}
        onUncompleteTask={onUncompleteTask}
        onDeleteTask={onDeleteTask}
      />

      {/* Bulk import dialog */}
      <BulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        hasApiKey={!!settings?.scrapecreators_api_key}
        onImport={async (rows, alsoEnrich) => {
          let ok = 0;
          let failed = 0;
          let enriched = 0;
          for (const r of rows) {
            let follower_estimate: number | null = null;
            let notes: string | null = null;
            if (alsoEnrich && r.handle && r.source && (r.source === "instagram" || r.source === "tiktok")) {
              const er = await enrichHandle(r.handle, r.source);
              if (er.ok) {
                follower_estimate = er.followers;
                if (er.bio) notes = `Bio: ${er.bio}`;
                enriched++;
              }
            }
            const { error } = await supabase.from("creator_leads").insert({
              name: r.name,
              handle: r.handle,
              status: "new",
              source_platform: r.source ?? "other",
              follower_estimate,
              notes,
            });
            if (error) failed++; else ok++;
          }
          if (failed === 0) toast.success(`Imported ${ok} lead${ok === 1 ? "" : "s"}${enriched > 0 ? ` · ${enriched} enriched` : ""}`);
          else toast.warning(`Imported ${ok} · ${failed} failed`);
          setBulkOpen(false);
          refresh();
        }}
      />

      {/* API key dialog */}
      <ApiKeyDialog
        open={apiKeyOpen}
        onOpenChange={setApiKeyOpen}
        currentKey={settings?.scrapecreators_api_key ?? null}
        settingsId={settings?.id ?? null}
        onSaved={refresh}
      />
    </div>
  );
}

// ── Pipeline Tab ────────────────────────────────────────────────────────────
function PipelineTab({
  leads, filtered, byStatus, activities, creators, filterSource, setFilterSource,
  showStaleOnly, hasApiKey, onOpenAdd, onOpenBulk, onOpenApiKey,
  onClickLead, onMove, onConvert, onDelete,
}: {
  leads: Lead[];
  filtered: Lead[];
  byStatus: Record<LeadStatus, Lead[]>;
  activities: LeadActivity[];
  creators: Creator[];
  filterSource: string;
  setFilterSource: (v: string) => void;
  showStaleOnly: boolean;
  hasApiKey: boolean;
  onOpenAdd: () => void;
  onOpenBulk: () => void;
  onOpenApiKey: () => void;
  onClickLead: (l: Lead) => void;
  onMove: (l: Lead, s: LeadStatus) => void;
  onConvert: (l: Lead) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {SOURCE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{sourceLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
            {showStaleOnly && " (stale only)"}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={onOpenApiKey}>
            <Zap className={`h-3.5 w-3.5 mr-1.5 ${hasApiKey ? "text-success" : ""}`} />
            {hasApiKey ? "Enrichment API" : "Setup API"}
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenBulk}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Bulk import
          </Button>
          <Button size="sm" onClick={onOpenAdd}>
            <Plus className="h-4 w-4 mr-1.5" />Add lead
          </Button>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No leads yet — click "Add lead" to start your pipeline.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {statusOrder.map((status) => (
            <div
              key={status}
              className={`rounded-xl border ${statusStyles[status].column} bg-card/40 p-3 space-y-2 min-h-[200px]`}
            >
              <div className={`flex items-center justify-between rounded-md px-2 py-1 text-xs border ${statusStyles[status].header}`}>
                <span className="font-semibold">{statusLabels[status]}</span>
                <span className="font-mono">{byStatus[status].length}</span>
              </div>
              {byStatus[status].length === 0 ? (
                <div className="text-[11px] text-muted-foreground/50 italic px-2 py-4 text-center">empty</div>
              ) : (
                byStatus[status].map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    activities={activities}
                    onClick={() => onClickLead(lead)}
                    onMove={(s) => onMove(lead, s)}
                    onConvert={() => onConvert(lead)}
                    onDelete={() => onDelete(lead.id)}
                    creators={creators}
                  />
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeadCard({
  lead, activities, onClick, onMove, onConvert, onDelete, creators,
}: {
  lead: Lead;
  activities: LeadActivity[];
  onClick: () => void;
  onMove: (s: LeadStatus) => void;
  onConvert: () => void;
  onDelete: () => void;
  creators: Creator[];
}) {
  const linkedCreator = lead.creator_id ? creators.find((c) => c.id === lead.creator_id) : null;
  const nextStatus: Partial<Record<LeadStatus, LeadStatus>> = {
    new: "outreach",
    outreach: "replied",
    replied: "negotiating",
    negotiating: "signed",
  };
  const next = nextStatus[lead.status];
  const stale = isStale(lead, activities);
  const lastTouchDate = lastTouch(lead, activities);
  const activityCount = activities.filter((a) => a.lead_id === lead.id).length;

  return (
    <div className={`rounded-lg border bg-card hover:border-primary/40 transition-colors group ${
      stale ? "border-warning/40 bg-warning/5" : "border-border"
    }`}>
      <button onClick={onClick} className="block w-full text-left p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-sm">{lead.name}</div>
            {lead.handle && (
              <div className="text-xs text-muted-foreground">{lead.handle}</div>
            )}
          </div>
          {stale && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning shrink-0">
              <AlertTriangle className="h-2.5 w-2.5" />
              stale
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
          <span>{sourceLabel(lead.source_platform)}</span>
          {lead.follower_estimate != null && (
            <span>{fmtNum(lead.follower_estimate)} followers</span>
          )}
        </div>
        {activityCount > 0 && (
          <div className="text-[10px] text-muted-foreground/80 mt-1.5 inline-flex items-center gap-1">
            <Activity className="h-2.5 w-2.5" />
            {activityCount} {activityCount === 1 ? "touch" : "touches"}
          </div>
        )}
        {linkedCreator && (
          <div className="text-[10px] text-success mt-1.5">
            ↳ Creator: {linkedCreator.name}
          </div>
        )}
        {lead.signed_at && (
          <div className="text-[10px] text-success mt-1">
            Signed {format(new Date(lead.signed_at), "MMM d, yyyy")}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground/60 mt-1.5">
          last touch {formatDistanceToNow(lastTouchDate, { addSuffix: true })}
        </div>
      </button>
      <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1">
          {next && (
            <button
              onClick={() => onMove(next)}
              className="text-[10px] inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
              title={`Move to ${statusLabels[next]}`}
            >
              <Send className="h-2.5 w-2.5" />
              {statusLabels[next]}
            </button>
          )}
          {lead.status !== "signed" && lead.status !== "lost" && (
            <button
              onClick={onConvert}
              className="text-[10px] inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-success/10 text-success hover:bg-success/20"
              title="Convert to creator"
            >
              <ArrowRight className="h-2.5 w-2.5" />
              Sign
            </button>
          )}
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="text-muted-foreground hover:text-destructive p-0.5">
              <Trash2 className="h-3 w-3" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {lead.name}?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ── Lead Dialog (edit + activity log + tasks) ───────────────────────────────
function LeadDialog({
  open, onOpenChange, editingId, form, setForm, onSubmit, onEnrich, enriching, hasApiKey,
  activities, leadTasks, templates,
  onAddActivity, onDeleteActivity, onAddTask, onCompleteTask, onUncompleteTask, onDeleteTask,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editingId: string | null;
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  onSubmit: () => void;
  onEnrich: () => void;
  enriching: boolean;
  hasApiKey: boolean;
  activities: LeadActivity[];
  leadTasks: LeadTask[];
  templates: LeadTemplate[];
  onAddActivity: (leadId: string, type: ActivityType, description: string, occurredAt: Date) => Promise<unknown>;
  onDeleteActivity: (id: string) => Promise<unknown>;
  onAddTask: (leadId: string | null, description: string, dueAt: Date | null) => Promise<unknown>;
  onCompleteTask: (id: string) => Promise<unknown>;
  onUncompleteTask: (id: string) => Promise<unknown>;
  onDeleteTask: (id: string) => Promise<unknown>;
}) {
  const [activityForm, setActivityForm] = useState({ type: "dm_sent" as ActivityType, description: "" });
  const [taskForm, setTaskForm] = useState({ description: "", due_at: "" });
  const canEnrich = hasApiKey && (form.source_platform === "instagram" || form.source_platform === "tiktok") && form.handle.trim().length > 0;

  const fillTemplate = (t: LeadTemplate) => {
    const filled = t.body
      .replace(/\{\{name\}\}/g, form.name || "{{name}}")
      .replace(/\{\{handle\}\}/g, form.handle || "{{handle}}");
    navigator.clipboard.writeText(filled);
    toast.success(`Copied: ${t.name}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editingId ? "Edit lead" : "Add new lead"}</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          {/* Form fields */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Real name or stage name" />
              </div>
              <div className="space-y-1.5">
                <Label>Handle <span className="text-muted-foreground text-xs">(opt)</span></Label>
                <div className="flex gap-1.5">
                  <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="@username" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onEnrich}
                    disabled={!canEnrich || enriching}
                    title={
                      !hasApiKey ? "Set ScrapeCreators API key first"
                      : !form.handle.trim() ? "Enter a handle"
                      : (form.source_platform !== "instagram" && form.source_platform !== "tiktok") ? "Only IG/TikTok supported"
                      : "Auto-fill follower count + bio"
                    }
                  >
                    <Zap className={`h-3.5 w-3.5 ${enriching ? "animate-pulse" : ""}`} />
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as LeadStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOrder.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source platform</Label>
                <Select value={form.source_platform} onValueChange={(v) => setForm({ ...form, source_platform: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{sourceLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact method</Label>
                <Select value={form.contact_method} onValueChange={(v) => setForm({ ...form, contact_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTACT_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{contactLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contact value</Label>
                <Input value={form.contact_value} onChange={(e) => setForm({ ...form, contact_value: e.target.value })} placeholder="@handle, email, etc." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Estimated followers <span className="text-muted-foreground text-xs">(opt)</span></Label>
              <Input
                type="number"
                value={form.follower_estimate}
                onChange={(e) => setForm({ ...form, follower_estimate: e.target.value })}
                placeholder="e.g. 50000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any context worth remembering" />
            </div>
            {form.status === "lost" && (
              <div className="space-y-1.5">
                <Label>Lost reason</Label>
                <Input value={form.lost_reason} onChange={(e) => setForm({ ...form, lost_reason: e.target.value })} placeholder="Why didn't they sign?" />
              </div>
            )}

            {/* Quick template copy */}
            {editingId && templates.length > 0 && (
              <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Copy className="h-3 w-3" />
                  Quick template (copies to clipboard)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => fillTemplate(t)}
                      className="text-[11px] px-2 py-1 rounded border border-border bg-card hover:bg-secondary transition-colors"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {editingId && (
            <>
              {/* Activity log */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Activity className="h-3 w-3" />
                  Activity log
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-[140px_1fr_auto] gap-2">
                    <Select value={activityForm.type} onValueChange={(v) => setActivityForm({ ...activityForm, type: v as ActivityType })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(activityTypeLabels) as ActivityType[]).filter((t) => t !== "status_change").map((t) => (
                          <SelectItem key={t} value={t}>{activityTypeLabels[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-8 text-xs"
                      placeholder="What happened?"
                      value={activityForm.description}
                      onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        await onAddActivity(editingId, activityForm.type, activityForm.description, new Date());
                        setActivityForm({ type: "dm_sent", description: "" });
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {activities.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground/60 italic">No activity logged yet.</div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {activities.map((a) => (
                      <div key={a.id} className="flex items-start gap-2 text-xs rounded-md bg-secondary/30 px-2 py-1.5 group/act">
                        <span className="mt-0.5 text-primary shrink-0">{activityTypeIcons[a.activity_type]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-medium">{activityTypeLabels[a.activity_type]}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(a.occurred_at), { addSuffix: true })}
                            </span>
                          </div>
                          {a.description && <div className="text-muted-foreground mt-0.5 break-words">{a.description}</div>}
                        </div>
                        <button
                          onClick={() => onDeleteActivity(a.id)}
                          className="text-muted-foreground/40 hover:text-destructive opacity-0 group-hover/act:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tasks */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ListChecks className="h-3 w-3" />
                  Tasks
                </div>
                <div className="grid grid-cols-[1fr_180px_auto] gap-2">
                  <Input
                    className="h-8 text-xs"
                    placeholder="Follow-up to do"
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  />
                  <Input
                    type="datetime-local"
                    className="h-8 text-xs"
                    value={taskForm.due_at}
                    onChange={(e) => setTaskForm({ ...taskForm, due_at: e.target.value })}
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!taskForm.description.trim()) return toast.error("Task description required");
                      await onAddTask(
                        editingId,
                        taskForm.description,
                        taskForm.due_at ? new Date(taskForm.due_at) : null
                      );
                      setTaskForm({ description: "", due_at: "" });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {leadTasks.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground/60 italic">No tasks for this lead.</div>
                ) : (
                  <div className="space-y-1.5">
                    {leadTasks.map((t) => {
                      const isOverdue = !t.completed_at && t.due_at && new Date(t.due_at).getTime() < Date.now();
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center gap-2 text-xs rounded-md px-2 py-1.5 group/tk ${
                            t.completed_at ? "bg-secondary/20 opacity-60" : isOverdue ? "bg-destructive/5 border border-destructive/30" : "bg-secondary/30"
                          }`}
                        >
                          <button
                            onClick={() => t.completed_at ? onUncompleteTask(t.id) : onCompleteTask(t.id)}
                            className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                              t.completed_at ? "bg-success border-success text-success-foreground" : "border-muted-foreground/40 hover:border-primary"
                            }`}
                          >
                            {t.completed_at && <Check className="h-3 w-3" />}
                          </button>
                          <span className={`flex-1 ${t.completed_at ? "line-through" : ""}`}>{t.description}</span>
                          {t.due_at && (
                            <span className={`text-[10px] ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              {format(new Date(t.due_at), "MMM d, h:mm a")}
                            </span>
                          )}
                          <button
                            onClick={() => onDeleteTask(t.id)}
                            className="text-muted-foreground/40 hover:text-destructive opacity-0 group-hover/tk:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={onSubmit}>{editingId ? "Save changes" : "Add lead"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Activity Tab ────────────────────────────────────────────────────────────
function ActivityTab({
  leads, activities, tasks, tasksDueToday, tasksOverdue,
  onAddTask, onCompleteTask, onUncompleteTask, onDeleteTask, onClickLead,
}: {
  leads: Lead[];
  activities: LeadActivity[];
  tasks: LeadTask[];
  tasksDueToday: LeadTask[];
  tasksOverdue: LeadTask[];
  onAddTask: (leadId: string | null, description: string, dueAt: Date | null) => Promise<unknown>;
  onCompleteTask: (id: string) => Promise<unknown>;
  onUncompleteTask: (id: string) => Promise<unknown>;
  onDeleteTask: (id: string) => Promise<unknown>;
  onClickLead: (l: Lead) => void;
}) {
  const [newTask, setNewTask] = useState({ description: "", due_at: "", lead_id: "" });
  const upcoming = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const sevenDays = new Date(tomorrow);
    sevenDays.setDate(sevenDays.getDate() + 7);
    return tasks.filter((t) => {
      if (t.completed_at || !t.due_at) return false;
      const d = new Date(t.due_at).getTime();
      return d >= tomorrow.getTime() && d < sevenDays.getTime();
    });
  }, [tasks]);
  const completed = useMemo(() => tasks.filter((t) => t.completed_at).slice(0, 10), [tasks]);
  const recentActivity = useMemo(() => activities.slice(0, 30), [activities]);

  const leadName = (id: string | null) => id ? leads.find((l) => l.id === id)?.name ?? "—" : "(general)";
  const leadById = (id: string | null) => id ? leads.find((l) => l.id === id) ?? null : null;

  const TaskRow = ({ t }: { t: LeadTask }) => {
    const isOverdue = !t.completed_at && t.due_at && new Date(t.due_at).getTime() < Date.now();
    const lead = leadById(t.lead_id);
    return (
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-2 group/tk ${
          t.completed_at ? "bg-secondary/20 opacity-60" : isOverdue ? "bg-destructive/5 border border-destructive/30" : "bg-card border border-border"
        }`}
      >
        <button
          onClick={() => t.completed_at ? onUncompleteTask(t.id) : onCompleteTask(t.id)}
          className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${
            t.completed_at ? "bg-success border-success text-success-foreground" : "border-muted-foreground/40 hover:border-primary"
          }`}
        >
          {t.completed_at && <Check className="h-3.5 w-3.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className={`text-sm ${t.completed_at ? "line-through" : ""}`}>{t.description}</div>
          {lead && (
            <button
              onClick={() => onClickLead(lead)}
              className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              <UserPlus className="h-2.5 w-2.5" />
              {lead.name}
            </button>
          )}
        </div>
        {t.due_at && (
          <span className={`text-xs whitespace-nowrap ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            {format(new Date(t.due_at), "MMM d, h:mm a")}
          </span>
        )}
        <button
          onClick={() => onDeleteTask(t.id)}
          className="text-muted-foreground/40 hover:text-destructive opacity-0 group-hover/tk:opacity-100 transition-opacity"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        {/* Add task */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Plus className="h-3 w-3" /> Add task
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_180px_auto] gap-2">
            <Input
              placeholder="What needs doing?"
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            />
            <Select value={newTask.lead_id} onValueChange={(v) => setNewTask({ ...newTask, lead_id: v })}>
              <SelectTrigger><SelectValue placeholder="(general)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">(general)</SelectItem>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="datetime-local"
              value={newTask.due_at}
              onChange={(e) => setNewTask({ ...newTask, due_at: e.target.value })}
            />
            <Button
              onClick={async () => {
                if (!newTask.description.trim()) return toast.error("Description required");
                await onAddTask(
                  newTask.lead_id && newTask.lead_id !== "general" ? newTask.lead_id : null,
                  newTask.description,
                  newTask.due_at ? new Date(newTask.due_at) : null
                );
                setNewTask({ description: "", due_at: "", lead_id: "" });
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Overdue */}
        {tasksOverdue.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-destructive mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Overdue ({tasksOverdue.length})
            </div>
            <div className="space-y-1.5">
              {tasksOverdue.map((t) => <TaskRow key={t.id} t={t} />)}
            </div>
          </div>
        )}

        {/* Today */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            Today ({tasksDueToday.length})
          </div>
          {tasksDueToday.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
              No tasks due today.
            </div>
          ) : (
            <div className="space-y-1.5">
              {tasksDueToday.map((t) => <TaskRow key={t.id} t={t} />)}
            </div>
          )}
        </div>

        {/* Upcoming (next 7 days) */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Upcoming (next 7 days, {upcoming.length})
          </div>
          {upcoming.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
              No tasks scheduled in the next 7 days.
            </div>
          ) : (
            <div className="space-y-1.5">
              {upcoming.map((t) => <TaskRow key={t.id} t={t} />)}
            </div>
          )}
        </div>

        {/* Completed (last 10) */}
        {completed.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Recently completed
            </div>
            <div className="space-y-1.5">
              {completed.map((t) => <TaskRow key={t.id} t={t} />)}
            </div>
          </div>
        )}
      </div>

      {/* Recent activity feed */}
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Activity className="h-3 w-3" />
          Recent activity (all leads)
        </div>
        {recentActivity.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
            No activity logged yet.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {recentActivity.map((a) => {
              const lead = leadById(a.lead_id);
              return (
                <div key={a.id} className="flex items-start gap-2 text-xs rounded-md bg-card border border-border px-2 py-1.5">
                  <span className="mt-0.5 text-primary shrink-0">{activityTypeIcons[a.activity_type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-medium">{activityTypeLabels[a.activity_type]}</span>
                      {lead && (
                        <button
                          onClick={() => onClickLead(lead)}
                          className="text-primary hover:underline"
                        >
                          {leadName(a.lead_id)}
                        </button>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(a.occurred_at), { addSuffix: true })}
                      </span>
                    </div>
                    {a.description && <div className="text-muted-foreground mt-0.5 break-words">{a.description}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Analytics Tab ───────────────────────────────────────────────────────────
function AnalyticsTab({ leads, activities }: { leads: Lead[]; activities: LeadActivity[] }) {
  const funnelData = useMemo(() => {
    return statusOrder.map((status) => ({
      status: statusLabels[status],
      count: leads.filter((l) => l.status === status).length,
      raw: status,
    }));
  }, [leads]);

  const sourceData = useMemo(() => {
    const map = new Map<string, { total: number; signed: number; lost: number }>();
    for (const l of leads) {
      const src = l.source_platform ?? "unknown";
      const existing = map.get(src) ?? { total: 0, signed: 0, lost: 0 };
      map.set(src, {
        total: existing.total + 1,
        signed: existing.signed + (l.status === "signed" ? 1 : 0),
        lost: existing.lost + (l.status === "lost" ? 1 : 0),
      });
    }
    return Array.from(map.entries())
      .map(([src, s]) => {
        const closed = s.signed + s.lost;
        const rate = closed > 0 ? (s.signed / closed) * 100 : 0;
        return { source: sourceLabel(src), total: s.total, signed: s.signed, lost: s.lost, rate: Math.round(rate) };
      })
      .sort((a, b) => b.total - a.total);
  }, [leads]);

  const lostReasons = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads.filter((x) => x.status === "lost" && x.lost_reason)) {
      const r = l.lost_reason!.toLowerCase().trim().slice(0, 40);
      map.set(r, (map.get(r) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  // Time to sign (average days from created → signed_at)
  const timeToSign = useMemo(() => {
    const signed = leads.filter((l) => l.status === "signed" && l.signed_at);
    if (signed.length === 0) return null;
    const days = signed.map((l) => {
      const created = new Date(l.created_at).getTime();
      const signedAt = new Date(l.signed_at!).getTime();
      return Math.max(0, (signedAt - created) / (24 * 3600_000));
    });
    return days.reduce((s, x) => s + x, 0) / days.length;
  }, [leads]);

  // Velocity: leads added per week last 8 weeks
  const velocity = useMemo(() => {
    const weeks: { label: string; added: number; signed: number }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dow = now.getDay();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - dow);
    for (let i = 7; i >= 0; i--) {
      const start = new Date(thisWeekStart);
      start.setDate(thisWeekStart.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const added = leads.filter((l) => {
        const t = new Date(l.created_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      }).length;
      const signed = leads.filter((l) => {
        if (!l.signed_at) return false;
        const t = new Date(l.signed_at).getTime();
        return t >= start.getTime() && t < end.getTime();
      }).length;
      weeks.push({ label: format(start, "MMM d"), added, signed });
    }
    return weeks;
  }, [leads]);

  // Insights
  const insights = useMemo(() => {
    const out: string[] = [];
    if (sourceData.length >= 2) {
      const withClosed = sourceData.filter((s) => s.signed + s.lost > 0);
      if (withClosed.length >= 2) {
        const sorted = [...withClosed].sort((a, b) => b.rate - a.rate);
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        if (best.rate > worst.rate + 15) {
          out.push(`${best.source} converts ${best.rate}% vs ${worst.source} at ${worst.rate}% — invest more outreach in ${best.source}.`);
        }
      }
    }
    const newCount = leads.filter((l) => l.status === "new").length;
    const outreachCount = leads.filter((l) => l.status === "outreach").length;
    if (newCount > 10 && outreachCount < newCount / 2) {
      out.push(`${newCount} leads sitting in "New" but only ${outreachCount} in Outreach — start reaching out.`);
    }
    if (timeToSign != null && timeToSign > 30) {
      out.push(`Avg time-to-sign is ${timeToSign.toFixed(0)} days — speed up the negotiation phase.`);
    }
    if (lostReasons.length > 0 && lostReasons[0].count >= 2) {
      out.push(`Top "lost" reason: "${lostReasons[0].reason}" (${lostReasons[0].count} leads). Consider an objection-handling angle.`);
    }
    return out;
  }, [sourceData, leads, timeToSign, lostReasons]);

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
        Add leads first to see analytics.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {insights.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-2 text-primary">Insights</div>
          <ul className="space-y-1.5 text-sm">
            {insights.map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary mt-1.5 h-1 w-1 rounded-full bg-primary shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Time to sign" value={timeToSign != null ? `${timeToSign.toFixed(0)}d` : "—"} sub="avg created → signed" />
        <KpiCard label="In Outreach" value={leads.filter((l) => l.status === "outreach").length} sub="actively reaching out" />
        <KpiCard label="In Negotiating" value={leads.filter((l) => l.status === "negotiating").length} sub="closing phase" />
        <KpiCard label="Sources tracked" value={sourceData.length} sub="distinct platforms" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Funnel" sub="leads at each stage">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={funnelData} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="status" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={90} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                {funnelData.map((d, i) => {
                  const colors: Record<string, string> = {
                    new: "#94A3B8", outreach: "#E1306C", replied: "#3B82F6",
                    negotiating: "#F59E0B", signed: "#10B981", lost: "#EF4444",
                  };
                  return <Cell key={i} fill={colors[d.raw] ?? "#94A3B8"} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lead velocity" sub="added vs signed per week (8 weeks)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={velocity} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar dataKey="added" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="Added" />
              <Bar dataKey="signed" fill="#10B981" radius={[3, 3, 0, 0]} name="Signed" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Conversion by source</h3>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Source</th>
                <th className="text-right font-medium px-4 py-3">Total leads</th>
                <th className="text-right font-medium px-4 py-3">Signed</th>
                <th className="text-right font-medium px-4 py-3">Lost</th>
                <th className="text-right font-medium px-4 py-3">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {sourceData.map((s) => (
                <tr key={s.source} className="border-t border-border bg-card">
                  <td className="px-4 py-3 font-medium">{s.source}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{s.total}</td>
                  <td className="px-4 py-3 text-right text-success">{s.signed}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{s.lost}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {s.signed + s.lost > 0 ? `${s.rate}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {lostReasons.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Why leads are saying no</h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Reason</th>
                  <th className="text-right font-medium px-4 py-3">Count</th>
                </tr>
              </thead>
              <tbody>
                {lostReasons.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t border-border bg-card">
                    <td className="px-4 py-3 capitalize">{r.reason}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Templates Tab ───────────────────────────────────────────────────────────
function TemplatesTab({ templates, onRefresh }: { templates: LeadTemplate[]; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", body: "", category: "" });
  const [copied, setCopied] = useState<string | null>(null);

  const startEdit = (t: LeadTemplate) => {
    setForm({ name: t.name, body: t.body, category: t.category ?? "" });
    setEditingId(t.id);
    setOpen(true);
  };

  const onSubmit = async () => {
    if (!form.name.trim() || !form.body.trim()) return toast.error("Name and body are required");
    const payload = {
      name: form.name.trim(),
      body: form.body.trim(),
      category: form.category.trim() || null,
    };
    if (editingId) {
      const { error } = await supabase.from("lead_templates").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Template saved");
    } else {
      const { error } = await supabase.from("lead_templates").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Template created");
    }
    setForm({ name: "", body: "", category: "" });
    setEditingId(null);
    setOpen(false);
    onRefresh();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("lead_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Template deleted");
    onRefresh();
  };

  const onCopy = (t: LeadTemplate) => {
    navigator.clipboard.writeText(t.body);
    setCopied(t.id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Save your best outreach scripts. Use <code className="bg-secondary/40 px-1 rounded text-xs">{"{{name}}"}</code> and <code className="bg-secondary/40 px-1 rounded text-xs">{"{{handle}}"}</code> for placeholders that auto-fill when copying from a lead.
        </p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm({ name: "", body: "", category: "" }); } }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />New template</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Initial DM v2" />
                </div>
                <div className="space-y-1.5">
                  <Label>Category <span className="text-muted-foreground text-xs">(opt)</span></Label>
                  <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="cold outreach / warm follow-up / …" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Body</Label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder={"Hey {{name}}!\n\nLove your {{handle}} content — would you be open to chatting about a partnership?"}
                  rows={8}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="text-[11px] text-muted-foreground">Placeholders fill in when you copy from a lead's detail dialog.</div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onSubmit}>{editingId ? "Save" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No templates yet — create your first outreach script.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-card p-4 group/tpl">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-semibold text-sm">{t.name}</div>
                  {t.category && <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.category}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onCopy(t)}
                    className="rounded p-1.5 text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                    title="Copy raw body"
                  >
                    {copied === t.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => startEdit(t)}
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
                        <AlertDialogTitle>Delete "{t.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(t.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans bg-secondary/20 rounded-md p-3 max-h-40 overflow-y-auto">{t.body}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bulk Import Dialog ──────────────────────────────────────────────────────
function BulkImportDialog({
  open, onOpenChange, hasApiKey, onImport,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hasApiKey: boolean;
  onImport: (rows: { name: string; handle: string | null; source: string | null }[], alsoEnrich: boolean) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [defaultSource, setDefaultSource] = useState("instagram");
  const [alsoEnrich, setAlsoEnrich] = useState(false);
  const [importing, setImporting] = useState(false);

  const parsed = useMemo(() => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // Format: "Name | handle | source"  OR  "handle"  OR  "Name, handle"
        const parts = line.split(/[|,]/).map((p) => p.trim()).filter(Boolean);
        if (parts.length === 1) {
          // Just a handle — name = handle
          const handle = parts[0].replace(/^@/, "");
          return { name: handle, handle, source: defaultSource };
        }
        if (parts.length === 2) {
          return { name: parts[0], handle: parts[1].replace(/^@/, ""), source: defaultSource };
        }
        return { name: parts[0], handle: parts[1].replace(/^@/, ""), source: parts[2] || defaultSource };
      });
  }, [text, defaultSource]);

  const onRun = async () => {
    if (parsed.length === 0) return toast.error("Paste at least one row");
    setImporting(true);
    await onImport(parsed, alsoEnrich);
    setImporting(false);
    setText("");
    setAlsoEnrich(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bulk import leads</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-xs text-muted-foreground">
            Paste one lead per line. Accepted formats:
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li><code className="bg-secondary/40 px-1 rounded">handle</code> — uses the default source below</li>
              <li><code className="bg-secondary/40 px-1 rounded">Name | handle</code></li>
              <li><code className="bg-secondary/40 px-1 rounded">Name | handle | source</code> (source from: instagram, tiktok, twitter, reddit, …)</li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Default source</Label>
              <Select value={defaultSource} onValueChange={setDefaultSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{sourceLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex flex-col justify-end">
              <label className={`flex items-center gap-2 text-sm cursor-pointer ${!hasApiKey ? "opacity-50 cursor-not-allowed" : ""}`}>
                <input
                  type="checkbox"
                  checked={alsoEnrich}
                  disabled={!hasApiKey}
                  onChange={(e) => setAlsoEnrich(e.target.checked)}
                />
                <Zap className="h-3.5 w-3.5 text-primary" />
                Also enrich (IG/TikTok)
              </label>
              <div className="text-[11px] text-muted-foreground">
                {hasApiKey ? "Adds follower count + bio per row (slow for large lists)." : "Set ScrapeCreators API key first."}
              </div>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={"luna_xo\nMaylee | @maylee.real | tiktok\nCharlie | charlie_creator"}
          />
          <div className="text-xs text-muted-foreground">
            {parsed.length === 0
              ? "Paste rows above to preview…"
              : `${parsed.length} lead${parsed.length === 1 ? "" : "s"} ready to import.`}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onRun} disabled={parsed.length === 0 || importing}>
            {importing ? "Importing…" : `Import ${parsed.length} lead${parsed.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ScrapeCreators API Key Dialog ───────────────────────────────────────────
function ApiKeyDialog({
  open, onOpenChange, currentKey, settingsId, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentKey: string | null;
  settingsId: string | null;
  onSaved: () => void;
}) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setKey(""); }, [open]);

  const onSave = async () => {
    setSaving(true);
    if (settingsId) {
      const { error } = await supabase.from("agency_settings").update({ scrapecreators_api_key: key.trim() || null }).eq("id", settingsId);
      if (error) { setSaving(false); return toast.error(error.message); }
    } else {
      const { error } = await supabase.from("agency_settings").insert({ scrapecreators_api_key: key.trim() || null });
      if (error) { setSaving(false); return toast.error(error.message); }
    }
    setSaving(false);
    toast.success(key.trim() ? "API key saved" : "API key cleared");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Lead enrichment API
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground space-y-1">
            <div>Auto-fills follower counts + bios from IG / TikTok handles when adding or bulk-importing leads.</div>
            <div>Get a key at <a href="https://scrapecreators.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">scrapecreators.com</a> — pay per request, ~$0.001/profile.</div>
          </div>
          {currentKey && (
            <div className="text-xs text-success inline-flex items-center gap-1.5">
              <Check className="h-3 w-3" />
              Currently connected (saved key starts with {currentKey.slice(0, 6)}…)
            </div>
          )}
          <div className="space-y-1.5">
            <Label>API key</Label>
            <Input
              type="password"
              placeholder={currentKey ? "Leave blank to keep · paste new to replace · empty + save to clear" : "sk-…"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared cards ────────────────────────────────────────────────────────────
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
      <div className={`text-2xl font-bold ${valueClass ?? ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function ChartCard({
  title, sub, children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      {children}
    </div>
  );
}
