/**
 * MOUNTAIN MODE · TRIP · PHRASEBOOK (brief M5, plan §3.5).
 *
 * A short fixed set of emergency phrases, shipped inside the app file, so it
 * reads the same in airplane mode. No network, no AI, no translation service:
 * every line below is written in the source and nothing is generated at run
 * time.
 *
 * THE RULE THIS FILE IS BUILT AROUND: a phrase nobody has checked is a draft,
 * and it says so. Every entry carries its own review state — there is no
 * language-wide "trust me" — and `state: "reviewed"` is only valid with the
 * name of the person who checked it and the date they did (`checkEntry`). No
 * entry is reviewed today, so the screen labels every language "Draft".
 *
 * AND THE SECOND RULE: a phrase we are not sure of is left out, not guessed.
 * Missing entries are normal and the screen says which ones are missing, in
 * plain words, rather than showing something that might send a helicopter to
 * the wrong idea. `MISSING_NOTE` is the copy for that.
 */

import { mountainById } from "@/data/mock/mountains";

export const DRAFT_LABEL = "Draft — needs native-speaker review";

export const DRAFT_NOTE =
  "No native speaker has checked these. Point at the words and show the screen; do not rely on them alone.";

export const MISSING_NOTE = "Left out on purpose: ICEFALL is not sure enough of the wording.";

export const SHOW_HINT = "Tap a phrase to fill the screen, then show it to someone.";

/** The fixed set. Ids never change; the English is the phrase the athlete picks. */
export const PHRASES = [
  { id: "help", english: "I need help." },
  { id: "injured", english: "Someone is injured." },
  { id: "helicopter", english: "Call a rescue helicopter." },
  { id: "cannot-walk", english: "I cannot walk." },
  { id: "lost", english: "We are lost." },
  { id: "shelter", english: "Where is the hut or camp?" },
  { id: "altitude", english: "I have altitude sickness." },
] as const;

export type PhraseId = (typeof PHRASES)[number]["id"];

export const PHRASE_IDS: PhraseId[] = PHRASES.map((p) => p.id);

export function englishFor(id: PhraseId): string {
  return PHRASES.find((p) => p.id === id)?.english ?? "";
}

export type ReviewState = "draft" | "reviewed";

export interface PhraseReview {
  state: ReviewState;
  /** The native speaker who checked it. Null while the entry is a draft. */
  checkedBy: string | null;
  /** ISO date they checked it. Null while the entry is a draft. */
  checkedOn: string | null;
}

export interface PhraseEntry {
  text: string;
  /** How to say it, for scripts the athlete cannot read. */
  say?: string;
  /** Used only where the wording differs from the English above it. */
  means?: string;
  review: PhraseReview;
}

export interface PhraseLanguage {
  code: string;
  /** English name, because the athlete is choosing it. */
  name: string;
  /** The language's own name, because the person reading it is not. */
  endonym: string;
  /** True when the text is not Latin script, so every entry needs a `say`. */
  otherScript: boolean;
  note?: string;
  entries: Partial<Record<PhraseId, PhraseEntry>>;
}

/** Every entry is stamped a draft here, so no entry can be shipped without a state. */
function draft(text: string, extra: { say?: string; means?: string } = {}): PhraseEntry {
  return { text, ...extra, review: { state: "draft", checkedBy: null, checkedOn: null } };
}

