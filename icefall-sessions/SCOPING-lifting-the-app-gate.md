# What it would take to lift the `/app/*` gate

**Session 02 (`icefall-web`), 2026-08-29. Requested by the product owner.**

Two operator-facing features have now blocked on the same thing — the
`listing_view` analytics events and the operator portal's live-preview editor —
so the gate stopped being a detail and became a roadmap question.

Written from the 348-route crawl and commercial audit run against this tree on
2026-08-28. Facts below were verified then unless marked as inference.

---

## 1. The finding that reframes the question

**Lifting the gate does not reveal a marketplace waiting to launch. It reveals
an empty one.**

Everything commercial in `icefall-web` is gated **at its definition**, not at its
render site — which is the honesty doctrine working exactly as intended, and it
has a consequence nobody has stated out loud:

```ts
export const COMPANIES:   Company[]    = IS_DEMO ? [ … ] : [];
export const GUIDES:      Guide[]      = IS_DEMO ? [ … ] : [];
export const EXPEDITIONS: Expedition[] = IS_DEMO ? [ … ] : [];
export const POSTS/STORIES/GROUPS/CONTRIBUTORS                = IS_DEMO ? [ … ] : [];
```

`IS_DEMO` is `import.meta.env.DEV`. So in a production build the marketplace has
**zero companies, zero guides, zero expeditions, and zero social content.** Flip
the gate today and a visitor reaches a working, well-built, entirely empty shop.

**The exception is the part that is real**, and it is not small:

| Asset | Count | Gated? |
|---|---|---|
| Mountains (`peaks.ts`, `peakFacts.ts`) | 52 | **No — real** |
| Peak photographs, credited | 303 gallery / 52 heroes | **No — real** |
| Treks (`trekRecords.ts`) | 252 across 22 regions | **No — real** |
| Trek photographs, credited | 238 of 252 | **No — real** |
| OpenStreetMap trail index | 77,141 trails | **No — real** |

So the gate is guarding two completely different products that happen to share a
route tree, and they have almost nothing in common:

