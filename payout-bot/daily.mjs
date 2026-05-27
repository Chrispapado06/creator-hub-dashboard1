#!/usr/bin/env node
// Daily traffic + sales report — fires at 08:07 UTC each morning.
//
// For each creator we show:
//   • subscribers (total / new / renew) with day-over-day % change
//   • net sales with day-over-day % change
//   • revenue split by TYPE (subscriptions / messages / tips /
//     PPV posts / live streams) — Path A from the breakdown spec
//   • revenue + sub count split by SOURCE PLATFORM via OF trial
//     links tagged Ig/Reddit/Ads/X/TikTok/etc. — Path B from the
//     breakdown spec
//   • lifetime LTV (gross / unique subs) for context
//
// Posted as one header message + one message per creator so we stay
// under Telegram's 4096-char/message cap even with all the extra
// detail. A polished PDF version is attached at the end.

import { buildDailyStatsPdf } from "./pdf-report.mjs";
import {
  CREATORS, escHtml, fmtMoney, sendTelegram, sendTelegramDocument,
  REPORT_TZ, wallTimeToUtc, partsInTz, fmtDateInTz, normalizePlatform,
} from "./config.mjs";

const OF_KEY = process.env.ONLYFANSAPI_KEY;
if (!OF_KEY) { console.error("ONLYFANSAPI_KEY missing"); process.exit(1); }

const OF_BASE = "https://app.onlyfansapi.com/api";
const headers = { Authorization: `Bearer ${OF_KEY}`, Accept: "application/json" };

