// Parser for the UNCVRD shift-schedule Google Sheet (the messy weekly grid).
//
// Reads the exported sheet text (JSON {fileContent} from the Drive MCP, or raw
// text) and turns it into structured shift records. The sheet is a sequence of
// weekly GRID tables: columns = days (with dates), rows = chatters, each cell =
// the accounts that chatter handles that day. Each grid has a QA row at the top.
//
// This is a DEV/ANALYSIS tool right now — it proves the grid can be parsed and
// shows the block structure. The production sync will reuse this logic over a
// live fetch of the sheet.
//
//   node shift-downtime-monitor/parse-shifts.mjs [path-to-export.txt]

import { readFileSync } from "node:fs";

const FILE = process.argv[2] ||
  "/Users/christofispapadopoulos/.claude/projects/-Users-christofispapadopoulos-Downloads-creator-hub-dashboard-main/9ed02c5f-3bd5-4cc0-a218-1c2e2858d595/tool-results/mcp-9c6940e2-e231-4079-adfb-994bba732b6e-read_file_content-1781955303951.txt";

// Sheet account-name → OF username, for the accounts actually on the OF API.
// (The sheet has dozens more accounts that aren't connected — ignored.)
const ACCOUNT_ALIASES = [
  [/^blue (bear|exclusive)|whales-?\s*blue/i, "bluebeari3vip"],
  [/^marissa|whales-?\s*marissa/i,            "marissa.munoz"],
  [/^emma/i,                                  "emmasonne"],
  [/^meg/i,                                   "flame_fantasy_xx"],
  [/^(june|sandra)/i,                         "thisisjunee"],
  [/^julie/i,                                 "juliejswan"],
  [/^johnnie/i,                               "johnniejohnson"],
  [/^amara/i,                                 "kttiemilk"],
];
const STATUS = /^(day off|on leave|waiting|qa\/qc|qa|tbd|n\/a|-)?$/i;

function aliasToUsername(cell) {
  const s = cell.trim();
  if (!s || STATUS.test(s)) return null;
  for (const [re, user] of ACCOUNT_ALIASES) if (re.test(s)) return user;
  return null; // not a connected account
}

function splitRow(line) {
  // "| a | b | c |" → ["a","b","c"]
  let cells = line.split("|").map((c) => c.trim());
  if (cells.length && cells[0] === "") cells.shift();
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

const isSeparator = (cells) => cells.every((c) => /^:?-+:?$/.test(c) || c === "");
const isHeader = (cells) => cells.some((c) => /chatter/i.test(c)) && cells.some((c) => /monday/i.test(c));
const dayDate = (h) => {
  // "Wednesday(June 10 PH)" / "Sunday (Sept 7 (PH)" → {day, date}
  const m = h.match(/^\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s*\(?\s*([A-Za-z]+\s+\d+)/);
  return m ? { day: m[1], date: m[2] } : { day: h.trim(), date: null };
};
const cleanName = (s) => s.replace(/\s*\((QA|QA\/QC|Trial[^)]*|Probi[^)]*|Back-?up[^)]*|Cover\/OT[^)]*|OT\/Cover[^)]*|Tentative[^)]*)\)/ig, "")
  .replace(/\s+\d?[AP]M.*$/i, "").trim();
const isQaRow = (label) => /\(QA(\/QC)?\)/i.test(label);

function parse(text) {
  const lines = text.split(/\r?\n/);
  const grids = [];
  let cur = null;
  for (const line of lines) {
    if (!line.trim().startsWith("|")) { continue; }
    const cells = splitRow(line);
    if (isSeparator(cells)) continue;
    if (isHeader(cells)) {
      // day columns start at index 2 (0=seq,1="Chatter")
      const days = cells.slice(2).map(dayDate);
      cur = { weekKey: days[0]?.date ?? `grid${grids.length}`, days, qa: null, rows: [] };
      grids.push(cur);
      continue;
    }
    if (!cur) continue;
    const label = cells[1] ?? "";
    if (!label || /^legends?$/i.test(label) || /^\d+$/.test(label) && !cells[2]) continue;
    if (isQaRow(label)) { cur.qa = cleanName(label); continue; }
    const name = cleanName(label);
    if (!name) continue;
    cur.rows.push({ chatter: name, cells: cells.slice(2) });
  }
  return grids;
}

// Emit one record per (grid, day, chatter, connected-account).
function records(grids) {
  const out = [];
  grids.forEach((g, gi) => {
    g.rows.forEach((row) => {
      g.days.forEach((d, di) => {
        const cell = row.cells[di];
        if (!cell) return;
        for (const part of cell.split(",")) {
          const user = aliasToUsername(part);
          if (user) out.push({ weekKey: g.weekKey, gridIndex: gi, day: d.day, date: d.date, chatter: row.chatter, qa: g.qa, account: user, raw: part.trim() });
        }
      });
    });
  });
  return out;
}

// ── run ──────────────────────────────────────────────────────────────
const raw = readFileSync(FILE, "utf8");
let text;
try { text = JSON.parse(raw).fileContent ?? raw; } catch { text = raw; }

const grids = parse(text);
const recs = records(grids);

// Grids per week (to test "3 grids/week = 3 shift blocks").
const perWeek = {};
grids.forEach((g) => { perWeek[g.weekKey] = (perWeek[g.weekKey] || 0) + 1; });
console.log("=== grids ===", grids.length, "total");
console.log("grids per week (weekKey → #grids):");
for (const [w, n] of Object.entries(perWeek)) console.log(`  ${w.padEnd(14)} ${n}  QAs: ${grids.filter((g) => g.weekKey === w).map((g) => g.qa).join(" | ")}`);

console.log(`\n=== connected-account shift records: ${recs.length} ===`);
const byAcct = {};
recs.forEach((r) => { (byAcct[r.account] ??= new Set()).add(r.chatter); });
for (const [a, set] of Object.entries(byAcct)) console.log(`  ${a.padEnd(18)} chatters seen: ${[...set].join(", ")}`);

console.log(`\n=== sample: Blue Bear, first grid that has it ===`);
const blue = recs.filter((r) => r.account === "bluebeari3vip").slice(0, 12);
for (const r of blue) console.log(`  week ${r.weekKey} · grid#${r.gridIndex} · ${r.day} ${r.date} · chatter=${r.chatter} · QA=${r.qa} · [${r.raw}]`);
