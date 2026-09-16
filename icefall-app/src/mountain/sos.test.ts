/**
 * SOS: coordinate formatting, the dialable/radio split, the number lookup, the
 * age sentence, the text-message link and the device-only emergency info.
 *
 * Run: esbuild src/mountain/sos.test.ts --bundle --platform=node --format=esm
 *      --define:import.meta.env={} --alias:@=./src --outfile=... && node ...
 */

import { MOUNTAINS } from "@/data/mock/mountains";
import { rescueFor } from "@/data/mountainRescue";

import {
  EMERGENCY_INFO_KEY,
  MAX_CONTACTS,
  deleteEmergencyInfo,
  emptyEmergencyInfo,
  readEmergencyInfo,
  saveEmergencyInfo,
} from "./emergencyInfo";
import {
  INTERNATIONAL_112_NOTE,
  NO_NUMBER_HEADING,
  accuracyLabel,
  classifyNumber,
  formatDDM,
  formatDMS,
  formatDecimal,
  formatSignedDecimal,
  isIosUserAgent,
  longDate,
  numberAge,
  positionCopyText,
  smsBody,
  smsHref,
  sosLookup,
  telHref,
} from "./sos";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
let passCount = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } else {
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

console.log("\nCoordinates");
eq("decimal north", formatDecimal(45.832622, "lat"), "45.83262° N");
eq("decimal east", formatDecimal(6.865176, "lon"), "6.86518° E");
eq("decimal rounds to five places", formatDecimal(1.234566, "lat"), "1.23457° N");
eq("decimal south", formatDecimal(-32.653197, "lat"), "32.65320° S");
eq("decimal west", formatDecimal(-151.0074, "lon"), "151.00740° W");
eq("tiny negative that rounds to zero is not S", formatDecimal(-0.000001, "lat"), "0.00000° N");
eq("signed decimal", formatSignedDecimal(-32.653197, -70.010832), "-32.65320, -70.01083");
eq("signed decimal no minus zero", formatSignedDecimal(-0.000001, 0), "0.00000, 0.00000");

eq("DMS Mont Blanc", formatDMS(45.832622, "lat"), "45° 49′ 57.4″ N");
eq("DMS east pads minutes and seconds", formatDMS(6.865176, "lon"), "6° 51′ 54.6″ E");
eq("DMS south", formatDMS(-32.653197, "lat"), "32° 39′ 11.5″ S");
eq("DMS west", formatDMS(-70.010832, "lon"), "70° 00′ 39.0″ W");
eq("DMS carries 59.96″ into the next minute", formatDMS(10 + 59 / 60 + 59.96 / 3600, "lat"), "11° 00′ 00.0″ N");
eq("DMS carries 59′ 59.99″ into the next degree", formatDMS(-(27 + 59 / 60 + 59.99 / 3600), "lat"), "28° 00′ 00.0″ S");
eq("DMS zero", formatDMS(0, "lon"), "0° 00′ 00.0″ E");

eq("DDM Mont Blanc", formatDDM(45.832622, "lat"), "45° 49.957′ N");
eq("DDM west pads", formatDDM(-70.010832, "lon"), "70° 00.650′ W");
eq("DDM carries 59.9999′", formatDDM(5 + 59.9999 / 60, "lat"), "6° 00.000′ N");

eq("accuracy rounds", accuracyLabel(7.6), "± 8 m");
eq("accuracy thousands", accuracyLabel(1234), "± 1,234 m");
eq("no accuracy is null, not zero", accuracyLabel(null), null);

const pos = { lat: 45.832622, lon: 6.865176, accuracyM: 8, altitudeM: 4210.4, altitudeAccuracyM: 15, at: new Date(2026, 8, 14, 9, 42).getTime() };
const copied = positionCopyText(pos);
check("copy text has all three formats", copied.includes("45.83262, 6.86518") && copied.includes("45° 49′ 57.4″ N") && copied.includes("45° 49.957′ N"), copied);
check("copy text has accuracy, altitude and time", copied.includes("Accuracy ± 8 m") && copied.includes("Altitude 4,210 m ± 15 m") && copied.includes("14 September 2026, 09:42"), copied);

console.log("\nDialable vs radio");
eq("short code", classifyNumber("112"), { kind: "dial", tel: "112" });
eq("international with spaces", classifyNumber("+33 4 50 53 16 89"), { kind: "dial", tel: "+33450531689" });
eq("radio frequency", classifyNumber("VHF 142.800"), { kind: "radio" });
eq("radio is never a tel link", telHref("VHF 142.800"), null);
eq("words are never a tel link", telHref("Ask the hut warden"), null);
eq("decimal digits alone are not dialable", classifyNumber("142.800").kind, "other");
eq("tel link strips spaces", telHref("+1 907 733 2231"), "tel:+19077332231");

let deadTaps = 0;
let recordsChecked = 0;
for (const m of MOUNTAINS) {
  const r = rescueFor(m.id);
  if (!r) continue;
  recordsChecked++;
  for (const n of r.numbers) {
    const href = telHref(n.number);
    if (href && !/^tel:\+?\d+$/.test(href)) deadTaps++;
    if (/[a-z]/i.test(n.number) && href) deadTaps++;
  }
}
check("every tel link in the data is well formed, no letters linked", deadTaps === 0 && recordsChecked === 14, `${deadTaps} bad of ${recordsChecked} records`);

console.log("\nNumber lookup");
eq("no mountain → none", sosLookup(null).state, "none");
eq("unknown mountain → none (never a neighbour's numbers)", sosLookup("not-a-mountain").state, "none");

const mb = sosLookup("mont-blanc");
check("Mont Blanc: record", mb.state === "record");
if (mb.state === "record") {
  eq("Mont Blanc primary is the first dialable, in data order", mb.primary?.number, "112");
  eq("Mont Blanc others keep the PGHM landline", mb.others.map((n) => n.number), ["+33 4 50 53 16 89"]);
  eq("Mont Blanc has 112 already, no last-resort row", mb.show112AsLastResort, false);
}

const ac = sosLookup("aconcagua");
if (ac.state === "record") {
  eq("Aconcagua primary is 911, not the radio", ac.primary?.number, "911");
  const radio = ac.others.find((n) => n.number.startsWith("VHF"));
  eq("Aconcagua radio kept as radio", radio?.contact, { kind: "radio" });
  check("Aconcagua no-signal warning lifted above the call button", ac.signalWarnings.some((w) => w.includes("no phone signal")));
  eq("Aconcagua gets 112 as last resort", ac.show112AsLastResort, true);
} else check("Aconcagua: record", false);

const ev = sosLookup("everest");
if (ev.state === "record") {
  eq("Everest (Nepal) keeps national order: 100 first", ev.primary?.number, "100");
  check("Everest keeps 1144 in the list", ev.others.some((n) => n.number === "1144"));
  eq("Everest: no signal warnings invented", ev.signalWarnings, []);
} else check("Everest: record", false);

const ki = sosLookup("kilimanjaro");
if (ki.state === "record") {
  check("Kilimanjaro: 'do not consistently work' lifted to the top", ki.signalWarnings.length === 1 && ki.signalWarnings[0].includes("do not consistently work"));
} else check("Kilimanjaro: record", false);

eq("112 note is three paragraphs", INTERNATIONAL_112_NOTE.length, 3);
eq("112 heading word for word", NO_NUMBER_HEADING, "ICEFALL holds no emergency number for this country.");

console.log("\nAge of a number");
eq("long date", longDate("2026-09-11"), "11 September 2026");
eq("bad date is null", longDate("2026-13-01"), null);
const src = { label: "FCDO travel advice — Nepal", url: "https://x", kind: "issuer" as const, checked: "2026-09-11" };
eq(
  "unconfirmed sentence, never a bare date",
  numberAge(src, "2026-09-14"),
  { sentence: "Read off “FCDO travel advice — Nepal” on 11 September 2026. Nobody who works in this country has confirmed it since.", loud: false },
);
eq("11 months is not loud", numberAge(src, "2027-09-10").loud, false);
eq("a year is loud", numberAge(src, "2027-09-11").loud, true);
check("secondary sources are named as secondary", numberAge({ ...src, kind: "secondary" }, "2026-09-14").sentence.includes("a secondary source"));

console.log("\nText message");
const body = smsBody(pos, "Mont Blanc");
check("sms body has place, position, accuracy, altitude", body.includes("On Mont Blanc.") && body.includes("45.83262, 6.86518 (± 8 m)") && body.includes("Altitude 4,210 m"), body);
check("sms body with no fix says so", smsBody(null, null).includes("no GPS position yet"));
eq("android form", smsHref("+44 7700 900123", "Hi there", false), "sms:+447700900123?body=Hi%20there");
eq("iphone form", smsHref("+44 7700 900123", "Hi", true), "sms:+447700900123&body=Hi");
eq("no contact still opens the app", smsHref(null, "Hi", false), "sms:?body=Hi");
eq("a non-number contact is not addressed", smsHref("mum", "Hi", false), "sms:?body=Hi");
eq("iPhone UA", isIosUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), true);
eq("iPadOS as Mac with touch", isIosUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), true);
eq("Android UA", isIosUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), false);

