// Fan a task ping out to every channel a team member has configured.
//
// Channels:
//   • Discord  — @-mention via /api/discord-notify (needs discord_user_id)
//   • WhatsApp — template message via /api/whatsapp-notify (needs whatsapp_phone)
//   • In-app   — handled separately by the NotificationsBell polling; no push.
//
// Best-effort: never throws. The DB change that triggered the ping has already
// committed by the time this runs.

import { supabase } from "@/integrations/supabase/client";
import { notify as discordNotify } from "@/lib/discord";

const sb = supabase as unknown as { from: (t: string) => any };

async function whatsappNotify(phone: string, content: string): Promise<void> {
  try {
    await fetch("/api/whatsapp-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, content }),
    });
  } catch (e) {
    console.error("[whatsapp] notify failed:", e);
  }
}

/** Ping one team member across whichever channels they've set up. */
export async function notifyChatter(chatterId: string | null | undefined, content: string): Promise<void> {
  if (!chatterId) return;
  let discordId: string | null = null;
  let phone: string | null = null;
  try {
    const { data } = await sb.from("chatters").select("discord_user_id, whatsapp_phone").eq("id", chatterId).maybeSingle();
    discordId = data?.discord_user_id ?? null;
    phone = data?.whatsapp_phone ?? null;
  } catch { /* ignore */ }
  await Promise.all([
    discordId ? discordNotify({ content, mentionUserIds: [discordId] }).catch(() => {}) : Promise.resolve(),
    phone ? whatsappNotify(phone, content).catch(() => {}) : Promise.resolve(),
  ]);
}
