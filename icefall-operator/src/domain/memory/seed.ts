/**
 * Seed data — rebuilt 2026-08-29 to the owner's light-portal mockup.
 *
 * EVERY COMPANY NAME HERE IS INVENTED, and deliberately so. Owner decision #2:
 * the ICEFALL family previously carried four real, identifiable expedition
 * businesses decorated with ratings, prices and summit rates they never
 * supplied — which is publication of invented commercial claims about a real
 * company. None of that happens in this app, in demo data or anywhere else.
 *
 * The MOUNTAINS are real, because a mountain is geography and cannot be
 * defamed. Their ids MUST match the image names `icefall-web` serves:
 * `everest`, `ama-dablam`, `kilimanjaro`, `mont-blanc` — and the trek slugs
 * match `/img/treks/*.jpg` for the same reason.
 *
 * TWO COMPANIES EXIST IN THIS SEED, and the second one matters more than it
 * looks: `coldharbour` is here so that "an operator cannot see another
 * company's data" is a test with something real on the other side of it, rather
 * than an assertion against an empty set.
 *
 * THE ARITHMETIC IS LOAD-BEARING. August holds EXACTLY 28 enquiries
 * (website ×12, icefall-app ×8, marketplace ×6, other ×2), 15 of which reached
 * qualified or beyond; July holds 18 and 12. The dashboard's +56% and +25%
 * deltas are COMPUTED from these rows, never typed anywhere — where the
 * mockup's aggregate tiles disagree with its own detail rows, the rows win and
 * the derived figures stay honest.
 *
 * WHAT IS DELIBERATELY MISSING: there are no `listing_view` events. Nothing in
 * the ICEFALL family emits one yet, so seeding them would put a fabricated
 * audience figure in front of a company deciding whether to buy placement. The
 * analytics screen says views are not counted, which is the truth.
 */

import type {
  AnalyticsEvent,
  Booking,
  Company,
  CompanyMountain,
  CompanyTrek,
  Placement,
  CompanyUser,
  Conversation,
  ConversationNote,
  ContentVersion,
  Lead,
  LeadNote,
  Message,
  MediaAsset,
  Mountain,
  OperatorNotification,
  Product,
  ProductDeparture,
  Trek,
} from "../types";

export const LANTERN = "co-lantern";
export const COLDHARBOUR = "co-coldharbour";

/** Lantern Ridge's own mark. Coldharbour has none — see the note on it. */
export const LANTERN_LOGO = "md-lantern-logo";

/* -------------------------------------------------------------------------- */
/* Mountains — real geography, keyed by the consumer app's image names        */
/* -------------------------------------------------------------------------- */

