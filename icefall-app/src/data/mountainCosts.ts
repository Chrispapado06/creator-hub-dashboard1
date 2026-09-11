/**
 * WHAT IT COSTS TO CLIMB, AND WHO SAYS SO.
 *
 * Charlie, 11 September 2026: "add currect budgets and nessesary spending &
 * permits etc to be accurate."
 *
 * ACCURATE MEANS LOOKED UP, NOT REMEMBERED. Every figure below was read off a
 * named page on the date in `checked`, and that page's URL is in `source` so a
 * reader can check it in one tap. Nothing here is derived, averaged or
 * estimated from a neighbouring mountain.
 *
 * THE ONE DISTINCTION THAT MATTERS, and the reason `sourceKind` exists:
 *
 *   "issuer"    the body that actually charges the fee published this figure —
 *               the national park service, the alpine club that runs the hut,
 *               the provincial park. Treated as fact.
 *   "secondary" an operator, a guiding company or a news report quoting the
 *               fee. Usually right, occasionally a year stale, and never
 *               authoritative about a price somebody else sets.
 *
 * The page SAYS WHICH, every time, and never launders the second into the
 * first. A climber who books on a figure that turned out to be a year old has
 * been failed by this file, so the file admits what it is.
 *
 * WHY MOST MOUNTAINS ARE MISSING. Fourteen are curated; five have a cost
 * record. A mountain with no entry renders a sentence saying ICEFALL has not
 * recorded its costs — it does NOT render a plausible total built from a
 * comparable peak. Same rule the grade follows.
 *
 * KEEPING IT HONEST OVER TIME. Fees move. TANAPA's are on a published
 * escalator; Nepal's royalty had not moved since 2015 and then rose 36%
 * overnight. `checked` renders next to every figure precisely so an old
 * record looks old instead of looking current.
 */

/** How a fee is charged. The multiplier a total has to apply. */
export type CostBasis =
  | "person"
  | "person-per-day"
  | "person-per-night"
  | "trip"
  | "group";

export const BASIS_LABEL: Record<CostBasis, string> = {
  person: "per person",
  "person-per-day": "per person, per day",
  "person-per-night": "per person, per night",
  trip: "once per trip",
  group: "per group",
};

export type Currency = "USD" | "EUR" | "GBP" | "CHF";

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CHF: "CHF ",
};

export interface CostLine {
  label: string;
  /** As published. `max` present only where the issuer publishes a range. */
  min: number;
  max?: number;
  currency: Currency;
  basis: CostBasis;
  /** Required to climb at all, or a choice. */
  requirement: "required" | "optional";
  /** The condition or caveat the issuer attaches to it. */
  note?: string;
}

export type PermitAnswer =
  | {
      kind: "none";
      /** The headline. Short enough to be a section's one-line answer. */
      statement: string;
      /** What replaces it — the thing that actually stops people. */
      insteadRequired?: string;
    }
  | {
      kind: "required";
      statement: string;
      /** Who issues it, named. */
      issuedBy: string;
      /** Who obtains it in practice. */
      obtainedBy: string;
      /** How far ahead, where the issuer states a deadline. */
      leadTime?: string;
    };

export interface MountainCostRecord {
  mountainId: string;
  permit: PermitAnswer;
  lines: CostLine[];
  /** The page these figures were read from. */
  source: { label: string; url: string };
  sourceKind: "issuer" | "secondary";
  /** ISO date these figures were last read off that page. */
  checked: string;
  /** Anything a total would otherwise quietly omit. */
  caveats?: string[];
}

/* -------------------------------------------------------------------------- */
/* The records                                                                 */
/* -------------------------------------------------------------------------- */

