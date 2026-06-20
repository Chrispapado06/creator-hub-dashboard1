// ─────────────────────────────────────────────────────────────────────
// GATING PROBE for the Shift Downtime Monitor.
//
// The whole monitor rests on one assumption: when a chatter replies to a
// fan inside Infloww, the OnlyFans API (GET /{acct}/chats) reflects that
// reply quickly — i.e. `lastMessage.sentBy` flips from "fan" to "creator"
// within a minute or two. If that propagation lag is large, the OF API
// can't be used as the "no-reply" signal and we'd fire false downtime
// alerts; we'd need Infloww's own API/webhook instead.
//
// This script answers that question with real data. It has two modes:
//
//   1. SNAPSHOT (no account arg) — polls every tracked creator once and
//      prints, per account, how many fan threads are currently unanswered
//      and the age of the oldest one. Use it to (a) confirm auth + the
//      response shape, and (b) pick a live account to watch.
//
//        node shift-downtime-monitor/probe-of-sync.mjs
//
//   2. WATCH (account arg) — polls ONE account on a tight interval and,
//      the moment a thread's last message flips fan→creator, prints the
//      propagation lag = (observed time − reply's own createdAt). Have a
//      chatter send a test reply in Infloww while this runs.
//
//        node shift-downtime-monitor/probe-of-sync.mjs bluebeari3vip --mins=15 --every=20
//        node shift-downtime-monitor/probe-of-sync.mjs acct_99db... --mins=15
//
// Reads the OF key from env ONLYFANSAPI_KEY, else VITE_ONLYFANSAPI_KEY in
// .env (the local Vite var holds the same key). No external deps.
// ─────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const BASE = "https://app.onlyfansapi.com/api";

// ── env / key ────────────────────────────────────────────────────────
function loadOfKey() {
  if (process.env.ONLYFANSAPI_KEY) return process.env.ONLYFANSAPI_KEY;
  try {
    const env = readFileSync(resolve(REPO_ROOT, ".env"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^\s*(VITE_ONLYFANSAPI_KEY|ONLYFANSAPI_KEY)\s*=\s*(.+)\s*$/);
      if (m) return m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch { /* no .env */ }
  return null;
}
const OF_KEY = loadOfKey();
if (!OF_KEY) {
  console.error("✖ No OF key. Set ONLYFANSAPI_KEY or add VITE_ONLYFANSAPI_KEY to .env");
  process.exit(1);
}

// ── tiny OF fetch (mirrors payout-bot/bot.mjs) ───────────────────────
async function ofGet(path) {
  const url = path.startsWith("http") ? path : `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${OF_KEY}`, Accept: "application/json" },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status} on ${path} — ${text.slice(0, 200)}`);
  }
  return r.json();
}

// Normalise the /chats list across the two response shapes the live API
// uses (current `fan`/`sentBy` vs legacy `withUser`/`isFromUser`).
function normaliseChats(json) {
  const list = Array.isArray(json) ? json
    : Array.isArray(json?.data) ? json.data
    : Array.isArray(json?.data?.list) ? json.data.list
    : Array.isArray(json?.list) ? json.list
    : [];
  const out = [];
  for (const raw of list) {
    const fanRaw = raw?.fan ?? raw?.withUser;
    if (!fanRaw || typeof fanRaw.id !== "number") continue;
    const lm = raw?.lastMessage;
    let lastMessage;
    if (lm) {
      // The LIVE OF API has no `sentBy`/`isFromUser`. The reliable signal
      // for "the fan sent the last message" is lastMessage.fromUser.id ===
      // fan.id (when the creator sent last, fromUser.id is the creator's
      // constant OF user id). `_view` is always "i" and `unreadCount` can
      // be 0 even on a fan-last thread, so neither is usable. We still fall
      // back to the legacy fields first in case any account returns them.
      const sentBy = typeof lm.sentBy === "string"
        ? (lm.sentBy === "fan" ? "fan" : "creator")
        : (lm.fromUser && typeof lm.fromUser.id === "number")
          ? (lm.fromUser.id === Number(fanRaw.id) ? "fan" : "creator")
          : (lm.isFromUser === true ? "fan" : "creator");
      lastMessage = {
        id: Number(lm.id ?? 0),
        text: typeof lm.text === "string" ? lm.text.replace(/<[^>]+>/g, "") : "",
        createdAt: typeof lm.createdAt === "string" ? lm.createdAt : "",
        sentBy,
      };
    }
    out.push({
      fanId: Number(fanRaw.id),
      fan: String(fanRaw.username ?? fanRaw.name ?? fanRaw.id),
      unread: Number(raw.unreadCount ?? raw.unreadMessagesCount ?? 0) || 0,
      lastMessage,
    });
  }
  return out;
}

async function listChats(acctId, { unreadOnly = false, limit = 50 } = {}) {
  const q = new URLSearchParams();
  if (limit) q.set("limit", String(limit));
  if (unreadOnly) q.set("filter", "unread");
  const json = await ofGet(`/${acctId}/chats?${q.toString()}`);
  return normaliseChats(json);
}

// ── helpers ──────────────────────────────────────────────────────────
const now = () => Date.now();
const fmtAge = (ms) => {
  if (ms == null || Number.isNaN(ms)) return "  ?  ";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, "0")}s`;
};
const ts = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const ageOf = (iso) => (iso ? now() - Date.parse(iso) : null);

