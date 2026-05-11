#!/usr/bin/env node
// Standalone OnlyFans payout watcher.
//
// Polls OnlyFansAPI for every creator listed below, detects new payout
// requests (anything we haven't seen before), and sends a Telegram alert
// to the agency group. Persists seen invoice IDs in state.json so we
// don't spam on every run.
//
// Run via GitHub Actions cron (.github/workflows/payout-bot.yml).
// Edit the CREATORS array below to add/remove accounts or change splits.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── EDIT THIS LIST ─────────────────────────────────────────────────
// split_pct = the CREATOR's percentage. Agency gets the rest.
//   80 → 80% creator / 20% agency
//   50 → 50/50
//   40 → 40% creator / 60% agency
const CREATORS = [
  { name: "Blue Bear",      username: "bluebeari3vip",    account_id: "acct_99db42bda91149f58fd68ecccde21fa8", split_pct: 80 },
  { name: "Tess Free",      username: "emmaxtemptationn", account_id: "acct_1678589302284fda84db6347409000b2", split_pct: 80 },
  { name: "Tess VIP",       username: "emmaxtemptation",  account_id: "acct_2a8e65fcbce74c9eb314bdede6e73fb4", split_pct: 80 },
  { name: "Meg",            username: "flame_fantasy_xx", account_id: "acct_996fbed6bab449af89f211b4851896ef", split_pct: 80 },
  { name: "Johnee",         username: "johnniejfree",     account_id: "acct_6bc9a3ee3d7f4bd38b354faff5f1b1bd", split_pct: 80 },
  { name: "Johhnie",        username: "johnniejohnson",   account_id: "acct_ebbd462d60fd4718ac0792deaac898bb", split_pct: 80 },
  { name: "Emma",           username: "emmasonne",        account_id: "acct_9bae83ac547447798d39e2d816ecd339", split_pct: 80 },
  { name: "Marissa Munoz",  username: "marissa.munoz",    account_id: "acct_42e1c9678cfa4d379d44422a39ef7991", split_pct: 80 },
];
// ────────────────────────────────────────────────────────────────────

const OF_KEY   = process.env.ONLYFANSAPI_KEY;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID;

if (!OF_KEY || !TG_TOKEN || !TG_CHAT) {
  console.error("Missing env. Need ONLYFANSAPI_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.");
  process.exit(1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(HERE, "state.json");

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
  } catch {
    return { seen: {}, bootstrapped: {} };
  }
}

async function saveState(state) {
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

async function fetchPayouts(accountId) {
  const url = `https://app.onlyfansapi.com/api/${accountId}/payouts/payout-requests?limit=50`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${OF_KEY}` } });
  if (!r.ok) {
    console.warn(`OF API ${accountId} → HTTP ${r.status}`);
    return [];
  }
  const j = await r.json();
  return j?.data?.list ?? [];
}

const escHtml = (s) =>
  String(s).replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

const fmtMoney = (n) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function sendTelegram(html) {
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TG_CHAT,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!r.ok) {
    console.warn("Telegram failed:", r.status, await r.text());
    return false;
  }
  return true;
}

async function main() {
  const state = await loadState();
  state.seen ??= {};
  state.bootstrapped ??= {};

  let newCount = 0;
  let alertCount = 0;

  for (const c of CREATORS) {
    const payouts = await fetchPayouts(c.account_id);
    if (payouts.length === 0) continue;

    // First time we've ever seen this creator? Silently absorb their
    // existing payout history — don't blast Telegram with old stuff.
    const isBootstrap = !state.bootstrapped[c.account_id];

    for (const p of payouts) {
      const key = `${c.account_id}:${p.invoiceId}`;
      if (state.seen[key]) continue;
      state.seen[key] = { ts: p.createdAt, amount: p.amount, state: p.state };
      newCount++;

      if (isBootstrap) continue;

      const agencyCut = (Number(p.amount) * (100 - c.split_pct)) / 100;
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
        `Split: ${c.split_pct}/${100 - c.split_pct} (creator/agency)`,
        `→ Agency cut: <b>$${fmtMoney(agencyCut)}</b>`,
      ]
        .filter(Boolean)
        .join("\n");

      const ok = await sendTelegram(msg);
      if (ok) alertCount++;
    }

    state.bootstrapped[c.account_id] = true;
  }

  await saveState(state);
  console.log(JSON.stringify({ creators: CREATORS.length, new: newCount, alerts: alertCount }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
