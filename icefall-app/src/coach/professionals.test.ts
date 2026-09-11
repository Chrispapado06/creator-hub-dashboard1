/**
 * TEST SET FOR PHASE 2 STEP 3 — the guide/operator shortlist, and the language
 * layer's refusal to translate a safety message.
 *
 * `npm run test:coach-professionals`. esbuild to node, like every other suite
 * here. Neither module touches the network; both survive `localStorage` being
 * absent, which on node it is.
 *
 * WHAT IS WORTH PROVING, AND WHY EACH ONE
 *
 *   1. A PAID SLOT CANNOT BUY A POSITION. `rankGuides` ignores `featured`, and
 *      this module lifts featured records into a separate list. Both halves
 *      have to hold: a featured guide must be absent from the organic list AND
 *      the organic order must be identical whether or not a featured record
 *      exists. Suite 1.
 *
 *   2. THE EMPTY STATES ARE DIFFERENT SENTENCES. "Nobody has listed",
 *      "nobody works that mountain", "that mountain is too low for an
 *      expedition company" and "we cannot place it" are four different answers
 *      and collapsing them into "none found" is the failure. Suite 2.
 *
 *   3. THE MODEL IS HANDED A CLOSED WORLD. Every name in the prompt block must
 *      come from the catalogue, the block must forbid adding one, and it must
 *      never contain an invented figure. Suite 3.
 *
 *   4. A SAFETY MESSAGE IS NEVER TRANSLATED BY ANYTHING. For every category in
 *      every language on the list, `localiseSafety` must return the English
 *      body byte for byte while the reviewed table is empty — and must keep
 *      doing so if somebody adds an UNSIGNED entry. Suite 4 is the one that
 *      matters most in this file. Suite 5 checks the resolver.
 *
 * WHAT THIS FILE DOES NOT PROVE: that the chat screen renders the cards, or
 * that the prompt block reaches the model. Those are two call sites, verified
 * by reading them.
 */
import {
  hasProfessionalCards,
  isProfessionalQuestion,
  professionalContextBlock,
  professionalsFor,
} from "@/coach/professionals";
import { allGuides, type Guide } from "@/guides/types";
import { rankGuides } from "@/guides/matching";
import {
  DEFAULT_REPLY_LANGUAGE,
  REPLY_LANGUAGES,
  REVIEWED_SAFETY_TRANSLATIONS,
  SAFETY_CATEGORIES,
  SAFETY_DISCLAIMER,
  SAFETY_MESSAGES,
  languageFromTag,
  languageInstruction,
  localiseSafety,
  scriptedEnglishOnlyNote,
  type ReplyLanguage,
  type SafetyCategory,
} from "@/coach/language";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* -------------------------------------------------------------------------- */
/* 1. Money never moves a guide up the list                                    */
/* -------------------------------------------------------------------------- */

