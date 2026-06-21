// Fan a task ping out to every channel a team member has configured — AND
// surface the result, so a failed ping is never silent. The operator who
// triggered the handoff sees whether the assignee was actually reached.
//
// Channels:
//   • WhatsApp — via /api/whatsapp-notify (needs chatters.whatsapp_phone + the
//                recipient must have joined the Twilio sandbox once)
//   • Discord  — @-mention via /api/discord-notify (needs discord_user_id)
//   • In-app   — handled separately by the NotificationsBell polling (always works,
//                no setup) — so a missing WhatsApp number degrades gracefully.
//
// Best-effort for the DB flow: never throws (the mutation already committed).

import { supabase } from "@/integrations/supabase/client";
import { notify as discordNotify } from "@/lib/discord";
import { toast } from "sonner";

const sb = supabase as unknown as { from: (t: string) => any };

/** POST to the WhatsApp function and read its {ok,error} so we can report why it failed. */
async function whatsappNotify(phone: string, content: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/whatsapp-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, content }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return { ok: Boolean(j.ok), error: j.error };
  } catch {
    return { ok: false, error: "network error" };
  }
}

/**
 * Ping one team member across whichever channels they've set up, then toast the
 * outcome:
 *   • no channel configured → warning (they will NOT be pinged externally)
 *   • everything sent       → success
 *   • something failed      → error/warning WITH the reason (e.g. Twilio
 *                             "not opted in", so you know to have them join the sandbox)
 */
export async function notifyChatter(chatterId: string | null | undefined, content: string): Promise<void> {
  if (!chatterId) return;

  let name = "team member";
  let discordId: string | null = null;
  let phone: string | null = null;
  try {
    const { data } = await sb
      .from("chatters")
      .select("name, discord_user_id, whatsapp_phone")
      .eq("id", chatterId)
      .maybeSingle();
    name = data?.name ?? name;
    discordId = data?.discord_user_id ?? null;
    phone = data?.whatsapp_phone ?? null;
  } catch {
    /* ignore — fall through to the no-channel warning */
  }

  if (!discordId && !phone) {
    toast.warning(
      `${name} has no WhatsApp number or Discord ID — they were NOT pinged externally (they'll still see it in their in-app list). Add one in Tasks → Templates → Team contacts.`,
    );
    return;
  }

  const [discordOk, wa] = await Promise.all([
    discordId ? discordNotify({ content, mentionUserIds: [discordId] }) : Promise.resolve(null),
    phone ? whatsappNotify(phone, content) : Promise.resolve(null),
  ]);

  const sent: string[] = [];
  const failed: string[] = [];
  if (wa) (wa.ok ? sent : failed).push(wa.ok ? "WhatsApp" : `WhatsApp (${wa.error ?? "failed"})`);
  if (discordOk !== null) (discordOk ? sent : failed).push(discordOk ? "Discord" : "Discord (failed)");

  if (failed.length === 0) {
    toast.success(`Pinged ${name} · ${sent.join(" + ")} ✓`);
  } else if (sent.length > 0) {
    toast.warning(`${name}: ${sent.join(" + ")} ✓ · ${failed.join(" · ")} ✗`);
  } else {
    toast.error(`Couldn't reach ${name} · ${failed.join(" · ")} ✗`);
  }
}
