/**
 * Trip > Documents: the copy, the sizes, and what the on-device store keeps.
 *
 * Run: esbuild src/mountain/trip/documents.test.ts --bundle --platform=node
 *      --format=esm --define:import.meta.env={} --alias:@=./src --outfile=... && node ...
 */

import {
  NO_DATABASE_SENTENCE,
  __resetDeviceStorageForTests,
  __useBrokenDeviceStorage,
  __useMemoryDeviceStorage,
  deviceStore,
} from "@/device/db";

import {
  addDocument,
  canShowInline,
  countDocuments,
  deleteDocument,
  documentName,
  documentsRowLabel,
  largeFileWarning,
  listDocuments,
  newDocumentId,
  onDocumentsChange,
  openNote,
  sizeLabel,
  sortDocuments,
} from "./documents";

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

const file = (name: string, type: string, bytes: number): Blob & { name?: string } =>
  Object.assign(new Blob([new Uint8Array(bytes)], { type }), { name });

async function clearDocs() {
  await deviceStore("documents").clear();
}

/* --- copy and small helpers ---------------------------------------------- */

console.log("\nCopy and sizes");
eq("size in KB", sizeLabel(41 * 1024), "41 KB");
eq("size in MB", sizeLabel(1.4 * 1024 * 1024), "1.4 MB");
eq("no readable size", sizeLabel(null), "size unknown");
eq("row label, none", documentsRowLabel(0), "Documents · nothing saved on this phone.");
eq("row label, one", documentsRowLabel(1), "Documents · 1 saved");
eq("row label, three", documentsRowLabel(3), "Documents · 3 saved");
check("no invented backup promise", !documentsRowLabel(3).includes("backed up"));

eq("typed name wins", documentName("  Permit  ", "scan.pdf"), "Permit");
eq("file name when nothing typed", documentName("   ", "scan.pdf"), "scan.pdf");
eq("fallback when neither", documentName(null, null), "Untitled document");

check("images can be drawn", canShowInline("image/jpeg"));
check("a pdf cannot", !canShowInline("application/pdf"));
eq("image needs no warning", openNote("image/png"), null);
check("pdf says what the phone may do", (openNote("application/pdf") ?? "").includes("save the PDF"));
check("unknown type is honest", (openNote("application/zip") ?? "").includes("cannot show"));

eq("small file, no warning", largeFileWarning(2 * 1024 * 1024), null);
check("big file warns and names the size", (largeFileWarning(40 * 1024 * 1024) ?? "").startsWith("40 MB is large"));

eq(
  "newest first",
  sortDocuments([
    { id: "a", addedAt: 1 },
    { id: "b", addedAt: 3 },
    { id: "c", addedAt: 2 },
  ] as never).map((d) => d.id),
  ["b", "c", "a"],
);
check("ids do not collide in one millisecond", newDocumentId(1, () => 0.1) !== newDocumentId(1, () => 0.9));

/* --- the store ------------------------------------------------------------ */

async function storeTests() {
  console.log("\nSaving on this phone");
  __useMemoryDeviceStorage();
  await clearDocs();

  const added = await addDocument(
    { file: file("permit.pdf", "application/pdf", 2048), kind: "permit", tripId: "trip-1", note: "  " },
    1000,
  );
  check("add reports success", added.ok);
  if (added.ok) {
    check("the file itself is kept, not text", added.doc.blob instanceof Blob);
    eq("size comes from the file", added.doc.sizeBytes, 2048);
    eq("mime comes from the file", added.doc.mime, "application/pdf");
    eq("a blank note is stored as none", added.doc.note, null);
    eq("name falls back to the file's own", added.doc.name, "permit.pdf");
  }

  const noType = await addDocument({ file: file("scan", "", 10), kind: "other", tripId: null }, 1001);
  check("a file with no type still saves", noType.ok);
  if (noType.ok) eq("unknown type is named", noType.doc.mime, "application/octet-stream");

  await addDocument({ file: file("other.pdf", "application/pdf", 5), kind: "booking", tripId: "trip-2" }, 1002);

  eq("everything is listed with no trip", (await listDocuments()).length, 3);
  eq(
    "one trip sees its own and the unattached",
    (await listDocuments("trip-1")).map((d) => d.name),
    ["scan", "permit.pdf"],
  );
  eq("count for the Trip row", await countDocuments(), 3);

  let changes = 0;
  const stop = onDocumentsChange(() => (changes += 1));
  const first = (await listDocuments("trip-1"))[0];
  const gone = await deleteDocument(first.id);
  check("delete reports success", gone.ok);
  eq("delete tells the Trip row", changes, 1);
  eq("it is really gone", await countDocuments(), 2);
  stop();

  console.log("\nA phone with no database");
  __useBrokenDeviceStorage();
  const failed = await addDocument({ file: file("x.pdf", "application/pdf", 1), kind: "other" }, 1003);
  check("adding fails rather than pretending", !failed.ok);
  if (!failed.ok) eq("it says why, in plain words", failed.sentence, NO_DATABASE_SENTENCE);
  const removed = await deleteDocument("doc_1");
  check("deleting fails honestly too", !removed.ok);
  let listFailed = false;
  await listDocuments().catch(() => (listFailed = true));
  check("listing rejects so the screen can say so", listFailed);
  __resetDeviceStorageForTests();
}

await storeTests();

console.log(`\n${passCount} passed, ${failures.length} failed`);
if (failures.length && proc) proc.exitCode = 1;
