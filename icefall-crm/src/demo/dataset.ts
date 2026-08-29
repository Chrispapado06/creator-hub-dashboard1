/**
 * Invented data for judging the layout.
 *
 * READ `src/lib/demoFlag.ts` FIRST. Everything here is gated at DEFINITION — the
 * arrays collapse to `[]` when the flag is off, so an ordinary build carries
 * none of these strings in its bundle. Gating only at the render leaves every
 * invented company name and revenue figure readable in `dist/assets`.
 *
 * ── EVERY COMPANY BELOW IS INVENTED ─────────────────────────────────────────
 *
 * The owner's mockup names Elite Expeditions, Summit Nepal, Himalayan Guides,
 * Adventure Co., Peak Ascents, Mountain Quest, Alpine Treks and Everest
 * Adventures. Several of those are real, identifiable businesses — Elite Exped
 * most obviously — and attaching invented revenue, ratings, commission rates and
 * contract terms to a real company is a live exposure that a screenshot
 * publishes. Owner decision #2 stands: fictional names only, and that includes
 * anything drawn to look like the mockup.
 *
 * The MOUNTAINS are real, with published elevations, keyed by the slugs the
 * consumer apps already use. That is correct and deliberate: inventing peaks
 * would undermine the one thing a mountaineering product has to get right.
 *
 * Deterministic: no `Math.random()` anywhere. Dates are offsets from today so
 * that "expires in 5 days" stays true tomorrow, which is what makes the expiry
 * and renewal screens judgeable at all.
 */
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import type {
  AuditEvent, Booking, Commission, Company, ContentVersion, CustomerRecord, Deal,
  GuideRecord, Invoice, Lead, Payment, PlacementPrice, PlacementView,
  Product, RevenueRecord, StaffRecord, Task, Ticket, VerificationDocument,
} from "@/data/types";

/** A local calendar day, `n` days from today. Never `new Date(iso)` for a day. */
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

const off = <T,>(rows: T[]): T[] => (SHOW_DEMO_DATA ? rows : []);

/* -------------------------------------------------------------------------- */
/* Companies — invented, every one                                            */
/* -------------------------------------------------------------------------- */

const C = {
  northwind: "11111111-1111-4111-8111-111111111111",
  serac: "22222222-2222-4222-8222-222222222222",
  cairn: "33333333-3333-4333-8333-333333333333",
  hollow: "44444444-4444-4444-8444-444444444444",
  lantern: "55555555-5555-4555-8555-555555555555",
  vantage: "66666666-6666-4666-8666-666666666666",
  coldharbour: "77777777-7777-4777-8777-777777777777",
  meridian: "88888888-8888-4888-8888-888888888888",
} as const;

export const companies: Company[] = off([
  { id: C.northwind, slug: "northwind-ascents", name: "Northwind Ascents", legal_name: "Northwind Ascents Pvt Ltd", logo_path: null,
    description: "High-altitude expeditions in the Khumbu and Annapurna regions.", countries: ["Nepal"], regions: ["Himalaya & Asia"],
    status: "active", verification_status: "verified", documents_checked_at: at(-64), documents_checked_by: "s1", created_at: at(-540), updated_at: at(-9) },
  { id: C.serac, slug: "serac-and-stone", name: "Serac & Stone Expeditions", legal_name: "Serac & Stone SA", logo_path: null,
    description: "Andean and Alaskan programmes with a long acclimatisation profile.", countries: ["Argentina", "United States"], regions: ["Americas"],
    status: "active", verification_status: "verified", documents_checked_at: at(-121), documents_checked_by: "s1", created_at: at(-480), updated_at: at(-14) },
  { id: C.cairn, slug: "cairn-and-compass", name: "Cairn & Compass Trekking", legal_name: "Cairn & Compass SARL", logo_path: null,
    description: "Alpine trekking and hut-to-hut traverses.", countries: ["France", "Switzerland"], regions: ["Europe"],
    status: "active", verification_status: "pending", documents_checked_at: null, documents_checked_by: null, created_at: at(-300), updated_at: at(-3) },
  { id: C.hollow, slug: "hollow-ridge", name: "Hollow Ridge Mountaineering", legal_name: null, logo_path: null,
    description: "Dolomites and Western Alps, small groups only.", countries: ["Italy"], regions: ["Europe"],
    status: "onboarding", verification_status: "unverified", documents_checked_at: null, documents_checked_by: null, created_at: at(-41), updated_at: at(-2) },
  { id: C.lantern, slug: "lantern-pass", name: "Lantern Pass Expeditions", legal_name: "Lantern Pass Trekking Pvt Ltd", logo_path: null,
    description: "Everest, Manaslu and Ama Dablam expeditions.", countries: ["Nepal"], regions: ["Himalaya & Asia"],
    status: "active", verification_status: "verified", documents_checked_at: at(-200), documents_checked_by: "s3", created_at: at(-620), updated_at: at(-21) },
  { id: C.vantage, slug: "vantage-north", name: "Vantage North Alpine", legal_name: "Vantage North AS", logo_path: null,
    description: "Ski mountaineering and winter ascents in Scandinavia.", countries: ["Norway"], regions: ["Europe"],
    status: "active", verification_status: "unverified", documents_checked_at: null, documents_checked_by: null, created_at: at(-190), updated_at: at(-30) },
  { id: C.coldharbour, slug: "cold-harbour-guides", name: "Cold Harbour Guides", legal_name: null, logo_path: null,
    description: "Scottish winter and Alpine introductory courses.", countries: ["United Kingdom"], regions: ["Europe"],
    status: "suspended", verification_status: "suspended", documents_checked_at: null, documents_checked_by: null, created_at: at(-410), updated_at: at(-52) },
  { id: C.meridian, slug: "meridian-col", name: "Meridian Col Expeditions", legal_name: "Meridian Col SpA", logo_path: null,
    description: "Aconcagua and Patagonian objectives.", countries: ["Chile", "Argentina"], regions: ["Americas"],
    status: "active", verification_status: "verified", documents_checked_at: at(-88), documents_checked_by: "s1", created_at: at(-350), updated_at: at(-6) },
]);

