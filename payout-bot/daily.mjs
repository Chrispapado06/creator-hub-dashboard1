#!/usr/bin/env node
// Daily traffic / sales report.
//
// Runs every morning at 08:00 UTC. For each creator:
//   • Fetches yesterday's transactions and the day-before's transactions.
//   • Counts new subscribers, totals gross sales, computes LTV (sales /
//     new subs).
//   • Compares yesterday vs day-before to detect 50%+ traffic spikes.
//   • Flags LTV red zones (free page LTV < $5, paid page LTV < $30).
// Posts one combined Telegram message with every creator's row so the
// agency owner can read the morning state at a glance.

import { CREATORS, escHtml, fmtMoney, sendTelegram } from "./config.mjs";

const OF_KEY = process.env.ONLYFANSAPI_KEY;
if (!OF_KEY) { console.error("ONLYFANSAPI_KEY missing"); process.exit(1); }

// ── Date helpers ──────────────────────────────────────────────────
// Returns the two adjacent day windows in UTC: "yesterday" and "the
// day before that". Used to compute % change.
function dayWindows(now = new Date()) {
  const todayMid = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yStart = new Date(todayMid.getTime() - 24 * 3600_000);  // yesterday 00:00
  const yEnd   = new Date(todayMid.getTime() - 1000);            // yesterday 23:59:59
  const pStart = new Date(yStart.getTime() - 24 * 3600_000);     // day-before 00:00
  const pEnd   = new Date(yStart.getTime() - 1000);              // day-before 23:59:59
  return { yStart, yEnd, pStart, pEnd };
}

function isoDay(d) { return d.toISOString().slice(0, 10); }
function asStartParam(d) { return isoDay(d) + " 00:00:00"; }

// Fetch newest-first, paginate via marker, stop once we're older than
// hardCapMs (so we don't pull the entire history just to read 2 days).
async function fetchTransactionsSince(acctId, startStr, hardCapMs) {
  const out = [];
  let marker = null;
  for (let page = 0; page < 30; page++) {
    const qs = new URLSearchParams({ limit: "100", startDate: startStr });
    if (marker) qs.set("marker", marker);
    const url = `https://app.onlyfansapi.com/api/${acctId}/transactions?${qs}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${OF_KEY}` } });
    if (!r.ok) {
      console.warn(`OF API ${acctId} transactions → HTTP ${r.status}`);
      break;
    }
    const j = await r.json();
    const list = j?.data?.list ?? [];
    if (list.length === 0) break;
    out.push(...list);
    const oldest = list[list.length - 1];
    const oldestMs = oldest ? new Date(oldest.createdAt).getTime() : 0;
    if (oldestMs < hardCapMs) break;
    const next = j?.data?.nextMarker ?? j?.data?.marker;
    const hasMore = j?.data?.hasMore;
    if (!next || hasMore === false) break;
    marker = String(next);
  }
  return out;
}

// Compute daily metrics for the transactions that fall inside [a, b].
function metricsForWindow(txs, startMs, endMs) {
  const inWindow = txs.filter((t) => {
    const ts = new Date(t.createdAt).getTime();
    return ts >= startMs && ts <= endMs;
  });
  const newSubs = inWindow.filter((t) => t.type === "new_subscription").length;
  const sales = inWindow.reduce((s, t) => s + Number(t.amount || 0), 0);
  const ltv = newSubs > 0 ? sales / newSubs : 0;
  return { newSubs, sales, ltv };
}

// "▲40%", "▼15%", or "—" when prior was zero (no baseline).
function pctChangeLabel(today, prev) {
  if (!prev || prev === 0) return today > 0 ? "<i>new</i>" : "—";
  const pct = ((today - prev) / prev) * 100;
  const arrow = pct >= 0 ? "▲" : "▼";
  return `${arrow}${Math.abs(pct).toFixed(0)}%`;
}

function buildCreatorBlock(c, yest, prev) {
  const subPctRaw = prev.newSubs > 0 ? ((yest.newSubs - prev.newSubs) / prev.newSubs) * 100 : null;
  const ltvThreshold = c.page_type === "free" ? 5 : 30;
  const ltvFlagged = yest.newSubs > 0 && yest.ltv < ltvThreshold;
  const trafficSpike = subPctRaw !== null && subPctRaw >= 50;
  const flagSuffix = [];
  if (trafficSpike) flagSuffix.push("🚀");
  if (ltvFlagged) flagSuffix.push(`🚩 LTV &lt; $${ltvThreshold}`);

  const lines = [
    `<b>${escHtml(c.name)}</b> <i>(${c.page_type})</i>${flagSuffix.length ? " " + flagSuffix.join(" ") : ""}`,
    `  Subs: <b>${yest.newSubs}</b>  ${pctChangeLabel(yest.newSubs, prev.newSubs)}`,
    `  Sales: <b>$${fmtMoney(yest.sales)}</b>  ${pctChangeLabel(yest.sales, prev.sales)}`,
    `  LTV: <b>$${fmtMoney(yest.ltv)}</b>`,
  ];
  return lines.join("\n");
}

async function main() {
  const { yStart, yEnd, pStart, pEnd } = dayWindows();
  const startStr = asStartParam(pStart); // start of day-before
  const hardCapMs = pStart.getTime();

  const yStartMs = yStart.getTime(), yEndMs = yEnd.getTime();
  const pStartMs = pStart.getTime(), pEndMs = pEnd.getTime();

  const dateLabel = yStart.toUTCString().slice(0, 16); // "Mon, 13 May 2026"

  const blocks = [];
  for (const c of CREATORS) {
    const txs = await fetchTransactionsSince(c.account_id, startStr, hardCapMs);
    const yest = metricsForWindow(txs, yStartMs, yEndMs);
    const prev = metricsForWindow(txs, pStartMs, pEndMs);
    blocks.push(buildCreatorBlock(c, yest, prev));
  }

  const header = [
    `📊 <b>Daily traffic — ${escHtml(dateLabel)}</b>`,
    `<i>vs day-before (UTC days)</i>`,
    "",
  ].join("\n");

  // Daily report goes to its own group (UNCVRD Daily Stats), not the
  // payouts group. Falls back to the main chat if the dedicated env
  // var isn't set, so this still works on a single-secret setup.
  const dailyChat = process.env.TELEGRAM_CHAT_ID_DAILY || process.env.TELEGRAM_CHAT_ID;
  const msg = header + blocks.join("\n\n");
  const ok = await sendTelegram(msg, dailyChat);
  console.log(JSON.stringify({ creators: CREATORS.length, sent: ok, chat: dailyChat }));
}

main().catch((e) => { console.error(e); process.exit(1); });
