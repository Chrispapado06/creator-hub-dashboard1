// Config for the Shift Downtime Monitor.
//
// Account list + account ids come from the existing payout-bot CREATORS
// config (single source of truth for which OF accounts we track). Here we add
// only what the monitor needs on top of that: per-account TIER and Discord
// channel, the escalation thresholds, and the Discord routing.

import { CREATORS } from "../payout-bot/config.mjs";
export { CREATORS };

// ── Per-account metadata ────────────────────────────────────────────────────
// Keyed by OF username. `tier` gates the 10-min (level-2) escalation — it only
// fires for A/B tier. Accounts not listed default to tier "C" (no level-2).
//
// >>> FILL THESE IN. Tiers are placeholders. <<<
export const ACCOUNT_META = {
  // username             tier
  "bluebeari3vip":     { tier: "A" },
  "flame_fantasy_xx":  { tier: "B" },
  "emmasonne":         { tier: "B" },
  "marissa.munoz":     { tier: "B" },
  "thisisjunee":       { tier: "C" },
  "juliejswan":        { tier: "C" },
};

// ── Escalation thresholds (seconds) ─────────────────────────────────────────
export const THRESHOLDS = {
  level1Sec: 5 * 60,   // ≥5 min unanswered  → ping QA on shift
  level2Sec: 10 * 60,  // ≥10 min (A/B only) → escalate (ping QA again)
  level3Sec: 20 * 60,  // ≥20 min            → message Management
  // Ignore threads older than this — they're abandoned backlog, not live
  // "downtime on shift" (and stop cold-start spam on first deploy).
  maxWaitSec: 60 * 60,
};

// Tiers eligible for the level-2 (10-min) escalation.
export const LEVEL2_TIERS = new Set(["A", "B"]);

// ── Shift blocks (who is the QA on shift right now) ─────────────────────────
// The schedule runs 3 daily shift blocks in Philippine time (the sheet stamps
// every date "PH"). Each block has a QA. v1 resolves the on-shift QA purely
// from the current PH time → no sheet/database needed. (Per-block CHATTER
// resolution from the sheet comes in v2.) Update QA ids when the rota changes.
export const SHIFT_TZ = "Asia/Manila"; // GMT+8, no DST
export const SHIFT_BLOCKS = [
  { name: "Shift 1", qaName: "Lance", qaDiscord: "1358891208935608532", startHour: 0,  endHour: 8 },
  { name: "Shift 2", qaName: "Liz",   qaDiscord: "714697188545921054",  startHour: 8,  endHour: 16 },
  { name: "Shift 3", qaName: "Yen",   qaDiscord: "1267138323999359027", startHour: 16, endHour: 24 },
];

// Hour-of-day (0–24, fractional) in a timezone.
function hourInTz(date, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  return (g("hour") % 24) + g("minute") / 60;
}

// The shift block active at `now` (defaults to last block as a safety net).
export function currentShiftBlock(now = Date.now()) {
  const h = hourInTz(new Date(now), SHIFT_TZ);
  return SHIFT_BLOCKS.find((b) => h >= b.startHour && h < b.endHour) ?? SHIFT_BLOCKS.at(-1);
}

// ── Tight-timing loop ───────────────────────────────────────────────────────
// GitHub Actions cron floors at ~5 min and runs late, so each invocation runs
// its own sub-minute poll loop to hit the 5/10/20 thresholds closely. A 5-min
// cron + this loop = continuous coverage.
export const LOOP = {
  everySec: Number(process.env.MONITOR_LOOP_EVERY_SEC || 45),       // poll cadence within a run
  durationSec: Number(process.env.MONITOR_LOOP_DURATION_SEC || 270), // run for ~4.5 min, then exit
};

// ── Discord routing (env / GitHub secrets) ──────────────────────────────────
// Two channels, posted via incoming webhooks:
//   Chatter-QA  → DISCORD_WEBHOOK_DOWNTIME (level 1 ping + level 2 escalation)
//   Management  → DISCORD_WEBHOOK_GROUP    (level 3, "personal message to the Group")
export const DISCORD = {
  downtimeWebhook: process.env.DISCORD_WEBHOOK_DOWNTIME || "",
  groupWebhook: process.env.DISCORD_WEBHOOK_GROUP || "",
};

// DRY_RUN: log intended alerts instead of sending. Forced on when no Discord
// destination is configured, so it's always safe to run locally.
export const DRY_RUN =
  process.env.DRY_RUN === "1" ||
  process.env.DRY_RUN === "true" ||
  (!DISCORD.downtimeWebhook && !DISCORD.groupWebhook);

// Merge CREATORS with ACCOUNT_META into the monitor's account worklist.
export function buildAccounts() {
  return CREATORS.map((c) => {
    const meta = ACCOUNT_META[c.username] ?? {};
    return {
      name: c.name,
      username: c.username,
      accountId: c.account_id,
      tier: meta.tier ?? "C",
    };
  });
}
