// PDF report generator. Uses pdf-lib (npm). Workflows run
//   cd payout-bot && npm ci
// before invoking any script that imports this module.
//
// Each export builds a self-contained "professional" PDF: branded
// header with UNCVRD wordmark, title, date, body sections, optional
// totals row, and a small footer signature. Returns a Uint8Array
// suitable for direct upload via Telegram sendDocument / Discord
// webhook multipart.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// pdf-lib's bundled Helvetica is WinAnsi-encoded — it throws on
// arrows, emoji, and most other non-Latin-1 codepoints. Sanitise
// every string before it hits drawText. We keep the Telegram /
// Discord message versions full-fidelity (emoji-rich), this only
// affects the PDF render.
function safeText(s) {
  return String(s ?? "")
    .replace(/→|↣|⇒/g, ">")
    .replace(/←|↢|⇐/g, "<")
    .replace(/↑/g, "^")
    .replace(/↓/g, "v")
    .replace(/▲/g, "+")
    .replace(/▼/g, "-")
    // Drop emoji (BMP supplementary + dingbats blocks).
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, "")
    // Strip any remaining non-WinAnsi codepoints.
    .replace(/[^\x00-\xFF]/g, "");
}

function safeDraw(page, str, opts) {
  page.drawText(safeText(str), opts);
}

// ── Brand palette ────────────────────────────────────────────────
const COLOUR = {
  brand:  rgb(0.063, 0.388, 0.149),  // deep UNCVRD green
  ink:    rgb(0.08,  0.08,  0.08),   // body text
  muted:  rgb(0.42,  0.42,  0.42),   // secondary text
  rule:   rgb(0.84,  0.84,  0.84),   // hairline divider
  band:   rgb(0.95,  0.97,  0.95),   // subtle row-band tint
};

const PAGE = { w: 595, h: 842, margin: 50 }; // A4 portrait, points

// ── Internal layout helpers ──────────────────────────────────────
function newDoc() {
  return PDFDocument.create();
}

async function setupFonts(doc) {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold:    await doc.embedFont(StandardFonts.HelveticaBold),
    italic:  await doc.embedFont(StandardFonts.HelveticaOblique),
  };
}

function newPage(doc) {
  return doc.addPage([PAGE.w, PAGE.h]);
}

// Wraps the page if `y` would fall below `margin + reserved`.
function ensureRoom(state, neededBelow = 60) {
  if (state.y - neededBelow < PAGE.margin) {
    state.page = newPage(state.doc);
    state.y = PAGE.h - PAGE.margin;
    drawHeader(state);
  }
}

function drawHeader(state) {
  const { page, fonts } = state;
  // UNCVRD wordmark
  safeDraw(page, "UNCVRD", {
    x: PAGE.margin, y: PAGE.h - PAGE.margin,
    size: 22, font: fonts.bold, color: COLOUR.brand,
  });
  // Right side: report-kind label
  if (state.headerRight) {
    const w = fonts.regular.widthOfTextAtSize(state.headerRight, 10);
    safeDraw(page, state.headerRight, {
      x: PAGE.w - PAGE.margin - w,
      y: PAGE.h - PAGE.margin + 6,
      size: 10, font: fonts.regular, color: COLOUR.muted,
    });
  }
  // Brand rule
  page.drawLine({
    start: { x: PAGE.margin, y: PAGE.h - PAGE.margin - 10 },
    end:   { x: PAGE.w - PAGE.margin, y: PAGE.h - PAGE.margin - 10 },
    thickness: 1.5, color: COLOUR.brand,
  });
  state.y = PAGE.h - PAGE.margin - 30;
}

function drawTitle(state, title, subtitle) {
  const { page, fonts } = state;
  safeDraw(page, title, {
    x: PAGE.margin, y: state.y,
    size: 18, font: fonts.bold, color: COLOUR.ink,
  });
  state.y -= 22;
  if (subtitle) {
    safeDraw(page, subtitle, {
      x: PAGE.margin, y: state.y,
      size: 10, font: fonts.italic, color: COLOUR.muted,
    });
    state.y -= 22;
  }
  state.y -= 8;
}

