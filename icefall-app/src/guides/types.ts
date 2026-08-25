/**
 * The guide marketplace model.
 *
 * READ THIS BEFORE ADDING A GUIDE TO THIS FILE.
 *
 * An operator is a business. A guide is a PERSON, holding a qualification issued
 * to them by name, in a trade where a bad decision kills clients. That single
 * difference drives every rule below, and it is why this module is stricter than
 * `@/services/operators` even though it follows the same shape.
 *
 *   1. THE REAL CATALOGUE IS EMPTY, and `GUIDES` below is `[]` on purpose.
 *      ICEFALL has signed nobody. `@/services/operators` can carry honest
 *      "sample listings" because a region-shaped placeholder company is
 *      obviously a placeholder; there is no such thing as a placeholder person.
 *      A screen with no guides renders its empty state — at zero guides that is
 *      the correct rendering of the marketplace, not a bug to be seeded away.
 *
 *   2. DEMO GUIDES ARE INVENTED AND GATED. Every name here was constructed for
 *      this build. None is a real guide, and no real IFMGA guide's name,
 *      history, rate or availability appears anywhere in this file — publishing
 *      invented qualifications and availability against a real person's name
 *      would be defamatory, and a client could act on it. `SHOW_DEMO_GUIDES`
 *      resolves to false in an ordinary production build, exactly as
 *      `SHOW_DEMO_OPERATORS` does, so a shipped bundle contains no guides at
 *      all. The one exception is a build made with VITE_SHOW_DEMO=1, which may
 *      only be deployed behind Vercel Deployment Protection — see
 *      `@/lib/demoFlag` for the conditions.
 *
 *   3. ICEFALL VERIFIES NOTHING. `GuideCredential.verified` is typed as the
 *      literal `false` so no code path can set it true. The state is modelled
 *      because a real registry check is the obvious next thing to build; it is
 *      unreachable because nothing today performs one. Until something does, a
 *      credential renders as CLAIMED — see `credentialStatus`.
 *
 *   4. REVIEWS REQUIRE A COMPLETED ICEFALL BOOKING. None exists, so `rating` and
 *      `reviewCount` are invented alongside the rest of the demo data and are
 *      only ever present on a `demo: true` record.
 *
 *   5. PROFESSIONAL CONTACT ONLY. There is no phone number, no personal email
 *      and no address in this model, and none may be added. `basedIn` is a town
 *      or valley — where someone works, not where they live. Contact runs
 *      through the request flow in `./store`.
 */

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

import { SHOW_DEMO_DATA } from "@/lib/demoFlag";

export type Speciality =
  | "mountaineering"
  | "glacier"
  | "ice"
  | "rock"
  | "mixed"
  | "ski-mountaineering"
  | "winter"
  | "high-altitude"
  | "trekking";

/** One phrasing across the whole feature, so two screens cannot disagree. */
export const SPECIALITY_LABELS: Record<Speciality, string> = {
  mountaineering: "Alpine mountaineering",
  glacier: "Glacier travel",
  ice: "Ice climbing",
  rock: "Rock",
  mixed: "Mixed ground",
  "ski-mountaineering": "Ski mountaineering",
  winter: "Winter skills",
  "high-altitude": "High altitude",
  trekking: "Trekking",
};

/**
 * A standing status the guide sets, NOT a diary.
 *
 * ICEFALL holds no calendar for anyone, so this says what someone is generally
 * taking on — it never means a particular set of dates has been checked. Every
 * surface that shows it must say so, and `./matching` says it in the note it
 * attaches to the availability factor.
 */
export type Availability = "available" | "limited" | "unavailable";

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: "Taking work",
  limited: "Limited dates",
  unavailable: "Not taking work",
};

/* -------------------------------------------------------------------------- */
/* Credentials                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A qualification the guide says they hold.
 *
 * `verified` is the literal `false`. The field exists so the shape is ready for
 * the day something checks a national register, and it is unsettable so that
 * day cannot arrive by accident. A tick beside "IFMGA" means a client stops
 * asking to see the carnet, and on glaciated ground that is the whole of the
 * protection they have.
 */
