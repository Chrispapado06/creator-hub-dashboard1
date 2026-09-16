/**
 * The emergency-number dataset (brief M6, plan §5): the country layer, the two
 * dates, the review states, dialable vs radio, the 112 fallback word for word,
 * and the validator run over the real data.
 *
 * Run: esbuild src/mountain/emergencyNumbers.test.ts --bundle --platform=node
 *      --format=esm --define:import.meta.env={} --alias:@=./src --outfile=... && node ...
 */

import {
  COUNTRY_EMERGENCY,
  EMERGENCY_GAPS,
  RECORDS,
  countryEmergency,
  emergencyGap,
  rescueFor,
  type CountryEmergency,
  type EmergencyNumber,
} from "@/data/mountainRescue";

import {
  INTERNATIONAL_112_NOTE,
  NO_NUMBER_HEADING,
  ageLine,
  dialString,
  isIsoDate,
  longDate,
  monthsBetween,
  olderDate,
  resolveEmergency,
  reviewSentence,
  reviewSheet,
  telHref,
  validateEmergencyData,
} from "./emergencyNumbers";

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

const TODAY = "2026-09-15";

/* -------------------------------------------------------------------------- */
console.log("\nDates");

check("real date", isIsoDate("2026-09-11"));
check("31 September is not a date", !isIsoDate("2026-09-31"));
check("month 13 is not a date", !isIsoDate("2026-13-01"));
check("empty is not a date", !isIsoDate(""));
eq("long date", longDate("2026-09-11"), "11 September 2026");
eq("long date of a non-date is null", longDate("11/09/2026"), null);
eq("months between", monthsBetween("2025-09-11", "2026-09-15"), 12);
eq("months between stops short of the day", monthsBetween("2025-09-20", "2026-09-15"), 11);
eq("the older of two dates wins", olderDate("2027-03-04", "2026-09-11"), "2026-09-11");
eq("older, other way round", olderDate("2026-09-11", "2027-03-04"), "2026-09-11");
eq("no second date leaves the first", olderDate("2026-09-11", null), "2026-09-11");

/* -------------------------------------------------------------------------- */
console.log("\nDialable, radio, text");

const radio: EmergencyNumber = {
  number: "VHF 142.800",
  label: "Rescue patrol, by radio",
  contact: "radio",
  source: { label: "x", url: "https://example.org", kind: "issuer", checked: "2026-09-11" },
};
const spaced: EmergencyNumber = {
  number: "+33 4 50 53 16 89",
  label: "PGHM Chamonix",
  contact: "dial",
  dial: "+33450531689",
  source: { label: "x", url: "https://example.org", kind: "issuer", checked: "2026-09-11" },
};
eq("radio is never a tel link", telHref(radio), null);
eq("the link form has no spaces", telHref(spaced), "tel:+33450531689");
eq(
  "a short code needs no dial field",
  dialString({ ...spaced, number: "112", dial: undefined }),
  "112",
);
eq(
  "a dial entry that is not digits gives no link",
  dialString({ ...spaced, number: "ask your operator", dial: undefined }),
  null,
);

/* -------------------------------------------------------------------------- */
console.log("\nEvery number in the real data is classified");

const allNumbers = COUNTRY_EMERGENCY.flatMap((c) => c.numbers.map((n) => ({ c, n })));
check("there are numbers to check", allNumbers.length > 20, String(allNumbers.length));
eq(
  "every dialable number produces a link",
  allNumbers.filter(({ n }) => n.contact === "dial" && !telHref(n)).map(({ n }) => n.number),
  [],
);
const localBad = RECORDS.flatMap((r) => r.localNumbers ?? []).filter(
  (n) => (n.contact === "dial") !== (telHref(n) !== null),
);
eq("mountain lines agree with their own kind", localBad.map((n) => n.number), []);
eq(
  "the Aconcagua radio frequency is marked as radio",
  rescueFor("aconcagua")?.localNumbers?.map((n) => [n.number, n.contact]),
  [["VHF 142.800", "radio"]],
);

/* -------------------------------------------------------------------------- */
console.log("\nOne number per country, not one per mountain (plan §5.1)");

