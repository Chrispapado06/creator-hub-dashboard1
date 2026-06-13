import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format, formatDistanceToNowStrict, parseISO, addDays, startOfDay, isSameDay, differenceInCalendarDays } from "date-fns";
import { ListChecks, Plus, Trash2, Check, X, ArrowRight, GripVertical, Workflow as WorkflowIcon, CircleDot, User, CalendarDays } from "lucide-react";
import {
  completeActiveStep, skipStep, startPipeline, reassignStep, cancelPipeline,
  addStandaloneTask, completeStandaloneTask, currentUsername,
  generateDueRecurringTasks, listRecurringTasks, createRecurringTask, deleteRecurringTask,
  type TeamMember, type Template, type TemplateStep, type Pipeline, type PipelineStep, type StandaloneTask, type NewStep, type RecurringTask,
} from "@/lib/tasks";

export const Route = createFileRoute("/tasks")({ component: TasksPage });

const sb = supabase as unknown as { from: (t: string) => any };

type Session = { username: string | null; isAdmin: boolean; chatterId: string | null };
function readSession(): Session {
  try {
    const raw = localStorage.getItem("agency_session");
    if (!raw) return { username: null, isAdmin: false, chatterId: null };
    const o = JSON.parse(raw);
    return { username: o?.username ?? null, isAdmin: o?.type === "admin", chatterId: o?.chatter_id ?? null };
  } catch {
    return { username: null, isAdmin: false, chatterId: null };
  }
}

const stepStatusStyles: Record<string, string> = {
  waiting: "bg-muted text-muted-foreground border-border",
  active: "bg-primary/15 text-primary border-primary/30",
  done: "bg-success/15 text-success border-success/30",
  skipped: "bg-muted text-muted-foreground/60 border-border",
};

