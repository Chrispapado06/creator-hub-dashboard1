/**
 * Placeholder rows for the Companies area.
 *
 * THERE IS NO DATABASE BEHIND THIS BUILD. Every row below is invented, and the
 * shapes mirror `public.companies`, `public.revenue_records`, the
 * `placement_status` view, `public.company_users` and
 * `public.company_invitations` field for field — so the day a query replaces
 * these arrays, no consumer changes.
 *
 * ═══ TWO RULES THESE ROWS EXIST UNDER ═══
 *
 * 1. NOT ONE COMPANY HERE IS VERIFIED. `verification_status: "verified"` is a
 *    claim that a named member of ICEFALL staff read a real company's papers on
 *    a real date. There is no such person and no such date in a placeholder
 *    file, so a verified row would be a badge nobody earned. The coherence
 *    assertion at the foot of this file refuses one anyway.
 *
 * 2. EVERY NAME HERE IS INVENTED. Elite Exped is a real trading company and
 *    must never appear in placeholder data, nor may any invented figure,
 *    booking, revenue, status or inspection date be attached to it. The same
 *    goes for every other real operator the platform knows about — the old
 *    mockup's "Alpine Ascents" row was removed for exactly this reason.
 */

export type CompanyStatus = "prospect" | "onboarding" | "active" | "suspended" | "churned";
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "suspended";

export type CompanyRow = {
  id: string;
  /** URL key. Same grammar the table's CHECK enforces: lowercase, hyphenated. */
  slug: string;
  name: string;
  legal_name: string | null;
  description: string | null;
  countries: string[];
  regions: string[];
  status: CompanyStatus;
  verification_status: VerificationStatus;
  /**
   * TRUE only for a real, identifiable business. Keys the public disclosure, so
   * the flag hangs off the RECORD rather than off any one page — a real
   * operator cannot be rendered on a surface where the disclosure was left out.
   * Never set from a form or a draft; staff raise it deliberately or it stays
   * false.
   */
  real_business: boolean;
  /** Set only by a real staff review. NULL renders as absent, never as a date. */
  documents_checked_at: string | null;
  documents_checked_by: string | null;
  created_at: string;
};

export type RevenueStatus = "invoiced" | "paid" | "written_off";

export type RevenueRecord = {
  id: string;
  company_id: string | null;
  recognised_on: string;
  amount_cents: number;
  status: RevenueStatus;
};

export type PlacementEffectiveStatus = "reserved" | "active" | "cancelled" | "expired";

export type PlacementRecord = {
  id: string;
  company_id: string;
  destination_id: string;
  /** Resolved by the caller. A raw id on screen is a row nobody can read. */
  destination_name: string | null;
  slot_position: number;
  starts_on: string;
  ends_on: string;
  /** NULL is a deal term nobody has set yet — neither zero nor unknown. */
  price_cents: number | null;
  currency: string;
  effective_status: PlacementEffectiveStatus;
  /** True once the term has run out. A flag for a person — nothing acts on it. */
  needs_review: boolean;
};

export type CompanyMemberRow = {
  profile_id: string;
  company_id: string;
  name: string;
  company_role: "admin" | "sales";
  status: string;
};

