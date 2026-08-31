#!/usr/bin/env node
// Welcome-message reply rate, per model.
//
// Replaces the manual method (screen-record the notifications, count how many
// say "fan responded to welcome message", divide by new fans) with a direct
// read of the OnlyFans API.
//
// HOW IT WORKS — all four steps verified live against the API before writing:
//   1. Enumerate every fan on the account (active + expired) and keep the ones
//      whose subscribedOnData.subscribeAt falls in the window.
//   2. For each of those, GET the chat with `order=asc` — this is the whole
//      trick. The default (newest-first) only returns the last couple of
//      messages, so a welcome message from three weeks ago is invisible.
//      With order=asc the FIRST page is the START of the conversation, and a
//      welcome message from 50 days back comes right back.
//   3. The welcome message is the first creator-sent message in the chat.
//      (`isFromQueue` is NOT the marker — real welcomes come back false.)
//   4. Replied = the fan sent anything after that welcome.
//
// Usage:
//   node welcome-reply-rate/report.mjs                # last 30 days, all models
//   node welcome-reply-rate/report.mjs --days=7       # weekly run
//   node welcome-reply-rate/report.mjs --csv=out.csv  # also write a CSV
//   node welcome-reply-rate/report.mjs --account=acct_xxx   # one model
//
// Env: ONLYFANSAPI_KEY, or VITE_ONLYFANSAPI_KEY in the repo .env.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { loadOfKey } from "../shift-downtime-monitor/of.mjs";

const BASE = "https://app.onlyfansapi.com/api";
const KEY = loadOfKey();
if (!KEY) {
  console.error("No OF key. Set ONLYFANSAPI_KEY or put VITE_ONLYFANSAPI_KEY in .env");
  process.exit(1);
}

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const DAYS = Number(arg("days", "30"));
const CSV_PATH = arg("csv", null);
const ONLY_ACCOUNT = arg("account", null);
// OnlyFansAPI's own limit is 5000/min, but OnlyFans-native throttling sits far
// below that: measured live, 6 concurrent requests are clean and 12 starts
// returning ONLYFANS_COM_RATE_LIMIT_ERROR. Raising this doesn't make the run
// faster, it just converts throughput into 429s and backoff.
const CONCURRENCY = Number(arg("concurrency", "3"));
// Hard cap per API docs: the `limit` field must not be greater than 20.
const PAGE = 20;

const cutoff = Date.now() - DAYS * 86400_000;
const stats = { calls: 0, credits: 0, throttled: 0, network: 0 };
const CHECKPOINT = arg("checkpoint", "welcome-reply-rate/.checkpoint.json");

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Global pacer. OnlyFans-native throttling is per-account and time-windowed,
// so a burst of parallel requests trips it even when the average rate is well
// under the documented limit — that's what killed the first full run at
// 4-concurrent. Serialising request STARTS behind a minimum gap, and widening
// that gap whenever we're throttled, keeps us under the limit instead of
// fighting it. The gap narrows again after a clean streak.
const GAP_FLOOR = Number(arg("gap", "300"));
const GAP_CEIL = 8000;
let minGap = GAP_FLOOR;
let lastStart = 0;
let gate = Promise.resolve();
let cleanStreak = 0;

function paced(fn) {
  const slot = gate.then(async () => {
    const wait = lastStart + minGap - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
  });
  gate = slot;
  return slot.then(fn);
}

function onThrottled() {
  cleanStreak = 0;
  minGap = Math.min(GAP_CEIL, Math.round(minGap * 1.8));
}
function onClean() {
  if (++cleanStreak >= 25 && minGap > GAP_FLOOR) {
    cleanStreak = 0;
    minGap = Math.max(GAP_FLOOR, Math.round(minGap * 0.8));
  }
}

