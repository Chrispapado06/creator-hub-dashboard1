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

  // IMPORTANT: summary.*_total fields are LIFETIME even when
  // date_start/date_end are passed. Per-window numbers live in
  // daily_metrics (one row per UTC day in window). Sum those.
  const stats = await Promise.all(tagged.map(async (l) => {
    const url = `${OF_BASE}/${acctId}/${l.kind}/${l.id}/stats?date_start=${encodeURIComponent(startIso)}&date_end=${encodeURIComponent(endIso)}`;
    const r = await fetch(url, { headers: ofHeaders });
    if (!r.ok) return null;
    const sj = await r.json();
    const daily: any[] = sj?.data?.daily_metrics ?? [];
    let revenue = 0, subs = 0, clicks = 0;
    for (const d of daily) {
      revenue += Number(d.revenue ?? 0);
      subs    += Number(d.subs    ?? 0);
      clicks  += Number(d.clicks  ?? 0);
    }
    return { platform: l.platform, revenue, subs, clicks };
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

// ── PDF generation (inlined — multi-page Deno port of pdf-report.mjs)
function safeText(s: any) {
  return String(s ?? "")
    .replace(/→|↣|⇒/g, ">").replace(/←|↢|⇐/g, "<")
    .replace(/↑/g, "^").replace(/↓/g, "v")
    .replace(/▲/g, "+").replace(/▼/g, "-")
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[^\x00-\xFF]/g, "");
}
const PDF_C = {
  brand:    rgb(0.063, 0.388, 0.149),
  brand2:   rgb(0.32, 0.62, 0.40),
  ink:      rgb(0.08, 0.08, 0.08),
  muted:    rgb(0.42, 0.42, 0.42),
  rule:     rgb(0.84, 0.84, 0.84),
  band:     rgb(0.965, 0.978, 0.965),
  panel:    rgb(0.945, 0.965, 0.945),
};
const PDF_PAGE = { w: 595, h: 842, margin: 50 };
const BRAND_HEX = "#10632c";
const BRAND2_HEX = "#52a366";

// Free chart rendering via QuickChart (HTTP, no key). Always POST
// so we can avoid URL-length caps and use modern Chart.js. Returns
// PNG bytes or null so the PDF degrades gracefully on failure.
async function fetchChartPng(config: any, width = 700, height = 400): Promise<Uint8Array | null> {
  try {
    const cr = await fetch("https://quickchart.io/chart/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chart: config, width, height, backgroundColor: "white", devicePixelRatio: 2 }),
    });
    if (!cr.ok) return null;
    const { url: hosted } = await cr.json();
    const img = await fetch(hosted);
    return img.ok ? new Uint8Array(await img.arrayBuffer()) : null;
  } catch (e) {
    console.warn("QuickChart failed:", e);
    return null;
  }
}

// Horizontal money-bar chart with $ values baked into the y-axis
// labels (most reliable approach — QuickChart's datalabels-formatter
// string-eval is unreliable across versions, and JSON can't pass
// real JS callbacks).
function moneyBarChart(rows: Array<{ label: string; value: number }>, color: string) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  return {
    type: "bar",
    data: {
      labels: sorted.map((r) => `${r.label}  —  $${Number(r.value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`),
      datasets: [{
        data: sorted.map((r) => Number(Number(r.value).toFixed(2))),
        backgroundColor: color,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false }, title: { display: false } },
      scales: {
        x: { grid: { color: "#e9ecef" }, ticks: { display: false } },
        y: { ticks: { font: { size: 12, weight: "bold" } }, grid: { display: false } },
      },
      layout: { padding: { right: 30, left: 10 } },
    },
  };
}