const italian112 = RECORDS.filter((r) => r.countryCode === "IT").map(
  (r) => r.numbers.find((n) => n.number === "112"),
);
check("Gran Paradiso and the Italian side read the same 112 object", italian112.length > 0 && italian112.every((n) => n === italian112[0]), String(italian112.length));
eq(
  "no mountain record writes its own national number",
  RECORDS.flatMap((r) => {
    const national = new Set((countryEmergency(r.countryCode)?.numbers ?? []).map((n) => n.number));
    return (r.localNumbers ?? []).filter((n) => national.has(n.number)).map((n) => `${r.mountainId} ${n.number}`);
  }),
  [],
);
eq(
  "Mont Blanc keeps only the Chamonix landline of its own",
  rescueFor("mont-blanc")?.localNumbers?.map((n) => n.label),
  ["PGHM Chamonix, direct"],
);
check(
  "Mont Blanc still shows France's 112 first",
  rescueFor("mont-blanc")?.numbers[0]?.number === "112",
  rescueFor("mont-blanc")?.numbers[0]?.number,
);
eq(
  "the Eiger and the Matterhorn share Switzerland's numbers",
  rescueFor("eiger")?.numbers.map((n) => n.number),
  rescueFor("matterhorn")?.numbers.map((n) => n.number),
);
check(
  "Switzerland's 144 and 112 are re-sourced off a national page, not a tourist board",
  (countryEmergency("CH")?.numbers ?? [])
    .filter((n) => n.number === "144" || n.number === "112")
    .every((n) => /FCDO/.test(n.source.label) && n.source.checked === "2026-09-15"),
);

/* -------------------------------------------------------------------------- */
console.log("\nWarnings sit above the numbers, never on one row (plan §5.9)");

const tz = resolveEmergency({ mountainId: "kilimanjaro", today: TODAY });
check(
  "Tanzania's coverage warning is on the record, not the second number",
  tz.warnings.some((w) => /do not consistently work/.test(w)) &&
    tz.numbers.every((n) => !/do not consistently work/.test(n.entry.note ?? "")),
  JSON.stringify(tz.warnings),
);
const ar = resolveEmergency({ mountainId: "aconcagua", today: TODAY });
check(
  "Aconcagua's no-signal warning is on the record",
  ar.warnings.some((w) => /no phone signal/i.test(w)),
  JSON.stringify(ar.warnings),
);
check(
  "Denali's no-coverage warning is on the record",
  resolveEmergency({ mountainId: "denali", today: TODAY }).warnings.some((w) => /no mobile coverage/i.test(w)),
);

/* -------------------------------------------------------------------------- */
console.log("\nResolution (plan §5.6)");

const np = resolveEmergency({ mountainId: "everest", today: TODAY });
eq("resolved through the mountain", np.via, "mountain");
eq("and says which mountain it thinks you are on", np.mountainId, "everest");
eq("Nepal's numbers, in the data's order", np.numbers.map((n) => n.entry.number), ["100", "1144", "102", "101"]);
check("112 stays visible as a last resort where it is not national", np.show112);

const byCountry = resolveEmergency({ countryCode: "np", today: TODAY });
eq("a destination country alone still resolves", byCountry.via, "country");
eq("lower case country code works", byCountry.numbers.length, 4);
eq("no mountain claimed when there is none", byCountry.mountainId, null);

const nothing = resolveEmergency({ today: TODAY });
eq("nothing set falls through to 112", nothing.via, "none");
check("and the 112 block is shown", nothing.show112);
eq("with no invented numbers", nothing.numbers, []);

const china = resolveEmergency({ countryCode: "CN", today: TODAY });
eq("China is a named gap, not a silent hole", china.via, "none");
check("with its reason", !!china.gap && /permitted operator/.test(china.gap.reason));
eq("and it names the three mountains it bites on", china.gap?.mountainIds, ["everest", "k2", "broad-peak"]);
eq("an unknown country invents nothing", resolveEmergency({ countryCode: "ZZ", today: TODAY }).numbers, []);

const everestFromChina = resolveEmergency({ mountainId: "everest", countryCode: "CN", today: TODAY });
eq(
  "an athlete's own China destination on Everest wins over Nepal's default record (rt:honest-gaps)",
  everestFromChina.via,
  "none",
);
eq("no Nepal numbers leak into the primary block", everestFromChina.numbers, []);
check("the China gap reason is on the resolution the SOS numbers block reads", !!everestFromChina.gap && /permitted operator/.test(everestFromChina.gap.reason));
check("112 fallback still shown", everestFromChina.show112);

const k2FromChina = resolveEmergency({ mountainId: "k2", countryCode: "CN", today: TODAY });
eq("same for K2: no Pakistan numbers leak in", k2FromChina.via, "none");
eq("no Pakistan numbers", k2FromChina.numbers, []);

const everestAgreeing = resolveEmergency({ mountainId: "everest", countryCode: "NP", today: TODAY });
eq("an ordinary Nepal-side destination is unaffected by the gap check", everestAgreeing.via, "mountain");
check("still shows Nepal's numbers", everestAgreeing.numbers.length > 0);