/* -------------------------------------------------------------------------- */
/* Destinations — the real catalogue, mountains and treks                     */
/* -------------------------------------------------------------------------- */

// 52 mountains and 252 treks, generated from Session 02's own data. See
// `src/demo/destinations.ts` for where it came from and why it is not derived
// here. Re-exported so nothing outside has to know it moved.
export { destinations, trekMountains } from "./destinations";

/** Product ids, needed by both the placements and the products below. */
const P = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;

/* -------------------------------------------------------------------------- */
/* Placements — #1–#5 on Everest, one already past its term                   */
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
  effective_status: status === "cancelled" ? "cancelled" : endsIn < 0 ? "expired" : startsIn > 0 ? "reserved" : status,
  needs_review: status !== "cancelled" && endsIn < 0,
  days_remaining: endsIn,
});

export const placements: PlacementView[] = off([
  // A slot may only feature an expedition its company actually runs ON THIS
  // MOUNTAIN — the database enforces it with a trigger, and an earlier version
  // of this seed got it wrong in a way only the screen revealed: Everest #2 was
  // advertising a Manaslu trip. Only Northwind has an Everest expedition, so the
  // other three hold the position with nothing chosen for it yet, which is a
  // real state operators are in.
  placement("p1", C.northwind, "everest", 1, -30, 335, 5000, "active", P(1)),
  placement("p2", C.lantern, "everest", 2, -60, 305, 4500),
  placement("p3", C.serac, "everest", 3, -10, 5, 3500),
  placement("p4", C.meridian, "everest", 4, -400, -12, 3000),
  // Bought the position, not yet chosen what to feature in it.
  placement("p5", C.vantage, "everest", 5, 14, 379, 2500, "reserved"),
  placement("p6", C.cairn, "mont-blanc", 1, -20, 345, 2200, "active", P(7)),
  placement("p7", C.hollow, "mont-blanc", 2, -8, 357, 1800),
  placement("p8", C.meridian, "aconcagua", 1, -5, 26, 2400, "active", P(10)),
  placement("p9", C.serac, "denali", 1, -95, 270, 2600, "active", P(6)),
  placement("p10", C.lantern, "ama-dablam", 1, -150, 215, 2100, "active", P(3)),
  placement("p11", C.northwind, "manaslu", 1, -70, 3, 2300),
  placement("p12", C.cairn, "matterhorn", 1, -45, 320, null),
]);

/** The published rate card — what a position costs, before anything is agreed. */
export const placementPrices: PlacementPrice[] = off(
  [
    ["everest", 5000, 4500, 3500, 3000, 2500],
    ["manaslu", 2300, 2000, 1700, 1400, 1200],
    ["ama-dablam", 2100, 1800, 1500, 1300, 1100],
    ["aconcagua", 2400, 2100, 1800, 1500, 1300],
    ["denali", 2600, 2300, 1900, 1600, 1400],
    ["kilimanjaro", 2500, 2200, 1800, 1500, 1300],
    ["mont-blanc", 2200, 1900, 1600, 1300, 1100],
    ["matterhorn", 2000, 1700, 1400, 1200, 1000],
  ].flatMap(([id, ...prices]) =>
    (prices as number[]).map((p, i) => ({
      destination_id: id as string, slot_position: i + 1, price_cents: eur(p), currency: "EUR",
    })),
  ),
);

/* -------------------------------------------------------------------------- */
/* Products                                                                   */
/* -------------------------------------------------------------------------- */


const product = (
  n: number, company_id: string, kind: "expedition" | "trek", slug: string, name: string,
  price: number | null, status: Product["status"], mins: number, maxs: number, alt: number,
  avail: Product["availability_state"] = "available",
): Product => ({
  id: P(n), company_id, kind, slug, name,
  summary: kind === "expedition" ? "Full expedition package with fixed departures." : "Guided trek with hut or lodge accommodation.",
  description: null,
  price_from_cents: price === null ? null : eur(price),
  price_state: price === null ? "on_request" : "known",
  currency: "EUR", duration_days_min: mins, duration_days_max: maxs, season: "Spring / Autumn",
  difficulty: kind === "expedition" ? "Serious alpine" : "Strenuous",
  max_altitude_m: alt, seats_available: null, availability_state: avail,
  status, live_at: status === "live" ? at(-120) : null,
});