function drawSectionRule(state) {
  state.page.drawLine({
    start: { x: PAGE.margin, y: state.y },
    end:   { x: PAGE.w - PAGE.margin, y: state.y },
    thickness: 0.6, color: COLOUR.rule,
  });
  state.y -= 14;
}

// Two-column row: left label/sublabel, right value(s).
function drawRow(state, { title, sub, valueMain, valueSub, band = false }) {
  ensureRoom(state, 50);
  const { page, fonts } = state;
  const rowH = 40;
  if (band) {
    page.drawRectangle({
      x: PAGE.margin - 4, y: state.y - rowH + 4,
      width: PAGE.w - 2 * PAGE.margin + 8, height: rowH,
      color: COLOUR.band,
    });
  }
  safeDraw(page, title, {
    x: PAGE.margin, y: state.y - 4,
    size: 13, font: fonts.bold, color: COLOUR.ink,
  });
  if (sub) {
    safeDraw(page, sub, {
      x: PAGE.margin, y: state.y - 22,
      size: 9.5, font: fonts.regular, color: COLOUR.muted,
    });
  }
  if (valueMain != null) {
    const valW = fonts.bold.widthOfTextAtSize(valueMain, 13);
    safeDraw(page, valueMain, {
      x: PAGE.w - PAGE.margin - valW, y: state.y - 4,
      size: 13, font: fonts.bold, color: COLOUR.brand,
    });
  }
  if (valueSub) {
    const valW = fonts.regular.widthOfTextAtSize(valueSub, 9.5);
    safeDraw(page, valueSub, {
      x: PAGE.w - PAGE.margin - valW, y: state.y - 22,
      size: 9.5, font: fonts.regular, color: COLOUR.muted,
    });
  }
  state.y -= rowH + 4;
}

function drawTotals(state, label, value, sub) {
  ensureRoom(state, 50);
  state.y -= 6;
  drawSectionRule(state);
  const { page, fonts } = state;
  safeDraw(page, label, {
    x: PAGE.margin, y: state.y - 6,
    size: 13, font: fonts.bold, color: COLOUR.ink,
  });
  const valW = fonts.bold.widthOfTextAtSize(value, 16);
  safeDraw(page, value, {
    x: PAGE.w - PAGE.margin - valW, y: state.y - 8,
    size: 16, font: fonts.bold, color: COLOUR.brand,
  });
  state.y -= 26;
  if (sub) {
    safeDraw(page, sub, {
      x: PAGE.margin, y: state.y,
      size: 9.5, font: fonts.italic, color: COLOUR.muted,
    });
    state.y -= 16;
  }
}

function drawFooter(state) {
  const { page, fonts } = state;
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  const left = `Generated ${ts} UTC · Bernard · @bernarduncvrdbot`;
  safeDraw(page, left, {
    x: PAGE.margin, y: 28,
    size: 8, font: fonts.regular, color: COLOUR.muted,
  });
}

// ── Public builders ──────────────────────────────────────────────

const fmt$ = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtN = (n) => Number(n || 0).toLocaleString("en-US");

/**
 * Daily OF stats report PDF.
 *  rows: [{ name, sales, newSubs, renewSubs, totalSubs }]
 *  totals: { subs, sales }
 *  title: e.g. "Daily Report" or "Live Stats"
 *  subtitle: e.g. "Sunday, 24 May 2026 · Today so far (UK midnight → 18:42)"
 */
export async function buildDailyStatsPdf({ title, subtitle, headerRight, rows, totals }) {
  const doc = await newDoc();
  const fonts = await setupFonts(doc);
  const page = newPage(doc);
  const state = { doc, page, fonts, y: 0, headerRight };
  drawHeader(state);
  drawTitle(state, title, subtitle);
  drawSectionRule(state);
  rows.forEach((r, i) => drawRow(state, {
    title: r.name,
    sub: `${fmtN(r.totalSubs)} subscribers · ${fmtN(r.newSubs)} new, ${fmtN(r.renewSubs)} renew`,
    valueMain: fmt$(r.sales),
    valueSub: "sales today",
    band: i % 2 === 1,
  }));
  drawTotals(state,
    "Day total",
    `${fmtN(totals.subs)} subs · ${fmt$(totals.sales)}`,
    totals.note,
  );
  drawFooter(state);
  return await doc.save();
}

