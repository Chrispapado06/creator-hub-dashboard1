// Bootstrap public.whale_paydays from the team's existing OF whale lists.
// Your team has already curated who counts as a whale (BIG SPENDER ≥ 500,
// LT Spend ≥ 250, 🐳WHALE, "DO NOT SELL"/"SELL" WHALE CARD lists, etc.) — so
// we don't need anyone to type 1000+ names. This script just imports them.
//
// Per-whale we set:
//   name     ← the team's annotated display_name (often the real name +
//                tags like "🐳✅G - NEW WHALE"), else the username
//   model    ← the account they're on
//   handling ← derived from the list name (DO NOT SELL > REVIVE > PRE-SELL > SELL)
//   payday   ← NULL (filled in via /whale add when the team learns it)
// Existing rows are LEFT ALONE (we never clobber manual edits).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node shift-downtime-monitor/bootstrap-whales.mjs
//   add --dry to print without writing.

import { listAccounts, listUserLists, listListMemberIds, loadOfKey } from "./of.mjs";

const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes("--dry");
if (!loadOfKey()) { console.error("Need .env VITE_ONLYFANSAPI_KEY"); process.exit(1); }
if (!URL || !KEY) { console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const WHALE_LIST_RE = /big spender|lt spend|whale|≥\s*\$?\s*(250|300|500|1000)/i;
const HANDLING_RULES = [
  { re: /do not sell/i,        h: "DO_NOT_SELL" },
  { re: /revive|check.?in/i,   h: "REVIVE" },
  { re: /pre.?sell/i,          h: "PRE_SELL" },
];
function handlingFromLists(names) {
  for (const r of HANDLING_RULES) for (const n of names) if (r.re.test(n)) return r.h;
  return "SELL"; // default — they're on a whale list but no handling tag set
}

const cleanName = (s) => String(s || "").replace(/[​-‍﻿]/g, "").trim();

const { createClient } = await import("@supabase/supabase-js");
const supa = createClient(URL, KEY, { auth: { persistSession: false } });

const accounts = (await listAccounts()).filter((a) => a.authenticated);
console.log(`Bootstrapping from ${accounts.length} authenticated account(s)…\n`);

let totalSeen = 0, totalNew = 0, totalSkipped = 0, totalErr = 0;
for (const acct of accounts) {
  process.stdout.write(`▶ ${acct.name}: `);
  let lists;
  try { lists = await listUserLists(acct.accountId); }
  catch (e) { console.log(`list fetch failed (${e.message})`); totalErr++; continue; }
  const whaleLists = lists.filter((l) => WHALE_LIST_RE.test(l.name));
  if (!whaleLists.length) { console.log("no whale lists, skipping"); continue; }

  // fanId → set of list names that include them (so handling is most-restrictive across all matches)
  const byFan = new Map();
  for (const l of whaleLists) {
    for (const id of await listListMemberIds(acct.accountId, l.id)) {
      if (!byFan.has(id)) byFan.set(id, []);
      byFan.get(id).push(l.name);
    }
  }
  console.log(`${byFan.size} whales across ${whaleLists.length} list(s)`);

  // Pull existing rows for this model in one round-trip so we don't clobber
  const { data: existing } = await supa.from("whale_paydays").select("name").ilike("model", acct.name);
  const seen = new Set((existing || []).map((r) => r.name.toLowerCase()));

  // Need display names. Member objects only had id; fetch first page of each
  // list with the full member shape so we get displayName.
  const idToName = new Map();
  for (const l of whaleLists) {
    try {
      const r = await fetch(`https://app.onlyfansapi.com/api/${acct.accountId}/user-lists/${l.id}/users?limit=50`, {
        headers: { Authorization: `Bearer ${loadOfKey()}`, Accept: "application/json" },
      });
      const j = await r.json();
      const list = Array.isArray(j) ? j : (j?.data?.list ?? j?.data ?? j?.list ?? []);
      for (const m of list) {
        const display = cleanName(m.displayName) || cleanName(m.name) || cleanName(m.username) || String(m.id);
        idToName.set(String(m.id), display);
      }
      // Paginate if needed
      let next = j?._pagination?.next_page;
      let pages = 1;
      while (next && pages < 30) {
        const r2 = await fetch(next, { headers: { Authorization: `Bearer ${loadOfKey()}`, Accept: "application/json" } });
        const j2 = await r2.json();
        const more = Array.isArray(j2) ? j2 : (j2?.data?.list ?? j2?.data ?? j2?.list ?? []);
        for (const m of more) {
          const display = cleanName(m.displayName) || cleanName(m.name) || cleanName(m.username) || String(m.id);
          idToName.set(String(m.id), display);
        }
        next = j2?._pagination?.next_page; pages++;
      }
    } catch (e) { console.log(`   ! list ${l.id} fetch error: ${e.message}`); }
  }

  // Build rows + insert
  const rows = [];
  for (const [fanId, listNames] of byFan.entries()) {
    totalSeen++;
    const display = idToName.get(fanId) || `fan-${fanId}`;
    if (seen.has(display.toLowerCase())) { totalSkipped++; continue; } // already in DB, leave alone
    rows.push({
      name: display, model: acct.name, handling: handlingFromLists(listNames),
      fan_id: fanId, added_by: "bootstrap",
    });
  }

  if (DRY) {
    console.log(`   (dry-run) would insert ${rows.length} new row(s)`);
    rows.slice(0, 3).forEach((r) => console.log(`      • ${r.name} → ${r.handling}`));
    totalNew += rows.length; continue;
  }

  // Insert in batches of 100 to be kind to PostgREST
  for (let i = 0; i < rows.length; i += 100) {
    const slice = rows.slice(i, i + 100);
    const { error } = await supa.from("whale_paydays").insert(slice);
    if (error) { console.log(`   ✖ batch ${i / 100 + 1} failed: ${error.message}`); totalErr++; }
    else totalNew += slice.length;
  }
  console.log(`   ✓ inserted ${rows.length} new, skipped ${byFan.size - rows.length} existing`);
}

console.log(`\n✓ Done — saw ${totalSeen} whale-list entries · added ${totalNew} new · skipped ${totalSkipped} (already in DB) · ${totalErr} error(s)`);
console.log(`Each whale's payday is NULL until set via /whale add. The bot only pings for whales with a payday set.`);
