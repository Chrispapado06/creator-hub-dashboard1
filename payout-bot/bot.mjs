#!/usr/bin/env node
// Real-time OnlyFans payout-request poller.
//
// Runs every 10 minutes via GitHub Actions. For each creator whose
// mode is "on_payout_request", calls
//   GET /api/{acct}/payouts/payout-requests
// and inserts any invoiceId we haven't seen into state.json. Brand-new
// payout requests fire a Telegram alert to the agency group.
//
// Creators on other modes (e.g. Blue Bear on "weekly_net_messages_tips")
// are intentionally skipped here — they're handled by weekly.mjs.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CREATORS, escHtml, fmtMoney, sendTelegram } from "./config.mjs";

const OF_KEY = process.env.ONLYFANSAPI_KEY;
if (!OF_KEY) {
  console.error("ONLYFANSAPI_KEY missing");
  process.exit(1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(HERE, "state.json");

async function loadState() {
  try { return JSON.parse(await fs.readFile(STATE_PATH, "utf8")); }
  catch { return { seen: {}, bootstrapped: {} }; }
}
async function saveState(s) {
  await fs.writeFile(STATE_PATH, JSON.stringify(s, null, 2) + "\n");
}

async function fetchPayouts(acctId) {
  const url = `https://app.onlyfansapi.com/api/${acctId}/payouts/payout-requests?limit=50`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${OF_KEY}` } });
  if (!r.ok) {
    console.warn(`OF API ${acctId} → HTTP ${r.status}`);
    return [];
  }
  const j = await r.json();
  return j?.data?.list ?? [];
}

async function main() {
  const state = await loadState();
  state.seen ??= {};
  state.bootstrapped ??= {};

  const eligible = CREATORS.filter((c) => c.mode === "on_payout_request");

  let newCount = 0;
  let alertCount = 0;

  for (const c of eligible) {
    const payouts = await fetchPayouts(c.account_id);
    if (payouts.length === 0) continue;

    // Bootstrap: first time we've seen this creator → silently absorb
    // their existing payout history so we don't spam old payouts.
    const isBootstrap = !state.bootstrapped[c.account_id];

    for (const p of payouts) {
      const key = `${c.account_id}:${p.invoiceId}`;
      if (state.seen[key]) continue;
      state.seen[key] = { ts: p.createdAt, amount: p.amount, state: p.state };
      newCount++;

      if (isBootstrap) continue;

      const agencyCut = (Number(p.amount) * c.agency_pct) / 100;
      const requestedAt = new Date(p.createdAt).toISOString().replace("T", " ").slice(0, 16);

      const msg = [
        "🚨 <b>Payout requested</b>",
        "",
        `<b>Creator:</b> ${escHtml(c.name)} (@${escHtml(c.username)})`,
        `<b>Amount:</b> $${fmtMoney(p.amount)} ${escHtml(p.currency || "USD")}`,
        `<b>Status:</b> ${escHtml(p.state)}`,
        p.rejectReason ? `<b>Reject reason:</b> ${escHtml(p.rejectReason)}` : null,
        `<b>Invoice:</b> <code>${escHtml(p.invoiceId)}</code>`,
        `<b>Requested:</b> ${escHtml(requestedAt)} UTC`,
        "",
        `Agency cut (${c.agency_pct}% of payout): <b>$${fmtMoney(agencyCut)}</b>`,
      ]
        .filter(Boolean)
        .join("\n");

      if (await sendTelegram(msg)) alertCount++;
    }

    state.bootstrapped[c.account_id] = true;
  }

  await saveState(state);
  console.log(JSON.stringify({ creators: eligible.length, new: newCount, alerts: alertCount }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
