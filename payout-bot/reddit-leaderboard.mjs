#!/usr/bin/env node
// Reddit poster leaderboard — upvote-only formula.
//
//   • $1 per 1,000 upvotes (capped 2,000/post) × tier multiplier
//     (warm-up ×3 → mature ×1 — rewards work on small accts)
//   • Flat −$0.10 per removed post (no tier — small accts already
//     attract more mod scrutiny, don't double-punish)
//   • Capped at $50 per poster per week, floored at $0
//
// Cycle = Sun 00:00 → Sat 23:59 Dubai (7 days).
// Posts daily as a running total during the cycle.

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

// ── Cycle math (Sun→Sat Dubai) ───────────────────────────────────
function currentCycle(now = new Date()) {
  const here = partsInTz(now, CYCLE_TZ);
  const daysBackToSun = here.weekday;
  const startUtc = wallTimeToUtc(here.year, here.month, here.day - daysBackToSun, 0, 0, 0, CYCLE_TZ);
  const endUtc   = new Date(startUtc.getTime() + 7 * 24 * 3600_000 - 1000);
  const dayOfCycle = here.weekday + 1; // 1..7 (Sun..Sat)
  return { startUtc, endUtc, dayOfCycle };
}

const fmtShort  = (d) => new Intl.DateTimeFormat("en-US", { timeZone: CYCLE_TZ, weekday: "short", month: "short", day: "numeric" }).format(d);
const fmtWeekOf = (d) => new Intl.DateTimeFormat("en-US", { timeZone: CYCLE_TZ, month: "long", day: "numeric", year: "numeric" }).format(d);

// ── Per-account scoring ──────────────────────────────────────────
async function scoreAccount(account, startMs, endMs) {
  const [about, posts] = await Promise.all([
    fetchAccountAbout(account),
    fetchSubmitted(account, { limit: 100, pages: 2 }),
  ]);
  const tier = tierFor(about?.link_karma ?? 0);

  let n = 0, upvotes = 0, removed = 0;
  for (const p of posts) {
    const t = Number(p.created_utc) * 1000;
    if (t < startMs || t > endMs) continue;
    n++;
    upvotes += Math.min(Number(p.ups || 0), POINTS.upvote_cap_per_post);
    if (isRemoved(p)) removed++;
  }

  // Positive earnings get tier multiplier (rewards small-acct work).
  // Penalty is flat — same -10 pts per removed regardless of tier.
  const positivePts = upvotes * POINTS.per_upvote;
  const penaltyPts  = removed * POINTS.penalty_removed;

  return {
    account, tier,
    posts: n,
    upvotesCapped: upvotes,
    removed,
    positive_pts: positivePts * tier.multiplier,
    penalty_pts:  penaltyPts,
  };
}

async function scorePoster(poster, startMs, endMs) {
  const accs = [];
  for (const account of poster.accounts) {
    accs.push(await scoreAccount(account, startMs, endMs));
  }
  const sum = (k) => accs.reduce((s, a) => s + a[k], 0);
  return {
    name: poster.name,
    accountCount: poster.accounts.length,
    posts:        sum("posts"),
    upvotes:      sum("upvotesCapped"),
    removed:      sum("removed"),
    positive_pts: sum("positive_pts"),
    penalty_pts:  sum("penalty_pts"),
  };
}

// ── Output ───────────────────────────────────────────────────────
const MEDAL = ["🥇", "🥈", "🥉"];

function rankBlock(rank, r) {
  const tag = rank < 3 ? MEDAL[rank] : `${rank + 1}.`;
  const lines = [];
  const capFlag = r.capped ? " 🧢" : "";
  lines.push(`${tag} **${r.name}** — **$${r.bonus_usd.toFixed(2)}**${capFlag}`);
  const parts = [`${fmtNum(r.upvotes)} upvotes`];
  if (r.removed) parts.push(`${r.removed} removed (−$${Math.abs(r.penalty_usd).toFixed(2)})`);
  lines.push(`     ${parts.join(" · ")}`);
  return lines.join("\n");
}

async function main() {
  const now = new Date();
  const { startUtc, endUtc, dayOfCycle } = currentCycle(now);

  const rows = [];
  for (const p of POSTERS) {
    rows.push(await scorePoster(p, startUtc.getTime(), endUtc.getTime()));
  }

  // Final $ tally per poster — upvote-only formula.
  const cap = POINTS.per_poster_weekly_cap_usd;
  for (const r of rows) {
    r.upvote_usd  = r.positive_pts / POINTS.points_per_dollar;
    r.penalty_usd = r.penalty_pts  / POINTS.points_per_dollar;
    const raw = r.upvote_usd + r.penalty_usd;
    const floored = Math.max(0, raw);
    r.bonus_usd = cap > 0 ? Math.min(cap, floored) : floored;
    r.capped = cap > 0 && floored > cap;
  }
  rows.sort((a, b) => b.bonus_usd - a.bonus_usd);

  const totals = {
    posts:   rows.reduce((s, r) => s + r.posts, 0),
    upvotes: rows.reduce((s, r) => s + r.upvotes, 0),
    removed: rows.reduce((s, r) => s + r.removed, 0),
    payout:  rows.reduce((s, r) => s + r.bonus_usd, 0),
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
  rows.forEach((r, i) => lines.push(rankBlock(i, r)));
  lines.push("");
  lines.push(`📊 Posts: **${fmtNum(totals.posts)}** · Upvotes: **${fmtNum(totals.upvotes)}** · Removed: **${totals.removed}**`);
  lines.push(`💰 Payout this cycle: **$${totals.payout.toFixed(2)}** · per-poster cap: **$${cap.toFixed(2)}** ${rows.some(r => r.capped) ? "*(someone hit it)*" : ""}`);
  lines.push(`⚖️ Tier multipliers (upvotes only): ${tierLegend}`);
  lines.push(`⏰ Next update: tomorrow morning`);

  const ok = await sendDiscord(WEBHOOK, lines.join("\n"));
  console.log(JSON.stringify({
    posters: rows.length, sent: ok,
    cycle: { start: startUtc.toISOString(), end: endUtc.toISOString(), day: dayOfCycle },
    leaderboard: rows.map((r) => ({
      name: r.name,
      bonus: +r.bonus_usd.toFixed(2),
      upvotes: r.upvotes,
      removed: r.removed,
    })),
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
