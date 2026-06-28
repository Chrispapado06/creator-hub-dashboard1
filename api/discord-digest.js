// Daily per-person task digest, posted by the Discord bot.
//
// Each morning (Vercel cron) the bot posts every active member's tasks for the
// day — pipeline steps waiting on them + open one-off tasks — into THEIR channel
// (and @-mentions them, and pins it, replacing yesterday's pin). People with no
// channel set get a DM via discord_user_id; people with nothing on their plate
// are skipped.
//
// Secured by CRON_SECRET: Vercel sends `Authorization: Bearer <CRON_SECRET>`.
// Manual test: send the same value as the `x-cron-secret` header.
//
// Vercel env vars: DISCORD_BOT_TOKEN, CRON_SECRET, VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY (the last two already set for the client build).

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;
const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// "2026-06-24" → "24 Jun" (no timezone math; the string is already a calendar date).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function prettyDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(d || "");
}

async function dapi(path, init) {
  return fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json", ...(init && init.headers) },
  });
}

async function postToChannel(channelId, content) {
  const r = await dapi(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: String(content).slice(0, 1900), allowed_mentions: { parse: ["users"] } }),
  });
  if (!r.ok) throw new Error(`post ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return r.json();
}

async function openDM(recipientId) {
  const r = await dapi("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: String(recipientId) }) });
  if (!r.ok) throw new Error(`open DM ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return (await r.json()).id;
}

// Pin the new digest, unpinning the bot's OWN prior pins so they don't pile up.
// Handles BOTH Discord pin APIs — the new one (/messages/pins, returns {items})
// and the legacy one (/pins, returns an array) — falling back between them. All
// best-effort; the bot needs the "Manage Messages" permission in the channel.
async function pinDaily(channelId, messageId, botId) {
  try {
    // List existing pins (new shape first, then legacy).
    let pinned = [];
    const rNew = await dapi(`/channels/${channelId}/messages/pins`, { method: "GET" });
    if (rNew.ok) {
      const j = await rNew.json().catch(() => null);
      pinned = j && Array.isArray(j.items) ? j.items.map((it) => it.message).filter(Boolean) : [];
    } else {
      const rOld = await dapi(`/channels/${channelId}/pins`, { method: "GET" });
      pinned = rOld.ok ? await rOld.json().catch(() => []) : [];
    }
    // Remove the bot's previous pins.
    for (const p of pinned) {
      if (p && p.author && p.author.id === botId) {
        const d = await dapi(`/channels/${channelId}/messages/pins/${p.id}`, { method: "DELETE" });
        if (!d.ok) await dapi(`/channels/${channelId}/pins/${p.id}`, { method: "DELETE" }).catch(() => {});
      }
    }
    // Pin the new digest (new endpoint, fall back to legacy).
    const put = await dapi(`/channels/${channelId}/messages/pins/${messageId}`, { method: "PUT" });
    if (!put.ok) await dapi(`/channels/${channelId}/pins/${messageId}`, { method: "PUT" }).catch(() => {});
  } catch { /* best-effort */ }
}

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return r.json();
}

