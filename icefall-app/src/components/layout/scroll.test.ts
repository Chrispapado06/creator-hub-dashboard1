/**
 * The app's scroll rules — the ones that decide whether a disclosure is on
 * screen when the screen opens.
 *
 * WHY THIS FILE EXISTS. On 4 September 2026 half the app opened already
 * scrolled past its own header. A guide's profile opened at scrollTop 1422 out
 * of 4024 at 375 × 667; Coach → Plan at 1205; a trek at 131; a mountain's
 * conditions at 115. Nothing was broken about any of those screens. One helper
 * in `chrome.tsx`, written to keep a clipped tab label reachable sideways,
 * used `scrollIntoView` — which scrolls every scrollable ancestor, vertical
 * axis included — so on the screens whose tab row sits below the fold the page
 * scrolled down to reveal the tab row and the athlete arrived halfway down.
 * What that hid on a guide's profile was the name, the "computer-generated face
 * of a person who does not exist" notice, the CLAIMED marker on the licence and
 * "ICEFALL has checked none of it". Nothing typechecked wrong. Nothing threw.
 * Two separate audit findings — "opens scrolled" and "Coach → Plan renders
 * blank" — were this one line.
 *
 * It follows `src/tracking/tracking.test.ts` and `src/services/conditions.test.ts`
 * exactly: a plain TypeScript program with a small harness, inside `src/` so
 * `npm run typecheck` checks it against the same types the app uses, bundled
 * and run on node by `npm test`. Nothing in the app imports it.
 *
 * WHAT IT CAN AND CANNOT PROVE. Part one drives the REAL geometry function the
 * strip now uses, so it proves the sideways placement arithmetic. Parts two,
 * three and four are SOURCE CHECKS, and they are here because the defect was
 * never an arithmetic error — it was a call that reached further than the
 * caller believed. No arithmetic test can catch `scrollIntoView` coming back,
 * because the damage happens in a browser's layout engine and there is no
 * browser here. So these read the shipping source and fail on the shape of the
 * old code. They do not prove the app scrolls correctly; the measurements above
 * were taken by driving the running app, and that is still the only thing that
 * can prove it.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { tabStripScrollLeft } from "./tabStripScroll";

/* -------------------------------------------------------------------------- */
/* Harness — the same thirty lines as the two suites beside it                 */
/* -------------------------------------------------------------------------- */

const proc = (globalThis as { process?: { exitCode?: number; cwd?: () => string } }).process;

let passCount = 0;
const failures: string[] = [];
let currentCase = "";

function testCase(title: string) {
  currentCase = title;
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failures.push(`${currentCase} — ${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const eq = (name: string, got: unknown, want: unknown) =>
  check(name, got === want, `got ${String(got)}, want ${String(want)}`);

/** Repo-relative read. `npm test` runs with the package directory as cwd. */
const root = proc?.cwd?.() ?? ".";
const read = (rel: string) => readFileSync(`${root}/${rel}`, "utf8");

/**
 * The file with its comments taken out.
 *
 * Needed, and the need is the point: the files below DESCRIBE the defect by
 * name, in prose, so that the next person to read them knows why the code is
 * shaped as it is. A plain substring search matched those descriptions and
 * reported the very files that document the fix as containing the bug. A source
 * check that cannot tell code from prose is a source check that fires on its
 * own explanation.
 *
 * Block comments first, then whole lines that are line comments or the
 * continuation of a block. Deliberately does not attempt to parse strings — no
 * file it is pointed at contains a `//` inside a string literal, and a real
 * tokenizer here would be a second thing to get wrong.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");
}

/** Every `.ts`/`.tsx` file under a directory, recursively. */
function sourcesUnder(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(`${root}/${dir}`)) {
      const next = `${dir}/${entry}`;
      if (statSync(`${root}/${next}`).isDirectory()) walk(next);
      else if (next.endsWith(".ts") || next.endsWith(".tsx")) out.push(next);
    }
  };
  walk(rel);
  return out;
}

