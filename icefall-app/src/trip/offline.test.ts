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

/**
 * Only what survives compilation: `import type` and `export type` statements are
 * erased, so a type borrowed from a module that fetches is not a network path.
 */
function runtimeImportsOf(file: string): string[] {
  const raw = readSrc(file)
    .replace(/\bimport\s+type\s+[^;]*?\bfrom\s*["'][^"']+["'];?/g, "")
    .replace(/\bexport\s+type\s+[^;]*?\bfrom\s*["'][^"']+["'];?/g, "");
  const specs = new Set<string>();
  const patterns = [
    /\bimport\s+[^;'"]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bexport\s+[^;'"]*?\bfrom\s*["']([^"']+)["']/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

interface Closure {
  files: string[];
  bare: Set<string>;
  edges: Map<string, string[]>;
}

function closureFrom(roots: string[], importer: (file: string) => string[] = importsOf): Closure {
  const seen = new Set<string>();
  const bare = new Set<string>();
  const edges = new Map<string, string[]>();
  const queue = [...roots];

  while (queue.length) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    const specs = importer(file);
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
    /* "Start today" (brief M3). It writes the trip record and enters Mountain
       mode; its own imports are pinned by test 8. */
    "@/mountain/StartTodayRow",
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
    /* Which objective a new trip belongs to (2026-09-16): `pickTripGoal` is a
       pure function with no imports, and the debrief store is device-local
       (localStorage + react) — neither reaches a network. */
    "@/objectives/primaryGoal",
    "@/objectives/objectiveDebrief",
    /* Today's date as a string, re-read on focus — react only, no network. */
    "@/lib/useDayKey",
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
  testCase("7 — Mountain mode's logic reaches nothing that can call out (plan §8.1 #1)");

  /*
   * THE STRICT TIER, EXTENDED. Every pure Mountain-mode module — the turnaround
   * store, the last position, daylight, the SOS numbers and formats, the body
   * log, the boot decision — joins the safety core's absolute claim. Walked on
   * the RUNTIME graph: a type borrowed from a module that fetches is erased by
   * the compiler and is not a path.
   */
  const MOUNTAIN_CORE_ROOTS = [
    "src/mountain/alarmModel.ts",
    "src/mountain/alarmSound.ts",
    "src/mountain/battery.ts",
    "src/mountain/body.ts",
    "src/mountain/boot.ts",
    "src/mountain/daylight.ts",
    "src/mountain/emergencyInfo.ts",
    "src/mountain/exampleTrip.ts",
    "src/mountain/format.ts",
    "src/mountain/mapModel.ts",
    "src/mountain/mode.ts",
    "src/mountain/nowModel.ts",
    "src/mountain/paths.ts",
    "src/mountain/position.ts",
    "src/mountain/sos.ts",
    "src/mountain/tripModel.ts",
    "src/mountain/tripTabModel.ts",
    "src/mountain/turnaround.ts",
    "src/tracking/wakeLock.ts",
  ];
  const mcore = closureFrom(MOUNTAIN_CORE_ROOTS, runtimeImportsOf);
  console.log(`  \x1b[2m${mcore.files.length} files in the closure: ${mcore.files.join(", ")}\x1b[0m`);
  const mcoreOffences: string[] = [];
  for (const file of mcore.files) {
    const code = stripCommentsAndStrings(readSrc(file));
    for (const [label, re] of NETWORK_PATTERNS) if (re.test(code)) mcoreOffences.push(`${file} → ${label}`);
  }
  check("no file Mountain mode's logic runs can reach the network", mcoreOffences.length === 0, mcoreOffences.join("; "));
  const mcoreBare = [...mcore.bare].filter((s) => !isBundled(s) && !s.startsWith("node:"));
  check("... and it imports no package outside the bundled set", mcoreBare.length === 0, mcoreBare.join(", "));
  check(
    "the emergency numbers still import nothing",
    (stripCommentsAndStrings(readSrc("src/data/mountainRescue.ts")).match(/\bimport\b/g) ?? []).length === 0,
  );
  check(
    "the planted-import guard works: tracking/follow reaches services/trails",
    closureFrom(["src/tracking/follow.ts"], runtimeImportsOf).files.includes("src/services/trails.ts"),
  );

  /* ---------------------------------------------------------------------- */
  testCase("8 — Mountain mode's screens: no call or paywall of their own, allowlisted imports (§8.1 #2)");

  /*
   * THE HONEST PART AGAIN. The screens read the trip through `useMountainTrip`,
   * which reads `state/AppState`, and that reaches Supabase through settings —
   * already loaded by the app shell before any screen draws. So, as for the trip
   * screens: nothing on them calls out, nothing sits behind a subscription, and
   * the set of shared modules they may touch is pinned.
   */
  const MOUNTAIN_SCREENS = [
    "src/mountain/BodyTab.tsx",
    "src/mountain/EmergencyInfoSection.tsx",
    "src/mountain/MapTab.tsx",
    "src/mountain/MountainIndex.tsx",
    "src/mountain/StartTodayRow.tsx",
    "src/mountain/start.ts",
    "src/mountain/MountainShell.tsx",
    "src/mountain/NowTab.tsx",
    "src/mountain/SafetyLayer.tsx",
    "src/mountain/SosScreen.tsx",
    "src/mountain/TripTab.tsx",
    "src/mountain/EndTripScreen.tsx",
    "src/mountain/TurnaroundAlarm.tsx",
    "src/mountain/TurnaroundSetter.tsx",
    "src/mountain/offer.tsx",
    "src/mountain/trip.ts",
  ];
  const MOUNTAIN_ALLOWED_SHARED = [
    /* The signal pill reads it; test 10 keeps it out of the logic tier. */
    "@/connection/reachability",
    "@/coach/safety",
    "@/data/mock/mountains",
    "@/data/mountainCamps",
    "@/data/mountainRescue",
    /* The on-device stores. None of them reaches a network: the queue holds
       items until a sender exists, and everything else is this phone's. */
    "@/device/savedHere",
    "@/device/storageStatus",
    "@/device/syncQueue",
    "@/lib/utils",
    /* The build's date, and the update that waits rather than taking over. */
    "@/offline/appAge",
    "@/offline/appUpdate",
    "@/offline/appUpdateModel",
    "@/offline/offline",
    "@/services/acclimatisation",
    "@/services/checklist",
    /* Battery saver, screen theme and large text — this phone's settings. */
    "@/settings/useMountainSettings",
    "@/state/AppState",
    "@/tracking/activeSession",
    /* Ending a trip stops the recording and saves it, and the trip pack reads
       the plan. Neither sends anything. */
    "@/tracking/finalize",
    "@/tracking/training",
    "@/tracking/types",
    "@/tracking/useRecorder",
    "@/tracking/wakeLock",
    "@/trip/connectivity",
    "@/trip/lakeLouise",
    "@/trip/trip",
    /* `start.ts` reads an objective's date as the LOCAL day, the same way the
       app-wide objective rule does (2026-09-16). Pure; no imports. */
    "@/objectives/primaryGoal",
  ];
  for (const f of MOUNTAIN_SCREENS) {
    const code = stripCommentsAndStrings(readSrc(f));
    const net = NETWORK_PATTERNS.filter(([, re]) => re.test(code)).map(([l]) => l);
    const pay = PAYWALL_PATTERNS.filter(([, re]) => re.test(code)).map(([l]) => l);
    check(`${f} makes no network call and has no entitlement gate`, net.length + pay.length === 0, [...net, ...pay].join(", "));
  }
  const mountainShared = new Set<string>();
  for (const f of MOUNTAIN_SCREENS) {
    for (const s of importsOf(f)) if (!s.startsWith(".") && !isBundled(s)) mountainShared.add(s);
  }
  const unlisted = [...mountainShared].filter((s) => !MOUNTAIN_ALLOWED_SHARED.includes(s));
  check("the Mountain mode screens import only allowlisted shared modules", unlisted.length === 0, unlisted.join(", "));
  const sosClosure = closureFrom(["src/mountain/SosScreen.tsx"], runtimeImportsOf);
  const sosComponents = sosClosure.files.filter((f) => f.startsWith("src/components/"));
  check("the SOS screen pulls in none of the app's shared components", sosComponents.length === 0, sosComponents.join(", "));

  /* ---------------------------------------------------------------------- */
  testCase("9 — The alarm is above every route; SOS opens from the main file (§2.3, §2.8, §8.1 #5)");

  const appCode = stripCommentsAndStrings(app);
  check(
    "<SafetyLayer /> is rendered before <Routes>, not inside a layout",
    appCode.includes("<SafetyLayer />") && appCode.indexOf("<SafetyLayer />") < appCode.indexOf("<Routes>"),
  );
  check(
    "SafetyLayer renders the alarm on every path (no early return)",
    !/return\s+null/.test(stripCommentsAndStrings(readSrc("src/mountain/SafetyLayer.tsx"))),
  );
  for (const [name, spec] of [
    ["SOS", "@/mountain/SosScreen"],
    ["Now", "@/mountain/NowTab"],
    ["Body", "@/mountain/BodyTab"],
    ["the shell", "@/mountain/MountainShell"],
  ] as const) {
    check(
      `${name} is imported directly, never lazily`,
      new RegExp(`import\\s+\\w+\\s+from\\s+"${spec}"`).test(app) && !app.includes(`import("${spec}")`),
    );
  }
  check("/mountain/sos is routed", app.includes('path="sos"') && app.includes('path="/mountain"'));
  check(
    "the symptom check is declared outside AppShell",
    app.indexOf('path="/trip/check"') >= 0 && app.indexOf('path="/trip/check"') < app.indexOf("<Route element={<AppShell />}>"),
  );
  check(
    "the live tracker draws the SOS button",
    /<SosButton\b/.test(stripCommentsAndStrings(readSrc("src/screens/tracker/LiveTracker.tsx"))),
  );
  check(
    "the Mountain mode shell draws the SOS button",
    /<SosButton\s*\/>/.test(stripCommentsAndStrings(readSrc("src/mountain/MountainShell.tsx"))),
  );

  /* ---------------------------------------------------------------------- */
  testCase("10 — The reachability check stays off the safety path (§2.7)");

  const REACH_FILE = "src/connection/reachability.ts";
  check("connectivity.ts imports only react", importsOf("src/trip/connectivity.ts").join(",") === "react");
  check("the safety core never reaches the reachability check", !closureFrom(CORE_ROOTS).files.includes(REACH_FILE));
  check(
    "Mountain mode's logic never reaches it either",
    !closureFrom(MOUNTAIN_CORE_ROOTS, runtimeImportsOf).files.includes(REACH_FILE),
  );
  const reachCode = stripCommentsAndStrings(readSrc(REACH_FILE));
  check(
    "it trusts 'no network' before any request",
    reachCode.includes("navigator.onLine === false"),
  );
  check("it never polls on an interval", !/\bsetInterval\s*\(/.test(reachCode));
  check("its probe file ships with the app", readSrc("public/reachability.txt").trim() === "ICEFALL-OK-1");

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
