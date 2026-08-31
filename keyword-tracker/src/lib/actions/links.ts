"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Create a tracking link (maps an OnlyFinder keyword → an OF tracking link).
 * Called from the /links "Add Tracking Link" form.
 */
export async function createTrackingLink(formData: FormData): Promise<ActionResult> {
  const creator_id = String(formData.get("creator_id") ?? "").trim();
  const keyword = String(formData.get("keyword") ?? "").trim();
  const link_id = String(formData.get("link_id") ?? "").trim();
  const onlyfinder_campaign = String(formData.get("onlyfinder_campaign") ?? "").trim();
  const link_name = String(formData.get("link_name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();

  if (!creator_id) return { ok: false, error: "Please choose a creator." };
  if (!keyword) return { ok: false, error: "Keyword is required." };
  if (!link_id) return { ok: false, error: "OF tracking link ID is required." };

  const { error } = await supabaseAdmin().from("tracking_links").insert({
    creator_id,
    keyword,
    link_id,
    link_name: link_name || null,
    onlyfinder_campaign: onlyfinder_campaign || null,
    url: url || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "That tracking link ID is already mapped for this creator." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/links");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteTrackingLink(id: string): Promise<ActionResult> {
  const { error } = await supabaseAdmin().from("tracking_links").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/links");
  revalidatePath("/dashboard");
  return { ok: true };
}
