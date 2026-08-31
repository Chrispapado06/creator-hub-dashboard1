import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Avatar, Button, Card, PageHead, Pill } from "@/components/ui";
import { Resolve } from "@/components/states";
import { assignTask, createTask, listOpenTasks, listStaff, raiseExpiryTasks, setTaskStatus } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import { DateButton, Select } from "@/components/controls";
import type { StaffRecord, Task } from "@/data/types";
import { cn, formatDay } from "@/lib/utils";
import { may, useStaff } from "@/auth/session";

const tone = (p: Task["priority"]) =>
  p === "critical" || p === "high" ? "amber" : p === "low" ? "neutral" : "accent";

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
 */
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

  const fieldCls =
    "h-9 w-full rounded-tile border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent";

  return (
    <>
      <PageHead
        title="Tasks"
        subtitle="Work assigned to a named person, plus the expiries and renewals the system raised. Seeing it here — and the count on the sidebar — is the notification; nothing sends push or email yet."
        actions={
          <div className="flex items-center gap-2">
            {may(staff?.role ?? null, ["operations", "sales"]) && (
              <Button variant="secondary" onClick={sweep} disabled={running}>
                {running ? "Checking…" : "Check for expiries"}
              </Button>
            )}
            <Button className="!bg-accent text-white hover:opacity-90" onClick={() => setCreating((c) => !c)}>
              <Plus size={15} strokeWidth={2.25} /> New task
            </Button>
          </div>
        }
      />
      {note && <p className="mb-4 text-[12.5px] text-muted">{note}</p>}

      {creating && (
        <Card className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted">What needs doing *</span>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={fieldCls} placeholder="e.g. Chase the signed contract from Highline Trekking" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-muted">Detail</span>
              <input value={form.detail} onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))} className={fieldCls} placeholder="Anything the person needs to know" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">Assign to</span>
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
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">Due</span>
              <DateButton value={form.due_on} onChange={(v: string) => setForm((f) => ({ ...f, due_on: v }))} className="w-full" ariaLabel="Due date" />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button className="!bg-accent text-white hover:opacity-90" disabled={busy || form.title.trim().length === 0} onClick={() => void create()}>
              Create task
            </Button>
          </div>
        </Card>
      )}

      <div className="mb-3 flex items-center gap-1.5">
        {(["all", "mine"] as const).map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "secondary" : "ghost"} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === "all" ? "All open" : "Mine"}
          </Button>
        ))}
      </div>

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
                <p className="text-[12.5px] text-faint">Nothing is assigned to you. The All tab shows the full queue.</p>
              </Card>
            );
          return (
            <div className="space-y-3">
              {shown.map((t) => {
                const assignee = nameOf(t.assigned_to);
                return (
                  <Card key={t.id} pad={false} className="flex flex-wrap items-start gap-x-5 gap-y-3 p-5">
                    <Avatar name={assignee ?? (t.desk ? t.desk.replace(/_/g, " ") : "")} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn("text-[15px] font-semibold tracking-[-0.01em] text-ink", t.status === "in_progress" && "")}>{t.title}</p>
                        <Pill tone={tone(t.priority)}>{t.priority}</Pill>
                        {t.status === "in_progress" && <Pill tone="accent">in progress</Pill>}
                        {assignee ? <Pill tone="green">{assignee}</Pill> : t.desk ? <Pill tone="neutral">{t.desk.replace("_", " ")} desk</Pill> : null}
                      </div>
                      {t.detail && <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">{t.detail}</p>}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {!t.assigned_to && staff && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(() => assignTask(t.id, staff.profileId))}>
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
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(() => setTaskStatus(t.id, "done"))}>
                          Mark done
                        </Button>
                      </div>
                    </div>
                    <p className="tnum whitespace-nowrap text-[12.5px] font-medium text-faint">
                      {t.due_on ? `Due ${formatDay(t.due_on)}` : "No date"}
                    </p>
                  </Card>
                );
              })}
            </div>
          );
        }}
      </Resolve>
    </>
  );
}
