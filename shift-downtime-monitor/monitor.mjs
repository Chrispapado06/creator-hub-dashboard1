// ─────────────────────────────────────────────────────────────────────────
// Shift Downtime Monitor — entry point (v1).
//
// Watches every reachable OF account for fan messages left unanswered and
// escalates in Discord, pinging the QA on shift:
//
//   ≥ 5 min  (level 1) → ping the on-shift QA in the Chatter-QA channel
//   ≥ 10 min (level 2, A/B tier only) → escalate (ping QA again)
//   ≥ 20 min (level 3) → message Management
//
// Detection unit is the ACCOUNT: it "is down" when its OLDEST unanswered fan
// thread crosses a threshold. That oldest fan-message timestamp is the breach
// "episode" key, so each level fires exactly once per breach.
//
// v1 keeps it simple and dependency-free:
//   • On-shift QA comes from the current Philippine time → shift block
//     (config SHIFT_BLOCKS). No database, no sheet.
//   • Idempotency is a committed state.json ledger (like payout-bot), so the
//     5-min cron never re-sends the same breach.
//   • Per-block CHATTER pings + the sheet sync are v2.
//
// Safe by default: with no webhook configured it runs DRY_RUN (logs only).
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sendDiscord } from "../payout-bot/config.mjs";
import {
  listAccounts, listChats, listTransactions, unansweredThreads,
  listUserLists, listListMemberIds, recentReplies,
  addUserToList, removeUserFromList, createUserList,
} from "./of.mjs";
import {
  tierFor, thresholdsFor, level2Eligible, THRESHOLDS, LOOP, DISCORD, DRY_RUN,
  currentShiftBlock, WHALE, LIST_AUTO,
} from "./config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, "state.json");
const WHALES_FILE = resolve(__dirname, "whales.json");
const LASTSPEND_FILE = resolve(__dirname, "lastspend.json");

const ts = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const fmtAge = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`);
const ping = (id) => (id ? `<@${id}>` : "(no QA id)");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── state.json idempotency ledger ───────────────────────────────────────────
function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); }
  catch { return { alerted: {} }; }
}
function saveState(state) {
  // Drop entries older than 24h so the file stays small (a breach that old is
  // long resolved; its episode key won't recur).
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const [k, v] of Object.entries(state.alerted)) {
    if (Date.parse(v) < cutoff) delete state.alerted[k];
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}
// Claim (account, episode, level): true the first time only.
function claim(state, key) {
  if (state.alerted[key]) return false;
  state.alerted[key] = new Date().toISOString();
  return true;
}

// ── Discord send (or DRY_RUN log) ───────────────────────────────────────────
async function post(label, url, content, mentions) {
  if (DRY_RUN || !url) {
    console.log(`[${ts()}] DRY_RUN ${label} →\n    ${content.replace(/\n/g, "\n    ")}`);
    return;
  }
  await sendDiscord(url, {
    content,
    allowed_mentions: { parse: [], users: mentions.filter(Boolean) },
  });
}

// The primary downtime ping → the time-appropriate shift channel, @everyone,
// via the bot. Falls back to the Chatter-QA webhook (pinging the QA) when the
// bot token isn't configured yet, so alerts never silently stop.
async function postPrimary(label, block, body) {
  if (DISCORD.botToken && block.channelId) {
    // Ping the shift role (falls back to @everyone if no role configured).
    const mention = block.roleId ? `<@&${block.roleId}>` : "@everyone";
    const allowed = block.roleId ? { parse: [], roles: [block.roleId] } : { parse: ["everyone"] };
    const content = `${mention} ${body}`;
    if (DRY_RUN) {
      console.log(`[${ts()}] DRY_RUN ${label} → #${block.name} (${block.channelId}) mention ${mention}\n    ${content.replace(/\n/g, "\n    ")}`);
      return;
    }
    const r = await fetch(`https://discord.com/api/v10/channels/${block.channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${DISCORD.botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: allowed }),
    });
    if (!r.ok) console.warn(`[${ts()}] shift-channel post failed ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
    return;
  }
  // Fallback (no bot token yet): Chatter-QA webhook, ping the QA on shift.
  await post(label, DISCORD.downtimeWebhook, `${ping(block.qaDiscord)} ${body}`, [block.qaDiscord]);
}

