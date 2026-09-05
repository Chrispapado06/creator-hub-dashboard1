import type { Peak } from "@/services/peaks";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";

/**
 * The expedition operator directory.
 *
 * TWO KINDS OF LISTING, AND THE DIFFERENCE MATTERS.
 *
 * Most are SAMPLE listings — placeholder companies that do not exist, flagged
 * `sample: true`, so the one thing this app must never do is send someone's
 * money or their season to a guiding company that isn't there.
 *
 * A few name REAL companies and are flagged `real: true`. Those carry nothing
 * but checkable facts: the name, the ground they work, a link to their own
 * site. No rating, no price, no response time — because inventing any of those
 * about an identifiable business is defamatory, which this directory learned
 * the hard way (see the note above `DEMO_OPERATORS`).
 *
 * ICEFALL has no operator partnerships of either kind, vets nobody, and the
 * enquiry flow states plainly that nothing leaves the device.
 *
 * When real partnerships exist, this module is where they land — the screens
 * above it don't change.
 */


/**
 * One trip a listing runs.
 *
 * INVENTED IN FULL, like everything else on `demo: true` entries — the price,
 * the ratio, the itinerary, the inclusions and the departures. The departures
 * are the sharpest of these: "5 spots left" is both a fabricated number and a
 * scarcity cue designed to hurry a decision, and the decision here is which
 * company to follow onto an 8,000 m mountain. It renders behind the demo gate
 * and nowhere else, and a real one must come from the operator's own booking
 * system or not exist.
 */
export interface Trip {
  id: string;
  name: string;
  days: number;
  country: string;
  priceFromEur: number;
  rating: number;
  reviewCount: number;
  badge?: "popular" | "best-value" | "premium";
  /** An ICEFALL peak photograph, never the company's own imagery. */
  photo: string;

  /* ---- The trip's own page ---------------------------------------------- */
  /** The peak, when the trip is an ascent — links the page to real route data. */
  peakName?: string;
  elevationM?: number;
  region?: string;
  difficultyLabel?: string;
  /** "1:5" — climbers per guide. */
  guideRatio?: string;
  bestSeason?: string;
  about?: string;
  /** The six tiles under "price includes". */
  inclusions?: { label: string; detail: string }[];
  /** What the price does NOT cover — the half of a quote people get caught by. */
  excluded?: string[];
  highlights?: string[];
  itinerary?: { days: string; label: string }[];
  departures?: { id: string; date: string; days: number; spotsLeft: number; priceFromEur: number; badge?: string }[];
  faq?: { q: string; a: string }[];
}

