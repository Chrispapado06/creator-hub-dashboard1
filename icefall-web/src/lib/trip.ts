import { eur, priceBooking, type Cents, type Pricing } from "@/money/model";
import { GUIDES, type Guide } from "@/data/demo";
import { originByCode, searchFlights, type Airport, type Itinerary } from "@/lib/flights";

/**
 * ICEFALL — the trip model that the SEARCH is built on.
 *
 * The web front door is not "browse a guide, then maybe add a flight" — it is a
 * trip search. A person says what they want to buy (a guide, a guide plus the
 * flights, or the whole thing handled), picks a mountain and dates, and gets
 * results. This file is the shape of that question and its answer:
 *
 *   mode + objective + origin + dates + party   →   priced options
 *
 * Everything downstream (the results page, the booking page) reads the same
 * search, so the number a person sees on a results card is the number they
 * confirm at checkout — computed in ONE place, `tripCost`, never twice.
 *
 * Objectives, gateways, lodges and fares are DEMO data, dev-gated exactly like
 * the guides. Flights come from `searchFlights` (invented until a provider is
 * wired); lodges are invented too. Nothing here is bookable.
 */

/* -------------------------------------------------------------------------- */
/* What you're buying                                                         */
/* -------------------------------------------------------------------------- */

export type TripMode = "guide" | "flight_guide" | "package";

export const TRIP_MODES: { id: TripMode; label: string; blurb: string }[] = [
  { id: "guide", label: "Guide only", blurb: "A checked mountain guide for your dates." },
  { id: "flight_guide", label: "Flights + Guide", blurb: "Your guide and the flights to reach them." },
  { id: "package", label: "Whole package", blurb: "Guide, flights and a place to stay — handled." },
];

export function modeIncludesFlights(mode: TripMode): boolean {
  return mode === "flight_guide" || mode === "package";
}
export function modeIncludesStay(mode: TripMode): boolean {
  return mode === "package";
}
export function modeLabel(mode: TripMode): string {
  return TRIP_MODES.find((m) => m.id === mode)?.label ?? "Guide only";
}

/* -------------------------------------------------------------------------- */
/* Objectives — a mountain you can search for, and the airport it flies to    */
/* -------------------------------------------------------------------------- */

export interface Objective {
  id: string;
  mountain: string;
  region: string;
  country: string;
  /** The public image key under /img — reused from the guide/expedition art. */
  heroPeak: string;
  /** The gateway you fly into for this mountain. */
  gateway: Airport;
}

const GVA: Airport = { code: "GVA", city: "Geneva", country: "Switzerland", lat: 46.238, lon: 6.109 };
const ZRH: Airport = { code: "ZRH", city: "Zurich", country: "Switzerland", lat: 47.458, lon: 8.555 };
const KTM: Airport = { code: "KTM", city: "Kathmandu", country: "Nepal", lat: 27.697, lon: 85.359 };
const MDZ: Airport = { code: "MDZ", city: "Mendoza", country: "Argentina", lat: -32.831, lon: -68.793 };
const ANC: Airport = { code: "ANC", city: "Anchorage", country: "United States", lat: 61.174, lon: -149.996 };

export const OBJECTIVES: Objective[] = [
  { id: "matterhorn", mountain: "Matterhorn", region: "Zermatt, Valais", country: "Switzerland", heroPeak: "matterhorn", gateway: GVA },
  { id: "mont-blanc", mountain: "Mont Blanc", region: "Chamonix", country: "France", heroPeak: "mont-blanc", gateway: GVA },
  { id: "eiger", mountain: "Eiger", region: "Grindelwald", country: "Switzerland", heroPeak: "eiger", gateway: ZRH },
  { id: "everest", mountain: "Everest", region: "Solukhumbu, Khumbu", country: "Nepal", heroPeak: "everest", gateway: KTM },
  { id: "aconcagua", mountain: "Aconcagua", region: "Mendoza", country: "Argentina", heroPeak: "aconcagua", gateway: MDZ },
  { id: "denali", mountain: "Denali", region: "Talkeetna, Alaska", country: "United States", heroPeak: "denali", gateway: ANC },
];

