#!/usr/bin/env node
// Daily Reddit poster leaderboard.
//
// Runs every morning ~08:23 UTC (a few minutes after reddit-daily so
// any in-flight rate-limit windows have reset). For each poster, sums
// yesterday's posts across their assigned Reddit accounts, applies the
// POINTS formula in reddit-lib, ranks them, and posts a Discord embed.
//
// Posters and their account assignments are in reddit-lib.mjs
// (POSTERS const). Point formula is in POINTS const there too. Change
// either and the next run picks it up automatically.

import {
  POSTERS, POINTS, fetchSubmitted, isRemoved, fmtNum, fullUrl,
} from "./reddit-lib.mjs";
import {
  sendDiscord, REPORT_TZ, wallTimeToUtc, partsInTz, fmtDateInTz,
} from "./config.mjs";

const WEBHOOK = process.env.DISCORD_WEBHOOK_REDDIT_LEADERBOARD;
if (!WEBHOOK) { console.error("DISCORD_WEBHOOK_REDDIT_LEADERBOARD missing"); process.exit(1); }

function yesterdayWindow(now = new Date()) {
  const here = partsInTz(now, REPORT_TZ);
  const todayMid = wallTimeToUtc(here.year, here.month, here.day);
  return {
    start: new Date(todayMid.getTime() - 24 * 3600_000),
    end:   new Date(todayMid.getTime() - 1000),
  };
}

// Per-poster aggregation across all their accounts in yesterday's window.
async function scorePoster(poster, startMs, endMs) {
  let posts = 0, upvotes = 0, comments = 0;
  let viral1k = 0, viral5k = 0, removed = 0;
  let topPost = null;
  const subreddits = new Set();
  const accountStats = [];

  for (const account of poster.accounts) {
    const list = await fetchSubmitted(account, { limit: 100 });
    let acctPosts = 0, acctUp = 0;
    for (const p of list) {
      const t = Number(p.created_utc) * 1000;
      if (t < startMs || t > endMs) continue;
      posts++;
      acctPosts++;
      acctUp += Number(p.ups || 0);
      upvotes += Number(p.ups || 0);
      comments += Number(p.num_comments || 0);
      subreddits.add(`r/${p.subreddit}`);
      if (isRemoved(p)) removed++;
      if (Number(p.ups) >= 5000) viral5k++;
      if (Number(p.ups) >= 1000) viral1k++;
      if (!topPost || Number(p.ups) > Number(topPost.ups)) topPost = { ...p, _account: account };
    }
    accountStats.push({ account, posts: acctPosts, upvotes: acctUp });
  }

  // Points calc
  const breakdown = {
    posts:        posts * POINTS.per_post,
    upvotes:      upvotes * POINTS.per_upvote,
    comments:     comments * POINTS.per_comment,
    viral_1k:     viral1k * POINTS.bonus_viral_1k,
    viral_5k:     viral5k * POINTS.bonus_viral_5k,
    removed:      removed * POINTS.penalty_removed,
  };
  const totalPoints = Object.values(breakdown).reduce((s, x) => s + x, 0);
  const bonusUsd = totalPoints / POINTS.points_per_dollar;

  return {
    name: poster.name,
    accounts: poster.accounts.length,
    posts, upvotes, comments,
    viral_1k: viral1k, viral_5k: viral5k, removed,
    topPost,
    subreddits: subreddits.size,
    breakdown,
    points: totalPoints,
    bonus_usd: bonusUsd,
    accountStats,
  };
}

const MEDAL = ["🥇", "🥈", "🥉"];

function buildField(rank, row) {
  const medal = MEDAL[rank] ?? `**${rank + 1}.**`;
  const lines = [];
  lines.push(`**${row.points.toFixed(0)} pts**   →   **$${row.bonus_usd.toFixed(2)} bonus**`);
  lines.push(`${row.posts} posts · ${fmtNum(row.upvotes)} upvotes · ${fmtNum(row.comments)} comments · ${row.subreddits} subs`);
  const flags = [];
  if (row.viral_5k) flags.push(`🌟 ${row.viral_5k}× mega-viral (5k+)`);
  if (row.viral_1k) flags.push(`🔥 ${row.viral_1k}× viral (1k+)`);
  if (row.removed)  flags.push(`🚫 ${row.removed} removed`);
  if (flags.length) lines.push(flags.join(" · "));
  if (row.topPost) {
    const title = String(row.topPost.title || "").slice(0, 90);
    lines.push(`🏆 [${title}](${fullUrl(row.topPost)}) — ${fmtNum(row.topPost.ups)} ↑ (r/${row.topPost.subreddit}, u/${row.topPost._account})`);
  }
  return {
    name: `${medal}  ${row.name}  ·  ${row.accounts} accts`,
    value: lines.join("\n").slice(0, 1024),
    inline: false,
  };
}

async function main() {
  const { start, end } = yesterdayWindow();
  const dateLabel = fmtDateInTz(start);

  const rows = [];
  for (const p of POSTERS) {
    rows.push(await scorePoster(p, start.getTime(), end.getTime()));
  }
  rows.sort((a, b) => b.points - a.points);

  const totalPts = rows.reduce((s, r) => s + r.points, 0);
  const totalBon = rows.reduce((s, r) => s + r.bonus_usd, 0);

  const embed = {
    title: `🏆 Reddit poster leaderboard — ${dateLabel}`,
    description:
      `*Yesterday's performance, UK time*\n` +
      `Pool: **${totalPts.toFixed(0)} pts** = **$${totalBon.toFixed(2)}** across ${rows.length} posters\n` +
      `Formula: +1 post · +0.01/upvote · +0.1/comment · viral bonuses · −10/removed · ${POINTS.points_per_dollar} pts = $1`,
    color: 0xFFD700,
    fields: rows.map((r, i) => buildField(i, r)),
    timestamp: new Date().toISOString(),
  };

  const ok = await sendDiscord(WEBHOOK, { embeds: [embed] });
  console.log(JSON.stringify({
    posters: rows.length,
    sent: ok,
    leaderboard: rows.map((r) => ({ name: r.name, points: +r.points.toFixed(1), bonus: +r.bonus_usd.toFixed(2) })),
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
