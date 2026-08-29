import { eur, type Cents } from "@/money/model";

/**
 * ICEFALL — flight search (the "getting there" half of a package).
 *
 * ── THIS IS NOT A LIVE FLIGHT SEARCH ───────────────────────────────────────
 *
 * There is no airline API connected. Real fares come from a global distribution
 * system — Duffel, Amadeus or the Skyscanner partner API — and every one of them
 * needs credentials that must sit behind a server, never in this bundle: an API
 * key shipped to the browser is a key given to everyone who opens the page.
 *
 * So the fares below are INVENTED. They are generated from a great-circle
 * distance model (a real €/km curve, real airport coordinates, real airline
 * names) so the numbers are plausible and the UI is honest about what it will do
 * — but they are not quotes, and nothing here can be booked. `searchFlights` is
 * written as the exact shape a real provider call returns, so wiring one in later
 * touches this file and nothing else.
 *
 * ── PACKAGES, AND WHY THE FLIGHT PRICE IS NOT MARKED UP ─────────────────────
 *
 * Selling a flight bundled with the guiding makes ICEFALL, in EU/UK law, the
 * trip's "package organiser" — liable for the whole arrangement and required to
 * hold insolvency protection (ATOL-style bonding for the flight). That is a
 * deliberate business decision, not a technical one. Until it is made, the fare
 * is passed through at cost: ICEFALL's cut comes out of the guiding it can
 * actually stand behind, and it helps you find the flight without pretending to
 * be the airline. See `PACKAGE_NOTICE`.
 */

export const FLIGHTS_NOTICE =
  "Fares are demonstration data, not live prices. A real search needs an airline provider (Duffel, Amadeus or Skyscanner) connected behind a server — nothing here can be booked.";

export const PACKAGE_NOTICE =
  "Booking a flight together with your guiding makes ICEFALL the trip organiser under EU/UK package-travel law — which carries real liability and bonding requirements. Shown here to demonstrate the experience; the flight is passed through at fare, never marked up.";