// ── Page ─────────────────────────────────────────────────────────────────────
function TasksPage() {
  const session = useMemo(readSession, []);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [standalone, setStandalone] = useState<StandaloneTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const [{ data: m }, { data: p }, { data: s }, { data: st }] = await Promise.all([
      sb.from("chatters").select("id, name, status, discord_user_id").order("name"),
      sb.from("task_pipelines").select("*").eq("status", "active").order("created_at", { ascending: false }),
      sb.from("task_pipeline_steps").select("*").order("step_order"),
      sb.from("standalone_tasks").select("*").eq("status", "open").order("created_at", { ascending: false }),
    ]);
    setMembers((m ?? []) as TeamMember[]);
    setPipelines((p ?? []) as Pipeline[]);
    setSteps((s ?? []) as PipelineStep[]);
    setStandalone((st ?? []) as StandaloneTask[]);
    if (!silent) setLoading(false);
  };
  // On open: materialise any recurring tasks due today (idempotent), then load.
  useEffect(() => { (async () => { await generateDueRecurringTasks(); load(); })(); }, []);
  const refresh = () => load(true);

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? "—";

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Toaster />
      <div className="mb-6 flex items-center gap-3">
        <ListChecks className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">Handoff pipelines and one-off tasks. If it's not on their list, it's done.</p>
        </div>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card/60" />
      ) : (
        <Tabs defaultValue="my">
          <TabsList>
            <TabsTrigger value="my">My tasks</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="member">By member</TabsTrigger>
            <TabsTrigger value="start">Start pipeline</TabsTrigger>
            {session.isAdmin && <TabsTrigger value="templates">Templates</TabsTrigger>}
          </TabsList>

          <TabsContent value="my">
            <MyTasksTab session={session} pipelines={pipelines} steps={steps} standalone={standalone} memberName={memberName} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="board">
            <BoardTab session={session} pipelines={pipelines} steps={steps} members={members} memberName={memberName} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="member">
            <MemberTab session={session} members={members} pipelines={pipelines} steps={steps} standalone={standalone} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="start">
            <StartTab members={members} onCreated={refresh} />
          </TabsContent>
          {session.isAdmin && (
            <TabsContent value="templates">
              <TemplatesTab members={members} onRefresh={refresh} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

// When did the current active step begin = latest completed_at among the
// pipeline's done/skipped steps, else the pipeline's created_at.
function activeSince(pipelineId: string, steps: PipelineStep[], pipelines: Pipeline[]): Date | null {
  const ps = steps.filter((s) => s.pipeline_id === pipelineId);
  const times = ps.filter((s) => s.completed_at).map((s) => new Date(s.completed_at!).getTime());
  if (times.length) return new Date(Math.max(...times));
  const p = pipelines.find((x) => x.id === pipelineId);
  return p ? new Date(p.created_at) : null;
}

// ── Mini calendar (front of My tasks) ────────────────────────────────────────
// 14-day strip + agenda of what's due soon. Pipeline steps don't carry due
// dates (by design), so this tracks standalone-task due dates.
const CAL_WEEK = ["S", "M", "T", "W", "T", "F", "S"];
function MiniCalendar({ tasks }: { tasks: StandaloneTask[] }) {
  const today = startOfDay(new Date());
  const dated = tasks.filter((t) => t.due_date);
  const byDay = new Map<string, number>();
  for (const t of dated) byDay.set(t.due_date!, (byDay.get(t.due_date!) ?? 0) + 1);

  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const agenda = dated
    .map((t) => ({ t, due: parseISO(t.due_date!) }))
    .filter(({ due }) => differenceInCalendarDays(due, today) <= 13)
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, 6);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" /> Coming up</div>
        <span className="text-[11px] text-muted-foreground">{format(today, "MMMM yyyy")}</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const count = byDay.get(format(d, "yyyy-MM-dd")) ?? 0;
          const isToday = isSameDay(d, today);
          return (
            <div key={format(d, "yyyy-MM-dd")} className={`rounded-lg border p-1.5 text-center ${isToday ? "border-primary bg-primary/10" : "border-border"}`}>
              <div className="text-[9px] uppercase text-muted-foreground/70">{CAL_WEEK[d.getDay()]}</div>
              <div className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>{format(d, "d")}</div>
              {count > 0 ? (
                <div className="mx-auto mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">{count}</div>
              ) : (
                <div className="mt-0.5 h-4" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 space-y-1">
        {agenda.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">Nothing due in the next two weeks.</p>
        ) : agenda.map(({ t, due }) => {
          const delta = differenceInCalendarDays(due, today);
          const overdue = delta < 0;
          const label = overdue ? `${Math.abs(delta)}d overdue` : delta === 0 ? "today" : delta === 1 ? "tomorrow" : `in ${delta}d`;
          return (
            <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{t.title}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 ${overdue ? "bg-destructive/15 text-destructive" : delta <= 1 ? "bg-amber-500/15 text-amber-600" : "bg-secondary text-muted-foreground"}`}>
                {format(due, "MMM d")} · {label}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── My tasks ─────────────────────────────────────────────────────────────────
function MyTasksTab({
  session, pipelines, steps, standalone, memberName, onRefresh,
}: {
  session: Session;
  pipelines: Pipeline[];
  steps: PipelineStep[];
  standalone: StandaloneTask[];
  memberName: (id: string | null) => string;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const myActiveSteps = useMemo(
    () => steps
      .filter((s) => s.status === "active" && s.assignee_id === session.chatterId)
      .map((s) => ({ step: s, pipeline: pipelines.find((p) => p.id === s.pipeline_id) }))
      .filter((x) => x.pipeline)
      .sort((a, b) => new Date(a.pipeline!.created_at).getTime() - new Date(b.pipeline!.created_at).getTime()),
    [steps, pipelines, session.chatterId],
  );
  const myTasks = useMemo(
    () => standalone
      .filter((t) => t.assignee_id === session.chatterId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [standalone, session.chatterId],
  );

  const onDone = async (pipelineId: string, title: string) => {
    setBusy(pipelineId);
    const { error, completed } = await completeActiveStep(pipelineId, title);
    setBusy(null);
    if (error) { toast.error(error); return; }
    toast.success(completed ? `${title} complete 🎉` : "Done — handed off to the next person");
    onRefresh();
  };
  const onTaskDone = async (id: string, title: string) => {
    setBusy(id);
    const { error } = await completeStandaloneTask(id);
    setBusy(null);
    if (error) { toast.error(error); return; }
    toast.success(`${title} done`);
    onRefresh();
  };

  if (!session.chatterId) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        You're signed in as an admin account that isn't linked to a team member, so you have no personal task list. Use the <strong>Board</strong> or <strong>By member</strong> tabs.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      <MiniCalendar tasks={myTasks} />

      <section>
        <h2 className="mb-2 text-sm font-semibold">Pipeline steps waiting on you ({myActiveSteps.length})</h2>
        {myActiveSteps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">Nothing handed to you right now.</div>
        ) : (
          <div className="space-y-2">
            {myActiveSteps.map(({ step, pipeline }) => (
              <Card key={step.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-medium">{pipeline!.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Step {step.step_order}: <span className="text-foreground">{step.step_name}</span>
                    {step.description ? ` — ${step.description}` : ""}
                  </div>
                </div>
                <Button size="sm" disabled={busy === pipeline!.id} onClick={() => onDone(pipeline!.id, pipeline!.title)}>
                  <Check className="mr-1 h-4 w-4" />{busy === pipeline!.id ? "…" : "Done"}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Your one-off tasks ({myTasks.length})</h2>
        {myTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">No open tasks.</div>
        ) : (
          <div className="space-y-2">
            {myTasks.map((t) => (
              <Card key={t.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-medium">{t.title}</div>
                  {(t.description || t.due_date) && (
                    <div className="text-xs text-muted-foreground">
                      {t.description}{t.description && t.due_date ? " · " : ""}{t.due_date ? `due ${format(new Date(t.due_date), "MMM d")}` : ""}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => onTaskDone(t.id, t.title)}>
                  <Check className="mr-1 h-4 w-4" />{busy === t.id ? "…" : "Done"}
                </Button>
              </Card>
            ))}
          </div>
        )}
        <div className="mt-3"><AddTaskDialog members={[]} defaultAssigneeId={session.chatterId} onAdded={onRefresh} selfLabel="Add a task for yourself" /></div>
      </section>
    </div>
  );
}

// ── Board ────────────────────────────────────────────────────────────────────
function BoardTab({
  session, pipelines, steps, members, memberName, onRefresh,
}: {
  session: Session;
  pipelines: Pipeline[];
  steps: PipelineStep[];
  members: TeamMember[];
  memberName: (id: string | null) => string;
  onRefresh: () => void;
}) {
  const onCancel = async (id: string) => {
    const { error } = await cancelPipeline(id);
    if (error) { toast.error(error); return; }
    toast.success("Pipeline cancelled");
    onRefresh();
  };

  if (pipelines.length === 0) {
    return <div className="mt-4 rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">No active pipelines. Start one on the <strong>Start pipeline</strong> tab.</div>;
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {pipelines.map((p) => {
        const ps = steps.filter((s) => s.pipeline_id === p.id).sort((a, b) => a.step_order - b.step_order);
        const active = ps.find((s) => s.status === "active");
        const since = activeSince(p.id, steps, pipelines);
        const doneCount = ps.filter((s) => s.status === "done").length;
        return (
          <Card key={p.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-semibold"><WorkflowIcon className="h-4 w-4 text-primary shrink-0" /><span className="truncate">{p.title}</span></div>
                <div className="text-[11px] text-muted-foreground">{doneCount}/{ps.length} done</div>
              </div>
              {(session.isAdmin || p.created_by === session.username) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild><button className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Cancel "{p.title}"?</AlertDialogTitle><AlertDialogDescription>Marks the pipeline cancelled and skips remaining steps.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction onClick={() => onCancel(p.id)}>Cancel pipeline</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            {/* Step rail */}
            <div className="space-y-1">
              {ps.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <CircleDot className={`h-3 w-3 shrink-0 ${s.status === "active" ? "text-primary" : s.status === "done" ? "text-success" : "text-muted-foreground/40"}`} />
                  <span className={`truncate ${s.status === "active" ? "font-semibold" : s.status === "done" ? "text-muted-foreground line-through" : "text-muted-foreground"}`}>{s.step_name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{memberName(s.assignee_id)}</span>
                </div>
              ))}
            </div>

            {active && (
              <div className="mt-auto rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs">
                <div className="flex items-center gap-1.5"><User className="h-3 w-3" /><span className="font-medium">{memberName(active.assignee_id)}</span><span className="text-muted-foreground">· {active.step_name}</span></div>
                {since && <div className="mt-0.5 text-[10px] text-muted-foreground">in this step {formatDistanceToNowStrict(since)}</div>}
                {session.isAdmin && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <ReassignControl stepId={active.id} members={members} currentId={active.assignee_id} pipelineTitle={p.title} onDone={onRefresh} />
                    <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={async () => { const { error } = await skipStep(p.id, p.title); if (error) toast.error(error); else { toast.success("Step skipped"); onRefresh(); } }}>skip</button>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function ReassignControl({ stepId, members, currentId, pipelineTitle, onDone }: { stepId: string; members: TeamMember[]; currentId: string; pipelineTitle: string; onDone: () => void }) {
  return (
    <Select value={currentId} onValueChange={async (v) => { if (v === currentId) return; const { error } = await reassignStep(stepId, v, pipelineTitle); if (error) toast.error(error); else { toast.success("Reassigned"); onDone(); } }}>
      <SelectTrigger className="h-6 w-[130px] text-[10px]"><SelectValue /></SelectTrigger>
      <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
    </Select>
  );
}

// ── By member ────────────────────────────────────────────────────────────────
function MemberTab({ session, members, pipelines, steps, standalone, onRefresh }: { session: Session; members: TeamMember[]; pipelines: Pipeline[]; steps: PipelineStep[]; standalone: StandaloneTask[]; onRefresh: () => void }) {
  const [memberId, setMemberId] = useState<string>("");
  const activeSteps = steps.filter((s) => s.status === "active" && s.assignee_id === memberId);
  const tasks = standalone.filter((t) => t.assignee_id === memberId);
  const total = activeSteps.length + tasks.length;
  const memberName = members.find((m) => m.id === memberId)?.name ?? "";

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="max-w-xs flex-1">
          <Label className="text-xs">Team member</Label>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger><SelectValue placeholder="Pick a member" /></SelectTrigger>
            <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}{m.discord_user_id ? "" : " (no Discord)"}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {/* Admins can hand this person a task right here. */}
        {memberId && session.isAdmin && (
          <AddTaskDialog members={members} defaultAssigneeId={memberId} onAdded={onRefresh} selfLabel={`Assign task to ${memberName.split(" ")[0]}`} />
        )}
      </div>

      {memberId && (
        total === 0 ? (
          <div className="rounded-xl border border-dashed border-success/30 bg-success/5 p-8 text-center text-sm">
            <div className="font-medium text-success">Nothing on their list.</div>
            <div className="text-muted-foreground">If it's not here, it's done.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {activeSteps.map((s) => {
              const p = pipelines.find((x) => x.id === s.pipeline_id);
              return (
                <Card key={s.id} className="flex items-center justify-between gap-3 p-3">
                  <div><div className="text-sm font-medium">{p?.title}</div><div className="text-xs text-muted-foreground">Step {s.step_order}: {s.step_name}</div></div>
                  <Badge className="border bg-primary/15 text-primary border-primary/30 text-[10px]">pipeline</Badge>
                </Card>
              );
            })}
            {tasks.map((t) => (
              <Card key={t.id} className="flex items-center justify-between gap-3 p-3">
                <div><div className="text-sm font-medium">{t.title}</div>{t.due_date && <div className="text-xs text-muted-foreground">due {format(new Date(t.due_date), "MMM d")}</div>}</div>
                <Badge variant="secondary" className="text-[10px]">task</Badge>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── Start pipeline ───────────────────────────────────────────────────────────
function StartTab({ members, onCreated }: { members: TeamMember[]; onCreated: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplSteps, setTplSteps] = useState<TemplateStep[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<NewStep[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sb.from("task_templates").select("*").eq("active", true).order("name").then(({ data }: any) => setTemplates((data ?? []) as Template[]));
    sb.from("task_template_steps").select("*").order("step_order").then(({ data }: any) => setTplSteps((data ?? []) as TemplateStep[]));
  }, []);

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t && !title) setTitle(t.name);
    const steps = tplSteps.filter((s) => s.template_id === id).sort((a, b) => a.step_order - b.step_order);
    setRows(steps.map((s) => ({ step_name: s.step_name, description: s.description, assignee_id: s.default_assignee_id ?? "" })));
  };

  const setRow = (i: number, patch: Partial<NewStep>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => setRows((r) => [...r, { step_name: "", assignee_id: "" }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const create = async () => {
    if (rows.some((r) => !r.step_name.trim())) { toast.error("Every step needs a name"); return; }
    setSaving(true);
    const { error } = await startPipeline(templateId || null, title, rows.map((r) => ({ ...r, step_name: r.step_name.trim() })));
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Pipeline started — first owner pinged");
    setTemplateId(""); setTitle(""); setRows([]);
    onCreated();
  };

  return (
    <div className="mt-4 max-w-2xl space-y-4">
      <Card className="space-y-4 p-5">
        <div className="grid gap-1.5">
          <Label>Template</Label>
          <Select value={templateId} onValueChange={pickTemplate}>
            <SelectTrigger><SelectValue placeholder="Pick a template (or build ad-hoc below)" /></SelectTrigger>
            <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Maria — June promo script" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between"><Label>Steps (in order)</Label><Button size="sm" variant="outline" onClick={addRow}><Plus className="mr-1 h-3.5 w-3.5" />Add step</Button></div>
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">Pick a template to prefill steps, or add steps manually.</p>
          ) : rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{i + 1}</span>
              <Input className="flex-1" value={row.step_name} onChange={(e) => setRow(i, { step_name: e.target.value })} placeholder="Step name" />
              <Select value={row.assignee_id} onValueChange={(v) => setRow(i, { assignee_id: v })}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Owner" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
              <button className="text-muted-foreground hover:text-destructive" onClick={() => removeRow(i)}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        <Button className="w-full" onClick={create} disabled={saving || rows.length === 0 || !title.trim()}>
          {saving ? "Starting…" : "Start pipeline"}<ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 text-sm font-semibold">Quick one-off task</h3>
        <p className="mb-3 text-xs text-muted-foreground">Not a pipeline — a single task for one person.</p>
        <AddTaskDialog members={members} onAdded={onCreated} />
      </Card>

      <RecurringManager members={members} onChanged={onCreated} />
    </div>
  );
}

// ── Repeating tasks ──────────────────────────────────────────────────────────
const RECUR_PRESETS = [
  { label: "Daily", d: 1 },
  { label: "Weekly", d: 7 },
  { label: "Every 2 weeks", d: 14 },
  { label: "Monthly", d: 30 },
];
const cadenceLabel = (d: number) =>
  d === 1 ? "every day" : d === 7 ? "every week" : d === 14 ? "every 2 weeks" : d === 30 ? "monthly" : `every ${d} days`;

function RecurringManager({ members, onChanged }: { members: TeamMember[]; onChanged: () => void }) {
  const emptyR = { title: "", assignee_id: "", interval_days: 7, start_date: format(new Date(), "yyyy-MM-dd") };
  const [rules, setRules] = useState<RecurringTask[]>([]);
  const [f, setF] = useState(emptyR);
  const [saving, setSaving] = useState(false);

  const load = async () => setRules(await listRecurringTasks());
  useEffect(() => { load(); }, []);

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "—";

  const create = async () => {
    setSaving(true);
    const { error } = await createRecurringTask(f);
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Repeating task created");
    setF(emptyR);
    load();
    onChanged();
  };
  const remove = async (id: string) => {
    const { error } = await deleteRecurringTask(id);
    if (error) toast.error(error); else { toast.success("Stopped repeating"); load(); }
  };

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-sm font-semibold">Repeating tasks</h3>
      <p className="mb-3 text-xs text-muted-foreground">Auto-creates a task on a schedule. New occurrences appear (and ping the assignee) whenever someone opens Tasks on/after the due day.</p>
      <div className="space-y-3">
        <div className="grid gap-1.5">
          <Label>Task</Label>
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Post weekly recap" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Assignee</Label>
            <Select value={f.assignee_id} onValueChange={(v) => setF({ ...f, assignee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Pick a member" /></SelectTrigger>
              <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Starts</Label>
            <Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Repeat</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {RECUR_PRESETS.map((p) => (
              <button
                key={p.d}
                type="button"
                onClick={() => setF({ ...f, interval_days: p.d })}
                className={`rounded-full border px-2.5 py-1 text-xs transition-all ${f.interval_days === p.d ? "border-primary/40 bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {p.label}
              </button>
            ))}
            <span className="ml-1 text-xs text-muted-foreground">or every</span>
            <Input type="number" min={1} value={f.interval_days} onChange={(e) => setF({ ...f, interval_days: Number(e.target.value) })} className="h-8 w-16" />
            <span className="text-xs text-muted-foreground">days</span>
          </div>
        </div>
        <Button className="w-full" onClick={create} disabled={saving || !f.title.trim() || !f.assignee_id}>
          {saving ? "Saving…" : "Create repeating task"}
        </Button>
      </div>

      {rules.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Active repeats</div>
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded border border-border px-2.5 py-1.5 text-xs">
              <div className="min-w-0 truncate">
                <span className="font-medium">{r.title}</span>
                <span className="text-muted-foreground"> · {cadenceLabel(r.interval_days)} · {memberName(r.assignee_id)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-muted-foreground">next {format(parseISO(r.next_run), "MMM d")}</span>
                <button onClick={() => remove(r.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AddTaskDialog({ members, defaultAssigneeId, onAdded, selfLabel }: { members: TeamMember[]; defaultAssigneeId?: string; onAdded: () => void; selfLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", assignee_id: defaultAssigneeId ?? "", due_date: "", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setF({ title: "", assignee_id: defaultAssigneeId ?? "", due_date: "", description: "" }); }, [open, defaultAssigneeId]);

  const save = async () => {
    setSaving(true);
    const { error } = await addStandaloneTask({ title: f.title, assignee_id: f.assignee_id, due_date: f.due_date || null, description: f.description || null });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("Task added");
    setOpen(false);
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant={selfLabel ? "outline" : "default"}><Plus className="mr-1 h-4 w-4" />{selfLabel ?? "Add task"}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5"><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          {!defaultAssigneeId && (
            <div className="grid gap-1.5"><Label>Assignee</Label>
              <Select value={f.assignee_id} onValueChange={(v) => setF({ ...f, assignee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pick a member" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Due date</Label><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></div>
          </div>
          <div className="grid gap-1.5"><Label>Notes</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add task"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Templates admin ──────────────────────────────────────────────────────────
function TemplatesTab({ members, onRefresh }: { members: TeamMember[]; onRefresh: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplSteps, setTplSteps] = useState<TemplateStep[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [{ data: t }, { data: s }] = await Promise.all([
      sb.from("task_templates").select("*").order("name"),
      sb.from("task_template_steps").select("*").order("step_order"),
    ]);
    setTemplates((t ?? []) as Template[]);
    setTplSteps((s ?? []) as TemplateStep[]);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    const { error } = await sb.from("task_templates").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Template deleted"); load(); }
  };

  return (
    <div className="mt-4 space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Templates</h2>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />New template</Button>
        </div>
        <div className="space-y-2">
          {templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">No templates yet.</div>
          ) : templates.map((t) => {
            const steps = tplSteps.filter((s) => s.template_id === t.id).sort((a, b) => a.step_order - b.step_order);
            return (
              <Card key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{t.name}</div>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {steps.map((s, i) => (
                        <span key={s.id} className="flex items-center gap-1">
                          {i > 0 && <ArrowRight className="h-3 w-3" />}
                          <span>{s.step_name}{s.default_assignee_id ? ` (${members.find((m) => m.id === s.default_assignee_id)?.name ?? "?"})` : ""}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>Edit</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="sm" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete "{t.name}"?</AlertDialogTitle><AlertDialogDescription>Running pipelines keep their steps; only the template is removed.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(t.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Team Discord IDs</h2>
        <p className="mb-3 text-xs text-muted-foreground">A member only gets pinged on handoff if their Discord user ID is set here. (Discord → Settings → Advanced → Developer Mode → right-click the user → Copy ID.)</p>
        <DiscordIdsEditor members={members} onSaved={onRefresh} />
      </section>

      <TemplateDialog open={open} onOpenChange={setOpen} editing={editing} members={members} steps={tplSteps} onSaved={() => { setOpen(false); load(); }} />
    </div>
  );
}

function DiscordIdsEditor({ members, onSaved }: { members: TeamMember[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => { setDraft(Object.fromEntries(members.map((m) => [m.id, m.discord_user_id ?? ""]))); }, [members]);

  const save = async (id: string) => {
    const val = (draft[id] ?? "").trim();
    const { error } = await sb.from("chatters").update({ discord_user_id: val || null }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Saved"); onSaved(); }
  };

  return (
    <Card className="divide-y divide-border">
      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-3 p-3">
          <span className="w-40 truncate text-sm font-medium">{m.name}</span>
          <Input className="flex-1 font-mono text-xs" placeholder="Discord user ID (numbers)" value={draft[m.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))} />
          <Button size="sm" variant="outline" onClick={() => save(m.id)}>Save</Button>
        </div>
      ))}
    </Card>
  );
}

type StepDraft = { id?: string; step_name: string; description: string | null; default_assignee_id: string | null };

function TemplateDialog({ open, onOpenChange, editing, members, steps, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Template | null; members: TeamMember[]; steps: TemplateStep[]; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<StepDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name); setDescription(editing.description ?? "");
      setRows(steps.filter((s) => s.template_id === editing.id).sort((a, b) => a.step_order - b.step_order)
        .map((s) => ({ id: s.id, step_name: s.step_name, description: s.description, default_assignee_id: s.default_assignee_id })));
    } else {
      setName(""); setDescription(""); setRows([{ step_name: "", description: null, default_assignee_id: null }]);
    }
  }, [open, editing, steps]);

  const setRow = (i: number, patch: Partial<StepDraft>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => setRows((r) => [...r, { step_name: "", description: null, default_assignee_id: null }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    const clean = rows.filter((r) => r.step_name.trim());
    if (clean.length === 0) { toast.error("Add at least one step"); return; }
    setSaving(true);
    const caller = currentUsername();
    let templateId = editing?.id;
    if (editing) {
      const { error } = await sb.from("task_templates").update({ name: name.trim(), description: description.trim() || null }).eq("id", editing.id);
      if (error) { setSaving(false); toast.error(error.message); return; }
      // Replace steps wholesale (simplest correct approach for v1).
      await sb.from("task_template_steps").delete().eq("template_id", editing.id);
    } else {
      const { data, error } = await sb.from("task_templates").insert({ name: name.trim(), description: description.trim() || null, created_by: caller }).select("id").single();
      if (error) { setSaving(false); toast.error(error.message); return; }
      templateId = data.id;
    }
    const payload = clean.map((r, i) => ({ template_id: templateId, step_order: i + 1, step_name: r.step_name.trim(), description: r.description?.trim() || null, default_assignee_id: r.default_assignee_id || null }));
    const { error: stepErr } = await sb.from("task_template_steps").insert(payload);
    setSaving(false);
    if (stepErr) { toast.error(stepErr.message); return; }
    toast.success(editing ? "Template updated" : "Template created");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Script" /></div>
          <div className="grid gap-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Write → Upload → Verify" /></div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><Label>Steps</Label><Button size="sm" variant="outline" onClick={addRow}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button></div>
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                <Input className="flex-1" value={row.step_name} onChange={(e) => setRow(i, { step_name: e.target.value })} placeholder={`Step ${i + 1}`} />
                <Select value={row.default_assignee_id ?? "none"} onValueChange={(v) => setRow(i, { default_assignee_id: v === "none" ? null : v })}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">No default</SelectItem>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
                <button className="text-muted-foreground hover:text-destructive" onClick={() => removeRow(i)}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