function pdfHeader(page: any, fonts: any, kind: string) {
  page.drawRectangle({ x: 0, y: PDF_PAGE.h - 18, width: PDF_PAGE.w, height: 18, color: PDF_C.brand });
  page.drawText("UNCVRD", { x: PDF_PAGE.margin, y: PDF_PAGE.h - 50, size: 24, font: fonts.bold, color: PDF_C.brand });
  if (kind) {
    const w = fonts.regular.widthOfTextAtSize(kind, 10);
    page.drawText(kind, { x: PDF_PAGE.w - PDF_PAGE.margin - w, y: PDF_PAGE.h - 42, size: 10, font: fonts.regular, color: PDF_C.muted });
  }
  page.drawLine({ start: { x: PDF_PAGE.margin, y: PDF_PAGE.h - 60 }, end: { x: PDF_PAGE.w - PDF_PAGE.margin, y: PDF_PAGE.h - 60 }, thickness: 0.6, color: PDF_C.rule });
  return PDF_PAGE.h - 78;
}
function pdfFooter(page: any, fonts: any, pn: number, total: number) {
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  page.drawText(safeText(`Generated ${ts} UTC · Bernard · @bernarduncvrdbot`), { x: PDF_PAGE.margin, y: 28, size: 8, font: fonts.regular, color: PDF_C.muted });
  const right = `Page ${pn} of ${total}`;
  const w = fonts.regular.widthOfTextAtSize(right, 8);
  page.drawText(right, { x: PDF_PAGE.w - PDF_PAGE.margin - w, y: 28, size: 8, font: fonts.regular, color: PDF_C.muted });
}