console.log("\nEmergency info, on this phone only");
const mem = new Map<string, string>();
const store = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
eq("nothing saved reads null", readEmergencyInfo(store), null);
const draft = {
  ...emptyEmergencyInfo(),
  name: " Alex ",
  contacts: [
    { name: "Sam", number: "+44 7700 900123" },
    { name: "", number: "" },
    { name: "B", number: "1" },
    { name: "C", number: "2" },
    { name: "D", number: "3" },
  ],
  insurer: "Example Insurer",
};
check("save works", saveEmergencyInfo(draft, store, 1000));
const back = readEmergencyInfo(store);
eq("name trimmed", back?.name, "Alex");
eq("blank contacts dropped, capped at three", back?.contacts.length, MAX_CONTACTS);
eq("saved time kept", back?.savedAt, 1000);
eq("stored under one key only", [...mem.keys()], [EMERGENCY_INFO_KEY]);
check("saving everything blank deletes it", saveEmergencyInfo(emptyEmergencyInfo(), store) && !mem.has(EMERGENCY_INFO_KEY));
saveEmergencyInfo(draft, store);
check("delete removes it", deleteEmergencyInfo(store) && readEmergencyInfo(store) === null && mem.size === 0);
mem.set(EMERGENCY_INFO_KEY, "{not json");
eq("corrupt record reads null, never throws", readEmergencyInfo(store), null);
const noHealth = Object.keys(emptyEmergencyInfo()).filter((k) => /blood|allerg|medic|condition/i.test(k));
eq("no health fields held", noHealth, []);

console.log(`\n${passCount} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log(`  - ${f}`));
  if (proc) proc.exitCode = 1;
}
