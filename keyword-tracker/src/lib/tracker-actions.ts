"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

function csv(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Add a creator. Captures everything onboarding needs — no code change to add one. */
export async function addCreator(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };

  const of_username = String(formData.get("of_username") ?? "").trim();
  const onlyfansapi_acct_id = String(formData.get("ofapi_ref") ?? "").trim();
  const onlyfinder_ref = String(formData.get("onlyfinder_ref") ?? "").trim();
  const budgetRaw = String(formData.get("daily_budget_usd") ?? "").trim();

  const { error } = await supabaseAdmin().from("creators").insert({
    name,
    of_username: of_username || null,
    onlyfansapi_acct_id: onlyfansapi_acct_id || null,
    onlyfinder_ref: onlyfinder_ref || null,
    daily_budget_usd: budgetRaw ? Number(budgetRaw) : null,
    other_platforms: csv(formData.get("other_platforms")),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true };
}

/** Log a keyword change. A DB trigger auto-creates the 'running' experiment. */
export async function logKeywordChange(formData: FormData): Promise<ActionResult> {
  const creator_id = String(formData.get("creator_id") ?? "").trim();
  const changed_on = String(formData.get("changed_on") ?? "").trim();
  const new_keywords = csv(formData.get("new_keywords"));
  const action = String(formData.get("action") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!creator_id) return { ok: false, error: "Missing creator." };
  if (!changed_on) return { ok: false, error: "Pick the date the keyword changed." };
  if (new_keywords.length === 0) return { ok: false, error: "Enter at least one keyword." };

  const { error } = await supabaseAdmin().from("keyword_changes").insert({
    creator_id,
    changed_on,
    new_keywords,
    action: action || null,
    note: note || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/creators/${creator_id}`);
  revalidatePath("/decisions");
  return { ok: true };
}

/** Log (or update) the OnlyFinder daily spend for a creator+date. */
export async function logDailySpend(formData: FormData): Promise<ActionResult> {
  const creator_id = String(formData.get("creator_id") ?? "").trim();
  const metric_date = String(formData.get("metric_date") ?? "").trim();
  const spendRaw = String(formData.get("spend_usd") ?? "").trim();

  if (!creator_id) return { ok: false, error: "Missing creator." };
  if (!metric_date) return { ok: false, error: "Pick a date." };
  if (spendRaw === "" || Number.isNaN(Number(spendRaw))) return { ok: false, error: "Enter a spend amount." };
  const spend = Number(spendRaw);

  const db = supabaseAdmin();
  // Update the day's row if it exists (don't clobber pulled fan/income data),
  // else insert a spend-only row (totals default to 0, so the direct=total−tracked
  // CHECK is satisfied as 0=0−0).
  const { data: existing } = await db
    .from("daily_metrics")
    .select("id")
    .eq("creator_id", creator_id)
    .eq("metric_date", metric_date)
    .maybeSingle();

  const { error } = existing
    ? await db.from("daily_metrics").update({ onlyfinder_spend_usd: spend, spend_missing: false }).eq("id", (existing as { id: string }).id)
    : await db.from("daily_metrics").insert({ creator_id, metric_date, onlyfinder_spend_usd: spend, spend_missing: false });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/creators/${creator_id}`);
  return { ok: true };
}
