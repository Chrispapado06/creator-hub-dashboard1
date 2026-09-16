/**
 * WHO COMES IF IT GOES WRONG.
 *
 * Charlie, 11 September 2026: the "When & safety" section needed to answer the
 * question a climber actually has at the bad moment — not "what are the
 * symptoms" but WHO DO I CALL, AND CAN THEY REACH ME.
 *
 * ── THE LINE BETWEEN THIS FILE AND src/coach/safety.ts ─────────────────────
 *
 * `safety.ts` owns symptoms. It decides that a headache at 4,800 m with
 * vomiting is treated as acute mountain sickness and that the instruction is
 * "stop going up"; it says "call your local emergency number or mountain
 * rescue" and deliberately stops there, because it has no imports and cannot
 * know which mountain you are on.
 *
 * THIS FILE IS THAT MISSING HALF AND NOTHING MORE. It names the number, the
 * service and the aircraft. It contains no symptom, no threshold, no treatment
 * and no instruction to descend. Nothing here may contradict `safety.ts`, and
 * the cheapest way to guarantee that is to never say anything it says.
 *
 * ── THE ALTITUDE CEILING, WHICH IS THE POINT OF THE WHOLE FILE ─────────────
 *
 * A helicopter has a real ceiling and on the 8,000 m peaks it is thousands of
 * metres below the summit. A climber at Camp IV on Everest who believes a
 * helicopter can come for them holds a belief that will kill them. So every
 * ceiling below is a MEASURED, ATTRIBUTED figure — the highest rescue anybody
 * has actually flown, or the highest landing site an operator publishes — and
 * `ceilingGapM()` subtracts it from the summit so the page can state the gap
 * in metres rather than gesture at it.
 *
 * WHERE NO CEILING IS PUBLISHED, `ceilings` IS EMPTY AND THE PAGE SAYS SO.
 * An estimate here is worse than a blank, because a blank sends somebody to
 * ask their operator and a plausible number stops them asking.
 *
 * ── SOURCING, SAME RULES AS mountainCosts.ts ───────────────────────────────
 *
 *   "issuer"    the body that actually does the thing — the national park
 *               service, the air-rescue organisation, the government listing
 *               its own emergency numbers.
 *   "secondary" a news report, a trade magazine, a guiding company, a
 *               federation writing about somebody else's service. Usually
 *               right, occasionally stale, never authoritative.
 *
 * Every figure carries the page it was read off and the date it was read.
 * Nothing is carried across from a neighbouring mountain: Pakistan's rules are
 * not Nepal's, and the two Karakoram peaks share a record only because they
 * share one operator and one army — which their records say out loud.
 *
 * ── DISAGREEMENT IS RECORDED, NOT RESOLVED ─────────────────────────────────
 *
 * Three times below, two decent sources say different things — the highest
 * landing site on Kilimanjaro, whether that helicopter service still exists,
 * and whether Aconcagua's permit already pays for its helicopter. Both
 * readings are kept, side by side, labelled as disagreeing. A climber who
 * knows two sources disagree will ring and check. One handed a confident
 * single answer will not.
 *
 * ── WHAT IS DELIBERATELY ABSENT ────────────────────────────────────────────
 *
 * No rescue-cost estimates beyond the figures an issuer publishes. No claim
 * that any service is reliable, fast, or will come at all — Askari Aviation
 * states in its own FAQ that rescue is not guaranteed, and that sentence is
 * reproduced rather than softened. No phone number that has not been read off
 * a government or operator page today.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type SourceKind = "issuer" | "secondary";

export interface Source {
  label: string;
  url: string;
  kind: SourceKind;
  /** ISO date this page was read. */
  checked: string;
}

/**
 * What kind of contact this is (plan §5.1). The data legitimately holds
 * "VHF 142.800" beside "+33 4 50 53 16 89", so any code that builds a phone
 * link out of every row produces a dead tap. The kind is a field rather than
 * something a regular expression guesses at the last moment.
 */
export type ContactKind = "dial" | "radio" | "sms";

/**
 * A way of reaching help. `number` is a string on purpose: "112", "1414",
 * "+33 4 50 53 16 89" and "VHF 142.800" are all dialling strings rather than
 * integers, and a leading zero matters.
 */
export interface EmergencyNumber {
  number: string;
  label: string;
  contact: ContactKind;
  /**
   * The exact characters a `tel:` link uses — no spaces (plan §5.9). Set on
   * every international number, because "+33 4 50 53 16 89" makes a malformed
   * link. `number` stays the readable form.
   */
  dial?: string;
  /** The caveat the source attaches — coverage, language, what it does not do. */
  note?: string;
  source: Source;
  /**
   * The day this number was read off its page, when that differs from the day
   * the source itself was read. Plan §5.2's first date; the second is the
   * country's confirmation date, which lives on the review.
   */
  readOn?: string;
}

/* ---------------------------------------------------------------- Review -- */

/** A named human, with the role and the organisation they hold it with (plan §5.3). */
export interface Reviewer {
  name: string;
  role: string;
  organisation: string;
}

/**
 * Plan §5.3. Four states, and "unreviewed" is a valid, honest one — an
 * unreviewed emergency number is still shown, at full contrast, because
 * leaving somebody with nothing at the bad moment is worse by a wide margin.
 *
 * "reviewed-no-number" is a real signed answer: a guide saying "there is no
 * number here that works" is information, and it is shown in their words.
 */
export type EmergencyReview =
  | { state: "unreviewed" }
  | {
      state: "reviewed";
      /** Plan §5.2's second date: the day a human who works there confirmed it. */
      confirmedOn: string;
      reviewers: Reviewer[];
      /** "Nepal, Khumbu, spring trekking season" is a scope. "Nepal" is not. */
      scope: string;
    }
  | {
      state: "reviewed-no-number";
      confirmedOn: string;
      reviewers: Reviewer[];
      scope: string;
      /** Their own words for why there is no number worth holding. */
      reason: string;
    };

/**
 * A country's numbers, held once (plan §5.1). There is exactly one Italian 112
 * in this codebase and it is here; mountain records keep only their own lines.
 */
export interface CountryEmergency {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  name: string;
  numbers: EmergencyNumber[];
  review: EmergencyReview;
  /**
   * Shown above the numbers, never on one row (plan §5.9): a warning that sits
   * on the second number is read under a call button built from the first.
   */
  warnings?: string[];
  /** What ICEFALL does not hold for this country, named rather than left silent. */
  gaps?: string[];
}

/**
 * A country ICEFALL deliberately holds nothing for, with the reason (plan §5.1).
 * Not a silent hole, and never a guess.
 */
export interface EmergencyGap {
  code: string;
  name: string;
  reason: string;
  /** The mountains this gap actually bites on. */
  mountainIds: string[];
}

/** A named body that turns up. Never "the authorities", never "local rescue". */
export interface Responder {
  name: string;
  /** What they actually do, in one clause. */
  role: string;
  source: Source;
}

/**
 * Four different things get called a "ceiling" and they are not the same
 * number, so the kind is part of the record rather than a footnote.
 *
 *   highest-recorded-rescue  somebody has done it, once, in good conditions.
 *                            NOT what you should expect.
 *   routine-operating-limit  where missions are normally flown to.
 *   highest-landing-site     the top of the published landing sites.
 *   stated-maximum-landing   a maximum the operator states outright.
 */
export type CeilingKind =
  | "highest-recorded-rescue"
  | "routine-operating-limit"
  | "highest-landing-site"
  | "stated-maximum-landing";

export interface Ceiling {
  metres: number;
  kind: CeilingKind;
  /** What the source says. Nothing added, nothing rounded up. */
  statement: string;
  source: Source;
}

export const CEILING_KIND_LABEL: Record<CeilingKind, string> = {
  "highest-recorded-rescue": "Highest rescue ever flown here",
  "routine-operating-limit": "Normally flown as high as",
  "highest-landing-site": "Highest landing site",
  "stated-maximum-landing": "Stated maximum landing altitude",
};

export type HelicopterAvailability =
  | "flown"
  /** Flown, but the operator itself says it cannot be relied on. */
  | "flown-not-guaranteed"
  | "not-recorded";

export interface HelicopterLimit {
  statement: string;
  source: Source;
}

