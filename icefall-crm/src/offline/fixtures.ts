/**
 * The aeroplane fixtures. Read only when `OFFLINE` is true.
 *
 * ── EVERY COMPANY, PERSON, BOOKING AND FIGURE BELOW IS INVENTED ─────────────
 *
 * Not one of these operators exists. The names were chosen to be unmistakably
 * fictional and are deliberately NOT the names of real mountaineering
 * businesses — the constitution forbids rendering a real, identifiable company
 * in a fabricated state, and an offline demo is a fabricated state from top to
 * bottom. If you are tempted to add "the real ones so it looks convincing":
 * that is the exact failure this rule exists to prevent, and a screenshot of
 * this screen is indistinguishable from a screenshot of the real thing.
 *
 * The MOUNTAINS and TREKS are real, with published elevations, keyed by the
 * slugs the consumer apps already use — same reasoning as `src/demo/`:
 * inventing peaks would undermine the one thing a mountaineering product has to
 * get right, and the destination photographs in `public/img/destinations/` are
 * keyed by those slugs.
 *
 * NOT GATED BY `SHOW_DEMO_DATA`, on purpose. That flag is `import.meta.env.DEV`
 * and collapses these arrays to `[]` in a built bundle — which would turn the
 * offline demo into 23 empty screens the first time somebody runs
 * `vite build && vite preview` instead of `vite dev`. This file is gated by
 * `OFFLINE` at every call site instead, so a normal build (flag unset) drops the
 * whole module as dead code and carries none of these strings.
 *
 * Deterministic: no `Math.random()`. Dates are offsets from today, so "expires
 * in 5 days" is still true next week and the expiry, renewal and overdue
 * screens stay judgeable.
 */
import type {
  AuditEvent, Booking, Commission, Company, CompanyInvitation, CompanyMember,
  ContentVersion, CustomerRecord, Deal, GuideRecord, IntakeRequest, Invoice,
  Lead, Mountain, Payment, PlacementPrice, PlacementView, Product,
  RevenueRecord, StaffRecord, Task, Ticket, TicketMessage,
  VerificationDocument,
} from "@/data/types";