async function ofGet(path) {
  let last = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    // Transport errors (socket reset, DNS blip) reject rather than returning a
    // status, so they have to be caught INSIDE the retry loop — otherwise a
    // single dropped connection kills a multi-hour run.
    let r;
    try {
      r = await paced(() => fetch(BASE + path, {
        headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
      }));
    } catch (e) {
      stats.calls++;
      stats.network++;
      last = `network: ${e.message}`;
      onThrottled();
      await sleep(Math.min(30_000, 1500 * 2 ** attempt));
      continue;
    }
    stats.calls++;
    if (r.status === 429 || r.status >= 500) {
      if (r.status === 429) { stats.throttled++; onThrottled(); }
      last = `HTTP ${r.status}`;
      // OnlyFans-native throttling clears on the order of seconds, not
      // milliseconds — a sub-second retry just burns another 429.
      const retryAfter = Number(r.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(30_000, 1500 * 2 ** attempt);
      await sleep(wait);
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${path} — ${(await r.text()).slice(0, 120)}`);
    onClean();
    const j = await r.json();
    const used = j?._meta?._credits?.used;
    if (typeof used === "number") stats.credits += used;
    return j;
  }
  throw new Error(`${last} after 10 attempts: ${path}`);
}

/** Run `worker` over `items` with a bounded number in flight. */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/** Every fan on the account. The list is ordered by fan id, NOT by subscribe
 *  date, and no sort parameter is honoured — so there is no early exit and we
 *  genuinely have to walk the whole list to find the recent subscribers.
 *
 *  Termination is deliberately positive: we stop only when pages come back
 *  EMPTY. An earlier version treated a failed page as an empty one, which made
 *  a transient error indistinguishable from the end of the list and silently
 *  truncated the roster to a third of its real size. A page that cannot be
 *  fetched now aborts the run instead of quietly shrinking the denominator. */
async function allFans(account, kind) {
  const byId = new Map();
  let offset = 0;
  while (true) {
    const offsets = Array.from({ length: CONCURRENCY }, (_, k) => offset + k * PAGE);
    const batch = await Promise.all(
      offsets.map((o) =>
        ofGet(`/${account}/fans/${kind}?limit=${PAGE}&offset=${o}`)
          .then((j) => ({ ok: true, list: j?.data?.list ?? [] }))
          .catch((e) => ({ ok: false, offset: o, error: e }))
      )
    );
    const failed = batch.find((b) => !b.ok);
    if (failed) {
      throw new Error(
        `fans/${kind} page at offset ${failed.offset} failed after retries (${failed.error.message}). ` +
        `Aborting rather than reporting a partial roster.`
      );
    }
    let got = 0;
    for (const b of batch) {
      for (const f of b.list) if (f?.id != null) byId.set(f.id, f);
      got += b.list.length;
    }
    // Every page in this batch was empty → past the end of the list.
    if (got === 0) break;
    offset += CONCURRENCY * PAGE;
  }
  return [...byId.values()];
}

/** Did this fan reply to the welcome message? */
async function assess(account, fan) {
  const fanId = fan.id;
  let msgs;
  try {
    const j = await ofGet(`/${account}/chats/${fanId}/messages?order=asc&limit=${PAGE}`);
    msgs = j?.data?.list ?? j?.data ?? [];
  } catch {
    return { outcome: "error" };
  }
  if (!Array.isArray(msgs) || msgs.length === 0) return { outcome: "no_chat" };

  const ordered = [...msgs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const welcomeIdx = ordered.findIndex((m) => m.isSentByMe === true);
  if (welcomeIdx === -1) return { outcome: "no_welcome" };

  // The fan wrote before the creator ever did — there was no welcome message
  // for them to reply to, so they don't belong in the denominator.
  if (welcomeIdx > 0) return { outcome: "fan_first" };

  const welcome = ordered[welcomeIdx];
  const reply = ordered.slice(welcomeIdx + 1).find((m) => m.isSentByMe === false);
  if (reply) {
    return {
      outcome: "replied",
      minutes: (new Date(reply.createdAt) - new Date(welcome.createdAt)) / 60000,
      welcomeAt: welcome.createdAt,
    };
  }
  // No reply in the first 20 messages. lastReplyAt comes free on the fan record:
  // if it's null the fan has never replied to anything and this is certain. If
  // it's set, the reply may be further down the chat than we fetched — report
  // that separately rather than quietly scoring it as a non-reply.
  if (fan.lastReplyAt) return { outcome: "uncertain", welcomeAt: welcome.createdAt };
  return { outcome: "no_reply", welcomeAt: welcome.createdAt };
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const fmtDur = (mins) => {
  if (mins == null) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 1440) return `${(mins / 60).toFixed(1)}h`;
  return `${(mins / 1440).toFixed(1)}d`;
};

// ── Run ──────────────────────────────────────────────────────────────────────
const accountsRaw = await ofGet("/accounts");
const accounts = (Array.isArray(accountsRaw) ? accountsRaw : accountsRaw?.data ?? [])
  .filter((a) => a.is_authenticated)
  .filter((a) => !ONLY_ACCOUNT || a.id === ONLY_ACCOUNT);

const since = new Date(cutoff).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);
console.error(`Welcome-message reply rate · ${since} → ${today} (${DAYS}d) · ${accounts.length} model(s)\n`);

// Checkpoint per model. This run takes hours; losing all of it to a single
// throttled page at the end would be miserable, and re-running from scratch
// burns the API quota again. Completed models are reloaded, not refetched.
const ckKey = `${DAYS}d:${since}`;
let checkpoint = { key: ckKey, models: {} };
if (existsSync(CHECKPOINT)) {
  try {
    const prev = JSON.parse(readFileSync(CHECKPOINT, "utf8"));
    if (prev.key === ckKey) {
      checkpoint = prev;
      const done = Object.keys(prev.models).length;
      if (done) console.error(`  resuming — ${done} model(s) already done in ${CHECKPOINT}\n`);
    }
  } catch { /* corrupt checkpoint: start clean */ }
}
const saveCheckpoint = () => {
  const dir = CHECKPOINT.split("/").slice(0, -1).join("/");
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CHECKPOINT, JSON.stringify(checkpoint, null, 2));
};

const rows = [];
for (const acct of accounts) {
  if (checkpoint.models[acct.id]) {
    const cached = checkpoint.models[acct.id];
    rows.push(cached);
    console.error(`  ${String(cached.name).padEnd(18)} (from checkpoint)`);
    continue;
  }
  const name = acct.onlyfans_user_data?.name || acct.display_name || acct.onlyfans_username || acct.id;
  process.stderr.write(`  ${name.padEnd(18)} enumerating fans… `);

  // No .catch() here on purpose. If a roster can't be fully enumerated the
  // reply rate computed from it would be wrong in a way nobody could see, so
  // the run stops instead.
  const [active, expired] = await Promise.all([
    allFans(acct.id, "active"),
    allFans(acct.id, "expired"),
  ]);
  // A fan can appear in both lists across a resubscribe; keep one record each.
  const byId = new Map();
  for (const f of [...active, ...expired]) if (f?.id != null) byId.set(f.id, f);

  const newFans = [...byId.values()].filter((f) => {
    const at = f?.subscribedOnData?.subscribeAt;
    return at && new Date(at).getTime() >= cutoff;
  });
  process.stderr.write(`${byId.size} total, ${newFans.length} new in window — checking chats… `);

  const results = await pool(newFans, CONCURRENCY, (f) => assess(acct.id, f));
  const tally = { replied: 0, no_reply: 0, uncertain: 0, fan_first: 0, no_welcome: 0, no_chat: 0, error: 0 };
  const times = [];
  for (const r of results) {
    tally[r.outcome] = (tally[r.outcome] ?? 0) + 1;
    if (r.outcome === "replied") times.push(r.minutes);
  }

  // Denominator = fans who actually received a welcome message. Excluding the
  // ones who wrote first, or never got one, keeps this a measure of the
  // welcome message rather than of chat volume.
  const denom = tally.replied + tally.no_reply + tally.uncertain;
  const rate = denom ? (tally.replied / denom) * 100 : null;
  const rateHigh = denom ? ((tally.replied + tally.uncertain) / denom) * 100 : null;

  const row = { name, username: acct.onlyfans_username, newFans: newFans.length, denom, ...tally, rate, rateHigh, median: median(times) };
  rows.push(row);
  checkpoint.models[acct.id] = row;
  saveCheckpoint();
  process.stderr.write(`done (${rate == null ? "—" : rate.toFixed(1) + "%"})\n`);
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\nWELCOME MESSAGE REPLY RATE — last ${DAYS} days (${since} → ${today})\n`);
const head = ["Model", "New fans", "Got welcome", "Replied", "No reply", "Reply rate", "Median reply"];
const body = rows.map((r) => [
  r.name,
  String(r.newFans),
  String(r.denom),
  String(r.replied),
  String(r.no_reply),
  r.rate == null ? "—" : `${r.rate.toFixed(1)}%${r.uncertain ? `–${r.rateHigh.toFixed(1)}%` : ""}`,
  fmtDur(r.median),
]);
const T = [head, ...body];
const w = head.map((_, i) => Math.max(...T.map((row) => row[i].length)));
const line = (row) => row.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join("  ");
console.log(line(head));
console.log(w.map((n) => "─".repeat(n)).join("  "));
for (const r of body) console.log(line(r));

const tot = rows.reduce((a, r) => ({
  newFans: a.newFans + r.newFans, denom: a.denom + r.denom,
  replied: a.replied + r.replied, no_reply: a.no_reply + r.no_reply,
  uncertain: a.uncertain + r.uncertain, fan_first: a.fan_first + r.fan_first,
  no_welcome: a.no_welcome + r.no_welcome, errors: a.errors + (r.error ?? 0),
}), { newFans: 0, denom: 0, replied: 0, no_reply: 0, uncertain: 0, fan_first: 0, no_welcome: 0, errors: 0 });
console.log(w.map((n) => "─".repeat(n)).join("  "));
console.log(line(["ALL MODELS", String(tot.newFans), String(tot.denom), String(tot.replied), String(tot.no_reply),
  tot.denom ? `${((tot.replied / tot.denom) * 100).toFixed(1)}%` : "—", ""]));

const notes = [];
if (tot.fan_first) notes.push(`${tot.fan_first} fan(s) messaged before any welcome went out — excluded from the denominator.`);
if (tot.no_welcome) notes.push(`${tot.no_welcome} fan(s) never received a welcome message at all — excluded.`);
if (tot.errors) notes.push(`${tot.errors} chat(s) could not be read after retries — excluded, and NOT counted as non-replies.`);
if (tot.uncertain) notes.push(`${tot.uncertain} fan(s) replied at some point but not within the first ${PAGE} messages, so it can't be tied to the welcome — shown as the upper end of the range.`);
if (notes.length) {
  console.log("\nNotes:");
  for (const n of notes) console.log(`  • ${n}`);
}
console.log(`\n${stats.calls} API calls · ${stats.credits} credits used${stats.throttled ? ` · ${stats.throttled} throttled + retried` : ""}${stats.network ? ` · ${stats.network} network retries` : ""}`);

if (CSV_PATH) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cols = ["model", "username", "window_days", "since", "until", "new_fans", "got_welcome",
    "replied", "no_reply", "uncertain", "fan_first", "no_welcome", "reply_rate_pct", "median_reply_minutes"];
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push([r.name, r.username, DAYS, since, today, r.newFans, r.denom, r.replied, r.no_reply,
      r.uncertain, r.fan_first, r.no_welcome, r.rate == null ? "" : r.rate.toFixed(2),
      r.median == null ? "" : r.median.toFixed(1)].map(esc).join(","));
  }
  writeFileSync(CSV_PATH, lines.join("\n") + "\n");
  console.log(`\nCSV → ${CSV_PATH}`);
}