- **A. The catalogue** — 52 mountains and 252 treks, with real elevations, real
  descriptions, credited photography, and honest gaps ("Not specified", "Price
  on enquiry"). It needs no operators, no accounts and no payments. **It is
  substantially finished.**
- **B. The marketplace** — guides, companies, expeditions, bookings. It needs
  signed operators, verified guides, a payment processor and real accounts.
  **Nothing of it exists outside the demo.**

Conflating them is why the gate looks like a flag flip. **A is close. B is a
business-development project with software attached.**

## 2. What blocks A — publishing the catalogue

The smaller, nearer thing, and the one I would put in front of the owner as a
real option.

### A1. Esri basemap licensing — **the hard blocker**

`app/mapTiles.ts:14` uses the keyless Esri World Imagery tier as the basemap for
every mountain and trek page. The file's own header records that this tier is
**non-commercial-use only** (Esri doc G577 §2.2). Publishing the catalogue
publicly is a commercial use.

The same blocker is recorded against the phone app's `trailImagery.ts:84`, where
it is the default base for ~99.5% of trail cards. **One decision covers both
apps.** The documented fix is an ArcGIS Location Platform key: 2M tiles/month
free, then metered. That is a procurement and cost decision, not an engineering
one, and it is currently held by the brain.

*Nothing else in section A is a blocker of this kind. This one is.*

### A2. OpenStreetMap attribution — likely small, needs checking

The trail index is OSM-derived. The only user-visible mention is a blurb,
"Search the OpenStreetMap walking and climbing catalogue" (`app/Explore.tsx:172`).
ODbL requires attribution for a derived database. **Inference:** this is probably
a visible-credit line plus a licence note, not a re-architecture — but it should
be confirmed by someone who knows ODbL rather than assumed.

The basemap itself already attributes correctly (`SATELLITE_CREDIT` through
maplibre's `AttributionControl`), and the photography pipeline tracks Wikimedia
licence and author per image, so those two are in good shape.

### A3. Routes that would be empty or wrong in production

Not blockers, but they are what a visitor would actually hit. With the demo data
gone, these render nothing or near-nothing: `/app/expeditions`, `/app/guides`,
`/app/social` and its four sub-pages, `/app/saved`, `/app/bookings`,
`/app/messages`, `/app/coach`, `/app/notifications`, `/app/profile`.

Publishing A means **not publishing those routes at all**, rather than publishing
them empty. That is a routing change and some navigation surgery: perhaps a day
or two of work, and a design decision about what the public catalogue's shell
looks like without a signed-in user.

### A4. The waitlist would need a decision

The public site is currently the waitlist and only the waitlist, with a launch
date of 15 October on it. Publishing the catalogue changes what the public site
*is*. That is a marketing decision, not an engineering one.

**Rough shape of A:** the licensing decision, plus roughly a week of work to
carve the catalogue routes out from the signed-in ones and give them a public
shell. The content is already there and already honest.

## 3. What blocks B — the marketplace

### B1. There is no authentication

`lib/auth.tsx` keeps a session in `localStorage` under `icefall.web.session.v1`,
and signing in is:

```ts
signIn: (email) => finish({ name: session?.name ?? email.split("@")[0], email })
```

No password, no server, no account. Anyone can "sign in" as anyone, and the
session is a fact about one browser. The file is honest about this. It is a
prototype, not a weak implementation to be hardened — real accounts are a
build, not a fix.

### B2. Invented people carrying invented credentials

Six guides with invented IFMGA/UIAGM licences, invented day rates, invented
ratings (4.9 with 127 reviews), and testimonials from invented clients. Each also
carries a fabricated verification date rendered as *"Documents checked by ICEFALL
on 5 Jun 2026."*

The licences are the sharp part: **IFMGA/UIAGM is a real accrediting body**, and
publishing an invented licence is a false claim about a real institution rather
than a harmless placeholder. This is not "delete some rows" — it is that the
marketplace has no inventory until real guides are recruited and actually
verified, and "verified" here has a specific meaning the codebase already
defends.

### B3. Elite Exped

A real UK business, currently rendered with ICEFALL's invented figures on a
€62,000 page with a booking button. It is well handled today —
`components/RealBusiness.tsx` keys both the warning banner and a corrected demo
notice off the company record, so the disclosure cannot be separated from the
listing — but the honest resolution before publishing is either a real
relationship with them or removal. A disclosure is the right answer for a demo,
not for a live commercial page.

### B4. Invented commercial claims, at scale

From the audit of all 69 commercial pages: **62** print an invented ★ rating,
**59** assert "24/7 support", **59** print ICEFALL's own refund policy as though
it were the operator's terms, **9** publish a summit success rate. All are
`IS_DEMO`-gated, so they vanish in production — which is correct, and it is also
why B is empty rather than wrong.

Two of these need an owner decision even for the demo and are still open: the
"24/7" tile sits in a stat row whose three neighbours correctly say "Not
published", and the refund line needs attributing to ICEFALL rather than being
printed as the operator's terms.

### B5. No payment processor exists anywhere in the family

Recorded in the constitution: no processor, no money has ever moved. Bookings,
deposits and instalments are all modelled and none are connected.

**Rough shape of B:** business development (recruit and verify operators and
guides), a real authentication and accounts build, a payment integration, and a
legal review of what ICEFALL asserts on an operator's behalf. Quarters, not
weeks, and most of it is not software.

## 4. What this means for the two blocked features

- **`listing_view` events** need real operators with real listings. They belong
  to B, and to the phone app in the meantime — `icefall-app` is the only surface
  in the family that has ever been deployed, so it is the only place an event can
  come from today.
- **The operator portal's live-preview editor** needs a company page that exists
  in production. It also belongs to B. It is fully honest in development and
  worth finishing there, which is what has been built.

**Neither is unblocked by A.** Publishing the catalogue is worth doing on its own
merits, but it does not move either of these.

## 5. Recommendation

Three things, in order:

1. **Settle the Esri licensing question.** It blocks A entirely, it blocks paid
   launch of the phone app, and it is a cost decision rather than a build. It is
   the cheapest decision with the widest effect in the whole family.
2. **Decide whether A is a product.** A public catalogue of 52 mountains and 252
   treks, with credited photography and no invented figures anywhere, is a real
   thing ICEFALL could publish this autumn — and it is exactly the "the numbers
   are true" positioning, demonstrable rather than asserted. It does not require
   a single operator to sign anything.
3. **Stop treating the gate as one decision.** It is two. Every time a feature
   blocks on it, the question asked is "when does the marketplace open", and the
   answer is a quarter away — when the thing actually being blocked is usually
   just B, and A is sitting finished behind the same flag.

**What I would not do:** lift the gate as it stands. It would publish a signed-in
dashboard with no accounts behind it, an expeditions page with nothing on it, and
a social feed with no people — while the genuinely good work, the catalogue, is
the part nobody would find.

---

*Verified 2026-08-28 across 348 routes at two viewports plus an enumerated audit
of 69 commercial pages. Counts of gated data taken from the source; the ODbL
question and the effort estimates are inference and are marked as such.*