export const LANGUAGES: PhraseLanguage[] = [
  {
    code: "fr",
    name: "French",
    endonym: "Français",
    otherScript: false,
    entries: {
      help: draft("J'ai besoin d'aide."),
      injured: draft("Quelqu'un est blessé."),
      helicopter: draft("Appelez un hélicoptère de secours."),
      "cannot-walk": draft("Je ne peux pas marcher."),
      lost: draft("Nous sommes perdus."),
      shelter: draft("Où est le refuge ?"),
      altitude: draft("J'ai le mal des montagnes."),
    },
  },
  {
    code: "it",
    name: "Italian",
    endonym: "Italiano",
    otherScript: false,
    entries: {
      help: draft("Ho bisogno di aiuto."),
      injured: draft("C'è un ferito."),
      helicopter: draft("Chiamate l'elisoccorso.", { means: "Call the helicopter rescue service." }),
      "cannot-walk": draft("Non riesco a camminare."),
      lost: draft("Ci siamo persi."),
      shelter: draft("Dov'è il rifugio?"),
      altitude: draft("Ho il mal di montagna."),
    },
  },
  {
    code: "de",
    name: "German",
    endonym: "Deutsch",
    otherScript: false,
    entries: {
      help: draft("Ich brauche Hilfe."),
      injured: draft("Jemand ist verletzt."),
      helicopter: draft("Rufen Sie einen Rettungshubschrauber."),
      "cannot-walk": draft("Ich kann nicht gehen."),
      lost: draft("Wir haben uns verirrt."),
      shelter: draft("Wo ist die Hütte?"),
      altitude: draft("Ich habe die Höhenkrankheit."),
    },
  },
  {
    code: "es",
    name: "Spanish",
    endonym: "Español",
    otherScript: false,
    entries: {
      help: draft("Necesito ayuda."),
      injured: draft("Hay una persona herida."),
      helicopter: draft("Llamen a un helicóptero de rescate."),
      "cannot-walk": draft("No puedo caminar."),
      lost: draft("Estamos perdidos."),
      shelter: draft("¿Dónde está el refugio?"),
      altitude: draft("Tengo mal de altura."),
    },
  },
  {
    code: "el",
    name: "Greek",
    endonym: "Ελληνικά",
    otherScript: true,
    entries: {
      help: draft("Χρειάζομαι βοήθεια.", { say: "Chriázome voíthia." }),
      injured: draft("Κάποιος τραυματίστηκε.", { say: "Kápios travmatístike." }),
      helicopter: draft("Καλέστε ελικόπτερο διάσωσης.", { say: "Kaléste elikóptero diásosis." }),
      "cannot-walk": draft("Δεν μπορώ να περπατήσω.", { say: "Den boró na perpatíso." }),
      lost: draft("Χαθήκαμε.", { say: "Chathíkame." }),
      shelter: draft("Πού είναι το καταφύγιο;", { say: "Pou íne to katafýgio?" }),
    },
  },
  {
    code: "sl",
    name: "Slovene",
    endonym: "Slovenščina",
    otherScript: false,
    entries: {
      help: draft("Potrebujem pomoč."),
      injured: draft("Nekdo je poškodovan."),
      helicopter: draft("Pokličite reševalni helikopter."),
      "cannot-walk": draft("Ne morem hoditi."),
      lost: draft("Izgubili smo se."),
      shelter: draft("Kje je koča?"),
    },
  },
  {
    code: "ne",
    name: "Nepali",
    endonym: "नेपाली",
    otherScript: true,
    entries: {
      help: draft("मलाई मद्दत चाहियो।", { say: "Malai maddat chahiyo." }),
      injured: draft("मान्छे घाइते भयो।", { say: "Manche ghaite bhayo.", means: "A person is injured." }),
      helicopter: draft("हेलिकप्टर बोलाउनुहोस्।", { say: "Helicopter bolaunuhos.", means: "Call a helicopter." }),
      "cannot-walk": draft("म हिँड्न सक्दिनँ।", { say: "Ma hindna sakdina." }),
      shelter: draft("लज कहाँ छ?", { say: "Lodge kaha cha?", means: "Where is the lodge?" }),
      altitude: draft("मलाई लेक लाग्यो।", { say: "Malai lek lagyo.", means: "Altitude has hit me — the usual Nepali way to say it." }),
    },
  },
  {
    code: "ur",
    name: "Urdu",
    endonym: "اردو",
    otherScript: true,
    entries: {
      help: draft("مجھے مدد چاہیے۔", { say: "Mujhe madad chahiye." }),
      injured: draft("کوئی زخمی ہے۔", { say: "Koi zakhmi hai." }),
      helicopter: draft("ریسکیو ہیلی کاپٹر بلائیں۔", { say: "Rescue helicopter bulayen." }),
      lost: draft("ہم راستہ بھول گئے ہیں۔", { say: "Hum rasta bhool gaye hain." }),
      shelter: draft("کیمپ کہاں ہے؟", { say: "Camp kahan hai?", means: "Where is the camp?" }),
    },
  },
  {
    code: "zh",
    name: "Mandarin Chinese",
    endonym: "中文",
    otherScript: true,
    entries: {
      help: draft("我需要帮助。", { say: "Wo xu-yao bang-zhu." }),
      injured: draft("有人受伤了。", { say: "You ren shou-shang le." }),
      helicopter: draft("请叫救援直升机。", { say: "Qing jiao jiu-yuan zhi-sheng-ji." }),
      "cannot-walk": draft("我走不了了。", { say: "Wo zou bu liao le." }),
      lost: draft("我们迷路了。", { say: "Wo-men mi-lu le." }),
      shelter: draft("营地在哪里？", { say: "Ying-di zai na-li?", means: "Where is the camp?" }),
      altitude: draft("我有高原反应。", { say: "Wo you gao-yuan fan-ying." }),
    },
  },
  {
    code: "sw",
    name: "Swahili",
    endonym: "Kiswahili",
    otherScript: false,
    entries: {
      help: draft("Nahitaji msaada."),
      injured: draft("Mtu amejeruhiwa."),
      helicopter: draft("Tunahitaji helikopta ya uokoaji.", { means: "We need a rescue helicopter." }),
      "cannot-walk": draft("Siwezi kutembea."),
      lost: draft("Tumepotea."),
      shelter: draft("Kambi iko wapi?", { means: "Where is the camp?" }),
    },
  },
  {
    code: "ar",
    name: "Arabic",
    endonym: "العربية",
    otherScript: true,
    note: "Modern Standard Arabic. In the High Atlas many people speak Tashelhit or Moroccan Darija, where these words may not be the ones used.",
    entries: {
      help: draft("أحتاج إلى مساعدة.", { say: "Ahtaju ila musa'ada." }),
      injured: draft("هناك شخص مصاب.", { say: "Hunaka shakhs musab." }),
      helicopter: draft("اتصلوا بمروحية إنقاذ.", { say: "Ittasilu bi-mirwahiyat inqadh." }),
      "cannot-walk": draft("لا أستطيع المشي.", { say: "La astati' al-mashy." }),
      lost: draft("لقد ضللنا الطريق.", { say: "Laqad dalalna at-tariq." }),
      shelter: draft("أين المخيم؟", { say: "Ayna al-mukhayyam?", means: "Where is the camp?" }),
    },
  },
];

