#!/usr/bin/env node
// UNCVRD Daily Data Bot — the input side.
//
// A VA ("poster") DMs the bot (or messages it in a group) and types
// /report. The bot then asks one question at a time — which of our
// profiles they worked from, how many leads they followed / commented
// on / liked, how many posts they put on our own profiles, and any
// notes — collecting the answers into one entry row in Supabase.
//
// At the end of the day, digest.mjs compiles every entry and sends a
// single summary to one person. This file never sends the digest; it
// only collects.
//
// Runtime: long-polls Telegram (getUpdates, 50s timeout) in a loop, so
// each answer gets an instant reply. Run it on any always-on host
// (`node bot.mjs`) for 24/7 zero-latency, OR let the GitHub Actions
// workflow run it in ~5.5h shifts — Telegram queues messages between
// shifts so nothing is lost, only briefly delayed.
//
// Conversation state lives in Supabase (daily_outreach_sessions), so a
// restart never loses someone mid-report. The Telegram cursor lives in
// daily_outreach_state, so a restart never re-handles old messages.

import {
  FIELDS, parseYesNo, escHtml, reportDate, fmtDate,
  tgCall, tgSend, userName,
  YES_NO_KEYBOARD, REMOVE_KEYBOARD,
  sbGet, sbInsert, sbDelete,
} from "./config.mjs";

// Stop after this long so a GitHub Actions shift exits cleanly before
// the 6h job cap; the workflow's next run picks straight back up.
const RUN_FOR_MS = Number(process.env.BOT_RUN_FOR_MS || 5.5 * 3600 * 1000);

// ── Telegram cursor (singleton row) ──────────────────────────────────
async function loadOffset() {
  try {
    const rows = await sbGet("daily_outreach_state", "id=eq.1&select=last_update_id&limit=1");
    return Number(rows?.[0]?.last_update_id || 0);
  } catch (e) {
    console.warn("loadOffset failed:", e.message);
    return 0;
  }
}
async function saveOffset(lastUpdateId) {
  await sbInsert(
    "daily_outreach_state",
    [{ id: 1, last_update_id: lastUpdateId, updated_at: new Date().toISOString() }],
    { onConflict: "id" },
  );
}

// ── Session helpers ──────────────────────────────────────────────────
async function getSession(userId) {
  const rows = await sbGet("daily_outreach_sessions", `tg_user_id=eq.${userId}&limit=1`);
  return rows?.[0] || null;
}
async function saveSession(s) {
  await sbInsert(
    "daily_outreach_sessions",
    [{ ...s, updated_at: new Date().toISOString() }],
    { onConflict: "tg_user_id" },
  );
}
async function clearSession(userId) {
  await sbDelete("daily_outreach_sessions", `tg_user_id=eq.${userId}`);
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
  return (
    `✅ <b>Logged for ${escHtml(fmtDate())}</b>\n\n` +
    lines.join("\n") +
    `\n\nThanks! Send /report again if anything changes.`
  );
}

// ── Handle one incoming message ──────────────────────────────────────
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;
  const userId = from.id;
  const text = (msg.text || "").trim();
  const cmd = /^\/(\w+)/.exec(text)?.[1]?.toLowerCase();
  console.log(`← ${userName(from)} (chat ${chatId}, user ${userId}): ${text}`);

  // Commands that work any time ----------------------------------------
  if (cmd === "id") {
    await tgSend(
      chatId,
      `Chat id: <code>${chatId}</code>\nYour user id: <code>${userId}</code>\n\n` +
        `<i>Set TELEGRAM_RECIPIENT_CHAT_ID to the chat id of whoever should receive the daily summary.</i>`,
    );
    return;
  }
  if (cmd === "help" || cmd === "start") {
    await tgSend(chatId, HELP);
    return;
  }
  if (cmd === "cancel") {
    await clearSession(userId);
    await tgSend(chatId, "🚫 Report cancelled. Send /report to start again.");
    return;
  }
  if (cmd === "report") {
    const session = {
      tg_user_id: userId,
      chat_id: chatId,
      va_name: userName(from),
      step: 0,
      draft: {},
    };
    await saveSession(session);
    await tgSend(
      chatId,
      `📋 <b>Daily checklist — ${escHtml(fmtDate())}</b>\n\n${FIELDS[0].prompt}`,
      YES_NO_KEYBOARD,
    );
    return;
  }

  // Not a command → only meaningful if this user is mid-report. This
  // keeps the bot silent in busy group chats.
  const session = await getSession(userId);
  if (!session) {
    if (cmd) await tgSend(chatId, "I didn't recognise that. Send /report to log your outreach, or /help.");
    return;
  }

  const field = FIELDS[session.step];
  if (!field) {
    // Shouldn't happen, but recover gracefully.
    await clearSession(userId);
    return;
  }

  // Validate the yes/no answer -----------------------------------------
  const value = parseYesNo(text);
  if (value === null) {
    await tgSend(chatId, `Please tap <b>Yes</b> or <b>No</b>.\n\n${field.prompt}`, YES_NO_KEYBOARD);
    return;
  }

  // Store and advance ---------------------------------------------------
  const draft = { ...session.draft, [field.key]: value };
  const nextStep = session.step + 1;

  if (nextStep < FIELDS.length) {
    await saveSession({ ...session, step: nextStep, draft });
    await tgSend(chatId, FIELDS[nextStep].prompt, YES_NO_KEYBOARD);
    return;
  }

  // Finished — persist the entry and close the session.
  await sbInsert("daily_outreach_entries", [
    {
      report_date: reportDate(),
      tg_user_id: userId,
      va_name: session.va_name,
      dms_sent:       !!draft.dms_sent,
      needed_post:    !!draft.needed_post,
      posted_stories: !!draft.posted_stories,
      commented:      !!draft.commented,
      liked:          !!draft.liked,
      completed:      !!draft.completed,
    },
  ]);
  await clearSession(userId);
  await tgSend(chatId, summarise(draft), REMOVE_KEYBOARD);
}

// ── Long-poll loop ───────────────────────────────────────────────────
async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN missing");
    process.exit(1);
  }
  let offset = await loadOffset();
  const deadline = Date.now() + RUN_FOR_MS;
  console.log(`daily-data-bot up. offset=${offset}, running until ${new Date(deadline).toISOString()}`);

  while (Date.now() < deadline) {
    let updates;
    try {
      const res = await tgCall("getUpdates", { offset: offset + 1, timeout: 50, limit: 50 });
      updates = res?.result || [];
    } catch (e) {
      console.warn("getUpdates error:", e.message);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    if (updates.length === 0) continue;

    for (const u of updates) {
      offset = u.update_id;
      const msg = u.message ?? u.edited_message;
      if (!msg || !msg.text) continue;
      try {
        await handleMessage(msg);
      } catch (e) {
        console.warn("handleMessage error:", e.message);
        try { await tgSend(msg.chat.id, "⚠️ Something went wrong saving that — please try /report again."); }
        catch {}
      }
    }
    try { await saveOffset(offset); } catch (e) { console.warn("saveOffset failed:", e.message); }
  }

  console.log("Shift over — exiting cleanly. Next run resumes from saved offset.");
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
