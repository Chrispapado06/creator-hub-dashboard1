// Telegram webhook endpoint — real-time /update and /24 commands.
//
// Telegram POSTs every new message in chats where Bernard (the bot)
// has access. This function:
//   1. Verifies the message is a /update or /24 command in the
//      configured UNCVRD Daily Stats chat.
//   2. Fetches OF stats for the requested window.
//   3. Replies in the same chat with text + a polished PDF.
//
// Response target: <2 seconds end-to-end. Deployed via the Supabase
// CLI; the webhook URL gets registered with Telegram so we no
// longer need GitHub Actions cron polling for these two commands.
//
// IMPORTANT: this function does not import from our shared
// payout-bot/* modules — those are Node-flavoured, this runs on
// Deno's standard runtime. Helpers are inlined.

import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

// ── Env ──────────────────────────────────────────────────────────
const OF_KEY   = Deno.env.get("ONLYFANSAPI_KEY")!;
const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TG_CHAT  = Deno.env.get("TELEGRAM_CHAT_ID_DAILY")!;
const WEBHOOK_SECRET = Deno.env.get("TG_WEBHOOK_SECRET") || ""; // optional, recommended

const OF_BASE = "https://app.onlyfansapi.com/api";

// Trial-link name → canonical platform (mirror of PLATFORM_ALIASES
// in payout-bot/config.mjs; keep in sync).
const PLATFORM_ALIASES: Record<string, string> = {
  "ig": "Instagram", "instagram": "Instagram", "insta": "Instagram",
  "reddit": "Reddit", "r": "Reddit",
  "x": "X", "twitter": "X",
  "tt": "TikTok", "tiktok": "TikTok",
  "ads": "Ads", "ad": "Ads",
  "tg": "Telegram", "telegram": "Telegram",
  "fb": "Facebook", "facebook": "Facebook",
  "snap": "Snapchat", "snapchat": "Snapchat",
  "yt": "YouTube", "youtube": "YouTube",
};
function normalizePlatform(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = String(name).toLowerCase().trim();
  if (PLATFORM_ALIASES[trimmed]) return PLATFORM_ALIASES[trimmed];
  const tokens = trimmed.split(/[\s_\-/]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  if (PLATFORM_ALIASES[tokens[0]]) return PLATFORM_ALIASES[tokens[0]];
  for (const t of tokens) {
    if (PLATFORM_ALIASES[t]) return PLATFORM_ALIASES[t];
  }
  return null;
}
function platformFromTagsOrName(tags: string[] | null | undefined, name: string | null | undefined): string | null {
  if (Array.isArray(tags)) {
    for (const t of tags) {
      const p = normalizePlatform(t);
      if (p) return p;
    }
  }
  return normalizePlatform(name);
}

// Mirror of CREATORS from payout-bot/config.mjs. Keep in sync.
const CREATORS = [
  { name: "Blue Bear",     account_id: "acct_99db42bda91149f58fd68ecccde21fa8" },
  { name: "Meg",           account_id: "acct_996fbed6bab449af89f211b4851896ef" },
  { name: "Johhnie",       account_id: "acct_ebbd462d60fd4718ac0792deaac898bb" },
  { name: "Emma",          account_id: "acct_9bae83ac547447798d39e2d816ecd339" },
  { name: "Marissa Munoz", account_id: "acct_42e1c9678cfa4d379d44422a39ef7991" },
  { name: "June - Sandra", account_id: "acct_9f27ee05d2554200a20c2711132fcbcd" },
  { name: "Julie",         account_id: "acct_7aa411ae5ab947feba989fe9f63f7a60" },
  { name: "Tess",          account_id: "acct_4f7732b4f8bc4a6abbca1c6620ceb49b" },
  { name: "Amara",         account_id: "acct_bdfdc404c17e49b9b1c810b14bff6967" },
];

const REPORT_TZ = "Europe/London";

// ── Time helpers (Europe/London) ─────────────────────────────────
function partsInTz(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short", hour12: false,
  }).formatToParts(date);
  const g = (t: string) => parts.find((p) => p.type === t)?.value;
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(g("year")!, 10),
    month: parseInt(g("month")!, 10),
    day: parseInt(g("day")!, 10),
    hour: parseInt(g("hour")!, 10) % 24,
    minute: parseInt(g("minute")!, 10),
    second: parseInt(g("second")!, 10),
    weekday: wdMap[g("weekday")!] ?? 0,
  };
}
function tzOffsetMinutes(date: Date, timeZone: string) {
  const p = partsInTz(date, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asIfUtc - date.getTime()) / 60000);
}
function wallTimeToUtc(year: number, month: number, day: number, h = 0, m = 0, s = 0, tz = REPORT_TZ) {
  const guess = new Date(Date.UTC(year, month - 1, day, h, m, s));
  return new Date(guess.getTime() - tzOffsetMinutes(guess, tz) * 60000);
}
function fmtDateInTz(date: Date, tz = REPORT_TZ) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "short", day: "2-digit", month: "short", year: "numeric",
  }).format(date);
}

