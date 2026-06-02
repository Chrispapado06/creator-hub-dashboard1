// Discord interactions endpoint — Bernard Shift Approval bot.
//
// Discord POSTs every slash-command invocation and every button
// click to this URL. We:
//   1. Verify the request was signed by Discord using the bot's
//      ed25519 public key.
//   2. Route on interaction type:
//        1  PING                       → reply with type 1 (pong)
//        2  APPLICATION_COMMAND        → /shift, /shifts, /audit, /payroll
//        3  MESSAGE_COMPONENT          → button click (approve / adjust / reject)
//        5  MODAL_SUBMIT               → adjust-hours / reject-reason dialogs
//   3. Validate inputs, run cross-checks against Reddit, persist the
//      shift to the `shifts` table, store the proof image in the
//      `shift-proofs` bucket, and reply with an interactive embed.
//
// All long-running work (Reddit fetch, image upload) happens AFTER
// we ack with a deferred response (type 5) — Discord only gives us
// 3 seconds to first-respond.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

// ── Env ──────────────────────────────────────────────────────────
const DISCORD_PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY")!;
const DISCORD_BOT_TOKEN  = Deno.env.get("DISCORD_BOT_TOKEN")!;
const DISCORD_APP_ID     = Deno.env.get("DISCORD_APP_ID")!;
const MANAGER_ROLE_ID    = Deno.env.get("DISCORD_MANAGER_ROLE_ID") || "";
const MANAGER_CHANNEL_ID = Deno.env.get("DISCORD_MANAGER_CHANNEL_ID") || "";
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AIRTABLE_PAT       = Deno.env.get("AIRTABLE_PAT") || "";
const AIRTABLE_BASE_ID   = Deno.env.get("AIRTABLE_BASE_ID") || "";
const AIRTABLE_WEBHOOK_ID = Deno.env.get("AIRTABLE_WEBHOOK_ID") || "";
// John's Airtable user id, looked up from the base collaborators
// list. Hard-coded because there's only one scheduler today.
const JOHN_AIRTABLE_USER_ID = "usrrMlmwpEehMtPgZ";

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Posters config (mirror of payout-bot/reddit-lib.mjs POSTERS) ──
const POSTERS = [
  { name: "Cha",    accounts: ["blondejuliaaa", "IvyyyyPocket", "Lextaaa", "NoriChimes", "Caalythraa"] },
  { name: "Reylee", accounts: ["KiraaaaNest", "Seraphynne11", "MissMarissaBlonde", "velvetariiia"] },
  { name: "Dabi",   accounts: ["RareArea11", "Valerizzee", "duskkymira", "Lumiiivrae"] },
  { name: "Xy",     accounts: ["EntireFace00", "Jessieecorner", "Zephyyyrella"] },
];
// discord_user_id → role mapping. Posters get a Reddit cross-check
// based on their accounts; schedulers skip the cross-check since
// their work (captions/media prep) doesn't surface as Reddit posts.
type RoleMap = { name: string; role: "poster" | "scheduler" | "manager" };
const DISCORD_TO_POSTER: Record<string, RoleMap> = {
  "1444680433806606552": { name: "Cha",    role: "poster" },
  "1450503999513034816": { name: "Reylee", role: "poster" },
  "1506894077562585179": { name: "Dabi",   role: "poster" }, // aka "Dannah" in payroll spreadsheet
  "1145243881013792788": { name: "Xy",     role: "poster" },
  "748084934689947651":  { name: "John",   role: "scheduler" }, // no Reddit posts — caption/media prep
  "1128210622891438161": { name: "Chris",  role: "manager"   }, // owner — test submissions skip cross-check
};

const RATE_USD_PER_HOUR = 3.00;

// ── Discord signature verification ───────────────────────────────
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function verifyDiscordSignature(req: Request, rawBody: string): boolean {
  const sig = req.headers.get("X-Signature-Ed25519");
  const ts  = req.headers.get("X-Signature-Timestamp");
  if (!sig || !ts) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(ts + rawBody),
      hexToBytes(sig),
      hexToBytes(DISCORD_PUBLIC_KEY),
    );
  } catch { return false; }
}

// ── Reddit cross-check (session-based) ───────────────────────────
const UA = "Bernard-UNCVRD-bot/1.0 (by /u/Chrispapado06)";
const SESSION_GAP_MIN = 60;    // posts >60 min apart = different sessions
const SESSION_BUFFER_MIN = 15; // padding before first + after last post

// Reddit blocks Supabase Edge Function IPs from fetching either
// the JSON or RSS endpoints (HTTP 403). So instead of hitting
// Reddit live, we read from the `reddit_posts` table which a
// GitHub Actions cron polls every 5 minutes (GH's IPs are not
// blocked). The bot's view can be up to ~5 min stale.
async function fetchPostsInWindow(account: string, fromMs: number, toMs: number) {
  const fromISO = new Date(fromMs).toISOString();
  const toISO   = new Date(toMs).toISOString();
  const { data, error } = await supa
    .from("reddit_posts")
    .select("created_at")
    .eq("account", account)
    .gte("created_at", fromISO)
    .lte("created_at", toISO);
  if (error) {
    console.warn(`[reddit] DB error u/${account}: ${error.message}`);
    return [];
  }
  // Shape that the session estimator expects.
  return (data ?? []).map((r) => ({ created_utc: new Date(r.created_at).getTime() / 1000 }));
}