export interface GuideCredential {
  label: string;
  body: string;
  /** Nothing sets this true yet. */
  verified: false;
}

/**
 * The word a UI must put beside a credential.
 *
 * Written as a branch rather than a constant so the verified state is modelled
 * in code, not just in a comment — when a registry check exists, this function
 * is where its result lands and every card follows.
 */
export function credentialStatus(c: GuideCredential): "Claimed" | "Verified" {
  return c.verified ? "Verified" : "Claimed";
}

/**
 * The portrait path for a demo guide, by id.
 *
 * For surfaces that hold an id but not the `Guide` record — a saved request
 * thread, say. Returns undefined wherever demo data is off, and for any id that
 * is not a demo guide, so a real guide can never acquire a face this way.
 */
export function demoPortraitFor(guideId: string): string | undefined {
  if (!SHOW_DEMO_DATA) return undefined;
  return guideId.startsWith("guide-demo-") ? `/img/guides/${guideId}.jpg` : undefined;
}

/** Shown wherever credentials are listed. One sentence, everywhere the same. */
export const CREDENTIAL_CLAIM_NOTICE =
  "Every qualification below is what the guide says they hold. ICEFALL has not seen a carnet, has not written to any association, and verifies nothing. Ask to see the licence and check it against the issuing body before you commit to a day on the mountain.";

/* -------------------------------------------------------------------------- */
/* The guide                                                                   */
/* -------------------------------------------------------------------------- */

export interface Guide {
  id: string;
  name: string;
  headline: string;
  /** Professional location only — city/region, never an address. */
  basedIn: string;
  specialities: Speciality[];
  mountains: string[];
  languages: string[];
  yearsGuiding: number;
  expeditionsLed: number;
  highestGuidedM: number;
  dailyRateEur: number;
  availability: Availability;
  /** Guided ascents per mountain — the metric that matters, not followers. */
  ascentsByMountain: Record<string, number>;
  credentials: GuideCredential[];
  /** Invented. Demo only. */
  rating?: number;
  reviewCount?: number;
  demo?: true;
  /**
   * A portrait, for demo guides only.
   *
   * These are GAN-generated faces of people who DO NOT EXIST — no photograph of
   * any real person is used, because attaching a real face to an invented name,
   * an invented IFMGA licence and an invented ascent record would misrepresent
   * that person as a working mountain guide. The files are gitignored, and they
   * only render where `SHOW_DEMO_DATA` is true; `GuidePortrait` falls back to
   * initials whenever the file is absent, so a fresh clone still works.
   *
   * A real guide's photograph must never be set here without their consent.
   */
  portrait?: string;
  /**
   * A promoted slot, when one is ever sold.
   *
   * Nothing is sold today; the flag exists so the label can be built and tested
   * before money is involved. Two rules bind anything that reads it: it must
   * render the word FEATURED or SPONSORED, and it must NEVER reorder the
   * organic list — `rankGuides` in `./matching` ignores it entirely. A paid
   * position that looks like a ranking is an app telling a client that the
   * guide who paid is the better qualified one.
   */
  featured?: boolean;
  bio: string;
}

/* -------------------------------------------------------------------------- */
/* The catalogue                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Real guides who have listed with ICEFALL.
 *
 * Empty, and it stays empty until someone signs. See rule 1 at the top of this
 * file: there is no honest placeholder for a person.
 */
const GUIDES: Guide[] = [];

/** What a screen shows when the catalogue is empty — which, in production, it is. */
export const NO_GUIDES_NOTICE =
  "No guides have listed with ICEFALL yet. Rather than fill this page with people who do not exist, it is empty: find an IFMGA/UIAGM-certified guide through the local guides office or the national association for the range you are heading to.";

