import { eur as toCents, type Cents } from "@/money/model";
import { objectivePeak, PEAKS, shortPeakName } from "./peaks";

/**
 * Marketplace demo data.
 *
 * NONE OF THESE PEOPLE OR COMPANIES EXIST. The guide portraits are GAN-generated
 * faces of nobody; the companies' figures are invented. It is all dev-gated (a
 * production build ships an empty marketplace, as on the phone) and every card
 * carries the same honesty rules the app uses: "verified" means ICEFALL read a
 * document on a date and nothing more, and no rating exists without a booking
 * behind it.
 */

export const IS_DEMO = import.meta.env.DEV;

export const DEMO_NOTICE =
  "Demonstration listings. These guides and companies do not exist — the names, prices, ratings and reviews were invented to show how the marketplace works. A production build lists only real, verified partners.";

/* -------------------------------------------------------------------------- */
/* Guides                                                                     */
/* -------------------------------------------------------------------------- */

export interface Guide {
  id: string;
  name: string;
  /** GAN portrait, gitignored. Falls back to a monogram when absent. */
  photo: string;
  credential: string;
  /** The one sentence ICEFALL may put behind the verified tick. */
  verifiedOn: string;
  basedIn: string;
  headline: string;
  mountains: string[];
  languages: string[];
  yearsGuiding: number;
  dayRate: Cents;
  /** Invented, demo-only. No rating exists without a completed booking. */
  rating: number;
  reviews: number;
  /** Photo of the objective, never of the guide, behind the card. */
  heroPeak: string;
  /**
   * Career figures, and a live availability flag.
   *
   * ALL INVENTED, like the guides themselves, and DEV-gated with them. A
   * success rate is the single most persuasive number on a guide card and the
   * only honest source for one is completed bookings, which this app does not
   * have. When real guides sign, these get filled from their record or deleted
   * — never carried over.
   */
  successRatePct: number;
  summits: number;
  expeditionsLed: number;
  /** Demo only: there is no calendar behind this. */
  available: boolean;
  nationality: string;
  /** Month and year they joined. Demo, like the rest. */
  memberSince: string;
  bio: string[];
  specialties: string[];
  /** What they hold, beyond the headline credential. */
  certifications: string[];
  /** A few words from clients. Invented, with the guides. */
  testimonials: { author: string; trip: string; when: string; stars: number; body: string }[];
}

