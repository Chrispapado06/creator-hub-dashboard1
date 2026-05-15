#!/usr/bin/env node
// Weekly Monday invoice generator.
//
// Runs every Monday at 09:00 UTC via GitHub Actions. For each creator
// whose mode is "weekly_net_messages_tips":
//   1. Pulls all /transactions in the prior Mon 00:00 → Sun 23:59 UTC.
//   2. Filters to type ∈ {"message", "tip"} (subs excluded).
//   3. Sums the "net" field (post-OF-fee).
//   4. Applies agency_pct.
//   5. Posts a Telegram message with the invoice line items ready to
//      paste into slash.com.

import { CREATORS, escHtml, fmtMoney, sendTelegram, REPORT_TZ, wallTimeToUtc, partsInTz, fmtDateInTz } from "./config.mjs";

const OF_KEY = process.env.ONLYFANSAPI_KEY;
if (!OF_KEY) {
  console.error("ONLYFANSAPI_KEY missing");
  process.exit(1);
}

// ── Date helpers ──────────────────────────────────────────────────
// Last week's Mon→Sun window expressed in Europe/London wall time,
// then converted to UTC for filtering. This is what the OF stats UI
// shows the agency, so our numbers match Luca's spot-checks exactly.
function lastWeekRange(now = new Date()) {
  const here = partsInTz(now, REPORT_TZ);                  // today in London
  const thisMonOffset = here.weekday === 0 ? -6 : 1 - here.weekday;
  // London midnight of "this Monday" (today if Monday, else upcoming/past)
  const thisMondayUtc = wallTimeToUtc(here.year, here.month, here.day + thisMonOffset);
  // Last Monday = this Monday - 7d (London midnight → UTC)
  const lastWeekStart = new Date(thisMondayUtc.getTime() - 7 * 24 * 3600_000);
  // Last Sunday 23:59:59 London = 1 second before this Monday London midnight (in UTC)
  const lastWeekEnd = new Date(thisMondayUtc.getTime() - 1000);
  // The OF API's `startDate` query param is interpreted as UTC.
  const toApi = (d) => d.toISOString().slice(0, 19).replace("T", " ");
  return {
    start: lastWeekStart,                  // UTC Date object
    end: lastWeekEnd,                      // UTC Date object
    startStr: toApi(lastWeekStart),        // string for OF startDate param
    endStr: toApi(lastWeekEnd),
  };
}

async function fetchTransactionsSince(acctId, startStr, hardCapMs) {
  // Newest-first list. Paginate via marker until we cross hardCapMs
  // (the start of our window) or the API tells us there's no more.
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

async function main() {
  const eligible = CREATORS.filter((c) => c.mode === "weekly_net_messages_tips");
  const { start, end, startStr, endStr } = lastWeekRange();
  const startMs = start.getTime();
  const endMs = end.getTime();

  let alertCount = 0;

  for (const c of eligible) {
    const tx = await fetchTransactionsSince(c.account_id, startStr, startMs);

    // Keep only what's actually within last week's window.
    const inWindow = tx.filter((t) => {
      const ts = new Date(t.createdAt).getTime();
      return ts >= startMs && ts <= endMs;
    });

    const messages = inWindow.filter((t) => t.type === "message");
    const tips     = inWindow.filter((t) => t.type === "tip");

    const msgNet = messages.reduce((s, t) => s + Number(t.net || 0), 0);
    const tipNet = tips.reduce((s, t) => s + Number(t.net || 0), 0);
    const totalNet = msgNet + tipNet;
    const agencyCut = (totalNet * c.agency_pct) / 100;

    // Pretty labels in UK time so they line up with what Luca sees on OF.
    const periodLabel = `${fmtDateInTz(start)} → ${fmtDateInTz(end)}`;
    const weekOfLabel = fmtDateInTz(start);

    const lines = [
      `💸 <b>Weekly invoice — ${escHtml(c.name)}</b>`,
      `<i>${escHtml(periodLabel)} (UK time)</i>`,
      "",
      `Net from messages: <b>$${fmtMoney(msgNet)}</b> <i>(${messages.length} tx)</i>`,
      `Net from tips:     <b>$${fmtMoney(tipNet)}</b> <i>(${tips.length} tx)</i>`,
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
    window_utc: `${startStr} → ${endStr}`,
    timezone: REPORT_TZ,
  }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
