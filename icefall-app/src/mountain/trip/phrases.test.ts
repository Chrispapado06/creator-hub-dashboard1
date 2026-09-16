/**
 * Phrasebook: the data's own rules.
 *
 * The important one is the first test — no phrase ships without a review state,
 * and "reviewed" is not something anyone can set without naming who checked it.
 */

import {
  DRAFT_LABEL,
  LANGUAGES,
  PHRASE_IDS,
  checkEntry,
  countriesForMountain,
  englishFor,
  languageByCode,
  languageReview,
  languagesForCountry,
  languagesForTrip,
  missingIds,
  missingLabel,
  reviewLabel,
  rowsFor,
  shownRows,
  splitCountries,
  type PhraseId,
} from "./phrases";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${err instanceof Error ? err.message : String(err)}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label} expected ${e}, got ${a}`);
}

function ok(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

test("every phrase in every language carries a review flag", () => {
  ok(LANGUAGES.length > 0, "no languages");
  for (const lang of LANGUAGES) {
    const entries = Object.entries(lang.entries);
    ok(entries.length > 0, `${lang.code} has no phrases at all`);
    for (const [id, entry] of entries) {
      ok(entry, `${lang.code}/${id} is empty`);
      ok(
        entry!.review && (entry!.review.state === "draft" || entry!.review.state === "reviewed"),
        `${lang.code}/${id} has no review state`,
      );
    }
  }
});

test("nothing is claimed as reviewed, so every language reads Draft", () => {
  for (const lang of LANGUAGES) {
    eq(languageReview(lang), "draft", lang.code);
    eq(reviewLabel(lang), DRAFT_LABEL, lang.code);
  }
});

test("every entry passes its own guard", () => {
  for (const lang of LANGUAGES) {
    for (const [id, entry] of Object.entries(lang.entries)) {
      const problem = checkEntry(entry!, { otherScript: lang.otherScript });
      eq(problem, null, `${lang.code}/${id}`);
    }
  }
});

test("the guard rejects a reviewed entry with nobody named, and a draft with one", () => {
  const base = { text: "Hallo", review: { state: "reviewed" as const, checkedBy: null, checkedOn: null } };
  eq(checkEntry(base, { otherScript: false }), "reviewed with nobody named");
  eq(
    checkEntry({ ...base, review: { state: "reviewed", checkedBy: "A", checkedOn: null } }, { otherScript: false }),
    "reviewed with no date",
  );
  eq(
    checkEntry({ ...base, review: { state: "reviewed", checkedBy: "A", checkedOn: "2026-01-01" } }, { otherScript: false }),
    null,
  );
  eq(
    checkEntry({ ...base, review: { state: "draft", checkedBy: "A", checkedOn: null } }, { otherScript: false }),
    "draft with a checker on it",
  );
  eq(
    checkEntry({ text: " ", review: { state: "draft", checkedBy: null, checkedOn: null } }, { otherScript: false }),
    "empty phrase",
  );
});

test("a script you cannot read always says how to say it", () => {
  for (const lang of LANGUAGES.filter((l) => l.otherScript)) {
    for (const [id, entry] of Object.entries(lang.entries)) {
      ok(entry!.say && entry!.say.trim().length > 0, `${lang.code}/${id} has no romanisation`);
    }
  }
  eq(
    checkEntry({ text: "…", review: { state: "draft", checkedBy: null, checkedOn: null } }, { otherScript: true }),
    "other script with no way to say it",
  );
});

test("no language claims a phrase id the app does not have, and codes are unique", () => {
  const codes = new Set<string>();
  for (const lang of LANGUAGES) {
    ok(!codes.has(lang.code), `duplicate code ${lang.code}`);
    codes.add(lang.code);
    ok(lang.name.trim() && lang.endonym.trim(), `${lang.code} is missing a name`);
    for (const id of Object.keys(lang.entries)) {
      ok(PHRASE_IDS.includes(id as PhraseId), `${lang.code} has unknown phrase ${id}`);
    }
  }
});

test("a missing phrase is reported, never silently skipped", () => {
  const greek = languageByCode("el")!;
  eq(missingIds(greek), ["altitude"]);
  eq(missingLabel(greek), "1 phrase left out");
  const french = languageByCode("fr")!;
  eq(missingIds(french), []);
  eq(missingLabel(french), null);
  const urdu = languageByCode("ur")!;
  eq(missingLabel(urdu), "2 phrases left out");
});

test("rows keep the fixed order and shown rows drop the gaps", () => {
  const greek = languageByCode("el")!;
  eq(
    rowsFor(greek).map((r) => r.id),
    PHRASE_IDS,
  );
  eq(rowsFor(greek).at(-1)!.entry, null);
  ok(
    shownRows(greek).every((r) => r.entry.text.length > 0),
    "a shown row had no text",
  );
  eq(shownRows(greek).length, PHRASE_IDS.length - 1);
  eq(rowsFor(greek)[0].english, englishFor("help"));
});

test("a two-country mountain offers both, in the data's order", () => {
  eq(splitCountries("Nepal / China"), ["Nepal", "China"]);
  eq(splitCountries(null), []);
  eq(countriesForMountain("everest"), ["Nepal", "China"]);
  const everest = languagesForTrip("everest");
  eq(
    everest.forTrip.map((l) => l.code),
    ["ne", "zh"],
  );
  eq(everest.emptyCountries, []);
  ok(
    everest.others.every((l) => l.code !== "ne" && l.code !== "zh"),
    "a trip language was repeated in others",
  );
});

test("Switzerland's three languages appear once each", () => {
  const matterhorn = languagesForTrip("matterhorn");
  eq(
    matterhorn.forTrip.map((l) => l.code),
    ["de", "fr", "it"],
  );
  eq(languagesForCountry("Switzerland").length, 3);
  eq(languagesForCountry("Nowhere"), []);
});

test("an English-speaking country says so instead of showing nothing", () => {
  const denali = languagesForTrip("denali");
  eq(denali.forTrip, []);
  eq(denali.emptyCountries.length, 1);
  eq(denali.emptyCountries[0].country, "United States");
  ok(denali.emptyCountries[0].reason.includes("English"), "no explanation for an English-speaking country");
  ok(denali.others.length === LANGUAGES.length, "others should hold everything when the trip has none");
});

test("no trip means no guessed destination", () => {
  const none = languagesForTrip(null);
  eq(none.countries, []);
  eq(none.forTrip, []);
  eq(none.emptyCountries, []);
  eq(none.others.length, LANGUAGES.length);
  eq(languagesForTrip("not-a-mountain").others.length, LANGUAGES.length);
});

console.log(`phrases: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
