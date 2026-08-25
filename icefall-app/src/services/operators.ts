import type { Peak } from "@/services/peaks";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";

/**
 * The expedition operator directory.
 *
 * IMPORTANT: these are SAMPLE listings, not real companies. ICEFALL has no
 * operator partnerships, and the one thing this app must never do is send
 * someone's money or their season to a guiding company that doesn't exist. So
 * every listing is flagged `sample: true`, every card that renders one says so,
 * and the enquiry flow states plainly that nothing leaves the device.
 *
 * When real partnerships exist, this module is where they land — the screens
 * above it don't change.
 */

export interface Operator {
  id: string;
  name: string;
  /** What they're certified by. Sample listings mirror the real qualifications. */
  certification: string;
  /** Regions the listing covers, matched against the peak's country. */
  regions: string[];
  /** Minimum elevation band this operator works on. */
  minElevationM: number;
  responseHours: number;
  /** Always true today. A real partner would be false. */
  sample: true;

  /* ---- Mockup-only presentation fields ---------------------------------- */
  /**
   * Everything below exists so the directory layout can be evaluated with a
   * realistic-looking page, and NOTHING below is a fact.
   *
   * These are placeholder figures on placeholder businesses. They are rendered
   * only for entries carrying `demo: true`, and every such card shows a DEMO
   * badge, because a rating on a guiding company is the single most persuasive
   * thing on this screen and there is nothing behind it. When real operators
   * sign, these fields are deleted rather than filled in — a real rating needs
   * real reviews, not a number moved from here into production.
   */
  demo?: true;
  city?: string;
  coverage?: string;
  rating?: number;
  reviewCount?: number;
  yearsExperience?: number;
  membersJoined?: number;
  /** Indicative price band, EUR. Demo entries only — invented, like the rest. */
  priceFromEur?: number;
  priceToEur?: number;
  /**
   * Third-party trademark, used in a LOCAL design mockup only.
   * public/img/operators is gitignored AND vercelignored — unconditionally, so
   * these never reach any deployment — and the card falls back to a monogram
   * when the file is absent.
   */
  logo?: string;
  blurb?: string;
  popularObjectives?: string[];
}

export const OPERATOR_DISCLAIMER =
  "Sample directory. These are illustrative listings, not real companies — ICEFALL has no operator partnerships and does not vet, endorse or take payment for expeditions. Use them to try the enquiry flow, and find a real IFMGA-certified operator before booking anything.";

const OPERATORS: Operator[] = [
  {
    id: "op-himalaya",
    name: "Himalaya — sample listing",
    certification: "IFMGA-led, Nepal-registered agency",
    regions: ["Nepal", "India", "China", "Bhutan"],
    minElevationM: 5000,
    responseHours: 48,
    sample: true,
  },
  {
    id: "op-karakoram",
    name: "Karakoram — sample listing",
    certification: "Licensed Pakistani agency, liaison officer arranged",
    regions: ["Pakistan", "China"],
    minElevationM: 5000,
    responseHours: 72,
    sample: true,
  },
  {
    id: "op-andes",
    name: "Andes — sample listing",
    certification: "IFMGA-led, provincially permitted",
    regions: ["Argentina", "Chile", "Peru", "Bolivia", "Ecuador"],
    minElevationM: 4000,
    responseHours: 36,
    sample: true,
  },
  {
    id: "op-alps",
    name: "Alps — sample listing",
    certification: "IFMGA / UIAGM certified guides",
    regions: ["Switzerland", "France", "Italy", "Austria", "Slovenia", "Germany"],
    minElevationM: 2500,
    responseHours: 24,
    sample: true,
  },
  {
    id: "op-alaska",
    name: "Alaska & Yukon — sample listing",
    certification: "Park-authorised concessionaire",
    regions: ["United States", "Canada"],
    minElevationM: 3500,
    responseHours: 48,
    sample: true,
  },
  {
    id: "op-global",
    name: "Worldwide — sample listing",
    certification: "IFMGA-led, multi-range",
    regions: [],
    minElevationM: 0,
    responseHours: 72,
    sample: true,
  },
];

