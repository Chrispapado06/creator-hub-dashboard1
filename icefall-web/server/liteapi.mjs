/**
 * LiteAPI (Nuitée) hotel adapter — the real "where you'll stay" data.
 *
 * LiteAPI is self-serve and aggregates Booking.com-class wholesale supply, so a
 * non-accredited operator can search and book hotels and set their own markup.
 * This module maps a LiteAPI hotel search into the frontend's `Lodge` shape.
 *
 * NOTHING here runs unless LITEAPI_KEY is set. No key → "not connected" and the
 * app uses its labelled demo lodges.
 *
 * SCAFFOLD NOTE: the frontend's money model is per-person-per-night, while hotel
 * rates are per-room-for-the-stay. We approximate `nightlyCents` = stay total ÷
 * nights ÷ guests so the existing arithmetic holds. A production build should
 * carry the real room rate and rework the package maths. Confirm field names
 * against the current LiteAPI docs (https://docs.liteapi.travel) before launch.
 */

const LITEAPI = "https://api.liteapi.travel/v3.0";

/** The few countries our demo objectives live in → ISO-3166 alpha-2. */
const COUNTRY_ISO2 = {
  Switzerland: "CH",
  France: "FR",
  Nepal: "NP",
  Argentina: "AR",
  "United States": "US",
  Italy: "IT",
  Norway: "NO",
  Morocco: "MA",
};

function isoDate(s) {
  return typeof s === "string" ? s.slice(0, 10) : "";
}
function nightsBetween(checkin, checkout) {
  const n = Math.round((Date.parse(isoDate(checkout)) - Date.parse(isoDate(checkin))) / 86_400_000);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function getJson(url, apiKey, init) {
  const res = await fetch(url, {
    ...init,
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", Accept: "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LiteAPI ${res.status} (${url}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** Cheapest total (in major units) + board name for a rates entry. */
function cheapestRate(hotelRates) {
  let best = null;
  for (const rt of hotelRates?.roomTypes || []) {
    for (const rate of rt.rates || []) {
      const amt = rate?.retailRate?.total?.[0]?.amount ?? rate?.retailRate?.total?.amount;
      const board = rate?.boardName || rate?.board || "Room only";
      const n = typeof amt === "string" ? parseFloat(amt) : amt;
      if (Number.isFinite(n) && (best === null || n < best.amount)) best = { amount: n, board };
    }
  }
  return best;
}

/**
 * Search stays near an objective. Returns `Lodge[]` (frontend shape) or throws.
 */
export async function searchLiteApiStays({ apiKey, objectiveId, cityName, country, lat, lon, checkinIso, checkoutIso, adults }) {
  const checkin = isoDate(checkinIso);
  const checkout = isoDate(checkoutIso);
  const nights = nightsBetween(checkin, checkout);
  const guests = Math.max(1, adults || 1);
  const countryCode = COUNTRY_ISO2[country] || undefined;

  // 1) Resolve hotels for the destination (by city, else by coordinates).
  const params = new URLSearchParams({ limit: "20" });
  if (countryCode) params.set("countryCode", countryCode);
  if (cityName) params.set("cityName", cityName);
  if (!cityName && Number.isFinite(lat) && Number.isFinite(lon)) {
    params.set("latitude", String(lat));
    params.set("longitude", String(lon));
    params.set("radius", "25000");
  }
  const hotelsJson = await getJson(`${LITEAPI}/data/hotels?${params.toString()}`, apiKey);
  const hotels = (hotelsJson?.data || []).slice(0, 12);
  if (!hotels.length) return [];
  const byId = new Map(hotels.map((h) => [String(h.id), h]));

  // 2) Price them for the dates.
  const ratesJson = await getJson(`${LITEAPI}/hotels/rates`, apiKey, {
    method: "POST",
    body: JSON.stringify({
      hotelIds: hotels.map((h) => h.id),
      checkin,
      checkout,
      occupancies: [{ adults: guests }],
      currency: "EUR",
      guestNationality: "GB",
    }),
  });

  const priced = (ratesJson?.data || [])
    .map((entry) => {
      const hotel = byId.get(String(entry.hotelId ?? entry.hotel_id));
      const rate = cheapestRate(entry);
      if (!hotel || !rate) return null;
      return {
        id: `live-${entry.hotelId ?? entry.hotel_id}`,
        objectiveId,
        name: hotel.name || "Hotel",
        kind: hotel.hotelType || hotel.type || "Hotel",
        board: rate.board,
        // total ÷ nights ÷ guests → the per-person-per-night the app expects.
        nightlyCents: Math.round((rate.amount * 100) / nights / guests),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.nightlyCents - b.nightlyCents)
    .slice(0, 6);

  return priced;
}
