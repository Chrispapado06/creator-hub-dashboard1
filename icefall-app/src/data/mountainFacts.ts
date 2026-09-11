/**
 * WHOSE MOUNTAIN IT IS, WHO GOT UP IT FIRST, AND HOW WE KNOW.
 *
 * First ascent, prominence, isolation, parent peak, and the mountain's name in
 * the language of the people who live under it. The most checkable data in the
 * app, which is exactly why nothing in it is remembered.
 *
 * ── WIKIDATA IS THE SPINE, AND IT IS STILL NOT A PRIMARY SOURCE ────────────
 *
 * Every mountain here carries its Wikidata Q-id, because a Q-id is a stable
 * address: a reader can open the item and see the same statement this file
 * read, plus every edit made to it since. All fourteen were read on
 * READ_DATE, from https://www.wikidata.org/wiki/Special:EntityData/<qid>.json.
 *
 * But Wikidata is an aggregator. A figure sitting in a Wikidata statement is
 * only as good as what that statement cites, and the range is enormous:
 *
 *   Annapurna's prominence cites peaklist.org's ultra-prominence tables.
 *   Denali's first ascent cites the National Park Service.
 *   Mount Olympus's height cites a peer-reviewed paper in a named journal.
 *   The Matterhorn's prominence cites "imported from German Wikipedia".
 *   Everest's "named after George Everest" cites a Bill Bryson travel book.
 *
 * Those are not the same claim wearing the same clothes, so this file refuses
 * to dress them alike. Every figure carries `backing`: what the Wikidata
 * statement itself cites, in plain words, with a URL where the statement has
 * one. `backing: null` means the statement carries no reference at all — which
 * is common, and which the page should say out loud rather than hide behind a
 * Q-id that looks authoritative.
 *
 * ── ABSENCE IS A VALUE, NOT A HOLE ─────────────────────────────────────────
 *
 * `Maybe<T>` has no null branch. To say a fact is missing you must write down
 * why, and optionally the page that established the absence. This is the whole
 * point of the type. There are at least four different reasons a fact is not
 * in this file and they must not collapse into one blank row:
 *
 *   Everest has no parent peak — Wikidata says so explicitly, a deliberate
 *     "no value". That is a fact about the mountain.
 *   Kilimanjaro's first ascent is absent because the sources ICEFALL could
 *     read disagree about the date, and picking one would be inventing.
 *   Denali's isolation is absent because Wikidata's figure carries a unit
 *     that cannot be right, and guessing the intended unit is inventing.
 *   Toubkal's first ascent is absent because nobody has done the work yet.
 *
 * ── NAMES, AND NOT ADJUDICATING THEM ───────────────────────────────────────
 *
 * Denali/Mount McKinley is politically live: renamed by the US Interior
 * Secretary in 2015, renamed back by executive order in 2025, disputed by the
 * State of Alaska and its congressional delegation throughout. Everest carries
 * three names from three states. This file records WHAT EACH SOURCE SAYS AND
 * WHEN IT SAID IT, in `officialNames`, with the naming body named. It does not
 * rank them, does not pick a winner, and does not quietly render one and drop
 * the others. Getting this wrong is worse than omitting it.
 *
 * A meaning is only recorded where a named page states it. "Kilimanjaro" has
 * no recorded meaning here, not because nobody has a theory, but because the
 * theories contradict each other and the page ICEFALL read ends by admitting
 * as much.
 */

/** The day every source in this file was read. */
export const READ_DATE = "2026-09-11";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * "issuer"    the body whose fact it is — the park service that administers
 *             the mountain, the government that sets its official name, the
 *             journal that published the survey. Treated as fact.
 * "secondary" an aggregator, a reference work, a magazine, a guiding company
 *             or a tourist board repeating somebody else's fact. Usually
 *             right; never authoritative. Wikidata is always this.
 */
export type SourceKind = "issuer" | "secondary";

export interface Source {
  label: string;
  url: string;
  kind: SourceKind;
  /** ISO date ICEFALL read this page. */
  checked: string;
}

/**
 * What a Wikidata statement cites for itself. Null where it cites nothing,
 * which is a real and frequent state and must render as such.
 */
export interface Backing {
  text: string;
  url?: string;
}

/**
 * A fact, or the reason there isn't one. No null branch, deliberately: you
 * cannot express "missing" in this file without saying why it is missing.
 */
export type Maybe<T> =
  | { known: true; value: T }
  | { known: false; why: string; consulted?: Source };

/** A measurement, as published, with the unit it was published in. */
export interface SourcedFigure {
  value: number;
  unit: "m" | "km";
  /** Where ICEFALL read the figure. */
  source: Source;
  /** What that statement cites for itself. */
  backing: Backing | null;
  /** Set where ICEFALL does not fully trust the figure as stated, and why. */
  caution?: string;
}

export interface ParentPeak {
  name: string;
  /** Wikidata item for the parent, so a reader can check it too. */
  qid?: string;
  source: Source;
  backing: Backing | null;
  caution?: string;
}