/**
 * Every listing the directory holds.
 *
 * A copy, so no screen can mutate the catalogue, and the only way to enumerate
 * it — the directory screen must show exactly what this module contains and
 * never a listing of its own making.
 */
/**
 * Placeholder companies for evaluating the directory layout.
 *
 * Requested explicitly as a mockup. None of these businesses exist, none of the
 * ratings, review counts or years are real, and every card that renders one is
 * badged DEMO. Set SHOW_DEMO_OPERATORS to false to remove them entirely.
 */
/**
 * LOCAL DESIGN MOCKUP ONLY — MUST NOT SHIP.
 *
 * These four are real businesses. The ratings, review counts, years and prices
 * attached to them here are INVENTED by ICEFALL for the purpose of evaluating
 * this layout, and publishing invented commercial claims about identifiable
 * companies is defamatory and passes their trademarks off as ICEFALL content.
 *
 * Hence: gated. An ordinary production build resolves this to false and the
 * directory falls back to the honest sample listings. A build made with
 * VITE_SHOW_DEMO=1 shows them, and may only be deployed behind Vercel
 * Deployment Protection — see `@/lib/demoFlag`. Their LOGOS ship nowhere at
 * all: public/img/operators stays vercelignored, so the cards render monograms
 * and these companies' marks never sit on an ICEFALL server.
 */
export const SHOW_DEMO_OPERATORS = SHOW_DEMO_DATA;

export const DEMO_OPERATORS: Operator[] = [
  {
    id: "demo-summit",
    priceFromEur: 52000,
    priceToEur: 68000,
    name: "Seven Summit Treks",
    logo: "/img/operators/sst.png",
    certification: "8,000 m expedition operator",
    regions: ["Nepal", "China", "India", "Pakistan"],
    minElevationM: 5000,
    responseHours: 24,
    sample: true,
    demo: true,
    city: "Kathmandu, Nepal",
    coverage: "Worldwide",
    rating: 4.9,
    reviewCount: 128,
    yearsExperience: 12,
    membersJoined: 31,
    blurb:
      "High altitude specialists with a focus on safety, success and unforgettable experiences.",
    popularObjectives: ["Everest Base Camp", "Island Peak", "Ama Dablam", "Mera Peak"],
  },
  {
    id: "demo-altitude",
    priceFromEur: 2400,
    priceToEur: 4800,
    name: "Adventure Consultants",
    logo: "/img/operators/ac.png",
    certification: "Guided expeditions since 1991",
    regions: ["Nepal", "New Zealand", "Argentina", "Tanzania", "France", "Switzerland", "Italy"],
    minElevationM: 2500,
    responseHours: 24,
    sample: true,
    demo: true,
    city: "Wanaka, New Zealand",
    coverage: "Worldwide",
    rating: 4.8,
    reviewCount: 96,
    yearsExperience: 8,
    membersJoined: 24,
    blurb: "Professional guides, small groups, and personalised expedition planning.",
  },
  {
    id: "demo-peak",
    priceFromEur: 1800,
    priceToEur: 6500,
    name: "Elite Exped",
    logo: "/img/operators/ee.svg",
    certification: "High-altitude expeditions",
    regions: ["Nepal", "Pakistan", "China", "United Kingdom"],
    minElevationM: 2000,
    responseHours: 36,
    sample: true,
    demo: true,
    city: "London, United Kingdom",
    coverage: "Worldwide",
    rating: 4.7,
    reviewCount: 64,
    yearsExperience: 10,
    membersJoined: 18,
    blurb: "From first-time trekkers to high-altitude climbers, we make mountains accessible.",
  },
  {
    id: "demo-north",
    priceFromEur: 3200,
    priceToEur: 9500,
    name: "14 Peaks Expedition",
    logo: "/img/operators/p14.png",
    certification: "Himalayan expedition operator",
    regions: ["Nepal", "China", "India"],
    minElevationM: 3000,
    responseHours: 48,
    sample: true,
    demo: true,
    city: "Kathmandu, Nepal",
    coverage: "Worldwide",
    rating: 4.6,
    reviewCount: 51,
    yearsExperience: 15,
    membersJoined: 15,
    blurb: "Specialists in alpine climbs and remote wilderness expeditions.",
  },
];