export interface HelicopterRecord {
  availability: HelicopterAvailability;
  /** Who flies it, named, or null where ICEFALL has not established it. */
  operator: string | null;
  /** May be empty. An empty list means no ceiling is published, not no limit. */
  ceilings: Ceiling[];
  /** Operating restrictions the operator publishes — daylight, weather, pairs. */
  limits?: HelicopterLimit[];
}

/** Who pays. "conditional" is the commonest answer in the Alps and needs saying. */
export type ChargingAnswer =
  | { kind: "free"; statement: string; source: Source }
  | { kind: "charged"; statement: string; source: Source }
  | { kind: "conditional"; statement: string; source: Source }
  | { kind: "not-recorded" };

/**
 * "compulsory" means a rule says so. "effectively-compulsory" means no rule
 * says so but you will not get on the mountain without it — a deposit, an
 * operator requirement, a permit condition. The two must not collapse.
 */
export type InsuranceAnswer =
  | { kind: "compulsory"; statement: string; source: Source }
  | { kind: "effectively-compulsory"; statement: string; source: Source }
  | { kind: "advised"; statement: string; source: Source }
  | { kind: "not-recorded" };

/** Two sources, one question, different answers. Both kept. */
export interface Disagreement {
  about: string;
  positions: { statement: string; source: Source }[];
}

export interface MountainRescueRecord {
  mountainId: string;
  /** ISO 3166-1 alpha-2 of the country whose numbers this mountain answers to. */
  countryCode: string;
  /**
   * The other countries the mountain stands in. Mont Blanc and the Matterhorn
   * have a border across them, and which service you get depends on which side
   * of the ridge you are on — which their caveats say in words.
   */
  alsoCountryCodes?: string[];
  /** The one-line answer to "who comes". */
  summary: string;
  /**
   * The country's numbers followed by this mountain's own lines. Built at
   * module load from `countryCode` + `localNumbers`, so the same national
   * number cannot drift between two mountains.
   */
  numbers: EmergencyNumber[];
  /** This mountain's own lines only — the Chamonix landline, the ranger station, the radio. */
  localNumbers?: EmergencyNumber[];
  /** Shown above the numbers: "there is no phone signal on this mountain" (plan §5.9). */
  warnings?: string[];
  responders: Responder[];
  helicopter: HelicopterRecord;
  charging: ChargingAnswer;
  insurance: InsuranceAnswer;
  disagreements?: Disagreement[];
  /**
   * Anything a reader would otherwise be entitled to assume, wrongly. Kept as
   * plain sentences to match `mountainCosts.ts`; each names its source in its
   * own prose rather than carrying a field.
   */
  caveats?: string[];
  /**
   * Pages a caveat above quotes that no structured field references.
   *
   * WITHOUT THIS FIELD THOSE URLS NEVER REACH THE READER. A caveat that says
   * "National Parks Traveler reports…" or "the FCDO warns…" is making a sourced
   * claim, and rule one of this app is that a sourced claim carries the page it
   * came from, one tap away. `sourcesIn()` folds these in so the sources row is
   * complete rather than complete-looking.
   */
  extraSources?: Source[];
}

/* -------------------------------------------------------------------------- */
/* Sources, named once and reused                                              */
/* -------------------------------------------------------------------------- */

const READ = "2026-09-11";
/** The Swiss re-sourcing of plan §5.9 was read on this day, not the file's first day. */
const READ_CH = "2026-09-15";

const S = {
  fcdoSwitzerlandHealth: {
    label: "FCDO travel advice — Switzerland, health",
    url: "https://www.gov.uk/foreign-travel-advice/switzerland/health",
    kind: "issuer",
    checked: READ_CH,
  },
  fcdoSwitzerlandSafety: {
    label: "FCDO travel advice — Switzerland, safety and security",
    url: "https://www.gov.uk/foreign-travel-advice/switzerland/safety-and-security",
    kind: "issuer",
    checked: READ_CH,
  },
  ec112: {
    label: "European Commission — 112, the EU's emergency phone number",
    url: "https://digital-strategy.ec.europa.eu/en/policies/112",
    kind: "issuer",
    checked: READ,
  },
  fcdoNepal: {
    label: "FCDO travel advice — Nepal",
    url: "https://www.gov.uk/foreign-travel-advice/nepal",
    kind: "issuer",
    checked: READ,
  },
  fcdoNepalSafety: {
    label: "FCDO travel advice — Nepal, safety and security",
    url: "https://www.gov.uk/foreign-travel-advice/nepal/safety-and-security",
    kind: "issuer",
    checked: READ,
  },
  fcdoPakistan: {
    label: "FCDO travel advice — Pakistan",
    url: "https://www.gov.uk/foreign-travel-advice/pakistan",
    kind: "issuer",
    checked: READ,
  },
  fcdoTanzania: {
    label: "FCDO travel advice — Tanzania",
    url: "https://www.gov.uk/foreign-travel-advice/tanzania",
    kind: "issuer",
    checked: READ,
  },
  fcdoArgentina: {
    label: "FCDO travel advice — Argentina",
    url: "https://www.gov.uk/foreign-travel-advice/argentina",
    kind: "issuer",
    checked: READ,
  },
  fcdoUsa: {
    label: "FCDO travel advice — USA",
    url: "https://www.gov.uk/foreign-travel-advice/usa",
    kind: "issuer",
    checked: READ,
  },
  fcdoGreece: {
    label: "FCDO travel advice — Greece",
    url: "https://www.gov.uk/foreign-travel-advice/greece",
    kind: "issuer",
    checked: READ,
  },
  fcdoMorocco: {
    label: "FCDO travel advice — Morocco",
    url: "https://www.gov.uk/foreign-travel-advice/morocco",
    kind: "issuer",
    checked: READ,
  },
  fcdoMoroccoSafety: {
    label: "FCDO travel advice — Morocco, safety and security",
    url: "https://www.gov.uk/foreign-travel-advice/morocco/safety-and-security",
    kind: "issuer",
    checked: READ,
  },
  hra: {
    label: "Himalayan Rescue Association Nepal — about us",
    url: "https://www.himalayanrescue.org/about-us",
    kind: "issuer",
    checked: READ,
  },
  ktmPostBill: {
    label: "Kathmandu Post — upper house passes tourism bill, 14 February 2026",
    url: "https://kathmandupost.com/money/2026/02/14/upper-house-passes-tourism-bill-with-tougher-everest-rules",
    kind: "secondary",
    checked: READ,
  },
  verticalMag: {
    label: "Vertical Magazine — highest helicopter rescue on Everest",
    url: "https://verticalmag.com/press-releases/maurizio-folini-named-pilot-of-highest-helicopter-rescue-on/",
    kind: "secondary",
    checked: READ,
  },
  alpineRescueNepal: {
    label: "Alpine Rescue Service, Kathmandu — long-line rescue",
    url: "https://alpine-rescue.com/longline-rescue/",
    kind: "secondary",
    checked: READ,
  },
  askari: {
    label: "Askari Aviation — rescue FAQs",
    url: "https://askariaviation.com/faqs/",
    kind: "issuer",
    checked: READ,
  },
  gypsyHeli: {
    label: "Gypsy Traces and Tours — heli rescue in Pakistan",
    url: "https://gypsytours.pk/travel/heli-rescue-in-pakistan/",
    kind: "secondary",
    checked: READ,
  },
  trekMedicsTz: {
    label: "Trek Medics — Global EMS Database, Tanzania",
    url: "https://trekmedics.org/database/tanzania-2/",
    kind: "secondary",
    checked: READ,
  },
  tranquilKili: {
    label: "Tranquil Kilimanjaro — Kilimanjaro helicopter rescue",
    url: "https://www.tranquilkilimanjaro.com/kilimanjaro-helicopter-rescue/",
    kind: "secondary",
    checked: READ,
  },
  kiliBaseSar: {
    label: "Kili Base Adventures — Kilimanjaro SAR",
    url: "https://www.kilibaseadventures.com/kilimanjaro_search_rescue.php",
    kind: "secondary",
    checked: READ,
  },
  kiliFees: {
    label: "Operator-published TANAPA fee schedules",
    url: "https://altezzatravel.com/articles/kilimanjaro-park-fees",
    kind: "secondary",
    checked: READ,
  },
  pghm: {
    label: "PGHM Chamonix — official site",
    url: "https://www.pghm-chamonix.com/",
    kind: "issuer",
    checked: READ,
  },
  senatSecours: {
    label:
      "Sénat (France) — question écrite, facturation des secours de montagne, 2025",
    url: "https://www.senat.fr/questions/base/2025/qSEQ250203383.html",
    kind: "issuer",
    checked: READ,
  },
  vdaTariffs: {
    label: "Valledaostaglocal — elisoccorso, chi paga, 19 August 2026",
    url: "https://www.valledaostaglocal.it/2026/08/19/leggi-notizia/argomenti/cronaca-4/articolo/guardia-di-finanza-soccorso-ingiustificato-chi-lo-provoca-dovra-pagare-in-valle-daosta-un.html",
    kind: "secondary",
    checked: READ,
  },
  rega1414: {
    label: "Rega — emergency number 1414",
    url: "https://www.rega.ch/en/emergency-number-1414",
    kind: "issuer",
    checked: READ,
  },
  regaQa: {
    label: "Rega — questions and answers",
    url: "https://www.rega.ch/en/questions-and-answers",
    kind: "issuer",
    checked: READ,
  },
  regaEiger: {
    label: "Rega — Rettung aus der Eigernordwand, 3 May 2025",
    url: "https://www.rega.ch/aktuell/neues-aus-der-rega-welt/detailseite/rega-rettet-zwei-bergsteiger-aus-eigernordwand",
    kind: "issuer",
    checked: READ,
  },
  zermattNumbers: {
    // Secondary, not issuer: a tourist board is not the body that answers a
    // national police line (plan §5.9).
    label: "Zermatt Tourism — emergency numbers",
    url: "https://zermatt.swiss/en/info/emergency-numbers",
    kind: "secondary",
    checked: READ,
  },
  zermattAirZermatt: {
    label: "Zermatt Tourism — Air Zermatt",
    url: "https://zermatt.swiss/en/p/air-zermatt-01tVj000005DiWjIAK",
    kind: "issuer",
    checked: READ,
  },
  npsMountaineering: {
    label: "US National Park Service — Denali mountaineering",
    url: "https://www.nps.gov/dena/planyourvisit/mountaineering.htm",
    kind: "issuer",
    checked: READ,
  },
  npsFee: {
    label: "US National Park Service — Denali special mountaineering use fee",
    url: "https://www.nps.gov/dena/learn/news/mountaineering-use-fee.htm",
    kind: "issuer",
    checked: READ,
  },
  nps19600: {
    label:
      "US National Park Service — climber rescued from 19,600 feet, May 2024",
    url: "https://www.nps.gov/dena/learn/news/climber-rescued-from-19-600-feet-on-denali-may-2024.htm",
    kind: "issuer",
    checked: READ,
  },
  nptSar: {
    label: "National Parks Traveler — should the rescued help pay the bills?",
    url: "https://www.nationalparkstraveler.org/2008/04/national-park-search-and-rescue-it-time-bill-rescued",
    kind: "secondary",
    checked: READ,
  },
  uiaaAconcagua: {
    label: "UIAA Mountain Medicine — Aconcagua",
    url: "https://www.theuiaa.org/mountain-medicine/aconcagua/",
    kind: "secondary",
    checked: READ,
  },
  mendozaHeli: {
    label:
      "Gobierno de Mendoza — helicópteros en acción, rescate y traslado médico",
    url: "https://www.mendoza.gov.ar/prensa/helicopteros-en-accion-rescate-y-traslado-medico-por-la-policia-de-mendoza/",
    kind: "issuer",
    checked: READ,
  },
  olympusSar: {
    label: "ProtoThema English — Mount Olympus search, 21 May 2026",
    url: "https://en.protothema.gr/2026/05/21/search-efforts-continue-for-missing-25-year-old-mountaineer-on-mount-olympus/",
    kind: "secondary",
    checked: READ,
  },
  grzs: {
    label: "Gorska reševalna zveza Slovenije (GRZS)",
    url: "https://www.grzs.si/en/",
    kind: "issuer",
    checked: READ,
  },
  grzsCosts: {
    label: "Erjavčeva koča — mountain rescue is free only in Slovenia",
    url: "https://www.erjavcevakoca.com/mountain-rescue-is-free-only-in-slovenia/",
    kind: "secondary",
    checked: READ,
  },
  toubkalAvalanche: {
    label: "Morocco World News — Toubkal avalanche recovery, January 2026",
    url: "https://www.moroccoworldnews.com/2026/01/276010/morocco-recovers-three-victims-after-deadly-toubkal-avalanche/",
    kind: "secondary",
    checked: READ,
  },
} satisfies Record<string, Source>;