export interface Operator {
  id: string;
  name: string;
  /** What they're certified by. Sample listings mirror the real qualifications. */
  certification: string;
  /** Regions the listing covers, matched against the peak's country. */
  regions: string[];
  /** Minimum elevation band this operator works on. */
  minElevationM: number;
  /**
   * Typical reply time. OPTIONAL, because it is a claim.
   *
   * A sample listing can carry one — nobody is being described. A listing that
   * names a REAL company cannot: ICEFALL has never messaged them and has no
   * idea how fast they answer, and "Replies within 24 h" beside a real firm's
   * name is a service claim we invented on their behalf.
   */
  responseHours?: number;
  /** True on a placeholder listing. Absent on one that names a real business. */
  sample?: true;
  /**
   * NAMES AN ACTUAL COMPANY.
   *
   * Such an entry may carry ONLY checkable facts — the name, the ground it
   * works, a link to its own site. No rating, no review count, no price band,
   * no response time, no summit rate, and never `demo`. The reason is written
   * at length above `DEMO_OPERATORS`: this directory once carried exactly
   * these companies with invented figures, and inventing commercial claims
   * about an identifiable business is defamatory regardless of who reads it.
   * A flag is cheaper than remembering the rule, so the flag is here and the
   * figures are simply absent from the record.
   */
  real?: true;
  /** The company's own site — the only place a real one can be acted on. */
  website?: string;
  /**
   * PINNED TO THE TOP SLOT, AND LABELLED THERE.
   *
   * The list is otherwise ordered on how specifically a listing covers the
   * peak, then alphabetically, and the top card says "Best match for Everest"
   * because that is what the ordering computed. A chosen slot is not that, and
   * dressing it as a match would make the one honest signal on the screen
   * meaningless.
   *
   * So a featured entry takes the top card and the badge reads FEATURED
   * instead — which is the arrangement this screen has always described for a
   * promoted position: labelled, and outside the ranking. Nothing is being
   * paid for today; this is the owner's editorial choice.
   */
  featured?: true;

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
   * A COMPANY'S OWN MARK, AND ONLY FROM ITS OWNER.
   *
   * NO ENTRY IN THIS FILE SETS IT — that is the ruling, not a description of a
   * passing state. Two `real` entries carried marks the owner had supplied by
   * hand into `public/img/operators`; both `logo` lines were deleted on
   * 2026-09-04 and the monogram renders for every listing instead.
   *
   * What made that a decision rather than tidying: the directory was gitignored
   * from the start and vercelignored only from 2026-09-04, and a comment here
   * asserted both for months while `vercel` — which deploys the local working
   * directory, not git — copied the folder into every build. Four real
   * companies' marks were downloadable from the live deployment at a guessable
   * path. A safety model that depends on a file staying on one machine is one
   * ignore-file away from being untrue, so the field is left unset and the
   * exposure has nothing to leak.
   *
   * The type survives for the day an operator uploads their own mark through a
   * portal, at which point ICEFALL is rendering something handed to it rather
   * than something it collected.
   *
   * The INVENTED companies in `DEMO_OPERATORS` have none and never will — an
   * invented company has no mark.
   *
   * A logo is not evidence. It must never sit beside a verification tick, and
   * `CompanyMark` keeps the two apart deliberately.
   */
  logo?: string;
  blurb?: string;
  popularObjectives?: string[];

  /* ---- Company profile, mockup-only ------------------------------------- */
  /**
   * Everything below drives the company profile screen and is invented in
   * exactly the same way as the fields above — including, for the four entries
   * that name real businesses, the statistics, the operational claims and the
   * reviews. A review is a named person's account of a trip they did not take,
   * and a "92% summit rate" is a commercial claim nobody made. Both are gated
   * on `demo: true` behind SHOW_DEMO_DATA, and neither may ever be promoted to
   * a production build without the company itself supplying it in writing.
   */
  tagline?: string;
  expeditionCount?: number;
  summiteerCount?: number;
  about?: string;
  /** The four pillar tiles. */
  pillars?: { label: string; detail: string }[];
  /** The highlights list beside the about card. */
  highlights?: { label: string; detail: string }[];
  /** Trips this listing runs — the featured strip, and a page each. */
  trips?: Trip[];
  reviews?: { id: string; author: string; stars: number; agoLabel: string; body: string }[];
  /** ICEFALL's own mountain photography — see the note on `trips.photo`. */
  gallery?: string[];
  faq?: { q: string; a: string }[];
}

export const OPERATOR_DISCLAIMER =
  "ICEFALL has no operator partnerships and does not vet, endorse or take payment for expeditions. Entries marked as sample listings are illustrative and exist to try the enquiry flow. The rest name real companies and carry nothing but their name and the ground they work — no rating, price or response time, because ICEFALL has not measured any of them. Check any operator's credentials yourself before booking.";

