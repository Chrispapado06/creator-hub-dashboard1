/**
 * Trip > Journal: stamping, photo sizing, the storage warning, and the store.
 *
 * Run: esbuild src/mountain/trip/journal.test.ts --bundle --platform=node
 *      --format=esm --define:import.meta.env={} --alias:@=./src --outfile=... && node ...
 */

import {
  NO_DATABASE_SENTENCE,
  __resetDeviceStorageForTests,
  __useBrokenDeviceStorage,
  __useMemoryDeviceStorage,
  deviceStore,
} from "@/device/db";

import type { KnownPosition } from "../position";
import {
  LOW_SPACE_BYTES,
  NO_STAMP,
  PHOTO_MAX_EDGE,
  PHOTO_WARN_BYTES,
  STAMP_GAP_SHOWN_MS,
  addJournalEntry,
  altitudeLine,
  countJournal,
  deleteJournalEntry,
  downscalePhoto,
  journalPhotoBytes,
  listEntryPhotos,
  listJournal,
  newEntryId,
  newPhotoId,
  onJournalChange,
  photoStorageWarning,
  photoUseLine,
  positionLine,
  queueJournalEntry,
  readJournalSyncStates,
  scaledSize,
  sortEntries,
  stampGapNote,
  stampPosition,
  syncStateLabel,
  timeLabel,
} from "./journal";

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

const NOW = 1_700_000_000_000;

const fix = (over: Partial<KnownPosition> = {}): KnownPosition => ({
  lat: 45.83262,
  lon: 6.86517,
  accuracyM: 8,
  altitudeM: 3812,
  altitudeAccuracyM: 12,
  at: NOW,
  ...over,
});

const photo = (bytes: number, type = "image/jpeg") =>
  ({ blob: new Blob([new Uint8Array(bytes)], { type }), mime: type, sizeBytes: bytes, scaled: true, reason: null });

/* --- stamping -------------------------------------------------------------- */

console.log("\nStamping a note with where and when");

eq("a fresh fix stamps all five fields", stampPosition(fix(), NOW), {
  altitudeM: 3812,
  altitudeAccuracyM: 12,
  lat: 45.83262,
  lon: 6.86517,
  positionAt: NOW,
});
eq("no fix at all stamps nothing", stampPosition(null, NOW), NO_STAMP);
eq("a fix 40 min old still stamps", stampPosition(fix({ at: NOW - 40 * 60_000 }), NOW).positionAt, NOW - 40 * 60_000);
eq("a fix over an hour old stamps nothing", stampPosition(fix({ at: NOW - 61 * 60_000 }), NOW), NO_STAMP);
eq("a fix dated in the future stamps nothing", stampPosition(fix({ at: NOW + 10 * 60_000 }), NOW), NO_STAMP);
eq(
  "a fix with no height keeps the position",
  stampPosition(fix({ altitudeM: null, altitudeAccuracyM: null }), NOW).lat,
  45.83262,
);
eq("and does not invent one", stampPosition(fix({ altitudeM: null, altitudeAccuracyM: null }), NOW).altitudeM, null);

eq("height with its error bar", altitudeLine({ altitudeM: 3812, altitudeAccuracyM: 12 }), "3,812 m ± 12 m");
eq("height with no error bar", altitudeLine({ altitudeM: 3812, altitudeAccuracyM: null }), "3,812 m");
eq("no height, no line", altitudeLine({ altitudeM: null, altitudeAccuracyM: 12 }), null);
eq("position line", positionLine({ lat: 45.83262, lon: 6.86517 }), "45.83262, 6.86517");
eq("no position, no line", positionLine({ lat: null, lon: null }), null);
eq("time is the phone's own clock", timeLabel(NOW, "en-GB").length, 5);

eq("a fix from this minute needs no gap note", stampGapNote({ positionAt: NOW - 30_000 }, NOW), null);
eq(
  "an older fix says how old it was",
  stampGapNote({ positionAt: NOW - 40 * 60_000 }, NOW),
  "Position was 40 min old when this was written.",
);
eq("nothing stamped, nothing to explain", stampGapNote({ positionAt: null }, NOW), null);
check("the gap is shown from two minutes", STAMP_GAP_SHOWN_MS === 2 * 60_000);

/* --- photo size ------------------------------------------------------------ */

console.log("\nShrinking a photo before it is saved");

eq("a 12 MP photo comes down to the long edge", scaledSize(4032, 3024), { width: 1600, height: 1200, scaled: true });
eq("portrait keeps its shape", scaledSize(3024, 4032), { width: 1200, height: 1600, scaled: true });
eq("a small photo is left alone", scaledSize(800, 600), { width: 800, height: 600, scaled: false });
eq("never enlarged", scaledSize(PHOTO_MAX_EDGE, 10).width, PHOTO_MAX_EDGE);
eq("a sliver never rounds to nothing", scaledSize(8000, 3).height, 1);
eq("a nonsense size is not trusted into a divide", scaledSize(Number.NaN, Number.NaN).scaled, false);

const kept = await downscalePhoto(new Blob([new Uint8Array(1234)], { type: "image/heic" }));
check("with no canvas the original is kept", !kept.scaled);
check("and it says so rather than failing silently", (kept.reason ?? "").includes("cannot resize"));
eq("the kept file keeps its own size", kept.sizeBytes, 1234);

/* --- the storage warning --------------------------------------------------- */

console.log("\nWarning about space");