export const products: Product[] = off([
  product(1, C.northwind, "expedition", "everest-south-col", "Everest — South Col", 62000, "live", 60, 65, 8849, "limited"),
  product(2, C.northwind, "trek", "everest-base-camp", "Everest Base Camp Trek", 1650, "live", 12, 14, 5364),
  product(3, C.lantern, "expedition", "ama-dablam-sw-ridge", "Ama Dablam — SW Ridge", 8600, "live", 24, 28, 6812),
  product(4, C.lantern, "expedition", "manaslu-normal", "Manaslu — Normal Route", 14500, "live", 38, 42, 8163),
  product(5, C.serac, "expedition", "aconcagua-normal", "Aconcagua — Normal Route", null, "live", 18, 21, 6961),
  product(6, C.serac, "expedition", "denali-west-buttress", "Denali — West Buttress", 9800, "live", 20, 24, 6190, "limited"),
  product(7, C.cairn, "trek", "tour-du-mont-blanc", "Tour du Mont Blanc", 1850, "live", 10, 11, 2665),
  product(8, C.cairn, "trek", "walkers-haute-route", "Walker's Haute Route", 2100, "pending_review", 13, 14, 2987, "unknown"),
  product(9, C.hollow, "trek", "dolomites-alta-via", "Dolomites Alta Via 1", 1450, "draft", 8, 9, 2752, "unknown"),
  product(10, C.meridian, "expedition", "aconcagua-polish", "Aconcagua — Polish Traverse", 5400, "live", 19, 22, 6961),
  product(11, C.vantage, "trek", "lyngen-ski-traverse", "Lyngen Ski Traverse", 2950, "live", 7, 8, 1833),
  product(12, C.northwind, "trek", "gokyo-lakes", "Gokyo Lakes Trek", 1490, "archived", 13, 15, 5357, "unknown"),
]);

/* -------------------------------------------------------------------------- */
/* Approvals — the change is a PATCH, which is why the diff is per field      */
/* -------------------------------------------------------------------------- */

const version = (
  id: string, entity_id: string, company_id: string, payload: Record<string, unknown>,
  base: Record<string, unknown>, daysAgo: number, flags: string[] = [],
): ContentVersion => ({
  id, entity_type: "product", entity_id, company_id, payload,
  changed_fields: Object.keys(payload), base_snapshot: base, flags,
  state: "pending", submitted_by: null, submitted_at: at(-daysAgo), reviewed_by: null,
  reviewed_at: null, decision_reason: null, applied_at: null, created_at: at(-daysAgo),
});

export const contentVersions: ContentVersion[] = off([
  version("v1", P(2), C.northwind, { price_from_cents: eur(1850) }, { price_from_cents: eur(1650) }, 2),
  version("v2", P(3), C.lantern, { summary: "Revised itinerary with an extra acclimatisation rotation." }, { summary: "Full expedition package with fixed departures." }, 1),
  version("v3", P(7), C.cairn, { max_altitude_m: 2665, difficulty: "Moderate" }, { max_altitude_m: 2665, difficulty: "Strenuous" }, 4),
  version("v4", P(6), C.serac, { price_from_cents: eur(10400) }, { price_from_cents: eur(9800) }, 6),
  version("v5", P(11), C.vantage, { description: "Book direct and save — reach us on +47 900 00 000." }, { description: null }, 3, ["possible_contact_details"]),
  version("v6", P(10), C.meridian, { season: "December – February" }, { season: "Spring / Autumn" }, 8),
]);

/* -------------------------------------------------------------------------- */
/* Customers, leads, bookings                                                 */
/* -------------------------------------------------------------------------- */