/* -------------------------------------------------------------------------- */
console.log("\nAge and review (plan §5.2, §5.3, §5.4)");

const nepal = countryEmergency("NP") as CountryEmergency;
const line = ageLine(nepal.numbers[0], nepal, TODAY);
check("unconfirmed says nobody local has confirmed it", /Nobody who works in Nepal has confirmed it since\./.test(line.sentence), line.sentence);
check("and never a bare date", !/^Checked /.test(line.sentence));
check("four days old is not loud", !line.loud);
eq("the shown date is the read date", line.shownDate, "2026-09-11");
check(
  "over a year old says so, loudly",
  ageLine(nepal.numbers[0], nepal, "2027-10-01").loud &&
    /over a year ago/.test(ageLine(nepal.numbers[0], nepal, "2027-10-01").sentence),
);
check("a secondary source is named as one", /a secondary source/.test(
  ageLine(
    { ...nepal.numbers[0], source: { ...nepal.numbers[0].source, kind: "secondary" } },
    nepal,
    TODAY,
  ).sentence,
));

const reviewed: CountryEmergency = {
  ...nepal,
  review: {
    state: "reviewed",
    confirmedOn: "2027-03-04",
    reviewers: [
      { name: "A Sherpa", role: "Sirdar", organisation: "An agency" },
      { name: "B Rai", role: "Doctor", organisation: "A clinic" },
    ],
    scope: "Nepal, Khumbu, spring trekking season",
  },
};
const rLine = ageLine(reviewed.numbers[0], reviewed, "2027-03-05");
check("a confirmed number names the people and the scope", /Confirmed 4 March 2027 by A Sherpa \(Sirdar, An agency\) and B Rai/.test(rLine.sentence), rLine.sentence);
check("and carries the scope", /Scope: Nepal, Khumbu, spring trekking season\./.test(rLine.sentence));
eq("the older of the two dates is the one shown", rLine.shownDate, "2026-09-11");
check("so a fresh confirmation over an old read is still loud when the read is old", ageLine(reviewed.numbers[0], reviewed, "2027-10-01").loud);

const noNumber: CountryEmergency = {
  ...nepal,
  review: {
    state: "reviewed-no-number",
    confirmedOn: "2027-03-04",
    reviewers: [{ name: "A Sherpa", role: "Sirdar", organisation: "An agency" }],
    scope: "Nepal, Khumbu, spring trekking season",
    reason: "There is no number here that anybody answers.",
  },
};
check("a signed empty sheet is shown in their words", /There is no number here that anybody answers\./.test(reviewSentence(noNumber.review) ?? ""));
eq("an unreviewed country has no country-level line", reviewSentence(nepal.review), null);

/* -------------------------------------------------------------------------- */
console.log("\nStale numbers are still shown, still dialable (plan §5.4)");

const old = resolveEmergency({ mountainId: "everest", today: "2029-01-01" });
eq("the order does not change with age", old.numbers.map((n) => n.entry.number), np.numbers.map((n) => n.entry.number));
eq("every dialable number still has its link", old.numbers.filter((n) => n.entry.contact === "dial" && !n.tel).length, 0);
check("and the age line is loud", old.numbers.every((n) => n.age.loud));
eq(
  "nothing in a resolved number can hide or grey it",
  Object.keys(old.numbers[0]).filter((k) => /hidden|disabled|grey|gray/i.test(k)),
  [],
);

/* -------------------------------------------------------------------------- */
console.log("\nThe 112 fallback, word for word (plan §5.5)");

eq("the heading", NO_NUMBER_HEADING, "ICEFALL holds no emergency number for this country.");
eq("three paragraphs", INTERNATIONAL_112_NOTE.length, 3);
eq(
  "the convention paragraph",
  INTERNATIONAL_112_NOTE[0],
  "112 is the emergency number across the European Union. Outside it, most mobile phones recognise 112 and try to route it to whatever local service exists — that is a convention built into handsets and networks, not a promise about what is at the other end.",
);
eq(
  "the four things it does not promise",
  INTERNATIONAL_112_NOTE[1],
  "It may not be answered here. It may not reach mountain rescue. Whoever answers may not speak English. And none of it works without a signal.",
);
eq(
  "and what to do instead",
  INTERNATIONAL_112_NOTE[2],
  "Ask your guide or your operator for the local number, and ask before you are on the mountain.",
);

/* -------------------------------------------------------------------------- */
console.log("\nThe validator, over the real data");

const problems = validateEmergencyData(TODAY);
eq("no errors in the shipped data", problems.filter((p) => p.level === "error"), []);

