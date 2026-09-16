/**
 * The signal decisions (brief M2): what the pill says, when the sync runner may
 * run, and when losing signal moves the athlete into Mountain mode.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  confirmedOnline,
  decideAutoSwitch,
  headerPillLabel,
  isTypingIn,
  signalPillLabel,
  type AutoSwitchInput,
  type HeaderPillInput,
  type PillInput,
} from "./signal";

let pass = 0;
const failures: string[] = [];

function eq(name: string, got: unknown, want: unknown) {
  if (Object.is(got, want)) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failures.push(`${name}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name} — got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  }
}

const NOW = 1_700_000_000_000;
const MIN = 60_000;

function pill(over: Partial<PillInput> = {}, reach: Partial<PillInput["reach"]> = {}): string {
  return signalPillLabel({
    noSignal: false,
    reach: { state: "not-checked", checking: false, lastReachableAt: null, ...reach },
    synced: 0,
    syncedAt: null,
    waiting: 0,
    now: NOW,
    ...over,
  });
}

console.log("\n\x1b[1m1 — The signal pill\x1b[0m");

eq("nothing checked yet says so", pill(), "Signal not checked");
eq("mid-check", pill({}, { checking: true }), "Checking signal");
eq(
  "the phone reports no network",
  pill({ noSignal: true }, { state: "offline" }),
  "No signal",
);
eq(
  "connected to something with nothing behind it is still No signal",
  pill({}, { state: "nothing-reachable" }),
  "No signal",
);
eq(
  "... and it says when we last reached anything",
  pill({}, { state: "nothing-reachable", lastReachableAt: NOW - 14 * MIN }),
  "No signal · last reachable 14 min ago",
);
eq(
  "the review flag (no signal, nothing checked) never reads as a network",
  pill({ noSignal: true }),
  "No signal",
);
eq(
  "a confirmed connection",
  pill({}, { state: "reachable", lastReachableAt: NOW - 10_000 }),
  "Signal",
);
eq(
  "... with what the last run sent",
  pill({ synced: 3, syncedAt: NOW - 20_000 }, { state: "reachable", lastReachableAt: NOW - 20_000 }),
  "Signal · synced 3 items",
);
eq(
  "... one item is not 1 items",
  pill({ synced: 1, syncedAt: NOW - 1_000 }, { state: "reachable", lastReachableAt: NOW - 1_000 }),
  "Signal · synced 1 item",
);
eq(
  "the synced line does not stay up all day",
  pill({ synced: 3, syncedAt: NOW - 30 * MIN }, { state: "reachable", lastReachableAt: NOW - 20_000 }),
  "Signal",
);
eq(
  "things still waiting are counted, with a signal",
  pill({ waiting: 3 }, { state: "reachable", lastReachableAt: NOW - 20_000 }),
  "Signal · 3 waiting to sync",
);
eq(
  "... and without one, where the count matters more than the age",
  pill({ waiting: 3 }, { state: "nothing-reachable", lastReachableAt: NOW - 14 * MIN }),
  "No signal · 3 waiting to sync",
);
eq(
  "what the last run sent beats what is still waiting",
  pill({ synced: 2, syncedAt: NOW - 5_000, waiting: 1 }, { state: "reachable", lastReachableAt: NOW - 5_000 }),
  "Signal · synced 2 items",
);
eq(
  "an old success never reads as Signal",
  pill({}, { state: "reachable", lastReachableAt: NOW - 14 * MIN }),
  "Last reachable 14 min ago",
);
eq(
  "the safety module's no-network answer overrules a stale success",
  pill({ noSignal: true }, { state: "reachable", lastReachableAt: NOW - 14 * MIN }),
  "No signal · last reachable 14 min ago",
);
eq(
  "a build that never checks says so, and still counts what is waiting",
  pill({ waiting: 2 }, { state: "disabled" }),
  "2 waiting to sync",
);

console.log("\n\x1b[1m1b — The shell header's two-part pill\x1b[0m");

function header(over: Partial<HeaderPillInput> = {}, reach: Partial<HeaderPillInput["reach"]> = {}): string {
  return headerPillLabel({
    noSignal: false,
    reach: { state: "not-checked", checking: false, ...reach },
    waiting: 0,
    ...over,
  });
}

eq(
  "the mockup's own line, when both halves are true",
  header({ noSignal: true }, { state: "offline" }),
  "No signal · All saved",
);
eq(
  "it never claims everything is saved while items are queued",
  header({ noSignal: true, waiting: 3 }, { state: "offline" }),
  "No signal · 3 to sync",
);
eq(
  "only a confirmed check may say Signal",
  header({}, { state: "reachable" }),
  "Signal · All saved",
);
eq("connected to nothing is still no signal", header({}, { state: "nothing-reachable" }), "No signal · All saved");
eq("mid-check says so rather than guessing", header({}, { checking: true }), "Checking · All saved");
eq("nothing checked yet is not 'Signal'", header(), "Not checked · All saved");

console.log("\n\x1b[1m2 — When the sync runner may run\x1b[0m");

eq("not before anything is checked", confirmedOnline({ state: "not-checked" }, false), false);
eq("not on the phone's own flag", confirmedOnline({ state: "offline" }, false), false);
eq("not when nothing answered", confirmedOnline({ state: "nothing-reachable" }, false), false);
eq("only on a confirmed connection", confirmedOnline({ state: "reachable" }, false), true);
eq("... and never against the safety module", confirmedOnline({ state: "reachable" }, true), false);

console.log("\n\x1b[1m3 — The mid-session switch\x1b[0m");

function auto(over: Partial<AutoSwitchInput> = {}) {
  return decideAutoSwitch({
    reach: "nothing-reachable",
    inMountainMode: false,
    alreadySwitched: false,
    tripRunningToday: true,
    typing: false,
    pathname: "/home",
    ...over,
  });
}

eq("a trip is running and the check confirmed nothing is reachable", auto(), "switch");
eq("the phone's own no-network flag counts too", auto({ reach: "offline" }), "switch");
eq("an unchecked connection moves nobody", auto({ reach: "not-checked" }), "no");
eq("a working connection moves nobody", auto({ reach: "reachable" }), "no");
eq("a build that never checks moves nobody", auto({ reach: "disabled" }), "no");
eq("no trip today: the offer row handles it, not a switch", auto({ tripRunningToday: false }), "no");
eq("already in Mountain mode", auto({ inMountainMode: true }), "no");
eq("... including by path, before the flag is read", auto({ pathname: "/mountain/body" }), "no");
eq("the objective command centre is not Mountain mode", auto({ pathname: "/mountain/goal-mont-blanc" }), "switch");
eq("once a session: leaving and being dragged back is an argument", auto({ alreadySwitched: true }), "no");
eq("never mid-word", auto({ typing: true }), "wait-typing");
eq("... and typing outranks the screen it would wait for", auto({ typing: true, pathname: "/activity/live/hike" }), "wait-typing");
eq("not off the live tracker, which holds the stop control", auto({ pathname: "/activity/live/hike" }), "wait-screen");
eq("the waits only ever happen when everything else says switch", auto({ typing: true, tripRunningToday: false }), "no");

console.log("\n\x1b[1m4 — What counts as typing\x1b[0m");

eq("nothing focused", isTypingIn(null), false);
eq("a text field", isTypingIn({ tagName: "INPUT" }), true);
eq("a text field, lower case tag", isTypingIn({ tagName: "input", type: "search" }), true);
eq("a number field", isTypingIn({ tagName: "INPUT", type: "number" }), true);
eq("a read-only field is not being typed in", isTypingIn({ tagName: "INPUT", readOnly: true }), false);
eq("a tick-box is not typing", isTypingIn({ tagName: "INPUT", type: "checkbox" }), false);
eq("nor is a submit button", isTypingIn({ tagName: "INPUT", type: "submit" }), false);
eq("a textarea", isTypingIn({ tagName: "TEXTAREA" }), true);
eq("an open picker", isTypingIn({ tagName: "SELECT" }), true);
eq("a rich-text area", isTypingIn({ tagName: "DIV", isContentEditable: true }), true);
eq("a plain button", isTypingIn({ tagName: "BUTTON" }), false);

/* -------------------------------------------------------------------------- */
/* 5 — The two rules that are an ABSENCE of code, so only a scan can hold them */
/* -------------------------------------------------------------------------- */