export const GUIDES: Guide[] = IS_DEMO
  ? [
      {
        id: "g-wehrli",
        name: "Tobias Frei",
        photo: "/img/guides/guide-demo-wehrli.jpg",
        credential: "IFMGA / UIAGM mountain guide",
        verifiedOn: "5 Jun 2026",
        basedIn: "Zermatt, Valais",
        headline: "Matterhorn Hörnli ridge and hard mixed ground in the Valais",
        mountains: ["Matterhorn", "Monte Rosa", "Dent Blanche"],
        languages: ["English", "German", "French"],
        yearsGuiding: 11,
        dayRate: toCents(690),
        rating: 4.9,
        reviews: 127,
        heroPeak: "matterhorn",
        successRatePct: 96,
        summits: 240,
        expeditionsLed: 9,
        available: true,
        nationality: "Swiss",
        memberSince: "March 2018",
        bio: ["Born in the Valais and guiding out of Zermatt since his twenties, Tobias has spent more seasons on the Hörnli ridge than most guides spend in the Alps.", "He works small — two clients, rarely three — and turns parties around early when the afternoon build-up arrives. Clients tend to come back."],
        specialties: ["Hard mixed ground", "Classic 4,000ers", "Ski touring", "Winter alpinism"],
        certifications: ["IFMGA / UIAGM licence", "Wilderness first responder", "Avalanche level 3", "Swiss Alpine Club instructor"],
        testimonials: [{ author: "Mira Lindqvist", trip: "Matterhorn — Hörnli ridge", when: "June 2026", stars: 5, body: "Turned us round below the Solvay in weather I would have pushed through alone. Two weeks later we summited in perfect conditions." }, { author: "Owen Bright", trip: "Monte Rosa traverse", when: "August 2026", stars: 5, body: "Calm, unhurried, and completely on top of the timings. Never once felt rushed." }],
      },
      {
        id: "g-falkenrath",
        name: "Ines Falkenrath",
        photo: "/img/guides/guide-demo-falkenrath.jpg",
        credential: "IFMGA / UIAGM mountain guide",
        verifiedOn: "12 Feb 2026",
        basedIn: "Chamonix-Mont-Blanc",
        headline: "Mont Blanc massif — classic alpine routes and glacier days",
        mountains: ["Mont Blanc", "Gran Paradiso", "Eiger"],
        languages: ["English", "French", "German"],
        yearsGuiding: 14,
        dayRate: toCents(620),
        rating: 4.9,
        reviews: 168,
        heroPeak: "mont-blanc",
        successRatePct: 97,
        summits: 310,
        expeditionsLed: 12,
        available: true,
        nationality: "German",
        memberSince: "January 2016",
        bio: ["Ines has guided from Chamonix for fourteen seasons, mostly on Mont Blanc and the Gran Paradiso, and spends the shoulder months on the Eiger.", "She is unusually direct about what a client is and is not ready for, which is the most useful thing a guide can be."],
        specialties: ["Mont Blanc", "Alpine ascents", "Glacier travel", "Crevasse rescue"],
        certifications: ["IFMGA / UIAGM licence", "Wilderness first responder", "Glacier rescue instructor"],
        testimonials: [{ author: "Peter Vance", trip: "Mont Blanc — Goûter route", when: "July 2026", stars: 5, body: "She told me in April I was not ready and gave me a plan. Summited the following year with room to spare." }, { author: "Sofia Marchetti", trip: "Gran Paradiso", when: "June 2026", stars: 5, body: "The clearest briefing I have had from any guide, on any mountain." }],
      },
      {
        id: "g-lama",
        name: "Nima Chhiring Lama",
        photo: "/img/guides/guide-demo-lama.jpg",
        credential: "IFMGA / UIAGM mountain guide",
        verifiedOn: "2 Mar 2026",
        basedIn: "Solukhumbu, Nepal",
        headline: "Everest and the 8,000 m ranges — oxygen logistics and acclimatisation",
        mountains: ["Everest", "Ama Dablam", "Aconcagua"],
        languages: ["English", "Nepali", "Hindi"],
        yearsGuiding: 16,
        dayRate: toCents(480),
        rating: 4.9,
        reviews: 91,
        heroPeak: "everest",
        successRatePct: 94,
        summits: 280,
        expeditionsLed: 14,
        available: true,
        nationality: "Nepali",
        memberSince: "August 2013",
        bio: ["Nima grew up in Solukhumbu and has worked above 8,000 m for sixteen seasons, on Everest, Ama Dablam and further afield.", "He climbs with the same small team of Sherpas each season, which is the reason his clients rarely have logistics go wrong."],
        specialties: ["8,000 m peaks", "Everest", "Ama Dablam", "High-altitude logistics"],
        certifications: ["IFMGA / UIAGM licence", "Nepal Mountaineering Association guide", "Wilderness first responder", "Oxygen systems"],
        testimonials: [{ author: "Jonas Reiter", trip: "Ama Dablam — SW ridge", when: "November 2026", stars: 5, body: "Sixteen years on that ridge shows. Nothing surprised him." }, { author: "Claire Dunmore", trip: "Everest — South Col", when: "May 2026", stars: 5, body: "He made a hard call on the Col and we all came home. That is the whole job." }],
      },
      {
        id: "g-halvorsen",
        name: "Sofía Halvorsen",
        photo: "/img/guides/guide-demo-halvorsen.jpg",
        credential: "IFMGA / UIAGM mountain guide",
        verifiedOn: "19 Apr 2026",
        basedIn: "Åndalsnes, Norway",
        headline: "Alpine ice, ski-mountaineering and winter ascents",
        mountains: ["Eiger", "Mont Blanc", "Matterhorn"],
        languages: ["English", "Norwegian"],
        yearsGuiding: 9,
        dayRate: toCents(560),
        rating: 4.8,
        reviews: 74,
        heroPeak: "eiger",
        successRatePct: 95,
        summits: 180,
        expeditionsLed: 7,
        available: false,
        nationality: "Norwegian",
        memberSince: "May 2020",
        bio: ["Sofía works the Romsdal walls in summer and the Alps either side of them, with a bias toward long routes and early starts.", "She is happiest on ground that needs moving together rather than pitching, and picks her parties accordingly."],
        specialties: ["Long alpine routes", "Ice climbing", "Eiger", "Scandinavian big walls"],
        certifications: ["IFMGA / UIAGM licence", "Wilderness first responder", "Ice climbing instructor"],
        testimonials: [{ author: "Anders Vik", trip: "Eiger — west flank", when: "September 2026", stars: 5, body: "Moved fast, talked little, made all the right calls." }],
      },
      {
        id: "g-ait",
        name: "Rachid Ait Benhaddou",
        photo: "/img/guides/guide-demo-ait-benhaddou.jpg",
        credential: "IFMGA / UIAGM mountain guide",
        verifiedOn: "24 Jun 2026",
        basedIn: "Imlil, Morocco",
        headline: "High Atlas and winter Toubkal — trekking peaks to technical ground",
        mountains: ["Toubkal", "Aconcagua"],
        languages: ["English", "French", "Arabic", "Berber"],
        yearsGuiding: 12,
        dayRate: toCents(340),
        rating: 4.8,
        reviews: 58,
        heroPeak: "aconcagua",
        successRatePct: 98,
        summits: 400,
        expeditionsLed: 11,
        available: true,
        nationality: "Moroccan",
        memberSince: "February 2017",
        bio: ["Rachid has guided the High Atlas out of Imlil for twelve years and takes parties to Toubkal through every month it is climbable.", "He also works Aconcagua in the southern season, which is an unusual pairing and makes him very good at cold, dry, high walking."],
        specialties: ["Toubkal", "High Atlas", "Aconcagua", "Winter ascents"],
        certifications: ["IFMGA / UIAGM licence", "Wilderness first responder", "Moroccan mountain guide licence"],
        testimonials: [{ author: "Élodie Rousseau", trip: "Toubkal — winter", when: "February 2027", stars: 5, body: "Knows every gully and exactly which ones to avoid after snow." }],
      },
      {
        id: "g-callaghan",
        name: "Marit Callaghan",
        photo: "/img/guides/guide-demo-callaghan.jpg",
        credential: "IFMGA / UIAGM mountain guide",
        verifiedOn: "8 May 2026",
        basedIn: "Talkeetna, Alaska",
        headline: "Denali West Buttress and expedition-style glacier travel",
        mountains: ["Denali", "Aconcagua"],
        languages: ["English"],
        yearsGuiding: 13,
        dayRate: toCents(540),
        rating: 4.9,
        reviews: 82,
        heroPeak: "denali",
        successRatePct: 93,
        summits: 210,
        expeditionsLed: 10,
        available: true,
        nationality: "Irish",
        memberSince: "July 2019",
        bio: ["Marit works Denali out of Talkeetna and spends the southern winter on Aconcagua, which between them cover most of what cold does to people.", "Expedition-length trips are the whole of her practice — she does not take day work."],
        specialties: ["Denali", "Expedition logistics", "Cold-weather systems", "Aconcagua"],
        certifications: ["IFMGA / UIAGM licence", "Wilderness first responder", "Avalanche level 3", "Glacier rescue instructor"],
        testimonials: [{ author: "Tom Ashby", trip: "Denali — West Buttress", when: "June 2026", stars: 5, body: "Twenty-one days and the camp routine never once slipped." }],
      },
    ]
  : [];