eq("no photos, no line", photoUseLine(0), null);
eq("photos are measured", photoUseLine(12 * 1024 * 1024), "Photos use 12 MB of this phone.");
eq("a few photos and plenty of room: no warning", photoStorageWarning(5 * 1024 * 1024, 2 * 1024 ** 3), null);
check(
  "a lot of photos warns they are the only copy",
  (photoStorageWarning(PHOTO_WARN_BYTES, 2 * 1024 ** 3) ?? "").includes("only copy"),
);
check(
  "little room left warns first, whatever the photos weigh",
  (photoStorageWarning(1024, LOW_SPACE_BYTES - 1) ?? "").includes("left for ICEFALL"),
);
check(
  "the free figure is always called an estimate",
  (photoStorageWarning(1024, LOW_SPACE_BYTES - 1) ?? "").includes("estimate"),
);
eq("a browser that will not say is not guessed at", photoStorageWarning(1024, null), null);

/* --- sync state ------------------------------------------------------------ */

console.log("\nWhat happens to an entry");

eq("kept is the honest word today", syncStateLabel("kept"), "Kept on this phone");
eq("waiting", syncStateLabel("waiting"), "Waiting to sync");
eq("stopped", syncStateLabel("stopped"), "Not sent — stopped trying");

/* --- the store ------------------------------------------------------------- */

async function storeTests() {
  console.log("\nSaving on this phone");
  __useMemoryDeviceStorage();
  await deviceStore("journal").clear();
  await deviceStore("journalPhotos").clear();

  const empty = await addJournalEntry({ text: "   " }, NOW);
  check("an empty note is refused", !empty.ok);

  const first = await addJournalEntry(
    { text: "  Left the hut.  ", tripId: "trip-1", position: fix() },
    NOW,
  );
  check("a note saves", first.ok);
  if (first.ok) {
    eq("the text is trimmed", first.entry.text, "Left the hut.");
    eq("it is stamped with the height", first.entry.altitudeM, 3812);
    eq("and with the position", first.entry.lat, 45.83262);
    eq("the queue answers kept on this phone", first.sync, "kept");
  }

  const stale = await addJournalEntry(
    { text: "Cloud came in.", tripId: "trip-1", position: fix({ at: NOW - 2 * 60 * 60_000 }) },
    NOW + 1000,
  );
  check("a note with only an old fix still saves", stale.ok);
  if (stale.ok) eq("but carries no position", stale.entry.lat, null);

  const withPhoto = await addJournalEntry(
    { text: "Summit ridge.", tripId: "trip-1", position: fix({ at: NOW + 2000 }), photos: [photo(2048), photo(4096)] },
    NOW + 2000,
  );
  check("a note with photos saves", withPhoto.ok);
  if (withPhoto.ok) {
    eq("both photos are listed on the entry", withPhoto.entry.photoIds.length, 2);
    const rows = await listEntryPhotos(withPhoto.entry.id);
    eq("both are really in the store", rows.length, 2);
    check("as real files, not text", rows[0].blob instanceof Blob);
  }

  eq("photos add up for the warning", await journalPhotoBytes(), 6144);
  eq("newest first", (await listJournal("trip-1")).map((e) => e.text), [
    "Summit ridge.",
    "Cloud came in.",
    "Left the hut.",
  ]);

  await addJournalEntry({ text: "Note with no trip." }, NOW + 3000);
  eq("a trip also sees the notes that belong to none", (await listJournal("trip-1")).length, 4);
  eq("everything is listed with no trip", await countJournal(), 4);

  eq("a kept-on-phone kind stores nothing to wait on", await readJournalSyncStates(), {});
  eq("asking the queue about an entry answers kept", await queueJournalEntry({ id: "x", at: NOW, tripId: null } as never), "kept");

  let changes = 0;
  const stop = onJournalChange(() => (changes += 1));
  if (withPhoto.ok) {
    const gone = await deleteJournalEntry(withPhoto.entry.id);
    check("delete reports success", gone.ok);
    eq("the screen is told", changes, 1);
    eq("its photos go with it", await journalPhotoBytes(), 0);
    eq("and the entry is gone", await countJournal(), 3);
  }
  stop();

  eq("two ids in the same millisecond differ", newEntryId(NOW, () => 0.1) === newEntryId(NOW, () => 0.9), false);
  eq("photo ids too", newPhotoId(NOW, () => 0.1) === newPhotoId(NOW, () => 0.9), false);
  eq(
    "two notes in the same millisecond still have one fixed order",
    sortEntries([
      { id: "a", at: 5 },
      { id: "b", at: 5 },
    ] as never).map((e) => e.id),
    ["b", "a"],
  );

  console.log("\nA phone with no database");
  __useBrokenDeviceStorage();
  const failed = await addJournalEntry({ text: "Wind picking up." }, NOW);
  check("saving fails rather than pretending", !failed.ok);
  if (!failed.ok) eq("it says why, in plain words", failed.sentence, NO_DATABASE_SENTENCE);
  const removed = await deleteJournalEntry("jrn_1");
  check("deleting fails honestly too", !removed.ok);
  let listFailed = false;
  await listJournal().catch(() => (listFailed = true));
  check("listing rejects so the screen can say so", listFailed);
  __resetDeviceStorageForTests();
}

await storeTests();

console.log(`\n${passCount} passed, ${failures.length} failed`);
if (failures.length && proc) proc.exitCode = 1;