// Post a whale/purchase flag into #chatter-pins-qa-pins (bot token), or log.
async function postQaPins(label, body) {
  // Prefer the webhook (bulletproof, no bot permission needed).
  if (!DRY_RUN && DISCORD.qaPinsWebhook) {
    await sendDiscord(DISCORD.qaPinsWebhook, { content: body, allowed_mentions: { parse: [] } });
    return;
  }
  if (DRY_RUN || !DISCORD.botToken || !DISCORD.qaPinsChannelId) {
    console.log(`[${ts()}] DRY_RUN ${label} → qa-pins (${DISCORD.qaPinsChannelId || "unset"})\n    ${body.replace(/\n/g, "\n    ")}`);
    return;
  }
  const r = await fetch(`https://discord.com/api/v10/channels/${DISCORD.qaPinsChannelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${DISCORD.botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: body, allowed_mentions: { parse: [] } }),
  });
  if (!r.ok) console.warn(`[${ts()}] qa-pins post failed ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
}

const money = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, "")}`;
const spendVerb = (type) => (/tip/i.test(type) ? "tipped" : /subscri/i.test(type) ? "subscribed" : "spent");

// ── Whale set (cached) ──────────────────────────────────────────────────────
// whales.json: { refreshedAt, byAccount: { acctId: [fanId,...] } }. The whale
// set = members of each account's high-spend lists, refreshed every
// WHALE.refreshHours so the per-run cost is just the transactions poll.
function loadWhales() {
  try { return JSON.parse(readFileSync(WHALES_FILE, "utf8")); } catch { return { refreshedAt: null, byAccount: {} }; }
}
function saveWhales(w) { writeFileSync(WHALES_FILE, JSON.stringify(w, null, 2) + "\n"); }

async function refreshWhaleSets(accounts, whales, now) {
  const pat = new RegExp(WHALE.listPattern, "i");
  const exclPat = new RegExp(LIST_AUTO.excludePattern, "i");
  whales.excludeByAccount ??= {};
  for (const acct of accounts) {
    if (!WHALE.tiers.includes(acct.tier)) continue;
    try {
      const lists = await listUserLists(acct.accountId);
      const whaleLists = lists.filter((l) => pat.test(l.name));
      const ids = new Set();
      for (const l of whaleLists) for (const id of await listListMemberIds(acct.accountId, l.id)) ids.add(id);
      whales.byAccount[acct.accountId] = [...ids];
      // #1 — cache ALL exclude ("no MM") lists; the right shift's one is picked
      // at reply-time so it stays correct as shifts roll over.
      const exclLists = lists.filter((l) => exclPat.test(l.name)).map((l) => ({ id: l.id, name: l.name }));
      whales.excludeByAccount[acct.accountId] = exclLists;
      console.log(`[${ts()}] lists ${acct.name}: ${ids.size} whales · ${exclLists.length} exclude list(s)`);
    } catch (e) { console.warn(`[${ts()}] list refresh ${acct.name} failed: ${e.message}`); }
  }
  whales.refreshedAt = new Date(now).toISOString();
  saveWhales(whales);
}

// ── #1 exclude-on-reply ─────────────────────────────────────────────────────
// When a chatter replies to a fan, add that fan to the account's exclude list
// (so they don't get mass-messaged this shift). Dry-run by default.
async function applyExcludeOnReply(acct, chats, state, whales, now) {
  if (!LIST_AUTO.enabled) return;
  // Pick the exclude list matching the current shift (fall back to first).
  const candidates = whales?.excludeByAccount?.[acct.accountId] || [];
  const shiftName = currentShiftBlock(now).name.toLowerCase();
  const excl = candidates.find((c) => c.name.toLowerCase().includes(shiftName)) ?? candidates[0];
  const day = new Date(now).toISOString().slice(0, 10);
  for (const r of recentReplies(chats, now, LIST_AUTO.replyWindowSec)) {
    if (!claim(state, `excl|${acct.accountId}|${r.fanId}|${day}`)) continue; // once per fan per day
    if (!excl) { console.log(`[${ts()}] #1 ${acct.name}: replied @${r.fanUsername} — NO exclude list found`); continue; }
    if (LIST_AUTO.writes) {
      try { await addUserToList(acct.accountId, excl.id, r.fanId); console.log(`[${ts()}] #1 ${acct.name}: added @${r.fanUsername} → "${excl.name}"`); }
      catch (e) { console.warn(`[${ts()}] #1 ${acct.name}: add @${r.fanUsername} failed: ${e.message}`); }
    } else {
      console.log(`[${ts()}] #1 DRY ${acct.name}: would add @${r.fanUsername} → exclude list "${excl.name}"`);
    }
  }
}