/* -------------------------------------------------------------------------- */
/* Shared national records                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Nepal's numbers are national, so Everest and Annapurna share them. The 112
 * that works across the EU does NOT apply here, which is exactly why these are
 * written out per country instead of assumed.
 */
const NEPAL_NUMBERS: EmergencyNumber[] = [
  { number: "100", label: "Police", contact: "dial", source: S.fcdoNepal },
  {
    number: "1144",
    label: "Tourist police",
    contact: "dial",
    note: "The FCDO singles this line out for good English.",
    source: S.fcdoNepal,
  },
  {
    number: "102",
    label: "Ambulance",
    contact: "dial",
    note: "The FCDO adds that there is no central public ambulance service — some private providers operate in the main cities, and in an emergency you are told to call the nearest hospital.",
    source: S.fcdoNepal,
  },
  { number: "101", label: "Fire", contact: "dial", source: S.fcdoNepal },
];

const NEPAL_INSURANCE: InsuranceAnswer = {
  kind: "compulsory",
  statement:
    "Nepal's Integrated Tourism Bill, passed by the upper house in February 2026, requires the agency running an expedition to hold insurance covering search and rescue, medical treatment, personal accident and management of a body. Separately, the FCDO tells travellers to make sure their own insurance covers mountain rescue services and helicopter costs.",
  source: S.ktmPostBill,
};

const PAKISTAN_NUMBERS: EmergencyNumber[] = [
  {
    number: "1122",
    label: "Ambulance and fire",
    contact: "dial",
    note: "The FCDO warns that in remote or mountainous regions an ambulance could take over an hour, because of poor road access and limited availability.",
    source: S.fcdoPakistan,
  },
  { number: "15", label: "Police", contact: "dial", source: S.fcdoPakistan },
];

/** Both Karakoram peaks are served by the same aviation arrangement. */
const PAKISTAN_HELICOPTER: HelicopterRecord = {
  availability: "flown-not-guaranteed",
  operator: "Pakistan Army Aviation, on hire, coordinated by Askari Aviation",
  ceilings: [
    {
      metres: 5000,
      kind: "stated-maximum-landing",
      statement:
        "A Pakistani operator states the maximum landing height as 5,000 m, provided there is a suitable landing place, and advises moving a casualty down to that altitude for a quicker evacuation. Askari Aviation itself publishes no such figure.",
      source: S.gypsyHeli,
    },
  ],
  limits: [
    {
      statement:
        "Askari Aviation states in its own FAQ that rescue services are not guaranteed, because Pakistan Army Aviation only provides resources when they are not committed to operational duties.",
      source: S.askari,
    },
    {
      statement:
        "Flying in the mountains is limited to between half an hour after sunrise and one hour before sunset. There is no night rescue.",
      source: S.askari,
    },
    {
      statement:
        "Single-engine helicopters fly in pairs over glaciated and snow-bound areas above 10,000 ft, which is part of why a mission needs two aircraft to be free.",
      source: S.askari,
    },
  ],
};

const PAKISTAN_INSURANCE: InsuranceAnswer = {
  kind: "effectively-compulsory",
  statement:
    "No law names it, but a rescue cannot be launched for somebody who is not registered with Askari Aviation, and registration means a cash security deposit, a bank guarantee from the local tour operator, or a written guarantee from your country's diplomatic mission in Pakistan. The deposit is refundable less USD 300 in service charges.",
  source: S.askari,
};

/**
 * Plan §5.9, first fix: these are national numbers and three of them were cited
 * to a Valais tourist board — on the Eiger, 100 km away in another canton. 144
 * and 112 now come off the FCDO's own Switzerland page, read 15 September 2026.
 * 117 has no national page ICEFALL has read, and says so on the row rather than
 * being dropped: a police number nobody has re-sourced still works.
 */
