// Task-handoff data layer.
//
// All STATE-CHANGING operations go through the plpgsql RPCs (defined in
// 20260613180000_task_handoff_pipeline.sql) so the handoff is atomic and the
// caller is verified in the DB. The Discord ping is always fired AFTER the RPC
// resolves, wrapped so a ping failure can never surface as a thrown error to
// the user — the DB change is already committed by then.
//
// Reads are plain supabase.from() selects (house pattern; no React Query).

import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/discord";
import { notifyChatter } from "@/lib/notify";

// Untyped accessor — the generated Supabase types don't include the new tables
// or RPCs yet. Regenerate types after the migration to restore type-safety.
const sb = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
};

// ── Types ────────────────────────────────────────────────────────────────────
export type PipelineStatus = "active" | "complete" | "cancelled";
export type StepStatus = "waiting" | "active" | "done" | "skipped";

export type TeamMember = { id: string; name: string; status: string; discord_user_id: string | null; whatsapp_phone: string | null };

export type Template = { id: string; name: string; description: string | null; active: boolean };
export type TemplateStep = {
  id: string;
  template_id: string;
  step_order: number;
  step_name: string;
  description: string | null;
  default_assignee_id: string | null;
};

export type Pipeline = {
  id: string;
  template_id: string | null;
  title: string;
  status: PipelineStatus;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
};
export type PipelineStep = {
  id: string;
  pipeline_id: string;
  step_order: number;
  step_name: string;
  description: string | null;
  assignee_id: string;
  status: StepStatus;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
};
export type StandaloneTask = {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string;
  status: "open" | "done";
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
};

/** The current user's username, from the app's localStorage session. */
export function currentUsername(): string | null {
  try {
    const raw = localStorage.getItem("agency_session");
    if (!raw) return null;
    return JSON.parse(raw)?.username ?? null;
  } catch {
    return null;
  }
}

