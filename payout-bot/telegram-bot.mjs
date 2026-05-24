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

// ── Rolling 24h (or N-hour) metrics ──────────────────────────────
// The OF stats endpoints bucket by whole calendar days, so they
// can't give us true "last N hours" precision. We sum /transactions
// in the window directly — newest-first, paginating via marker
// until the oldest fetched is older than `fromMs`.
async function fetchRollingMetrics(acctId, fromMs, toMs) {
  const fromDateStr = new Date(fromMs).toISOString().slice(0, 19).replace("T", " ");
  let totalSubs = 0, newSubs = 0, renewSubs = 0, sales = 0, txCount = 0;
  let marker = null;
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ limit: "100", startDate: fromDateStr });
    if (marker) qs.set("marker", marker);
    const url = `${OF_BASE}/${acctId}/transactions?${qs}`;
    const r = await fetch(url, { headers });
    if (!r.ok) { console.warn(`OF tx ${acctId} → HTTP ${r.status}`); break; }
    const j = await r.json();
    const list = j?.data?.list ?? [];
    if (list.length === 0) break;
    for (const t of list) {
      const ts = new Date(t.createdAt).getTime();
      if (ts < fromMs || ts > toMs) continue;
      if (t.status === "undo") continue;  // refunded — exclude
      txCount++;
      if (t.type === "new_subscription")        { newSubs++;   totalSubs++; }
      else if (t.type === "recurring_subscription") { renewSubs++; totalSubs++; }
      sales += Number(t.net || 0);  // net to match daily.mjs / OF UI
    }
    // Stop once we've paged past the window.
    const oldest = list[list.length - 1];
    if (oldest && new Date(oldest.createdAt).getTime() < fromMs) break;
    const next = j?.data?.nextMarker ?? j?.data?.marker;
    if (!next || j?.data?.hasMore === false) break;
    marker = String(next);
  }
  return { totalSubs, newSubs, renewSubs, sales, txCount };
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

// ── /24 handler — rolling last 24 hours, no midnight snapping ────
async function handle24h(msg) {
  const replyChat = msg.chat.id;
  const requester = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name ?? "someone");

  await tgSend(replyChat, `⏳ Fetching last 24h stats — back in a few seconds...`);

  const toUtc = new Date();
  const fromUtc = new Date(toUtc.getTime() - 24 * 3600_000);

  // Pretty time labels (UK time so they match the daily reports).
  const tzFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: REPORT_TZ, weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const fromLabel = tzFmt.format(fromUtc);
  const toLabel = tzFmt.format(toUtc);
  const windowLabel = `${fromLabel} → ${toLabel} UK`;

  const rows = [];
  for (const c of CREATORS) {
    rows.push({ name: c.name, ...(await fetchRollingMetrics(c.account_id, fromUtc.getTime(), toUtc.getTime())) });
  }

  const totals = rows.reduce(
    (a, r) => ({ subs: a.subs + r.totalSubs, sales: a.sales + r.sales }),
    { subs: 0, sales: 0 },
  );

  const lines = [];
  lines.push(`📊 <b>LAST 24 HOURS</b>`);
  lines.push(`<i>${escHtml(windowLabel)} · requested by ${escHtml(requester)}</i>`);
  lines.push("");
  for (const r of rows) {
    lines.push(
      `<b>${escHtml(r.name)}</b>\n` +
      `  Subs: <b>${r.totalSubs}</b> <i>(${r.newSubs} new, ${r.renewSubs} renew)</i>\n` +
      `  Sales: <b>$${fmtMoney(r.sales)}</b>`,
    );
  }
  lines.push("");
  lines.push(`📈 <b>24h total:</b> ${totals.subs} subs · $${fmtMoney(totals.sales)}`);

  await tgSend(replyChat, lines.join("\n"));

  // Attach PDF too.
  try {
    const pdfBytes = await buildDailyStatsPdf({
      title: "Last 24 Hours",
      subtitle: `${windowLabel} · requested by ${requester}`,
      headerRight: "Rolling 24h Report",
      rows,
      totals,
    });
    const stamp = toUtc.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    await sendTelegramDocument(
      replyChat,
      `uncvrd-24h-${stamp}.pdf`,
      pdfBytes,
      `📄 Last 24h report — ${escHtml(toLabel)} UK`,
    );
  } catch (e) {
    console.warn("PDF attach failed:", e);
  }
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

    // Detect supported commands (with or without @botname suffix).
    const text = (msg.text ?? "").trim();
    const isUpdate = /^\/update(@\w+)?(\s|$)/i.test(text);
    const is24h    = /^\/24(@\w+)?(\s|$)/i.test(text);
    if (!isUpdate && !is24h) continue;

    try {
      if (isUpdate) await handleUpdate(msg);
      else if (is24h) await handle24h(msg);
      handled++;
    } catch (e) {
      console.warn("command handler error:", e);
      await tgSend(msg.chat.id, `⚠️ Couldn't fetch stats: ${escHtml(String(e))}`);
    }
  }

  await saveState(state);
  console.log(JSON.stringify({ updates_processed: processed, commands_handled: handled }));
}

main().catch((e) => { console.error(e); process.exit(1); });