/* -------------------------------------------------------------------------- */
/* Expedition companies                                                       */
/* -------------------------------------------------------------------------- */

export interface Expedition {
  id: string;
  company: string;
  verifiedOn: string;
  objective: string;
  country: string;
  heroPeak: string;
  durationDays: number;
  /** Indicative — an expedition is quoted, not priced off a card. Demo only. */
  fromEur: Cents;
  requires: string;
  months: string;
  /**
   * The highest point the trip actually reaches, when that is NOT the summit.
   *
   * A trek to Everest Base Camp is an Everest trip that tops out at 5,364 m.
   * Without this the page reads the peak's altitude and tells the reader they
   * are going to 8,849 m — a nine-hundred-per-cent overstatement of the thing
   * that decides whether they can do it.
   */
  maxAltitudeM?: number;
}

const AUTHORED: Expedition[] = IS_DEMO
  ? [
      {
        id: "e-everest",
        company: "Solukhumbu Expeditions",
        verifiedOn: "2 Mar 2026",
        objective: "Everest — South Col",
        country: "Nepal",
        heroPeak: "everest",
        durationDays: 62,
        fromEur: toCents(58000),
        requires: "Previous 7,000 m summit, strong on fixed lines, months of preparation",
        months: "Apr – May",
      },
      {
        id: "e-ama",
        company: "Solukhumbu Expeditions",
        verifiedOn: "2 Mar 2026",
        objective: "Ama Dablam — SW ridge",
        country: "Nepal",
        heroPeak: "everest",
        durationDays: 28,
        fromEur: toCents(8600),
        requires: "Confident on steep rock and ice, comfortable at 6,000 m",
        months: "Oct – Nov",
      },
      /*
       * ELITE EXPED IS A REAL COMPANY — see the note in `companies.ts`.
       * These two listings are layout examples. The prices, durations and
       * requirements were set by ICEFALL, not supplied by the operator, and
       * this whole array is `IS_DEMO`-gated at its definition so none of it
       * reaches a production bundle.
       */
      {
        id: "e-ee-everest",
        company: "Elite Exped",
        verifiedOn: "",
        objective: "Everest — South Col",
        country: "Nepal",
        heroPeak: "everest",
        durationDays: 60,
        fromEur: toCents(62000),
        requires: "Previous 8,000 m or strong 7,000 m record, fixed-line competence",
        months: "Apr – May",
      },
      {
        id: "e-ee-ama",
        company: "Elite Exped",
        verifiedOn: "",
        objective: "Ama Dablam — SW ridge",
        country: "Nepal",
        heroPeak: "everest",
        durationDays: 35,
        fromEur: toCents(18500),
        requires: "Confident on steep rock and ice, comfortable at 6,000 m",
        months: "Oct – Nov",
      },
      {
        /*
         * A TREK, not an ascent, and the objective says so.
         *
         * Named "Everest — Base Camp trek" rather than "Everest Base Camp" so
         * it groups under Everest on the expeditions page like any other
         * Everest trip, while `maxAltitudeM` stops it inheriting the summit.
         */
        id: "e-ebc",
        company: "Solukhumbu Expeditions",
        verifiedOn: "2 Mar 2026",
        objective: "Everest — Base Camp trek",
        country: "Nepal",
        heroPeak: "everest",
        durationDays: 14,
        fromEur: toCents(2150),
        maxAltitudeM: 5364,
        requires: "Able to walk six hours a day for two weeks. No climbing experience needed.",
        months: "Mar – May",
      },
      {
        id: "e-aconcagua",
        company: "Cordillera Ascents",
        verifiedOn: "1 Jun 2026",
        objective: "Aconcagua — Normal route",
        country: "Argentina",
        heroPeak: "aconcagua",
        durationDays: 19,
        fromEur: toCents(4200),
        requires: "Fit hillwalker, comfortable camping at altitude for weeks",
        months: "Dec – Feb",
      },
      {
        id: "e-mont-blanc",
        company: "Chamonix Alpine Guides",
        verifiedOn: "11 Feb 2026",
        objective: "Mont Blanc — Goûter route",
        country: "France",
        heroPeak: "mont-blanc",
        durationDays: 4,
        fromEur: toCents(1250),
        requires: "Crampon-confident, 1,000 m ascent days, prior alpine experience",
        months: "Jun – Sep",
      },
    ]
  : [];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Listings for the rest of the catalogue.
 *
 * The six above are hand-written. Fifty-one peaks with six listings meant
 * forty-seven mountains answered "no operator publishes an expedition on this
 * peak", which is true of a directory with three companies in it and useless as
 * a thing to look at.
 *
 * These are DERIVED, and derived narrowly on purpose:
 *
 *   THE OBJECTIVE IS THE MOUNTAIN, NEVER A ROUTE. "Everest — South Col" is a
 *   claim about which line an operator takes, and inventing one for a real
 *   mountain is the kind of wrong that gets somebody onto the wrong face. A
 *   generated listing says "Makalu" and stops.
 *
 *   PRICE, DURATION AND PREREQUISITES COME FROM ALTITUDE, which is the one
 *   thing actually known about a peak we have not written up.
 *
 * Companies are assigned by where they work: the Kathmandu operator gets Asia,
 * the Mendoza one the Americas, the Chamonix one Europe and Africa. Elite Exped
 * is deliberately excluded — it is a REAL business, and generating forty more
 * invented commercial listings against its name is exactly what the note at the
 * top of `companies.ts` forbids.
 */
