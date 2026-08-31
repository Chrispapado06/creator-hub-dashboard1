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