// ── #2 idle-spender mover (last-spend store + inactivity sweep) ──────────────
function loadLastSpend() { try { return JSON.parse(readFileSync(LASTSPEND_FILE, "utf8")); } catch { return { byAccount: {} }; } }
function saveLastSpend(ls) { writeFileSync(LASTSPEND_FILE, JSON.stringify(ls) + "\n"); }

// Record each fan's most-recent spend date (builds the history #2 needs).
function recordSpend(lastSpend, accountId, txns) {
  const m = (lastSpend.byAccount[accountId] ??= {});
  for (const t of txns) {
    if (!t.fanId || !t.createdAt) continue;
    if (!m[t.fanId] || t.createdAt > m[t.fanId]) m[t.fanId] = t.createdAt;
  }
}

// Once accurate (after ~max(inactivityDays) days of recording), move fans who
// crossed an inactivity threshold into the matching "No spend Nd" list.
async function sweepInactivity(accounts, lastSpend, state, now) {
  if (!LIST_AUTO.enabled) return 0;
  const bands = [...LIST_AUTO.inactivityDays].sort((a, b) => b - a); // largest first
  let n = 0;
  for (const acct of accounts) {
    if (!WHALE.tiers.includes(acct.tier)) continue;
    const ls = lastSpend.byAccount[acct.accountId] || {};
    for (const [fanId, iso] of Object.entries(ls)) {
      const days = (now - Date.parse(iso)) / 86400000;
      const band = bands.find((b) => days >= b);
      if (band == null) continue;
      if (!claim(state, `nospend|${acct.accountId}|${fanId}|${band}`)) continue;
      n++;
      console.log(`[${ts()}] #2 DRY ${acct.name}: fan ${fanId} ${Math.floor(days)}d no spend → would move to "${LIST_AUTO.noSpendListPrefix} ${band}d"`);
    }
  }
  return n;
}

// Once per run: flag spend by WHALES (high-spend-list members), or any single
// purchase ≥ WHALE.hardFloor. Idempotent per txn id; only recent (lookback).
async function sweepTransactions(accounts, state, whales, lastSpend, now) {
  if (!WHALE.enabled) return 0;
  const watch = accounts.filter((a) => WHALE.tiers.includes(a.tier));
  let flagged = 0;
  for (const acct of watch) {
    const whaleSet = new Set(whales.byAccount[acct.accountId] || []);
    let txns;
    try { txns = await listTransactions(acct.accountId, { limit: 20 }); }
    catch { continue; }
    recordSpend(lastSpend, acct.accountId, txns); // #2 — build last-spend history
    for (const t of txns) {
      const ageSec = (now - Date.parse(t.createdAt)) / 1000;
      if (ageSec > WHALE.lookbackSec) continue;
      const isWhale = whaleSet.has(t.fanId);
      const bigOneOff = WHALE.hardFloor > 0 && t.amount >= WHALE.hardFloor;
      if (!isWhale && !bigOneOff) continue;
      if (!claim(state, `tx|${acct.accountId}|${t.id}`)) continue;
      flagged++;
      const link = t.fanUsername ? ` · <https://onlyfans.com/${t.fanUsername}>` : "";
      const tag = isWhale ? "🐋" : "💸";
      await postQaPins(`whale ${acct.name}`,
        `${tag} **${acct.name}** — **${t.fanName}**${t.fanUsername ? ` (@${t.fanUsername})` : ""} ${spendVerb(t.type)} **${money(t.amount)}** (${t.type})${link}`);
    }
  }
  return flagged;
}