async function loadCreators() {
  try {
    const mod = await import(resolve(REPO_ROOT, "payout-bot/config.mjs"));
    return mod.CREATORS ?? [];
  } catch {
    return [];
  }
}

// Resolve a CLI account arg (acct_id | username | creator name) to an id.
async function resolveAccountId(arg, creators) {
  if (arg.startsWith("acct_")) return arg;
  const lower = arg.toLowerCase();
  const c = creators.find(
    (c) => c.username?.toLowerCase() === lower || c.name?.toLowerCase() === lower,
  );
  if (c) return c.account_id;
  // fall back to OF /accounts lookup by username
  const accts = await ofGet("/accounts").then((j) => (Array.isArray(j) ? j : j?.data ?? []));
  const a = accts.find((a) => a.onlyfans_username?.toLowerCase() === lower);
  if (a) return a.id;
  throw new Error(`Could not resolve account "${arg}" (not an acct_ id, creator, or known username)`);
}

// ── SNAPSHOT mode ────────────────────────────────────────────────────
async function snapshot(creators) {
  console.log(`\n[${ts()}] Snapshot of unanswered fan threads across ${creators.length} accounts\n`);
  console.log("  account            unanswered  oldest-wait   newest-fan-msg");
  console.log("  ─────────────────  ──────────  ───────────   ──────────────");
  for (const c of creators) {
    try {
      const chats = await listChats(c.account_id, { limit: 50 });
      // "unanswered" = last message was from the fan (chatter hasn't replied)
      const open = chats.filter((ch) => ch.lastMessage?.sentBy === "fan");
      const ages = open.map((ch) => ageOf(ch.lastMessage.createdAt)).filter((a) => a != null);
      const oldest = ages.length ? Math.max(...ages) : null;
      const newest = ages.length ? Math.min(...ages) : null;
      console.log(
        `  ${c.name.padEnd(17)}  ${String(open.length).padStart(10)}  ${fmtAge(oldest).padStart(11)}   ${fmtAge(newest).padStart(14)}`,
      );
    } catch (e) {
      console.log(`  ${c.name.padEnd(17)}  ERROR: ${e.message}`);
    }
  }
  console.log(
    `\nTip: pick an account with live activity and watch it while a chatter replies in Infloww:\n` +
    `  node shift-downtime-monitor/probe-of-sync.mjs <username> --mins=15 --every=20\n`,
  );
}

