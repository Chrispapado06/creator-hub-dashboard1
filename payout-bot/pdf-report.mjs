// PDF report generator — pdf-lib (npm) + QuickChart (free, no-key
// HTTP charts) for embedded analytics. Workflows must
//   cd payout-bot && npm ci
// before invoking any script that imports this module.
//
// Each PDF is multi-page and intentionally restrained:
//   Page 1   Cover / executive summary (big numbers)
//   Page 2   Per-creator detail rows (the same data as the
//            Telegram message, in table form)
//   Page 3   Analytics charts:
//              • Revenue by source (across all creators)
//              • Revenue by creator
//
// pdf-lib's bundled Helvetica is WinAnsi — it throws on arrows /
// emoji / non-Latin-1, so all drawText() goes through safeDraw()
// which strips/sanitises before drawing.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ── Brand palette ────────────────────────────────────────────────
const C = {
  brand:    rgb(0.063, 0.388, 0.149),  // deep UNCVRD green
  brand2:   rgb(0.32,  0.62,  0.40),   // softer green for accents
  ink:      rgb(0.08,  0.08,  0.08),
  muted:    rgb(0.42,  0.42,  0.42),
  rule:     rgb(0.84,  0.84,  0.84),
  band:     rgb(0.965, 0.978, 0.965),
  panel:    rgb(0.945, 0.965, 0.945),
  white:    rgb(1, 1, 1),
};

const PAGE = { w: 595, h: 842, margin: 50 };  // A4 portrait, points

// ── Text-safety wrapper for WinAnsi-only fonts ───────────────────
function safeText(s) {
  return String(s ?? "")
    .replace(/→|↣|⇒/g, ">")
    .replace(/←|↢|⇐/g, "<")
    .replace(/↑/g, "^").replace(/↓/g, "v")
    .replace(/▲/g, "+").replace(/▼/g, "-")
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[^\x00-\xFF]/g, "");
}
function safeDraw(page, str, opts) {
  page.drawText(safeText(str), opts);
}

