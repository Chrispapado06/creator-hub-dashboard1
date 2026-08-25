/**
 * Peak names, in an alphabet the athlete can read.
 *
 * OpenStreetMap stores a summit under its local name, which is correct and also
 * unusable: a search from Limassol came back as Μαχαιράς, Μαδαρή, Προσευχή, and
 * one from Matsumoto as 王ヶ鼻, 槍ヶ岳, 前穂高岳. You cannot say a name you cannot
 * read, and you certainly cannot tell two of them apart at a glance.
 *
 * Three sources, in descending order of how much we can vouch for them:
 *
 *   1. `name:en` — someone wrote the English name into OSM. Authoritative.
 *   2. `int_name` / a Latin-script `name:<lang>` — the same name, romanised by
 *      a mapper rather than by us.
 *   3. Our own transliteration, for Greek and Cyrillic only. Both are alphabets
 *      with a settled letter-for-letter romanisation, so this is mechanical
 *      rather than a guess.
 *
 * Scripts with no letter-for-letter mapping — Japanese, Chinese, Korean, Thai —
 * are deliberately NOT transliterated. Reading 槍ヶ岳 as "Yari-ga-take" needs a
 * dictionary, and inventing a romanisation would put a name on a mountain that
 * nobody uses. Those keep their own name, and the local name is always carried
 * alongside so the athlete can match it against a local map or a sign.
 */

/** A letter outside the Latin alphabet. Digits, spaces and punctuation are fine. */
const NON_LATIN_LETTER = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

export const isLatin = (s: string) => !NON_LATIN_LETTER.test(s);

/* -------------------------------------------------------------------------- */
/* Greek                                                                      */
/* -------------------------------------------------------------------------- */

const GREEK: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i",
  κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s",
  ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
  ά: "a", έ: "e", ή: "i", ί: "i", ό: "o", ύ: "y", ώ: "o", ϊ: "i", ϋ: "y",
  ΐ: "i", ΰ: "y",
};

/**
 * Vowel digraphs, applied before the single letters.
 *
 * This is the letter-for-letter romanisation, not the phonetic one: μπ is left
 * as "mp" rather than "b", because the phonetic rule is context-dependent and
 * turned Όλυμπος into "Olybos" instead of "Olympos". Mechanical and slightly
 * stiff beats clever and wrong.
 */
const GREEK_PAIRS: [RegExp, string][] = [
  // The accent can sit on either half of the pair (Παπούτσα, not Παπουτσά), so
  // both forms have to match or the digraph is missed and you get "Papoytsa".
  [/[οό][υύ]/g, "ou"], [/[αά][ιί]/g, "ai"], [/[εέ][ιί]/g, "ei"], [/[οό][ιί]/g, "oi"],
];

/* -------------------------------------------------------------------------- */
/* Cyrillic                                                                   */
/* -------------------------------------------------------------------------- */

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ѐ: "e", ї: "yi", і: "i", є: "ye", ґ: "g", ђ: "dj", ј: "j", љ: "lj",
  њ: "nj", ћ: "c", џ: "dz",
};

const titleCase = (s: string) =>
  s.replace(/(^|[\s\-'’])(\p{Ll})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());

/**
 * Romanise a Greek or Cyrillic name. Returns `null` for any other script, so
 * the caller keeps the original rather than mangling it.
 */
export function romanise(name: string): string | null {
  const hasGreek = /\p{Script=Greek}/u.test(name);
  const hasCyrillic = /\p{Script=Cyrillic}/u.test(name);
  if (!hasGreek && !hasCyrillic) return null;

  let out = name;
  if (hasGreek) {
    const lower = out.toLowerCase();
    let g = lower;
    for (const [re, to] of GREEK_PAIRS) g = g.replace(re, to);
    g = [...g].map((c) => GREEK[c] ?? c).join("");
    out = g;
  }
  if (hasCyrillic) {
    out = [...out.toLowerCase()].map((c) => CYRILLIC[c] ?? c).join("");
  }

  const cleaned = titleCase(out).trim();
  return cleaned && isLatin(cleaned) ? cleaned : null;
}

/* -------------------------------------------------------------------------- */
/* The name a peak is shown under                                             */
/* -------------------------------------------------------------------------- */

/** Latin-script languages worth reading a `name:<lang>` tag from. */
const LATIN_LANGS = ["en", "de", "fr", "it", "es", "pt", "nl", "sv", "no", "da", "pl", "tr"];

export interface DisplayName {
  /** What the card shows. */
  name: string;
  /** The local name, when it differs — always kept, never replaced. */
  localName?: string;
}

/**
 * Pick the name to display from an OSM tag set.
 *
 * The local name is returned alongside rather than discarded: it is the name on
 * the signpost at the trailhead, and an athlete standing at that signpost needs
 * to be able to match it.
 */
export function displayName(tags: Record<string, string>): DisplayName | null {
  const local = tags.name?.trim();
  if (!local) return null;

  // 1. An explicit English name always wins — a mapper chose it.
  const english = tags["name:en"]?.trim();
  if (english && isLatin(english)) {
    return english === local ? { name: english } : { name: english, localName: local };
  }

  /*
   * 2. The LOCAL name, whenever it is already readable.
   *
   * This used to fall through to any Latin `name:<lang>` tag, which is how
   * Slovakia's Kriváň was labelled **Kriwan** and Gerlachovský štít
   * **Gerlsdorfer Spitze** — the German exonyms — in an English app. A name you
   * can already read needs no translating, and the local one is what is on the
   * signpost, the map and every guidebook to the Tatras.
   */
  if (isLatin(local)) return { name: local };

  // 3. Non-Latin: any mapper-supplied Latin form, then our own romanisation.
  const tagged =
    tags.int_name?.trim() ||
    LATIN_LANGS.map((l) => tags[`name:${l}`]?.trim()).find((v) => v && isLatin(v));
  if (tagged && isLatin(tagged)) return { name: tagged, localName: local };

  const roman = romanise(local);
  return roman ? { name: roman, localName: local } : { name: local };
}
