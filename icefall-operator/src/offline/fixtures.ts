/**
 * OFFLINE DEMO FIXTURES — sample data, not real.
 *
 * Read by `src/offline/backend.ts` and by nothing else. No production path
 * imports this file, and none ever should: with `VITE_ICEFALL_OFFLINE` unset it
 * is not reachable from the running app at all.
 *
 * EVERY COMPANY, PERSON, TRIP, ENQUIRY AND FIGURE BELOW IS INVENTED. Snow
 * Petrel Expeditions does not exist, its guides do not exist, and no number
 * here was measured by anything. That is the whole reason the offline banner is
 * permanent and non-dismissable: the portal's standing rule is that it never
 * prints a figure Icefall did not measure, and offline it cannot measure
 * anything, so the screen has to say so at all times.
 *
 * NO REAL BUSINESS APPEARS HERE. Not Elite Exped, not any other identifiable
 * operator — rendering a real company decorated with invented leads, prices and
 * bookings is publication of commercial claims that company never made.
 *
 * THE MOUNTAINS ARE REAL, because a mountain is geography and cannot be
 * defamed or misrepresented by an enquiry count attached to a fictional company.
 *
 * THE CLOCK IS PINNED to `domain/dates.ts` (2026-08-28), so every window,
 * delta and "month to date" label lines up with what the screens compute.
 */

import type {
  Booking,
  Company,
  CompanyMountain,
  CompanyUser,
  Conversation,
  ConversationNote,
  ContentVersion,
  Lead,
  LeadNote,
  Message,
  Mountain,
  OperatorNotification,
  Placement,
  Product,
  ProductDeparture,
} from "@/domain/types";

export const CO = "co-snowpetrel";

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

/** The identity the offline demo is signed in as. An admin, so nothing is gated. */
export const DEMO_USER_ID = "cu-sona";

export const USERS: CompanyUser[] = [
  {
    id: DEMO_USER_ID,
    companyId: CO,
    profileId: "u-sona",
    displayName: "Sona Gurung",
    email: "sona@snowpetrel.example",
    role: "admin",
    status: "active",
    invitedBy: null,
    createdAt: "2026-02-18T09:00:00.000Z",
  },
  {
    id: "cu-marek",
    companyId: CO,
    profileId: "u-marek",
    displayName: "Marek Dvořák",
    email: "marek@snowpetrel.example",
    role: "sales",
    status: "active",
    invitedBy: DEMO_USER_ID,
    createdAt: "2026-03-24T09:00:00.000Z",
  },
  {
    id: "cu-ilse",
    companyId: CO,
    profileId: "u-ilse",
    displayName: "Ilse Brandt",
    email: "ilse@snowpetrel.example",
    role: "sales",
    status: "active",
    invitedBy: DEMO_USER_ID,
    createdAt: "2026-05-06T09:00:00.000Z",
  },
  {
    // Retained, not deleted: a disabled operator keeps their history so the
    // company's own commercial record survives them leaving.
    id: "cu-tobias",
    companyId: CO,
    profileId: "u-tobias",
    displayName: "Tobias Renner",
    email: "tobias@snowpetrel.example",
    role: "sales",
    status: "disabled",
    invitedBy: DEMO_USER_ID,
    createdAt: "2026-03-24T09:00:00.000Z",
  },
  {
    id: "cu-yuki",
    companyId: CO,
    profileId: "u-yuki",
    displayName: "Yuki Tanabe",
    email: "yuki@snowpetrel.example",
    role: "sales",
    status: "invited",
    invitedBy: DEMO_USER_ID,
    createdAt: "2026-08-24T09:00:00.000Z",
  },
];

/* -------------------------------------------------------------------------- */
/* The company                                                                */
/* -------------------------------------------------------------------------- */

export const COMPANY: Company = {
  id: CO,
  name: "Snow Petrel Expeditions",
  slug: "snow-petrel-expeditions",
  status: "active",
  /**
   * NULL, and it stays null. No mark has been invented and dropped into the
   * repo for a company that does not exist; every surface that draws a logo
   * falls through to the initials it was designed to fall through to.
   */
  logoMediaId: null,
  tagline: "Khumbu and the Western Alps, eighteen seasons",
  description:
    "A small high-altitude operator running the Khumbu in spring and autumn, Kilimanjaro in the dry months and the Western Alps through the summer, with the same guiding team returning to each range season after season.",
  about:
    "Snow Petrel began when three guides who had spent a decade working other people's expeditions decided to run them at half the size. Six climbers to a team, two full acclimatisation rotations before any summit push, and a turn-around call that belongs to the guide on the mountain rather than to anyone in an office.",
  city: "Kathmandu",
  country: "Nepal",
  certifications: [
    { mark: "NMA", note: "Member", full: "Nepal Mountaineering Association" },
    { mark: "TAAN", note: "Member", full: "Trekking Agencies' Association of Nepal" },
    { mark: "WFR", note: "All guides current", full: "Wilderness First Responder" },
  ],
  team: [
    { name: "Sona Gurung", role: "Founder, expedition leader" },
    { name: "Marek Dvořák", role: "Alpine guide, Western Alps" },
    { name: "Pasang Lhamu Sherpa", role: "Climbing sirdar, 8,000 m" },
    { name: "Ilse Brandt", role: "Base camp manager" },
  ],
  faq: [
    {
      q: "What experience do I need before the South Col?",
      a: "One season above 7,000 m, and a winter of glacier travel with crampons and axe. We would rather talk you onto a different trip this year than have you turn round at Camp 3.",
    },
    {
      q: "What happens if the guide turns the team around?",
      a: "The decision on the mountain is final and it is never negotiated over the radio. Ask us before you pay what is refunded and what is not — the answer is written down and we will send it to you.",
    },
    {
      q: "How large are the teams?",
      a: "Six climbers on a summit push, and never more. Above the South Col it is one guide to one climber.",
    },
  ],
  whyChooseUs: [
    { label: "Eighteen Khumbu seasons", detail: "The same guides and Sherpa team return to these mountains every year." },
    { label: "Teams of six", detail: "Six climbers to a rope team on the summit push, and never more than that." },
    { label: "Two full rotations", detail: "Longer acclimatisation than the standard programme, before any summit attempt." },
    { label: "The guide calls the turn", detail: "Turn-around decisions belong to the guide on the ground, not to an office." },
  ],
  foundedYear: 2008,
  languages: ["English", "Nepali", "German", "Czech"],
  bannerMediaId: null,
  /**
   * NULL, deliberately. No document check has been recorded, so the profile
   * shows nothing rather than a date nobody performed.
   */
  documentsCheckedAt: null,
  createdAt: "2026-02-18T09:00:00.000Z",
  updatedAt: "2026-08-27T08:40:00.000Z",
};

/* -------------------------------------------------------------------------- */
/* Mountains, access and the paid slots                                       */
/* -------------------------------------------------------------------------- */

