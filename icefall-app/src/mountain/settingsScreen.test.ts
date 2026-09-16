/**
 * The Mountain settings screen's copy, and the check that matters more: that
 * the glare and dark blocks really do cover EVERY Mountain screen, not just the
 * ones that existed when they were written. Run from the repo root.
 */

import { readFileSync, readdirSync } from "node:fs";

import {
  BATTERY_SAVER_TRADEOFF,
  LARGE_TEXT_TRADEOFF,
  NOT_KEPT_SENTENCE,
  RESOLVED_THEME_LABEL,
  THEME_OPTIONS,
  themeNowSentence,
} from "./settingsModel";

const proc = typeof process !== "undefined" ? process : undefined;
let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function ok(v: unknown, msg: string) {
  if (!v) throw new Error(msg);
}
function eq<T>(a: T, b: T, msg = "") {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

/* ---- Copy ---------------------------------------------------------------- */

test("battery saver states its trade-off in one short line", () => {
  eq(BATTERY_SAVER_TRADEOFF, "GPS updates less often while you move.");
  ok(BATTERY_SAVER_TRADEOFF.split(" ").length <= 10, "one line");
});

test("three theme choices, each with a note, glare named for what it is for", () => {
  eq(
    THEME_OPTIONS.map((o) => o.value),
    ["auto", "dark", "glare"],
  );
  for (const o of THEME_OPTIONS) ok(o.note.length > 0 && o.note.endsWith("."), `${o.value} note`);
  ok(/snow|sun/i.test(THEME_OPTIONS[2].note), "glare says what it is for");
});

test("only Auto says what is on the screen now", () => {
  eq(themeNowSentence("auto", "glare"), "Showing glare now.");
  eq(themeNowSentence("auto", "dark"), "Showing dark now.");
  eq(themeNowSentence("dark", "dark"), null);
  eq(themeNowSentence("glare", "glare"), null);
  eq(Object.keys(RESOLVED_THEME_LABEL).sort(), ["dark", "glare"]);
});

test("a refused save is admitted, and says the change still applies", () => {
  ok(/would not save/i.test(NOT_KEPT_SENTENCE), "says it was not saved");
  ok(/stays until/i.test(NOT_KEPT_SENTENCE), "says it still applies");
  ok(LARGE_TEXT_TRADEOFF.length > 0, "large text has a trade-off line");
});

/* ---- Theme coverage across every Mountain screen ------------------------- */

const indexCss = readFileSync("src/index.css", "utf8");
const mountainCss = readFileSync("src/mountain/mountainTheme.css", "utf8");
const screens = readdirSync("src/mountain")
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => ({ f, src: readFileSync(`src/mountain/${f}`, "utf8") }));

function themeBlock(selector: string): Set<string> {
  const open = mountainCss.indexOf("{", mountainCss.indexOf(selector));
  const body = mountainCss.slice(open + 1, mountainCss.indexOf("}", open));
  return new Set([...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}
const dark = themeBlock('html:root[data-mountain-theme="dark"]');
const glare = themeBlock('html:root[data-mountain-theme="glare"]');

/** `@theme inline` maps a Tailwind colour class to an --ice token at runtime. */
const colourClassToToken = new Map<string, string>();
for (const [, name, ref] of indexCss.matchAll(/--color-([a-z0-9-]+):\s*var\((--ice-[a-z0-9-]+)\)/g))
  colourClassToToken.set(name, ref);

test("the @theme map was found", () => {
  ok(colourClassToToken.size > 15, `mapped ${colourClassToToken.size} colour classes`);
  ok(screens.length > 5, `${screens.length} Mountain screens`);
});

test("every colour class used by a Mountain screen is set by BOTH themes", () => {
  const used = new Map<string, string[]>();
  for (const { f, src } of screens)
    for (const [, , name] of src.matchAll(
      /\b(bg|text|border|from|to|via|ring|fill|stroke|divide|outline|shadow|placeholder|caret|accent|decoration)-([a-z][a-z0-9-]*)/g,
    )) {
      const token = name === "white" ? "--color-white" : colourClassToToken.get(name);
      if (!token) continue; // border-t, text-center and the like
      used.set(token, [...(used.get(token) ?? []), f]);
    }
  ok(used.size > 8, `${used.size} colour tokens in use`);
  for (const [token, files] of used) {
    ok(dark.has(token), `dark does not set ${token} (used in ${files[0]})`);
    ok(glare.has(token), `glare does not set ${token} (used in ${files[0]})`);
  }
});

test("no Mountain screen sits on a dark island, which would ignore glare", () => {
  // index.css keeps the dark palette inside .on-dark / .scrim-* subtrees,
  // whatever the theme. A Mountain screen using one would stay dark in glare.
  for (const { f, src } of screens)
    for (const cls of ["on-dark", "scrim-bottom", "scrim-full"])
      ok(!new RegExp(`["' ]${cls}[ "']`).test(src), `${f} uses .${cls}`);
});

test("glare restates the literal colours index.css keys on the app's theme", () => {
  ok(/data-mountain-theme="glare"\] ::selection/.test(mountainCss), "glare selection");
  ok(/data-mountain-theme="dark"\] ::selection/.test(mountainCss), "dark selection");
});

test("large text reaches the 10px section label too", () => {
  ok(
    /data-mountain-text\] \.section-label\s*\{[^}]*--mountain-text-scale/.test(mountainCss),
    "section-label scales",
  );
});

/* ---- The screen itself --------------------------------------------------- */

const screen = readFileSync("src/mountain/SettingsScreen.tsx", "utf8");

test("every control on the settings screen is glove-sized and reports its state", () => {
  // Not a regex to the first ">": an arrow function in a handler holds one.
  const controls = screen.split("<button").slice(1).map((c) => c.split("</button>")[0]);
  ok(controls.length >= 2, `${controls.length} controls`);
  for (const c of controls) {
    ok(/min-h-16|CONTROL/.test(c), "64px tap target");
    ok(/aria-checked/.test(c), "state read out");
  }
  ok(!/navigator\.onLine|fetch\(|localStorage/.test(screen), "no network, no storage of its own");
});

console.log(`mountain/settingsScreen: ${pass} passed, ${fail} failed`);
if (fail && proc) proc.exitCode = 1;