export function languageByCode(code: string): PhraseLanguage | null {
  return LANGUAGES.find((l) => l.code === code) ?? null;
}

/**
 * Countries where the phrase itself is the thing to say. Listed so the screen
 * can answer "why is there nothing for Denali?" instead of showing an empty
 * list.
 */
export const ENGLISH_SPEAKING = ["United States"];

/** Country → the languages ICEFALL holds for it. A country with none is normal. */
const COUNTRY_LANGUAGES: Record<string, string[]> = {
  France: ["fr"],
  Italy: ["it"],
  Switzerland: ["de", "fr", "it"],
  Slovenia: ["sl"],
  Greece: ["el"],
  Argentina: ["es"],
  Nepal: ["ne"],
  China: ["zh"],
  Pakistan: ["ur"],
  Tanzania: ["sw"],
  Morocco: ["ar"],
};

/** "Nepal / China" → ["Nepal", "China"]. The curated data writes borders that way. */
export function splitCountries(country: string | null | undefined): string[] {
  if (!country) return [];
  return country
    .split("/")
    .map((c) => c.trim())
    .filter(Boolean);
}

export function countriesForMountain(mountainId: string | null | undefined): string[] {
  if (!mountainId) return [];
  return splitCountries(mountainById(mountainId)?.country);
}