// ── One scan pass over all accounts ─────────────────────────────────────────
async function scan(accounts, state, whales, now) {
  const block = currentShiftBlock(now);
  let watched = 0, breaching = 0, fired = 0;
  const unreachable = [];

  for (const acct of accounts) {
    let chats;
    try {
      chats = await listChats(acct.accountId);
    } catch (e) {
      unreachable.push(`${acct.name}${e.status === 404 ? "" : ` (${e.status || "err"})`}`);
      continue;
    }
    watched++;
    let threads = unansweredThreads(chats, now);
    // #1 — exclude-on-reply (dry-run by default), independent of downtime.
    await applyExcludeOnReply(acct, chats, state, whales, now);
    // Keep only actionable threads: a real fan (not another creator's mass-DM),
    // not the account talking to itself, and within the live-downtime window
    // (older = abandoned backlog).
    const th = acct.thresholds; // per-account timings
    threads = threads.filter((t) =>
      !t.fanIsCreator &&
      t.fanUsername.toLowerCase() !== acct.username.toLowerCase() &&
      t.waitedSeconds <= th.maxWaitSec);
    if (!threads.length) continue;

    // #4 — whale activity: a whale on this account is messaging and waiting →
    // flag QAs in #chatter-pins-qa-pins (any wait, so whales surface fast).
    const whaleSet = new Set(whales?.byAccount?.[acct.accountId] || []);
    if (whaleSet.size) {
      for (const t of threads) {
        if (!whaleSet.has(String(t.fanId))) continue;
        if (!claim(state, `wact|${acct.accountId}|${t.fanMessageAt}`)) continue;
        const link = t.fanUsername ? ` · <https://onlyfans.com/${t.fanUsername}>` : "";
        await postQaPins(`whale-active ${acct.name}`,
          `🐋 **${acct.name}** — whale **${t.fanUsername}** is messaging, waiting **${fmtAge(t.waitedSeconds)}**${link}`);
      }
    }

    const oldest = threads[0]; // longest-waiting actionable thread drives the breach
    const waited = oldest.waitedSeconds;
    if (waited < th.level1Sec) continue;
    breaching++;

    const ep = `${acct.accountId}|${oldest.fanMessageAt}`;
    const mins = Math.floor(waited / 60);
    const who = `(QA on shift: ${block.qaName})`;

    // Level 1 — downtime ping → the shift channel, @everyone on shift.
    if (claim(state, `${ep}|1`)) {
      fired++;
      await postPrimary(`L1 ${acct.name}`, block,
        `🔴 **Downtime — ${acct.name}** — fan @${oldest.fanUsername} has waited **${fmtAge(waited)}** unanswered. Please respond. ${who}`);
    }

    // Level 2 — escalate (A/B tier, or accounts with a custom override).
    if (waited >= th.level2Sec && acct.l2 && claim(state, `${ep}|2`)) {
      fired++;
      await postPrimary(`L2 ${acct.name}`, block,
        `🟠 **Still down ${mins}m — ${acct.name}** (fan @${oldest.fanUsername}) — chatter still hasn't replied. ${who}`);
    }

    // Level 3 — message Management.
    if (waited >= th.level3Sec && claim(state, `${ep}|3`)) {
      fired++;
      await post(`L3 ${acct.name}`, DISCORD.groupWebhook,
        `⚠️ **${Math.floor(th.level3Sec / 60)}+ min no response — ${acct.name}** — fan @${oldest.fanUsername} has waited **${fmtAge(waited)}**.\n` +
        `QA ${ping(block.qaDiscord)} — needs immediate attention. ${who}`,
        [block.qaDiscord]);
    }
  }

  console.log(
    `[${ts()}] scan (${block.name}/${block.qaName}): ${watched} watched, ${breaching} breaching, ` +
    `${fired} alert(s) fired` +
    (unreachable.length ? `, ${unreachable.length} UNREACHABLE: ${unreachable.join(", ")}` : ""),
  );
}

