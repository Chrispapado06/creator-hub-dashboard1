/**
 * The owner's mockups, number for number — the demo faces of Dashboard,
 * Products, Bookings and Commissions.
 *
 * OWNER INSTRUCTION, 31 Aug 2026, verbatim in substance: "EVEN IF IT TAKES
 * ADDING FAKE DETAILS JUST COPY THE DAMN MOCKUPS." This file is that
 * instruction carried out inside the sanctioned mechanism: gated at DEFINITION
 * behind SHOW_DEMO_DATA (an ordinary build carries none of these strings), and
 * rendered under the global DemoBanner ("Invented data, shown so the layout
 * can be judged with a populated screen"). Flag off → the honest live states,
 * untouched. That separation is why this is not a doctrine problem: the
 * doctrine governs what a user sees in production, and this is the owner
 * judging their own design on a populated screen.
 *
 * Numbers are copied from the drawings even where the drawings disagree with
 * each other (their tables do not always cross-foot). Each section renders ITS
 * drawn values — fidelity to the drawing outranks internal reconciliation, by
 * instruction. The two artefacts the owner drew THEMSELVES stay verbatim in
 * the screens: the "Not measured" views tiles and the About-views banner.
 */
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";

const on = <T,>(v: T): T | null => (SHOW_DEMO_DATA ? v : null);

/* ── Dashboard ─────────────────────────────────────────────────────────── */

export const DASHBOARD_MOCKUP = on({
  kpis: [
    { label: "Total Users", value: "24,850", caption: "Registered accounts", delta: "12.4% vs May 17 – May 23" },
    { label: "Total Guides", value: "1,248", caption: "Active guides", delta: "8.7% vs May 17 – May 23" },
    { label: "Total Expedition Companies", value: "286", caption: "Registered companies", delta: "5.3% vs May 17 – May 23" },
    { label: "Total Bookings", value: "1,082", caption: "All time", delta: "9.8% vs May 17 – May 23" },
  ],
  countries: [
    { name: "United States", n: "4,275", pct: "17.2%" },
    { name: "India", n: "3,650", pct: "14.7%" },
    { name: "United Kingdom", n: "2,980", pct: "12.0%" },
    { name: "Germany", n: "2,420", pct: "9.7%" },
    { name: "Canada", n: "1,980", pct: "8.0%" },
    { name: "Australia", n: "1,720", pct: "6.9%" },
    { name: "France", n: "1,350", pct: "5.4%" },
    { name: "Nepal", n: "1,220", pct: "4.9%" },
    { name: "Other", n: "3,275", pct: "13.2%" },
  ],
  revenue: {
    total: "€312,850",
    delta: "18.6% vs May 17 – May 23",
    labels: ["May 24", "May 25", "May 26", "May 27", "May 28", "May 29", "May 30"],
    points: [148, 156, 205, 238, 226, 302, 338],
  },
  breakdown: [
    { label: "Guide Commission (15%)", sub: "From guide bookings", amount: "€92,455", pct: "29.6%" },
    { label: "Expedition Placements", sub: "From slot placements", amount: "€153,300", pct: "49.0%" },
    { label: "Subscriptions", sub: "From company subscriptions", amount: "€67,095", pct: "21.4%" },
  ],
  breakdownCentre: "€312,850",
  breakdownValues: [92455, 153300, 67095],
  recentBookings: [
    { ref: "#BK-1082", trip: "Everest Base Camp", company: "Elite Expeditions", amount: "€3,200", date: "May 30" },
    { ref: "#BK-1081", trip: "Kilimanjaro", company: "Summit Seekers", amount: "€2,450", date: "May 29" },
    { ref: "#BK-1080", trip: "Annapurna Circuit", company: "Himalayan Guides", amount: "€1,890", date: "May 29" },
    { ref: "#BK-1079", trip: "Mont Blanc", company: "Alpine Ascents", amount: "€4,100", date: "May 28" },
    { ref: "#BK-1078", trip: "Ama Dablam", company: "Peak Explorers", amount: "€3,750", date: "May 28" },
  ],
  recentEnquiries: [
    // tone = the drawing's traffic-light wait colours: green under ~3h,
    // amber for a same-day wait, red once it crosses a day.
    { ref: "#ENQ-5583", topic: "Everest Expedition", who: "Elite Expeditions", wait: "2h 15m", tone: "ok", date: "May 30" },
    { ref: "#ENQ-5582", topic: "Guide for Kilimanjaro", who: "Summit Seekers", wait: "5h 42m", tone: "warn", date: "May 30" },
    { ref: "#ENQ-5581", topic: "Annapurna Circuit", who: "Himalayan Guides", wait: "1d 2h", tone: "late", date: "May 29" },
    { ref: "#ENQ-5580", topic: "Private Guide", who: "Alex Martin", wait: "3h 20m", tone: "ok", date: "May 29" },
    { ref: "#ENQ-5579", topic: "Equipment Rental", who: "Peak Explorers", wait: "6h 10m", tone: "warn", date: "May 28" },
  ] as { ref: string; topic: string; who: string; wait: string; tone: "ok" | "warn" | "late"; date: string }[],
  topMarkets: [
    { name: "United States", users: "4,275", bookings: "218", revenue: "€68,450" },
    { name: "India", users: "3,650", bookings: "195", revenue: "€51,200" },
    { name: "United Kingdom", users: "2,980", bookings: "152", revenue: "€38,600" },
    { name: "Germany", users: "2,420", bookings: "128", revenue: "€32,150" },
    { name: "Canada", users: "1,980", bookings: "110", revenue: "€28,400" },
  ],
  updated: "Data updated 5 minutes ago",
});

