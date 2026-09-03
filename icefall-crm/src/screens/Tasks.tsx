import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Resolve } from "@/components/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assignTask, createTask, listOpenTasks, listStaff, raiseExpiryTasks, setTaskStatus } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import { DateButton, Select } from "@/components/controls";
import type { StaffRecord, Task } from "@/data/types";
import { cn, formatDay, initials } from "@/lib/utils";
import { may, useStaff } from "@/auth/session";

/**
 * Tasks as ASSIGNMENTS — the owner's ruling, CR-16: "I can assign work to
 * Jorge, he needs to see it and get it done."
 *
 * Three verbs, all real writes: create (a manual task, optionally with a name
 * on it), assign (put a person on any open task), complete (status → done with
 * who and when recorded). "He needs to see it" is the Mine tab here plus the
 * count on the sidebar's Tasks entry — an in-app notification, which is the
 * only kind that exists: nothing in ICEFALL sends push or email, and this
 * screen does not pretend otherwise.
 *
 * THE SWEEP STILL NOTIFIES AND NEVER ACTS. `raise_expiry_tasks` holds no
 * privilege on `placements`; an expired placement produces a task saying the
 * company still holds the position until somebody moves them.
 *
 * THE AVATAR IS THE PERSON WHEN ONE IS ASSIGNED, THE DESK WHEN NOT. A row with
 * neither carries the blank placeholder — an avatar with letters in it is read
 * as an assignment that has been made, so it only gets letters when one has.
 *
 * ── RE-SKIN (theme match, Sep 2026) ────────────────────────────────────────
 * ALL SIX CONTROLS SURVIVE AND NONE MOVED SCREEN: Check for expiries and New
 * task are still the two header actions; the create form is still an inline
 * card with the same four fields, Cancel and Create task; All open / Mine is
 * the same pair of tabs (now the theme's Tabs rather than two buttons); and
 * every row still carries Take it, the assignment Select, Start and Mark done,
 * in that order. The rows moved from one card each into ONE card of divided
 * rows, which is how the reference theme draws a list — the row is the same row.
 */

/**
 * Priority, in the theme's own status-badge idiom. The GROUPING is unchanged
 * from the ICEFALL pill it replaces: critical and high share one treatment,
 * low is the quiet one, everything else sits between them.
 */
const PRIORITY_TONE = (p: Task["priority"]): { variant: "outline" | "secondary"; className?: string } =>
  p === "critical" || p === "high"
    ? {
        variant: "outline",
        className: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      }
    : p === "low"
      ? { variant: "outline" }
      : { variant: "secondary" };