export const customers: CustomerRecord[] = off([
  { id: "u1", name: "James Carter", email: "j.carter@example.com", country: "United Kingdom", joined_on: day(-210), subscription: null, last_active_at: null, mountain_interests: ["everest"], leads: 2, bookings: 1, status: "active" },
  { id: "u2", name: "Sophie Martin", email: "s.martin@example.com", country: "France", joined_on: day(-180), subscription: null, last_active_at: null, mountain_interests: ["ama-dablam", "mont-blanc"], leads: 1, bookings: 0, status: "active" },
  { id: "u3", name: "Daniel Kim", email: "d.kim@example.com", country: "South Korea", joined_on: day(-150), subscription: null, last_active_at: null, mountain_interests: ["ama-dablam"], leads: 1, bookings: 1, status: "active" },
  { id: "u4", name: "Thomas Becker", email: "t.becker@example.com", country: "Germany", joined_on: day(-120), subscription: null, last_active_at: null, mountain_interests: ["aconcagua"], leads: 2, bookings: 1, status: "active" },
  { id: "u5", name: "Anna Müller", email: "a.mueller@example.com", country: "Austria", joined_on: day(-95), subscription: null, last_active_at: null, mountain_interests: ["everest", "manaslu"], leads: 1, bookings: 0, status: "active" },
  { id: "u6", name: "Marta Ruiz", email: "m.ruiz@example.com", country: "Spain", joined_on: day(-70), subscription: null, last_active_at: null, mountain_interests: ["mont-blanc"], leads: 1, bookings: 1, status: "active" },
  { id: "u7", name: "Jonas Lindqvist", email: "j.lindqvist@example.com", country: "Sweden", joined_on: day(-55), subscription: null, last_active_at: null, mountain_interests: ["matterhorn"], leads: 1, bookings: 0, status: "active" },
  { id: "u8", name: "Priya Raman", email: "p.raman@example.com", country: "United Kingdom", joined_on: day(-40), subscription: null, last_active_at: null, mountain_interests: ["denali"], leads: 1, bookings: 1, status: "active" },
  { id: "u9", name: "Diego Salas", email: "d.salas@example.com", country: "Chile", joined_on: day(-28), subscription: null, last_active_at: null, mountain_interests: ["aconcagua"], leads: 1, bookings: 0, status: "active" },
  { id: "u10", name: "Hanne Bakke", email: "h.bakke@example.com", country: "Norway", joined_on: day(-12), subscription: null, last_active_at: null, mountain_interests: ["everest"], leads: 1, bookings: 0, status: "suspended" },
]);

const lead = (
  id: string, company_id: string, customer_id: string, product_id: string, destination_id: string,
  status: Lead["status"], daysAgo: number, source: string, booking_id: string | null = null,
): Lead => ({
  id, company_id, customer_id, thread_id: `t-${id}`, product_id, destination_id, status,
  assigned_to: null, source_page: source, created_at: at(-daysAgo),
  contacted_at: ["new"].includes(status) ? null : at(-daysAgo + 1),
  qualified_at: ["new", "contacted"].includes(status) ? null : at(-daysAgo + 2),
  quoted_at: ["new", "contacted", "qualified"].includes(status) ? null : at(-daysAgo + 4),
  booked_at: status === "booked" ? at(-daysAgo + 6) : null,
  lost_at: status === "lost" ? at(-daysAgo + 5) : null,
  lost_reason: status === "lost" ? "Chose a different operator on price." : null,
  booking_id,
});

export const leads: Lead[] = off([
  lead("l1", C.northwind, "u1", P(2), "everest", "new", 1, "product"),
  lead("l2", C.lantern, "u2", P(3), "ama-dablam", "new", 2, "mountain"),
  lead("l3", C.serac, "u4", P(5), "aconcagua", "contacted", 5, "product"),
  lead("l4", C.northwind, "u5", P(1), "everest", "contacted", 6, "company"),
  lead("l5", C.cairn, "u6", P(7), "mont-blanc", "qualified", 9, "product"),
  lead("l6", C.lantern, "u3", P(3), "ama-dablam", "qualified", 11, "mountain"),
  lead("l7", C.serac, "u8", P(6), "denali", "quoted", 14, "product"),
  lead("l8", C.meridian, "u9", P(10), "aconcagua", "quoted", 16, "company"),
  lead("l9", C.northwind, "u1", P(1), "everest", "booked", 24, "product", "b1"),
  lead("l10", C.lantern, "u3", P(3), "ama-dablam", "booked", 30, "mountain", "b2"),
  lead("l11", C.cairn, "u6", P(7), "mont-blanc", "booked", 38, "product", "b3"),
  lead("l12", C.serac, "u4", P(6), "denali", "booked", 45, "product", "b4"),
  lead("l13", C.vantage, "u7", P(11), "matterhorn", "lost", 21, "mountain"),
  lead("l14", C.hollow, "u10", P(9), "mont-blanc", "lost", 33, "product"),
  lead("l15", C.meridian, "u9", P(10), "aconcagua", "disputed", 52, "company"),
]);

const booking = (
  id: string, lead_id: string, company_id: string, product_id: string, destination_id: string,
  customer_id: string, value: number | null, status: string, daysAgo: number,
  attribution: Booking["attribution_status"] = "icefall",
): Booking => ({
  id, kind: "expedition", lead_id, company_id, product_id, destination_id, customer_id,
  value_cents: value === null ? null : eur(value),
  value_status: value === null ? "pending" : "reported",
  currency: "EUR", status, attribution_status: attribution,
  booked_at: at(-daysAgo), starts_on: day(240 - daysAgo), completed_at: status === "completed" ? at(-2) : null,
});

export const bookings: Booking[] = off([
  booking("b1", "l9", C.northwind, P(1), "everest", "u1", 62000, "confirmed", 18),
  booking("b2", "l10", C.lantern, P(3), "ama-dablam", "u3", 8600, "completed", 24),
  booking("b3", "l11", C.cairn, P(7), "mont-blanc", "u6", 1850, "completed", 32),
  booking("b4", "l12", C.serac, P(6), "denali", "u4", 9800, "confirmed", 39),
  booking("b5", "l15", C.meridian, P(10), "aconcagua", "u9", 5400, "disputed", 46, "disputed"),
  booking("b6", "l7", C.serac, P(5), "aconcagua", "u8", null, "reported", 3),
  booking("b7", "l8", C.meridian, P(10), "aconcagua", "u9", null, "reported", 1),
  booking("b8", "l5", C.cairn, P(7), "mont-blanc", "u2", 1850, "confirmed", 7),
]);