export type CompanyInvitationRow = {
  id: string;
  company_id: string;
  email: string;
  company_role: "admin" | "sales";
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export const companies: CompanyRow[] = [
  {
    id: "c-001",
    slug: "northwind-ascents",
    name: "Northwind Ascents",
    legal_name: "Northwind Ascents Pvt. Ltd.",
    description: "Guided 8,000m expeditions and acclimatisation treks out of the Khumbu.",
    countries: ["Nepal"],
    regions: ["Khumbu", "Rolwaling"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2022-03-14",
  },
  {
    id: "c-002",
    slug: "lantern-pass-expeditions",
    name: "Lantern Pass Expeditions",
    legal_name: "Lantern Pass Expeditions Pvt. Ltd.",
    description: "Small-team expeditions on the Nepalese side, six clients to a rope.",
    countries: ["Nepal"],
    regions: ["Khumbu"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2022-07-02",
  },
  {
    id: "c-003",
    slug: "serac-and-stone",
    name: "Serac & Stone",
    legal_name: "Serac und Stein AG",
    description: "Alpine guiding across the Valais and Bernese Oberland.",
    countries: ["Switzerland"],
    regions: ["Valais", "Bernese Oberland"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-01-19",
  },
  {
    id: "c-004",
    slug: "kibo-treks",
    name: "Kibo Treks",
    legal_name: null,
    description: "Kilimanjaro routes and Rift Valley approach treks.",
    countries: ["Tanzania"],
    regions: ["Kilimanjaro"],
    status: "onboarding",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-05-08",
  },
  {
    id: "c-005",
    slug: "summit-trails-collective",
    name: "Summit Trails Collective",
    legal_name: null,
    description: null,
    countries: [],
    regions: [],
    status: "prospect",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-08-21",
  },
  {
    id: "c-006",
    slug: "hollow-ridge-mountaineering",
    name: "Hollow Ridge Mountaineering",
    legal_name: "Hollow Ridge Mountaineering (Pvt) Ltd",
    description: "Karakoram expeditions with a permanent base-camp crew.",
    countries: ["Pakistan"],
    regions: ["Karakoram", "Gilgit-Baltistan"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2022-11-30",
  },
  {
    id: "c-007",
    slug: "cordillera-ascents",
    name: "Cordillera Ascents",
    legal_name: "Cordillera Ascents S.A.C.",
    description: "Blanca and Huayhuash climbs, run from Huaraz.",
    countries: ["Peru"],
    regions: ["Cordillera Blanca", "Cordillera Huayhuash"],
    status: "active",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-04-11",
  },
  {
    id: "c-008",
    slug: "falkenrath-expeditions",
    name: "Falkenrath Expeditions",
    legal_name: "Falkenrath Expeditionen GmbH",
    description: "Ski-mountaineering and high-alpine courses in the Eastern Alps.",
    countries: ["Austria", "Italy"],
    regions: ["Tyrol", "Dolomites"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-06-27",
  },
  {
    id: "c-009",
    slug: "halvorsen-alpine",
    name: "Halvorsen Alpine",
    legal_name: "Halvorsen Alpine AS",
    description: null,
    countries: ["Norway"],
    regions: ["Lofoten", "Jotunheimen"],
    status: "onboarding",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-06-15",
  },
  {
    id: "c-010",
    slug: "solukhumbu-expeditions",
    name: "Solukhumbu Expeditions",
    legal_name: "Solukhumbu Expeditions Pvt. Ltd.",
    description: "Everest, Lhotse and Ama Dablam, plus the approach treks that feed them.",
    countries: ["Nepal"],
    regions: ["Khumbu", "Solukhumbu"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2021-09-05",
  },
  {
    id: "c-011",
    slug: "blue-iceline-guides",
    name: "Blue Iceline Guides",
    legal_name: null,
    description: "Icefield traverses and Rockies alpine courses.",
    countries: ["Canada"],
    regions: ["Canadian Rockies"],
    status: "onboarding",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-04-02",
  },
  {
    id: "c-012",
    slug: "marmot-col-adventures",
    name: "Marmot Col Adventures",
    legal_name: "Marmot Col Adventures Pvt. Ltd.",
    description: "Garhwal and Ladakh expeditions, permits handled in-house.",
    countries: ["India"],
    regions: ["Garhwal", "Ladakh"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-02-08",
  },
  {
    id: "c-013",
    slug: "windward-cwm-expeditions",
    name: "Windward Cwm Expeditions",
    legal_name: null,
    description: null,
    countries: ["Nepal"],
    regions: [],
    status: "suspended",
    verification_status: "suspended",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2022-05-16",
  },
  {
    id: "c-014",
    slug: "granite-bell-alpine",
    name: "Granite Bell Alpine",
    legal_name: "Granite Bell Alpine LLC",
    description: "Cascade and Sierra climbing programmes.",
    countries: ["United States"],
    regions: ["Cascades", "Sierra Nevada"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2022-08-23",
  },
  {
    id: "c-015",
    slug: "ptarmigan-peak-guides",
    name: "Ptarmigan Peak Guides",
    legal_name: "Ptarmigan Peak Guides Ltd",
    description: "Winter skills and Cuillin traverses.",
    countries: ["United Kingdom"],
    regions: ["Highlands", "Skye"],
    status: "active",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-10-04",
  },
  {
    id: "c-016",
    slug: "silver-cornice-trekking",
    name: "Silver Cornice Trekking",
    legal_name: null,
    description: "Annapurna and Manaslu circuits with fixed lodge partners.",
    countries: ["Nepal"],
    regions: ["Annapurna", "Manaslu"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-12-12",
  },
  {
    id: "c-017",
    slug: "verglas-mountain-co",
    name: "Verglas Mountain Co.",
    legal_name: "Verglas Montagne SARL",
    description: "Chamonix-based guiding, Mont Blanc range only.",
    countries: ["France"],
    regions: ["Mont Blanc massif"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2022-02-17",
  },
  {
    id: "c-018",
    slug: "kalte-nadel-bergfuehrer",
    name: "Kalte Nadel Bergführer",
    legal_name: "Kalte Nadel Bergführer GmbH",
    description: null,
    countries: ["Germany", "Austria"],
    regions: ["Allgäu"],
    status: "churned",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2021-11-08",
  },
  {
    id: "c-019",
    slug: "terra-alta-expediciones",
    name: "Terra Alta Expediciones",
    legal_name: "Terra Alta Expediciones S.R.L.",
    description: "Aconcagua and Puna de Atacama expeditions.",
    countries: ["Argentina"],
    regions: ["Andes"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2022-12-01",
  },
  {
    id: "c-020",
    slug: "snowline-meridian",
    name: "Snowline Meridian",
    legal_name: null,
    description: "Volcano ascents and glacier travel courses.",
    countries: ["Chile"],
    regions: ["Andes"],
    status: "onboarding",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-07-19",
  },
  {
    id: "c-021",
    slug: "anvil-pass-outfitters",
    name: "Anvil Pass Outfitters",
    legal_name: "Anvil Pass Outfitters LLC",
    description: null,
    countries: ["United States"],
    regions: ["Alaska Range"],
    status: "prospect",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-08-28",
  },
  {
    id: "c-022",
    slug: "cairn-and-compass",
    name: "Cairn & Compass",
    legal_name: "Cairn and Compass Ltd",
    description: "Long-distance mountain trekking, no technical objectives.",
    countries: ["United Kingdom", "Ireland"],
    regions: ["Snowdonia", "Wicklow"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-08-09",
  },
  {
    id: "c-023",
    slug: "hoarfrost-expeditions",
    name: "Hoarfrost Expeditions",
    legal_name: "Hoarfrost ehf.",
    description: "Highland crossings and glacier expeditions.",
    countries: ["Iceland"],
    regions: ["Vatnajökull"],
    status: "active",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2024-01-22",
  },
  {
    id: "c-024",
    slug: "kestrel-ridge-alpine",
    name: "Kestrel Ridge Alpine",
    legal_name: "Kestrel Ridge Alpine Ltd",
    description: "Southern Alps guiding and Aoraki approach climbs.",
    countries: ["New Zealand"],
    regions: ["Southern Alps"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2022-10-13",
  },
  {
    id: "c-025",
    slug: "tundra-gate-treks",
    name: "Tundra Gate Treks",
    legal_name: null,
    description: null,
    countries: ["Kyrgyzstan"],
    regions: ["Tien Shan"],
    status: "onboarding",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-03-30",
  },
  {
    id: "c-026",
    slug: "bergschrund-collective",
    name: "Bergschrund Collective",
    legal_name: "Bergschrund Collective GmbH",
    description: "A guides' co-operative working the Engadin and Bernina.",
    countries: ["Switzerland", "Italy"],
    regions: ["Engadin", "Bernina"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-05-25",
  },
  {
    id: "c-027",
    slug: "nine-lakes-mountaineering",
    name: "Nine Lakes Mountaineering",
    legal_name: null,
    description: "Pamir expeditions with helicopter approaches.",
    countries: ["Tajikistan"],
    regions: ["Pamir"],
    status: "suspended",
    verification_status: "rejected",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-03-17",
  },
  {
    id: "c-028",
    slug: "ochre-valley-trekking",
    name: "Ochre Valley Trekking",
    legal_name: "Ochre Valley SARL",
    description: "Toubkal and Anti-Atlas trekking.",
    countries: ["Morocco"],
    regions: ["High Atlas"],
    status: "active",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2024-02-06",
  },
  {
    id: "c-029",
    slug: "frostmark-guides",
    name: "Frostmark Guides",
    legal_name: "Frostmark Guider AB",
    description: null,
    countries: ["Sweden"],
    regions: ["Kebnekaise"],
    status: "prospect",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-08-11",
  },
  {
    id: "c-030",
    slug: "cirque-nord-expeditions",
    name: "Cirque Nord Expeditions",
    legal_name: "Cirque Nord SAS",
    description: "Écrins and Vanoise alpinism, plus a spring ski programme.",
    countries: ["France"],
    regions: ["Écrins", "Vanoise"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2022-06-21",
  },
  {
    id: "c-031",
    slug: "whitecap-karakoram",
    name: "Whitecap Karakoram",
    legal_name: "Whitecap Karakoram (Pvt) Ltd",
    description: "Baltoro expeditions and the Gondogoro La crossing.",
    countries: ["Pakistan"],
    regions: ["Karakoram"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-07-14",
  },
  {
    id: "c-032",
    slug: "rimefall-alpine",
    name: "Rimefall Alpine",
    legal_name: null,
    description: "Coast Range ski traverses.",
    countries: ["Canada"],
    regions: ["Coast Mountains"],
    status: "onboarding",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-02-25",
  },
  {
    id: "c-033",
    slug: "steppe-and-summit",
    name: "Steppe & Summit",
    legal_name: "Steppe and Summit LLC",
    description: null,
    countries: ["Mongolia"],
    regions: ["Altai"],
    status: "prospect",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-07-31",
  },
  {
    id: "c-034",
    slug: "auburn-glacier-company",
    name: "Auburn Glacier Company",
    legal_name: "Auburn Glacier Company LLC",
    description: "Denali and Ruth Gorge expeditions.",
    countries: ["United States"],
    regions: ["Alaska Range"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2022-04-05",
  },
  {
    id: "c-035",
    slug: "larchwood-trekking",
    name: "Larchwood Trekking",
    legal_name: null,
    description: "Permitted trekking in the eastern valleys.",
    countries: ["Bhutan"],
    regions: ["Bumthang"],
    status: "onboarding",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-01-16",
  },
  {
    id: "c-036",
    slug: "sable-peak-expeditions",
    name: "Sable Peak Expeditions",
    legal_name: "Sable Peak Expeditions (Pty) Ltd",
    description: "Drakensberg traverses and rock courses.",
    countries: ["South Africa", "Lesotho"],
    regions: ["Drakensberg"],
    status: "active",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2024-03-28",
  },
  {
    id: "c-037",
    slug: "highfield-trekking",
    name: "Highfield Trekking",
    legal_name: "Highfield Trekking Pvt. Ltd.",
    description: null,
    countries: ["Nepal"],
    regions: ["Langtang"],
    status: "churned",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2021-12-09",
  },
  {
    id: "c-038",
    slug: "coldsmith-mountain-guides",
    name: "Coldsmith Mountain Guides",
    legal_name: "Coldsmith Fjellguider AS",
    description: "Arctic Norway ski touring and ice climbing.",
    countries: ["Norway"],
    regions: ["Troms"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-09-18",
  },
  {
    id: "c-039",
    slug: "vermillion-col-adventures",
    name: "Vermillion Col Adventures",
    legal_name: null,
    description: "Rolwaling and Makalu approach expeditions.",
    countries: ["Nepal"],
    regions: ["Rolwaling", "Makalu"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2024-04-09",
  },
  {
    id: "c-040",
    slug: "thornback-alpine",
    name: "Thornback Alpine",
    legal_name: "Thornback Alpine Pty Ltd",
    description: null,
    countries: ["Australia"],
    regions: [],
    status: "prospect",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-09-01",
  },
  {
    id: "c-041",
    slug: "aurora-basin-expeditions",
    name: "Aurora Basin Expeditions",
    legal_name: "Aurora Basin ApS",
    description: "Ski expeditions on the east coast icecap.",
    countries: ["Greenland", "Denmark"],
    regions: ["Sermersooq"],
    status: "active",
    verification_status: "pending",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2023-11-27",
  },
  {
    id: "c-042",
    slug: "ravenholt-ascents",
    name: "Ravenholt Ascents",
    legal_name: null,
    description: null,
    countries: ["Poland", "Slovakia"],
    regions: ["Tatras"],
    status: "suspended",
    verification_status: "suspended",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2022-09-12",
  },
  {
    id: "c-043",
    slug: "glasswind-expeditions",
    name: "Glasswind Expeditions",
    legal_name: "Glasswind Expediciones Cía. Ltda.",
    description: "Chimborazo and Cotopaxi acclimatisation programmes.",
    countries: ["Ecuador"],
    regions: ["Avenue of the Volcanoes"],
    status: "active",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2024-05-20",
  },
  {
    id: "c-044",
    slug: "basalt-line-guides",
    name: "Basalt Line Guides",
    legal_name: "Basalt Line G.K.",
    description: "Northern Alps winter courses.",
    countries: ["Japan"],
    regions: ["Hida Mountains"],
    status: "onboarding",
    verification_status: "unverified",
    real_business: false,
    documents_checked_at: null,
    documents_checked_by: null,
    created_at: "2026-06-03",
  },
];

/**
 * The revenue ledger, cut down to the columns the roster reads.
 *
 * Deliberately uneven: most companies have no rows at all (their cell says so),
 * one company's only rows fall in a previous calendar year, one row is written
 * off, and one company's invoice and credit note cancel out to a MEASURED zero
 * — which prints €0, because that is what it is.
 */
export const revenueRecords: RevenueRecord[] = [
  { id: "r-001", company_id: "c-001", recognised_on: "2026-02-11", amount_cents: 1_450_000, status: "paid" },
  { id: "r-002", company_id: "c-001", recognised_on: "2026-05-04", amount_cents: 980_000, status: "paid" },
  { id: "r-003", company_id: "c-001", recognised_on: "2026-08-19", amount_cents: 612_500, status: "invoiced" },
  { id: "r-004", company_id: "c-002", recognised_on: "2026-03-22", amount_cents: 740_000, status: "paid" },
  { id: "r-005", company_id: "c-002", recognised_on: "2026-07-08", amount_cents: 305_000, status: "invoiced" },
  { id: "r-006", company_id: "c-003", recognised_on: "2026-04-30", amount_cents: 528_000, status: "paid" },
  { id: "r-007", company_id: "c-006", recognised_on: "2026-01-27", amount_cents: 1_120_000, status: "paid" },
  { id: "r-008", company_id: "c-006", recognised_on: "2026-06-13", amount_cents: 445_000, status: "paid" },
  // Written off — the ledger keeps the row, the year-to-date figure does not.
  { id: "r-009", company_id: "c-006", recognised_on: "2026-07-02", amount_cents: 260_000, status: "written_off" },
  { id: "r-010", company_id: "c-007", recognised_on: "2026-05-15", amount_cents: 187_400, status: "invoiced" },
  { id: "r-011", company_id: "c-008", recognised_on: "2026-02-28", amount_cents: 655_000, status: "paid" },
  { id: "r-012", company_id: "c-010", recognised_on: "2026-01-09", amount_cents: 2_140_000, status: "paid" },
  { id: "r-013", company_id: "c-010", recognised_on: "2026-04-17", amount_cents: 1_305_000, status: "paid" },
  { id: "r-014", company_id: "c-010", recognised_on: "2026-08-01", amount_cents: 890_000, status: "invoiced" },
  { id: "r-015", company_id: "c-012", recognised_on: "2026-06-26", amount_cents: 412_000, status: "paid" },
  { id: "r-016", company_id: "c-014", recognised_on: "2026-03-05", amount_cents: 733_500, status: "paid" },
  { id: "r-017", company_id: "c-016", recognised_on: "2026-05-29", amount_cents: 268_000, status: "invoiced" },
  { id: "r-018", company_id: "c-017", recognised_on: "2026-02-14", amount_cents: 1_016_000, status: "paid" },
  { id: "r-019", company_id: "c-019", recognised_on: "2026-07-21", amount_cents: 359_000, status: "paid" },
  { id: "r-020", company_id: "c-022", recognised_on: "2026-04-08", amount_cents: 141_250, status: "paid" },
  { id: "r-021", company_id: "c-024", recognised_on: "2026-06-02", amount_cents: 496_000, status: "paid" },
  { id: "r-022", company_id: "c-026", recognised_on: "2026-03-18", amount_cents: 604_000, status: "paid" },
  { id: "r-023", company_id: "c-030", recognised_on: "2026-05-11", amount_cents: 827_000, status: "paid" },
  { id: "r-024", company_id: "c-031", recognised_on: "2026-07-30", amount_cents: 913_000, status: "invoiced" },
  { id: "r-025", company_id: "c-034", recognised_on: "2026-02-03", amount_cents: 1_275_000, status: "paid" },
  { id: "r-026", company_id: "c-038", recognised_on: "2026-08-06", amount_cents: 322_000, status: "invoiced" },
  { id: "r-027", company_id: "c-041", recognised_on: "2026-06-19", amount_cents: 558_000, status: "paid" },
  // An invoice and the credit note that reverses it. The year-to-date figure is
  // a measured zero and prints as one — it is not the absence of a figure.
  { id: "r-028", company_id: "c-015", recognised_on: "2026-04-24", amount_cents: 214_000, status: "invoiced" },
  { id: "r-029", company_id: "c-015", recognised_on: "2026-05-02", amount_cents: -214_000, status: "invoiced" },
  // Last year's business only. This company is ABSENT from the year-to-date map,
  // so its cell reads "None recorded" rather than €0.
  { id: "r-030", company_id: "c-018", recognised_on: "2025-09-14", amount_cents: 486_000, status: "paid" },
  { id: "r-031", company_id: "c-018", recognised_on: "2025-11-02", amount_cents: 195_000, status: "paid" },
  // Platform revenue with no company attached — skipped entirely.
  { id: "r-032", company_id: null, recognised_on: "2026-05-06", amount_cents: 75_000, status: "paid" },
];

export const placements: PlacementRecord[] = [
  {
    id: "p-001",
    company_id: "c-001",
    destination_id: "everest",
    destination_name: "Everest",
    slot_position: 1,
    starts_on: "2026-01-01",
    ends_on: "2026-12-31",
    price_cents: 1_200_000,
    currency: "EUR",
    effective_status: "active",
    needs_review: false,
  },
  {
    id: "p-002",
    company_id: "c-001",
    destination_id: "ama-dablam",
    destination_name: "Ama Dablam",
    slot_position: 3,
    starts_on: "2026-03-01",
    ends_on: "2026-11-30",
    price_cents: 480_000,
    currency: "EUR",
    effective_status: "active",
    needs_review: false,
  },
  {
    id: "p-003",
    company_id: "c-001",
    destination_id: "lobuche-east",
    destination_name: "Lobuche East",
    slot_position: 2,
    starts_on: "2025-06-01",
    ends_on: "2026-06-30",
    price_cents: 260_000,
    currency: "EUR",
    effective_status: "expired",
    needs_review: true,
  },
  {
    id: "p-004",
    company_id: "c-002",
    destination_id: "everest",
    destination_name: "Everest",
    slot_position: 4,
    starts_on: "2026-02-01",
    ends_on: "2026-12-31",
    price_cents: 690_000,
    currency: "EUR",
    effective_status: "active",
    needs_review: false,
  },
  {
    id: "p-005",
    company_id: "c-002",
    destination_id: "manaslu",
    destination_name: "Manaslu",
    slot_position: 5,
    starts_on: "2026-04-01",
    ends_on: "2027-03-31",
    price_cents: null,
    currency: "EUR",
    effective_status: "reserved",
    needs_review: false,
  },
  {
    id: "p-006",
    company_id: "c-003",
    destination_id: "matterhorn",
    destination_name: "Matterhorn",
    slot_position: 1,
    starts_on: "2026-05-01",
    ends_on: "2026-10-31",
    price_cents: 840_000,
    currency: "EUR",
    effective_status: "active",
    needs_review: false,
  },
  {
    id: "p-007",
    company_id: "c-003",
    destination_id: "eiger",
    destination_name: "Eiger",
    slot_position: 2,
    starts_on: "2025-05-01",
    ends_on: "2026-04-30",
    price_cents: 520_000,
    currency: "EUR",
    effective_status: "expired",
    needs_review: true,
  },
  {
    id: "p-008",
    company_id: "c-006",
    destination_id: "k2",
    destination_name: "K2",
    slot_position: 1,
    starts_on: "2026-01-15",
    ends_on: "2026-12-31",
    price_cents: 1_450_000,
    currency: "EUR",
    effective_status: "active",
    needs_review: false,
  },
  {
    id: "p-009",
    company_id: "c-006",
    destination_id: "broad-peak",
    destination_name: "Broad Peak",
    slot_position: 3,
    starts_on: "2026-01-15",
    ends_on: "2026-12-31",
    price_cents: 375_000,
    currency: "EUR",
    effective_status: "cancelled",
    needs_review: false,
  },
  {
    id: "p-010",
    company_id: "c-010",
    destination_id: "everest",
    destination_name: "Everest",
    slot_position: 2,
    starts_on: "2026-01-01",
    ends_on: "2026-12-31",
    price_cents: 980_000,
    currency: "EUR",
    effective_status: "active",
    needs_review: false,
  },
  {
    id: "p-011",
    company_id: "c-010",
    destination_id: "lhotse",
    destination_name: "Lhotse",
    slot_position: 1,
    starts_on: "2026-01-01",
    ends_on: "2026-12-31",
    price_cents: 760_000,
    currency: "EUR",
    effective_status: "active",
    needs_review: false,
  },
  {
    id: "p-012",
    company_id: "c-010",
    destination_id: "everest-base-camp-trek",
    // The destination this position sits on could not be resolved to a name.
    destination_name: null,
    slot_position: 4,
    starts_on: "2026-02-01",
    ends_on: "2026-12-31",
    price_cents: 145_000,
    currency: "EUR",
    effective_status: "active",
    needs_review: false,
  },
  {
    id: "p-013",
    company_id: "c-017",
    destination_id: "mont-blanc",
    destination_name: "Mont Blanc",
    slot_position: 1,
    starts_on: "2026-04-01",
    ends_on: "2026-10-31",
    price_cents: 910_000,
    currency: "EUR",
    effective_status: "active",
    needs_review: false,
  },
  {
    id: "p-014",
    company_id: "c-017",
    destination_id: "gran-paradiso",
    destination_name: "Gran Paradiso",
    slot_position: 5,
    starts_on: "2026-04-01",
    ends_on: "2026-10-31",
    price_cents: null,
    currency: "EUR",
    effective_status: "reserved",
    needs_review: false,
  },
  {
    id: "p-015",
    company_id: "c-031",
    destination_id: "gasherbrum-ii",
    destination_name: "Gasherbrum II",
    slot_position: 2,
    starts_on: "2026-03-01",
    ends_on: "2026-11-30",
    price_cents: 620_000,
    currency: "EUR",
    effective_status: "active",
    needs_review: false,
  },
  {
    id: "p-016",
    company_id: "c-034",
    destination_id: "denali",
    destination_name: "Denali",
    slot_position: 1,
    starts_on: "2025-04-01",
    ends_on: "2026-03-31",
    price_cents: 1_050_000,
    currency: "EUR",
    effective_status: "expired",
    needs_review: true,
  },
];

export const companyMembers: CompanyMemberRow[] = [
  { profile_id: "u-001", company_id: "c-001", name: "Anouk Rieder", company_role: "admin", status: "active" },
  { profile_id: "u-002", company_id: "c-001", name: "Tenzin Sherpa", company_role: "sales", status: "active" },
  { profile_id: "u-003", company_id: "c-001", name: "Marek Ostrowski", company_role: "sales", status: "invited" },
  { profile_id: "u-004", company_id: "c-002", name: "Priya Rana", company_role: "admin", status: "active" },
  { profile_id: "u-005", company_id: "c-003", name: "Lukas Brunner", company_role: "admin", status: "active" },
  { profile_id: "u-006", company_id: "c-003", name: "Elena Fischer", company_role: "sales", status: "suspended" },
  { profile_id: "u-007", company_id: "c-006", name: "Sana Qureshi", company_role: "admin", status: "active" },
  { profile_id: "u-008", company_id: "c-010", name: "Dawa Lama", company_role: "admin", status: "active" },
  { profile_id: "u-009", company_id: "c-010", name: "Ingrid Solheim", company_role: "sales", status: "active" },
  { profile_id: "u-010", company_id: "c-017", name: "Camille Dupuis", company_role: "admin", status: "active" },
];

export const companyInvitations: CompanyInvitationRow[] = [
  {
    id: "i-001",
    company_id: "c-001",
    email: "ops@northwind-ascents.example",
    company_role: "sales",
    created_at: "2026-08-25",
    expires_at: "2026-09-08",
    accepted_at: null,
    revoked_at: null,
  },
  {
    id: "i-002",
    company_id: "c-002",
    email: "desk@lanternpass.example",
    company_role: "admin",
    created_at: "2026-08-30",
    expires_at: "2026-09-13",
    accepted_at: null,
    revoked_at: null,
  },
  {
    id: "i-003",
    company_id: "c-002",
    email: "guides@lanternpass.example",
    company_role: "sales",
    created_at: "2026-07-14",
    expires_at: "2026-07-28",
    accepted_at: "2026-07-16",
    revoked_at: null,
  },
  {
    id: "i-004",
    company_id: "c-004",
    email: "hello@kibotreks.example",
    company_role: "admin",
    created_at: "2026-09-02",
    expires_at: "2026-09-16",
    accepted_at: null,
    revoked_at: null,
  },
  {
    id: "i-005",
    company_id: "c-009",
    email: "post@halvorsenalpine.example",
    company_role: "admin",
    created_at: "2026-06-20",
    expires_at: "2026-07-04",
    accepted_at: null,
    revoked_at: "2026-06-28",
  },
];

/** Recognised revenue this calendar year, per company — absent means "no rows". */
export function revenueYtdByCompany(records: RevenueRecord[]): Map<string, number> {
  const year = new Date().getFullYear();
  const sums = new Map<string, number>();
  for (const r of records) {
    if (r.company_id === null) continue;
    // The year is read off the string. `new Date("YYYY-MM-DD")` parses as UTC
    // midnight, so a 1 January row lands in the previous year west of Greenwich
    // and silently drops out of the sum.
    if (Number(r.recognised_on.slice(0, 4)) !== year) continue;
    if (r.status === "written_off") continue;
    sums.set(r.company_id, (sums.get(r.company_id) ?? 0) + r.amount_cents);
  }
  return sums;
}

/**
 * The table's own constraints, applied to the fixture at module load.
 *
 * `companies_verification_coherent`: a company is 'verified' only with BOTH a
 * checked-at date and a checked-by reviewer, and carries neither otherwise. A
 * seed that could not survive its own schema is not a seed, it is a future bug
 * — so this throws rather than letting a badge nobody earned reach a screen.
 */
function assertCoherent(rows: CompanyRow[]) {
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const c of rows) {
    if (seenIds.has(c.id)) throw new Error(`companies fixture has a duplicate id: "${c.id}"`);
    if (seenSlugs.has(c.slug)) throw new Error(`companies fixture has a duplicate slug: "${c.slug}"`);
    seenIds.add(c.id);
    seenSlugs.add(c.slug);

    const verified = c.verification_status === "verified";
    const carries = c.documents_checked_at !== null && c.documents_checked_by !== null;
    if (verified !== carries) {
      throw new Error(
        `companies fixture violates companies_verification_coherent: "${c.slug}" is ${c.verification_status} but ${
          carries ? "carries" : "lacks"
        } a check date and reviewer. A verification tick must never appear without the record of who checked and when.`,
      );
    }
  }
}

assertCoherent(companies);