export function objectiveById(id: string): Objective | undefined {
  return OBJECTIVES.find((o) => o.id === id);
}

/** The guides who list this mountain. Demo-gated with GUIDES. */
export function guidesForObjective(objId: string): Guide[] {
  const obj = objectiveById(objId);
  if (!obj) return [];
  return GUIDES.filter((g) => g.mountains.includes(obj.mountain));
}

/** The objective a guide is most associated with, for the booking page. */
export function objectiveForGuide(guide: Guide): Objective | undefined {
  return OBJECTIVES.find((o) => guide.mountains.includes(o.mountain));
}

/* -------------------------------------------------------------------------- */
/* Where you'll stay — the "package" leg                                      */
/* -------------------------------------------------------------------------- */

export interface Lodge {
  id: string;
  objectiveId: string;
  name: string;
  kind: string;
  board: string;
  /** Per person, per night. Integer cents. Invented, demo only. */
  nightlyCents: Cents;
}

const LODGES: Lodge[] = [
  { id: "ly-mat-1", objectiveId: "matterhorn", name: "Hotel Riffelberg", kind: "Mountain hotel", board: "Half-board", nightlyCents: eur(210) },
  { id: "ly-mat-2", objectiveId: "matterhorn", name: "Zermatt Guesthouse", kind: "Guesthouse", board: "B&B", nightlyCents: eur(120) },
  { id: "ly-mb-1", objectiveId: "mont-blanc", name: "Chamonix Alpine Lodge", kind: "Chalet hotel", board: "Half-board", nightlyCents: eur(165) },
  { id: "ly-mb-2", objectiveId: "mont-blanc", name: "Les Praz Guesthouse", kind: "Guesthouse", board: "B&B", nightlyCents: eur(105) },
  { id: "ly-eig-1", objectiveId: "eiger", name: "Grindelwald Berghotel", kind: "Mountain hotel", board: "Half-board", nightlyCents: eur(190) },
  { id: "ly-eig-2", objectiveId: "eiger", name: "Eiger Guesthouse", kind: "Guesthouse", board: "B&B", nightlyCents: eur(125) },
  { id: "ly-eve-1", objectiveId: "everest", name: "Yeti Mountain Home, Namche", kind: "Teahouse lodge", board: "Half-board", nightlyCents: eur(95) },
  { id: "ly-eve-2", objectiveId: "everest", name: "Everest View Lodge", kind: "Teahouse", board: "B&B", nightlyCents: eur(65) },
  { id: "ly-aco-1", objectiveId: "aconcagua", name: "Mendoza Base Hotel", kind: "City hotel", board: "B&B", nightlyCents: eur(85) },
  { id: "ly-aco-2", objectiveId: "aconcagua", name: "Penitentes Lodge", kind: "Mountain lodge", board: "Half-board", nightlyCents: eur(70) },
  { id: "ly-den-1", objectiveId: "denali", name: "Talkeetna Lodge", kind: "Lodge", board: "B&B", nightlyCents: eur(160) },
  { id: "ly-den-2", objectiveId: "denali", name: "Denali Basecamp Cabins", kind: "Cabins", board: "Room only", nightlyCents: eur(120) },
];

export function lodgesForObjective(objId: string): Lodge[] {
  return LODGES.filter((l) => l.objectiveId === objId);
}
export function lodgeById(id: string): Lodge | undefined {
  return LODGES.find((l) => l.id === id);
}

export const LODGES_NOTICE =
  "Room rates are demonstration data, not live quotes — a real stay needs a lodging provider connected, and nothing here can be booked.";

/* -------------------------------------------------------------------------- */
/* The search, as URL state                                                   */
/* -------------------------------------------------------------------------- */

export interface TripSearch {
  mode: TripMode;
  objectiveId: string;
  originCode: string;
  startIso: string; // "YYYY-MM-DD", a local calendar day
  endIso: string;
  pax: number;
}

