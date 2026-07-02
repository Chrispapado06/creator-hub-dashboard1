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

// "2026-06-28" shifted by N days → "YYYY-MM-DD" (UTC-safe, no timezone drift).
function shiftDate(dateStr, deltaDays) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
function mondayOf(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // 0=Sun..6=Sat → days since Monday
  return d.toISOString().slice(0, 10);
}
function isMonday(dateStr) { return new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`).getUTCDay() === 1; }
function daysBetween(a, b) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000); }

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

async function sbWrite(method, path, body) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method,
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch { return false; }
}

// One-shot tidy: delete the BOT'S OWN recent messages in a channel (e.g. the old
// pre-fix spam), so we can repost a single clean digest. Needs Manage Messages.
async function purgeBotMessages(channelId, botId) {
  let total = 0;
  try {
    // Loop so channels with >100 of the bot's messages get fully cleared.
    for (let pass = 0; pass < 6; pass++) {
      const r = await dapi(`/channels/${channelId}/messages?limit=100`, { method: "GET" });
      if (!r.ok) break;
      const msgs = await r.json().catch(() => []);
      const now = Date.now();
      const ids = (Array.isArray(msgs) ? msgs : [])
        .filter((m) => m && m.author && m.author.id === botId)
        .filter((m) => now - Date.parse(m.timestamp) < 13 * 24 * 3600 * 1000) // bulk-delete only works <14 days
        .map((m) => m.id);
      if (ids.length === 0) break;
      if (ids.length === 1) {
        await dapi(`/channels/${channelId}/messages/${ids[0]}`, { method: "DELETE" }).catch(() => {});
        total += 1;
        break;
      }
      const d = await dapi(`/channels/${channelId}/messages/bulk-delete`, { method: "POST", body: JSON.stringify({ messages: ids.slice(0, 100) }) });
      if (!d.ok) for (const id of ids) await dapi(`/channels/${channelId}/messages/${id}`, { method: "DELETE" }).catch(() => {});
      total += ids.length;
      if (ids.length < 100) break; // fewer than a full page → nothing more to fetch
    }
  } catch { /* best-effort */ }
  return total;
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

    // Tidy mode: purge the bot's old messages in EVERY configured channel — every
    // chatter with a channel, ANY status, even people with no current tasks — so
    // nobody (e.g. Luca) gets missed.
    let purged = 0;
    const purgeDetail = [];
    if (clean && botId) {
      const withChan = await sbGet("chatters?discord_channel_id=not.is.null&select=name,discord_channel_id").catch(() => []);
      const seen = new Set();
      for (const c of (withChan || [])) {
        const ch = c.discord_channel_id;
        if (!ch || seen.has(ch)) continue;
        seen.add(ch);
        const n = await purgeBotMessages(ch, botId);
        purged += n;
        purgeDetail.push({ name: c.name, channel: ch, purged: n });
      }
    }

    // Reminders: "⏰ Coming up" heads-ups whose reminder day (due/next_run minus
    // remind_days) is today. Wrapped so a pre-migration DB (no remind_days
    // column) just yields no reminders instead of erroring.
    const remindersBy = {};
    try {
      const [recurs, remTasks] = await Promise.all([
        sbGet("recurring_tasks?active=eq.true&remind_days=not.is.null&select=title,assignee_id,next_run,remind_days"),
        sbGet("standalone_tasks?status=eq.open&remind_days=not.is.null&due_date=not.is.null&select=title,assignee_id,due_date,remind_days"),
      ]);
      for (const r of (recurs || [])) {
        if (r.remind_days == null || !r.next_run) continue;
        if (shiftDate(r.next_run, -r.remind_days) === today) (remindersBy[r.assignee_id] = remindersBy[r.assignee_id] || []).push(`${r.title} — due ${prettyDate(r.next_run)}`);
      }
      for (const t of (remTasks || [])) {
        if (t.remind_days == null || !t.due_date) continue;
        if (shiftDate(t.due_date, -t.remind_days) === today) (remindersBy[t.assignee_id] = remindersBy[t.assignee_id] || []).push(`${t.title} — due ${prettyDate(t.due_date)}`);
      }
    } catch (e) { console.error("[discord-digest] reminders:", e && e.message); }

    // Content tracker nudges (state-driven): Gly bumps 'requested' (re-nudged
    // every 4 days), Finlay+Luca QC 'received', Luca pays last week's
    // uploaded-but-unpaid on Mondays. Wrapped: a pre-migration DB yields nothing.
    const CONTENT_CREATORS = ["Rosario", "Antonella", "Nicole"];
    const contentBy = {};
    try {
      const findId = (needle) => (chatters.find((c) => (c.name || "").toLowerCase().includes(needle)) || {}).id;
      const glyId = findId("gly"), lucaId = findId("luca"), finId = findId("finlay");
      const push = (id, text) => { if (id) (contentBy[id] = contentBy[id] || []).push(text); };
      const weekStart = mondayOf(today);
      let rows = await sbGet(`content_tracker?week_start=eq.${weekStart}&select=creator,stage,pay_status,last_bumped`);
      // Seed this week's default creators if missing, so bumps fire from Monday.
      const have = new Set((rows || []).map((r) => r.creator));
      const seed = CONTENT_CREATORS.filter((c) => !have.has(c));
      if (seed.length) {
        await sbWrite("POST", "content_tracker", seed.map((c) => ({ creator: c, week_start: weekStart })));
        rows = await sbGet(`content_tracker?week_start=eq.${weekStart}&select=creator,stage,pay_status,last_bumped`);
      }
      for (const r of (rows || [])) {
        if (r.stage === "requested" && glyId && (!r.last_bumped || daysBetween(r.last_bumped, today) >= 4)) {
          push(glyId, `Bump **${r.creator}** — content not in yet`);
          await sbWrite("PATCH", `content_tracker?creator=eq.${encodeURIComponent(r.creator)}&week_start=eq.${weekStart}`, { last_bumped: today });
        }
        if (r.stage === "received") { push(finId, `Quality-check **${r.creator}**'s content`); push(lucaId, `Quality-check **${r.creator}**'s content`); }
      }
      if (isMonday(today)) {
        const lastWeek = shiftDate(weekStart, -7);
        const payRows = await sbGet(`content_tracker?week_start=eq.${lastWeek}&stage=eq.uploaded&pay_status=eq.unpaid&select=creator`);
        for (const r of (payRows || [])) push(lucaId, `💸 Pay **${r.creator}** for last week`);
      }
    } catch (e) { console.error("[discord-digest] content:", e && e.message); }

    let sent = 0, empty = 0, skipped = 0;
    const warnings = [];
    for (const c of chatters) {
      if (!c.discord_channel_id && !c.discord_user_id) { skipped++; continue; }
      const ms = stepsBy[c.id] || [];
      const mt = tasksBy[c.id] || [];
      const mr = remindersBy[c.id] || [];
      const mc = contentBy[c.id] || [];
      if (ms.length + mt.length + mr.length + mc.length === 0) { empty++; continue; }

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
      if (mc.length) {
        msg += `\n### 🎬 Content\n` +
          mc.map((x) => `- ${x}`).join("\n") + "\n";
      }
      if (mr.length) {
        msg += `\n### ⏰ Coming up\n` +
          mr.map((x) => `- ${x}`).join("\n") + "\n";
      }
      msg += total > 0
        ? `\n-# ${total} task${total === 1 ? "" : "s"} today · tick them off in the dashboard → Tasks 💪`
        : `\n-# Nothing due today · heads-up above 👀`;

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

    return res.status(200).json({ ok: true, day: today, clean, purged, purgeDetail, sent, empty, skipped, warnings });
  } catch (e) {
    console.error("[discord-digest]", e && e.message);
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
