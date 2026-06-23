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
  level1Sec: 3 * 60,   // ≥3 min unanswered  → ping QA on shift
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
// Blocks are in PH time (the sheet is PH). Each maps to its GMT-named Discord
// shift channel, where the downtime ping @everyones the team on shift.
export const SHIFT_BLOCKS = [
  // channelId = where to post; roleId = which shift role to @mention there.
  { name: "Evening", startHour: 0,  endHour: 8,  qaName: "Lance", qaDiscord: "1358891208935608532", channelId: "1411370988406440026", roleId: "1491477766971982056" }, // late evening · PH 00–08 = 16:00–24:00 GMT
  { name: "Night",   startHour: 8,  endHour: 16, qaName: "Liz",   qaDiscord: "714697188545921054",  channelId: "1410175555801841674", roleId: "1491477514013380711" }, // Evening-night · PH 08–16 = 00:00–08:00 GMT
  { name: "Day",     startHour: 16, endHour: 24, qaName: "Yen",   qaDiscord: "1267138323999359027", channelId: "1411638392550326272", roleId: "1491477215261491250" }, // Day Shift · PH 16–24 = 08:00–16:00 GMT
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
  // Bernard bot token — posts the downtime ping into the time-appropriate shift
  // channel and @everyones it. Until this is set, L1/L2 fall back to the
  // Chatter-QA webhook (pinging the QA) so coverage never drops.
  botToken: process.env.DISCORD_BOT_TOKEN || "",
  // Channel where whale/purchase flags post (bot token).
  qaPinsChannelId: process.env.DISCORD_QA_PINS_CHANNEL_ID || "1518916555037999164",
};

// ── Whale / spend flags ─────────────────────────────────────────────────────
// Flag spend events to #chatter-pins-qa-pins so QAs can trace active whales.
// A "whale" = a fan in the account's high-spend LISTS (the OF API has no
// per-fan lifetime-spend field, so the team's spend-tier lists ARE the signal).
// `listPattern` matches those list names (Big Spender / LT Spend / ≥ 250 / 500 /
// whale). Membership is fetched + cached in whales.json, refreshed every
// `refreshHours`, so the per-run cost stays at ~1 credit/account (the txn poll).
// `hardFloor` > 0 also flags any single purchase ≥ that $ even from an unlisted
// fan (0 = whales only). Tune the whale tiers via WHALE_TIERS.
export const WHALE = {
  enabled: process.env.WHALE_ENABLED !== "0",
  listPattern: process.env.WHALE_LIST_PATTERN || "big spender|lt spend|whale|≥\\s*\\$?\\s*(250|300|500|1000)",
  hardFloor: Number(process.env.WHALE_HARD_FLOOR || 0), // also flag any single purchase ≥ this ($); 0 = off
  lookbackSec: Number(process.env.WHALE_LOOKBACK_SEC || 900),
  refreshHours: Number(process.env.WHALE_REFRESH_HOURS || 12),
  tiers: (process.env.WHALE_TIERS || "A,B,C").split(",").map((s) => s.trim()),
};

// ── List automations (Lance #1 + #2) ────────────────────────────────────────
// Both default to DRY-RUN: they log exactly what they WOULD change to the run
// output and write nothing to OnlyFans until LIST_AUTO_WRITES=1. The OF write
// endpoints are wired but verified live only when writes are first enabled.
//   #1 exclude-on-reply: when a chatter replies to a fan, add that fan to the
//      account's exclude ("no MM") list — auto-detected by name (excludePattern).
//   #2 idle spenders: record each fan's last-spend date over time; when a fan
//      crosses inactivityDays without spending, move them to a "No spend Nd"
//      list. Only accurate after it has recorded for ~max(inactivityDays) days.
export const LIST_AUTO = {
  enabled: process.env.LIST_AUTO_ENABLED !== "0", // dry-run logging on by default
  writes: process.env.LIST_AUTO_WRITES === "1",   // actually write to OF lists — OFF by default
  excludePattern: process.env.EXCLUDE_LIST_PATTERN || "do not send mm|no[ -]?mm",
  replyWindowSec: Number(process.env.EXCLUDE_REPLY_WINDOW_SEC || 600), // a reply within 10 min = "just replied"
  inactivityDays: (process.env.INACTIVITY_DAYS || "7,14,28").split(",").map((s) => Number(s.trim())),
  noSpendListPrefix: process.env.NOSPEND_LIST_PREFIX || "No spend",
};

// DRY_RUN: log intended alerts instead of sending. Forced on when no Discord
// destination is configured, so it's always safe to run locally.
export const DRY_RUN =
  process.env.DRY_RUN === "1" ||
  process.env.DRY_RUN === "true" ||
  (!DISCORD.downtimeWebhook && !DISCORD.groupWebhook && !DISCORD.botToken);