// ── Formatting ───────────────────────────────────────────────────
const fmt$ = (n) => Number(n || 0).toLocaleString("en-US",
  { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtN = (n) => Number(n || 0).toLocaleString("en-US");

// ── QuickChart helper — fetches a chart image as PNG ─────────────
// QuickChart is free, no key required. Caller passes a Chart.js
// config object; we URL-encode it. Returns null on failure so the
// PDF gracefully renders without the chart rather than crashing.
async function fetchChartPng(config, width = 700, height = 400) {
  try {
    const url = "https://quickchart.io/chart"
      + `?w=${width}&h=${height}&bkg=white&c=${encodeURIComponent(JSON.stringify(config))}`;
    if (url.length > 16000) {
      // QuickChart caps URL length. Fall back to POST for big configs.
      const r = await fetch("https://quickchart.io/chart/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart: config, width, height, backgroundColor: "white" }),
      });
      if (!r.ok) return null;
      const { url: hosted } = await r.json();
      const img = await fetch(hosted);
      return img.ok ? new Uint8Array(await img.arrayBuffer()) : null;
    }
    const r = await fetch(url);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch (e) {
    console.warn("QuickChart fetch failed:", e);
    return null;
  }
}

const BRAND_HEX = "#10632c";       // hex form of C.brand for chart bg
const BRAND2_HEX = "#52a366";

// ── Layout primitives ────────────────────────────────────────────
function newPage(doc) { return doc.addPage([PAGE.w, PAGE.h]); }

async function loadFonts(doc) {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold:    await doc.embedFont(StandardFonts.HelveticaBold),
    italic:  await doc.embedFont(StandardFonts.HelveticaOblique),
  };
}

// Branded header strip at the top of every page.
function drawPageHeader(page, fonts, kind) {
  // top accent rectangle
  page.drawRectangle({
    x: 0, y: PAGE.h - 18, width: PAGE.w, height: 18, color: C.brand,
  });
  safeDraw(page, "UNCVRD", {
    x: PAGE.margin, y: PAGE.h - 50, size: 24, font: fonts.bold, color: C.brand,
  });
  if (kind) {
    const w = fonts.regular.widthOfTextAtSize(kind, 10);
    safeDraw(page, kind, {
      x: PAGE.w - PAGE.margin - w, y: PAGE.h - 42,
      size: 10, font: fonts.regular, color: C.muted,
    });
  }
  // hairline rule under the wordmark
  page.drawLine({
    start: { x: PAGE.margin, y: PAGE.h - 60 },
    end:   { x: PAGE.w - PAGE.margin, y: PAGE.h - 60 },
    thickness: 0.6, color: C.rule,
  });
  return PAGE.h - 78;  // y cursor for body content
}

function drawPageFooter(page, fonts, pageNum, totalPages) {
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  safeDraw(page, `Generated ${ts} UTC · Bernard · @bernarduncvrdbot`, {
    x: PAGE.margin, y: 28, size: 8, font: fonts.regular, color: C.muted,
  });
  const right = `Page ${pageNum} of ${totalPages}`;
  const w = fonts.regular.widthOfTextAtSize(right, 8);
  safeDraw(page, right, {
    x: PAGE.w - PAGE.margin - w, y: 28, size: 8, font: fonts.regular, color: C.muted,
  });
}

// ── Page 1 — Cover / Executive Summary ───────────────────────────
function drawCoverPage(page, fonts, { title, subtitle, totals, topCreator, topSource }) {
  let y = drawPageHeader(page, fonts, "Daily Performance Report");

  // Big title
  y -= 12;
  safeDraw(page, title, { x: PAGE.margin, y, size: 26, font: fonts.bold, color: C.ink });
  y -= 22;
  safeDraw(page, subtitle, { x: PAGE.margin, y, size: 11, font: fonts.italic, color: C.muted });
  y -= 50;

  // Three big-number panels
  const panelW = (PAGE.w - 2 * PAGE.margin - 20) / 3;
  const panelH = 90;
  const stats = [
    { label: "TOTAL SUBSCRIBERS",  value: fmtN(totals.subs),          accent: "new today" },
    { label: "TOTAL SALES",        value: fmt$(totals.sales),         accent: "net revenue" },
    { label: "CREATORS REPORTED",  value: String(totals.creators ?? "—"), accent: "active accounts" },
  ];
  for (let i = 0; i < stats.length; i++) {
    const x = PAGE.margin + i * (panelW + 10);
    page.drawRectangle({ x, y: y - panelH, width: panelW, height: panelH, color: C.panel });
    page.drawRectangle({ x, y: y - panelH, width: 3, height: panelH, color: C.brand });
    safeDraw(page, stats[i].label, {
      x: x + 14, y: y - 22, size: 8, font: fonts.bold, color: C.muted,
    });
    safeDraw(page, stats[i].value, {
      x: x + 14, y: y - 52, size: 22, font: fonts.bold, color: C.ink,
    });
    safeDraw(page, stats[i].accent, {
      x: x + 14, y: y - 70, size: 9, font: fonts.italic, color: C.muted,
    });
  }
  y -= panelH + 32;

  // Quick highlights
  safeDraw(page, "HIGHLIGHTS", { x: PAGE.margin, y, size: 10, font: fonts.bold, color: C.muted });
  y -= 18;
  page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.w - PAGE.margin, y }, thickness: 0.6, color: C.rule });
  y -= 18;

  if (topCreator) {
    safeDraw(page, "TOP CREATOR", { x: PAGE.margin, y, size: 8, font: fonts.bold, color: C.muted });
    safeDraw(page, `${topCreator.name} — ${fmt$(topCreator.sales)} · ${fmtN(topCreator.totalSubs)} subs`, {
      x: PAGE.margin, y: y - 18, size: 13, font: fonts.bold, color: C.brand,
    });
    y -= 42;
  }
  if (topSource) {
    safeDraw(page, "TOP SOURCE PLATFORM", { x: PAGE.margin, y, size: 8, font: fonts.bold, color: C.muted });
    safeDraw(page, `${topSource.platform} — ${fmt$(topSource.revenue)} · ${fmtN(topSource.subs)} subs from ${topSource.platform}`, {
      x: PAGE.margin, y: y - 18, size: 13, font: fonts.bold, color: C.brand,
    });
    y -= 42;
  } else {
    safeDraw(page, "TOP SOURCE PLATFORM", { x: PAGE.margin, y, size: 8, font: fonts.bold, color: C.muted });
    safeDraw(page, "No platform-tagged tracking links — see appendix for setup", {
      x: PAGE.margin, y: y - 18, size: 11, font: fonts.italic, color: C.muted,
    });
    y -= 42;
  }
}

