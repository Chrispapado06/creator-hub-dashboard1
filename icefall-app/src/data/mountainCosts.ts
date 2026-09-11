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
 * WHY A MOUNTAIN MAY BE MISSING. Fourteen are curated. A mountain with no
 * entry renders a sentence saying ICEFALL has not recorded its costs — it does
 * NOT render a plausible total built from a comparable peak. Same rule the
 * grade follows. The one mountain left with no record on 11 September 2026 is
 * Mount Olympus: no Greek climbing permit or park fee could be found, and the
 * Spilios Agapitos refuge publishes no tariff at all on its own site — it asks
 * you to telephone. There was nothing to write down.
 *
 * "ICEFALL FOUND NO PERMIT" IS NOT "THERE IS NO PERMIT". Several records below
 * say the first of those, in those words, because that is the claim the
 * research actually supports. Sourcing an absence is not the same act as
 * sourcing a fee, and the wording refuses to pretend it is.
 *
 * WHERE TWO SOURCES DISAGREE, BOTH GO IN. K2 and Broad Peak are the live case:
 * two Gilgit-Baltistan government websites publish royalties that differ by
 * roughly a factor of three. The record carries the figures that state their
 * own basis, and a caveat carries the other set with its URL. Showing the
 * disagreement is the answer; picking a winner quietly is not.
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
  /* ------------------------------------------------------------------- K2 */
  {
    mountainId: "k2",
    permit: {
      kind: "required",
      statement:
        "A royalty is payable to the Government of Gilgit-Baltistan — and two of its own websites quote different figures.",
      issuedBy:
        "Government of Gilgit-Baltistan, under the Mountaineering and Trekking Rules 1999. Permits are administered by the Directorate of Tourist Services in Gilgit.",
      obtainedBy:
        "A licensed Pakistani tour operator, for a named party. One permit covers one peak and one party only; climb a second peak and you buy a second permit.",
    },
    lines: [
      {
        label: "Royalty — K2 (8,611 m), party of up to 7 climbers",
        min: 12000,
        currency: "USD",
        basis: "group",
        requirement: "required",
        note: "Reinstated to the 2001 rates by the Government of Gilgit-Baltistan with effect from 1 January 2023. This is the fee for the whole party, not for one climber.",
      },
      {
        label: "Royalty — each additional climber above 7",
        min: 3000,
        currency: "USD",
        basis: "person",
        requirement: "optional",
        note: "Charged for members 8 onwards. A party may not exceed 15 members in total.",
      },
    ],
    source: {
      label:
        "Government of Gilgit-Baltistan, Tourism Department — royalty fee schedule",
      url: "https://www.visitgilgitbaltistan.gov.pk/tour/id/35",
    },
    sourceKind: "issuer",
    checked: "2026-09-11",
    caveats: [
      "A second Gilgit-Baltistan government site — the Directorate of Tourist Services, which is the body that actually issues the permit — publishes a completely different schedule at https://dtsgb.gog.pk/fees: for 8,611 m, USD 3,500 in summer, USD 2,000 in autumn and USD 1,000 in winter. It does not say whether that is per party or per climber, and neither site says which schedule supersedes the other. ICEFALL shows the figures above because they are the only ones that state their own basis. Read both before you budget.",
      "The same Directorate page charges a Central Karakoram National Park expedition environment fee of USD 290 in the restricted zone, USD 140 in the open zone and USD 60 in the low-frequency zone. K2 sits inside that park. The page does not say whether the fee is per climber or per party, so no figure is carried in the lines above.",
      "Neither government page states how far ahead an application has to be filed. That is a gap in the published information, not a sign that there is no deadline.",
      "A defence liaison officer is attached to every permit. His costs fall on the party and are not published.",
      "The royalty is the government's fee alone. Porters, the Baltoro approach, oxygen, high-altitude staff and the operator's own price are all extra, and none of them is recorded here.",
    ],
  },

  /* ----------------------------------------------------------- Broad Peak */
  {
    mountainId: "broad-peak",
    permit: {
      kind: "required",
      statement:
        "A royalty is payable to the Government of Gilgit-Baltistan — and, as with K2, two of its own websites disagree about how much.",
      issuedBy:
        "Government of Gilgit-Baltistan, under the Mountaineering and Trekking Rules 1999. Permits are administered by the Directorate of Tourist Services in Gilgit.",
      obtainedBy:
        "A licensed Pakistani tour operator, for a named party. One permit covers one peak only — a Broad Peak permit does not let you step onto K2.",
    },
    lines: [
      {
        label: "Royalty — peaks 8,001–8,500 m, party of up to 7 climbers",
        min: 9500,
        currency: "USD",
        basis: "group",
        requirement: "required",
        note: "Broad Peak falls inside this band whichever of its published heights you take. This is the fee for the whole party, not for one climber.",
      },
      {
        label: "Royalty — each additional climber above 7",
        min: 3000,
        currency: "USD",
        basis: "person",
        requirement: "optional",
        note: "Charged for members 8 onwards. A party may not exceed 15 members in total.",
      },
    ],
    source: {
      label:
        "Government of Gilgit-Baltistan, Tourism Department — royalty fee schedule",
      url: "https://www.visitgilgitbaltistan.gov.pk/tour/id/35",
    },
    sourceKind: "issuer",
    checked: "2026-09-11",
    caveats: [
      "The Directorate of Tourist Services publishes a different schedule for the same band at https://dtsgb.gog.pk/fees: USD 2,500 in summer, USD 1,800 in autumn and USD 1,200 in winter, with no statement of whether that is per party or per climber. The two Gilgit-Baltistan government sites do not agree and neither explains the other.",
      "Broad Peak also sits inside Central Karakoram National Park, whose expedition environment fee on the Directorate page is USD 290 in the restricted zone, USD 140 in the open zone and USD 60 in the low-frequency zone — again with no basis stated, so no figure is carried above.",
      "Neither government page states an application deadline.",
      "A defence liaison officer is attached to every permit and his costs fall on the party.",
      "The royalty is the government's fee alone. The Baltoro approach, porters, oxygen and the operator's own price are all extra and none is recorded here.",
    ],
  },

  /* ------------------------------------------------------------ Annapurna */
  {
    mountainId: "annapurna",
    permit: {
      kind: "required",
      statement:
        "Nepal charges a royalty of USD 3,000 per climber in spring, plus a refundable rubbish deposit of USD 3,000 per team.",
      issuedBy: "Department of Tourism, Government of Nepal",
      obtainedBy:
        "A registered expedition operator, on behalf of a named team. The permit is not issued to an individual.",
    },
    lines: [
      {
        label: "Royalty — spring",
        min: 3000,
        currency: "USD",
        basis: "person",
        requirement: "required",
        note: "The published band is \"other mountains more than 8,000 m, except Everest and Manaslu\". Annapurna I is 8,091 m. Rate effective from 1 September 2025.",
      },
      {
        label: "Royalty — autumn",
        min: 1500,
        currency: "USD",
        basis: "person",
        requirement: "optional",
      },
      {
        label: "Royalty — winter or summer",
        min: 750,
        currency: "USD",
        basis: "person",
        requirement: "optional",
      },
      {
        label: "Garbage management deposit",
        min: 3000,
        currency: "USD",
        basis: "group",
        requirement: "required",
        note: "Schedule 9 of the regulation, for peaks above 8,001 m in the Khumbu and Annapurna ranges other than Everest. It is a deposit lodged by the team and returnable against the rules, not a charge — and it is levied once for the whole team, not per climber.",
      },
    ],
    source: {
      label:
        "Department of Tourism, Government of Nepal — mountaineering royalty and garbage deposit",
      url: "https://tourismdepartment.gov.np/pages/mountaineering-fee/",
    },
    sourceKind: "issuer",
    checked: "2026-09-11",
    caveats: [
      "An Annapurna Conservation Area entry permit is charged on top. ICEFALL could not find the National Trust for Nature Conservation's own published figure — operators quote NPR 3,000 for foreign nationals — so no figure is recorded here.",
      "A per-person total that adds the garbage deposit in whole is wrong. The deposit is one payment for the team, and it is meant to come back.",
      "Liaison officer, insurance for Nepali staff, oxygen, high-altitude workers and the operator's own price are all extra and none of them is recorded here.",
    ],
  },

  /* ------------------------------------------------------------ Matterhorn */
  {
    mountainId: "matterhorn",
    permit: {
      kind: "none",
      statement:
        "ICEFALL found no climbing permit published for the Matterhorn by any Swiss federal, cantonal or Zermatt authority.",
      insteadRequired:
        "A Hörnlihütte booking, if you sleep there — and on the Hörnli ridge nearly everyone does. The hut takes a deposit of CHF 50 per person per night that it states is never refunded on cancellation. Unlike Mont Blanc, ICEFALL found no rule making the hut compulsory or forbidding a bivouac.",
    },
    lines: [
      {
        label: "Hörnlihütte — bed in a public dormitory, half board",
        min: 150,
        currency: "CHF",
        basis: "person-per-night",
        requirement: "optional",
        note: "Dinner and breakfast included. Rooms sleep up to 8. Mountain guides, hiking guides and Alpine Club members get CHF 10 off on production of a card.",
      },
      {
        label: "Hörnlihütte — sleeping bag liner",
        min: 43,
        currency: "CHF",
        basis: "person",
        requirement: "optional",
        note: "Compulsory in the public dormitory. Bring your own or buy one at reception for this price.",
      },
      {
        label: "Hörnlihütte — booking deposit",
        min: 50,
        currency: "CHF",
        basis: "person-per-night",
        requirement: "optional",
        note: "Taken at booking. The hut states it is not refunded on cancellation, with no exception for illness, bad weather or anything else; a booking can be postponed within the season with 24 hours' notice.",
      },
      {
        label: "Hörnlihütte — emergency shelter contribution",
        min: 20,
        currency: "CHF",
        basis: "person",
        requirement: "optional",
        note: "Only when the hut is shut. Twenty mattresses and a toilet — no bedding, no water, no gas, no kitchen, and it cannot be reserved.",
      },
    ],
    source: {
      label: "Hörnlihütte — published rates",
      url: "https://hoernlihuette.ch/sleep/?lang=en",
    },
    sourceKind: "issuer",
    checked: "2026-09-11",
    caveats: [
      "The liner rule, the deposit, the CHF 10 card discount and the emergency shelter come from the hut's own Q&A at https://hoernlihuette.ch/qa/?lang=en, read the same day.",
      "A private suite sleeping two is CHF 500 a night on the same page; it is not carried above because it is priced per suite rather than per person.",
      "A guide is the largest real cost on this mountain and no guide tariff is recorded here. Nor is the Schwarzsee lift.",
      "The hut is seasonal. Outside its published season the rates above do not apply and only the emergency shelter is open.",
    ],
  },

  /* ---------------------------------------------------------------- Eiger */
  {
    mountainId: "eiger",
    permit: {
      kind: "none",
      statement:
        "ICEFALL found no climbing permit published for the Eiger by any Swiss federal, cantonal or Grindelwald authority.",
      insteadRequired:
        "On the Mittellegi ridge, a hut booking — the Mittellegi Hut states that a reservation is obligatory and binding, by its online system or by telephone. The 1938 north face route passes no hut at all, so nothing replaces the permit there.",
    },
    lines: [
      {
        label: "Mittellegi Hut — overnight with half board",
        min: 80,
        currency: "CHF",
        basis: "person-per-night",
        requirement: "optional",
        note: "The hut states there is no reduction for Alpine Club members. Dinner is at 18:30; breakfast is staggered by the warden to keep the ridge from jamming, and roped parties with a guide go first.",
      },
      {
        label: "Mittellegi Hut — bivouac in the unwardened hut",
        min: 30,
        currency: "CHF",
        basis: "person-per-night",
        requirement: "optional",
        note: "Eight beds, wool blankets, pillows, gas and pans. You bring your own water. A reservation through the online system is still required.",
      },
    ],
    source: {
      label:
        "Mittellegihütte (Bergführerverein Grindelwald) — reservation and prices",
      url: "https://www.mittellegi.ch/en/mittellegi-hut/reservation",
    },
    sourceKind: "issuer",
    checked: "2026-09-11",
    caveats: [
      "The hut belongs to the Grindelwald mountain guides' association, not to the SAC. That is why no alpine club card gets you anything here.",
      "Cancellation is free up to 48 hours before arrival; after that the night is charged in full.",
      "The Jungfrau railway to Eismeer, a guide, and the north face's own approach are all real costs on this mountain and none of them is recorded here.",
    ],
  },

  /* -------------------------------------------------------- Gran Paradiso */
  {
    mountainId: "gran-paradiso",
    permit: {
      kind: "none",
      statement:
        "ICEFALL found no climbing permit and no entry ticket published by Gran Paradiso National Park.",
      insteadRequired:
        "Nothing, in law. In practice the normal route is broken at the Vittorio Emanuele II or Chabod hut, and the Club Alpino Italiano publishes what the first of those costs down to the euro.",
    },
    lines: [
      {
        label: "Rifugio Vittorio Emanuele II — bed in a room of more than four",
        min: 34.5,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "Non-members. EUR 27.60 for CAI members and members of reciprocal clubs, EUR 24.15 for CAI members under 25.",
      },
      {
        label: "Rifugio Vittorio Emanuele II — bed in a room of up to four",
        min: 39,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "Non-members. EUR 31.20 for CAI members, EUR 27.30 for CAI members under 25.",
      },
      {
        label: "Rifugio Vittorio Emanuele II — half board",
        min: 64,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "Each CAI section sets this rate itself. CAI guarantees its members at least 20% off it, and members under 25 at least 30%.",
      },
      {
        label: "Rifugio Vittorio Emanuele II — emergency bed",
        min: 11.5,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "Non-members. EUR 9.20 for CAI members, EUR 8.05 for members under 25.",
      },
    ],
    source: {
      label:
        "Club Alpino Italiano booking portal — Rifugio Vittorio Emanuele II tariff",
      url: "https://www.prenotarifugi.cai.it/dettaglio/?id_cai=921200114",
    },
    sourceKind: "issuer",
    checked: "2026-09-11",
    caveats: [
      "These match CAI's category D column in its national tariff for 2026, circular 15/2025, which sets the prices as maximums and the member discounts as minimums and runs from 8 January 2026 to 10 January 2027: https://www.cai.it/wp-content/uploads/2025/10/15-2025-Circolare-Tariffario-rifugi-2026_signed.pdf",
      "A personal sheet sleeping bag is compulsory for an overnight stay, and the member discount stops after three consecutive nights.",
      "A 30% heating surcharge applies to non-members between 1 October and 30 April.",
      "The Chabod hut is run separately and its tariff is not recorded here, even though the curated route names it.",
    ],
  },

  /* -------------------------------------------------------------- Triglav */
  {
    mountainId: "triglav",
    permit: {
      kind: "none",
      statement:
        "ICEFALL found no climbing permit and no park entry ticket published by Triglav National Park.",
      insteadRequired:
        "A bed at Triglavski dom na Kredarici if you break the ascent there, which most people do. The hut states that a reservation is required and that it needs a Visa or Mastercard to hold one.",
    },
    lines: [
      {
        label: "Kredarica — bed in a dormitory of more than 12",
        min: 27.5,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "Full price. EUR 16.50 with the 40% discount for members of the Alpine Association of Slovenia and of the clubs it lists as reciprocal — which include the BMC, the Alpine Club, the DAV, the SAC, the FFCAM, the CAI and the American Alpine Club.",
      },
      {
        label: "Kredarica — bed in a dormitory of up to 12",
        min: 31.5,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "Full price. EUR 18.90 for members with the 40% discount.",
      },
      {
        label: "Kredarica — bed in a room of 3 to 6",
        min: 38,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "Full price. EUR 26.60 for members with the 30% discount. A two-bed room is EUR 40.00, or EUR 28.00 for members.",
      },
      {
        label: "Kredarica — half board surcharge",
        min: 30,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "Dinner and breakfast, on top of the bed. Breakfast alone is EUR 15.00.",
      },
      {
        label: "Kredarica — single-use bedding",
        min: 7,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "Compulsory for guests without their own bed linen. An ordinary sleeping bag is not accepted, staff may check, and the stated penalty for breaking the rule is three times the full price of the night.",
      },
      {
        label: "Kredarica — tourist tax",
        min: 2.5,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "Charged for every night. Half rate for guests aged 7 to 18, nothing for children under 7.",
      },
    ],
    source: {
      label:
        "Planinsko društvo Ljubljana-Matica — Triglavski dom na Kredarici accommodation price list",
      url: "https://www.pd-ljmatica.si/wp-content/uploads/ceniki/price_list_kredarica.pdf",
    },
    sourceKind: "issuer",
    checked: "2026-09-11",
    caveats: [
      "The accommodation list states it is valid from 25 May 2026; the food and drink list on its second page from 1 June 2026.",
      "9.5% purchase tax is already included in these prices. The tourist tax is not.",
      "The hut publishes its 2026 season as 6 June to 30 September. Outside it there is no warden and this tariff does not apply.",
      "A guide, if you take one for the via ferrata sections, is not recorded here.",
    ],
  },

  /* -------------------------------------------------------------- Toubkal */
  {
    mountainId: "toubkal",
    permit: {
      kind: "none",
      statement:
        "No climbing permit and no park entry fee that ICEFALL could find — but you are unlikely to get past the checkpoint alone.",
      insteadRequired:
        "A local guide. Every account ICEFALL found describes a Gendarmerie Royale checkpoint at Aroumd, a few kilometres above Imlil, where a passport and the guide's accreditation are checked, and dates a compulsory-guide rule between Imlil and the summit to 2019. No Moroccan government page stating that rule could be found, so it is recorded here as reported, not as published.",
    },
    lines: [
      {
        label: "Refuge du Toubkal — night, 1 May to 31 October",
        min: 25,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "EUR 20 for members of the Club Alpin Français.",
      },
      {
        label: "Refuge du Toubkal — night, 1 November to 30 April",
        min: 30,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "EUR 25 for members of the Club Alpin Français.",
      },
      {
        label: "Refuge du Toubkal — breakfast",
        min: 5,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
      },
      {
        label: "Refuge du Toubkal — dinner",
        min: 10,
        currency: "EUR",
        basis: "person-per-night",
        requirement: "optional",
        note: "Lunch is the same price, EUR 10.",
      },
    ],
    source: {
      label:
        "Refuge du Toubkal (Louis Neltner), Club Alpin Français — published rates",
      url: "https://www.refugedutoubkal.com/en/rates-et-booking/23",
    },
    sourceKind: "issuer",
    checked: "2026-09-11",
    caveats: [
      "The refuge's rates page carries a 2019 copyright notice. The tariff may not have been revised since, and ICEFALL has not been able to confirm a 2026 revision. Treat these figures as the oldest on this page.",
      "The UK Foreign Office advises hiring a professional guide in the Atlas but does not say one is legally required: https://www.gov.uk/foreign-travel-advice/morocco/safety-and-security. That is weaker than what the operators and trip reports describe, and the two have not been reconciled.",
      "A second refuge, Les Mouflons, stands beside this one. Its tariff is not recorded here.",
      "Guide and muleteer fees are the largest real cost on this mountain, and no published tariff for either is recorded here.",
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
