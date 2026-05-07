import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Megaphone, GraduationCap, MessageSquare, Pin, PinOff,
  Target, Save,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO, addMonths } from "date-fns";
import { logAudit } from "@/lib/audit";

type Creator = { id: string; name: string };
type Chatter = { id: string; name: string; role: string };

const ROLE_SCOPES = [
  { value: "all",            label: "All staff" },
  { value: "chatter",        label: "Chatters only" },
  { value: "reddit_va",      label: "Reddit VAs" },
  { value: "instagram_va",   label: "Instagram VAs" },
  { value: "facebook_va",    label: "Facebook VAs" },
  { value: "tiktok_va",      label: "TikTok VAs" },
  { value: "x_va",           label: "X VAs" },
  { value: "social_media_va", label: "Social media VAs" },
  { value: "content_editor", label: "Content editors" },
  { value: "manager",        label: "Managers" },
];

const TRAINING_CATEGORIES = [
  { value: "onboarding",  label: "Onboarding" },
  { value: "policies",    label: "Policies" },
  { value: "playbook",    label: "Per-creator playbook" },
  { value: "tactics",     label: "Tactics & best practices" },
  { value: "compliance",  label: "Compliance" },
  { value: "other",       label: "Other" },
];

const SCRIPT_CATEGORIES = [
  { value: "opener",          label: "Opener" },
  { value: "tease",           label: "Tease" },
  { value: "ppv_unlock",      label: "PPV unlock" },
  { value: "tip_bait",        label: "Tip bait" },
  { value: "vip_recovery",    label: "VIP recovery" },
  { value: "custom_request",  label: "Custom request" },
  { value: "other",           label: "Other" },
];

