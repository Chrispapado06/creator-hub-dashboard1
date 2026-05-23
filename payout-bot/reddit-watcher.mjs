#!/usr/bin/env node
// Reddit watcher — runs every 15 minutes. Three jobs in one pass:
//
//   B. Shadowban alerts (→ DISCORD_WEBHOOK_REDDIT_SHADOWBAN)
//      • Karma drop  : link_karma drops > 3% (or ≥ 200 absolute) between runs
//      • Silent day  : no post in the last 24h on an account
//      • Removed post: a post we saw before is now flagged as removed
//
//   C. Viral alerts (→ DISCORD_WEBHOOK_REDDIT_VIRAL)
//      • Post crosses an upvote milestone (500 / 1k / 5k / 10k)
//
// Messages use plain-text Discord (no embeds) — matching the Chatter
// Points Bot style the agency prefers. State (reddit-state.json) is
// committed back to the repo so subsequent runs know what we've
// already seen and alerted on.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REDDIT_CREATORS, eachAccount, fetchAccountAbout, fetchSubmitted,
  isRemoved, fmtNum, fullUrl,
} from "./reddit-lib.mjs";
import { sendDiscord, REPORT_TZ, partsInTz } from "./config.mjs";

const HOOK_SHADOWBAN = process.env.DISCORD_WEBHOOK_REDDIT_SHADOWBAN;
const HOOK_VIRAL     = process.env.DISCORD_WEBHOOK_REDDIT_VIRAL;
if (!HOOK_SHADOWBAN || !HOOK_VIRAL) {
  console.error("DISCORD_WEBHOOK_REDDIT_SHADOWBAN / DISCORD_WEBHOOK_REDDIT_VIRAL missing");
  process.exit(1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(HERE, "reddit-state.json");

const VIRAL_MILESTONES = [500, 1000, 5000, 10000];

async function loadState() {
  try { return JSON.parse(await fs.readFile(STATE_PATH, "utf8")); }
  catch { return { accounts: {} }; }
}
async function saveState(s) {
  await fs.writeFile(STATE_PATH, JSON.stringify(s, null, 2) + "\n");
}

function todayUkYmd() {
  const p = partsInTz(new Date(), REPORT_TZ);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function creatorOf(account) {
  return REDDIT_CREATORS.find((c) => c.accounts.includes(account))?.name ?? "Unknown";
}

// ── Message builders (plain text, Chatter-Bot style) ──────────────

function karmaDropMessage(creator, account, prevKarma, newKarma) {
  const dropAbs = prevKarma - newKarma;
  const dropPct = (dropAbs / prevKarma) * 100;
  return [
    `📉 **KARMA DROP — ${creator}**`,
    ``,
    `**Account:** u/${account}`,
    `**Before:** ${fmtNum(prevKarma)}`,
    `**After:** ${fmtNum(newKarma)}`,
    `**Δ:** −${fmtNum(dropAbs)} (${dropPct.toFixed(1)}%)`,
    ``,
    `*Likely cause: posts removed by mods or shadowban. Check the account.*`,
  ].join("\n");
}

function removedPostMessage(creator, account, post, previous) {
  return [
    `🚫 **POST REMOVED — ${creator}**`,
    ``,
    `**Account:** u/${account}`,
    `**Subreddit:** r/${post.subreddit}`,
    `**Removed by:** ${post.removed_by_category || "unknown"}`,
    `**Title:** ${String(post.title || "").slice(0, 200)}`,
    `**Was at:** ${fmtNum(previous.ups)} upvotes before removal`,
    ``,
    `🔗 <${fullUrl(post)}>`,
  ].join("\n");
}

function silentDayMessage(creator, account, hoursSinceLastPost) {
  return [
    `🔕 **NO POSTS IN 24H — ${creator}**`,
    ``,
    `**Account:** u/${account}`,
    `**Last post:** ${hoursSinceLastPost > 0 ? `${Math.round(hoursSinceLastPost)}h ago` : "never seen"}`,
    ``,
    `*Chatter may be slacking, or account could be soft-banned. Check.*`,
  ].join("\n");
}

function viralMessage(creator, account, post, milestone) {
  const minsAgo = Math.round((Date.now() / 1000 - Number(post.created_utc)) / 60);
  const ageLabel = minsAgo < 60 ? `${minsAgo} min ago` : `${Math.round(minsAgo / 60)}h ago`;
  return [
    `🔥 **VIRAL POST — ${creator}**`,
    ``,
    `**Just crossed ${fmtNum(milestone)} upvotes!**`,
    ``,
    `**Title:** ${String(post.title || "").slice(0, 200)}`,
    `**Upvotes:** ${fmtNum(post.ups)} ↑`,
    `**Comments:** ${fmtNum(post.num_comments)}`,
    `**Subreddit:** r/${post.subreddit}`,
    `**Account:** u/${account}`,
    `**Posted:** ${ageLabel}`,
    ``,
    `🔗 <${fullUrl(post)}>`,
  ].join("\n");
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const state = await loadState();
  state.accounts ??= {};
  const today = todayUkYmd();
  const now = Math.floor(Date.now() / 1000);

  let shadowbanAlerts = 0, viralAlerts = 0;

  for (const { creator, account } of eachAccount()) {
    const [about, posts] = await Promise.all([
      fetchAccountAbout(account),
      fetchSubmitted(account, { limit: 25 }),
    ]);
    if (!about) {
      console.warn(`Skipping ${account} — about fetch failed`);
      continue;
    }

    const prev = state.accounts[account] ?? {};
    const prevPosts = prev.last_posts ?? {};
    const newPosts = {};

    // ── KARMA DROP detection
    const prevKarma = Number(prev.last_karma_link ?? 0);
    if (prevKarma > 0) {
      const dropAbs = prevKarma - about.link_karma;
      const dropPct = (dropAbs / prevKarma) * 100;
      if (dropAbs >= 200 || dropPct >= 3) {
        await sendDiscord(HOOK_SHADOWBAN, karmaDropMessage(creator, account, prevKarma, about.link_karma));
        shadowbanAlerts++;
      }
    }

    // ── REMOVED POSTS detection
    for (const p of posts) {
      const previous = prevPosts[p.id];
      newPosts[p.id] = {
        ups: Number(p.ups || 0),
        comments: Number(p.num_comments || 0),
        removed: isRemoved(p),
        title: p.title,
        subreddit: p.subreddit,
        created_utc: Number(p.created_utc),
      };
      if (previous && !previous.removed && isRemoved(p)) {
        await sendDiscord(HOOK_SHADOWBAN, removedPostMessage(creator, account, p, previous));
        shadowbanAlerts++;
      }
    }

    // ── SILENT DAY detection
    const lastPostAt = posts[0] ? Number(posts[0].created_utc) : (prev.last_post_at ?? 0);
    const hoursSinceLastPost = lastPostAt > 0 ? (now - lastPostAt) / 3600 : 999;
    const alreadyAlertedToday = prev.last_silent_alert_day === today;
    if (hoursSinceLastPost >= 24 && !alreadyAlertedToday) {
      await sendDiscord(HOOK_SHADOWBAN, silentDayMessage(creator, account, hoursSinceLastPost));
      shadowbanAlerts++;
      prev.last_silent_alert_day = today;
    } else if (hoursSinceLastPost < 24) {
      delete prev.last_silent_alert_day;
    }

    // ── VIRAL milestone detection
    const viralState = prev.viral_alerts ?? {};
    for (const p of posts) {
      const ups = Number(p.ups || 0);
      const ageHours = (now - Number(p.created_utc)) / 3600;
      if (ageHours > 48) continue;
      const alreadyHit = viralState[p.id] ?? [];
      for (const m of VIRAL_MILESTONES) {
        if (ups >= m && !alreadyHit.includes(m)) {
          await sendDiscord(HOOK_VIRAL, viralMessage(creator, account, p, m));
          viralAlerts++;
          alreadyHit.push(m);
        }
      }
      if (alreadyHit.length > 0) viralState[p.id] = alreadyHit;
    }

    // Prune viral state for posts >7d old so it doesn't grow forever.
    for (const id of Object.keys(viralState)) {
      const meta = newPosts[id] ?? prevPosts[id];
      if (meta && (now - meta.created_utc) > 7 * 86400) delete viralState[id];
    }

    state.accounts[account] = {
      ...prev,
      last_karma_link: about.link_karma,
      last_karma_total: about.total_karma,
      last_post_at: Math.max(lastPostAt, prev.last_post_at ?? 0),
      last_posts: newPosts,
      viral_alerts: viralState,
      checked_at: new Date().toISOString(),
    };
  }

  await saveState(state);
  console.log(JSON.stringify({
    accounts: eachAccount().length,
    shadowban_alerts: shadowbanAlerts,
    viral_alerts: viralAlerts,
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
