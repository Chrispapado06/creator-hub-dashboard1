#!/usr/bin/env node
// UNCVRD Daily Data Bot — the output side.
//
// Runs once a day (GitHub Actions cron, end of day UK). Pulls every
// entry VAs logged for today, rolls them up per-VA, and sends ONE
// summary to ONE person: TELEGRAM_RECIPIENT_CHAT_ID.
//
// It always sends something — even "nobody logged anything today" — so
// the recipient can tell the difference between a quiet day and a
// broken bot.

import {
  FIELDS, escHtml, reportDate, fmtDate,
  tgSend, sbGet,
} from "./config.mjs";

const RECIPIENT = process.env.TELEGRAM_RECIPIENT_CHAT_ID;

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !RECIPIENT) {
    console.error("TELEGRAM_BOT_TOKEN or TELEGRAM_RECIPIENT_CHAT_ID missing");
    process.exit(1);
  }

  // Defaults to today (REPORT_TZ); DIGEST_DATE=YYYY-MM-DD re-sends a past day.
  const date = process.env.DIGEST_DATE || reportDate();
  const dateLabel = process.env.DIGEST_DATE
    ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${date}T12:00:00Z`))
    : fmtDate();
  const entries = await sbGet(
    "daily_outreach_entries",
    `report_date=eq.${date}&order=va_name.asc,created_at.asc`,
  );

  // No entries → still tell the recipient.
  if (!entries.length) {
    await tgSend(
      RECIPIENT,
      `📭 <b>Daily checklist — ${escHtml(dateLabel)}</b>\n\n<i>No one logged a checklist today.</i>`,
    );
    console.log(`digest sent (empty) for ${date}`);
    return;
  }

  // Keep the latest report per VA (a VA may re-submit if something
  // changed — the last word wins for the day).
  const byVa = new Map();
  for (const e of entries) {
    const key = e.va_name || `user ${e.tg_user_id}`;
    byVa.set(key, e); // entries are ordered created_at.asc → last overwrites
  }

  let fullyDone = 0;
  const lines = [];
  lines.push(`📊 <b>DAILY CHECKLIST — ${escHtml(dateLabel)}</b>`);
  lines.push(`<i>${byVa.size} VA${byVa.size === 1 ? "" : "s"} reported</i>`);
  lines.push("");

  for (const [name, e] of [...byVa.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (e.completed) fullyDone += 1;
    const checks = FIELDS.map((f) => `${e[f.key] ? "✅" : "❌"} ${escHtml(f.label)}`).join("\n  ");
    lines.push(`<b>${escHtml(name)}</b>${e.completed ? "" : " ⚠️"}`);
    lines.push(`  ${checks}`);
    lines.push("");
  }

  lines.push(`🏁 <b>Fully completed:</b> ${fullyDone}/${byVa.size}`);

  await tgSend(RECIPIENT, lines.join("\n"));
  console.log(`digest sent for ${date}: ${byVa.size} VAs, ${fullyDone} fully completed`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
