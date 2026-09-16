/**
 * Mountain mode settings: battery saver rules (plan §6.2), theme resolution,
 * persistence, the <html> attributes, and the token CSS (coverage + contrast).
 *
 * Run: esbuild src/settings/mountain.test.ts --bundle --platform=node --format=esm
 *      --define:import.meta.env={} --alias:@=./src --outfile=... && node ...
 */

import { readFileSync } from "node:fs";

import {
  DEFAULT_MOUNTAIN_SETTINGS,
  DEFAULT_RUNTIME,
  MOUNTAIN_SETTINGS_KEY,
  MOUNTAIN_THEME_COLOR,
  SAVER_NO_SIGNAL_SENTENCE,
  SAVER_RECORDING_SENTENCE,
  __resetMountainSettingsForTests,
  currentMountainRuntime,
  currentMountainSettings,
  gpsOptions,
  mountainAttributes,
  notifyMountainEnvironmentChanged,
  parseMountainSettings,
  patchMountainSettings,
  reloadMountainSettingsFromStorage,
  resolveBatterySaver,
  resolveMountainTheme,
  setMountainRuntime,
  subscribeMountainSettings,
} from "./mountain";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}\n  ${(e as Error).message}`);
  }
}
function eq<T>(a: T, b: T, msg = "") {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg} expected ${sb}, got ${sa}`);
}
function ok(v: unknown, msg: string) {
  if (!v) throw new Error(msg);
}

class MemoryStorage {
  map = new Map<string, string>();
  broken = false;
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.broken) throw new Error("QuotaExceededError");
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
const storage = new MemoryStorage();
(globalThis as { localStorage?: unknown }).localStorage = storage;

const rt = (p: Partial<typeof DEFAULT_RUNTIME> = {}) => ({ ...DEFAULT_RUNTIME, ...p });

/* ---- battery saver ------------------------------------------------------ */

test("battery saver is on by default", () => {
  eq(DEFAULT_MOUNTAIN_SETTINGS.batterySaver, true);
  const s = resolveBatterySaver(true, rt());
  eq([s.gps, s.screen, s.pauseBackgroundRefresh], [true, true, true]);
});

test("off during a recording, whatever the setting", () => {
  const s = resolveBatterySaver(true, rt({ recording: true }));
  eq([s.gps, s.screen, s.pauseBackgroundRefresh], [false, false, false]);
  eq(s.status, SAVER_RECORDING_SENTENCE);
  eq(s.enabled, true, "the setting itself is kept");
});

test("never lowers GPS with no signal, and says why", () => {
  const s = resolveBatterySaver(true, rt({ noSignal: true }));
  eq(s.gps, false);
  eq(s.status, SAVER_NO_SIGNAL_SENTENCE);
  eq(gpsOptions(s).enableHighAccuracy, true);
});

test("never lowers GPS on the SOS screen", () => {
  const s = resolveBatterySaver(true, rt({ onSos: true }));
  eq(s.gps, false);
  eq(gpsOptions(s), { enableHighAccuracy: true, maximumAge: 0, timeout: 60_000 });
});

test("no signal does not switch battery saver on when it is off", () => {
  const s = resolveBatterySaver(false, rt({ noSignal: true }));
  eq([s.gps, s.screen, s.pauseBackgroundRefresh], [false, false, false]);
});

test("GPS options with saver active drop high accuracy only", () => {
  const o = gpsOptions({ gps: true });
  eq(o.enableHighAccuracy, false);
  ok((o.maximumAge ?? 0) > 0, "accepts an older fix");
});

/* ---- theme ------------------------------------------------------------- */

test("explicit theme always wins", () => {
  eq(resolveMountainTheme("glare", true, "dark"), "glare");
  eq(resolveMountainTheme("dark", false, "light"), "dark");
});

test("auto: dark under battery saver, otherwise app light maps to glare", () => {
  eq(resolveMountainTheme("auto", true, "light"), "dark");
  eq(resolveMountainTheme("auto", false, "light"), "glare");
  eq(resolveMountainTheme("auto", false, "dark"), "dark");
});

test("attributes: motion reduced by phone preference or saver; text scale", () => {
  const off = { ...DEFAULT_MOUNTAIN_SETTINGS, batterySaver: false, largeText: true };
  eq(mountainAttributes(off, rt(), { appTheme: "dark", prefersReducedMotion: false }), {
    "data-mountain-theme": "dark",
    "data-mountain-motion": "full",
    "data-mountain-text": "large",
  });
  eq(
    mountainAttributes(off, rt(), { appTheme: "dark", prefersReducedMotion: true })["data-mountain-motion"],
    "reduced",
  );
  eq(
    mountainAttributes(DEFAULT_MOUNTAIN_SETTINGS, rt(), { appTheme: "light", prefersReducedMotion: false }),
    { "data-mountain-theme": "dark", "data-mountain-motion": "reduced", "data-mountain-text": "normal" },
  );
});

/* ---- persistence -------------------------------------------------------- */