export interface FirstAscent {
  /** ISO date where the day is known. */
  date: string;
  /** As it should read on the page. British English. */
  dateLabel: string;
  /**
   * Every climber the source names, in the source's order. Never abbreviated
   * to "and others" — a party member left out of a list is a person left out
   * of their own ascent, and Kilimanjaro is the standing reminder of that.
   */
  party: string[];
  /** The expedition the source attaches the ascent to, where it names one. */
  expedition?: string;
  source: Source;
  backing: Backing | null;
  /** Anything the list of names would otherwise quietly misrepresent. */
  note?: string;
}

export interface LocalName {
  /** As written, in its own script. */
  name: string;
  /** The language, in English. */
  language: string;
  /** A romanisation, only where the source gives one. */
  romanisation?: string;
  /** Which romanisation scheme, where the source names it. */
  romanisationScheme?: string;
  /** Where ICEFALL read the name as written. */
  source: Source;
  /** What it means. Only where a named source states it. */
  meaning: Maybe<{ text: string; source: Source }>;
}

/**
 * One official name, for the period a named body made it official. A mountain
 * can hold several of these at once — a federal name and a state name that
 * disagree — and that is the situation, not a bug in the data.
 */
export interface OfficialNameRecord {
  name: string;
  /** Who made it official, named. Never "the government". */
  by: string;
  /** ISO, where the source gives a date. */
  from?: string;
  /** ISO. Absent means the source records it as still standing. */
  until?: string;
  /** Bodies the source records as disputing it. */
  disputedBy?: string[];
  source: Source;
  backing: Backing | null;
}

export interface MountainFactRecord {
  mountainId: string;
  wikidata: { qid: string; url: string; read: string };
  prominence: Maybe<SourcedFigure>;
  isolation: Maybe<SourcedFigure>;
  parentPeak: Maybe<ParentPeak>;
  firstAscent: Maybe<FirstAscent>;
  /** Empty array means Wikidata carries no native label. That is not "no name". */
  localNames: LocalName[];
  /** Present only where a name is officially contested or has changed. */
  officialNames?: OfficialNameRecord[];
  /** Context on naming that is not itself a name. */
  namingNote?: string;
  /**
   * Where two sources give different numbers for the same thing — including
   * where Wikidata disagrees with ICEFALL's own mountain card. Recorded, not
   * resolved. A reader who can see the disagreement is better off than a
   * reader shown one tidy number.
   */
  disagreements?: string[];
}

/* -------------------------------------------------------------------------- */
/* Sources                                                                     */
/* -------------------------------------------------------------------------- */

const wd = (qid: string): Source => ({
  label: `Wikidata ${qid}`,
  url: `https://www.wikidata.org/wiki/${qid}`,
  kind: "secondary",
  checked: READ_DATE,
});

const NPS_DENALI_NAMES: Source = {
  label: "US National Park Service — Naming a Mountain (Denali name origins)",
  url: "https://www.nps.gov/dena/learn/historyculture/denali-origins.htm",
  kind: "issuer",
  checked: READ_DATE,
};

const ARNETTE_EVEREST_NAMES: Source = {
  label: "Alan Arnette — What's in a name: Everest, Chomolungma, Sagarmatha?",
  url: "https://www.alanarnette.com/2020/12/14/whats-in-a-name-everest-chomolungma-sagarmatha/",
  kind: "secondary",
  checked: READ_DATE,
};

const CMK_KILI_NAME: Source = {
  label: "Climb Mount Kilimanjaro — The name Kilimanjaro and its meaning",
  url: "https://www.climbmountkilimanjaro.com/about-the-mountain/the-name-kilimanjaro/",
  kind: "secondary",
  checked: READ_DATE,
};

const BOHINJ_TRIGLAV: Source = {
  label: "Bohinj — official destination site, Triglav",
  url: "https://www.bohinj.si/en/attraction/triglav/",
  kind: "secondary",
  checked: READ_DATE,
};

const ANAVASI_OLYMPUS: Source = {
  label: "Anavasi — Olympus: the first ascent in 1913",
  url: "https://anavasi.gr/blog/Olympos-i-proti-anavasi-to-1913",
  kind: "secondary",
  checked: READ_DATE,
};

/** The commonest Wikidata reference, and the weakest. Named so it reads honestly. */
const imported = (project: string): Backing => ({
  text: `Wikidata records only "imported from ${project}" — a provenance note, not a source.`,
});

/* -------------------------------------------------------------------------- */
/* The records                                                                 */
/* -------------------------------------------------------------------------- */