// ── Telegram helpers ─────────────────────────────────────────────
const escHtml = (s: string) =>
  String(s ?? "").replace(/[&<>]/g, (c) => c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;");
const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function tgSend(chatId: number | string, html: string) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text: html, parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
}
async function tgSendDocument(chatId: number | string, filename: string, buffer: Uint8Array, caption?: string) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) { form.append("caption", caption); form.append("parse_mode", "HTML"); }
  form.append("document", new Blob([buffer], { type: "application/pdf" }), filename);
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendDocument`, { method: "POST", body: form });
}

// ── OF API ───────────────────────────────────────────────────────
const ofHeaders = { Authorization: `Bearer ${OF_KEY}`, Accept: "application/json" };

async function fetchSubMetricsDay(acctId: string, dateStr: string) {
  const r = await fetch(`${OF_BASE}/${acctId}/statistics/subscriber-metrics?start_date=${dateStr}&end_date=${dateStr}`, { headers: ofHeaders });
  if (!r.ok) return { totalSubs: 0, newSubs: 0, renewSubs: 0 };
  const j = await r.json();
  return {
    totalSubs: Number(j?.data?.total_subscriptions ?? 0),
    newSubs:   Number(j?.data?.new_subscriptions ?? 0),
    renewSubs: Number(j?.data?.renewed_subscriptions ?? 0),
  };
}
async function fetchDayEarnings(acctId: string, dateStr: string) {
  const r = await fetch(`${OF_BASE}/${acctId}/statistics/statements/earnings?type=total&start_date=${encodeURIComponent(dateStr + " 00:00:00")}&end_date=${encodeURIComponent(dateStr + " 23:59:59")}`, { headers: ofHeaders });
  if (!r.ok) return 0;
  const j = await r.json();
  const inner = Object.values(j?.data ?? {})[0] as any ?? {};
  return Number(inner.total ?? 0);
}

// Per-source-platform revenue + subs combining OF /tracking-links
// AND /trial-links. Each link is mapped to a platform via its tags
// first, then by parsing its name. Returns {} when no link matches.
async function fetchPlatformBreakdown(acctId: string, startIso: string, endIso: string) {
  const [trackR, trialR] = await Promise.all([
    fetch(`${OF_BASE}/${acctId}/tracking-links?limit=50`, { headers: ofHeaders }),
    fetch(`${OF_BASE}/${acctId}/trial-links?limit=50`,    { headers: ofHeaders }),
  ]);

  type Tagged = { kind: "tracking-links" | "trial-links"; id: number; platform: string };
  const tagged: Tagged[] = [];

  if (trackR.ok) {
    const j = await trackR.json();
    for (const l of (j?.data?.list ?? []) as any[]) {
      const platform = platformFromTagsOrName(l.tags, l.campaignName);
      if (platform) tagged.push({ kind: "tracking-links", id: l.id, platform });
    }
  }
  if (trialR.ok) {
    const j = await trialR.json();
    for (const l of (j?.data?.list ?? []) as any[]) {
      const platform = platformFromTagsOrName(l.tags, l.trialLinkName);
      if (platform) tagged.push({ kind: "trial-links", id: l.id, platform });
    }
  }
  if (tagged.length === 0) return {};

  const stats = await Promise.all(tagged.map(async (l) => {
    const url = `${OF_BASE}/${acctId}/${l.kind}/${l.id}/stats?date_start=${encodeURIComponent(startIso)}&date_end=${encodeURIComponent(endIso)}`;
    const r = await fetch(url, { headers: ofHeaders });
    if (!r.ok) return null;
    const sj = await r.json();
    const s = sj?.data?.summary ?? {};
    return {
      platform: l.platform,
      revenue: Number(s.revenue_total ?? 0),
      subs:    Number(s.subs_total ?? 0),
      clicks:  Number(s.clicks_total ?? 0),
    };
  }));

  const agg: Record<string, { revenue: number; subs: number; clicks: number }> = {};
  for (const s of stats) {
    if (!s) continue;
    agg[s.platform] ??= { revenue: 0, subs: 0, clicks: 0 };
    agg[s.platform].revenue += s.revenue;
    agg[s.platform].subs    += s.subs;
    agg[s.platform].clicks  += s.clicks;
  }
  return agg;
}

// Sum non-undo transactions in a precise window for sales.
async function fetchRollingSales(acctId: string, fromMs: number, toMs: number) {
  const fromStr = new Date(fromMs).toISOString().slice(0, 19).replace("T", " ");
  let sales = 0;
  let marker: string | null = null;
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({ limit: "100", startDate: fromStr });
    if (marker) qs.set("marker", marker);
    const r = await fetch(`${OF_BASE}/${acctId}/transactions?${qs}`, { headers: ofHeaders });
    if (!r.ok) break;
    const j = await r.json();
    const list: any[] = j?.data?.list ?? [];
    if (!list.length) break;
    for (const t of list) {
      const ts = new Date(t.createdAt).getTime();
      if (ts < fromMs || ts > toMs) continue;
      if (t.status === "undo") continue;
      sales += Number(t.net || 0);
    }
    const oldest = list[list.length - 1];
    if (oldest && new Date(oldest.createdAt).getTime() < fromMs) break;
    const next = j?.data?.nextMarker ?? j?.data?.marker;
    if (!next || j?.data?.hasMore === false) break;
    marker = String(next);
  }
  return sales;
}

// Pro-rated 24h subs (since OF stats only bucket by day).
async function fetchProratedSubs(acctId: string, fromMs: number, toMs: number) {
  const fromParts = partsInTz(new Date(fromMs), REPORT_TZ);
  const toParts   = partsInTz(new Date(toMs),   REPORT_TZ);
  const ymd = (p: ReturnType<typeof partsInTz>) =>
    `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`;
  if (ymd(fromParts) === ymd(toParts)) return await fetchSubMetricsDay(acctId, ymd(toParts));
  const [yest, today] = await Promise.all([
    fetchSubMetricsDay(acctId, ymd(fromParts)),
    fetchSubMetricsDay(acctId, ymd(toParts)),
  ]);
  const ukMidnightToday = wallTimeToUtc(toParts.year, toParts.month, toParts.day);
  const yestHours = Math.max(0, (ukMidnightToday.getTime() - fromMs) / 3600_000);
  const yf = Math.max(0, Math.min(1, yestHours / 24));
  return {
    totalSubs: Math.round(today.totalSubs + yest.totalSubs * yf),
    newSubs:   Math.round(today.newSubs   + yest.newSubs   * yf),
    renewSubs: Math.round(today.renewSubs + yest.renewSubs * yf),
  };
}

// ── PDF generation (inlined — Node-style pdf-lib but ESM-safe) ────
function safeText(s: any) {
  return String(s ?? "")
    .replace(/→|↣|⇒/g, ">").replace(/←|↢|⇐/g, "<")
    .replace(/↑/g, "^").replace(/↓/g, "v")
    .replace(/▲/g, "+").replace(/▼/g, "-")
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[^\x00-\xFF]/g, "");
}

async function buildPdf(title: string, subtitle: string, rows: any[], totalSubs: number, totalSales: number, headerRight: string) {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const page = doc.addPage([595, 842]);
  const brand = rgb(0.063, 0.388, 0.149);
  const ink = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.42, 0.42, 0.42);
  const rule = rgb(0.84, 0.84, 0.84);
  const band = rgb(0.95, 0.97, 0.95);
  const draw = (s: string, opts: any) => page.drawText(safeText(s), opts);
  const M = 50;
  let y = 792;
  draw("UNCVRD", { x: M, y, size: 22, font: bold, color: brand });
  const hrW = helv.widthOfTextAtSize(headerRight, 10);
  draw(headerRight, { x: 595 - M - hrW, y: y + 6, size: 10, font: helv, color: muted });
  page.drawLine({ start: { x: M, y: y - 10 }, end: { x: 595 - M, y: y - 10 }, thickness: 1.5, color: brand });
  y -= 30;
  draw(title, { x: M, y, size: 18, font: bold, color: ink });
  y -= 22;
  draw(subtitle, { x: M, y, size: 10, font: italic, color: muted });
  y -= 30;
  page.drawLine({ start: { x: M, y }, end: { x: 595 - M, y }, thickness: 0.6, color: rule });
  y -= 14;
  rows.forEach((r, i) => {
    const rowH = 40;
    if (i % 2 === 1) {
      page.drawRectangle({ x: M - 4, y: y - rowH + 4, width: 595 - 2 * M + 8, height: rowH, color: band });
    }
    draw(r.name, { x: M, y: y - 4, size: 13, font: bold, color: ink });
    draw(`${r.totalSubs} subscribers · ${r.newSubs} new, ${r.renewSubs} renew`, { x: M, y: y - 22, size: 9.5, font: helv, color: muted });
    const v = `$${fmtMoney(r.sales)}`;
    const vW = bold.widthOfTextAtSize(v, 13);
    draw(v, { x: 595 - M - vW, y: y - 4, size: 13, font: bold, color: brand });
    const vs = "sales";
    const vsW = helv.widthOfTextAtSize(vs, 9.5);
    draw(vs, { x: 595 - M - vsW, y: y - 22, size: 9.5, font: helv, color: muted });
    y -= rowH + 4;
  });
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: 595 - M, y }, thickness: 0.6, color: rule });
  y -= 14;
  draw("Total", { x: M, y: y - 6, size: 13, font: bold, color: ink });
  const tot = `${totalSubs} subs · $${fmtMoney(totalSales)}`;
  const totW = bold.widthOfTextAtSize(tot, 16);
  draw(tot, { x: 595 - M - totW, y: y - 8, size: 16, font: bold, color: brand });
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  draw(`Generated ${ts} UTC · Bernard · @bernarduncvrdbot`, { x: M, y: 28, size: 8, font: helv, color: muted });
  return await doc.save();
}

// ── Block formatting (reused by /update and /24) ─────────────────
function buildBreakdownBlock(
  name: string,
  totalSubs: number, newSubs: number, renewSubs: number,
  sales: number,
  platforms: Record<string, { revenue: number; subs: number; clicks: number }>,
): string {
  const lines: string[] = [];
  lines.push(`<b>${escHtml(name)}</b>`);
  lines.push(`  Subs: <b>${totalSubs}</b> <i>(${newSubs} new, ${renewSubs} renew)</i>`);
  lines.push(`  Sales: <b>$${fmtMoney(sales)}</b>`);
  const platformEntries = Object.entries(platforms).sort((a, b) => b[1].revenue - a[1].revenue);
  if (platformEntries.length > 0) {
    const pl = platformEntries.map(([p, s]) => `${escHtml(p)} $${fmtMoney(s.revenue)} <i>(${s.subs}s)</i>`).join(" · ");
    lines.push(`  <i>By source:</i> ${pl}`);
  }
  return lines.join("\n");
}

// Combine header + per-creator blocks + footer into one Telegram
// message when it fits, batching only when it actually exceeds the
// 4096-char-per-message Telegram cap.
async function tgSendCombined(chatId: number | string, header: string, parts: string[], footer = "") {
  const SOFT_LIMIT = 3800;
  const sep = "\n\n";
  const all = [header, ...parts, footer].filter(Boolean).join(sep);
  if (all.length <= SOFT_LIMIT) { await tgSend(chatId, all); return; }
  let buf = header;
  for (const p of parts) {
    const next = buf ? buf + sep + p : p;
    if (next.length > SOFT_LIMIT && buf) {
      await tgSend(chatId, buf);
      buf = p;
    } else {
      buf = next;
    }
  }
  if (footer && (buf + sep + footer).length <= SOFT_LIMIT) buf = buf + sep + footer;
  if (buf) await tgSend(chatId, buf);
  if (footer && !buf.endsWith(footer)) await tgSend(chatId, footer);
}

// ── Command handlers ─────────────────────────────────────────────
async function handleUpdate(chatId: number | string, requester: string) {
  await tgSend(chatId, "⏳ Fetching today's stats — back in a second...");
  const now = new Date();
  const here = partsInTz(now, REPORT_TZ);
  const dateStr = `${here.year}-${String(here.month).padStart(2,"0")}-${String(here.day).padStart(2,"0")}`;
  const dateLabel = fmtDateInTz(now);
  const nowLabel = new Intl.DateTimeFormat("en-GB", { timeZone: REPORT_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const todayMidUtc = wallTimeToUtc(here.year, here.month, here.day);
  const startIso = todayMidUtc.toISOString();
  const endIso = now.toISOString();

  const rows = await Promise.all(CREATORS.map(async (c) => {
    const [subs, sales, platforms] = await Promise.all([
      fetchSubMetricsDay(c.account_id, dateStr),
      fetchDayEarnings(c.account_id, dateStr),
      fetchPlatformBreakdown(c.account_id, startIso, endIso),
    ]);
    return { name: c.name, ...subs, sales, platforms };
  }));
  const totalSubs = rows.reduce((s, r) => s + r.totalSubs, 0);
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);

  const header = `📊 <b>LIVE STATS — ${escHtml(dateLabel)}</b>\n<i>Today so far (UK midnight → ${escHtml(nowLabel)} UK) · requested by ${escHtml(requester)}</i>`;
  const blocks = rows.map((r) => buildBreakdownBlock(r.name, r.totalSubs, r.newSubs, r.renewSubs, r.sales, r.platforms));
  const footer = `📈 <b>Day total so far:</b> ${totalSubs} subs · $${fmtMoney(totalSales)}`;
  await tgSendCombined(chatId, header, blocks, footer);

  try {
    const pdf = await buildPdf("Live Stats", `${dateLabel} · UK midnight → ${nowLabel} UK · requested by ${requester}`, rows, totalSubs, totalSales, "Live Stats Report");
    await tgSendDocument(chatId, `uncvrd-live-stats-${dateStr}.pdf`, pdf, `📄 Live stats report — ${escHtml(dateLabel)}`);
  } catch (e) { console.warn("PDF failed:", e); }
}

async function handle24h(chatId: number | string, requester: string) {
  await tgSend(chatId, "⏳ Fetching last 24h stats — back in a second...");
  const toUtc = new Date();
  const fromUtc = new Date(toUtc.getTime() - 24 * 3600_000);

  const tzFmt = new Intl.DateTimeFormat("en-GB", { timeZone: REPORT_TZ, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const window_ = `${tzFmt.format(fromUtc)} → ${tzFmt.format(toUtc)} UK`;

  // /24 uses calendar-day date strings for type/platform breakdowns
  // (those endpoints only bucket by full days). The breakdowns
  // therefore cover "today" calendar-wise, while sub counts +
  // sales are precisely scoped to the 24h window.
  const todayHere = partsInTz(toUtc, REPORT_TZ);
  const dateStr = `${todayHere.year}-${String(todayHere.month).padStart(2,"0")}-${String(todayHere.day).padStart(2,"0")}`;
  const startIso = fromUtc.toISOString();
  const endIso = toUtc.toISOString();

  const rows = await Promise.all(CREATORS.map(async (c) => {
    const [subs, sales, platforms] = await Promise.all([
      fetchProratedSubs(c.account_id, fromUtc.getTime(), toUtc.getTime()),
      fetchRollingSales(c.account_id, fromUtc.getTime(), toUtc.getTime()),
      fetchPlatformBreakdown(c.account_id, startIso, endIso),
    ]);
    return { name: c.name, ...subs, sales, platforms };
  }));
  const totalSubs = rows.reduce((s, r) => s + r.totalSubs, 0);
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);

  const header = `📊 <b>LAST 24 HOURS</b>\n<i>${escHtml(window_)} · requested by ${escHtml(requester)}</i>`;
  const blocks = rows.map((r) => buildBreakdownBlock(r.name, r.totalSubs, r.newSubs, r.renewSubs, r.sales, r.platforms));
  const footer = `📈 <b>24h total:</b> ${totalSubs} subs · $${fmtMoney(totalSales)}`;
  await tgSendCombined(chatId, header, blocks, footer);

  try {
    const stamp = toUtc.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const pdf = await buildPdf("Last 24 Hours", `${window_} · requested by ${requester}`, rows, totalSubs, totalSales, "Rolling 24h Report");
    await tgSendDocument(chatId, `uncvrd-24h-${stamp}.pdf`, pdf, `📄 Last 24h report`);
  } catch (e) { console.warn("PDF failed:", e); }
}

// ── HTTP handler ─────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  // Optional Telegram secret-token check
  if (WEBHOOK_SECRET) {
    const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (got !== WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
  }

  let update: any;
  try { update = await req.json(); }
  catch { return new Response("bad json", { status: 400 }); }

  const msg = update.message ?? update.edited_message;
  if (!msg?.text) return new Response("OK"); // not a text message

  // Only the configured chat
  if (String(msg.chat?.id) !== String(TG_CHAT)) return new Response("OK");

  const text = String(msg.text).trim();
  const requester = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name ?? "someone");
  const isUpdate = /^\/update(@\w+)?(\s|$)/i.test(text);
  const is24h    = /^\/24(@\w+)?(\s|$)/i.test(text);

  if (!isUpdate && !is24h) return new Response("OK");

  // Telegram retries if we don't 200 within ~60s — we do this work
  // sync because Supabase Edge Functions exit when the response is
  // returned (no waitUntil semantics).
  try {
    if (isUpdate) await handleUpdate(msg.chat.id, requester);
    else if (is24h) await handle24h(msg.chat.id, requester);
  } catch (e) {
    console.error("handler error:", e);
    try { await tgSend(msg.chat.id, `⚠️ Couldn't fetch stats: ${escHtml(String(e))}`); } catch {}
  }
  return new Response("OK", { status: 200 });
});
