import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CheckCircle2, Plus, Trash2, ListChecks } from "lucide-react";
import { format } from "date-fns";
import { logAudit } from "@/lib/audit";

type Task = {
  id: string;
  creator_id: string;
  task_key: string;
  label: string;
  description: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  display_order: number;
  created_at: string;
};

const DEFAULTS: Array<{ task_key: string; label: string; description: string }> = [
  { task_key: "contract_signed", label: "Contract signed", description: "Management agreement signed by creator." },
  { task_key: "of_account_access", label: "OnlyFans account access shared", description: "Creator has shared 2FA or login credentials." },
  { task_key: "id_verified", label: "Government ID on file", description: "ID and DMCA verification on file." },
  { task_key: "branding_kit", label: "Branding kit collected", description: "Profile photos, banners, bio, niche, voice notes." },
  { task_key: "content_library", label: "Content library uploaded", description: "Initial pack of photos/videos provided for chatters & posts." },
  { task_key: "infloww_setup", label: "Infloww chatter setup", description: "Chat tool configured, AI replies trained on tone." },
  { task_key: "tracking_links", label: "Tracking links created", description: "OnlyFinder + Reddit + Meta campaign codes set up." },
  { task_key: "ad_creative_pack", label: "Ad creative pack ready", description: "Hooks, scripts, and approved assets uploaded for paid ads." },
  { task_key: "first_post_published", label: "First social post published", description: "First Reddit / IG / TikTok / X post live." },
  { task_key: "kickoff_call_done", label: "Kickoff call completed", description: "Goals, posting cadence, and growth plan agreed." },
];

const getActor = (): string | null => {
  const raw = localStorage.getItem("agency_session");
  if (!raw) return null;
  try { return (JSON.parse(raw) as { username?: string })?.username ?? null; }
  catch { return raw; }
};

type Props = {
  creatorId: string;
  creatorName?: string;
  /** Compact mode: no header, fewer paddings — suitable for sidebars / cards */
  compact?: boolean;
};

export function OnboardingChecklist({ creatorId, creatorName, compact = false }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("onboarding_tasks")
      .select("*")
      .eq("creator_id", creatorId)
      .order("display_order")
      .order("created_at");
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data || data.length === 0) {
      // Seed defaults the first time this creator's checklist is opened
      const rows = DEFAULTS.map((d, i) => ({
        creator_id: creatorId,
        task_key: d.task_key,
        label: d.label,
        description: d.description,
        display_order: i,
      }));
      const { error: insertError } = await supabase.from("onboarding_tasks").insert(rows);
      if (insertError) {
        toast.error(insertError.message);
        return;
      }
      const { data: seeded } = await supabase
        .from("onboarding_tasks")
        .select("*")
        .eq("creator_id", creatorId)
        .order("display_order")
        .order("created_at");
      setTasks((seeded ?? []) as Task[]);
    } else {
      setTasks(data as Task[]);
    }
  };

  useEffect(() => { load(); }, [creatorId]);

  const stats = useMemo(() => {
    const done = tasks.filter((t) => t.completed_at).length;
    return {
      done,
      total: tasks.length,
      pct: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
    };
  }, [tasks]);

  const onToggle = async (task: Task, checked: boolean) => {
    const actor = getActor();
    const now = checked ? new Date().toISOString() : null;
    const completedBy = checked ? actor : null;

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed_at: now, completed_by: completedBy } : t))
    );

    const { error } = await supabase
      .from("onboarding_tasks")
      .update({ completed_at: now, completed_by: completedBy })
      .eq("id", task.id);
    if (error) {
      toast.error(error.message);
      load();
      return;
    }
    void logAudit({
      action: checked ? "onboarding_completed" : "onboarding_uncompleted",
      entity_type: "onboarding_task",
      entity_id: task.id,
      entity_name: `${creatorName ?? "Creator"} · ${task.label}`,
      details: checked ? "Marked complete" : "Marked incomplete",
    });
  };

  const onAdd = async () => {
    const label = newLabel.trim();
    if (!label) return toast.error("Label required");
    const task_key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60) + "_" + Date.now().toString(36);
    const { error } = await supabase.from("onboarding_tasks").insert({
      creator_id: creatorId,
      task_key,
      label,
      description: newDesc.trim() || null,
      display_order: tasks.length,
    });
    if (error) return toast.error(error.message);
    setNewLabel("");
    setNewDesc("");
    setAdding(false);
    void logAudit({
      action: "onboarding_task_added",
      entity_type: "onboarding_task",
      entity_name: `${creatorName ?? "Creator"} · ${label}`,
    });
    load();
  };

  const onDelete = async (task: Task) => {
    if (!confirm(`Delete "${task.label}"?`)) return;
    const { error } = await supabase.from("onboarding_tasks").delete().eq("id", task.id);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "onboarding_task_deleted",
      entity_type: "onboarding_task",
      entity_id: task.id,
      entity_name: `${creatorName ?? "Creator"} · ${task.label}`,
    });
    load();
  };

  const startEditNotes = (task: Task) => {
    setEditingNotesId(task.id);
    setNotesDraft(task.notes ?? "");
  };

  const saveNotes = async (task: Task) => {
    const { error } = await supabase
      .from("onboarding_tasks")
      .update({ notes: notesDraft.trim() || null })
      .eq("id", task.id);
    if (error) return toast.error(error.message);
    setEditingNotesId(null);
    load();
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">Onboarding</h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> Add task
          </Button>
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {stats.done} of {stats.total} complete
          </span>
          <span className="font-medium tabular-nums">{stats.pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-500"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <Input
            placeholder="Task label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            autoFocus
          />
          <Input
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={onAdd}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="text-sm text-muted-foreground">No tasks yet.</div>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((t) => {
            const done = !!t.completed_at;
            return (
              <li
                key={t.id}
                className={`group rounded-lg border border-border ${
                  done ? "bg-success/5 border-success/20" : "bg-card hover:bg-secondary/30"
                } transition-colors`}
              >
                <div className="flex items-start gap-3 p-3">
                  <Checkbox
                    checked={done}
                    onCheckedChange={(v) => onToggle(t, !!v)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium leading-tight ${done ? "line-through text-muted-foreground" : ""}`}>
                      {t.label}
                    </div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                    )}
                    {done && t.completed_at && (
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        {format(new Date(t.completed_at), "MMM d")}
                        {t.completed_by ? ` by ${t.completed_by}` : ""}
                      </div>
                    )}

                    {/* Notes */}
                    {editingNotesId === t.id ? (
                      <div className="mt-2 space-y-1.5">
                        <Textarea
                          value={notesDraft}
                          onChange={(e) => setNotesDraft(e.target.value)}
                          rows={2}
                          placeholder="Notes…"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveNotes(t)}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingNotesId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : t.notes ? (
                      <button
                        onClick={() => startEditNotes(t)}
                        className="mt-1.5 text-[11px] text-muted-foreground italic hover:text-foreground text-left"
                      >
                        {t.notes}
                      </button>
                    ) : (
                      !compact && (
                        <button
                          onClick={() => startEditNotes(t)}
                          className="mt-1 text-[11px] text-muted-foreground/70 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          + add note
                        </button>
                      )
                    )}
                  </div>
                  {!compact && (
                    <button
                      onClick={() => onDelete(t)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      aria-label="Delete task"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
