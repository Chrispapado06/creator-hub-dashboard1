/**
 * Trip contacts: shaping, ordering, the call decision, and the on-device store
 * (in-memory stand-in for IndexedDB, as `device/db.test.ts` does).
 */

import { __resetDeviceStorageForTests, __useBrokenDeviceStorage, __useMemoryDeviceStorage } from "@/device/db";
import type { StoredContact } from "@/device/db";

import {
  MAX_CONTACTS,
  ROLE_ORDER,
  buildContact,
  contactProblem,
  deleteContact,
  draftFrom,
  emergencyInfoContacts,
  emptyContactDraft,
  isDialable,
  newContactId,
  normaliseContact,
  putContact,
  readContacts,
  sortContacts,
  undialableNote,
  visibleContacts,
} from "./contacts";
import type { EmergencyInfo } from "../emergencyInfo";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function eq<T>(a: T, b: T, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}\n  got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`);
}

const contact = (over: Partial<StoredContact> = {}): StoredContact => ({
  id: "c1",
  tripId: "trip-1",
  role: "guide",
  name: "Cham Guides",
  number: "+33 4 50 53 00 88",
  note: null,
  at: 1000,
  ...over,
});

async function run() {
  /* --- shaping ---------------------------------------------------------- */

  await test("a draft is trimmed and given an id", () => {
    const c = buildContact({ ...emptyContactDraft("operator"), name: "  Hut  ", number: " +41 27 ", note: " " }, "t1", 5);
    eq(c.name, "Hut", "name trimmed");
    eq(c.number, "+41 27", "number trimmed");
    eq(c.note, null, "a blank note is stored as nothing");
    eq(c.tripId, "t1", "trip kept");
    eq(c.at, 5, "time kept");
    assert(c.id.length > 0, "an id is made");
  });

  await test("editing keeps the same id", () => {
    const c = contact();
    const again = buildContact(draftFrom(c), c.tripId, 2000);
    eq(again.id, c.id, "same row");
    eq(again.at, 2000, "saved time moves");
  });

  await test("a name on its own cannot be saved, a number on its own can", () => {
    assert(contactProblem({ ...emptyContactDraft(), name: "Jean" }) !== null, "name alone is refused");
    eq(contactProblem({ ...emptyContactDraft(), number: "112" }), null, "number alone is fine");
    assert(contactProblem(emptyContactDraft()) !== null, "an empty draft is refused");
  });

  await test("an unknown role falls back to other", () => {
    const c = buildContact({ ...emptyContactDraft(), role: "captain" as never, number: "1" }, null);
    eq(c.role, "other", "unknown role");
  });

  await test("ids are not repeated", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newContactId()));
    eq(ids.size, 50, "50 different ids");
  });

  /* --- reading back ----------------------------------------------------- */

  await test("a broken row is dropped, not shown", () => {
    eq(normaliseContact(null), null, "null");
    eq(normaliseContact({ id: "x" }), null, "no name and no number");
    eq(normaliseContact({ id: "", name: "x", number: "1" }), null, "no id");
    const c = normaliseContact({ id: "x", role: "nonsense", name: "A", number: "2", at: "soon" });
    eq(c?.role, "other", "bad role");
    eq(c?.at, 0, "bad time becomes 0, never a made-up date");
    eq(c?.tripId, null, "missing trip");
  });

  await test("order is by role, then by when it was saved", () => {
    const rows = [
      contact({ id: "b", role: "other", at: 1 }),
      contact({ id: "c", role: "guide", at: 20 }),
      contact({ id: "a", role: "guide", at: 10 }),
    ];
    eq(sortContacts(rows).map((c) => c.id), ["a", "c", "b"], "guides first, oldest first");
  });

  await test("another trip's contacts are not shown, contacts with no trip are", () => {
    const rows = [
      contact({ id: "mine", tripId: "t1" }),
      contact({ id: "theirs", tripId: "t2" }),
      contact({ id: "always", tripId: null, role: "operator" }),
    ];
    eq(visibleContacts(rows, "t1").map((c) => c.id), ["mine", "always"], "this trip plus the general ones");
    eq(visibleContacts(rows, null).map((c) => c.id), ["always"], "no trip open");
  });

  /* --- calling ---------------------------------------------------------- */

  await test("only a phone number becomes a call", () => {
    assert(isDialable("+33 4 50 53 00 88"), "a phone number");
    assert(!isDialable("VHF 142.800"), "a radio frequency is not dialled");
    assert(!isDialable("ask at the hut"), "words are not dialled");
    eq(undialableNote("+41 27 123"), null, "nothing to say about a real number");
    assert((undialableNote("VHF 142.800") ?? "").includes("Radio"), "radio is named");
    assert((undialableNote("ask at the hut") ?? "").length > 0, "something is said");
  });

  /* --- the athlete's own emergency info --------------------------------- */

  await test("emergency info is read, not copied", () => {
    const info: EmergencyInfo = {
      name: "A",
      destinationCountry: "France",
      contacts: [
        { name: "Sam", number: "+44 7700 900000" },
        { name: "", number: "" },
      ],
      insurer: "Alpine Cover",
      policyRef: "AB-12",
      rescueHotline: "+41 333 333 333",
      coverNote: "",
      savedAt: 1,
    };
    const rows = emergencyInfoContacts(info);
    eq(rows.length, 2, "one contact and the rescue line; the blank one is skipped");
    eq(rows[0].label, "Sam", "name used");
    eq(rows[1].label, "Alpine Cover · rescue line", "insurer named");
    eq(rows[1].note, "Policy AB-12", "policy shown");
    eq(emergencyInfoContacts(null), [], "nothing saved");
  });

  /* --- the store -------------------------------------------------------- */

  await test("saved, read back, and deleted", async () => {
    __useMemoryDeviceStorage();
    await putContact(contact({ id: "a", at: 1 }));
    await putContact(contact({ id: "b", role: "operator", at: 2 }));
    await putContact(contact({ id: "z", tripId: "other-trip", at: 3 }));
    const rows = await readContacts("trip-1");
    eq(rows.map((c) => c.id), ["a", "b"], "this trip only, guide first");
    await deleteContact("a");
    eq((await readContacts("trip-1")).map((c) => c.id), ["b"], "deleted");
    __resetDeviceStorageForTests();
  });

  await test("a saved row that has gone bad is skipped, the rest still read", async () => {
    __useMemoryDeviceStorage();
    await putContact(contact({ id: "good" }));
    await putContact({ id: "bad", tripId: "trip-1", role: "guide", name: "", number: "", note: null, at: 1 });
    eq((await readContacts("trip-1")).map((c) => c.id), ["good"], "only the usable row");
    __resetDeviceStorageForTests();
  });

  await test("with no database the read fails loudly rather than showing nothing as if it were empty", async () => {
    __useBrokenDeviceStorage("no database on this phone");
    let threw = false;
    try {
      await readContacts("trip-1");
    } catch {
      threw = true;
    }
    assert(threw, "it rejects");
    __resetDeviceStorageForTests();
  });

  await test("the roles are the five the store knows", () => {
    eq([...ROLE_ORDER], ["guide", "operator", "emergency", "insurer", "other"], "roles");
    assert(MAX_CONTACTS > 0, "a cap exists");
  });

  console.log(`\ncontacts: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void run();