// ── Handoff message formatting ───────────────────────────────────────────────
function handoffMessage(
  title: string,
  stepOrder: number,
  total: number,
  stepName: string,
  handedOffBy: string | null,
): string {
  const by = handedOffBy ? ` _(handed off by ${handedOffBy})_` : "";
  return `🔁 **${title}** — Step ${stepOrder}/${total}: **${stepName}**${by}`;
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Complete the active step. RPC advances atomically, THEN we ping the next
 * owner (or post completion). A ping failure is logged, never thrown.
 */
export async function completeActiveStep(
  pipelineId: string,
  pipelineTitle: string,
): Promise<{ error: string | null; completed: boolean }> {
  const caller = currentUsername();
  if (!caller) return { error: "Not signed in", completed: false };

  const { data, error } = await sb.rpc("complete_active_step", {
    p_pipeline_id: pipelineId,
    p_caller_username: caller,
  });
  if (error) return { error: error.message, completed: false };

  // Post-commit, best-effort ping.
  if (data?.pipeline_completed) {
    await notify({ content: `✅ **${pipelineTitle}** complete.` }).catch(() => {});
    return { error: null, completed: true };
  }
  await notifyChatter(
    data.next_assignee_id,
    handoffMessage(pipelineTitle, data.next_step_order, data.total_steps, data.next_step_name, caller),
  );
  return { error: null, completed: false };
}

/** Skip the active step (admin/owner). Same advance + ping as complete. */
export async function skipStep(
  pipelineId: string,
  pipelineTitle: string,
): Promise<{ error: string | null }> {
  const caller = currentUsername();
  if (!caller) return { error: "Not signed in" };
  const { data, error } = await sb.rpc("skip_step", {
    p_pipeline_id: pipelineId,
    p_caller_username: caller,
  });
  if (error) return { error: error.message };
  if (data?.pipeline_completed) {
    await notify({ content: `✅ **${pipelineTitle}** complete.` }).catch(() => {});
  } else if (data) {
    await notifyChatter(
      data.next_assignee_id,
      handoffMessage(pipelineTitle, data.next_step_order, data.total_steps, data.next_step_name, caller),
    );
  }
  return { error: null };
}

export type NewStep = { step_name: string; description?: string | null; assignee_id: string };

/** Start a pipeline from resolved steps. Pings the first owner after commit. */
export async function startPipeline(
  templateId: string | null,
  title: string,
  steps: NewStep[],
): Promise<{ error: string | null; pipelineId?: string }> {
  const caller = currentUsername();
  if (!caller) return { error: "Not signed in" };
  if (!title.trim()) return { error: "Title is required" };
  if (steps.length === 0) return { error: "Add at least one step" };
  if (steps.some((s) => !s.assignee_id)) return { error: "Every step needs an owner" };

  const { data, error } = await sb.rpc("start_pipeline", {
    p_template_id: templateId ?? "",
    p_title: title.trim(),
    p_caller_username: caller,
    p_steps: steps,
  });
  if (error) return { error: error.message };

  await notifyChatter(
    data.assignee_id,
    handoffMessage(title.trim(), data.first_step_order ?? 1, data.total_steps, data.first_step_name, null),
  );
  return { error: null, pipelineId: data.pipeline_id };
}

/** Reassign a step's owner (admin only). Pings the new owner if step is active. */
export async function reassignStep(
  stepId: string,
  newAssigneeId: string,
  pipelineTitle: string,
): Promise<{ error: string | null }> {
  const caller = currentUsername();
  if (!caller) return { error: "Not signed in" };
  const { data, error } = await sb.rpc("reassign_step", {
    p_step_id: stepId,
    p_new_assignee_id: newAssigneeId,
    p_caller_username: caller,
  });
  if (error) return { error: error.message };
  if (data?.is_active) {
    await notifyChatter(data.assignee_id, `🔁 **${pipelineTitle}** — reassigned to you: **${data.step_name}**`);
  }
  return { error: null };
}

/** Cancel a pipeline (creator or admin). */
export async function cancelPipeline(pipelineId: string): Promise<{ error: string | null }> {
  const caller = currentUsername();
  if (!caller) return { error: "Not signed in" };
  const { error } = await sb.rpc("cancel_pipeline", {
    p_pipeline_id: pipelineId,
    p_caller_username: caller,
  });
  return { error: error?.message ?? null };
}

/** Add a one-off standalone task (plain insert; no atomicity needed). */
export async function addStandaloneTask(args: {
  title: string;
  assignee_id: string;
  description?: string | null;
  due_date?: string | null;
}): Promise<{ error: string | null }> {
  const caller = currentUsername();
  if (!args.title.trim()) return { error: "Title is required" };
  if (!args.assignee_id) return { error: "Pick an assignee" };
  const { data, error } = await sb
    .from("standalone_tasks")
    .insert({
      title: args.title.trim(),
      assignee_id: args.assignee_id,
      description: args.description?.trim() || null,
      due_date: args.due_date || null,
      created_by: caller,
    })
    .select("id, assignee_id")
    .single();
  if (error) return { error: error.message };

  // Best-effort ping to the assignee across every channel they've set up.
  await notifyChatter(data.assignee_id, `📋 New task: **${args.title.trim()}**${args.due_date ? ` (due ${args.due_date})` : ""}`);
  return { error: null };
}

/** Mark a standalone task done (plain update). */
export async function completeStandaloneTask(id: string): Promise<{ error: string | null }> {
  const { error } = await sb
    .from("standalone_tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error?.message ?? null };
}

// ── Recurring tasks ──────────────────────────────────────────────────────────
export type RecurringTask = {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string;
  interval_days: number;
  next_run: string;
  active: boolean;
  created_at: string;
};

/**
 * Materialise any recurring occurrences due today, then ping the assignees of
 * whatever got created. Call this when the Tasks page loads — the DB function
 * is idempotent (FOR UPDATE SKIP LOCKED), so several open tabs is harmless.
 */
export async function generateDueRecurringTasks(): Promise<void> {
  const { data, error } = await sb.rpc("generate_due_recurring_tasks", {});
  if (error) { console.error("[recurring] generate failed:", error.message); return; }
  const created = (data?.created ?? []) as { title: string; assignee_id: string | null }[];
  for (const c of created) {
    await notifyChatter(c.assignee_id, `🔁 Recurring task due: **${c.title}**`);
  }
}

export async function listRecurringTasks(): Promise<RecurringTask[]> {
  const { data } = await sb.from("recurring_tasks").select("*").order("created_at", { ascending: false });
  return (data ?? []) as RecurringTask[];
}

export async function createRecurringTask(args: {
  title: string;
  assignee_id: string;
  interval_days: number;
  start_date: string;
  description?: string | null;
}): Promise<{ error: string | null }> {
  if (!args.title.trim()) return { error: "Title is required" };
  if (!args.assignee_id) return { error: "Pick an assignee" };
  if (!args.interval_days || args.interval_days < 1) return { error: "Repeat interval must be at least 1 day" };
  if (!args.start_date) return { error: "Pick a start date" };
  const { error } = await sb.from("recurring_tasks").insert({
    title: args.title.trim(),
    description: args.description?.trim() || null,
    assignee_id: args.assignee_id,
    interval_days: args.interval_days,
    next_run: args.start_date,
    created_by: currentUsername(),
  });
  return { error: error?.message ?? null };
}

export async function deleteRecurringTask(id: string): Promise<{ error: string | null }> {
  const { error } = await sb.from("recurring_tasks").delete().eq("id", id);
  return { error: error?.message ?? null };
}