/* -------------------------------------------------------------------------- */
/* 1 · The tab strip places its own tabs, sideways                             */
/* -------------------------------------------------------------------------- */

/**
 * Geometry taken from the real Explore strip at 375 px: six tabs that overflow,
 * a 335 px visible width inside the screen's 20 px side padding.
 */
function tabPlacement() {
  testCase("A selected tab is brought into the strip, sideways only");

  const strip = { scrollLeft: 0, clientWidth: 335 };

  eq(
    "a tab already fully visible does not move the strip",
    tabStripScrollLeft(strip, { offsetLeft: 40, offsetWidth: 80 }),
    null,
  );

  eq(
    "a tab flush with the right edge does not move the strip",
    tabStripScrollLeft(strip, { offsetLeft: 255, offsetWidth: 80 }),
    null,
  );

  // The sixth Explore tab, off the right edge. Nearest semantics bring its
  // right edge to the strip's right edge, not its left edge to the left.
  eq(
    "a tab off the right edge comes to the right edge",
    tabStripScrollLeft(strip, { offsetLeft: 400, offsetWidth: 90 }),
    400 + 90 - 335,
  );

  eq(
    "a tab off the left edge comes to the left edge",
    tabStripScrollLeft({ scrollLeft: 200, clientWidth: 335 }, { offsetLeft: 40, offsetWidth: 80 }),
    40,
  );

  // A label longer than the strip can satisfy one edge only. Reading starts at
  // the left, so the left edge is the one that carries which tab this is.
  eq(
    "a tab wider than the strip shows its start",
    tabStripScrollLeft({ scrollLeft: 0, clientWidth: 120 }, { offsetLeft: 300, offsetWidth: 200 }),
    300,
  );

  // Before layout everything measures zero. Treating that as "nothing fits"
  // would yank the strip to its first tab on the frame before it is laid out.
  eq(
    "an unmeasured strip is left alone",
    tabStripScrollLeft({ scrollLeft: 0, clientWidth: 0 }, { offsetLeft: 400, offsetWidth: 90 }),
    null,
  );

  // Not a style preference: an unconditional write to `scrollLeft` cancels a
  // momentum scroll still running under somebody's finger, so the resting case
  // has to be a non-write rather than a write of the same number.
  eq(
    "the resting case is a non-write, not a write of the current value",
    tabStripScrollLeft({ scrollLeft: 120, clientWidth: 335 }, { offsetLeft: 130, offsetWidth: 80 }),
    null,
  );

  // The whole point of the function: there is no vertical answer to give.
  const result = tabStripScrollLeft(strip, { offsetLeft: 400, offsetWidth: 90 });
  check(
    "the answer is a single horizontal number and carries no vertical part",
    typeof result === "number",
    `got ${typeof result}`,
  );
}

/* -------------------------------------------------------------------------- */
/* 2 · The tab strip may never scroll the page                                 */
/* -------------------------------------------------------------------------- */

/**
 * THE REGRESSION GUARD. This fails against the code as it stood on 4 Sep 2026.
 *
 * `scrollIntoView` cannot be used to place a tab, because it is not a request
 * to move one element — it is a request that every scrollable ancestor move
 * until the element is visible, and the ancestor here is the page.
 */
