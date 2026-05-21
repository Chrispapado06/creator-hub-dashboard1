#!/usr/bin/env node
// Reddit watcher — runs every 15 minutes. Three jobs in one pass:
//
//   B. Shadowban alerts
//      • Karma drop  : if link_karma drops > 3% (or ≥ 200 absolute)
//                       between consecutive runs, ping shadowban channel.
//      • Silent day  : if no post in the last 24h on a given account,
//                       ping shadowban channel once per UK day.
//      • Removed post: if a post we saw before is now flagged as
//                       removed by Reddit/mods, ping shadowban channel.
//
//   C. Viral alerts
//      • For each post crossing an upvote milestone (500/1k/5k/10k),
//        ping viral channel once per milestone.
//
// State (reddit-state.json) persists between runs — committed back to
// the repo by the GitHub Actions workflow. Holds:
//   { accounts: { <name>: { last_karma_link, last_posts: { <id>: { ups, removed }}, last_silent_alert_day, last_post_at } } }

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

// Look up which creator owns an account (for nicer alert wording).
function creatorOf(account) {
  return REDDIT_CREATORS.find((c) => c.accounts.includes(account))?.name ?? "Unknown";
}

async function sendShadowbanEmbed(title, fields, color = 0xE74C3C) {
  return sendDiscord(HOOK_SHADOWBAN, {
    embeds: [{ title, color, fields, timestamp: new Date().toISOString() }],
  });
}

async function sendViralEmbed(post, milestone, account) {
  const title = String(post.title || "").slice(0, 200);
  const minsAgo = Math.round((Date.now() / 1000 - Number(post.created_utc)) / 60);
  return sendDiscord(HOOK_VIRAL, {
    embeds: [{
      title: `🔥 Viral post — ${creatorOf(account)} hit ${fmtNum(milestone)} upvotes`,
      url: fullUrl(post),
      description: `**${title}**`,
      color: 0xFFA500,
      fields: [
        { name: "Upvotes",   value: `**${fmtNum(post.ups)}**`,        inline: true },
        { name: "Comments",  value: fmtNum(post.num_comments),         inline: true },
        { name: "Subreddit", value: `r/${post.subreddit}`,             inline: true },
        { name: "Account",   value: `u/${account}`,                    inline: true },
        { name: "Posted",    value: `${minsAgo} min ago`,              inline: true },
      ],
      timestamp: new Date().toISOString(),
    }],
  });
}

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

    // ── KARMA DROP detection ─────────────────────────────────────
    const prevKarma = Number(prev.last_karma_link ?? 0);
    if (prevKarma > 0) {
      const dropAbs = prevKarma - about.link_karma;
      const dropPct = (dropAbs / prevKarma) * 100;
      if (dropAbs >= 200 || dropPct >= 3) {
        await sendShadowbanEmbed(
          `📉 Karma drop — ${creator}`,
          [
            { name: "Account",          value: `u/${account}`,                  inline: true },
            { name: "Before",           value: fmtNum(prevKarma),                inline: true },
            { name: "After",            value: fmtNum(about.link_karma),         inline: true },
            { name: "Δ",                value: `−${fmtNum(dropAbs)} (${dropPct.toFixed(1)}%)`, inline: true },
            { name: "Likely cause",     value: "Posts removed by mods or shadowban — check the account.", inline: false },
          ],
        );
        shadowbanAlerts++;
      }
    }

    // ── REMOVED POSTS detection ──────────────────────────────────
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
        await sendShadowbanEmbed(
          `🚫 Post removed — ${creator}`,
          [
            { name: "Account",   value: `u/${account}`,                                inline: true },
            { name: "Subreddit", value: `r/${p.subreddit}`,                            inline: true },
            { name: "Removed by",value: String(p.removed_by_category || "unknown"),   inline: true },
            { name: "Title",     value: String(p.title || "").slice(0, 1020),         inline: false },
            { name: "Was at",    value: `${fmtNum(previous.ups)} upvotes before removal`, inline: false },
          ],
        );
        shadowbanAlerts++;
      }
    }

    // ── SILENT DAY detection ─────────────────────────────────────
    const lastPostAt = posts[0] ? Number(posts[0].created_utc) : (prev.last_post_at ?? 0);
    const hoursSinceLastPost = lastPostAt > 0 ? (now - lastPostAt) / 3600 : 999;
    const alreadyAlertedToday = prev.last_silent_alert_day === today;
    if (hoursSinceLastPost >= 24 && !alreadyAlertedToday) {
      await sendShadowbanEmbed(
        `🔕 No posts in 24h — ${creator}`,
        [
          { name: "Account",   value: `u/${account}`,                                    inline: true },
          { name: "Last post", value: lastPostAt > 0 ? `${Math.round(hoursSinceLastPost)}h ago` : "never seen", inline: true },
          { name: "Action",    value: "Chatter may be slacking, or account could be soft-banned. Check.", inline: false },
        ],
        0xF39C12,
      );
      shadowbanAlerts++;
      prev.last_silent_alert_day = today;
    } else if (hoursSinceLastPost < 24) {
      // Reset once a fresh post lands so next silent stretch alerts again.
      delete prev.last_silent_alert_day;
    }

    // ── VIRAL milestone detection ────────────────────────────────
    const viralState = prev.viral_alerts ?? {};
    for (const p of posts) {
      const ups = Number(p.ups || 0);
      const ageHours = (now - Number(p.created_utc)) / 3600;
      // Only consider posts that are < 48h old (older posts can hit
      // milestones over time but we don't want to spam alerts for
      // historical posts on the first run).
      if (ageHours > 48) continue;
      const alreadyHit = viralState[p.id] ?? [];
      for (const m of VIRAL_MILESTONES) {
        if (ups >= m && !alreadyHit.includes(m)) {
          await sendViralEmbed(p, m, account);
          viralAlerts++;
          alreadyHit.push(m);
        }
      }
      if (alreadyHit.length > 0) viralState[p.id] = alreadyHit;
    }

    // Prune viral state for posts older than 7 days so it doesn't
    // grow unboundedly.
    for (const id of Object.keys(viralState)) {
      const meta = newPosts[id] ?? prevPosts[id];
      if (meta && (now - meta.created_utc) > 7 * 86400) {
        delete viralState[id];
      }
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
