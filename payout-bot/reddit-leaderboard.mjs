#!/usr/bin/env node
// Hybrid Reddit poster leaderboard:
//   • Reddit performance — $1 per 1,000 upvotes × tier multiplier
//   • OF revenue attribution — 0.5% of revenue of the creators this
//     poster's accounts represent, weighted by their share of that
//     creator's Reddit posts in the cycle
//   • Removed-post penalty — flat $0.10 per removed (no tier)
//   • Capped at $50 per poster per week
//
// Cycle = Sun 00:00 → Sat 23:59 Dubai (7 days).
// Posts daily as a running total during the cycle.

import {
  POSTERS, POINTS, ACCOUNT_TIERS, tierFor,
  REDDIT_CREATORS, fetchSubmitted, fetchAccountAbout, isRemoved, fmtNum,
} from "./reddit-lib.mjs";
import {
  CREATORS as OF_CREATORS,
  sendDiscord, partsInTz, wallTimeToUtc,
} from "./config.mjs";

const WEBHOOK = process.env.DISCORD_WEBHOOK_REDDIT_LEADERBOARD;
const OF_KEY  = process.env.ONLYFANSAPI_KEY;
if (!WEBHOOK) { console.error("DISCORD_WEBHOOK_REDDIT_LEADERBOARD missing"); process.exit(1); }
if (!OF_KEY)  { console.error("ONLYFANSAPI_KEY missing");                     process.exit(1); }

const CYCLE_TZ = "Asia/Dubai";

// ── Lookup tables ────────────────────────────────────────────────
// reddit_account → creator name (e.g. "blondejuliaaa" → "Marissa Munoz")
const REDDIT_CREATOR_BY_ACCOUNT = {};
for (const c of REDDIT_CREATORS) for (const a of c.accounts) REDDIT_CREATOR_BY_ACCOUNT[a] = c.name;
// creator name → OF account ID (matches across OF + Reddit configs by name)
const OF_ACCT_BY_CREATOR = Object.fromEntries(
  OF_CREATORS.filter((c) => c.account_id).map((c) => [c.name, c.account_id]),
);

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

// ── OF revenue fetch (the same endpoint used by the daily OF report) ─
async function fetchOfNetRevenue(acctId, startUtc, endUtc) {
  // Pass UTC ISO date portions to OF — its API buckets by calendar
  // day and matches the UI within ±1h, which is more than fine for
  // a 7-day total.
  const startStr = startUtc.toISOString().slice(0, 10) + " 00:00:00";
  const endStr   = endUtc  .toISOString().slice(0, 10) + " 23:59:59";
  const qs = new URLSearchParams({ type: "total", start_date: startStr, end_date: endStr });
  const url = `https://app.onlyfansapi.com/api/${acctId}/statistics/statements/earnings?${qs}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${OF_KEY}` } });
  if (!r.ok) {
    console.warn(`OF revenue ${acctId} → HTTP ${r.status}`);
    return 0;
  }
  const j = await r.json();
  const inner = Object.values(j?.data ?? {})[0] ?? {};
  return Number(inner.total ?? 0); // "total" = net (post-OF-fee)
}

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

  // Positive earnings get tier multiplier (rewards work on small
  // accts). Penalty is flat — small-acct posters already face more
  // mod scrutiny and shouldn't be double-punished.
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
  // Track posts-per-creator so the OF revenue split is fair.
  const postsByCreator = {};
  for (const account of poster.accounts) {
    const a = await scoreAccount(account, startMs, endMs);
    accs.push(a);
    const creator = REDDIT_CREATOR_BY_ACCOUNT[account];
    if (creator) postsByCreator[creator] = (postsByCreator[creator] ?? 0) + a.posts;
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
    postsByCreator,
  };
}

// ── Output ───────────────────────────────────────────────────────
const MEDAL = ["🥇", "🥈", "🥉"];

function rankBlock(rank, r) {
  const tag = rank < 3 ? MEDAL[rank] : `${rank + 1}.`;
  const lines = [];
  const capFlag = r.capped ? " 🧢" : "";
  lines.push(`${tag} **${r.name}** — **$${r.bonus_usd.toFixed(2)}**${capFlag}`);
  // Breakdown
  const parts = [];
  parts.push(`Reddit $${r.upvote_usd.toFixed(2)} *(${fmtNum(r.upvotes)} upvotes)*`);
  parts.push(`OF $${r.of_usd.toFixed(2)}${r.of_revenue_attributed > 0 ? ` *(drove $${fmtNum(Math.round(r.of_revenue_attributed))})*` : ""}`);
  if (r.removed) parts.push(`removed −$${Math.abs(r.penalty_usd).toFixed(2)} *(${r.removed} pulled)*`);
  lines.push(`     ${parts.join(" · ")}`);
  return lines.join("\n");
}

