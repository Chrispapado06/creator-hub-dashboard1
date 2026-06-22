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
import { listAccounts, listChats, unansweredThreads } from "./of.mjs";
import {
  tierFor, thresholdsFor, level2Eligible, THRESHOLDS, LOOP, DISCORD, DRY_RUN,
  currentShiftBlock,
} from "./config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, "state.json");

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
    const content = `@everyone ${body}`;
    if (DRY_RUN) {
      console.log(`[${ts()}] DRY_RUN ${label} → #${block.name} (${block.channelId}) @everyone\n    ${content.replace(/\n/g, "\n    ")}`);
      return;
    }
    const r = await fetch(`https://discord.com/api/v10/channels/${block.channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${DISCORD.botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: ["everyone"] } }),
    });
    if (!r.ok) console.warn(`[${ts()}] shift-channel post failed ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
    return;
  }
  // Fallback (no bot token yet): Chatter-QA webhook, ping the QA on shift.
  await post(label, DISCORD.downtimeWebhook, `${ping(block.qaDiscord)} ${body}`, [block.qaDiscord]);
}

// ── One scan pass over all accounts ─────────────────────────────────────────
async function scan(accounts, state, now) {
  const block = currentShiftBlock(now);
  let watched = 0, breaching = 0, fired = 0;
  const unreachable = [];

  for (const acct of accounts) {
    let threads;
    try {
      threads = unansweredThreads(await listChats(acct.accountId), now);
    } catch (e) {
      unreachable.push(`${acct.name}${e.status === 404 ? "" : ` (${e.status || "err"})`}`);
      continue;
    }
    watched++;
    // Keep only actionable threads: a real fan (not another creator's mass-DM),
    // not the account talking to itself, and within the live-downtime window
    // (older = abandoned backlog).
    const th = acct.thresholds; // per-account timings
    threads = threads.filter((t) =>
      !t.fanIsCreator &&
      t.fanUsername.toLowerCase() !== acct.username.toLowerCase() &&
      t.waitedSeconds <= th.maxWaitSec);
    if (!threads.length) continue;

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

  let pass = 0;
  do {
    pass++;
    try { await scan(accounts, state, Date.now()); }
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