export default function Tasks() {
  const staff = useStaff();
  const [result, setResult] = useState<Result<Task[]>>(loading);
  const [team, setTeam] = useState<Result<StaffRecord[]>>(loading);
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", detail: "", assigned_to: "", due_on: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void listOpenTasks().then(setResult);
    void listStaff().then(setTeam);
  }, []);
  useEffect(load, [load]);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    if (team.state === "ok") for (const s of team.value) m.set(s.profile_id, s.name);
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : null);
  }, [team]);

  const sweep = async () => {
    setRunning(true);
    const r = await raiseExpiryTasks();
    setRunning(false);
    setNote(r.state === "ok" ? "Sweep complete." : r.state === "loading" ? null : r.reason);
    load();
  };

  const create = async () => {
    setBusy(true);
    const r = await createTask({
      title: form.title,
      detail: form.detail || null,
      assigned_to: form.assigned_to || null,
      due_on: form.due_on || null,
    });
    setBusy(false);
    if (r.state === "ok") {
      setForm({ title: "", detail: "", assigned_to: "", due_on: "" });
      setCreating(false);
      load();
    } else setNote(r.state === "error" ? r.reason : "No database is configured.");
  };

  const act = async (fn: () => Promise<Result<null>>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.state !== "ok") setNote(r.state === "error" ? r.reason : "No database is configured.");
    load();
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-3xl tracking-tight">Tasks</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            Work assigned to a named person, plus the expiries and renewals the system raised. Seeing
            it here — and the count on the sidebar — is the notification; nothing sends push or email
            yet.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {may(staff?.role ?? null, ["operations", "sales"]) && (
            <Button variant="outline" onClick={sweep} disabled={running}>
              {running ? "Checking…" : "Check for expiries"}
            </Button>
          )}
          <Button onClick={() => setCreating((c) => !c)}>
            <Plus data-icon="inline-start" /> New task
          </Button>
        </div>
      </div>

      {/* The refusal, verbatim and in place — never a toast that disappears. */}
      {note && <p className="text-muted-foreground text-sm">{note}</p>}

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>New task</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="gap-1.5 sm:col-span-2">
                <FieldLabel htmlFor="task-title">What needs doing *</FieldLabel>
                <Input
                  id="task-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Chase the signed contract from Highline Trekking"
                />
              </Field>
              <Field className="gap-1.5 sm:col-span-2">
                <FieldLabel htmlFor="task-detail">Detail</FieldLabel>
                <Input
                  id="task-detail"
                  value={form.detail}
                  onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
                  placeholder="Anything the person needs to know"
                />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="task-assign">Assign to</FieldLabel>
                <Select
                  value={form.assigned_to}
                  onChange={(v: string) => setForm((f) => ({ ...f, assigned_to: v }))}
                  ariaLabel="Assign to"
                  className="w-full"
                  options={[
                    { value: "", label: "Nobody yet — a queue, not a name" },
                    ...(team.state === "ok" ? team.value.filter((s) => s.active).map((s) => ({ value: s.profile_id, label: s.name })) : []),
                  ]}
                />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="task-due">Due</FieldLabel>
                <DateButton value={form.due_on} onChange={(v: string) => setForm((f) => ({ ...f, due_on: v }))} className="w-full" ariaLabel="Due date" />
              </Field>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button disabled={busy || form.title.trim().length === 0} onClick={() => void create()}>
              Create task
            </Button>
          </CardFooter>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "mine")}>
        <TabsList>
          <TabsTrigger value="all">All open</TabsTrigger>
          <TabsTrigger value="mine">Mine</TabsTrigger>
        </TabsList>
      </Tabs>

      <Resolve
        result={result}
        what="open tasks"
        isEmpty={(v) => v.length === 0}
        empty="Nothing needs attention. Create a task to assign work, or run the expiry check."
      >
        {(tasks) => {
          const shown = tab === "mine" ? tasks.filter((t) => t.assigned_to === staff?.profileId) : tasks;
          if (shown.length === 0)
            return (
              <Card>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Nothing is assigned to you. The All tab shows the full queue.
                  </p>
                </CardContent>
              </Card>
            );
          return (
            <Card>
              <CardContent className="px-0">
                <div className="divide-y divide-border/60">
                  {shown.map((t) => {
                    const assignee = nameOf(t.assigned_to);
                    const face = assignee ?? (t.desk ? t.desk.replace(/_/g, " ") : "");
                    const priority = PRIORITY_TONE(t.priority);
                    return (
                      <div key={t.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-4">
                        <Avatar>
                          {/* Letters only when there is somebody or a desk to
                              name. An avatar with initials in it reads as an
                              assignment already made. */}
                          <AvatarFallback>{face ? initials(face) : ""}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{t.title}</p>
                            <Badge variant={priority.variant} className={cn("border", priority.className)}>
                              {t.priority}
                            </Badge>
                            {t.status === "in_progress" && <Badge variant="secondary">in progress</Badge>}
                            {assignee ? (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              >
                                {assignee}
                              </Badge>
                            ) : t.desk ? (
                              <Badge variant="outline">{t.desk.replace("_", " ")} desk</Badge>
                            ) : null}
                          </div>
                          {t.detail && (
                            <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-relaxed">{t.detail}</p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {!t.assigned_to && staff && (
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => assignTask(t.id, staff.profileId))}>
                                Take it
                              </Button>
                            )}
                            <Select
                              value={t.assigned_to ?? ""}
                              disabled={busy}
                              onChange={(v: string) => void act(() => assignTask(t.id, v || null))}
                              ariaLabel="Assign this task"
                              placeholder="Assign…"
                              className="min-w-[150px]"
                              options={[
                                { value: "", label: "Assign…" },
                                ...(team.state === "ok" ? team.value.filter((s) => s.active).map((s) => ({ value: s.profile_id, label: s.name })) : []),
                              ]}
                            />
                            {t.status === "open" && (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => setTaskStatus(t.id, "in_progress"))}>
                                Start
                              </Button>
                            )}
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => setTaskStatus(t.id, "done"))}>
                              Mark done
                            </Button>
                          </div>
                        </div>
                        {/* "No date" rather than a dash: the task genuinely has
                            no due date, which is a fact about the task. */}
                        <p className="shrink-0 whitespace-nowrap text-muted-foreground text-sm tabular-nums">
                          {t.due_on ? `Due ${formatDay(t.due_on)}` : "No date"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        }}
      </Resolve>
    </div>
  );
}