async function main() {
  const now = new Date();
  const { startUtc, endUtc, dayOfCycle } = currentCycle(now);

  // 1. Score every poster — collects upvote/penalty pts + posts-by-creator
  const rows = [];
  for (const p of POSTERS) {
    rows.push(await scorePoster(p, startUtc.getTime(), endUtc.getTime()));
  }

  // 2. Aggregate posts per creator across ALL posters (denominator
  //    for the OF revenue share calc).
  const totalPostsByCreator = {};
  for (const r of rows) {
    for (const [creator, n] of Object.entries(r.postsByCreator)) {
      totalPostsByCreator[creator] = (totalPostsByCreator[creator] ?? 0) + n;
    }
  }

  // 3. Fetch OF revenue ONCE per creator (only those that posters
  //    actually touched and that exist in OF tracking).
  const ofRevByCreator = {};
  for (const creator of Object.keys(totalPostsByCreator)) {
    const acctId = OF_ACCT_BY_CREATOR[creator];
    if (!acctId) continue; // creator not in OF tracking
    ofRevByCreator[creator] = await fetchOfNetRevenue(acctId, startUtc, endUtc);
  }

  // 4. Compute OF bonus per poster from their share × revenue × rate.
  for (const r of rows) {
    let attributedRev = 0;
    for (const [creator, postCount] of Object.entries(r.postsByCreator)) {
      const rev = ofRevByCreator[creator] ?? 0;
      const totalPosts = totalPostsByCreator[creator] || 1;
      attributedRev += rev * (postCount / totalPosts);
    }
    r.of_revenue_attributed = attributedRev;
  }

  // 5. Final $ tally per poster.
  const cap = POINTS.per_poster_weekly_cap_usd;
  for (const r of rows) {
    r.upvote_usd = r.positive_pts / POINTS.points_per_dollar;
    r.penalty_usd = r.penalty_pts / POINTS.points_per_dollar;
    r.of_usd = r.of_revenue_attributed * POINTS.revenue_rate;
    const raw = r.upvote_usd + r.of_usd + r.penalty_usd;
    const floored = Math.max(0, raw);
    r.bonus_usd = cap > 0 ? Math.min(cap, floored) : floored;
    r.capped = cap > 0 && floored > cap;
  }
  rows.sort((a, b) => b.bonus_usd - a.bonus_usd);

  // 6. Build the message
  const totals = {
    posts:    rows.reduce((s, r) => s + r.posts, 0),
    upvotes:  rows.reduce((s, r) => s + r.upvotes, 0),
    removed:  rows.reduce((s, r) => s + r.removed, 0),
    payout:   rows.reduce((s, r) => s + r.bonus_usd, 0),
    of_total: Object.values(ofRevByCreator).reduce((s, x) => s + x, 0),
  };

  const dayNames = ["", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const status = dayOfCycle === 7
    ? `Day 7 of 7 (Sat) · FINAL DAY · cycle closes tonight 23:59 Dubai`
    : `Day ${dayOfCycle} of 7 (${dayNames[dayOfCycle]}) · in progress`;

  const tierLegend = ACCOUNT_TIERS.map((t) => `${t.name} ×${t.multiplier}`).join(" · ");
  const ofCreatorsTouched = Object.keys(ofRevByCreator).filter((c) => ofRevByCreator[c] > 0);

  const lines = [];
  lines.push(`🏆 **REDDIT POSTER POINTS — WEEK OF ${fmtWeekOf(startUtc)}**`);
  lines.push(`Cycle: ${fmtShort(startUtc)} → ${fmtShort(endUtc)} · Closes Saturday 23:59 Dubai`);
  lines.push(`*${status}*`);
  lines.push("");
  rows.forEach((r, i) => lines.push(rankBlock(i, r)));
  lines.push("");
  lines.push(`📊 Posts: **${fmtNum(totals.posts)}** · Upvotes: **${fmtNum(totals.upvotes)}** · Removed: **${totals.removed}**`);
  lines.push(`💰 Payout this cycle: **$${totals.payout.toFixed(2)}** · per-poster cap: **$${cap.toFixed(2)}** ${rows.some(r => r.capped) ? "*(someone hit it)*" : ""}`);
  if (ofCreatorsTouched.length) {
    lines.push(`📈 OF revenue tracked: **$${fmtNum(Math.round(totals.of_total))}** across ${ofCreatorsTouched.join(", ")} · 0.5% revenue-share`);
  }
  lines.push(`⚖️ Tier multipliers (upvotes only): ${tierLegend}`);
  lines.push(`⏰ Next update: tomorrow morning`);

  const ok = await sendDiscord(WEBHOOK, lines.join("\n"));
  console.log(JSON.stringify({
    posters: rows.length, sent: ok,
    cycle: { start: startUtc.toISOString(), end: endUtc.toISOString(), day: dayOfCycle },
    leaderboard: rows.map((r) => ({
      name: r.name,
      bonus: +r.bonus_usd.toFixed(2),
      reddit: +r.upvote_usd.toFixed(2),
      of: +r.of_usd.toFixed(2),
      penalty: +r.penalty_usd.toFixed(2),
      attributed_rev: Math.round(r.of_revenue_attributed),
    })),
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