const SWISS_NUMBERS: EmergencyNumber[] = [
  {
    number: "1414",
    label: "Rega — Swiss Air-Rescue",
    contact: "dial",
    note: "Rega's operations centre coordinates missions around the clock. This is the number for medical assistance by air in Switzerland.",
    source: S.rega1414,
  },
  {
    number: "144",
    label: "Ambulance",
    contact: "dial",
    note: "The FCDO's advice for Switzerland is to dial 112 or 144 and ask for an ambulance.",
    source: S.fcdoSwitzerlandHealth,
    readOn: READ_CH,
  },
  {
    number: "117",
    label: "Police",
    contact: "dial",
    note: "ICEFALL has not found a Swiss federal page for this number that it could read. It is held on a cantonal tourist board's page.",
    source: S.zermattNumbers,
  },
  {
    number: "112",
    label: "European emergency number",
    contact: "dial",
    note: "The FCDO gives 112 alongside 144 for Switzerland.",
    source: S.fcdoSwitzerlandHealth,
    readOn: READ_CH,
  },
  {
    number: "118",
    label: "Fire",
    contact: "dial",
    note: "The FCDO gives 118 as the fire department, in its wildfire advice.",
    source: S.fcdoSwitzerlandSafety,
    readOn: READ_CH,
  },
];

const SWISS_CHARGING: ChargingAnswer = {
  kind: "charged",
  statement:
    "Rega states that who pays is determined after the mission and that, as a rule, the people rescued or their insurer pay. A Rega helicopter mission costs around CHF 4,500 on average without extra specialists; a search or avalanche mission involving many people can run into tens of thousands.",
  source: S.regaQa,
};

const SWISS_INSURANCE: InsuranceAnswer = {
  kind: "advised",
  statement:
    "Rega is a private non-profit funded by voluntary contributions. It can waive or reduce a mission's costs for its patrons where an insurer is not liable — last year it waived over CHF 14 million that insurers did not cover — but patronage is a donation, not an insurance policy, and the waiver is at Rega's discretion.",
  source: S.regaQa,
};

/* -------------------------------------------------------------------------- */
/* Countries — where the numbers live (plan §5.1)                              */
/* -------------------------------------------------------------------------- */

/*
 * NOTHING IN HERE HAS BEEN CONFIRMED BY ANYBODY WHO WORKS IN THESE COUNTRIES.
 * Every review below reads `unreviewed`, which is a valid state and is said out
 * loud on the screen. The numbers are still shown, at full contrast, and the
 * call button never greys: a two-year-old number that is very probably right
 * beats a disabled button (plan §5.4).
 */

const TANZANIA_NUMBERS: EmergencyNumber[] = [
  {
    number: "112",
    label: "Ambulance, fire, police",
    contact: "dial",
    note: "The FCDO's number for Tanzania.",
    source: S.fcdoTanzania,
  },
  {
    number: "114",
    label: "Ambulance (alternative)",
    contact: "dial",
    source: S.trekMedicsTz,
  },
];

const FRANCE_NUMBERS: EmergencyNumber[] = [
  {
    number: "112",
    label: "European emergency number",
    contact: "dial",
    note: "Free from fixed and mobile phones everywhere in the EU, and routed to the nearest appropriate service. This is the number the French authorities ask people to use.",
    source: S.ec112,
  },
];

const ITALY_NUMBERS: EmergencyNumber[] = [
  {
    number: "112",
    label: "European emergency number",
    contact: "dial",
    note: "Free everywhere in the EU, from fixed and mobile phones, routed to the appropriate local service.",
    source: S.ec112,
  },
];

const USA_NUMBERS: EmergencyNumber[] = [
  {
    number: "911",
    label: "Ambulance, fire, police",
    contact: "dial",
    source: S.fcdoUsa,
  },
];

const ARGENTINA_NUMBERS: EmergencyNumber[] = [
  { number: "911", label: "Police", contact: "dial", source: S.fcdoArgentina },
  { number: "107", label: "Ambulance", contact: "dial", source: S.fcdoArgentina },
  { number: "100", label: "Fire", contact: "dial", source: S.fcdoArgentina },
];

const GREECE_NUMBERS: EmergencyNumber[] = [
  {
    number: "112",
    label: "Ambulance, fire, police",
    contact: "dial",
    note: "The single European emergency number, free from any phone, and the number Greek rescues on Olympus are raised on. The FCDO adds that calling 999 from a UK mobile in Greece transfers automatically to the Greek emergency services.",
    source: S.fcdoGreece,
  },
];

const SLOVENIA_NUMBERS: EmergencyNumber[] = [
  {
    number: "112",
    label: "Emergency services, including mountain rescue",
    contact: "dial",
    note: "GRZS gives 112 as the number to call for a mountain accident in Slovenia.",
    source: S.grzs,
  },
];

const MOROCCO_NUMBERS: EmergencyNumber[] = [
  {
    number: "177",
    label: "Gendarmerie Royale",
    contact: "dial",
    note: "The gendarmerie covers rural Morocco, which is where Toubkal is. The FCDO lists it separately from the urban police number.",
    source: S.fcdoMorocco,
  },
  { number: "150", label: "Ambulance and fire", contact: "dial", source: S.fcdoMorocco },
  { number: "190", label: "Police", contact: "dial", source: S.fcdoMorocco },
];

const UNREVIEWED: EmergencyReview = { state: "unreviewed" };

export const COUNTRY_EMERGENCY: CountryEmergency[] = [
  { code: "NP", name: "Nepal", numbers: NEPAL_NUMBERS, review: UNREVIEWED },
  { code: "PK", name: "Pakistan", numbers: PAKISTAN_NUMBERS, review: UNREVIEWED },
  {
    code: "TZ",
    name: "Tanzania",
    numbers: TANZANIA_NUMBERS,
    review: UNREVIEWED,
    // Plan §5.9: this sat on the SECOND number. The first becomes the call button.
    warnings: [
      "Trek Medics records 112 and 114 as Tanzania's numbers and adds that outside Dar es Salaam they do not consistently work, and that no region of Tanzania has a government-provided emergency ambulance service.",
    ],
  },
  {
    code: "FR",
    name: "France",
    numbers: FRANCE_NUMBERS,
    review: UNREVIEWED,
    gaps: [
      "France's text-message emergency line, 114, is not in ICEFALL's data: no source has been read for it.",
    ],
  },
  {
    code: "IT",
    name: "Italy",
    numbers: ITALY_NUMBERS,
    review: UNREVIEWED,
    gaps: [
      "ICEFALL holds no Italian number behind 112 — no national mountain-rescue line, and nothing for the Soccorso Alpino services by region.",
    ],
  },
  {
    code: "CH",
    name: "Switzerland",
    numbers: SWISS_NUMBERS,
    review: UNREVIEWED,
    gaps: [
      "117 is still held on a cantonal tourist board's page. ICEFALL has not read a Swiss federal listing of it.",
    ],
  },
  { code: "US", name: "United States", numbers: USA_NUMBERS, review: UNREVIEWED },
  { code: "AR", name: "Argentina", numbers: ARGENTINA_NUMBERS, review: UNREVIEWED },
  {
    code: "GR",
    name: "Greece",
    numbers: GREECE_NUMBERS,
    review: UNREVIEWED,
    gaps: [
      "ICEFALL holds no direct number for the Hellenic Fire Service or for EMAK, the units that actually go up Olympus.",
    ],
  },
  { code: "SI", name: "Slovenia", numbers: SLOVENIA_NUMBERS, review: UNREVIEWED },
  { code: "MA", name: "Morocco", numbers: MOROCCO_NUMBERS, review: UNREVIEWED },
];

/** Countries ICEFALL deliberately holds nothing for, with the reason (plan §5.1). */
export const EMERGENCY_GAPS: EmergencyGap[] = [
  {
    code: "CN",
    name: "China",
    reason:
      "Three mountains in this app have a border across them and ICEFALL holds nothing for the northern side. Access there runs through a permitted operator, and in practice the number that reaches anybody is the operator's own. ICEFALL will not put a guessed number on the biggest button on the screen — ask your operator for theirs, and ask before you are on the mountain.",
    mountainIds: ["everest", "k2", "broad-peak"],
  },
];

