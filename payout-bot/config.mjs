// Single source of truth for which creators we track and how their
// agency cut is computed.
//
// mode:
//   "on_payout_request"
//     → Alert in real time whenever the creator requests a payout on
//       OnlyFans. Agency cut = agency_pct of the full payout amount.
//
//   "weekly_net_messages_tips"
//     → Every Monday, sum the creator's net (post-OF-fee) revenue from
//       MESSAGE + TIP transactions in the prior Mon→Sun window. Agency
//       cut = agency_pct of that sum. Subscription income is excluded.
//
// agency_pct = the AGENCY's percentage. e.g. 50 = "agency takes 50%."
//
// page_type = "free" or "paid". Used by daily.mjs for the LTV red-zone
//   threshold: free pages flag if daily LTV < $5, paid pages flag if < $30.

export const CREATORS = [
  // Blue Bear — weekly, agency takes 28% of net messages+tips only.
  // Subs are excluded from her invoicing entirely.
  { name: "Blue Bear",      username: "bluebeari3vip",    account_id: "acct_99db42bda91149f58fd68ecccde21fa8", mode: "weekly_net_messages_tips", agency_pct: 28, page_type: "paid" },

  // Standard creators — real-time alert on payout request, 50/50 split.
  { name: "Meg",            username: "flame_fantasy_xx", account_id: "acct_996fbed6bab449af89f211b4851896ef", mode: "on_payout_request", agency_pct: 50, page_type: "free" },
  { name: "Johhnie",        username: "johnniejohnson",   account_id: "acct_ebbd462d60fd4718ac0792deaac898bb", mode: "on_payout_request", agency_pct: 50, page_type: "free" },
  { name: "Emma",           username: "emmasonne",        account_id: "acct_9bae83ac547447798d39e2d816ecd339", mode: "on_payout_request", agency_pct: 50, page_type: "free" },
  { name: "Marissa Munoz",  username: "marissa.munoz",    account_id: "acct_42e1c9678cfa4d379d44422a39ef7991", mode: "on_payout_request", agency_pct: 50, page_type: "free" },
  { name: "June - Sandra",  username: "thisisjunee",      account_id: "acct_9f27ee05d2554200a20c2711132fcbcd", mode: "on_payout_request", agency_pct: 50, page_type: "free" },
];

// ── Shared utils (used by both bot.mjs and weekly.mjs) ─────────────

export const escHtml = (s) =>
  String(s).replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

export const fmtMoney = (n) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Sends to TELEGRAM_CHAT_ID by default. Pass a different chat ID
// when a script (e.g. daily.mjs) should target a separate group like
// UNCVRD Daily Stats instead of UNCVRD Payouts.
export async function sendTelegram(html, chatId) {
  const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TG_CHAT  = chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!TG_TOKEN || !TG_CHAT) throw new Error("TELEGRAM_BOT_TOKEN or chat ID missing");
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