/**
 * DEV, OR AN EXPLICITLY FLAGGED PROTECTED BUILD.
 *
 * Mirrors `SHOW_DEMO_OPERATORS`. An ordinary production build resolves this to
 * false and the marketplace falls back to the empty state above.
 *
 * The old rule here was "never ship this", on the grounds that the phone is
 * served from a public URL and the other side of that URL would be a page of
 * invented mountain guides with invented qualifications somebody could try to
 * hire. That reasoning is unchanged — what changed is that the URL need not be
 * public. `SHOW_DEMO_DATA` is only true in a build made with VITE_SHOW_DEMO=1,
 * which may only be deployed behind Vercel Deployment Protection. Read the
 * conditions in `@/lib/demoFlag` before setting it.
 */
export const SHOW_DEMO_GUIDES = SHOW_DEMO_DATA;

export const GUIDE_DEMO_NOTICE =
  "Demonstration data. These guides do not exist: the names were invented for this build, and the qualifications, ascent counts, day rates, availability, ratings and review counts were all made up to show how the marketplace works. Nothing here has been verified, none of them can be contacted, and none of it ships — a production build shows no guides at all.";

/**
 * Invented people, for building the marketplace against.
 *
 * NAMES: constructed for this file, deliberately pairing given names and
 * surnames across origins so the combinations do not read as any particular
 * working guide. Nothing was copied from a register, a guides office or a
 * company's team page.
 *
 * FIGURES: every number below is invented — years, expeditions led, altitude,
 * day rate, ascent counts, rating, reviews. They are internally consistent so
 * the matching engine can be judged on realistic-shaped input, and that is the
 * only claim made for them.
 *
 * MOUNTAINS: drawn from the ten curated ICEFALL objectives, so the demo data
 * exercises the real matching path rather than a parallel set of names.
 *
 * WHY THIS IS A GUARDED FUNCTION AND NOT A TOP-LEVEL ARRAY
 *
 * `SHOW_DEMO_OPERATORS` keeps demo data off the SCREEN in production, but its
 * array is an exported top-level literal, so the bundler keeps it and the data
 * ships inside the JavaScript whether or not anything renders it. Checked, not
 * assumed: a minified production bundle built against `allGuides()` alone still
 * contained every name. For companies that is embarrassing; for eight invented
 * mountain guides with invented licences it is a page of fabricated
 * professional credentials sitting in a public asset, findable by anyone who
 * opens the file.
 *
 * Writing the literals inside a function that returns early on the flag puts
 * them in a branch that is provably dead once `import.meta.env.DEV` folds to
 * `false`, so dead-code elimination removes them outright. The export below
 * keeps the same name and type; in a production build it is `[]`.
 *
 * The guard spells out the `import.meta.env` reads INLINE and does not use
 * `SHOW_DEMO_GUIDES` or `SHOW_DEMO_DATA`, even though it is the same value.
 * Checked rather than assumed: with a named constant the bundler kept every
 * name, because the build-time substitution has to be syntactically inside the
 * branch for the branch to fold. Do not tidy this into either constant — that
 * edit silently puts eight invented mountain guides back into the production
 * bundle, and nothing in the app's behaviour would show it.
 *
 * Both halves must stay inline for the same reason. Unflagged, this folds to
 * `if (true) return []` and every literal below is removed; with
 * VITE_SHOW_DEMO=1 it folds to `if (false)` and the data is kept.
 */