// ── Date helpers (UK day boundaries) ──────────────────────────────
function dailyDates(now = new Date()) {
  const here = partsInTz(now, REPORT_TZ);
  const todayUtc = wallTimeToUtc(here.year, here.month, here.day);
  const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 3600_000);
  const dayBeforeUtc = new Date(todayUtc.getTime() - 48 * 3600_000);
  const yp = partsInTz(yesterdayUtc, REPORT_TZ);
  const dp = partsInTz(dayBeforeUtc, REPORT_TZ);
  const ymd = (p) => `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return {
    yDate: ymd(yp), pDate: ymd(dp),
    yLabel: fmtDateInTz(yesterdayUtc),
    yStartUtc: yesterdayUtc,
    yEndUtc: new Date(todayUtc.getTime() - 1000),
  };
}

// ── OF stats endpoints ────────────────────────────────────────────

// Daily subs (total / new / renew) + net sales — the same numbers
// the OF UI's overview page shows for the day.
async function fetchDayMetrics(acctId, dateStr) {
  const [subR, earnR] = await Promise.all([
    fetch(`${OF_BASE}/${acctId}/statistics/subscriber-metrics?start_date=${dateStr}&end_date=${dateStr}`, { headers }),
    fetch(`${OF_BASE}/${acctId}/statistics/statements/earnings?type=total&start_date=${dateStr}%2000:00:00&end_date=${dateStr}%2023:59:59`, { headers }),
  ]);
  let totalSubs = 0, newSubs = 0, renewSubs = 0, sales = 0;
  if (subR.ok) {
    const j = await subR.json();
    totalSubs = Number(j?.data?.total_subscriptions ?? 0);
    newSubs   = Number(j?.data?.new_subscriptions ?? 0);
    renewSubs = Number(j?.data?.renewed_subscriptions ?? 0);
  } else console.warn(`subscriber-metrics ${acctId} ${dateStr} → ${subR.status}`);
  if (earnR.ok) {
    const j = await earnR.json();
    const inner = Object.values(j?.data ?? {})[0] ?? {};
    sales = Number(inner.total ?? 0);
  } else console.warn(`earnings ${acctId} ${dateStr} → ${earnR.status}`);
  return { totalSubs, newSubs, renewSubs, sales };
}

// Revenue split by source within OF (subscriptions vs messages vs
// tips vs PPV posts vs live streams).
const REVENUE_TYPES = [
  { api: "subscribes", label: "Subs",    icon: "💎" },
  { api: "messages",   label: "Msgs",    icon: "📨" },
  { api: "tips",       label: "Tips",    icon: "💰" },
  { api: "post",       label: "Posts",   icon: "📌" },
  { api: "stream",     label: "Streams", icon: "📺" },
];
async function fetchTypeBreakdown(acctId, dateStr) {
  const results = await Promise.all(REVENUE_TYPES.map(async (t) => {
    const url = `${OF_BASE}/${acctId}/statistics/statements/earnings?type=${t.api}&start_date=${dateStr}%2000:00:00&end_date=${dateStr}%2023:59:59`;
    const r = await fetch(url, { headers });
    if (!r.ok) return [t.api, 0];
    const j = await r.json();
    const inner = Object.values(j?.data ?? {})[0] ?? {};
    return [t.api, Number(inner.total ?? 0)];
  }));
  return Object.fromEntries(results);
}

// Revenue + subs grouped by source PLATFORM, via OF trial-links
// whose name matches a known platform alias (Ig, Reddit, X, etc.).
// Returns { Reddit: {revenue, subs, clicks}, Instagram: {...}, ... }.
async function fetchPlatformBreakdown(acctId, startIso, endIso) {
  const linksR = await fetch(`${OF_BASE}/${acctId}/trial-links?limit=50`, { headers });
  if (!linksR.ok) return {};
  const linksJ = await linksR.json();
  const links = linksJ?.data?.list ?? [];
  const tagged = links
    .map((l) => ({ id: l.id, platform: normalizePlatform(l.trialLinkName) }))
    .filter((l) => l.platform);
  if (tagged.length === 0) return {};

  const stats = await Promise.all(tagged.map(async (l) => {
    const url = `${OF_BASE}/${acctId}/trial-links/${l.id}/stats?date_start=${encodeURIComponent(startIso)}&date_end=${encodeURIComponent(endIso)}`;
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const j = await r.json();
    const s = j?.data?.summary ?? {};
    return {
      platform: l.platform,
      revenue: Number(s.revenue_total ?? 0),
      subs:    Number(s.subs_total ?? 0),
      clicks:  Number(s.clicks_total ?? 0),
    };
  }));

  const agg = {};
  for (const s of stats) {
    if (!s) continue;
    agg[s.platform] ??= { revenue: 0, subs: 0, clicks: 0 };
    agg[s.platform].revenue += s.revenue;
    agg[s.platform].subs    += s.subs;
    agg[s.platform].clicks  += s.clicks;
  }
  return agg;
}

// Lifetime LTV — used for the red-zone flag rather than the noisy
// per-day ratio.
async function fetchLifetimeLtv(acctId) {
  const today = new Date().toISOString().slice(0, 10);
  const [ovR, smR] = await Promise.all([
    fetch(`${OF_BASE}/${acctId}/statistics/overview`, { headers }),
    fetch(`${OF_BASE}/${acctId}/statistics/subscriber-metrics?start_date=2020-01-01&end_date=${today}`, { headers }),
  ]);
  if (!ovR.ok || !smR.ok) return { revenue: 0, uniqueSubs: 0, ltv: 0 };
  const ovJ = await ovR.json();
  const smJ = await smR.json();
  const revenue = Number(ovJ?.data?.earning?.total ?? 0);
  const uniqueSubs = Number(smJ?.data?.new_subscriptions ?? 0);
  return { revenue, uniqueSubs, ltv: uniqueSubs > 0 ? revenue / uniqueSubs : 0 };
}

// ── Formatting helpers ────────────────────────────────────────────
function pctChangeLabel(today, prev) {
  if (!prev || prev === 0) return today > 0 ? "<i>new</i>" : "—";
  const pct = ((today - prev) / prev) * 100;
  return `${pct >= 0 ? "▲" : "▼"}${Math.abs(pct).toFixed(0)}%`;
}

function buildCreatorBlock(c, yest, prev, lifetime, types, platforms) {
  const newSubPctRaw = prev.newSubs > 0 ? ((yest.newSubs - prev.newSubs) / prev.newSubs) * 100 : null;
  const ltvThreshold = c.page_type === "free" ? 5 : 30;
  const ltvFlagged = lifetime.uniqueSubs > 0 && lifetime.ltv < ltvThreshold;
  const trafficSpike = newSubPctRaw !== null && newSubPctRaw >= 50;
  const suffix = [];
  if (trafficSpike) suffix.push("🚀");
  if (ltvFlagged)   suffix.push(`🚩 LTV &lt; $${ltvThreshold}`);

  const lines = [];
  lines.push(`<b>${escHtml(c.name)}</b> <i>(${c.page_type})</i>${suffix.length ? " " + suffix.join(" ") : ""}`);
  lines.push(`  Subs: <b>${yest.totalSubs}</b> <i>(${yest.newSubs} new, ${yest.renewSubs} renew)</i>  ${pctChangeLabel(yest.totalSubs, prev.totalSubs)}`);
  lines.push(`  Sales: <b>$${fmtMoney(yest.sales)}</b>  ${pctChangeLabel(yest.sales, prev.sales)}`);

  // Type breakdown — always show, even if zeros (for completeness)
  const typeLine = REVENUE_TYPES
    .map((t) => `${t.icon} ${t.label.slice(0,4)} $${fmtMoney(types[t.api] ?? 0)}`)
    .join(" · ");
  lines.push(`  <i>By type:</i> ${typeLine}`);

  // Platform breakdown — only show when there's at least one tagged link
  const platformEntries = Object.entries(platforms).sort((a, b) => b[1].revenue - a[1].revenue);
  if (platformEntries.length > 0) {
    const platformLine = platformEntries
      .map(([p, s]) => `${escHtml(p)} $${fmtMoney(s.revenue)} <i>(${s.subs}s)</i>`)
      .join(" · ");
    lines.push(`  <i>By source:</i> ${platformLine}`);
  } else {
    lines.push(`  <i>By source:</i> <i>no platform-tagged trial links</i>`);
  }

  lines.push(`  LTV (lifetime): <b>$${fmtMoney(lifetime.ltv)}</b>  <i>${lifetime.uniqueSubs.toLocaleString()} unique subs</i>`);
  return lines.join("\n");
}

async function main() {
  const { yDate, pDate, yLabel, yStartUtc, yEndUtc } = dailyDates();
  const dailyChat = process.env.TELEGRAM_CHAT_ID_DAILY || process.env.TELEGRAM_CHAT_ID;

  // ── Fetch everything in parallel per creator
  const startIso = yStartUtc.toISOString();
  const endIso   = yEndUtc.toISOString();
  const rows = await Promise.all(CREATORS.map(async (c) => {
    const [yest, prev, lifetime, types, platforms] = await Promise.all([
      fetchDayMetrics(c.account_id, yDate),
      fetchDayMetrics(c.account_id, pDate),
      fetchLifetimeLtv(c.account_id),
      fetchTypeBreakdown(c.account_id, yDate),
      fetchPlatformBreakdown(c.account_id, startIso, endIso),
    ]);
    return { c, yest, prev, lifetime, types, platforms };
  }));

  // ── Header
  const header = [
    `📊 <b>Daily traffic — ${escHtml(yLabel)}</b>`,
    `<i>vs day-before (UK time) · revenue type + source breakdowns below</i>`,
  ].join("\n");
  await sendTelegram(header, dailyChat);

  // ── Per-creator messages (split to dodge Telegram's 4096 limit)
  let sent = 0;
  for (const r of rows) {
    if (await sendTelegram(buildCreatorBlock(r.c, r.yest, r.prev, r.lifetime, r.types, r.platforms), dailyChat)) sent++;
  }

  // ── Polished PDF with the same data
  try {
    const pdfRows = rows.map((r) => ({
      name: r.c.name,
      sales: r.yest.sales,
      newSubs: r.yest.newSubs,
      renewSubs: r.yest.renewSubs,
      totalSubs: r.yest.totalSubs,
    }));
    const pdfTotals = pdfRows.reduce(
      (a, r) => ({ subs: a.subs + r.totalSubs, sales: a.sales + r.sales }),
      { subs: 0, sales: 0 },
    );
    const pdfBytes = await buildDailyStatsPdf({
      title: "Daily Report",
      subtitle: `${yLabel} · vs day-before (UK time)`,
      headerRight: "Daily Stats Report",
      rows: pdfRows,
      totals: pdfTotals,
    });
    await sendTelegramDocument(
      dailyChat,
      `uncvrd-daily-${yDate}.pdf`,
      pdfBytes,
      `📄 Daily report — ${escHtml(yLabel)}`,
    );
  } catch (e) {
    console.warn("PDF attach failed:", e);
  }

  console.log(JSON.stringify({ creators: CREATORS.length, sent, chat: dailyChat, day: yDate }));
}

main().catch((e) => { console.error(e); process.exit(1); });