async function sbRpc(fn, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  if (!r.ok) throw new Error(`supabase rpc ${fn} ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return r.json().catch(() => null);
}

// One-shot tidy: delete the BOT'S OWN recent messages in a channel (e.g. the old
// pre-fix spam), so we can repost a single clean digest. Needs Manage Messages.
async function purgeBotMessages(channelId, botId) {
  try {
    const r = await dapi(`/channels/${channelId}/messages?limit=100`, { method: "GET" });
    if (!r.ok) return 0;
    const msgs = await r.json().catch(() => []);
    const now = Date.now();
    const ids = (Array.isArray(msgs) ? msgs : [])
      .filter((m) => m && m.author && m.author.id === botId)
      .filter((m) => now - Date.parse(m.timestamp) < 13 * 24 * 3600 * 1000) // bulk-delete only works <14 days
      .map((m) => m.id);
    if (ids.length === 0) return 0;
    if (ids.length === 1) {
      await dapi(`/channels/${channelId}/messages/${ids[0]}`, { method: "DELETE" }).catch(() => {});
      return 1;
    }
    const d = await dapi(`/channels/${channelId}/messages/bulk-delete`, { method: "POST", body: JSON.stringify({ messages: ids.slice(0, 100) }) });
    if (!d.ok) for (const id of ids) await dapi(`/channels/${channelId}/messages/${id}`, { method: "DELETE" }).catch(() => {});
    return ids.length;
  } catch { return 0; }
}

export default async function handler(req, res) {
  if (CRON_SECRET) {
    const ok = req.headers.authorization === `Bearer ${CRON_SECRET}` || req.headers["x-cron-secret"] === CRON_SECRET;
    if (!ok) return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  // ?clean=1 → tidy each channel (delete the bot's old messages) before reposting.
  const clean = Boolean(req.query && (req.query.clean === "1" || req.query.clean === "true"));
  if (!TOKEN || !SB_URL || !SB_KEY) {
    return res.status(200).json({ ok: false, error: "not configured (DISCORD_BOT_TOKEN / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)" });
  }

  const today = new Date().toISOString().slice(0, 10);
  try {
    const botId = await dapi("/users/@me", { method: "GET" }).then((r) => r.json()).then((u) => u && u.id).catch(() => null);

    // Materialise any recurring tasks due today FIRST, so they land in this
    // digest even if nobody opened the dashboard yet. Idempotent; best-effort.
    await sbRpc("generate_due_recurring_tasks", {}).catch((e) => console.error("[discord-digest] recurring gen:", e && e.message));

    const [chatters, steps, tasks] = await Promise.all([
      sbGet("chatters?status=eq.active&select=id,name,discord_user_id,discord_channel_id&order=name"),
      sbGet("task_pipeline_steps?status=eq.active&select=assignee_id,step_name,task_pipelines!inner(title,status)&task_pipelines.status=eq.active"),
      sbGet("standalone_tasks?status=eq.open&select=assignee_id,title,due_date"),
    ]);

    const stepsBy = {};
    for (const s of steps) (stepsBy[s.assignee_id] = stepsBy[s.assignee_id] || []).push(s);
    const tasksBy = {};
    for (const t of tasks) (tasksBy[t.assignee_id] = tasksBy[t.assignee_id] || []).push(t);

    let sent = 0, empty = 0, skipped = 0, purged = 0;
    const warnings = [];
    for (const c of chatters) {
      if (!c.discord_channel_id && !c.discord_user_id) { skipped++; continue; }
      // Tidy the channel first when ?clean=1 (delete the bot's old messages).
      if (clean && c.discord_channel_id && botId) purged += await purgeBotMessages(c.discord_channel_id, botId);
      const ms = stepsBy[c.id] || [];
      const mt = tasksBy[c.id] || [];
      if (ms.length + mt.length === 0) { empty++; continue; }

      const dateLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      const total = ms.length + mt.length;
      let msg = `## 🗓️ Your tasks — ${dateLabel}\n`;
      if (c.discord_user_id) msg += `<@${c.discord_user_id}>\n`;
      if (ms.length) {
        msg += `\n### 🔁 Pipelines waiting on you (${ms.length})\n` +
          ms.map((s) => `- **${(s.task_pipelines && s.task_pipelines.title) || "Pipeline"}** · ${s.step_name}`).join("\n") + "\n";
      }
      if (mt.length) {
        msg += `\n### 📋 To-do (${mt.length})\n` +
          mt.map((t) => `- ${t.title}${t.due_date ? ` · _due ${prettyDate(t.due_date)}_` : ""}`).join("\n") + "\n";
      }
      msg += `\n-# ${total} task${total === 1 ? "" : "s"} today · tick them off in the dashboard → Tasks 💪`;

      try {
        if (c.discord_channel_id) {
          const posted = await postToChannel(c.discord_channel_id, msg);
          if (botId && posted && posted.id) await pinDaily(c.discord_channel_id, posted.id, botId);
        } else {
          const dmId = await openDM(c.discord_user_id);
          await postToChannel(dmId, msg);
        }
        sent++;
      } catch (e) {
        warnings.push(`${c.name}: ${String((e && e.message) || e)}`);
      }
    }

    return res.status(200).json({ ok: true, day: today, clean, purged, sent, empty, skipped, warnings });
  } catch (e) {
    console.error("[discord-digest]", e && e.message);
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
