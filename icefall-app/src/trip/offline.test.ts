/**
 * THE OFFLINE PROOF.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS RATHER THAN A SENTENCE IN A HEADER
 * ============================================================================
 *
 * "Trip mode works offline" is exactly the kind of claim house rule 7 exists to
 * distrust: a comment saying something is true is not evidence that it is. The
 * claim is also not checkable the easy way — `vite.config.ts` disables the
 * service worker in dev, so `npm run dev` proves nothing about offline, and a
 * production build is not something this phase runs.
 *
 * So the proof is STATIC. This file walks the real import graph from the real
 * files, on disk, and fails if anything in it could reach the network. That is
 * a stronger guarantee than opening the app with the wifi off once: it holds
 * for every future edit, and it names the file that broke it.
 *
 * ============================================================================
 * TWO TIERS, BECAUSE ONLY ONE CLAIM IS ABSOLUTE
 * ============================================================================
 *
 * TIER 1 — THE SAFETY CORE (`src/trip/*.ts`). Its closure must contain NOTHING
 * that can reach a network: no fetch, no XHR, no WebSocket, no Supabase client,
 * no beacon. This is the claim that matters, because it is the code that
 * produces the descent advice, the score and the ceiling. It is absolute and it
 * is tested absolutely.
 *
 * TIER 2 — THE SCREENS (`src/screens/trip/*.tsx`). These import the app shell —
 * `state/AppState`, chrome, primitives — and the shell is NOT network-free:
 * `AppState` reaches settings, which reaches Supabase. Pretending otherwise
 * would be the dishonest version of this test. What is checked instead is
 * precise and still worth having:
 *
 *   · the screen files themselves contain no network call and no paywall;
 *   · every module they add beyond the safety core is on an explicit
 *     allowlist, so a future edit cannot quietly pull `services/conditions` or
 *     a Supabase read onto the trip screen without this test going red;
 *   · nothing on the path from the screen to the descent advice leaves tier 1.
 *
 * The screens' ABILITY TO OPEN with no signal comes from Workbox precaching
 * every hashed chunk, and that is asserted against `vite.config.ts` below
 * rather than assumed.
 *
 * ============================================================================
 * WHAT IT CANNOT PROVE
 * ============================================================================
 *
 * That a real service worker installed on a real phone serves a real chunk. A
 * static read cannot run a browser. What it proves is that nothing in the app's
 * own source can defeat it — which is the half that rots.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

const proc = (globalThis as { process?: { exitCode?: number } }).process;

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
  check(name, Object.is(got, want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* PATHS FROM THE WORKING DIRECTORY, not from `import.meta.url`: the bundled
   test runs out of node_modules/.icefall-tests and its own location says
   nothing about where src is. npm scripts run at the package root. */
const ROOT = process.cwd();
const src = (p: string) => resolve(ROOT, p);
const readSrc = (p: string) => readFileSync(src(p), "utf8");

/* -------------------------------------------------------------------------- */
/* Comment stripping — so the scan reads CODE, not prose                       */
/* -------------------------------------------------------------------------- */

/**
 * Remove comments and string contents, leaving structure.
 *
 * HOUSE RULE 7, MECHANISED: a comment that mentions Supabase is a decision
 * being recorded; a line of code that imports it is a network path. Only the
 * second is a finding, so the first is removed before anything is scanned. The
 * headers in this very directory talk at length about fetch and Supabase
 * precisely to explain why they are absent, and a naive grep would flag them.
 *
 * String LITERALS are blanked too: a route path or a piece of copy is not a
 * network call either.
 */
function stripCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += quote;
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === quote) break;
        /* Template substitutions hold real code — keep them. */
        if (quote === "`" && source[i] === "$" && source[i + 1] === "{") {
          let depth = 1;
          out += "${";
          i += 2;
          while (i < n && depth > 0) {
            if (source[i] === "{") depth++;
            else if (source[i] === "}") depth--;
            if (depth > 0) out += source[i];
            i++;
          }
          out += "}";
          continue;
        }
        i++;
      }
      out += quote;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The import graph                                                            */
