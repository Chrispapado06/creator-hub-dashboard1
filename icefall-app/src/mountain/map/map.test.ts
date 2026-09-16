/**
 * The Map tab's pure halves: the plot arithmetic, whether a map is really
 * saved, and the pins somebody added themselves.
 *
 * Run: esbuild src/mountain/map/map.test.ts --bundle --platform=node --format=esm
 *      --define:import.meta.env={} --alias:@=./src --outfile=… && node …
 */

import type { TripPackPart } from "@/device/types";

import {
  MAP_SOURCE_LICENCES,
  NO_MAP_SAVED,
  NO_MAP_SAVED_CAPTION,
  mapCaption,
  savedMapState,
} from "./savedMap";
import {
  PIN_LABELS,
  addPin,
  pinAddedLine,
  pinFromFix,
  pinIsOld,
  pinsForTrip,
  readPins,
  removePin,
  type MapPin,
} from "./pins";
import {
  MAX_METRES_PER_PIXEL,
  MIN_METRES_PER_PIXEL,
  M_PER_DEG_LAT,
  accuracyRadiusPx,
  backArrows,
  centreView,
  fitView,
  fromXY,
  isOnCanvas,
  panView,
  resizeView,
  runPath,
  scaleBar,
  scaleBarTicks,
  toXY,
  zoomView,
  type PlotView,
} from "./plot";

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
const near = (name: string, got: number, want: number, tol: number) =>
  check(name, Math.abs(got - want) <= tol, `got ${got}, want ${want} ±${tol}`);