// ── Page 2 — Per-creator detail rows ─────────────────────────────
function drawDetailPage(page, fonts, rows, subtitle) {
  let y = drawPageHeader(page, fonts, "Per-Creator Detail");
  y -= 8;
  safeDraw(page, "Creator detail", { x: PAGE.margin, y, size: 18, font: fonts.bold, color: C.ink });
  y -= 18;
  safeDraw(page, subtitle, { x: PAGE.margin, y, size: 10, font: fonts.italic, color: C.muted });
  y -= 22;
  // column headers
  page.drawRectangle({
    x: PAGE.margin - 4, y: y - 4, width: PAGE.w - 2 * PAGE.margin + 8, height: 22, color: C.panel,
  });
  const colX = {
    name: PAGE.margin,
    subs: PAGE.margin + 240,
    sales: PAGE.margin + 360,
  };
  safeDraw(page, "CREATOR",   { x: colX.name,  y: y + 5, size: 8, font: fonts.bold, color: C.muted });
  safeDraw(page, "SUBS",      { x: colX.subs,  y: y + 5, size: 8, font: fonts.bold, color: C.muted });
  safeDraw(page, "SALES",     { x: colX.sales, y: y + 5, size: 8, font: fonts.bold, color: C.muted });
  y -= 12;

  rows.forEach((r, i) => {
    const rowH = 38;
    if (i % 2 === 1) {
      page.drawRectangle({
        x: PAGE.margin - 4, y: y - rowH + 4,
        width: PAGE.w - 2 * PAGE.margin + 8, height: rowH, color: C.band,
      });
    }
    safeDraw(page, r.name,
      { x: colX.name, y: y - 6, size: 12, font: fonts.bold, color: C.ink });
    safeDraw(page, `${fmtN(r.newSubs)} new · ${fmtN(r.renewSubs)} renew`,
      { x: colX.name, y: y - 22, size: 9, font: fonts.regular, color: C.muted });
    safeDraw(page, fmtN(r.totalSubs),
      { x: colX.subs, y: y - 6, size: 13, font: fonts.bold, color: C.ink });
    safeDraw(page, fmt$(r.sales),
      { x: colX.sales, y: y - 6, size: 13, font: fonts.bold, color: C.brand });
    y -= rowH + 2;
  });
}

// ── Page 3 — Analytics charts ────────────────────────────────────
async function drawChartsPage(doc, fonts, { rows, aggregatedPlatforms, dateLabel }) {
  const page = newPage(doc);
  let y = drawPageHeader(page, fonts, "Analytics");
  y -= 6;
  safeDraw(page, "Analytics", { x: PAGE.margin, y, size: 18, font: fonts.bold, color: C.ink });
  y -= 18;
  safeDraw(page, `${dateLabel} · revenue and traffic insights`,
    { x: PAGE.margin, y, size: 10, font: fonts.italic, color: C.muted });
  y -= 16;

  // ── Chart 1: Revenue by source platform ──
  const platformEntries = Object.entries(aggregatedPlatforms || {})
    .sort((a, b) => b[1].revenue - a[1].revenue);

  safeDraw(page, "REVENUE BY SOURCE PLATFORM",
    { x: PAGE.margin, y, size: 9, font: fonts.bold, color: C.muted });
  y -= 14;

  if (platformEntries.length > 0) {
    const chartConfig = {
      type: "horizontalBar",
      data: {
        labels: platformEntries.map(([p]) => p),
        datasets: [{
          label: "Revenue (USD)",
          data: platformEntries.map(([, s]) => Number(s.revenue.toFixed(2))),
          backgroundColor: BRAND_HEX,
          borderRadius: 4,
        }],
      },
      options: {
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: "end", align: "right",
            color: "#333", font: { size: 11, weight: "bold" },
            formatter: (v) => "$" + Number(v).toLocaleString("en-US"),
          },
        },
      },
    };
    const png = await fetchChartPng(chartConfig, 1000, 360);
    if (png) {
      const img = await doc.embedPng(png);
      const drawW = PAGE.w - 2 * PAGE.margin;
      const drawH = drawW * (360 / 1000);
      page.drawImage(img, { x: PAGE.margin, y: y - drawH, width: drawW, height: drawH });
      y -= drawH + 20;
    } else {
      safeDraw(page, "(chart unavailable)", { x: PAGE.margin, y: y - 14, size: 10, font: fonts.italic, color: C.muted });
      y -= 30;
    }
  } else {
    safeDraw(page, "No platform-tagged tracking links yet — tag links with Reddit, Ig, Ads etc. in the OF API dashboard to enable source attribution.",
      { x: PAGE.margin, y: y - 14, size: 10, font: fonts.italic, color: C.muted });
    y -= 36;
  }

  // ── Chart 2: Revenue by creator ──
  safeDraw(page, "REVENUE BY CREATOR",
    { x: PAGE.margin, y, size: 9, font: fonts.bold, color: C.muted });
  y -= 14;

  if (rows.length > 0) {
    const sorted = [...rows].sort((a, b) => b.sales - a.sales);
    const chartConfig = {
      type: "horizontalBar",
      data: {
        labels: sorted.map((r) => r.name),
        datasets: [{
          label: "Sales (USD)",
          data: sorted.map((r) => Number(Number(r.sales).toFixed(2))),
          backgroundColor: BRAND2_HEX,
          borderRadius: 4,
        }],
      },
      options: {
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: "end", align: "right",
            color: "#333", font: { size: 11, weight: "bold" },
            formatter: (v) => "$" + Number(v).toLocaleString("en-US"),
          },
        },
      },
    };
    const png = await fetchChartPng(chartConfig, 1000, 400);
    if (png) {
      const img = await doc.embedPng(png);
      const drawW = PAGE.w - 2 * PAGE.margin;
      const drawH = drawW * (400 / 1000);
      page.drawImage(img, { x: PAGE.margin, y: y - drawH, width: drawW, height: drawH });
    }
  }
  return page;
}

