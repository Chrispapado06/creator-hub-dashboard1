# Session 04 — icefall-operator — 6 BUILD items

Read `TASKS-shared-rules.md` first. Owner's exact words are in
`BACKLOG-flight-notes.md` under each ID.

## The important pair — OP-03 Mountains and OP-04 Treks

These are the same change twice and must be built as one mechanism:

1. A company **selects an existing mountain or trek first**, then sends a request
   against it. They cannot invent one.
2. Companies edit **their own** fields only: how many spots, their exact itinerary.
3. **Difficulty and highest point must not be set by the seller — but they are NOT
   the same problem, and my first version of this brief was wrong and unsafe.**

   *Difficulty* is a property of the route and does not change, so take it from the
   record. Correct as originally written.

   *Highest point* must NOT be taken from the mountain's summit. Session 04 caught
   this: an Everest Base Camp trek tops out at 5,364 m while the Everest record says
   8,849 m. Substituting the summit overstates the altitude a trekker will actually
   reach by about 3,500 m — and altitude is the number a person uses to decide
   whether they can survive the trip. `Product.maxAltitudeM` in `types.ts` carries a
   comment written to prevent exactly this.

   So: **remove the company's ability to invent either. Where the platform has no
   true per-route altitude, show that it does not have one — never substitute the
   summit.** The real fix is a per-route altitude on the mountain and trek records,
   which is schema and therefore a REQUEST, not something a session assumes.

   (Session 04's illustrative figure of "900% higher" is off — it is roughly 65%
   higher, 3,485 m of overstatement. The finding is right and the arithmetic does
   not weaken it.)
4. Make the edit surface bigger — it is too small to work in.
5. **Preview must show the real thing** — how the listing actually appears in the
   phone app and on the web, not an approximation.

Point 3 is the substantive one: it moves authority over a safety-relevant number
from the company to the platform. Do not let a company override it "just in case".

## The rest

- **OP-09 Theme** — a dark and light option. Smallest item here.
- **OP-05 Leads** — move the notes out of the chat column to the right of the
  interface, and ship ready-made tags: cold lead, waste of time, interested,
  enquired.
- **OP-06 Pipeline** — the pipeline runs off those tags. Build after OP-05.
- **OP-08 Team** — Super Admin can manage staff and grant permissions such as
  creating offers; and **make invite-member actually work** — the invited person
  receives an email and creates their account.
- **OP-05 (second half)** — companies can create custom offers. Coordinate with the
  guide app's GU-03, which is the same feature for guides. Agree one shape.

## OP-04 may be structurally larger than OP-03 — split, do not narrow

OP-03 works because `company_mountains` exists: a company requests access to a
mountain that is already in the catalogue. **There is no trek equivalent.** In this
app a trek is a `Product` the company authors, not a catalogue row it requests
against. The 252 trek records and `operatorsForTrek` live in `icefall-web`.

If OP-04 means "request against an existing trek the way you request a mountain",
it needs a `company_treks` equivalent. **File that as a request; do not invent a
second mechanism.** Report OP-04 as whatever it actually turns out to be.

## OP-08 is half blocked

"Super Admin manages staff and grants permissions" is buildable. **"Invite member
works, they get an email and create their account" is not** — it needs real accounts
and an email path, which is the auth decision still sitting with the owner. Build
the permission half; report the invite half BLOCKED. Do not ship an invite button
that sends nothing.

## NOT yours yet

- **OP-01 CompanyProfile** — company posts, stories and promotional video. Part of
  the cross-app social product being scoped separately. **Do not start it.**
