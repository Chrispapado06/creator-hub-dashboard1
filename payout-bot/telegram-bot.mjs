#!/usr/bin/env node
// Telegram /update command handler.
//
// Polls Telegram getUpdates every 5 minutes (via GitHub Actions cron).
// If someone in the UNCVRD Daily Stats group has typed /update since
// the last poll, the bot fetches today's OF stats (UK midnight up to
// "now") and posts the snapshot back into the group.
//
// State (last processed update_id) persists in telegram-bot-state.json
// so we don't re-respond to the same message twice — committed back
// to the repo by the workflow on every run.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CREATORS, REPORT_TZ, wallTimeToUtc, partsInTz, fmtDateInTz, escHtml, fmtMoney,
  sendTelegramDocument,
} from "./config.mjs";
import { buildDailyStatsPdf } from "./pdf-report.mjs";

const TG_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT   = process.env.TELEGRAM_CHAT_ID_DAILY || process.env.TELEGRAM_CHAT_ID;
const OF_KEY    = process.env.ONLYFANSAPI_KEY;
if (!TG_TOKEN || !TG_CHAT || !OF_KEY) {
  console.error("Missing env: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID_DAILY / ONLYFANSAPI_KEY");
  process.exit(1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(HERE, "telegram-bot-state.json");

const OF_BASE = "https://app.onlyfansapi.com/api";
const headers = { Authorization: `Bearer ${OF_KEY}`, Accept: "application/json" };

// ── State ─────────────────────────────────────────────────────────
async function loadState() {
  try { return JSON.parse(await fs.readFile(STATE_PATH, "utf8")); }
  catch { return { last_update_id: 0 }; }
}
async function saveState(s) {
  await fs.writeFile(STATE_PATH, JSON.stringify(s, null, 2) + "\n");
}

// ── Today's UK window: midnight → now ─────────────────────────────
function todayUkWindow(now = new Date()) {
  const here = partsInTz(now, REPORT_TZ);
  const todayMidUtc = wallTimeToUtc(here.year, here.month, here.day);
  return {
    startUtc: todayMidUtc,                // UK midnight today, in UTC
    nowUtc: new Date(),                   // wall-clock now
    dateStr: `${here.year}-${String(here.month).padStart(2, "0")}-${String(here.day).padStart(2, "0")}`,
    nowLabel: new Intl.DateTimeFormat("en-GB", {
      timeZone: REPORT_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(now),
  };
}

// ── OF endpoints (same as daily.mjs uses, just today as the window) ─
async function fetchDayMetrics(acctId, dateStr) {
  const [subR, earnR] = await Promise.all([
    fetch(`${OF_BASE}/${acctId}/statistics/subscriber-metrics?start_date=${dateStr}&end_date=${dateStr}`, { headers }),
    fetch(`${OF_BASE}/${acctId}/statistics/statements/earnings?type=total&start_date=${dateStr}%2000:00:00&end_date=${dateStr}%2023:59:59`, { headers }),
  ]);
  let totalSubs = 0, newSubs = 0, renewSubs = 0, sales = 0;
  if (subR.ok) {
    const j = await subR.json();
    totalSubs = Number(j?.data?.total_subscriptions ?? 0);
    newSubs   = Number(j?.data?.new_subscriptions ?? 0);
    renewSubs = Number(j?.data?.renewed_subscriptions ?? 0);
  }
  if (earnR.ok) {
    const j = await earnR.json();
    const inner = Object.values(j?.data ?? {})[0] ?? {};
    sales = Number(inner.total ?? 0);
  }
  return { totalSubs, newSubs, renewSubs, sales };
}

// ── Telegram helpers ──────────────────────────────────────────────
async function tgFetch(method, params = {}) {
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    console.warn(`Telegram ${method} → HTTP ${r.status}:`, await r.text());
    return null;
  }
  return r.json();
}

async function tgSend(chatId, html) {
  return tgFetch("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

// ── /update handler ───────────────────────────────────────────────
async function handleUpdate(msg) {
  const replyChat = msg.chat.id;
  const requester = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name ?? "someone");

  // "Working on it" ack so the user knows the command was received.
  await tgSend(replyChat, `⏳ Fetching today's live stats — back in a few seconds...`);

  const { dateStr, nowLabel } = todayUkWindow();
  const dateLabel = fmtDateInTz(new Date());

  const rows = [];
  for (const c of CREATORS) {
    rows.push({ name: c.name, ...(await fetchDayMetrics(c.account_id, dateStr)) });
  }

  const totals = rows.reduce(
    (a, r) => ({ subs: a.subs + r.totalSubs, sales: a.sales + r.sales }),
    { subs: 0, sales: 0 },
  );

  const lines = [];
  lines.push(`📊 <b>LIVE STATS — ${escHtml(dateLabel)}</b>`);
  lines.push(`<i>Today so far (UK midnight → ${escHtml(nowLabel)} UK) · requested by ${escHtml(requester)}</i>`);
  lines.push("");
  for (const r of rows) {
    lines.push(
      `<b>${escHtml(r.name)}</b>\n` +
      `  Subs: <b>${r.totalSubs}</b> <i>(${r.newSubs} new, ${r.renewSubs} renew)</i>\n` +
      `  Sales: <b>$${fmtMoney(r.sales)}</b>`,
    );
  }
  lines.push("");
  lines.push(`📈 <b>Day total so far:</b> ${totals.subs} subs · $${fmtMoney(totals.sales)}`);

  await tgSend(replyChat, lines.join("\n"));

  // Attach a polished PDF version of the same data so it can be
  // downloaded / forwarded / saved.
  try {
    const pdfBytes = await buildDailyStatsPdf({
      title: "Live Stats",
      subtitle: `${dateLabel} · Today so far (UK midnight → ${nowLabel} UK) · requested by ${requester}`,
      headerRight: "Live Stats Report",
      rows,
      totals: { subs: totals.subs, sales: totals.sales },
    });
    await sendTelegramDocument(
      replyChat,
      `uncvrd-live-stats-${dateStr}.pdf`,
      pdfBytes,
      `📄 Live stats report — ${escHtml(dateLabel)}`,
    );
  } catch (e) {
    console.warn("PDF attach failed:", e);
  }
}

// ── Main poll loop (single invocation per cron run) ───────────────
async function main() {
  const state = await loadState();
  const offset = (state.last_update_id || 0) + 1;

  const updates = await tgFetch("getUpdates", { offset, timeout: 0, limit: 50 });
  if (!updates?.ok) {
    console.error("getUpdates failed");
    process.exit(1);
  }

  let processed = 0, handled = 0;
  for (const u of updates.result) {
    state.last_update_id = u.update_id;
    processed++;

    const msg = u.message ?? u.edited_message;
    if (!msg) continue;

    // Only listen in the configured chat (UNCVRD Daily Stats).
    // Telegram chat IDs are negative for groups; compare as numbers.
    if (Number(msg.chat.id) !== Number(TG_CHAT)) continue;

    // Detect /update (with or without @botname suffix and any args).
    const text = (msg.text ?? "").trim();
    if (!/^\/update(@\w+)?(\s|$)/i.test(text)) continue;

    try {
      await handleUpdate(msg);
      handled++;
    } catch (e) {
      console.warn("handleUpdate error:", e);
      await tgSend(msg.chat.id, `⚠️ Couldn't fetch stats: ${escHtml(String(e))}`);
    }
  }

  await saveState(state);
  console.log(JSON.stringify({ updates_processed: processed, commands_handled: handled }));
}

main().catch((e) => { console.error(e); process.exit(1); });
