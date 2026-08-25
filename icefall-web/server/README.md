# ICEFALL travel API (the real data boundary)

A tiny Node service (no dependencies) that turns the app's demo flight/hotel
search into **real, bookable data** — while keeping API keys **server-side**.

- **Flights → Duffel.** Duffel holds its own IATA accreditation, so ICEFALL can
  search (and later book/ticket) without becoming a travel agent first.
- **Hotels → LiteAPI (Nuitée).** Self-serve, aggregates Booking.com-class
  wholesale supply, and lets you set your own markup.

## Why a server at all?

An API key shipped to the browser is a key given to everyone who opens the page.
So the browser calls **this** process, and this process holds the secrets. It
only does **search** — booking/ticketing is a deliberate, separate step.

## Run it

```bash
node server/index.mjs
```

Node 18+ (for global `fetch`). The dev server proxies `/api/*` here
(see `vite.config.ts`), so just run this alongside `npm run dev`, or use:

```bash
npm run dev:all
```

## Add keys (go live)

```bash
cp server/.env.example server/.env
# then fill in DUFFEL_API_KEY and/or LITEAPI_KEY
```

- **No key set → "not connected".** `/api/health` reports it, the search
  endpoints return `{ connected: false }`, and the app falls back to its
  clearly-labelled demo data. Nothing breaks; nothing pretends.
- **Key set → live.** The app shows real fares/rates from that provider.

You can turn on **one** side at a time (e.g. live hotels, demo flights).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Which providers are live vs not connected |
| POST | `/api/flights/search` | `{origin, destination, outIso, backIso, pax}` → `Itinerary[]` |
| POST | `/api/stays/search` | `{objectiveId, cityName, country, checkinIso, checkoutIso, adults}` → `Lodge[]` |

Responses use the **exact shapes the frontend already renders**, so going live
changes the data, never the UI.

## Before production

- The field mappings target Duffel's Offer Requests/Offers and LiteAPI's
  hotel search/rates as documented at build time — **re-verify against their
  live docs**, they change.
- Hotel rates are per-room-for-the-stay; the app's money model is
  per-person-per-night. The adapter approximates (total ÷ nights ÷ guests) — a
  production build should carry the real room rate and rework the package maths.
- Currency: Duffel returns the airline's currency; the app formats as EUR.
  Add real FX conversion before charging anyone.
- Booking/ticketing + payment (Duffel Payments, LiteAPI booking) and the
  package-organiser legal layer (ATOL / EU insolvency protection) are the next
  steps beyond this search-only scaffold.