// ── Main: tight loop for one cron invocation ────────────────────────────────
(async () => {
  // Watch EVERY authenticated OF account (so new creators are auto-included).
  // Tier comes from config overrides; everything else defaults sanely.
  const all = await listAccounts();
  const accounts = all
    .filter((a) => a.authenticated)
    .map((a) => ({
      name: a.name, username: a.username, accountId: a.accountId,
      tier: tierFor(a.username),
      thresholds: thresholdsFor(a.username), // per-account timings (e.g. Ella/Antonella 3→5 min)
      l2: level2Eligible(a.username),
    }));
  const needAuth = all.filter((a) => !a.authenticated).map((a) => a.name);
  const state = loadState();
  const deadline = Date.now() + LOOP.durationSec * 1000;

  console.log(
    `[${ts()}] Shift Downtime Monitor v1 — watching ${accounts.length} accounts ` +
    `(${accounts.map((a) => a.name).join(", ")}), ` +
    `thresholds ${THRESHOLDS.level1Sec / 60}/${THRESHOLDS.level2Sec / 60}/${THRESHOLDS.level3Sec / 60}m, ` +
    `${DRY_RUN ? "DRY_RUN" : "LIVE"}.` +
    (needAuth.length ? ` ⚠ NOT authenticated (needs re-auth): ${needAuth.join(", ")}.` : ""),
  );

  // Load + refresh the cached whale set (used by both the spend sweep and the
  // whale-activity flags). Refreshed only when older than WHALE.refreshHours.
  let whales = { byAccount: {} };
  const lastSpend = loadLastSpend();
  if (WHALE.enabled) {
    whales = loadWhales();
    const staleMs = WHALE.refreshHours * 3600 * 1000;
    if (!whales.refreshedAt || Date.now() - Date.parse(whales.refreshedAt) > staleMs) {
      console.log(`[${ts()}] refreshing whale + exclude lists…`);
      try { await refreshWhaleSets(accounts, whales, Date.now()); }
      catch (e) { console.error(`[${ts()}] list refresh error: ${e.message}`); }
    }
    try {
      const flagged = await sweepTransactions(accounts, state, whales, lastSpend, Date.now());
      if (flagged) console.log(`[${ts()}] whale sweep: ${flagged} spend flag(s)`);
    } catch (e) { console.error(`[${ts()}] whale sweep error: ${e.message}`); }
    saveState(state);
  }
  // #2 — move idle spenders (dry-run). Recording starts now; accurate after
  // it's been running ~max(inactivityDays) days.
  if (LIST_AUTO.enabled) {
    try {
      const moved = await sweepInactivity(accounts, lastSpend, state, Date.now());
      if (moved) console.log(`[${ts()}] #2 inactivity: ${moved} would-move(s)`);
    } catch (e) { console.error(`[${ts()}] inactivity sweep error: ${e.message}`); }
    saveLastSpend(lastSpend);
    saveState(state);
  }

  let pass = 0;
  do {
    pass++;
    try { await scan(accounts, state, whales, Date.now()); }
    catch (e) { console.error(`[${ts()}] scan pass #${pass} error: ${e.message}`); }
    saveState(state); // persist after every pass so a crash mid-loop keeps idempotency
    if (Date.now() + LOOP.everySec * 1000 < deadline) await sleep(LOOP.everySec * 1000);
    else break;
  } while (Date.now() < deadline);

  console.log(`[${ts()}] Done — ${pass} pass(es).`);
})().catch((e) => {
  console.error("Monitor failed:", e);
  process.exit(1);
});
