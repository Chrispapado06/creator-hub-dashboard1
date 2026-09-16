/**
 * Which GPS settings the battery saver is allowed to choose (brief M10, plan §6.2),
 * and the regression that matters most: a theme or text-size change must not
 * restart the GPS watch or the screen wake lock.
 *
 * Run: esbuild src/mountain/gpsPower.test.ts --bundle --platform=node --format=esm
 *      --define:import.meta.env={} --alias:@=./src --external:node:fs --external:node:path
 *      --outfile=... && node ...
 */

import { readFileSync } from "node:fs";

import {
  DEFAULT_RUNTIME,
  __resetMountainSettingsForTests,
  currentMountainSettings,
  notifyMountainEnvironmentChanged,
  patchMountainSettings,
  resolveBatterySaver,
} from "@/settings/mountain";

import {
  FULL_GPS_REASON,
  NO_SIGNAL_GPS_REASON,
  RECORDING_GPS_REASON,
  SAVER_GPS_REASON,
  SAVER_SCREEN_FIX_GAP_MS,
  SOS_GPS_REASON,
  gpsPlan,
  phoneReportsOffline,
  shouldUseFix,
} from "./gpsPower";

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

const SAVING = { saverGps: true, offline: false };
const FULL = { saverGps: false, offline: false };

/* -------------------------------------------------------------------------- */
/* The three overrides                                                         */
/* -------------------------------------------------------------------------- */

test("SOS: full accuracy however the saver and the network stand", () => {
  for (const c of [SAVING, FULL, { saverGps: true, offline: true }]) {
    const p = gpsPlan("sos", c);
    eq(p.options, { enableHighAccuracy: true, maximumAge: 0, timeout: 60_000 });
    eq(p.minFixGapMs, 0);
    eq(p.pauseWhenHidden, false);
    eq(p.reason, SOS_GPS_REASON);
  }
});

test("recording: full accuracy, every fix, never paused", () => {
  const p = gpsPlan("recording", SAVING);
  ok(p.highAccuracy, "high accuracy");
  eq(p.minFixGapMs, 0);
  eq(p.pauseWhenHidden, false);
  eq(p.reason, RECORDING_GPS_REASON);
});

test("no signal: the saver stands aside, because GPS is all that can find you", () => {
  const p = gpsPlan("screen", { saverGps: true, offline: true });
  ok(p.highAccuracy, "high accuracy");
  eq(p.options.maximumAge, 0);
  eq(p.minFixGapMs, 0);
  eq(p.pauseWhenHidden, false);
  eq(p.reason, NO_SIGNAL_GPS_REASON);
});

/* -------------------------------------------------------------------------- */
/* The setting itself                                                          */
/* -------------------------------------------------------------------------- */

test("saver off: full accuracy on an ordinary screen", () => {
  const p = gpsPlan("screen", FULL);
  eq(p.options, { enableHighAccuracy: true, maximumAge: 0, timeout: 60_000 });
  eq(p.minFixGapMs, 0);
  eq(p.pauseWhenHidden, false);
  eq(p.reason, FULL_GPS_REASON);
});

test("saver on, screen: accuracy off, an older fix accepted, redraws throttled, paused when hidden", () => {
  const p = gpsPlan("screen", SAVING);
  eq(p.options, { enableHighAccuracy: false, maximumAge: 30_000, timeout: 60_000 });
  eq(p.minFixGapMs, SAVER_SCREEN_FIX_GAP_MS);
  eq(p.pauseWhenHidden, true);
  eq(p.reason, SAVER_GPS_REASON);
});

test("saver on, breadcrumb track: no second gap on top of the distance thinning", () => {
  const p = gpsPlan("track", SAVING);
  eq(p.options.enableHighAccuracy, false);
  eq(p.minFixGapMs, 0);
  eq(p.pauseWhenHidden, true);
});

test("the saver never makes the timeout longer than a fix can wait", () => {
  eq(gpsPlan("screen", SAVING).options.timeout, gpsPlan("screen", FULL).options.timeout);
});

/* -------------------------------------------------------------------------- */
/* The key that restarts the watch                                             */
/* -------------------------------------------------------------------------- */

