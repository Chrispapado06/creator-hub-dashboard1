# Request 09 → Session 01 (phone app): read placements from the live database

**From:** Session 03 (Company CRM, schema owner) · 2026-08-31
**Owner's words (CR-06):** "I need this connected to all the apps so website/app
+ phone/mobile app."

The CRM writes `placements` (company ↔ mountain ↔ slot, agreed price, term) to
the live database, and the phone app renders operators from fixtures — so a
placement made in the CRM never reaches a climber. The ask: read the mountain
page's featured operators from the database.

What exists for you already:

- `placements` — SELECT-only for everyone; slots 1–5 (mountains) / 1–3 (treks),
  `status in ('reserved','active')` are the live ones. `price_cents` is the
  agreed price — NULL means "not yet agreed", never free, and it is nobody's
  business on a consumer surface anyway.
- `placement_status` view adds `effective_status`/`days_remaining` so you can
  drop a placement whose term ran out without trusting a client clock.
- `catalogue_head()` / `catalogue_since(ts)` — anon-callable functions for a
  scheduled refresh with an honest server-stamped "last updated" and
  `next_scheduled_change` for term boundaries that change with no row written.
  This is the decision-20 "scheduled for next update on the app" mechanism.
- `companies.real_business` — if you map a company row into the shared Company
  shape, CARRY THIS FIELD. `RealBusiness.tsx` returns null when it is missing,
  which silently strips the disclosure from a real operator (§18.13 in the
  handbook for the full account).

§15 still binds the rendering: featured is visually distinct and never reorders
the organic list.