function stripNeverScrollsThePage() {
  testCase("The tab strip never scrolls the page");

  const chrome = codeOnly(read("src/components/layout/chrome.tsx"));
  const strip = codeOnly(read("src/components/layout/tabStripScroll.ts"));

  const calls = (src: string) => /\.scrollIntoView\s*\(/.test(src);

  check(
    "chrome.tsx does not call scrollIntoView",
    !calls(chrome),
    "a tab strip calling scrollIntoView scrolls the page it sits on",
  );
  check(
    "tabStripScroll.ts does not call scrollIntoView",
    !calls(strip),
    "same rule, in the file the strip delegates to",
  );
  check(
    "the strip helper never writes a vertical scroll offset",
    !/scrollTop\s*=/.test(strip.slice(0, strip.indexOf("scrollContentToTop"))),
    "the tab-placement half of the file has no business with scrollTop",
  );
  check(
    "chrome.tsx moves the strip with scrollLeft",
    /scrollLeft\s*=/.test(chrome),
    "the horizontal-only replacement is what should be there instead",
  );
}

/* -------------------------------------------------------------------------- */
/* 3 · window.scrollTo cannot work in this app                                 */
/* -------------------------------------------------------------------------- */

/**
 * ALSO FAILS AGAINST THE OLD CODE. `RouteDetail` and `TrailDetail` each called
 * `window.scrollTo({ top: 0 })` when a photograph was tapped, and neither had
 * ever moved anything: `PhoneShell` is a fixed-height frame with
 * `overflow-hidden`, so the document does not scroll — a `Screen`, or a
 * screen's own `overflow-y-auto` container, does. Two controls that compiled
 * perfectly and did nothing.
 */
function documentDoesNotScroll() {
  testCase("No screen tries to scroll the document");

  const offenders = sourcesUnder("src/screens")
    .filter((f) => /window\s*\.\s*scrollTo\s*\(/.test(codeOnly(read(f))))
    .map((f) => f.replace("src/screens/", ""));

  check(
    "no screen calls window.scrollTo",
    offenders.length === 0,
    offenders.length
      ? `${offenders.join(", ")} — the document never scrolls; use scrollContentToTop`
      : "checked " + sourcesUnder("src/screens").length + " files",
  );
}

/* -------------------------------------------------------------------------- */
/* 4 · A route change returns the screen to the top                            */
/* -------------------------------------------------------------------------- */

/**
 * What actually resets the scroll today is `key={pathname}` on the shell's
 * animated content: it remounts the screen, so the container that arrives is a
 * new element at offset zero. Measured, not assumed — scrolled to 600 on
 * /coach/progress, navigated to /coach/today, and the arriving container was a
 * different node at scrollTop 0.
 *
 * That makes one line in `App.tsx` load-bearing for something it does not
 * mention in its own name. Remove it for a different transition and a
 * navigation that keeps the same route element — one guide's profile to the
 * next — would hold the previous screen's offset, which on that page is the
 * offset that hides the disclosures.
 *
 * So: either the key is there, or `Screen` resets the scroll itself. This test
 * accepts either and fails if neither is true.
 */
function routeChangeReturnsToTheTop() {
  testCase("A route change returns the screen to the top");

  const app = codeOnly(read("src/App.tsx"));
  const chrome = codeOnly(read("src/components/layout/chrome.tsx"));

  const keyedOnPath = /<motion\.main[\s\S]{0,200}?key=\{pathname\}/.test(app);
  const screenResets = /scrollTop\s*=\s*0/.test(chrome);

  check(
    "the shell remounts screens on a path change, or Screen resets its own scroll",
    keyedOnPath || screenResets,
    keyedOnPath
      ? "App.tsx keys the animated content on pathname"
      : "chrome.tsx resets Screen's scrollTop",
  );
}

/* -------------------------------------------------------------------------- */

function main() {
  console.log("\x1b[1mICEFALL — scroll rules\x1b[0m");

  tabPlacement();
  stripNeverScrollsThePage();
  documentDoesNotScroll();
  routeChangeReturnsToTheTop();

  console.log(`\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m`);
  if (failures.length) {
    console.log("\n\x1b[31mFailures\x1b[0m");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }

  console.log(
    "\n\x1b[2mWHAT THIS RUN DOES NOT PROVE: that any screen actually opens at the top.\n" +
      "There is no browser here and no layout engine, so nothing below measures a\n" +
      "real scrollTop. The numbers quoted in this file were taken by driving the\n" +
      "running app at 375 x 667 and at 430 x 932; a change to the layout that\n" +
      "re-hides a disclosure needs that done again.\x1b[0m",
  );
}

main();

export {};
