/**
 * Held app updates (plan §2.3) and the app's own age line.
 *
 * Run: esbuild src/offline/appUpdate.test.ts --bundle --platform=node --format=esm
 *      --define:import.meta.env={} --alias:@=./src --outfile=... && node ...
 */

import { appAgeSentence, appBuiltAt } from "./appAge";
import { UPDATE_HOLD_CAP_MS, decideUpdate, updateRowCopy } from "./appUpdateModel";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n  ${(e as Error).message}`);
  }
}
function eq<T>(a: T, b: T) {
  if (a !== b) throw new Error(`expected ${String(b)}, got ${String(a)}`);
}

const now = Date.UTC(2026, 8, 15, 12);
const base = { tripToday: false, recording: false, heldSince: null, now, hidden: false };

test("no trip, no recording: installs straight away", () => {
  eq(decideUpdate(base), "install");
});
test("a recording holds even with no trip", () => {
  eq(decideUpdate({ ...base, recording: true }), "hold");
});
test("a recording holds past the fourteen-day cap", () => {
  eq(decideUpdate({ ...base, recording: true, tripToday: true, heldSince: now - UPDATE_HOLD_CAP_MS * 2, hidden: true }), "hold");
});
test("trip today holds", () => {
  eq(decideUpdate({ ...base, tripToday: true, heldSince: now - 1000 }), "hold");
});
test("trip today, not yet held: holds", () => {
  eq(decideUpdate({ ...base, tripToday: true }), "hold");
});
test("held fourteen days, app open: waits for the background", () => {
  eq(decideUpdate({ ...base, tripToday: true, heldSince: now - UPDATE_HOLD_CAP_MS }), "install-when-hidden");
});
test("held fourteen days, app in background: installs", () => {
  eq(decideUpdate({ ...base, tripToday: true, heldSince: now - UPDATE_HOLD_CAP_MS, hidden: true }), "install");
});
test("thirteen days is still a hold", () => {
  eq(decideUpdate({ ...base, tripToday: true, heldSince: now - UPDATE_HOLD_CAP_MS + 86_400_000, hidden: true }), "hold");
});
test("row copy", () => {
  eq(updateRowCopy("hold"), "A new version of ICEFALL is ready. It will install when this trip ends.");
  eq(updateRowCopy("install-when-hidden").includes("next time you leave the app"), true);
});
test("no build stamp: says nothing", () => {
  eq(appBuiltAt(undefined), null);
  eq(appBuiltAt("not a date"), null);
  eq(appAgeSentence(null), null);
});
test("build stamp: dated sentence, year only when different", () => {
  const built = appBuiltAt("2026-08-02T09:00:00Z");
  eq(appAgeSentence(built, new Date(now)), "This copy of ICEFALL was made on 2 August. Everything below came with it.");
  eq(appAgeSentence(built, new Date(Date.UTC(2027, 0, 3))), "This copy of ICEFALL was made on 2 August 2026. Everything below came with it.");
});

console.log(`app update: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