const COUNTRY_BY_CODE = new Map(COUNTRY_EMERGENCY.map((c) => [c.code, c]));
const GAP_BY_CODE = new Map(EMERGENCY_GAPS.map((g) => [g.code, g]));

/** The country's numbers, or null where ICEFALL holds none. Never guessed. */
export function countryEmergency(code: string | null | undefined): CountryEmergency | null {
  if (!code) return null;
  return COUNTRY_BY_CODE.get(code.toUpperCase()) ?? null;
}

/** The named reason a country is empty, where there is one. */
export function emergencyGap(code: string | null | undefined): EmergencyGap | null {
  if (!code) return null;
  return GAP_BY_CODE.get(code.toUpperCase()) ?? null;
}

/* -------------------------------------------------------------------------- */
/* The records                                                                 */
/* -------------------------------------------------------------------------- */

/** A record as written below: its numbers are assembled from the country. */
type MountainRescueInput = Omit<MountainRescueRecord, "numbers">;

const RAW_RECORDS: MountainRescueInput[] = [
  /* -------------------------------------------------------------- Everest */
  {
    mountainId: "everest",
    countryCode: "NP",
    summary:
      "Your own expedition agency is legally responsible for rescuing you. Above roughly 6,400 m no helicopter is coming as a matter of routine.",
    responders: [
      {
        name: "Your trekking or expedition agency",
        role: "Nepal's 2026 tourism bill puts responsibility for search, rescue and treatment on the agency running the expedition. Where the agency cannot do it, the Department of Tourism coordinates with other government bodies on request.",
        source: S.ktmPostBill,
      },
      {
        name: "Himalayan Rescue Association Nepal",
        role: "A volunteer non-profit formed in 1973. It runs the Everest Base Camp clinic at 5,350 m and the Pheriche aid post at 4,250 m — the nearest doctors on this side of the mountain.",
        source: S.hra,
      },
      {
        name: "Commercial helicopter operators, Kathmandu",
        role: "Rescue flying in Nepal is done by private companies. There is no government mountain-rescue helicopter to call.",
        source: S.alpineRescueNepal,
      },
    ],
    helicopter: {
      availability: "flown",
      operator:
        "Private Nepali operators (Airbus H125 / Eurocopter AS350 class)",
      ceilings: [
        {
          metres: 6400,
          kind: "routine-operating-limit",
          statement:
            "A Kathmandu rescue operator states that most Everest helicopter rescues are conducted up to Camp 2 at about 6,400 m, which it calls its primary high-altitude extraction zone, and that routine rescues above it are rare because the air is too thin to give the lift for a hover extraction. It describes extractions from Camp 3 at 7,200 m as extremely rare and attempted only in ideal weather and weight conditions.",
          source: S.alpineRescueNepal,
        },
        {
          metres: 7800,
          kind: "highest-recorded-rescue",
          statement:
            "On 21 May 2013 Maurizio Folini flew a Eurocopter AS350 B3 to 7,800 m on Everest to long-line an injured climber out — reported as the highest helicopter rescue ever performed on the mountain. It is a record, not a service.",
          source: S.verticalMag,
        },
      ],
    },
    charging: { kind: "not-recorded" },
    insurance: NEPAL_INSURANCE,
    caveats: [
      "The summit stands more than a kilometre above the highest helicopter rescue ever flown here, and well over two kilometres above where helicopters routinely go. From the South Col upwards, getting down is done on foot or not at all.",
      "The FCDO warns of a known scam in Nepal in which guides take inexperienced trekkers too high too fast and then call in expensive helicopter evacuations they take a cut of.",
      "ICEFALL has not recorded who pays for a rescue on Everest, or what a flight is billed at. The FCDO's general figure for remote helicopter evacuation in Nepal is £1,000 to £2,000 or more per flying hour.",
    ],
    extraSources: [S.fcdoNepalSafety],
  },

  /* ------------------------------------------------------------ Annapurna */
  {
    mountainId: "annapurna",
    countryCode: "NP",
    summary:
      "The same private-helicopter, agency-responsible system as Everest, with the HRA's Manang aid post at 3,550 m as the nearest doctor.",
    responders: [
      {
        name: "Your trekking or expedition agency",
        role: "Nepal's 2026 tourism bill puts responsibility for search, rescue and treatment on the agency running the expedition, with the Department of Tourism arranging it for independent visitors who have none.",
        source: S.ktmPostBill,
      },
      {
        name: "Himalayan Rescue Association Nepal",
        role: "Runs the Manang aid post at 3,550 m, on the Annapurna circuit — one of two permanent HRA posts in the country.",
        source: S.hra,
      },
      {
        name: "Commercial helicopter operators, Kathmandu",
        role: "Rescue flying is private here, as everywhere in Nepal.",
        source: S.alpineRescueNepal,
      },
    ],
    helicopter: {
      availability: "flown",
      operator:
        "Private Nepali operators, historically with Swiss crews on the hardest missions",
      ceilings: [
        {
          metres: 6900,
          kind: "highest-recorded-rescue",
          statement:
            "On 29 April 2010 a Fishtail Air and Air Zermatt team performed a rescue at 6,900 m on Annapurna — at the time the highest helicopter rescue on record anywhere. It held that record for three years.",
          source: S.verticalMag,
        },
      ],
    },
    charging: { kind: "not-recorded" },
    insurance: NEPAL_INSURANCE,
    caveats: [
      "The record above was one flight in good conditions by an exceptional crew. ICEFALL has found no published routine operating ceiling for Annapurna and does not have one to offer.",
      "The summit stands over a kilometre higher than the highest rescue ever flown on this mountain.",
    ],
  },

  /* ------------------------------------------------------------------- K2 */
  {
    mountainId: "k2",
    countryCode: "PK",
    summary:
      "The Pakistan Army flies the helicopters, Askari Aviation coordinates them, and Askari says outright that rescue is not guaranteed.",
    responders: [
      {
        name: "Pakistan Army Aviation",
        role: "Flies the aircraft. Askari Aviation coordinates aerial rescue in the humanitarian interest using Army Aviation on hire.",
        source: S.askari,
      },
      {
        name: "Askari Aviation Pvt. Ltd.",
        role: "The body you must be registered with before a rescue can be launched. Registration is through Askari directly, the Pakistan Association of Tour Operators, or a registered local tour operator.",
        source: S.askari,
      },
    ],
    helicopter: PAKISTAN_HELICOPTER,
    charging: {
      kind: "charged",
      statement:
        "Rescue is paid for out of a security deposit lodged before the expedition starts, returned less USD 300 in Askari Aviation service charges if it is not used.",
      source: S.askari,
    },
    insurance: PAKISTAN_INSURANCE,
    caveats: [
      "The only maximum landing altitude ICEFALL could find for Pakistan — 5,000 m — comes from an operator, not from Askari Aviation or the Army. K2's summit is more than 3,600 m above it. Treat the figure as indicative and ask your operator.",
      "No night rescue, and no rescue while the aircraft are committed elsewhere. Both of those are Askari Aviation's own words, not ICEFALL's inference.",
      "The FCDO notes that your travel insurance may be invalidated if you do not hold the correct mountaineering permits.",
    ],
  },

  /* ----------------------------------------------------------- Broad Peak */
  {
    mountainId: "broad-peak",
    countryCode: "PK",
    summary:
      "Same Baltoro, same arrangement as K2: Pakistan Army helicopters, coordinated by Askari Aviation, not guaranteed.",
    responders: [
      {
        name: "Pakistan Army Aviation",
        role: "Flies the aircraft, on hire, when not committed to operational duties.",
        source: S.askari,
      },
      {
        name: "Askari Aviation Pvt. Ltd.",
        role: "Coordinates the rescue and holds the security deposit that pays for it.",
        source: S.askari,
      },
    ],
    helicopter: PAKISTAN_HELICOPTER,
    charging: {
      kind: "charged",
      statement:
        "Paid from the security deposit lodged before the expedition, refundable less USD 300 in service charges.",
      source: S.askari,
    },
    insurance: PAKISTAN_INSURANCE,
    caveats: [
      "The 5,000 m landing figure is an operator's, not the Army's or Askari's. Broad Peak's summit is more than 3,000 m above it.",
      "ICEFALL has recorded nothing specific to Broad Peak. Everything here is the national arrangement that also covers K2, shown because the two peaks share one glacier, one aviation contract and one base-camp approach — not because they were researched separately.",
    ],
  },

  /* ---------------------------------------------------------- Kilimanjaro */
  {
    mountainId: "kilimanjaro",
    countryCode: "TZ",
    summary:
      "The park's own team carries you down on a stretcher. A helicopter, if one comes at all, meets you well below the summit.",
    responders: [
      {
        name: "Kilimanjaro National Park (KINAPA) rescue team",
        role: "Ground rescue — rangers and a stretcher, on foot. The compulsory USD 20 rescue fee funds this team and explicitly does not cover helicopter evacuation.",
        source: S.kiliFees,
      },
      {
        name: "A private helicopter search-and-rescue company",
        role: "Helicopter evacuation on Kilimanjaro is a private service arranged through your operator and your insurer, not a park or government function.",
        source: S.tranquilKili,
      },
    ],
    helicopter: {
      availability: "flown",
      operator: "Private (Kilimanjaro SAR, Airbus AS350 B3, based at Moshi)",
      ceilings: [
        {
          metres: 4900,
          kind: "highest-landing-site",
          statement:
            "One operator states the highest suitable landing is the Kosovo Hut at 4,900 m.",
          source: S.tranquilKili,
        },
        {
          metres: 4600,
          kind: "highest-landing-site",
          statement:
            "Another states that a landing point was established at 4,600 m around Barafu in 2018, with evacuation points at Horombo, Barranco, Barafu, Kosovo, Stella, Millennium and Shira.",
          source: S.kiliBaseSar,
        },
      ],
    },
    charging: {
      kind: "conditional",
      statement:
        "The USD 20 park rescue fee is compulsory and buys ground rescue. A helicopter is a separate, chargeable, private flight settled through your insurer.",
      source: S.kiliFees,
    },
    insurance: {
      kind: "effectively-compulsory",
      statement:
        "Operators require a policy covering emergency evacuation to 6,000 m — above Uhuru Peak — because a standard travel policy will not pay for a helicopter on this mountain.",
      source: S.tranquilKili,
    },
    disagreements: [
      {
        about: "The highest altitude a helicopter can land on Kilimanjaro",
        positions: [
          {
            statement: "4,900 m, the Kosovo Hut.",
            source: S.tranquilKili,
          },
          {
            statement:
              "4,600 m, the landing point agreed at Barafu in 2018.",
            source: S.kiliBaseSar,
          },
        ],
      },
      {
        about: "Whether Kilimanjaro SAR is still operating",
        positions: [
          {
            statement:
              "Operator pages dated early 2026 describe the service as available, with helicopters at Moshi airborne within five minutes of a distress call.",
            source: S.tranquilKili,
          },
          {
            statement:
              "Other operator pages dated later in 2026 describe Kilimanjaro SAR as permanently closed and point climbers to AMREF Flying Doctors instead. ICEFALL could not establish which is current from any source that is not a guiding company.",
            source: S.kiliBaseSar,
          },
        ],
      },
    ],
    caveats: [
      "Uhuru Peak is roughly a kilometre above the highest landing site either source names. Between the summit and that landing site you are carried, or you walk.",
      "Tanzania has no government ambulance service. Whatever comes for you is private and arranged by your operator.",
    ],
  },

  /* ----------------------------------------------------------- Mont Blanc */
  {
    mountainId: "mont-blanc",
    countryCode: "FR",
    alsoCountryCodes: ["IT"],
    summary:
      "On the French side, gendarmes of the PGHM, by helicopter, and the state pays. Over the Italian border a different service and a different bill.",
    localNumbers: [
      {
        number: "+33 4 50 53 16 89",
        label: "PGHM Chamonix, direct",
        contact: "dial",
        // Plan §5.9: the spaces make a malformed tel: link, so the link form is stored.
        dial: "+33450531689",
        note: "Answered around the clock, seven days a week.",
        source: S.pghm,
      },
    ],
    responders: [
      {
        name: "PGHM Chamonix (Peloton de Gendarmerie de Haute Montagne)",
        role: "A team of gendarme-rescuers, 24 hours a day, 365 days a year. They perform over 1,300 rescues a year in the area, 97% of them helicopter-assisted.",
        source: S.pghm,
      },
      {
        name: "Soccorso Alpino Valdostano (Italian side)",
        role: "Covers the Italian flank, out of Courmayeur and the Aosta valley, under a different cost regime from the French one.",
        source: S.vdaTariffs,
      },
    ],
    helicopter: {
      availability: "flown",
      operator: "Gendarmerie aircraft flown for the PGHM",
      ceilings: [],
    },
    charging: {
      kind: "conditional",
      statement:
        "In France, rescue mounted by the state is free: the direct costs fall on the departmental fire and rescue service, and the law lets a commune recover costs only for alpine skiing and cross-country skiing, under article R. 2321-6 of the CGCT. Mountaineering on Mont Blanc is not on that list. On the Italian side of the frontier, Valle d'Aosta charges for calls it judges inappropriate — up to about EUR 3,500 for a non-resident, being a EUR 100 call charge plus EUR 74.80 or EUR 137 per minute of flying depending on the aircraft — while a genuine emergency is not billed.",
      source: S.senatSecours,
    },
    insurance: { kind: "not-recorded" },
    caveats: [
      "This mountain has a border across it. Which country's rescue service and which country's bill you get depends on which side of the ridge you are on when you make the call.",
      "ICEFALL has not recorded an operating ceiling for helicopters on Mont Blanc. The summit at 4,806 m is inside normal alpine helicopter operating altitudes, but that is a judgement rather than a published figure, and nothing here should be read as a promise that a helicopter can reach you.",
    ],
  },

  /* ----------------------------------------------------------- Matterhorn */
  {
    mountainId: "matterhorn",
    countryCode: "CH",
    alsoCountryCodes: ["IT"],
    summary:
      "Air Zermatt, out of Zermatt, coordinated through Rega on 1414 — and somebody is billed afterwards.",
    responders: [
      {
        name: "Air Zermatt",
        role: "Provides transport and rescue services for the Zermatt–Matterhorn destination, with a focus on the high mountains of Valais.",
        source: S.zermattAirZermatt,
      },
      {
        name: "Rega (Swiss Air-Rescue)",
        role: "Its operations centre takes the 1414 call and coordinates missions around the clock.",
        source: S.rega1414,
      },
    ],
    helicopter: {
      availability: "flown",
      operator: "Air Zermatt",
      ceilings: [],
    },
    charging: SWISS_CHARGING,
    insurance: {
      kind: "advised",
      statement:
        "Air Zermatt sells a rescue card on the explicit basis that it provides the safety your compulsory accident and health insurance does not. Rega patronage covers Air Zermatt missions on the same discretionary terms as its own.",
      source: S.zermattAirZermatt,
    },
    caveats: [
      "ICEFALL has not recorded a published helicopter ceiling for the Matterhorn.",
      "The Italian side of this mountain falls under Valle d'Aosta's rescue service and its tariffs, not Switzerland's.",
    ],
  },

  /* ---------------------------------------------------------------- Eiger */
  {
    mountainId: "eiger",
    countryCode: "CH",
    summary:
      "Rega's helicopter and mountain rescuers from Alpine Rettung Schweiz — winched onto the face, not landed on it.",
    responders: [
      {
        name: "Rega (Swiss Air-Rescue)",
        role: "Flies the aircraft and coordinates the mission from its own operations centre.",
        source: S.regaEiger,
      },
      {
        name: "Alpine Rettung Schweiz",
        role: "Supplies the mountain rescuers Rega lowers onto the face. In the May 2025 north-face rescue a rescuer was winched down to two stranded climbers and all three hoisted out to Kleine Scheidegg.",
        source: S.regaEiger,
      },
    ],
    helicopter: {
      availability: "flown",
      operator: "Rega (H145 D3)",
      ceilings: [],
      limits: [
        {
          statement:
            "On the north face the technique is the rescue winch, not a landing — there is nowhere to land. Rega describes lowering a rescuer to the climbers and hoisting all three out to an intermediate landing site at Kleine Scheidegg.",
          source: S.regaEiger,
        },
      ],
    },
    charging: SWISS_CHARGING,
    insurance: SWISS_INSURANCE,
    caveats: ["ICEFALL has not recorded a published helicopter ceiling for the Eiger."],
  },

  /* -------------------------------------------------------- Gran Paradiso */
  {
    mountainId: "gran-paradiso",
    countryCode: "IT",
    summary:
      "Valle d'Aosta's alpine rescue on 112. Free when you genuinely needed it, billed when the region decides you did not.",
    responders: [
      {
        name: "Soccorso Alpino Valdostano",
        role: "The Aosta valley's alpine rescue service, which operates the regional helicopter rescue on this side of the massif.",
        source: S.vdaTariffs,
      },
    ],
    helicopter: {
      availability: "flown",
      operator: "Regional helicopter rescue, Valle d'Aosta",
      ceilings: [],
    },
    charging: {
      kind: "conditional",
      statement:
        "Valle d'Aosta does not bill a call made in real need. It does bill inappropriate ones: about EUR 800 for a resident enrolled in the national health service, and up to about EUR 3,500 for a non-resident — a EUR 100 fixed call charge plus EUR 74.80 or EUR 137 per minute of flight depending on the aircraft. Inappropriate call-outs earned the region EUR 233,000 in 2024.",
      source: S.vdaTariffs,
    },
    insurance: { kind: "not-recorded" },
    caveats: [
      "These tariffs were read off a regional news report, not off the region's own published tariff schedule — ICEFALL could not extract the Soccorso Alpino Valdostano tariff PDF itself.",
      "The mountain also has a Piedmont flank, and ICEFALL has recorded nothing about rescue on that side.",
    ],
  },

  /* --------------------------------------------------------------- Denali */
  {
    mountainId: "denali",
    countryCode: "US",
    summary:
      "The park's own mountaineering rangers, and volunteer patrols camped high on the mountain — the closest thing in this list to a rescue service already up there with you.",
    // Plan §5.9: a coverage warning has to sit above the numbers, not on one row.
    warnings: [
      "There is no mobile coverage on most of the mountain, so in practice a rescue is raised by satellite messenger or radio.",
    ],
    localNumbers: [
      {
        number: "+1 907 733 2231",
        label: "Walter Harper Talkeetna Ranger Station",
        contact: "dial",
        dial: "+19077332231",
        note: "The NPS mountaineering staff who run the climbing programme and the rescues.",
        source: S.npsMountaineering,
      },
    ],
    responders: [
      {
        name: "NPS Denali mountaineering rangers",
        role: "The park's own climbing rangers run the response, with the park helicopter.",
        source: S.nps19600,
      },
      {
        name: "Ranger and volunteer patrols at the high camps",
        role: "The mountaineering fee pays to position patrol and rescue personnel, including volunteers, at critical high-altitude locations on the mountain — so the first responders are frequently already on the route.",
        source: S.npsFee,
      },
    ],
    helicopter: {
      availability: "flown",
      operator: "Denali National Park's own helicopter",
      ceilings: [
        {
          metres: 5974,
          kind: "highest-recorded-rescue",
          statement:
            "In May 2024 the park helicopter returned to the Football Field at 19,600 ft — about 5,974 m — with a short-haul rescue basket, once wind conditions allowed it.",
          source: S.nps19600,
        },
      ],
      limits: [
        {
          statement:
            "In that mission the constraint was wind rather than altitude: winds were too strong to conduct a short-haul basket extraction safely until conditions improved.",
          source: S.nps19600,
        },
      ],
    },
    /* Deliberately "not-recorded" and NOT "free". The NPS says on its own pages
       what the mountaineering fee pays for and never says whether a rescued
       climber is billed. The widely repeated secondary claim that they are not
       is kept in `caveats`, labelled, rather than promoted into the answer this
       file states as fact. */
    charging: { kind: "not-recorded" },
    insurance: { kind: "not-recorded" },
    caveats: [
      "The highest rescue this park has documented was flown 216 m below the summit — by far the smallest summit-to-ceiling gap of any mountain ICEFALL has recorded. It is one mission on one good day, not a service level.",
      "National Parks Traveler reports a long-standing interagency policy of not billing rescued climbers in US national parks. That is a secondary source and the NPS does not say it on any Denali page ICEFALL read, so this file does not state it as the answer.",
      "The mountaineering special use fee funds preventative search-and-rescue education, rescue training and the high-camp patrols. It is not a rescue insurance policy.",
    ],
    extraSources: [S.nptSar],
  },

  /* ------------------------------------------------------------ Aconcagua */
  {
    mountainId: "aconcagua",
    countryCode: "AR",
    summary:
      "Park rangers, a police rescue patrol living at 5,450 m, and a helicopter that cannot come higher than they are.",
    /*
     * Plan §5.9: this sentence sat on the radio row, below three national
     * numbers, the first of which becomes the big call button. On the record it
     * is read before any of them.
     */
    warnings: [
      "There is no phone signal on this mountain. The UIAA describes the rescue patrol as working by radio from Nido de Cóndores.",
    ],
    localNumbers: [
      {
        number: "VHF 142.800",
        label: "Aconcagua rescue patrol, by radio",
        contact: "radio",
        note: "The UIAA gives this as the frequency the patrol works on from Nido de Cóndores.",
        source: S.uiaaAconcagua,
      },
    ],
    responders: [
      {
        name: "Patrulla de Rescate, Policía de Mendoza",
        role: "A police rescue patrol of trained mountaineers, stationed at Nido de Cóndores at 5,450 m, working the normal route. The UIAA notes it will call on guides and porters when it is outnumbered.",
        source: S.uiaaAconcagua,
      },
      {
        name: "Park ranger service and the park medical service",
        role: "Rangers and doctors at the base camps. Above Camp 2, the UIAA says evacuation depends on the guides, climbers and porters who happen to be present, working with the rangers, medics and patrol.",
        source: S.uiaaAconcagua,
      },
      {
        name: "Mendoza provincial helicopter service",
        role: "The provincial government describes a helicopter service working alongside the rangers, the mountain rescue and assistance patrol and the provincial security system.",
        source: S.mendozaHeli,
      },
    ],
    helicopter: {
      availability: "flown",
      operator: "Contracted to the province of Mendoza",
      ceilings: [
        {
          metres: 5450,
          kind: "highest-landing-site",
          statement:
            "The UIAA states that the highest heliport is at Camp 2, Nido de Cóndores, at 5,450 m, and that pilots can fly there only when conditions are excellent.",
          source: S.uiaaAconcagua,
        },
      ],
    },
    charging: { kind: "not-recorded" },
    insurance: {
      kind: "compulsory",
      statement:
        "The UIAA records that since the 2022/23 season climbers must carry medical insurance covering helicopter evacuation for more than USD 5,000.",
      source: S.uiaaAconcagua,
    },
    disagreements: [
      {
        about: "Whether the permit already pays for the helicopter",
        positions: [
          {
            statement:
              "The UIAA describes insurance covering helicopter evacuation above USD 5,000 as a requirement climbers must carry themselves.",
            source: S.uiaaAconcagua,
          },
          {
            statement:
              "Mendoza's provincial press office describes the helicopter, medical service, rangers and rescue patrol as services provided within the park.",
            source: S.mendozaHeli,
          },
        ],
      },
    ],
    caveats: [
      "The summit is more than 1,500 m above the highest place a helicopter can land. From the Travesía or the Canaleta, the UIAA warns, a casualty may face a night out before anyone reaches them.",
    ],
  },

  /* --------------------------------------------------------- Mount Olympus */
  {
    mountainId: "mount-olympus",
    countryCode: "GR",
    summary:
      "The fire service out of Litochoro, with EMAK's specialist units, volunteers, and helicopters from the joint rescue centre.",
    responders: [
      {
        name: "Hellenic Fire Service, Litochoro",
        role: "Takes the call and provides the firefighters who go up. Litochoro is the station at the foot of the mountain.",
        source: S.olympusSar,
      },
      {
        name: "EMAK (Special Disaster Response Units), 2nd and 8th",
        role: "The fire service's specialist mountain search and rescue teams, deployed on Olympus alongside a regional drone unit.",
        source: S.olympusSar,
      },
      {
        name: "Hellenic Rescue Team volunteers, and helicopters from the Joint Rescue Coordination Centre",
        role: "Volunteers and aircraft join the larger searches.",
        source: S.olympusSar,
      },
    ],
    helicopter: {
      availability: "flown",
      operator: "Joint Rescue Coordination Centre",
      ceilings: [],
    },
    charging: { kind: "not-recorded" },
    insurance: { kind: "not-recorded" },
    caveats: [
      "This record was assembled from news reporting of a real search in May 2026, not from a Hellenic Fire Service publication. The units named are those reported as deployed; ICEFALL has not read an official statement of who is responsible for Olympus.",
      "ICEFALL has not recorded whether a rescue on Olympus is charged for, or whether any insurance is required.",
    ],
  },

  /* -------------------------------------------------------------- Triglav */
  {
    mountainId: "triglav",
    countryCode: "SI",
    summary:
      "Volunteer mountain rescuers on 112, in a country where the state pays for the helicopter and nobody sends you a bill.",
    responders: [
      {
        name: "Gorska reševalna zveza Slovenije (GRZS)",
        role: "The Mountain Rescue Association of Slovenia, in its own words voluntary help for people in accidents in the mountains and on difficult, inaccessible terrain. Its rescuers are volunteers.",
        source: S.grzs,
      },
    ],
    helicopter: {
      availability: "flown",
      operator: "State helicopter rescue, funded from the national budget",
      ceilings: [],
    },
    charging: {
      kind: "free",
      statement:
        "Slovenian mountain rescuers are volunteers funded largely by the Administration for Civil Protection and Disaster Relief, with helicopter rescue costs met from the state budget, and the Ministry of Defence's position is that a rescued person does not normally receive a bill. The law does allow costs to be recovered from somebody who caused an incident intentionally or negligently; twelve such claims were issued between 2006 and 2011, and none since a lawsuit was lost in 2011.",
      source: S.grzsCosts,
    },
    insurance: { kind: "not-recorded" },
    caveats: [
      "The cost position above comes from a secondary article quoting the Ministry of Defence, not from a government page ICEFALL read directly. GRZS's own site says nothing about who pays.",
      "Triglav's north face is the largest in the Julian Alps, and ICEFALL has recorded nothing about how a rescue is performed on it.",
    ],
  },

  /* -------------------------------------------------------------- Toubkal */
  {
    mountainId: "toubkal",
    countryCode: "MA",
    summary:
      "The Gendarmerie Royale on 177 — and for the serious incidents on Toubkal, the Royal Armed Forces.",
    responders: [
      {
        name: "Gendarmerie Royale",
        role: "The service that covers rural and mountain Morocco and takes the emergency call from the Toubkal massif.",
        source: S.fcdoMorocco,
      },
      {
        name: "Royal Armed Forces",
        role: "After the avalanche on the route to Toubkal on 18 January 2026, it was the Royal Armed Forces that announced the recovery of the three victims.",
        source: S.toubkalAvalanche,
      },
    ],
    helicopter: {
      availability: "not-recorded",
      operator: null,
      ceilings: [],
    },
    charging: { kind: "not-recorded" },
    insurance: {
      kind: "advised",
      statement:
        "The FCDO's advice for hiking in the Atlas is to hire a professional guide and to get comprehensive travel insurance that covers your planned activities. It sets no requirement beyond that.",
      source: S.fcdoMoroccoSafety,
    },
    caveats: [
      "This is the thinnest record in the file, and it is thin because the sources are. ICEFALL could find no Moroccan mountain rescue service that publishes a call-out procedure, a helicopter capability, an operating ceiling or a cost. What is above is a government list of emergency numbers and one news report of one real incident.",
      "Do not read the absence of a helicopter record as an absence of helicopters. It means ICEFALL has not established what is available, and you should ask your guide before you need to know.",
    ],
  },
];