const RECORDS: MountainFactRecord[] = [
  /* ------------------------------------------------------------- Everest */
  {
    mountainId: "everest",
    wikidata: { qid: "Q513", url: "https://www.wikidata.org/wiki/Q513", read: READ_DATE },
    prominence: {
      known: true,
      value: {
        value: 8848.86,
        unit: "m",
        source: wd("Q513"),
        backing: null,
        caution:
          "Identical to the elevation, because the mountain is the highest point on Earth and its prominence is measured from sea level.",
      },
    },
    isolation: {
      known: false,
      why: "Wikidata's item carries no topographic-isolation statement. There is no higher ground anywhere, so the measurement has no other summit to run to.",
      consulted: wd("Q513"),
    },
    parentPeak: {
      known: false,
      why: "Wikidata states explicitly that Everest has no parent peak — a deliberate 'no value', qualified 'criterion used: topography'. This is a positive statement about the mountain, not a gap in the record.",
      consulted: wd("Q513"),
    },
    firstAscent: {
      known: true,
      value: {
        date: "1953-05-29",
        dateLabel: "29 May 1953",
        party: ["Edmund Hillary", "Tenzing Norgay"],
        expedition: "1953 British Mount Everest Expedition",
        source: wd("Q513"),
        backing: null,
      },
    },
    localNames: [
      {
        name: "सगरमाथा",
        language: "Nepali",
        romanisation: "sagarmāthā",
        source: wd("Q513"),
        meaning: {
          known: true,
          value: {
            text: "Given as 'the Head of the Earth touching the Heaven'. The name was proposed by the Nepalese historian Baburam Acharya in an essay in the late 1930s — he wrote that he had discovered the name rather than invented it — and adopted by Nepal's government in 1956.",
            source: ARNETTE_EVEREST_NAMES,
          },
        },
      },
      {
        name: "ཇོ་མོ་གླང་མ",
        language: "Tibetan",
        romanisation: "jo mo glang ma",
        romanisationScheme: "Wylie transliteration",
        source: wd("Q513"),
        meaning: {
          known: true,
          value: {
            text: "Given as 'Goddess Mother of the World'.",
            source: ARNETTE_EVEREST_NAMES,
          },
        },
      },
      {
        name: "珠穆朗玛峰",
        language: "Chinese (simplified)",
        romanisation: "Zhūmùlǎngmǎ Fēng",
        romanisationScheme: "Hanyu Pinyin",
        source: wd("Q513"),
        meaning: {
          known: false,
          why: "The source ICEFALL read records that China designated 'Zhumulangma feng' on its maps in 1952 and promoted 'Mt Qomolangma' in a 2002 campaign, but states no separate meaning for the Chinese form.",
          consulted: ARNETTE_EVEREST_NAMES,
        },
      },
    ],
    officialNames: [
      {
        name: "Sagarmatha",
        by: "Government of Nepal",
        from: "1956",
        source: ARNETTE_EVEREST_NAMES,
        backing: {
          text: "The source gives the year of adoption, not a day. Render it as a year.",
        },
      },
      {
        name: "Qomolangma / Zhumulangma feng",
        by: "People's Republic of China",
        from: "1952",
        source: ARNETTE_EVEREST_NAMES,
        backing: {
          text: "The source gives the year the name appeared on Chinese maps, not a day. Render it as a year.",
        },
      },
    ],
    namingNote:
      "Three states, three names, all current. Wikidata records the English name as after George Everest (1790–1866), Surveyor General of India, and after the survey designation Peak XV — but the reference on that statement is a Bill Bryson travel book, which is not a source for the history of the Great Trigonometrical Survey. ICEFALL records the three names and does not rank them.",
    disagreements: [
      "Height: Wikidata's preferred value is 8,848.86 m, from the joint China–Nepal announcement of 8 December 2020 (BBC and Der Spiegel are cited on the statement). The same item also holds 8,844.43 m from China's 2005 survey (Xinhua) and 8,850 m from a 1999 measurement. ICEFALL's own mountain card says 8,849 m.",
    ],
  },

  /* ------------------------------------------------------------------ K2 */
  {
    mountainId: "k2",
    wikidata: { qid: "Q43512", url: "https://www.wikidata.org/wiki/Q43512", read: READ_DATE },
    prominence: {
      known: true,
      value: {
        value: 4020,
        unit: "m",
        source: wd("Q43512"),
        backing: { text: "Peakbagger.com, cited on the statement without a URL." },
      },
    },
    isolation: {
      known: true,
      value: { value: 1316, unit: "km", source: wd("Q43512"), backing: null },
    },
    parentPeak: {
      known: false,
      why: "Wikidata's item carries no parent-peak statement — no value, no explicit 'none'. Nobody has filled it in.",
      consulted: wd("Q43512"),
    },
    firstAscent: {
      known: true,
      value: {
        date: "1954-07-31",
        dateLabel: "31 July 1954",
        party: ["Lino Lacedelli", "Achille Compagnoni"],
        expedition: "1954 Italian Karakoram expedition to K2",
        source: wd("Q43512"),
        backing: imported("English Wikipedia"),
      },
    },
    localNames: [],
    namingNote:
      "Wikidata carries no native-language label for K2. It records the name as after the Karakoram range and the number 2 — the Great Trigonometrical Survey's field designation — and separately as after the surveyor Henry Haversham Godwin-Austen; all three statements are referenced only as imported from English Wikipedia. 'Chhogori' appears among the item's English aliases with no reference attached, so ICEFALL does not record it as the Balti name on that basis.",
  },

  /* ---------------------------------------------------------- Broad Peak */
  {
    mountainId: "broad-peak",
    wikidata: { qid: "Q180996", url: "https://www.wikidata.org/wiki/Q180996", read: READ_DATE },
    prominence: {
      known: true,
      value: { value: 1701, unit: "m", source: wd("Q180996"), backing: null },
    },
    isolation: {
      known: true,
      value: { value: 9.12, unit: "km", source: wd("Q180996"), backing: null },
    },
    parentPeak: {
      known: false,
      why: "Wikidata's item carries no parent-peak statement.",
      consulted: wd("Q180996"),
    },
    firstAscent: {
      known: true,
      value: {
        date: "1957-06-09",
        dateLabel: "9 June 1957",
        party: [
          "Fritz Wintersteller",
          "Marcus Schmuck",
          "Kurt Diemberger",
          "Hermann Buhl",
        ],
        source: wd("Q180996"),
        backing: null,
      },
    },
    localNames: [],
    namingNote:
      "'Falchan Kangri' is listed among the item's English aliases with no reference attached. ICEFALL does not record an unreferenced alias as a local name.",
  },

  /* --------------------------------------------------------- Kilimanjaro */
  {
    mountainId: "kilimanjaro",
    wikidata: { qid: "Q7296", url: "https://www.wikidata.org/wiki/Q7296", read: READ_DATE },
    prominence: {
      known: true,
      value: {
        value: 5895,
        unit: "m",
        source: wd("Q7296"),
        backing: { text: "Peakbagger.com, cited on the statement without a URL." },
        caution:
          "Identical to the elevation: Kilimanjaro rises from plain, and its prominence is measured from sea level.",
      },
    },
    isolation: {
      known: true,
      value: {
        value: 5510,
        unit: "km",
        source: wd("Q7296"),
        backing: { text: "Peakbagger.com, cited on the statement without a URL." },
      },
    },
    parentPeak: {
      known: false,
      why: "Wikidata's item carries no parent-peak statement.",
      consulted: wd("Q7296"),
    },
    firstAscent: {
      known: false,
      why: "Wikidata's item records no first ascent at all. Outside Wikidata the pages ICEFALL could open are commercial operator sites, and they do not agree: some put Hans Meyer and Ludwig Purtscheller on the crater rim on 6 October 1889, others give 5 October, and they differ again on how to describe the Chagga guide Yohani Kinyala Lauwo, who led them and whom none of the structured records name at all. ICEFALL will not choose a date between operator blogs, and will not print an ascent that leaves the guide off the rope.",
      consulted: wd("Q7296"),
    },
    localNames: [
      {
        name: "Kilimanjaro",
        language: "Swahili",
        source: wd("Q7296"),
        meaning: {
          known: false,
          why: "Contested, and no source ICEFALL read settles it. The Swahili for mountain is mlima, not kilima (which is 'hill'), which undercuts the familiar 'mountain of greatness' reading; Chagga derivations (kilelema, 'difficult or impossible') and a Maasai derivation are also proposed and also unproven. The page ICEFALL read closes on the point: \"And so we are none the wiser.\"",
          consulted: CMK_KILI_NAME,
        },
      },
    ],
    namingNote:
      "'Kilima-Njaro' appears among the item's English aliases — the nineteenth-century European spelling, not a Swahili form. ICEFALL records the modern Swahili name only.",
  },

  /* ---------------------------------------------------------- Annapurna I */
  {
    mountainId: "annapurna",
    wikidata: {
      qid: "Q16466024",
      url: "https://www.wikidata.org/wiki/Q16466024",
      read: READ_DATE,
    },
    prominence: {
      known: true,
      value: {
        value: 2984,
        unit: "m",
        source: wd("Q16466024"),
        backing: {
          text: "peaklist.org's Himalayan ultra-prominence tables, read by the Wikidata editor on 20 May 2025.",
          url: "http://www.peaklist.org/WWlists/ultras/everest.html",
        },
      },
    },
    isolation: {
      known: true,
      value: { value: 34, unit: "km", source: wd("Q16466024"), backing: null },
    },
    parentPeak: {
      known: true,
      value: {
        name: "Cho Oyu",
        qid: "Q170089",
        source: wd("Q16466024"),
        backing: imported("English Wikipedia"),
      },
    },
    firstAscent: {
      known: true,
      value: {
        date: "1950-06-03",
        dateLabel: "3 June 1950",
        party: ["Maurice Herzog", "Louis Lachenal"],
        expedition: "1950 French Annapurna expedition",
        source: wd("Q16466024"),
        backing: null,
        note: "Wikidata separately records the first winter ascent — 3 February 1987, by Jerzy Kukuczka and Artur Hajzer — and that statement is the better-referenced of the two, citing the American Alpine Club's published account.",
      },
    },
    localNames: [],
    namingNote:
      "Wikidata carries no native-language label and no 'named after' statement for Annapurna I. The Sanskrit reading of the name is well known but ICEFALL has read no page for it, so it is not recorded here.",
  },

  /* ----------------------------------------------------------- Mont Blanc */
  {
    mountainId: "mont-blanc",
    wikidata: { qid: "Q583", url: "https://www.wikidata.org/wiki/Q583", read: READ_DATE },
    prominence: {
      known: true,
      value: { value: 4692, unit: "m", source: wd("Q583"), backing: null },
    },
    isolation: {
      known: true,
      value: {
        value: 2812,
        unit: "km",
        source: wd("Q583"),
        backing: imported("German Wikipedia"),
      },
    },
    parentPeak: {
      known: false,
      why: "Wikidata's item carries no parent-peak statement.",
      consulted: wd("Q583"),
    },
    firstAscent: {
      known: true,
      value: {
        date: "1786-08-08",
        dateLabel: "8 August 1786",
        party: ["Jacques Balmat", "Michel-Gabriel Paccard"],
        source: wd("Q583"),
        backing: null,
      },
    },
    localNames: [
      {
        name: "Monte Bianco",
        language: "Italian",
        source: wd("Q583"),
        meaning: {
          known: false,
          why: "Wikidata carries the name but no statement of its meaning, and ICEFALL has read no other page for it.",
          consulted: wd("Q583"),
        },
      },
      {
        name: "Mont Blanc",
        language: "French",
        source: wd("Q583"),
        meaning: {
          known: false,
          why: "Wikidata carries the name but no statement of its meaning, and ICEFALL has read no other page for it.",
          consulted: wd("Q583"),
        },
      },
    ],
    disagreements: [
      "Height: the summit is a snow dome and is re-surveyed, so the number genuinely moves. Wikidata's preferred value is 4,805.59 m measured on 5 October 2023 (franceinfo), against 4,807.81 m in 2021 and 4,808.72 m in 2017 (Le Parisien on both). ICEFALL's own mountain card says 4,806 m.",
    ],
  },

  /* ----------------------------------------------------------- Matterhorn */
  {
    mountainId: "matterhorn",
    wikidata: { qid: "Q1374", url: "https://www.wikidata.org/wiki/Q1374", read: READ_DATE },
    prominence: {
      known: true,
      value: {
        value: 1043,
        unit: "m",
        source: wd("Q1374"),
        backing: imported("German Wikipedia"),
      },
    },
    isolation: {
      known: true,
      value: {
        value: 13.8,
        unit: "km",
        source: wd("Q1374"),
        backing: imported("English Wikipedia"),
      },
    },
    parentPeak: {
      known: true,
      value: {
        name: "Weisshorn",
        qid: "Q15122",
        source: wd("Q1374"),
        backing: imported("English Wikipedia"),
      },
    },
    firstAscent: {
      known: true,
      value: {
        date: "1865-07-14",
        dateLabel: "14 July 1865",
        party: [
          "Edward Whymper",
          "Lord Francis Douglas",
          "Michel Croz",
          "Charles Thomas Hudson",
          "Douglas Robert Hadow",
          "Peter Taugwalder",
        ],
        source: wd("Q1374"),
        backing: null,
        note: "Wikidata names six climbers. Accounts of this ascent generally describe a party of seven, with both Peter Taugwalder the elder and his son on the rope; Wikidata links only one Taugwalder. ICEFALL records the six names the item carries and flags the gap rather than adding a seventh person from memory.",
      },
    },
    localNames: [],
    namingNote:
      "Wikidata carries no native-language label for the Matterhorn. 'Mont Cervin' sits among the item's English aliases with no reference; the Italian 'Cervino' is not in the item at all. ICEFALL records neither as a sourced local name.",
    disagreements: [
      "Height: Wikidata gives 4,477.54 m, cited to a Leica Geosystems survey document. ICEFALL's own mountain card says 4,478 m.",
    ],
  },

  /* --------------------------------------------------------------- Denali */
  {
    mountainId: "denali",
    wikidata: { qid: "Q130018", url: "https://www.wikidata.org/wiki/Q130018", read: READ_DATE },
    prominence: {
      known: true,
      value: {
        value: 6155,
        unit: "m",
        source: wd("Q130018"),
        backing: {
          text: "Peakbagger.com peak 271, with PeakVisor cited alongside it.",
          url: "http://www.peakbagger.com/peak.aspx?pid=271",
        },
      },
    },
    isolation: {
      known: false,
      why: "Wikidata gives 7,436.9 — but stamped with the unit 'metre', which would put higher ground 7.4 km from the highest mountain in North America. Peakbagger and PeakVisor, the two pages the statement cites, publish isolation in kilometres, and every other mountain in this file carries its isolation in kilometres. The number is probably right and the unit is probably wrong, but 'probably' is not a source, so ICEFALL records nothing.",
      consulted: wd("Q130018"),
    },
    parentPeak: {
      known: false,
      why: "Wikidata's item carries no parent-peak statement.",
      consulted: wd("Q130018"),
    },
    firstAscent: {
      known: true,
      value: {
        date: "1913-06-07",
        dateLabel: "7 June 1913",
        party: ["Harry Karstens", "Hudson Stuck", "Robert G. Tatum", "Walter Harper"],
        source: wd("Q130018"),
        backing: {
          text: "The National Park Service's own page on the 1913 expedition, read by the Wikidata editor on 8 May 2025.",
          url: "https://www.nps.gov/dena/learn/historyculture/1913ex.htm",
        },
      },
    },
    localNames: [
      {
        name: "Deenaalee",
        language: "Koyukon",
        source: NPS_DENALI_NAMES,
        meaning: {
          known: true,
          value: {
            text: "The National Park Service states that the name 'Denali' stems from 'deenaalee', from the Koyukon language traditionally spoken on the north side of the mountain, and — citing the University of Alaska linguist James Kari — that Athabascan groups to the north and west use words translating to 'the tall one', while the languages to the south use words meaning 'mountain-big'.",
            source: NPS_DENALI_NAMES,
          },
        },
      },
      {
        name: "Tenada",
        language: "Deg Hit'an Athabascan",
        source: NPS_DENALI_NAMES,
        meaning: {
          known: true,
          value: {
            text: "'The great mountain'. The Park Service records the Russian explorer Andrei Glazunov using this name for the highest peak in 1834; it appears on an 1839 map.",
            source: NPS_DENALI_NAMES,
          },
        },
      },
      {
        name: "Bulshaia Gora",
        language: "Russian, as transcribed by the Park Service",
        source: NPS_DENALI_NAMES,
        meaning: {
          known: true,
          value: {
            text: "'Big One'. One of several Russian names in use before the United States purchased Alaska in 1867.",
            source: NPS_DENALI_NAMES,
          },
        },
      },
    ],
    officialNames: [
      {
        name: "Mount McKinley",
        by: "Federal Government of the United States",
        from: "1917-02-26",
        until: "2015-08-30",
        source: NPS_DENALI_NAMES,
        backing: {
          text: "The Park Service records that 'Mount McKinley National Park' prevailed when its legislation was signed on 26 February 1917, and that the official name of the mountain remained Mount McKinley until 2015.",
          url: "https://www.nps.gov/dena/learn/historyculture/denali-origins.htm",
        },
      },
      {
        name: "Denali",
        by: "State of Alaska",
        from: "1975-03-07",
        source: wd("Q130018"),
        backing: {
          text: "Wikidata marks this statement 'currently valid value' and cites a US Senate committee report and a Congressional Research Service paper. The Park Service records the same year: Alaska petitioned the US Board on Geographic Names in 1975, and the Ohio congressional delegation blocked the change for the next four decades.",
          url: "https://crsreports.congress.gov/product/pdf/IF/IF12881",
        },
      },
      {
        name: "Denali",
        by: "US Board on Geographic Names, following Secretary of the Interior Sally Jewell",
        from: "2015-08-30",
        until: "2025-01-20",
        source: wd("Q130018"),
        backing: {
          text: "Wikidata cites the Geographic Names Information System, feature 1414314, read January 2025.",
        },
      },
      {
        name: "Mount McKinley",
        by: "Executive Office of the President of the United States",
        from: "2025-01-20",
        disputedBy: ["State of Alaska", "Alaska congressional delegation"],
        source: wd("Q130018"),
        backing: {
          text: "Wikidata cites Executive Order 14172 and the Interior Secretary's Order 3424 implementing it, plus the Geographic Names Information System read on 15 February 2025, and tags the statement as disputed by the State of Alaska and the Alaska delegation. The Park Service confirms the executive order and adds that the park's own name remains Denali National Park and Preserve.",
        },
      },
    ],
    namingNote:
      "This name is politically live and ICEFALL does not adjudicate it. The Park Service's own framing is the one to keep in front: no fewer than nine Alaska Native groups, from time immemorial, have used their own names for this mountain, in five Athabascan languages surrounding the park. The federal name has changed four times in a century, and the state and federal answers currently differ. Every row above says who declared it and when; none of them says who is right.",
  },

  /* ------------------------------------------------------------ Aconcagua */
  {
    mountainId: "aconcagua",
    wikidata: { qid: "Q39739", url: "https://www.wikidata.org/wiki/Q39739", read: READ_DATE },
    prominence: {
      known: true,
      value: {
        value: 6962,
        unit: "m",
        source: wd("Q39739"),
        backing: {
          text: "PeakVisor, and Britannica's 'The World's Highest Mountains by Continent', published 13 June 2025 and read by the Wikidata editor on 21 July 2025.",
          url: "https://peakvisor.com/peak/cerro-aconcagua.html",
        },
        caution:
          "Identical to the elevation: Aconcagua is the high point of the Americas and its prominence runs to sea level.",
      },
    },
    isolation: {
      known: true,
      value: {
        value: 16533.4,
        unit: "km",
        source: wd("Q39739"),
        backing: {
          text: "PeakVisor, with 'imported from English Wikipedia' recorded alongside it.",
          url: "https://peakvisor.com/peak/cerro-aconcagua.html",
        },
      },
    },
    parentPeak: {
      known: true,
      value: {
        name: "Tirich Mir",
        qid: "Q207132",
        source: wd("Q39739"),
        backing: {
          text: "PeakVisor, with 'imported from English Wikipedia' recorded alongside it.",
          url: "https://peakvisor.com/peak/cerro-aconcagua.html",
        },
        caution:
          "The named parent is the high point of the Hindu Kush, on the other side of the world. That is what a parent peak means at this height — the nearest higher summit along an unbroken line — not a neighbour.",
      },
    },
    firstAscent: {
      known: false,
      why: "Wikidata's item records no first ascent. ICEFALL could not open the Mendoza provincial park's own site (its certificate does not match the host it is served from), and will not source the first ascent of the highest mountain in the Americas to a guiding company's blog.",
      consulted: wd("Q39739"),
    },
    localNames: [],
    namingNote:
      "Wikidata carries no native-language label and no 'named after' statement for Aconcagua. Quechua and Mapudungun derivations are both proposed in the literature; ICEFALL has read no page it will stand behind for either, so neither is recorded.",
    disagreements: [
      "Height: Wikidata gives 6,962 m, cited to PeakVisor. ICEFALL's own mountain card says 6,961 m. Neither has been reconciled here.",
    ],
  },

  /* ---------------------------------------------------------------- Eiger */
  {
    mountainId: "eiger",
    wikidata: { qid: "Q4425", url: "https://www.wikidata.org/wiki/Q4425", read: READ_DATE },
    prominence: {
      known: true,
      value: {
        value: 361,
        unit: "m",
        source: wd("Q4425"),
        backing: imported("German Wikipedia"),
      },
    },
    isolation: {
      known: true,
      value: {
        value: 2.21,
        unit: "km",
        source: wd("Q4425"),
        backing: imported("German Wikipedia"),
      },
    },
    parentPeak: {
      known: true,
      value: {
        name: "Mönch",
        qid: "Q16525",
        source: wd("Q4425"),
        backing: imported("English Wikipedia"),
      },
    },
    firstAscent: {
      known: false,
      why: "Wikidata's item carries no first-ascent statement of any kind. The Dictionary of Irish Biography's entry on Charles Barrington would be a source ICEFALL would stand behind, but the page redirects through JavaScript and could not be read on the date above. Nothing goes in until it can be.",
      consulted: wd("Q4425"),
    },
    localNames: [
      {
        name: "Eiger",
        language: "German",
        source: wd("Q4425"),
        meaning: {
          known: false,
          why: "Wikidata carries the name but no statement of its meaning and no 'named after'. The etymology is argued over in the local literature; ICEFALL has read none of it.",
          consulted: wd("Q4425"),
        },
      },
    ],
  },

  /* -------------------------------------------------------- Gran Paradiso */
  {
    mountainId: "gran-paradiso",
    wikidata: { qid: "Q1372", url: "https://www.wikidata.org/wiki/Q1372", read: READ_DATE },
    prominence: {
      known: true,
      value: {
        value: 1888,
        unit: "m",
        source: wd("Q1372"),
        backing: imported("English Wikipedia"),
      },
    },
    isolation: {
      known: true,
      value: {
        value: 45.1,
        unit: "km",
        source: wd("Q1372"),
        backing: imported("English Wikipedia"),
      },
    },
    parentPeak: {
      known: false,
      why: "Wikidata's item carries no parent-peak statement.",
      consulted: wd("Q1372"),
    },
    firstAscent: {
      known: false,
      why: "Wikidata's item carries no first-ascent statement. Gran Paradiso National Park's own history pages are about the ibex and the royal hunting reserve, not about who first stood on the summit, so there is no institutional page to cite.",
      consulted: wd("Q1372"),
    },
    localNames: [
      {
        name: "Grand Paradis",
        language: "French",
        source: wd("Q1372"),
        meaning: {
          known: false,
          why: "Wikidata carries the name but no statement of its meaning.",
          consulted: wd("Q1372"),
        },
      },
    ],
  },

  /* -------------------------------------------------------- Mount Olympus */
  {
    mountainId: "mount-olympus",
    wikidata: { qid: "Q80344", url: "https://www.wikidata.org/wiki/Q80344", read: READ_DATE },
    prominence: {
      known: true,
      value: {
        value: 2355,
        unit: "m",
        source: wd("Q80344"),
        backing: imported("German Wikipedia"),
      },
    },
    isolation: {
      known: true,
      value: { value: 254, unit: "km", source: wd("Q80344"), backing: null },
    },
    parentPeak: {
      known: false,
      why: "Wikidata's item carries no parent-peak statement.",
      consulted: wd("Q80344"),
    },
    firstAscent: {
      known: true,
      value: {
        date: "1913-08-02",
        dateLabel: "2 August 1913",
        party: ["Christos Kakalos", "Frédéric Boissonnas", "Daniel Baud-Bovy"],
        source: ANAVASI_OLYMPUS,
        backing: null,
        note: "Not from Wikidata: the item carries no first-ascent statement. This is the Greek mapping publisher Anavasi's account, which describes Mytikas as the untrodden high point of Olympus before that day. Kakalos was a local hunter from Litochoro and was the party's guide.",
      },
    },
    localNames: [
      {
        name: "Όλυμπος",
        language: "Greek",
        source: wd("Q80344"),
        meaning: {
          known: false,
          why: "Wikidata does carry a 'named after' statement referenced to a NASA Earth Observatory page, but the item it points at has a malformed English label, so what the statement actually asserts cannot be read off it. ICEFALL will not launder a broken record into an etymology.",
          consulted: wd("Q80344"),
        },
      },
    ],
    disagreements: [
      "Height: Wikidata gives 2,917.727 m, cited to a peer-reviewed paper — 'Revisiting the determination of Mount Olympus Height (Greece)', Journal of Mountain Science, doi:10.1007/s11629-022-7866-8. That is the best-referenced height statement anywhere in this file. ICEFALL's own mountain card says 2,918 m.",
    ],
  },

  /* -------------------------------------------------------------- Triglav */
  {
    mountainId: "triglav",
    wikidata: { qid: "Q1024", url: "https://www.wikidata.org/wiki/Q1024", read: READ_DATE },
    prominence: {
      known: true,
      value: {
        value: 2059,
        unit: "m",
        source: wd("Q1024"),
        backing: imported("German Wikipedia"),
      },
    },
    isolation: {
      known: true,
      value: {
        value: 72.5,
        unit: "km",
        source: wd("Q1024"),
        backing: imported("German Wikipedia"),
      },
    },
    parentPeak: {
      known: true,
      value: {
        name: "Kleines Reisseck",
        qid: "Q21868531",
        source: wd("Q1024"),
        backing: null,
        caution:
          "Wikidata names a peak in the Reißeck group in Carinthia, Austria — not in the Julian Alps — and the statement carries no reference at all. Recorded as Wikidata states it, and flagged, because ICEFALL has not checked it.",
      },
    },
    firstAscent: {
      known: true,
      value: {
        date: "1778-08-26",
        dateLabel: "26 August 1778",
        party: [
          "Lovrenc Willomitzer",
          "Štefan Rožič",
          "Matija Kos",
          "Luka Korošec",
        ],
        source: BOHINJ_TRIGLAV,
        backing: null,
        note: "Wikidata gives the same date and names nobody. The four names come from Bohinj's official destination site, which lists them with their trades — Willomitzer a miner and ironworker, Rožič and Kos hunters, Korošec a hunter and miner. They are remembered in Slovenia as the štirje srčni možje, the four brave men.",
      },
    },
    localNames: [
      {
        name: "Triglav",
        language: "Slovene",
        source: wd("Q1024"),
        meaning: {
          known: false,
          why: "Not settled by anything ICEFALL read. Wikidata records the mountain as named after the deity Triglav, referenced only as imported from Russian Wikipedia. The Bohinj destination site offers a legend rather than an etymology: the three-headed summit is said to stand for three heads, or for the three main valleys beneath it — Bohinj, Trenta and Kot. A legend is not a meaning, and ICEFALL records neither as one.",
          consulted: BOHINJ_TRIGLAV,
        },
      },
    ],
  },

  /* -------------------------------------------------------------- Toubkal */
  {
    mountainId: "toubkal",
    wikidata: { qid: "Q503433", url: "https://www.wikidata.org/wiki/Q503433", read: READ_DATE },
    prominence: {
      known: true,
      value: { value: 3756, unit: "m", source: wd("Q503433"), backing: null },
    },
    isolation: {
      known: true,
      value: { value: 2078, unit: "km", source: wd("Q503433"), backing: null },
    },
    parentPeak: {
      known: false,
      why: "Wikidata's item carries no parent-peak statement.",
      consulted: wd("Q503433"),
    },
    firstAscent: {
      known: false,
      why: "Wikidata's item carries no first-ascent statement, and ICEFALL found no institutional page for it — no Moroccan park authority record and no alpine club account it could open on the date above. This is the plainest kind of gap: nobody has done the work yet.",
      consulted: wd("Q503433"),
    },
    localNames: [],
    namingNote:
      "Wikidata's English label for this item is 'Jbel Toubkal', and the item carries no native-language label at all. ICEFALL has recorded no Tamazight or Arabic form of the name, because it has read no source for one — not because the mountain lacks one.",
  },
];