export function languagesForCountry(country: string): PhraseLanguage[] {
  return (COUNTRY_LANGUAGES[country] ?? [])
    .map(languageByCode)
    .filter((l): l is PhraseLanguage => l !== null);
}

export interface TripLanguages {
  /** Countries of the trip's mountain, in the order the curated data lists them. */
  countries: string[];
  /** Languages for those countries, no repeats. */
  forTrip: PhraseLanguage[];
  /** Everything else ICEFALL holds. */
  others: PhraseLanguage[];
  /** Trip countries with nothing to show, and why. */
  emptyCountries: { country: string; reason: string }[];
}

/**
 * The picker's order: the trip's languages first. With no trip, everything is
 * in "others" — never a guessed destination.
 */
export function languagesForTrip(mountainId: string | null | undefined): TripLanguages {
  const countries = countriesForMountain(mountainId);
  const forTrip: PhraseLanguage[] = [];
  const emptyCountries: { country: string; reason: string }[] = [];

  for (const country of countries) {
    const langs = languagesForCountry(country);
    if (langs.length === 0) {
      emptyCountries.push({
        country,
        reason: ENGLISH_SPEAKING.includes(country)
          ? "English is the language here. Say the phrase as it is written."
          : "ICEFALL has no checked phrases for this country yet.",
      });
      continue;
    }
    for (const lang of langs) if (!forTrip.includes(lang)) forTrip.push(lang);
  }

  return {
    countries,
    forTrip,
    others: LANGUAGES.filter((l) => !forTrip.includes(l)),
    emptyCountries,
  };
}

export interface PhraseRow {
  id: PhraseId;
  english: string;
  entry: PhraseEntry | null;
}

/** Every phrase in the fixed order, with a null entry where the language has none. */
export function rowsFor(language: PhraseLanguage): PhraseRow[] {
  return PHRASES.map((p) => ({ id: p.id, english: p.english, entry: language.entries[p.id] ?? null }));
}

/** Only the ones there is something to show. What the screen and the full screen walk. */
export function shownRows(language: PhraseLanguage): (PhraseRow & { entry: PhraseEntry })[] {
  return rowsFor(language).filter((r): r is PhraseRow & { entry: PhraseEntry } => r.entry !== null);
}

export function missingIds(language: PhraseLanguage): PhraseId[] {
  return rowsFor(language)
    .filter((r) => r.entry === null)
    .map((r) => r.id);
}

/** "2 phrases left out" — never a silent gap. */
export function missingLabel(language: PhraseLanguage): string | null {
  const n = missingIds(language).length;
  if (n === 0) return null;
  return n === 1 ? "1 phrase left out" : `${n} phrases left out`;
}

/** A language is a draft while any of its entries is. Nothing is reviewed yet. */
export function languageReview(language: PhraseLanguage): ReviewState {
  return shownRows(language).every((r) => r.entry.review.state === "reviewed") && shownRows(language).length > 0
    ? "reviewed"
    : "draft";
}

export function reviewLabel(language: PhraseLanguage): string {
  return languageReview(language) === "draft" ? DRAFT_LABEL : "Checked by a native speaker";
}

/**
 * The guard the test leans on: a "reviewed" entry is only valid with the name
 * and the date, and a script the athlete cannot read needs its `say` line.
 */
export function checkEntry(entry: PhraseEntry, opts: { otherScript: boolean }): string | null {
  if (!entry.text.trim()) return "empty phrase";
  if (entry.review.state === "reviewed" && !entry.review.checkedBy) return "reviewed with nobody named";
  if (entry.review.state === "reviewed" && !entry.review.checkedOn) return "reviewed with no date";
  if (entry.review.state === "draft" && (entry.review.checkedBy || entry.review.checkedOn))
    return "draft with a checker on it";
  if (opts.otherScript && !entry.say?.trim()) return "other script with no way to say it";
  return null;
}
