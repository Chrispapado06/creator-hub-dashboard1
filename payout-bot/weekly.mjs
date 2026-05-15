#!/usr/bin/env node
// Weekly Monday invoice generator.
//
// Runs every Monday at 09:00 UTC via GitHub Actions. For each creator
// whose mode is "weekly_net_messages_tips":
//   1. Computes the prior Mon→Sun window in Europe/London wall time.
//   2. Calls OF's /statistics/statements/earnings endpoint twice
//      (type=messages, type=tips) — this is the SAME data the OF UI's
//      stats page shows, so the numbers match what the agency owner
//      sees on screen down to the cent.
//   3. Sums the two `total` (net) fields, applies agency_pct, and
//      posts the invoice line items to Telegram ready for slash.com.
//
// We deliberately use OF's stats endpoint instead of summing /transactions
// ourselves: status-handling, refund treatment, and timezone bucketing
// were diverging from the UI. The stats endpoint is the source of truth.

import {
  CREATORS, escHtml, fmtMoney, sendTelegram,
  REPORT_TZ, wallTimeToUtc, partsInTz, fmtDateInTz,
} from "./config.mjs";

const OF_KEY = process.env.ONLYFANSAPI_KEY;
if (!OF_KEY) {
  console.error("ONLYFANSAPI_KEY missing");
  process.exit(1);
}

// ── Date helpers ──────────────────────────────────────────────────
// Returns last week's UK calendar dates as the strings OF expects in
// its earnings endpoint, plus Date objects for pretty labels.
function lastWeekRange(now = new Date()) {
  const here = partsInTz(now, REPORT_TZ);
  const thisMonOffset = here.weekday === 0 ? -6 : 1 - here.weekday;
  const thisMondayUtc = wallTimeToUtc(here.year, here.month, here.day + thisMonOffset);
  const lastMondayUtc = new Date(thisMondayUtc.getTime() - 7 * 24 * 3600_000);
  const lastSundayUtc = new Date(thisMondayUtc.getTime() - 1000);
  // OF earnings endpoint expects "YYYY-MM-DD HH:MM:SS" date strings.
  // Use the UK calendar day numbers so the bucket matches the UI.
  const lastMondayParts = partsInTz(lastMondayUtc, REPORT_TZ);
  const lastSundayParts = partsInTz(lastSundayUtc, REPORT_TZ);
  const ymd = (p) => `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return {
    startStr: `${ymd(lastMondayParts)} 00:00:00`,
    endStr:   `${ymd(lastSundayParts)} 23:59:59`,
    startDate: lastMondayUtc,
    endDate: lastSundayUtc,
  };
}

// Fetch net earnings for one transaction type in [startStr, endStr].
// The response wraps the totals under a key that matches the type
// (e.g. type=messages → data.chat_messages.{total, gross, chartCount}).
async function fetchEarnings(acctId, type, startStr, endStr) {
  const qs = new URLSearchParams({ type, start_date: startStr, end_date: endStr });
  const url = `https://app.onlyfansapi.com/api/${acctId}/statistics/statements/earnings?${qs}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${OF_KEY}` } });
  if (!r.ok) {
    console.warn(`Earnings ${acctId} ${type} → HTTP ${r.status}`);
    return { net: 0, gross: 0, count: 0 };
  }
  const j = await r.json();
  const inner = Object.values(j?.data ?? {})[0] ?? {};
  const count = Array.isArray(inner.chartCount)
    ? inner.chartCount.reduce((s, x) => s + Number(x.count || 0), 0)
    : 0;
  return {
    net: Number(inner.total || 0),
    gross: Number(inner.gross || 0),
    count,
  };
}

async function main() {
  const eligible = CREATORS.filter((c) => c.mode === "weekly_net_messages_tips");
  const { startStr, endStr, startDate, endDate } = lastWeekRange();

  let alertCount = 0;

  for (const c of eligible) {
    const [msgs, tips] = await Promise.all([
      fetchEarnings(c.account_id, "messages", startStr, endStr),
      fetchEarnings(c.account_id, "tips", startStr, endStr),
    ]);

    const totalNet = msgs.net + tips.net;
    const agencyCut = (totalNet * c.agency_pct) / 100;

    const periodLabel = `${fmtDateInTz(startDate)} → ${fmtDateInTz(endDate)}`;
    const weekOfLabel = fmtDateInTz(startDate);

    const lines = [
      `💸 <b>Weekly invoice — ${escHtml(c.name)}</b>`,
      `<i>${escHtml(periodLabel)} (UK time)</i>`,
      "",
      `Net from messages: <b>$${fmtMoney(msgs.net)}</b> <i>(${msgs.count} tx)</i>`,
      `Net from tips:     <b>$${fmtMoney(tips.net)}</b> <i>(${tips.count} tx)</i>`,
      `<b>Total net (msg+tips): $${fmtMoney(totalNet)}</b>`,
      "",
      `<b>Agency cut (${c.agency_pct}%): $${fmtMoney(agencyCut)}</b>`,
      "",
      "<b>For slash.com:</b>",
      `• Item: Agency management fee — week of ${escHtml(weekOfLabel)}`,
      `• Qty: 1`,
      `• Unit Price: $${fmtMoney(agencyCut)}`,
      `• Memo: ${c.agency_pct}% on net messages+tips ($${fmtMoney(totalNet)})`,
    ];

    if (await sendTelegram(lines.join("\n"))) alertCount++;
  }

  console.log(JSON.stringify({
    eligible: eligible.length,
    alerts: alertCount,
    window: `${startStr} → ${endStr}`,
    timezone: REPORT_TZ,
  }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
