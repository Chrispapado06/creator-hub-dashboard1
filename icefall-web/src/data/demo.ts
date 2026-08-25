import { eur as toCents, type Cents } from "@/money/model";

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
}

export const EXPEDITIONS: Expedition[] = IS_DEMO
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
