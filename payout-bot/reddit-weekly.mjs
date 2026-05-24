#!/usr/bin/env node
// Weekly Reddit ROI summary — plain-text Discord style, matching
// the Chatter Points Bot look. Runs Sunday evenings ~18:17 UTC.
//
// For each creator, sums the last 7 UK days of posts grouped by
// subreddit (posts, upvotes, avg upvotes/post) plus the top 5
// individual posts. Sent as one message per creator (so each fits
// inside Discord's 2,000-char content cap with breathing room).

import {
  REDDIT_CREATORS, fetchSubmitted, isRemoved, fmtNum, fullUrl,
} from "./reddit-lib.mjs";
import {
  sendDiscord, sendDiscordWithFile, REPORT_TZ, wallTimeToUtc, partsInTz, fmtDateInTz,
} from "./config.mjs";
import { buildWeeklyRoiPdf } from "./pdf-report.mjs";

const WEBHOOK = process.env.DISCORD_WEBHOOK_REDDIT_WEEKLY;
if (!WEBHOOK) { console.error("DISCORD_WEBHOOK_REDDIT_WEEKLY missing"); process.exit(1); }

function lastWeekRange(now = new Date()) {
  const here = partsInTz(now, REPORT_TZ);
  const todayMidUtc = wallTimeToUtc(here.year, here.month, here.day);
  const start = new Date(todayMidUtc.getTime() - 7 * 24 * 3600_000);
  const end = new Date(todayMidUtc.getTime() - 1000);
  return { start, end };
}

async function gatherCreator(creator, accounts, startMs, endMs) {
  const allPosts = [];
  for (const a of accounts) {
    const list = await fetchSubmitted(a, { limit: 100, pages: 4 });
    for (const p of list) {
      const t = Number(p.created_utc) * 1000;
      if (t < startMs) continue;
      if (t > endMs)   continue;
      if (isRemoved(p)) continue;
      allPosts.push({ ...p, _account: a });
    }
  }
  const bySub = new Map();
  for (const p of allPosts) {
    const k = `r/${p.subreddit}`;
    const cur = bySub.get(k) ?? { sub: k, posts: 0, upvotes: 0 };
    cur.posts++;
    cur.upvotes += Number(p.ups || 0);
    bySub.set(k, cur);
  }
  const subStats = [...bySub.values()]
    .map((s) => ({ ...s, avg: s.upvotes / s.posts }))
    .sort((a, b) => b.upvotes - a.upvotes);
  const topPosts = allPosts.slice().sort((a, b) => Number(b.ups) - Number(a.ups)).slice(0, 5);
  return {
    creator,
    accountCount: accounts.length,
    posts: allPosts.length,
    upvotes: allPosts.reduce((s, p) => s + Number(p.ups || 0), 0),
    comments: allPosts.reduce((s, p) => s + Number(p.num_comments || 0), 0),
    subStats,
    topPosts,
  };
}

function buildCreatorMessage(row, periodLabel) {
  const lines = [];
  lines.push(`📊 **WEEKLY REDDIT ROI — ${row.creator}**`);
  lines.push(`*${periodLabel} (UK time) · ${row.accountCount} ${row.accountCount === 1 ? "account" : "accounts"}*`);
  lines.push("");
  lines.push(`**Totals**`);
  lines.push(`  Posts: **${fmtNum(row.posts)}** · Upvotes: **${fmtNum(row.upvotes)}** · Comments: **${fmtNum(row.comments)}**`);

  if (row.posts === 0) {
    lines.push("");
    lines.push(`⚠️ No posts this week — investigate.`);
    return lines.join("\n");
  }

  lines.push("");
  lines.push(`**🏆 Subreddit ROI** *(ranked by upvotes)*`);
  for (const s of row.subStats.slice(0, 8)) {
    lines.push(`  • ${s.sub} — **${fmtNum(s.upvotes)}** ↑ across ${s.posts} posts *(avg ${s.avg.toFixed(0)})*`);
  }
  if (row.subStats.length > 8) lines.push(`  *…and ${row.subStats.length - 8} more*`);

  lines.push("");
  lines.push(`**🏆 Top 5 posts of the week**`);
  row.topPosts.forEach((p, i) => {
    const title = String(p.title || "").slice(0, 80);
    lines.push(`  ${i + 1}. [${title}](<${fullUrl(p)}>) — **${fmtNum(p.ups)}** ↑ *(r/${p.subreddit}, u/${p._account})*`);
  });

  return lines.join("\n");
}

async function main() {
  const { start, end } = lastWeekRange();
  const periodLabel = `${fmtDateInTz(start)} → ${fmtDateInTz(end)}`;

  // Lead message
  let sent = 0;
  const leadOk = await sendDiscord(WEBHOOK,
    `📊 **WEEKLY REDDIT ROI**\n${periodLabel}\n*${REDDIT_CREATORS.length} creators · breakdown below*`
  );
  if (leadOk) sent++;

  for (const c of REDDIT_CREATORS) {
    const row = await gatherCreator(c.name, c.accounts, start.getTime(), end.getTime());
    const text = buildCreatorMessage(row, periodLabel);
    // Attach a per-creator PDF with the same numbers, more readable
    // and archive-able. Falls back to text-only on PDF failure.
    let ok;
    try {
      const pdfBytes = await buildWeeklyRoiPdf({
        creator: row.creator,
        periodLabel,
        totals: { posts: row.posts, upvotes: row.upvotes, comments: row.comments },
        subStats: row.subStats,
        topPosts: row.topPosts,
      });
      const slug = row.creator.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const dateTag = start.toISOString().slice(0, 10);
      ok = await sendDiscordWithFile(
        WEBHOOK, text, `uncvrd-weekly-roi-${slug}-${dateTag}.pdf`, pdfBytes,
      );
    } catch (e) {
      console.warn(`PDF attach failed for ${row.creator}, sending text-only:`, e);
      ok = await sendDiscord(WEBHOOK, text);
    }
    if (ok) sent++;
  }

  console.log(JSON.stringify({ creators: REDDIT_CREATORS.length, messages_sent: sent }));
}

main().catch((e) => { console.error(e); process.exit(1); });
