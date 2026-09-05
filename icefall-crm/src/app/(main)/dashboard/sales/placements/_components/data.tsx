import { daysUntil } from "./format";

/**
 * The paid positions on each mountain and trek.
 *
 * FIVE SLOTS PER MOUNTAIN, THREE PER TREK, and one company per slot — the
 * database enforces that with a uniqueness rule rather than trusting this
 * screen, because selling the same position twice is the one mistake here that
 * costs money and trust at the same time.
 *
 * An empty slot is a real state and renders as one: unsold, not missing.
 *
 * ROWS ARE PLACEHOLDERS until the data layer is wired. Every company and
 * expedition name below is invented.
 */

export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "suspended";

export type CompanyRow = {
  id: string;
  name: string;
  verification_status: VerificationStatus;
};

export type DestinationKind = "mountain" | "trek";

export type DestinationRow = {
  /** The slug itself — `mont-blanc`, `everest`. Not a uuid. */
  id: string;
  name: string;
  kind: DestinationKind;
  range: string | null;
  region: string | null;
  country: string | null;
  /** A SUMMIT elevation. Always null on a trek — a route's high point is not a summit. */
  elevation_m: number | null;
  /** The high point of a route. A different claim from `elevation_m`. */
  max_altitude_m: number | null;
  duration_days_min: number | null;
  duration_days_max: number | null;
};

export type ProductRow = {
  id: string;
  company_id: string;
  name: string;
};

/** What an administrator set. `expired` is never stored. */
export type PlacementStoredStatus = "reserved" | "active" | "cancelled";
/** What the `placement_status` view computes at read time, including expiry. */
export type PlacementEffectiveStatus = PlacementStoredStatus | "expired";

export type PlacementRecord = {
  id: string;
  company_id: string;
  destination_id: string;
  /**
   * The expedition this paid position features.
   *
   * NULL means the company has bought the slot and not yet chosen what to put
   * in it — a real state, not a gap, and it renders as one.
   */
  product_id: string | null;
  slot_position: number;
  starts_on: string;
  ends_on: string;
  status: PlacementStoredStatus;
  price_cents: number | null;
  currency: string;
  changed_by: string | null;
  changed_at: string | null;
  change_reason: string | null;
};

export type PlacementView = PlacementRecord & {
  effective_status: PlacementEffectiveStatus;
  /** True once the term has run out. A flag for a person — nothing acts on it. */
  needs_review: boolean;
  days_remaining: number;
};

export type AuditEventRow = {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  previous: Record<string, unknown> | null;
  next: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
};

export type EnquiryRow = { id: string; destination_id: string | null };
export type LeadDestinationRow = { id: string; destination_id: string | null };
export type CommissionRow = { amount_cents: number; status: "pending" | "paid" | "waived" };
export type BookingRow = {
  id: string;
  destination_id: string | null;
  value_cents: number | null;
  commissions: CommissionRow[];
};

/**
 * How many paid positions a destination has. Owner decision 17.
 *
 * Mountains five (1 Premium + 4 Featured), treks three. 252 treks at five
 * apiece would be 1,260 sellable positions, and scarcity is the whole of what
 * makes a featured slot worth buying. The database enforces the same numbers
 * with a trigger — this is the screen agreeing with it, not deciding it.
 */
export const slotsFor = (kind: DestinationKind): number[] => (kind === "trek" ? [1, 2, 3] : [1, 2, 3, 4, 5]);

/** How many recent audit events the detail page reads before filtering to one placement. */
export const HISTORY_WINDOW = 200;

/**
 * Placeholder terms are written as offsets from today rather than as fixed
 * days, so "expires within 30 days" and "the term has ended" keep meaning
 * something whenever this build is opened. Read in UTC on both server and
 * client for the same reason `daysUntil` is.
 */
function day(offsetDays: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
  return d.toISOString().slice(0, 10);
}

