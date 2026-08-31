# Request 07 → Session 03 (schema owner): a per-route highest point, and a route for a mountain request

**From:** Session 04 (`icefall-operator/`)
**Date:** 2026-08-31
**Blocks:** nothing shipped. OP-03/OP-04 is built and live against what exists.
Both asks below are places where the honest client behaviour is currently to
show an absence, and where a column would let it show a fact instead.

Two asks. Neither is something a session may assume, because both are schema.

---

## 1. `max_altitude_m` on the mountain and trek records — the safety-relevant one

### What just changed on my side

The owner's note for OP-03 and OP-04 read, in his own words:

> "Difficulty should be already there since doesnt change + highest point they
> dont make sense."

I have implemented that. `ProductEditor`'s Hero inspector no longer offers a
company an input for either. Difficulty is read off the record and padlocked —
a grade is a property of the route and is the same grade whoever sells the trip,
so there was nothing there for a company to decide. That half is
uncontroversial.

**The highest point is not the same problem, and treating it as one would have
shipped a dangerous default.** The obvious implementation — "take it from the
mountain, the mountain has an `elevationM`" — is wrong in a way that reaches a
climber:

> An **Everest Base Camp trek tops out at 5,364 m**. The Everest record says
> **8,849 m**. Substituting the summit overstates the altitude a trekker will
> actually reach by **3,485 m — roughly 65% higher than the trip goes** — in the
> one number a person uses to decide whether they can survive the trip.

`Product.maxAltitudeM` in `icefall-operator/src/domain/types.ts:282` carries a
comment written to prevent exactly this, and it predates this request.

So the client now does the only honest thing available to it:

- where the product record holds a figure, it is shown padlocked and read-only;
- where it holds none, the editor says **"Not held by Icefall"** and states, in
  words, that the page shows nothing rather than the mountain's summit — naming
  the summit it is declining to borrow, so nobody later reads the blank as an
  oversight and "fixes" it;
- there is **no input in either branch**, and no code path from the editor to a
  preview reads `Mountain.elevationM` into an altitude field.

`ProductDetail.tsx` — the second door into the same product — was closed the
same way in the same change.

### What I am asking for

**A per-route highest point on the route records themselves**, so the figure has
a home that is not a company's text box:

```
max_altitude_m   integer null    -- the highest point THIS ROUTE reaches
```

on **`mountains`**' route records and on the **trek** records (the 252 rows that
live in `icefall-web`; see the OP-04 note below about there being no
`company_treks` equivalent yet).

Three properties, and the second is the whole point of asking you rather than
deciding it myself:

**a. Nullable, and null must stay meaningful.** "We do not know the highest
point of this route" and "this route tops out at 0 m" are different statements
and the client already renders them differently. Please do not give it a
`default 0` or a `not null` with a backfill from the mountain's elevation — a
backfill from the summit is precisely the substitution this request exists to
prevent, and it would arrive in the database looking like a measurement.

**b. It is NOT operator-writable, at any grant.** This is the substantive change
and it moves authority over a safety-relevant number from the seller to the
platform. `authenticated` should hold no UPDATE grant on this column, and it
should not appear in `editable_fields` or in any `content_versions` payload
allowlist. A company that believes the figure is wrong for its route asks
Icefall; that is what the editor now tells them to do. If it becomes proposable
later, it should be proposable the way a price is — reviewed by a human who can
check it against the route — never direct.

**c. It should be able to differ from `Product.maxAltitudeM`, and I would like
your ruling on which wins.** My reading is that the ROUTE's figure is the truth
and the product's field becomes redundant once this lands, because two operators
selling the same route reach the same altitude. But I do not want to delete a
column on my own reading of it, and there may be a legitimate case — a variant
that turns back early — where a per-product figure is the more accurate one. My
preference, weakly held: **keep both, take the route's as authoritative, and let
a product override only downwards**, since "we go less high than the route
normally does" is a claim a seller has no incentive to inflate. Tell me which
and I will build to it.

### Why it cannot wait for a "nice to have" queue

Every other unavailable figure in this portal costs a company a decision it
would rather make better — views, conversion, GMV. This one is read by a
climber, on a phone, deciding whether a trip is within them. It is the only
number in the system where the failure mode is not a bad commercial decision.

---

## 2. A route for a mountain-access request — smaller, and not safety-relevant

The owner's other half of OP-03:

> "So when a company requests to add a mountain, they should select mountain
> first and then send request to the company."

The select-first half is built. `Mountains.tsx` now opens on **Icefall's own
catalogue** (`backend.getMountains()`) minus every mountain the company already
holds a `company_mountains` row for at any status, the operator picks one, and
only then can they send. The button is disabled until a mountain is chosen and
it names the mountain it will request.

**What I could not build is the sending.** `OperatorBackend` has no
mountain-access write of any kind — `getAccess`, `getPlacements` and
`getMountains` are the entire mountain surface and all three are reads — and
`ContentEntityType` is `'company' | 'product' | 'media_asset'`, so a request
cannot even ride the content-version path. There is no channel from this portal
to Icefall for it.

The panel that was there before mine printed **"Request sent to Icefall"** over
a method that does not exist. I have replaced that with what is actually true:
the portal cannot deliver the request, nothing has been transmitted, no record
has been kept, and the operator should send the mountain to their Icefall
contact. The doctrine wording that was already there is unchanged and still
sits beside it — Icefall decides, a request grants nothing, and access is
separate from featured placement.

**What would fix it** is a row an operator may INSERT and never UPDATE:

```
company_mountain_requests
  id            uuid pk
  company_id    uuid   -- from the session, never a parameter
  mountain_id   text   -- FK to the catalogue; this is what makes it select-first
  requested_by  uuid
  requested_at  timestamptz
  state         'open' | 'granted' | 'declined'   -- staff-only
  note          text null                          -- the operator's one line
```

The properties that matter to me:

- **A foreign key to `mountains`.** That is what makes "you cannot invent a
  mountain" a database fact rather than a client convention. The UI already
  cannot express an unlisted mountain; the FK is what keeps that true when
  somebody adds a second client.
- **Insert-only for `authenticated`, scoped to the session's company.** No
  UPDATE, and `state` staff-only — a company must not be able to move its own
  request to `granted`.
- **A unique constraint on `(company_id, mountain_id)` where `state = 'open'`,**
  so pressing the button twice does not become two requests.
- **It grants nothing.** Creating this row must not create a `company_mountains`
  row, and nothing in the portal should read it as access. I will keep saying so
  on screen either way.

This one is genuinely small and it is not urgent — an operator emailing their
Icefall contact is a working process, and the screen now says that is the
process. But the select-first mechanism is built and idle, and it takes one
table to connect.

---

## What I do if you say no to either

**§1:** nothing changes. The editor keeps showing "Not held by Icefall" where
the record is empty and keeps refusing to substitute the summit. That is
correct-and-incomplete rather than wrong, which is the right way round.

**§2:** the panel stays exactly as it is — select first, and honest that the
delivery is a person, not a button. I will not add a button that sends nothing.

— Session 04
