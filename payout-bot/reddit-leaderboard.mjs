#!/usr/bin/env node
// Weekly-cycle Reddit poster leaderboard, posted daily as a live
// running total during the cycle and once more as the official close
// just after the cycle ends.
//
// Cycle: Sun 00:00 → Fri 23:59 Dubai (Asia/Dubai, UTC+4 year-round).
// Saturday is the rest day.
//
// Posters + their account assignments + the point formula all live in
// reddit-lib.mjs (POSTERS, POINTS). Edit there to rebalance.

import {
  POSTERS, POINTS, fetchSubmitted, isRemoved, fmtNum,
} from "./reddit-lib.mjs";
import {
  sendDiscord, partsInTz, wallTimeToUtc,
} from "./config.mjs";

const WEBHOOK = process.env.DISCORD_WEBHOOK_REDDIT_LEADERBOARD;
if (!WEBHOOK) { console.error("DISCORD_WEBHOOK_REDDIT_LEADERBOARD missing"); process.exit(1); }

const CYCLE_TZ = "Asia/Dubai";

// ── Cycle math: Sun→Fri Dubai ─────────────────────────────────────
// Returns the cycle that contains `now`, or — if `now` is on Saturday
// — the cycle that just ended. We include Saturday in the previous
// cycle's window so the Saturday post is a clean "final" recap.
function currentCycle(now = new Date()) {
  const here = partsInTz(now, CYCLE_TZ);
  // weekday: 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  // Distance back to most recent Sunday in Dubai:
  const daysBackToSun = here.weekday;             // 0..6
  const cycleStartUtc = wallTimeToUtc(here.year, here.month, here.day - daysBackToSun, 0, 0, 0, CYCLE_TZ);
  // Friday 23:59:59 Dubai = Saturday 00:00 - 1 sec
  const cycleEndUtc = new Date(cycleStartUtc.getTime() + 6 * 24 * 3600_000 - 1000);
  const closed = now.getTime() > cycleEndUtc.getTime();
  // Day-of-cycle indicator (1..6 = Sun..Fri). 7 = Sat (after close).
  const dayOfCycle = here.weekday === 6 ? 7 : here.weekday + 1;
  return { startUtc: cycleStartUtc, endUtc: cycleEndUtc, dayOfCycle, closed };
}

function fmtCycleDate(d) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CYCLE_TZ, weekday: "short", month: "short", day: "numeric",
  }).format(d);
}

function fmtWeekOfLabel(d) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CYCLE_TZ, month: "long", day: "numeric", year: "numeric",
  }).format(d);
}

// ── Scoring ──────────────────────────────────────────────────────
async function scorePoster(poster, startMs, endMs) {
  let posts = 0, upvotes = 0, comments = 0;
  let viral1k = 0, viral5k = 0, removed = 0;

  for (const account of poster.accounts) {
    // Up to 200 posts (2 pages) — enough for a 6-day cycle even at
    // high posting volume.
    const list = await fetchSubmitted(account, { limit: 100, pages: 2 });
    for (const p of list) {
      const t = Number(p.created_utc) * 1000;
      if (t < startMs || t > endMs) continue;
      posts++;
      upvotes  += Number(p.ups || 0);
      comments += Number(p.num_comments || 0);
      if (isRemoved(p)) removed++;
      if (Number(p.ups) >= 5000) viral5k++;
      if (Number(p.ups) >= 1000) viral1k++;
    }
  }

  const points = Math.round(
    posts    * POINTS.per_post +
    upvotes  * POINTS.per_upvote +
    comments * POINTS.per_comment +
    viral1k  * POINTS.bonus_viral_1k +
    viral5k  * POINTS.bonus_viral_5k +
    removed  * POINTS.penalty_removed
  );

  return {
    name: poster.name,
    accounts: poster.accounts.length,
    posts, upvotes, comments,
    viral_1k: viral1k, viral_5k: viral5k, removed,
    points,
  };
}

const MEDAL = ["🥇", "🥈", "🥉"];

function rankLine(rank, r) {
  const tag = rank < 3 ? MEDAL[rank] : `${rank + 1}.`;
  const pts = `${r.points} pts`;
  const extras = [];
  if (r.viral_5k) extras.push(`🌟${r.viral_5k}`);
  if (r.viral_1k) extras.push(`🔥${r.viral_1k}`);
  if (r.removed)  extras.push(`🚫${r.removed}`);
  const tail = extras.length ? `  (${extras.join(" · ")})` : "";
  return `${tag} **${r.name}** — ${pts}${tail}`;
}

async function main() {
  const now = new Date();
  const { startUtc, endUtc, dayOfCycle, closed } = currentCycle(now);

  const rows = [];
  for (const p of POSTERS) {
    rows.push(await scorePoster(p, startUtc.getTime(), endUtc.getTime()));
  }
  rows.sort((a, b) => b.points - a.points);

  const totalPosts    = rows.reduce((s, r) => s + r.posts, 0);
  const totalUpvotes  = rows.reduce((s, r) => s + r.upvotes, 0);
  const totalComments = rows.reduce((s, r) => s + r.comments, 0);
  const totalRemoved  = rows.reduce((s, r) => s + r.removed, 0);

  // Status line — mirrors the style of the Chatter Points Bot example
  // the agency wants this leaderboard to look like.
  const dayLabels = ["", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const status = closed
    ? `✅ Cycle closed`
    : `Day ${dayOfCycle} of 6 (${dayLabels[dayOfCycle]}) · in progress`;

  const lines = [];
  lines.push(`🏆 **REDDIT POSTER POINTS — WEEK OF ${fmtWeekOfLabel(startUtc)}**`);
  lines.push(`Cycle: ${fmtCycleDate(startUtc)} → ${fmtCycleDate(endUtc)} · Closes Friday 23:59 Dubai`);
  lines.push(`*${status}*`);
  lines.push("");
  rows.forEach((r, i) => lines.push(rankLine(i, r)));
  lines.push("");
  lines.push(`📊 Posts: **${fmtNum(totalPosts)}** · Upvotes: **${fmtNum(totalUpvotes)}** · Comments: **${fmtNum(totalComments)}** · Removed: **${totalRemoved}**`);
  lines.push(`⏰ ${closed ? "Final standings — new cycle starts Sunday 00:00 Dubai" : "Next update: tomorrow morning"}`);

  const ok = await sendDiscord(WEBHOOK, lines.join("\n"));
  console.log(JSON.stringify({
    posters: rows.length,
    sent: ok,
    cycle: { start: startUtc.toISOString(), end: endUtc.toISOString(), day: dayOfCycle, closed },
    leaderboard: rows.map((r) => ({ name: r.name, pts: r.points })),
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
