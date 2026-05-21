#!/usr/bin/env node
// Daily Reddit traffic report.
//
// Runs every morning ~08:13 UTC. For each creator, sums yesterday's
// posts + upvotes + comments across all their Reddit accounts, picks
// the top-performing post, and compares vs the day before. Posts a
// single Discord embed to the "Daily reports" channel.

import {
  REDDIT_CREATORS, fetchSubmitted, isRemoved, fmtNum, fullUrl,
} from "./reddit-lib.mjs";
import {
  sendDiscord, REPORT_TZ, wallTimeToUtc, partsInTz, fmtDateInTz,
} from "./config.mjs";

const WEBHOOK = process.env.DISCORD_WEBHOOK_REDDIT_DAILY;
if (!WEBHOOK) { console.error("DISCORD_WEBHOOK_REDDIT_DAILY missing"); process.exit(1); }

// ── Time windows: yesterday + day-before, expressed as UK days ───
function dayWindows(now = new Date()) {
  const here = partsInTz(now, REPORT_TZ);
  const todayMidUtc = wallTimeToUtc(here.year, here.month, here.day);
  const yStart = new Date(todayMidUtc.getTime() - 24 * 3600_000);
  const yEnd   = new Date(todayMidUtc.getTime() - 1000);
  const pStart = new Date(yStart.getTime() - 24 * 3600_000);
  const pEnd   = new Date(yStart.getTime() - 1000);
  return { yStart, yEnd, pStart, pEnd };
}

function postInWindow(post, startMs, endMs) {
  const t = Number(post.created_utc) * 1000;
  return t >= startMs && t <= endMs;
}

// Per-creator aggregation across all their Reddit accounts.
async function aggregateCreator(creator, accounts, yStartMs, yEndMs, pStartMs, pEndMs) {
  let yPosts = [], pPosts = [];
  for (const a of accounts) {
    // 100 = a day's worth of posts even for a high-volume account
    const list = await fetchSubmitted(a, { limit: 100 });
    for (const p of list) {
      if (isRemoved(p)) continue;
      if (postInWindow(p, yStartMs, yEndMs)) yPosts.push({ ...p, _account: a });
      else if (postInWindow(p, pStartMs, pEndMs)) pPosts.push({ ...p, _account: a });
    }
  }
  const sumUp = (xs) => xs.reduce((s, p) => s + Number(p.ups || 0), 0);
  const sumCm = (xs) => xs.reduce((s, p) => s + Number(p.num_comments || 0), 0);
  const top   = yPosts.slice().sort((a, b) => Number(b.ups) - Number(a.ups))[0] ?? null;
  const subs  = [...new Set(yPosts.map((p) => `r/${p.subreddit}`))];
  return {
    creator,
    accountCount: accounts.length,
    yPostCount: yPosts.length,
    yUpvotes: sumUp(yPosts),
    yComments: sumCm(yPosts),
    pPostCount: pPosts.length,
    pUpvotes: sumUp(pPosts),
    pComments: sumCm(pPosts),
    top,
    subs,
  };
}

function pctChange(today, prev) {
  if (!prev || prev === 0) return today > 0 ? "*new*" : "—";
  const pct = ((today - prev) / prev) * 100;
  return `${pct >= 0 ? "▲" : "▼"}${Math.abs(pct).toFixed(0)}%`;
}

function buildField(row) {
  const lines = [];
  lines.push(`Posts: **${row.yPostCount}**   Upvotes: **${fmtNum(row.yUpvotes)}** ${pctChange(row.yUpvotes, row.pUpvotes)}   Comments: **${fmtNum(row.yComments)}**`);
  if (row.top) {
    const title = String(row.top.title || "").slice(0, 120);
    lines.push(`🏆 [${title}](${fullUrl(row.top)}) — **${fmtNum(row.top.ups)}** upvotes (r/${row.top.subreddit}, u/${row.top._account})`);
  } else {
    lines.push("⚠️ No posts yesterday.");
  }
  if (row.subs.length > 0) {
    lines.push(`Active: ${row.subs.slice(0, 8).join(", ")}${row.subs.length > 8 ? "…" : ""}`);
  }
  return lines.join("\n");
}

async function main() {
  const { yStart, yEnd, pStart, pEnd } = dayWindows();
  const dateLabel = fmtDateInTz(yStart);

  const rows = [];
  for (const c of REDDIT_CREATORS) {
    rows.push(await aggregateCreator(
      c.name, c.accounts,
      yStart.getTime(), yEnd.getTime(),
      pStart.getTime(), pEnd.getTime(),
    ));
  }

  const embed = {
    title: `📊 Daily Reddit — ${dateLabel}`,
    description: `*vs day-before (UK time) · ${rows.length} creators, ${rows.reduce((s, r) => s + r.accountCount, 0)} accounts*`,
    color: 0xFF4500, // Reddit orange
    fields: rows.map((r) => ({
      name: `${r.creator}  ·  ${r.accountCount} ${r.accountCount === 1 ? "acct" : "accts"}`,
      value: buildField(r).slice(0, 1024),
      inline: false,
    })),
    timestamp: new Date().toISOString(),
  };

  const ok = await sendDiscord(WEBHOOK, { embeds: [embed] });
  console.log(JSON.stringify({ creators: rows.length, sent: ok }));
}

main().catch((e) => { console.error(e); process.exit(1); });