function buildDemoGuides(): Guide[] {
  if (!import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO !== "1") return [];
  return [
    {
      id: "guide-demo-falkenrath",
      name: "Ines Falkenrath",
      headline: "Mont Blanc massif, classic alpine routes and glacier days",
      basedIn: "Chamonix-Mont-Blanc, France",
      specialities: ["mountaineering", "glacier", "mixed", "ski-mountaineering"],
      mountains: ["Mont Blanc", "Gran Paradiso", "Matterhorn", "Eiger"],
      languages: ["English", "French", "German"],
      yearsGuiding: 14,
      expeditionsLed: 210,
      highestGuidedM: 6190,
      dailyRateEur: 620,
      availability: "available",
      ascentsByMountain: { "Mont Blanc": 96, "Gran Paradiso": 41, Matterhorn: 22, Eiger: 9 },
      credentials: [
        {
          label: "IFMGA / UIAGM mountain guide",
          body: "Full licence, invented for this build. Carnet number would be shown here.",
          verified: false,
        },
        {
          label: "Wilderness first responder",
          body: "Renewal date would be shown here.",
          verified: false,
        },
      ],
      rating: 4.9,
      reviewCount: 37,
      demo: true,
      portrait: "/img/guides/guide-demo-falkenrath.jpg",
      // The one promoted record, so the FEATURED label has something to render.
      // It buys a labelled slot and nothing else — never a place in the ranking.
      featured: true,
      bio: "Works the Mont Blanc massif year round, mostly two-day outings on the classic routes with a strong preference for early starts and turning around while the option still exists.",
    },
    {
      id: "guide-demo-wehrli",
      name: "Tomás Wehrli",
      headline: "Matterhorn Hörnli ridge and hard mixed ground in the Valais",
      basedIn: "Zermatt, Valais, Switzerland",
      specialities: ["rock", "mixed", "ice", "mountaineering"],
      mountains: ["Matterhorn", "Eiger", "Mont Blanc", "Gran Paradiso"],
      languages: ["English", "German", "Spanish"],
      yearsGuiding: 21,
      expeditionsLed: 340,
      highestGuidedM: 6961,
      dailyRateEur: 690,
      availability: "limited",
      ascentsByMountain: { Matterhorn: 148, Eiger: 34, "Mont Blanc": 51, "Gran Paradiso": 12 },
      credentials: [
        {
          label: "IFMGA / UIAGM mountain guide",
          body: "Full licence, invented for this build.",
          verified: false,
        },
        {
          label: "Swiss Alpine Club rescue affiliation",
          body: "Invented affiliation, shown to demonstrate a second credential row.",
          verified: false,
        },
      ],
      rating: 4.8,
      reviewCount: 52,
      demo: true,
      portrait: "/img/guides/guide-demo-wehrli.jpg",
      bio: "Twenty-one seasons on the Matterhorn's ridges. Takes one client at a time on the Hörnli and expects a fitness day together before agreeing to the route.",
    },
    {
      id: "guide-demo-lama",
      name: "Nima Chhiring Lama",
      headline: "Everest and the 8,000 m ranges, oxygen logistics and acclimatisation",
      basedIn: "Solukhumbu, Nepal",
      specialities: ["high-altitude", "mountaineering", "glacier"],
      mountains: ["Everest", "Aconcagua"],
      languages: ["English", "Nepali", "Hindi"],
      yearsGuiding: 16,
      expeditionsLed: 62,
      highestGuidedM: 8849,
      dailyRateEur: 480,
      availability: "limited",
      ascentsByMountain: { Everest: 11, Aconcagua: 4 },
      credentials: [
        {
          label: "IFMGA / UIAGM mountain guide",
          body: "Full licence, invented for this build.",
          verified: false,
        },
        {
          label: "Nepal Mountaineering Association registration",
          body: "Invented registration. In Nepal the expedition permit is issued to a registered agency, not to an individual — see the guide-versus-company note.",
          verified: false,
        },
      ],
      rating: 4.9,
      reviewCount: 28,
      demo: true,
      portrait: "/img/guides/guide-demo-lama.jpg",
      bio: "Works the standard Everest routes with a long acclimatisation programme, and is blunt about the days on which a client should not leave camp.",
    },
    {
      id: "guide-demo-halvorsen",
      name: "Sofía Halvorsen",
      headline: "Aconcagua and the high Andes, altitude with a slow profile",
      basedIn: "Mendoza, Argentina",
      specialities: ["high-altitude", "mountaineering", "trekking"],
      mountains: ["Aconcagua", "Denali"],
      languages: ["Spanish", "English"],
      yearsGuiding: 11,
      expeditionsLed: 128,
      highestGuidedM: 6961,
      dailyRateEur: 390,
      availability: "available",
      ascentsByMountain: { Aconcagua: 63, Denali: 3 },
      credentials: [
        {
          label: "AAGM Argentine mountain guide",
          body: "Invented national qualification, shown to demonstrate a non-IFMGA credential row.",
          verified: false,
        },
        {
          label: "High-altitude medicine short course",
          body: "Invented. A short course is not a medical qualification and would be labelled as such.",
          verified: false,
        },
      ],
      rating: 4.7,
      reviewCount: 41,
      demo: true,
      portrait: "/img/guides/guide-demo-halvorsen.jpg",
      bio: "Runs long, unhurried itineraries on the Normal route and the Polish Traverse, with a rest day built in before every carry.",
    },
    {
      id: "guide-demo-ait-benhaddou",
      name: "Rachid Ait Benhaddou",
      headline: "Toubkal and the High Atlas, summer and winter",
      basedIn: "Imlil, High Atlas, Morocco",
      specialities: ["trekking", "winter", "mountaineering"],
      mountains: ["Toubkal"],
      languages: ["Arabic", "Tamazight", "French", "English"],
      yearsGuiding: 9,
      expeditionsLed: 265,
      highestGuidedM: 4167,
      dailyRateEur: 220,
      availability: "available",
      ascentsByMountain: { Toubkal: 240 },
      credentials: [
        {
          label: "Moroccan national mountain guide (ANGAM)",
          body: "Invented national qualification.",
          verified: false,
        },
        {
          label: "Winter skills and avalanche awareness",
          body: "Invented. Toubkal in winter is a snow route, not a walk.",
          verified: false,
        },
      ],
      rating: 4.8,
      reviewCount: 63,
      demo: true,
      portrait: "/img/guides/guide-demo-ait-benhaddou.jpg",
      bio: "Grew up in the valley below the refuge. Winter ascents with crampons and an axe are the ones worth booking him for.",
    },
    {
      id: "guide-demo-zelenika",
      name: "Jaka Zelenika",
      headline: "Triglav's north face and the Julian Alps, rock and via ferrata",
      basedIn: "Bovec, Slovenia",
      specialities: ["rock", "mixed", "ski-mountaineering", "mountaineering"],
      mountains: ["Triglav", "Eiger"],
      languages: ["Slovenian", "English", "Italian", "German"],
      yearsGuiding: 7,
      expeditionsLed: 190,
      highestGuidedM: 4061,
      dailyRateEur: 320,
      availability: "available",
      ascentsByMountain: { Triglav: 180, Eiger: 2 },
      credentials: [
        {
          label: "IFMGA / UIAGM mountain guide",
          body: "Full licence, invented for this build.",
          verified: false,
        },
      ],
      rating: 4.6,
      reviewCount: 19,
      demo: true,
      portrait: "/img/guides/guide-demo-zelenika.jpg",
      bio: "Julian Alps specialist. Prefers the Slovenian route on Triglav over the Krma valley walk-in, and will say so.",
    },
    {
      id: "guide-demo-kastrinaki",
      name: "Eleni Kastrinaki",
      headline: "Mount Olympus, Mytikas scramble and winter ascents",
      basedIn: "Litochoro, Greece",
      specialities: ["rock", "trekking", "winter", "mountaineering"],
      mountains: ["Mount Olympus", "Toubkal"],
      languages: ["Greek", "English", "German"],
      yearsGuiding: 12,
      expeditionsLed: 310,
      highestGuidedM: 4167,
      dailyRateEur: 260,
      // Deliberately unavailable, so the hard availability cap in `./matching` has
      // something to act on and the screens have an unbookable card to render.
      availability: "unavailable",
      ascentsByMountain: { "Mount Olympus": 300, Toubkal: 6 },
      credentials: [
        {
          label: "Hellenic mountain guide association",
          body: "Invented national qualification.",
          verified: false,
        },
      ],
      rating: 4.8,
      reviewCount: 34,
      demo: true,
      portrait: "/img/guides/guide-demo-kastrinaki.jpg",
      bio: "Twelve seasons on Olympus. Takes the Mytikas scramble seriously and turns parties around at the Kaki Skala when the rock is wet.",
    },
    {
      id: "guide-demo-callaghan",
      name: "Marit Callaghan",
      headline: "Denali, the West Buttress and Alaska Range glacier travel",
      basedIn: "Talkeetna, Alaska, United States",
      specialities: ["glacier", "ski-mountaineering", "mountaineering", "winter"],
      mountains: ["Denali"],
      languages: ["English"],
      yearsGuiding: 13,
      expeditionsLed: 44,
      highestGuidedM: 6190,
      dailyRateEur: 540,
      availability: "limited",
      ascentsByMountain: { Denali: 19 },
      credentials: [
        {
          label: "IFMGA / UIAGM mountain guide",
          body: "Full licence, invented for this build.",
          verified: false,
        },
        {
          label: "National Park Service concession",
          body: "Invented. Denali is guided under a park concession held by an authorised operator — see the guide-versus-company note.",
          verified: false,
        },
      ],
      rating: 4.7,
      reviewCount: 22,
      demo: true,
      portrait: "/img/guides/guide-demo-callaghan.jpg",
      bio: "Three-week West Buttress expeditions with a heavy emphasis on load carries, cold injury and knowing when the weather window has closed.",
    },
  ];
}