export const MOUNTAINS: Mountain[] = [
  { id: "everest", name: "Mount Everest", elevationM: 8849, range: "Mahalangur Himal", country: "Nepal / China", region: "Himalaya & Asia" },
  { id: "ama-dablam", name: "Ama Dablam", elevationM: 6812, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia" },
  { id: "kilimanjaro", name: "Kilimanjaro", elevationM: 5895, range: "Eastern Rift", country: "Tanzania", region: "Africa" },
  { id: "mont-blanc", name: "Mont Blanc", elevationM: 4805, range: "Mont Blanc Massif", country: "France", region: "Alps & Europe" },
  // Coldharbour's mountain. In the catalogue so isolation has a real other side.
  { id: "denali", name: "Denali", elevationM: 6190, range: "Alaska Range", country: "United States", region: "Americas" },
];

/* -------------------------------------------------------------------------- */
/* Companies                                                                   */
/* -------------------------------------------------------------------------- */

export const COMPANIES: Company[] = [
  {
    id: LANTERN,
    name: "Lantern Ridge Expeditions",
    slug: "lantern-ridge-expeditions",
    status: "active",
    // Lantern Ridge has given Icefall a mark. See MEDIA_ASSETS below for what
    // that record does and does not contain.
    logoMediaId: LANTERN_LOGO,
    tagline: "Khumbu specialists, twenty-one seasons",
    description:
      "A high-altitude operator working the Khumbu, Kilimanjaro and the Alps, with guides and support staff who return to the same mountains season after season.",
    about:
      "Lantern Ridge was started by two climbing sirdars who had spent a decade working other people's expeditions and wanted to run them differently: smaller teams, longer acclimatisation, and a turn-around call that belongs to the guide on the ground rather than to an office.",
    city: "Kathmandu",
    country: "Nepal",
    certifications: [
      { mark: "NMA", note: "Member", full: "Nepal Mountaineering Association" },
      { mark: "TAAN", note: "Member", full: "Trekking Agencies' Association of Nepal" },
    ],
    team: [
      { name: "Pemba Rinji", role: "Expedition leader" },
      { name: "Astrid Lindqvist", role: "Western guide, 8,000 m" },
      { name: "Dawa Yangzum", role: "Base camp manager" },
    ],
    faq: [
      { q: "What experience do I need for the South Col route?", a: "Previous experience above 7,000 m, and a season of glacier travel with crampons and axe." },
      { q: "What happens if I turn back?", a: "The guide's decision on the mountain is final. Ask us before you pay what is refunded and what is not." },
    ],
    whyChooseUs: [
      { label: "Twenty-one Khumbu seasons", detail: "The same guides and Sherpa team return to these mountains each year." },
      { label: "Small teams", detail: "Six climbers to a rope team on the summit push, and never more." },
      { label: "Longer acclimatisation", detail: "Two full rotations before any summit attempt." },
      { label: "The guide calls the turn", detail: "Turn-around decisions belong to the guide on the ground, not to an office." },
    ],
    foundedYear: 2005,
    languages: ["English", "Nepali", "Sherpa"],
    bannerMediaId: null,
    /**
     * NULL, and it stays null.
     *
     * No document check has been recorded for this company, so the profile shows
     * nothing rather than a date. The consumer web app currently hardcodes
     * `verifiedOn: "2 Mar 2026"` on its demo operators — a fabricated check that
     * this portal will not reproduce.
     */
    documentsCheckedAt: null,
    createdAt: "2026-03-02T10:00:00.000Z",
    updatedAt: "2026-08-27T08:40:00.000Z",
  },
  {
    // Exists only so cross-company isolation has a real other side.
    id: COLDHARBOUR,
    name: "Coldharbour Alpine",
    slug: "coldharbour-alpine",
    status: "active",
    /**
     * NULL, DELIBERATELY, AND IT STAYS NULL.
     *
     * Coldharbour has supplied no mark, so every surface that draws a logo has
     * to fall through to its initials right here on screen — not only in a
     * test. That fallback is the COMMON case: most companies have not given
     * Icefall artwork, and a real business's logo is its trademark and does not
     * ship here at all. Filling this in "so the demo looks finished" would
     * fabricate an identity and hide the path that matters most.
     */
    logoMediaId: null,
    tagline: "Alaska and the Alps",
    description: "A small guiding company running Denali and the Western Alps.",
    about: null,
    city: "Anchorage",
    country: "United States",
    certifications: [],
    team: [],
    faq: [],
    whyChooseUs: [],
    foundedYear: 2019,
    languages: ["English"],
    bannerMediaId: null,
    documentsCheckedAt: "2026-05-14T00:00:00.000Z",
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  },
];

/* -------------------------------------------------------------------------- */
/* Media assets                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Media assets are RECORDS, not files — the same thing `bannerMediaId` has
 * always been in this seed.
 *
 * WHAT WAS NOT DONE HERE, AND WHY. No image was invented and dropped into
 * `public/`. Icefall's media store is not connected, so there is nothing to
 * serve bytes from, and painting a mark into the repo so the demo "looks
 * finished" would be fabricating a company's identity — which is the one thing
 * the logo rules exist to prevent. What this row is, is the row: an approved
 * `media_assets` record with a real storage path in the shape
 * `storagePathFor()` builds (company id FIRST, because the storage policy
 * matches on it), a real mime type, a real size and real square dimensions that
 * pass `MEDIA_RULES.logo`.
 *
 * WHAT IT MAKES VISIBLE. Lantern Ridge now satisfies the profile's
 * "Media & photos" row and its hero inspector shows a logo on record with a
 * working Remove. Coldharbour Alpine has none, so the initials fallback is
 * exercised on screen beside it. Any surface asked to draw Lantern's mark still
 * has no bytes and still falls back to initials — correctly, and without
 * pretending otherwise.
 */
export const MEDIA_ASSETS: MediaAsset[] = [
  {
    id: LANTERN_LOGO,
    companyId: LANTERN,
    // Null: the mark belongs to the company, not to one trip.
    productId: null,
    kind: "logo",
    storagePath: `${LANTERN}/${LANTERN}/lantern-ridge-mark.png`,
    /*
     * A REAL FILE, and deliberately a PNG rather than an SVG.
     *
     * `MEDIA_RULES.logo` refuses SVG from an operator, so seeding one would put
     * a record in the app that the app's own upload form would reject — the
     * demo would be modelling something an operator cannot actually do. The
     * mark ships at public/img/companies/ and is 512x512, which is what an
     * ordinary operator export looks like.
     *
     * The mark itself is authored for an INVENTED company. Lantern Ridge's
     * name, team and certifications are all authored here, so a mark is no more
     * a fabrication than the name. Coldharbour Alpine is left without one on
     * purpose, so the initials fallback is visible on screen beside it, and no
     * mark is ever drawn for a REAL business.
     */
    mimeType: "image/png",
    byteSize: 2_868,
    // Square, and above the 256 floor `MEDIA_RULES.logo` sets.
    widthPx: 512,
    heightPx: 512,
    altText: "Lantern Ridge Expeditions",
    /**
     * A company's own mark, supplied by the company. The licence says exactly
     * that and the credit is the company itself — neither is invented, and
     * `media_approved_is_attributed` refuses an approval without both.
     */
    licence: "Supplied by the company for use on Icefall",
    credit: "Lantern Ridge Expeditions",
    state: "approved",
    decisionReason: null,
    reviewedBy: "u-icefall-review",
    reviewedAt: "2026-03-04T09:20:00.000Z",
    createdAt: "2026-03-03T16:05:00.000Z",
  },
];

/* -------------------------------------------------------------------------- */
/* Staff                                                                       */
/* -------------------------------------------------------------------------- */

export const COMPANY_USERS: CompanyUser[] = [
  {
    // The signed-in demo user.
    id: "cu-ravi",
    companyId: LANTERN,
    profileId: "u-ravi",
    displayName: "Ravi Thapa",
    email: "ravi@lanternridge.example",
    role: "admin",
    status: "active",
    invitedBy: null,
    createdAt: "2026-03-02T10:00:00.000Z",
  },
  {
    id: "cu-marta",
    companyId: LANTERN,
    profileId: "u-marta",
    displayName: "Marta Kowalczyk",
    email: "marta@lanternridge.example",
    role: "sales",
    status: "active",
    invitedBy: "cu-ravi",
    createdAt: "2026-04-11T09:00:00.000Z",
  },
  {
    // Left the company. Retained, not deleted — their leads and notes survive.
    id: "cu-tenzin",
    companyId: LANTERN,
    profileId: "u-tenzin",
    displayName: "Tenzin Norbu",
    email: "tenzin@lanternridge.example",
    role: "sales",
    status: "disabled",
    invitedBy: "cu-ravi",
    createdAt: "2026-04-11T09:00:00.000Z",
  },
  {
    id: "cu-jo",
    companyId: COLDHARBOUR,
    profileId: "u-jo",
    displayName: "Jo Vance",
    email: "jo@coldharbour.example",
    role: "admin",
    status: "active",
    invitedBy: null,
    createdAt: "2026-05-14T10:00:00.000Z",
  },
];

/* -------------------------------------------------------------------------- */
/* Commercial assignments — the authorization boundary                         */
/* -------------------------------------------------------------------------- */

/**
 * WHO MAY EDIT WHAT. Authorization only — no position, no price, no term.
 * Lantern holds all four of its mountains actively; a mountain with no row here
 * (Denali, K2, anything) is simply not Lantern's to manage.
 */
export const COMPANY_MOUNTAINS: CompanyMountain[] = [
  { id: "cm-lantern-everest", companyId: LANTERN, mountainId: "everest", status: "active", assignedAt: "2026-03-05T11:00:00.000Z" },
  { id: "cm-lantern-ama-dablam", companyId: LANTERN, mountainId: "ama-dablam", status: "active", assignedAt: "2026-06-01T11:00:00.000Z" },
  { id: "cm-lantern-kilimanjaro", companyId: LANTERN, mountainId: "kilimanjaro", status: "active", assignedAt: "2026-07-14T11:00:00.000Z" },
  { id: "cm-lantern-mont-blanc", companyId: LANTERN, mountainId: "mont-blanc", status: "active", assignedAt: "2026-08-03T11:00:00.000Z" },
  { id: "cm-coldharbour-denali", companyId: COLDHARBOUR, mountainId: "denali", status: "active", assignedAt: "2026-04-20T11:00:00.000Z" },
];

/* -------------------------------------------------------------------------- */
/* Treks — a slice of the real catalogue, copied field for field               */
/* -------------------------------------------------------------------------- */

/**
 * NINETEEN REAL ROUTES, taken verbatim from `icefall-web/src/data/trekRecords.ts`
 * — which is generated from sourced files and validated there. Names, regions,
 * countries, seasons, durations, difficulties and the per-route high points are
 * the web catalogue's own values, unchanged. Nothing here was composed.
 *
 * It is a SLICE, not the catalogue. The real thing is 252 routes across 22
 * regions and belongs in a `treks` table migrated from that file, which is the
 * ask in `icefall-sessions/requests/09-company-treks-migration.md`. Two
 * hand-maintained trek lists would drift within a week; this one exists only so
 * the request flow can be built and exercised before the table lands.
 *
 * THE HIGH POINTS ARE THE ROUTES' OWN. Everest Base Camp reads 5,545 m — Kala
 * Patthar, which most itineraries include — where Everest itself is 8,849 m.
 * The Tour du Mont Blanc reads 2,665 m against Mont Blanc's 4,805 m. Not one
 * figure in this array is a mountain's summit, and the Tour of the Bernina
 * class of route, where no per-route figure is published, would read null.
 */
export const TREKS: Trek[] = [
  {
    id: "everest-base-camp-trek",
    name: "Everest Base Camp Trek",
    regionId: "khumbu",
    region: "Everest & the Khumbu",
    country: "Nepal",
    mountainIds: ["everest"],
    durationDays: [12, 14],
    difficulty: "Strenuous",
    season: "March – May, October – November",
    style: "Base camp",
    summary:
      "The standard walk in from Lukla through Namche Bazaar and Tengboche to the tents below the Khumbu Icefall, with most itineraries adding the dawn climb of Kala Patthar. The difficulty is altitude and consecutive walking days rather than terrain.",
    maxAltitudeM: 5545,
  },
  {
    id: "everest-three-passes-trek",
    name: "Everest Three Passes Trek",
    regionId: "khumbu",
    region: "Everest & the Khumbu",
    country: "Nepal",
    mountainIds: ["everest"],
    durationDays: [18, 21],
    difficulty: "Very strenuous",
    season: "March – May, October – November",
    style: "High pass",
    summary:
      "A circuit of the upper Khumbu linking the Kongma La, the Cho La and the Renjo La, usually taking in Everest Base Camp and the Gokyo lakes on the way round. Several days involve long crossings above 5,300 m and the Cho La has a short glacier section.",
    maxAltitudeM: 5545,
  },
  {
    id: "gokyo-lakes-trek",
    name: "Gokyo Lakes Trek",
    regionId: "khumbu",
    region: "Everest & the Khumbu",
    country: "Nepal",
    mountainIds: [],
    durationDays: [12, 14],
    difficulty: "Strenuous",
    season: "March – May, October – November",
    style: "Valley",
    summary:
      "An out-and-back up the Dudh Koshi's western branch from Namche through Dole and Machhermo to the string of glacial lakes at Gokyo, with the ascent of Gokyo Ri as the high point. Quieter than the base camp trail and shorter.",
    maxAltitudeM: 5357,
  },
  {
    id: "ama-dablam-base-camp-trek",
    name: "Ama Dablam Base Camp Trek",
    regionId: "khumbu",
    region: "Everest & the Khumbu",
    country: "Nepal",
    mountainIds: ["ama-dablam"],
    durationDays: [8, 11],
    difficulty: "Moderate",
    season: "March – May, September – November",
    style: "Base camp",
    summary:
      "The Everest trail as far as Pangboche, then a side branch up the meadows to Ama Dablam's base camp. Shorter and lower than the base camp treks further up the valley, and off the main trail for its final two days.",
    maxAltitudeM: 4570,
  },
  {
    id: "langtang-valley-trek",
    name: "Langtang Valley Trek",
    regionId: "langtang",
    region: "Langtang",
    country: "Nepal",
    mountainIds: [],
    durationDays: [7, 9],
    difficulty: "Moderate",
    season: "March – May, September – November",
    style: "Valley",
    summary:
      "A there-and-back walk up the Langtang valley from Syabrubesi through Lama Hotel and the rebuilt Langtang village to Kyanjin Gompa, with an acclimatisation day for the Kyanjin Ri viewpoint.",
    maxAltitudeM: 4773,
  },
  {
    id: "annapurna-circuit-trek",
    name: "Annapurna Circuit Trek",
    regionId: "annapurna",
    region: "Annapurna",
    country: "Nepal",
    mountainIds: [],
    durationDays: [12, 20],
    difficulty: "Strenuous",
    season: "March – May, October – November",
    style: "Circuit",
    summary:
      "A circuit of the Annapurna massif, up the Marsyangdi valley to Manang, over the Thorong La and down the Kali Gandaki past Muktinath and Jomsom. Roads now run far up both sides, so the route is several days shorter than it once was.",
    maxAltitudeM: 5416,
  },
  {
    id: "snowman-trek",
    name: "Snowman Trek",
    regionId: "bhutan",
    region: "Bhutan",
    country: "Bhutan",
    mountainIds: [],
    durationDays: [25, 30],
    difficulty: "Very strenuous",
    season: "Mid-June – mid-October",
    style: "Long distance",
    summary:
      "A traverse of northern Bhutan from the Laya region through Lunana to Sephu or Bumthang, about 347 km over eleven passes, several of them above 5,000 m. Remote and weather-dependent; parties regularly turn back when snow closes a pass.",
    maxAltitudeM: 5320,
  },
  {
    id: "kilimanjaro-machame-route",
    name: "Kilimanjaro Machame Route",
    regionId: "east-africa",
    region: "East Africa",
    country: "Tanzania",
    mountainIds: ["kilimanjaro"],
    durationDays: [6, 7],
    difficulty: "Strenuous",
    season: "January – March, June – October",
    style: "Traverse",
    summary:
      "The busiest of the southern approaches, climbing from Machame Gate past the Shira plateau and the Lava Tower, then along the southern circuit to Barafu. Descent is by the Mweka trail, so the walk crosses the mountain rather than returning the way it came.",
    maxAltitudeM: 5895,
  },
  {
    id: "kilimanjaro-lemosho-route",
    name: "Kilimanjaro Lemosho Route",
    regionId: "east-africa",
    region: "East Africa",
    country: "Tanzania",
    mountainIds: ["kilimanjaro"],
    durationDays: [7, 8],
    difficulty: "Strenuous",
    season: "January – March, June – October",
    style: "Traverse",
    summary:
      "A western approach that begins in forest at Londorossi and crosses the Shira plateau before joining the southern circuit to Barafu. The extra days low down give more time to acclimatise than the shorter southern routes.",
    maxAltitudeM: 5895,
  },
  {
    id: "mount-meru-trek",
    name: "Mount Meru Trek",
    regionId: "east-africa",
    region: "East Africa",
    country: "Tanzania",
    mountainIds: [],
    durationDays: [3, 4],
    difficulty: "Strenuous",
    season: "January – February, June – October",
    style: "Traverse",
    summary:
      "The Momella route through Arusha National Park to Socialist Peak, walked with an armed ranger because the lower forest holds buffalo and elephant. Often used as acclimatisation before Kilimanjaro.",
    maxAltitudeM: 4562,
  },
  {
    id: "tour-du-mont-blanc",
    name: "Tour du Mont Blanc",
    regionId: "alps",
    region: "The Alps",
    country: "France / Italy / Switzerland",
    mountainIds: ["mont-blanc"],
    durationDays: [10, 11],
    difficulty: "Strenuous",
    season: "Mid-June – mid-September",
    style: "Circuit",
    summary:
      "A circuit of about 165 km around the Mont Blanc massif through France, Italy and Switzerland, usually walked anti-clockwise from Les Houches and staying in refuges and valley villages. The high point is the Col des Fours.",
    maxAltitudeM: 2665,
  },
  {
    id: "walkers-haute-route",
    name: "Walker's Haute Route",
    regionId: "alps",
    region: "The Alps",
    country: "France / Switzerland",
    mountainIds: ["mont-blanc"],
    durationDays: [13, 14],
    difficulty: "Very strenuous",
    season: "July – mid-September",
    style: "Traverse",
    summary:
      "The walking route from Chamonix to Zermatt, roughly 220 km over eleven or more cols, with the Col de Prafleuri as its highest point. It needs no rope or crampons, but the terrain is rocky, remote and sustained.",
    maxAltitudeM: 2987,
  },
  {
    id: "inca-trail-to-machu-picchu",
    name: "Inca Trail to Machu Picchu",
    regionId: "cusco",
    region: "Cusco & Machu Picchu",
    country: "Peru",
    mountainIds: [],
    durationDays: [4, 4],
    difficulty: "Strenuous",
    season: "April – October (trail closed all February)",
    style: "High pass",
    summary:
      "The permitted route from Km 82 up the Cusichaca valley and over three passes, entering Machu Picchu through the Sun Gate on the final morning. Roughly 43 km; permits are capped daily and sell out months ahead.",
    maxAltitudeM: 4215,
  },
  {
    id: "torres-del-paine-w-trek",
    name: "Torres del Paine W Trek",
    regionId: "patagonia",
    region: "Patagonia",
    country: "Chile",
    mountainIds: [],
    durationDays: [4, 5],
    difficulty: "Moderate",
    season: "October – April",
    style: "Traverse",
    summary:
      "A four- or five-day walk along the south side of the Paine massif, taking in the Torres base viewpoint, the French Valley and Grey Glacier. Nights are in refugios or serviced campsites, all of which must be booked before entry.",
    maxAltitudeM: 870,
  },
  {
    id: "laugavegur-trail",
    name: "Laugavegur Trail",
    regionId: "iceland",
    region: "Iceland",
    country: "Iceland",
    mountainIds: [],
    durationDays: [3, 4],
    difficulty: "Moderate",
    season: "Late June – mid-September",
    style: "Traverse",
    summary:
      "A 55 km hut-to-hut route across the southern highlands from the hot springs at Landmannalaugar to the birch woods of Thorsmork, by way of the rhyolite hills at Hrafntinnusker and the black sands of Emstrur. Several rivers are unbridged.",
    maxAltitudeM: 1050,
  },
  {
    id: "west-highland-way",
    name: "West Highland Way",
    regionId: "uk-ireland",
    region: "Britain & Ireland",
    country: "United Kingdom",
    mountainIds: [],
    durationDays: [7, 8],
    difficulty: "Moderate",
    season: "April – October",
    style: "Long distance",
    summary:
      "Scotland's first long-distance route, 154 km from Milngavie on the edge of Glasgow to Fort William, along Loch Lomond and across Rannoch Moor. The highest point is the Devil's Staircase above Kinlochleven.",
    maxAltitudeM: 550,
  },
  {
    id: "camino-franc-s",
    name: "Camino Francés",
    regionId: "iberia",
    region: "Iberia & the Pyrenees",
    country: "France / Spain",
    mountainIds: [],
    durationDays: [30, 35],
    difficulty: "Moderate",
    season: "April – October",
    style: "Pilgrimage",
    summary:
      "The best-known road to Santiago, about 780 km from Saint-Jean-Pied-de-Port over the Pyrenees and across northern Spain through Pamplona, Burgos and Leon. Walking rather than mountaineering, but walking every day for a month.",
    maxAltitudeM: 1505,
  },
  {
    id: "chilkoot-trail",
    name: "Chilkoot Trail",
    regionId: "north-america",
    region: "North America",
    country: "United States",
    mountainIds: [],
    durationDays: [3, 5],
    difficulty: "Strenuous",
    season: "July – early September",
    style: "High pass",
    summary:
      "53 km from Dyea in Alaska over the Chilkoot Pass into British Columbia, the route stampeders carried a tonne of goods over in the winter of 1897. The Scales and the pass itself are a boulder scramble, and the artefacts along the way are protected.",
    maxAltitudeM: 1067,
  },
  {
    id: "wonderland-trail",
    name: "Wonderland Trail",
    regionId: "north-america",
    region: "North America",
    country: "United States",
    mountainIds: [],
    durationDays: [10, 14],
    difficulty: "Strenuous",
    season: "Late July – September",
    style: "Circuit",
    summary:
      "A 150 km circuit right round Mount Rainier, repeatedly dropping into forested valleys and climbing back to the alpine, which is where most of its considerable ascent comes from. Snow lies on Panhandle Gap into early July in many years.",
    maxAltitudeM: 2060,
  },
];

/**
 * WHO MAY LIST TRIPS ON WHICH ROUTE. Authorization only — no spots, no
 * itinerary, no price, no position. Exactly `COMPANY_MOUNTAINS` above, for the
 * other noun.
 *
 * Lantern Ridge holds three routes actively and one that has been SUSPENDED, so
 * the screen has a real example of a grant that exists and does not permit
 * editing — the distinction `canManageTrek` turns on. Coldharbour holds a
 * different route entirely, in a region Lantern does not work, so cross-company
 * isolation is visible on screen rather than only in a test.
 *
 * A route with no row here — the Snowman Trek, the Camino, anything — is simply
 * not this company's to manage, and appears in the request list instead.
 */
export const COMPANY_TREKS: CompanyTrek[] = [
  { id: "ct-lantern-ebc", companyId: LANTERN, trekId: "everest-base-camp-trek", status: "active", assignedAt: "2026-03-05T11:00:00.000Z" },
  { id: "ct-lantern-gokyo", companyId: LANTERN, trekId: "gokyo-lakes-trek", status: "active", assignedAt: "2026-06-18T11:00:00.000Z" },
  { id: "ct-lantern-machame", companyId: LANTERN, trekId: "kilimanjaro-machame-route", status: "active", assignedAt: "2026-07-14T11:00:00.000Z" },
  { id: "ct-lantern-three-passes", companyId: LANTERN, trekId: "everest-three-passes-trek", status: "suspended", assignedAt: "2026-04-02T11:00:00.000Z" },
  { id: "ct-coldharbour-chilkoot", companyId: COLDHARBOUR, trekId: "chilkoot-trail", status: "active", assignedAt: "2026-04-20T11:00:00.000Z" },
];

/**
 * THE PAID SLOTS. Read-only to everyone in this app.
 *
 * Lantern's Everest placement — Featured #2 — runs out on 30 Sep 2026. Note
 * what does NOT happen at that point: nothing. The row is untouched, the
 * position is still #2, and the mountain is not reordered. `effectiveStatus`
 * simply starts reading `expired` and a reminder is raised for a human. Spec §2.
 */
export const PLACEMENTS: Placement[] = [
  { id: "pl-lantern-everest", companyId: LANTERN, mountainId: "everest", slotPosition: 2, startsOn: "2026-08-01", endsOn: "2026-09-30", status: "active", priceCents: null, currency: "EUR" },
  { id: "pl-coldharbour-denali", companyId: COLDHARBOUR, mountainId: "denali", slotPosition: 1, startsOn: "2026-05-01", endsOn: "2027-04-30", status: "active", priceCents: null, currency: "EUR" },
];

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

export const PRODUCTS: Product[] = [
  {
    id: "p-everest-south-col",
    companyId: LANTERN,
    kind: "expedition",
    name: "Everest — South Col",
    slug: "everest-south-col",
    status: "live",
    description:
      "A full-season South Col expedition with a long acclimatisation programme and a 1:1 ratio above the South Col.",
    durationDays: 62,
    difficulty: "Extreme — previous 8,000 m experience expected",
    maxAltitudeM: 8849,
    priceFromCents: 5_800_000,
    priceToCents: 6_400_000,
    currency: "EUR",
    seasonality: "April – May",
    itinerary: [
      { day: 1, title: "Kathmandu", detail: "Arrival, kit check, permit briefing." },
      { day: 3, title: "Lukla to Phakding", detail: "Fly in and walk down the valley." },
      { day: 12, title: "Base Camp", detail: "Arrive and settle. Rest days before the first rotation." },
    ],
    equipment: ["8,000 m down suit", "Double boots", "Harness and jumar", "Personal oxygen mask"],
    inclusions: ["Permits", "Base camp accommodation", "Group equipment", "Oxygen", "Sherpa support"],
    exclusions: ["International flights", "Personal climbing kit", "Summit bonus", "Travel insurance"],
    faq: [],
    mountainIds: ["everest"],
    archivedAt: null,
    createdAt: "2026-03-05T10:00:00.000Z",
    updatedAt: "2026-08-12T10:00:00.000Z",
  },
  {
    // The mockup lists this inside the Expeditions screen, so it is modelled as
    // kind `expedition` — the 12-day trek by the same name lives below with the
    // slug the consumer app's trek imagery is keyed by.
    id: "p-everest-base-camp",
    companyId: LANTERN,
    kind: "expedition",
    name: "Everest Base Camp Trek",
    slug: "everest-base-camp",
    status: "live",
    description: "The classic walk to base camp with two acclimatisation days at Namche and Dingboche.",
    durationDays: 12,
    difficulty: "Demanding walking, no technical ground",
    /**
     * 5,364 m, NOT 8,849 m.
     *
     * This is the number that decides whether somebody can do this trip. Reading
     * the mountain's altitude instead would overstate it by nine hundred per
     * cent, which is the reason the consumer app models it separately.
     */
    maxAltitudeM: 5364,
    priceFromCents: 290_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "March – May, October – November",
    itinerary: [
      { day: 1, title: "Lukla", detail: "Fly in, walk to Phakding." },
      { day: 3, title: "Namche Bazaar", detail: "Acclimatisation day." },
      { day: 9, title: "Base camp", detail: "Out and back from Gorak Shep." },
    ],
    equipment: ["Four-season sleeping bag", "Broken-in boots", "Down jacket"],
    inclusions: ["Teahouse accommodation", "Permits", "Guide and porters"],
    exclusions: ["International flights", "Lukla flights", "Travel insurance"],
    faq: [],
    mountainIds: ["everest"],
    archivedAt: null,
    createdAt: "2026-03-05T10:00:00.000Z",
    updatedAt: "2026-07-30T10:00:00.000Z",
  },
  {
    /**
     * LIVE, with a pending EDIT — not a pending product.
     *
     * The published version below is what climbers see; the operator's price
     * change sits in `VERSIONS` as a `pending` content version. The two states
     * are different facts and both are on this screen at once.
     */
    id: "p-ama-dablam-sw-ridge",
    companyId: LANTERN,
    kind: "expedition",
    name: "Ama Dablam — SW Ridge",
    slug: "ama-dablam-sw-ridge",
    status: "live",
    description:
      "Four weeks on one of the most photographed ridgelines in Nepal. Steep rock and ice above camp 1.",
    durationDays: 28,
    difficulty: "Confident on steep rock and ice, comfortable at 6,000 m",
    maxAltitudeM: 6812,
    priceFromCents: 860_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "October – November",
    itinerary: [],
    equipment: ["Technical axes", "Rock shoes optional", "Harness"],
    inclusions: ["Permits", "Base camp", "Fixed rope on the ridge"],
    exclusions: ["International flights", "Personal kit"],
    faq: [],
    mountainIds: ["ama-dablam"],
    archivedAt: null,
    createdAt: "2026-06-02T10:00:00.000Z",
    updatedAt: "2026-08-26T16:10:00.000Z",
  },
  {
    id: "p-kilimanjaro-machame",
    companyId: LANTERN,
    kind: "expedition",
    name: "Kilimanjaro Machame Route",
    slug: "kilimanjaro-machame",
    status: "draft",
    description: "Seven days up the Machame route with a Barafu summit night.",
    durationDays: 7,
    difficulty: "Strenuous walking at altitude, no technical ground",
    maxAltitudeM: 5895,
    priceFromCents: 240_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "January – March, June – October",
    itinerary: [],
    equipment: [],
    inclusions: ["Park fees", "Camping equipment", "Guide and porters"],
    exclusions: ["International flights", "Tips"],
    faq: [],
    mountainIds: ["kilimanjaro"],
    archivedAt: null,
    createdAt: "2026-08-14T10:00:00.000Z",
    updatedAt: "2026-08-14T10:00:00.000Z",
  },

  /* ---- Treks. Slugs match icefall-web's /img/treks/<slug>.jpg exactly. ---- */

  {
    id: "p-everest-base-camp-trek",
    companyId: LANTERN,
    kind: "trek",
    name: "Everest Base Camp Trek — 12 Days",
    slug: "everest-base-camp-trek",
    status: "live",
    description: "The classic route to Everest Base Camp, paced for acclimatisation.",
    durationDays: 12,
    difficulty: "Demanding walking, no technical ground",
    maxAltitudeM: 5364,
    priceFromCents: 290_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "March – May, October – November",
    itinerary: [],
    equipment: ["Four-season sleeping bag", "Broken-in boots", "Down jacket"],
    inclusions: ["Teahouse accommodation", "Permits", "Guide and porters"],
    exclusions: ["International flights", "Lukla flights", "Travel insurance"],
    faq: [],
    mountainIds: ["everest"],
    archivedAt: null,
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z",
  },
  {
    id: "p-everest-three-passes-trek",
    companyId: LANTERN,
    kind: "trek",
    name: "Everest Three Passes Trek — 18 Days",
    slug: "everest-three-passes-trek",
    status: "live",
    description: "Kongma La, Cho La and Renjo La in one circuit of the upper Khumbu.",
    durationDays: 18,
    difficulty: "Sustained, long days above 5,000 m",
    maxAltitudeM: 5535,
    priceFromCents: 340_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "March – May, October – November",
    itinerary: [],
    equipment: ["Four-season sleeping bag", "Microspikes", "Down jacket"],
    inclusions: ["Teahouse accommodation", "Permits", "Guide and porters"],
    exclusions: ["International flights", "Lukla flights", "Travel insurance"],
    faq: [],
    mountainIds: ["everest"],
    archivedAt: null,
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
  },
  {
    id: "p-kilimanjaro-machame-route",
    companyId: LANTERN,
    kind: "trek",
    name: "Kilimanjaro Machame Route — 7 Days",
    slug: "kilimanjaro-machame-route",
    status: "draft",
    description: "The Machame route as a supported trek, six camps and a summit night.",
    durationDays: 7,
    difficulty: "Strenuous walking at altitude",
    maxAltitudeM: 5895,
    priceFromCents: 240_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "January – March, June – October",
    itinerary: [],
    equipment: [],
    inclusions: ["Park fees", "Camping equipment", "Guide and porters"],
    exclusions: ["International flights", "Tips"],
    faq: [],
    mountainIds: ["kilimanjaro"],
    archivedAt: null,
    createdAt: "2026-08-14T10:30:00.000Z",
    updatedAt: "2026-08-14T10:30:00.000Z",
  },

  /* ---- Coldharbour's — must never appear in Lantern's portal. ------------- */

  {
    id: "p-coldharbour-denali",
    companyId: COLDHARBOUR,
    kind: "expedition",
    name: "Denali — West Buttress",
    slug: "denali-west-buttress",
    status: "live",
    description: "Twenty-one days on the West Buttress.",
    durationDays: 21,
    difficulty: "Serious cold, heavy loads",
    maxAltitudeM: 6190,
    priceFromCents: 1_150_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "May – June",
    itinerary: [],
    equipment: [],
    inclusions: [],
    exclusions: [],
    faq: [],
    mountainIds: ["denali"],
    archivedAt: null,
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
  },
];

export const DEPARTURES: ProductDeparture[] = [
  { id: "d-1", productId: "p-everest-south-col", departureDate: "2027-04-04", endDate: "2027-06-04", availability: "limited", spotsTotal: 8, spotsLeft: 2, priceCents: 5_800_000 },
  { id: "d-2", productId: "p-everest-south-col", departureDate: "2028-04-02", endDate: "2028-06-02", availability: "available", spotsTotal: 8, spotsLeft: 8, priceCents: 6_100_000 },
  { id: "d-3", productId: "p-everest-base-camp", departureDate: "2026-10-12", endDate: "2026-10-23", availability: "full", spotsTotal: 12, spotsLeft: 0, priceCents: 290_000 },
  // spotsLeft null — "not stated", which is NOT the same statement as "none left".
  { id: "d-4", productId: "p-everest-base-camp-trek", departureDate: "2026-11-02", endDate: "2026-11-13", availability: "available", spotsTotal: null, spotsLeft: null, priceCents: 290_000 },
  { id: "d-5", productId: "p-ama-dablam-sw-ridge", departureDate: "2026-10-20", endDate: "2026-11-16", availability: "available", spotsTotal: 6, spotsLeft: 5, priceCents: 860_000 },
  { id: "d-6", productId: "p-everest-three-passes-trek", departureDate: "2026-10-05", endDate: "2026-10-22", availability: "available", spotsTotal: 10, spotsLeft: 6, priceCents: 340_000 },
];

/* -------------------------------------------------------------------------- */
/* Pending, rejected and draft edits                                           */
/* -------------------------------------------------------------------------- */

export const VERSIONS: ContentVersion[] = [
  {
    // The company-profile edit awaiting Icefall review — submitted 27 Aug.
    id: "cv-company-1",
    entityType: "company",
    entityId: LANTERN,
    companyId: LANTERN,
    baseSnapshot: { about: "Lantern Ridge was started by two climbing sirdars who had spent a decade working other people's expeditions and wanted to run them differently: smaller teams, longer acclimatisation, and a turn-around call that belongs to the guide on the ground rather than to an office." },
    changedFields: ["about"],
    flags: [],
    payload: {
      about:
        "Lantern Ridge was started by two climbing sirdars who had spent a decade working other people's expeditions and wanted to run them differently: smaller teams, longer acclimatisation, and a turn-around call that belongs to the guide on the ground. We now run four seasons a year across Nepal, Tanzania and the Alps.",
    },
    state: "pending",
    submittedBy: "cu-ravi",
    submittedAt: "2026-08-27T08:40:00.000Z",
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    createdAt: "2026-08-26T17:02:00.000Z",
    updatedAt: "2026-08-27T08:40:00.000Z",
  },
  {
    /**
     * A pending EDIT on a LIVE product — submitted 26 Aug.
     *
     * The product row above stays `live` and untouched; this version is the
     * whole of the change until Icefall decides it. That is the publication
     * boundary working, not a product stuck in review.
     */
    id: "cv-ama-1",
    entityType: "product",
    entityId: "p-ama-dablam-sw-ridge",
    companyId: LANTERN,
    baseSnapshot: { priceFromCents: 860_000 },
    changedFields: ["priceFromCents"],
    flags: [],
    payload: { priceFromCents: 890_000 },
    state: "pending",
    submittedBy: "cu-ravi",
    submittedAt: "2026-08-26T16:10:00.000Z",
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    createdAt: "2026-08-26T15:40:00.000Z",
    updatedAt: "2026-08-26T16:10:00.000Z",
  },
  {
    /**
     * Rejected, with the reason ICEFALL gave.
     *
     * Spec §17 requires the reason to sit next to the affected item, so the
     * operator learns the rule rather than guessing at it. This one is the
     * commonest rejection there will ever be.
     */
    id: "cv-ebc-1",
    entityType: "product",
    entityId: "p-everest-base-camp-trek",
    companyId: LANTERN,
    baseSnapshot: { description: "The classic route to Everest Base Camp, paced for acclimatisation." },
    changedFields: ["description"],
    /** The advisory validator caught it; a human still made the decision. */
    flags: ["possible_contact_details"],
    payload: {
      description:
        "The classic route to Everest Base Camp. Questions? WhatsApp us on +977 98 1234 5678 or book direct at lanternridge.example.",
    },
    state: "rejected",
    submittedBy: "cu-ravi",
    submittedAt: "2026-08-20T11:00:00.000Z",
    decidedBy: "icefall-staff",
    decidedAt: "2026-08-21T09:15:00.000Z",
    decisionReason:
      "The description carries a WhatsApp number and a direct booking link. Customer enquiries need to stay inside Icefall so your bookings remain attributed to you — please resubmit without them. Everything else in this edit was fine.",
    createdAt: "2026-08-20T10:30:00.000Z",
    updatedAt: "2026-08-21T09:15:00.000Z",
  },
];

/* -------------------------------------------------------------------------- */
/* Conversations — exactly TWO unread for Lantern                              */
/* -------------------------------------------------------------------------- */

export const CONVERSATIONS: Conversation[] = [
  {
    id: "cvn-hanne",
    companyId: LANTERN,
    customerId: "cust-hanne",
    customerName: "Hanne Bakken",
    productId: "p-everest-south-col",
    mountainId: "everest",
    leadId: "l-hanne",
    productNameAtCreation: "Everest — South Col",
    sourcePage: "Everest — South Col",
    lastMessageAt: "2026-08-28T08:35:00.000Z",
    unread: true,
  },
  {
    id: "cvn-tomas",
    companyId: LANTERN,
    customerId: "cust-tomas",
    customerName: "Tomás Ferreira",
    productId: "p-everest-base-camp",
    mountainId: "everest",
    leadId: "l-tomas",
    productNameAtCreation: "Everest Base Camp Trek",
    sourcePage: "Everest Base Camp Trek",
    lastMessageAt: "2026-08-27T16:20:00.000Z",
    unread: true,
  },
  {
    id: "cvn-luis",
    companyId: LANTERN,
    customerId: "cust-luis",
    customerName: "Luis Miguel",
    productId: "p-everest-base-camp",
    mountainId: "everest",
    leadId: "l-luis",
    productNameAtCreation: "Everest Base Camp Trek",
    sourcePage: "Everest Base Camp Trek",
    lastMessageAt: "2026-08-27T11:30:00.000Z",
    unread: false,
  },
  {
    id: "cvn-priya",
    companyId: LANTERN,
    customerId: "cust-priya",
    customerName: "Priya Raman",
    productId: "p-ama-dablam-sw-ridge",
    mountainId: "ama-dablam",
    leadId: "l-priya",
    productNameAtCreation: "Ama Dablam — SW Ridge",
    sourcePage: "Ama Dablam",
    lastMessageAt: "2026-08-25T10:05:00.000Z",
    unread: false,
  },
  {
    /**
     * No catalogue product behind this one — Lantern lists nothing on Mont
     * Blanc yet — so the conversation carries the name the customer saw
     * (spec §18's mechanism, same as an archived trip).
     */
    id: "cvn-sophie",
    companyId: LANTERN,
    customerId: "cust-sophie",
    customerName: "Sophie Dubois",
    productId: null,
    mountainId: "mont-blanc",
    leadId: "l-sophie",
    productNameAtCreation: "Mont Blanc Expedition",
    sourcePage: "Mont Blanc",
    lastMessageAt: "2026-08-25T17:00:00.000Z",
    unread: false,
  },
  {
    // Coldharbour's. Lantern must never see this one.
    id: "cvn-x",
    companyId: COLDHARBOUR,
    customerId: "cust-x",
    customerName: "Ellis Warren",
    productId: "p-coldharbour-denali",
    mountainId: "denali",
    leadId: "l-x",
    productNameAtCreation: "Denali — West Buttress",
    sourcePage: "Denali",
    lastMessageAt: "2026-08-26T18:00:00.000Z",
    unread: true,
  },
];

export const MESSAGES: Message[] = [
  // Hanne — the mockup's conversation, verbatim.
  { id: "m-hanne-1", conversationId: "cvn-hanne", senderId: "cust-hanne", senderName: "Hanne Bakken", fromCompany: false, body: "Hi! I'm interested in your Everest — South Col expedition.", createdAt: "2026-08-28T08:20:00.000Z" },
  { id: "m-hanne-2", conversationId: "cvn-hanne", senderId: "u-ravi", senderName: "Ravi Thapa", fromCompany: true, body: "Hello Hanne! Thank you for your interest. I'd be happy to share more details with you.", createdAt: "2026-08-28T08:35:00.000Z" },

  { id: "m-tomas-1", conversationId: "cvn-tomas", senderId: "cust-tomas", senderName: "Tomás Ferreira", fromCompany: false, body: "Is the 12-day Base Camp trek running in October? There are four of us.", createdAt: "2026-08-27T16:20:00.000Z" },

  { id: "m-luis-1", conversationId: "cvn-luis", senderId: "cust-luis", senderName: "Luis Miguel", fromCompany: false, body: "What does the Base Camp itinerary look like day by day? I have exactly two weeks.", createdAt: "2026-08-27T09:00:00.000Z" },
  { id: "m-luis-2", conversationId: "cvn-luis", senderId: "u-marta", senderName: "Marta Kowalczyk", fromCompany: true, body: "Twelve days door to door from Lukla, with two acclimatisation days built in. I'll send the full day-by-day across now.", createdAt: "2026-08-27T11:30:00.000Z" },

  { id: "m-priya-1", conversationId: "cvn-priya", senderId: "cust-priya", senderName: "Priya Raman", fromCompany: false, body: "What technical grade should I be comfortable leading before Ama Dablam?", createdAt: "2026-08-24T14:00:00.000Z" },
  { id: "m-priya-2", conversationId: "cvn-priya", senderId: "u-marta", senderName: "Marta Kowalczyk", fromCompany: true, body: "Scottish II/III and comfortable seconding steeper. The ridge above camp 1 is fixed but exposed.", createdAt: "2026-08-25T10:05:00.000Z" },

  { id: "m-sophie-1", conversationId: "cvn-sophie", senderId: "cust-sophie", senderName: "Sophie Dubois", fromCompany: false, body: "Do you run guided ascents of Mont Blanc? I'm looking at next summer.", createdAt: "2026-08-25T15:10:00.000Z" },
  { id: "m-sophie-2", conversationId: "cvn-sophie", senderId: "u-marta", senderName: "Marta Kowalczyk", fromCompany: true, body: "We've just been assigned Mont Blanc and are building the programme now — can I keep you posted here as soon as dates open?", createdAt: "2026-08-25T17:00:00.000Z" },

  { id: "m-x-1", conversationId: "cvn-x", senderId: "cust-x", senderName: "Ellis Warren", fromCompany: false, body: "Any spaces on the June West Buttress trip?", createdAt: "2026-08-26T18:00:00.000Z" },
];

export const NOTES: ConversationNote[] = [
  {
    id: "n-1",
    conversationId: "cvn-hanne",
    companyId: LANTERN,
    authorId: "u-ravi",
    authorName: "Ravi Thapa",
    body: "Strong candidate — asked the right questions straight away. Worth a call before we quote.",
    createdAt: "2026-08-28T08:40:00.000Z",
  },
];

/* -------------------------------------------------------------------------- */
/* Leads                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * THE COUNTS ARE THE CONTRACT.
 *
 * August 2026: exactly 28 enquiries — website ×12, icefall-app ×8,
 * marketplace ×6, other ×2 — of which exactly 15 carry a `qualifiedAt`.
 * July 2026: exactly 18 enquiries (all created 1–27 Jul, so no calendar window
 * and no rolling 4-week window slices them differently), 12 with `qualifiedAt`.
 * The dashboard's +56% / +25% deltas are computed from these rows.
 *
 * The nine NAMED leads are the mockup's own rows; the rest are deterministic
 * filler — no Math.random, so a screenshot taken today matches next week's.
 */

export const LEADS: Lead[] = [
  // ---- The mockup's named August leads, newest first -----------------------
  { id: "l-hanne", companyId: LANTERN, customerId: "cust-hanne", customerName: "Hanne Bakken", conversationId: "cvn-hanne", productId: "p-everest-south-col", mountainId: "everest", status: "qualified", origin: "icefall", tags: ["Deposit paid", "Repeat client"], ownerId: "cu-ravi", bookingId: null, source: "website", createdAt: "2026-08-28T08:20:00.000Z", firstResponseAt: "2026-08-28T08:35:00.000Z", qualifiedAt: "2026-08-28T08:50:00.000Z", quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-tomas", companyId: LANTERN, customerId: "cust-tomas", customerName: "Tomás Ferreira", conversationId: "cvn-tomas", productId: "p-everest-base-camp", mountainId: "everest", status: "new", origin: "icefall", tags: ["First-timer"], ownerId: null, bookingId: null, source: "icefall-app", createdAt: "2026-08-27T16:20:00.000Z", firstResponseAt: null, qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-luis", companyId: LANTERN, customerId: "cust-luis", customerName: "Luis Miguel", conversationId: "cvn-luis", productId: "p-everest-base-camp", mountainId: "everest", status: "contacted", origin: "icefall", tags: ["Group of 4"], ownerId: "cu-marta", bookingId: null, source: "website", createdAt: "2026-08-27T09:00:00.000Z", firstResponseAt: "2026-08-27T11:30:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-paulo", companyId: LANTERN, customerId: "cust-paulo", customerName: "Paulo Almeida", conversationId: null, productId: "p-ama-dablam-sw-ridge", mountainId: "ama-dablam", status: "lost", origin: "icefall", tags: [], ownerId: "cu-marta", bookingId: null, source: "website", createdAt: "2026-08-26T11:00:00.000Z", firstResponseAt: "2026-08-26T14:00:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: "2026-08-27T09:30:00.000Z", lostReason: "Went with another operator on price." },
  { id: "l-sophie", companyId: LANTERN, customerId: "cust-sophie", customerName: "Sophie Dubois", conversationId: "cvn-sophie", productId: null, mountainId: "mont-blanc", status: "contacted", origin: "icefall", tags: ["Needs dates"], ownerId: "cu-marta", bookingId: null, source: "other", createdAt: "2026-08-25T15:10:00.000Z", firstResponseAt: "2026-08-25T17:00:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-priya", companyId: LANTERN, customerId: "cust-priya", customerName: "Priya Raman", conversationId: "cvn-priya", productId: "p-ama-dablam-sw-ridge", mountainId: "ama-dablam", status: "quoted", origin: "icefall", tags: ["Awaiting quote reply", "Group of 4"], ownerId: "cu-marta", bookingId: null, source: "marketplace", createdAt: "2026-08-24T14:00:00.000Z", firstResponseAt: "2026-08-25T10:05:00.000Z", qualifiedAt: "2026-08-25T10:30:00.000Z", quotedAt: "2026-08-25T15:00:00.000Z", bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-aoife", companyId: LANTERN, customerId: "cust-aoife", customerName: "Aoife Brennan", conversationId: null, productId: "p-everest-base-camp", mountainId: "everest", status: "lost", origin: "icefall", tags: [], ownerId: null, bookingId: null, source: "icefall-app", createdAt: "2026-08-24T09:40:00.000Z", firstResponseAt: "2026-08-24T15:00:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: "2026-08-26T10:00:00.000Z", lostReason: "Dates didn't work for her group." },
  { id: "l-charlotte", companyId: LANTERN, customerId: "cust-charlotte", customerName: "Charlotte Martin", conversationId: null, productId: "p-ama-dablam-sw-ridge", mountainId: "ama-dablam", status: "booked", origin: "icefall", tags: ["Deposit paid"], ownerId: "cu-marta", bookingId: "bk-charlotte", source: "website", createdAt: "2026-08-18T10:00:00.000Z", firstResponseAt: "2026-08-18T14:00:00.000Z", qualifiedAt: "2026-08-20T09:00:00.000Z", quotedAt: "2026-08-22T09:00:00.000Z", bookedAt: "2026-08-25T09:00:00.000Z", lostAt: null, lostReason: null },
  // Booked, then cancelled — the booking record below is `cancelled` and this
  // lead ends `lost`. Both stamps stay: history is what happened, in order.
  { id: "l-benjamin", companyId: LANTERN, customerId: "cust-benjamin", customerName: "Benjamin Lee", conversationId: null, productId: "p-everest-south-col", mountainId: "everest", status: "lost", origin: "icefall", tags: [], ownerId: "cu-marta", bookingId: "bk-benjamin", source: "marketplace", createdAt: "2026-08-12T10:00:00.000Z", firstResponseAt: "2026-08-12T15:00:00.000Z", qualifiedAt: "2026-08-14T09:00:00.000Z", quotedAt: "2026-08-16T09:00:00.000Z", bookedAt: "2026-08-20T09:00:00.000Z", lostAt: "2026-08-24T09:00:00.000Z", lostReason: "Cancelled after booking — schedule conflict." },

  // ---- Coldharbour's — must never appear in Lantern's portal ---------------
  { id: "l-x", companyId: COLDHARBOUR, customerId: "cust-x", customerName: "Ellis Warren", conversationId: "cvn-x", productId: "p-coldharbour-denali", mountainId: "denali", status: "new", origin: "icefall", tags: [], ownerId: null, bookingId: null, source: "website", createdAt: "2026-08-26T18:00:00.000Z", firstResponseAt: null, qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
];

/**
 * Leads the COMPANY added themselves — phone calls and referrals.
 *
 * They exist in the seed so the origin split is visible the moment you open the
 * pipeline, and so the tests can prove the thing that matters: these are NOT
 * counted in the ICEFALL scorecard. August still has exactly 28 ICEFALL
 * enquiries with these three sitting alongside them.
 *
 * No `conversationId`: ICEFALL has no thread with these people and cannot
 * message them. Their `source` is the operator's own words.
 */
export const COMPANY_ADDED_LEADS: Lead[] = [
  { id: "l-own-1", companyId: LANTERN, customerId: "cu-own-1", customerName: "Bruno Kessler", conversationId: null, productId: "p-everest-south-col", mountainId: "everest", status: "quoted", origin: "company", tags: ["Referral", "Group of 4"], ownerId: "cu-ravi", bookingId: null, source: "Referral — Pemba", createdAt: "2026-08-19T09:00:00.000Z", firstResponseAt: "2026-08-19T09:30:00.000Z", qualifiedAt: "2026-08-20T09:00:00.000Z", quotedAt: "2026-08-21T09:00:00.000Z", bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-own-2", companyId: LANTERN, customerId: "cu-own-2", customerName: "Andrés Pulido", conversationId: null, productId: "p-ama-dablam-sw-ridge", mountainId: "ama-dablam", status: "contacted", origin: "company", tags: ["Phone enquiry"], ownerId: "cu-marta", bookingId: null, source: "Phone", createdAt: "2026-08-23T11:00:00.000Z", firstResponseAt: "2026-08-23T11:20:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-own-3", companyId: LANTERN, customerId: "cu-own-3", customerName: "Ingvild Sæther", conversationId: null, productId: "p-everest-base-camp-trek", mountainId: "everest", status: "new", origin: "company", tags: ["Repeat client"], ownerId: null, bookingId: null, source: "Walk-in", createdAt: "2026-08-27T13:00:00.000Z", firstResponseAt: null, qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
];

/** Stage a filler lead reached. `lost` here means lost before qualification. */
type FillerStage = "new" | "contacted" | "qualified" | "quoted" | "lost";

const filler = (
  id: string,
  name: string,
  day: string, // "YYYY-MM-DD"
  source: "website" | "icefall-app" | "marketplace" | "other",
  productId: string,
  mountainId: string,
  stage: FillerStage,
  ownerId: string | null,
): Lead => {
  const created = `${day}T10:15:00.000Z`;
  const responded = stage !== "new" ? `${day}T14:00:00.000Z` : null;
  const qualified = stage === "qualified" || stage === "quoted" ? `${day}T16:30:00.000Z` : null;
  const quoted = stage === "quoted" ? `${day}T18:00:00.000Z` : null;
  const lost = stage === "lost" ? `${day}T19:00:00.000Z` : null;
  const status: Lead["status"] = stage === "lost" ? "lost" : stage;
  return {
    id, companyId: LANTERN, customerId: `cust-${id}`, customerName: name,
    conversationId: null, productId, mountainId, status,
    origin: "icefall", tags: [], ownerId, bookingId: null,
    source, createdAt: created, firstResponseAt: responded, qualifiedAt: qualified,
    quotedAt: quoted, bookedAt: null, lostAt: lost,
    lostReason: lost ? "Went with another operator on price." : null,
  };
};

const SC = ["p-everest-south-col", "everest"] as const;
const BC = ["p-everest-base-camp", "everest"] as const;
const AD = ["p-ama-dablam-sw-ridge", "ama-dablam"] as const;
const BT = ["p-everest-base-camp-trek", "everest"] as const;
const TP = ["p-everest-three-passes-trek", "everest"] as const;

/**
 * August filler: 19 leads. With the 9 named above → 28 August enquiries.
 * Channels here: website ×8, icefall-app ×6, marketplace ×4, other ×1
 * (named leads carry the rest). Eleven reach qualified/quoted → with the four
 * qualified named leads (Hanne, Priya, Charlotte, Benjamin) that is 15.
 */
const AUGUST_FILLER: Lead[] = [
  filler("l-a01", "Ingrid Sundqvist", "2026-08-02", "website", ...SC, "quoted", "cu-marta"),
  filler("l-a02", "Rafael Duarte", "2026-08-03", "icefall-app", ...BT, "qualified", null),
  filler("l-a03", "Nadia Haddad", "2026-08-04", "website", ...TP, "contacted", "cu-marta"),
  filler("l-a04", "Kenji Watanabe", "2026-08-05", "marketplace", ...SC, "qualified", "cu-marta"),
  filler("l-a05", "Marcus Oyelaran", "2026-08-06", "website", ...BC, "quoted", null),
  filler("l-a06", "Lena Bauer", "2026-08-08", "icefall-app", ...AD, "qualified", "cu-marta"),
  filler("l-a07", "Diego Restrepo", "2026-08-09", "website", ...BT, "lost", null),
  filler("l-a08", "Yusuf Demir", "2026-08-10", "marketplace", ...SC, "qualified", "cu-marta"),
  filler("l-a09", "Clara Nyström", "2026-08-11", "icefall-app", ...TP, "contacted", null),
  filler("l-a10", "Beatrix Kovács", "2026-08-13", "website", ...BC, "qualified", "cu-marta"),
  filler("l-a11", "Tom Whitfield", "2026-08-14", "icefall-app", ...SC, "quoted", "cu-marta"),
  filler("l-a12", "Sanne de Vries", "2026-08-15", "website", ...BT, "new", null),
  filler("l-a13", "Freya Lindholm", "2026-08-17", "marketplace", ...AD, "qualified", "cu-marta"),
  filler("l-a14", "Idris Bello", "2026-08-19", "icefall-app", ...BC, "contacted", null),
  filler("l-a15", "Mei Chen", "2026-08-20", "website", ...SC, "qualified", "cu-marta"),
  filler("l-a16", "Oskar Nowak", "2026-08-21", "other", ...TP, "new", null),
  filler("l-a17", "Helena Ruiz", "2026-08-22", "marketplace", ...BT, "quoted", "cu-marta"),
  filler("l-a18", "Callum Fraser", "2026-08-23", "website", ...AD, "contacted", null),
  filler("l-a19", "Zofia Adamska", "2026-08-26", "icefall-app", ...BC, "new", null),
];

/** July: 18 enquiries (1–27 Jul only), 12 qualified or beyond, no bookings. */
const JULY_FILLER: Lead[] = [
  filler("l-j01", "Matteo Ricci", "2026-07-02", "website", ...SC, "quoted", "cu-marta"),
  filler("l-j02", "Amelia Hart", "2026-07-03", "icefall-app", ...BT, "qualified", "cu-marta"),
  // Owned by the since-disabled Tenzin — their history survives their removal.
  filler("l-j03", "Henrik Dahl", "2026-07-05", "website", ...BC, "contacted", "cu-tenzin"),
  filler("l-j04", "Chiara Bellini", "2026-07-06", "marketplace", ...AD, "qualified", "cu-marta"),
  filler("l-j05", "Noor Al-Farsi", "2026-07-08", "website", ...SC, "qualified", null),
  filler("l-j06", "Gabriel Silva", "2026-07-09", "icefall-app", ...TP, "lost", null),
  filler("l-j07", "Elif Kaya", "2026-07-11", "website", ...BC, "quoted", "cu-marta"),
  filler("l-j08", "Stefan Meyer", "2026-07-12", "marketplace", ...BT, "qualified", null),
  filler("l-j09", "Anouk Janssen", "2026-07-14", "website", ...SC, "contacted", "cu-marta"),
  filler("l-j10", "Ryo Tanaka", "2026-07-15", "icefall-app", ...AD, "qualified", null),
  filler("l-j11", "Isabella Moreau", "2026-07-17", "website", ...BC, "qualified", "cu-marta"),
  filler("l-j12", "Piotr Zieliński", "2026-07-18", "marketplace", ...TP, "new", null),
  filler("l-j13", "Maja Andersen", "2026-07-20", "website", ...SC, "quoted", "cu-marta"),
  filler("l-j14", "Liam O'Connor", "2026-07-21", "icefall-app", ...BT, "qualified", null),
  filler("l-j15", "Valentina Rossi", "2026-07-23", "website", ...AD, "contacted", "cu-marta"),
  filler("l-j16", "Andrés Vargas", "2026-07-24", "other", ...BC, "qualified", null),
  filler("l-j17", "Katarzyna Wolska", "2026-07-26", "website", ...SC, "qualified", "cu-marta"),
  filler("l-j18", "Finn Berger", "2026-07-27", "icefall-app", ...BT, "new", null),
];

LEADS.push(...AUGUST_FILLER, ...JULY_FILLER, ...COMPANY_ADDED_LEADS);

export const LEAD_NOTES: LeadNote[] = [
  { id: "ln-1", leadId: "l-priya", authorId: "u-marta", authorName: "Marta Kowalczyk", body: "Quoted at the standard rate. She's comparing us against one other operator, decision expected mid-September.", createdAt: "2026-08-25T15:05:00.000Z" },
];

/* -------------------------------------------------------------------------- */
/* Bookings — every row carries a REPORTED value, per the mockup               */
/* -------------------------------------------------------------------------- */

export const BOOKINGS: Booking[] = [
  {
    id: "bk-hanne",
    status: "confirmed",
    leadId: "l-hanne",
    companyId: LANTERN,
    productId: "p-everest-south-col",
    mountainId: "everest",
    value: { status: "reported", cents: 1_245_000 },
    currency: "EUR",
    bookedAt: "2026-08-28T08:55:00.000Z",
    startsOn: "2027-04-04",
    /**
     * NULL, and it stays null: the operator-side referral rate has not been
     * settled — the owner is deciding between two figures. Because the rate
     * lives on the booking rather than being looked up at read time, settling
     * it later will not rewrite this record or any other.
     */
    referralPctAtBooking: null,
  },
  {
    id: "bk-luis",
    status: "confirmed",
    leadId: "l-luis",
    companyId: LANTERN,
    productId: "p-everest-base-camp",
    mountainId: "everest",
    value: { status: "reported", cents: 215_000 },
    currency: "EUR",
    bookedAt: "2026-08-27T15:00:00.000Z",
    startsOn: "2026-10-12",
    referralPctAtBooking: null,
  },
  {
    // `pending` is the BOOKING's status (deposit not yet confirmed) — not to be
    // confused with a pending VALUE, which no row here has any more.
    id: "bk-charlotte",
    status: "pending",
    leadId: "l-charlotte",
    companyId: LANTERN,
    productId: "p-ama-dablam-sw-ridge",
    mountainId: "ama-dablam",
    value: { status: "reported", cents: 690_000 },
    currency: "EUR",
    bookedAt: "2026-08-25T09:00:00.000Z",
    startsOn: "2026-10-20",
    referralPctAtBooking: null,
  },
  {
    id: "bk-benjamin",
    status: "cancelled",
    leadId: "l-benjamin",
    companyId: LANTERN,
    productId: "p-everest-south-col",
    mountainId: "everest",
    value: { status: "reported", cents: 1_245_000 },
    currency: "EUR",
    bookedAt: "2026-08-20T09:00:00.000Z",
    startsOn: "2027-04-04",
    referralPctAtBooking: null,
  },
];

/* -------------------------------------------------------------------------- */
/* Notifications — exactly THREE unread                                        */
/* -------------------------------------------------------------------------- */

export const NOTIFICATIONS: OperatorNotification[] = [
  { id: "nt-1", companyUserId: "cu-ravi", companyId: LANTERN, type: "booking_recorded", title: "Booking confirmed — Hanne Bakken", body: "Everest — South Col, €12,450.", href: "/operator/bookings", createdAt: "2026-08-28T08:55:00.000Z", readAt: null },
  { id: "nt-2", companyUserId: "cu-ravi", companyId: LANTERN, type: "enquiry_new", title: "New enquiry from Tomás Ferreira", body: "About Everest Base Camp Trek.", href: "/operator/inbox/cvn-tomas", createdAt: "2026-08-27T16:20:00.000Z", readAt: null },
  { id: "nt-3", companyUserId: "cu-ravi", companyId: LANTERN, type: "content_submitted", title: "Profile edit sent to Icefall", body: "Your company profile edit submitted on 27 Aug 2026 is awaiting Icefall review. Your published profile is unchanged until then.", href: "/operator/company", createdAt: "2026-08-27T08:40:00.000Z", readAt: null },
  // Read — kept so the list has history and the rejection sits next to its trek.
  { id: "nt-4", companyUserId: "cu-ravi", companyId: LANTERN, type: "content_rejected", title: "Changes to Everest Base Camp Trek — 12 Days were not approved", body: "The description carried a WhatsApp number and a booking link.", href: "/operator/products/p-everest-base-camp-trek", createdAt: "2026-08-21T09:15:00.000Z", readAt: "2026-08-21T11:00:00.000Z" },
];

/* -------------------------------------------------------------------------- */
/* Analytics events                                                            */
/* -------------------------------------------------------------------------- */

/**
 * NOTE WHAT IS NOT HERE: not one `listing_view`.
 *
 * No surface in the ICEFALL family emits a view event (verified 2026-08-28), so
 * there is nothing to seed that would be true. The analytics screen reports
 * views as not yet counted rather than showing a figure, and it will keep doing
 * so until the consumer apps actually count them.
 */
export const EVENTS: AnalyticsEvent[] = [
  { id: "e-1", occurredAt: "2026-08-12T10:00:00.000Z", eventType: "enquiry_started", source: "server", companyId: LANTERN, mountainId: "everest", productId: "p-everest-south-col", conversationId: null, leadId: "l-benjamin", sourcePage: "Everest — South Col" },
  { id: "e-2", occurredAt: "2026-08-14T09:00:00.000Z", eventType: "lead_qualified", source: "server", companyId: LANTERN, mountainId: "everest", productId: "p-everest-south-col", conversationId: null, leadId: "l-benjamin", sourcePage: null },
  { id: "e-3", occurredAt: "2026-08-18T10:00:00.000Z", eventType: "enquiry_started", source: "server", companyId: LANTERN, mountainId: "ama-dablam", productId: "p-ama-dablam-sw-ridge", conversationId: null, leadId: "l-charlotte", sourcePage: "Ama Dablam" },
  { id: "e-4", occurredAt: "2026-08-20T09:00:00.000Z", eventType: "booking_recorded", source: "server", companyId: LANTERN, mountainId: "everest", productId: "p-everest-south-col", conversationId: null, leadId: "l-benjamin", sourcePage: null },
  { id: "e-5", occurredAt: "2026-08-24T14:00:00.000Z", eventType: "enquiry_started", source: "server", companyId: LANTERN, mountainId: "ama-dablam", productId: "p-ama-dablam-sw-ridge", conversationId: "cvn-priya", leadId: "l-priya", sourcePage: "Ama Dablam" },
  { id: "e-6", occurredAt: "2026-08-25T09:00:00.000Z", eventType: "booking_recorded", source: "server", companyId: LANTERN, mountainId: "ama-dablam", productId: "p-ama-dablam-sw-ridge", conversationId: null, leadId: "l-charlotte", sourcePage: null },
  { id: "e-7", occurredAt: "2026-08-27T09:00:00.000Z", eventType: "enquiry_started", source: "server", companyId: LANTERN, mountainId: "everest", productId: "p-everest-base-camp", conversationId: "cvn-luis", leadId: "l-luis", sourcePage: "Everest Base Camp Trek" },
  { id: "e-8", occurredAt: "2026-08-27T15:00:00.000Z", eventType: "booking_recorded", source: "server", companyId: LANTERN, mountainId: "everest", productId: "p-everest-base-camp", conversationId: "cvn-luis", leadId: "l-luis", sourcePage: null },
  { id: "e-9", occurredAt: "2026-08-27T16:20:00.000Z", eventType: "enquiry_started", source: "server", companyId: LANTERN, mountainId: "everest", productId: "p-everest-base-camp", conversationId: "cvn-tomas", leadId: "l-tomas", sourcePage: "Everest Base Camp Trek" },
  { id: "e-10", occurredAt: "2026-08-28T08:20:00.000Z", eventType: "enquiry_started", source: "server", companyId: LANTERN, mountainId: "everest", productId: "p-everest-south-col", conversationId: "cvn-hanne", leadId: "l-hanne", sourcePage: "Everest — South Col" },
  { id: "e-11", occurredAt: "2026-08-28T08:50:00.000Z", eventType: "lead_qualified", source: "server", companyId: LANTERN, mountainId: "everest", productId: "p-everest-south-col", conversationId: "cvn-hanne", leadId: "l-hanne", sourcePage: null },
  { id: "e-12", occurredAt: "2026-08-28T08:55:00.000Z", eventType: "booking_recorded", source: "server", companyId: LANTERN, mountainId: "everest", productId: "p-everest-south-col", conversationId: "cvn-hanne", leadId: "l-hanne", sourcePage: null },
];
