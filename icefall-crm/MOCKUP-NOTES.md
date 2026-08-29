# What the owner's mockup specifies — internal CRM (sheet 1)

Read from the mockup supplied 2026-08-28. Sheet 2 is the **operator portal**
(Session 04's `icefall-operator/`), not this project — noted here only where it
settles a shared question.

**Numbers in the mockup are illustrative and must never be copied into code.**
18,742 users, €128,450 revenue, 312,456 views, "Showing 1 to 8 of 245 companies"
— these show what a populated screen looks like. This build renders what ICEFALL
can actually measure and names the rest as absent. Hardcoding a mockup figure
would be the exact failure the honesty doctrine exists to prevent.

**Every company name in the mockup is either real or too close to real.** Elite
Expeditions, Summit Nepal, Himalayan Guides, Adventure Co., Peak Ascents,
Mountain Quest, Alpine Treks, Everest Adventures. Owner decision #2 stands:
invented names only, seed data included.

---

## 1. THE SHELL IS A DARK SIDEBAR WITH A LIGHT CONTENT AREA

The most consequential difference from what is currently built. The sidebar is
near-black with white text and an azure active state; the main area stays the
light, dense, data-forward surface it already is.

This does not contradict "the CRM stays light" — the working surface is light.
It is a light application with a dark chrome. Both sheets use the same chrome,
which is presumably why they read as one product.

Sidebar structure, grouped exactly as the owner listed, with small uppercase
group labels:

```
ICEFALL / ADMIN CRM
  Overview     Dashboard · Analytics
  Business     Companies · Sales Pipeline · Mountain Placements · Expeditions & Treks
  Marketplace  Content Approvals · Leads · Bookings · Commissions
  Finance      Revenue & Finance · Invoices & Payments
  People       Guides · Users
  Operations   Support · Verification · Tasks & Alerts
  System       Activity Log · Admin Team · Settings
  ─────────────────────────────────────────────
  [avatar] Alex Christofis / Super Admin      ← signed-in staff, bottom-left
```

The signed-in user sits at the FOOT of the sidebar, not in the header. The
header carries the page's own controls instead.

## 2. Per-page detail the mockup adds

**Dashboard** — a date-range control ("Aug 1 – Aug 30, 2026") and an Export
button in the header. Four stat tiles across the top, each with a small
percentage delta. Then: Marketplace Funnel (Views → Enquiries → Qualified →
Bookings as a stepped bar with conversion percentages between stages), Revenue
Overview (total + line chart), Revenue by Source (donut, four slices matching
the four revenue streams), Alerts (a short list with counts and a coloured dot),
Recent Activity (actor + action + relative time).

**Companies** — search box, All Statuses and All Countries filters, "+ Add
Company", pagination. Columns: Company · Status · Mountains · Active Placements ·
Leads · Bookings · Total Revenue · Renewal Date.

**Sales Pipeline** — a kanban, not a table. Columns Prospect / Contacted /
Negotiation / Won / Onboarding, each with a count. Cards carry company, mountains,
value, owner initial and a date. "Total Pipeline Value" top-right.

**Placement Detail** — Position, Mountain, Company, Start Date, Expires (with
"5 days left"), Price, Payment Status, Created By, Last Changed By, and a
**Placement History** list: "Position changed from #2 to #1", "Placement
created", "Contract uploaded", each with date and actor. That history is
`audit_events` filtered to the placement — do not build a second table.

**Content Approvals** — tabs with counts: All · Company Profiles · Expeditions ·
Treks · Media · Documents. Each row shows a thumbnail, the company, the product,
the change in the form "Price change €1,450 → €1,650", who submitted it and
when, and three buttons: Approve · Request Change · Reject.

**Leads** — status tabs with counts (All · New · Contacted · Qualified · Quoted ·
Booked · Lost), search, filters. Columns: Lead · Company · Mountain · Product ·
Status · Value · Created.

**Tasks & Alerts** — tabs All · Critical · Today · This Week. Rows carry a
severity icon, a title, a source line and a due chip.

**Admin Team** — Name · Role · Department · Email · Status.

**Settings** — a left sub-navigation inside the page: General, Commission Rates,
Placement Pricing, Notifications, Email Settings, Integrations, Security,
Appearance. Two panels are drawn:

- *Commission Rates*: Expedition Referral Fee, Trek Referral Fee, Guide
  Commission, Minimum Commission Amount, and a toggle "Apply different rates by
  mountain".
- *Placement Pricing*: a grid of mountain × position (#1 Feature, #2, #3, #4, #5)
  with a price in each cell.

## 3. What the mockup asks for that the schema does not yet hold

1. **Placement pricing per mountain per position** — a rate card, distinct from
   the price actually agreed on a placement. New table.
2. **Referral rate split by product type** (expedition vs trek) and optionally
   **by mountain**. `commission_rules.scope` currently has default/company/
   product/guide — it needs `mountain`, and a product-type dimension.
3. **Invoices and payments** — the Invoices & Payments page has no table behind it.
4. **Verification documents with expiry**, for companies and guides.
5. **Support tickets.**
6. **Staff department, email and status** for the Admin Team page.
7. **A customer/user view** — subscription status, activity, mountain interests.

## 4. What the mockup shows that ICEFALL cannot honestly render yet

Each of these appears populated in the mockup and must render as a named absence
until it can be measured. The layout stays; the figure does not appear.

- Total / Active users, and any growth delta on them
- The Views column of the Marketplace Funnel, and therefore the first conversion
  percentage — nothing writes `analytics_events` yet, and a client-written row is
  self-reported
- Subscriptions as a revenue slice — there is no subscription product
- Every percentage delta ("+16.4%") — these need a previous period to compare
  against, and there is no history
- Payment Status on a placement, until invoices exist
- Ratings anywhere — ICEFALL does not collect them

A tile keeps its position and says why it is empty. It does not disappear: a
metric that vanishes is one the reader assumes is fine.
