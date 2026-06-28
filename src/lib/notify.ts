// Fan a task ping out to every channel a team member has configured — AND
// surface the result, so a failed ping is never silent. The operator who
// triggered the handoff sees whether the assignee was actually reached.
//
// Channels:
//   • WhatsApp — via /api/whatsapp-notify (needs chatters.whatsapp_phone + the
//                recipient must have joined the Twilio sandbox once)
//   • Discord  — @-mention via /api/discord-dm (needs discord_user_id or channel)
//   • In-app   — handled separately by the NotificationsBell polling (always works,
//                no setup) — so a missing WhatsApp number degrades gracefully.
//
// COALESCING: when many pings hit the same person in a few seconds (e.g. you
// start the same pipeline for 12 creators, all owned by one script-writer), we
// buffer them and send ONE combined message instead of a wall of pings. A single
// ping just flushes after a short quiet window. The in-app list is the reliable
// source of truth, so the worst case (tab closed mid-buffer) still shows the task.
//
// Best-effort for the DB flow: never throws (the mutation already committed).

import { supabase } from "@/integrations/supabase/client";
import { discordPing } from "@/lib/discord";
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

/** Fold N buffered pings into one tidy message; a single ping is sent verbatim. */
function combine(contents: string[]): string {
  if (contents.length === 1) return contents[0];
  // Bullet the first line of each (handles any multi-line content gracefully).
  const lines = contents.map((c) => `- ${c.split("\n")[0].replace(/^[🔁🔔📋✅📝🗓️]\s*/u, "").trim()}`);
  return `### 🔔 ${contents.length} task updates\n${lines.join("\n")}`;
}

/** Resolve a member's channels, send the (possibly combined) message, toast the outcome. */
async function deliver(chatterId: string, content: string): Promise<void> {
  let name = "team member";
  let discordId: string | null = null;
  let channelId: string | null = null;
  let phone: string | null = null;
  try {
    const { data } = await sb
      .from("chatters")
      .select("name, discord_user_id, discord_channel_id, whatsapp_phone")
      .eq("id", chatterId)
      .maybeSingle();
    name = data?.name ?? name;
    discordId = data?.discord_user_id ?? null;
    channelId = data?.discord_channel_id ?? null;
    phone = data?.whatsapp_phone ?? null;
  } catch {
    /* ignore — fall through to the no-channel warning */
  }

  const hasDiscord = Boolean(discordId || channelId);
  if (!hasDiscord && !phone) {
    toast.warning(
      `${name} has no Discord channel/ID or WhatsApp number — they were NOT pinged externally (they'll still see it in their in-app list). Add one in Tasks → Templates → Team contacts.`,
    );
    return;
  }

  const [discordOk, wa] = await Promise.all([
    hasDiscord ? discordPing({ channelId, discordId, content }) : Promise.resolve(null),
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

// ── Coalescing buffer ────────────────────────────────────────────────────────
type Pending = { contents: string[]; timer: ReturnType<typeof setTimeout> | null; firstAt: number };
const buffers = new Map<string, Pending>();
const QUIET_MS = 8000; // flush this long after the LAST ping to a person…
const MAX_MS = 30000; // …but never hold a ping longer than this overall.

async function flush(chatterId: string): Promise<void> {
  const buf = buffers.get(chatterId);
  if (!buf) return;
  buffers.delete(chatterId);
  if (buf.timer) clearTimeout(buf.timer);
  await deliver(chatterId, combine(buf.contents));
}

/**
 * Queue a ping for one team member. Rapid pings to the same person within a few
 * seconds are merged into a single combined message; a lone ping flushes after a
 * short quiet window. Never throws.
 */
export async function notifyChatter(chatterId: string | null | undefined, content: string): Promise<void> {
  if (!chatterId) return;
  const existing = buffers.get(chatterId);
  const buf: Pending = existing ?? { contents: [], timer: null, firstAt: Date.now() };
  buf.contents.push(content);
  if (buf.timer) clearTimeout(buf.timer);
  const wait = Math.max(0, Math.min(QUIET_MS, MAX_MS - (Date.now() - buf.firstAt)));
  buf.timer = setTimeout(() => { void flush(chatterId); }, wait);
  buffers.set(chatterId, buf);
}

// If the operator switches away or closes the tab mid-buffer, flush now (best
// effort) so pending pings still go out.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      for (const id of Array.from(buffers.keys())) void flush(id);
    }
  });
}
