/**
 * The typed destination, matched to a country code (plan §5.6). The point of
 * every case below is the same: an exact match or nothing.
 *
 * Run: esbuild src/mountain/destinationCountry.test.ts --bundle --platform=node
 *      --format=esm --define:import.meta.env={} --alias:@=./src --outfile=... && node ...
 */

import { destinationCountryCode, destinationSentence, matchDestination } from "./destinationCountry";

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

console.log("\nMatching a country ICEFALL holds");

eq("the country's own name", destinationCountryCode("France"), "FR");
eq("case does not matter", destinationCountryCode("nepal"), "NP");
eq("stray spaces do not matter", destinationCountryCode("  Switzerland  "), "CH");
eq("double spaces do not matter", destinationCountryCode("United  States"), "US");
eq("the ISO code itself", destinationCountryCode("it"), "IT");
eq("USA is the same country beyond argument", destinationCountryCode("U.S.A."), "US");
eq("the long form of the same", destinationCountryCode("United States of America"), "US");

console.log("\nIt matches exactly or not at all");

eq("a prefix is not a match", destinationCountryCode("Fra"), null);
eq("a longer string containing the name is not a match", destinationCountryCode("Republic of France"), null);
eq("a typo is not a match", destinationCountryCode("Franse"), null);
eq("a region is not a country", destinationCountryCode("Chamonix"), null);
eq("a language's own spelling is not held", destinationCountryCode("Suisse"), null);
eq("nothing typed", destinationCountryCode(""), null);
eq("nothing at all", destinationCountryCode(null), null);

console.log("\nThe four answers");

eq("empty", matchDestination("   "), { state: "empty" });
eq("held", matchDestination("Italy"), { state: "held", code: "IT", name: "Italy" });
check("a named gap keeps its reason", (() => {
  const m = matchDestination("China");
  return m.state === "gap" && m.code === "CN" && /ask your operator/i.test(m.reason);
})());
check("unknown hands back what was typed", (() => {
  const m = matchDestination("Narnia");
  return m.state === "unknown" && m.typed === "Narnia";
})());

console.log("\nThe quiet line under the destination");

eq("nothing typed says nothing", destinationSentence({ state: "empty" }), null);
check("held says where the numbers are", /ICEFALL holds emergency numbers for Italy/.test(destinationSentence(matchDestination("Italy")) ?? ""));
check("a gap says there is none, without guessing one", /holds no emergency number for China/.test(destinationSentence(matchDestination("China")) ?? ""));
check(
  "unknown quotes the athlete and says what to do",
  /“Narnia”/.test(destinationSentence(matchDestination("Narnia")) ?? "") &&
    /ask your operator/i.test(destinationSentence(matchDestination("Narnia")) ?? ""),
);

console.log(`\n${passCount} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log(`  - ${f}`));
  if (proc) proc.exitCode = 1;
}