const C = {
  northwind: "5b1f2c8a-3d47-4c19-9a02-6e8b41d7f930",
  lantern: "c4e97a10-8b62-4f35-ae71-2d09c5b83e46",
  serac: "9d3b6f21-47ce-4a80-b512-8f6a02d94c17",
  meridian: "2a7c48d9-16fb-4e53-8d90-b3e7f5610a28",
  coldharbour: "7e50b3c6-92a4-4d17-bf38-014c6a29d8b5",
  fellgate: "18f4d2e7-5a30-4b96-9c47-e2081bd53f6a",
  southface: "a6c19e34-70d8-4512-8b6f-39d4e0721c85",
  wayfarer: "d2073b58-e419-4a6c-95f1-8c6047be2d13",
  glacier: "63f8ac1d-2e57-4903-b8a4-70d1e695fc28",
  /** On the directory, with nothing listed yet — the add form says so. */
  northstar: "b7d4e2f9-51a6-4c30-9e82-4f0b73ca615d",
  /** Deliberately absent from `companies` — the row it holds must say so. */
  missing: "ff41903e-6b2d-4c78-a015-93e7d2864b10",
} as const;

export const companies: CompanyRow[] = [
  { id: C.northwind, name: "Northwind Ascents", verification_status: "verified" },
  { id: C.lantern, name: "Lantern Pass Expeditions", verification_status: "verified" },
  { id: C.serac, name: "Serac & Stone", verification_status: "unverified" },
  { id: C.meridian, name: "Meridian Alpine Guiding", verification_status: "verified" },
  { id: C.coldharbour, name: "Coldharbour Mountaineering", verification_status: "pending" },
  { id: C.fellgate, name: "Fellgate Trekking Co.", verification_status: "verified" },
  { id: C.southface, name: "Southface Alpine", verification_status: "unverified" },
  { id: C.wayfarer, name: "Wayfarer High Routes", verification_status: "verified" },
  { id: C.glacier, name: "Glacier Verte Guiding", verification_status: "verified" },
  { id: C.northstar, name: "Northstar Ridge Guiding", verification_status: "pending" },
];

export const products: ProductRow[] = [
  { id: "pr-northwind-everest-south", company_id: C.northwind, name: "Everest South Col Expedition" },
  { id: "pr-northwind-lhotse", company_id: C.northwind, name: "Lhotse Autumn Ascent" },
  { id: "pr-lantern-everest", company_id: C.lantern, name: "Everest Ridge Programme" },
  { id: "pr-lantern-k2", company_id: C.lantern, name: "K2 Abruzzi Spur" },
  { id: "pr-serac-everest", company_id: C.serac, name: "Everest Extended Rotation" },
  { id: "pr-meridian-matterhorn", company_id: C.meridian, name: "Matterhorn Hörnli Ridge" },
  { id: "pr-meridian-k2", company_id: C.meridian, name: "K2 North Pillar Reconnaissance" },
  { id: "pr-coldharbour-everest", company_id: C.coldharbour, name: "Everest Two-Season Programme" },
  { id: "pr-coldharbour-annapurna", company_id: C.coldharbour, name: "Annapurna Circuit Guided" },
  { id: "pr-fellgate-tmb", company_id: C.fellgate, name: "Tour du Mont Blanc Full Loop" },
  { id: "pr-fellgate-ebc", company_id: C.fellgate, name: "Everest Base Camp Trek" },
  { id: "pr-fellgate-kilimanjaro", company_id: C.fellgate, name: "Kilimanjaro Machame Route" },
  { id: "pr-southface-denali", company_id: C.southface, name: "Denali West Buttress" },
  { id: "pr-southface-chooyu", company_id: C.southface, name: "Cho Oyu Standard Route" },
  { id: "pr-wayfarer-denali", company_id: C.wayfarer, name: "Denali Expedition Course" },
  { id: "pr-wayfarer-ebc", company_id: C.wayfarer, name: "Base Camp and Kala Patthar" },
  { id: "pr-glacier-montblanc", company_id: C.glacier, name: "Mont Blanc Goûter Route" },
  // Northstar Ridge Guiding has no expedition listed. The add form's expedition
  // step has a sentence for that, and nothing here should hide it.
];