/**
 * The country's numbers first, then this mountain's own lines (plan §5.1). The
 * national numbers are never written on a mountain record, so the Italian 112
 * on Gran Paradiso and the one on the Matterhorn's south side cannot drift
 * apart: there is one of them, in COUNTRY_EMERGENCY, and both read it.
 */
export const RECORDS: MountainRescueRecord[] = RAW_RECORDS.map((r) => ({
  ...r,
  numbers: [
    ...(countryEmergency(r.countryCode)?.numbers ?? []),
    ...(r.localNumbers ?? []),
  ],
}));

/* -------------------------------------------------------------------------- */
/* Lookup and derived answers                                                  */
/* -------------------------------------------------------------------------- */

const BY_ID = new Map(RECORDS.map((r) => [r.mountainId, r]));

/** The rescue record for a mountain, or null where ICEFALL has not recorded one. */
export function rescueFor(
  mountainId: string | undefined,
): MountainRescueRecord | null {
  if (!mountainId) return null;
  return BY_ID.get(mountainId) ?? null;
}

/**
 * The sentence shown where there is no record. It says what is missing and why,
 * and offers no guess.
 */
export const NO_RESCUE_RECORDED =
  "ICEFALL has not recorded who performs mountain rescue here, what number reaches them, or whether a helicopter can get to you. Rather than repeat a neighbouring country's arrangements, there is nothing here — ask your operator, and ask before you are on the mountain.";