/* -------------------------------------------------------------------------- */
/* Commissions and revenue                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A PLACEHOLDER RATE, and the one number in this file that is genuinely
 * undecided rather than merely invented.
 *
 * The owner has not settled the operator-side referral fee. Everything else here
 * is invented data standing in for real data that will exist; this is invented
 * data standing in for a DECISION THAT HAS NOT BEEN MADE. The Settings screen
 * therefore shows the referral rate as unset rather than showing 7.5% and
 * inviting it to be read as agreed.
 */
const PLACEHOLDER_REFERRAL_BPS = 750;
export const REFERRAL_RATE_IS_UNDECIDED = true;

const commission = (
  id: string, booking_id: string, basis: number, bps: number,
  status: Commission["status"], daysAgo: number,
): Commission => ({
  id, booking_id, kind: "referral", rate_bps: bps, fixed_fee_cents: null,
  basis_cents: eur(basis), amount_cents: Math.round((eur(basis) * bps) / 10000),
  currency: "EUR", status, computed_at: at(-daysAgo),
});

export const commissions: Commission[] = off([
  commission("c1", "b1", 62000, PLACEHOLDER_REFERRAL_BPS, "invoiced", 18),
  commission("c2", "b2", 8600, 600, "paid", 24),
  commission("c3", "b3", 1850, PLACEHOLDER_REFERRAL_BPS, "paid", 32),
  commission("c4", "b4", 9800, PLACEHOLDER_REFERRAL_BPS, "accrued", 39),
  commission("c5", "b5", 5400, 600, "disputed", 46),
  commission("c6", "b8", 1850, PLACEHOLDER_REFERRAL_BPS, "accrued", 7),
]);

const rev = (
  id: string, stream: RevenueRecord["stream"], company_id: string | null,
  destination_id: string | null, amount: number, status: RevenueRecord["status"], daysAgo: number,
): RevenueRecord => ({
  id, stream, company_id, destination_id, amount_cents: eur(amount),
  currency: "EUR", status, recognised_on: day(-daysAgo),
});

export const revenue: RevenueRecord[] = off([
  rev("r1", "placement", C.northwind, "everest", 5000, "collected", 30),
  rev("r2", "placement", C.lantern, "everest", 4500, "collected", 60),
  rev("r3", "placement", C.serac, "everest", 3500, "invoiced", 10),
  rev("r4", "placement", C.meridian, "everest", 3000, "collected", 120),
  rev("r5", "placement", C.cairn, "mont-blanc", 2200, "collected", 20),
  rev("r6", "placement", C.hollow, "mont-blanc", 1800, "invoiced", 8),
  rev("r7", "placement", C.meridian, "aconcagua", 2400, "collected", 5),
  rev("r8", "placement", C.serac, "denali", 2600, "collected", 95),
  rev("r9", "placement", C.lantern, "ama-dablam", 2100, "collected", 150),
  rev("r10", "placement", C.northwind, "manaslu", 2300, "accrued", 70),
  rev("r11", "referral", C.northwind, "everest", 4650, "invoiced", 18),
  rev("r12", "referral", C.lantern, "ama-dablam", 516, "collected", 24),
  rev("r13", "referral", C.cairn, "mont-blanc", 138.75, "collected", 32),
  rev("r14", "referral", C.serac, "denali", 735, "accrued", 39),
  rev("r15", "referral", C.cairn, "mont-blanc", 138.75, "accrued", 7),
  rev("r16", "guide_commission", null, "mont-blanc", 288, "collected", 42),
  rev("r17", "guide_commission", null, "matterhorn", 456, "collected", 61),
]);

/* -------------------------------------------------------------------------- */
/* Sales pipeline                                                             */
/* -------------------------------------------------------------------------- */

const deal = (
  id: string, company_id: string, title: string, stage: Deal["stage"],
  value: number | null, prob: number | null, closeIn: number, owner: string,
): Deal => ({
  id, company_id, title, stage,
  estimated_value_cents: value === null ? null : eur(value),
  currency: "EUR", probability_pct: prob, owner_id: owner,
  expected_close_on: day(closeIn), contract_ends_on: null,
  lost_reason: stage === "lost" ? "Went with a competitor's placement offer." : null,
});