/* ── Products ──────────────────────────────────────────────────────────── */

export interface MockProductRow {
  id: string;
  name: string;
  company: string;
  mountain: string;
  price: string;
  bookings: number;
  revenue: string;
  commission: string;
  enquiries: number;
  conv: string;
  placement: string | null;
}

const P = (
  id: string, name: string, company: string, mountain: string, price: string,
  bookings: number, revenue: string, commission: string, enquiries: number,
  conv: string, placement: string | null,
): MockProductRow => ({ id, name, company, mountain, price, bookings, revenue, commission, enquiries, conv, placement });

export const PRODUCTS_MOCKUP = on({
  totals: {
    products: "248", bookings: "1,532", revenue: "€1,342,560",
    commission: "€201,384", enquiries: "3,842",
  },
  rows: [
    P("demo-1", "Everest – South Col", "Northwind Ascents", "Mount Everest", "€7,450", 28, "€208,600", "€31,290", 74, "28 / 74", "#1 Premium"),
    P("demo-2", "Everest Base Camp Trek", "Lantern Pass Expeditions", "Mount Everest", "€2,150", 41, "€88,150", "€13,223", 96, "41 / 96", "#2 Featured"),
    P("demo-3", "Ama Dablam – SW Ridge", "Serac & Stone Expeditions", "Ama Dablam", "€6,800", 14, "€95,200", "€14,280", 37, "14 / 37", "#3 Featured"),
    P("demo-4", "Kilimanjaro Machame Route", "Kibo Treks", "Kilimanjaro", "€1,950", 52, "€101,400", "€15,210", 112, "52 / 112", "Draft"),
    P("demo-5", "Everest Three Passes Trek", "Meridian Co Expeditions", "Mount Everest", "€2,950", 19, "€56,050", "€8,408", 45, "19 / 45", null),
    P("demo-6", "Mont Blanc – Classic", "Alpine Ascents", "Mont Blanc", "€2,450", 31, "€75,990", "€11,393", 68, "31 / 68", "#4 Featured"),
    P("demo-7", "Everest – North Col", "Himalayan Guides", "Mount Everest", "€8,900", 11, "€97,900", "€14,685", 29, "11 / 29", null),
    P("demo-8", "Annapurna Circuit Trek", "Summit Trails", "Annapurna", "€1,550", 63, "€97,650", "€14,648", 134, "63 / 134", null),
    P("demo-9", "Ama Dablam – West Ridge", "High Altitude Co.", "Ama Dablam", "€6,250", 9, "€56,250", "€8,438", 21, "9 / 21", "Draft"),
    P("demo-10", "Lhotse Expedition", "Summit 8 Expeditions", "Lhotse", "€12,500", 6, "€75,000", "€11,250", 18, "6 / 18", null),
    P("demo-11", "Everest Base Camp – Lux", "Kangri Experiences", "Mount Everest", "€3,250", 27, "€87,750", "€13,163", 65, "27 / 65", null),
    P("demo-12", "Mera Peak Climb", "Vertical Adventures", "Mera Peak", "€1,850", 23, "€42,550", "€6,383", 54, "23 / 54", null),
    P("demo-13", "Island Peak Climb", "Alpine Dreamers", "Island Peak", "€1,950", 26, "€50,700", "€7,605", 49, "26 / 49", null),
    P("demo-14", "Everest – Advanced Base", "Northwind Ascents", "Mount Everest", "€4,650", 13, "€60,450", "€9,068", 31, "13 / 31", null),
    P("demo-15", "Makalu Expedition", "8K Expeditions", "Makalu", "€11,800", 4, "€47,200", "€7,080", 13, "4 / 13", null),
  ],
  showing: "Showing 1 to 15 of 248 products",
  pages: [1, 2, 3, 4, 5, "…", 17] as (number | "…")[],
  detail: {
    id: "demo-1",
    name: "Everest – South Col",
    status: "PUBLISHED",
    mountain: "Mount Everest",
    company: "Northwind Ascents",
    range: "1 – 28 Aug 2026",
    tiles: [
      { label: "Bookings", value: "28", sub: "Total", delta: "58%" },
      { label: "Revenue generated", value: "€208,600", sub: "Total", delta: "42%" },
      { label: "ICEFALL Commission (15%)", value: "€31,290", sub: "Total", delta: "42%" },
      { label: "Company earnings", value: "€177,310", sub: "Total", delta: "42%" },
      { label: "Enquiries", value: "74", sub: "Total", delta: "37%" },
      { label: "Enquiries → Bookings", value: "28 / 74", sub: "Converted", delta: "56%" },
      { label: "Placement income", value: "€5,000", sub: "#1 Premium", delta: null },
    ],
    chartLabels: ["1 Aug", "8 Aug", "15 Aug", "22 Aug", "28 Aug"],
    bookingsSeries: [28, 28, 28, 28, 28].map((_, i) => [12, 31, 22, 44, 30][i]),
    enquiriesSeries: [8, 18, 12, 26, 17],
    revenueSeries: [21, 33, 26, 41, 29],
    commissionSeries: [3.1, 5, 3.9, 6.2, 4.4],
    about: [
      ["Product type", "Expedition"], ["Duration", "64 days"], ["Group size", "2 – 8 people"],
      ["Difficulty", "Very Hard"], ["Best season", "Apr – Jun"], ["Price", "€7,450 per person"],
      ["Status", "Published on 12 Jul 2026"], ["Last updated", "27 Aug 2026"],
    ] as [string, string][],
    companyCard: {
      name: "Northwind Ascents", verified: true,
      rows: [
        ["Total products", "12"], ["Total bookings (all products)", "142"],
        ["Total revenue (all products)", "€659,250"], ["Total commission (15%)", "€98,888"],
        ["This product earnings", "€177,310"],
      ] as [string, string][],
    },
    placementCard: [
      ["Position", "#1 Premium"], ["Mountain", "Mount Everest"],
      ["Term", "30 Jul 2026 – 30 Jul 2027"], ["Placement income", "€5,000"], ["Status", "Active"],
    ] as [string, string][],
  },
});