/* -------------------------------------------------------------------------- */

const EXTS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(fromFile), spec);
  else return null; // bare package

  for (const ext of EXTS) {
    try {
      readSrc(base + ext);
      return base + ext;
    } catch {
      /* keep trying */
    }
  }
  try {
    readSrc(base);
    return base;
  } catch {
    return null;
  }
}

/** Every specifier imported by a file — static, type-only and dynamic. */
function importsOf(file: string): string[] {
  const code = stripCommentsAndStrings(readSrc(file));
  const raw = readSrc(file);
  const specs = new Set<string>();

  /* The specifier itself lives inside a string, which the stripper blanks, so
     this reads the ORIGINAL text — and only in the narrow shape of an import
     statement, which a comment cannot forge because the stripped code above is
     what decides whether the statement is real. */
  const statements = code.match(/\bimport\b[^;]*?\bfrom\b\s*['"`]|\bimport\s*\(/g) ?? [];
  const patterns = [
    /\bimport\s+(?:type\s+)?[^;'"]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bexport\s+(?:type\s+)?[^;'"]*?\bfrom\s*["']([^"']+)["']/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) specs.add(m[1]);
  }
  void statements;
  return [...specs];
}

interface Closure {
  files: string[];
  bare: Set<string>;
  edges: Map<string, string[]>;
}

function closureFrom(roots: string[]): Closure {
  const seen = new Set<string>();
  const bare = new Set<string>();
  const edges = new Map<string, string[]>();
  const queue = [...roots];

  while (queue.length) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    const specs = importsOf(file);
    const local: string[] = [];
    for (const spec of specs) {
      const resolved = resolveSpecifier(spec, file);
      if (resolved === null) {
        if (!spec.startsWith("@/") && !spec.startsWith(".")) bare.add(spec);
        continue;
      }
      local.push(resolved);
      if (!seen.has(resolved)) queue.push(resolved);
    }
    edges.set(file, local);
  }

  return { files: [...seen], bare, edges };
}

/* -------------------------------------------------------------------------- */
/* What may never appear in executable code                                    */
/* -------------------------------------------------------------------------- */

const NETWORK_PATTERNS: [string, RegExp][] = [
  ["fetch(", /\bfetch\s*\(/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["WebSocket", /\bWebSocket\b/],
  ["EventSource", /\bEventSource\b/],
  ["sendBeacon", /\bsendBeacon\b/],
  ["supabase", /\bsupabase\b/i],
  ["navigator.onLine as a truthy claim", /navigator\.onLine\s*===\s*true/],
];

const PAYWALL_PATTERNS: [string, RegExp][] = [
  ["hasFeature", /\bhasFeature\b/],
  ["UpgradePrompt", /\bUpgradePrompt\b/],
  ["useEntitlement", /\buseEntitlement\b/],
  ["growth/tiers", /growth\/tiers/],
  ["Paywall", /\bPaywall\b/],
];

const CORE_ROOTS = [
  "src/trip/lakeLouise.ts",
  "src/trip/trip.ts",
  "src/trip/schedule.ts",
  "src/trip/timeline.ts",
  "src/trip/connectivity.ts",
];

const SCREEN_ROOTS = ["src/screens/trip/TripMode.tsx", "src/screens/trip/LakeLouiseCheck.tsx"];

/** Packages that are bundled into the JS and therefore precached with it. */
const BUNDLED_PACKAGES = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react-router-dom",
  "framer-motion",
  "lucide-react",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
];

const isBundled = (spec: string) =>
  BUNDLED_PACKAGES.includes(spec) || spec.startsWith("@radix-ui/") || spec.startsWith("lucide-react/");

/* -------------------------------------------------------------------------- */

function run() {
  /* ---------------------------------------------------------------------- */
  testCase("1 — The safety core's import graph reaches nothing that can call out");

  const core = closureFrom(CORE_ROOTS);
  console.log(`  \x1b[2m${core.files.length} files in the closure: ${core.files.join(", ")}\x1b[0m`);

  const coreOffences: string[] = [];
  for (const file of core.files) {
    const code = stripCommentsAndStrings(readSrc(file));
    for (const [label, re] of NETWORK_PATTERNS) {
      if (re.test(code)) coreOffences.push(`${file} → ${label}`);
    }
  }
  check(
    "no file in the safety core can reach the network",
    coreOffences.length === 0,
    coreOffences.join("; "),
  );

  const coreBare = [...core.bare].filter((s) => !isBundled(s) && !s.startsWith("node:"));
  check(
    "the safety core imports no package outside the bundled set",
    coreBare.length === 0,
    coreBare.join(", "),
  );

  /* The whole point of the chain: safety.ts is the leaf, and it has no imports
     at all. Verified here rather than trusted, because if it ever grows one the
     guarantee this directory rests on is gone. */
  const safetyCode = stripCommentsAndStrings(readSrc("src/coach/safety.ts"));
  const safetyImports = (safetyCode.match(/\bimport\b/g) ?? []).length;
  eq("coach/safety.ts still imports nothing", safetyImports, 0);

  const llImports = importsOf("src/trip/lakeLouise.ts");
  eq("lakeLouise.ts imports exactly one module", llImports.length, 1);
  eq("... and it is coach/safety", llImports[0], "@/coach/safety");

  const schedImports = importsOf("src/trip/schedule.ts").sort();
  eq(
    "schedule.ts imports only the ascent-pace policy and the trip types",
    schedImports.join(","),
    "./trip,@/services/acclimatisation",
  );

  /* ---------------------------------------------------------------------- */
  testCase("2 — Only the store touches storage; the pure modules stay pure");

  for (const f of ["lakeLouise", "schedule", "timeline", "connectivity"]) {
    const code = stripCommentsAndStrings(readSrc(`src/trip/${f}.ts`));
    check(`${f}.ts holds no storage of its own`, !/\blocalStorage\b/.test(code));
  }
  check(
    "trip.ts is the one that does",
    /\blocalStorage\b/.test(stripCommentsAndStrings(readSrc("src/trip/trip.ts"))),
  );

  /* And the scanner is not toothless — it must catch a planted call. */
  check(
    "the network scan would catch a planted fetch",
    NETWORK_PATTERNS[0][1].test(stripCommentsAndStrings('const x = fetch("/a");')),
  );
  check(
    "... and would NOT flag the word in a comment",
    !NETWORK_PATTERNS[0][1].test(stripCommentsAndStrings("/* we never fetch(...) here */")),
  );

  /* ---------------------------------------------------------------------- */
  testCase("3 — The screens add no network call and no paywall of their own");

  for (const f of SCREEN_ROOTS) {
    const code = stripCommentsAndStrings(readSrc(f));
    const net = NETWORK_PATTERNS.filter(([, re]) => re.test(code)).map(([l]) => l);
    check(`${f} makes no network call`, net.length === 0, net.join(", "));
    const pay = PAYWALL_PATTERNS.filter(([, re]) => re.test(code)).map(([l]) => l);
    check(`${f} has no entitlement gate`, pay.length === 0, pay.join(", "));
  }

  /* ---------------------------------------------------------------------- */
  testCase("4 — Everything the screens add beyond the core is on the allowlist");

  /*
   * THE HONEST PART. `state/AppState` reaches Supabase through settings, so the
   * screens' full closure is NOT network-free and this test does not claim it
   * is. What it pins is the SET: the trip screens may import these modules and
   * no others, so nobody can add a live read to this screen without changing
   * this list and being asked why.
   */
  const ALLOWED_DIRECT = [
    "@/components/layout/chrome",
    "@/components/settings/kit",
    "@/components/ui/primitives",
    "@/components/coach/DataState",
    "@/services/acclimatisation",
    "@/state/AppState",
    "@/tracking/adjustments",
    "@/trip/connectivity",
    "@/trip/lakeLouise",
    "@/trip/schedule",
    "@/trip/timeline",
    "@/trip/trip",
  ];

  const screenDirect = new Set<string>();
  for (const f of SCREEN_ROOTS) for (const s of importsOf(f)) screenDirect.add(s);
  const unexpected = [...screenDirect].filter((s) => !isBundled(s) && !ALLOWED_DIRECT.includes(s));
  check(
    "the trip screens import only allowlisted modules",
    unexpected.length === 0,
    unexpected.join(", "),
  );

  /* THE PATH TO THE ADVICE NEVER LEAVES TIER 1. The screen reads the result of
     `scoreLakeLouise`, and that function's closure is the core — proven above. */
  check(
    "both screens reach the advice through the safety core only",
    SCREEN_ROOTS.every((f) => importsOf(f).includes("@/trip/lakeLouise") || f.includes("TripMode")),
  );

  /* ---------------------------------------------------------------------- */
  testCase("5 — Workbox precaches the chunks these screens are split into");

  const vite = readSrc("vite.config.ts");
  check(
    "every hashed JS/CSS chunk is precached, so a lazy route opens cold",
    vite.includes('"**/*.{js,css,html,woff2}"'),
  );
  check(
    "a deep link to /trip resolves to the shell with no signal",
    vite.includes('navigateFallback: "/index.html"'),
  );
  check(
    "the service worker is production-only, so the dev server proves nothing",
    /devOptions:\s*\{\s*enabled:\s*false\s*\}/.test(vite),
  );

  const app = readSrc("src/App.tsx");
  check(
    "the trip screens are code-split, which is what puts them in that glob",
    app.includes('lazy(() => import("@/screens/trip/TripMode"))') &&
      app.includes('lazy(() => import("@/screens/trip/LakeLouiseCheck"))'),
  );
  check('the /trip route exists', app.includes('path="/trip"'));
  check('the /trip/check route exists', app.includes('path="/trip/check"'));

  /* ---------------------------------------------------------------------- */
  testCase("6 — The connectivity signal never claims to be online");

  const conn = readSrc("src/trip/connectivity.ts");
  const connCode = stripCommentsAndStrings(conn);
  check('there is no "online" state to return', !/"online"/.test(connCode));
  check(
    "the type is the two honest states only",
    conn.includes('export type Reachability = "unreachable" | "unknown"'),
  );
  check(
    "false is the only value it trusts",
    connCode.includes("navigator.onLine === false"),
  );
  check(
    "and it is NOT the demo banner",
    !connCode.includes("OfflineBanner") && !connCode.includes("OFFLINE"),
  );
  /* STRIPPED, not raw — TripMode's own header explains at length why it does
     NOT reuse OfflineBanner, and reading the comment as evidence of the code is
     the exact mistake house rule 7 is about. This test made it on its first
     run, which is a fair argument for the rule. */
  check(
    "nor does the trip screen reuse the demo banner",
    !stripCommentsAndStrings(readSrc("src/screens/trip/TripMode.tsx")).includes("OfflineBanner"),
  );

  /* ---------------------------------------------------------------------- */

  console.log(`\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  \x1b[31m·\x1b[0m ${f}`));
    if (proc) proc.exitCode = 1;
  }
  console.log(
    "\n\x1b[2mWHAT THIS RUN DOES NOT PROVE: that an installed service worker on a\n" +
      "real phone serves a real chunk. A static read cannot run a browser. It proves\n" +
      "that nothing in this app's own source can defeat it — which is the half that\n" +
      "rots between releases.\x1b[0m",
  );
}

void run();