/**
 * Reddit leaderboard PDF.
 *  rows: [{ name, bonus_usd, upvotes, removed, penalty_usd, capped }]
 *  cycleLabel: "Sun, May 17 → Sat, May 23"
 *  status: "Day 6 of 7 (Fri) · in progress" / "Cycle closed"
 *  capUsd, totalPayout
 */
export async function buildLeaderboardPdf({ cycleLabel, status, rows, capUsd, totalPayout }) {
  const doc = await newDoc();
  const fonts = await setupFonts(doc);
  const page = newPage(doc);
  const state = { doc, page, fonts, y: 0, headerRight: "Reddit Poster Leaderboard" };
  drawHeader(state);
  drawTitle(state, "Poster Bonus Cycle", `${cycleLabel} · ${status}`);
  drawSectionRule(state);
  rows.forEach((r, i) => {
    const medal = i < 3 ? ["1st", "2nd", "3rd"][i] : `${i + 1}.`;
    const extras = [];
    extras.push(`${fmtN(r.upvotes)} upvotes`);
    if (r.removed) extras.push(`${r.removed} removed (-${fmt$(Math.abs(r.penalty_usd))})`);
    drawRow(state, {
      title: `${medal}  ${r.name}${r.capped ? "  (CAP)" : ""}`,
      sub: extras.join(" · "),
      valueMain: fmt$(r.bonus_usd),
      valueSub: "bonus",
      band: i % 2 === 1,
    });
  });
  drawTotals(state, "Total payout", fmt$(totalPayout), `Per-poster cap: ${fmt$(capUsd)}`);
  drawFooter(state);
  return await doc.save();
}

/**
 * Reddit weekly ROI per-creator PDF.
 *  creator, periodLabel, totals: {posts, upvotes, comments}
 *  subStats: [{sub, posts, upvotes, avg}]
 *  topPosts: [{title, ups, subreddit, _account, permalink}]
 */
export async function buildWeeklyRoiPdf({ creator, periodLabel, totals, subStats, topPosts }) {
  const doc = await newDoc();
  const fonts = await setupFonts(doc);
  const page = newPage(doc);
  const state = { doc, page, fonts, y: 0, headerRight: "Weekly Reddit ROI" };
  drawHeader(state);
  drawTitle(state, creator, periodLabel);
  drawSectionRule(state);
  drawRow(state, {
    title: "Totals",
    sub: `${fmtN(totals.posts)} posts · ${fmtN(totals.upvotes)} upvotes · ${fmtN(totals.comments)} comments`,
    valueMain: fmtN(totals.upvotes),
    valueSub: "upvotes",
  });
  // Subreddit ROI table — header + rows
  state.y -= 4;
  drawTitleSmall(state, "Subreddit ROI (by upvotes)");
  for (const s of subStats.slice(0, 10)) {
    drawRow(state, {
      title: s.sub,
      sub: `${s.posts} posts · avg ${Math.round(s.avg)} ↑/post`,
      valueMain: fmtN(s.upvotes),
      valueSub: "upvotes",
    });
  }
  // Top posts
  state.y -= 4;
  drawTitleSmall(state, "Top 5 posts");
  topPosts.slice(0, 5).forEach((p, i) => {
    drawRow(state, {
      title: `${i + 1}. ${String(p.title || "").slice(0, 80)}`,
      sub: `r/${p.subreddit} · u/${p._account}`,
      valueMain: fmtN(p.ups),
      valueSub: "upvotes",
    });
  });
  drawFooter(state);
  return await doc.save();
}

function drawTitleSmall(state, label) {
  ensureRoom(state, 30);
  state.safeDraw(page, label, {
    x: PAGE.margin, y: state.y,
    size: 11, font: state.fonts.bold, color: COLOUR.brand,
  });
  state.y -= 16;
}