const NOW = Date.UTC(2026, 8, 14, 9, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const view: PlotView = { centre: { lat: 45.85, lon: 6.86 }, metresPerPixel: 5, width: 360, height: 320 };

/* -------------------------------------------------------------------------- */
console.log("\nPlot projection");

eq("the centre lands in the middle of the box", toXY(view, view.centre), { x: 180, y: 160 });

const north = toXY(view, { lat: view.centre.lat + 100 / M_PER_DEG_LAT, lon: view.centre.lon });
near("100 m north is 20 px up at 5 m per pixel", north.y, 160 - 20, 0.001);
near("100 m north does not move east", north.x, 180, 0.001);

const back = fromXY(view, { x: 240, y: 100 });
const there = toXY(view, back);
near("a point survives the round trip (x)", there.x, 240, 0.001);
near("a point survives the round trip (y)", there.y, 100, 0.001);

const dateLine: PlotView = { ...view, centre: { lat: 0, lon: 179.99 } };
const wrapped = toXY(dateLine, { lat: 0, lon: -179.99 });
check("a point over the date line stays beside the centre, not half a world away", Math.abs(wrapped.x - 180) < 1000, `x=${wrapped.x}`);

/* -------------------------------------------------------------------------- */
console.log("\nFitting a view");

eq("nothing to draw gives no view", fitView([], { width: 360, height: 320 }), null);
eq("a box with no size gives no view", fitView([{ lat: 1, lon: 1 }], { width: 0, height: 0 }), null);

const one = fitView([{ lat: 45.9, lon: 6.9 }], { width: 360, height: 320 })!;
eq("one point centres on itself", one.centre, { lat: 45.9, lon: 6.9 });
near("one point does not zoom to infinity", one.metresPerPixel, 400 / 320, 0.001);

const spread = [
  { lat: 45.85, lon: 6.85 },
  { lat: 45.88, lon: 6.9 },
  { lat: 45.83, lon: 6.82 },
];
const fitted = fitView(spread, { width: 360, height: 320, paddingPx: 40 })!;
check(
  "every point is inside the box once fitted",
  spread.every((p) => isOnCanvas(fitted, toXY(fitted, p))),
  JSON.stringify(spread.map((p) => toXY(fitted, p))),
);
check(
  "the padding is kept clear",
  spread.every((p) => {
    const { x, y } = toXY(fitted, p);
    return x >= 39 && x <= 321 && y >= 39 && y <= 281;
  }),
  "a point sat in the padding",
);

eq("a resize keeps the centre and the scale", resizeView(view, 400, 300), { ...view, width: 400, height: 300 });
eq("a resize to nothing is ignored", resizeView(view, 0, 300), view);

/* -------------------------------------------------------------------------- */
console.log("\nZoom, pan and centre");

near("zooming in halves the metres per pixel", zoomView(view, 2).metresPerPixel, 2.5, 0.0001);
near("zooming out doubles it", zoomView(view, 0.5).metresPerPixel, 10, 0.0001);
near("zooming in stops at the floor", zoomView({ ...view, metresPerPixel: MIN_METRES_PER_PIXEL }, 8).metresPerPixel, MIN_METRES_PER_PIXEL, 0.0001);
near("zooming out stops at the ceiling", zoomView({ ...view, metresPerPixel: MAX_METRES_PER_PIXEL }, 0.1).metresPerPixel, MAX_METRES_PER_PIXEL, 0.0001);
eq("a nonsense zoom changes nothing", zoomView(view, 0), view);

const dragged = panView(view, 50, 0);
check("dragging the ground right moves the centre west", dragged.centre.lon < view.centre.lon, `${dragged.centre.lon}`);
const draggedDown = panView(view, 0, 50);
check("dragging the ground down moves the centre north", draggedDown.centre.lat > view.centre.lat, `${draggedDown.centre.lat}`);
near("a drag does not change the scale", dragged.metresPerPixel, view.metresPerPixel, 0.0001);

const centred = centreView(view, { lat: 46, lon: 7 });
eq("centre on me puts the fix in the middle", toXY(centred, { lat: 46, lon: 7 }), { x: 180, y: 160 });

/* -------------------------------------------------------------------------- */
console.log("\nScale bar and paths");

const bar1 = scaleBar({ ...view, metresPerPixel: 1 }, 140);
eq("at 1 m per pixel the bar is 100 m", bar1.label, "100 m");
const bar2 = scaleBar({ ...view, metresPerPixel: 20 }, 140);
eq("at 20 m per pixel the bar is 2 km", bar2.label, "2 km");
check("the bar never overruns its space", bar1.px <= 140 && bar2.px <= 140, `${bar1.px} / ${bar2.px}`);

const ticks1 = scaleBarTicks({ ...view, metresPerPixel: 1 }, 140);
eq("the ticked bar numbers start, middle and end", ticks1.ticks.map((t) => t.label), ["0", "50", "100 m"]);
eq("the first tick sits at the left end", ticks1.ticks[0].px, 0);
eq("the last tick sits at the far end", ticks1.ticks[2].px, ticks1.px);
const ticks2 = scaleBarTicks({ ...view, metresPerPixel: 20 }, 140);
eq("a kilometre bar counts in kilometres", ticks2.ticks.map((t) => t.label), ["0", "1", "2 km"]);
check("only the last tick carries the unit", ticks2.ticks.filter((t) => /km|m$/.test(t.label)).length === 1, ticks2.ticks.map((t) => t.label).join(" "));
check("the ticked bar draws the same distance the plain one chose", ticks2.metres === scaleBar({ ...view, metresPerPixel: 20 }, 140).metres, "");

/* -------------------------------------------------------------------------- */
console.log("\nArrows back the way you came");

/* The run is oldest-first and heads north, so on screen it goes UP. Retracing
   means walking back down it, and every arrow must say so. */
const northRun = [
  { lat: 45.85, lon: 6.86 },
  { lat: 45.853, lon: 6.86 },
];
const arrows = backArrows(view, northRun, 40);
check("a walked run carries arrows", arrows.length > 0, `${arrows.length}`);
check("every arrow points back down the track, not on up it", arrows.every((a) => Math.abs(Math.abs(a.angleDeg) - 180) < 0.01), JSON.stringify(arrows.map((a) => a.angleDeg)));
check("the arrows sit on the line", arrows.every((a) => Math.abs(a.x - 180) < 0.01), JSON.stringify(arrows.map((a) => a.x)));
eq("a single fix has no direction, so it gets no arrow", backArrows(view, [northRun[0]], 40), []);
eq("an empty run gets no arrows", backArrows(view, [], 40), []);
eq("a nonsense spacing draws no arrows rather than an infinite row", backArrows(view, northRun, 0), []);
check("closer spacing means more arrows", backArrows(view, northRun, 20).length > backArrows(view, northRun, 80).length, "");
check(
  "two crumbs in the same place draw nothing rather than an arrow with no direction",
  backArrows(view, [northRun[0], { ...northRun[0] }], 40).length === 0,
  "",
);

eq("an empty run draws nothing", runPath(view, []), "");
check("a run starts with a move and continues with lines", runPath(view, [view.centre, { lat: 45.86, lon: 6.86 }]).startsWith("M180.0 160.0 L"), runPath(view, [view.centre, { lat: 45.86, lon: 6.86 }]));

eq("no reported accuracy draws no circle", accuracyRadiusPx(view, null), null);
eq("a nonsense accuracy draws no circle", accuracyRadiusPx(view, 0), null);
near("30 m of accuracy is 6 px at 5 m per pixel", accuracyRadiusPx(view, 30)!, 6, 0.0001);

check("a point off the box is known to be off it", !isOnCanvas(view, { x: -20, y: 10 }, 8), "");

/* -------------------------------------------------------------------------- */
console.log("\nIs a map really saved?");

const mapPart = (savedAt: number, value: unknown): TripPackPart => ({
  id: "trip-1:map",
  tripId: "trip-1",
  kind: "map",
  label: "Offline map",
  savedAt,
  sizeBytes: 1024,
  sourceNote: "Built from OpenStreetMap data, served by ICEFALL.",
  data: { origin: "downloaded", dataDate: null, value },
});

eq("no parts at all means no map is saved", savedMapState([], NOW).kind, "none");
eq("and it says the plan's sentence", savedMapState([], NOW), NO_MAP_SAVED);
eq(
  "a pack of other parts is not a map",
  savedMapState([{ ...mapPart(NOW, { tiles: 1 }), kind: "camps", id: "trip-1:camps" }], NOW).kind,
  "none",
);
eq("a map part that came back empty is not a saved map", savedMapState([mapPart(NOW - DAY, {})], NOW).kind, "none");
eq("a map part with no envelope is not a saved map", savedMapState([{ ...mapPart(NOW - DAY, null), data: "junk" }], NOW).kind, "none");

const saved2d = savedMapState([mapPart(NOW - 2 * DAY, { tiles: 220 })], NOW);
eq("a real pack says when it was saved", saved2d.kind === "saved" ? saved2d.line : null, "Map saved 2 days ago");
eq("two days old is not greyed", saved2d.kind === "saved" ? saved2d.greyed : null, false);
eq("and it carries its source note", saved2d.kind === "saved" ? saved2d.sourceNote : null, "Built from OpenStreetMap data, served by ICEFALL.");

const saved40d = savedMapState([mapPart(NOW - 40 * DAY, { tiles: 220 })], NOW);
eq("past thirty days the map is greyed", saved40d.kind === "saved" ? saved40d.greyed : null, true);
eq("and the band says stale", saved40d.kind === "saved" ? saved40d.band : null, "stale");
eq("a nine-day-old map is aged, not stale", savedMapState([mapPart(NOW - 9 * DAY, { tiles: 1 })], NOW).kind === "saved" ? "saved" : "none", "saved");

/* The caption the plot prints in its own corner (mockup §6). */
eq("with nothing saved the corner says so, and claims nothing", mapCaption(NO_MAP_SAVED), NO_MAP_SAVED_CAPTION);
check("the no-map caption never says a map was saved", !/^map saved/i.test(NO_MAP_SAVED_CAPTION), NO_MAP_SAVED_CAPTION);
eq("over a real pack it is that pack's own line", mapCaption(saved2d), "Map saved 2 days ago");
eq("an old pack says it is old in the same corner", mapCaption(saved40d), "Map saved 40 days ago · over a month old");
eq("an empty download still gets the no-map caption", mapCaption(savedMapState([mapPart(NOW, {})], NOW)), NO_MAP_SAVED_CAPTION);

/* -------------------------------------------------------------------------- */
console.log("\nThe licence position");

check("every source states what it allows", MAP_SOURCE_LICENCES.every((s) => s.position.length > 20 && s.usedFor.length > 3), "");
check(
  "no third-party tile service is marked downloadable",
  MAP_SOURCE_LICENCES.filter((s) => ["OpenFreeMap", "OpenStreetMap tiles", "Mapbox", "Esri satellite imagery", "OpenTopoMap"].includes(s.source)).every(
    (s) => s.mayDownload !== "yes",
  ),
  "",
);
check(
  "the two that may be downloaded are our own packs and the open terrain data",
  MAP_SOURCE_LICENCES.filter((s) => s.mayDownload === "yes").map((s) => s.source).join(", ") ===
    "AWS Terrain Tiles, ICEFALL map packs",
  MAP_SOURCE_LICENCES.filter((s) => s.mayDownload === "yes").map((s) => s.source).join(", "),
);
check("Mapbox is named and ruled out", MAP_SOURCE_LICENCES.some((s) => s.source === "Mapbox" && s.position.includes("Mountain mode does not use Mapbox")), "");

/* -------------------------------------------------------------------------- */
console.log("\nPins you added");

const fix = { lat: 45.85, lon: 6.86, accuracyM: 12 };
const pin = pinFromFix(fix, "trip-1", "Crevasse", NOW);
eq("a pin takes the fix, not the plot centre", [pin.lat, pin.lon, pin.accuracyM], [45.85, 6.86, 12]);
eq("a pin carries the time it was added", pin.addedAt, NOW);
check("every offered label is short enough to read in gloves", PIN_LABELS.every((l) => l.length <= 18), "");

const older = pinFromFix(fix, "trip-1", "Rockfall", NOW - 3 * HOUR, "old");
const other = pinFromFix(fix, "trip-2", "Hazard", NOW, "other-trip");
const all: MapPin[] = [older, pin, other];
eq("pins from another trip are not on this plot", pinsForTrip(all, "trip-1").map((p) => p.id), [pin.id, "old"]);
eq("no trip means no pins", pinsForTrip(all, null), []);

eq("adding replaces a pin with the same id", addPin([pin], { ...pin, label: "Water" }).length, 1);
eq("removing takes only that pin", removePin(all, "old").map((p) => p.id), [pin.id, "other-trip"]);

eq("a pin says who added it and when", pinAddedLine(older, NOW), "Added 3 h ago · not verified");
eq("a fresh pin is not old", pinIsOld(pin, NOW), false);
eq("a day-old pin is old", pinIsOld(pinFromFix(fix, "trip-1", "Hazard", NOW - 25 * HOUR, "d"), NOW), true);

eq("a half-written record is dropped rather than drawn", readPins([{ id: "x" }, pin]).map((p) => p.id), [pin.id]);
eq("something that is not a list is no pins", readPins("nope"), []);
eq("a missing accuracy reads as unknown, never as zero", readPins([{ ...pin, accuracyM: undefined }])[0].accuracyM, null);

/* -------------------------------------------------------------------------- */
console.log(`\n${passCount} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  · ${f}`);
  if (proc) proc.exitCode = 1;
}
