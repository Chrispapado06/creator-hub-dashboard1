#!/usr/bin/env node
// Weekly Reddit ROI summary.
//
// Runs Sunday evenings ~18:17 UTC. For each creator, sums the last 7
// UK days of posts grouped by subreddit:
//   • posts published
//   • total upvotes
//   • avg upvotes per post
// …so Luca can see which subreddits are pulling weight and which to
// drop. Also lists the top 5 individual posts of the week.

import {
  REDDIT_CREATORS, fetchSubmitted, isRemoved, fmtNum, fullUrl,
} from "./reddit-lib.mjs";
import {
  sendDiscord, REPORT_TZ, wallTimeToUtc, partsInTz, fmtDateInTz,
} from "./config.mjs";

const WEBHOOK = process.env.DISCORD_WEBHOOK_REDDIT_WEEKLY;
if (!WEBHOOK) { console.error("DISCORD_WEBHOOK_REDDIT_WEEKLY missing"); process.exit(1); }

// Last 7 UK days ending tonight.
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
    // Paginate: in a busy week an account can have >100 posts.
    const list = await fetchSubmitted(a, { limit: 100, pages: 4 });
    for (const p of list) {
      const t = Number(p.created_utc) * 1000;
      if (t < startMs) continue;
      if (t > endMs) continue;
      if (isRemoved(p)) continue;
      allPosts.push({ ...p, _account: a });
    }
  }

  // Group by subreddit
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

  const topPosts = allPosts
    .slice()
    .sort((a, b) => Number(b.ups) - Number(a.ups))
    .slice(0, 5);

  const totalUp = allPosts.reduce((s, p) => s + Number(p.ups || 0), 0);
  const totalCm = allPosts.reduce((s, p) => s + Number(p.num_comments || 0), 0);

  return {
    creator,
    accountCount: accounts.length,
    posts: allPosts.length,
    upvotes: totalUp,
    comments: totalCm,
    subStats,
    topPosts,
  };
}

function buildCreatorEmbed(row, periodLabel) {
  const subTable = row.subStats.slice(0, 8).map((s) =>
    `• ${s.sub} — **${fmtNum(s.upvotes)}** upvotes across ${s.posts} posts *(avg ${s.avg.toFixed(0)})*`
  ).join("\n");

  const topTable = row.topPosts.map((p, i) => {
    const title = String(p.title || "").slice(0, 90);
    return `${i + 1}. [${title}](${fullUrl(p)}) — **${fmtNum(p.ups)}** ↑ (r/${p.subreddit}, u/${p._account})`;
  }).join("\n");

  const fields = [];
  fields.push({
    name: "Totals",
    value: `Posts: **${row.posts}** · Upvotes: **${fmtNum(row.upvotes)}** · Comments: **${fmtNum(row.comments)}**`,
    inline: false,
  });
  if (subTable) {
    fields.push({ name: "Subreddit ROI (ranked by upvotes)", value: subTable.slice(0, 1024), inline: false });
  }
  if (topTable) {
    fields.push({ name: "🏆 Top 5 posts of the week", value: topTable.slice(0, 1024), inline: false });
  }
  if (row.posts === 0) {
    fields.push({ name: "Note", value: "No posts in the window — investigate.", inline: false });
  }

  return {
    title: `${row.creator}  ·  ${row.accountCount} ${row.accountCount === 1 ? "account" : "accounts"}`,
    description: `*${periodLabel} (UK time)*`,
    color: 0xFF4500,
    fields,
  };
}

async function main() {
  const { start, end } = lastWeekRange();
  const periodLabel = `${fmtDateInTz(start)} → ${fmtDateInTz(end)}`;

  // Send a lead header first, then ONE message per creator. Discord
  // caps total embed payload at 6000 chars per message — too tight
  // when we cram all 4 creators into one. One-creator-per-message
  // scales cleanly and keeps each block readable on its own.
  let sent = 0;
  const lead = await sendDiscord(WEBHOOK, {
    embeds: [{
      title: "📊 Weekly Reddit ROI",
      description: `${periodLabel}\n${REDDIT_CREATORS.length} creators · breakdown below`,
      color: 0x2ECC71,
    }],
  });
  if (lead) sent++;

  for (const c of REDDIT_CREATORS) {
    const row = await gatherCreator(c.name, c.accounts, start.getTime(), end.getTime());
    const ok = await sendDiscord(WEBHOOK, { embeds: [buildCreatorEmbed(row, periodLabel)] });
    if (ok) sent++;
  }

  console.log(JSON.stringify({ creators: REDDIT_CREATORS.length, messages_sent: sent }));
}

main().catch((e) => { console.error(e); process.exit(1); });