export function isoDay(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A sensible starting search — 45 days out, three days, from London. */
export function defaultSearch(now = new Date()): TripSearch {
  const day = (n: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
    return isoDay(d);
  };
  return {
    mode: "guide",
    objectiveId: OBJECTIVES[0].id,
    originCode: "LHR",
    startIso: day(45),
    endIso: day(47),
    pax: 2,
  };
}

const MODE_SET = new Set<TripMode>(["guide", "flight_guide", "package"]);

export function searchFromParams(params: URLSearchParams): TripSearch {
  const d = defaultSearch();
  const mode = params.get("mode");
  const obj = params.get("obj");
  const from = params.get("from");
  const pax = Number(params.get("pax"));

  let startIso = params.get("start") && parseDay(params.get("start")!) ? params.get("start")! : d.startIso;
  let endIso = params.get("end") && parseDay(params.get("end")!) ? params.get("end")! : d.endIso;
  // A crafted URL can reverse the range; the picker never can. Normalise so the
  // rest of the app (and the money model) always sees start ≤ end.
  const sd = parseDay(startIso);
  const ed = parseDay(endIso);
  if (sd && ed && ed.getTime() < sd.getTime()) [startIso, endIso] = [endIso, startIso];

  return {
    mode: mode && MODE_SET.has(mode as TripMode) ? (mode as TripMode) : d.mode,
    objectiveId: obj && objectiveById(obj) ? obj : d.objectiveId,
    // Validate the origin like every other field — an unknown code would leave
    // the select blank while pricing silently used a different airport.
    originCode: from && originByCode(from).code === from ? from : d.originCode,
    startIso,
    endIso,
    pax: Number.isFinite(pax) && pax >= 1 && pax <= 8 ? Math.floor(pax) : d.pax,
  };
}

export function searchToQuery(s: TripSearch): string {
  const p = new URLSearchParams({
    mode: s.mode,
    obj: s.objectiveId,
    from: s.originCode,
    start: s.startIso,
    end: s.endIso,
    pax: String(s.pax),
  });
  return p.toString();
}

/* -------------------------------------------------------------------------- */
/* Dates & pricing — the one place the trip is costed                         */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** Inclusive guiding days — 3 → 5 Oct is 3 days. */
export function daysOf(startIso: string, endIso: string): number {
  const a = parseDay(startIso);
  const b = parseDay(endIso);
  if (!a || !b) return 1;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / DAY_MS) + 1);
}
/** Nights you sleep on a trip of N days — you arrive, so it's one fewer. */
export function nightsOf(days: number): number {
  return Math.max(1, days - 1);
}

export interface TripCost {
  guide: Pricing;
  days: number;
  nights: number;
  flightCents: Cents;
  lodgeCents: Cents;
  /** Everything the client pays ICEFALL for the trip as configured. */
  total: Cents;
}

/**
 * Cost a whole trip. Flights and lodging are passed through at price — ICEFALL
 * earns its service fee on the GUIDING it can stand behind, not by marking up an
 * airline seat or a hotel bed (see the package-organiser note in flights.ts).
 */
export function tripCost(args: {
  guide: Guide;
  days: number;
  pax: number;
  flight?: Itinerary | null;
  lodge?: Lodge | null;
}): TripCost {
  const guide = priceBooking(args.guide.dayRate * args.days);
  const flightCents = args.flight ? args.flight.perPersonCents * args.pax : 0;
  const nights = nightsOf(args.days);
  const lodgeCents = args.lodge ? args.lodge.nightlyCents * args.pax * nights : 0;
  return {
    guide,
    days: args.days,
    nights,
    flightCents,
    lodgeCents,
    total: guide.total + flightCents + lodgeCents,
  };
}

/** The cheapest itinerary for a leg of the search, or null when none / not needed. */
export function cheapestFlight(search: TripSearch, origin: Airport): Itinerary | null {
  const obj = objectiveById(search.objectiveId);
  if (!obj) return null;
  const start = parseDay(search.startIso);
  const end = parseDay(search.endIso);
  if (!start || !end) return null;
  const flights = searchFlights({
    origin,
    destination: obj.gateway,
    outIso: start.toISOString(),
    backIso: end.toISOString(),
  });
  return flights[0] ?? null;
}

/** The cheapest lodge for an objective, or null. */
export function cheapestLodge(objId: string): Lodge | null {
  const list = lodgesForObjective(objId);
  return list.length ? list.reduce((a, b) => (a.nightlyCents <= b.nightlyCents ? a : b)) : null;
}
