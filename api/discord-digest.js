// Daily per-person task digest, DM'd by the Discord bot.
//
// Each morning (Vercel cron) this DMs every active team member with a Discord ID
// their tasks for the day: the pipeline steps waiting on them + their open
// one-off tasks. People with nothing on their plate are not DM'd.
//
// Triggered by the Vercel cron defined in vercel.json. Secured by CRON_SECRET:
// Vercel sends `Authorization: Bearer <CRON_SECRET>`. For a manual test, send
// the same value as the `x-cron-secret` header.
//
// Vercel env vars:
//   DISCORD_BOT_TOKEN        — the bot token (same as api/discord-dm.js)
//   CRON_SECRET              — random string; secures this endpoint
//   VITE_SUPABASE_URL        — already set for the client build (reused here)
//   VITE_SUPABASE_ANON_KEY   — already set; reads under "Public full access" RLS
//
// Self-contained (no cross-dir imports) so Vercel bundling can't break it.

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;
const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function discordDM(token, recipientId, content) {
  const chRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: String(recipientId) }),
  });
  if (!chRes.ok) throw new Error(`open DM ${chRes.status}: ${(await chRes.text().catch(() => "")).slice(0, 160)}`);
  const ch = await chRes.json();
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${ch.id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: String(content).slice(0, 1900) }),
  });
  if (!msgRes.ok) throw new Error(`send DM ${msgRes.status}: ${(await msgRes.text().catch(() => "")).slice(0, 160)}`);
}

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return r.json();
}

export default async function handler(req, res) {
  // Auth: Vercel cron (Bearer) OR a manual test (x-cron-secret).
  if (CRON_SECRET) {
    const okBearer = req.headers.authorization === `Bearer ${CRON_SECRET}`;
    const okManual = req.headers["x-cron-secret"] === CRON_SECRET;
    if (!okBearer && !okManual) return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (!TOKEN || !SB_URL || !SB_KEY) {
    return res.status(200).json({ ok: false, error: "not configured (DISCORD_BOT_TOKEN / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)" });
  }

  const today = new Date().toISOString().slice(0, 10);
  try {
    const [chatters, steps, tasks] = await Promise.all([
      sbGet("chatters?status=eq.active&discord_user_id=not.is.null&select=id,name,discord_user_id&order=name"),
      sbGet("task_pipeline_steps?status=eq.active&select=assignee_id,step_name,task_pipelines!inner(title,status)&task_pipelines.status=eq.active"),
      sbGet("standalone_tasks?status=eq.open&select=assignee_id,title,due_date"),
    ]);

    const stepsBy = {};
    for (const s of steps) (stepsBy[s.assignee_id] = stepsBy[s.assignee_id] || []).push(s);
    const tasksBy = {};
    for (const t of tasks) (tasksBy[t.assignee_id] = tasksBy[t.assignee_id] || []).push(t);

    let sent = 0, empty = 0;
    const warnings = [];
    for (const c of chatters) {
      const ms = stepsBy[c.id] || [];
      const mt = tasksBy[c.id] || [];
      if (ms.length + mt.length === 0) { empty++; continue; }

      let msg = `🗓️ **Your tasks for ${today}**\n`;
      if (ms.length) {
        msg += `\n**Pipelines waiting on you (${ms.length}):**\n` +
          ms.map((s) => `• ${(s.task_pipelines && s.task_pipelines.title) || "Pipeline"} — ${s.step_name}`).join("\n") + "\n";
      }
      if (mt.length) {
        msg += `\n**One-off tasks (${mt.length}):**\n` +
          mt.map((t) => `• ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`).join("\n") + "\n";
      }
      msg += `\nMark them done in the dashboard → Tasks. Move with speed 💪`;

      try { await discordDM(TOKEN, c.discord_user_id, msg); sent++; }
      catch (e) { warnings.push(`${c.name}: ${String((e && e.message) || e)}`); }
    }

    return res.status(200).json({ ok: true, day: today, sent, empty, warnings });
  } catch (e) {
    console.error("[discord-digest]", e && e.message);
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