export const destinations: DestinationRow[] = [
  {
    id: "everest",
    name: "Mount Everest",
    kind: "mountain",
    range: "Mahalangur Himal",
    region: "Khumbu",
    country: "Nepal",
    elevation_m: 8849,
    max_altitude_m: null,
    duration_days_min: null,
    duration_days_max: null,
  },
  {
    id: "k2",
    name: "K2",
    kind: "mountain",
    range: "Karakoram",
    region: "Gilgit-Baltistan",
    country: "Pakistan",
    elevation_m: 8611,
    max_altitude_m: null,
    duration_days_min: null,
    duration_days_max: null,
  },
  {
    id: "cho-oyu",
    name: "Cho Oyu",
    kind: "mountain",
    range: "Mahalangur Himal",
    region: "Tibet",
    country: "China",
    elevation_m: 8188,
    max_altitude_m: null,
    duration_days_min: null,
    duration_days_max: null,
  },
  {
    id: "denali",
    name: "Denali",
    kind: "mountain",
    range: "Alaska Range",
    region: "Alaska",
    country: "United States",
    elevation_m: 6190,
    max_altitude_m: null,
    duration_days_min: null,
    duration_days_max: null,
  },
  {
    id: "aconcagua",
    name: "Aconcagua",
    kind: "mountain",
    range: "Andes",
    region: "Mendoza",
    country: "Argentina",
    elevation_m: 6961,
    max_altitude_m: null,
    duration_days_min: null,
    duration_days_max: null,
  },
  {
    id: "kilimanjaro",
    name: "Kilimanjaro",
    kind: "mountain",
    range: null,
    region: "Kilimanjaro Region",
    country: "Tanzania",
    elevation_m: 5895,
    max_altitude_m: null,
    duration_days_min: null,
    duration_days_max: null,
  },
  {
    id: "matterhorn",
    name: "Matterhorn",
    kind: "mountain",
    range: "Pennine Alps",
    region: "Valais",
    country: "Switzerland",
    elevation_m: 4478,
    max_altitude_m: null,
    duration_days_min: null,
    duration_days_max: null,
  },
  {
    id: "mont-blanc",
    name: "Mont Blanc",
    kind: "mountain",
    range: "Graian Alps",
    region: "Haute-Savoie",
    country: "France",
    elevation_m: 4808,
    max_altitude_m: null,
    duration_days_min: null,
    duration_days_max: null,
  },
  {
    id: "elbrus",
    name: "Mount Elbrus",
    kind: "mountain",
    range: "Caucasus",
    region: "Kabardino-Balkaria",
    country: "Russia",
    elevation_m: 5642,
    max_altitude_m: null,
    duration_days_min: null,
    duration_days_max: null,
  },
  {
    // No summit elevation on file. The card says so rather than showing a blank.
    id: "ama-dablam",
    name: "Ama Dablam",
    kind: "mountain",
    range: "Mahalangur Himal",
    region: "Khumbu",
    country: "Nepal",
    elevation_m: null,
    max_altitude_m: null,
    duration_days_min: null,
    duration_days_max: null,
  },
  {
    id: "tour-du-mont-blanc",
    name: "Tour du Mont Blanc",
    kind: "trek",
    range: null,
    region: "Haute-Savoie",
    country: "France",
    elevation_m: null,
    max_altitude_m: 2665,
    duration_days_min: 10,
    duration_days_max: 12,
  },
  {
    id: "everest-base-camp-trek",
    name: "Everest Base Camp Trek",
    kind: "trek",
    range: null,
    region: "Khumbu",
    country: "Nepal",
    elevation_m: null,
    max_altitude_m: 5545,
    duration_days_min: 14,
    duration_days_max: 14,
  },
  {
    id: "annapurna-circuit-trek",
    name: "Annapurna Circuit",
    kind: "trek",
    range: null,
    region: "Gandaki",
    country: "Nepal",
    elevation_m: null,
    max_altitude_m: 5416,
    duration_days_min: 15,
    duration_days_max: 20,
  },
  {
    // Nothing about this route is on file yet — the card says that in words.
    id: "torres-del-paine-w-trek",
    name: "Torres del Paine W Trek",
    kind: "trek",
    range: null,
    region: null,
    country: null,
    elevation_m: null,
    max_altitude_m: null,
    duration_days_min: null,
    duration_days_max: null,
  },
];

