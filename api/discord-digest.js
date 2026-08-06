// Daily per-person task digest, posted by the Discord bot — and kept LIVE.
//
// Each morning (Vercel cron) the bot posts every active member's tasks for the
// day — pipeline steps waiting on them + open one-off tasks — into THEIR channel
// (and @-mentions them, and pins it, replacing yesterday's pin). People with no
// channel set get a DM via discord_user_id; people with nothing on their plate
// are skipped. The message id is stored in discord_digest_posts.
//
// TWO MODES:
//   • broadcast (GET, cron)              — post today's digest to everyone
//   • refresh   (POST {mode:"refresh"})  — re-render today's already-posted
//     digests from live DB state and EDIT them in place, so a task ticked off in
//     the dashboard disappears from Discord within a second. The dashboard calls
//     this after every task mutation (src/lib/tasks.ts → refreshDigests).
//
// Broadcast is secured by CRON_SECRET: Vercel sends
// `Authorization: Bearer <CRON_SECRET>` (manual test: same value as the
// `x-cron-secret` header). Refresh is deliberately NOT behind that secret — the
// browser can't hold it — and doesn't need to be: it accepts no content and no
// target, it can only re-render messages the bot itself posted today, from the
// database's own state.
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

// Edit an already-posted digest. allowed_mentions is emptied so the edit can
// never re-ping anyone — the <@id> line still RENDERS as a mention, Discord just
// doesn't notify again. Returns "gone" when the message no longer exists (someone
// deleted it), so the caller can forget it instead of retrying forever.
async function editMessage(channelId, messageId, content) {
  const r = await dapi(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ content: String(content).slice(0, 1900), allowed_mentions: { parse: [] } }),
  });
  if (r.ok) return "ok";
  if (r.status === 404 || r.status === 403) return "gone";
  throw new Error(`edit ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
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

async function sbWrite(method, path, body, prefer) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method,
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: prefer || "return=minimal" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return r.ok;
  } catch { return false; }
}

// The two task reads, shared verbatim by the morning post and every refresh.
// Explicitly ORDERED: without it PostgREST returns rows in physical order, which
// can shuffle between calls and make a refresh rewrite a list that didn't change.
const STEPS_QUERY = "task_pipeline_steps?status=eq.active&select=assignee_id,step_name,created_at,task_pipelines!inner(title,status)&task_pipelines.status=eq.active&order=created_at.asc";
const TASKS_QUERY = "standalone_tasks?status=eq.open&select=assignee_id,title,due_date,created_at&order=created_at.asc";

// ── The digest text ──────────────────────────────────────────────────────────
// The ONE place the message is built, so a live-edited digest is byte-identical
// to a freshly posted one minus the lines that got ticked off.
//
// `extra` replays the sections that aren't derived from open tasks — 🎬 Content
// and ⏰ Coming up — exactly as the morning post rendered them.
function buildDigest({ dateLabel, discordUserId, steps, tasks, extra }) {
  const content = Array.isArray(extra && extra.content) ? extra.content : [];
  const reminders = Array.isArray(extra && extra.reminders) ? extra.reminders : [];
  const total = steps.length + tasks.length;

  let msg = `## 🗓️ Your tasks — ${dateLabel}\n`;
  if (discordUserId) msg += `<@${discordUserId}>\n`;
  if (steps.length) {
    msg += `\n### 🔁 Pipelines waiting on you (${steps.length})\n` +
      steps.map((s) => `- **${(s.task_pipelines && s.task_pipelines.title) || "Pipeline"}** · ${s.step_name}`).join("\n") + "\n";
  }
  if (tasks.length) {
    msg += `\n### 📋 To-do (${tasks.length})\n` +
      tasks.map((t) => `- ${t.title}${t.due_date ? ` · _due ${prettyDate(t.due_date)}_` : ""}`).join("\n") + "\n";
  }
  if (content.length) {
    msg += `\n### 🎬 Content\n` + content.map((x) => `- ${x}`).join("\n") + "\n";
  }
  if (reminders.length) {
    msg += `\n### ⏰ Coming up\n` + reminders.map((x) => `- ${x}`).join("\n") + "\n";
  }

  if (total > 0) msg += `\n-# ${total} task${total === 1 ? "" : "s"} today · tick them off in the dashboard → Tasks 💪`;
  else if (content.length + reminders.length > 0) msg += `\n-# Nothing due today · heads-up above 👀`;
  else msg += `\n-# ✅ All ticked off — nothing left on your list today. Nice one 🎉`;
  return msg;
}

