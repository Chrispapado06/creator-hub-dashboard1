#!/usr/bin/env node
// The Morning Card — one Discord message a day, 04:40 UTC (07:40 Cyprus).
//
// Money first, list second. The card leads with yesterday's number because that
// is the only part worth opening on a day you intend to do nothing; the two
// tasks are what you see on the way past.
//
// Hard rules, all of them deliberate:
//   • ONE push a day. Not three.
//   • Cap of 2 gates + 2 items. A third item is dropped and re-competes
//     tomorrow — the cap IS the triage.
//   • No buttons. Nothing here requires a tap; occurrences leave by being done,
//     by being closed by data, or by expiring overnight.
//   • Nothing accumulates. expire_stale_tasks() runs first, so the card is the
//     same length on day 28 as on day 1. There is no overdue count anywhere,
//     because this system cannot produce one.
//   • Hard gates are the only thing that shouts. They never expire and they
//     escalate at +24h.
//   • Four days with no manual completion → the card halves itself and offers
//     to pause. It degrades quietly instead of nagging.
//
// The 👀 line reports ONLY checks that actually run today. It grows as real
// detectors land; it never claims to have checked something it didn't.
//
// TWO TRANSPORTS, bot preferred:
//   • DISCORD_BOT_TOKEN + CADENCE_CHANNEL_ID → posts AND pins (replacing
//     yesterday's pin). This is the intended setup: the pin is what makes the
//     card a place rather than a notification you scroll past.
//   • CADENCE_WEBHOOK_URL → posts only. Webhooks cannot pin, unpin, or list
//     pins, so yesterday's card stays where it is and the channel accumulates.
//     Works with zero bot permissions, which is the trade.
// Set both and the bot wins; the webhook is the fallback if it fails.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      CADENCE_CHANNEL_ID — the channel to post in; also how the owner is
//        resolved (chatters.discord_channel_id) when no owner id is given.
//      CADENCE_OWNER_ID (optional) — Discord user id, for the @-mention and the
//        task lookup. Set it when the channel is shared or isn't on your row.
//      DISCORD_BOT_TOKEN and/or CADENCE_WEBHOOK_URL — at least one.
//      ONLYFANSAPI_KEY (optional — omit and the money line is skipped),
//      CADENCE_TZ (default Europe/Nicosia), DRY_RUN=1 to print and post nothing.

import { CREATORS, fmtMoney, REPORT_TZ, partsInTz, wallTimeToUtc } from "../payout-bot/config.mjs";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const WEBHOOK = process.env.CADENCE_WEBHOOK_URL;
const CHANNEL = process.env.CADENCE_CHANNEL_ID;
const OWNER = process.env.CADENCE_OWNER_ID;
const OF_KEY = process.env.ONLYFANSAPI_KEY;
const CARD_TZ = process.env.CADENCE_TZ || "Europe/Nicosia";
const DRY_RUN = process.env.DRY_RUN === "1";

// PREVIEW_FOR=YYYY-MM-DD renders the card for a FUTURE day without touching
// anything: both RPCs are skipped, so no task is expired and no rule's next_run
// is advanced. Occurrences that don't exist yet are simulated from the rules
// that would fire on that date. Strictly read-only — safe against production.
const PREVIEW_FOR = process.env.PREVIEW_FOR || null;
// DELETE_AFTER=<seconds> removes the message again afterwards. Webhooks can
// delete their own messages, so this needs no bot token and no permissions.
const DELETE_AFTER = Number(process.env.DELETE_AFTER || 0);

const MAX_ITEMS = 2;      // non-gate items on a normal card
const MAX_GATES = 2;      // Monday can carry pay + one other; never more
const QUIET_DAYS = 4;     // no manual completion in this many days → degrade