// Session-based estimate: groups posts into sessions where the gap
// between consecutive posts is ≤ SESSION_GAP_MIN, then sums each
// session's (last - first) + 2 × buffer.
function estimateSessionMinutes(allPosts: any[]) {
  if (allPosts.length === 0) return { minutes: 0, sessions: 0 };
  const sorted = allPosts.slice().sort((a, b) => a.created_utc - b.created_utc);
  const sessions: Array<{ start: number; end: number }> = [];
  let cur = { start: sorted[0].created_utc, end: sorted[0].created_utc };
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i].created_utc;
    if ((t - cur.end) / 60 <= SESSION_GAP_MIN) cur.end = t;
    else { sessions.push(cur); cur = { start: t, end: t }; }
  }
  sessions.push(cur);
  const minutes = sessions.reduce(
    (sum, s) => sum + ((s.end - s.start) / 60) + 2 * SESSION_BUFFER_MIN,
    0,
  );
  return { minutes: Math.round(minutes), sessions: sessions.length };
}

async function crossCheckShift(accounts: string[], fromMs: number, toMs: number) {
  const allPosts: any[] = [];
  for (const a of accounts) {
    const posts = await fetchPostsInWindow(a, fromMs, toMs);
    allPosts.push(...posts);
  }
  const { minutes, sessions } = estimateSessionMinutes(allPosts);
  return { minutes, sessions, postCount: allPosts.length };
}

