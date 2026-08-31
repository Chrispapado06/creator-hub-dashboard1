/**
 * Initials for a name — one algorithm, companies and people alike.
 *
 * SHARED WITH `icefall-web`, AND DELIBERATELY IDENTICAL TO IT.
 *
 * Constitution §6u: once two trees are deliberately identical, a unilateral
 * improvement to one is a regression. This function has already been through
 * that loop twice. **Any change here is a change in both trees, in the same
 * pass, verified against the fixture in `monogram.fixture.ts` — not against the
 * rule.** 02's corollary, learned the hard way in the same hour: when two trees
 * must agree, ship the fixture, not just the rule. A reference set cannot catch
 * a disagreement it does not exercise, and the first two rounds of this agreed
 * on every name that behaved the same way and diverged on every name that did
 * not.
 *
 * WHY IT LIVES IN `lib/` AND NOT BESIDE THE COMPANY MARK. It started as
 * `companyMonogram` next to `CompanyMark`, then people were converged onto it —
 * so a UI primitive (`Avatar`) would have had to import from a domain
 * component. `lib/` has no dependencies and both can reach it.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 *   1. Cut everything after an em dash. "Alps — sample listing" is ICEFALL's
 *      own label bolted onto the company's name; the label is not theirs.
 *   2. Split on whitespace, strip every non-alphanumeric character from each
 *      word, drop what is left empty.
 *   3. USEABLE = the words that BEGIN with a letter; if none do, fall back to
 *      all the words, so a numeric name still renders something.
 *   4. None at all → "··". Exactly one → its first two characters. Otherwise →
 *      first character of the first word plus first character of the last.
 *
 * ── WHY EACH CLAUSE EARNS ITS PLACE ─────────────────────────────────────────
 *
 * FIRST-PLUS-LAST, NOT FIRST-TWO. `icefall-web` took the first two words and
 * gave "Chamonix Alpine Guides" and "Cordillera Ascents" both `CA` — two
 * different companies wearing one identity inside a single app. A mark that
 * cannot distinguish is not doing the job the fallback exists for.
 *
 * THE USEABLE FILTER APPLIES TO THE HEAD AS WELL AS THE TAIL. "Everest Spring
 * 2027" gave `E2`, where a digit reads as a serial number and the year is the
 * least identifying part of the string. Filtering only the tail would still
 * have left "2027 Expedition" as `2E`; filtering the whole list gives `EX`.
 *
 * THE SINGLE-WORD BRANCH IS WHAT CATCHES THE DEGENERATE CASE. Once the filter
 * runs, "Everest 2027" has one useable word, so it takes the first-two-letters
 * branch and gives `EV` rather than `EE` — first and last resolving to the same
 * word was the tell that the earlier rule was incomplete.
 *
 * AND THE FALLBACK IS WHY "2027" IS NOT "··". No word begins with a letter, so
 * USEABLE is empty and the whole list stands in; one word, first two
 * characters, `20`. An unnameable thing still gets a mark rather than a shrug.
 *
 * ── AND ONE REASON THAT IS NOT ABOUT TIDINESS ───────────────────────────────
 *
 * PEOPLE USE THIS TOO, AND THAT IS THE POINT. The person path took the first
 * two words, so "Nima Chhiring Lama" read `NC` — a middle name, with the family
 * name dropped. Sherpa names routinely run three parts (Kami Rita Sherpa, Ang
 * Dorje Sherpa), so on a Himalayan mountaineering platform that is not an edge
 * case, it is the common one: the old rule rendered Western two-part names
 * correctly and misrendered Nepali guides specifically. First-plus-last gives
 * `NL` and `KS`, and removes an asymmetry that fell on exactly the population
 * this product exists to serve.
 */
export function initialsFor(name: string): string {
  const head = name.split("—")[0] ?? name;

  const words = head
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  const startsWithLetter = words.filter((w) => /^[A-Za-z]/.test(w));
  const useable = startsWithLetter.length > 0 ? startsWithLetter : words;

  if (useable.length === 0) return "··";
  if (useable.length === 1) return useable[0]!.slice(0, 2).toUpperCase();
  return (useable[0]![0]! + useable[useable.length - 1]![0]!).toUpperCase();
}