if (!SB_URL || !SB_KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing"); process.exit(1); }
const canBot = Boolean(TOKEN && CHANNEL);
if (!DRY_RUN && !canBot && !WEBHOOK) {
  console.error("no transport: set DISCORD_BOT_TOKEN + CADENCE_CHANNEL_ID (posts and pins), or CADENCE_WEBHOOK_URL (posts only)");
  process.exit(1);
}
if (!CHANNEL && !OWNER) { console.error("set CADENCE_CHANNEL_ID (preferred) or CADENCE_OWNER_ID — the card has no one to address"); process.exit(1); }

// ── Supabase (service role — this runs in CI, never in a browser) ────────────
async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`supabase ${r.status} on ${path.slice(0, 60)}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return r.json();
}

async function sbRpc(fn, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return r.json().catch(() => null);
}

// ── Discord (post + pin lifted from api/discord-digest.js, same dual-API dance) ──
async function dapi(path, init) {
  return fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json", ...(init && init.headers) },
  });
}

async function postToChannel(channelId, content) {
  const r = await dapi(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: String(content).slice(0, 1900), allowed_mentions: { parse: ["users"] } }),
  });
  if (!r.ok) throw new Error(`post ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return r.json();
}

// ?wait=true makes Discord return the created message instead of 204, which is
// the only way to learn its id — needed to pin it if a bot token is also around.
async function postToWebhook(url, content) {
  const r = await fetch(`${url}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: String(content).slice(0, 1900), allowed_mentions: { parse: ["users"] } }),
  });
  if (!r.ok) throw new Error(`webhook post ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return r.json().catch(() => null);
}

// A webhook may delete messages it created — no bot token, no permissions.
async function deleteWebhookMessage(url, messageId) {
  const r = await fetch(`${url}/messages/${messageId}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`webhook delete ${r.status}`);
}

// Pin today's card, unpinning the bot's own previous ones so they don't pile
// up. Handles both the new (/messages/pins) and legacy (/pins) endpoints.
// Best-effort throughout: needs "Manage Messages" in the channel.
async function pinDaily(channelId, messageId, botId) {
  try {
    let pinned = [];
    const rNew = await dapi(`/channels/${channelId}/messages/pins`, { method: "GET" });
    if (rNew.ok) {
      const j = await rNew.json().catch(() => null);
      pinned = j && Array.isArray(j.items) ? j.items.map((it) => it.message).filter(Boolean) : [];
    } else {
      const rOld = await dapi(`/channels/${channelId}/pins`, { method: "GET" });
      pinned = rOld.ok ? await rOld.json().catch(() => []) : [];
    }
    for (const p of pinned) {
      if (p && p.author && p.author.id === botId) {
        const d = await dapi(`/channels/${channelId}/messages/pins/${p.id}`, { method: "DELETE" });
        if (!d.ok) await dapi(`/channels/${channelId}/pins/${p.id}`, { method: "DELETE" }).catch(() => {});
      }
    }
    const put = await dapi(`/channels/${channelId}/messages/pins/${messageId}`, { method: "PUT" });
    if (!put.ok) await dapi(`/channels/${channelId}/pins/${messageId}`, { method: "PUT" }).catch(() => {});
  } catch { /* best-effort */ }
}

// ── Dates ───────────────────────────────────────────────────────────────────
const ymd = (p) => `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
const iso = (d) => d.toISOString().slice(0, 10);

// Money-day boundaries stay on REPORT_TZ (Europe/London) so the card's number
// is the SAME number payout-bot's daily report shows. Two "yesterdays" that
// disagree by a timezone would destroy trust in the line faster than anything.
function moneyDates(now = new Date()) {
  const here = partsInTz(now, REPORT_TZ);
  const todayUtc = wallTimeToUtc(here.year, here.month, here.day);
  const yUtc = new Date(todayUtc.getTime() - 24 * 3600_000);
  const y = ymd(partsInTz(yUtc, REPORT_TZ));
  return { yDate: y, win7Start: iso(new Date(Date.parse(`${y}T00:00:00Z`) - 7 * 86400_000)), win7End: iso(new Date(Date.parse(`${y}T00:00:00Z`) - 86400_000)) };
}

// "Tue 12 Aug" in the card's own timezone (Cyprus), not London.
function cardLabel(now = new Date()) {
  return now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: CARD_TZ });
}
function cardIsoDow(now = new Date()) {
  const s = now.toLocaleDateString("en-GB", { weekday: "short", timeZone: CARD_TZ });
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(s) + 1; // 1..7, 0 if unparsed
}

// ── Money line ──────────────────────────────────────────────────────────────
// Two calls per creator: yesterday, and the 7 days before it as ONE ranged
// total. The endpoint sums a range server-side, so this is 2N requests, not 8N.
const OF_BASE = "https://app.onlyfansapi.com/api";

async function ofEarnings(acctId, start, end) {
  const url = `${OF_BASE}/${acctId}/statistics/statements/earnings?type=total&start_date=${start}%2000:00:00&end_date=${end}%2023:59:59`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${OF_KEY}`, Accept: "application/json" } });
  if (!r.ok) return null;                       // null = did not report, NOT zero
  const j = await r.json().catch(() => null);
  const inner = Object.values(j?.data ?? {})[0] ?? {};
  return Number(inner.total ?? 0);
}

async function moneyLine() {
  if (!OF_KEY) return null;
  const { yDate, win7Start, win7End } = moneyDates();

  const rows = await Promise.all(CREATORS.map(async (c) => {
    const [day, week] = await Promise.all([
      ofEarnings(c.account_id, yDate, yDate),
      ofEarnings(c.account_id, win7Start, win7End),
    ]);
    return { name: c.name, day, avg: week == null ? null : week / 7 };
  }));

  const reporting = rows.filter((r) => r.day != null);
  if (!reporting.length) return { failed: true, ok: 0, total: rows.length };

  const total = reporting.reduce((a, r) => a + r.day, 0);

  // The comparison MUST be cohort-matched. Accounts drop in and out (the OF key
  // is IP-allowed on Railway, so from anywhere else most of them 401) — and if
  // an account reports yesterday but not its 7-day window, its revenue lands in
  // the numerator while a 0 lands in the denominator, which manufactures a
  // triple-digit rise out of nothing. Observed live: a real ▲2% rendered as
  // ▲197%. Only accounts with BOTH numbers count toward the percentage.
  const paired = reporting.filter((r) => r.avg != null && r.avg > 0);
  const pairedDay = paired.reduce((a, r) => a + r.day, 0);
  const pairedAvg = paired.reduce((a, r) => a + r.avg, 0);
  const pct = pairedAvg > 0 ? ((pairedDay - pairedAvg) / pairedAvg) * 100 : null;

  // Best = biggest earner yesterday. Worst = steepest fall against its OWN
  // trailing average, which is the only fair comparison across page sizes.
  const best = reporting.slice().sort((a, b) => b.day - a.day)[0];
  const movers = reporting
    .filter((r) => r.avg != null && r.avg > 0)
    .map((r) => ({ ...r, delta: ((r.day - r.avg) / r.avg) * 100 }))
    .sort((a, b) => a.delta - b.delta);
  const worst = movers.length && movers[0].delta < 0 ? movers[0] : null;

  return { total, pct, best, worst, ok: reporting.length, totalAccts: rows.length, paired: paired.length, yDate };
}

// ── The card ────────────────────────────────────────────────────────────────
const arrow = (p) => (p >= 0 ? `▲${Math.abs(p).toFixed(0)}%` : `▼${Math.abs(p).toFixed(0)}%`);

async function main() {
  const now = new Date();

  // 1+2. Kill yesterday's leftovers BEFORE generating, so nothing carries over.
  // Both are WRITES, so a preview does neither — it must never advance a rule's
  // next_run or close a real task just because someone asked to look ahead.
  const expired = PREVIEW_FOR ? { expired: 0, skipped: "preview" } : await sbRpc("expire_stale_tasks", {});
  const generated = PREVIEW_FOR ? { created: [], skipped: "preview" } : await sbRpc("generate_due_recurring_tasks", {});

  // 3. Who is this card for? Prefer an explicit owner id; otherwise resolve it
  // from the channel we're posting into, so there's one id to configure, not
  // two that can drift apart.
  const by = OWNER
    ? `discord_user_id=eq.${encodeURIComponent(OWNER)}`
    : `discord_channel_id=eq.${encodeURIComponent(CHANNEL || "")}`;
  const owners = await sbGet(`chatters?${by}&select=id,name,discord_user_id,discord_channel_id`);
  if (owners.length > 1) console.warn(`${owners.length} chatters share this channel; using ${owners[0].name}. Set CADENCE_OWNER_ID to disambiguate.`);

  // No chatters row = no assignee = no tasks to list. The money line and the
  // checks still work and are still worth sending, so post a degraded card that
  // says so out loud rather than either dying silently or — worse — rendering a
  // clean, empty list that reads as "nothing to do today".
  const me = owners[0] || { id: null, name: null, discord_user_id: OWNER || null };
  const orphaned = !owners.length;
  if (orphaned) {
    console.warn(OWNER
      ? `no chatters row with discord_user_id=${OWNER} — posting money + checks only`
      : `no chatters row with discord_channel_id=${CHANNEL} — posting money + checks only`);
  }

  const since = (days) => new Date(now.getTime() - days * 86400_000).toISOString();

  // Every assignee-scoped query is skipped when there's no row to scope to —
  // `assignee_id=eq.null` is not a filter that means "nobody", it's a filter
  // that matches nothing in a way that looks identical to "all clear".
  const mine = (q) => (me.id ? sbGet(q) : Promise.resolve([]));

  // Queries that depend on columns the migration adds. Before it is applied
  // these 400 with 42703 (no such column) or PGRST200 (no such relationship);
  // both mean "this feature isn't installed yet", not "something is wrong", so
  // they degrade to empty rather than taking the card down. Any OTHER error
  // still throws — a silent catch-all here would hide real breakage forever.
  const soft = (q) => mine(q).catch((e) => {
    const m = String(e.message);
    if (m.includes("42703") || m.includes("PGRST200") || m.includes("PGRST204")) return [];
    throw e;
  });

  const [open, steps, recentExpired, recentDone, qcQueue, slaApplicants] = await Promise.all([
    // The embedded recurring_tasks(hard_gate) needs the FK the migration adds.
    // Before it lands — or if it's only half-applied — PostgREST 400s with
    // PGRST200. Fall back to the plain columns rather than failing the whole
    // card: without hard_gate every item is simply a normal item, which is the
    // correct pre-migration behaviour anyway.
    mine(`standalone_tasks?status=eq.open&assignee_id=eq.${me.id}&select=id,title,due_date,expires_at,recurring_task_id,created_at,recurring_tasks(hard_gate)&order=due_date.asc`)
      .catch(async (e) => {
        if (!String(e.message).includes("PGRST200")) throw e;
        console.warn("no recurring_tasks FK yet (migration not applied) — hard gates unavailable");
        return sbGet(`standalone_tasks?status=eq.open&assignee_id=eq.${me.id}&select=id,title,due_date,created_at&order=due_date.asc`);
      }),
    // He is skipped in api/discord-digest.js, so the card must carry these or
    // they vanish. Rolled up to one line — the card is not a second task list.
    mine(`task_pipeline_steps?status=eq.active&assignee_id=eq.${me.id}&select=step_name,task_pipelines!inner(title,status)&task_pipelines.status=eq.active`).catch(() => []),
    soft(`standalone_tasks?status=eq.done&resolution=eq.expired&assignee_id=eq.${me.id}&completed_at=gte.${since(14)}&select=recurring_task_id`),
    // Pre-migration there is no `resolution`, so fall back to plain completions:
    // "did he tick anything off recently" is answerable either way.
    soft(`standalone_tasks?status=eq.done&resolution=eq.done_manual&assignee_id=eq.${me.id}&completed_at=gte.${since(QUIET_DAYS)}&select=id`)
      .then((r) => (r.length ? r : mine(`standalone_tasks?status=eq.done&assignee_id=eq.${me.id}&completed_at=gte.${since(QUIET_DAYS)}&select=id`))),
    sbGet("content_tracker?stage=eq.received&select=creator").catch(() => []),
    sbGet(`applicants?ai_verdict=eq.pass&status=eq.new&created_at=lt.${since(2)}&select=id`).catch(() => []),
  ]);

  // In preview, add the occurrences that WOULD be generated for the target day.
  // Simulated in memory only. `weekdays` may not exist yet (pre-migration), in
  // which case every due rule is treated as firing — same as today's behaviour.
  if (PREVIEW_FOR && me.id) {
    const haveRule = new Set(open.map((t) => t.recurring_task_id).filter(Boolean));
    const isodow = ((new Date(`${PREVIEW_FOR}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const rules = await sbGet(
      `recurring_tasks?active=eq.true&assignee_id=eq.${me.id}&next_run=lte.${PREVIEW_FOR}&select=id,title,next_run`,
    ).catch(() => []);
    let withDays = [];
    try {
      withDays = await sbGet(`recurring_tasks?active=eq.true&assignee_id=eq.${me.id}&select=id,weekdays,hard_gate`);
    } catch { /* pre-migration: columns don't exist */ }
    const meta = Object.fromEntries(withDays.map((r) => [r.id, r]));
    for (const r of rules) {
      if (haveRule.has(r.id)) continue;                       // already open, don't double-count
      const m = meta[r.id];
      if (m && Array.isArray(m.weekdays) && m.weekdays.length && !m.weekdays.includes(isodow)) continue;
      open.push({
        id: `preview:${r.id}`, title: r.title, due_date: PREVIEW_FOR,
        recurring_task_id: r.id, recurring_tasks: { hard_gate: Boolean(m && m.hard_gate) },
      });
    }
  }

  // How many days running has each rule been re-raised and ignored?
  const streak = {};
  for (const t of recentExpired) if (t.recurring_task_id) streak[t.recurring_task_id] = (streak[t.recurring_task_id] || 0) + 1;

  // An orphaned card has no completions by construction — don't accuse someone
  // of ignoring a list that was never built for them.
  const quiet = !orphaned && recentDone.length === 0;
  const itemCap = quiet ? 1 : MAX_ITEMS;

  const isGate = (t) => Boolean(t.recurring_tasks && t.recurring_tasks.hard_gate);
  // "today" is the day the card is FOR, so overdue and gate logic read correctly
  // when previewing a future date.
  const today = PREVIEW_FOR || iso(now);
  const gates = open.filter(isGate).filter((t) => !t.due_date || t.due_date <= today).slice(0, MAX_GATES);

  // ANTI-STARVATION. There are ~14 rules competing for 2 slots, and several fire
  // daily, so on any given morning a pile of them share due_date = today.
  // Ordering by due_date alone leaves those ties to PostgREST's physical row
  // order — which means the same couple of items could win every single day
  // while the rest are never once seen. So: overdue first, then whatever has
  // been raised-and-ignored the most times, then oldest due date, then title as
  // a deterministic tie-break. Anything skipped today has a higher streak
  // tomorrow, so everything surfaces eventually and nothing starves.
  const rank = (a, b) => {
    const od = (t) => (t.due_date && t.due_date < today ? 0 : 1);
    if (od(a) !== od(b)) return od(a) - od(b);
    const st = (t) => streak[t.recurring_task_id] || 0;
    if (st(a) !== st(b)) return st(b) - st(a);
    const dd = (t) => t.due_date || "9999-12-31";
    if (dd(a) !== dd(b)) return dd(a) < dd(b) ? -1 : 1;
    return String(a.title).localeCompare(String(b.title));
  };
  const candidates = open.filter((t) => !isGate(t)).sort(rank);
  const items = candidates.slice(0, itemCap);

  const money = await moneyLine().catch((e) => { console.warn("money line:", e.message); return null; });

  // Assemble
  const lines = [];
  const labelDate = PREVIEW_FOR ? new Date(`${PREVIEW_FOR}T12:00:00Z`) : now;
  lines.push(`## 🗓️ ${cardLabel(labelDate)} · Day block opens 11:00`);
  if (me.discord_user_id) lines.push(`<@${me.discord_user_id}>`);
  if (PREVIEW_FOR) {
    lines.push(`-# ⚙️ Preview of tomorrow's card${DELETE_AFTER ? ` · self-deletes in ${Math.round(DELETE_AFTER / 60)} min` : ""} · nothing was written to the database`);
  }

  if (money && !money.failed) {
    // A total built from 4 of 9 accounts is not "yesterday's revenue". Say so on
    // the headline, not just in the checks line — an understated number read as
    // complete is how a morning gets misjudged.
    const partial = money.ok < money.totalAccts;
    const pctTxt = money.pct == null
      ? ""
      : ` (${arrow(money.pct)} vs 7d avg${money.paired < money.ok ? `, ${money.paired} accts` : ""})`;
    lines.push("");
    lines.push(`💷 **${partial ? `Partial — ${money.ok}/${money.totalAccts} accounts: ` : "Yesterday: "}$${fmtMoney(money.total)}**${pctTxt}`);
    const bits = [];
    if (money.best) bits.push(`Best: ${money.best.name} $${fmtMoney(money.best.day)}`);
    if (money.worst) bits.push(`Worst: ${money.worst.name} ${arrow(money.worst.delta)}`);
    if (bits.length) lines.push(`　${bits.join(" · ")}`);
  } else if (money && money.failed) {
    lines.push("");
    lines.push(`💷 _No account reported earnings — check the OF API key before reading anything else today._`);
  }

  if (gates.length) {
    lines.push("");
    for (const g of gates) {
      const overdue = g.due_date && g.due_date < today;
      lines.push(`⛔ **${g.title}**${overdue ? `  ← overdue since ${g.due_date}, this blocks other people` : ""}`);
    }
  }

  if (items.length) {
    lines.push("");
    lines.push("📋 " + items.map((t, i) => {
      const n = streak[t.recurring_task_id] || 0;
      return `${i + 1}. ${t.title}${n ? `  _(day ${n + 1})_` : ""}`;
    }).join("\n　"));
  }

  if (orphaned) {
    lines.push("");
    lines.push(`⚠️ _No \`chatters\` row matches ${OWNER ? `user \`${OWNER}\`` : `this channel`} — the task list is unavailable, not empty. Money and checks above are real._`);
  }

  if (steps.length) {
    lines.push("");
    const names = steps.slice(0, 3).map((s) => (s.task_pipelines && s.task_pipelines.title) || s.step_name);
    lines.push(`🔁 ${steps.length} pipeline${steps.length === 1 ? "" : "s"} waiting on you: ${names.join(" · ")}${steps.length > 3 ? " …" : ""}`);
  }

  // Only real checks. Each of these ran a query above.
  const checks = [];
  if (money && !money.failed) checks.push(`${money.ok}/${money.totalAccts} accounts reporting`);
  checks.push(`${qcQueue.length} content awaiting QC`);
  checks.push(`${slaApplicants.length} applicant${slaApplicants.length === 1 ? "" : "s"} past 48h SLA`);
  lines.push("");
  lines.push(`👀 ${checks.join(" · ")}`);
  lines.push(`🌙 Night block 03:00–11:00 is Liz's. Nothing from you.`);

  if (quiet) {
    lines.push("");
    // No reply listener exists, so this offers something that actually works
    // rather than a "reply PAUSE" nothing is watching for.
    lines.push(`-# Nothing ticked off in ${QUIET_DAYS} days, so this card is running short. Turn it off any time: GitHub → Actions → **Morning card** → ⋯ → Disable workflow.`);
  }

  const msg = lines.join("\n");

  if (DRY_RUN) {
    console.log(msg);
    console.log("\n---\n" + JSON.stringify({ expired, generated, open: open.length, gates: gates.length, items: items.length, quiet }, null, 2));
    return;
  }

  // Bot first — it's the only path that can pin. Fall back to the webhook if
  // the bot isn't configured, or if it is but the post fails (missing channel
  // permission is the usual cause, and a card that doesn't arrive is the one
  // failure this whole design can't survive).
  let transport = null, posted = null, pinned = false;

  if (canBot) {
    try {
      const botId = await dapi("/users/@me", { method: "GET" }).then((r) => r.json()).then((u) => u && u.id).catch(() => null);
      posted = await postToChannel(CHANNEL, msg);
      transport = "bot";
      if (botId && posted && posted.id) { await pinDaily(CHANNEL, posted.id, botId); pinned = true; }
    } catch (e) {
      if (!WEBHOOK) throw e;
      console.warn(`bot post failed (${e.message}) — falling back to webhook`);
    }
  }

  if (!transport) {
    posted = await postToWebhook(WEBHOOK, msg);
    transport = "webhook";
    // Pinning needs Manage Messages, which a webhook does not have and cannot
    // be granted. Yesterday's card stays pinned/unpinned exactly as it was.
  }

  // Self-destruct. Only the webhook path can do this without a bot token, and
  // a preview that outlives its own accuracy is worse than no preview.
  if (DELETE_AFTER > 0 && posted && posted.id) {
    console.log(`posted ${posted.id}; deleting in ${DELETE_AFTER}s`);
    await new Promise((r) => setTimeout(r, DELETE_AFTER * 1000));
    if (transport === "webhook") {
      await deleteWebhookMessage(WEBHOOK, posted.id);
    } else {
      await dapi(`/channels/${CHANNEL}/messages/${posted.id}`, { method: "DELETE" }).catch(() => {});
    }
    console.log("deleted");
  }

  console.log(JSON.stringify({
    ok: true, day: today, transport, pinned, owner: me.name, orphaned,
    preview: PREVIEW_FOR || false,
    expired: expired && expired.expired, gates: gates.length, items: items.length,
    dropped: candidates.length - items.length,
    quiet, money: money && !money.failed ? money.total : null,
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
