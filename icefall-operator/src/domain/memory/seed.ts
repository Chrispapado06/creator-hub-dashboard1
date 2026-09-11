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
  Channel,
  ChannelMessage,
  Company,
  CompanyMountain,
  CompanyTrek,
  Placement,
  CompanyUser,
  Conversation,
  ConversationNote,
  ContentVersion,
  Follow,
  Lead,
  LeadNote,
  Message,
  MediaAsset,
  Mountain,
  OperatorNotification,
  Post,
  PostComment,
  Product,
  ProductDeparture,
  PromoVideoSlot,
  Trek,
  Activity,
  AuditEvent,
  Contact,
  ContactGroup,
  Document,
  FinancialEvent,
  GuideResource,
  Participant,
  Proposal,
  ProposalVersion,
  ReferralEvent,
  Supplier,
  Task,
  TripBrief,
} from "../types";
import { buildAuditEvent } from "../crm/audit";
import { deriveParticipantStatus, informationOf } from "../crm/participants";
import { moneySplitProblem } from "../crm/proposals";

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
  {
    id: "d-1", productId: "p-everest-south-col", departureDate: "2027-04-04", endDate: "2027-06-04", availability: "limited", spotsTotal: 8, spotsLeft: 2, priceCents: 5_800_000,
    /*
     * THE OPERATIONAL RECORD (brief §4 Departure) — the third field group.
     * `capacity` is the headcount the team will actually run; `spotsTotal`
     * above is what the listing advertises. They agree here and need not.
     */
    status: "planning",
    name: "South Col 2027 — Team A",
    capacity: 8,
    meetingPoint: "Kathmandu — hotel briefing, 2 April 2027, 09:00 local",
    internalNotes: "Permit application opens January. Astrid to confirm by October. One client (Hanne) fully documented; roster otherwise open.",
    participantIds: ["pa-hanne"],
    proposalId: null,
  },
  { id: "d-2", productId: "p-everest-south-col", departureDate: "2028-04-02", endDate: "2028-06-02", availability: "available", spotsTotal: 8, spotsLeft: 8, priceCents: 6_100_000 },
  { id: "d-3", productId: "p-everest-base-camp", departureDate: "2026-10-12", endDate: "2026-10-23", availability: "full", spotsTotal: 12, spotsLeft: 0, priceCents: 290_000 },
  // spotsLeft null — "not stated", which is NOT the same statement as "none left".
  { id: "d-4", productId: "p-everest-base-camp-trek", departureDate: "2026-11-02", endDate: "2026-11-13", availability: "available", spotsTotal: null, spotsLeft: null, priceCents: 290_000 },
  {
    id: "d-5", productId: "p-ama-dablam-sw-ridge", departureDate: "2026-10-20", endDate: "2026-11-16", availability: "available", spotsTotal: 6, spotsLeft: 5, priceCents: 860_000,
    status: "confirmed",
    name: "Ama Dablam SW Ridge — autumn 2026",
    capacity: 6,
    meetingPoint: "Lukla — Paradise Lodge, 20 October 2026, 08:00 local",
    internalNotes: "Cook team not yet booked (see the blocked task). Charlotte's insurance certificate still outstanding.",
    participantIds: ["pa-charlotte"],
    proposalId: "pr-priya",
  },
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
  { id: "l-hanne", companyId: LANTERN, customerId: "cust-hanne", customerName: "Hanne Bakken", contactId: "ct-hanne", conversationId: "cvn-hanne", productId: "p-everest-south-col", mountainId: "everest", status: "qualified", origin: "icefall", tags: ["Deposit paid", "Repeat client"], ownerId: "cu-ravi", bookingId: null, source: "website", createdAt: "2026-08-28T08:20:00.000Z", firstResponseAt: "2026-08-28T08:35:00.000Z", qualifiedAt: "2026-08-28T08:50:00.000Z", quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-tomas", companyId: LANTERN, customerId: "cust-tomas", customerName: "Tomás Ferreira", contactId: "ct-tomas", conversationId: "cvn-tomas", productId: "p-everest-base-camp", mountainId: "everest", status: "new", origin: "icefall", tags: ["First-timer"], ownerId: null, bookingId: null, source: "icefall-app", createdAt: "2026-08-27T16:20:00.000Z", firstResponseAt: null, qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-luis", companyId: LANTERN, customerId: "cust-luis", customerName: "Luis Miguel", contactId: "ct-luis", conversationId: "cvn-luis", productId: "p-everest-base-camp", mountainId: "everest", status: "contacted", origin: "icefall", tags: ["Group of 4"], ownerId: "cu-marta", bookingId: null, source: "website", createdAt: "2026-08-27T09:00:00.000Z", firstResponseAt: "2026-08-27T11:30:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-paulo", companyId: LANTERN, customerId: "cust-paulo", customerName: "Paulo Almeida", contactId: "ct-paulo", conversationId: null, productId: "p-ama-dablam-sw-ridge", mountainId: "ama-dablam", status: "lost", origin: "icefall", tags: [], ownerId: "cu-marta", bookingId: null, source: "website", createdAt: "2026-08-26T11:00:00.000Z", firstResponseAt: "2026-08-26T14:00:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: "2026-08-27T09:30:00.000Z", lostReason: "Went with another operator on price." },
  { id: "l-sophie", companyId: LANTERN, customerId: "cust-sophie", customerName: "Sophie Dubois", contactId: "ct-sophie", conversationId: "cvn-sophie", productId: null, mountainId: "mont-blanc", status: "contacted", origin: "icefall", tags: ["Needs dates"], ownerId: "cu-marta", bookingId: null, source: "other", createdAt: "2026-08-25T15:10:00.000Z", firstResponseAt: "2026-08-25T17:00:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-priya", companyId: LANTERN, customerId: "cust-priya", customerName: "Priya Raman", contactId: "ct-priya", conversationId: "cvn-priya", productId: "p-ama-dablam-sw-ridge", mountainId: "ama-dablam", status: "quoted", origin: "icefall", tags: ["Awaiting quote reply", "Group of 4"], ownerId: "cu-marta", bookingId: null, source: "marketplace", createdAt: "2026-08-24T14:00:00.000Z", firstResponseAt: "2026-08-25T10:05:00.000Z", qualifiedAt: "2026-08-25T10:30:00.000Z", quotedAt: "2026-08-25T15:00:00.000Z", bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-aoife", companyId: LANTERN, customerId: "cust-aoife", customerName: "Aoife Brennan", contactId: "ct-aoife", conversationId: null, productId: "p-everest-base-camp", mountainId: "everest", status: "lost", origin: "icefall", tags: [], ownerId: null, bookingId: null, source: "icefall-app", createdAt: "2026-08-24T09:40:00.000Z", firstResponseAt: "2026-08-24T15:00:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: "2026-08-26T10:00:00.000Z", lostReason: "Dates didn't work for her group." },
  { id: "l-charlotte", companyId: LANTERN, customerId: "cust-charlotte", customerName: "Charlotte Martin", contactId: "ct-charlotte", conversationId: null, productId: "p-ama-dablam-sw-ridge", mountainId: "ama-dablam", status: "booked", origin: "icefall", tags: ["Deposit paid"], ownerId: "cu-marta", bookingId: "bk-charlotte", source: "website", createdAt: "2026-08-18T10:00:00.000Z", firstResponseAt: "2026-08-18T14:00:00.000Z", qualifiedAt: "2026-08-20T09:00:00.000Z", quotedAt: "2026-08-22T09:00:00.000Z", bookedAt: "2026-08-25T09:00:00.000Z", lostAt: null, lostReason: null },
  // Booked, then cancelled — the booking record below is `cancelled` and this
  // lead ends `lost`. Both stamps stay: history is what happened, in order.
  { id: "l-benjamin", companyId: LANTERN, customerId: "cust-benjamin", customerName: "Benjamin Lee", contactId: "ct-benjamin", conversationId: null, productId: "p-everest-south-col", mountainId: "everest", status: "lost", origin: "icefall", tags: [], ownerId: "cu-marta", bookingId: "bk-benjamin", source: "marketplace", createdAt: "2026-08-12T10:00:00.000Z", firstResponseAt: "2026-08-12T15:00:00.000Z", qualifiedAt: "2026-08-14T09:00:00.000Z", quotedAt: "2026-08-16T09:00:00.000Z", bookedAt: "2026-08-20T09:00:00.000Z", lostAt: "2026-08-24T09:00:00.000Z", lostReason: "Cancelled after booking — schedule conflict." },

  // ---- Coldharbour's — must never appear in Lantern's portal ---------------
  { id: "l-x", companyId: COLDHARBOUR, customerId: "cust-x", customerName: "Ellis Warren", contactId: "ct-x", conversationId: "cvn-x", productId: "p-coldharbour-denali", mountainId: "denali", status: "new", origin: "icefall", tags: [], ownerId: null, bookingId: null, source: "website", createdAt: "2026-08-26T18:00:00.000Z", firstResponseAt: null, qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
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
  { id: "l-own-1", companyId: LANTERN, customerId: "cu-own-1", customerName: "Bruno Kessler", contactId: "ct-bruno", conversationId: null, productId: "p-everest-south-col", mountainId: "everest", status: "quoted", origin: "company", tags: ["Referral", "Group of 4"], ownerId: "cu-ravi", bookingId: null, source: "Referral — Pemba", createdAt: "2026-08-19T09:00:00.000Z", firstResponseAt: "2026-08-19T09:30:00.000Z", qualifiedAt: "2026-08-20T09:00:00.000Z", quotedAt: "2026-08-21T09:00:00.000Z", bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-own-2", companyId: LANTERN, customerId: "cu-own-2", customerName: "Andrés Pulido", contactId: "ct-andres", conversationId: null, productId: "p-ama-dablam-sw-ridge", mountainId: "ama-dablam", status: "contacted", origin: "company", tags: ["Phone enquiry"], ownerId: "cu-marta", bookingId: null, source: "Phone", createdAt: "2026-08-23T11:00:00.000Z", firstResponseAt: "2026-08-23T11:20:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-own-3", companyId: LANTERN, customerId: "cu-own-3", customerName: "Ingvild Sæther", contactId: "ct-ingvild", conversationId: null, productId: "p-everest-base-camp-trek", mountainId: "everest", status: "new", origin: "company", tags: ["Repeat client"], ownerId: null, bookingId: null, source: "Walk-in", createdAt: "2026-08-27T13:00:00.000Z", firstResponseAt: null, qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
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
    // Brief §4 commercial fields. The events in FINANCIAL_EVENTS below agree with these.
    proposalId: null,
    departureId: "d-1",
    primaryContactId: "ct-hanne",
    quotedTotalMinor: 1_245_000,
    depositDueMinor: 249_000,
    balanceDueMinor: 996_000,
    depositDueAt: "2026-09-11T00:00:00.000Z",
    balanceDueAt: "2027-02-21T00:00:00.000Z",
    externalReference: "LR-INV-2026-071",
    // NO PROVIDER IS CONNECTED. Null, and honest about why — see the type.
    paymentProviderReference: null,
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
    proposalId: null,
    departureId: "d-3",
    primaryContactId: "ct-luis",
    quotedTotalMinor: 215_000,
    depositDueMinor: 43_000,
    balanceDueMinor: 172_000,
    depositDueAt: "2026-09-10T00:00:00.000Z",
    balanceDueAt: "2026-08-31T00:00:00.000Z",
    externalReference: "LR-INV-2026-069",
    paymentProviderReference: null,
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
    // No proposal: `pr-priya` is on Priya's enquiry, and a booking may only cite a proposal on its own.
    proposalId: null,
    departureId: "d-5",
    primaryContactId: "ct-charlotte",
    quotedTotalMinor: 690_000,
    depositDueMinor: 138_000,
    balanceDueMinor: 552_000,
    depositDueAt: "2026-09-08T00:00:00.000Z",
    balanceDueAt: "2026-09-08T00:00:00.000Z",
    externalReference: "LR-INV-2026-066",
    paymentProviderReference: null,
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
    proposalId: null,
    departureId: "d-1",
    primaryContactId: "ct-benjamin",
    quotedTotalMinor: 1_245_000,
    depositDueMinor: 249_000,
    balanceDueMinor: 996_000,
    depositDueAt: "2026-09-03T00:00:00.000Z",
    balanceDueAt: "2027-02-21T00:00:00.000Z",
    externalReference: "LR-INV-2026-058",
    paymentProviderReference: null,
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

/* -------------------------------------------------------------------------- */
/* Social (OP-01, via S2) — posts, comments, follows, the promo-video slot    */
/* -------------------------------------------------------------------------- */

/**
 * Rows in the exact shape of the S2 `posts` table, which IS NOT LIVE — this
 * seed exists so the surface can be built and exercised before the migration
 * lands, and the swap is a repoint.
 *
 * MEDIA HONESTY. No media store is connected, so no post here pretends to
 * carry uploaded bytes. The two posts with photographs reference the
 * ALREADY-CREDITED peak/trek libraries served by icefall-web (the
 * `ListingPhoto` pattern, drawing its fallback when that server is down) —
 * one credited library, no second copy, per the 2026-08-29 ruling.
 *
 * WHAT THE SIX ROWS MAKE VISIBLE, deliberately one of each:
 *   - two plain posts with credited photos (peak + trek), one without;
 *   - ONE ACTIVE STORY — `expiresAt` about 21 hours after `NOW`;
 *   - ONE EXPIRED STORY — `expiresAt` before `NOW` — so both story renderings
 *     exist on screen (expiry is derived from the app clock, never mutated);
 *   - ONE POST REMOVED BY ICEFALL, reason attached, so the moderation state
 *     renders and `deletePost`'s refusal to delete over it has a real row.
 *
 * The removed post's caption is an invented summit-success figure — the exact
 * class of claim the honesty doctrine exists for, which is WHY Icefall's
 * removal reason names it. The demo world moderating its own demo violation.
 */
export const POSTS: Post[] = [
  {
    // The ACTIVE story — expires ~21 h after NOW (2026-08-28T09:20Z).
    id: "po-l-story-live",
    authorKind: "company",
    authorId: LANTERN,
    caption:
      "Summit morning on Kilimanjaro — our August group reached Uhuru Peak at sunrise. Everyone up, everyone down.",
    media: { source: "peak", mountainId: "kilimanjaro" },
    expiresAt: "2026-08-29T06:20:00.000Z",
    createdAt: "2026-08-28T06:20:00.000Z",
    removedAt: null,
    removedReason: null,
  },
  {
    // The EXPIRED story — created and lapsed before NOW.
    id: "po-l-story-old",
    authorKind: "company",
    authorId: LANTERN,
    caption: "Duffels packed for the Kilimanjaro resupply. The truck leaves Moshi tonight.",
    media: null,
    expiresAt: "2026-08-25T10:00:00.000Z",
    createdAt: "2026-08-24T10:00:00.000Z",
    removedAt: null,
    removedReason: null,
  },
  {
    id: "po-l-turn",
    authorKind: "company",
    authorId: LANTERN,
    caption:
      "The guide calls the turn. It is the first thing we tell every climber and the last thing we repeat at base camp. A summit is optional; coming home is not.",
    media: null,
    expiresAt: null,
    createdAt: "2026-08-20T08:15:00.000Z",
    removedAt: null,
    removedReason: null,
  },
  {
    /*
     * REMOVED BY ICEFALL. The caption asserts a summit-success rate the
     * company has never evidenced — an invented commercial figure, the thing
     * the honesty doctrine forbids on real surfaces — and the moderation
     * record says exactly that. The row survives with its reason: an operator
     * cannot delete over it, so the trail cannot be tidied away.
     */
    id: "po-l-removed",
    authorKind: "company",
    authorId: LANTERN,
    caption: "Nine in ten Lantern Ridge climbers stand on the summit. Join the statistic this autumn.",
    media: null,
    expiresAt: null,
    createdAt: "2026-08-16T09:00:00.000Z",
    removedAt: "2026-08-18T11:00:00.000Z",
    removedReason:
      "Removed by Icefall — the caption states a summit-success figure the company has not evidenced. Post again without the claim, or send Icefall the seasons behind it.",
  },
  {
    // Credited trek photo — the everest-base-camp-trek slug from the catalogue.
    id: "po-l-ebc",
    authorKind: "company",
    authorId: LANTERN,
    caption:
      "Everest Base Camp in October is the mountain at its clearest. Our trekking sirdar walks every group up Kala Patthar at dawn — the true high point of the route at 5,545 m, and the view the whole walk builds to.",
    media: { source: "trek", trekId: "everest-base-camp-trek" },
    expiresAt: null,
    createdAt: "2026-08-14T10:30:00.000Z",
    removedAt: null,
    removedReason: null,
  },
  {
    // Credited peak photo.
    id: "po-l-ama",
    authorKind: "company",
    authorId: LANTERN,
    caption:
      "Autumn on Ama Dablam. Our southwest-ridge team has confirmed its Sherpa crew — the same climbers who fixed our lines last season. Two full rotations before any summit push, as always.",
    media: { source: "peak", mountainId: "ama-dablam" },
    expiresAt: null,
    createdAt: "2026-08-07T09:00:00.000Z",
    removedAt: null,
    removedReason: null,
  },

  /* ---- Coldharbour's — must never appear in Lantern's portal. ------------- */
  {
    id: "po-c-denali",
    authorKind: "company",
    authorId: COLDHARBOUR,
    caption:
      "Denali West Buttress: our June season wrapped with strong weather windows and a full descent log. Next year's dates go to the waitlist first.",
    media: { source: "peak", mountainId: "denali" },
    expiresAt: null,
    createdAt: "2026-08-10T18:00:00.000Z",
    removedAt: null,
    removedReason: null,
  },
];

/**
 * Climbers' comments — DEMO WORLD, names consistent with the seeded leads
 * (the same people who enquired are the people commenting), plus a couple of
 * followers who have not enquired, because most commenters never do. All
 * `PersonAvatar`-compatible display names. No operator write path exists.
 */
export const POST_COMMENTS: PostComment[] = [
  { id: "pc-1", postId: "po-l-ama", authorName: "Priya Raman", body: "Was on your 2024 rope — the crew is the reason I am coming back.", createdAt: "2026-08-07T12:40:00.000Z" },
  { id: "pc-2", postId: "po-l-ama", authorName: "Benjamin Lee", body: "How cold does it get on the ridge in late October?", createdAt: "2026-08-08T09:05:00.000Z" },
  { id: "pc-3", postId: "po-l-ebc", authorName: "Aoife Brennan", body: "Kala Patthar at dawn was the best hour of my year.", createdAt: "2026-08-14T15:20:00.000Z" },
  { id: "pc-4", postId: "po-l-ebc", authorName: "Luis Miguel", body: "Do groups of four get their own sirdar?", createdAt: "2026-08-15T08:10:00.000Z" },
  { id: "pc-5", postId: "po-l-turn", authorName: "Tomás Ferreira", body: "This is why I enquired with you and nobody else.", createdAt: "2026-08-20T19:45:00.000Z" },
  { id: "pc-6", postId: "po-l-turn", authorName: "Grace Otieno", body: "Heard your sirdar say exactly this below the Khumbu Icefall. He meant it.", createdAt: "2026-08-21T07:30:00.000Z" },
  // Coldharbour's — scoped away with its post.
  { id: "pc-x", postId: "po-c-denali", authorName: "Ellis Warren", body: "What does the waitlist look like for early June?", createdAt: "2026-08-11T20:00:00.000Z" },
];

/**
 * S2 `follows` — climbers following a company.
 *
 * THE COUNT IS THE ARITHMETIC. Lantern's follower figure anywhere on screen
 * is `getFollowerCount` counting THESE rows — eighteen of them, spread over
 * the months since the company joined, so the number is real addition over a
 * believable history and never a literal typed into a component. Several
 * followers are the seeded customers themselves (a climber who enquired
 * plausibly follows); the rest never enquired, which is what a following
 * mostly is. Coldharbour's three exist so isolation has something to leak.
 */
export const FOLLOWS: Follow[] = [
  { id: "f-l-1", followerName: "Bruno Kessler", companyId: LANTERN, createdAt: "2026-03-12T10:00:00.000Z" },
  { id: "f-l-2", followerName: "Keiko Tanaka", companyId: LANTERN, createdAt: "2026-03-28T17:25:00.000Z" },
  { id: "f-l-3", followerName: "Jonas Weber", companyId: LANTERN, createdAt: "2026-04-06T08:40:00.000Z" },
  { id: "f-l-4", followerName: "Charlotte Martin", companyId: LANTERN, createdAt: "2026-04-19T12:10:00.000Z" },
  { id: "f-l-5", followerName: "Mikko Salonen", companyId: LANTERN, createdAt: "2026-05-02T21:05:00.000Z" },
  { id: "f-l-6", followerName: "Ines Fontaine", companyId: LANTERN, createdAt: "2026-05-14T09:55:00.000Z" },
  { id: "f-l-7", followerName: "Benjamin Lee", companyId: LANTERN, createdAt: "2026-05-30T16:30:00.000Z" },
  { id: "f-l-8", followerName: "Grace Otieno", companyId: LANTERN, createdAt: "2026-06-08T11:15:00.000Z" },
  { id: "f-l-9", followerName: "Daan Vermeer", companyId: LANTERN, createdAt: "2026-06-17T19:00:00.000Z" },
  { id: "f-l-10", followerName: "Sophie Dubois", companyId: LANTERN, createdAt: "2026-06-29T07:45:00.000Z" },
  { id: "f-l-11", followerName: "Alba Ruiz", companyId: LANTERN, createdAt: "2026-07-05T14:20:00.000Z" },
  { id: "f-l-12", followerName: "Priya Raman", companyId: LANTERN, createdAt: "2026-07-13T10:35:00.000Z" },
  { id: "f-l-13", followerName: "Nils Hagen", companyId: LANTERN, createdAt: "2026-07-22T18:50:00.000Z" },
  { id: "f-l-14", followerName: "Aoife Brennan", companyId: LANTERN, createdAt: "2026-07-31T08:05:00.000Z" },
  { id: "f-l-15", followerName: "Tomás Ferreira", companyId: LANTERN, createdAt: "2026-08-09T13:40:00.000Z" },
  { id: "f-l-16", followerName: "Luis Miguel", companyId: LANTERN, createdAt: "2026-08-17T20:15:00.000Z" },
  { id: "f-l-17", followerName: "Hanne Bakken", companyId: LANTERN, createdAt: "2026-08-24T09:30:00.000Z" },
  { id: "f-l-18", followerName: "Milan Horak", companyId: LANTERN, createdAt: "2026-08-27T22:10:00.000Z" },
  // ---- Coldharbour's --------------------------------------------------------
  { id: "f-c-1", followerName: "Ellis Warren", companyId: COLDHARBOUR, createdAt: "2026-06-02T10:00:00.000Z" },
  { id: "f-c-2", followerName: "Cody Brooks", companyId: COLDHARBOUR, createdAt: "2026-07-11T15:30:00.000Z" },
  { id: "f-c-3", followerName: "June Park", companyId: COLDHARBOUR, createdAt: "2026-08-03T19:20:00.000Z" },
];

/**
 * THE SOCIAL SURFACE'S PROMO-VIDEO SLOT — one per company, and NOT
 * `Company.video`. Decision #15 removed the field from the canonical company
 * record and it stays removed; the OP-01 wording (the later ruling, for this
 * surface) puts the promotional film on the company's social presence
 * instead. See the reconciliation note on `PromoVideoSlot` in `types.ts`.
 *
 * The id is FORMAT-VALID (eleven `[\w-]` characters, exactly what
 * `youtubeIdFrom` yields) and authored for the invented company — pointing at
 * a real production's id would attribute somebody's actual footage to a
 * company that does not exist, the same rule that keeps real logos out of
 * this seed. The click-gated player simply finds no video behind it, which is
 * the honest outcome. Coldharbour has no slot, so the empty state renders
 * beside it.
 */
export const PROMO_VIDEOS: PromoVideoSlot[] = [
  { companyId: LANTERN, video: { source: "youtube", youtubeId: "LanternR21x" } },
];

/* -------------------------------------------------------------------------- */
/* Channels — a company broadcasts, members listen                            */
/* -------------------------------------------------------------------------- */

/**
 * THE MEMBER AND VIEW ROW SHAPES LIVE HERE, NOT IN `types.ts`, AND THAT IS THE
 * POINT.
 *
 * `types.ts` is the vocabulary every screen in this portal shares. A shape
 * carrying "which person is in this channel" or "which person opened this
 * message" must not be in that vocabulary at all, because the company is never
 * allowed to see either — it sees `getChannelMemberCount` (a number) and
 * `getChannelMessageStats` (a number per message). These two interfaces are
 * stand-ins for `channel_members` and `channel_message_views`, tables the
 * company cannot read row-by-row in the real database, so the rows exist ONLY
 * on this side of the seam, purely so the counts above them are arithmetic over
 * something real instead of a literal somebody typed.
 *
 * Note what a member row does NOT have: a name. Not one, anywhere. `Follow`
 * carries `followerName` because a follower count sits beside a public social
 * presence; a channel member joined a private promotional list, and the company
 * has no business knowing who. There is nothing here to render even by
 * accident.
 */
export interface ChannelMemberRow {
  channelId: string;
  profileId: string;
  joinedAt: string;
  /** Muted, not left: quiet without leaving. Mirrors `channel_members.muted`. */
  muted: boolean;
}

/** One person, one message, once — never an incrementing counter. */
export interface ChannelMessageViewRow {
  messageId: string;
  profileId: string;
  viewedAt: string;
}

export const CHANNEL_LANTERN_DISPATCH = "ch-lantern-dispatch";
export const CHANNEL_LANTERN_MONSOON = "ch-lantern-monsoon";
export const CHANNEL_COLDHARBOUR = "ch-coldharbour-dispatch";

/**
 * TWO COMPANIES HAVE CHANNELS AND BOTH ARE INVENTED — Lantern Ridge and
 * Coldharbour, the only companies in this seed. No real business gets a demo
 * channel: a promotional broadcast attributed to a company that exists is an
 * invented commercial claim published in its name, which is the one thing the
 * honesty doctrine forbids outright.
 *
 * Coldharbour's channel is here for the reason Coldharbour is here at all: so
 * "a company cannot read another company's channel" is a test with something
 * real on the other side of it rather than an assertion against an empty set.
 */
export const CHANNELS: Channel[] = [
  {
    id: CHANNEL_LANTERN_DISPATCH,
    companyId: LANTERN,
    name: "Lantern Ridge Dispatch",
    description:
      "Departure news, remaining places and the occasional set of terms worth knowing about, straight from the Kathmandu office.",
    coverPath: null,
    archivedAt: null,
    createdAt: "2026-05-06T09:00:00.000Z",
  },
  {
    /*
     * ARCHIVED, NOT DELETED — the state the whole lifecycle turns on. The
     * monsoon is over, so no new message can be sent here; the 41 people who
     * joined can still read every word the company told them, which is the
     * entire reason there is no delete method anywhere in this app.
     */
    id: CHANNEL_LANTERN_MONSOON,
    companyId: LANTERN,
    name: "Monsoon 2026 — trail conditions",
    description:
      "Daily trail and flight conditions through the 2026 monsoon. Closed for the season.",
    coverPath: null,
    archivedAt: "2026-08-14T06:00:00.000Z",
    createdAt: "2026-06-10T07:30:00.000Z",
  },
  {
    id: CHANNEL_COLDHARBOUR,
    companyId: COLDHARBOUR,
    name: "Coldharbour Range Notes",
    description: "Denali season notes and place releases.",
    coverPath: null,
    archivedAt: null,
    createdAt: "2026-06-24T18:00:00.000Z",
  },
];

/**
 * Members, generated so the count is ADDITION over rows rather than a number
 * typed into a fixture. People join themselves — there is no code path in this
 * portal that creates one of these, because a company cannot add a member.
 *
 * Joining is spread EVENLY BETWEEN TWO STATED DATES rather than stepped by a
 * fixed interval, and the second date is the point: a fixed step silently runs
 * past the end of the world it is describing, and this seed would have had
 * people joining the monsoon channel two days after the app clock and a
 * fortnight after it was archived. Both ends are bounded so a membership can
 * neither predate the channel nor postdate the day it closed.
 *
 * `new Date(ms)` here is ARITHMETIC ON A FIXED LITERAL, not a clock read —
 * every input is a constant in this file, so the seed is identical on every
 * machine. Nothing here calls `new Date()`.
 */
function channelMembers(
  channelId: string,
  prefix: string,
  count: number,
  firstJoinedIso: string,
  lastJoinedIso: string,
): ChannelMemberRow[] {
  const start = Date.parse(firstJoinedIso);
  const step = count > 1 ? (Date.parse(lastJoinedIso) - start) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => ({
    channelId,
    profileId: `pr-${prefix}-${i + 1}`,
    joinedAt: new Date(Math.round(start + i * step)).toISOString(),
    // Roughly one in seven wants the offers without the notifications.
    muted: i % 7 === 3,
  }));
}

const LANTERN_DISPATCH_MEMBERS = channelMembers(
  CHANNEL_LANTERN_DISPATCH,
  "ld",
  48,
  "2026-05-07T10:00:00.000Z",
  // Still gaining members up to the day before the app clock.
  "2026-08-27T18:00:00.000Z",
);
const LANTERN_MONSOON_MEMBERS = channelMembers(
  CHANNEL_LANTERN_MONSOON,
  "lm",
  41,
  "2026-06-11T09:00:00.000Z",
  // Nobody joins after it closed — the last of them the morning it was archived.
  "2026-08-14T04:00:00.000Z",
);
const COLDHARBOUR_MEMBERS = channelMembers(
  CHANNEL_COLDHARBOUR,
  "cd",
  16,
  "2026-06-25T12:00:00.000Z",
  "2026-08-21T09:00:00.000Z",
);

export const CHANNEL_MEMBERS: ChannelMemberRow[] = [
  ...LANTERN_DISPATCH_MEMBERS,
  ...LANTERN_MONSOON_MEMBERS,
  ...COLDHARBOUR_MEMBERS,
];

/**
 * Messages. Every one of them is text plus, sometimes, a PRODUCT PROMOTION —
 * never an offer, and no `promo_note` anywhere states a price. Read the notes
 * on `promoNote`: the figures live on the product, or in an offer made inside a
 * thread where one named climber can accept it.
 *
 * `authorId` is a PROFILE id (`CompanyUser.profileId`), not the company: a
 * company does not press send, a person does, and a promotional claim traces to
 * a human exactly as a post does.
 */
export const CHANNEL_MESSAGES: ChannelMessage[] = [
  /* ---- Lantern Ridge Dispatch, oldest first ------------------------------ */
  {
    id: "cmsg-ld-1",
    channelId: CHANNEL_LANTERN_DISPATCH,
    authorId: "u-ravi",
    authorName: "Ravi Thapa",
    body:
      "Autumn permits are in. Our Khumbu teams are confirmed for October and November, and the office is answering enquiries from six in the morning Kathmandu time.",
    productId: null,
    departureId: null,
    promoNote: null,
    createdAt: "2026-07-28T08:30:00.000Z",
  },
  {
    id: "cmsg-ld-2",
    channelId: CHANNEL_LANTERN_DISPATCH,
    authorId: "u-ravi",
    authorName: "Ravi Thapa",
    body:
      "The November Base Camp trek still has places. Eleven days, two acclimatisation days built in, and the same Sherpa team that walked it in April.",
    productId: "p-everest-base-camp-trek",
    departureId: "d-4",
    // Terms, in the seller's own words. No number, deliberately.
    promoNote: "Deposit held until the end of September for anyone on this channel.",
    createdAt: "2026-08-04T15:05:00.000Z",
  },
  {
    /*
     * THE DUD. Six people out of forty-eight opened it, and it stays in the
     * seed at six. A promotional channel where every message lands is a fake,
     * and an operator who only ever sees good numbers learns nothing from them.
     */
    id: "cmsg-ld-3",
    channelId: CHANNEL_LANTERN_DISPATCH,
    authorId: "u-marta",
    authorName: "Marta Kowalczyk",
    body: "The office is closed on Friday for the public holiday. Enquiries will be answered on Saturday morning.",
    productId: null,
    departureId: null,
    promoNote: null,
    createdAt: "2026-08-12T09:25:00.000Z",
  },
  {
    id: "cmsg-ld-4",
    channelId: CHANNEL_LANTERN_DISPATCH,
    authorId: "u-ravi",
    authorName: "Ravi Thapa",
    body:
      "Ama Dablam, 20 October. Five places left on the south-west ridge with Pemba leading. This is the trip people come back for.",
    productId: "p-ama-dablam-sw-ridge",
    departureId: "d-5",
    promoNote: null,
    createdAt: "2026-08-19T11:40:00.000Z",
  },
  {
    id: "cmsg-ld-5",
    channelId: CHANNEL_LANTERN_DISPATCH,
    authorId: "u-ravi",
    authorName: "Ravi Thapa",
    body:
      "Spring 2027 on the South Col opens for booking this week. Two places on the April departure, and we are keeping teams to six on the summit push as always.",
    productId: "p-everest-south-col",
    departureId: "d-1",
    promoNote: "Places held for seven days from enquiry, no deposit needed to hold one.",
    createdAt: "2026-08-26T07:10:00.000Z",
  },
  {
    /*
     * THE MEASURED ZERO. Sent twenty-five minutes before the app clock, so
     * nobody has opened it yet. The screen renders "0 views" — a counted fact,
     * never a blank and never a dash.
     */
    id: "cmsg-ld-6",
    channelId: CHANNEL_LANTERN_DISPATCH,
    authorId: "u-ravi",
    authorName: "Ravi Thapa",
    body: "Kathmandu flights are running normally again this morning. Anyone travelling this week, your pickup times stand.",
    productId: null,
    departureId: null,
    promoNote: null,
    createdAt: "2026-08-28T08:55:00.000Z",
  },

  /* ---- The archived channel ---------------------------------------------- */
  {
    id: "cmsg-lm-1",
    channelId: CHANNEL_LANTERN_MONSOON,
    authorId: "u-ravi",
    authorName: "Ravi Thapa",
    body: "Lukla is weather-holding again. Two days of cloud forecast, and we are moving nobody until it clears.",
    productId: null,
    departureId: null,
    promoNote: null,
    createdAt: "2026-07-02T05:40:00.000Z",
  },
  {
    id: "cmsg-lm-2",
    channelId: CHANNEL_LANTERN_MONSOON,
    authorId: "u-ravi",
    authorName: "Ravi Thapa",
    body:
      "Trail below Namche is passable again after the landslide. The Thame side is not, and we are not walking it until the district says otherwise.",
    productId: null,
    departureId: null,
    promoNote: null,
    createdAt: "2026-07-21T06:15:00.000Z",
  },
  {
    id: "cmsg-lm-3",
    channelId: CHANNEL_LANTERN_MONSOON,
    authorId: "u-ravi",
    authorName: "Ravi Thapa",
    body:
      "That is the monsoon done. This channel closes today — everything in it stays here to read, and autumn news moves to Lantern Ridge Dispatch.",
    productId: null,
    departureId: null,
    promoNote: null,
    createdAt: "2026-08-14T05:50:00.000Z",
  },

  /* ---- Coldharbour's, for isolation to have a real other side ------------- */
  {
    id: "cmsg-cd-1",
    channelId: CHANNEL_COLDHARBOUR,
    authorId: "u-jo",
    authorName: "Jo Vance",
    body: "The 2027 Denali West Buttress dates are set. Two teams, both in May, both with a rest day built into the Kahiltna carry.",
    productId: "p-coldharbour-denali",
    departureId: null,
    promoNote: null,
    createdAt: "2026-08-06T20:00:00.000Z",
  },
  {
    id: "cmsg-cd-2",
    channelId: CHANNEL_COLDHARBOUR,
    authorId: "u-jo",
    authorName: "Jo Vance",
    body: "Kit list for 2027 has changed — the double boot requirement is now firm. Ask us before you buy anything.",
    productId: null,
    departureId: null,
    promoNote: null,
    createdAt: "2026-08-22T17:30:00.000Z",
  },
];

/**
 * Views: ONE ROW PER PERSON PER MESSAGE, so the number a company reads is
 * distinct people who opened it. That is the shape that can never double-count
 * somebody re-reading, which an incrementing counter always eventually does.
 *
 * The viewers are drawn from that channel's OWN members and nowhere else,
 * because the database will not accept a view from someone who has not joined.
 * A rotating offset gives each message a different, overlapping audience —
 * which is what a real channel looks like, rather than the same keen forty
 * every time.
 */
function channelViews(
  messageId: string,
  members: readonly ChannelMemberRow[],
  count: number,
  offset: number,
  postedAtIso: string,
): ChannelMessageViewRow[] {
  const posted = Date.parse(postedAtIso);
  return Array.from({ length: count }, (_, i) => ({
    messageId,
    profileId: members[(offset + i) % members.length].profileId,
    /*
     * Read over the hours after it landed, never before it was sent — and, as
     * above, arithmetic on a fixed literal rather than a clock read. The widest
     * of these (41 reads at 37-minute spacing) finishes about a day after its
     * message, well inside the app clock.
     */
    viewedAt: new Date(posted + (i + 1) * 37 * 60 * 1000).toISOString(),
  }));
}

export const CHANNEL_MESSAGE_VIEWS: ChannelMessageViewRow[] = [
  // 41 of 48 — the news everyone had been waiting for.
  ...channelViews("cmsg-ld-1", LANTERN_DISPATCH_MEMBERS, 41, 0, "2026-07-28T08:30:00.000Z"),
  // 27 of 48.
  ...channelViews("cmsg-ld-2", LANTERN_DISPATCH_MEMBERS, 27, 5, "2026-08-04T15:05:00.000Z"),
  // 6 of 48 — the office-hours note nobody needed.
  ...channelViews("cmsg-ld-3", LANTERN_DISPATCH_MEMBERS, 6, 19, "2026-08-12T09:25:00.000Z"),
  // 33 of 48.
  ...channelViews("cmsg-ld-4", LANTERN_DISPATCH_MEMBERS, 33, 11, "2026-08-19T11:40:00.000Z"),
  // 12 of 48 — sent two days ago and still being read.
  ...channelViews("cmsg-ld-5", LANTERN_DISPATCH_MEMBERS, 12, 30, "2026-08-26T07:10:00.000Z"),
  // cmsg-ld-6 has NO ROWS. Twenty-five minutes old: a real, measured zero.

  ...channelViews("cmsg-lm-1", LANTERN_MONSOON_MEMBERS, 38, 0, "2026-07-02T05:40:00.000Z"),
  ...channelViews("cmsg-lm-2", LANTERN_MONSOON_MEMBERS, 35, 7, "2026-07-21T06:15:00.000Z"),
  ...channelViews("cmsg-lm-3", LANTERN_MONSOON_MEMBERS, 22, 14, "2026-08-14T05:50:00.000Z"),

  ...channelViews("cmsg-cd-1", COLDHARBOUR_MEMBERS, 13, 0, "2026-08-06T20:00:00.000Z"),
  ...channelViews("cmsg-cd-2", COLDHARBOUR_MEMBERS, 9, 4, "2026-08-22T17:30:00.000Z"),
];

/* -------------------------------------------------------------------------- */
/* THE CRM OPERATING SYSTEM — brief §4, the company's own records             */
/* -------------------------------------------------------------------------- */

/*
 * DEMO WORLD, CONSISTENT WITH THE ROWS ABOVE. Every contact here is a person
 * who already appears as a lead (plus two travelling companions and one
 * Coldharbour customer, so isolation has a real other side). Every proposal
 * is on a lead that is `quoted`; every financial event sits on a booking that
 * already exists, in a state that matches the booking's; every participant is
 * a contact on one of those leads. Nothing below adds a booking, an enquiry or
 * a revenue figure — the dashboard arithmetic above is untouched.
 *
 * NOTHING HERE IS A REAL PERSON, SUPPLIER OR PROVIDER. Emails end in
 * `.example`; phone numbers are format-valid and unassigned; supplier names
 * are invented. No payment provider appears, because none is connected —
 * every received amount below has a PERSON as its source, and the ones a
 * person has only been told about stop at `reported`.
 */

const T = (iso: string) => iso; // a UTC timestamp, written out; a reminder that nothing here reads a clock

export const CONTACTS: Contact[] = [
  { id: "ct-hanne", companyId: LANTERN, firstName: "Hanne", lastName: "Bakken", email: "hanne.bakken@example.no", phone: "+47 400 00 101", country: "Norway", language: "en", consentStatus: "given", marketingConsentAt: T("2026-08-28T08:50:00.000Z"), communicationPreferences: { preferredChannel: "email", doNotContact: false }, createdAt: T("2026-08-28T08:20:00.000Z"), updatedAt: T("2026-08-28T08:50:00.000Z") },
  { id: "ct-tomas", companyId: LANTERN, firstName: "Tomás", lastName: "Ferreira", email: "tomas.ferreira@example.pt", phone: null, country: "Portugal", language: "pt", consentStatus: "not_asked", marketingConsentAt: null, communicationPreferences: { preferredChannel: "message", doNotContact: false }, createdAt: T("2026-08-27T16:20:00.000Z"), updatedAt: T("2026-08-27T16:20:00.000Z") },
  { id: "ct-luis", companyId: LANTERN, firstName: "Luis", lastName: "Miguel", email: "luis.miguel@example.es", phone: "+34 600 000 102", country: "Spain", language: "es", consentStatus: "given", marketingConsentAt: T("2026-08-27T11:30:00.000Z"), communicationPreferences: { preferredChannel: "email", doNotContact: false }, createdAt: T("2026-08-27T09:00:00.000Z"), updatedAt: T("2026-08-27T15:00:00.000Z") },
  { id: "ct-paulo", companyId: LANTERN, firstName: "Paulo", lastName: "Almeida", email: "p.almeida@example.br", phone: null, country: "Brazil", language: "pt", consentStatus: "declined", marketingConsentAt: null, communicationPreferences: { preferredChannel: null, doNotContact: true }, createdAt: T("2026-08-26T11:00:00.000Z"), updatedAt: T("2026-08-27T09:30:00.000Z") },
  { id: "ct-sophie", companyId: LANTERN, firstName: "Sophie", lastName: "Dubois", email: "sophie.dubois@example.fr", phone: "+33 6 00 00 01 03", country: "France", language: "fr", consentStatus: "not_asked", marketingConsentAt: null, communicationPreferences: { preferredChannel: "email", doNotContact: false }, createdAt: T("2026-08-25T15:10:00.000Z"), updatedAt: T("2026-08-25T17:00:00.000Z") },
  { id: "ct-priya", companyId: LANTERN, firstName: "Priya", lastName: "Raman", email: "priya.raman@example.in", phone: "+91 90000 00104", country: "India", language: "en", consentStatus: "given", marketingConsentAt: T("2026-08-25T10:30:00.000Z"), communicationPreferences: { preferredChannel: "email", doNotContact: false }, createdAt: T("2026-08-24T14:00:00.000Z"), updatedAt: T("2026-08-25T15:00:00.000Z") },
  { id: "ct-aoife", companyId: LANTERN, firstName: "Aoife", lastName: "Brennan", email: "aoife.brennan@example.ie", phone: null, country: "Ireland", language: "en", consentStatus: "not_asked", marketingConsentAt: null, communicationPreferences: { preferredChannel: "email", doNotContact: false }, createdAt: T("2026-08-24T09:40:00.000Z"), updatedAt: T("2026-08-26T10:00:00.000Z") },
  { id: "ct-charlotte", companyId: LANTERN, firstName: "Charlotte", lastName: "Martin", email: "charlotte.martin@example.fr", phone: "+33 6 00 00 01 05", country: "France", language: "fr", consentStatus: "given", marketingConsentAt: T("2026-08-20T09:00:00.000Z"), communicationPreferences: { preferredChannel: "phone", doNotContact: false }, createdAt: T("2026-08-18T10:00:00.000Z"), updatedAt: T("2026-08-25T09:00:00.000Z") },
  { id: "ct-benjamin", companyId: LANTERN, firstName: "Benjamin", lastName: "Lee", email: "ben.lee@example.sg", phone: "+65 8000 0106", country: "Singapore", language: "en", consentStatus: "withdrawn", marketingConsentAt: null, communicationPreferences: { preferredChannel: "email", doNotContact: true }, createdAt: T("2026-08-12T10:00:00.000Z"), updatedAt: T("2026-08-24T09:00:00.000Z") },
  // The company's own leads — a referral, a phone call, a walk-in.
  { id: "ct-bruno", companyId: LANTERN, firstName: "Bruno", lastName: "Kessler", email: "bruno.kessler@example.ch", phone: "+41 79 000 01 07", country: "Switzerland", language: "de", consentStatus: "given", marketingConsentAt: T("2026-08-19T09:30:00.000Z"), communicationPreferences: { preferredChannel: "phone", doNotContact: false }, createdAt: T("2026-08-19T09:00:00.000Z"), updatedAt: T("2026-08-21T09:00:00.000Z") },
  { id: "ct-andres", companyId: LANTERN, firstName: "Andrés", lastName: "Pulido", email: null, phone: "+57 300 000 0108", country: "Colombia", language: "es", consentStatus: "not_asked", marketingConsentAt: null, communicationPreferences: { preferredChannel: "phone", doNotContact: false }, createdAt: T("2026-08-23T11:00:00.000Z"), updatedAt: T("2026-08-23T11:20:00.000Z") },
  { id: "ct-ingvild", companyId: LANTERN, firstName: "Ingvild", lastName: "Sæther", email: "ingvild.saether@example.no", phone: null, country: "Norway", language: "no", consentStatus: "given", marketingConsentAt: T("2026-08-27T13:00:00.000Z"), communicationPreferences: { preferredChannel: "email", doNotContact: false }, createdAt: T("2026-08-27T13:00:00.000Z"), updatedAt: T("2026-08-27T13:00:00.000Z") },
  // Bruno's party — contacts with no enquiry of their own, which is what a group mostly is.
  { id: "ct-matthias", companyId: LANTERN, firstName: "Matthias", lastName: "Kessler", email: "matthias.kessler@example.ch", phone: null, country: "Switzerland", language: "de", consentStatus: "not_asked", marketingConsentAt: null, communicationPreferences: { preferredChannel: "email", doNotContact: false }, createdAt: T("2026-08-19T09:10:00.000Z"), updatedAt: T("2026-08-19T09:10:00.000Z") },
  { id: "ct-elena", companyId: LANTERN, firstName: "Elena", lastName: "Kessler", email: "elena.kessler@example.ch", phone: null, country: "Switzerland", language: "de", consentStatus: "not_asked", marketingConsentAt: null, communicationPreferences: { preferredChannel: "email", doNotContact: false }, createdAt: T("2026-08-19T09:10:00.000Z"), updatedAt: T("2026-08-19T09:10:00.000Z") },
  // ---- Coldharbour's — must never appear in Lantern's portal --------------
  { id: "ct-x", companyId: COLDHARBOUR, firstName: "Ellis", lastName: "Warren", email: "ellis.warren@example.com", phone: "+1 907 000 0109", country: "United States", language: "en", consentStatus: "not_asked", marketingConsentAt: null, communicationPreferences: { preferredChannel: "email", doNotContact: false }, createdAt: T("2026-08-26T18:00:00.000Z"), updatedAt: T("2026-08-26T18:00:00.000Z") },
];

export const CONTACT_GROUPS: ContactGroup[] = [
  // Charlotte booked the October Ama Dablam departure; Priya is quoted for the same trip and travels with her.
  { id: "cg-martin", companyId: LANTERN, name: "Martin party — Ama Dablam, October 2026", leaderContactId: "ct-charlotte", memberContactIds: ["ct-charlotte", "ct-priya"] },
  { id: "cg-kessler", companyId: LANTERN, name: "Kessler family — South Col 2027", leaderContactId: "ct-bruno", memberContactIds: ["ct-bruno", "ct-matthias", "ct-elena"] },
];

/**
 * THE TIMELINE. Note the statuses: `received` for what came in, `draft` and
 * `scheduled` for what is going out, and NOTHING `sent` — no provider is
 * connected, so nothing has been sent by this app. Where a person did send
 * something through their own mail it is logged as a `note` about that fact.
 */
export const ACTIVITIES: Activity[] = [
  { id: "ac-1", companyId: LANTERN, contactId: "ct-priya", inquiryId: "l-priya", bookingId: null, type: "email", direction: "inbound", status: "received", subject: "Technical grade for Ama Dablam", bodyOrReference: "Asked what grade to be leading before the SW ridge. Answered in the Icefall thread.", scheduledAt: null, sentAt: null, createdBy: "cu-marta", createdAt: T("2026-08-24T14:05:00.000Z") },
  { id: "ac-2", companyId: LANTERN, contactId: "ct-priya", inquiryId: "l-priya", bookingId: null, type: "note", direction: "internal", status: "received", subject: "Proposal v1 sent by our own mail", bodyOrReference: "PDF of proposal v1 sent from the office mailbox on 25 Aug. Logged here; this app did not send it.", scheduledAt: null, sentAt: null, createdBy: "cu-marta", createdAt: T("2026-08-25T15:10:00.000Z") },
  { id: "ac-3", companyId: LANTERN, contactId: "ct-charlotte", inquiryId: "l-charlotte", bookingId: "bk-charlotte", type: "call", direction: "outbound", status: "scheduled", subject: "Chase insurance certificate", bodyOrReference: "Call before the 15th — certificate still outstanding.", scheduledAt: T("2026-09-02T09:00:00.000Z"), sentAt: null, createdBy: "cu-marta", createdAt: T("2026-08-27T10:00:00.000Z") },
  { id: "ac-4", companyId: LANTERN, contactId: "ct-hanne", inquiryId: "l-hanne", bookingId: "bk-hanne", type: "email", direction: "outbound", status: "draft", subject: "Welcome pack — South Col 2027", bodyOrReference: "Draft welcome pack. To be sent from the office mailbox once Ravi has read it.", scheduledAt: null, sentAt: null, createdBy: "cu-ravi", createdAt: T("2026-08-28T09:00:00.000Z") },
  { id: "ac-5", companyId: LANTERN, contactId: "ct-bruno", inquiryId: "l-own-1", bookingId: null, type: "meeting", direction: "internal", status: "scheduled", subject: "Pricing review — Kessler group", bodyOrReference: null, scheduledAt: T("2026-09-01T14:00:00.000Z"), sentAt: null, createdBy: "cu-ravi", createdAt: T("2026-08-21T09:05:00.000Z") },
  { id: "ac-x", companyId: COLDHARBOUR, contactId: "ct-x", inquiryId: "l-x", bookingId: null, type: "note", direction: "internal", status: "received", subject: "Waitlist", bodyOrReference: "Add to June waitlist.", scheduledAt: null, sentAt: null, createdBy: "cu-jo", createdAt: T("2026-08-26T18:30:00.000Z") },
];

export const SUPPLIERS: Supplier[] = [
  { id: "sup-khumbu", companyId: LANTERN, name: "Khumbu Base Logistics (invented)", type: "ground_handler", country: "Nepal", contactDetails: "Thamel office — ask for the autumn desk. Landline on the contract.", contractReference: "KBL-2026-07", status: "active", createdAt: T("2026-03-10T10:00:00.000Z"), updatedAt: T("2026-08-20T10:00:00.000Z") },
  { id: "sup-dudhkoshi", companyId: LANTERN, name: "Dudh Koshi Air Services (invented)", type: "transport", country: "Nepal", contactDetails: "Charter desk, Kathmandu domestic terminal.", contractReference: null, status: "active", createdAt: T("2026-04-02T10:00:00.000Z"), updatedAt: T("2026-04-02T10:00:00.000Z") },
  { id: "sup-x", companyId: COLDHARBOUR, name: "Kahiltna Ski Charters (invented)", type: "transport", country: "United States", contactDetails: null, contractReference: null, status: "active", createdAt: T("2026-05-20T10:00:00.000Z"), updatedAt: T("2026-05-20T10:00:00.000Z") },
];

/**
 * ONE GUIDE, UNVERIFIED — and staying that way until somebody who may verify
 * does. `qualificationsReference` is where HER claim is filed; the status says
 * nobody has checked it. Astrid is on Lantern's public team list above with the
 * same role, so the two records describe one person consistently.
 */
export const GUIDE_RESOURCES: GuideResource[] = [
  { id: "gr-astrid", companyId: LANTERN, profileIdOrExternalContactId: "ext-astrid-lindqvist", role: "Western guide, 8,000 m", qualificationsReference: "Guide's own statement: IFMGA carnet, copy on file (unverified)", verificationStatus: "not_submitted", insuranceStatus: "requested", availabilityStatus: "not_stated", contactPreferences: "Email first. Satellite messenger only while on the mountain.", createdAt: T("2026-06-14T10:00:00.000Z"), updatedAt: T("2026-08-20T10:00:00.000Z") },
];

export const TASKS: Task[] = [
  { id: "tk-1", companyId: LANTERN, departureId: "d-1", type: "permit", assigneeId: "cu-ravi", supplierId: null, title: "Everest permit application — Department of Tourism", description: "Window opens in January. Passport scans needed first (tk-6).", status: "in_progress", dueAt: T("2027-01-15T00:00:00.000Z"), completedAt: null, createdAt: T("2026-08-12T10:00:00.000Z"), updatedAt: T("2026-08-26T10:00:00.000Z") },
  { id: "tk-2", companyId: LANTERN, departureId: "d-1", type: "guide", assigneeId: "cu-ravi", supplierId: null, title: "Confirm Astrid Lindqvist as western guide, Team A", description: "Verbal yes in June. Written confirmation and insurance certificate still to come.", status: "open", dueAt: T("2026-10-31T00:00:00.000Z"), completedAt: null, createdAt: T("2026-06-14T10:00:00.000Z"), updatedAt: T("2026-06-14T10:00:00.000Z") },
  {
    // THE BLOCKED ONE. Blocked is a state with a reason, written down.
    id: "tk-3", companyId: LANTERN, departureId: "d-5", type: "supplier", assigneeId: "cu-ravi", supplierId: "sup-khumbu", title: "Book base camp cook team for Ama Dablam", description: "Blocked: Khumbu Base Logistics has not issued autumn rates. Chased 19 Aug; no reply.", status: "blocked", dueAt: T("2026-09-20T00:00:00.000Z"), completedAt: null, createdAt: T("2026-08-05T10:00:00.000Z"), updatedAt: T("2026-08-19T12:00:00.000Z"),
  },
  { id: "tk-4", companyId: LANTERN, departureId: "d-5", type: "transport", assigneeId: "cu-marta", supplierId: "sup-dudhkoshi", title: "Lukla flights — 6 clients + 4 crew, 19 October", description: null, status: "open", dueAt: T("2026-09-30T00:00:00.000Z"), completedAt: null, createdAt: T("2026-08-05T10:05:00.000Z"), updatedAt: T("2026-08-05T10:05:00.000Z") },
  { id: "tk-5", companyId: LANTERN, departureId: "d-5", type: "participant_follow_up", assigneeId: "cu-marta", supplierId: null, title: "Charlotte Martin — insurance certificate outstanding", description: "Requested 20 Aug. Not received.", status: "open", dueAt: T("2026-09-15T00:00:00.000Z"), completedAt: null, createdAt: T("2026-08-20T10:00:00.000Z"), updatedAt: T("2026-08-20T10:00:00.000Z") },
  { id: "tk-6", companyId: LANTERN, departureId: "d-1", type: "document", assigneeId: "cu-marta", supplierId: null, title: "Collect passport scans for the 2027 permit", description: "Hanne's received and reviewed.", status: "completed", dueAt: T("2026-08-31T00:00:00.000Z"), completedAt: T("2026-08-28T08:58:00.000Z"), createdAt: T("2026-08-12T10:10:00.000Z"), updatedAt: T("2026-08-28T08:58:00.000Z") },
  { id: "tk-x", companyId: COLDHARBOUR, departureId: null, type: "other", assigneeId: "cu-jo", supplierId: "sup-x", title: "2027 charter block booking", description: null, status: "open", dueAt: null, completedAt: null, createdAt: T("2026-08-22T10:00:00.000Z"), updatedAt: T("2026-08-22T10:00:00.000Z") },
];

export const TRIP_BRIEFS: TripBrief[] = [
  {
    id: "tb-priya",
    companyId: LANTERN,
    inquiryId: "l-priya",
    objectiveId: "ama-dablam",
    preferredDates: { startDay: "2026-10-18", endDay: "2026-11-20" },
    flexibilitySummary: "Can start up to a week later; must be home by 22 November.",
    groupSummary: "Two climbers travelling together (Priya, with Charlotte Martin who has already booked).",
    experienceSummary: "Scottish II/III leading; one previous 6,000 m peak. Her own account, not assessed.",
    operatorAssumptions: "Assumes both climbers join the 20 October departure and share the fixed-rope team.",
    requirementsToConfirm: ["Insurance covering 7,000 m and helicopter evacuation", "Own technical axes or hire", "Passport validity to May 2027"],
    internalNotes: "Comparing us against one other operator; decision expected mid-September.",
    createdBy: "cu-marta",
    createdAt: T("2026-08-25T10:40:00.000Z"),
    updatedAt: T("2026-08-25T10:40:00.000Z"),
  },
];

/*
 * TWO PROPOSALS. `pr-priya` is SENT, approved by Ravi (the founding admin),
 * with two versions: v1 as first sent, v2 with a rest day added and the price
 * unchanged — v1 is superseded BY DERIVATION (lower number), not by any stored
 * flag. `pr-bruno` is a DRAFT with one version and no approval.
 *
 * The money is integer minor units and the split is checked at module load by
 * `assertSplits()` below — a seed that could not pass its own adapter is a
 * future bug, not a seed.
 */
export const PROPOSALS: Proposal[] = [
  {
    id: "pr-priya", companyId: LANTERN, inquiryId: "l-priya", tripBriefId: "tb-priya", status: "sent", currency: "EUR",
    totalMinor: 1_720_000, depositMinor: 344_000, balanceMinor: 1_376_000,
    validUntil: "2026-09-19", cancellationPolicyReference: "Lantern Ridge standard terms 2026 §4",
    createdBy: "cu-marta", approvedBy: "cu-ravi", approvedAt: T("2026-08-25T14:40:00.000Z"),
    createdAt: T("2026-08-25T11:00:00.000Z"), updatedAt: T("2026-08-26T09:15:00.000Z"),
  },
  {
    id: "pr-bruno", companyId: LANTERN, inquiryId: "l-own-1", tripBriefId: null, status: "draft", currency: "EUR",
    totalMinor: 17_400_000, depositMinor: 3_480_000, balanceMinor: 13_920_000,
    validUntil: null, cancellationPolicyReference: "Lantern Ridge standard terms 2026 §4",
    createdBy: "cu-ravi", approvedBy: null, approvedAt: null,
    createdAt: T("2026-08-21T09:00:00.000Z"), updatedAt: T("2026-08-21T09:00:00.000Z"),
  },
];

export const PROPOSAL_VERSIONS: ProposalVersion[] = [
  {
    id: "pv-priya-1", proposalId: "pr-priya", versionNumber: 1,
    itineraryContent: [
      { day: 1, title: "Lukla to Phakding", detail: "Fly in; short walk down the valley." },
      { day: 3, title: "Namche Bazaar", detail: "Acclimatisation." },
      { day: 7, title: "Ama Dablam base camp", detail: "Establish camp; rest." },
      { day: 20, title: "Summit window opens", detail: "Two full rotations completed first." },
    ],
    inclusions: ["Permits", "Base camp", "Fixed rope on the ridge", "Sherpa support 1:1 above camp 1"],
    exclusions: ["International flights", "Personal kit", "Insurance", "Lukla flights"],
    requirements: ["Confident on steep rock and ice", "Comfortable at 6,000 m", "Helicopter-evacuation insurance"],
    pricingSnapshot: {
      id: "q-priya-1",
      lines: [{ label: "Ama Dablam SW Ridge, per climber", amount: 860_000, per: "person" }],
      exclusions: [{ label: "Lukla flights", approxAmount: 40_000 }, { label: "Personal insurance", approxAmount: null }],
      cancellation: { tiers: [{ daysBefore: 60, refundPct: 100 }, { daysBefore: 30, refundPct: 50 }, { daysBefore: 0, refundPct: 0 }], conditionsRefundPct: 100 },
      partySize: 2,
      departureIso: "2026-10-20",
      validUntilIso: "2026-09-19",
    },
    changeSummary: null,
    createdBy: "cu-marta", createdAt: T("2026-08-25T11:00:00.000Z"),
  },
  {
    id: "pv-priya-2", proposalId: "pr-priya", versionNumber: 2,
    itineraryContent: [
      { day: 1, title: "Lukla to Phakding", detail: "Fly in; short walk down the valley." },
      { day: 3, title: "Namche Bazaar", detail: "Acclimatisation." },
      { day: 4, title: "Namche rest day", detail: "Added at the customer's request." },
      { day: 8, title: "Ama Dablam base camp", detail: "Establish camp; rest." },
      { day: 21, title: "Summit window opens", detail: "Two full rotations completed first." },
    ],
    inclusions: ["Permits", "Base camp", "Fixed rope on the ridge", "Sherpa support 1:1 above camp 1"],
    exclusions: ["International flights", "Personal kit", "Insurance", "Lukla flights"],
    requirements: ["Confident on steep rock and ice", "Comfortable at 6,000 m", "Helicopter-evacuation insurance"],
    pricingSnapshot: {
      id: "q-priya-2",
      lines: [{ label: "Ama Dablam SW Ridge, per climber", amount: 860_000, per: "person" }],
      exclusions: [{ label: "Lukla flights", approxAmount: 40_000 }, { label: "Personal insurance", approxAmount: null }],
      cancellation: { tiers: [{ daysBefore: 60, refundPct: 100 }, { daysBefore: 30, refundPct: 50 }, { daysBefore: 0, refundPct: 0 }], conditionsRefundPct: 100 },
      partySize: 2,
      departureIso: "2026-10-20",
      validUntilIso: "2026-09-19",
    },
    changeSummary: "Added a rest day at Namche at the customer's request. Price unchanged.",
    createdBy: "cu-marta", createdAt: T("2026-08-26T09:15:00.000Z"),
  },
  {
    id: "pv-bruno-1", proposalId: "pr-bruno", versionNumber: 1,
    itineraryContent: [],
    inclusions: ["Permits", "Base camp accommodation", "Group equipment", "Oxygen", "Sherpa support"],
    exclusions: ["International flights", "Personal climbing kit", "Summit bonus", "Travel insurance"],
    requirements: ["Previous experience above 7,000 m", "A season of glacier travel with crampons and axe"],
    pricingSnapshot: {
      id: "q-bruno-1",
      lines: [{ label: "Everest — South Col, per climber", amount: 5_800_000, per: "person" }],
      exclusions: [{ label: "Summit bonus for Sherpa team", approxAmount: 150_000 }],
      cancellation: { tiers: [{ daysBefore: 90, refundPct: 100 }, { daysBefore: 45, refundPct: 50 }, { daysBefore: 0, refundPct: 0 }], conditionsRefundPct: 100 },
      partySize: 3,
      departureIso: "2027-04-04",
      validUntilIso: "2026-10-31",
    },
    changeSummary: null,
    createdBy: "cu-ravi", createdAt: T("2026-08-21T09:00:00.000Z"),
  },
];

/*
 * FINANCIAL EVENTS ON THE FOUR EXISTING BOOKINGS, matching their statuses.
 *
 *   bk-hanne     confirmed — quote and deposit issued; deposit CONFIRMED
 *                received by Ravi against a bank reference; balance issued and
 *                not yet due (42 days before 4 April 2027).
 *   bk-luis      confirmed — quote and invoice issued; deposit REPORTED by
 *                Marta on the customer's word. Not confirmed: nobody has seen it.
 *   bk-charlotte pending   — quote and deposit issued. Nothing received.
 *   bk-benjamin  cancelled — quote and deposit both cancelled with the booking.
 *
 * Not one `provider` source. None is connected. Not one `commission_*` row:
 * commission follows a real event, and ICEFALL has raised none.
 */
export const FINANCIAL_EVENTS: FinancialEvent[] = [
  { id: "fe-hanne-1", companyId: LANTERN, bookingId: "bk-hanne", type: "quote", status: "issued", amountMinor: 1_245_000, currency: "EUR", source: { kind: "manual_entry", enteredBy: "cu-ravi" }, externalReference: "LR-Q-2026-041", effectiveAt: T("2026-08-28T08:45:00.000Z"), createdAt: T("2026-08-28T08:45:00.000Z") },
  { id: "fe-hanne-2", companyId: LANTERN, bookingId: "bk-hanne", type: "deposit_due", status: "issued", amountMinor: 249_000, currency: "EUR", source: { kind: "manual_entry", enteredBy: "cu-ravi" }, externalReference: "LR-INV-2026-071", effectiveAt: T("2026-09-11T00:00:00.000Z"), createdAt: T("2026-08-28T08:50:00.000Z") },
  { id: "fe-hanne-3", companyId: LANTERN, bookingId: "bk-hanne", type: "deposit_received", status: "confirmed", amountMinor: 249_000, currency: "EUR", source: { kind: "operator_confirmation", confirmedBy: "cu-ravi" }, externalReference: "Bank ref NOK→EUR 2026-08-28/0412", effectiveAt: T("2026-08-28T08:55:00.000Z"), createdAt: T("2026-08-28T08:56:00.000Z") },
  { id: "fe-hanne-4", companyId: LANTERN, bookingId: "bk-hanne", type: "balance_due", status: "issued", amountMinor: 996_000, currency: "EUR", source: { kind: "manual_entry", enteredBy: "cu-ravi" }, externalReference: null, effectiveAt: T("2027-02-21T00:00:00.000Z"), createdAt: T("2026-08-28T08:56:00.000Z") },

  { id: "fe-luis-1", companyId: LANTERN, bookingId: "bk-luis", type: "quote", status: "issued", amountMinor: 215_000, currency: "EUR", source: { kind: "manual_entry", enteredBy: "cu-marta" }, externalReference: "LR-Q-2026-039", effectiveAt: T("2026-08-27T12:00:00.000Z"), createdAt: T("2026-08-27T12:00:00.000Z") },
  { id: "fe-luis-2", companyId: LANTERN, bookingId: "bk-luis", type: "invoice", status: "issued", amountMinor: 215_000, currency: "EUR", source: { kind: "manual_entry", enteredBy: "cu-marta" }, externalReference: "LR-INV-2026-069", effectiveAt: T("2026-08-27T15:00:00.000Z"), createdAt: T("2026-08-27T15:00:00.000Z") },
  { id: "fe-luis-3", companyId: LANTERN, bookingId: "bk-luis", type: "deposit_due", status: "issued", amountMinor: 43_000, currency: "EUR", source: { kind: "manual_entry", enteredBy: "cu-marta" }, externalReference: "LR-INV-2026-069", effectiveAt: T("2026-09-10T00:00:00.000Z"), createdAt: T("2026-08-27T15:00:00.000Z") },
  // REPORTED, not confirmed: the customer says the transfer went; nobody here has seen it land.
  { id: "fe-luis-4", companyId: LANTERN, bookingId: "bk-luis", type: "deposit_received", status: "reported", amountMinor: 43_000, currency: "EUR", source: { kind: "customer_report", reportedBy: "ct-luis" }, externalReference: null, effectiveAt: T("2026-08-28T07:30:00.000Z"), createdAt: T("2026-08-28T07:35:00.000Z") },

  { id: "fe-charlotte-1", companyId: LANTERN, bookingId: "bk-charlotte", type: "quote", status: "issued", amountMinor: 690_000, currency: "EUR", source: { kind: "manual_entry", enteredBy: "cu-marta" }, externalReference: "LR-Q-2026-036", effectiveAt: T("2026-08-22T09:00:00.000Z"), createdAt: T("2026-08-22T09:00:00.000Z") },
  { id: "fe-charlotte-2", companyId: LANTERN, bookingId: "bk-charlotte", type: "deposit_due", status: "issued", amountMinor: 138_000, currency: "EUR", source: { kind: "manual_entry", enteredBy: "cu-marta" }, externalReference: "LR-INV-2026-066", effectiveAt: T("2026-09-08T00:00:00.000Z"), createdAt: T("2026-08-25T09:05:00.000Z") },

  { id: "fe-benjamin-1", companyId: LANTERN, bookingId: "bk-benjamin", type: "quote", status: "cancelled", amountMinor: 1_245_000, currency: "EUR", source: { kind: "manual_entry", enteredBy: "cu-marta" }, externalReference: "LR-Q-2026-031", effectiveAt: T("2026-08-16T09:00:00.000Z"), createdAt: T("2026-08-16T09:00:00.000Z") },
  { id: "fe-benjamin-2", companyId: LANTERN, bookingId: "bk-benjamin", type: "deposit_due", status: "cancelled", amountMinor: 249_000, currency: "EUR", source: { kind: "manual_entry", enteredBy: "cu-marta" }, externalReference: "LR-INV-2026-058", effectiveAt: T("2026-09-03T00:00:00.000Z"), createdAt: T("2026-08-20T09:05:00.000Z") },
];

/**
 * FOUR PARTICIPANTS, ACROSS THE DERIVED STATES. Each `status` below is what
 * `deriveParticipantStatus` produces from the eight fields — asserted at
 * module load by `assertDerived()`, so the seed cannot state a readiness the
 * rule would not.
 *
 *   pa-hanne      all eight REVIEWED            → ready_for_departure
 *   pa-luis       medical RECEIVED, rest reviewed → ready_for_review
 *   pa-charlotte  several requested/not requested → information_incomplete
 *   pa-bruno      nothing requested, a `lead`     → lead (lifecycle, not derived)
 *
 * "One with a redacted medical field": redaction is PER VIEWER, not per row —
 * every one of these reads `forbidden` in the two sensitive fields to Marta
 * (sales) and reads through to Ravi (admin). pa-luis is the one whose medical
 * field carries a value worth hiding.
 */
export const PARTICIPANTS: Participant[] = [
  { id: "pa-hanne", companyId: LANTERN, contactId: "ct-hanne", inquiryId: "l-hanne", proposalId: null, status: "ready_for_departure", emergencyContactStatus: "reviewed", insuranceStatus: "reviewed", waiverStatus: "reviewed", identityDocumentStatus: "reviewed", experienceInformationStatus: "reviewed", fitnessInformationStatus: "reviewed", medicalInformationStatus: "reviewed", consentStatus: "reviewed", retentionUntil: "2029-06-04", createdAt: T("2026-08-28T08:56:00.000Z"), updatedAt: T("2026-08-28T09:10:00.000Z") },
  { id: "pa-luis", companyId: LANTERN, contactId: "ct-luis", inquiryId: "l-luis", proposalId: null, status: "ready_for_review", emergencyContactStatus: "reviewed", insuranceStatus: "reviewed", waiverStatus: "reviewed", identityDocumentStatus: "reviewed", experienceInformationStatus: "reviewed", fitnessInformationStatus: "reviewed", medicalInformationStatus: "received", consentStatus: "reviewed", retentionUntil: "2028-10-23", createdAt: T("2026-08-27T15:05:00.000Z"), updatedAt: T("2026-08-28T07:00:00.000Z") },
  { id: "pa-charlotte", companyId: LANTERN, contactId: "ct-charlotte", inquiryId: "l-charlotte", proposalId: null, status: "information_incomplete", emergencyContactStatus: "received", insuranceStatus: "requested", waiverStatus: "requested", identityDocumentStatus: "received", experienceInformationStatus: "reviewed", fitnessInformationStatus: "not_requested", medicalInformationStatus: "not_requested", consentStatus: "received", retentionUntil: "2028-11-16", createdAt: T("2026-08-25T09:05:00.000Z"), updatedAt: T("2026-08-25T09:05:00.000Z") },
  { id: "pa-bruno", companyId: LANTERN, contactId: "ct-bruno", inquiryId: "l-own-1", proposalId: "pr-bruno", status: "lead", emergencyContactStatus: "not_requested", insuranceStatus: "not_requested", waiverStatus: "not_requested", identityDocumentStatus: "not_requested", experienceInformationStatus: "not_requested", fitnessInformationStatus: "not_requested", medicalInformationStatus: "not_requested", consentStatus: "not_requested", retentionUntil: null, createdAt: T("2026-08-21T09:00:00.000Z"), updatedAt: T("2026-08-21T09:00:00.000Z") },
  { id: "pa-x", companyId: COLDHARBOUR, contactId: "ct-x", inquiryId: "l-x", proposalId: null, status: "lead", emergencyContactStatus: "not_requested", insuranceStatus: "not_requested", waiverStatus: "not_requested", identityDocumentStatus: "not_requested", experienceInformationStatus: "not_requested", fitnessInformationStatus: "not_requested", medicalInformationStatus: "not_requested", consentStatus: "not_requested", retentionUntil: null, createdAt: T("2026-08-26T18:30:00.000Z"), updatedAt: T("2026-08-26T18:30:00.000Z") },
];

/** Storage references are PATHS IN A PRIVATE STORE, never URLs. */
export const DOCUMENTS: Document[] = [
  { id: "doc-hanne-waiver", companyId: LANTERN, participantId: "pa-hanne", type: "waiver", status: "reviewed", expiresAt: null, storageReference: `${LANTERN}/participants/pa-hanne/waiver-2026-08.pdf`, reviewedBy: "cu-ravi", reviewedAt: T("2026-08-28T09:05:00.000Z"), consentReference: "consent/pa-hanne/2026-08-28", createdAt: T("2026-08-28T08:57:00.000Z"), updatedAt: T("2026-08-28T09:05:00.000Z") },
  { id: "doc-hanne-insurance", companyId: LANTERN, participantId: "pa-hanne", type: "insurance", status: "reviewed", expiresAt: "2027-07-01", storageReference: `${LANTERN}/participants/pa-hanne/insurance-2026.pdf`, reviewedBy: "cu-ravi", reviewedAt: T("2026-08-28T09:06:00.000Z"), consentReference: "consent/pa-hanne/2026-08-28", createdAt: T("2026-08-28T08:57:00.000Z"), updatedAt: T("2026-08-28T09:06:00.000Z") },
  { id: "doc-hanne-passport", companyId: LANTERN, participantId: "pa-hanne", type: "passport", status: "reviewed", expiresAt: "2031-03-14", storageReference: `${LANTERN}/participants/pa-hanne/passport.pdf`, reviewedBy: "cu-marta", reviewedAt: T("2026-08-28T08:58:00.000Z"), consentReference: "consent/pa-hanne/2026-08-28", createdAt: T("2026-08-28T08:57:00.000Z"), updatedAt: T("2026-08-28T08:58:00.000Z") },
  { id: "doc-hanne-medical", companyId: LANTERN, participantId: "pa-hanne", type: "medical_information", status: "reviewed", expiresAt: null, storageReference: `${LANTERN}/participants/pa-hanne/medical-2026-08.pdf`, reviewedBy: "cu-ravi", reviewedAt: T("2026-08-28T09:10:00.000Z"), consentReference: "consent/pa-hanne/2026-08-28", createdAt: T("2026-08-28T08:57:00.000Z"), updatedAt: T("2026-08-28T09:10:00.000Z") },
  { id: "doc-hanne-emergency", companyId: LANTERN, participantId: "pa-hanne", type: "emergency_contact", status: "reviewed", expiresAt: null, storageReference: `${LANTERN}/participants/pa-hanne/emergency-contact.txt`, reviewedBy: "cu-ravi", reviewedAt: T("2026-08-28T09:04:00.000Z"), consentReference: "consent/pa-hanne/2026-08-28", createdAt: T("2026-08-28T08:57:00.000Z"), updatedAt: T("2026-08-28T09:04:00.000Z") },
  // Luis: the medical form has arrived and nobody has read it yet.
  { id: "doc-luis-medical", companyId: LANTERN, participantId: "pa-luis", type: "medical_information", status: "received", expiresAt: null, storageReference: `${LANTERN}/participants/pa-luis/medical-2026-08.pdf`, reviewedBy: null, reviewedAt: null, consentReference: "consent/pa-luis/2026-08-27", createdAt: T("2026-08-28T07:00:00.000Z"), updatedAt: T("2026-08-28T07:00:00.000Z") },
  // Charlotte: requested, not arrived. No storage reference — there is nothing stored.
  { id: "doc-charlotte-insurance", companyId: LANTERN, participantId: "pa-charlotte", type: "insurance", status: "requested", expiresAt: null, storageReference: null, reviewedBy: null, reviewedAt: null, consentReference: null, createdAt: T("2026-08-20T10:00:00.000Z"), updatedAt: T("2026-08-20T10:00:00.000Z") },
  { id: "doc-charlotte-waiver", companyId: LANTERN, participantId: "pa-charlotte", type: "waiver", status: "requested", expiresAt: null, storageReference: null, reviewedBy: null, reviewedAt: null, consentReference: null, createdAt: T("2026-08-20T10:00:00.000Z"), updatedAt: T("2026-08-20T10:00:00.000Z") },
];

/**
 * THREE INTRODUCTIONS ICEFALL RECORDED. `icefallUserId` is the customer id
 * the lead already carries — the same climber, seen from ICEFALL's side. NO
 * BOOKING AND NO COMMISSION ROW FOLLOWS FROM ANY OF THESE: Hanne's booking
 * exists because Lantern recorded it, not because this row implied it.
 */
export const REFERRAL_EVENTS: ReferralEvent[] = [
  { id: "re-1", icefallUserId: "cust-hanne", operatorCompanyId: LANTERN, inquiryId: "l-hanne", sourceSurface: "app:expedition-detail", attributionToken: "att-8c1f-hanne-2026-08-28", consentStatus: "given", createdAt: T("2026-08-28T08:20:00.000Z") },
  { id: "re-2", icefallUserId: "cust-tomas", operatorCompanyId: LANTERN, inquiryId: "l-tomas", sourceSurface: "app:mountain-page", attributionToken: "att-3b7a-tomas-2026-08-27", consentStatus: "given", createdAt: T("2026-08-27T16:20:00.000Z") },
  { id: "re-3", icefallUserId: "cust-priya", operatorCompanyId: LANTERN, inquiryId: "l-priya", sourceSurface: "web:marketplace", attributionToken: "att-51d9-priya-2026-08-24", consentStatus: "not_asked", createdAt: T("2026-08-24T14:00:00.000Z") },
  { id: "re-x", icefallUserId: "cust-x", operatorCompanyId: COLDHARBOUR, inquiryId: "l-x", sourceSurface: "web:mountain-page", attributionToken: "att-9e2c-x-2026-08-26", consentStatus: "given", createdAt: T("2026-08-26T18:00:00.000Z") },
];

/* -------------------------------------------------------------------------- */
/* The audit trail — generated through the same builder the adapter uses      */
/* -------------------------------------------------------------------------- */

let auditSeq = 0;
const seeded = (
  actorId: string,
  entityType: AuditEvent["entityType"],
  entity: { id: string; companyId?: string },
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  createdAt: string,
  companyId: string = entity.companyId ?? LANTERN,
): AuditEvent =>
  buildAuditEvent({ id: `au-seed-${++auditSeq}`, companyId, actorId, entityType, entityId: entity.id, action, before, after, createdAt });

const asRecord = (x: object): Record<string, unknown> => x as Record<string, unknown>;

export const AUDIT_EVENTS: AuditEvent[] = [
  ...CONTACTS.map((c) => seeded(c.companyId === COLDHARBOUR ? "cu-jo" : "cu-marta", "contact", c, "created", null, asRecord(c), c.createdAt)),
  ...CONTACT_GROUPS.map((g) => seeded("cu-marta", "contact_group", g, "created", null, asRecord(g), "2026-08-25T10:45:00.000Z")),
  ...ACTIVITIES.map((a) => seeded(a.createdBy, "activity", a, "created", null, asRecord(a), a.createdAt)),
  ...SUPPLIERS.map((s) => seeded(s.companyId === COLDHARBOUR ? "cu-jo" : "cu-ravi", "supplier", s, "created", null, asRecord(s), s.createdAt)),
  ...GUIDE_RESOURCES.map((g) => seeded("cu-ravi", "guide_resource", g, "created", null, asRecord(g), g.createdAt)),
  ...TASKS.map((t) => seeded(t.companyId === COLDHARBOUR ? "cu-jo" : "cu-ravi", "task", t, "created", null, asRecord(t), t.createdAt)),
  seeded("cu-ravi", "task", TASKS.find((t) => t.id === "tk-3")!, "status_changed", { status: "in_progress" }, { status: "blocked" }, "2026-08-19T12:00:00.000Z"),
  seeded("cu-marta", "task", TASKS.find((t) => t.id === "tk-6")!, "status_changed", { status: "in_progress", completedAt: null }, { status: "completed", completedAt: "2026-08-28T08:58:00.000Z" }, "2026-08-28T08:58:00.000Z"),
  ...TRIP_BRIEFS.map((b) => seeded(b.createdBy, "trip_brief", b, "created", null, asRecord(b), b.createdAt)),
  ...PROPOSALS.map((p) => seeded(p.createdBy, "proposal", p, "created", null, { ...asRecord(p), status: "draft", approvedBy: null, approvedAt: null }, p.createdAt)),
  ...PROPOSAL_VERSIONS.map((v) => seeded(v.createdBy, "proposal_version", { id: v.id, companyId: LANTERN }, "version_created", null, asRecord(v), v.createdAt)),
  seeded("cu-marta", "proposal", PROPOSALS[0]!, "status_changed", { status: "draft" }, { status: "internal_review" }, "2026-08-25T14:30:00.000Z"),
  seeded("cu-ravi", "proposal", PROPOSALS[0]!, "approved", { approvedBy: null, approvedAt: null }, { approvedBy: "cu-ravi", approvedAt: "2026-08-25T14:40:00.000Z" }, "2026-08-25T14:40:00.000Z"),
  seeded("cu-marta", "proposal", PROPOSALS[0]!, "status_changed", { status: "internal_review" }, { status: "sent" }, "2026-08-25T15:00:00.000Z"),
  ...FINANCIAL_EVENTS.map((f) => seeded(f.source.kind === "operator_confirmation" ? f.source.confirmedBy : f.source.kind === "manual_entry" ? f.source.enteredBy : "cu-marta", "financial_event", f, "created", null, asRecord(f), f.createdAt)),
  ...PARTICIPANTS.map((p) => seeded(p.companyId === COLDHARBOUR ? "cu-jo" : "cu-marta", "participant", p, "created", null, asRecord(p), p.createdAt)),
  ...DOCUMENTS.map((d) => seeded("cu-marta", "document", d, "created", null, asRecord(d), d.createdAt)),
  seeded("cu-ravi", "departure", { id: "d-1", companyId: LANTERN }, "operations_updated", { status: undefined, participantIds: undefined }, { status: "planning", participantIds: ["pa-hanne"] }, "2026-08-28T09:00:00.000Z"),
  seeded("cu-ravi", "departure", { id: "d-5", companyId: LANTERN }, "operations_updated", { status: undefined, participantIds: undefined }, { status: "confirmed", participantIds: ["pa-charlotte"] }, "2026-08-25T09:10:00.000Z"),
].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/* -------------------------------------------------------------------------- */
/* Load-time coherence — a seed that fails its own adapter is a future bug    */
/* -------------------------------------------------------------------------- */

function assertSplits(): void {
  for (const p of PROPOSALS) {
    const problem = moneySplitProblem(p.totalMinor, p.depositMinor, p.balanceMinor);
    if (problem) throw new Error(`Seed proposal ${p.id}: ${problem}`);
  }
}

function assertDerived(): void {
  for (const p of PARTICIPANTS) {
    if (p.status === "lead" || p.status === "completed" || p.status === "cancelled") continue;
    const derived = deriveParticipantStatus(informationOf(p));
    if (derived !== p.status) {
      throw new Error(`Seed participant ${p.id} states ${p.status} but its fields derive ${derived}.`);
    }
  }
}

function assertReferences(): void {
  const contactIds = new Set(CONTACTS.map((c) => c.id));
  for (const g of CONTACT_GROUPS) {
    if (!g.memberContactIds.includes(g.leaderContactId)) throw new Error(`Seed group ${g.id}: leader is not a member.`);
    for (const m of g.memberContactIds) if (!contactIds.has(m)) throw new Error(`Seed group ${g.id}: unknown contact ${m}.`);
  }
  for (const l of LEADS) {
    if (l.contactId && !contactIds.has(l.contactId)) throw new Error(`Seed lead ${l.id}: unknown contact ${l.contactId}.`);
  }
  const participantIds = new Set(PARTICIPANTS.map((p) => p.id));
  for (const d of DEPARTURES) {
    for (const id of d.participantIds ?? []) if (!participantIds.has(id)) throw new Error(`Seed departure ${d.id}: unknown participant ${id}.`);
    if (d.capacity != null && (d.participantIds?.length ?? 0) > d.capacity) throw new Error(`Seed departure ${d.id}: roster exceeds capacity.`);
  }
  const bookingIds = new Set(BOOKINGS.map((b) => b.id));
  for (const f of FINANCIAL_EVENTS) {
    if (!bookingIds.has(f.bookingId)) throw new Error(`Seed financial event ${f.id}: unknown booking ${f.bookingId}.`);
    if (f.status === "confirmed" && f.source.kind !== "provider" && f.source.kind !== "operator_confirmation") {
      throw new Error(`Seed financial event ${f.id}: confirmed without a confirming source.`);
    }
  }
  for (const a of ACTIVITIES) if (a.status === "sent") throw new Error(`Seed activity ${a.id}: nothing here can have been sent.`);
  for (const g of GUIDE_RESOURCES) if (g.verificationStatus === "verified") throw new Error(`Seed guide ${g.id}: no one here verifies a guide.`);
}

assertSplits();
assertDerived();
assertReferences();
