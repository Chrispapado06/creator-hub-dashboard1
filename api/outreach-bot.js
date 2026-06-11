// Telegram webhook for the UNCVRD daily-outreach checklist bot.
//
// Telegram POSTs every message here the instant it's sent — no polling,
// always on, runs on Vercel. The end-of-day digest stays as a GitHub
// Actions cron (daily-data-bot/digest.mjs); this file is only the
// "collect" half (what bot.mjs did, but webhook-style).
//
// Vercel env vars required (Project → Settings → Environment Variables):
//   OUTREACH_BOT_TOKEN        — the bot's Telegram token
//   OUTREACH_SUPABASE_URL     — https://xxxx.supabase.co
//   OUTREACH_SUPABASE_KEY     — Supabase key (publishable or service_role)
//   OUTREACH_WEBHOOK_SECRET   — shared secret; must match setWebhook's
//                               secret_token (verifies requests are Telegram)
//
// Self-contained on purpose (no cross-dir imports) so Vercel bundling
// can never break it. The questions/labels mirror daily-data-bot/config.mjs.

const TOKEN  = process.env.OUTREACH_BOT_TOKEN;
const SB_URL = (process.env.OUTREACH_SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.OUTREACH_SUPABASE_KEY;
const SECRET = process.env.OUTREACH_WEBHOOK_SECRET;
const REPORT_TZ = process.env.REPORT_TZ || "Europe/London";

// ── The checklist (keep in sync with daily-data-bot/config.mjs) ──────
const FIELDS = [
  { key: "dms_sent",       label: "DMs sent",        prompt: "Have you sent the DMs?" },
  { key: "needed_post",    label: "Needed to post",  prompt: "Did you need to post today?" },
  { key: "posted_stories", label: "Posted stories",  prompt: "Have you posted stories?" },
  { key: "commented",      label: "Commented",       prompt: "Have you commented under posts?" },
  { key: "liked",          label: "Liked posts",     prompt: "Have you liked posts?" },
  { key: "completed",      label: "Fully completed", prompt: "Are you fully completed for today?" },
];

const YES_WORDS = new Set(["yes", "y", "yeah", "yep", "yh", "ye", "done", "did", "true", "1", "ok", "okay", "completed", "complete", "✅", "👍"]);
const NO_WORDS  = new Set(["no", "n", "nope", "nah", "not", "notyet", "false", "0", "didnt", "didn't", "havent", "haven't", "❌", "👎"]);
function parseYesNo(text) {
  const t = String(text || "").trim().toLowerCase().replace(/\s+/g, "");
  if (YES_WORDS.has(t)) return true;
  if (NO_WORDS.has(t)) return false;
  return null;
}

const escHtml = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

function partsInTz(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour12: false,
  }).formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return { year: g("year"), month: g("month"), day: g("day") };
}
function reportDate(date = new Date()) {
  const p = partsInTz(date);
  return `${p.year}-${p.month}-${p.day}`;
}
function fmtDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: REPORT_TZ, weekday: "short", day: "2-digit", month: "short", year: "numeric",
  }).format(date);
}

const YES_NO_KEYBOARD = { keyboard: [[{ text: "Yes" }, { text: "No" }]], resize_keyboard: true, one_time_keyboard: true };
const REMOVE_KEYBOARD = { remove_keyboard: true };

