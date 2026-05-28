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
// discord_user_id → poster_name. Filled by manager via /poster_map (TBD)
// or by hand below. Empty start; gets populated post-deploy.
const DISCORD_TO_POSTER: Record<string, string> = {};

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

async function fetchPostsInWindow(account: string, fromMs: number, toMs: number) {
  const out: any[] = [];
  let after: string | null = null;
  for (let i = 0; i < 6; i++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (after) qs.set("after", after);
    const r = await fetch(`https://www.reddit.com/user/${account}/submitted.json?${qs}`, { headers: { "User-Agent": UA } });
    if (!r.ok) return out;
    const j = await r.json();
    const children: any[] = j?.data?.children ?? [];
    if (children.length === 0) break;
    for (const c of children) {
      const ts = Number(c.data.created_utc) * 1000;
      if (ts >= fromMs && ts <= toMs) out.push(c.data);
    }
    const oldest = children[children.length - 1].data;
    if (Number(oldest.created_utc) * 1000 < fromMs) break;
    after = j?.data?.after;
    if (!after) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
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

function classifyTolerance(claimedMin: number, estimatedMin: number) {
  if (estimatedMin === 0 && claimedMin > 0) return "flagged";
  if (claimedMin < estimatedMin) return "under";
  const ratio = estimatedMin === 0 ? Infinity : claimedMin / estimatedMin;
  if (ratio <= 1.2) return "within";
  if (ratio <= 1.5) return "slightly_over";
  return "flagged";
}

// ── Time-string parsing (accepts 19:00, 7pm, 7:30 PM) ────────────
function parseTimeStr(s: string, dateRef: Date): Date | null {
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
  const d = new Date(dateRef);
  d.setUTCHours(h, min, 0, 0);
  return d;
}

// ── Embed builders ───────────────────────────────────────────────
const fmt$ = (n: number) => "$" + n.toFixed(2);
const TOL_EMOJI: Record<string, string> = {
  within: "✅",
  slightly_over: "⚠️",
  flagged: "🚩",
  under: "ℹ️",
};

function shiftEmbed(shift: any) {
  const claimedH = shift.claimed_minutes / 60;
  const estH     = (shift.estimated_minutes ?? 0) / 60;
  const lines: string[] = [];
  lines.push(`**Window:** ${new Date(shift.start_at).toUTCString().slice(0, 22)} → ${new Date(shift.end_at).toUTCString().slice(17, 22)}`);
  lines.push(`**Claimed:** ${claimedH.toFixed(2)}h  (${fmt$(claimedH * RATE_USD_PER_HOUR)})`);
  if (shift.accounts?.length) lines.push(`**Accounts:** ${shift.accounts.map((a: string) => `u/${a}`).join(", ")}`);
  lines.push("");
  lines.push(`**Cross-check (Reddit, last ${claimedH.toFixed(1)}h):**`);
  lines.push(`  ${shift.reddit_post_count ?? 0} posts in ${shift.reddit_session_count ?? 0} session(s)`);
  lines.push(`  Estimated active time: **${estH.toFixed(2)}h**`);
  lines.push(`  ${TOL_EMOJI[shift.tolerance] ?? "❓"} ${
    shift.tolerance === "within"        ? "Within tolerance — likely accurate"
    : shift.tolerance === "slightly_over"? "Slightly above estimate (20–50%)"
    : shift.tolerance === "flagged"      ? "Significant gap (>50% over) — check proof"
    : shift.tolerance === "under"        ? "Claim is BELOW the Reddit-observed time"
    : "Estimate unavailable"
  }`);
  if (shift.proof_discord_url) lines.push(`\n**Proof:** [attached](${shift.proof_discord_url})`);
  return {
    title: `🕐 Shift — ${shift.discord_username ?? shift.discord_user_id}`,
    description: lines.join("\n"),
    color: shift.tolerance === "flagged" ? 0xE74C3C
         : shift.tolerance === "slightly_over" ? 0xF39C12
         : shift.tolerance === "under" ? 0x3498DB
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
  const startD = parseTimeStr(opts.in, today);
  const endD   = parseTimeStr(opts.out, today);
  if (!startD || !endD) {
    return editInteractionResponse(interaction, "Couldn't parse the time(s). Use 24h format like `19:00` or `7:30pm`.");
  }
  if (endD < startD) endD.setUTCDate(endD.getUTCDate() + 1); // shift crossed midnight

  const claimedMin = Math.round((endD.getTime() - startD.getTime()) / 60000);
  const accountsStr = String(opts.accounts ?? "").trim();
  let accounts: string[] = accountsStr ? accountsStr.split(/[,\s]+/).map((a) => a.replace(/^u\//i, "").trim()).filter(Boolean) : [];

  // If they didn't specify accounts, fall back to their poster's full roster.
  const posterName = DISCORD_TO_POSTER[userId] ?? null;
  if (accounts.length === 0 && posterName) {
    accounts = POSTERS.find((p) => p.name === posterName)?.accounts ?? [];
  }

  // Resolve the proof attachment URL.
  const proofAttachment = interaction.data?.resolved?.attachments?.[opts.proof];
  const proofUrl: string | null = proofAttachment?.url ?? null;

  // Cross-check Reddit activity.
  const { minutes: estimatedMin, sessions, postCount } = await crossCheckShift(accounts, startD.getTime(), endD.getTime());
  const tolerance = classifyTolerance(claimedMin, estimatedMin);

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
    return `• ${new Date(r.start_at).toUTCString().slice(0, 16)} · claimed ${claimed}h · approved ${approved} · ${r.status}`;
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
    const { data: shift } = await supa
      .from("shifts")
      .update({
        status: "approved",
        approved_minutes: (await supa.from("shifts").select("claimed_minutes").eq("id", shiftId).single()).data?.claimed_minutes,
        approved_by_discord_user_id: userId,
        approved_by_username: userName,
        approved_at: new Date().toISOString(),
      })
      .eq("id", shiftId)
      .select()
      .single();
    return replyEmbed({
      ...shiftEmbed(shift),
      footer: { text: `Shift ${shiftId} · approved by ${userName}` },
    });
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
    return replyEmbed({ ...shiftEmbed(shift), footer: { text: `Shift ${shiftId} · adjusted to ${hours}h by ${userName}` } });
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
    return replyEmbed({ ...shiftEmbed(shift), footer: { text: `Shift ${shiftId} · rejected by ${userName} — ${values.reason}` } });
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
    if (name === "shift")  return handleShiftSubmit(interaction);
    if (name === "shifts") return handleMyShifts(interaction);
    return replyEphemeral("Unknown command.");
  }

  // Type 3 — button clicks
  if (interaction.type === 3) return handleButton(interaction);

  // Type 5 — modal submits
  if (interaction.type === 5) return handleModal(interaction);

  return new Response("unsupported interaction type", { status: 400 });
});