const errorsFor = (c: CountryEmergency) => {
  const saved = COUNTRY_EMERGENCY.slice();
  COUNTRY_EMERGENCY.length = 0;
  COUNTRY_EMERGENCY.push(c);
  const out = validateEmergencyData(TODAY).filter((p) => p.level === "error");
  COUNTRY_EMERGENCY.length = 0;
  COUNTRY_EMERGENCY.push(...saved);
  return out;
};
const src = { label: "x", url: "https://example.org", kind: "issuer" as const, checked: "2026-09-11" };
const base: CountryEmergency = {
  code: "XX",
  name: "Nowhere",
  numbers: [{ number: "112", label: "Emergency", contact: "dial", source: src }],
  review: { state: "unreviewed" },
};
check("a clean made-up country passes", errorsFor(base).length === 0, JSON.stringify(errorsFor(base)));
check(
  "spaces with no dial field are caught",
  errorsFor({ ...base, numbers: [{ ...base.numbers[0], number: "+33 4 50 53 16 89" }] }).some((p) => /dial/.test(p.what)),
);
check(
  "a radio marked dialable is caught",
  errorsFor({ ...base, numbers: [{ ...base.numbers[0], number: "VHF 142.800" }] }).some((p) => /tel:/.test(p.what)),
);
check(
  "a source with no URL is caught",
  errorsFor({ ...base, numbers: [{ ...base.numbers[0], source: { ...src, url: "" } }] }).some((p) => /URL/.test(p.what)),
);
check(
  "an unreal read date is caught",
  errorsFor({ ...base, numbers: [{ ...base.numbers[0], source: { ...src, checked: "2026-02-30" } }] }).some((p) => /ISO date/.test(p.what)),
);
check(
  "an empty country with no signed answer is caught",
  errorsFor({ ...base, numbers: [] }).some((p) => /signed answer/.test(p.what)),
);
check(
  "a review scope no narrower than the country is caught",
  errorsFor({
    ...base,
    review: { state: "reviewed", confirmedOn: "2026-09-01", reviewers: [{ name: "A", role: "Guide", organisation: "B" }], scope: "Nowhere" },
  }).some((p) => /narrower/.test(p.what)),
);
check(
  "a review with nobody named is caught",
  errorsFor({ ...base, review: { state: "reviewed", confirmedOn: "2026-09-01", reviewers: [], scope: "Nowhere, one valley" } }).some((p) => /nobody named/.test(p.what)),
);
check(
  "a confirmation dated in the future is caught",
  errorsFor({ ...base, review: { state: "reviewed", confirmedOn: "2030-01-01", reviewers: [{ name: "A", role: "Guide", organisation: "B" }], scope: "Nowhere, one valley" } }).some((p) => /future/.test(p.what)),
);
check(
  "the same number twice in one country is caught",
  errorsFor({ ...base, numbers: [base.numbers[0], base.numbers[0]] }).some((p) => /twice/.test(p.what)),
);

/* -------------------------------------------------------------------------- */
console.log("\nNamed gaps, never guesses");

eq("China is the named gap", EMERGENCY_GAPS.map((g) => g.code), ["CN"]);
check("every gap gives a reason", EMERGENCY_GAPS.every((g) => g.reason.trim().length > 40));
check("a country is never both held and a gap", COUNTRY_EMERGENCY.every((c) => !emergencyGap(c.code)));
check(
  "France says out loud that 114 is not held",
  (countryEmergency("FR")?.gaps ?? []).some((g) => /114/.test(g)),
);
check(
  "Italy says out loud there is nothing behind 112",
  (countryEmergency("IT")?.gaps ?? []).some((g) => /no Italian number behind 112/.test(g)),
);
check(
  "Switzerland says 117 is still on a tourist board's page",
  (countryEmergency("CH")?.gaps ?? []).some((g) => /117/.test(g)),
);
check("nothing in the data is confirmed by anyone local yet", COUNTRY_EMERGENCY.every((c) => c.review.state === "unreviewed"));

/* -------------------------------------------------------------------------- */
console.log("\nThe review sheet is generated, not written (plan §5.10)");

const sheet = reviewSheet("NP") ?? "";
check("it carries the do-not-dial rule at the top", /Nobody rings an emergency number to test it/.test(sheet));
check("it lists every number the app shows", (countryEmergency("NP")?.numbers ?? []).every((n) => sheet.includes(`| ${n.number} |`)));
check("it asks what a web page cannot answer", /answered in the mountains/.test(sheet));
check("it says an empty sheet is a valid answer", /An empty sheet is a valid signed answer/.test(sheet));
eq("no sheet for a country ICEFALL holds nothing for", reviewSheet("CN"), null);

console.log(`\n${passCount} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log(`  - ${f}`));
  if (proc) proc.exitCode = 1;
}