const RECORDS: MountainCostRecord[] = [
  /* ---------------------------------------------------------------- Denali */
  {
    mountainId: "denali",
    permit: {
      kind: "required",
      statement: "Mountaineering special use permit required.",
      issuedBy: "US National Park Service, Denali National Park & Preserve",
      obtainedBy:
        "The climber, in their own name — guided parties register through their guide service.",
      leadTime: "At least 60 days before the start date.",
    },
    lines: [
      {
        label: "Mountaineering special use fee",
        min: 450,
        currency: "USD",
        basis: "person",
        requirement: "required",
        note: "USD 350 for climbers aged 24 or younger at the start of the climb. There is no separate application fee.",
      },
    ],
    source: {
      label: "US National Park Service — Denali mountaineering",
      url: "https://www.nps.gov/dena/planyourvisit/mountaineering.htm",
    },
    sourceKind: "issuer",
    checked: "2026-09-11",
    caveats: [
      "The park entrance fee is charged separately and is not in this total.",
      "The NPS page itself was last updated 26 November 2025.",
    ],
  },

  /* ----------------------------------------------------------- Mont Blanc */
  {
    mountainId: "mont-blanc",
    permit: {
      kind: "none",
      statement: "No climbing permit needed.",
      insteadRequired:
        "A confirmed Goûter hut booking. Reservation is obligatory and online only — climbers who have not booked are not let in — and bivouacking is forbidden by ministerial decree inside the classified area, so there is no legal way around it.",
    },
    lines: [
      {
        label: "Goûter hut — night",
        min: 70,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "required",
        note: "EUR 65 for French Alpine Club members. Tax not included. Rate for 30 May to 4 October 2026.",
      },
      {
        label: "Goûter hut — dinner",
        min: 52.2,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "required",
        note: "Half board at the hut is the night plus dinner plus breakfast.",
      },
      {
        label: "Goûter hut — breakfast",
        min: 21,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "required",
      },
    ],
    source: {
      label: "FFCAM — Refuge du Goûter, published tariff",
      url: "https://montblanc.ffcam.fr/GB_tarifs-1.html",
    },
    sourceKind: "issuer",
    checked: "2026-09-11",
    caveats: [
      "Tourist tax is added on top and is not in these figures.",
      "The Tramway du Mont-Blanc, a guide, glacier kit hire and insurance are all real costs on this route and none of them is recorded here yet.",
    ],
  },

  /* ---------------------------------------------------------- Kilimanjaro */
  {
    mountainId: "kilimanjaro",
    permit: {
      kind: "required",
      statement: "Park fees are the permit, and a licensed guide is compulsory.",
      issuedBy: "Tanzania National Parks Authority (TANAPA)",
      obtainedBy:
        "Your operator. Fees are collected with the trip price and paid at the gate in your name — there is no way to climb this mountain independently.",
    },
    lines: [
      {
        label: "Conservation fee",
        min: 70,
        currency: "USD",
        basis: "person-per-day",
        requirement: "required",
        note: "Charged for every day inside the park, so a longer route costs more.",
      },
      {
        label: "Camping fee",
        min: 50,
        currency: "USD",
        basis: "person-per-night",
        requirement: "required",
        note: "Machame, Lemosho, Umbwe, Rongai and Northern Circuit. Marangu charges a hut fee of USD 60 per night instead.",
      },
      {
        label: "Rescue fee",
        min: 20,
        currency: "USD",
        basis: "trip",
        requirement: "required",
        note: "Funds the park's own ground rescue team. It does not cover helicopter evacuation.",
      },
    ],
    source: {
      label: "Operator-published TANAPA fee schedules",
      url: "https://altezzatravel.com/articles/kilimanjaro-park-fees",
    },
    sourceKind: "secondary",
    checked: "2026-09-11",
    caveats: [
      "18% VAT is added to most of these tariffs and is not in the figures above.",
      "Crew entry fees and a forest fee are charged on top, and are not recorded here.",
      "TANAPA reviews these annually and they are on a published upward escalator, so an old reading of this page will read low.",
    ],
  },

  /* ------------------------------------------------------------ Aconcagua */
  {
    mountainId: "aconcagua",
    permit: {
      kind: "required",
      statement: "Provincial climbing permit required, and it is expensive.",
      issuedBy: "Parque Provincial Aconcagua, Mendoza Province",
      obtainedBy:
        "The climber, in person in the city of Mendoza. Permits are not sold at the park entrance, and only day tickets can be bought online.",
    },
    lines: [
      {
        label: "Climbing permit — Horcones route, unassisted",
        min: 1640,
        currency: "USD",
        basis: "person",
        requirement: "required",
        note: "Non-Latin-American climbers, 2026/27 season. Valid for up to 20 days in the park.",
      },
      {
        label: "Climbing permit — Horcones route, assisted",
        min: 1170,
        currency: "USD",
        basis: "person",
        requirement: "optional",
        note: "The lower rate applies when you take services from a local company. It is a different permit, not a discount.",
      },
    ],
    source: {
      label: "Aconcagua Provincial Park permit guide, 2026/27",
      url: "https://www.elrefugioaconcagua.com/en/blog/noticias-2/guide-to-activities-and-permits-aconcagua-provincial-park-2026-2027-5",
    },
    sourceKind: "secondary",
    checked: "2026-09-11",
    caveats: [
      "The 360°/Vacas route is priced differently and is not recorded here.",
      "Permit prices change with the season inside a single year, and are set before it.",
    ],
  },

  /* -------------------------------------------------------------- Everest */
  {
    mountainId: "everest",
    permit: {
      kind: "required",
      statement: "Nepal charges a royalty of USD 15,000 per climber in spring.",
      issuedBy: "Department of Tourism, Government of Nepal",
      obtainedBy:
        "A registered expedition operator, on behalf of a named team. The permit is not issued to an individual.",
    },
    lines: [
      {
        label: "Royalty — spring, south side standard route",
        min: 15000,
        currency: "USD",
        basis: "person",
        requirement: "required",
        note: "Raised from USD 11,000 with effect from 1 September 2025 — the first rise since 2015.",
      },
      {
        label: "Royalty — autumn",
        min: 7500,
        currency: "USD",
        basis: "person",
        requirement: "optional",
        note: "Raised from USD 5,500.",
      },
      {
        label: "Royalty — winter or monsoon",
        min: 3750,
        currency: "USD",
        basis: "person",
        requirement: "optional",
        note: "Raised from USD 2,750.",
      },
    ],
    source: {
      label: "Kathmandu Post — Everest permit revenue, May 2026",
      url: "https://kathmandupost.com/money/2026/05/06/everest-permits-steady-but-revenue-climbs-to-record",
    },
    sourceKind: "secondary",
    checked: "2026-09-11",
    caveats: [
      "The royalty is the government's fee alone. Liaison officer, garbage deposit, icefall doctors, oxygen, Sherpa support and the operator's own price are all extra, and none of them is recorded here.",
      "A full south-side expedition costs many times this figure. Do not read the royalty as the cost of the climb.",
    ],
  },
];