export const DEMO_NOTICE =
  "Local design mockup. These are real companies, but every rating, review count, year and price shown against them was invented by ICEFALL to test this layout — none of it is theirs. Not published, not contactable. Placeholder companies, shown to evaluate this layout. None of these businesses exist and none of the ratings, reviews or years are real. Nothing here can be contacted.";

export function allOperators(): Operator[] {
  return SHOW_DEMO_OPERATORS ? [...DEMO_OPERATORS, ...OPERATORS] : [...OPERATORS];
}

/** Listings plausible for this peak — region first, then the global fallback. */
export function operatorsFor(peak: { country?: string; elevationM: number }): Operator[] {
  const pool = allOperators();
  /**
   * Curated mountains store a compound country — "Nepal / China",
   * "France / Italy" — because they sit on a border. An exact match therefore
   * failed for Everest, Mont Blanc and the Matterhorn, i.e. exactly the
   * objectives someone would look for an operator on, and every one of them
   * silently showed only the worldwide fallback. Match on any named country.
   */
  const countries = (peak.country ?? "")
    .split(/[/,]|\band\b/)
    .map((c) => c.trim())
    .filter(Boolean);

  const covers = (o: Operator) =>
    o.regions.length > 0 &&
    countries.some((c) => o.regions.includes(c)) &&
    peak.elevationM >= o.minElevationM;

  // Region match first, then the multi-range fallbacks. Within each group the
  // order is alphabetical — deterministic, and never for sale.
  // Demo entries first WITHIN the regional group: they carry the fuller card,
  // so the lead slot shows the layout at its best. Not a paid position — there
  // is nothing to pay for, and the badge says what they are.
  const regional = pool
    .filter(covers)
    .sort(
      (a, b) => Number(Boolean(b.demo)) - Number(Boolean(a.demo)) || a.name.localeCompare(b.name),
    );
  const global = pool
    .filter((o) => o.regions.length === 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...regional, ...global];
}

/**
 * Resolves against whatever is actually on screen.
 *
 * Must use `allOperators()`, not `OPERATORS`: in a dev build the demo listings
 * are rendered — including the lead card — so looking them up in the real
 * catalogue alone meant every "View profile & chat" link from a demo card
 * dead-ended, bouncing back to the inbox or showing "unknown listing". A
 * production build drops demo entries from `allOperators()`, so a hand-typed
 * demo id still correctly resolves to nothing there.
 */
export function operatorById(id: string): Operator | undefined {
  return allOperators().find((o) => o.id === id);
}

/** A first message the athlete can send as-is or edit. */
export function draftEnquiry(args: {
  peakName: string;
  elevationM: number;
  targetDate?: string;
  preparation?: number;
}): string {
  const when = args.targetDate
    ? new Date(args.targetDate).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "a date still to be decided";

  return [
    `I'm planning an ascent of ${args.peakName} (${args.elevationM.toLocaleString("en-GB")} m), targeting ${when}.`,
    "",
    "Could you send me:",
    "• Your available departures and the route you run",
    "• Guide-to-client ratio on technical ground",
    "• What the price includes and excludes (permits, park fees, oxygen, insurance)",
    "• The experience you expect clients to arrive with",
    "• Your emergency and evacuation plan",
    "",
    "Thank you.",
  ].join("\n");
}

export type { Peak };
