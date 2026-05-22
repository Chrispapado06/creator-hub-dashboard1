#!/usr/bin/env node
// Weekly Reddit poster leaderboard, posted daily as a live running
// total during the cycle. Cycle = Sun 00:00 → Sat 23:59 Dubai (7 days).
//
// Fairness model
//   Every post earns a base of POINTS.per_post; upvotes contribute
//   per_upvote but capped per post; viral milestones bonus on top;
//   removed posts penalise. THEN each account's points are multiplied
//   by its ACCOUNT_TIER.multiplier (warm-up=3×, growing=2×,
//   established=1.5×, mature=1×) so posters running small accounts
//   are rewarded as much as those running mega ones.

import {
  POSTERS, POINTS, ACCOUNT_TIERS, tierFor,
  fetchSubmitted, fetchAccountAbout, isRemoved, fmtNum,
} from "./reddit-lib.mjs";
import {
  sendDiscord, partsInTz, wallTimeToUtc,
} from "./config.mjs";

const WEBHOOK = process.env.DISCORD_WEBHOOK_REDDIT_LEADERBOARD;
if (!WEBHOOK) { console.error("DISCORD_WEBHOOK_REDDIT_LEADERBOARD missing"); process.exit(1); }

const CYCLE_TZ = "Asia/Dubai";

// ── Cycle math: Sun→Sat Dubai, 7 days ────────────────────────────
function currentCycle(now = new Date()) {
  const here = partsInTz(now, CYCLE_TZ);
  const daysBackToSun = here.weekday;                // 0=Sun
  const cycleStartUtc = wallTimeToUtc(here.year, here.month, here.day - daysBackToSun, 0, 0, 0, CYCLE_TZ);
  const cycleEndUtc = new Date(cycleStartUtc.getTime() + 7 * 24 * 3600_000 - 1000);
  const dayOfCycle = here.weekday + 1;               // 1..7 (Sun..Sat)
  return { startUtc: cycleStartUtc, endUtc: cycleEndUtc, dayOfCycle };
}

const fmtShort = (d) => new Intl.DateTimeFormat("en-US", {
  timeZone: CYCLE_TZ, weekday: "short", month: "short", day: "numeric",
}).format(d);

const fmtWeekOf = (d) => new Intl.DateTimeFormat("en-US", {
  timeZone: CYCLE_TZ, month: "long", day: "numeric", year: "numeric",
}).format(d);

// ── Per-account scoring ──────────────────────────────────────────
// Returns the raw point contribution of one account in the window,
// already multiplied by its tier multiplier.
async function scoreAccount(account, startMs, endMs) {
  const [about, posts] = await Promise.all([
    fetchAccountAbout(account),
    fetchSubmitted(account, { limit: 100, pages: 2 }),
  ]);
  const linkKarma = about?.link_karma ?? 0;
  const tier = tierFor(linkKarma);

  let n = 0, upvotes = 0, comments = 0;
  let viral1k = 0, viral5k = 0, removed = 0;

  for (const p of posts) {
    const t = Number(p.created_utc) * 1000;
    if (t < startMs || t > endMs) continue;
    n++;
    const ups = Number(p.ups || 0);
    upvotes  += Math.min(ups, POINTS.upvote_cap_per_post); // cap
    comments += Number(p.num_comments || 0);
    if (isRemoved(p)) removed++;
    if (ups >= 5000) viral5k++;
    if (ups >= 1000) viral1k++;
  }

  const raw =
    n        * POINTS.per_post +
    upvotes  * POINTS.per_upvote +
    viral1k  * POINTS.bonus_viral_1k +
    viral5k  * POINTS.bonus_viral_5k +
    removed  * POINTS.penalty_removed;

  return {
    account, tier,
    posts: n,
    rawUpvotesCapped: upvotes,
    comments,
    viral_1k: viral1k, viral_5k: viral5k, removed,
    points: raw * tier.multiplier,
  };
}

async function scorePoster(poster, startMs, endMs) {
  const accountScores = [];
  for (const a of poster.accounts) {
    accountScores.push(await scoreAccount(a, startMs, endMs));
  }
  const sum = (k) => accountScores.reduce((s, a) => s + a[k], 0);
  return {
    name: poster.name,
    accounts: poster.accounts.length,
    posts: sum("posts"),
    comments: sum("comments"),
    viral_1k: sum("viral_1k"),
    viral_5k: sum("viral_5k"),
    removed: sum("removed"),
    points: Math.round(sum("points")),
    accountScores,
  };
}