export const placements: PlacementRecord[] = [
  /* ---- Everest: four held, slot 3 free -------------------------------- */
  {
    id: "0a1c4f72-91d3-4b08-8e57-2c60df9a1b43",
    company_id: C.northwind,
    destination_id: "everest",
    product_id: "pr-northwind-everest-south",
    slot_position: 1,
    starts_on: day(-120),
    ends_on: day(245),
    status: "active",
    price_cents: 500_000,
    currency: "EUR",
    changed_by: "1a2b3c4d-5e6f-4708-9a1b-2c3d4e5f6071",
    changed_at: `${day(-31)}T09:14:00.000Z`,
    change_reason: "Renewed for a second term at the agreed rate",
  },
  {
    // Slot bought, nothing chosen to put in it yet.
    id: "1b2d5e83-a204-4c19-9f68-3d71e0ab2c54",
    company_id: C.lantern,
    destination_id: "everest",
    product_id: null,
    slot_position: 2,
    starts_on: day(-90),
    ends_on: day(275),
    status: "active",
    price_cents: 400_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    // Active with no agreed price — the Summary tile names this exclusion.
    id: "2c3e6f94-b315-4d2a-8071-4e82f1bc3d65",
    company_id: C.serac,
    destination_id: "everest",
    product_id: "pr-serac-everest",
    slot_position: 4,
    starts_on: day(-30),
    ends_on: day(335),
    status: "active",
    price_cents: null,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    // Inside thirty days of its end.
    id: "3d4f70a5-c426-4e3b-9182-5f930cad4e76",
    company_id: C.coldharbour,
    destination_id: "everest",
    product_id: "pr-coldharbour-everest",
    slot_position: 5,
    starts_on: day(-347),
    ends_on: day(18),
    status: "active",
    price_cents: 255_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },

  /* ---- K2: sells, but nobody holds #1 --------------------------------- */
  {
    id: "4e5081b6-d537-4f4c-a293-60a41dbe5f87",
    company_id: C.meridian,
    destination_id: "k2",
    product_id: "pr-meridian-k2",
    slot_position: 2,
    starts_on: day(-60),
    ends_on: day(400),
    status: "active",
    price_cents: 300_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    // The companies directory does not carry this id.
    id: "5f6192c7-e648-405d-b3a4-71b52ecf6098",
    company_id: C.missing,
    destination_id: "k2",
    product_id: null,
    slot_position: 3,
    starts_on: day(-200),
    ends_on: day(165),
    status: "active",
    price_cents: 180_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },

  /* ---- Denali: one term has run out, one is reserved ------------------ */
  {
    id: "6072a3d8-f759-4160-c4b5-82c63fda71a9",
    company_id: C.wayfarer,
    destination_id: "denali",
    product_id: "pr-wayfarer-denali",
    slot_position: 1,
    starts_on: day(-379),
    ends_on: day(-14),
    status: "active",
    price_cents: 340_000,
    currency: "EUR",
    changed_by: "9f8e7d6c-5b4a-4938-8271-605f4e3d2c1b",
    changed_at: `${day(-210)}T15:02:00.000Z`,
    change_reason: "Price corrected after the signed order form",
  },
  {
    id: "7183b4e9-086a-4271-d5c6-93d740eb82ba",
    company_id: C.southface,
    destination_id: "denali",
    product_id: "pr-southface-denali",
    slot_position: 3,
    starts_on: day(20),
    ends_on: day(385),
    status: "reserved",
    price_cents: 220_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },

  /* ---- Matterhorn: every position held -------------------------------- */
  {
    id: "8294c5fa-197b-4382-e6d7-a4e851fc93cb",
    company_id: C.meridian,
    destination_id: "matterhorn",
    product_id: "pr-meridian-matterhorn",
    slot_position: 1,
    starts_on: day(-100),
    ends_on: day(265),
    status: "active",
    price_cents: 275_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    id: "93a5d60b-2a8c-4493-f7e8-b5f9620da4dc",
    company_id: C.northwind,
    destination_id: "matterhorn",
    product_id: null,
    slot_position: 2,
    starts_on: day(-45),
    ends_on: day(320),
    status: "active",
    price_cents: 190_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    id: "a4b6e71c-3b9d-45a4-08f9-c60a731eb5ed",
    company_id: C.serac,
    destination_id: "matterhorn",
    product_id: null,
    slot_position: 3,
    starts_on: day(35),
    ends_on: day(400),
    status: "reserved",
    price_cents: 150_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    id: "b5c7f82d-4cae-46b5-190a-d71b842fc6fe",
    company_id: C.fellgate,
    destination_id: "matterhorn",
    product_id: null,
    slot_position: 4,
    starts_on: day(-15),
    ends_on: day(350),
    status: "active",
    price_cents: 140_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    id: "c6d8093e-5dbf-47c6-2a1b-e82c9530d70f",
    company_id: C.lantern,
    destination_id: "matterhorn",
    product_id: null,
    slot_position: 5,
    starts_on: day(-5),
    ends_on: day(360),
    status: "active",
    price_cents: 125_000,
    currency: "GBP",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },

  /* ---- Aconcagua: one cancelled row, so nothing is held --------------- */
  {
    id: "d7e91a4f-6ec0-48d7-3b2c-f93da641e810",
    company_id: C.coldharbour,
    destination_id: "aconcagua",
    product_id: null,
    slot_position: 1,
    starts_on: day(-260),
    ends_on: day(105),
    status: "cancelled",
    price_cents: 210_000,
    currency: "EUR",
    changed_by: "1a2b3c4d-5e6f-4708-9a1b-2c3d4e5f6071",
    changed_at: `${day(-40)}T11:47:00.000Z`,
    change_reason: "Ended early at the company's request",
  },

  /* ---- Mont Blanc: one expiring, one already past --------------------- */
  {
    id: "e8fa2b50-7fd1-49e8-4c3d-04eb7520f921",
    company_id: C.glacier,
    destination_id: "mont-blanc",
    product_id: "pr-glacier-montblanc",
    slot_position: 1,
    starts_on: day(-336),
    ends_on: day(29),
    status: "active",
    price_cents: 275_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    id: "f90b3c61-80e2-4af9-5d4e-15fc86310a32",
    company_id: C.fellgate,
    destination_id: "mont-blanc",
    product_id: null,
    slot_position: 2,
    starts_on: day(-425),
    ends_on: day(-60),
    status: "active",
    price_cents: 95_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },

  /* ---- Cho Oyu and Kilimanjaro ---------------------------------------- */
  {
    id: "0a1c4d72-91e3-4b08-6e5f-26904a721b43",
    company_id: C.southface,
    destination_id: "cho-oyu",
    product_id: "pr-southface-chooyu",
    slot_position: 1,
    starts_on: day(-368),
    ends_on: day(-3),
    status: "active",
    price_cents: 160_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    id: "1b2d5e83-a2f4-4c19-7f60-370a5b832c54",
    company_id: C.fellgate,
    destination_id: "kilimanjaro",
    product_id: "pr-fellgate-kilimanjaro",
    slot_position: 5,
    starts_on: day(-75),
    ends_on: day(290),
    status: "active",
    price_cents: 85_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },

  /* ---- Treks: three positions each ------------------------------------ */
  {
    id: "2c3e6f94-b305-4d2a-8071-481b6c943d65",
    company_id: C.fellgate,
    destination_id: "tour-du-mont-blanc",
    product_id: "pr-fellgate-tmb",
    slot_position: 1,
    starts_on: day(-50),
    ends_on: day(315),
    status: "active",
    price_cents: 120_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    id: "3d4f70a5-c416-4e3b-9182-592c7da54e76",
    company_id: C.wayfarer,
    destination_id: "tour-du-mont-blanc",
    product_id: null,
    slot_position: 2,
    starts_on: day(-20),
    ends_on: day(345),
    status: "active",
    price_cents: null,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    id: "4e5081b6-d527-4f4c-a293-6a3d8eb65f87",
    company_id: C.wayfarer,
    destination_id: "everest-base-camp-trek",
    product_id: "pr-wayfarer-ebc",
    slot_position: 1,
    starts_on: day(-140),
    ends_on: day(225),
    status: "active",
    price_cents: 145_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    id: "5f6192c7-e638-405d-b3a4-7b4e9fc76098",
    company_id: C.fellgate,
    destination_id: "everest-base-camp-trek",
    product_id: "pr-fellgate-ebc",
    slot_position: 2,
    starts_on: day(-110),
    ends_on: day(255),
    status: "active",
    price_cents: 110_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    id: "6072a3d8-f749-4160-c4b5-8c5f0ad871a9",
    company_id: C.glacier,
    destination_id: "everest-base-camp-trek",
    product_id: null,
    slot_position: 3,
    starts_on: day(45),
    ends_on: day(410),
    status: "reserved",
    price_cents: 90_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
  {
    id: "7183b4e9-085a-4271-d5c6-9d601be982ba",
    company_id: C.coldharbour,
    destination_id: "annapurna-circuit-trek",
    product_id: "pr-coldharbour-annapurna",
    slot_position: 2,
    starts_on: day(-80),
    ends_on: day(285),
    status: "active",
    price_cents: 100_000,
    currency: "EUR",
    changed_by: null,
    changed_at: null,
    change_reason: null,
  },
];

/**
 * `effective_status` is worked out when the row is READ and is never written
 * back — an expired term does not vacate the slot, and nothing on this screen
 * happens on a timer.
 */
export function toView(p: PlacementRecord): PlacementView {
  const days_remaining = daysUntil(p.ends_on);
  const effective_status: PlacementEffectiveStatus =
    p.status === "cancelled" ? "cancelled" : days_remaining < 0 ? "expired" : p.status;
  return { ...p, effective_status, needs_review: effective_status === "expired", days_remaining };
}

export const placementViews = (): PlacementView[] => placements.map(toView);

/**
 * The audit log, newest first — the same rows the Activity Log draws. The
 * placement detail page filters this to one placement rather than keeping a
 * history of its own; a second history would be a second version of the truth.
 */
export const auditEvents: AuditEventRow[] = [
  {
    id: "ae-0009",
    actor_id: "1a2b3c4d-5e6f-4708-9a1b-2c3d4e5f6071",
    actor_role: "sales_admin",
    action: "placement.renewed",
    entity_type: "placement",
    entity_id: "0a1c4f72-91d3-4b08-8e57-2c60df9a1b43",
    previous: { starts_on: day(-485), ends_on: day(-120), price_cents: 450_000 },
    next: { starts_on: day(-120), ends_on: day(245), price_cents: 500_000 },
    reason: "Renewed for a second term at the agreed rate",
    created_at: `${day(-31)}T09:14:00.000Z`,
  },
  {
    id: "ae-0008",
    actor_id: null,
    actor_role: null,
    action: "placement.reviewed",
    entity_type: "placement",
    entity_id: "0a1c4f72-91d3-4b08-8e57-2c60df9a1b43",
    previous: null,
    next: null,
    reason: null,
    created_at: `${day(-33)}T02:00:00.000Z`,
  },
  {
    id: "ae-0007",
    actor_id: "9f8e7d6c-5b4a-4938-8271-605f4e3d2c1b",
    actor_role: "sales",
    action: "placement.created",
    entity_type: "placement",
    entity_id: "0a1c4f72-91d3-4b08-8e57-2c60df9a1b43",
    previous: null,
    next: {
      slot_position: 1,
      company_id: C.northwind,
      destination_id: "everest",
      status: "active",
      price_cents: 450_000,
      currency: "EUR",
      starts_on: day(-485),
      ends_on: day(-120),
    },
    reason: "Signed order form received",
    created_at: `${day(-486)}T10:20:00.000Z`,
  },
  {
    id: "ae-0006",
    actor_id: "9f8e7d6c-5b4a-4938-8271-605f4e3d2c1b",
    actor_role: "sales",
    action: "placement.price_changed",
    entity_type: "placement",
    entity_id: "6072a3d8-f759-4160-c4b5-82c63fda71a9",
    previous: { price_cents: 300_000 },
    next: { price_cents: 340_000 },
    reason: "Price corrected after the signed order form",
    created_at: `${day(-210)}T15:02:00.000Z`,
  },
  {
    id: "ae-0005",
    actor_id: "9f8e7d6c-5b4a-4938-8271-605f4e3d2c1b",
    actor_role: "sales",
    action: "placement.created",
    entity_type: "placement",
    entity_id: "6072a3d8-f759-4160-c4b5-82c63fda71a9",
    previous: null,
    next: {
      slot_position: 1,
      company_id: C.wayfarer,
      destination_id: "denali",
      status: "active",
      price_cents: 300_000,
      currency: "EUR",
      starts_on: day(-379),
      ends_on: day(-14),
    },
    reason: null,
    created_at: `${day(-380)}T08:45:00.000Z`,
  },
  {
    id: "ae-0004",
    actor_id: "1a2b3c4d-5e6f-4708-9a1b-2c3d4e5f6071",
    actor_role: "sales_admin",
    action: "placement.cancelled",
    entity_type: "placement",
    entity_id: "d7e91a4f-6ec0-48d7-3b2c-f93da641e810",
    previous: { status: "active" },
    next: { status: "cancelled" },
    reason: "Ended early at the company's request",
    created_at: `${day(-40)}T11:47:00.000Z`,
  },
  {
    id: "ae-0003",
    actor_id: "1a2b3c4d-5e6f-4708-9a1b-2c3d4e5f6071",
    actor_role: "sales_admin",
    action: "placement.moved",
    entity_type: "placement",
    entity_id: "4e5081b6-d537-4f4c-a293-60a41dbe5f87",
    previous: { slot_position: 4 },
    next: { slot_position: 2 },
    reason: "Moved up after the previous holder's term ended",
    created_at: `${day(-58)}T16:30:00.000Z`,
  },
  {
    id: "ae-0002",
    actor_id: null,
    actor_role: "system",
    action: "company.updated",
    entity_type: "company",
    entity_id: C.fellgate,
    previous: { verification_status: "pending" },
    next: { verification_status: "verified" },
    reason: "Documents checked",
    created_at: `${day(-95)}T12:00:00.000Z`,
  },
  {
    id: "ae-0001",
    actor_id: "9f8e7d6c-5b4a-4938-8271-605f4e3d2c1b",
    actor_role: "sales",
    action: "placement.created",
    entity_type: "placement",
    entity_id: "4e5081b6-d537-4f4c-a293-60a41dbe5f87",
    previous: null,
    next: {
      slot_position: 4,
      company_id: C.meridian,
      destination_id: "k2",
      status: "active",
      price_cents: 300_000,
      currency: "EUR",
      starts_on: day(-60),
      ends_on: day(400),
    },
    reason: null,
    created_at: `${day(-61)}T09:05:00.000Z`,
  },
];

/** Lead rows naming a destination — the enquiries strip counts these. */
export const leadDestinations: LeadDestinationRow[] = [
  { id: "ld-01", destination_id: "everest" },
  { id: "ld-02", destination_id: "everest" },
  { id: "ld-03", destination_id: "everest" },
  { id: "ld-04", destination_id: "everest" },
  { id: "ld-05", destination_id: "k2" },
  { id: "ld-06", destination_id: "matterhorn" },
  { id: "ld-07", destination_id: "tour-du-mont-blanc" },
  { id: "ld-08", destination_id: "tour-du-mont-blanc" },
  { id: "ld-09", destination_id: "denali" },
  { id: "ld-10", destination_id: null },
];

export const enquiries: EnquiryRow[] = [
  { id: "en-01", destination_id: "everest" },
  { id: "en-02", destination_id: "everest" },
  { id: "en-03", destination_id: "everest" },
  { id: "en-04", destination_id: "everest" },
  { id: "en-05", destination_id: "k2" },
  { id: "en-06", destination_id: "matterhorn" },
  { id: "en-07", destination_id: "tour-du-mont-blanc" },
  { id: "en-08", destination_id: "tour-du-mont-blanc" },
  { id: "en-09", destination_id: "denali" },
  { id: "en-10", destination_id: null },
];

export const bookings: BookingRow[] = [
  {
    id: "bk-01",
    destination_id: "everest",
    value_cents: 4_200_000,
    commissions: [{ amount_cents: 420_000, status: "paid" }],
  },
  {
    id: "bk-02",
    destination_id: "everest",
    value_cents: 3_800_000,
    commissions: [{ amount_cents: 380_000, status: "pending" }],
  },
  {
    // Booked, value never recorded. The tile names how many are like this
    // rather than folding them in as zero.
    id: "bk-03",
    destination_id: "everest",
    value_cents: null,
    commissions: [],
  },
  {
    id: "bk-04",
    destination_id: "matterhorn",
    value_cents: 620_000,
    commissions: [{ amount_cents: 62_000, status: "waived" }],
  },
  {
    id: "bk-05",
    destination_id: "tour-du-mont-blanc",
    value_cents: 340_000,
    commissions: [{ amount_cents: 34_000, status: "paid" }],
  },
  {
    id: "bk-06",
    destination_id: "k2",
    value_cents: 2_900_000,
    commissions: [{ amount_cents: 290_000, status: "pending" }],
  },
];
