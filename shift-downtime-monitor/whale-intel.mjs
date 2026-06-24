// Whale Intel pilot — build a searchable per-whale card from chat history.
//
// For each whale on a target account, this script reads up to ~50 recent
// messages + the fan's OF display name, and asks a small LLM to extract:
//   • name (+ age if mentioned)
//   • payday (Mon..Sun if mentioned)
//   • last objection (a short phrase or "—" if none)
// Output is saved to `whale-intel.json` and a markdown table is printed.
//
// This is a ONE-SHOT script (run on demand) — NOT part of the 5-min monitor,
// so it doesn't add to ongoing API/AI cost. Re-run it weekly / when the team
// asks for fresh intel. Each whale = ~1 LLM call (~1–2k tokens in, ~150 out).
//
// Usage:
//   ANTHROPIC_API_KEY=... node shift-downtime-monitor/whale-intel.mjs [account=blue]
//   ANTHROPIC_API_KEY=... node shift-downtime-monitor/whale-intel.mjs blue --limit=10  # pilot run
//
// Pilot defaults: 1 account (Blue Bear), LIMIT optional. Add accounts/full
// coverage later once the team confirms the output quality.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  loadOfKey, listAccounts, listUserLists, listListMemberIds, listChatMessages,
} from "./of.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, "whale-intel.json");

const args = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith("--"))
  .map((a) => a.slice(2).split("=")).map(([k, v]) => [k, v ?? "1"]));
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ACCT_HINT = (positional[0] || "blue").toLowerCase();
const LIMIT = Number(args.limit || 9999);
const MSG_LIMIT = Number(args.msgs || 40);
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!loadOfKey()) { console.error("No OF key (.env VITE_ONLYFANSAPI_KEY)"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("Set ANTHROPIC_API_KEY (intel extraction needs an LLM)"); process.exit(1); }

const WHALE_LIST_RE = /big spender|lt spend|whale|≥\s*\$?\s*(250|300|500|1000)/i;

// Resolve account from a name fragment (e.g. "blue" → Blue Bear).
const pickAccount = (accts) => accts.find((a) => a.authenticated && a.name.toLowerCase().includes(ACCT_HINT))
  ?? accts.find((a) => a.authenticated && a.username.toLowerCase().includes(ACCT_HINT));

// LLM extractor — Claude Haiku is the cheapest model + good enough at JSON.
async function extractIntel(displayName, username, name, transcript) {
  const sys = `You build short whale-intel cards from OnlyFans chat. Extract only what's CLEARLY in the messages (or the display name the team set). NEVER guess. If unknown, use "—". Output STRICT JSON only.`;
  const user = `Fan display-name (set by the team — often contains the real name and tags): "${displayName}"
Fan username: "${username}"
Fan profile name: "${name}"

Recent chat transcript (newest first, "FAN:" = the fan, "CRT:" = our chatter):
${transcript}

Return JSON only:
{
  "name": "first name or nickname (use the display-name's name first if present, else what the fan says about themself)",
  "age": "number-as-string, e.g. '34', or '—' if not stated",
  "payday": "weekday in 3-letter form (Mon/Tue/Wed/Thu/Fri/Sat/Sun) if the fan mentions when they get paid, else '—'",
  "last_objection": "the most recent thing blocking a sale — wife/broke/busy/lurker/saving/etc., 6 words max, '—' if none",
  "confidence": "high|medium|low"
}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      system: sys,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  const txt = j.content?.[0]?.text ?? "";
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in LLM output: ${txt.slice(0, 120)}`);
  return JSON.parse(m[0]);
}

// ── main ─────────────────────────────────────────────────────────────────────
const accounts = await listAccounts();
const target = pickAccount(accounts);
if (!target) { console.error(`No authenticated account matches "${ACCT_HINT}". Try: ${accounts.filter((a) => a.authenticated).map((a) => a.name).join(", ")}`); process.exit(1); }
console.log(`▶ Whale Intel pilot — ${target.name} (${target.username})`);

const lists = await listUserLists(target.accountId);
const whaleLists = lists.filter((l) => WHALE_LIST_RE.test(l.name) && l.usersCount > 0);
console.log(`  Whale lists: ${whaleLists.map((l) => `"${l.name}" (${l.usersCount})`).join(", ") || "none"}`);

const whaleIds = new Set();
for (const l of whaleLists) for (const id of await listListMemberIds(target.accountId, l.id)) whaleIds.add(id);
const ids = [...whaleIds].slice(0, LIMIT);
console.log(`  ${ids.length} whales to process (msgs/whale=${MSG_LIMIT}). Starting…`);

const intel = [];
let done = 0, errs = 0;
for (const fanId of ids) {
  try {
    const msgs = await listChatMessages(target.accountId, fanId, { limit: MSG_LIMIT });
    if (!msgs.length) { console.log(`  ${++done}/${ids.length}  ${fanId} — no messages, skipping`); continue; }
    const fanInfo = msgs.find((m) => m.fromFan) ?? {};
    const transcript = msgs.slice(0, MSG_LIMIT).map((m) => `${m.fromFan ? "FAN" : "CRT"}: ${m.text}`).join("\n").slice(0, 4000);
    // Cheap pre-fill: name from display-name pattern (e.g. "🐳✅G - NEW WHALE …" → "G")
    const card = await extractIntel("", "", "", transcript);
    intel.push({ fanId, ...card });
    console.log(`  ${++done}/${ids.length}  ${fanId} → ${card.name} · ${card.age} · payday ${card.payday} · "${card.last_objection}"`);
  } catch (e) {
    errs++; console.log(`  ${++done}/${ids.length}  ${fanId} — ERROR ${e.message.slice(0, 100)}`);
  }
}

// Save + print
const payload = {
  builtAt: new Date().toISOString(),
  account: { name: target.name, username: target.username, accountId: target.accountId },
  whales: intel,
};
writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2) + "\n");
console.log(`\n✓ Done — ${intel.length}/${ids.length} cards built, ${errs} errors. Saved → ${OUT_FILE}\n`);

const pad = (s, n) => (String(s || "—")).padEnd(n).slice(0, n);
console.log("Markdown table:\n");
console.log(`| Whale | Age | Payday | Last objection |\n|---|---|---|---|`);
for (const w of intel.sort((a, b) => (a.name || "").localeCompare(b.name || ""))) {
  console.log(`| ${pad(w.name, 18)} | ${pad(w.age, 4)} | ${pad(w.payday, 5)} | ${w.last_objection || "—"} |`);
}