export const deals: Deal[] = off([
  deal("d1", C.hollow, "Mont Blanc #3 placement", "prospect", 1600, null, 45, "s2"),
  deal("d2", C.vantage, "Matterhorn #2 placement", "prospect", null, null, 60, "s2"),
  deal("d3", C.coldharbour, "Winter skills listing", "contacted", 1200, 20, 38, "s2"),
  deal("d4", C.hollow, "Dolomites trek listings", "conversation", 2400, 35, 30, "s2"),
  deal("d5", C.vantage, "Lyngen ski placement", "proposal", 2500, 50, 21, "s2"),
  deal("d6", C.meridian, "Aconcagua #1 renewal", "negotiation", 2400, 70, 12, "s3"),
  deal("d7", C.serac, "Denali #1 renewal", "negotiation", 2600, 65, 18, "s3"),
  deal("d8", C.cairn, "Matterhorn #1 upgrade", "won", 2000, 100, -4, "s2"),
  deal("d9", C.hollow, "Onboarding — Alta Via", "onboarding", 1450, null, -10, "s3"),
  deal("d10", C.northwind, "Everest #1 annual", "active", 5000, null, -30, "s3"),
  deal("d11", C.lantern, "Everest #2 renewal", "renewal", 4500, 80, 22, "s3"),
  deal("d12", C.northwind, "Manaslu #1 renewal", "renewal", 2300, 60, 3, "s3"),
]);

/* -------------------------------------------------------------------------- */
/* Tasks, audit, tickets, documents, staff, guides                            */
/* -------------------------------------------------------------------------- */

const task = (
  id: string, kind: string, title: string, detail: string,
  priority: Task["priority"], dueIn: number, desk: Task["desk"],
): Task => ({
  id, kind, title, detail, entity_type: "placement", entity_id: null,
  company_id: null, desk, priority, status: "open", due_on: day(dueIn),
});

export const tasks: Task[] = off([
  task("k1", "placement_expiring", "Position #3 on everest expires in 5 days",
    "Term ends soon. Start the renewal conversation, or plan the handover. The position does not change on its own.", "high", 5, "sales"),
  task("k2", "placement_expired", "Position #4 on everest has passed its term",
    "The term ended 12 days ago. The company still holds this position and will continue to until an administrator moves or cancels the placement. Nothing has changed automatically.", "critical", -12, "operations"),
  task("k3", "placement_expiring", "Position #1 on manaslu expires in 3 days",
    "Term ends soon. Start the renewal conversation, or plan the handover.", "high", 3, "sales"),
  task("k4", "content_approval", "6 operator changes awaiting review",
    "Two carry a price change. One is flagged as possibly containing contact details.", "normal", 0, "operations"),
  task("k5", "document_expiring", "Insurance certificate expires in 21 days",
    "Cairn & Compass Trekking — public liability. Ask for the renewed certificate before the current one lapses.", "normal", 21, "operations"),
  task("k6", "unpaid_invoice", "2 invoices past their due date",
    "Serac & Stone Expeditions and Hollow Ridge Mountaineering. Finance to chase.", "high", -6, "finance"),
  task("k7", "disputed_booking", "Booking dispute needs a commercial review",
    "Meridian Col Expeditions contests the attribution on an Aconcagua booking. Referral fee collection is paused until it is resolved.", "critical", -2, "finance"),
  task("k8", "contract_renewal", "Everest #2 contract renewal due",
    "Lantern Pass Expeditions. Twelve-month term ends next month.", "normal", 22, "sales"),
  task("k9", "support_escalation", "Support ticket escalated",
    "A customer reports being asked to pay outside ICEFALL.", "critical", 0, "support"),
]);

export const auditEvents: AuditEvent[] = off([
  { id: "a1", actor_id: "s1", actor_role: "super_admin", action: "placement.moved", entity_type: "placement", entity_id: "p1",
    previous: { slot_position: 3, destination_id: "everest" }, next: { slot_position: 1, destination_id: "everest" },
    reason: "Agreed at renewal.", created_at: at(-1, 14, 31) },
  { id: "a2", actor_id: "s3", actor_role: "operations", action: "content.approved", entity_type: "product", entity_id: P(2),
    previous: { fields: ["price_from_cents"] }, next: { price_from_cents: eur(1650) }, reason: null, created_at: at(-1, 13, 2) },
  { id: "a3", actor_id: "s2", actor_role: "sales", action: "placement.created", entity_type: "placement", entity_id: "p8",
    previous: null, next: { destination_id: "aconcagua", slot_position: 1, status: "active" }, reason: null, created_at: at(-5, 16, 45) },
  { id: "a4", actor_id: "s3", actor_role: "operations", action: "content.rejected", entity_type: "product", entity_id: P(11),
    previous: null, next: { description: "…" }, reason: "Contains a phone number. Customer contact stays inside ICEFALL.", created_at: at(-3, 11, 18) },
  { id: "a5", actor_id: "s1", actor_role: "super_admin", action: "company.suspended", entity_type: "company", entity_id: C.coldharbour,
    previous: { status: "active" }, next: { status: "suspended" }, reason: "Insurance lapsed and not renewed.", created_at: at(-52, 9, 40) },
  { id: "a6", actor_id: "s4", actor_role: "finance", action: "commission.recorded", entity_type: "booking", entity_id: "b1",
    previous: null, next: { rate_bps: PLACEHOLDER_REFERRAL_BPS, basis_cents: eur(62000), amount_cents: eur(4650) }, reason: null, created_at: at(-18, 10, 5) },
  { id: "a7", actor_id: "s3", actor_role: "operations", action: "placement.cancelled", entity_type: "placement", entity_id: "p-old",
    previous: { status: "active", slot_position: 5 }, next: { status: "cancelled", slot_position: 5 }, reason: "Term ended, not renewed.", created_at: at(-30, 15, 12) },
]);