test("parse survives junk and unknown values", () => {
  eq(parseMountainSettings(null), DEFAULT_MOUNTAIN_SETTINGS);
  eq(parseMountainSettings("{not json"), DEFAULT_MOUNTAIN_SETTINGS);
  eq(parseMountainSettings('{"batterySaver":"yes","theme":"pink","largeText":1}'), DEFAULT_MOUNTAIN_SETTINGS);
  eq(parseMountainSettings('{"batterySaver":false,"theme":"glare","largeText":true}'), {
    batterySaver: false,
    theme: "glare",
    largeText: true,
  });
});

test("patch persists under its own icefall. key and notifies", () => {
  __resetMountainSettingsForTests();
  ok(MOUNTAIN_SETTINGS_KEY.startsWith("icefall."), "Erase all data clears the icefall. prefix");
  let calls = 0;
  const off = subscribeMountainSettings(() => calls++);
  eq(patchMountainSettings({ theme: "glare" }), true);
  eq(calls, 1);
  eq(JSON.parse(storage.getItem(MOUNTAIN_SETTINGS_KEY)!).theme, "glare");
  storage.setItem(MOUNTAIN_SETTINGS_KEY, JSON.stringify({ ...currentMountainSettings(), largeText: true }));
  reloadMountainSettingsFromStorage();
  eq(currentMountainSettings().largeText, true);
  off();
});

test("storage refusing still applies for this session and reports it", () => {
  __resetMountainSettingsForTests();
  storage.broken = true;
  eq(patchMountainSettings({ batterySaver: false }), false);
  eq(currentMountainSettings().batterySaver, false);
  storage.broken = false;
});

test("runtime: unchanged patch does not notify; environment change gives a new snapshot", () => {
  __resetMountainSettingsForTests();
  let calls = 0;
  subscribeMountainSettings(() => calls++);
  setMountainRuntime({ noSignal: false });
  eq(calls, 0);
  setMountainRuntime({ noSignal: true });
  eq([calls, currentMountainRuntime().noSignal], [1, true]);
  const before = currentMountainSettings();
  notifyMountainEnvironmentChanged();
  ok(before !== currentMountainSettings(), "new object for useSyncExternalStore");
  eq(calls, 2);
});

/* ---- CSS tokens ---------------------------------------------------------- */

const indexCss = readFileSync("src/index.css", "utf8");
const mountainCss = readFileSync("src/mountain/mountainTheme.css", "utf8");

function blocks(css: string, selector: string): string {
  let out = "";
  let i = css.indexOf(selector);
  while (i !== -1) {
    const open = css.indexOf("{", i);
    const between = css.slice(i + selector.length, open).trim();
    if (between === "") out += css.slice(open + 1, css.indexOf("}", open));
    i = css.indexOf(selector, i + 1);
  }
  return out;
}
function tokens(block: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const [, k, v] of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) m.set(k, v.trim());
  return m;
}

const lightTokens = tokens(blocks(indexCss, ':root[data-theme="light"]'));
const dark = tokens(blocks(mountainCss, 'html:root[data-mountain-theme="dark"]'));
const glare = tokens(blocks(mountainCss, 'html:root[data-mountain-theme="glare"]'));

test("both Mountain themes restate every token the app's light theme changes", () => {
  ok(lightTokens.size > 20, `found the light block (${lightTokens.size})`);
  for (const k of lightTokens.keys()) {
    ok(dark.has(k), `dark is missing ${k}`);
    ok(glare.has(k), `glare is missing ${k}`);
  }
});

function lum(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test("glare: inks at least 7:1 and signal colours at least 4.5:1 on the canvas", () => {
  const canvas = glare.get("--ice-obsidian")!;
  for (const k of ["--ice-snow", "--ice-mist", "--ice-mist-dim"])
    ok(contrast(glare.get(k)!, canvas) >= 7, `${k} ${contrast(glare.get(k)!, canvas).toFixed(2)}`);
  for (const k of ["--ice-azure", "--ice-danger", "--ice-alert", "--ice-summit"])
    ok(contrast(glare.get(k)!, canvas) >= 4.5, `${k} ${contrast(glare.get(k)!, canvas).toFixed(2)}`);
  ok(contrast(glare.get("--ice-on-accent")!, glare.get("--ice-azure")!) >= 4.5, "button ink on azure");
});

test("dark: primary and secondary ink readable on the canvas", () => {
  const canvas = dark.get("--ice-obsidian")!;
  ok(contrast(dark.get("--ice-snow")!, canvas) >= 7, "snow");
  ok(contrast(dark.get("--ice-mist")!, canvas) >= 7, "mist");
  ok(contrast(dark.get("--ice-mist-dim")!, canvas) >= 4.5, "mist-dim");
});

test("status-bar colours match each theme's canvas", () => {
  eq(MOUNTAIN_THEME_COLOR.dark.toLowerCase(), dark.get("--ice-obsidian"));
  eq(MOUNTAIN_THEME_COLOR.glare.toLowerCase(), glare.get("--ice-obsidian"));
});

test("large text scales the text token", () => {
  ok(/data-mountain-text="large"\][^{]*\{[^}]*--mountain-text-scale:\s*1\.25/.test(mountainCss), "1.25 scale");
});

console.log(`settings/mountain: ${pass} passed, ${fail} failed`);
if (fail && proc) proc.exitCode = 1;