type Announcement = {
  id: string;
  body: string;
  pinned: boolean;
  scope: string;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
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

const getActor = (): string | null => {
  const raw = localStorage.getItem("agency_session");
  if (!raw) return null;
  try { return (JSON.parse(raw) as { username?: string })?.username ?? null; }
  catch { return raw; }
};

// ════════════════════════════════════════════════════════════════════════════
// Top-level: 3 sub-tabs for managing staff portal content
// ════════════════════════════════════════════════════════════════════════════

export function StaffPortalAdmin({
  creators, chatters,
}: {
  creators: Creator[];
  chatters: Chatter[];
}) {
  return (
    <Tabs defaultValue="announcements" className="space-y-4">
      <TabsList>
        <TabsTrigger value="announcements" className="flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5" /> Announcements
        </TabsTrigger>
        <TabsTrigger value="training" className="flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5" /> Training
        </TabsTrigger>
        <TabsTrigger value="scripts" className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" /> Scripts
        </TabsTrigger>
      </TabsList>

      <TabsContent value="announcements" className="mt-4">
        <AnnouncementsManager />
      </TabsContent>
      <TabsContent value="training" className="mt-4">
        <TrainingManager creators={creators} />
      </TabsContent>
      <TabsContent value="scripts" className="mt-4">
        <ScriptsManager creators={creators} />
      </TabsContent>
    </Tabs>
  );
}

// ── Announcements ──────────────────────────────────────────────────────────

function AnnouncementsManager() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [body, setBody] = useState("");
  const [scope, setScope] = useState("all");
  const [pinned, setPinned] = useState(false);
  const [expires, setExpires] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("staff_announcements")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Announcement[]);
  };

  useEffect(() => { void load(); }, []);

  const onPost = async () => {
    if (!body.trim()) return toast.error("Type something");
    setSaving(true);
    const { error } = await supabase.from("staff_announcements").insert({
      body: body.trim(),
      scope,
      pinned,
      expires_at: expires ? new Date(expires).toISOString() : null,
      created_by: getActor(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    void logAudit({ action: "announcement_posted", entity_type: "staff_announcement", entity_name: body.slice(0, 60) });
    toast.success("Announcement posted");
    setBody("");
    setPinned(false);
    setExpires("");
    setScope("all");
    void load();
  };

  const onTogglePin = async (a: Announcement) => {
    const { error } = await supabase.from("staff_announcements").update({ pinned: !a.pinned }).eq("id", a.id);
    if (error) return toast.error(error.message);
    void load();
  };

  const onDelete = async (a: Announcement) => {
    if (!confirm("Delete this announcement?")) return;
    const { error } = await supabase.from("staff_announcements").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    void logAudit({ action: "announcement_deleted", entity_type: "staff_announcement", entity_id: a.id });
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">Post a new announcement</div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="What do you want staff to know? Visible on their Today tab."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Audience</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_SCOPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Expires (optional)</Label>
            <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pin to top</Label>
            <div className="flex items-center h-9 gap-2">
              <Switch checked={pinned} onCheckedChange={setPinned} />
              <span className="text-xs text-muted-foreground">{pinned ? "Pinned" : "Not pinned"}</span>
            </div>
          </div>
        </div>
        <div>
          <Button onClick={onPost} disabled={saving}>
            <Plus className="h-4 w-4 mr-1.5" /> {saving ? "Posting…" : "Post announcement"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Recent</div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No announcements yet.
          </div>
        ) : (
          items.map((a) => (
            <div key={a.id} className={`group rounded-xl border p-4 ${a.pinned ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
              <div className="flex items-start gap-3">
                <Megaphone className={`h-4 w-4 shrink-0 mt-0.5 ${a.pinned ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm whitespace-pre-wrap">{a.body}</div>
                  <div className="text-[11px] text-muted-foreground mt-2 space-x-2">
                    <span>Audience: {ROLE_SCOPES.find((s) => s.value === a.scope)?.label ?? a.scope}</span>
                    <span>·</span>
                    <span>{a.created_by ?? "system"}</span>
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                    {a.expires_at && <><span>·</span><span>expires {format(parseISO(a.expires_at), "MMM d")}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onTogglePin(a)}
                    className="text-muted-foreground hover:text-primary transition-colors p-1"
                    aria-label={a.pinned ? "Unpin" : "Pin"}
                  >
                    {a.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => onDelete(a)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Training materials ─────────────────────────────────────────────────────

function TrainingManager({ creators }: { creators: Creator[] }) {
  const [items, setItems] = useState<TrainingMaterial[]>([]);
  const [form, setForm] = useState({ label: "", body: "", video_url: "", category: "onboarding", creator_id: "", scope: "all" });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<TrainingMaterial | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("staff_training_materials")
      .select("*")
      .order("category")
      .order("display_order");
    setItems((data ?? []) as TrainingMaterial[]);
  };

  useEffect(() => { void load(); }, []);

  const reset = () => {
    setForm({ label: "", body: "", video_url: "", category: "onboarding", creator_id: "", scope: "all" });
    setEditing(null);
  };

  const onSave = async () => {
    if (!form.label.trim()) return toast.error("Label is required");
    setSaving(true);
    const payload = {
      label: form.label.trim(),
      body: form.body.trim() || null,
      video_url: form.video_url.trim() || null,
      category: form.category,
      creator_id: form.creator_id || null,
      scope: form.scope,
    };
    if (editing) {
      const { error } = await supabase.from("staff_training_materials").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      void logAudit({ action: "training_updated", entity_type: "staff_training_material", entity_id: editing.id, entity_name: payload.label });
      toast.success("Updated");
    } else {
      const { error } = await supabase.from("staff_training_materials").insert(payload);
      setSaving(false);
      if (error) return toast.error(error.message);
      void logAudit({ action: "training_added", entity_type: "staff_training_material", entity_name: payload.label });
      toast.success("Added");
    }
    reset();
    void load();
  };

  const onEdit = (m: TrainingMaterial) => {
    setEditing(m);
    setForm({
      label: m.label,
      body: m.body ?? "",
      video_url: m.video_url ?? "",
      category: m.category ?? "onboarding",
      creator_id: m.creator_id ?? "",
      scope: m.scope,
    });
  };

  const onDelete = async (m: TrainingMaterial) => {
    if (!confirm(`Delete "${m.label}"?`)) return;
    const { error } = await supabase.from("staff_training_materials").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    void logAudit({ action: "training_deleted", entity_type: "staff_training_material", entity_id: m.id, entity_name: m.label });
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">{editing ? "Edit training material" : "Add training material"}</div>
        <Input
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="Label · e.g. 'Day 1 — agency policies'"
        />
        <Textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          rows={5}
          placeholder="Markdown body (optional). Use this for written content — checklists, dos & don'ts, voice guidelines."
          className="font-mono text-sm"
        />
        <Input
          value={form.video_url}
          onChange={(e) => setForm({ ...form, video_url: e.target.value })}
          placeholder="Video URL (optional) — YouTube, Vimeo, Loom"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRAINING_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Audience</Label>
            <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_SCOPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Creator (for playbooks, optional)</Label>
            <Select value={form.creator_id || "__none"} onValueChange={(v) => setForm({ ...form, creator_id: v === "__none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Agency-wide" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Agency-wide (all creators)</SelectItem>
                {creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving…" : editing ? "Save changes" : "Add"}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={reset}>Cancel</Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Library · {items.length} item{items.length === 1 ? "" : "s"}</div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No materials yet. Add your first one above.
          </div>
        ) : (
          items.map((m) => (
            <div key={m.id} className="group rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{m.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 space-x-2">
                    <span>{TRAINING_CATEGORIES.find((c) => c.value === m.category)?.label ?? "—"}</span>
                    {m.creator_id && (
                      <>
                        <span>·</span>
                        <span>{creators.find((c) => c.id === m.creator_id)?.name ?? "—"}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{ROLE_SCOPES.find((s) => s.value === m.scope)?.label ?? m.scope}</span>
                    {m.video_url && <><span>·</span><span className="text-primary">video attached</span></>}
                  </div>
                  {m.body && <div className="text-xs text-muted-foreground mt-2 line-clamp-2 whitespace-pre-wrap">{m.body}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onEdit(m)} className="text-muted-foreground hover:text-primary p-1"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => onDelete(m)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Scripts ────────────────────────────────────────────────────────────────

function ScriptsManager({ creators }: { creators: Creator[] }) {
  const [items, setItems] = useState<Script[]>([]);
  const [form, setForm] = useState({ label: "", body: "", category: "opener", creator_id: "" });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Script | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("staff_scripts")
      .select("*")
      .order("category")
      .order("display_order");
    setItems((data ?? []) as Script[]);
  };

  useEffect(() => { void load(); }, []);

  const reset = () => {
    setForm({ label: "", body: "", category: "opener", creator_id: "" });
    setEditing(null);
  };

  const onSave = async () => {
    if (!form.label.trim() || !form.body.trim()) return toast.error("Label and body are required");
    setSaving(true);
    const payload = {
      label: form.label.trim(),
      body: form.body.trim(),
      category: form.category,
      creator_id: form.creator_id || null,
    };
    if (editing) {
      const { error } = await supabase.from("staff_scripts").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      void logAudit({ action: "script_updated", entity_type: "staff_script", entity_id: editing.id, entity_name: payload.label });
      toast.success("Updated");
    } else {
      const { error } = await supabase.from("staff_scripts").insert(payload);
      setSaving(false);
      if (error) return toast.error(error.message);
      void logAudit({ action: "script_added", entity_type: "staff_script", entity_name: payload.label });
      toast.success("Added");
    }
    reset();
    void load();
  };

  const onEdit = (s: Script) => {
    setEditing(s);
    setForm({ label: s.label, body: s.body, category: s.category, creator_id: s.creator_id ?? "" });
  };

  const onDelete = async (s: Script) => {
    if (!confirm(`Delete "${s.label}"?`)) return;
    const { error } = await supabase.from("staff_scripts").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    void logAudit({ action: "script_deleted", entity_type: "staff_script", entity_id: s.id, entity_name: s.label });
    void load();
  };

  // group by category
  const grouped = useMemo(() => {
    const out: Record<string, Script[]> = {};
    for (const s of items) {
      if (!out[s.category]) out[s.category] = [];
      out[s.category].push(s);
    }
    return out;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold">{editing ? "Edit script" : "Add script"}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Label · e.g. 'First-DM opener'"
          />
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SCRIPT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          rows={4}
          placeholder="The script — what the chatter copies & pastes (with their tweaks)."
        />
        <Select value={form.creator_id || "__none"} onValueChange={(v) => setForm({ ...form, creator_id: v === "__none" ? "" : v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">All creators</SelectItem>
            {creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving…" : editing ? "Save changes" : "Add"}
          </Button>
          {editing && <Button variant="ghost" onClick={reset}>Cancel</Button>}
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Library · {items.length} script{items.length === 1 ? "" : "s"}
        </div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No scripts yet.
          </div>
        ) : (
          Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                {SCRIPT_CATEGORIES.find((c) => c.value === cat)?.label ?? cat}
              </div>
              {list.map((s) => (
                <div key={s.id} className="group rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold">
                        {s.label}
                        {s.creator_id && <span className="ml-2 text-[10px] font-normal text-muted-foreground">· {creators.find((c) => c.id === s.creator_id)?.name}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{s.body}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => onEdit(s)} className="text-muted-foreground hover:text-primary p-1"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => onDelete(s)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Coaching dialog — per-chatter notes + goals
// ════════════════════════════════════════════════════════════════════════════

type CoachingNote = {
  id: string;
  chatter_id: string;
  body: string;
  visible_to_staff: boolean;
  created_by: string | null;
  created_at: string;
};
type Goal = {
  id: string;
  chatter_id: string;
  label: string;
  metric: string;
  target_amount: number;
  period_start: string;
  period_end: string;
  set_by: string | null;
};

const GOAL_METRICS = [
  { value: "revenue",   label: "Revenue ($)" },
  { value: "hours",     label: "Hours" },
  { value: "shifts",    label: "Shifts" },
  { value: "ppv_count", label: "PPVs sold" },
];

export function CoachingDialog({
  chatter, open, onClose,
}: {
  chatter: { id: string; name: string };
  open: boolean;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState<CoachingNote[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [noteVisible, setNoteVisible] = useState(true);
  const [savingNote, setSavingNote] = useState(false);
  const [goalForm, setGoalForm] = useState(() => ({
    label: "",
    metric: "revenue",
    target_amount: "",
    period_start: format(new Date(), "yyyy-MM-dd"),
    period_end: format(addMonths(new Date(), 1), "yyyy-MM-dd"),
  }));
  const [savingGoal, setSavingGoal] = useState(false);

  const load = async () => {
    const [{ data: n }, { data: g }] = await Promise.all([
      supabase.from("staff_coaching_notes").select("*").eq("chatter_id", chatter.id).order("created_at", { ascending: false }),
      supabase.from("staff_goals").select("*").eq("chatter_id", chatter.id).order("period_end", { ascending: false }),
    ]);
    setNotes((n ?? []) as CoachingNote[]);
    setGoals((g ?? []) as Goal[]);
  };

  useEffect(() => { if (open) void load(); }, [open, chatter.id]);

  const onAddNote = async () => {
    if (!noteBody.trim()) return toast.error("Type a note");
    setSavingNote(true);
    const { error } = await supabase.from("staff_coaching_notes").insert({
      chatter_id: chatter.id,
      body: noteBody.trim(),
      visible_to_staff: noteVisible,
      created_by: getActor(),
    });
    setSavingNote(false);
    if (error) return toast.error(error.message);
    void logAudit({ action: "coaching_note_added", entity_type: "staff_coaching_note", entity_name: chatter.name });
    setNoteBody("");
    void load();
  };

  const onDeleteNote = async (n: CoachingNote) => {
    if (!confirm("Delete this note?")) return;
    const { error } = await supabase.from("staff_coaching_notes").delete().eq("id", n.id);
    if (error) return toast.error(error.message);
    void load();
  };

  const onToggleVisibility = async (n: CoachingNote) => {
    const { error } = await supabase.from("staff_coaching_notes").update({ visible_to_staff: !n.visible_to_staff }).eq("id", n.id);
    if (error) return toast.error(error.message);
    void load();
  };

  const onAddGoal = async () => {
    if (!goalForm.label.trim()) return toast.error("Label required");
    const target = Number(goalForm.target_amount);
    if (!target || target <= 0) return toast.error("Target must be > 0");
    setSavingGoal(true);
    const { error } = await supabase.from("staff_goals").insert({
      chatter_id: chatter.id,
      label: goalForm.label.trim(),
      metric: goalForm.metric,
      target_amount: target,
      period_start: goalForm.period_start,
      period_end: goalForm.period_end,
      set_by: getActor() ?? "manager",
    });
    setSavingGoal(false);
    if (error) return toast.error(error.message);
    void logAudit({ action: "goal_set", entity_type: "staff_goal", entity_name: `${chatter.name} · ${goalForm.label}` });
    setGoalForm({
      label: "",
      metric: "revenue",
      target_amount: "",
      period_start: format(new Date(), "yyyy-MM-dd"),
      period_end: format(addMonths(new Date(), 1), "yyyy-MM-dd"),
    });
    void load();
  };

  const onDeleteGoal = async (g: Goal) => {
    if (!confirm("Delete this goal?")) return;
    const { error } = await supabase.from("staff_goals").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    void load();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Coach {chatter.name}
          </DialogTitle>
        </DialogHeader>

        {/* Goals */}
        <section className="space-y-3 py-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Goals
          </h3>
          <div className="rounded-xl border border-border bg-card p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                value={goalForm.label}
                onChange={(e) => setGoalForm({ ...goalForm, label: e.target.value })}
                placeholder="Goal label · e.g. 'Hit $8k this month'"
              />
              <Select value={goalForm.metric} onValueChange={(v) => setGoalForm({ ...goalForm, metric: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                value={goalForm.target_amount}
                onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })}
                placeholder="Target"
              />
              <Input
                type="date"
                value={goalForm.period_start}
                onChange={(e) => setGoalForm({ ...goalForm, period_start: e.target.value })}
              />
              <Input
                type="date"
                value={goalForm.period_end}
                onChange={(e) => setGoalForm({ ...goalForm, period_end: e.target.value })}
              />
            </div>
            <Button size="sm" onClick={onAddGoal} disabled={savingGoal}>
              <Plus className="h-3.5 w-3.5 mr-1" /> {savingGoal ? "Adding…" : "Add goal"}
            </Button>
          </div>
          {goals.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No goals yet.</div>
          ) : (
            <div className="space-y-1.5">
              {goals.map((g) => (
                <div key={g.id} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">{g.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Target: {g.metric === "revenue" ? `$${g.target_amount}` : `${g.target_amount} ${g.metric}`} · {format(parseISO(g.period_start), "MMM d")} – {format(parseISO(g.period_end), "MMM d, yyyy")}
                    </div>
                  </div>
                  <button onClick={() => onDeleteGoal(g)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Coaching notes */}
        <section className="space-y-3 py-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" /> Coaching notes
          </h3>
          <div className="rounded-xl border border-border bg-card p-3 space-y-2">
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={3}
              placeholder="Strengths, improvement areas, 1:1 takeaways, etc."
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={noteVisible} onCheckedChange={setNoteVisible} id="visible" />
                <Label htmlFor="visible" className="text-xs cursor-pointer">
                  Visible to {chatter.name} on their Coaching tab
                </Label>
              </div>
              <Button size="sm" onClick={onAddNote} disabled={savingNote}>
                <Plus className="h-3.5 w-3.5 mr-1" /> {savingNote ? "Saving…" : "Add note"}
              </Button>
            </div>
          </div>
          {notes.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No notes yet.</div>
          ) : (
            <div className="space-y-1.5">
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs whitespace-pre-wrap">{n.body}</div>
                      <div className="text-[10px] text-muted-foreground mt-1.5">
                        {n.created_by ?? "system"} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        {!n.visible_to_staff && <span className="ml-2 text-warning">· private</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => onToggleVisibility(n)} className="text-muted-foreground hover:text-primary p-1" title={n.visible_to_staff ? "Hide from staff" : "Show to staff"}>
                        {n.visible_to_staff ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                      </button>
                      <button onClick={() => onDeleteNote(n)} className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