/* ── Bookings ──────────────────────────────────────────────────────────── */

export interface MockBookingRow {
  id: string;
  trip: string;
  guide: string;
  place: string;
  destination_id: string;
  customer: string;
  email: string;
  dates: string;
  party: number;
  amount: string;
  commission: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
}

const B = (
  id: string, trip: string, guide: string, place: string, destination_id: string,
  customer: string, email: string, dates: string, party: number,
  amount: string, commission: string, status: MockBookingRow["status"],
): MockBookingRow => ({ id, trip, guide, place, destination_id, customer, email, dates, party, amount, commission, status });

export const BOOKINGS_MOCKUP = on({
  counts: { guide: 126, mountain: 312, trek: 198 },
  rows: [
    B("demo-b1", "Aconcagua Summit", "Luis Miguel", "Aconcagua, Argentina", "aconcagua", "Alex Christofis", "alex@protonmail.com", "12 Jan – 22 Jan 2026", 2, "€4,200", "€630", "CONFIRMED"),
    B("demo-b2", "Matterhorn Ascent", "Lukas Steiner", "Zermatt, Switzerland", "matterhorn", "Sarah Mitchell", "sarah.mitchell@gmail.com", "5 Feb – 9 Feb 2026", 1, "€2,850", "€427.50", "CONFIRMED"),
    B("demo-b3", "Mont Blanc Summit", "Chamonix Guides", "Chamonix, France", "mont-blanc", "James Holloway", "jholloway@outlook.com", "18 Mar – 22 Mar 2026", 3, "€3,600", "€540", "CONFIRMED"),
    B("demo-b4", "Gran Paradiso", "Marco Ferri", "Valsavarenche, Italy", "gran-paradiso-trek", "Daniel Kim", "daniel.kim@gmail.com", "2 Apr – 5 Apr 2026", 2, "€1,950", "€292.50", "PENDING"),
    // Illimani / Yala / Rinjani have no photo in the destination set — these
    // three borrow another peak's file (brain's ruling: on a demo face a
    // repeated mountain beats a grey box; the drawing has a photo on every row).
    B("demo-b5", "Illimani 6439m", "Andean Peaks", "La Paz, Bolivia", "alpamayo", "Emma Wilson", "emma.wilson@me.com", "9 May – 14 May 2026", 4, "€2,600", "€390", "CONFIRMED"),
    B("demo-b6", "Yala Peak Climb", "Himalayan Guides", "Langtang, Nepal", "lobuche-east", "Liam O'Connor", "liam.oconnor@gmail.com", "3 Jun – 8 Jun 2026", 2, "€1,750", "€262.50", "CONFIRMED"),
    B("demo-b7", "Kilimanjaro Summit", "Kilimanjaro Heroes", "Tanzania", "kilimanjaro-machame-route", "Olivia Bennett", "olivia.bennett@icloud.com", "21 Jun – 27 Jun 2026", 5, "€3,250", "€487.50", "CONFIRMED"),
    B("demo-b8", "Rinjani Summit", "Lombok Treks", "Lombok, Indonesia", "kilimanjaro-lemosho-route", "Noah Patel", "noah.patel@gmail.com", "11 Jul – 15 Jul 2026", 2, "€1,680", "€252", "CANCELLED"),
  ],
  detail: {
    id: "demo-b1",
    hero: "Aconcagua Summit",
    kind: "Guide Booking",
    tiles: [
      ["Amount Paid", "€4,200.00"], ["ICEFALL Commission (15%)", "€630.00"],
      ["Company Earnings", "€3,570.00"], ["Pass-through Costs", "€350.00"], ["Total Paid", "€4,200.00"],
    ] as [string, string][],
    customer: { name: "Alex Christofis", email: "alex@protonmail.com", phone: "+357 99 123 456" },
    details: [
      ["Booking ID", "GB-2026-00089"], ["Booked on", "12 Aug 2026"], ["Trip", "Aconcagua Summit"],
      ["Mountain", "Aconcagua, Argentina"], ["Guide / Company", "Luis Miguel"], ["Party size", "2 climbers"],
    ] as [string, string][],
    dates: [
      ["Start date", "12 Jan 2026"], ["End date", "22 Jan 2026"], ["Duration", "11 days"],
    ] as [string, string][],
    agreement: {
      accepted: [
        { label: "Booking Terms & Conditions", on: "Accepted on 12 Aug 2026" },
        { label: "Guide Terms & Conditions", on: "Accepted on 12 Aug 2026" },
        { label: "ICEFALL Terms of Use", on: "Accepted on 12 Aug 2026" },
        { label: "Privacy Policy", on: "Accepted on 12 Aug 2026" },
      ],
      policy: [
        "More than 60 days before start date: 100% refund minus pass-through costs.",
        "30–60 days before start date: 50% refund of the booking amount.",
        "Less than 30 days before start date: No refund.",
        "If the guide cancels, customer receives a full refund.",
        "Pass-through costs (permits, transfers, park fees) are non-refundable.",
      ],
      disclosures: [
        "Trip difficulty: Very Hard", "Max altitude: 6,962m", "Accommodation: Mountain tents",
        "Meals: All meals included", "Included: Guide fee, meals, group gear, permits",
        "Not included: Flights, travel insurance", "Weather risks and itinerary changes explained",
        "Emergency evacuation not included",
      ],
    },
  },
});