// ── Airtable cross-check (for John, the scheduler) ───────────────
// John's work doesn't surface as Reddit posts — he edits caption
// rows inside the UNCVRD Reddit Table base. We subscribed to the
// base's webhooks API on setup; each cell-change emits a payload
// with the user id of whoever changed it. On every /shift we sync
// new payloads into Supabase (advancing the cursor), then query
// the rows where user_id = John's id in the shift window.
async function syncAirtablePayloads(): Promise<void> {
  if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID || !AIRTABLE_WEBHOOK_ID) return;

  // Get the last-known cursor, or start at 1 (the very beginning).
  const { data: stateRow } = await supa
    .from("airtable_webhook_state")
    .select("cursor")
    .eq("webhook_id", AIRTABLE_WEBHOOK_ID)
    .maybeSingle();
  let cursor: number = stateRow?.cursor ?? 1;

  // Walk the payloads endpoint until mightHaveMore=false.
  for (let i = 0; i < 50; i++) {
    const url = `https://api.airtable.com/v0/bases/${AIRTABLE_BASE_ID}/webhooks/${AIRTABLE_WEBHOOK_ID}/payloads?cursor=${cursor}`;
    const r = await fetch(url, { headers: { "Authorization": `Bearer ${AIRTABLE_PAT}` } });
    if (!r.ok) {
      console.warn(`[airtable] payloads HTTP ${r.status}`);
      return;
    }
    const j = await r.json();
    const payloads: any[] = j?.payloads ?? [];

    // Flatten each payload into one row per (user, table, record, kind).
    const rows: any[] = [];
    for (const p of payloads) {
      const ts = p.timestamp;
      const userId = p?.actionMetadata?.sourceMetadata?.user?.id;
      if (!ts || !userId) continue;
      const tables = p.changedTablesById ?? {};
      for (const [tableId, tbl] of Object.entries<any>(tables)) {
        const updated = tbl.changedRecordsById ?? {};
        const created = tbl.createdRecordsById ?? {};
        for (const recordId of Object.keys(updated)) {
          rows.push({ user_id: userId, ts, table_id: tableId, record_id: recordId, change_kind: "updated" });
        }
        for (const recordId of Object.keys(created)) {
          rows.push({ user_id: userId, ts, table_id: tableId, record_id: recordId, change_kind: "created" });
        }
      }
    }
    if (rows.length > 0) {
      // upsert with onConflict on the unique tuple — safe to re-run.
      await supa.from("airtable_activity").upsert(rows, {
        onConflict: "user_id,ts,table_id,record_id,change_kind",
        ignoreDuplicates: true,
      });
    }

    cursor = j?.cursor ?? cursor;
    if (!j?.mightHaveMore) break;
  }

  // Save cursor for next time.
  await supa
    .from("airtable_webhook_state")
    .upsert({ webhook_id: AIRTABLE_WEBHOOK_ID, cursor, updated_at: new Date().toISOString() }, {
      onConflict: "webhook_id",
    });

  // Airtable webhooks expire after 7 days unless refreshed; this
  // call (free, idempotent) pushes the expiry out another 7 days.
  try {
    await fetch(`https://api.airtable.com/v0/bases/${AIRTABLE_BASE_ID}/webhooks/${AIRTABLE_WEBHOOK_ID}/refresh`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${AIRTABLE_PAT}` },
    });
  } catch (e) { console.warn("[airtable] refresh failed", e); }
}

async function crossCheckAirtable(userId: string, fromMs: number, toMs: number) {
  await syncAirtablePayloads();
  const fromISO = new Date(fromMs).toISOString();
  const toISO   = new Date(toMs).toISOString();
  const { data: rows } = await supa
    .from("airtable_activity")
    .select("ts")
    .eq("user_id", userId)
    .gte("ts", fromISO)
    .lte("ts", toISO);
  // Reuse the same session estimator the Reddit path uses — feed it
  // a list of pseudo-posts with the right created_utc field.
  const pseudoPosts = (rows ?? []).map((r) => ({ created_utc: new Date(r.ts).getTime() / 1000 }));
  const { minutes, sessions } = estimateSessionMinutes(pseudoPosts);
  return { minutes, sessions, eventCount: pseudoPosts.length };
}

function classifyTolerance(claimedMin: number, estimatedMin: number) {
  if (estimatedMin === 0 && claimedMin > 0) return "flagged";
  if (claimedMin < estimatedMin) return "under";
  const ratio = estimatedMin === 0 ? Infinity : claimedMin / estimatedMin;
  if (ratio <= 1.2) return "within";
  if (ratio <= 1.5) return "slightly_over";
  return "flagged";
}

// ── Time-string parsing (accepts 19:00, 7pm, 7:30 PM) ────────────
// All clock-in / clock-out times are entered in Philippine time
// (PHT / Asia/Manila, UTC+8, no DST). We parse the wall time, then
// anchor it to "today" in PHT and convert to UTC for storage.
const SHIFT_TZ = "Asia/Manila";
const SHIFT_TZ_LABEL = "PHT";
const SHIFT_TZ_OFFSET_HOURS = 8;  // PHT is UTC+8 (no DST switches)

function getTodayInPht(now: Date = new Date()): { y: number; mo: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHIFT_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  return {
    y:  parseInt(parts.find((p) => p.type === "year")!.value, 10),
    mo: parseInt(parts.find((p) => p.type === "month")!.value, 10),
    d:  parseInt(parts.find((p) => p.type === "day")!.value, 10),
  };
}

function parseTimeStr(s: string, _dateRef?: Date): Date | null {
  const trimmed = s.trim().toLowerCase().replace(/\s+/g, "");
  let m = trimmed.match(/^(\d{1,2}):(\d{2})(am|pm)?$/);
  let h = NaN, min = NaN, ampm: string | undefined;
  if (m) { h = +m[1]; min = +m[2]; ampm = m[3]; }
  else {
    m = trimmed.match(/^(\d{1,2})(am|pm)$/);
    if (m) { h = +m[1]; min = 0; ampm = m[2]; }
  }
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;

  // Today's date in PHT (what's on the poster's wall clock right now).
  const today = getTodayInPht();
  // Convert PHT wall time → UTC by subtracting the +8h offset.
  return new Date(Date.UTC(today.y, today.mo - 1, today.d, h - SHIFT_TZ_OFFSET_HOURS, min, 0));
}

// Pretty-print a UTC Date as PHT wall clock ("Wed, 28 May 19:00").
function fmtPht(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SHIFT_TZ,
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

// ── Embed builders ───────────────────────────────────────────────
const fmt$ = (n: number) => "$" + n.toFixed(2);
const TOL_EMOJI: Record<string, string> = {
  within: "✅",
  slightly_over: "⚠️",
  flagged: "🚩",
  under: "ℹ️",
  scheduler: "🛠️",
  unmapped: "ℹ️",
  manual: "📸",
};

function shiftEmbed(shift: any) {
  const claimedH = shift.claimed_minutes / 60;
  const estH     = (shift.estimated_minutes ?? 0) / 60;
  const skipCheck = shift.tolerance === "scheduler" || shift.tolerance === "unmapped";
  const lines: string[] = [];

  // Decision banner — surfaces the approve/adjust/reject outcome
  // at the very top so it's the first thing the manager sees on a
  // glance, with the dollar amount that's actually being paid.
  if (shift.status && shift.status !== "pending") {
    const by = shift.approved_by_username ?? "unknown";
    const apprH = (shift.approved_minutes ?? 0) / 60;
    const apprPay = fmt$(apprH * RATE_USD_PER_HOUR);
    if (shift.status === "approved") {
      lines.push(`**✅ APPROVED — paid ${apprH.toFixed(2)}h (${apprPay}) by ${by}**`);
    } else if (shift.status === "adjusted") {
      lines.push(`**✏️ ADJUSTED to ${apprH.toFixed(2)}h (${apprPay}) by ${by}** *(claimed ${claimedH.toFixed(2)}h)*`);
    } else if (shift.status === "rejected") {
      lines.push(`**❌ REJECTED by ${by}**`);
      if (shift.reject_reason) lines.push(`> ${shift.reject_reason}`);
    }
    lines.push("");
  }

  lines.push(`**Window:** ${fmtPht(new Date(shift.start_at))} → ${fmtPht(new Date(shift.end_at)).slice(-5)} ${SHIFT_TZ_LABEL}`);
  lines.push(`**Claimed:** ${claimedH.toFixed(2)}h  (${fmt$(claimedH * RATE_USD_PER_HOUR)})`);
  if (shift.accounts?.length) lines.push(`**Accounts:** ${shift.accounts.map((a: string) => `u/${a}`).join(", ")}`);
  lines.push("");
  if (shift.tolerance === "scheduler") {
    // Legacy fallback — schedulers are now Airtable-cross-checked
    // and won't land here unless AIRTABLE_PAT is missing.
    lines.push(`**Cross-check:** 🛠️ Scheduler role — Airtable check unavailable.`);
    lines.push(`Manager judges from the attached proof of work.`);
  } else if (shift.tolerance === "manual") {
    lines.push(`**Cross-check:** 📸 Manager judges from the attached proof of work.`);
  } else if (shift.tolerance === "manager") {
    lines.push(`**Cross-check:** 👔 Manager test submission — cross-check skipped.`);
  } else if (shift.tolerance === "unmapped") {
    lines.push(`**Cross-check:** ℹ️ No Reddit accounts on file for this Discord user.`);
    lines.push(`Resubmit with \`accounts:handle1,handle2\` to enable the Reddit cross-check,`);
    lines.push(`or the manager can approve based on the attached proof.`);
  } else {
    // Pick the label/units based on the user's role: schedulers
    // (John) are checked against Airtable edits, posters against
    // Reddit posts. Same numeric fields underneath.
    const role = DISCORD_TO_POSTER[shift.discord_user_id]?.role ?? "poster";
    const isScheduler = role === "scheduler";
    const sourceLabel = isScheduler ? "Airtable" : "Reddit";
    const unitLabel   = isScheduler ? "edits" : "posts";
    lines.push(`**Cross-check (${sourceLabel}, last ${claimedH.toFixed(1)}h):**`);
    lines.push(`  ${shift.reddit_post_count ?? 0} ${unitLabel} in ${shift.reddit_session_count ?? 0} session(s)`);
    lines.push(`  Estimated active time: **${estH.toFixed(2)}h**`);
    lines.push(`  ${TOL_EMOJI[shift.tolerance] ?? "❓"} ${
      shift.tolerance === "within"        ? "Within tolerance — likely accurate"
      : shift.tolerance === "slightly_over"? "Slightly above estimate (20–50%)"
      : shift.tolerance === "flagged"      ? `Significant gap (>50% over) — check proof`
      : shift.tolerance === "under"        ? `Claim is BELOW the ${sourceLabel}-observed time`
      : "Estimate unavailable"
    }`);
  }
  if (shift.proof_discord_url) lines.push(`\n**Proof:** [attached](${shift.proof_discord_url})`);
  return {
    title: `🕐 Shift — ${shift.discord_username ?? shift.discord_user_id}`,
    description: lines.join("\n"),
    // Decided shifts override the tolerance-based color so the
    // left bar reflects the outcome at a glance.
    color: shift.status === "approved"          ? 0x2ECC71 // green
         : shift.status === "adjusted"          ? 0x3498DB // blue
         : shift.status === "rejected"          ? 0xE74C3C // red
         : shift.tolerance === "flagged"        ? 0xE74C3C
         : shift.tolerance === "slightly_over"  ? 0xF39C12
         : shift.tolerance === "under"          ? 0x3498DB
         : shift.tolerance === "scheduler"      ? 0x9B59B6 // distinct purple for scheduler shifts
         : shift.tolerance === "manager"        ? 0x607D8B // slate — owner/test submission
         : shift.tolerance === "unmapped"       ? 0x95A5A6 // grey — manager decides from proof
         : shift.tolerance === "manual"         ? 0x95A5A6 // grey — poster, judged from proof
         : 0x2ECC71,
    footer: { text: `Shift ID: ${shift.id} · status: ${shift.status}` },
    timestamp: new Date().toISOString(),
  };
}