// "Thursday 6 August" for a "YYYY-MM-DD" string (matches the morning post's
// en-GB label; used only as a fallback when a stored digest predates `extra`).
function dayLabel(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? String(dateStr)
    : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

// Read the 🎬/⏰ sections (and the date label) back OUT of a digest we didn't
// post ourselves — the inverse of buildDigest, used when adopting an existing
// message. Those sections can't be recomputed on demand (their source logic has
// side effects), so we recover them from the text and replay them.
function parseDigest(text) {
  const lines = String(text || "").split("\n");
  const m = /^##\s*🗓️\s*Your tasks\s*—\s*(.+)$/.exec((lines[0] || "").trim());
  const grab = (heading) => {
    const i = lines.findIndex((l) => l.trim().startsWith(heading));
    if (i < 0) return [];
    const out = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].startsWith("###") || lines[j].startsWith("-#")) break; // next section / footer
      if (lines[j].startsWith("- ")) out.push(lines[j].slice(2));
    }
    return out;
  };
  return { dateLabel: m ? m[1].trim() : "", content: grab("### 🎬 Content"), reminders: grab("### ⏰ Coming up") };
}

const DIGEST_HEADER = "## 🗓️ Your tasks —";

// Adopt today's digest for someone we have no stored id for — it was posted
// before this feature existed, or the bot restarted. Scans the tail of their
// channel for the bot's own digest from today, recovers its sections, and takes
// ownership so it becomes live-editable from now on. Returns null if there
// isn't one.
async function adoptDigest(channelId, botId, today) {
  const r = await dapi(`/channels/${channelId}/messages?limit=20`, { method: "GET" });
  if (!r.ok) return null;
  const msgs = await r.json().catch(() => []);
  const found = (Array.isArray(msgs) ? msgs : []).find(
    (m) => m && m.author && m.author.id === botId &&
      String(m.content || "").startsWith(DIGEST_HEADER) &&
      String(m.timestamp || "").slice(0, 10) === today,
  );
  if (!found) return null;
  return { message_id: found.id, content: found.content, extra: parseDigest(found.content) };
}

// Remember a digest as the live one for its day. Upsert, not update: an adopted
// digest has no row yet.
function storePost(p, extra, content) {
  return sbWrite(
    "POST",
    "discord_digest_posts",
    { chatter_id: p.chatter_id, day: p.day, channel_id: p.channel_id, message_id: p.message_id, extra, content },
    "resolution=merge-duplicates,return=minimal",
  );
}

