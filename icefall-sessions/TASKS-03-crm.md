# Session 03 — icefall-crm — 8 BUILD items

Read `TASKS-shared-rules.md` first. Owner's exact words are in
`BACKLOG-flight-notes.md` under each ID.

- **CR-07 SlotCalculator** — the total-users input is typed by hand today. The CRM
  already knows signups and active users; read it from there. This is the one that
  makes the calculator trustworthy, so do it first.
- **CR-16 Tasks** — tasks must work as an assignment with a notification: assign to
  a named person, they see it, they complete it. Currently inert.
- **CR-18 Billing** — notify the sales team who owes an invoice and whose slot deal
  is ending. A list plus a notification, not a report.
- **CR-05 Sales** — the pipeline must let a card be dragged between columns.
- **CR-02 Analytics** — numbers at the top, graphs beneath, and materially more
  data. Ask what question each figure answers before adding it; "every small piece
  of data" is a direction, not a spec, so propose the set before building it all.
- **CR-13 Guides** — how many guides, how much commission they generated, and a
  section for applications and mountain-additions awaiting approval. Clicking a
  guide opens their full profile, analytics and chats.
- **CR-14 Support** — support must read like the other chat surfaces (click a
  thread, not a form), and staff must be scopeable to a requester type — one person
  handles guides, another handles app users. The requester kind is already derived
  server-side in `open_support_ticket`; use it, never accept it from a client.
- **CR-06 MountainPlacements** — the owner says the layout is already good. Two
  additions: (a) placements must connect through to the phone app and the website,
  and (b) mountain performance metrics — searches, enquiries. **(a) crosses into
  other apps: file requests in `icefall-sessions/requests/` rather than editing
  them.**

## NOT yours yet

- The CRM's Social Media Promotion screen is `DESIGN` and part of the cross-app
  social piece being scoped separately. Do not start it.

## Inert drawn controls — BUILD (logged 31 Aug, the night the drawings became production)

The 31 Aug merge made the owner's drawings the production screens. These
controls render as drawn but have no flow behind them yet; the owner WILL click
them, and this list is where the answer to "why did nothing happen" lives.

- **Filters buttons** (Commissions, Bookings, Dashboard headers) — filter panels. New build.
- **+ Add Product** (Products) — creation lives in the operator portal (products
  arrive via approval); needs the portal link-up or a deliberate admin create flow.
- **More actions ▾** (Booking detail hero) — menu: export this booking, open its
  thread (arrives with S1 messaging), view customer.
- **View rate details →** (Commissions two-sources card) — per-agreement referral
  rate surface; ties to the commission-basis records.
- **View / View all links** (Commissions four lists + unpaid table) — drill-through
  routes; "View all unpaid" is a filtered commissions view.
- **Download all documents** (Booking agreement pane) — real export once agreement
  documents are stored files; today the record is pinned text (booking_agreements).
- **Bookings Export** — wire a real CSV like Products/Commissions already have.
- **Leads & Messages sidebar badge** — real unanswered-enquiries count (the query
  exists) instead of the flag-only sample "5".
- **Bookings pager** — real pagination when row counts warrant it; today the list
  states "showing all N" honestly.

## S1 messaging landed — CRM surfaces now buildable — BUILD (31 Aug)

Migration 20260831140000_messaging.sql (queued for push): send_message +
mark_thread_read (both INVOKER — RLS is the single source of send rules),
receipts forward-only, membership rows immovable, thread objectives pinned,
realtime on messages + receipts. With it, these CRM screens can stop saying
"arrives with the messaging surface":
- **Bookings detail → Messages tab** — render the booking's thread (staff read
  passes messages_select via is_admin).
- **LeadDetail → Message thread panel** — same; note the screen currently
  CLAIMS staff cannot read without participation, which is stricter than the
  DB truth (admin bypass exists) — keep the restraint or read, but say which.
- **CR-13 Guides → chats section** — thread list per guide now readable.

## CR-02 proposal — the figures that become measurable when the six land (per the task's own "propose before building it all")

Shipped now (CR-02b): Response times — measured. Median / p90 created→answered
from enquiry timestamps, answered count, waiting-now with oldest wait. The
measured truth behind the forbidden "replies within n hours" invention.

Proposed next, each named by the question it answers, all countable from rows
the queued migrations create — nothing here is a view count or a DAU, which
remain unsourced:
- **"Do providers reply, and how fast?"** — per-guide/per-company median first-reply
  time within threads (S1 messages), the marketplace's real responsiveness figure.
- **"Is the feed alive?"** — posts per day, comments per post, follows growth (S2),
  counted not stored.
- **"Does promotion do anything?"** — campaigns active now; and honestly NOTHING
  else until something measurable (a booking or enquiry naming a promoted product
  inside campaign dates) can be counted. No reach, no impressions.
- **"Does hand-off work?"** — enquiries handed off, and desk-time before hand-off (S4).
- **"Is trust growing?"** — identity checks recorded per week (grey), guide document
  checks and their expiry horizon (gold).

## CTRL — control modernisation sweep (11-CONTROLS-CONTRACT) — DONE 31 Aug
Inventory 31 Aug, pre-sweep: 17 `<select` across 12 files (CompanyAccess,
Commissions, Companies, CompanyEdit, CompanyPage, Dashboard, Guides, Products,
Promotions, Sales, Tasks, Verification) + 4 `type="date"` across 3 files
(MountainPlacements ×2, Promotions, Tasks). Kit: src/components/controls.tsx
(Select listbox w/ keyboard+typeahead, DateButton single, RangeControl w/
preset pills + custom). Re-grepped 31 Aug: ZERO `<select`, ZERO `type="date"` outside the kit's own
comment. Swept: Promotions(2+1), Dashboard(range), Commissions(range),
Products(3), Tasks(2+1), Sales, Verification, Guides, Companies, CompanyEdit,
CompanyPage(2), CompanyAccess, MountainPlacements(2 dates). Keyboard verified
in-browser (open/typeahead/Enter/Esc, ISO-under-display).
