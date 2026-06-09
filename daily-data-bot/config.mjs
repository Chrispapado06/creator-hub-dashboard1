// UNCVRD Daily Data Bot — shared config & helpers.
//
// Zero external deps: Telegram and Supabase are both hit over plain
// fetch, matching the rest of the bots in this repo.
//
// Required env (GitHub Actions secrets / local .env):
//   TELEGRAM_BOT_TOKEN          — the bot's token from @BotFather
//   TELEGRAM_RECIPIENT_CHAT_ID  — chat id of THE ONE PERSON the digest
//                                 goes to (their DM with the bot). Use the
//                                 bot's /id command to find it.
//   SUPABASE_URL                — https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   — service-role key (bypasses RLS for writes)
// Optional:
//   REPORT_TZ                   — IANA tz for the working day (default Europe/London)

export const REPORT_TZ = process.env.REPORT_TZ || "Europe/London";

// ── The guided Q&A ───────────────────────────────────────────────────
// Edit this array to add/remove/reorder questions — the whole flow,
// storage, and digest are driven from it. Every question is yes/no:
// the VA taps a Yes/No button (or types yes/no). `label` is how it
// shows up in the end-of-day digest.
export const FIELDS = [
  { key: "dms_sent",       label: "DMs sent",         prompt: "Have you sent the DMs?" },
  { key: "needed_post",    label: "Needed to post",   prompt: "Did you need to post today?" },
  { key: "posted_stories", label: "Posted stories",   prompt: "Have you posted stories?" },
  { key: "commented",      label: "Commented",        prompt: "Have you commented under posts?" },
  { key: "liked",          label: "Liked posts",      prompt: "Have you liked posts?" },
  { key: "completed",      label: "Fully completed",  prompt: "Are you fully completed for today?" },
];

// Words accepted as yes / no when a VA types instead of tapping.
const YES_WORDS = new Set(["yes", "y", "yeah", "yep", "yh", "ye", "done", "did", "true", "1", "ok", "okay", "completed", "complete", "✅", "👍"]);
const NO_WORDS  = new Set(["no", "n", "nope", "nah", "not", "notyet", "false", "0", "didnt", "didn't", "havent", "haven't", "❌", "👎"]);

// Parse a yes/no answer → true | false | null (null = unrecognised).
export function parseYesNo(text) {
  const t = String(text || "").trim().toLowerCase().replace(/\s+/g, "");
  if (YES_WORDS.has(t)) return true;
  if (NO_WORDS.has(t)) return false;
  return null;
}

export const escHtml = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

// ── Timezone helpers (working day = REPORT_TZ calendar day) ──────────
function partsInTz(date, timeZone = REPORT_TZ) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    weekday: "short", hour12: false,
  }).formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return {
    year: parseInt(g("year"), 10),
    month: parseInt(g("month"), 10),
    day: parseInt(g("day"), 10),
    hour: parseInt(g("hour"), 10) % 24,
    minute: parseInt(g("minute"), 10),
    weekday: g("weekday"),
  };
}

// "YYYY-MM-DD" for the working day `date` falls on, in REPORT_TZ.
export function reportDate(date = new Date()) {
  const p = partsInTz(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// Pretty "Mon, 09 Jun 2026" in REPORT_TZ.
export function fmtDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: REPORT_TZ, weekday: "short", day: "2-digit", month: "short", year: "numeric",
  }).format(date);
}

// ── Telegram ─────────────────────────────────────────────────────────
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function tgCall(method, params = {}) {
  if (!TG_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN missing");
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) {
    console.warn(`Telegram ${method} → HTTP ${r.status}:`, JSON.stringify(j));
    return null;
  }
  return j;
}

export async function tgSend(chatId, html, replyMarkup) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

// Tap-friendly Yes / No buttons under a question.
export const YES_NO_KEYBOARD = {
  keyboard: [[{ text: "Yes" }, { text: "No" }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};
// Clears the Yes/No buttons once the report is done.
export const REMOVE_KEYBOARD = { remove_keyboard: true };

// Friendly display name for a Telegram user.
export function userName(from) {
  if (!from) return "someone";
  if (from.username) return `@${from.username}`;
  return [from.first_name, from.last_name].filter(Boolean).join(" ") || `user ${from.id}`;
}

// ── Supabase (PostgREST over fetch, service-role key) ────────────────
const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sbHeaders(extra = {}) {
  if (!SB_URL || !SB_KEY) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// GET with a raw PostgREST query string, e.g.
//   sbGet("daily_outreach_entries", "report_date=eq.2026-06-09&order=created_at.asc")
export async function sbGet(table, query = "") {
  const url = `${SB_URL}/rest/v1/${table}${query ? `?${query}` : ""}`;
  const r = await fetch(url, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase GET ${table} → ${r.status} ${await r.text()}`);
  return r.json();
}

// Insert (or upsert on `onConflict`) one or more rows.
export async function sbInsert(table, rows, { onConflict } = {}) {
  const q = onConflict ? `${table}?on_conflict=${onConflict}` : table;
  const prefer = ["return=representation"];
  if (onConflict) prefer.push("resolution=merge-duplicates");
  const r = await fetch(`${SB_URL}/rest/v1/${q}`, {
    method: "POST",
    headers: sbHeaders({ Prefer: prefer.join(",") }),
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Supabase INSERT ${table} → ${r.status} ${await r.text()}`);
  return r.json();
}

export async function sbDelete(table, query) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: sbHeaders({ Prefer: "return=minimal" }),
  });
  if (!r.ok) throw new Error(`Supabase DELETE ${table} → ${r.status} ${await r.text()}`);
}