/** A local calendar day, `n` days from today. */
function day(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** An instant, `n` days from now. */
function at(n: number, hour = 10, minute = 15): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
const eur = (whole: number) => Math.round(whole * 100);

/* -------------------------------------------------------------------------- */
/* Companies — nine, all invented                                             */
/* -------------------------------------------------------------------------- */

export const C = {
  snowline: "0a1e0000-0000-4000-8000-000000000001",
  nordkant: "0a1e0000-0000-4000-8000-000000000002",
  cornice: "0a1e0000-0000-4000-8000-000000000003",
  verglas: "0a1e0000-0000-4000-8000-000000000004",
  kettle: "0a1e0000-0000-4000-8000-000000000005",
  tarn: "0a1e0000-0000-4000-8000-000000000006",
  arete: "0a1e0000-0000-4000-8000-000000000007",
  windward: "0a1e0000-0000-4000-8000-000000000008",
  lantern: "0a1e0000-0000-4000-8000-000000000009",
} as const;

export const companies: Company[] = [
  { id: C.snowline, slug: "snowline-collective", name: "Snowline Collective", legal_name: "Snowline Collective Pvt Ltd",
    logo_path: null, real_business: false, description: "Eight-thousand-metre expeditions in the Khumbu, run on a long acclimatisation profile.",
    countries: ["Nepal"], regions: ["Himalaya & Asia"], status: "active", verification_status: "verified",
    documents_checked_at: at(-58), documents_checked_by: "s1", created_at: at(-610), updated_at: at(-4) },
  { id: C.nordkant, slug: "nordkant-alpine", name: "Nordkant Alpine", legal_name: "Nordkant Alpine AS",
    logo_path: null, real_business: false, description: "Winter ascents and ski mountaineering above the Arctic Circle.",
    countries: ["Norway", "Sweden"], regions: ["Europe"], status: "active", verification_status: "verified",
    documents_checked_at: at(-102), documents_checked_by: "s3", created_at: at(-520), updated_at: at(-11) },
  { id: C.cornice, slug: "blue-cornice-expeditions", name: "Blue Cornice Expeditions", legal_name: "Blue Cornice Expeditions Pvt Ltd",
    logo_path: null, real_business: false, description: "Karakoram and Nepal Himalaya, small teams, no fixed-rope sharing.",
    countries: ["Pakistan", "Nepal"], regions: ["Himalaya & Asia"], status: "active", verification_status: "verified",
    documents_checked_at: at(-171), documents_checked_by: "s1", created_at: at(-700), updated_at: at(-19) },
  { id: C.verglas, slug: "verglas-mountain-works", name: "Verglas Mountain Works", legal_name: "Verglas Mountain Works SARL",
    logo_path: null, real_business: false, description: "Chamonix-based alpinism courses and classic Western Alps routes.",
    countries: ["France", "Switzerland"], regions: ["Europe"], status: "active", verification_status: "pending",
    documents_checked_at: null, documents_checked_by: null, created_at: at(-330), updated_at: at(-2) },
  { id: C.kettle, slug: "kettle-peak-guiding", name: "Kettle Peak Guiding", legal_name: null,
    logo_path: null, real_business: false, description: "Cascades and Alaska Range, six climbers to two guides.",
    countries: ["United States", "Canada"], regions: ["Americas"], status: "onboarding", verification_status: "unverified",
    documents_checked_at: null, documents_checked_by: null, created_at: at(-37), updated_at: at(-1) },
  { id: C.tarn, slug: "tarn-and-tundra-treks", name: "Tarn & Tundra Treks", legal_name: "Tarn og Tundra ehf",
    logo_path: null, real_business: false, description: "Long-distance hut-to-hut trekking in Iceland and the far north.",
    countries: ["Iceland", "Norway"], regions: ["Europe"], status: "active", verification_status: "verified",
    documents_checked_at: at(-83), documents_checked_by: "s3", created_at: at(-455), updated_at: at(-8) },
  { id: C.arete, slug: "bright-arete-expeditions", name: "Bright Arête Expeditions", legal_name: "Bright Arête SpA",
    logo_path: null, real_business: false, description: "Aconcagua, Patagonia and the high Andes.",
    countries: ["Argentina", "Chile"], regions: ["Americas"], status: "active", verification_status: "unverified",
    documents_checked_at: null, documents_checked_by: null, created_at: at(-244), updated_at: at(-26) },
  { id: C.windward, slug: "windward-col-mountaineering", name: "Windward Col Mountaineering", legal_name: null,
    logo_path: null, real_business: false, description: "Scottish winter skills and introductory alpine courses.",
    countries: ["United Kingdom"], regions: ["Europe"], status: "suspended", verification_status: "suspended",
    documents_checked_at: null, documents_checked_by: null, created_at: at(-500), updated_at: at(-47) },
  { id: C.lantern, slug: "paper-lantern-trekking", name: "Paper Lantern Trekking", legal_name: "Paper Lantern Trekking Pvt Ltd",
    logo_path: null, real_business: false, description: "Teahouse trekking across Nepal and Bhutan.",
    countries: ["Nepal", "Bhutan"], regions: ["Himalaya & Asia"], status: "prospect", verification_status: "unverified",
    documents_checked_at: null, documents_checked_by: null, created_at: at(-21), updated_at: at(-21) },
];

const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "Unknown company";

/* -------------------------------------------------------------------------- */
/* Products                                                                   */
/* -------------------------------------------------------------------------- */

export const P = (n: number) => `0b2d0000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const product = (
  n: number, company_id: string, kind: "expedition" | "trek", slug: string, name: string,
  price: number | null, status: Product["status"], mins: number, maxs: number,
  alt: number | null, avail: Product["availability_state"] = "available",
  seats: number | null = null,
): Product => ({
  id: P(n), company_id, kind, slug, name,
  summary: kind === "expedition"
    ? "Full expedition package with fixed departures, oxygen and base camp support."
    : "Guided trek with lodge or hut accommodation and a local team.",
  description: null,
  price_from_cents: price === null ? null : eur(price),
  price_state: price === null ? "on_request" : "known",
  currency: "EUR", duration_days_min: mins, duration_days_max: maxs,
  season: kind === "expedition" ? "Spring / Autumn" : "May – October",
  difficulty: kind === "expedition" ? "Serious alpine" : "Strenuous",
  max_altitude_m: alt, seats_available: seats, availability_state: avail,
  status, live_at: status === "live" ? at(-120) : null,
});

export const products: Product[] = [
  product(1, C.snowline, "expedition", "everest-south-col", "Everest — South Col, full service", 58000, "live", 58, 64, 8849, "limited", 4),
  product(2, C.snowline, "expedition", "lhotse-spring", "Lhotse — spring season", 39000, "live", 52, 58, 8516, "available", 8),
  product(3, C.snowline, "trek", "khumbu-approach-trek", "Khumbu approach trek", 2450, "live", 12, 14, 5545),
  product(4, C.cornice, "expedition", "k2-north-ridge", "K2 — north ridge", 46000, "live", 55, 62, 8611, "limited", 2),
  product(5, C.cornice, "expedition", "manaslu-autumn", "Manaslu — autumn", 17500, "live", 38, 42, 8163, "available", 6),
  product(6, C.cornice, "expedition", "ama-dablam-sw-ridge", "Ama Dablam — south west ridge", 8900, "live", 24, 28, 6814, "available", 9),
  product(7, C.verglas, "expedition", "mont-blanc-gouter", "Mont Blanc — Goûter route", 1850, "live", 5, 6, 4808, "full", 0),
  product(8, C.verglas, "expedition", "matterhorn-hornli", "Matterhorn — Hörnli ridge", 2400, "live", 6, 7, 4478, "limited", 2),
  product(9, C.verglas, "trek", "haute-route-classic", "Chamonix–Zermatt Haute Route", 1650, "pending_review", 6, 7, 3710),
  product(10, C.kettle, "expedition", "denali-west-buttress", "Denali — west buttress", 9800, "live", 21, 24, 6190, "available", 5),
  product(11, C.kettle, "expedition", "rainier-disappointment-cleaver", "Rainier — Disappointment Cleaver", 1250, "live", 3, 4, 4392, "available", 11),
  product(12, C.arete, "expedition", "aconcagua-normal-route", "Aconcagua — normal route", 5400, "live", 18, 21, 6961, "available", 7),
  product(13, C.arete, "trek", "patagonia-o-circuit", "Patagonia — the O circuit", 3100, "draft", 9, 10, 1200),
  product(14, C.tarn, "trek", "laugavegur-crossing", "Laugavegur crossing", 1450, "live", 5, 6, 1050),
  product(15, C.tarn, "trek", "lofoten-ridge-traverse", "Lofoten ridge traverse", 1900, "live", 7, 8, 1161),
  product(16, C.nordkant, "expedition", "lyngen-ski-traverse", "Lyngen ski traverse", 2650, "live", 7, 8, 1833, "limited", 3),
  product(17, C.nordkant, "expedition", "arctic-winter-skills", "Arctic winter skills week", null, "live", 6, 6, 1200, "unknown"),
  product(18, C.lantern, "trek", "annapurna-teahouse-circuit", "Annapurna teahouse circuit", 1750, "draft", 14, 17, 5416),
];

/* -------------------------------------------------------------------------- */
/* Placements — the paid positions on a mountain                              */
/* -------------------------------------------------------------------------- */

const placement = (
  id: string, company_id: string, destination_id: string, slot: number,
  startsIn: number, endsIn: number, price: number | null,
  status: "reserved" | "active" | "cancelled" = "active",
  product_id: string | null = null,
): PlacementView => ({
  id, company_id, destination_id, slot_position: slot, product_id,
  starts_on: day(startsIn), ends_on: day(endsIn), status,
  price_cents: price === null ? null : eur(price), currency: "EUR",
  changed_by: null, changed_at: null, change_reason: null,
  effective_status:
    status === "cancelled" ? "cancelled" : endsIn < 0 ? "expired" : startsIn > 0 ? "reserved" : status,
  needs_review: status !== "cancelled" && endsIn < 0,
  days_remaining: endsIn,
});

/**
 * A slot may only feature an expedition the company actually runs ON THAT
 * mountain — the database enforces it with a trigger. Slots whose company has
 * no product there hold the position with nothing chosen for it yet, which is a
 * real state operators sit in, not a gap in the fixture.
 */
export const placements: PlacementView[] = [
  placement("op1", C.snowline, "everest", 1, -34, 331, 5000, "active", P(1)),
  placement("op2", C.cornice, "everest", 2, -70, 295, 4500),
  placement("op3", C.arete, "everest", 3, -12, 5, 3500),
  placement("op4", C.kettle, "everest", 4, -390, -12, 3000),
  placement("op5", C.nordkant, "everest", 5, 16, 381, 2500, "reserved"),
  placement("op6", C.cornice, "k2", 1, -40, 325, 3800, "active", P(4)),
  placement("op7", C.snowline, "lhotse", 1, -25, 340, 2900, "active", P(2)),
  placement("op8", C.cornice, "manaslu", 1, -66, 3, 2300, "active", P(5)),
  placement("op9", C.cornice, "ama-dablam", 1, -140, 225, 2100, "active", P(6)),
  placement("op10", C.snowline, "ama-dablam", 2, -14, 351, 1800),
  placement("op11", C.verglas, "mont-blanc", 1, -22, 343, 2200, "active", P(7)),
  placement("op12", C.verglas, "matterhorn", 1, -48, 317, 2000, "active", P(8)),
  placement("op13", C.tarn, "matterhorn", 2, -6, 359, 1700),
  placement("op14", C.kettle, "denali", 1, -88, 277, 2600, "active", P(10)),
  placement("op15", C.kettle, "rainier", 1, -4, 27, 1400, "active", P(11)),
  placement("op16", C.arete, "aconcagua", 1, -9, 356, 2400, "active", P(12)),
  placement("op17", C.arete, "aconcagua", 2, -200, -30, 2100, "cancelled"),
  placement("op18", C.nordkant, "kilimanjaro", 1, 21, 386, 2500, "reserved"),
  placement("op19", C.tarn, "laugavegur-trail", 1, -18, 347, 900, "active", P(14)),
  placement("op20", C.verglas, "tour-du-mont-blanc", 1, -30, 335, 1100, "active", P(9)),
];

/** The published rate card — what a position costs, before anything is agreed. */
export const placementPrices: PlacementPrice[] = (
  [
    ["everest", 5000, 4500, 3500, 3000, 2500],
    ["k2", 3800, 3400, 2900, 2500, 2100],
    ["lhotse", 2900, 2600, 2200, 1900, 1600],
    ["manaslu", 2300, 2000, 1700, 1400, 1200],
    ["ama-dablam", 2100, 1800, 1500, 1300, 1100],
    ["aconcagua", 2400, 2100, 1800, 1500, 1300],
    ["denali", 2600, 2300, 1900, 1600, 1400],
    ["kilimanjaro", 2500, 2200, 1800, 1500, 1300],
    ["mont-blanc", 2200, 1900, 1600, 1300, 1100],
    ["matterhorn", 2000, 1700, 1400, 1200, 1000],
    ["rainier", 1400, 1200, 1000, 850, 700],
    ["elbrus", 1600, 1400, 1150, 950, 800],
  ] as const
).flatMap(([id, ...prices]) =>
  (prices as readonly number[]).map((p, i) => ({
    destination_id: id as string, slot_position: i + 1, price_cents: eur(p), currency: "EUR",
  })),
);

/* -------------------------------------------------------------------------- */
/* Operator changes waiting for a decision                                    */
/* -------------------------------------------------------------------------- */

const version = (
  id: string, entity_id: string, company_id: string,
  payload: Record<string, unknown>, base: Record<string, unknown>, daysAgo: number,
  flags: string[] = [], entity_type: "company" | "product" = "product",
): ContentVersion => ({
  id, entity_type, entity_id, company_id, payload,
  changed_fields: Object.keys(payload), base_snapshot: base, flags, state: "pending",
  submitted_by: null, submitted_at: at(-daysAgo), reviewed_by: null, reviewed_at: null,
  decision_reason: null, applied_at: null, created_at: at(-daysAgo),
});

export const contentVersions: ContentVersion[] = [
  version("ov1", P(6), C.cornice, { price_from_cents: eur(9400) }, { price_from_cents: eur(8900) }, 1),
  version("ov2", P(12), C.arete, { summary: "Eighteen days on the normal route with two rest days at Plaza de Mulas." }, { summary: "Full expedition package with fixed departures." }, 2),
  version("ov3", P(8), C.verglas, { description: "Book direct on +41 00 000 0000 for a better price." }, { description: null }, 2, ["possible_contact_details"]),
  version("ov4", P(14), C.tarn, { duration_days_min: 4, duration_days_max: 5 }, { duration_days_min: 5, duration_days_max: 6 }, 4),
  version("ov5", C.kettle, C.kettle, { description: "Cascades and Alaska Range, six climbers to two guides, since 2011." }, { description: "Cascades and Alaska Range, six climbers to two guides." }, 5, [], "company"),
  version("ov6", P(1), C.snowline, { price_from_cents: eur(61000), seats_available: 2 }, { price_from_cents: eur(58000), seats_available: 4 }, 6),
  version("ov7", P(15), C.tarn, { name: "Lofoten ridge traverse — extended" }, { name: "Lofoten ridge traverse" }, 8),
];

/* -------------------------------------------------------------------------- */
/* Customers — the signup story, spread across fourteen months                */
/* -------------------------------------------------------------------------- */

const customer = (
  n: number, name: string, email: string, country: string, joinedDaysAgo: number,
  interests: string[], leads: number, bookings: number,
  status: CustomerRecord["status"] = "active",
): CustomerRecord => ({
  id: `ou${n}`, name, email, country, joined_on: day(-joinedDaysAgo),
  // Null everywhere until ICEFALL measures activity — never "Free", never 0.
  subscription: null, last_active_at: null,
  mountain_interests: interests, leads, bookings, status,
});

export const customers: CustomerRecord[] = [
  customer(1, "Ines Halvorsen", "i.halvorsen@example.com", "Norway", 415, ["everest"], 3, 1),
  customer(2, "Tomás Ferreira", "t.ferreira@example.com", "Portugal", 400, ["aconcagua"], 2, 1),
  customer(3, "Ruth Ackerman", "r.ackerman@example.com", "United States", 372, ["denali", "rainier"], 2, 1),
  customer(4, "Peadar Lynch", "p.lynch@example.com", "Ireland", 350, ["mont-blanc"], 1, 0),
  customer(5, "Yuki Nakashima", "y.nakashima@example.com", "Japan", 330, ["ama-dablam"], 2, 1),
  customer(6, "Bea Kowalczyk", "b.kowalczyk@example.com", "Poland", 305, ["matterhorn"], 1, 0),
  customer(7, "Sam Okonjo", "s.okonjo@example.com", "United Kingdom", 288, ["kilimanjaro"], 2, 1),
  customer(8, "Lars Ottosen", "l.ottosen@example.com", "Denmark", 264, ["everest", "lhotse"], 1, 0),
  customer(9, "Federica Bianchi", "f.bianchi@example.com", "Italy", 240, ["mont-blanc"], 2, 1),
  customer(10, "Nadia Berg", "n.berg@example.com", "Norway", 221, ["laugavegur-trail"], 1, 1),
  customer(11, "Oscar Lindgren", "o.lindgren@example.com", "Sweden", 205, ["matterhorn"], 1, 0),
  customer(12, "Chidi Nwosu", "c.nwosu@example.com", "Nigeria", 188, ["kilimanjaro"], 1, 0),
  customer(13, "Hana Dvořák", "h.dvorak@example.com", "Czechia", 170, ["manaslu"], 2, 1),
  customer(14, "Georgia Pryor", "g.pryor@example.com", "Australia", 152, ["everest"], 1, 0),
  customer(15, "Ravi Menon", "r.menon@example.com", "India", 133, ["ama-dablam"], 2, 1),
  customer(16, "Elise Dubois", "e.dubois@example.com", "France", 118, ["mont-blanc", "matterhorn"], 1, 0),
  customer(17, "Marcus Steiner", "m.steiner@example.com", "Switzerland", 96, ["k2"], 1, 0),
  customer(18, "Aoife Brennan", "a.brennan@example.com", "Ireland", 78, ["tour-du-mont-blanc"], 1, 1),
  customer(19, "Diego Sanhueza", "d.sanhueza@example.com", "Chile", 61, ["aconcagua"], 2, 0),
  customer(20, "Kirsten Vogel", "k.vogel@example.com", "Germany", 47, ["denali"], 1, 1),
  customer(21, "Paulo Márquez", "p.marquez@example.com", "Spain", 34, ["aconcagua"], 1, 0),
  customer(22, "Wren Halliday", "w.halliday@example.com", "New Zealand", 22, ["everest"], 1, 0),
  customer(23, "Idris Farouk", "i.farouk@example.com", "Egypt", 13, ["kilimanjaro"], 1, 0),
  customer(24, "Mila Sorokina", "m.sorokina@example.com", "Latvia", 5, ["elbrus"], 1, 0, "suspended"),
];

/* -------------------------------------------------------------------------- */
/* Leads and bookings                                                         */
/* -------------------------------------------------------------------------- */

const lead = (
  id: string, company_id: string, customer_id: string, product_id: string, destination_id: string,
  status: Lead["status"], daysAgo: number, source: string, booking_id: string | null = null,
  assigned_to: string | null = null,
): Lead => ({
  id, company_id, customer_id, thread_id: `ot-${id}`, product_id, destination_id, status,
  assigned_to, source_page: source, created_at: at(-daysAgo),
  contacted_at: status === "new" ? null : at(-daysAgo + 1),
  qualified_at: ["new", "contacted"].includes(status) ? null : at(-daysAgo + 2),
  quoted_at: ["new", "contacted", "qualified"].includes(status) ? null : at(-daysAgo + 4),
  booked_at: status === "booked" ? at(-daysAgo + 6) : null,
  lost_at: status === "lost" ? at(-daysAgo + 5) : null,
  lost_reason: status === "lost" ? "Chose a different operator on price." : null,
  booking_id,
});

export const leads: Lead[] = [
  lead("ol1", C.snowline, "ou22", P(1), "everest", "new", 1, "product"),
  lead("ol2", C.cornice, "ou15", P(6), "ama-dablam", "new", 1, "mountain"),
  lead("ol3", C.arete, "ou21", P(12), "aconcagua", "new", 2, "company"),
  lead("ol4", C.kettle, "ou3", P(11), "rainier", "contacted", 4, "product", null, "s2"),
  lead("ol5", C.snowline, "ou8", P(2), "lhotse", "contacted", 6, "company", null, "s2"),
  lead("ol6", C.verglas, "ou16", P(7), "mont-blanc", "contacted", 7, "mountain"),
  lead("ol7", C.tarn, "ou10", P(14), "laugavegur-trail", "qualified", 9, "product", null, "s2"),
  lead("ol8", C.cornice, "ou17", P(4), "k2", "qualified", 12, "mountain", null, "s6"),
  lead("ol9", C.verglas, "ou11", P(8), "matterhorn", "qualified", 13, "product"),
  lead("ol10", C.kettle, "ou20", P(10), "denali", "quoted", 15, "product", null, "s2"),
  lead("ol11", C.arete, "ou19", P(12), "aconcagua", "quoted", 17, "company"),
  lead("ol12", C.snowline, "ou14", P(1), "everest", "quoted", 19, "product", null, "s6"),
  lead("ol13", C.snowline, "ou1", P(1), "everest", "booked", 26, "product", "ob1"),
  lead("ol14", C.cornice, "ou5", P(6), "ama-dablam", "booked", 31, "mountain", "ob2"),
  lead("ol15", C.verglas, "ou9", P(7), "mont-blanc", "booked", 37, "product", "ob3"),
  lead("ol16", C.kettle, "ou3", P(10), "denali", "booked", 44, "product", "ob4"),
  lead("ol17", C.tarn, "ou18", P(14), "laugavegur-trail", "booked", 52, "product", "ob5"),
  lead("ol18", C.cornice, "ou13", P(5), "manaslu", "booked", 58, "mountain", "ob6"),
  lead("ol19", C.nordkant, "ou6", P(16), "matterhorn", "lost", 23, "mountain"),
  lead("ol20", C.windward, "ou24", P(17), "mont-blanc", "lost", 35, "product"),
  lead("ol21", C.arete, "ou2", P(12), "aconcagua", "lost", 41, "company"),
  lead("ol22", C.arete, "ou19", P(12), "aconcagua", "disputed", 49, "company"),
];

const booking = (
  id: string, lead_id: string, company_id: string, product_id: string, destination_id: string,
  customer_id: string, value: number | null, status: string, daysAgo: number,
  attribution: Booking["attribution_status"] = "icefall",
  kind: Booking["kind"] = "expedition",
): Booking => ({
  id, kind, lead_id, company_id, product_id, destination_id, customer_id,
  value_cents: value === null ? null : eur(value),
  value_status: value === null ? "pending" : "reported",
  thread_id: null, guide_id: null, pass_through_cents: null, pass_through_state: "unknown",
  currency: "EUR", status, attribution_status: attribution,
  booked_at: at(-daysAgo), starts_on: day(230 - daysAgo),
  completed_at: status === "completed" ? at(-3) : null,
});

export const bookings: Booking[] = [
  booking("ob1", "ol13", C.snowline, P(1), "everest", "ou1", 58000, "confirmed", 20),
  booking("ob2", "ol14", C.cornice, P(6), "ama-dablam", "ou5", 8900, "completed", 25),
  booking("ob3", "ol15", C.verglas, P(7), "mont-blanc", "ou9", 1850, "completed", 31),
  booking("ob4", "ol16", C.kettle, P(10), "denali", "ou3", 9800, "confirmed", 38),
  booking("ob5", "ol17", C.tarn, P(14), "laugavegur-trail", "ou18", 1450, "completed", 46),
  booking("ob6", "ol18", C.cornice, P(5), "manaslu", "ou13", 17500, "confirmed", 52),
  booking("ob7", "ol22", C.arete, P(12), "aconcagua", "ou19", 5400, "disputed", 49, "disputed"),
  booking("ob8", "ol10", C.kettle, P(10), "denali", "ou20", null, "reported", 4),
  booking("ob9", "ol11", C.arete, P(12), "aconcagua", "ou19", null, "reported", 2),
  booking("ob10", "ol7", C.tarn, P(14), "laugavegur-trail", "ou10", 1450, "confirmed", 6),
  booking("ob11", "ol4", C.kettle, P(11), "rainier", "ou3", 1250, "confirmed", 9, "icefall", "guide"),
  booking("ob12", "ol9", C.verglas, P(8), "matterhorn", "ou11", 2400, "confirmed", 11, "external"),
];

/* -------------------------------------------------------------------------- */
/* Commissions and revenue                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A PLACEHOLDER RATE. The operator-side referral fee is genuinely undecided —
 * every other figure here is fiction standing in for data that will exist, and
 * this one is fiction standing in for a decision nobody has made.
 */
const PLACEHOLDER_REFERRAL_BPS = 750;

const commission = (
  id: string, booking_id: string, basis: number, bps: number,
  status: Commission["status"], daysAgo: number, kind: Commission["kind"] = "referral",
): Commission => ({
  id, booking_id, kind, rate_bps: bps, fixed_fee_cents: null,
  basis_cents: eur(basis), amount_cents: Math.round((eur(basis) * bps) / 10000),
  currency: "EUR", status, computed_at: at(-daysAgo),
});

export const commissions: Commission[] = [
  commission("oc1", "ob1", 58000, PLACEHOLDER_REFERRAL_BPS, "invoiced", 20),
  commission("oc2", "ob2", 8900, 600, "paid", 25),
  commission("oc3", "ob3", 1850, PLACEHOLDER_REFERRAL_BPS, "paid", 31),
  commission("oc4", "ob4", 9800, PLACEHOLDER_REFERRAL_BPS, "accrued", 38),
  commission("oc5", "ob5", 1450, 600, "paid", 46),
  commission("oc6", "ob6", 17500, PLACEHOLDER_REFERRAL_BPS, "invoiced", 52),
  commission("oc7", "ob7", 5400, 600, "disputed", 49),
  commission("oc8", "ob10", 1450, PLACEHOLDER_REFERRAL_BPS, "accrued", 6),
  commission("oc9", "ob11", 1250, 1000, "accrued", 9, "guide"),
];

const rev = (
  id: string, stream: RevenueRecord["stream"], company_id: string | null,
  destination_id: string | null, amount: number, status: RevenueRecord["status"], daysAgo: number,
): RevenueRecord => ({
  id, stream, company_id, destination_id, amount_cents: eur(amount),
  currency: "EUR", status, recognised_on: day(-daysAgo),
});

/**
 * Kept inside the current calendar year on purpose — the Companies screen's
 * "Revenue YTD" tile filters to it, and an offset that slips into last year
 * silently reads as zero rather than as absent.
 */
export const revenue: RevenueRecord[] = [
  rev("or1", "placement", C.snowline, "everest", 5000, "collected", 34),
  rev("or2", "placement", C.cornice, "everest", 4500, "collected", 70),
  rev("or3", "placement", C.arete, "everest", 3500, "invoiced", 12),
  rev("or4", "placement", C.kettle, "everest", 3000, "collected", 200),
  rev("or5", "placement", C.cornice, "k2", 3800, "collected", 40),
  rev("or6", "placement", C.snowline, "lhotse", 2900, "collected", 25),
  rev("or7", "placement", C.cornice, "manaslu", 2300, "collected", 66),
  rev("or8", "placement", C.cornice, "ama-dablam", 2100, "collected", 140),
  rev("or9", "placement", C.snowline, "ama-dablam", 1800, "invoiced", 14),
  rev("or10", "placement", C.verglas, "mont-blanc", 2200, "collected", 22),
  rev("or11", "placement", C.verglas, "matterhorn", 2000, "collected", 48),
  rev("or12", "placement", C.tarn, "matterhorn", 1700, "invoiced", 6),
  rev("or13", "placement", C.kettle, "denali", 2600, "collected", 88),
  rev("or14", "placement", C.kettle, "rainier", 1400, "collected", 4),
  rev("or15", "placement", C.arete, "aconcagua", 2400, "collected", 9),
  rev("or16", "placement", C.tarn, "laugavegur-trail", 900, "collected", 18),
  rev("or17", "placement", C.verglas, "tour-du-mont-blanc", 1100, "collected", 30),
  rev("or18", "referral", C.snowline, "everest", 4350, "invoiced", 20),
  rev("or19", "referral", C.cornice, "ama-dablam", 534, "collected", 25),
  rev("or20", "referral", C.verglas, "mont-blanc", 139, "collected", 31),
  rev("or21", "referral", C.kettle, "denali", 735, "accrued", 38),
  rev("or22", "referral", C.tarn, "laugavegur-trail", 87, "collected", 46),
  rev("or23", "referral", C.cornice, "manaslu", 1313, "invoiced", 52),
  rev("or24", "guide_commission", C.kettle, "rainier", 125, "accrued", 9),
  rev("or25", "placement", C.nordkant, "kilimanjaro", 2500, "accrued", 2),
  rev("or26", "other", null, null, 480, "collected", 110),
  rev("or27", "placement", C.snowline, "everest", 5000, "collected", 220),
  rev("or28", "placement", C.verglas, "mont-blanc", 2200, "collected", 180),
  rev("or29", "referral", C.arete, "aconcagua", 324, "written_off", 160),
  rev("or30", "placement", C.tarn, "laugavegur-trail", 900, "collected", 235),
];

/* -------------------------------------------------------------------------- */
/* The sales pipeline                                                         */
/* -------------------------------------------------------------------------- */

const deal = (
  id: string, company_id: string, title: string, stage: Deal["stage"],
  value: number | null, probability: number | null, closeIn: number | null,
  owner: string | null = "s2", contractEndsIn: number | null = null,
  lost_reason: string | null = null,
): Deal => ({
  id, company_id, title, stage,
  estimated_value_cents: value === null ? null : eur(value),
  currency: "EUR", probability_pct: probability, owner_id: owner,
  expected_close_on: closeIn === null ? null : day(closeIn),
  contract_ends_on: contractEndsIn === null ? null : day(contractEndsIn),
  lost_reason,
});

export const deals: Deal[] = [
  deal("od1", C.lantern, "Paper Lantern — first placement", "prospect", 2100, 10, 74),
  deal("od2", C.kettle, "Kettle Peak — Cascades package", "prospect", 3400, null, 88, "s6"),
  deal("od3", C.arete, "Bright Arête — Patagonia positions", "contacted", 4200, 20, 55),
  deal("od4", C.tarn, "Tarn & Tundra — Iceland renewal talks", "conversation", 2700, 35, 41, "s6"),
  deal("od5", C.nordkant, "Nordkant — Kilimanjaro slot #1", "proposal", 2500, 50, 27),
  deal("od6", C.verglas, "Verglas — Matterhorn slot upgrade", "negotiation", 3200, 65, 16),
  deal("od7", C.cornice, "Blue Cornice — K2 season block", "negotiation", 7600, 70, 12, "s6"),
  deal("od8", C.snowline, "Snowline — Everest #1 renewal", "won", 5000, 100, -6, "s2", 331),
  deal("od9", C.kettle, "Kettle Peak — onboarding", "onboarding", 3000, 100, -14, "s6", 190),
  deal("od10", C.snowline, "Snowline — Lhotse #1", "active", 2900, 100, -25, "s2", 340),
  deal("od11", C.verglas, "Verglas — Mont Blanc #1", "active", 2200, 100, -22, "s2", 343),
  deal("od12", C.cornice, "Blue Cornice — Ama Dablam #1", "renewal", 2100, 60, 34, "s6", 225),
  deal("od13", C.tarn, "Tarn & Tundra — Matterhorn #2", "renewal", 1700, 45, 51),
  deal("od14", C.windward, "Windward Col — reinstatement", "lost", 1800, null, -30, "s2", null, "Insurance lapsed and was not renewed."),
  deal("od15", C.arete, "Bright Arête — Aconcagua #2", "lost", 2100, null, -44, "s6", null, "Went direct to the mountain association instead."),
];

/* -------------------------------------------------------------------------- */
/* Tasks the system raised for somebody to action                             */
/* -------------------------------------------------------------------------- */

const task = (
  id: string, kind: string, title: string, detail: string,
  priority: Task["priority"], dueIn: number, desk: Task["desk"],
  entity_type: string | null = "placement", company_id: string | null = null,
): Task => ({
  id, kind, title, detail, entity_type, entity_id: null, company_id, desk,
  priority, status: "open" as const, assigned_to: null, due_on: day(dueIn),
});

export const tasks: Task[] = [
  task("ok1", "placement_expiring", "Position #3 on everest expires in 5 days",
    "The term ends soon. Start the renewal conversation or plan the handover — the position does not change on its own.", "high", 5, "sales"),
  task("ok2", "placement_expired", "Position #4 on everest has passed its term",
    "The term ended 12 days ago. Kettle Peak Guiding still holds this position and will continue to until an administrator moves or cancels the placement. Nothing has changed automatically.", "critical", -12, "operations"),
  task("ok3", "placement_expiring", "Position #1 on manaslu expires in 3 days",
    "Blue Cornice Expeditions. Renewal not yet discussed.", "high", 3, "sales"),
  task("ok4", "content_approval", "7 operator changes awaiting review",
    "Two carry a price change. One is flagged as possibly containing contact details.", "normal", 0, "operations"),
  task("ok5", "document_expiring", "Insurance certificate expires in 24 days",
    "Verglas Mountain Works — public liability. Ask for the renewed certificate before the current one lapses.", "normal", 24, "operations"),
  task("ok6", "unpaid_invoice", "2 invoices past their due date",
    "Bright Arête Expeditions and Kettle Peak Guiding. Finance to chase.", "high", -7, "finance"),
  task("ok7", "disputed_booking", "Booking dispute needs a commercial review",
    "Bright Arête Expeditions contests the attribution on an Aconcagua booking. Referral fee collection is paused until it is resolved.", "critical", -3, "finance"),
  task("ok8", "contract_renewal", "Everest #2 contract renewal due",
    "Blue Cornice Expeditions. The twelve-month term ends next month.", "normal", 19, "sales"),
  task("ok9", "support_escalation", "Support ticket escalated",
    "A climber reports being asked to pay outside ICEFALL.", "critical", 0, "support"),
  task("ok10", "verification", "Onboarding company has submitted no documents",
    "Kettle Peak Guiding has been onboarding for 37 days with nothing uploaded. Verification cannot start.", "normal", 6, "operations", "company", C.kettle),
  task("ok11", "placement_expiring", "Position #1 on rainier expires in 27 days",
    "Kettle Peak Guiding. Their first position — worth a conversation before it lapses.", "low", 27, "sales"),
];

/* -------------------------------------------------------------------------- */
/* The audit log                                                              */
/* -------------------------------------------------------------------------- */

export const auditEvents: AuditEvent[] = [
  { id: "oa1", actor_id: "s1", actor_role: "super_admin", action: "placement.moved", entity_type: "placement", entity_id: "op1",
    previous: { slot_position: 3, destination_id: "everest" }, next: { slot_position: 1, destination_id: "everest" },
    reason: "Agreed at renewal.", created_at: at(0, 9, 12) },
  { id: "oa2", actor_id: "s3", actor_role: "operations", action: "content.approved", entity_type: "product", entity_id: P(2),
    previous: { fields: ["price_from_cents"] }, next: { price_from_cents: eur(39000) }, reason: null, created_at: at(-1, 16, 4) },
  { id: "oa3", actor_id: "s2", actor_role: "sales", action: "placement.created", entity_type: "placement", entity_id: "op15",
    previous: null, next: { destination_id: "rainier", slot_position: 1, status: "active" }, reason: null, created_at: at(-4, 11, 38) },
  { id: "oa4", actor_id: "s3", actor_role: "operations", action: "content.rejected", entity_type: "product", entity_id: P(8),
    previous: null, next: { description: "…" }, reason: "Contains a phone number. Customer contact stays inside ICEFALL.", created_at: at(-5, 14, 22) },
  { id: "oa5", actor_id: "s4", actor_role: "finance", action: "commission.recorded", entity_type: "booking", entity_id: "ob1",
    previous: null, next: { rate_bps: PLACEHOLDER_REFERRAL_BPS, basis_cents: eur(58000), amount_cents: eur(4350) }, reason: null, created_at: at(-20, 10, 5) },
  { id: "oa6", actor_id: "s5", actor_role: "support", action: "ticket.escalated", entity_type: "ticket", entity_id: "otk1",
    previous: { priority: "high" }, next: { priority: "critical" }, reason: "Payment requested outside the marketplace.", created_at: at(-1, 8, 47) },
  { id: "oa7", actor_id: "s1", actor_role: "super_admin", action: "company.suspended", entity_type: "company", entity_id: C.windward,
    previous: { status: "active" }, next: { status: "suspended" }, reason: "Insurance lapsed and not renewed.", created_at: at(-47, 9, 40) },
  { id: "oa8", actor_id: "s3", actor_role: "operations", action: "placement.cancelled", entity_type: "placement", entity_id: "op17",
    previous: { status: "active", slot_position: 2 }, next: { status: "cancelled", slot_position: 2 }, reason: "Term ended, not renewed.", created_at: at(-30, 15, 12) },
  { id: "oa9", actor_id: "s3", actor_role: "operations", action: "document.checked", entity_type: "company", entity_id: C.nordkant,
    previous: { state: "pending" }, next: { state: "checked" }, reason: null, created_at: at(-102, 13, 30) },
  { id: "oa10", actor_id: "s2", actor_role: "sales", action: "deal.stage_changed", entity_type: "deal", entity_id: "od7",
    previous: { stage: "proposal" }, next: { stage: "negotiation" }, reason: "Season block agreed in principle.", created_at: at(-2, 17, 9) },
  { id: "oa11", actor_id: "s4", actor_role: "finance", action: "invoice.issued", entity_type: "invoice", entity_id: "oi5",
    previous: null, next: { number: "INV-20051", total_cents: eur(4350) }, reason: null, created_at: at(-11, 10, 0) },
  { id: "oa12", actor_id: "s1", actor_role: "super_admin", action: "staff.role_changed", entity_type: "staff", entity_id: "s6",
    previous: { staff_role: "support" }, next: { staff_role: "sales" }, reason: "Moved to the sales desk.", created_at: at(-64, 12, 15) },
];

/* -------------------------------------------------------------------------- */
/* Support — tickets, their conversations, and the visitor queue              */
/* -------------------------------------------------------------------------- */

export const tickets: Ticket[] = [
  { id: "otk1", reference: "T-20061", subject: "Asked to pay by bank transfer outside ICEFALL", type: "safety", priority: "critical", status: "investigating",
    customer_id: "ou1", company_id: C.windward, lead_id: null, booking_id: null, assigned_to: "s5",
    requester_kind: "athlete", origin_app: "phone_app", origin_screen: "/company/windward-col-mountaineering",
    requester_email: null, requester_name: "Ines Halvorsen", snippet: null, created_at: at(-1), updated_at: at(0) },
  { id: "otk2", reference: "T-20060", subject: "Departure date moved without notice", type: "booking", priority: "high", status: "open",
    customer_id: "ou3", company_id: C.kettle, lead_id: "ol16", booking_id: "ob4", assigned_to: "s5",
    requester_kind: "athlete", origin_app: "web", origin_screen: "/bookings",
    requester_email: null, requester_name: "Ruth Ackerman", snippet: null, created_at: at(-2), updated_at: at(-1) },
  { id: "otk3", reference: "T-20059", subject: "Referral fee disputed on the Aconcagua booking", type: "payment", priority: "high", status: "waiting_on_company",
    customer_id: null, company_id: C.arete, lead_id: "ol22", booking_id: "ob7", assigned_to: "s4",
    requester_kind: "company", origin_app: "operator_portal", origin_screen: "/billing",
    requester_email: null, requester_name: "Bright Arête Expeditions", snippet: null, created_at: at(-4), updated_at: at(-2) },
  { id: "otk4", reference: "T-20058", subject: "Trek description contains a phone number", type: "content", priority: "medium", status: "resolved",
    customer_id: null, company_id: C.verglas, lead_id: null, booking_id: null, assigned_to: "s3",
    requester_kind: "staff", origin_app: "crm", origin_screen: "/admin/approvals",
    requester_email: null, requester_name: "Nadine Roth", snippet: null, created_at: at(-6), updated_at: at(-3) },
  { id: "otk5", reference: "T-20057", subject: "Cannot upload the insurance certificate", type: "technical", priority: "low", status: "open",
    customer_id: null, company_id: C.verglas, lead_id: null, booking_id: null, assigned_to: null,
    requester_kind: "company", origin_app: "operator_portal", origin_screen: "/verification",
    requester_email: null, requester_name: "Verglas Mountain Works", snippet: null, created_at: at(-8), updated_at: at(-8) },
  { id: "otk6", reference: "T-20056", subject: "Guide carnet has not been reviewed", type: "verification", priority: "medium", status: "waiting_on_customer",
    customer_id: null, company_id: null, lead_id: null, booking_id: null, assigned_to: "s3",
    requester_kind: "guide", origin_app: "guide_app", origin_screen: "/profile",
    requester_email: null, requester_name: "Kaspar Lindholm", snippet: null, created_at: at(-10), updated_at: at(-5) },
  { id: "otk7", reference: "T-20055", subject: "Which operators run Ama Dablam in November?", type: "other", priority: "low", status: "closed",
    customer_id: null, company_id: null, lead_id: null, booking_id: null, assigned_to: "s5",
    requester_kind: "visitor", origin_app: "web", origin_screen: "/mountains/ama-dablam",
    requester_email: "curious.walker@example.com", requester_name: "Ottilie Vance", snippet: null, created_at: at(-14), updated_at: at(-12) },
  { id: "otk8", reference: "T-20054", subject: "Slot invoice shows the wrong term dates", type: "account", priority: "medium", status: "open",
    customer_id: null, company_id: C.tarn, lead_id: null, booking_id: null, assigned_to: "s4",
    requester_kind: "company", origin_app: "operator_portal", origin_screen: "/invoices",
    requester_email: null, requester_name: "Tarn & Tundra Treks", snippet: null, created_at: at(-3), updated_at: at(-1) },
];

const msg = (
  id: string, ticket_id: string, author_id: string, author_name: string | null,
  body: string, internal: boolean, daysAgo: number, hour = 11,
): TicketMessage => ({ id, ticket_id, author_id, author_name, body, internal, created_at: at(-daysAgo, hour, 3) });

/** Keyed by ticket so a ticket always opens onto a conversation, never a void. */
export const ticketMessages: Record<string, TicketMessage[]> = {
  otk1: [
    msg("om1", "otk1", "ou1", "Ines Halvorsen", "The operator sent me bank details in a message and said the price is lower if I pay them directly rather than through ICEFALL. Is that normal? I have not sent anything yet.", false, 1, 8),
    msg("om2", "otk1", "s5", "Priya Raghunathan", "Thank you for telling us, and no — that is not normal and you should not pay it. Nothing you book through ICEFALL is ever settled by private transfer. Please do not send the money and keep the message.", false, 1, 9),
    msg("om3", "otk1", "s5", "Priya Raghunathan", "Escalated to critical. Company already suspended for a lapsed certificate — flagging to Alex before we decide whether this is a delisting.", true, 1, 9),
    msg("om4", "otk1", "ou1", "Ines Halvorsen", "Understood, I have not paid. Happy to forward the screenshots if that helps.", false, 0, 8),
  ],
  otk2: [
    msg("om5", "otk2", "ou3", "Ruth Ackerman", "My Denali departure moved by nine days and I found out from the itinerary PDF, not from anybody. I have flights booked around the original dates.", false, 2, 15),
    msg("om6", "otk2", "s5", "Priya Raghunathan", "That should not have happened silently. I have asked the operator for the reason and for what they can do about the flights — I will come back to you either way by the end of tomorrow.", false, 2, 17),
    msg("om7", "otk2", "s5", "Priya Raghunathan", "Second date change from this operator in a month. Worth a look at their scheduling before the season.", true, 1, 9),
  ],
  otk3: [
    msg("om8", "otk3", "s4", "Marek Duval", "You have disputed the referral fee on this booking. Our record shows the enquiry arriving through the mountain page on 14th. What is your side of it?", false, 4, 10),
    msg("om9", "otk3", "s4", "Marek Duval", "Fee collection paused while this is open. Do not chase the invoice.", true, 4, 10),
    msg("om10", "otk3", "s3", "Nadine Roth", "The climber says they had already emailed the operator before finding them here. Both can be true — waiting on the operator's thread export.", true, 2, 14),
  ],
  otk4: [
    msg("om11", "otk4", "s3", "Nadine Roth", "The Haute Route description submitted this morning has a phone number in the last paragraph. Rejecting with a reason rather than editing it for them.", false, 6, 9),
    msg("om12", "otk4", "s3", "Nadine Roth", "Rejected and explained. The operator resubmitted without it — resolved.", false, 3, 16),
  ],
  otk5: [
    msg("om13", "otk5", "s2", "Verglas Mountain Works", "The upload spins and then nothing happens. PDF, about 4 MB, from the portal on Safari.", false, 8, 13),
  ],
  otk6: [
    msg("om14", "otk6", "s2", "Kaspar Lindholm", "I uploaded my carnet three weeks ago and my profile still says pending. Is anything else needed from me?", false, 10, 10),
    msg("om15", "otk6", "s3", "Nadine Roth", "Nothing else is needed from you. To be straight about it: nobody has looked at it yet — ICEFALL checks documents by hand and the queue is behind. It is not lost and you have not been refused.", false, 5, 11),
  ],
  otk7: [
    msg("om16", "otk7", "ov3", "Ottilie Vance", "Is anyone running Ama Dablam in November, or is it all October?", false, 14, 12),
    msg("om17", "otk7", "s5", "Priya Raghunathan", "Two of the operators listed on that page run November departures. I have sent you the two listings — no recommendation from us, just what is on the page.", false, 12, 15),
  ],
  otk8: [
    msg("om18", "otk8", "s2", "Tarn & Tundra Treks", "Our Matterhorn #2 invoice shows the term starting the 1st. We agreed the 6th. The amount is right, the dates are not.", false, 3, 9),
    msg("om19", "otk8", "s4", "Marek Duval", "You are right, the term on the invoice does not match the placement. Reissuing it with the correct dates today — no change to the amount.", false, 1, 10),
  ],
};

export const intake: IntakeRequest[] = [
  { id: "oin1", created_at: at(-1, 7, 42), email: "hanne.dal@example.com", name: "Hanne Dal",
    subject: "Do you sell the expeditions yourselves?",
    body: "I cannot tell from the site whether I book with ICEFALL or with the company. Who takes my money and who is responsible if the trip is cancelled?",
    origin_app: "web", origin_screen: "/mountains/everest", handled_at: null, ticket_id: null },
  { id: "oin2", created_at: at(-2, 19, 8), email: "j.arden@example.com", name: "Jonah Arden",
    subject: "Operator asked me to sign a waiver I do not understand",
    body: "The waiver mentions helicopter evacuation costs being mine. Is that standard? I have not signed it.",
    origin_app: "web", origin_screen: "/company/blue-cornice-expeditions", handled_at: null, ticket_id: null },
  { id: "oin3", created_at: at(-3, 11, 25), email: "team@alpineclub.example.org", name: "Rosalind Pike",
    subject: "Group booking for eleven climbers",
    body: "We are a university club looking at Mont Blanc next July. Is there a group rate, and do you handle the insurance side?",
    origin_app: "web", origin_screen: "/mountains/mont-blanc", handled_at: null, ticket_id: null },
  { id: "oin4", created_at: at(-5, 9, 2), email: "guides@granitework.example.com", name: "Ewan Tobiassen",
    subject: "How do guides get listed?",
    body: "I am IFMGA qualified and work mostly in Norway. What does ICEFALL need from me to appear on the guide side?",
    origin_app: "web", origin_screen: "/guides", handled_at: null, ticket_id: null },
  { id: "oin5", created_at: at(-14, 12, 0), email: "curious.walker@example.com", name: "Ottilie Vance",
    subject: "Which operators run Ama Dablam in November?",
    body: "Is anyone running Ama Dablam in November, or is it all October?",
    origin_app: "web", origin_screen: "/mountains/ama-dablam", handled_at: at(-14, 12, 30), ticket_id: "otk7" },
];

/* -------------------------------------------------------------------------- */
/* Verification documents                                                     */
/* -------------------------------------------------------------------------- */

export const documents: VerificationDocument[] = [
  { id: "ovd1", subject_type: "company", subject_id: C.snowline, subject_name: companyName(C.snowline), kind: "insurance", label: "Public liability — current year", state: "checked", issued_on: day(-290), expires_on: day(72), checked_on: day(-58), checked_by: "Alex Christofis", note: null },
  { id: "ovd2", subject_type: "company", subject_id: C.snowline, subject_name: companyName(C.snowline), kind: "business_registration", label: "Company registration", state: "checked", issued_on: day(-1500), expires_on: null, checked_on: day(-58), checked_by: "Alex Christofis", note: null },
  { id: "ovd3", subject_type: "company", subject_id: C.nordkant, subject_name: companyName(C.nordkant), kind: "insurance", label: "Public liability — current year", state: "checked", issued_on: day(-260), expires_on: day(104), checked_on: day(-102), checked_by: "Nadine Roth", note: null },
  { id: "ovd4", subject_type: "company", subject_id: C.cornice, subject_name: companyName(C.cornice), kind: "certification", label: "High-altitude first aid — team", state: "checked", issued_on: day(-420), expires_on: day(310), checked_on: day(-171), checked_by: "Alex Christofis", note: null },
  { id: "ovd5", subject_type: "company", subject_id: C.verglas, subject_name: companyName(C.verglas), kind: "insurance", label: "Public liability — current year", state: "checked", issued_on: day(-340), expires_on: day(24), checked_on: day(-33), checked_by: "Nadine Roth", note: "Renewal requested." },
  { id: "ovd6", subject_type: "company", subject_id: C.verglas, subject_name: companyName(C.verglas), kind: "licence", label: "Guiding licence — Haute-Savoie", state: "pending", issued_on: day(-115), expires_on: day(420), checked_on: null, checked_by: null, note: null },
  { id: "ovd7", subject_type: "company", subject_id: C.kettle, subject_name: companyName(C.kettle), kind: "business_registration", label: "State registration", state: "pending", issued_on: day(-90), expires_on: null, checked_on: null, checked_by: null, note: "Submitted. ICEFALL has not checked this document." },
  { id: "ovd8", subject_type: "company", subject_id: C.windward, subject_name: companyName(C.windward), kind: "insurance", label: "Public liability — last year", state: "expired", issued_on: day(-730), expires_on: day(-47), checked_on: day(-380), checked_by: "Alex Christofis", note: "Lapsed and not renewed. Company suspended." },
  { id: "ovd9", subject_type: "company", subject_id: C.arete, subject_name: companyName(C.arete), kind: "certification", label: "Wilderness first aid — team", state: "rejected", issued_on: day(-520), expires_on: day(-40), checked_on: day(-28), checked_by: "Nadine Roth", note: "The certificate had already expired when it was submitted." },
  { id: "ovd10", subject_type: "guide", subject_id: "og1", subject_name: "Kaspar Lindholm", kind: "certification", label: "IFMGA carnet", state: "pending", issued_on: null, expires_on: null, checked_on: null, checked_by: null, note: "Submitted. ICEFALL has not checked this document." },
  { id: "ovd11", subject_type: "guide", subject_id: "og2", subject_name: "Dawa Gyaltsen", kind: "insurance", label: "Professional indemnity", state: "checked", issued_on: day(-210), expires_on: day(150), checked_on: day(-198), checked_by: "Nadine Roth", note: null },
  { id: "ovd12", subject_type: "guide", subject_id: "og3", subject_name: "Colette Pernet", kind: "identity", label: "Identity document", state: "checked", issued_on: day(-1100), expires_on: day(900), checked_on: day(-140), checked_by: "Alex Christofis", note: null },
];

/* -------------------------------------------------------------------------- */
/* People — ICEFALL's own desks, and the guides                               */
/* -------------------------------------------------------------------------- */

export const staff: StaffRecord[] = [
  { profile_id: "s1", name: "Alex Christofis", email: "alex@icefall.example", staff_role: "super_admin", department: "Management", active: true, support_scopes: [], joined_on: day(-760) },
  { profile_id: "s2", name: "Rosa Ellingsen", email: "rosa@icefall.example", staff_role: "sales", department: "Sales", active: true, support_scopes: [], joined_on: day(-455) },
  { profile_id: "s3", name: "Nadine Roth", email: "nadine@icefall.example", staff_role: "operations", department: "Operations", active: true, support_scopes: [], joined_on: day(-402) },
  { profile_id: "s4", name: "Marek Duval", email: "marek@icefall.example", staff_role: "finance", department: "Finance", active: true, support_scopes: [], joined_on: day(-268) },
  { profile_id: "s5", name: "Priya Raghunathan", email: "priya@icefall.example", staff_role: "support", department: "Support", active: true, support_scopes: [], joined_on: day(-151) },
  { profile_id: "s6", name: "Tobias Wren", email: "tobias@icefall.example", staff_role: "sales", department: "Sales", active: true, support_scopes: [], joined_on: day(-64) },
  { profile_id: "s7", name: "Hallie Frost", email: "hallie@icefall.example", staff_role: "support", department: "Support", active: false, support_scopes: [], joined_on: day(-590) },
];

/** ICEFALL verifies nothing about credentials yet — the field is constrained false. */
export const guides: GuideRecord[] = [
  { id: "og1", name: "Kaspar Lindholm", based_in: "Norway", mountains: ["matterhorn", "mont-blanc"], credentials_verified: false, documents_checked_on: null, leads: 5, bookings: 2, revenue_cents: eur(312), listed: true },
  { id: "og2", name: "Dawa Gyaltsen", based_in: "Nepal", mountains: ["everest", "ama-dablam", "lhotse"], credentials_verified: false, documents_checked_on: day(-198), leads: 9, bookings: 4, revenue_cents: eur(588), listed: true },
  { id: "og3", name: "Colette Pernet", based_in: "France", mountains: ["mont-blanc"], credentials_verified: false, documents_checked_on: day(-140), leads: 3, bookings: 1, revenue_cents: eur(96), listed: true },
  { id: "og4", name: "Bruno Salgado", based_in: "Argentina", mountains: ["aconcagua"], credentials_verified: false, documents_checked_on: null, leads: 2, bookings: 0, revenue_cents: null, listed: true },
  { id: "og5", name: "Maeve Donnelly", based_in: "Ireland", mountains: ["rainier", "denali"], credentials_verified: false, documents_checked_on: null, leads: 1, bookings: 1, revenue_cents: eur(125), listed: true },
  { id: "og6", name: "Sigrún Jónsdóttir", based_in: "Iceland", mountains: ["laugavegur-trail"], credentials_verified: false, documents_checked_on: null, leads: 1, bookings: 0, revenue_cents: null, listed: false },
];

/* -------------------------------------------------------------------------- */
/* Billing                                                                    */
/* -------------------------------------------------------------------------- */

export const invoices: Invoice[] = [
  { id: "oi1", number: "INV-20055", company_id: C.snowline, kind: "placement", placement_id: "op1", amount_cents: eur(5000), currency: "EUR", status: "paid", issued_on: day(-34), due_on: day(-20), paid_on: day(-22) },
  { id: "oi2", number: "INV-20054", company_id: C.cornice, kind: "placement", placement_id: "op6", amount_cents: eur(3800), currency: "EUR", status: "paid", issued_on: day(-40), due_on: day(-26), paid_on: day(-28) },
  { id: "oi3", number: "INV-20053", company_id: C.arete, kind: "placement", placement_id: "op3", amount_cents: eur(3500), currency: "EUR", status: "overdue", issued_on: day(-26), due_on: day(-12), paid_on: null },
  { id: "oi4", number: "INV-20052", company_id: C.kettle, kind: "placement", placement_id: "op14", amount_cents: eur(2600), currency: "EUR", status: "overdue", issued_on: day(-21), due_on: day(-7), paid_on: null },
  { id: "oi5", number: "INV-20051", company_id: C.snowline, kind: "referral", placement_id: null, amount_cents: eur(4350), currency: "EUR", status: "sent", issued_on: day(-11), due_on: day(3), paid_on: null },
  { id: "oi6", number: "INV-20050", company_id: C.verglas, kind: "placement", placement_id: "op11", amount_cents: eur(2200), currency: "EUR", status: "paid", issued_on: day(-22), due_on: day(-8), paid_on: day(-10) },
  { id: "oi7", number: "INV-20049", company_id: C.tarn, kind: "placement", placement_id: "op19", amount_cents: eur(900), currency: "EUR", status: "paid", issued_on: day(-18), due_on: day(-4), paid_on: day(-6) },
  { id: "oi8", number: "INV-20048", company_id: C.arete, kind: "referral", placement_id: null, amount_cents: eur(324), currency: "EUR", status: "void", issued_on: day(-49), due_on: day(-35), paid_on: null },
  { id: "oi9", number: "INV-20047", company_id: C.cornice, kind: "referral", placement_id: null, amount_cents: eur(1313), currency: "EUR", status: "sent", issued_on: day(-9), due_on: day(5), paid_on: null },
  { id: "oi10", number: "INV-20046", company_id: C.nordkant, kind: "placement", placement_id: "op18", amount_cents: eur(2500), currency: "EUR", status: "draft", issued_on: day(-2), due_on: day(12), paid_on: null },
  { id: "oi11", number: "INV-20045", company_id: C.verglas, kind: "placement", placement_id: "op12", amount_cents: eur(2000), currency: "EUR", status: "paid", issued_on: day(-48), due_on: day(-34), paid_on: day(-36) },
];

export const payments: Payment[] = [
  { id: "opay1", invoice_id: "oi1", company_id: C.snowline, amount_cents: eur(5000), currency: "EUR", method: "bank_transfer", received_on: day(-22), reference: "SNW-2026-118" },
  { id: "opay2", invoice_id: "oi2", company_id: C.cornice, amount_cents: eur(3800), currency: "EUR", method: "bank_transfer", received_on: day(-28), reference: "BCE-40712" },
  { id: "opay3", invoice_id: "oi6", company_id: C.verglas, amount_cents: eur(2200), currency: "EUR", method: "bank_transfer", received_on: day(-10), reference: "VMW-0091" },
  { id: "opay4", invoice_id: "oi7", company_id: C.tarn, amount_cents: eur(900), currency: "EUR", method: "card", received_on: day(-6), reference: "TT-CARD-3318" },
  { id: "opay5", invoice_id: "oi11", company_id: C.verglas, amount_cents: eur(2000), currency: "EUR", method: "bank_transfer", received_on: day(-36), reference: "VMW-0088" },
];

/* -------------------------------------------------------------------------- */
/* Company access — who can sign in, and who has been invited                 */
/* -------------------------------------------------------------------------- */

export const companyMembers: Record<string, CompanyMember[]> = {
  [C.snowline]: [
    { profile_id: "cm1", name: "Tenzing Ongdi", company_role: "admin", status: "active" },
    { profile_id: "cm2", name: "Rhea Sundaram", company_role: "sales", status: "active" },
  ],
  [C.nordkant]: [{ profile_id: "cm3", name: "Anders Vik", company_role: "admin", status: "active" }],
  [C.cornice]: [
    { profile_id: "cm4", name: "Sabiha Karim", company_role: "admin", status: "active" },
    { profile_id: "cm5", name: "Joost Bakker", company_role: "sales", status: "active" },
  ],
  [C.verglas]: [{ profile_id: "cm6", name: "Léa Marchand", company_role: "admin", status: "active" }],
  [C.tarn]: [{ profile_id: "cm7", name: "Sigrún Jónsdóttir", company_role: "admin", status: "active" }],
  [C.arete]: [{ profile_id: "cm8", name: "Renata Ocampo", company_role: "admin", status: "active" }],
  [C.windward]: [{ profile_id: "cm9", name: "Gareth Pryce", company_role: "admin", status: "suspended" }],
};

export const companyInvitations: Record<string, CompanyInvitation[]> = {
  [C.snowline]: [
    { id: "oiv1", email: "operations@snowline.example", company_role: "sales", created_at: at(-9), expires_at: at(5), accepted_at: null, revoked_at: null },
  ],
  [C.kettle]: [
    { id: "oiv2", email: "dana@kettlepeak.example", company_role: "admin", created_at: at(-4), expires_at: at(10), accepted_at: null, revoked_at: null },
    { id: "oiv3", email: "old.address@kettlepeak.example", company_role: "sales", created_at: at(-30), expires_at: at(-16), accepted_at: null, revoked_at: at(-25) },
  ],
  [C.verglas]: [
    { id: "oiv4", email: "bureau@verglas.example", company_role: "sales", created_at: at(-60), expires_at: at(-46), accepted_at: at(-58), revoked_at: null },
  ],
  [C.lantern]: [
    { id: "oiv5", email: "hello@paperlantern.example", company_role: "admin", created_at: at(-2), expires_at: at(12), accepted_at: null, revoked_at: null },
  ],
};

/* -------------------------------------------------------------------------- */
/* Destinations — the placeable catalogue                                      */
/* -------------------------------------------------------------------------- */

/**
 * REAL mountains and treks with published elevations, keyed by the slugs the
 * consumer apps and `public/img/destinations/*.jpg` already use. A subset of the
 * full catalogue: every mountain, and one trek in three, which is enough to
 * search, filter and page through for a long flight without carrying the whole
 * 304-row extract twice.
 */
export const destinations: Mountain[] = [
  { id: "everest", name: "Mount Everest", kind: "mountain", range: "Mahalangur Himal", region: "Himalaya & Asia", country: "Nepal / China", elevation_m: 8849, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "k2", name: "K2", kind: "mountain", range: "Karakoram", region: "Himalaya & Asia", country: "Pakistan / China", elevation_m: 8611, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "kangchenjunga", name: "Kangchenjunga", kind: "mountain", range: "Kangchenjunga Himal", region: "Himalaya & Asia", country: "Nepal / India", elevation_m: 8586, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "lhotse", name: "Lhotse", kind: "mountain", range: "Mahalangur Himal", region: "Himalaya & Asia", country: "Nepal / China", elevation_m: 8516, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "makalu", name: "Makalu", kind: "mountain", range: "Mahalangur Himal", region: "Himalaya & Asia", country: "Nepal / China", elevation_m: 8485, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "cho-oyu", name: "Cho Oyu", kind: "mountain", range: "Mahalangur Himal", region: "Himalaya & Asia", country: "Nepal / China", elevation_m: 8188, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "dhaulagiri", name: "Dhaulagiri I", kind: "mountain", range: "Dhaulagiri Himal", region: "Himalaya & Asia", country: "Nepal", elevation_m: 8167, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "manaslu", name: "Manaslu", kind: "mountain", range: "Mansiri Himal", region: "Himalaya & Asia", country: "Nepal", elevation_m: 8163, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "nanga-parbat", name: "Nanga Parbat", kind: "mountain", range: "Himalaya", region: "Himalaya & Asia", country: "Pakistan", elevation_m: 8126, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "annapurna", name: "Annapurna I", kind: "mountain", range: "Annapurna Himal", region: "Himalaya & Asia", country: "Nepal", elevation_m: 8091, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "gasherbrum-i", name: "Gasherbrum I", kind: "mountain", range: "Karakoram", region: "Himalaya & Asia", country: "Pakistan / China", elevation_m: 8080, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "broad-peak", name: "Broad Peak", kind: "mountain", range: "Karakoram", region: "Himalaya & Asia", country: "Pakistan / China", elevation_m: 8051, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "gasherbrum-ii", name: "Gasherbrum II", kind: "mountain", range: "Karakoram", region: "Himalaya & Asia", country: "Pakistan / China", elevation_m: 8035, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "shishapangma", name: "Shishapangma", kind: "mountain", range: "Jugal Himal", region: "Himalaya & Asia", country: "China", elevation_m: 8027, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "muztagh-tower", name: "Muztagh Tower", kind: "mountain", range: "Karakoram", region: "Himalaya & Asia", country: "Pakistan / China", elevation_m: 7276, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "lenin-peak", name: "Lenin Peak", kind: "mountain", range: "Trans-Alay", region: "Himalaya & Asia", country: "Kyrgyzstan / Tajikistan", elevation_m: 7134, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "baruntse", name: "Baruntse", kind: "mountain", range: "Mahalangur Himal", region: "Himalaya & Asia", country: "Nepal", elevation_m: 7129, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "himlung-himal", name: "Himlung Himal", kind: "mountain", range: "Peri Himal", region: "Himalaya & Asia", country: "Nepal", elevation_m: 7126, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "khan-tengri", name: "Khan Tengri", kind: "mountain", range: "Tian Shan", region: "Himalaya & Asia", country: "Kazakhstan / Kyrgyzstan", elevation_m: 7010, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "ama-dablam", name: "Ama Dablam", kind: "mountain", range: "Mahalangur Himal", region: "Himalaya & Asia", country: "Nepal", elevation_m: 6814, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "kailash", name: "Mount Kailash", kind: "mountain", range: "Gangdise", region: "Himalaya & Asia", country: "China", elevation_m: 6638, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "mera-peak", name: "Mera Peak", kind: "mountain", range: "Mahalangur Himal", region: "Himalaya & Asia", country: "Nepal", elevation_m: 6476, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "island-peak", name: "Island Peak", kind: "mountain", range: "Mahalangur Himal", region: "Himalaya & Asia", country: "Nepal", elevation_m: 6189, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "lobuche-east", name: "Lobuche East", kind: "mountain", range: "Mahalangur Himal", region: "Himalaya & Asia", country: "Nepal", elevation_m: 6119, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "aconcagua", name: "Aconcagua", kind: "mountain", range: "Andes", region: "Americas", country: "Argentina", elevation_m: 6961, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "ojos-del-salado", name: "Ojos del Salado", kind: "mountain", range: "Andes", region: "Americas", country: "Chile / Argentina", elevation_m: 6893, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "huascaran", name: "Huascar\u00e1n", kind: "mountain", range: "Cordillera Blanca", region: "Americas", country: "Peru", elevation_m: 6768, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "chimborazo", name: "Chimborazo", kind: "mountain", range: "Andes", region: "Americas", country: "Ecuador", elevation_m: 6263, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "denali", name: "Denali", kind: "mountain", range: "Alaska Range", region: "Americas", country: "United States", elevation_m: 6190, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "logan", name: "Mount Logan", kind: "mountain", range: "Saint Elias Mountains", region: "Americas", country: "Canada", elevation_m: 5959, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "alpamayo", name: "Alpamayo", kind: "mountain", range: "Cordillera Blanca", region: "Americas", country: "Peru", elevation_m: 5947, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "cotopaxi", name: "Cotopaxi", kind: "mountain", range: "Andes", region: "Americas", country: "Ecuador", elevation_m: 5897, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "rainier", name: "Mount Rainier", kind: "mountain", range: "Cascades", region: "Americas", country: "United States", elevation_m: 4392, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "baker", name: "Mount Baker", kind: "mountain", range: "Cascades", region: "Americas", country: "United States", elevation_m: 3286, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "elbrus", name: "Mount Elbrus", kind: "mountain", range: "Caucasus", region: "Europe", country: "Russia", elevation_m: 5642, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "dykh-tau", name: "Dykh-Tau", kind: "mountain", range: "Caucasus", region: "Europe", country: "Russia", elevation_m: 5205, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "ararat", name: "Mount Ararat", kind: "mountain", range: "Armenian Highlands", region: "Europe", country: "Turkey", elevation_m: 5137, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "kazbek", name: "Mount Kazbek", kind: "mountain", range: "Caucasus", region: "Europe", country: "Georgia / Russia", elevation_m: 5054, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "mont-blanc", name: "Mont Blanc", kind: "mountain", range: "Graian Alps", region: "Europe", country: "France / Italy", elevation_m: 4806, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "matterhorn", name: "Matterhorn", kind: "mountain", range: "Pennine Alps", region: "Europe", country: "Switzerland / Italy", elevation_m: 4478, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "eiger", name: "Eiger", kind: "mountain", range: "Bernese Alps", region: "Europe", country: "Switzerland", elevation_m: 3967, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "grossglockner", name: "Grossglockner", kind: "mountain", range: "Hohe Tauern", region: "Europe", country: "Austria", elevation_m: 3798, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "kilimanjaro", name: "Mount Kilimanjaro", kind: "mountain", range: "Eastern Rift", region: "Africa", country: "Tanzania", elevation_m: 5895, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "mount-kenya", name: "Mount Kenya", kind: "mountain", range: "Eastern Rift", region: "Africa", country: "Kenya", elevation_m: 5199, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "stanley", name: "Mount Stanley", kind: "mountain", range: "Rwenzori", region: "Africa", country: "Uganda / DR Congo", elevation_m: 5109, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "speke", name: "Mount Speke", kind: "mountain", range: "Rwenzori", region: "Africa", country: "Uganda", elevation_m: 4890, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "toubkal", name: "Mount Toubkal", kind: "mountain", range: "High Atlas", region: "Africa", country: "Morocco", elevation_m: 4167, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "vinson", name: "Vinson Massif", kind: "mountain", range: "Sentinel Range", region: "Oceania & Antarctica", country: "Antarctica", elevation_m: 4892, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "carstensz", name: "Carstensz Pyramid", kind: "mountain", range: "Sudirman Range", region: "Oceania & Antarctica", country: "Indonesia", elevation_m: 4884, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "aoraki", name: "Aoraki / Mount Cook", kind: "mountain", range: "Southern Alps", region: "Oceania & Antarctica", country: "New Zealand", elevation_m: 3724, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "fuji", name: "Mount Fuji", kind: "mountain", range: "Fuji Volcanic Zone", region: "Himalaya & Asia", country: "Japan", elevation_m: 3776, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "kosciuszko", name: "Mount Kosciuszko", kind: "mountain", range: "Snowy Mountains", region: "Oceania & Antarctica", country: "Australia", elevation_m: 2228, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "tour-du-mont-blanc", name: "Tour du Mont Blanc", kind: "trek", range: null, region: "alps", country: "France / Italy / Switzerland", elevation_m: null, max_altitude_m: 2665, duration_days_min: 10, duration_days_max: 11, distance_km: null, listed: true },
  { id: "tour-du-matterhorn", name: "Tour du Matterhorn", kind: "trek", range: null, region: "alps", country: "Switzerland / Italy", elevation_m: null, max_altitude_m: 3295, duration_days_min: 9, duration_days_max: 11, distance_km: null, listed: true },
  { id: "tour-du-queyras", name: "Tour du Queyras", kind: "trek", range: null, region: "alps", country: "France", elevation_m: null, max_altitude_m: 2884, duration_days_min: 8, duration_days_max: 10, distance_km: null, listed: true },
  { id: "berlin-high-trail", name: "Berlin High Trail", kind: "trek", range: null, region: "alps", country: "Austria", elevation_m: null, max_altitude_m: 3134, duration_days_min: 7, duration_days_max: 8, distance_km: null, listed: true },
  { id: "e5-alpine-crossing", name: "E5 Alpine Crossing", kind: "trek", range: null, region: "alps", country: "Germany / Austria / Italy", elevation_m: null, max_altitude_m: 2995, duration_days_min: 6, duration_days_max: 8, distance_km: null, listed: true },
  { id: "chimborazo-circuit", name: "Chimborazo Circuit", kind: "trek", range: null, region: "andes-north", country: "Ecuador", elevation_m: null, max_altitude_m: 4800, duration_days_min: 4, duration_days_max: 5, distance_km: null, listed: true },
  { id: "condoriri-trek", name: "Condoriri Trek", kind: "trek", range: null, region: "andes-north", country: "Bolivia", elevation_m: null, max_altitude_m: 5100, duration_days_min: 3, duration_days_max: 5, distance_km: null, listed: true },
  { id: "cotopaxi-base-camp-and-refuge-trek", name: "Cotopaxi Base Camp and Refuge Trek", kind: "trek", range: null, region: "andes-north", country: "Ecuador", elevation_m: null, max_altitude_m: 4864, duration_days_min: 2, duration_days_max: 2, distance_km: null, listed: true },
  { id: "ingapirca-inca-trail", name: "Ingapirca Inca Trail", kind: "trek", range: null, region: "andes-north", country: "Ecuador", elevation_m: null, max_altitude_m: 4400, duration_days_min: 3, duration_days_max: 3, distance_km: null, listed: true },
  { id: "sajama-circuit", name: "Sajama Circuit", kind: "trek", range: null, region: "andes-north", country: "Bolivia", elevation_m: null, max_altitude_m: 4900, duration_days_min: 4, duration_days_max: 5, distance_km: null, listed: true },
  { id: "annapurna-circuit-trek", name: "Annapurna Circuit Trek", kind: "trek", range: null, region: "annapurna", country: "Nepal", elevation_m: null, max_altitude_m: 5416, duration_days_min: 12, duration_days_max: 20, distance_km: null, listed: true },
  { id: "annapurna-sanctuary-trek", name: "Annapurna Sanctuary Trek", kind: "trek", range: null, region: "annapurna", country: "Nepal", elevation_m: null, max_altitude_m: 4130, duration_days_min: 9, duration_days_max: 14, distance_km: null, listed: true },
  { id: "khopra-ridge-trek", name: "Khopra Ridge Trek", kind: "trek", range: null, region: "annapurna", country: "Nepal", elevation_m: null, max_altitude_m: 3660, duration_days_min: 6, duration_days_max: 9, distance_km: null, listed: true },
  { id: "jomsom-muktinath-trek", name: "Jomsom\u2013Muktinath Trek", kind: "trek", range: null, region: "annapurna", country: "Nepal", elevation_m: null, max_altitude_m: 3762, duration_days_min: 5, duration_days_max: 10, distance_km: null, listed: true },
  { id: "mgoun-massif-trek", name: "M'Goun Massif Trek", kind: "trek", range: null, region: "atlas", country: "Morocco", elevation_m: null, max_altitude_m: 4071, duration_days_min: 5, duration_days_max: 7, distance_km: null, listed: true },
  { id: "bibbulmun-track", name: "Bibbulmun Track", kind: "trek", range: null, region: "australia", country: "Australia", elevation_m: null, max_altitude_m: 582, duration_days_min: 42, duration_days_max: 56, distance_km: null, listed: true },
  { id: "heysen-trail", name: "Heysen Trail", kind: "trek", range: null, region: "australia", country: "Australia", elevation_m: null, max_altitude_m: null, duration_days_min: 50, duration_days_max: 60, distance_km: null, listed: true },
  { id: "overland-track", name: "Overland Track", kind: "trek", range: null, region: "australia", country: "Australia", elevation_m: null, max_altitude_m: 1250, duration_days_min: 6, duration_days_max: 6, distance_km: null, listed: true },
  { id: "thorsborne-trail", name: "Thorsborne Trail", kind: "trek", range: null, region: "australia", country: "Australia", elevation_m: null, max_altitude_m: null, duration_days_min: 3, duration_days_max: 4, distance_km: null, listed: true },
  { id: "bumthang-owl-trek", name: "Bumthang Owl Trek", kind: "trek", range: null, region: "bhutan", country: "Bhutan", elevation_m: null, max_altitude_m: 3870, duration_days_min: 3, duration_days_max: 3, distance_km: null, listed: true },
  { id: "jomolhari-trek", name: "Jomolhari Trek", kind: "trek", range: null, region: "bhutan", country: "Bhutan", elevation_m: null, max_altitude_m: 4930, duration_days_min: 6, duration_days_max: 9, distance_km: null, listed: true },
  { id: "nabji-korphu-trail", name: "Nabji Korphu Trail", kind: "trek", range: null, region: "bhutan", country: "Bhutan", elevation_m: null, max_altitude_m: 1636, duration_days_min: 3, duration_days_max: 4, distance_km: null, listed: true },
  { id: "ala-archa-trek", name: "Ala Archa Trek", kind: "trek", range: null, region: "central-asia", country: "Kyrgyzstan", elevation_m: null, max_altitude_m: 3400, duration_days_min: 1, duration_days_max: 2, distance_km: null, listed: true },
  { id: "bartang-valley-trek", name: "Bartang Valley Trek", kind: "trek", range: null, region: "central-asia", country: "Tajikistan", elevation_m: null, max_altitude_m: 4600, duration_days_min: 7, duration_days_max: 10, distance_km: null, listed: true },
  { id: "jyrgalan-boz-uchuk-lakes-trek", name: "Jyrgalan Boz Uchuk Lakes Trek", kind: "trek", range: null, region: "central-asia", country: "Kyrgyzstan", elevation_m: null, max_altitude_m: 3400, duration_days_min: 3, duration_days_max: 4, distance_km: null, listed: true },
  { id: "pamir-trek", name: "Pamir Trek", kind: "trek", range: null, region: "central-asia", country: "Tajikistan", elevation_m: null, max_altitude_m: 5010, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "song-kul-trek", name: "Song-Kul Trek", kind: "trek", range: null, region: "central-asia", country: "Kyrgyzstan", elevation_m: null, max_altitude_m: null, duration_days_min: 2, duration_days_max: 4, distance_km: null, listed: true },
  { id: "santa-cruz-trek", name: "Santa Cruz Trek", kind: "trek", range: null, region: "cordillera", country: "Peru", elevation_m: null, max_altitude_m: 4750, duration_days_min: 3, duration_days_max: 4, distance_km: null, listed: true },
  { id: "colca-canyon-trek", name: "Colca Canyon Trek", kind: "trek", range: null, region: "cordillera", country: "Peru", elevation_m: null, max_altitude_m: 3287, duration_days_min: 2, duration_days_max: 3, distance_km: null, listed: true },
  { id: "short-inca-trail", name: "Short Inca Trail", kind: "trek", range: null, region: "cusco", country: "Peru", elevation_m: null, max_altitude_m: 2720, duration_days_min: 2, duration_days_max: 2, distance_km: null, listed: true },
  { id: "lares-trek", name: "Lares Trek", kind: "trek", range: null, region: "cusco", country: "Peru", elevation_m: null, max_altitude_m: 4450, duration_days_min: 3, duration_days_max: 4, distance_km: null, listed: true },
  { id: "ausangate-trek", name: "Ausangate Trek", kind: "trek", range: null, region: "cusco", country: "Peru", elevation_m: null, max_altitude_m: 5165, duration_days_min: 4, duration_days_max: 6, distance_km: null, listed: true },
  { id: "ancascocha-trek", name: "Ancascocha Trek", kind: "trek", range: null, region: "cusco", country: "Peru", elevation_m: null, max_altitude_m: 4650, duration_days_min: 4, duration_days_max: 5, distance_km: null, listed: true },
  { id: "dolomites-alta-via-2", name: "Dolomites Alta Via 2", kind: "trek", range: null, region: "dolomites", country: "Italy", elevation_m: null, max_altitude_m: 2885, duration_days_min: 12, duration_days_max: 15, distance_km: null, listed: true },
  { id: "dolomites-alta-via-5", name: "Dolomites Alta Via 5", kind: "trek", range: null, region: "dolomites", country: "Italy", elevation_m: null, max_altitude_m: 2644, duration_days_min: 6, duration_days_max: 7, distance_km: null, listed: true },
  { id: "drakensberg-amphitheatre-trek", name: "Drakensberg Amphitheatre Trek", kind: "trek", range: null, region: "drakensberg", country: "South Africa", elevation_m: null, max_altitude_m: 3000, duration_days_min: 1, duration_days_max: 2, distance_km: null, listed: true },
  { id: "injisuthi-to-cathedral-peak-traverse", name: "Injisuthi to Cathedral Peak Traverse", kind: "trek", range: null, region: "drakensberg", country: "South Africa / Lesotho", elevation_m: null, max_altitude_m: null, duration_days_min: 5, duration_days_max: 6, distance_km: null, listed: true },
  { id: "sani-pass-to-thabana-ntlenyana", name: "Sani Pass to Thabana Ntlenyana", kind: "trek", range: null, region: "drakensberg", country: "South Africa / Lesotho", elevation_m: null, max_altitude_m: 3482, duration_days_min: 2, duration_days_max: 3, distance_km: null, listed: true },
  { id: "kilimanjaro-rongai-route", name: "Kilimanjaro Rongai Route", kind: "trek", range: null, region: "east-africa", country: "Tanzania", elevation_m: null, max_altitude_m: 5895, duration_days_min: 6, duration_days_max: 7, distance_km: null, listed: true },
  { id: "mount-meru-trek", name: "Mount Meru Trek", kind: "trek", range: null, region: "east-africa", country: "Tanzania", elevation_m: null, max_altitude_m: 4562, duration_days_min: 3, duration_days_max: 4, distance_km: null, listed: true },
  { id: "mount-kenya-naro-moru-route", name: "Mount Kenya Naro Moru Route", kind: "trek", range: null, region: "east-africa", country: "Kenya", elevation_m: null, max_altitude_m: 4985, duration_days_min: 3, duration_days_max: 4, distance_km: null, listed: true },
  { id: "simien-mountains-trek", name: "Simien Mountains Trek", kind: "trek", range: null, region: "east-africa", country: "Ethiopia", elevation_m: null, max_altitude_m: 4550, duration_days_min: 4, duration_days_max: 10, distance_km: null, listed: true },
  { id: "camino-portugu-s", name: "Camino Portugu\u00e9s", kind: "trek", range: null, region: "iberia", country: "Portugal / Spain", elevation_m: null, max_altitude_m: 405, duration_days_min: 12, duration_days_max: 14, distance_km: null, listed: true },
  { id: "camino-primitivo", name: "Camino Primitivo", kind: "trek", range: null, region: "iberia", country: "Spain", elevation_m: null, max_altitude_m: 1200, duration_days_min: 14, duration_days_max: 16, distance_km: null, listed: true },
  { id: "camino-finisterre", name: "Camino Finisterre", kind: "trek", range: null, region: "iberia", country: "Spain", elevation_m: null, max_altitude_m: 556, duration_days_min: 4, duration_days_max: 6, distance_km: null, listed: true },
  { id: "gr11-pyrenees", name: "GR11 Pyrenees", kind: "trek", range: null, region: "iberia", country: "Spain", elevation_m: null, max_altitude_m: 2800, duration_days_min: 42, duration_days_max: 50, distance_km: null, listed: true },
  { id: "mallorca-gr221", name: "Mallorca GR221", kind: "trek", range: null, region: "iberia", country: "Spain", elevation_m: null, max_altitude_m: 1205, duration_days_min: 8, duration_days_max: 10, distance_km: null, listed: true },
  { id: "laugavegur-trail", name: "Laugavegur Trail", kind: "trek", range: null, region: "iceland", country: "Iceland", elevation_m: null, max_altitude_m: 1050, duration_days_min: 3, duration_days_max: 4, distance_km: null, listed: true },
  { id: "fimmv-r-uh-ls-trek", name: "Fimmv\u00f6r\u00f0uh\u00e1ls Trek", kind: "trek", range: null, region: "iceland", country: "Iceland", elevation_m: null, max_altitude_m: 1045, duration_days_min: 1, duration_days_max: 2, distance_km: null, listed: true },
  { id: "kjalvegur-trail", name: "Kjalvegur Trail", kind: "trek", range: null, region: "iceland", country: "Iceland", elevation_m: null, max_altitude_m: 778, duration_days_min: 2, duration_days_max: 3, distance_km: null, listed: true },
  { id: "kumano-kodo", name: "Kumano Kodo", kind: "trek", range: null, region: "japan", country: "Japan", elevation_m: null, max_altitude_m: null, duration_days_min: 4, duration_days_max: 6, distance_km: null, listed: true },
  { id: "mount-fuji-climbing-routes", name: "Mount Fuji Climbing Routes", kind: "trek", range: null, region: "japan", country: "Japan", elevation_m: null, max_altitude_m: 3776, duration_days_min: 1, duration_days_max: 2, distance_km: null, listed: true },
  { id: "northern-alps-trekking-circuit", name: "Northern Alps Trekking Circuit", kind: "trek", range: null, region: "japan", country: "Japan", elevation_m: null, max_altitude_m: 3190, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "yakushima-miyanoura-dake", name: "Yakushima Miyanoura-dake", kind: "trek", range: null, region: "japan", country: "Japan", elevation_m: null, max_altitude_m: 1936, duration_days_min: 2, duration_days_max: 2, distance_km: null, listed: true },
  { id: "everest-three-passes-trek", name: "Everest Three Passes Trek", kind: "trek", range: null, region: "khumbu", country: "Nepal", elevation_m: null, max_altitude_m: 5545, duration_days_min: 18, duration_days_max: 21, distance_km: null, listed: true },
  { id: "cho-la-pass-trek", name: "Cho La Pass Trek", kind: "trek", range: null, region: "khumbu", country: "Nepal", elevation_m: null, max_altitude_m: 5545, duration_days_min: 15, duration_days_max: 18, distance_km: null, listed: true },
  { id: "everest-high-passes-island-peak-trek", name: "Everest High Passes & Island Peak Trek", kind: "trek", range: null, region: "khumbu", country: "Nepal", elevation_m: null, max_altitude_m: 6189, duration_days_min: 21, duration_days_max: 23, distance_km: null, listed: true },
  { id: "langtang-gosaikunda-trek", name: "Langtang\u2013Gosaikunda Trek", kind: "trek", range: null, region: "langtang", country: "Nepal", elevation_m: null, max_altitude_m: 4610, duration_days_min: 12, duration_days_max: 15, distance_km: null, listed: true },
  { id: "tamang-heritage-trail", name: "Tamang Heritage Trail", kind: "trek", range: null, region: "langtang", country: "Nepal", elevation_m: null, max_altitude_m: 3165, duration_days_min: 6, duration_days_max: 8, distance_km: null, listed: true },
  { id: "upper-mustang-trek", name: "Upper Mustang Trek", kind: "trek", range: null, region: "nepal-remote", country: "Nepal", elevation_m: null, max_altitude_m: 4230, duration_days_min: 10, duration_days_max: 16, distance_km: null, listed: true },
  { id: "kanchenjunga-base-camp-trek", name: "Kanchenjunga Base Camp Trek", kind: "trek", range: null, region: "nepal-remote", country: "Nepal", elevation_m: null, max_altitude_m: 5143, duration_days_min: 20, duration_days_max: 24, distance_km: null, listed: true },
  { id: "nar-phu-annapurna-circuit", name: "Nar Phu + Annapurna Circuit", kind: "trek", range: null, region: "nepal-remote", country: "Nepal", elevation_m: null, max_altitude_m: 5416, duration_days_min: 17, duration_days_max: 21, distance_km: null, listed: true },
  { id: "abel-tasman-coast-track", name: "Abel Tasman Coast Track", kind: "trek", range: null, region: "new-zealand", country: "New Zealand", elevation_m: null, max_altitude_m: 200, duration_days_min: 3, duration_days_max: 5, distance_km: null, listed: true },
  { id: "heaphy-track", name: "Heaphy Track", kind: "trek", range: null, region: "new-zealand", country: "New Zealand", elevation_m: null, max_altitude_m: 915, duration_days_min: 4, duration_days_max: 6, distance_km: null, listed: true },
  { id: "milford-track", name: "Milford Track", kind: "trek", range: null, region: "new-zealand", country: "New Zealand", elevation_m: null, max_altitude_m: 1154, duration_days_min: 4, duration_days_max: 4, distance_km: null, listed: true },
  { id: "rakiura-track", name: "Rakiura Track", kind: "trek", range: null, region: "new-zealand", country: "New Zealand", elevation_m: null, max_altitude_m: null, duration_days_min: 3, duration_days_max: 3, distance_km: null, listed: true },
  { id: "stewart-island-north-west-circuit", name: "Stewart Island North-West Circuit", kind: "trek", range: null, region: "new-zealand", country: "New Zealand", elevation_m: null, max_altitude_m: null, duration_days_min: 8, duration_days_max: 10, distance_km: null, listed: true },
  { id: "tongariro-northern-circuit", name: "Tongariro Northern Circuit", kind: "trek", range: null, region: "new-zealand", country: "New Zealand", elevation_m: null, max_altitude_m: 1886, duration_days_min: 3, duration_days_max: 4, distance_km: null, listed: true },
  { id: "arizona-trail", name: "Arizona Trail", kind: "trek", range: null, region: "north-america", country: "United States", elevation_m: null, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "colorado-trail", name: "Colorado Trail", kind: "trek", range: null, region: "north-america", country: "United States", elevation_m: null, max_altitude_m: 4045, duration_days_min: 28, duration_days_max: 42, distance_km: null, listed: true },
  { id: "high-sierra-trail", name: "High Sierra Trail", kind: "trek", range: null, region: "north-america", country: "United States", elevation_m: null, max_altitude_m: 4421, duration_days_min: 6, duration_days_max: 10, distance_km: null, listed: true },
  { id: "mount-baker-chain-lakes-loop", name: "Mount Baker Chain Lakes Loop", kind: "trek", range: null, region: "north-america", country: "United States", elevation_m: null, max_altitude_m: 1650, duration_days_min: 1, duration_days_max: 2, distance_km: null, listed: true },
  { id: "rockwall-trail", name: "Rockwall Trail", kind: "trek", range: null, region: "north-america", country: "Canada", elevation_m: null, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "the-long-trail", name: "The Long Trail", kind: "trek", range: null, region: "north-america", country: "United States", elevation_m: null, max_altitude_m: 1339, duration_days_min: 20, duration_days_max: 30, distance_km: null, listed: true },
  { id: "yosemite-high-country-trek", name: "Yosemite High Country Trek", kind: "trek", range: null, region: "north-america", country: "United States", elevation_m: null, max_altitude_m: null, duration_days_min: null, duration_days_max: null, distance_km: null, listed: true },
  { id: "torres-del-paine-o-circuit", name: "Torres del Paine O Circuit", kind: "trek", range: null, region: "patagonia", country: "Chile", elevation_m: null, max_altitude_m: 1200, duration_days_min: 7, duration_days_max: 9, distance_km: null, listed: true },
  { id: "huemul-circuit-trek", name: "Huemul Circuit Trek", kind: "trek", range: null, region: "patagonia", country: "Argentina", elevation_m: null, max_altitude_m: 1450, duration_days_min: 4, duration_days_max: 4, distance_km: null, listed: true },
  { id: "cochamo-valley-trek", name: "Cochamo Valley Trek", kind: "trek", range: null, region: "patagonia", country: "Chile", elevation_m: null, max_altitude_m: null, duration_days_min: 3, duration_days_max: 4, distance_km: null, listed: true },
  { id: "laguna-de-los-tres-trek", name: "Laguna de los Tres Trek", kind: "trek", range: null, region: "patagonia", country: "Argentina", elevation_m: null, max_altitude_m: 1150, duration_days_min: 1, duration_days_max: 1, distance_km: null, listed: true },
  { id: "cape-wrath-trail", name: "Cape Wrath Trail", kind: "trek", range: null, region: "uk-ireland", country: "United Kingdom", elevation_m: null, max_altitude_m: null, duration_days_min: 16, duration_days_max: 21, distance_km: null, listed: true },
  { id: "cumbria-way", name: "Cumbria Way", kind: "trek", range: null, region: "uk-ireland", country: "United Kingdom", elevation_m: null, max_altitude_m: 658, duration_days_min: 5, duration_days_max: 6, distance_km: null, listed: true },
  { id: "great-glen-way", name: "Great Glen Way", kind: "trek", range: null, region: "uk-ireland", country: "United Kingdom", elevation_m: null, max_altitude_m: 375, duration_days_min: 5, duration_days_max: 7, distance_km: null, listed: true },
  { id: "offas-dyke-path", name: "Offa's Dyke Path", kind: "trek", range: null, region: "uk-ireland", country: "United Kingdom", elevation_m: null, max_altitude_m: 703, duration_days_min: 12, duration_days_max: 14, distance_km: null, listed: true },
  { id: "skye-trail", name: "Skye Trail", kind: "trek", range: null, region: "uk-ireland", country: "United Kingdom", elevation_m: null, max_altitude_m: 719, duration_days_min: 7, duration_days_max: 7, distance_km: null, listed: true },
  { id: "the-ridgeway", name: "The Ridgeway", kind: "trek", range: null, region: "uk-ireland", country: "United Kingdom", elevation_m: null, max_altitude_m: null, duration_days_min: 5, duration_days_max: 6, distance_km: null, listed: true },
];
