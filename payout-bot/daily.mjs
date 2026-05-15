#!/usr/bin/env node
// Daily traffic / sales report.
//
// Runs every morning at 08:00 UTC. For each creator we fetch
// yesterday's and day-before's stats from OF's stats endpoints (the
// same data OF's UI renders), then compare:
//   • Subs on the day      — /statistics/subscriber-metrics  (new_subscriptions)
//   • Sales on the day     — /statistics/statements/earnings?type=total (net)
//   • LTV (lifetime)       — /statistics/overview gross ÷ lifetime new subs
// Flags:
//   🚀 traffic spike when new-sub count is 50%+ above the prior day
//   🚩 LTV red zone — free pages under $5, paid pages under $30
//
// We deliberately use OF's stats endpoints instead of summing the raw
// /transactions list, because the latter diverges from the UI (timezone
// bucketing, status filtering, refund handling). One stat endpoint per
// metric is the source of truth.

import {
  CREATORS, escHtml, fmtMoney, sendTelegram,
  REPORT_TZ, wallTimeToUtc, partsInTz, fmtDateInTz,
} from "./config.mjs";

const OF_KEY = process.env.ONLYFANSAPI_KEY;
if (!OF_KEY) { console.error("ONLYFANSAPI_KEY missing"); process.exit(1); }

const OF_BASE = "https://app.onlyfansapi.com/api";
const headers = { Authorization: `Bearer ${OF_KEY}`, Accept: "application/json" };

// ── Date helpers ──────────────────────────────────────────────────
// Yesterday and day-before, computed as UK calendar days.
function dailyDates(now = new Date()) {
  const here = partsInTz(now, REPORT_TZ);
  const todayUtc = wallTimeToUtc(here.year, here.month, here.day);
  const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 3600_000);
  const dayBeforeUtc = new Date(todayUtc.getTime() - 48 * 3600_000);
  const yp = partsInTz(yesterdayUtc, REPORT_TZ);
  const dp = partsInTz(dayBeforeUtc, REPORT_TZ);
  const ymd = (p) => `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return {
    yDate: ymd(yp),                    // "2026-05-13"
    pDate: ymd(dp),                    // "2026-05-12"
    yLabel: fmtDateInTz(yesterdayUtc), // "Tue, 13 May 2026"
  };
}

// ── OF stats endpoints ────────────────────────────────────────────

async function fetchDayMetrics(acctId, dateStr) {
  const [subR, earnR] = await Promise.all([
    fetch(`${OF_BASE}/${acctId}/statistics/subscriber-metrics?start_date=${dateStr}&end_date=${dateStr}`, { headers }),
    fetch(`${OF_BASE}/${acctId}/statistics/statements/earnings?type=total&start_date=${dateStr}%2000:00:00&end_date=${dateStr}%2023:59:59`, { headers }),
  ]);
  let newSubs = 0, sales = 0;
  if (subR.ok) {
    const j = await subR.json();
    newSubs = Number(j?.data?.new_subscriptions ?? 0);
  } else {
    console.warn(`subscriber-metrics ${acctId} ${dateStr} → HTTP ${subR.status}`);
  }
  if (earnR.ok) {
    const j = await earnR.json();
    const inner = Object.values(j?.data ?? {})[0] ?? {};
    sales = Number(inner.total ?? 0);
  } else {
    console.warn(`statements/earnings ${acctId} ${dateStr} → HTTP ${earnR.status}`);
  }
  return { newSubs, sales };
}

// Lifetime LTV. gross lifetime ÷ unique new subscribers ever.
// Stable, used for the red-zone flag rather than the noisy daily ratio.
async function fetchLifetimeLtv(acctId) {
  const today = new Date().toISOString().slice(0, 10);
  const [ovR, smR] = await Promise.all([
    fetch(`${OF_BASE}/${acctId}/statistics/overview`, { headers }),
    fetch(`${OF_BASE}/${acctId}/statistics/subscriber-metrics?start_date=2020-01-01&end_date=${today}`, { headers }),
  ]);
  if (!ovR.ok || !smR.ok) {
    console.warn(`Lifetime stats ${acctId} → overview ${ovR.status}, sub-metrics ${smR.status}`);
    return { gross: 0, uniqueSubs: 0, ltv: 0 };
  }
  const ovJ = await ovR.json();
  const smJ = await smR.json();
  const gross = Number(ovJ?.data?.earning?.gross ?? 0);
  const uniqueSubs = Number(smJ?.data?.new_subscriptions ?? 0);
  return { gross, uniqueSubs, ltv: uniqueSubs > 0 ? gross / uniqueSubs : 0 };
}

// ── Formatting ────────────────────────────────────────────────────

function pctChangeLabel(today, prev) {
  if (!prev || prev === 0) return today > 0 ? "<i>new</i>" : "—";
  const pct = ((today - prev) / prev) * 100;
  const arrow = pct >= 0 ? "▲" : "▼";
  return `${arrow}${Math.abs(pct).toFixed(0)}%`;
}

function buildCreatorBlock(c, yest, prev, lifetime) {
  const subPctRaw = prev.newSubs > 0 ? ((yest.newSubs - prev.newSubs) / prev.newSubs) * 100 : null;
  const ltvThreshold = c.page_type === "free" ? 5 : 30;
  const ltvFlagged = lifetime.uniqueSubs > 0 && lifetime.ltv < ltvThreshold;
  const trafficSpike = subPctRaw !== null && subPctRaw >= 50;
  const suffix = [];
  if (trafficSpike) suffix.push("🚀");
  if (ltvFlagged) suffix.push(`🚩 LTV &lt; $${ltvThreshold}`);

  return [
    `<b>${escHtml(c.name)}</b> <i>(${c.page_type})</i>${suffix.length ? " " + suffix.join(" ") : ""}`,
    `  Subs: <b>${yest.newSubs}</b>  ${pctChangeLabel(yest.newSubs, prev.newSubs)}`,
    `  Sales: <b>$${fmtMoney(yest.sales)}</b>  ${pctChangeLabel(yest.sales, prev.sales)}`,
    `  LTV (lifetime): <b>$${fmtMoney(lifetime.ltv)}</b>  <i>${lifetime.uniqueSubs.toLocaleString()} unique subs</i>`,
  ].join("\n");
}

async function main() {
  const { yDate, pDate, yLabel } = dailyDates();

  const blocks = [];
  for (const c of CREATORS) {
    const [yest, prev, lifetime] = await Promise.all([
      fetchDayMetrics(c.account_id, yDate),
      fetchDayMetrics(c.account_id, pDate),
      fetchLifetimeLtv(c.account_id),
    ]);
    blocks.push(buildCreatorBlock(c, yest, prev, lifetime));
  }

  const header = [
    `📊 <b>Daily traffic — ${escHtml(yLabel)}</b>`,
    `<i>vs day-before (UK time)</i>`,
    "",
  ].join("\n");

  const dailyChat = process.env.TELEGRAM_CHAT_ID_DAILY || process.env.TELEGRAM_CHAT_ID;
  const ok = await sendTelegram(header + blocks.join("\n\n"), dailyChat);
  console.log(JSON.stringify({ creators: CREATORS.length, sent: ok, chat: dailyChat, day: yDate }));
}

main().catch((e) => { console.error(e); process.exit(1); });