export const MOUNTAINS: Mountain[] = [
  { id: "everest", name: "Mount Everest", elevationM: 8849, range: "Mahalangur Himal", country: "Nepal / China", region: "Himalaya & Asia" },
  { id: "ama-dablam", name: "Ama Dablam", elevationM: 6812, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia" },
  { id: "cho-oyu", name: "Cho Oyu", elevationM: 8188, range: "Mahalangur Himal", country: "Nepal / China", region: "Himalaya & Asia" },
  { id: "kilimanjaro", name: "Kilimanjaro", elevationM: 5895, range: "Eastern Rift", country: "Tanzania", region: "Africa" },
  { id: "mont-blanc", name: "Mont Blanc", elevationM: 4805, range: "Mont Blanc Massif", country: "France", region: "Alps & Europe" },
  { id: "aconcagua", name: "Aconcagua", elevationM: 6961, range: "Andes", country: "Argentina", region: "Americas" },
];

export const ACCESS: CompanyMountain[] = [
  { id: "cm-everest", companyId: CO, mountainId: "everest", status: "active", assignedAt: "2026-02-20T11:00:00.000Z" },
  { id: "cm-ama-dablam", companyId: CO, mountainId: "ama-dablam", status: "active", assignedAt: "2026-03-11T11:00:00.000Z" },
  { id: "cm-cho-oyu", companyId: CO, mountainId: "cho-oyu", status: "active", assignedAt: "2026-06-02T11:00:00.000Z" },
  { id: "cm-kilimanjaro", companyId: CO, mountainId: "kilimanjaro", status: "active", assignedAt: "2026-07-09T11:00:00.000Z" },
  { id: "cm-mont-blanc", companyId: CO, mountainId: "mont-blanc", status: "active", assignedAt: "2026-04-15T11:00:00.000Z" },
];

export const PLACEMENTS: Placement[] = [
  // Close enough to lapsing that the renewal conversation is due — the screen
  // says so and offers no way to change the position, which Icefall decides.
  { id: "pl-everest", companyId: CO, mountainId: "everest", slotPosition: 2, startsOn: "2026-06-01", endsOn: "2026-09-20", status: "active", priceCents: null, currency: "EUR" },
  { id: "pl-ama-dablam", companyId: CO, mountainId: "ama-dablam", slotPosition: 1, startsOn: "2026-05-01", endsOn: "2027-04-30", status: "active", priceCents: null, currency: "EUR" },
  // Already lapsed. The products stay exactly where they were: an expiry raises
  // a reminder for a human and never reorders a mountain.
  { id: "pl-mont-blanc", companyId: CO, mountainId: "mont-blanc", slotPosition: 3, startsOn: "2026-05-01", endsOn: "2026-08-15", status: "active", priceCents: null, currency: "EUR" },
];

/* -------------------------------------------------------------------------- */
/* The catalogue                                                              */
/* -------------------------------------------------------------------------- */

export const PRODUCTS: Product[] = [
  {
    id: "p-everest-south-col",
    companyId: CO,
    kind: "expedition",
    name: "Everest — South Col",
    slug: "everest-south-col",
    status: "live",
    description:
      "A full-season South Col expedition with a long acclimatisation programme, teams of six, and one guide to one climber above the South Col.",
    durationDays: 62,
    difficulty: "Extreme — previous 8,000 m experience expected",
    maxAltitudeM: 8849,
    priceFromCents: 5_900_000,
    priceToCents: 6_500_000,
    currency: "EUR",
    seasonality: "April – May",
    itinerary: [
      { day: 1, title: "Kathmandu", detail: "Arrival, kit check and permit briefing. Two nights in the city." },
      { day: 3, title: "Lukla to Phakding", detail: "Fly in at first light and walk down the valley to Phakding." },
      { day: 6, title: "Namche Bazaar", detail: "Two nights. Acclimatisation walk to Everest View and back." },
      { day: 12, title: "Base Camp", detail: "Arrive, settle the tents, rest days before the first rotation." },
      { day: 24, title: "First rotation", detail: "Icefall to Camp 1, one night, then Camp 2 and back down." },
      { day: 38, title: "Second rotation", detail: "Camp 2 to Camp 3 on oxygen, then a full rest at Base Camp." },
      { day: 52, title: "Summit window", detail: "The push, when the forecast and the guide agree. Never before." },
      { day: 62, title: "Kathmandu", detail: "Walk out to Lukla, fly to the city, debrief and dinner." },
    ],
    equipment: ["8,000 m down suit", "Double boots", "Harness and jumar", "Personal oxygen mask", "Two head torches"],
    inclusions: ["Permits", "Base camp accommodation", "Group equipment", "Oxygen", "Sherpa support", "Internal flights"],
    exclusions: ["International flights", "Personal climbing kit", "Summit bonus", "Travel insurance"],
    faq: [
      { q: "How many people on a summit push?", a: "Six climbers, and one guide to one climber above the South Col." },
      { q: "How much oxygen is included?", a: "Seven bottles per climber, plus the reserve the team carries and never counts against you." },
    ],
    mountainIds: ["everest"],
    archivedAt: null,
    createdAt: "2026-02-20T10:00:00.000Z",
    updatedAt: "2026-08-14T10:00:00.000Z",
  },
  {
    id: "p-cho-oyu-nw",
    companyId: CO,
    kind: "expedition",
    name: "Cho Oyu — North West Ridge",
    slug: "cho-oyu-north-west-ridge",
    status: "live",
    description:
      "Five weeks on the most approachable of the eight-thousanders, run as a preparation season for climbers with Everest in mind.",
    durationDays: 34,
    difficulty: "Serious altitude, moderate technical ground",
    maxAltitudeM: 8188,
    priceFromCents: 3_100_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "September – October",
    itinerary: [
      { day: 1, title: "Kathmandu", detail: "Kit check and the border permit briefing." },
      { day: 5, title: "Tingri", detail: "Two nights at 4,300 m before the walk in." },
      { day: 9, title: "Advanced Base Camp", detail: "Yaks carry to ABC. Rest, then the first carry." },
      { day: 21, title: "Rotation", detail: "Camp 1 and Camp 2, two nights, then all the way down." },
      { day: 30, title: "Summit window", detail: "Weather-dependent. The team waits rather than pushes." },
    ],
    equipment: ["8,000 m down suit", "Double boots", "Harness", "Personal oxygen mask"],
    inclusions: ["Permits", "ABC accommodation", "Group equipment", "Oxygen", "Sherpa support"],
    exclusions: ["International flights", "Personal climbing kit", "Travel insurance"],
    faq: [],
    mountainIds: ["cho-oyu"],
    archivedAt: null,
    createdAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
  },
  {
    id: "p-ama-dablam-sw",
    companyId: CO,
    kind: "expedition",
    name: "Ama Dablam — South West Ridge",
    slug: "ama-dablam-south-west-ridge",
    status: "live",
    description:
      "Four weeks on one of the most photographed ridgelines in Nepal. Steep rock and ice above Camp 1, and a hanging camp at the Yellow Tower.",
    durationDays: 28,
    difficulty: "Confident on steep rock and ice, comfortable at 6,000 m",
    maxAltitudeM: 6812,
    priceFromCents: 880_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "October – November",
    itinerary: [
      { day: 1, title: "Kathmandu", detail: "Arrival and kit check." },
      { day: 4, title: "Namche Bazaar", detail: "Acclimatisation day and the walk up to Khumjung." },
      { day: 9, title: "Base Camp", detail: "Settle in below the ridge. Skills days on the moraine." },
      { day: 16, title: "Camp 1", detail: "Carry and sleep. The ridge proper starts above." },
      { day: 22, title: "Summit push", detail: "Camp 2 to the summit and back to Base Camp in a long day." },
    ],
    equipment: ["Technical axes", "Harness and two ascenders", "Approach shoes", "Warm belay jacket"],
    inclusions: ["Permits", "Base camp", "Fixed rope on the ridge", "Sherpa support"],
    exclusions: ["International flights", "Personal climbing kit", "Travel insurance"],
    faq: [{ q: "What grade should I be leading?", a: "Scottish II/III, and comfortable seconding steeper ground with a pack on." }],
    mountainIds: ["ama-dablam"],
    archivedAt: null,
    createdAt: "2026-03-12T10:00:00.000Z",
    updatedAt: "2026-08-26T16:10:00.000Z",
  },
  {
    id: "p-mont-blanc-gouter",
    companyId: CO,
    kind: "expedition",
    name: "Mont Blanc — Goûter Route",
    slug: "mont-blanc-gouter-route",
    status: "live",
    description:
      "Six days in Chamonix: two acclimatisation summits, a night at the Goûter hut and the summit day, run two climbers to a guide.",
    durationDays: 6,
    difficulty: "Fit hill walkers with a season of crampon work",
    maxAltitudeM: 4805,
    priceFromCents: 245_000,
    priceToCents: 285_000,
    currency: "EUR",
    seasonality: "June – September",
    itinerary: [
      { day: 1, title: "Chamonix", detail: "Kit check and the walk up to the Plan de l'Aiguille." },
      { day: 2, title: "Skills day", detail: "Crampons, axe and rope work on the Mer de Glace." },
      { day: 3, title: "Gran Paradiso", detail: "Acclimatisation summit at 4,061 m." },
      { day: 5, title: "Goûter hut", detail: "Tramway, the Grand Couloir and an early night." },
      { day: 6, title: "Summit day", detail: "Two in the morning start, summit and down to Chamonix." },
    ],
    equipment: ["Crampons", "Ice axe", "Harness", "Helmet", "Warm layers"],
    inclusions: ["Hut nights and meals", "Guiding at 2:1", "Tramway tickets", "Group equipment"],
    exclusions: ["Travel to Chamonix", "Personal kit hire", "Travel insurance"],
    faq: [],
    mountainIds: ["mont-blanc"],
    archivedAt: null,
    createdAt: "2026-04-16T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z",
  },
  {
    id: "p-kilimanjaro-machame",
    companyId: CO,
    kind: "expedition",
    name: "Kilimanjaro — Machame Route",
    slug: "kilimanjaro-machame",
    status: "draft",
    description: "Eight days up the Machame route with an extra night at Karanga and a Barafu summit night.",
    durationDays: 8,
    difficulty: "Strenuous walking at altitude, no technical ground",
    maxAltitudeM: 5895,
    priceFromCents: 250_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "January – March, June – October",
    itinerary: [
      { day: 1, title: "Machame Gate", detail: "Registration and the walk into the forest." },
      { day: 3, title: "Shira Plateau", detail: "Out of the trees and onto the plateau." },
      { day: 6, title: "Barafu", detail: "Rest afternoon before a midnight start." },
    ],
    equipment: ["Four-season sleeping bag", "Broken-in boots", "Down jacket", "Two litre water capacity"],
    inclusions: ["Park fees", "Camping equipment", "Guide and porters", "All meals on the mountain"],
    exclusions: ["International flights", "Tips", "Travel insurance"],
    faq: [],
    mountainIds: ["kilimanjaro"],
    archivedAt: null,
    createdAt: "2026-07-12T10:00:00.000Z",
    updatedAt: "2026-08-19T10:00:00.000Z",
  },
  {
    id: "p-ebc-trek",
    companyId: CO,
    kind: "trek",
    name: "Everest Base Camp Trek — 14 Days",
    slug: "everest-base-camp-trek",
    status: "live",
    description: "The classic walk to Base Camp, paced for acclimatisation with two nights at Namche and two at Dingboche.",
    durationDays: 14,
    difficulty: "Demanding walking, no technical ground",
    maxAltitudeM: 5545,
    priceFromCents: 295_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "March – May, October – November",
    itinerary: [
      { day: 1, title: "Lukla", detail: "Fly in and walk down the valley to Phakding." },
      { day: 3, title: "Namche Bazaar", detail: "Two nights. The market and the walk to Everest View." },
      { day: 7, title: "Dingboche", detail: "Two nights, with the acclimatisation walk up Nangkartshang." },
      { day: 10, title: "Gorak Shep", detail: "Base Camp out and back in the afternoon." },
      { day: 11, title: "Kala Patthar", detail: "Dawn on the viewpoint at 5,545 m, then down the valley." },
      { day: 14, title: "Kathmandu", detail: "Fly out from Lukla, last night in the city." },
    ],
    equipment: ["Four-season sleeping bag", "Broken-in boots", "Down jacket", "Poles"],
    inclusions: ["Teahouse accommodation", "Permits", "Guide and porters", "All meals on the trek"],
    exclusions: ["International flights", "Lukla flights", "Travel insurance"],
    faq: [{ q: "How heavy is my pack?", a: "A day pack. Porters carry up to twelve kilos of your kit between teahouses." }],
    mountainIds: ["everest"],
    archivedAt: null,
    createdAt: "2026-02-25T10:00:00.000Z",
    updatedAt: "2026-08-21T09:15:00.000Z",
  },
  {
    id: "p-three-passes-trek",
    companyId: CO,
    kind: "trek",
    name: "Everest Three Passes Trek — 18 Days",
    slug: "everest-three-passes-trek",
    status: "live",
    description: "Kongma La, Cho La and Renjo La in one circuit of the upper Khumbu, with Gokyo on the way round.",
    durationDays: 18,
    difficulty: "Sustained, long days above 5,000 m",
    maxAltitudeM: 5535,
    priceFromCents: 355_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "March – May, October – November",
    itinerary: [
      { day: 1, title: "Lukla", detail: "Fly in, walk to Phakding." },
      { day: 6, title: "Chhukhung", detail: "The staging post before the first pass." },
      { day: 8, title: "Kongma La", detail: "5,535 m, the highest of the three, then down to Lobuche." },
      { day: 12, title: "Cho La", detail: "Early start on the glacier side, down to Dragnag." },
      { day: 15, title: "Renjo La", detail: "The best view of the three, then Thame and down." },
    ],
    equipment: ["Four-season sleeping bag", "Microspikes", "Down jacket", "Poles"],
    inclusions: ["Teahouse accommodation", "Permits", "Guide and porters"],
    exclusions: ["International flights", "Lukla flights", "Travel insurance"],
    faq: [],
    mountainIds: ["everest"],
    archivedAt: null,
    createdAt: "2026-02-25T10:00:00.000Z",
    updatedAt: "2026-07-30T10:00:00.000Z",
  },
  {
    id: "p-gokyo-lakes-trek",
    companyId: CO,
    kind: "trek",
    name: "Gokyo Lakes Trek — 13 Days",
    slug: "gokyo-lakes-trek",
    status: "live",
    description: "The quieter valley: six lakes, the Ngozumpa glacier and Gokyo Ri at dawn.",
    durationDays: 13,
    difficulty: "Demanding walking, no technical ground",
    maxAltitudeM: 5357,
    priceFromCents: 285_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "March – May, October – November",
    itinerary: [
      { day: 1, title: "Lukla", detail: "Fly in and walk to Phakding." },
      { day: 5, title: "Dole", detail: "Up the Gokyo valley, away from the Base Camp traffic." },
      { day: 8, title: "Gokyo Ri", detail: "Dawn on the summit at 5,357 m, four eight-thousanders from one spot." },
      { day: 13, title: "Kathmandu", detail: "Out through Namche and Lukla." },
    ],
    equipment: ["Four-season sleeping bag", "Broken-in boots", "Down jacket"],
    inclusions: ["Teahouse accommodation", "Permits", "Guide and porters"],
    exclusions: ["International flights", "Lukla flights", "Travel insurance"],
    faq: [],
    mountainIds: ["everest"],
    archivedAt: null,
    createdAt: "2026-05-19T10:00:00.000Z",
    updatedAt: "2026-08-11T10:00:00.000Z",
  },
  {
    id: "p-tour-du-mont-blanc",
    companyId: CO,
    kind: "trek",
    name: "Tour du Mont Blanc — 10 Days",
    slug: "tour-du-mont-blanc",
    status: "pending_review",
    description: "The circuit through France, Italy and Switzerland, walked in ten days with bags moved between refuges.",
    durationDays: 10,
    difficulty: "Long walking days, big daily ascent",
    maxAltitudeM: 2665,
    priceFromCents: 215_000,
    priceToCents: null,
    currency: "EUR",
    seasonality: "June – September",
    itinerary: [
      { day: 1, title: "Les Houches", detail: "Kit check and the first col." },
      { day: 4, title: "Courmayeur", detail: "Into Italy over the Col de la Seigne." },
      { day: 8, title: "Champex", detail: "The Swiss side and the Fenêtre d'Arpette." },
    ],
    equipment: ["Walking boots", "Poles", "Light waterproofs"],
    inclusions: ["Refuge nights", "Bag transfers", "Guide", "Half board"],
    exclusions: ["Travel to Chamonix", "Lunches", "Travel insurance"],
    faq: [],
    mountainIds: ["mont-blanc"],
    archivedAt: null,
    createdAt: "2026-08-06T10:00:00.000Z",
    updatedAt: "2026-08-24T10:00:00.000Z",
  },
];

export const DEPARTURES: ProductDeparture[] = [
  { id: "d-sc-1", productId: "p-everest-south-col", departureDate: "2027-04-03", endDate: "2027-06-03", availability: "limited", spotsTotal: 6, spotsLeft: 2, priceCents: 5_900_000 },
  { id: "d-sc-2", productId: "p-everest-south-col", departureDate: "2028-04-01", endDate: "2028-06-01", availability: "available", spotsTotal: 6, spotsLeft: 6, priceCents: 6_300_000 },
  { id: "d-co-1", productId: "p-cho-oyu-nw", departureDate: "2026-09-08", endDate: "2026-10-11", availability: "full", spotsTotal: 8, spotsLeft: 0, priceCents: 3_100_000 },
  { id: "d-co-2", productId: "p-cho-oyu-nw", departureDate: "2027-09-07", endDate: "2027-10-10", availability: "available", spotsTotal: 8, spotsLeft: 8, priceCents: 3_250_000 },
  { id: "d-ad-1", productId: "p-ama-dablam-sw", departureDate: "2026-10-18", endDate: "2026-11-14", availability: "limited", spotsTotal: 6, spotsLeft: 1, priceCents: 880_000 },
  { id: "d-ad-2", productId: "p-ama-dablam-sw", departureDate: "2027-10-17", endDate: "2027-11-13", availability: "available", spotsTotal: 6, spotsLeft: 5, priceCents: 920_000 },
  { id: "d-mb-1", productId: "p-mont-blanc-gouter", departureDate: "2026-09-05", endDate: "2026-09-10", availability: "limited", spotsTotal: 4, spotsLeft: 1, priceCents: 245_000 },
  { id: "d-mb-2", productId: "p-mont-blanc-gouter", departureDate: "2027-06-19", endDate: "2027-06-24", availability: "available", spotsTotal: 4, spotsLeft: 4, priceCents: 265_000 },
  { id: "d-ki-1", productId: "p-kilimanjaro-machame", departureDate: "2027-01-16", endDate: "2027-01-23", availability: "available", spotsTotal: 12, spotsLeft: 12, priceCents: 250_000 },
  { id: "d-eb-1", productId: "p-ebc-trek", departureDate: "2026-10-10", endDate: "2026-10-23", availability: "full", spotsTotal: 12, spotsLeft: 0, priceCents: 295_000 },
  { id: "d-eb-2", productId: "p-ebc-trek", departureDate: "2026-11-07", endDate: "2026-11-20", availability: "limited", spotsTotal: 12, spotsLeft: 3, priceCents: 295_000 },
  { id: "d-eb-3", productId: "p-ebc-trek", departureDate: "2027-03-20", endDate: "2027-04-02", availability: "available", spotsTotal: 12, spotsLeft: 11, priceCents: 310_000 },
  { id: "d-tp-1", productId: "p-three-passes-trek", departureDate: "2026-10-04", endDate: "2026-10-21", availability: "limited", spotsTotal: 10, spotsLeft: 4, priceCents: 355_000 },
  { id: "d-tp-2", productId: "p-three-passes-trek", departureDate: "2027-04-10", endDate: "2027-04-27", availability: "available", spotsTotal: 10, spotsLeft: 10, priceCents: 355_000 },
  { id: "d-gk-1", productId: "p-gokyo-lakes-trek", departureDate: "2026-10-25", endDate: "2026-11-06", availability: "available", spotsTotal: 10, spotsLeft: 7, priceCents: 285_000 },
  { id: "d-tm-1", productId: "p-tour-du-mont-blanc", departureDate: "2027-07-03", endDate: "2027-07-12", availability: "available", spotsTotal: 8, spotsLeft: 8, priceCents: 215_000 },
];

/* -------------------------------------------------------------------------- */
/* The publication boundary                                                   */
/* -------------------------------------------------------------------------- */

export const VERSIONS: ContentVersion[] = [
  {
    id: "cv-company-1",
    entityType: "company",
    entityId: CO,
    companyId: CO,
    baseSnapshot: { about: COMPANY.about },
    changedFields: ["about"],
    flags: [],
    payload: {
      about:
        "Snow Petrel began when three guides who had spent a decade working other people's expeditions decided to run them at half the size. Six climbers to a team, two full acclimatisation rotations before any summit push, and a turn-around call that belongs to the guide on the mountain. We now run four seasons a year across Nepal, Tanzania and the Alps, with the same guiding team returning to each.",
    },
    state: "pending",
    submittedBy: DEMO_USER_ID,
    submittedAt: "2026-08-27T08:40:00.000Z",
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    createdAt: "2026-08-26T17:02:00.000Z",
    updatedAt: "2026-08-27T08:40:00.000Z",
  },
  {
    id: "cv-ama-1",
    entityType: "product",
    entityId: "p-ama-dablam-sw",
    companyId: CO,
    baseSnapshot: { priceFromCents: 880_000 },
    changedFields: ["priceFromCents"],
    flags: [],
    payload: { priceFromCents: 910_000 },
    state: "pending",
    submittedBy: DEMO_USER_ID,
    submittedAt: "2026-08-26T16:10:00.000Z",
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    createdAt: "2026-08-26T15:40:00.000Z",
    updatedAt: "2026-08-26T16:10:00.000Z",
  },
  {
    // Refused, and the reason is the sentence the operator reads. Contact
    // details in public copy take the booking outside Icefall and the company
    // loses the attribution along with us.
    id: "cv-ebc-1",
    entityType: "product",
    entityId: "p-ebc-trek",
    companyId: CO,
    baseSnapshot: { description: "The classic walk to Base Camp, paced for acclimatisation with two nights at Namche and two at Dingboche." },
    changedFields: ["description"],
    flags: ["possible_contact_details"],
    payload: {
      description:
        "The classic walk to Base Camp, paced for acclimatisation. Questions? Message us on +977 98 7654 3210 or book direct at snowpetrel.example.",
    },
    state: "rejected",
    submittedBy: "cu-marek",
    submittedAt: "2026-08-20T11:00:00.000Z",
    decidedBy: "icefall-staff",
    decidedAt: "2026-08-21T09:15:00.000Z",
    decisionReason:
      "The description carries a phone number and a direct booking link. Customer enquiries need to stay inside Icefall so your bookings remain attributed to you — please resubmit without them. Everything else in this edit was fine.",
    createdAt: "2026-08-20T10:30:00.000Z",
    updatedAt: "2026-08-21T09:15:00.000Z",
  },
];

/* -------------------------------------------------------------------------- */
/* Conversations                                                              */
/* -------------------------------------------------------------------------- */

export const CONVERSATIONS: Conversation[] = [
  { id: "cvn-freya", companyId: CO, customerId: "cust-freya", customerName: "Freya Lindholm", productId: "p-everest-south-col", mountainId: "everest", leadId: "l-freya", productNameAtCreation: "Everest — South Col", sourcePage: "Everest — South Col", lastMessageAt: "2026-08-28T08:35:00.000Z", unread: true },
  { id: "cvn-tomas", companyId: CO, customerId: "cust-tomas", customerName: "Tomás Ferreira", productId: "p-ebc-trek", mountainId: "everest", leadId: "l-tomas", productNameAtCreation: "Everest Base Camp Trek — 14 Days", sourcePage: "Everest Base Camp Trek", lastMessageAt: "2026-08-27T16:20:00.000Z", unread: true },
  { id: "cvn-ilya", companyId: CO, customerId: "cust-ilya", customerName: "Ilya Sorokin", productId: "p-cho-oyu-nw", mountainId: "cho-oyu", leadId: "l-ilya", productNameAtCreation: "Cho Oyu — North West Ridge", sourcePage: "Cho Oyu", lastMessageAt: "2026-08-27T11:30:00.000Z", unread: false },
  { id: "cvn-priya", companyId: CO, customerId: "cust-priya", customerName: "Priya Raman", productId: "p-ama-dablam-sw", mountainId: "ama-dablam", leadId: "l-priya", productNameAtCreation: "Ama Dablam — South West Ridge", sourcePage: "Ama Dablam", lastMessageAt: "2026-08-25T10:05:00.000Z", unread: false },
  { id: "cvn-noor", companyId: CO, customerId: "cust-noor", customerName: "Noor Haddad", productId: "p-mont-blanc-gouter", mountainId: "mont-blanc", leadId: "l-noor", productNameAtCreation: "Mont Blanc — Goûter Route", sourcePage: "Mont Blanc", lastMessageAt: "2026-08-24T17:00:00.000Z", unread: false },
  { id: "cvn-sam", companyId: CO, customerId: "cust-sam", customerName: "Sam Okonkwo", productId: "p-three-passes-trek", mountainId: "everest", leadId: "l-sam", productNameAtCreation: "Everest Three Passes Trek — 18 Days", sourcePage: "Everest Three Passes Trek", lastMessageAt: "2026-08-22T13:40:00.000Z", unread: false },
];

export const MESSAGES: Message[] = [
  { id: "m-freya-1", conversationId: "cvn-freya", senderId: "cust-freya", senderName: "Freya Lindholm", fromCompany: false, body: "I climbed Manaslu last autumn and I'm looking at Everest for 2027. Is there space on the April team, and what would you want to see from me before saying yes?", createdAt: "2026-08-28T08:20:00.000Z" },
  { id: "m-freya-2", conversationId: "cvn-freya", senderId: "u-sona", senderName: "Sona Gurung", fromCompany: true, body: "Manaslu is exactly the season we look for. Two places left on the April team. Send me your rotation profile from last autumn and we can talk this week.", createdAt: "2026-08-28T08:35:00.000Z" },
  { id: "m-tomas-1", conversationId: "cvn-tomas", senderId: "cust-tomas", senderName: "Tomás Ferreira", fromCompany: false, body: "Is the 14-day Base Camp trek running in October? There are four of us and two have never been above 3,000 m.", createdAt: "2026-08-27T16:20:00.000Z" },
  { id: "m-ilya-1", conversationId: "cvn-ilya", senderId: "cust-ilya", senderName: "Ilya Sorokin", fromCompany: false, body: "What does the acclimatisation look like on Cho Oyu? I have three weeks of holiday and I don't want to waste them at ABC.", createdAt: "2026-08-27T09:00:00.000Z" },
  { id: "m-ilya-2", conversationId: "cvn-ilya", senderId: "u-marek", senderName: "Marek Dvořák", fromCompany: true, body: "Two rotations before any push, and the trip is 34 days door to door. Three weeks is not enough for this one — I would rather tell you that now than take the deposit.", createdAt: "2026-08-27T11:30:00.000Z" },
  { id: "m-priya-1", conversationId: "cvn-priya", senderId: "cust-priya", senderName: "Priya Raman", fromCompany: false, body: "What technical grade should I be comfortable leading before Ama Dablam?", createdAt: "2026-08-24T14:00:00.000Z" },
  { id: "m-priya-2", conversationId: "cvn-priya", senderId: "u-marek", senderName: "Marek Dvořák", fromCompany: true, body: "Scottish II/III, and comfortable seconding steeper with a pack. The ridge above Camp 1 is fixed but it is exposed the whole way.", createdAt: "2026-08-25T10:05:00.000Z" },
  { id: "m-noor-1", conversationId: "cvn-noor", senderId: "cust-noor", senderName: "Noor Haddad", fromCompany: false, body: "Do you have anything on Mont Blanc in early September? My partner and I did Gran Paradiso in July.", createdAt: "2026-08-24T15:10:00.000Z" },
  { id: "m-noor-2", conversationId: "cvn-noor", senderId: "u-ilse", senderName: "Ilse Brandt", fromCompany: true, body: "One place left on 5 September and I can hold a second for 48 hours. Gran Paradiso in July is the right preparation.", createdAt: "2026-08-24T17:00:00.000Z" },
  { id: "m-sam-1", conversationId: "cvn-sam", senderId: "cust-sam", senderName: "Sam Okonkwo", fromCompany: false, body: "How hard is the Cho La crossing in late October? I am comfortable walking but I have never used microspikes.", createdAt: "2026-08-22T11:15:00.000Z" },
  { id: "m-sam-2", conversationId: "cvn-sam", senderId: "u-ilse", senderName: "Ilse Brandt", fromCompany: true, body: "The glacier side takes about an hour and the guide fixes a line if it is icy. We teach the spikes on the first pass, so you arrive at Cho La having already used them.", createdAt: "2026-08-22T13:40:00.000Z" },
];

export const NOTES: ConversationNote[] = [
  { id: "n-1", conversationId: "cvn-freya", companyId: CO, authorId: "u-sona", authorName: "Sona Gurung", body: "Strong candidate — asked about the turn-around policy before asking about the price. Worth a call before we quote.", createdAt: "2026-08-28T08:40:00.000Z" },
  { id: "n-2", conversationId: "cvn-ilya", companyId: CO, authorId: "u-marek", authorName: "Marek Dvořák", body: "Told him honestly that three weeks is not enough. Suggested Ama Dablam next autumn instead — he is thinking about it.", createdAt: "2026-08-27T11:35:00.000Z" },
];

/* -------------------------------------------------------------------------- */
/* Leads                                                                      */
/* -------------------------------------------------------------------------- */

const SC = ["p-everest-south-col", "everest"] as const;
const CY = ["p-cho-oyu-nw", "cho-oyu"] as const;
const AD = ["p-ama-dablam-sw", "ama-dablam"] as const;
const MB = ["p-mont-blanc-gouter", "mont-blanc"] as const;
const EB = ["p-ebc-trek", "everest"] as const;
const TP = ["p-three-passes-trek", "everest"] as const;
const GK = ["p-gokyo-lakes-trek", "everest"] as const;

type Stage = "new" | "contacted" | "qualified" | "quoted" | "lost";

/**
 * A lead at a stage, with the stamps that stage implies.
 *
 * The stamps are what every measured figure on Analytics is derived from —
 * response time, drop-off, days to book — so they are written consistently
 * rather than sprinkled, and no lead carries a `qualifiedAt` it never reached.
 */
function lead(
  id: string,
  name: string,
  day: string,
  source: "website" | "icefall-app" | "marketplace" | "other",
  ref: readonly [string, string],
  stage: Stage,
  ownerId: string | null,
  hours = 4,
): Lead {
  const created = `${day}T09:15:00.000Z`;
  const replyHour = String(9 + hours).padStart(2, "0");
  const responded = stage !== "new" ? `${day}T${replyHour}:40:00.000Z` : null;
  const qualified = stage === "qualified" || stage === "quoted" ? `${day}T18:10:00.000Z` : null;
  const quoted = stage === "quoted" ? `${day}T19:30:00.000Z` : null;
  const lost = stage === "lost" ? `${day}T20:00:00.000Z` : null;
  return {
    id,
    companyId: CO,
    customerId: `cust-${id}`,
    customerName: name,
    conversationId: null,
    productId: ref[0],
    mountainId: ref[1],
    status: stage === "lost" ? "lost" : stage,
    origin: "icefall",
    tags: [],
    ownerId,
    bookingId: null,
    source,
    createdAt: created,
    firstResponseAt: responded,
    qualifiedAt: qualified,
    quotedAt: quoted,
    bookedAt: null,
    lostAt: lost,
    lostReason: lost ? "Went with another operator on price." : null,
  };
}

/** The leads with conversations, tags and bookings behind them. */
const NAMED: Lead[] = [
  { id: "l-freya", companyId: CO, customerId: "cust-freya", customerName: "Freya Lindholm", conversationId: "cvn-freya", productId: "p-everest-south-col", mountainId: "everest", status: "qualified", origin: "icefall", tags: ["8000m experience", "2027 season"], ownerId: DEMO_USER_ID, bookingId: null, source: "website", createdAt: "2026-08-28T08:20:00.000Z", firstResponseAt: "2026-08-28T08:35:00.000Z", qualifiedAt: "2026-08-28T08:50:00.000Z", quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-tomas", companyId: CO, customerId: "cust-tomas", customerName: "Tomás Ferreira", conversationId: "cvn-tomas", productId: "p-ebc-trek", mountainId: "everest", status: "new", origin: "icefall", tags: ["Group of 4", "First-timers"], ownerId: null, bookingId: null, source: "icefall-app", createdAt: "2026-08-27T16:20:00.000Z", firstResponseAt: null, qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-ilya", companyId: CO, customerId: "cust-ilya", customerName: "Ilya Sorokin", conversationId: "cvn-ilya", productId: "p-cho-oyu-nw", mountainId: "cho-oyu", status: "contacted", origin: "icefall", tags: ["Dates too short"], ownerId: "cu-marek", bookingId: null, source: "website", createdAt: "2026-08-27T09:00:00.000Z", firstResponseAt: "2026-08-27T11:30:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-priya", companyId: CO, customerId: "cust-priya", customerName: "Priya Raman", conversationId: "cvn-priya", productId: "p-ama-dablam-sw", mountainId: "ama-dablam", status: "quoted", origin: "icefall", tags: ["Awaiting quote reply"], ownerId: "cu-marek", bookingId: null, source: "marketplace", createdAt: "2026-08-24T14:00:00.000Z", firstResponseAt: "2026-08-25T10:05:00.000Z", qualifiedAt: "2026-08-25T10:30:00.000Z", quotedAt: "2026-08-25T15:00:00.000Z", bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-noor", companyId: CO, customerId: "cust-noor", customerName: "Noor Haddad", conversationId: "cvn-noor", productId: "p-mont-blanc-gouter", mountainId: "mont-blanc", status: "booked", origin: "icefall", tags: ["Deposit paid", "Pair"], ownerId: "cu-ilse", bookingId: "bk-noor", source: "website", createdAt: "2026-08-24T15:10:00.000Z", firstResponseAt: "2026-08-24T17:00:00.000Z", qualifiedAt: "2026-08-25T09:00:00.000Z", quotedAt: "2026-08-25T14:00:00.000Z", bookedAt: "2026-08-26T10:00:00.000Z", lostAt: null, lostReason: null },
  { id: "l-sam", companyId: CO, customerId: "cust-sam", customerName: "Sam Okonkwo", conversationId: "cvn-sam", productId: "p-three-passes-trek", mountainId: "everest", status: "booked", origin: "icefall", tags: ["October", "Deposit due"], ownerId: "cu-ilse", bookingId: "bk-sam", source: "icefall-app", createdAt: "2026-08-22T11:15:00.000Z", firstResponseAt: "2026-08-22T13:40:00.000Z", qualifiedAt: "2026-08-23T09:00:00.000Z", quotedAt: "2026-08-23T14:00:00.000Z", bookedAt: "2026-08-24T09:00:00.000Z", lostAt: null, lostReason: null },
  { id: "l-hedda", companyId: CO, customerId: "cust-hedda", customerName: "Hedda Bakken", conversationId: null, productId: "p-ebc-trek", mountainId: "everest", status: "booked", origin: "icefall", tags: ["Deposit paid"], ownerId: "cu-ilse", bookingId: "bk-hedda", source: "website", createdAt: "2026-08-14T09:15:00.000Z", firstResponseAt: "2026-08-14T12:00:00.000Z", qualifiedAt: "2026-08-16T09:00:00.000Z", quotedAt: "2026-08-18T09:00:00.000Z", bookedAt: "2026-08-20T09:00:00.000Z", lostAt: null, lostReason: null },
  { id: "l-bruno", companyId: CO, customerId: "cust-bruno", customerName: "Bruno Kessler", conversationId: null, productId: "p-ama-dablam-sw", mountainId: "ama-dablam", status: "booked", origin: "icefall", tags: ["Deposit paid", "Repeat client"], ownerId: "cu-marek", bookingId: "bk-bruno", source: "marketplace", createdAt: "2026-08-09T09:15:00.000Z", firstResponseAt: "2026-08-09T14:00:00.000Z", qualifiedAt: "2026-08-11T09:00:00.000Z", quotedAt: "2026-08-13T09:00:00.000Z", bookedAt: "2026-08-17T09:00:00.000Z", lostAt: null, lostReason: null },
  { id: "l-arne", companyId: CO, customerId: "cust-arne", customerName: "Arne Solberg", conversationId: null, productId: "p-everest-south-col", mountainId: "everest", status: "lost", origin: "icefall", tags: [], ownerId: "cu-marek", bookingId: "bk-arne", source: "marketplace", createdAt: "2026-08-04T09:15:00.000Z", firstResponseAt: "2026-08-04T15:00:00.000Z", qualifiedAt: "2026-08-06T09:00:00.000Z", quotedAt: "2026-08-08T09:00:00.000Z", bookedAt: "2026-08-12T09:00:00.000Z", lostAt: "2026-08-23T09:00:00.000Z", lostReason: "Cancelled after booking — work would not release the season." },
  { id: "l-dilan", companyId: CO, customerId: "cust-dilan", customerName: "Dilan Yıldız", conversationId: null, productId: "p-gokyo-lakes-trek", mountainId: "everest", status: "lost", origin: "icefall", tags: [], ownerId: null, bookingId: null, source: "icefall-app", createdAt: "2026-08-18T09:15:00.000Z", firstResponseAt: "2026-08-19T16:00:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: "2026-08-21T10:00:00.000Z", lostReason: "We took too long to reply." },
];

/** Leads the company recorded themselves. Never counted as Icefall's work. */
const OWN: Lead[] = [
  { id: "l-own-1", companyId: CO, customerId: "cu-own-1", customerName: "Ana Beatriz Rocha", conversationId: null, productId: "p-everest-south-col", mountainId: "everest", status: "quoted", origin: "company", tags: ["Referral", "Group of 3"], ownerId: DEMO_USER_ID, bookingId: null, source: "Referral — Pasang", createdAt: "2026-08-19T09:00:00.000Z", firstResponseAt: "2026-08-19T09:30:00.000Z", qualifiedAt: "2026-08-20T09:00:00.000Z", quotedAt: "2026-08-21T09:00:00.000Z", bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-own-2", companyId: CO, customerId: "cu-own-2", customerName: "Gerrit Muller", conversationId: null, productId: "p-mont-blanc-gouter", mountainId: "mont-blanc", status: "contacted", origin: "company", tags: ["Phone enquiry"], ownerId: "cu-ilse", bookingId: null, source: "Phone", createdAt: "2026-08-23T11:00:00.000Z", firstResponseAt: "2026-08-23T11:20:00.000Z", qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-own-3", companyId: CO, customerId: "cu-own-3", customerName: "Ingvild Sæther", conversationId: null, productId: "p-ebc-trek", mountainId: "everest", status: "new", origin: "company", tags: ["Repeat client"], ownerId: null, bookingId: null, source: "Walk-in", createdAt: "2026-08-27T13:00:00.000Z", firstResponseAt: null, qualifiedAt: null, quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
  { id: "l-own-4", companyId: CO, customerId: "cu-own-4", customerName: "Kofi Mensah", conversationId: null, productId: "p-kilimanjaro-machame", mountainId: "kilimanjaro", status: "qualified", origin: "company", tags: ["Corporate group"], ownerId: DEMO_USER_ID, bookingId: null, source: "Referral — previous client", createdAt: "2026-08-11T10:00:00.000Z", firstResponseAt: "2026-08-11T10:45:00.000Z", qualifiedAt: "2026-08-12T09:00:00.000Z", quotedAt: null, bookedAt: null, lostAt: null, lostReason: null },
];

const AUGUST: Lead[] = [
  lead("l-a01", "Ingrid Sundqvist", "2026-08-01", "website", SC, "quoted", "cu-marek", 3),
  lead("l-a02", "Rafael Duarte", "2026-08-02", "icefall-app", EB, "qualified", null, 6),
  lead("l-a03", "Mira Kovač", "2026-08-03", "website", TP, "contacted", "cu-ilse", 2),
  lead("l-a04", "Kenji Watanabe", "2026-08-05", "marketplace", SC, "qualified", "cu-marek", 5),
  lead("l-a05", "Marcus Oyelaran", "2026-08-06", "website", EB, "quoted", null, 8),
  lead("l-a06", "Lena Bauer", "2026-08-07", "icefall-app", AD, "qualified", "cu-marek", 3),
  lead("l-a07", "Diego Restrepo", "2026-08-08", "website", GK, "lost", null, 12),
  lead("l-a08", "Yusuf Demir", "2026-08-10", "marketplace", CY, "qualified", "cu-marek", 4),
  lead("l-a09", "Clara Nyström", "2026-08-11", "icefall-app", TP, "contacted", null, 7),
  lead("l-a10", "Beatrix Kovács", "2026-08-12", "website", EB, "qualified", "cu-ilse", 2),
  lead("l-a11", "Tom Whitfield", "2026-08-13", "icefall-app", SC, "quoted", "cu-marek", 5),
  lead("l-a12", "Sanne de Vries", "2026-08-15", "website", MB, "new", null),
  lead("l-a13", "Rosa Iglesias", "2026-08-16", "marketplace", AD, "qualified", "cu-marek", 3),
  lead("l-a14", "Idris Bello", "2026-08-17", "icefall-app", EB, "contacted", null, 9),
  lead("l-a15", "Mei Chen", "2026-08-19", "website", CY, "qualified", "cu-ilse", 2),
  lead("l-a16", "Oskar Nowak", "2026-08-20", "other", TP, "new", null),
  lead("l-a17", "Helena Ruiz", "2026-08-21", "marketplace", GK, "quoted", "cu-ilse", 4),
  lead("l-a18", "Callum Fraser", "2026-08-22", "website", MB, "contacted", null, 6),
  lead("l-a19", "Zofia Adamska", "2026-08-25", "icefall-app", EB, "new", null),
  lead("l-a20", "Théo Marchand", "2026-08-26", "website", MB, "contacted", "cu-ilse", 3),
];

const JULY: Lead[] = [
  lead("l-j01", "Matteo Ricci", "2026-07-02", "website", SC, "quoted", "cu-marek", 5),
  lead("l-j02", "Amelia Hart", "2026-07-03", "icefall-app", EB, "qualified", "cu-marek", 4),
  lead("l-j03", "Henrik Dahl", "2026-07-05", "website", EB, "contacted", "cu-tobias", 9),
  lead("l-j04", "Chiara Bellini", "2026-07-06", "marketplace", AD, "qualified", "cu-marek", 3),
  lead("l-j05", "Nour Al-Farsi", "2026-07-08", "website", SC, "qualified", null, 7),
  lead("l-j06", "Gabriel Silva", "2026-07-09", "icefall-app", TP, "lost", null, 14),
  lead("l-j07", "Elif Kaya", "2026-07-11", "website", MB, "quoted", "cu-ilse", 2),
  lead("l-j08", "Stefan Meyer", "2026-07-12", "marketplace", EB, "qualified", null, 6),
  lead("l-j09", "Anouk Janssen", "2026-07-14", "website", SC, "contacted", "cu-marek", 5),
  lead("l-j10", "Ryo Tanaka", "2026-07-15", "icefall-app", AD, "qualified", null, 8),
  lead("l-j11", "Isabella Moreau", "2026-07-17", "website", MB, "qualified", "cu-ilse", 3),
  lead("l-j12", "Piotr Zieliński", "2026-07-18", "marketplace", TP, "new", null),
  lead("l-j13", "Maja Andersen", "2026-07-20", "website", SC, "quoted", "cu-marek", 4),
  lead("l-j14", "Liam O'Connor", "2026-07-21", "icefall-app", GK, "qualified", null, 6),
  lead("l-j15", "Valentina Rossi", "2026-07-23", "website", AD, "contacted", "cu-marek", 5),
  lead("l-j16", "Andrés Vargas", "2026-07-24", "other", EB, "qualified", null, 10),
  lead("l-j17", "Katarzyna Wolska", "2026-07-26", "website", CY, "qualified", "cu-ilse", 3),
  lead("l-j18", "Finn Berger", "2026-07-29", "icefall-app", EB, "new", null),
  lead("l-j19", "Sara Lindqvist", "2026-07-30", "marketplace", MB, "quoted", "cu-ilse", 4),
];

export const LEADS: Lead[] = [...NAMED, ...AUGUST, ...JULY, ...OWN];

export const LEAD_NOTES: LeadNote[] = [
  { id: "ln-1", leadId: "l-priya", authorId: "u-marek", authorName: "Marek Dvořák", body: "Quoted at the standard rate. She is comparing us against one other operator, decision expected mid-September.", createdAt: "2026-08-25T15:05:00.000Z" },
  { id: "ln-2", leadId: "l-freya", authorId: "u-sona", authorName: "Sona Gurung", body: "Manaslu last autumn, clean rotation profile. If the reference checks out she is a yes for April.", createdAt: "2026-08-28T09:00:00.000Z" },
  { id: "ln-3", leadId: "l-dilan", authorId: "u-sona", authorName: "Sona Gurung", body: "We lost this one on our own reply time — 31 hours. Worth looking at how the weekend queue is covered.", createdAt: "2026-08-21T10:05:00.000Z" },
  { id: "ln-4", leadId: "l-own-4", authorId: "u-sona", authorName: "Sona Gurung", body: "Group of nine from a previous Kilimanjaro client. Waiting on their January dates before quoting.", createdAt: "2026-08-12T09:10:00.000Z" },
];

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

export const BOOKINGS: Booking[] = [
  { id: "bk-noor", status: "confirmed", leadId: "l-noor", companyId: CO, productId: "p-mont-blanc-gouter", mountainId: "mont-blanc", value: { status: "reported", cents: 490_000 }, currency: "EUR", bookedAt: "2026-08-26T10:00:00.000Z", startsOn: "2026-09-05", referralPctAtBooking: null },
  { id: "bk-hedda", status: "confirmed", leadId: "l-hedda", companyId: CO, productId: "p-ebc-trek", mountainId: "everest", value: { status: "reported", cents: 295_000 }, currency: "EUR", bookedAt: "2026-08-20T09:00:00.000Z", startsOn: "2026-11-07", referralPctAtBooking: null },
  {
    // Confirmed, and nobody has told us what it was worth. The screens say that
    // in words rather than showing a zero.
    id: "bk-bruno",
    status: "confirmed",
    leadId: "l-bruno",
    companyId: CO,
    productId: "p-ama-dablam-sw",
    mountainId: "ama-dablam",
    value: { status: "pending" },
    currency: "EUR",
    bookedAt: "2026-08-17T09:00:00.000Z",
    startsOn: "2026-10-18",
    referralPctAtBooking: null,
  },
  { id: "bk-arne", status: "cancelled", leadId: "l-arne", companyId: CO, productId: "p-everest-south-col", mountainId: "everest", value: { status: "reported", cents: 1_180_000 }, currency: "EUR", bookedAt: "2026-08-12T09:00:00.000Z", startsOn: "2027-04-03", referralPctAtBooking: null },
  {
    // Booked, deposit not in yet. "Pending" is not "confirmed" and its value is
    // not counted as revenue until it is.
    id: "bk-sam",
    status: "pending",
    leadId: "l-sam",
    companyId: CO,
    productId: "p-three-passes-trek",
    mountainId: "everest",
    value: { status: "reported", cents: 355_000 },
    currency: "EUR",
    bookedAt: "2026-08-24T09:00:00.000Z",
    startsOn: "2026-10-04",
    referralPctAtBooking: null,
  },
];

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export const NOTIFICATIONS: OperatorNotification[] = [
  { id: "nt-1", companyUserId: DEMO_USER_ID, companyId: CO, type: "enquiry_new", title: "New enquiry from Freya Lindholm", body: "About Everest — South Col.", href: "/operator/leads/l-freya", createdAt: "2026-08-28T08:20:00.000Z", readAt: null },
  { id: "nt-2", companyUserId: DEMO_USER_ID, companyId: CO, type: "enquiry_new", title: "New enquiry from Tomás Ferreira", body: "About Everest Base Camp Trek — 14 Days.", href: "/operator/inbox/cvn-tomas", createdAt: "2026-08-27T16:20:00.000Z", readAt: null },
  { id: "nt-3", companyUserId: DEMO_USER_ID, companyId: CO, type: "content_submitted", title: "Profile edit sent to Icefall", body: "Your company profile edit submitted on 27 Aug 2026 is awaiting Icefall review. Your published profile is unchanged until then.", href: "/operator/company", createdAt: "2026-08-27T08:40:00.000Z", readAt: null },
  { id: "nt-4", companyUserId: DEMO_USER_ID, companyId: CO, type: "placement_expiring", title: "Everest placement ends on 20 Sep 2026", body: "Your slot 2 placement on Everest is due to lapse. Your trips and enquiries are unaffected — Icefall will be in touch about renewing it.", href: "/operator/mountains/everest", createdAt: "2026-08-26T09:00:00.000Z", readAt: null },
  { id: "nt-5", companyUserId: DEMO_USER_ID, companyId: CO, type: "content_rejected", title: "Changes to Everest Base Camp Trek — 14 Days were not approved", body: "The description carried a phone number and a booking link.", href: "/operator/products/p-ebc-trek", createdAt: "2026-08-21T09:15:00.000Z", readAt: "2026-08-21T11:00:00.000Z" },
  { id: "nt-6", companyUserId: DEMO_USER_ID, companyId: CO, type: "booking_recorded", title: "Booking confirmed — Noor Haddad", body: "Mont Blanc — Goûter Route, €4,900 reported.", href: "/operator/bookings", createdAt: "2026-08-26T10:05:00.000Z", readAt: "2026-08-26T12:00:00.000Z" },
];
