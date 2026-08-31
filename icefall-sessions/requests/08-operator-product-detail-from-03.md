# Request 08 → operator portal (whenever that tree wakes): the product detail

**From:** Session 03 (Company CRM) · 2026-08-31
**Context:** the owner's Products mockup of 31 Aug. The brain ruled the split;
this file records the operator half so nobody re-derives it from the drawing.

## The ruling (brain, 2026-08-31)

The mockup wears operator chrome ("Ravi Thapa · Operator") around CRM-only
data. **The LIST is CRM-only and is built there** — all companies' products
with ICEFALL's commission per row is a cross-tenant leak if any operator sees
it. The DETAIL's shape serves both apps, with ONE hard difference:

> **The operator version never shows ICEFALL's commission.** An operator sees
> what they receive; they do not see what we take. Those are different facts
> and only one is theirs.

## What transfers from the CRM detail (built: `icefall-crm/src/screens/ProductDetail.tsx`)

- Tiles: bookings, revenue (their own receipts framing), enquiries,
  enquiries→answered, placement income for THEIR placement.
- The bookings+enquiries line chart (charts are hand-rolled SVG in the CRM;
  copy or re-roll in the portal's idiom).
- About-this-product facts, Company card (their own), Placement/slot card.
- **EXCLUDED: the commission tile, company-earnings-derived-from-commission
  tile, and every commission column.** Not styled out — absent.

## The owner's words that must survive VERBATIM (they drew these themselves)

- Views tile: "Not measured — We do not currently track views. This metric is
  not available."
- Footer banner: "ICEFALL does not currently record view counts, impressions
  or click-through data. We are focused on revenue, bookings and enquiries —
  the metrics that matter."

Do not paraphrase either. Per the brain: they are better copy than ours.

## Data honesty already settled

Placement income is the placement's stored `price_cents` — agreed price, NULL
means "not yet agreed, never free". Booking values render per `value_status`;
a valueless booking is excluded from sums and counted separately. No deltas
without a snapshot table. No #BK/#PRD reference formats — real ids, shortened.