// ── Telegram ─────────────────────────────────────────────────────────
async function tgCall(method, params) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!r.ok) console.warn(`Telegram ${method} → ${r.status}`, await r.text().catch(() => ""));
  return r.json().catch(() => null);
}
function tgSend(chatId, html, replyMarkup) {
  return tgCall("sendMessage", {
    chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}
function userName(from) {
  if (!from) return "someone";
  if (from.username) return `@${from.username}`;
  return [from.first_name, from.last_name].filter(Boolean).join(" ") || `user ${from.id}`;
}

// ── Supabase (PostgREST over fetch) ──────────────────────────────────
function sbHeaders(extra = {}) {
  return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...extra };
}
async function sbGet(table, query = "") {
  const r = await fetch(`${SB_URL}/rest/v1/${table}${query ? `?${query}` : ""}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase GET ${table} → ${r.status} ${await r.text()}`);
  return r.json();
}
async function sbInsert(table, rows, onConflict) {
  const q = onConflict ? `${table}?on_conflict=${onConflict}` : table;
  const prefer = ["return=representation"];
  if (onConflict) prefer.push("resolution=merge-duplicates");
  const r = await fetch(`${SB_URL}/rest/v1/${q}`, {
    method: "POST", headers: sbHeaders({ Prefer: prefer.join(",") }), body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Supabase INSERT ${table} → ${r.status} ${await r.text()}`);
  return r.json();
}
async function sbDelete(table, query) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE", headers: sbHeaders({ Prefer: "return=minimal" }),
  });
  if (!r.ok) throw new Error(`Supabase DELETE ${table} → ${r.status} ${await r.text()}`);
}

async function getSession(userId) {
  const rows = await sbGet("daily_outreach_sessions", `tg_user_id=eq.${userId}&limit=1`);
  return rows?.[0] || null;
}
function saveSession(s) {
  return sbInsert("daily_outreach_sessions", [{ ...s, updated_at: new Date().toISOString() }], "tg_user_id");
}
function clearSession(userId) {
  return sbDelete("daily_outreach_sessions", `tg_user_id=eq.${userId}`);
}

// ── Copy ─────────────────────────────────────────────────────────────
const HELP =
  "👋 <b>Daily checklist</b>\n\n" +
  "Send /report at the end of your shift and tap <b>Yes</b> or <b>No</b> for each " +
  "question (DMs, posting, stories, comments, likes, completed). Your answers go " +
  "into the end-of-day summary.\n\n" +
  "Commands:\n" +
  "• /report — fill in today's checklist\n" +
  "• /cancel — abandon a checklist you're filling in\n" +
  "• /id — show this chat's id (for setup)\n" +
  "• /help — show this message";

function summarise(draft) {
  const lines = FIELDS.map((f) => `${draft[f.key] ? "✅" : "❌"} ${escHtml(f.label)}`);
  return `✅ <b>Logged for ${escHtml(fmtDate())}</b>\n\n${lines.join("\n")}\n\nThanks! Send /report again if anything changes.`;
}

// ── Handle one message ───────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;
  const userId = from.id;
  const text = (msg.text || "").trim();
  const cmd = /^\/(\w+)/.exec(text)?.[1]?.toLowerCase();

  if (cmd === "id") {
    await tgSend(chatId, `Chat id: <code>${chatId}</code>\nYour user id: <code>${userId}</code>`);
    return;
  }
  if (cmd === "help" || cmd === "start") { await tgSend(chatId, HELP); return; }
  if (cmd === "cancel") {
    await clearSession(userId);
    await tgSend(chatId, "🚫 Report cancelled. Send /report to start again.", REMOVE_KEYBOARD);
    return;
  }
  if (cmd === "report") {
    await saveSession({ tg_user_id: userId, chat_id: chatId, va_name: userName(from), step: 0, draft: {} });
    await tgSend(chatId, `📋 <b>Daily checklist — ${escHtml(fmtDate())}</b>\n\n${FIELDS[0].prompt}`, YES_NO_KEYBOARD);
    return;
  }

  const session = await getSession(userId);
  if (!session) {
    if (cmd) await tgSend(chatId, "Send /report to log your checklist, or /help.");
    return;
  }
  const field = FIELDS[session.step];
  if (!field) { await clearSession(userId); return; }

  const value = parseYesNo(text);
  if (value === null) {
    await tgSend(chatId, `Please tap <b>Yes</b> or <b>No</b>.\n\n${field.prompt}`, YES_NO_KEYBOARD);
    return;
  }

  const draft = { ...session.draft, [field.key]: value };
  const nextStep = session.step + 1;
  if (nextStep < FIELDS.length) {
    await saveSession({ ...session, step: nextStep, draft });
    await tgSend(chatId, FIELDS[nextStep].prompt, YES_NO_KEYBOARD);
    return;
  }

  await sbInsert("daily_outreach_entries", [{
    report_date: reportDate(),
    tg_user_id: userId,
    va_name: session.va_name,
    dms_sent:       !!draft.dms_sent,
    needed_post:    !!draft.needed_post,
    posted_stories: !!draft.posted_stories,
    commented:      !!draft.commented,
    liked:          !!draft.liked,
    completed:      !!draft.completed,
  }]);
  await clearSession(userId);
  await tgSend(chatId, summarise(draft), REMOVE_KEYBOARD);
}

// ── Vercel handler ───────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    // Health check — booleans only, never leaks secret values.
    return res.status(200).json({
      up: true,
      env: { token: !!TOKEN, supabase: !!SB_URL && !!SB_KEY, secret: !!SECRET },
    });
  }

  // Verify the request really is from Telegram.
  if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) {
    return res.status(401).send("bad secret");
  }
  if (!TOKEN || !SB_URL || !SB_KEY) {
    console.error("Missing env: OUTREACH_BOT_TOKEN / OUTREACH_SUPABASE_URL / OUTREACH_SUPABASE_KEY");
    return res.status(200).send("ok"); // 200 so Telegram doesn't retry-storm
  }

  try {
    const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const msg = update?.message ?? update?.edited_message;
    if (msg && msg.text) {
      console.log(`← ${userName(msg.from)} (chat ${msg.chat.id}): ${msg.text}`);
      await handleMessage(msg);
    }
  } catch (e) {
    console.error("webhook error:", e?.message || e);
  }
  return res.status(200).send("ok"); // always ack
}