// ── WATCH mode ───────────────────────────────────────────────────────
async function watch(acctId, label, { mins, every }) {
  const deadline = now() + mins * 60_000;
  // Per-fan memory of the last message we saw (id + sentBy + when we first saw it).
  const seen = new Map(); // fanId -> { lastId, sentBy, firstFanMsgAt, fanCreatedAt }
  let polls = 0;
  let replies = 0;

  console.log(
    `\n[${ts()}] Watching "${label}" (${acctId}) for ${mins} min, polling every ${every}s.\n` +
    `Have a chatter reply to a fan in Infloww. We report the lag until the OF API shows it.\n` +
    `${"─".repeat(72)}`,
  );

  while (now() < deadline) {
    polls++;
    let chats;
    try {
      chats = await listChats(acctId, { limit: 50 });
    } catch (e) {
      console.log(`[${ts()}] poll #${polls} ERROR: ${e.message}`);
      await sleep(every * 1000);
      continue;
    }

    let openCount = 0;
    let oldestOpen = null;
    for (const ch of chats) {
      const lm = ch.lastMessage;
      if (!lm) continue;
      const prev = seen.get(ch.fanId);

      if (lm.sentBy === "fan") {
        openCount++;
        const age = ageOf(lm.createdAt);
        if (age != null && (oldestOpen == null || age > oldestOpen)) oldestOpen = age;
        // (re)record the unanswered fan message
        if (!prev || prev.lastId !== lm.id || prev.sentBy !== "fan") {
          seen.set(ch.fanId, {
            lastId: lm.id, sentBy: "fan",
            firstSeenAt: now(), fanCreatedAt: lm.createdAt,
          });
        }
      } else {
        // creator's message is now last. Did it just flip from a fan msg?
        if (prev && prev.sentBy === "fan") {
          replies++;
          const replyCreated = Date.parse(lm.createdAt);
          const lagFromCreated = Number.isNaN(replyCreated) ? null : now() - replyCreated;
          console.log(
            `[${ts()}] ✅ REPLY surfaced  fan=${ch.fan}\n` +
            `         fan msg at : ${prev.fanCreatedAt}\n` +
            `         reply at   : ${lm.createdAt}  ("${(lm.text || "").slice(0, 40)}")\n` +
            `         PROPAGATION LAG (observed − reply.createdAt): ${fmtAge(lagFromCreated)}\n` +
            `         (we first saw the fan msg ${fmtAge(now() - prev.firstSeenAt)} ago)`,
          );
        }
        seen.set(ch.fanId, { lastId: lm.id, sentBy: "creator", firstSeenAt: now(), fanCreatedAt: null });
      }
    }

    console.log(
      `[${ts()}] poll #${polls}: ${openCount} unanswered, oldest ${fmtAge(oldestOpen)}` +
      (replies ? `, ${replies} reply-flip(s) so far` : ""),
    );
    await sleep(every * 1000);
  }

  console.log(
    `${"─".repeat(72)}\n[${ts()}] Done. ${polls} polls, ${replies} reply-flip(s) observed.\n` +
    (replies === 0
      ? `No replies were detected — either none were sent, or they didn't surface in the OF API\n` +
        `within the window. Re-run and make sure a chatter actually replies in Infloww during it.`
      : `If every PROPAGATION LAG above is under ~2 min, the OF API is a viable downtime signal.`),
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── main ─────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  const flags = Object.fromEntries(
    args.filter((a) => a.startsWith("--")).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    }),
  );
  const positional = args.filter((a) => !a.startsWith("--"));
  const creators = await loadCreators();

  if (positional.length === 0) {
    if (!creators.length) {
      console.error("No creators found in payout-bot/config.mjs and no account given.");
      process.exit(1);
    }
    await snapshot(creators);
    return;
  }

  const acctId = await resolveAccountId(positional[0], creators);
  const label = creators.find((c) => c.account_id === acctId)?.name ?? positional[0];
  await watch(acctId, label, {
    mins: Number(flags.mins ?? 15),
    every: Number(flags.every ?? 20),
  });
})().catch((e) => {
  console.error("Probe failed:", e.message);
  process.exit(1);
});