/** The demonstration catalogue: eight invented people in dev, `[]` in production. */
export const DEMO_GUIDES: Guide[] = buildDemoGuides();

/**
 * Every guide the marketplace holds.
 *
 * A copy, so no screen can mutate the catalogue, and the only way to enumerate
 * it. In production this returns `[]` — see `NO_GUIDES_NOTICE`.
 */
export function allGuides(): Guide[] {
  return SHOW_DEMO_GUIDES ? [...DEMO_GUIDES, ...GUIDES] : [...GUIDES];
}

export function guideById(id: string): Guide | undefined {
  return allGuides().find((g) => g.id === id);
}

/* -------------------------------------------------------------------------- */
/* Guide or company                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The distinction a client has to understand before they choose either.
 *
 * It is not a ranking and neither column is the better answer: on Everest or
 * Denali the permit or concession is issued to an organisation, so an individual
 * is not an option at all, while for two days on the Hörnli ridge a company adds
 * a layer and a margin and nothing else. Any screen rendering this must show
 * both columns together — half of it is a sales pitch.
 */
export const GUIDE_VS_COMPANY: { guide: string[]; company: string[] } = {
  guide: [
    "One named person. The individual whose profile you read is the individual who ties into the rope with you.",
    "The qualification is theirs. An IFMGA/UIAGM carnet is issued to a person and never to a business, so you can ask to see it.",
    "They set their own day rate and hold their own liability insurance. Permits, huts, lifts and travel are usually on top.",
    "The ratio you agree is the ratio you get, because there is nobody to reassign you to.",
    "Best for a single objective, a skills day, or a two-person route where continuity of judgement matters most.",
  ],
  company: [
    "An organisation that contracts guides. The person who meets you may not be named until close to departure.",
    "The company holds the licence, registration or park concession; the guiding qualification still belongs to whichever individual is assigned to you.",
    "Carries what one person cannot: permits, liaison officers, base camp, fixed rope, oxygen logistics and evacuation contracts.",
    "Ratios, guide substitutions and the summit-day plan follow the operator's policy rather than your guide's judgement alone.",
    "Unavoidable where a permit is issued to an agency rather than a person — Nepal, Tibet and Denali's park concession among them.",
  ],
};