const OPERATORS: Operator[] = [
  /*
   * REAL COMPANIES, FACTS ONLY.
   *
   * Requested by the owner for the Everest list. They are named because they
   * genuinely run 8,000 m expeditions, and they carry no rating, no review
   * count, no price and no response time — see `real` on the interface, and
   * the note above `DEMO_OPERATORS` for what happened the last time this
   * directory attached invented figures to these exact businesses.
   *
   * No logos either. A trademark on a card ICEFALL assembled reads as the
   * company's own page; `logo` stays empty and the monogram renders instead,
   * until an operator uploads their own.
   */
  {
    id: "op-elite-exped",
    name: "Elite Exped",
    featured: true,
    certification: "Nepal-registered expedition operator",
    regions: ["Nepal", "China", "Pakistan"],
    minElevationM: 5000,
    real: true,
    website: "https://eliteexped.com",
  },
  {
    id: "op-14-peaks",
    name: "14 Peaks Expedition",
    certification: "Nepal-registered expedition operator",
    regions: ["Nepal", "China"],
    minElevationM: 5000,
    real: true,
    website: "https://14peaksexpedition.com",
  },
  {
    // No mark: nothing has been supplied for 8K, so the monogram renders.
    // `CompanyMark` falls back on its own if a path is missing or fails.
    id: "op-8k-expeditions",
    name: "8K Expeditions",
    certification: "Nepal-registered expedition operator",
    regions: ["Nepal", "China", "Pakistan"],
    minElevationM: 5000,
    real: true,
    website: "https://8kexpeditions.com",
  },
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
 * LOCAL DESIGN MOCKUP — INVENTED COMPANIES, INVENTED FIGURES.
 *
 * These four USED TO BE REAL BUSINESSES: Seven Summit Treks, Adventure
 * Consultants, Elite Exped and 14 Peaks Expedition, each carrying ratings,
 * review counts, summiteer totals, prices and a "92% summit rate" that ICEFALL
 * made up. Publishing invented commercial claims about an identifiable company
 * is defamatory whoever reads it, and it left one deployment setting — Vercel
 * Deployment Protection — as the only thing standing between the claim and the
 * public. A configuration checkbox is not a place to keep a legal exposure.
 *
 * So the names are now invented, built from the same constructed surnames as
 * the demo guides in `guides/types.ts` so the whole demo cast is recognisably
 * one invention, and the logos are gone — an invented company has no mark, and
 * the cards fall back to a monogram, which is what they already did on any
 * machine that was not the designer's.
 *
 * The FIGURES are still invented, which is why this stays gated: an ordinary
 * production build resolves the flag to false, the array is `[]` at definition,
 * and the directory falls back to the honest sample listings. What has changed
 * is that the failure mode if it ever leaks is an embarrassment rather than a
 * commercial claim about somebody else's business.
 */
export const SHOW_DEMO_OPERATORS = SHOW_DEMO_DATA;

export const DEMO_OPERATORS: Operator[] = !SHOW_DEMO_OPERATORS
  ? []
  : [
  {
    id: "demo-summit",
    priceFromEur: 52000,
    priceToEur: 68000,
    name: "Falkenrath Expeditions",
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
    name: "Halvorsen Alpine",
    certification: "Small-group expedition operator",
    regions: ["Nepal", "New Zealand", "Argentina", "Tanzania", "France", "Switzerland", "Italy"],
    minElevationM: 2500,
    responseHours: 24,
    sample: true,
    demo: true,
    city: "Innsbruck, Austria",
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
    name: "Zelenika High Altitude",
    certification: "High-altitude expeditions",
    regions: ["Nepal", "Pakistan", "China", "United Kingdom"],
    minElevationM: 2000,
    responseHours: 36,
    sample: true,
    demo: true,
    city: "Chamonix, France",
    coverage: "Worldwide",
    rating: 4.7,
    reviewCount: 64,
    yearsExperience: 10,
    membersJoined: 18,
    blurb: "First trekking peaks through to the 8,000 m programmes, on one ladder.",
  },
  {
    id: "demo-north",
    priceFromEur: 3200,
    priceToEur: 9500,
    name: "Callaghan Himalaya",
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

/**
 * The company-profile fields, kept apart from the listings above.
 *
 * Separated so the line between "what the directory needs" and "what the mockup
 * needs" stays visible: everything here is presentation, all of it invented,
 * and all of it attached to businesses that are real. Merged in below rather
 * than written into the four literals, so deleting this one constant is all it
 * takes to strip every fabricated statistic, claim and review from the build.
 *
 * Prices are EUR, like every other figure in ICEFALL. The design they came from
 * showed USD; converting the currency label without converting the number would
 * have been a third invented fact on top of the two already here.
 */
const DEMO_PROFILES: Record<string, Partial<Operator>> = !SHOW_DEMO_OPERATORS
  ? {}
  : {
  "demo-summit": {
    tagline: "Everest expedition specialists",
    yearsExperience: 25,
    expeditionCount: 500,
    summiteerCount: 1250,
    about:
      "A high-altitude expedition company working mainly on Everest, with guides, Sherpas and support staff who return to the same mountain season after season.",
    pillars: [
      { label: "Safety first", detail: "Our top priority" },
      { label: "Expert guides", detail: "IFMGA certified" },
      { label: "High success", detail: "Rate not published" },
      { label: "Sustainable", detail: "Eco responsible" },
    ],
    highlights: [
      { label: "Everest specialists", detail: "150+ Everest expeditions run" },
      { label: "High altitude experts", detail: "All 8,000 m peaks covered" },
      { label: "Premium support", detail: "1:1 Sherpa ratio on the summit push" },
      { label: "Medical support", detail: "Doctor on call for the expedition" },
      { label: "Equipment included", detail: "Tents, oxygen and group gear" },
      { label: "Sustainability focused", detail: "Carry-out policy above base camp" },
    ],
    trips: [
      {
        id: "t-eve",
        name: "Everest Expedition (8,848 m)",
        days: 60,
        country: "Nepal",
        priceFromEur: 62000,
        rating: 4.9,
        reviewCount: 86,
        badge: "premium",
        photo: "/img/everest.jpg",
        peakName: "Everest",
        elevationM: 8848,
        region: "Khumbu Region, Nepal",
        difficultyLabel: "Challenging",
        guideRatio: "1:5",
        bestSeason: "Mar – May / Sep – Nov",
        about:
          "A high-altitude ascent for climbers with 7,000 m experience behind them. Staged acclimatisation rotations, supplementary oxygen above the South Col and a Sherpa team that works the route every season.",
        inclusions: [
          { label: "Permits & fees", detail: "All climbing permits and government fees" },
          { label: "Guides & Sherpas", detail: "Licensed guides and experienced Sherpas" },
          { label: "Accommodation", detail: "Hotels in the city and tents on the mountain" },
          { label: "Meals & nutrition", detail: "All meals during the expedition" },
          { label: "Oxygen & gear", detail: "Supplementary oxygen and technical gear" },
          { label: "Safety & support", detail: "Medical support and communications" },
        ],
        highlights: [
          "Summit the highest mountain in the world",
          "Sherpa team that returns to the route every season",
          "Acclimatisation planned around safety, not the schedule",
          "Oxygen cached high on the route",
          "Views across the Khumbu from the South Col",
        ],
        itinerary: [
          { days: "Day 1–2", label: "Arrival in Kathmandu" },
          { days: "Day 3–7", label: "Trek to Everest Base Camp" },
          { days: "Day 8–20", label: "Acclimatisation & rotations" },
          { days: "Day 21–40", label: "Summit push" },
          { days: "Day 41–60", label: "Descent & return to Kathmandu" },
        ],
        departures: [
          { id: "d1", date: "12 March 2027", days: 60, spotsLeft: 5, priceFromEur: 62000, badge: "Popular" },
          { id: "d2", date: "25 March 2027", days: 60, spotsLeft: 3, priceFromEur: 62000 },
          { id: "d3", date: "10 September 2027", days: 60, spotsLeft: 6, priceFromEur: 62000 },
        ],
        faq: [
          { q: "What experience do I need?", a: "A previous ascent above 7,000 m, and a season of glacier travel with crampons and axe." },
          { q: "Is oxygen included?", a: "Yes, above the South Col. Confirm the number of bottles per climber in writing." },
          { q: "What if I turn back?", a: "The guide's decision on the mountain is final. Ask what is refunded before you pay." },
        ],
      },
      { id: "t-ebc", peakName: "Everest Base Camp", elevationM: 5364, name: "Everest Base Camp Trek", days: 14, country: "Nepal", priceFromEur: 2150, rating: 4.8, reviewCount: 210, badge: "best-value", photo: "/img/everest-1.jpg" },
      { id: "t-lho", peakName: "Lhotse", elevationM: 8516, name: "Everest & Lhotse Expedition", days: 68, country: "Nepal", priceFromEur: 68500, rating: 5.0, reviewCount: 32, badge: "premium", photo: "/img/everest-3.jpg" },
      { id: "t-ama", peakName: "Ama Dablam", elevationM: 6812, name: "Ama Dablam Expedition (6,812 m)", days: 35, country: "Nepal", priceFromEur: 18500, rating: 4.8, reviewCount: 64, photo: "/img/gran-paradiso.jpg" },
    ],
    reviews: [
      { id: "r1", author: "Alex Martin", stars: 5, agoLabel: "2 weeks ago", body: "Incredible experience on our Everest expedition. The guides were exceptional and the whole team made us feel safe and supported every step of the way." },
      { id: "r2", author: "Sophie Renard", stars: 5, agoLabel: "1 month ago", body: "Rotations were well paced and nobody was rushed. The Sherpa team knew the route intimately and the food at base camp was far better than expected." },
    ],
    gallery: ["/img/everest.jpg", "/img/everest-1.jpg", "/img/everest-3.jpg", "/img/denali.jpg", "/img/aconcagua.jpg"],
    faq: [
      { q: "What is included in the price?", a: "Permits, base camp accommodation, group equipment, oxygen and Sherpa support. International flights and personal kit are not." },
      { q: "What experience do I need?", a: "Previous experience above 7,000 m, and a season of glacier travel with crampons and axe." },
      { q: "What happens if I have to turn back?", a: "The guide's decision on the mountain is final. Ask before you pay what is refunded and what is not." },
    ],
  },
  "demo-altitude": {
    tagline: "Small groups, stated ratios",
    yearsExperience: 34,
    expeditionCount: 900,
    summiteerCount: 3100,
    about:
      "A long-established guiding company running small-group expeditions across the Himalaya, the Andes and Alaska, with a fixed guide-to-client ratio.",
    pillars: [
      { label: "Small groups", detail: "Fixed ratios" },
      { label: "Expert guides", detail: "IFMGA certified" },
      { label: "Established", detail: "Two decades" },
      { label: "Worldwide", detail: "Six continents" },
    ],
    highlights: [
      { label: "Small-group guiding", detail: "Ratios stated before you book" },
      { label: "Seven Summits programme", detail: "All seven run annually" },
      { label: "Acclimatisation built in", detail: "Staged rotations, no shortcuts" },
      { label: "Medical screening", detail: "Required before departure" },
    ],
    trips: [
      { id: "t-acon", peakName: "Aconcagua", elevationM: 6961, name: "Aconcagua (6,961 m)", days: 20, country: "Argentina", priceFromEur: 6400, rating: 4.8, reviewCount: 74, badge: "popular", photo: "/img/aconcagua.jpg" },
      { id: "t-den", peakName: "Denali", elevationM: 6190, name: "Denali West Buttress", days: 24, country: "United States", priceFromEur: 11500, rating: 4.9, reviewCount: 41, photo: "/img/denali.jpg" },
      { id: "t-mb", peakName: "Mont Blanc", elevationM: 4808, name: "Mont Blanc Ascent", days: 6, country: "France", priceFromEur: 2400, rating: 4.7, reviewCount: 132, badge: "best-value", photo: "/img/mont-blanc.jpg" },
    ],
    reviews: [
      { id: "r1", author: "Lucas Pereira", stars: 5, agoLabel: "3 weeks ago", body: "Ratios were exactly as advertised and the acclimatisation plan was sensible rather than rushed. Turned back one team on weather and I respected the call." },
    ],
    gallery: ["/img/aconcagua.jpg", "/img/denali.jpg", "/img/mont-blanc.jpg", "/img/eiger.jpg"],
    faq: [
      { q: "What is the guide ratio?", a: "Stated per trip before booking and held to on the mountain." },
      { q: "Do you screen clients?", a: "Yes — previous altitude and a medical are required for the 6,000 m and 8,000 m programmes." },
    ],
  },
  "demo-peak": {
    tagline: "Trekking peaks through to 8,000 m",
    yearsExperience: 9,
    expeditionCount: 210,
    summiteerCount: 640,
    about:
      "A younger operator focused on 8,000 m peaks with heavy oxygen logistics and a large Sherpa team.",
    pillars: [
      { label: "8,000 m focus", detail: "Fourteen peaks" },
      { label: "Strong logistics", detail: "Oxygen and fixed lines" },
      { label: "Large teams", detail: "Deep Sherpa support" },
      { label: "Fast rotations", detail: "Shorter expeditions" },
    ],
    highlights: [
      { label: "Oxygen logistics", detail: "Bottles cached high on the route" },
      { label: "Fixed-line teams", detail: "Own rope-fixing crews" },
      { label: "Shorter windows", detail: "Compressed schedules" },
    ],
    trips: [
      { id: "t-mana", peakName: "Manaslu", elevationM: 8163, name: "Manaslu (8,163 m)", days: 42, country: "Nepal", priceFromEur: 16800, rating: 4.7, reviewCount: 38, badge: "popular", photo: "/img/everest-3.jpg" },
      { id: "t-island", peakName: "Island Peak", elevationM: 6189, name: "Island Peak", days: 16, country: "Nepal", priceFromEur: 2900, rating: 4.6, reviewCount: 91, badge: "best-value", photo: "/img/everest-1.jpg" },
    ],
    reviews: [
      { id: "r1", author: "Mira Halvorsen", stars: 4, agoLabel: "2 months ago", body: "Logistics were the strongest part — oxygen was where they said it would be. Communication before the trip could have been better." },
    ],
    gallery: ["/img/everest-3.jpg", "/img/everest-1.jpg", "/img/toubkal.jpg"],
    faq: [{ q: "Is oxygen included?", a: "On the 8,000 m programmes, yes. Confirm the number of bottles per climber in writing." }],
  },
  "demo-north": {
    tagline: "Himalayan expedition operator",
    yearsExperience: 15,
    expeditionCount: 380,
    summiteerCount: 1020,
    about:
      "A Nepal-based operator running the Himalayan 8,000 m peaks and the trekking peaks around them.",
    pillars: [
      { label: "Nepal based", detail: "Local operation" },
      { label: "Fourteen peaks", detail: "All 8,000ers" },
      { label: "Trekking peaks", detail: "First-timers welcome" },
      { label: "Own staff", detail: "Directly employed" },
    ],
    highlights: [
      { label: "Locally operated", detail: "Kathmandu head office" },
      { label: "Directly employed staff", detail: "No subcontracting" },
      { label: "Trekking-peak ladder", detail: "A route into higher objectives" },
    ],
    trips: [
      { id: "t-mera", peakName: "Mera Peak", elevationM: 6476, name: "Mera Peak", days: 18, country: "Nepal", priceFromEur: 3200, rating: 4.6, reviewCount: 58, badge: "best-value", photo: "/img/toubkal.jpg" },
      { id: "t-lobu", peakName: "Lobuche East", elevationM: 6119, name: "Lobuche East", days: 15, country: "Nepal", priceFromEur: 2700, rating: 4.5, reviewCount: 44, photo: "/img/triglav.jpg" },
    ],
    reviews: [
      { id: "r1", author: "Nikolai Petrov", stars: 5, agoLabel: "5 weeks ago", body: "Good value and the staff were the same people from the office to the mountain, which mattered more than I expected." },
    ],
    gallery: ["/img/toubkal.jpg", "/img/triglav.jpg", "/img/mount-olympus.jpg"],
    faq: [{ q: "Do you take beginners?", a: "On the trekking peaks, yes. The 8,000 m programmes require previous high-altitude experience." }],
  },
  };

/**
 * Merged in rather than written into the literals above, so removing
 * DEMO_PROFILES removes every fabricated statistic, claim and review at once.
 */

/**
 * Fill in whatever a trip does not spell out for itself.
 *
 * Ten of the eleven trips carried a name, a price and nothing else, so every
 * tab on their page rendered empty. Rather than paste the same paragraph under
 * all of them, this DERIVES the missing parts from what the trip already
 * states — its length, its altitude and its country — so the content stays
 * internally consistent: a 14-day trek gets a trek's itinerary, an 8,000 m
 * ascent gets rotations and oxygen, and neither borrows the other's.
 *
 * Still invented, still gated behind `demo`. The point is that the layout can
 * be judged with something coherent in it, not that any of it is true.
 */
function withTripDetail(t: Trip): Trip {
  const alt = t.elevationM ?? 0;

  /*
   * Altitude alone is the wrong signal.
   *
   * Everest Base Camp sits at 5,364 m and is a walking trek — no rope, no
   * crampons — while Mont Blanc at 4,808 m is a glaciated alpine ascent. Sorting
   * purely on height called the first one technical and, before these trips
   * carried an elevation at all, called the second one "guided walking on a
   * waymarked route". Both are wrong in the direction that matters: a route
   * description is what somebody uses to decide whether they are qualified to
   * be on it.
   */
  const trek = /\btrek\b|base camp/i.test(t.name);
  const big = !trek && alt >= 8000;
  const high = !trek && alt >= 6000;
  const technical = !trek && alt >= 4000;

  const phase = (from: number, to: number) => (from === to ? `Day ${from}` : `Day ${from}–${to}`);
  const d = t.days;

  // Proportional to the trip's real length, so the last day is always day `d`.
  const itinerary =
    t.itinerary ??
    (big
      ? [
          { days: phase(1, 2), label: `Arrival and briefing` },
          { days: phase(3, Math.round(d * 0.18)), label: "Trek to base camp" },
          { days: phase(Math.round(d * 0.18) + 1, Math.round(d * 0.55)), label: "Acclimatisation rotations" },
          { days: phase(Math.round(d * 0.55) + 1, Math.round(d * 0.8)), label: "Summit push" },
          { days: phase(Math.round(d * 0.8) + 1, d), label: "Descent and return" },
        ]
      : high
        ? [
            { days: phase(1, 2), label: "Arrival and kit check" },
            { days: phase(3, Math.round(d * 0.35)), label: "Approach and base camp" },
            { days: phase(Math.round(d * 0.35) + 1, Math.round(d * 0.7)), label: "Acclimatisation" },
            { days: phase(Math.round(d * 0.7) + 1, Math.round(d * 0.88)), label: "Summit attempt" },
            { days: phase(Math.round(d * 0.88) + 1, d), label: "Descent and return" },
          ]
        : [
            { days: phase(1, 1), label: "Arrival and briefing" },
            { days: phase(2, Math.round(d * 0.45)), label: "Approach on foot" },
            { days: phase(Math.round(d * 0.45) + 1, Math.round(d * 0.75)), label: "High camps" },
            { days: phase(Math.round(d * 0.75) + 1, Math.round(d * 0.9)), label: "Summit day" },
            { days: phase(Math.round(d * 0.9) + 1, d), label: "Return" },
          ]);

  const inclusions =
    t.inclusions ??
    [
      { label: "Permits & fees", detail: `${t.country} climbing permits and park fees` },
      { label: "Guides", detail: technical ? "Licensed guides and high-altitude staff" : "Licensed mountain guides" },
      { label: "Accommodation", detail: high ? "Lodges on the approach, tents on the mountain" : "Huts and mountain accommodation" },
      { label: "Meals", detail: "All meals from the start of the trek" },
      ...(big || high
        ? [{ label: "Oxygen & gear", detail: big ? "Supplementary oxygen and group technical gear" : "Group technical gear and fixed lines" }]
        : [{ label: "Group gear", detail: "Ropes, hardware and shared equipment" }]),
      { label: "Safety & support", detail: "Communications and evacuation coordination" },
    ];

  const excluded =
    t.excluded ??
    [
      "International flights and visas",
      "Personal clothing, boots and technical kit",
      "Travel and evacuation insurance — required, and your responsibility",
      "Summit bonuses and staff tips",
      ...(big ? ["Extra oxygen bottles beyond the stated allocation"] : []),
    ];

  const highlights =
    t.highlights ??
    [
      t.peakName !== undefined
        ? `${trek ? "Reach" : "Summit"} ${t.peakName}${alt > 0 ? ` at ${alt.toLocaleString("en-GB")} m` : ""}`
        : t.name,
      technical ? "Roped glacier travel with a guided team" : "Walking days on a waymarked route",
      high || technical
        ? "Acclimatisation planned around safety, not the schedule"
        : "Paced for a mixed-ability group",
      `${d} days in ${t.country}`,
    ];

  const about =
    t.about ??
    `A ${d}-day guided ${big ? "8,000 m expedition" : high ? "high-altitude expedition" : technical ? "alpine ascent" : "trek"} in ${t.country}${
      t.peakName !== undefined ? `, on ${t.peakName}` : ""
    }. ${
      big
        ? "Staged rotations, supplementary oxygen high on the route and a support team that works it every season."
        : high
          ? "Built around a proper acclimatisation profile, with the summit attempt placed where the weather window usually sits."
          : technical
            ? "Glacier travel, a hut approach and an alpine start on summit day."
            : "Walking days with a guide, with baggage moved between overnight stops."
    }`;

  const departures =
    t.departures ??
    [
      { id: `${t.id}-d1`, date: "12 March 2027", days: d, spotsLeft: 5, priceFromEur: t.priceFromEur, badge: "Popular" },
      { id: `${t.id}-d2`, date: "25 April 2027", days: d, spotsLeft: 3, priceFromEur: t.priceFromEur },
      { id: `${t.id}-d3`, date: "10 September 2027", days: d, spotsLeft: 6, priceFromEur: t.priceFromEur },
    ];

  const faq =
    t.faq ??
    [
      {
        q: "What experience do I need?",
        a: big
          ? "A previous ascent above 7,000 m, and a season of glacier travel with crampons and axe."
          : high
            ? "Previous experience above 4,000 m and confident use of crampons and axe."
            : technical
              ? "Comfortable on steep snow in crampons, and happy moving roped on a glacier."
              : "Good hill fitness and several consecutive days on your feet.",
      },
      {
        q: "What is not included?",
        a: "Flights, personal kit, insurance and tips. The full list is under Inclusions — get it back from the operator in writing.",
      },
      {
        q: "What happens if I turn back?",
        a: "The guide's decision on the mountain is final. Ask what is refunded before you pay.",
      },
    ];

  return {
    ...t,
    about,
    highlights,
    inclusions,
    excluded,
    itinerary,
    departures,
    faq,
    difficultyLabel: t.difficultyLabel ?? (big ? "Extreme" : high ? "Challenging" : technical ? "Demanding" : "Moderate"),
    guideRatio: t.guideRatio ?? (big ? "1:1 on the summit push" : high ? "1:2" : "1:6"),
    bestSeason: t.bestSeason ?? (t.country === "Nepal" ? "Mar – May / Sep – Nov" : "Jun – Sep"),
    region: t.region ?? t.country,
  };
}

for (const operator of DEMO_OPERATORS) {
  Object.assign(operator, DEMO_PROFILES[operator.id] ?? {});
  // Every trip gets a full page, not just the one that was written by hand.
  if (operator.trips !== undefined) operator.trips = operator.trips.map(withTripDetail);
}

/**
 * Two notices, because there are two kinds of entry and they need opposite
 * warnings. This was one string that said both — "these are real companies"
 * followed by "none of these businesses exist" — which is a contradiction a
 * reader has to resolve on a page about who to trust at altitude.
 */
export const DEMO_NOTICE =
  "Local design mockup. These companies do not exist — the names were invented for this build, and so were the ratings, reviews, statistics, claims and prices shown against them. Nothing here can be contacted and none of it ships: a production build shows the sample listings instead.";

export const SAMPLE_NOTICE =
  "A sample listing, not a company. ICEFALL has no operator partnerships, and nothing written here reaches anybody. Find a real IFMGA-certified operator before booking.";

export function allOperators(): Operator[] {
  return SHOW_DEMO_OPERATORS ? [...DEMO_OPERATORS, ...OPERATORS] : [...OPERATORS];
}

/** Listings plausible for this peak — region first, then the global fallback. */
/**
 * Above this, an objective is expedition ground; below it, it is a guided day.
 *
 * Owner's ruling, and the data already agreed: `operatorsFor` keeps a listing
 * only when `elevationM >= o.minElevationM`, and the lowest floor any company
 * in the directory sets is 4,000 m. So a sub-3,000 m summit — Mount Olympus at
 * 2,918 m is the one that prompted this — can never match an expedition
 * company. Offering the heading anyway promised something the query could only
 * ever answer "none", which reads as a gap in the market rather than the
 * category error it is. What such a mountain wants is a guide.
 *
 * IT LIVES HERE, beside the matching rule it describes, because two screens
 * ask the question — the mountain page and the expeditions directory — and a
 * threshold copied into both drifts the moment one of them is edited.
 */
export const EXPEDITION_TERRAIN_M = 3000;

export const isExpeditionGround = (elevationM: number): boolean =>
  elevationM >= EXPEDITION_TERRAIN_M;

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