// ── Top-level builders ───────────────────────────────────────────

/**
 * Daily / live-stats PDF.
 *  title         e.g. "Daily Report" or "Live Stats" or "Last 24 Hours"
 *  subtitle      e.g. "Mon, 27 May 2026 · vs day-before (UK time)"
 *  headerRight   header chip text on the cover ("Live Stats Report", ...)
 *  rows          [{name, sales, newSubs, renewSubs, totalSubs}]
 *  totals        {subs, sales}
 *  perCreatorPlatforms (optional)  [{name, platforms: {Reddit: {revenue,subs,clicks},...}}]
 */
export async function buildDailyStatsPdf({
  title, subtitle, headerRight, rows, totals, perCreatorPlatforms = [],
}) {
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);

  // Aggregate platforms across all creators for the chart.
  const aggregatedPlatforms = {};
  for (const c of perCreatorPlatforms) {
    for (const [p, s] of Object.entries(c.platforms || {})) {
      aggregatedPlatforms[p] ??= { revenue: 0, subs: 0, clicks: 0 };
      aggregatedPlatforms[p].revenue += Number(s.revenue || 0);
      aggregatedPlatforms[p].subs    += Number(s.subs || 0);
      aggregatedPlatforms[p].clicks  += Number(s.clicks || 0);
    }
  }
  const topCreator = rows.slice().sort((a, b) => b.sales - a.sales)[0];
  const topSourceEntry = Object.entries(aggregatedPlatforms).sort((a, b) => b[1].revenue - a[1].revenue)[0];
  const topSource = topSourceEntry
    ? { platform: topSourceEntry[0], revenue: topSourceEntry[1].revenue, subs: topSourceEntry[1].subs }
    : null;

  // Page 1: cover
  const p1 = newPage(doc);
  drawCoverPage(p1, fonts, {
    title, subtitle,
    totals: { ...totals, creators: rows.length },
    topCreator, topSource,
  });

  // Page 2: detail rows
  const p2 = newPage(doc);
  drawDetailPage(p2, fonts, rows, subtitle);

  // Page 3: analytics charts (skipped if QuickChart fails for both,
  // but normally renders both bars).
  await drawChartsPage(doc, fonts, { rows, aggregatedPlatforms, dateLabel: subtitle });

  // Footers
  const pages = doc.getPages();
  pages.forEach((p, i) => drawPageFooter(p, fonts, i + 1, pages.length));

  return await doc.save();
}

/**
 * Reddit poster leaderboard PDF.
 *  rows: [{ name, bonus_usd, upvotes, removed, penalty_usd, capped }]
 *  cycleLabel, status, capUsd, totalPayout
 */
