// Small CLI to manage whale-paydays.json without hand-editing JSON.
// Lance asked for "updated daily or via a command" — this is the command.
//
// Usage:
//   node shift-downtime-monitor/payday.mjs list
//   node shift-downtime-monitor/payday.mjs list Marissa
//   node shift-downtime-monitor/payday.mjs add  --name="Dominic" --model="Marissa" --payday="Fri" --handling="DO_NOT_SELL" [--fanId=478312148] [--note="…"]
//   node shift-downtime-monitor/payday.mjs rm   --name="Dominic" --model="Marissa"
//   node shift-downtime-monitor/payday.mjs today
//
// The file lives at shift-downtime-monitor/whale-paydays.json — the bot reads
// it on every run, so changes show up in the next shift's reminder.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "whale-paydays.json");
const VALID_HANDLING = ["DO_NOT_SELL", "PRE_SELL", "REVIVE", "SELL", "PAYDAY"];
const VALID_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const args = Object.fromEntries(process.argv.slice(3)
  .filter((a) => a.startsWith("--"))
  .map((a) => a.slice(2).split("=")).map(([k, v]) => [k, v ?? "1"]));
const positional = process.argv.slice(3).filter((a) => !a.startsWith("--"));
const cmd = (process.argv[2] || "list").toLowerCase();

const load = () => JSON.parse(readFileSync(FILE, "utf8"));
const save = (d) => writeFileSync(FILE, JSON.stringify(d, null, 2) + "\n");

const die = (m) => { console.error("✖ " + m); process.exit(1); };
const ok = (m) => console.log("✓ " + m);

function showTable(whales) {
  if (!whales.length) { console.log("  (none)"); return; }
  const pad = (s, n) => String(s ?? "—").padEnd(n).slice(0, n);
  console.log(`  ${pad("Name", 18)} ${pad("Model", 14)} ${pad("Payday", 6)} ${pad("Handling", 12)} Note`);
  console.log("  " + "─".repeat(72));
  for (const w of whales.sort((a, b) => (a.model || "").localeCompare(b.model || "") || (a.name || "").localeCompare(b.name || ""))) {
    console.log(`  ${pad(w.name, 18)} ${pad(w.model, 14)} ${pad(w.payday, 6)} ${pad(w.handling, 12)} ${w.note || ""}`);
  }
}

if (cmd === "list") {
  const d = load();
  const filter = positional[0]?.toLowerCase();
  const whales = filter
    ? d.whales.filter((w) => (w.model || "").toLowerCase().includes(filter) || (w.name || "").toLowerCase().includes(filter))
    : d.whales;
  console.log(`\n${whales.length} whale(s)${filter ? ` matching "${filter}"` : ""}:\n`);
  showTable(whales);
}
else if (cmd === "today") {
  const today3 = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/London", weekday: "short" }).format(new Date()).slice(0, 3);
  const d = load();
  const due = d.whales.filter((w) => (w.payday || "").slice(0, 3).toLowerCase() === today3.toLowerCase());
  console.log(`\nPayday today (${today3} London) — ${due.length} whale(s):\n`);
  showTable(due);
}
else if (cmd === "add") {
  const { name, model, payday, handling = "SELL", fanId = "", note = "" } = args;
  if (!name || !model || !payday) die("need --name, --model, --payday (and optionally --handling, --fanId, --note)");
  const pd = payday.slice(0, 3);
  if (!VALID_DAYS.some((d) => d.toLowerCase() === pd.toLowerCase())) die(`payday must be one of: ${VALID_DAYS.join(", ")}`);
  if (!VALID_HANDLING.includes(handling)) die(`handling must be one of: ${VALID_HANDLING.join(", ")}`);
  const d = load();
  const lower = (s) => String(s || "").toLowerCase();
  const dupe = d.whales.find((w) => lower(w.name) === lower(name) && lower(w.model) === lower(model));
  if (dupe) {
    Object.assign(dupe, { payday: VALID_DAYS.find((x) => x.toLowerCase() === pd.toLowerCase()), handling, ...(fanId ? { fanId } : {}), ...(note ? { note } : {}) });
    save(d); ok(`Updated ${name} on ${model} → ${handling} · payday ${dupe.payday}`);
  } else {
    d.whales.push({ fanId: fanId || undefined, name, model, handling, payday: VALID_DAYS.find((x) => x.toLowerCase() === pd.toLowerCase()), ...(note ? { note } : {}) });
    save(d); ok(`Added ${name} on ${model} → ${handling} · payday ${pd}`);
  }
}
else if (cmd === "rm") {
  const { name, model } = args;
  if (!name || !model) die("need --name and --model");
  const d = load();
  const lower = (s) => String(s || "").toLowerCase();
  const before = d.whales.length;
  d.whales = d.whales.filter((w) => !(lower(w.name) === lower(name) && lower(w.model) === lower(model)));
  if (d.whales.length === before) die(`no match for ${name} on ${model}`);
  save(d); ok(`Removed ${name} on ${model}`);
}
else {
  console.error(`unknown command: ${cmd}\n\nCommands: list [filter] · today · add (--name --model --payday [--handling --fanId --note]) · rm (--name --model)`);
  process.exit(1);
}
