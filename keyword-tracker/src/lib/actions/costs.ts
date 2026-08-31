"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/links";

/**
 * Log (or overwrite) a day of OnlyFinder CPC data for a tracking link. Upserts
 * on (tracking_link_id, date) so re-entering a date corrects it rather than
 * creating a duplicate.
 */
export async function logCost(formData: FormData): Promise<ActionResult> {
  const tracking_link_id = String(formData.get("tracking_link_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const clicks = Number(formData.get("clicks"));
  const spend_usd = Number(formData.get("spend_usd"));

  if (!tracking_link_id) return { ok: false, error: "Please choose a tracking link." };
  if (!date) return { ok: false, error: "Date is required." };
  if (!Number.isFinite(clicks) || clicks < 0) return { ok: false, error: "Clicks must be 0 or more." };
  if (!Number.isFinite(spend_usd) || spend_usd < 0) return { ok: false, error: "Spend must be 0 or more." };

  const { error } = await supabaseAdmin()
    .from("keyword_costs")
    .upsert(
      { tracking_link_id, date, clicks, spend_usd },
      { onConflict: "tracking_link_id,date" },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/costs");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteCost(id: string): Promise<ActionResult> {
  const { error } = await supabaseAdmin().from("keyword_costs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/costs");
  revalidatePath("/dashboard");
  return { ok: true };
}