// ── Live refresh ─────────────────────────────────────────────────────────────
// Re-render every digest posted TODAY from current DB state and edit the ones
// whose text actually changed. Idempotent and cheap: a refresh that changes
// nothing makes zero Discord calls, so the dashboard can fire it after any task
// mutation without thinking about rate limits.
async function refreshToday(today) {
  // Today's digests — falling back to yesterday's while they're still the newest
  // post (the cron runs at 08:00 UTC, so between midnight and then the pinned
  // message is still yesterday's and should stay accurate).
  const recent = await sbGet(
    `discord_digest_posts?day=gte.${shiftDate(today, -1)}&select=chatter_id,day,channel_id,message_id,extra,content&order=day.desc`,
  );
  const newestDay = recent.length ? recent[0].day : today;
  const posts = recent.filter((p) => p.day === newestDay);

  const [chatters, steps, tasks] = await Promise.all([
    sbGet("chatters?status=eq.active&select=id,name,discord_user_id,discord_channel_id"),
    sbGet(STEPS_QUERY),
    sbGet(TASKS_QUERY),
  ]);
  const byId = {};
  for (const c of chatters) byId[c.id] = c;
  const stepsBy = {};
  for (const s of steps) (stepsBy[s.assignee_id] = stepsBy[s.assignee_id] || []).push(s);
  const tasksBy = {};
  for (const t of tasks) (tasksBy[t.assignee_id] = tasksBy[t.assignee_id] || []).push(t);

  // Adoption pass — only for people whose digest we don't already track AND who
  // have something on their list (no point scanning an empty channel).
  let adopted = 0;
  const tracked = new Set(posts.map((p) => p.chatter_id));
  const candidates = chatters.filter(
    (c) => c.discord_channel_id && !tracked.has(c.id) &&
      ((stepsBy[c.id] || []).length + (tasksBy[c.id] || []).length) > 0,
  );
  if (candidates.length) {
    const botId = await dapi("/users/@me", { method: "GET" }).then((r) => r.json()).then((u) => u && u.id).catch(() => null);
    // In parallel — one channel read each, and a refresh shouldn't get slower
    // the more people are on the team.
    const found = await Promise.all((botId ? candidates : []).map((c) =>
      adoptDigest(c.discord_channel_id, botId, today)
        .then((f) => (f ? { chatter_id: c.id, day: today, channel_id: c.discord_channel_id, adopted: true, ...f } : null))
        .catch(() => null)));
    for (const f of found.filter(Boolean)) { posts.push(f); adopted++; }
  }
  if (!posts.length) return { checked: 0, adopted, edited: 0, gone: 0, warnings: [] };

  let edited = 0, gone = 0;
  const warnings = [];
  for (const p of posts) {
    const extra = p.extra && typeof p.extra === "object" ? p.extra : {};
    const msg = buildDigest({
      dateLabel: extra.dateLabel || dayLabel(p.day),
      discordUserId: (byId[p.chatter_id] || {}).discord_user_id,
      steps: stepsBy[p.chatter_id] || [],
      tasks: tasksBy[p.chatter_id] || [],
      extra,
    });
    // Nothing changed for this person — but if we only just adopted their
    // digest, still record it, or we'd rescan their channel on every refresh.
    if (msg === p.content) {
      if (p.adopted) await storePost(p, extra, msg);
      continue;
    }

    try {
      const result = await editMessage(p.channel_id, p.message_id, msg);
      if (result === "gone") {
        await sbWrite("DELETE", `discord_digest_posts?chatter_id=eq.${p.chatter_id}&day=eq.${p.day}`);
        gone++;
        continue;
      }
      await storePost(p, extra, msg);
      edited++;
    } catch (e) {
      warnings.push(`${(byId[p.chatter_id] || {}).name || p.chatter_id}: ${String((e && e.message) || e)}`);
    }
  }
  return { checked: posts.length, adopted, edited, gone, warnings };
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
  const today = new Date().toISOString().slice(0, 10);

  // Vercel parses JSON bodies automatically; fall back to a manual parse.
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  // ── Refresh mode (no cron secret — see the header comment) ────────────────
  if (req.method === "POST" && body && body.mode === "refresh") {
    if (!TOKEN || !SB_URL || !SB_KEY) return res.status(200).json({ ok: false, error: "not configured" });
    try {
      const out = await refreshToday(today);
      return res.status(200).json({ ok: true, mode: "refresh", day: today, ...out });
    } catch (e) {
      console.error("[discord-digest] refresh:", e && e.message);
      return res.status(200).json({ ok: false, mode: "refresh", error: String((e && e.message) || e) });
    }
  }

  // ── Broadcast mode (the morning cron) ─────────────────────────────────────
  if (CRON_SECRET) {
    const ok = req.headers.authorization === `Bearer ${CRON_SECRET}` || req.headers["x-cron-secret"] === CRON_SECRET;
    if (!ok) return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  // ?clean=1 → tidy each channel (delete the bot's old messages) before reposting.
  const clean = Boolean(req.query && (req.query.clean === "1" || req.query.clean === "true"));
  if (!TOKEN || !SB_URL || !SB_KEY) {
    return res.status(200).json({ ok: false, error: "not configured (DISCORD_BOT_TOKEN / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)" });
  }

  try {
    const botId = await dapi("/users/@me", { method: "GET" }).then((r) => r.json()).then((u) => u && u.id).catch(() => null);

    // Materialise any recurring tasks due today FIRST, so they land in this
    // digest even if nobody opened the dashboard yet. Idempotent; best-effort.
    await sbRpc("generate_due_recurring_tasks", {}).catch((e) => console.error("[discord-digest] recurring gen:", e && e.message));

    const [chatters, steps, tasks] = await Promise.all([
      sbGet("chatters?status=eq.active&select=id,name,discord_user_id,discord_channel_id&order=name"),
      sbGet(STEPS_QUERY),
      sbGet(TASKS_QUERY),
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
      const extra = { dateLabel, content: mc, reminders: mr };
      const msg = buildDigest({ dateLabel, discordUserId: c.discord_user_id, steps: ms, tasks: mt, extra });

      try {
        let channelId = c.discord_channel_id;
        let posted;
        if (channelId) {
          posted = await postToChannel(channelId, msg);
          if (botId && posted && posted.id) await pinDaily(channelId, posted.id, botId);
        } else {
          channelId = await openDM(c.discord_user_id);
          posted = await postToChannel(channelId, msg);
        }
        // Remember which message is today's digest so completions can edit it
        // live (refresh mode). `extra` is replayed on every edit so the 🎬/⏰
        // sections survive without re-running their side-effectful queries.
        if (posted && posted.id) {
          await sbWrite(
            "POST",
            "discord_digest_posts",
            { chatter_id: c.id, day: today, channel_id: channelId, message_id: posted.id, extra, content: msg },
            "resolution=merge-duplicates,return=minimal",
          );
        }
        sent++;
      } catch (e) {
        warnings.push(`${c.name}: ${String((e && e.message) || e)}`);
      }
    }

    // Forget digests older than a week — they can't be refreshed any more.
    await sbWrite("DELETE", `discord_digest_posts?day=lt.${shiftDate(today, -7)}`);

    return res.status(200).json({ ok: true, day: today, clean, purged, purgeDetail, sent, empty, skipped, warnings });
  } catch (e) {
    console.error("[discord-digest]", e && e.message);
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