/* ── Commissions ───────────────────────────────────────────────────────── */

export const COMMISSIONS_MOCKUP = on({
  range: "1 – 28 Aug 2026",
  tiles: [
    { label: "Total commission (all sources)", value: "€31,290.00", sub: "vs 1 – 31 Jul 2026", delta: "18.4%" },
    { label: "Paid", value: "€22,840.00", sub: "73.1% of total", delta: null },
    { label: "Unpaid / pending", value: "€8,450.00", sub: "26.9% of total", delta: null },
    { label: "Guide commissions (15% of fee)", value: "€14,850.00", sub: "47.5% of total", delta: null },
    { label: "Expedition placements (referral)", value: "€16,440.00", sub: "52.5% of total", delta: null },
  ],
  chartLabels: ["1 Aug", "5 Aug", "10 Aug", "15 Aug", "20 Aug", "25 Aug", "28 Aug"],
  guideSeries: [2.1, 3.4, 1.9, 3.1, 2.6, 3.3, 2.4],
  referralSeries: [1.2, 0.9, 2.6, 1.4, 2.9, 2.2, 3.1],
  donut: { guide: 14850, referral: 16440, centre: "€31,290" },
  // Every list row carries a `slug` into the destination photo set — the
  // drawing has a small photo on every row of these lists.
  topCompanies: [
    { name: "Northwind Ascents", total: "€4,280.00", paid: "€3,105.00", unpaid: "€1,175.00" },
    { name: "Lantern Pass Expeditions", total: "€3,760.00", paid: "€2,900.00", unpaid: "€860.00" },
    { name: "Serac & Stone Expeditions", total: "€3,210.00", paid: "€2,310.00", unpaid: "€900.00" },
    { name: "Meridian Co Expeditions", total: "€2,740.00", paid: "€1,850.00", unpaid: "€890.00" },
    { name: "Kibo Treks", total: "€2,610.00", paid: "€1,920.00", unpaid: "€690.00" },
    { name: "Himalayan Guides", total: "€2,350.00", paid: "€1,650.00", unpaid: "€700.00" },
    { name: "8K Expeditions", total: "€1,980.00", paid: "€1,400.00", unpaid: "€580.00" },
    { name: "Summit Trails", total: "€1,650.00", paid: "€1,200.00", unpaid: "€450.00" },
  ],
  topProducts: [
    { name: "Everest – South Col", company: "Northwind Ascents", total: "€2,680.00", slug: "everest" },
    { name: "Everest Base Camp Trek", company: "Lantern Pass Expeditions", total: "€2,160.00", slug: "everest-base-camp-trek" },
    { name: "Ama Dablam – SW Ridge", company: "Serac & Stone Expeditions", total: "€1,720.00", slug: "ama-dablam" },
    { name: "Kilimanjaro Machame Route", company: "Kibo Treks", total: "€1,560.00", slug: "kilimanjaro-machame-route" },
    { name: "Mont Blanc – Classic", company: "Alpine Ascents", total: "€1,310.00", slug: "mont-blanc" },
    { name: "Everest Three Passes Trek", company: "Meridian Co Expeditions", total: "€1,240.00", slug: "everest-three-passes-trek" },
    { name: "Island Peak Climb", company: "Himalayan Guides", total: "€1,080.00", slug: "island-peak" },
    { name: "Annapurna Circuit Trek", company: "Summit Trails", total: "€940.00", slug: "annapurna-circuit-trek" },
  ],
  topMountains: [
    { name: "Mount Everest", total: "€8,540.00", slug: "everest" },
    { name: "Kilimanjaro", total: "€3,120.00", slug: "kilimanjaro" },
    { name: "Ama Dablam", total: "€2,730.00", slug: "ama-dablam" },
    { name: "Mont Blanc", total: "€2,160.00", slug: "mont-blanc" },
    { name: "Annapurna Circuit", total: "€1,940.00", slug: "annapurna-circuit-trek" },
    { name: "Island Peak", total: "€1,380.00", slug: "island-peak" },
    { name: "Toubkal", total: "€1,160.00", slug: "toubkal" },
    { name: "Lobuche Peak", total: "€940.00", slug: "lobuche-east" },
  ],
  largest: [
    { name: "Everest – South Col", sub: "Northwind Ascents", source: "Guide", amount: "€945.00", slug: "everest" },
    { name: "Kilimanjaro Machame Route", sub: "Kibo Treks", source: "Guide", amount: "€780.00", slug: "kilimanjaro-machame-route" },
    { name: "Everest Base Camp Trek", sub: "Lantern Pass Expeditions", source: "Guide", amount: "€712.50", slug: "everest-base-camp-trek" },
    { name: "Placement: Mount Everest #1", sub: "Northwind Ascents", source: "Placement", amount: "€5,000.00", slug: "everest" },
    { name: "Placement: Ama Dablam #1", sub: "Serac & Stone Expeditions", source: "Placement", amount: "€3,500.00", slug: "ama-dablam" },
    { name: "Island Peak Climb", sub: "Himalayan Guides", source: "Guide", amount: "€660.00", slug: "island-peak" },
    { name: "Mont Blanc – Classic", sub: "Alpine Ascents", source: "Guide", amount: "€645.00", slug: "mont-blanc" },
    { name: "Everest Three Passes Trek", sub: "Meridian Co Expeditions", source: "Guide", amount: "€620.00", slug: "everest-three-passes-trek" },
  ],
  unpaid: [
    { name: "Ama Dablam – SW Ridge", company: "Serac & Stone Expeditions", source: "Guide", date: "18 Aug 2026", due: "2 Sep 2026", amount: "€2,850.00", commission: "€427.50", status: "PENDING", slug: "ama-dablam" },
    { name: "Everest Base Camp Trek", company: "Lantern Pass Expeditions", source: "Guide", date: "17 Aug 2026", due: "1 Sep 2026", amount: "€2,150.00", commission: "€322.50", status: "PENDING", slug: "everest-base-camp-trek" },
    { name: "Placement: Mont Blanc #2", company: "Alpine Ascents", source: "Placement", date: "10 Aug 2026", due: "25 Aug 2026", amount: "€4,000.00", commission: "€600.00", status: "OVERDUE", slug: "mont-blanc" },
    { name: "Everest – South Col", company: "Northwind Ascents", source: "Guide", date: "12 Aug 2026", due: "25 Aug 2026", amount: "€4,200.00", commission: "€630.00", status: "OVERDUE", slug: "everest" },
  ],
  summary: [
    ["Guide Commissions (15%)", "€14,850.00", "€10,820.00", "€4,030.00", "47.5%"],
    ["Expedition Placements", "€16,440.00", "€12,020.00", "€4,420.00", "52.5%"],
    ["Total", "€31,290.00", "€22,840.00", "€8,450.00", "100%"],
  ] as [string, string, string, string, string][],
});
