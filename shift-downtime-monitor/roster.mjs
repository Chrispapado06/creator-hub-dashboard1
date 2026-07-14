// Chatter roster — maps a breaching model to the responsible chatter so the
// downtime ping can @mention the person instead of the whole shift role.
//
// Source of truth is the UNCVRD weekly shift sheet (published CSV). The tab is
// updated in place each week, so we match by the CURRENT Philippine weekday +
// shift block rather than a hard date. Layout (per the sheet):
//   • 3 shift-block sections, each headed by a "… PHT / … GMT" time-label row
//   • a weekday header row (Monday (June 29) | Tuesday (…) | …)
//   • chatter rows: col0 = chatter, each day column = comma-list of accounts
// We invert that to  block -> weekday -> accountToken -> chatterName.
//
// Names → Discord ids come from the private CHATTERS_MAP env var (a JSON blob;
// kept out of the public repo). Anything unresolved returns null and the caller
// falls back to the shift role — so a bad fetch/parse never breaks alerts.

import { ROSTER, ACCOUNT_SHEET_ALIASES, weekdayInTz } from "./config.mjs";

// ── tiny CSV parser (handles quoted fields with commas/newlines) ────────────
export function parseCsv(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const WEEKDAYS = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };

// Which config shift block does a "… PHT" time-label row belong to?
function blockOf(rowText) {
  const t = rowText.toLowerCase();
  if (!t.includes("pht")) return null;
  const pht = t.split("pht")[0]; // ONLY the Philippine-time portion — the GMT/UAE
  //                                times in the same label would otherwise match.
  if (/12\s*(mn|am)\s*-\s*8\s*am/.test(pht)) return "Evening"; // PH 00–08
  if (/8\s*am\s*-\s*4\s*pm/.test(pht)) return "Night";         // PH 08–16
  if (/4\s*pm\s*-\s*12\s*(mn|nn|am)/.test(pht)) return "Day";  // PH 16–24
  return null;
}

// A weekday header row → { colIndex: "Mon" }
function weekdayCols(row) {
  const cols = {}; let hits = 0;
  row.forEach((cell, idx) => {
    const m = String(cell).toLowerCase().match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
    if (m) { cols[idx] = WEEKDAYS[m[0]]; hits++; }
  });
  return hits >= 3 ? cols : null;
}

// "Lance (QA/QC)" → "Lance", "Anika/Cake" → "Anika", "Dave (trial)" → "Dave"
export function cleanName(s) {
  return String(s || "").replace(/\(.*?\)/g, "").split("/")[0].trim();
}

export function buildRoster(rows) {
  const roster = {}; let block = null, wcols = null;
  for (const row of rows) {
    const b = blockOf(row.join(" "));
    if (b) { block = b; wcols = null; roster[block] ??= {}; continue; }
    const wc = weekdayCols(row);
    if (wc) { wcols = wc; continue; }
    if (!block || !wcols) continue;
    const chatter = cleanName(row[0]);
    if (!chatter) continue;
    for (const [idxStr, wd] of Object.entries(wcols)) {
      const cell = String(row[Number(idxStr)] || "").trim();
      if (!cell || /day off|no show/i.test(cell)) continue;
      (roster[block][wd] ??= {});
      for (const tokRaw of cell.split(",")) {
        const tok = tokRaw.trim().toLowerCase();
        if (tok && !(tok in roster[block][wd])) roster[block][wd][tok] = chatter; // first chatter listed wins
      }
    }
  }
  return roster;
}

// ── caches ──────────────────────────────────────────────────────────────────
let _cmap = null;
function chatterMap() {
  if (_cmap) return _cmap;
  _cmap = {};
  try {
    const raw = JSON.parse(process.env.CHATTERS_MAP || "{}");
    const byName = raw.byName || raw;
    for (const [k, v] of Object.entries(byName)) if (v) _cmap[String(k).toLowerCase()] = String(v);
  } catch { /* leave empty → role fallback */ }
  return _cmap;
}

let _roster = null, _rosterAt = 0;
async function getRoster() {
  const now = Date.now();
  if (_roster && now - _rosterAt < ROSTER.cacheSec * 1000) return _roster;
  const res = await fetch(ROSTER.csvUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`roster fetch HTTP ${res.status}`);
  _roster = buildRoster(parseCsv(await res.text()));
  _rosterAt = now;
  const n = Object.values(_roster).reduce((s, b) => s + Object.values(b).reduce((s2, w) => s2 + Object.keys(w).length, 0), 0);
  console.log(`[roster] loaded blocks ${Object.keys(_roster).join("/")} · ${n} account-day assignments`);
  return _roster;
}

// Debug: what does the parsed roster hold for a block+weekday right now?
export async function debugRoster(blockName, weekday) {
  let r; try { r = await getRoster(); } catch (e) { return `fetch/parse error: ${e.message}`; }
  const block = r?.[blockName];
  if (!block) return `no block '${blockName}' (blocks: ${Object.keys(r || {}).join("/")})`;
  const sect = block[weekday];
  if (!sect) return `no weekday '${weekday}' (present: ${Object.keys(block).join(",")})`;
  const toks = Object.keys(sect);
  return `${toks.length} tokens e.g. [${toks.slice(0, 16).join(" | ")}]`;
}

// Discord id (+ resolved chatter name) for the chatter responsible for `username`
// on the given shift block right now, or null → caller falls back to the role.
export async function resolveChatter(username, blockName, now = Date.now()) {
  if (!ROSTER.enabled) return null;
  const aliases = ACCOUNT_SHEET_ALIASES[String(username).toLowerCase()];
  if (!aliases) return null;
  let roster;
  try { roster = await getRoster(); } catch (e) { console.warn(`[roster] ${e.message}`); return null; }
  const wd = weekdayInTz(new Date(now), ROSTER.tz);
  const sect = roster?.[blockName]?.[wd];
  if (!sect) return null;
  const map = chatterMap();
  for (const alias of aliases) {
    const name = sect[alias];
    if (name && map[name.toLowerCase()]) return { id: map[name.toLowerCase()], name };
  }
  return null;
}