async function buildPdf(
  title: string, subtitle: string,
  rows: Array<{ name: string; totalSubs: number; newSubs: number; renewSubs: number; sales: number; platforms?: Record<string, { revenue: number; subs: number; clicks: number }> }>,
  totalSubs: number, totalSales: number, headerRight: string,
) {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold:    await doc.embedFont(StandardFonts.HelveticaBold),
    italic:  await doc.embedFont(StandardFonts.HelveticaOblique),
  };

  // Aggregate platforms across creators (for cover + chart).
  const aggregatedPlatforms: Record<string, { revenue: number; subs: number; clicks: number }> = {};
  for (const r of rows) {
    for (const [p, s] of Object.entries(r.platforms ?? {})) {
      aggregatedPlatforms[p] ??= { revenue: 0, subs: 0, clicks: 0 };
      aggregatedPlatforms[p].revenue += Number(s.revenue || 0);
      aggregatedPlatforms[p].subs    += Number(s.subs || 0);
      aggregatedPlatforms[p].clicks  += Number(s.clicks || 0);
    }
  }
  const topCreator = [...rows].sort((a, b) => b.sales - a.sales)[0];
  const topSourceEntry = Object.entries(aggregatedPlatforms).sort((a, b) => b[1].revenue - a[1].revenue)[0];
  const topSource = topSourceEntry ? { platform: topSourceEntry[0], revenue: topSourceEntry[1].revenue, subs: topSourceEntry[1].subs } : null;
  const fmt$ = (n: number) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const fmtN = (n: number) => Number(n || 0).toLocaleString("en-US");
  const M = PDF_PAGE.margin;

  // ── Page 1: cover ──────────────────────────────────────────────
  const p1 = doc.addPage([PDF_PAGE.w, PDF_PAGE.h]);
  let y = pdfHeader(p1, fonts, headerRight);
  p1.drawText(safeText(title), { x: M, y, size: 26, font: fonts.bold, color: PDF_C.ink }); y -= 22;
  p1.drawText(safeText(subtitle), { x: M, y, size: 11, font: fonts.italic, color: PDF_C.muted }); y -= 50;

  const panelW = (PDF_PAGE.w - 2 * M - 20) / 3;
  const panelH = 90;
  const tiles = [
    { l: "TOTAL SUBSCRIBERS", v: fmtN(totalSubs), s: "new today" },
    { l: "TOTAL SALES",       v: fmt$(totalSales), s: "net revenue" },
    { l: "CREATORS REPORTED", v: String(rows.length), s: "active accounts" },
  ];
  for (let i = 0; i < tiles.length; i++) {
    const x = M + i * (panelW + 10);
    p1.drawRectangle({ x, y: y - panelH, width: panelW, height: panelH, color: PDF_C.panel });
    p1.drawRectangle({ x, y: y - panelH, width: 3, height: panelH, color: PDF_C.brand });
    p1.drawText(safeText(tiles[i].l), { x: x + 14, y: y - 22, size: 8, font: fonts.bold, color: PDF_C.muted });
    p1.drawText(safeText(tiles[i].v), { x: x + 14, y: y - 52, size: 22, font: fonts.bold, color: PDF_C.ink });
    p1.drawText(safeText(tiles[i].s), { x: x + 14, y: y - 70, size: 9, font: fonts.italic, color: PDF_C.muted });
  }
  y -= panelH + 32;
  p1.drawText("HIGHLIGHTS", { x: M, y, size: 10, font: fonts.bold, color: PDF_C.muted });
  y -= 18;
  p1.drawLine({ start: { x: M, y }, end: { x: PDF_PAGE.w - M, y }, thickness: 0.6, color: PDF_C.rule });
  y -= 18;
  if (topCreator) {
    p1.drawText("TOP CREATOR", { x: M, y, size: 8, font: fonts.bold, color: PDF_C.muted });
    p1.drawText(safeText(`${topCreator.name} — ${fmt$(topCreator.sales)} · ${fmtN(topCreator.totalSubs)} subs`),
      { x: M, y: y - 18, size: 13, font: fonts.bold, color: PDF_C.brand });
    y -= 42;
  }
  p1.drawText("TOP SOURCE PLATFORM", { x: M, y, size: 8, font: fonts.bold, color: PDF_C.muted });
  if (topSource) {
    p1.drawText(safeText(`${topSource.platform} — ${fmt$(topSource.revenue)} · ${fmtN(topSource.subs)} subs from ${topSource.platform}`),
      { x: M, y: y - 18, size: 13, font: fonts.bold, color: PDF_C.brand });
  } else {
    p1.drawText("No platform-tagged tracking links — see appendix",
      { x: M, y: y - 18, size: 11, font: fonts.italic, color: PDF_C.muted });
  }

  // ── Page 2: per-creator detail with platform breakdown ─────────
  let p2 = doc.addPage([PDF_PAGE.w, PDF_PAGE.h]);
  let y2 = pdfHeader(p2, fonts, headerRight);
  p2.drawText("Creator detail", { x: M, y: y2, size: 18, font: fonts.bold, color: PDF_C.ink }); y2 -= 18;
  p2.drawText(safeText(subtitle), { x: M, y: y2, size: 10, font: fonts.italic, color: PDF_C.muted }); y2 -= 22;
  const colXName = M, colXSubs = M + 270, colXSales = M + 390;
  const drawDetailHeader = () => {
    p2.drawRectangle({ x: M - 4, y: y2 - 4, width: PDF_PAGE.w - 2 * M + 8, height: 22, color: PDF_C.panel });
    p2.drawText("CREATOR", { x: colXName,  y: y2 + 5, size: 8, font: fonts.bold, color: PDF_C.muted });
    p2.drawText("SUBS",    { x: colXSubs,  y: y2 + 5, size: 8, font: fonts.bold, color: PDF_C.muted });
    p2.drawText("SALES",   { x: colXSales, y: y2 + 5, size: 8, font: fonts.bold, color: PDF_C.muted });
    y2 -= 12;
  };
  drawDetailHeader();
  rows.forEach((r, i) => {
    const platformEntries = Object.entries(r.platforms ?? {})
      .filter(([, s]) => (s.subs ?? 0) > 0 || (s.revenue ?? 0) > 0)
      .sort((a, b) => b[1].revenue - a[1].revenue);
    const baseH = 40;
    const rowH = baseH + platformEntries.length * 13;
    if (y2 - rowH < 80) {
      pdfFooter(p2, fonts, doc.getPages().indexOf(p2) + 1, doc.getPages().length);
      p2 = doc.addPage([PDF_PAGE.w, PDF_PAGE.h]);
      y2 = pdfHeader(p2, fonts, "Per-Creator Detail (cont.)") - 18;
      drawDetailHeader();
    }
    if (i % 2 === 1) p2.drawRectangle({ x: M - 4, y: y2 - rowH + 4, width: PDF_PAGE.w - 2 * M + 8, height: rowH, color: PDF_C.band });
    p2.drawText(safeText(r.name), { x: colXName, y: y2 - 6, size: 12, font: fonts.bold, color: PDF_C.ink });
    p2.drawText(safeText(`${fmtN(r.newSubs)} new · ${fmtN(r.renewSubs)} renew`),
      { x: colXName, y: y2 - 22, size: 9, font: fonts.regular, color: PDF_C.muted });
    p2.drawText(fmtN(r.totalSubs), { x: colXSubs,  y: y2 - 6, size: 13, font: fonts.bold, color: PDF_C.ink });
    p2.drawText(fmt$(r.sales),     { x: colXSales, y: y2 - 6, size: 13, font: fonts.bold, color: PDF_C.brand });
    let py = y2 - 36;
    for (const [platform, s] of platformEntries) {
      p2.drawText(safeText(`· From ${platform}: ${fmtN(s.subs)} sub${s.subs === 1 ? "" : "s"} · ${fmt$(s.revenue)}${s.clicks ? ` · ${fmtN(s.clicks)} clicks` : ""}`),
        { x: colXName + 8, y: py, size: 9, font: fonts.regular, color: PDF_C.muted });
      py -= 13;
    }
    y2 -= rowH + 2;
  });

  // ── Page 3: analytics charts ───────────────────────────────────
  const p3 = doc.addPage([PDF_PAGE.w, PDF_PAGE.h]);
  let y3 = pdfHeader(p3, fonts, "Analytics");
  p3.drawText("Analytics", { x: M, y: y3, size: 18, font: fonts.bold, color: PDF_C.ink }); y3 -= 18;
  p3.drawText(safeText(`${subtitle} · revenue and traffic insights`), { x: M, y: y3, size: 10, font: fonts.italic, color: PDF_C.muted }); y3 -= 16;

  const platformEntries = Object.entries(aggregatedPlatforms).sort((a, b) => b[1].revenue - a[1].revenue);
  p3.drawText("REVENUE BY SOURCE PLATFORM", { x: M, y: y3, size: 9, font: fonts.bold, color: PDF_C.muted });
  y3 -= 14;
  if (platformEntries.length > 0) {
    const png = await fetchChartPng(
      moneyBarChart(platformEntries.map(([p, s]) => ({ label: p, value: s.revenue })), BRAND_HEX),
      1000, 360,
    );
    if (png) {
      const img = await doc.embedPng(png);
      const drawW = PDF_PAGE.w - 2 * M;
      const drawH = drawW * (360 / 1000);
      p3.drawImage(img, { x: M, y: y3 - drawH, width: drawW, height: drawH });
      y3 -= drawH + 20;
    } else { p3.drawText("(chart unavailable)", { x: M, y: y3 - 14, size: 10, font: fonts.italic, color: PDF_C.muted }); y3 -= 30; }
  } else {
    p3.drawText(safeText("No platform-tagged tracking links yet — tag links with Reddit, Ig, Ads etc. in the OF API dashboard to enable source attribution."),
      { x: M, y: y3 - 14, size: 10, font: fonts.italic, color: PDF_C.muted });
    y3 -= 36;
  }

  p3.drawText("REVENUE BY CREATOR", { x: M, y: y3, size: 9, font: fonts.bold, color: PDF_C.muted });
  y3 -= 14;
  if (rows.length > 0) {
    const png = await fetchChartPng(
      moneyBarChart(rows.map((r) => ({ label: r.name, value: r.sales })), BRAND2_HEX),
      1000, 400,
    );
    if (png) {
      const img = await doc.embedPng(png);
      const drawW = PDF_PAGE.w - 2 * M;
      const drawH = drawW * (400 / 1000);
      p3.drawImage(img, { x: M, y: y3 - drawH, width: drawW, height: drawH });
    }
  }

  // Footers on every page
  const pages = doc.getPages();
  pages.forEach((pg, i) => pdfFooter(pg, fonts, i + 1, pages.length));
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