/** The sentence shown where a record exists but publishes no helicopter ceiling. */
export const NO_CEILING_RECORDED =
  "No operating ceiling for helicopter rescue has been published for this mountain that ICEFALL could find. That is not the same as there being no ceiling — every helicopter has one. Ask your operator how high theirs can reach.";

/** The sentence shown where who pays has not been established. */
export const NO_CHARGING_RECORDED =
  "ICEFALL has not established who pays for a rescue here. Assume you do, until your operator or your insurer tells you otherwise in writing.";

/**
 * The highest altitude anybody is documented as having been reached at by
 * helicopter here, or null when nothing is published.
 *
 * NOTE WHAT THIS DELIBERATELY DOES NOT DO. It takes the MAXIMUM of the recorded
 * ceilings, which on Everest is the one-off 7,800 m record rather than the
 * 6,400 m routine limit — the most optimistic figure in the record. A caller
 * showing only this number would be showing a climber the best day anybody ever
 * had. `record.helicopter.ceilings` carries the kind of every figure for exactly
 * that reason, and the page is expected to show them all.
 */
export function highestCeilingM(record: MountainRescueRecord): number | null {
  const { ceilings } = record.helicopter;
  if (ceilings.length === 0) return null;
  return Math.max(...ceilings.map((c) => c.metres));
}