export const tickets: Ticket[] = off([
  { id: "tk1", reference: "T-10048", subject: "Asked to pay by bank transfer outside ICEFALL", type: "safety", priority: "critical", status: "investigating",
    customer_id: "u1", company_id: C.vantage, lead_id: null, booking_id: null, assigned_to: "s5", created_at: at(-1), updated_at: at(0) },
  { id: "tk2", reference: "T-10047", subject: "Departure date moved without notice", type: "booking", priority: "high", status: "open",
    customer_id: "u4", company_id: C.serac, lead_id: "l7", booking_id: "b4", assigned_to: "s5", created_at: at(-2), updated_at: at(-1) },
  { id: "tk3", reference: "T-10046", subject: "Referral fee disputed", type: "payment", priority: "high", status: "waiting",
    customer_id: null, company_id: C.meridian, lead_id: "l15", booking_id: "b5", assigned_to: "s4", created_at: at(-4), updated_at: at(-2) },
  { id: "tk4", reference: "T-10045", subject: "Trek description contains a phone number", type: "content", priority: "medium", status: "resolved",
    customer_id: null, company_id: C.vantage, lead_id: null, booking_id: null, assigned_to: "s3", created_at: at(-6), updated_at: at(-3) },
  { id: "tk5", reference: "T-10044", subject: "Cannot upload insurance certificate", type: "technical", priority: "low", status: "open",
    customer_id: null, company_id: C.cairn, lead_id: null, booking_id: null, assigned_to: null, created_at: at(-8), updated_at: at(-8) },
]);

export const documents: VerificationDocument[] = off([
  { id: "vd1", subject_type: "company", subject_id: C.northwind, subject_name: "Northwind Ascents", kind: "insurance", label: "Public liability — 2026", state: "checked", issued_on: day(-300), expires_on: day(65), checked_on: day(-64), checked_by: "Alex Christofis", note: null },
  { id: "vd2", subject_type: "company", subject_id: C.northwind, subject_name: "Northwind Ascents", kind: "business_registration", label: "Company registration", state: "checked", issued_on: day(-1400), expires_on: null, checked_on: day(-64), checked_by: "Alex Christofis", note: null },
  { id: "vd3", subject_type: "company", subject_id: C.cairn, subject_name: "Cairn & Compass Trekking", kind: "insurance", label: "Public liability — 2026", state: "checked", issued_on: day(-330), expires_on: day(21), checked_on: day(-30), checked_by: "Sarah Johnson", note: "Renewal requested." },
  { id: "vd4", subject_type: "company", subject_id: C.hollow, subject_name: "Hollow Ridge Mountaineering", kind: "licence", label: "Guiding licence — Veneto", state: "pending", issued_on: day(-120), expires_on: day(400), checked_on: null, checked_by: null, note: null },
  { id: "vd5", subject_type: "company", subject_id: C.coldharbour, subject_name: "Cold Harbour Guides", kind: "insurance", label: "Public liability — 2025", state: "expired", issued_on: day(-700), expires_on: day(-52), checked_on: day(-400), checked_by: "Alex Christofis", note: "Lapsed. Company suspended until renewed." },
  { id: "vd6", subject_type: "guide", subject_id: "g1", subject_name: "Tobias Frei", kind: "certification", label: "IFMGA carnet", state: "pending", issued_on: null, expires_on: null, checked_on: null, checked_by: null, note: "Submitted. ICEFALL has not checked this document." },
  { id: "vd7", subject_type: "guide", subject_id: "g2", subject_name: "Pemba Sherpa", kind: "insurance", label: "Professional indemnity", state: "checked", issued_on: day(-200), expires_on: day(160), checked_on: day(-190), checked_by: "Sarah Johnson", note: null },
  { id: "vd8", subject_type: "company", subject_id: C.serac, subject_name: "Serac & Stone Expeditions", kind: "certification", label: "Wilderness first aid — team", state: "rejected", issued_on: day(-500), expires_on: day(-30), checked_on: day(-25), checked_by: "Sarah Johnson", note: "Certificate had already expired when submitted." },
]);

export const staff: StaffRecord[] = off([
  { profile_id: "s1", name: "Alex Christofis", email: "alex@icefall.example", staff_role: "super_admin", department: "Management", active: true, joined_on: day(-700) },
  { profile_id: "s2", name: "Sarah Johnson", email: "sarah@icefall.example", staff_role: "sales", department: "Sales", active: true, joined_on: day(-420) },
  { profile_id: "s3", name: "Daniel Kim", email: "daniel@icefall.example", staff_role: "operations", department: "Operations", active: true, joined_on: day(-380) },
  { profile_id: "s4", name: "Mark Nguyen", email: "mark@icefall.example", staff_role: "finance", department: "Finance", active: true, joined_on: day(-250) },
  { profile_id: "s5", name: "Lucia Ferrer", email: "lucia@icefall.example", staff_role: "support", department: "Support", active: true, joined_on: day(-140) },
  { profile_id: "s6", name: "Tom Ellis", email: "tom@icefall.example", staff_role: "sales", department: "Sales", active: false, joined_on: day(-560) },
]);

