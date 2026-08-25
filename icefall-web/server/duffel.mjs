/**
 * Duffel flight adapter — the real "getting there" data behind ICEFALL.
 *
 * Duffel holds its own IATA accreditations, so ICEFALL can search, book and
 * ticket without becoming an agent first. This module turns a Duffel offer
 * request into the exact `Itinerary` shape the frontend already renders — so
 * wiring a live key changes the data, never the UI.
 *
 * NOTHING here is called unless DUFFEL_API_KEY is set. No key → the server
 * reports "not connected" and the app falls back to its labelled demo data.
 *
 * Verify the request/response fields against the current Duffel API docs before
 * going live (https://duffel.com/docs) — travel APIs move, and the mapping below
 * targets the Offer Requests + Offers shape as documented at build time.
 */

const DUFFEL_API = "https://api.duffel.com";

/** "PT5H30M" / "P1DT2H" → minutes. */
function isoDurationToMinutes(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(iso || "");
  if (!m) return 0;
  return (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

/** Duffel datetimes are local wall-clock ("2026-10-03T17:30:00"). Read the clock
 *  straight off the string so no timezone maths can shift it. */
function wallClock(dt) {
  return typeof dt === "string" && dt.length >= 16 ? dt.slice(11, 16) : "--:--";
}
function dayPart(dt) {
  return typeof dt === "string" ? dt.slice(0, 10) : "";
}

function legFromSlice(slice, dateIso) {
  const segs = slice?.segments || [];
  if (!segs.length) return null;
  const dep = segs[0].departing_at;
  const arr = segs[segs.length - 1].arriving_at;
  const dayOffset = Math.round((Date.parse(dayPart(arr)) - Date.parse(dayPart(dep))) / 86_400_000);
  return {
    depTime: wallClock(dep),
    arrTime: wallClock(arr),
    arrDayOffset: Number.isFinite(dayOffset) ? Math.max(0, dayOffset) : 0,
    durationMin: isoDurationToMinutes(slice.duration),
    stops: Math.max(0, segs.length - 1),
    dateIso,
  };
}

function itineraryFromOffer(offer, ctx, index) {
  const slices = offer?.slices || [];
  const outbound = legFromSlice(slices[0], ctx.outIso);
  const inbound = legFromSlice(slices[1], ctx.backIso);
  if (!outbound || !inbound) return null;
  const total = parseFloat(offer.total_amount || "0");
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    id: `live-${offer.id || index}`,
    airline: offer.owner?.name || offer.owner?.iata_code || "Airline",
    origin: ctx.origin,
    destination: ctx.destination,
    outbound,
    inbound,
    // Duffel totals cover the whole party; the app prices per person.
    // total_currency may not be EUR — real deployments convert FX here.
    perPersonCents: Math.round((total * 100) / Math.max(1, ctx.pax)),
    cabin: "Economy",
  };
}

/**
 * Search round-trip itineraries. Returns `Itinerary[]` (frontend shape), or
 * throws so the caller can report a live-but-failed state (never masked with
 * demo data).
 */
export async function searchDuffelFlights({ apiKey, version, origin, destination, outIso, backIso, pax, cabin }) {
  const outDate = dayPart(outIso);
  const backDate = dayPart(backIso);
  const body = {
    data: {
      slices: [
        { origin: origin.code, destination: destination.code, departure_date: outDate },
        { origin: destination.code, destination: origin.code, departure_date: backDate },
      ],
      passengers: Array.from({ length: Math.max(1, pax) }, () => ({ type: "adult" })),
      cabin_class: cabin || "economy",
    },
  };

  const res = await fetch(`${DUFFEL_API}/air/offer_requests?return_offers=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Duffel-Version": version || "v2",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Duffel ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const offers = json?.data?.offers || [];
  const ctx = { origin, destination, outIso, backIso, pax: Math.max(1, pax) };
  const items = offers
    .map((o, i) => itineraryFromOffer(o, ctx, i))
    .filter(Boolean)
    .sort((a, b) => a.perPersonCents - b.perPersonCents)
    .slice(0, 6);
  return items;
}