function actionRow(shiftId: string) {
  return {
    type: 1,
    components: [
      { type: 2, style: 3, custom_id: `approve:${shiftId}`, label: "Approve as-is", emoji: { name: "✅" } },
      { type: 2, style: 1, custom_id: `adjust:${shiftId}`,  label: "Adjust hours",  emoji: { name: "✏️" } },
      { type: 2, style: 4, custom_id: `reject:${shiftId}`,  label: "Reject",       emoji: { name: "❌" } },
    ],
  };
}

// ── Slash-command handlers ───────────────────────────────────────
async function handleShiftSubmit(interaction: any): Promise<Response> {
  const opts = Object.fromEntries((interaction.data.options ?? []).map((o: any) => [o.name, o.value]));
  const userId   = interaction.member?.user?.id ?? interaction.user?.id;
  const userName = interaction.member?.user?.username ?? interaction.user?.username ?? "unknown";

  if (!opts.in || !opts.out) {
    return replyEphemeral("Both `in:` and `out:` are required. Example: `/shift in:19:00 out:21:30 accounts:blondejuliaaa proof:<image>`");
  }
  if (!opts.proof) {
    return replyEphemeral("📎 Proof attachment is required (screenshot of your work). Resubmit with an image attached.");
  }

  // Acknowledge first — we have only 3 sec to first-respond.
  // We'll fill in the actual embed via the followup webhook after
  // the Reddit cross-check + storage upload finish.
  queueMicrotask(() => processShiftSubmission(interaction, opts, userId, userName).catch(console.error));
  return new Response(JSON.stringify({ type: 5, data: { flags: 0 } }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function processShiftSubmission(interaction: any, opts: any, userId: string, userName: string) {
  const today = new Date();
  let startD = parseTimeStr(opts.in, today);
  let endD   = parseTimeStr(opts.out, today);
  if (!startD || !endD) {
    return editInteractionResponse(interaction, "Couldn't parse the time(s). Use 24h format like `19:00` or `7:30pm`. All times are in **PHT (Philippine time)**.");
  }
  // Handle overnight shifts FIRST — if `out` time < `in` time the
  // shift crossed PHT midnight, so bump `out` by 24h.
  if (endD <= startD) endD = new Date(endD.getTime() + 24 * 3600_000);

  // Then: if the resulting window is more than 1h in the future
  // (PHT), the VA almost certainly meant yesterday's shift — e.g.
  // they submit at 02:42 AM for a 19:00 → 21:30 shift that ended
  // a few hours ago, or at 7:33 PM UK for a 17:30 → 00:30 PHT
  // shift that's still hours away on the PHT calendar. Roll both
  // ends back 24h so the cross-check covers the actual work.
  const nowMs = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  if (endD.getTime() > nowMs + oneHourMs) {
    startD = new Date(startD.getTime() - 24 * 3600_000);
    endD   = new Date(endD.getTime()   - 24 * 3600_000);
  }

  const claimedMin = Math.round((endD.getTime() - startD.getTime()) / 60000);
  const accountsStr = String(opts.accounts ?? "").trim();
  let accounts: string[] = accountsStr ? accountsStr.split(/[,\s]+/).map((a) => a.replace(/^u\//i, "").trim()).filter(Boolean) : [];

  // Look up the user's role + poster mapping.
  const mapping = DISCORD_TO_POSTER[userId];
  const posterName = mapping?.name ?? null;
  const role = mapping?.role ?? "poster";

  // If a poster didn't specify accounts, fall back to their full
  // roster from POSTERS. Schedulers/managers skip the cross-check.
  if (role === "poster" && accounts.length === 0 && posterName) {
    accounts = POSTERS.find((p) => p.name === posterName)?.accounts ?? [];
  }

  // Resolve the proof attachment URL.
  const proofAttachment = interaction.data?.resolved?.attachments?.[opts.proof];
  const proofUrl: string | null = proofAttachment?.url ?? null;

  // Cross-check — schedulers (John) → Airtable edits, posters →
  // Reddit posts via the RSS feed. Managers skip the check; posters
  // we can't map to any accounts also skip ("unmapped").
  let estimatedMin = 0, sessions = 0, postCount = 0;
  let tolerance: string;
  if (role === "manager") tolerance = "manager";
  else if (role === "scheduler") {
    // John's the only one mapped right now; the Airtable user id
    // is hard-coded since there's just one scheduler.
    const cc = await crossCheckAirtable(JOHN_AIRTABLE_USER_ID, startD.getTime(), endD.getTime());
    estimatedMin = cc.minutes;
    sessions     = cc.sessions;
    postCount    = cc.eventCount;
    tolerance    = classifyTolerance(claimedMin, estimatedMin);
  }
  else if (accounts.length === 0) tolerance = "unmapped";
  else {
    const cc = await crossCheckShift(accounts, startD.getTime(), endD.getTime());
    estimatedMin = cc.minutes;
    sessions     = cc.sessions;
    postCount    = cc.postCount;
    tolerance    = classifyTolerance(claimedMin, estimatedMin);
  }

  // Upload the proof to permanent storage (Supabase). Discord CDN
  // links expire so we keep a local copy.
  let storagePath: string | null = null;
  if (proofUrl) {
    try {
      const imgRes = await fetch(proofUrl);
      if (imgRes.ok) {
        const buf = new Uint8Array(await imgRes.arrayBuffer());
        const ext = (proofAttachment?.content_type ?? "image/png").split("/")[1] ?? "png";
        storagePath = `${userId}/${Date.now()}.${ext}`;
        await supa.storage.from("shift-proofs").upload(storagePath, buf, { contentType: proofAttachment?.content_type ?? "image/png", upsert: false });
      }
    } catch (e) { console.warn("proof upload failed", e); }
  }

  // Persist the shift row.
  const { data: shift, error } = await supa
    .from("shifts")
    .insert({
      discord_user_id: userId,
      discord_username: userName,
      poster_name: posterName,
      start_at: startD.toISOString(),
      end_at: endD.toISOString(),
      claimed_minutes: claimedMin,
      accounts,
      proof_discord_url: proofUrl,
      proof_storage_path: storagePath,
      estimated_minutes: estimatedMin,
      reddit_post_count: postCount,
      reddit_session_count: sessions,
      tolerance,
      status: "pending",
    })
    .select()
    .single();
  if (error) {
    return editInteractionResponse(interaction, `Couldn't save the shift: ${error.message}`);
  }

  await editInteractionResponseEmbed(interaction, shift);
}

// ── Followup helpers ─────────────────────────────────────────────
async function editInteractionResponse(interaction: any, content: string) {
  const url = `https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${interaction.token}/messages/@original`;
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

async function editInteractionResponseEmbed(interaction: any, shift: any) {
  const url = `https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${interaction.token}/messages/@original`;
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [shiftEmbed(shift)],
      components: [actionRow(shift.id)],
    }),
  });
}

function replyEphemeral(content: string): Response {
  return new Response(JSON.stringify({
    type: 4,
    data: { content, flags: 1 << 6 }, // ephemeral
  }), { headers: { "Content-Type": "application/json" } });
}

function replyEmbed(embed: any, components?: any[]): Response {
  return new Response(JSON.stringify({
    type: 4,
    data: { embeds: [embed], components: components ?? [] },
  }), { headers: { "Content-Type": "application/json" } });
}

// ── /payroll — manager-only summary per VA ──────────────────────
// Pulls every approved/adjusted shift in the window, groups by
// Discord user, and reports the totals + $$ at the global rate.
async function handlePayroll(interaction: any): Promise<Response> {
  if (!userIsManager(interaction)) {
    return replyEphemeral("Manager-only command. Ask CHRIS to run this.");
  }
  const opts = Object.fromEntries((interaction.data.options ?? []).map((o: any) => [o.name, o.value]));
  const periodLabel = opts.period === "month" ? "Last 30 days" : "Last 7 days";
  const days = opts.period === "month" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

  const { data: rows, error } = await supa
    .from("shifts")
    .select("discord_user_id, discord_username, approved_minutes, status")
    .in("status", ["approved", "adjusted"])
    .gte("start_at", since);
  if (error) return replyEphemeral(`DB error: ${error.message}`);

  const agg = new Map<string, { name: string; minutes: number; shifts: number }>();
  for (const r of rows ?? []) {
    const id = r.discord_user_id;
    const display = DISCORD_TO_POSTER[id]?.name ?? r.discord_username ?? "Unknown";
    const cur = agg.get(id) ?? { name: display, minutes: 0, shifts: 0 };
    cur.minutes += r.approved_minutes ?? 0;
    cur.shifts += 1;
    agg.set(id, cur);
  }

  const sorted = [...agg.values()].sort((a, b) => b.minutes - a.minutes);
  const lines = sorted.map((v) => {
    const h = v.minutes / 60;
    return `**${v.name}** — ${h.toFixed(2)}h × \$${RATE_USD_PER_HOUR.toFixed(2)}/h = ${fmt$(h * RATE_USD_PER_HOUR)}  *(${v.shifts} shift${v.shifts === 1 ? "" : "s"})*`;
  });
  const totalH = sorted.reduce((s, v) => s + v.minutes / 60, 0);
  const total$ = totalH * RATE_USD_PER_HOUR;

  const embed = {
    title: `💼 Payroll — ${periodLabel}`,
    description: lines.length ? lines.join("\n") : "*No approved shifts in this window.*",
    color: 0x2ECC71,
    footer: { text: `TOTAL: ${totalH.toFixed(2)}h · ${fmt$(total$)} · since ${since.slice(0, 10)} UTC` },
    timestamp: new Date().toISOString(),
  };
  return replyEmbed(embed);
}

// ── /activity — Reddit-derived hours per poster (no /shift needed) ──
// On-demand audit so managers can see what a poster actually did on
// Reddit, independent of whether the poster filed a /shift. Useful
// for spotting under-claimers ("worked but didn't submit"), over-
// claimers, and no-shows. Window is either "today" (00:00 PHT → now)
// or "week" (rolling last 7 days).
async function handleActivity(interaction: any): Promise<Response> {
  if (!userIsManager(interaction)) {
    return replyEphemeral("Manager-only command.");
  }
  const opts = Object.fromEntries((interaction.data.options ?? []).map((o: any) => [o.name, o.value]));
  const target = String(opts.poster ?? "all");
  const period = String(opts.period ?? "today");

  // Defer the response — Reddit fetches take several seconds per
  // poster (multiple accounts each, ~250ms per page request).
  queueMicrotask(() => runActivityAudit(interaction, target, period).catch(console.error));
  return new Response(JSON.stringify({ type: 5, data: { flags: 1 << 6 } }), {
    headers: { "Content-Type": "application/json" },
  });
}

function activityWindow(period: string): { fromMs: number; toMs: number; label: string } {
  const now = Date.now();
  if (period === "week") {
    return { fromMs: now - 7 * 24 * 3600_000, toMs: now, label: "Last 7 days" };
  }
  // "today" — 00:00 PHT (today's date in Manila) → now.
  const today = getTodayInPht();
  const phtMidnightUtcMs = Date.UTC(today.y, today.mo - 1, today.d, 0 - SHIFT_TZ_OFFSET_HOURS, 0, 0);
  return { fromMs: phtMidnightUtcMs, toMs: now, label: `Today (since 00:00 ${SHIFT_TZ_LABEL})` };
}

async function runActivityAudit(interaction: any, target: string, period: string) {
  const { fromMs, toMs, label } = activityWindow(period);

  // Figure out which VAs to audit. "all" = every poster + John;
  // "John" alone = just John (Airtable); else = one poster (Reddit).
  type Auditee =
    | { name: string; kind: "reddit"; accounts: string[] }
    | { name: string; kind: "airtable"; airtableUserId: string };
  let targets: Auditee[];
  if (target === "all") {
    targets = [
      ...POSTERS.map((p) => ({ name: p.name, kind: "reddit" as const, accounts: p.accounts })),
      { name: "John", kind: "airtable" as const, airtableUserId: JOHN_AIRTABLE_USER_ID },
    ];
  } else if (target === "John") {
    targets = [{ name: "John", kind: "airtable", airtableUserId: JOHN_AIRTABLE_USER_ID }];
  } else {
    const p = POSTERS.find((p) => p.name === target);
    if (!p) return editInteractionResponse(interaction, `Unknown VA "${target}".`);
    targets = [{ name: p.name, kind: "reddit", accounts: p.accounts }];
  }

  const rows: Array<{ name: string; kind: "reddit" | "airtable"; posts: number; sessions: number; minutes: number; accounts: string[] }> = [];
  for (const t of targets) {
    if (t.kind === "airtable") {
      const cc = await crossCheckAirtable(t.airtableUserId, fromMs, toMs);
      rows.push({ name: t.name, kind: "airtable", posts: cc.eventCount, sessions: cc.sessions, minutes: cc.minutes, accounts: [] });
    } else {
      const cc = await crossCheckShift(t.accounts, fromMs, toMs);
      rows.push({ name: t.name, kind: "reddit", posts: cc.postCount, sessions: cc.sessions, minutes: cc.minutes, accounts: t.accounts });
    }
  }

  // Also pull what each poster actually claimed in the same window
  // so the manager sees claimed vs Reddit-derived side-by-side.
  const { data: shiftRows } = await supa
    .from("shifts")
    .select("poster_name, claimed_minutes, approved_minutes, status")
    .in("status", ["pending", "approved", "adjusted"])
    .gte("start_at", new Date(fromMs).toISOString())
    .lte("start_at", new Date(toMs).toISOString());
  const claimedByPoster = new Map<string, number>();
  for (const r of shiftRows ?? []) {
    if (!r.poster_name) continue;
    const mins = r.approved_minutes ?? r.claimed_minutes ?? 0;
    claimedByPoster.set(r.poster_name, (claimedByPoster.get(r.poster_name) ?? 0) + mins);
  }

  rows.sort((a, b) => b.minutes - a.minutes);
  const lines = rows.map((r) => {
    const h = r.minutes / 60;
    const claimedMin = claimedByPoster.get(r.name) ?? 0;
    const claimedH = claimedMin / 60;
    const sourceLabel = r.kind === "airtable" ? "Airtable" : "Reddit";
    const unitLabel   = r.kind === "airtable" ? "edits" : "posts";
    let verdict = "";
    if (r.posts === 0 && claimedMin === 0) verdict = "💤 nothing this window";
    else if (claimedMin === 0)             verdict = `🚩 worked, never filed a shift`;
    else if (claimedH > h * 1.5)           verdict = `⚠️ claimed > 1.5× ${sourceLabel} estimate`;
    else if (claimedH < h * 0.7)           verdict = `ℹ️ claimed below ${sourceLabel} estimate`;
    else                                   verdict = "✅ in line";
    const claimedTxt = claimedMin > 0 ? `claimed ${claimedH.toFixed(2)}h (${fmt$(claimedH * RATE_USD_PER_HOUR)})` : "no /shift filed";
    return `**${r.name}** — ${sourceLabel} ${h.toFixed(2)}h · ${r.posts} ${unitLabel} · ${r.sessions} session(s)\n   ${claimedTxt} · ${verdict}`;
  });

  const totalH = rows.reduce((s, r) => s + r.minutes / 60, 0);
  const embed = {
    title: `📊 Activity audit — ${target === "all" ? "all VAs" : target}`,
    description: lines.length ? lines.join("\n\n") : "*No VAs matched.*",
    color: 0x3498DB,
    footer: { text: `Window: ${label} · Σ ${totalH.toFixed(2)}h ≈ ${fmt$(totalH * RATE_USD_PER_HOUR)} at $${RATE_USD_PER_HOUR}/h` },
    timestamp: new Date().toISOString(),
  };
  const url = `https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${interaction.token}/messages/@original`;
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

// ── /check-subreddits — flag new vs already-in-list ─────────────
// When the agency picks up new subreddits to push to, John has to
// hand-check whether they're already in the 17 Airtable tables.
// This command pulls the master list, diffs against the input, and
// shows NEW vs EXISTS so he can skip the manual scan entirely.
async function handleCheckSubreddits(interaction: any): Promise<Response> {
  const opts = Object.fromEntries((interaction.data.options ?? []).map((o: any) => [o.name, o.value]));
  const rawInput = String(opts.subs ?? "");
  if (!rawInput.trim()) {
    return replyEphemeral("Pass a list, e.g. `/check-subreddits subs:r/sub1, r/sub2`");
  }
  // Acknowledge first — Airtable schema + record fetches take a
  // few seconds and we need to respond within 3.
  queueMicrotask(() => runCheckSubreddits(interaction, rawInput).catch(console.error));
  return new Response(JSON.stringify({ type: 5, data: { flags: 0 } }), {
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeSub(s: string): string {
  return s.trim().toLowerCase().replace(/^\/?r\//, "").replace(/\/$/, "");
}

async function runCheckSubreddits(interaction: any, rawInput: string) {
  if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
    return editInteractionResponse(interaction, "Airtable not configured.");
  }
  const inputs = rawInput
    .split(/[,\s]+/)
    .map(normalizeSub)
    .filter(Boolean);
  if (inputs.length === 0) {
    return editInteractionResponse(interaction, "No subreddits parsed from input.");
  }

  // Pull the master list: every table → fetch every record's Subreddit field.
  const tablesRes = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    headers: { "Authorization": `Bearer ${AIRTABLE_PAT}` },
  });
  if (!tablesRes.ok) {
    return editInteractionResponse(interaction, `Airtable schema fetch failed (HTTP ${tablesRes.status}).`);
  }
  const tablesJson = await tablesRes.json();
  const tables = tablesJson?.tables ?? [];

  // sub → [table names that have it]
  const subToTables = new Map<string, string[]>();
  for (const t of tables) {
    let offset = "";
    do {
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${t.id}?pageSize=100&fields[]=Subreddit${offset ? "&offset=" + offset : ""}`;
      const r = await fetch(url, { headers: { "Authorization": `Bearer ${AIRTABLE_PAT}` } });
      if (!r.ok) break;
      const j = await r.json();
      for (const rec of j.records ?? []) {
        const sub = normalizeSub(String(rec.fields?.Subreddit ?? ""));
        if (!sub) continue;
        if (!subToTables.has(sub)) subToTables.set(sub, []);
        const arr = subToTables.get(sub)!;
        if (!arr.includes(t.name)) arr.push(t.name);
      }
      offset = j.offset || "";
    } while (offset);
  }

  const lines: string[] = [];
  let newCount = 0, existsCount = 0;
  for (const sub of inputs) {
    const where = subToTables.get(sub);
    if (where && where.length > 0) {
      existsCount++;
      // Trim the table names so the line stays readable (drop the
      // " | <creator name>" suffix on each).
      const short = where.map((n) => n.split("|")[0].trim()).join(", ");
      lines.push(`❌ **r/${sub}** — already in: ${short}`);
    } else {
      newCount++;
      lines.push(`✅ **r/${sub}** — NEW (safe to add)`);
    }
  }
  const embed = {
    title: `🔎 Subreddit check — ${inputs.length} input`,
    description: lines.join("\n"),
    color: existsCount === 0 ? 0x2ECC71 : (newCount === 0 ? 0xE74C3C : 0xF39C12),
    footer: { text: `${newCount} new · ${existsCount} already exists · checked against ${subToTables.size} known subs` },
    timestamp: new Date().toISOString(),
  };
  const url = `https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${interaction.token}/messages/@original`;
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

// ── /shifts mine — last 14 days history ─────────────────────────
async function handleMyShifts(interaction: any): Promise<Response> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
  const { data: rows } = await supa
    .from("shifts")
    .select("start_at,end_at,claimed_minutes,approved_minutes,status,tolerance")
    .eq("discord_user_id", userId)
    .gte("start_at", since)
    .order("start_at", { ascending: false });
  const lines = (rows ?? []).map((r) => {
    const claimed = (r.claimed_minutes / 60).toFixed(2);
    const approved = r.approved_minutes != null ? `${(r.approved_minutes / 60).toFixed(2)}h` : "—";
    return `• ${fmtPht(new Date(r.start_at))} ${SHIFT_TZ_LABEL} · claimed ${claimed}h · approved ${approved} · ${r.status}`;
  });
  return replyEphemeral(lines.length ? lines.join("\n") : "No shifts submitted in the last 14 days.");
}

// ── Button handlers (approval flow) ──────────────────────────────
function userIsManager(interaction: any): boolean {
  if (!MANAGER_ROLE_ID) return true;
  const roles: string[] = interaction.member?.roles ?? [];
  return roles.includes(MANAGER_ROLE_ID);
}

async function handleButton(interaction: any): Promise<Response> {
  if (!userIsManager(interaction)) {
    return replyEphemeral("Only managers can approve / adjust / reject shifts.");
  }
  const [action, shiftId] = String(interaction.data.custom_id).split(":");
  const userId   = interaction.member?.user?.id ?? interaction.user?.id;
  const userName = interaction.member?.user?.username ?? interaction.user?.username ?? "unknown";

  if (action === "approve") {
    const claimed = (await supa.from("shifts").select("claimed_minutes").eq("id", shiftId).single()).data?.claimed_minutes;
    const { data: shift } = await supa
      .from("shifts")
      .update({
        status: "approved",
        approved_minutes: claimed,
        approved_by_discord_user_id: userId,
        approved_by_username: userName,
        approved_at: new Date().toISOString(),
      })
      .eq("id", shiftId)
      .select()
      .single();
    // type 7 UPDATE_MESSAGE — edits the original message in place
    // and removes the buttons by sending an empty components array.
    return new Response(JSON.stringify({
      type: 7,
      data: { embeds: [shiftEmbed(shift)], components: [] },
    }), { headers: { "Content-Type": "application/json" } });
  }

  if (action === "adjust") {
    return new Response(JSON.stringify({
      type: 9, // MODAL
      data: {
        custom_id: `adjust_modal:${shiftId}`,
        title: "Adjust hours",
        components: [{
          type: 1,
          components: [{
            type: 4, custom_id: "hours", label: "Approved hours (e.g. 2.5)",
            style: 1, required: true, max_length: 6,
          }],
        }],
      },
    }), { headers: { "Content-Type": "application/json" } });
  }

  if (action === "reject") {
    return new Response(JSON.stringify({
      type: 9,
      data: {
        custom_id: `reject_modal:${shiftId}`,
        title: "Reject shift",
        components: [{
          type: 1,
          components: [{
            type: 4, custom_id: "reason", label: "Reason (visible to poster)",
            style: 2, required: true, max_length: 500,
          }],
        }],
      },
    }), { headers: { "Content-Type": "application/json" } });
  }

  return replyEphemeral("Unknown action.");
}

async function handleModal(interaction: any): Promise<Response> {
  const [kind, shiftId] = String(interaction.data.custom_id).split(":");
  const userId   = interaction.member?.user?.id ?? interaction.user?.id;
  const userName = interaction.member?.user?.username ?? interaction.user?.username ?? "unknown";
  const values = Object.fromEntries(
    (interaction.data.components ?? []).map((row: any) => {
      const c = row.components[0];
      return [c.custom_id, c.value];
    }),
  );

  if (kind === "adjust_modal") {
    const hours = parseFloat(values.hours);
    if (!Number.isFinite(hours) || hours < 0) return replyEphemeral("Invalid hours.");
    const minutes = Math.round(hours * 60);
    const { data: shift } = await supa
      .from("shifts")
      .update({
        status: "adjusted",
        approved_minutes: minutes,
        approved_by_discord_user_id: userId,
        approved_by_username: userName,
        approved_at: new Date().toISOString(),
      })
      .eq("id", shiftId)
      .select()
      .single();
    return new Response(JSON.stringify({
      type: 7, // UPDATE_MESSAGE — edits the parent message in place
      data: { embeds: [shiftEmbed(shift)], components: [] },
    }), { headers: { "Content-Type": "application/json" } });
  }

  if (kind === "reject_modal") {
    const { data: shift } = await supa
      .from("shifts")
      .update({
        status: "rejected",
        reject_reason: values.reason,
        approved_by_discord_user_id: userId,
        approved_by_username: userName,
        approved_at: new Date().toISOString(),
      })
      .eq("id", shiftId)
      .select()
      .single();
    return new Response(JSON.stringify({
      type: 7,
      data: { embeds: [shiftEmbed(shift)], components: [] },
    }), { headers: { "Content-Type": "application/json" } });
  }

  return replyEphemeral("Unknown modal.");
}

// ── HTTP entry point ─────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("OK");
  const raw = await req.text();
  if (!verifyDiscordSignature(req, raw)) return new Response("invalid signature", { status: 401 });
  const interaction = JSON.parse(raw);

  // Type 1 — Discord verification ping
  if (interaction.type === 1) return new Response(JSON.stringify({ type: 1 }), { headers: { "Content-Type": "application/json" } });

  // Type 2 — slash commands
  if (interaction.type === 2) {
    const name = interaction.data?.name;
    if (name === "shift")            return handleShiftSubmit(interaction);
    if (name === "shifts")           return handleMyShifts(interaction);
    if (name === "payroll")          return handlePayroll(interaction);
    if (name === "activity")         return handleActivity(interaction);
    if (name === "check-subreddits") return handleCheckSubreddits(interaction);
    return replyEphemeral("Unknown command.");
  }

  // Type 3 — button clicks
  if (interaction.type === 3) return handleButton(interaction);

  // Type 5 — modal submits
  if (interaction.type === 5) return handleModal(interaction);

  return new Response("unsupported interaction type", { status: 400 });
});