// ── Output formatting ────────────────────────────────────────────
const MEDAL = ["🥇", "🥈", "🥉"];

function rankLine(rank, r) {
  const tag = rank < 3 ? MEDAL[rank] : `${rank + 1}.`;
  const extras = [];
  if (r.viral_5k) extras.push(`🌟${r.viral_5k}`);
  if (r.viral_1k) extras.push(`🔥${r.viral_1k}`);
  if (r.removed)  extras.push(`🚫${r.removed}`);
  const tail = extras.length ? `  (${extras.join(" · ")})` : "";
  const bonus = r.bonus_usd != null ? `  →  **$${r.bonus_usd.toFixed(2)}**` : "";
  return `${tag} **${r.name}** — ${r.points} pts${bonus}${tail}`;
}

async function main() {
  const now = new Date();
  const { startUtc, endUtc, dayOfCycle } = currentCycle(now);

  const rows = [];
  for (const p of POSTERS) {
    rows.push(await scorePoster(p, startUtc.getTime(), endUtc.getTime()));
  }
  rows.sort((a, b) => b.points - a.points);

  // ── Bonus distribution ────────────────────────────────────────
  // Each poster's raw bonus = points / points_per_dollar. If the
  // pool of raw bonuses exceeds weekly_bonus_pool_cap_usd, scale
  // everyone down proportionally so the total never exceeds the cap.
  const cap = POINTS.weekly_bonus_pool_cap_usd;
  for (const r of rows) r._raw_bonus = r.points / POINTS.points_per_dollar;
  const rawTotal = rows.reduce((s, r) => s + Math.max(0, r._raw_bonus), 0);
  const scaleFactor = (cap > 0 && rawTotal > cap) ? cap / rawTotal : 1;
  for (const r of rows) r.bonus_usd = Math.max(0, r._raw_bonus * scaleFactor);
  const paidTotal = rows.reduce((s, r) => s + r.bonus_usd, 0);

  const totals = {
    posts:    rows.reduce((s, r) => s + r.posts, 0),
    comments: rows.reduce((s, r) => s + r.comments, 0),
    removed:  rows.reduce((s, r) => s + r.removed, 0),
  };

  const dayNames = ["", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const status = dayOfCycle === 7
    ? `Day 7 of 7 (Sat) · FINAL DAY · cycle closes tonight 23:59 Dubai`
    : `Day ${dayOfCycle} of 7 (${dayNames[dayOfCycle]}) · in progress`;

  const tierLegend = ACCOUNT_TIERS.map((t) => `${t.name} ×${t.multiplier}`).join(" · ");

  const lines = [];
  lines.push(`🏆 **REDDIT POSTER POINTS — WEEK OF ${fmtWeekOf(startUtc)}**`);
  lines.push(`Cycle: ${fmtShort(startUtc)} → ${fmtShort(endUtc)} · Closes Saturday 23:59 Dubai`);
  lines.push(`*${status}*`);
  lines.push("");
  rows.forEach((r, i) => lines.push(rankLine(i, r)));
  lines.push("");
  lines.push(`📊 Posts: **${fmtNum(totals.posts)}** · Comments: **${fmtNum(totals.comments)}** · Removed: **${totals.removed}**`);
  if (cap > 0) {
    const capNote = scaleFactor < 1
      ? `(raw $${rawTotal.toFixed(2)} scaled to cap)`
      : `(under cap)`;
    lines.push(`💰 Bonus pool paid: **$${paidTotal.toFixed(2)} / $${cap.toFixed(2)}** cap ${capNote}`);
  }
  lines.push(`⚖️ Fair scoring: smaller accts have higher multipliers → ${tierLegend}`);
  lines.push(`⏰ Next update: tomorrow morning`);

  const ok = await sendDiscord(WEBHOOK, lines.join("\n"));
  console.log(JSON.stringify({
    posters: rows.length, sent: ok,
    cycle: { start: startUtc.toISOString(), end: endUtc.toISOString(), day: dayOfCycle },
    leaderboard: rows.map((r) => ({ name: r.name, pts: r.points, posts: r.posts })),
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
