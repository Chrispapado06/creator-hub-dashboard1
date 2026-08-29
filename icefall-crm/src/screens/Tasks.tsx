import { useEffect, useState } from "react";
import { Avatar, Button, Card, PageHead, Pill } from "@/components/ui";
import { Resolve } from "@/components/states";
import { listOpenTasks, raiseExpiryTasks } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Task } from "@/data/types";
import { formatDay } from "@/lib/utils";
import { may, useStaff } from "@/auth/session";

const tone = (p: Task["priority"]) =>
  p === "critical" || p === "high" ? "amber" : p === "low" ? "neutral" : "accent";

/**
 * Work the system noticed, waiting for a person.
 *
 * THE SWEEP NOTIFIES. IT DOES NOT ACT. `raise_expiry_tasks` reads the placement
 * view and writes tasks; it holds no privilege on `placements` at all, so it is
 * structurally incapable of responding to what it finds. An expired placement
 * produces a task saying the company still holds the position and will continue
 * to until somebody moves them — which is the correct behaviour stated on the
 * face of the alert, not buried in a migration comment.
 *
 * Running it twice is safe: each generated task carries a key naming the thing
 * it is about, so a second sweep finds the first rather than duplicating it.
 *
 * THE AVATAR ON EACH ROW IS THE DESK, NOT A PERSON. Nothing here records who
 * will do the work — a task is raised against a desk, and often against none at
 * all. A row with no desk therefore carries the blank placeholder rather than
 * initials, because an avatar with somebody's letters in it is read as an
 * assignment that has been made.
 */
export default function Tasks() {
  const staff = useStaff();
  const [result, setResult] = useState<Result<Task[]>>(loading);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = () => void listOpenTasks().then(setResult);
  useEffect(load, []);

  const sweep = async () => {
    setRunning(true);
    const r = await raiseExpiryTasks();
    setRunning(false);
    setNote(r.state === "ok" ? "Sweep complete." : r.state === "loading" ? null : r.reason);
    load();
  };

  return (
    <>
      <PageHead
        title="Tasks"
        subtitle="Expiries, renewals and approvals the system raised for somebody to action. Nothing here has changed the marketplace — an alert may notify, it may never act."
        actions={
          may(staff?.role ?? null, ["operations", "sales"]) ? (
            <Button onClick={sweep} disabled={running}>
              {running ? "Checking…" : "Check for expiries"}
            </Button>
          ) : undefined
        }
      />
      {note && <p className="mb-4 text-[12.5px] text-muted">{note}</p>}
      <Resolve
        result={result}
        what="open tasks"
        isEmpty={(v) => v.length === 0}
        empty="Nothing needs attention. Run the expiry check to look for placements approaching or past their term."
      >
        {(tasks) => (
          <div className="space-y-3">
            {tasks.map((t) => (
              <Card key={t.id} pad={false} className="flex flex-wrap items-start gap-x-5 gap-y-3 p-5">
                <Avatar name={t.desk ? t.desk.replace(/_/g, " ") : ""} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{t.title}</p>
                    <Pill tone={tone(t.priority)}>{t.priority}</Pill>
                    {t.desk && <Pill tone="neutral">{t.desk.replace("_", " ")}</Pill>}
                  </div>
                  {t.detail && (
                    <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">{t.detail}</p>
                  )}
                </div>
                {/* A task with no date says so. It never borrows today's. */}
                <p className="tnum whitespace-nowrap text-[12.5px] font-medium text-faint">
                  {t.due_on ? `Due ${formatDay(t.due_on)}` : "No date"}
                </p>
              </Card>
            ))}
          </div>
        )}
      </Resolve>
    </>
  );
}