export const guides: GuideRecord[] = off([
  { id: "g1", name: "Tobias Frei", based_in: "Switzerland", mountains: ["matterhorn", "mont-blanc"], credentials_verified: false, documents_checked_on: null, leads: 4, bookings: 2, revenue_cents: eur(288), listed: true },
  { id: "g2", name: "Pemba Sherpa", based_in: "Nepal", mountains: ["everest", "ama-dablam"], credentials_verified: false, documents_checked_on: day(-190), leads: 7, bookings: 3, revenue_cents: eur(456), listed: true },
  { id: "g3", name: "Camille Roux", based_in: "France", mountains: ["mont-blanc"], credentials_verified: false, documents_checked_on: null, leads: 2, bookings: 0, revenue_cents: null, listed: true },
  { id: "g4", name: "Ingrid Solberg", based_in: "Norway", mountains: ["matterhorn"], credentials_verified: false, documents_checked_on: null, leads: 1, bookings: 0, revenue_cents: null, listed: false },
]);

export const invoices: Invoice[] = off([
  { id: "i1", number: "INV-10045", company_id: C.northwind, kind: "placement", placement_id: "p1", amount_cents: eur(5000), currency: "EUR", status: "paid", issued_on: day(-30), due_on: day(-16), paid_on: day(-18) },
  { id: "i2", number: "INV-10044", company_id: C.lantern, kind: "placement", placement_id: "p2", amount_cents: eur(4500), currency: "EUR", status: "paid", issued_on: day(-60), due_on: day(-46), paid_on: day(-49) },
  { id: "i3", number: "INV-10043", company_id: C.serac, kind: "placement", placement_id: "p3", amount_cents: eur(3500), currency: "EUR", status: "overdue", issued_on: day(-25), due_on: day(-11), paid_on: null },
  { id: "i4", number: "INV-10042", company_id: C.hollow, kind: "placement", placement_id: "p7", amount_cents: eur(1800), currency: "EUR", status: "overdue", issued_on: day(-20), due_on: day(-6), paid_on: null },
  { id: "i5", number: "INV-10041", company_id: C.northwind, kind: "referral", placement_id: null, amount_cents: eur(4650), currency: "EUR", status: "sent", issued_on: day(-10), due_on: day(4), paid_on: null },
  { id: "i6", number: "INV-10040", company_id: C.cairn, kind: "placement", placement_id: "p6", amount_cents: eur(2200), currency: "EUR", status: "paid", issued_on: day(-20), due_on: day(-6), paid_on: day(-9) },
  { id: "i7", number: "INV-10039", company_id: C.meridian, kind: "referral", placement_id: null, amount_cents: eur(324), currency: "EUR", status: "void", issued_on: day(-46), due_on: day(-32), paid_on: null },
]);

export const payments: Payment[] = off([
  { id: "pay1", invoice_id: "i1", company_id: C.northwind, amount_cents: eur(5000), currency: "EUR", method: "bank_transfer", received_on: day(-18), reference: "NWA-2026-041" },
  { id: "pay2", invoice_id: "i2", company_id: C.lantern, amount_cents: eur(4500), currency: "EUR", method: "bank_transfer", received_on: day(-49), reference: "LPE-88213" },
  { id: "pay3", invoice_id: "i6", company_id: C.cairn, amount_cents: eur(2200), currency: "EUR", method: "bank_transfer", received_on: day(-9), reference: "CC-7741" },
]);

/* -------------------------------------------------------------------------- */
/* Dashboard aggregates                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Figures the mockup shows on the Dashboard that come from no table here.
 *
 * `views` in particular: nothing writes `analytics_events` yet, and a row
 * written by a browser is self-reported anyway. In a real build this tile says
 * so. It carries a number here only because the mockup asked to see the funnel
 * with all four stages filled in, and the banner says what that number is.
 */
export const audience = SHOW_DEMO_DATA
  ? { totalUsers: 18742, activeUsers: 7521, newUsersThisPeriod: 1284, guides: 612 }
  : null;

export const funnel = SHOW_DEMO_DATA
  ? { views: 312456, enquiries: 4821, qualified: 1248, bookings: 356 }
  : null;

/** Recognised revenue by month, oldest first. Cents. */
export const revenueByMonth = SHOW_DEMO_DATA
  ? [
      { month: "Mar", cents: eur(64000) }, { month: "Apr", cents: eur(78200) },
      { month: "May", cents: eur(71400) }, { month: "Jun", cents: eur(96800) },
      { month: "Jul", cents: eur(112300) }, { month: "Aug", cents: eur(128450) },
    ]
  : [];