console.log("\n\x1b[1m5 — Rules the wiring must keep\x1b[0m");

/* Paths from the working directory: the bundled test runs out of
   node_modules/.icefall-tests and its own location says nothing about src. */
const readSrc = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/* Code only, so a rule named in a comment cannot pass for the rule being kept.
   Neither file puts "//" or "/*" inside a string, so this is enough here. */
const code = (p: string) =>
  readSrc(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const wiring = code("src/mountain/useSignal.ts");
const shell = code("src/mountain/MountainShell.tsx");

eq("regaining signal never leaves Mountain mode: nothing on the signal path exits it",
  wiring.includes("leaveMountainMode"), false);
/* The signal row is the one part of the shell that reacts to the connection,
   so it is the one part that could exit on a returning signal. */
const topBar = /function TopBar[\s\S]*?\n}\n/.exec(shell)?.[0] ?? null;
eq("the signal row was found to scan", topBar !== null, true);
eq("... and it never exits Mountain mode", topBar?.includes("leaveMountainMode") ?? true, false);
eq("the pill never trusts navigator.onLine", wiring.includes("navigator.onLine"), false);
eq("the switch never trusts navigator.onLine", code("src/mountain/signal.ts").includes("navigator"), false);
eq("the pill runs the sync queue when the check confirms a connection",
  wiring.includes("useSyncQueue({ confirmedOnline"), true);

console.log(`\n\x1b[1m${pass} passed, ${failures.length} failed\x1b[0m`);
if (failures.length) {
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