const SEASON_BY_REGION: Record<string, string> = {
  "Himalaya & Asia": "Oct – Nov",
  Americas: "Dec – Feb",
  Europe: "Jun – Sep",
  Africa: "Jan – Mar",
  "Oceania & Antarctica": "Nov – Feb",
};

const COMPANY_BY_REGION: Record<string, string> = {
  "Himalaya & Asia": "Solukhumbu Expeditions",
  Americas: "Cordillera Ascents",
  Europe: "Chamonix Alpine Guides",
  Africa: "Chamonix Alpine Guides",
  "Oceania & Antarctica": "Chamonix Alpine Guides",
};

const VERIFIED_ON: Record<string, string> = {
  "Solukhumbu Expeditions": "2 Mar 2026",
  "Cordillera Ascents": "18 Jan 2026",
  "Chamonix Alpine Guides": "9 Feb 2026",
};

function derivedExpeditions(): Expedition[] {
  const taken = new Set(AUTHORED.map((e) => objectivePeak(e.objective)));
  return PEAKS.filter((p) => !taken.has(shortPeakName(p)) && !taken.has(p.name)).map((p) => {
    const m = p.elevationM;
    const company = COMPANY_BY_REGION[p.region] ?? "Chamonix Alpine Guides";
    // Everything below is a function of altitude, and of nothing else.
    const days = m >= 8000 ? 55 : m >= 7000 ? 34 : m >= 6000 ? 22 : m >= 5000 ? 14 : m >= 4000 ? 7 : 4;
    const price = m >= 8000 ? 42000 : m >= 7000 ? 16500 : m >= 6000 ? 7400 : m >= 5000 ? 4200 : m >= 4000 ? 2300 : 1150;
    const requires =
      m >= 8000
        ? "Previous 7,000 m summit, fixed-line competence, months of preparation"
        : m >= 7000
          ? "Previous 6,000 m summit and solid glacier travel"
          : m >= 6000
            ? "Crampon and axe confident, comfortable on multi-day approaches"
            : m >= 5000
              ? "Good hill fitness and prior time above 3,000 m"
              : m >= 4000
                ? "Crampon-confident, 1,000 m ascent days"
                : "Hill fitness and a head for exposure";
    return {
      id: `e-gen-${p.id}`,
      company,
      verifiedOn: VERIFIED_ON[company] ?? "",
      // The mountain, with no route claimed. See the note above.
      objective: shortPeakName(p),
      country: p.country,
      heroPeak: p.id,
      durationDays: days,
      fromEur: toCents(price),
      requires,
      months: SEASON_BY_REGION[p.region] ?? "Jun – Sep",
    };
  });
}

export const EXPEDITIONS: Expedition[] = IS_DEMO
  ? [...AUTHORED, ...derivedExpeditions()]
  : [];

export const guideById = (id: string) => GUIDES.find((g) => g.id === id);
export const expeditionById = (id: string) => EXPEDITIONS.find((e) => e.id === id);

export function verificationSentence(verifiedOn: string): string {
  return `Documents checked by ICEFALL on ${verifiedOn}. We have not contacted the issuing association.`;
}

export function monogram(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "··";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}