test("same conditions, same key; different conditions, different key", () => {
  eq(gpsPlan("screen", SAVING).key, gpsPlan("screen", SAVING).key);
  ok(gpsPlan("screen", SAVING).key !== gpsPlan("screen", FULL).key, "saver changes the key");
  ok(gpsPlan("screen", SAVING).key !== gpsPlan("sos", SAVING).key, "purpose changes the key");
  ok(
    gpsPlan("screen", { saverGps: true, offline: true }).key !== gpsPlan("screen", SAVING).key,
    "losing the network changes the key",
  );
});

test("a theme or text-size change leaves the GPS key alone", () => {
  __resetMountainSettingsForTests();
  const keyNow = () =>
    gpsPlan("screen", {
      saverGps: resolveBatterySaver(currentMountainSettings().batterySaver, DEFAULT_RUNTIME).gps,
      offline: false,
    }).key;
  const before = keyNow();
  patchMountainSettings({ theme: "glare" });
  eq(keyNow(), before, "after the glare theme");
  patchMountainSettings({ theme: "dark" });
  eq(keyNow(), before, "after the dark theme");
  patchMountainSettings({ largeText: true });
  eq(keyNow(), before, "after large text");
  notifyMountainEnvironmentChanged();
  eq(keyNow(), before, "after the phone's motion preference changed");
  /* And the one change that SHOULD restart it still does. */
  patchMountainSettings({ batterySaver: false });
  ok(keyNow() !== before, "turning the saver off changes the key");
  __resetMountainSettingsForTests();
});

/* -------------------------------------------------------------------------- */
/* The throttle                                                                */
/* -------------------------------------------------------------------------- */

test("the first fix is always used", () => {
  ok(shouldUseFix(null, 1_000, SAVER_SCREEN_FIX_GAP_MS), "first");
});

test("a fix inside the gap is not redrawn; one on the gap is", () => {
  ok(!shouldUseFix(1_000, 1_000 + 14_999, 15_000), "too soon");
  ok(shouldUseFix(1_000, 1_000 + 15_000, 15_000), "on the gap");
});

test("no gap means every fix", () => {
  ok(shouldUseFix(1_000, 1_001, 0), "gap 0");
  ok(shouldUseFix(1_000, 1_001, -1), "negative gap");
});

test("a clock that moved backwards does not freeze the screen", () => {
  ok(shouldUseFix(9_000_000, 1_000, 15_000), "older timestamp accepted");
});

test("'no network' is only ever the phone's own no", () => {
  const nav = globalThis as { navigator?: { onLine?: boolean } };
  const had = "navigator" in globalThis;
  if (!had) nav.navigator = { onLine: false };
  else nav.navigator!.onLine = false;
  eq(phoneReportsOffline(), true);
  nav.navigator!.onLine = true;
  eq(phoneReportsOffline(), false);
  if (!had) delete nav.navigator;
});

/* -------------------------------------------------------------------------- */
/* Source guards — what no future edit may quietly undo                        */
/* -------------------------------------------------------------------------- */

const src = (f: string) => readFileSync(f, "utf8");

test("the GPS watch restarts on a key, not on an object", () => {
  const code = src("src/mountain/position.ts");
  ok(/\}, \[enabled, planKey\]\);/.test(code), "watch effect depends on [enabled, planKey]");
  ok(!/\}, \[enabled, plan\]\);/.test(code), "never on the plan object");
});

test("the wake lock knows nothing about the display settings", () => {
  for (const f of ["src/tracking/wakeLock.ts", "src/tracking/useRecorder.ts"]) {
    const code = src(f);
    ok(!/settings\/(mountain|useMountainSettings|theme)/.test(code), `${f} imports a settings module`);
    ok(!/gpsPower/.test(code), `${f} imports gpsPower`);
  }
  /* The lock is acquired on `active` alone, so a re-render cannot drop it. */
  ok(/\}, \[active, lock\]\);/.test(src("src/tracking/wakeLock.ts")), "acquire effect deps");
});

test("the recording source is still hard-wired to full accuracy", () => {
  const code = src("src/tracking/sources/geolocation.ts");
  ok(/enableHighAccuracy:\s*true/.test(code), "high accuracy");
  ok(!/enableHighAccuracy:\s*false/.test(code), "never off");
});

test("the SOS screen asks for the sos plan by name", () => {
  ok(/useLivePosition\(true,\s*"sos"\)/.test(src("src/mountain/SosScreen.tsx")), "SOS purpose");
});

console.log(`mountain/gpsPower: ${pass} passed, ${fail} failed`);
if (fail && proc) proc.exitCode = 1;