export interface Airport {
  code: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

/**
 * The gateway you fly INTO for each guide's base. A guide lists where they are
 * based; the nearest international airport is a fact about geography, kept here
 * so the flight search knows a destination without asking the traveller to.
 */
const GATEWAYS: Record<string, Airport> = {
  "Zermatt, Valais": { code: "GVA", city: "Geneva", country: "Switzerland", lat: 46.238, lon: 6.109 },
  "Chamonix-Mont-Blanc": { code: "GVA", city: "Geneva", country: "Switzerland", lat: 46.238, lon: 6.109 },
  "Solukhumbu, Nepal": { code: "KTM", city: "Kathmandu", country: "Nepal", lat: 27.697, lon: 85.359 },
  "Åndalsnes, Norway": { code: "OSL", city: "Oslo", country: "Norway", lat: 60.194, lon: 11.1 },
  "Imlil, Morocco": { code: "RAK", city: "Marrakesh", country: "Morocco", lat: 31.607, lon: -8.036 },
  "Talkeetna, Alaska": { code: "ANC", city: "Anchorage", country: "United States", lat: 61.174, lon: -149.996 },
};

const DEFAULT_GATEWAY: Airport = GATEWAYS["Zermatt, Valais"];

export function gatewayFor(basedIn: string): Airport {
  return GATEWAYS[basedIn] ?? DEFAULT_GATEWAY;
}

/** The cities a traveller can depart from. Real codes; demo fares. */
export const ORIGINS: Airport[] = [
  { code: "LHR", city: "London", country: "United Kingdom", lat: 51.47, lon: -0.4543 },
  { code: "JFK", city: "New York", country: "United States", lat: 40.641, lon: -73.778 },
  { code: "CDG", city: "Paris", country: "France", lat: 49.01, lon: 2.548 },
  { code: "FRA", city: "Frankfurt", country: "Germany", lat: 50.037, lon: 8.562 },
  { code: "DXB", city: "Dubai", country: "United Arab Emirates", lat: 25.253, lon: 55.365 },
  { code: "SYD", city: "Sydney", country: "Australia", lat: -33.939, lon: 151.175 },
];

export function originByCode(code: string): Airport {
  return ORIGINS.find((o) => o.code === code) ?? ORIGINS[0];
}

/* -------------------------------------------------------------------------- */
/* An itinerary                                                               */
/* -------------------------------------------------------------------------- */

export interface Leg {
  depTime: string;
  arrTime: string;
  /** +1 when the flight lands on a later calendar day than it left. */
  arrDayOffset: number;
  durationMin: number;
  stops: number;
  dateIso: string;
}

export interface Itinerary {
  id: string;
  airline: string;
  origin: Airport;
  destination: Airport;
  outbound: Leg;
  inbound: Leg;
  /** Per person, round trip. Integer cents, like every amount in this app. */
  perPersonCents: Cents;
  cabin: "Economy" | "Premium" | "Business";
}

/* -------------------------------------------------------------------------- */
/* The model                                                                  */
/* -------------------------------------------------------------------------- */

const AIRLINES = [
  "SWISS", "Lufthansa", "Air France", "British Airways", "KLM",
  "Qatar Airways", "Emirates", "Turkish Airlines", "Austrian", "Finnair",
];

/** Great-circle distance in km. */
function distanceKm(a: Airport, b: Airport): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Deterministic seed from a string — same route + date always yields the same fares. */
function seedFrom(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — a tiny deterministic PRNG so the demo is stable across renders. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function makeLeg(rng: () => number, durationMin: number, stops: number, dateIso: string): Leg {
  const depMin = (5 + Math.floor(rng() * 15)) * 60 + [0, 15, 30, 45][Math.floor(rng() * 4)];
  const arrTotal = depMin + durationMin;
  return {
    depTime: `${pad(Math.floor(depMin / 60) % 24)}:${pad(depMin % 60)}`,
    arrTime: `${pad(Math.floor(arrTotal / 60) % 24)}:${pad(arrTotal % 60)}`,
    arrDayOffset: Math.floor(arrTotal / 1440),
    durationMin,
    stops,
    dateIso,
  };
}

export interface SearchArgs {
  origin: Airport;
  destination: Airport;
  outIso: string;
  backIso: string;
}

/**
 * Search return itineraries for a trip. Deterministic demo data today; the same
 * signature a real provider (Duffel/Amadeus/Skyscanner) would be called with.
 */
export function searchFlights(args: SearchArgs): Itinerary[] {
  const km = distanceKm(args.origin, args.destination);
  if (km < 1) return []; // same city — no flight needed
  const baseOneWay = 42 + km * 0.071; // €, economy, one direction
  const rng = makeRng(seedFrom(`${args.origin.code}-${args.destination.code}-${args.outIso}`));

  const longHaul = km > 4000;
  const count = 5;
  const out: Itinerary[] = [];
  for (let i = 0; i < count; i++) {
    // The first option is the fast, pricier direct (or one-stop on long-haul);
    // later options add a stop and shave the fare — the real trade-off a
    // traveller makes.
    const stops = i === 0 ? (longHaul ? 1 : 0) : Math.min(2, (longHaul ? 1 : 0) + (rng() < 0.5 ? 1 : 2));
    const priceMult = (i === 0 ? 1.22 : 0.78 + rng() * 0.34) * (stops === 0 ? 1.12 : 1);
    const flightMin = Math.round((km / 780) * 60);
    const legMin = flightMin + stops * (70 + Math.floor(rng() * 80));
    const perPersonCents = eur(Math.round((baseOneWay * priceMult * 2) / 5) * 5); // to nearest €5

    out.push({
      id: `fl-${args.origin.code}-${args.destination.code}-${i}`,
      airline: AIRLINES[Math.floor(rng() * AIRLINES.length)],
      origin: args.origin,
      destination: args.destination,
      outbound: makeLeg(rng, legMin, stops, args.outIso),
      inbound: makeLeg(rng, legMin, stops, args.backIso),
      perPersonCents,
      cabin: "Economy",
    });
  }
  return out.sort((a, b) => a.perPersonCents - b.perPersonCents);
}

export function stopsLabel(stops: number): string {
  return stops === 0 ? "Direct" : stops === 1 ? "1 stop" : `${stops} stops`;
}

export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