/**
 * How far the summit stands above the highest documented helicopter ceiling —
 * the number this whole file exists to make sayable. Null when no ceiling is
 * recorded, so a caller shows the absent sentence rather than a zero.
 *
 * A negative result is returned as-is rather than clamped: on a mountain where
 * a helicopter has been higher than the summit, the honest answer is a negative
 * gap, not zero.
 */
export function ceilingGapM(
  record: MountainRescueRecord,
  summitM: number,
): number | null {
  const ceiling = highestCeilingM(record);
  if (ceiling === null) return null;
  return summitM - ceiling;
}

/** "The summit stands 1,049 m above …". Null where no ceiling is recorded. */
export function ceilingGapSentence(
  record: MountainRescueRecord,
  summitM: number,
): string | null {
  const gap = ceilingGapM(record, summitM);
  if (gap === null) return null;
  if (gap <= 0) {
    return "A helicopter is documented as having reached this summit's altitude on this mountain.";
  }
  const metres = gap.toLocaleString("en-GB");
  return `The summit stands ${metres} m above the highest altitude a helicopter is documented as reaching on this mountain.`;
}

/** Every source in a record, deduplicated by URL, for a sources row. */
export function sourcesIn(record: MountainRescueRecord): Source[] {
  const out = new Map<string, Source>();
  const add = (s: Source) => {
    if (!out.has(s.url)) out.set(s.url, s);
  };
  record.numbers.forEach((n) => add(n.source));
  record.responders.forEach((r) => add(r.source));
  record.helicopter.ceilings.forEach((c) => add(c.source));
  record.helicopter.limits?.forEach((l) => add(l.source));
  if (record.charging.kind !== "not-recorded") add(record.charging.source);
  if (record.insurance.kind !== "not-recorded") add(record.insurance.source);
  record.disagreements?.forEach((d) =>
    d.positions.forEach((p) => add(p.source)),
  );
  record.extraSources?.forEach(add);
  return [...out.values()];
}