function suiteFeatured() {
  const catalogue = allGuides();

  // The suite is meaningful only against a populated catalogue. In a
  // production build there is none, and that is not a failure — it is the
  // state suite 2 asserts. Say which ran, so a green run cannot be mistaken
  // for the other one.
  if (catalogue.length === 0) {
    ok(true, "");
    console.log(
      "  (catalogue empty — ranking suite skipped; this is the production state, see suite 2)",
    );
    return;
  }

  const s = professionalsFor("Mont Blanc");

  const featuredIds = new Set(s.featuredGuides.map((r) => r.guide.id));
  ok(
    s.guides.every((r) => !featuredIds.has(r.guide.id)),
    "a featured guide appeared in the organic list as well as the paid one",
  );
  ok(
    s.guides.every((r) => r.guide.featured !== true),
    "the organic list contains a record carrying featured: true",
  );
  ok(
    s.featuredGuides.every((r) => r.guide.featured === true),
    "the paid list contains a record that is not featured",
  );

  /*
   * THE ORDER IS THE SAME WITH THE PAID RECORDS REMOVED.
   *
   * This is the real assertion. Separating the lists is cosmetic if the
   * presence of a paid record changed the ranking of everybody else — so the
   * organic order is recomputed over a catalogue with the featured guides
   * deleted outright and must come back identical.
   */
  const withoutPaid: Guide[] = catalogue.filter((g) => g.featured !== true);
  const reranked = rankGuides({ peakName: "Mont Blanc", elevationM: 4806 }, withoutPaid)
    .slice(0, s.guides.length)
    .map((r) => r.guide.id);
  ok(
    JSON.stringify(reranked) === JSON.stringify(s.guides.map((r) => r.guide.id)),
    `organic order changed when paid records were removed: ${reranked.join(",")} vs ${s.guides
      .map((r) => r.guide.id)
      .join(",")}`,
  );

  // Operators: the same rule, on the directory that actually ships.
  const ops = professionalsFor("Everest");
  ok(
    ops.operators.every((o) => o.featured !== true),
    "a featured operator appeared in the organic operator list",
  );
  ok(
    ops.featuredOperators.every((o) => o.featured === true),
    "the paid operator list contains an entry that is not featured",
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Four absences, four sentences                                            */
/* -------------------------------------------------------------------------- */

function suiteAbsences() {
  ok(professionalsFor(null).operatorAbsence === "no-objective", "no objective did not say so");
  ok(professionalsFor("").operatorAbsence === "no-objective", "empty objective did not say so");
  ok(
    professionalsFor("Nonexistent Spire").operatorAbsence === "unplaceable",
    "an objective ICEFALL cannot place was not reported as unplaceable",
  );
  ok(
    professionalsFor("Nonexistent Spire").guides.length === 0,
    "guides were ranked against an objective with no elevation",
  );

  /*
   * Mount Olympus, 2,918 m — the mountain that prompted `EXPEDITION_TERRAIN_M`.
   * Every company in the directory sets a floor of at least 4,000 m, so the
   * query can only ever answer none. That is a category error, not a gap.
   */
  const olympus = professionalsFor("Mount Olympus");
  ok(
    olympus.operatorAbsence === "not-expedition-ground",
    `Mount Olympus reported ${olympus.operatorAbsence}, expected not-expedition-ground`,
  );
  ok(olympus.operators.length === 0, "an expedition company matched a 2,918 m objective");

  // Everest is expedition ground and the directory covers Nepal, so this is the
  // positive control: the absence machinery is not simply always firing.
  const everest = professionalsFor("Everest");
  ok(everest.operatorAbsence === null, "Everest reported an operator absence");
  ok(
    everest.operators.length + everest.featuredOperators.length > 0,
    "Everest matched no operator",
  );

  // The guide catalogue's own state, whatever it is, is reported rather than
  // inferred from the shortlist being short.
  ok(
    professionalsFor("Everest").guideCatalogueEmpty === (allGuides().length === 0),
    "guideCatalogueEmpty disagreed with the catalogue",
  );

  ok(
    hasProfessionalCards(professionalsFor(null)) === false,
    "cards were offered with no objective set",
  );
}

/* -------------------------------------------------------------------------- */
/* 3. The model gets a closed world                                            */
/* -------------------------------------------------------------------------- */

function suiteClosedWorld() {
  const block = professionalContextBlock("Everest");

  ok(
    block.includes("These are the ONLY guides and companies you may name"),
    "the prompt block did not close the world",
  );
  ok(
    block.includes("Do not invent a day rate"),
    "the prompt block did not forbid inventing figures",
  );
  ok(
    block.includes("Do not repeat the list"),
    "the prompt block did not tell the model the app is drawing the cards",
  );

  // Every operator named in the block is in the shortlist the app computed.
  const s = professionalsFor("Everest");
  const known = [...s.operators, ...s.featuredOperators].map((o) => o.name);
  const everyName = [...known, ...[...s.guides, ...s.featuredGuides].map((r) => r.guide.name)];
  /* Record lines are "- <name> — <facts>", and a sample listing's own NAME
     contains an em dash ("Himalaya — sample listing"), so the name cannot be
     recovered by cutting at the first one. Prefix matching is the test that
     actually holds: a line must begin with a name the app put in the
     shortlist. */
  const named = block.split("\n").filter((l) => l.startsWith("- ") && l.includes(" — "));
  const unknown = named.filter((l) => !everyName.some((n) => l.startsWith(`- ${n}`)));
  ok(
    unknown.length === 0,
    `the prompt block named records not in the shortlist: ${unknown.join(" | ")}`,
  );

  // A sample listing is labelled as one, in the model's copy as well as on screen.
  if (s.operators.some((o) => o.sample)) {
    ok(
      block.includes("SAMPLE LISTING, not a company"),
      "a sample listing was not labelled to the model",
    );
  } else {
    ok(true, "");
  }

  // The empty-guide branch says the empty thing rather than nothing.
  if (s.guideCatalogueEmpty) {
    ok(
      block.includes("No guide has listed with ICEFALL"),
      "the empty guide catalogue was not stated to the model",
    );
  } else {
    ok(block.includes("ICEFALL compatibility"), "the guide ranking was not captioned to the model");
    ok(
      block.includes("Every credential above is CLAIMED"),
      "credentials were not labelled as claimed to the model",
    );
  }

  // A mountain ICEFALL cannot place must not produce a region guess.
  const nowhere = professionalContextBlock("Nonexistent Spire");
  ok(
    nowhere.includes("Do not guess at geography"),
    "an unplaceable objective did not forbid guessing",
  );
}

/* -------------------------------------------------------------------------- */
/* 3b. What counts as a question about hiring somebody                         */
/* -------------------------------------------------------------------------- */

function suiteClassifier() {
  const SHOULD: string[] = [
    "Can you recommend a guide for Mont Blanc?",
    "How do I find a guide?",
    "Which operator should I go with for Everest?",
    "I need a guide",
    "who guides the Matterhorn",
    "Are there any expedition companies for Denali?",
    "should I book a guide or go with a company",
    "how do I choose a guide",
    "guides office in Chamonix?",
  ];
  for (const q of SHOULD) {
    ok(isProfessionalQuestion(q), `missed a request for a professional: "${q}"`);
  }

  /*
   * The half that matters. A dozen existing coach answers mention a guide in
   * passing, and this classifier must not hijack a training question just
   * because the word appears in it.
   */
  const SHOULD_NOT: string[] = [
    "What should I train today?",
    "Why am I feeling fatigued?",
    "How should I prepare for altitude?",
    "What gear do I need for a glacier day?",
    "Can I increase my training this week?",
    "Am I ready for Mont Blanc?",
    "What should I eat before tomorrow's hike?",
  ];
  for (const q of SHOULD_NOT) {
    ok(!isProfessionalQuestion(q), `hijacked an ordinary question: "${q}"`);
  }
}

/* -------------------------------------------------------------------------- */
/* 4. A safety message is never translated                                     */
/* -------------------------------------------------------------------------- */

function suiteSafetyNeverTranslated() {
  const categories = SAFETY_CATEGORIES as readonly SafetyCategory[];
  ok(categories.length > 0, "no safety categories were exported");

  let checked = 0;
  for (const code of REPLY_LANGUAGES.map((l) => l.code)) {
    for (const category of categories) {
      const out = localiseSafety(
        { category, body: SAFETY_MESSAGES[category], disclaimer: SAFETY_DISCLAIMER },
        code,
      );
      checked += 1;
      ok(
        out.body === SAFETY_MESSAGES[category],
        `${code}/${category}: the body was not the English message`,
      );
      ok(
        out.disclaimer === SAFETY_DISCLAIMER,
        `${code}/${category}: the disclaimer was not the English one`,
      );
      ok(out.shownIn === "en", `${code}/${category}: claimed to be shown in ${out.shownIn}`);
      ok(
        out.fellBackToEnglish === (code !== "en"),
        `${code}/${category}: mis-reported whether it fell back`,
      );
    }
  }
  ok(
    checked === REPLY_LANGUAGES.length * categories.length,
    "the category walk did not cover everything",
  );

  /*
   * THE ATTACK THIS GUARD EXISTS FOR: somebody pastes machine output into the
   * table because the English card looked unfriendly. An entry with no
   * reviewer's name must be ignored outright, not merely warned about.
   */
  const first = categories[0];
  const table = REVIEWED_SAFETY_TRANSLATIONS as Record<string, Record<string, unknown>>;
  table.es = {
    [first]: { body: "DESCENDER AHORA", reviewedBy: "", reviewedOn: "" },
  };
  const unsigned = localiseSafety(
    { category: first, body: SAFETY_MESSAGES[first], disclaimer: SAFETY_DISCLAIMER },
    "es",
  );
  ok(
    unsigned.body === SAFETY_MESSAGES[first],
    "an UNSIGNED translation was shown to an athlete — this is the failure the table exists to prevent",
  );
  ok(unsigned.fellBackToEnglish, "an unsigned translation was not reported as a fallback");

  // A signed body with no signed disclaimer is still a half-English card, so
  // the whole thing stays English. Both or neither.
  table.es = {
    [first]: { body: "DESCENDER AHORA", reviewedBy: "A Reviewer", reviewedOn: "2026-09-11" },
  };
  const halfSigned = localiseSafety(
    { category: first, body: SAFETY_MESSAGES[first], disclaimer: SAFETY_DISCLAIMER },
    "es",
  );
  ok(
    halfSigned.body === SAFETY_MESSAGES[first],
    "a signed body was shown under an unsigned English caution strip",
  );

  delete table.es;
}

/* -------------------------------------------------------------------------- */
/* 5. Resolving the language, and what the model is told                       */
/* -------------------------------------------------------------------------- */

function suiteLanguage() {
  ok(languageFromTag("es-419") === "es", "a regional tag did not reduce to its primary subtag");
  ok(languageFromTag("pt_BR") === "pt", "an underscore tag was not parsed");
  ok(languageFromTag("EN-GB") === "en", "an uppercase tag was not parsed");
  ok(languageFromTag("cy") === null, "a language not on the list was accepted");
  ok(languageFromTag(null) === null, "a null tag was accepted");
  ok(languageFromTag("") === null, "an empty tag was accepted");

  ok(DEFAULT_REPLY_LANGUAGE === "en", "the default reply language is no longer English");

  ok(languageInstruction("en") === "", "English added a language instruction it does not need");

  for (const { code, englishName } of REPLY_LANGUAGES) {
    if (code === "en") continue;
    const instruction = languageInstruction(code as ReplyLanguage);
    ok(instruction.includes(englishName), `${code}: the instruction did not name the language`);
    ok(
      instruction.includes("The APP IS IN ENGLISH"),
      `${code}: the instruction did not protect the interface's own names`,
    );
    ok(
      instruction.includes("Do not convert metres to feet"),
      `${code}: the instruction did not pin the units`,
    );
    ok(
      scriptedEnglishOnlyNote(code as ReplyLanguage) !== null,
      `${code}: the offline answer would be English with nothing said about it`,
    );
  }

  ok(scriptedEnglishOnlyNote("en") === null, "English was told its offline answer is English");
}

function main() {
  suiteFeatured();
  suiteAbsences();
  suiteClosedWorld();
  suiteClassifier();
  suiteSafetyNeverTranslated();
  suiteLanguage();

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }
}

main();

export {};