const BY_ID = new Map(RECORDS.map((r) => [r.mountainId, r]));

/** The cost record for a mountain, or null where ICEFALL has not recorded one. */
export function costsFor(mountainId: string | undefined): MountainCostRecord | null {
  if (!mountainId) return null;
  return BY_ID.get(mountainId) ?? null;
}

/**
 * The sentence shown where there is no record. It says what is missing and
 * why, and does NOT offer a guess.
 */
export const NO_COSTS_RECORDED =
  "ICEFALL has not recorded the permits and fees for this mountain yet. Rather than show an estimate built from a comparable peak, there is nothing here — ask your operator, or the body that issues the permit.";

/**
 * The required lines only, summed per person for a stated number of days and
 * nights. Null when nothing is required, so a caller shows no total rather
 * than a zero.
 *
 * ONE CURRENCY ONLY, DELIBERATELY. This refuses to add across two currencies
 * rather than invent an exchange rate the issuer never published. A record
 * that ever mixes them gets null, and the caller shows the lines instead.
 */
export function requiredTotal(
  record: MountainCostRecord,
  days: number,
  nights: number,
): { min: number; max: number; currency: Currency } | null {
  const required = record.lines.filter((l) => l.requirement === "required");
  if (required.length === 0) return null;

  const currencies = new Set(required.map((l) => l.currency));
  if (currencies.size !== 1) return null;

  const multiplier = (basis: CostBasis): number => {
    switch (basis) {
      case "person-per-day":
        return days;
      case "person-per-night":
        return nights;
      default:
        return 1;
    }
  };

  let min = 0;
  let max = 0;
  for (const line of required) {
    const m = multiplier(line.basis);
    min += line.min * m;
    max += (line.max ?? line.min) * m;
  }
  return { min, max, currency: required[0].currency };
}

/** How many days and nights the curated duration label implies, or null. */
export function daysFromDurationLabel(
  label: string,
): { days: number; nights: number } | null {
  /* "2 days", "2–3 days", "6–8 days". The upper bound is the honest
     one to price against: a fee charged per day is charged for every day you
     are there, and nobody comes down early to save money. */
  const matches = label.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const days = Math.max(...matches.map(Number));
  if (!Number.isFinite(days) || days < 1 || days > 90) return null;
  return { days, nights: Math.max(1, days - 1) };
}

/** "$70", "€143.20", "$1,170–$1,640". */
export function money(min: number, max: number | undefined, currency: Currency): string {
  const sym = CURRENCY_SYMBOL[currency];
  const one = (n: number) =>
    sym + n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return max !== undefined && max !== min ? one(min) + "–" + one(max) : one(min);
}