const BY_ID = new Map(RECORDS.map((r) => [r.mountainId, r]));

/** The fact record for a mountain, or null where ICEFALL holds none. */
export function factsFor(mountainId: string | undefined): MountainFactRecord | null {
  if (!mountainId) return null;
  return BY_ID.get(mountainId) ?? null;
}

/** Every record, in the order they were researched. */
export function allFactRecords(): MountainFactRecord[] {
  return RECORDS;
}

/**
 * The sentence for a mountain with no record at all. All fourteen curated
 * mountains currently have one, so this should not render today — it exists so
 * that a fifteenth mountain added tomorrow does not render a silent blank.
 */
export const NO_FACTS_RECORDED =
  "ICEFALL has not looked up this mountain's record yet. Rather than fill the section from memory, there is nothing here.";

/** "8,848.86 m", "1,316 km", "2.21 km". */
export function figureLabel(f: SourcedFigure): string {
  return (
    f.value.toLocaleString("en-GB", { maximumFractionDigits: 3 }) + " " + f.unit
  );
}

/**
 * How the party reads in a sentence. British English, and it never truncates:
 * if a source named six people, six people are named.
 */
export function partyLabel(party: string[]): string {
  if (party.length === 0) return "";
  if (party.length === 1) return party[0];
  return party.slice(0, -1).join(", ") + " and " + party[party.length - 1];
}

/**
 * How strongly a figure is backed, for a caller that wants to show the
 * difference without reading the prose. Three states, because there are three:
 * a real cited source, a bare Wikipedia import, and nothing at all.
 */
export type BackingStrength = "cited" | "wikipedia-import" | "unreferenced";

export function backingStrength(backing: Backing | null): BackingStrength {
  if (backing === null) return "unreferenced";
  return backing.text.startsWith("Wikidata records only")
    ? "wikipedia-import"
    : "cited";
}

export const BACKING_LABEL: Record<BackingStrength, string> = {
  cited: "Wikidata statement cites a source",
  "wikipedia-import": "Wikidata statement cites only a Wikipedia import",
  unreferenced: "Wikidata statement carries no reference",
};