export async function buildLeaderboardPdf({ cycleLabel, status, rows, capUsd, totalPayout }) {
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);
  const page = newPage(doc);
  let y = drawPageHeader(page, fonts, "Reddit Poster Leaderboard");
  y -= 6;
  safeDraw(page, "Poster bonus cycle", { x: PAGE.margin, y, size: 18, font: fonts.bold, color: C.ink });
  y -= 18;
  safeDraw(page, `${cycleLabel} · ${status}`, { x: PAGE.margin, y, size: 10, font: fonts.italic, color: C.muted });
  y -= 22;
  page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.w - PAGE.margin, y }, thickness: 0.6, color: C.rule });
  y -= 14;

  rows.forEach((r, i) => {
    const medal = i < 3 ? ["1st", "2nd", "3rd"][i] : `${i + 1}.`;
    const rowH = 42;
    if (i % 2 === 1) page.drawRectangle({ x: PAGE.margin - 4, y: y - rowH + 4, width: PAGE.w - 2 * PAGE.margin + 8, height: rowH, color: C.band });
    safeDraw(page, `${medal}  ${r.name}${r.capped ? "  (CAP)" : ""}`, { x: PAGE.margin, y: y - 4, size: 13, font: fonts.bold, color: C.ink });
    const sub = [`${fmtN(r.upvotes)} upvotes`, r.removed ? `${r.removed} removed (-${fmt$(Math.abs(r.penalty_usd))})` : null].filter(Boolean).join(" · ");
    safeDraw(page, sub, { x: PAGE.margin, y: y - 22, size: 9.5, font: fonts.regular, color: C.muted });
    const v = fmt$(r.bonus_usd);
    const w = fonts.bold.widthOfTextAtSize(v, 13);
    safeDraw(page, v, { x: PAGE.w - PAGE.margin - w, y: y - 4, size: 13, font: fonts.bold, color: C.brand });
    y -= rowH + 4;
  });

  y -= 6;
  page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.w - PAGE.margin, y }, thickness: 0.6, color: C.rule });
  y -= 14;
  safeDraw(page, "Total payout", { x: PAGE.margin, y: y - 6, size: 13, font: fonts.bold, color: C.ink });
  const tv = fmt$(totalPayout);
  const tw = fonts.bold.widthOfTextAtSize(tv, 16);
  safeDraw(page, tv, { x: PAGE.w - PAGE.margin - tw, y: y - 8, size: 16, font: fonts.bold, color: C.brand });
  y -= 26;
  safeDraw(page, `Per-poster cap: ${fmt$(capUsd)}`, { x: PAGE.margin, y, size: 9.5, font: fonts.italic, color: C.muted });

  drawPageFooter(page, fonts, 1, 1);
  return await doc.save();
}

/**
 * Reddit weekly ROI per-creator PDF.
 */
export async function buildWeeklyRoiPdf({ creator, periodLabel, totals, subStats, topPosts }) {
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);
  const page = newPage(doc);
  let y = drawPageHeader(page, fonts, "Weekly Reddit ROI");
  y -= 6;
  safeDraw(page, creator, { x: PAGE.margin, y, size: 18, font: fonts.bold, color: C.ink });
  y -= 18;
  safeDraw(page, periodLabel, { x: PAGE.margin, y, size: 10, font: fonts.italic, color: C.muted });
  y -= 22;
  page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.w - PAGE.margin, y }, thickness: 0.6, color: C.rule });
  y -= 14;

  safeDraw(page, "Totals", { x: PAGE.margin, y, size: 13, font: fonts.bold, color: C.ink });
  safeDraw(page, `${fmtN(totals.posts)} posts · ${fmtN(totals.upvotes)} upvotes · ${fmtN(totals.comments)} comments`,
    { x: PAGE.margin, y: y - 16, size: 10, font: fonts.regular, color: C.muted });
  y -= 40;

  safeDraw(page, "SUBREDDIT ROI (by upvotes)", { x: PAGE.margin, y, size: 9, font: fonts.bold, color: C.brand });
  y -= 14;
  for (const s of subStats.slice(0, 10)) {
    safeDraw(page, s.sub, { x: PAGE.margin, y, size: 11, font: fonts.bold, color: C.ink });
    safeDraw(page, `${s.posts} posts · avg ${Math.round(s.avg)} per post`,
      { x: PAGE.margin, y: y - 12, size: 9, font: fonts.regular, color: C.muted });
    const v = `${fmtN(s.upvotes)} ↑`;
    const w = fonts.bold.widthOfTextAtSize(safeText(v), 11);
    safeDraw(page, v, { x: PAGE.w - PAGE.margin - w, y, size: 11, font: fonts.bold, color: C.brand });
    y -= 26;
  }

  y -= 8;
  safeDraw(page, "TOP 5 POSTS", { x: PAGE.margin, y, size: 9, font: fonts.bold, color: C.brand });
  y -= 14;
  topPosts.slice(0, 5).forEach((p, i) => {
    const t = String(p.title || "").slice(0, 80);
    safeDraw(page, `${i + 1}. ${t}`, { x: PAGE.margin, y, size: 10, font: fonts.bold, color: C.ink });
    safeDraw(page, `r/${p.subreddit} · u/${p._account}`, { x: PAGE.margin, y: y - 12, size: 9, font: fonts.regular, color: C.muted });
    const v = `${fmtN(p.ups)} ↑`;
    const w = fonts.bold.widthOfTextAtSize(safeText(v), 10);
    safeDraw(page, v, { x: PAGE.w - PAGE.margin - w, y, size: 10, font: fonts.bold, color: C.brand });
    y -= 24;
  });

  drawPageFooter(page, fonts, 1, 1);
  return await doc.save();
}
