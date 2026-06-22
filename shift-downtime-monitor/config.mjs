// Config for the Shift Downtime Monitor.
//
// Account list + account ids come from the existing payout-bot CREATORS
// config (single source of truth for which OF accounts we track). Here we add
// only what the monitor needs on top of that: per-account TIER and Discord
// channel, the escalation thresholds, and the Discord routing.

// ── Per-account TIER overrides ──────────────────────────────────────────────
// The monitor watches EVERY authenticated OF account automatically (so new
// creators are picked up with no edits here). This map only sets each account's
// `tier`, which gates the 10-min (level-2) escalation (A/B only). Keyed by the
// current OF username. Anything not listed defaults to tier "C" (no level-2).
// An optional `thresholds` override sets that account's own alert timings
// (seconds); anything omitted falls back to the global THRESHOLDS. An account
// with a custom override is always eligible for the 2nd-level ping regardless
// of tier. Changing thresholds does NOT change API usage — same poll data.
export const ACCOUNT_META = {
  // username             tier   creator
  "bluebeari3vip":     { tier: "A" },  // Blue Bear
  "marissa.munoz":     { tier: "B" },  // Marissa
  "emmasonne":         { tier: "B" },  // Emma
  "flame_fantasy_xx":  { tier: "B" },  // Meg (currently disconnected)
  "junehaynes":        { tier: "C" },  // June - Sandra
  "juliejswan":        { tier: "C" },  // Julie
  "lillyylou":         { tier: "C", thresholds: { level1Sec: 180, level2Sec: 300 } },  // Antonella — pin at 3 then 5 min
  "ellaajanee":        { tier: "C", thresholds: { level1Sec: 180, level2Sec: 300 } },  // Ella      — pin at 3 then 5 min
};

// Tier for an account by username (defaults to C — no 10-min step).
export function tierFor(username) {
  return ACCOUNT_META[username]?.tier ?? "C";
}

// Effective thresholds for an account = global defaults + per-account override.
export function thresholdsFor(username) {
  return { ...THRESHOLDS, ...(ACCOUNT_META[username]?.thresholds ?? {}) };
}

// Whether the 2nd-level (escalation) ping applies: A/B tier, or a custom override.
export function level2Eligible(username) {
  return LEVEL2_TIERS.has(tierFor(username)) || !!ACCOUNT_META[username]?.thresholds;
}

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

// ── Poll loop ───────────────────────────────────────────────────────────────
// GitHub Actions cron floors at ~5 min and runs late, so each invocation runs
// its own poll loop to cover the gap. Cadence is 2 min (was 45s) to cut OF API
// credit usage ~2× — still catches any 5-min downtime comfortably. The duration
// spans the full ~5-min cron gap so there's no blind window between runs.
export const LOOP = {
  everySec: Number(process.env.MONITOR_LOOP_EVERY_SEC || 120),       // poll cadence within a run (2 min)
  durationSec: Number(process.env.MONITOR_LOOP_DURATION_SEC || 270), // run ~4.5 min, then exit
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

