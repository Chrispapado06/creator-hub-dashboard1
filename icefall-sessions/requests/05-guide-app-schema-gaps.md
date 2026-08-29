# Request to Session 03 — four schema gaps the guide app hits

**From:** Session 05 (`icefall-guide`) · **Date:** 2026-08-29
**Owner of the asset:** Session 03 (`icefall-supabase/migrations/*`)

**Nothing is broken today.** Every gap below is currently answered on screen by an
honest unavailable state, and each of those states is the same code path the real
figure will arrive on. This is a request for when the backend is provisioned, not
an incident.

Ordered by what it costs the product, not by size.

---

## 1. HIGH — a guide's enquiry cannot be recorded, so a guide has no funnel

`public.leads.company_id` is `not null` (`20260828100000_crm_foundation.sql`). A
guide is a **person**, not a company, so a client enquiring about a guide has
nowhere to be recorded. Every funnel in the family — enquiries → contacted →
qualified → booked, with its conversion timestamps — is computed from `leads`.

**What this stops the product doing.** The product owner's brief for this app
lists four questions a guide opens it to answer. One of them is *"how am I doing
on the marketplace — is being listed with ICEFALL worth anything?"* That question
is precisely "how many enquiries did ICEFALL bring me, and how many became work".
Today the app can count the threads on the device and must say, in words, that
those are not a marketplace figure. **The guide is paying 10% for an answer we
cannot give them.**

**Shape requested.** Either:

- **(a)** relax `leads.company_id` to nullable and add
  `guide_profile_id uuid references public.guide_profiles(id)`, with a CHECK that
  **exactly one** of the two is set — a lead belongs to a company or to a guide,
  never to both and never to neither; or
- **(b)** a separate `guide_leads` table with the same status vocabulary and the
  same conversion timestamps.

**(a) is the better shape and it is not a close call.** `bookings` already solved
this exact problem with `kind in ('expedition','guide')` in ONE table, and the
header comment there gives the reason: Support and Revenue both want one thing to
search. A second lead table would split every funnel query in the CRM in two and
re-open the drift the single `bookings` table was built to prevent.

**The trap in (a), flagged because it is the §6j shape.** `leads` already carries
`constraint leads_assignee_is_company_staff` — a composite FK binding
`(company_id, assigned_to)` to `company_users`. With a nullable `company_id`, a
guide lead has no company staff to assign to, and the composite FK will not
constrain what a guide lead's `assigned_to` may point at. Two nullable
attacker-controlled columns whose *relationship* is unguarded is exactly the
class that produced the cross-company overwrite in the 2026-08-29 sweep. Whatever
shape you choose, bind the assignee to the owning entity, not to each column
separately.

**Also needed:** `bookings.lead_id` already exists and is the right link. It is
what lets the guide app say *"3 of your 5 enquiries became bookings"* instead of
dividing two unrelated totals. (The app did exactly that in its first draft and
rendered **133%** — four bookings over three enquiries. It now counts only
bookings that name the enquiry they came from, and says so when none do.)

---

## 2. MEDIUM — a guide's dated availability has no table

The app's Openings screen sells **dated, priced, place-counted** windows: "Hörnli
ridge, 12–14 Sept, €1,850 pp, 1 of 2 taken". Nothing in the schema holds that.

- `guide_profiles.availability` is a single enum for the whole person —
  `available | limited | unavailable`. It cannot express a date.
- `product_departures` is the right *shape* but is company-scoped, hanging off
  `products`.

**What this stops the product doing.** "When am I free" is the fourth of the
owner's four questions, and it is the only one of the four where the guide is
*writing* rather than reading. Today the screen says plainly that ICEFALL does
not store these and that athletes cannot see them — which is honest and useless.

**Shape requested:** `guide_openings`, keyed to `guide_profiles(id)`, carrying
`starts_on`, `ends_on`, `price_cents` (integer minor units), `places_total`,
`places_taken`, a status vocabulary, and the `requires` free text.

Two notes on that last field, and both are safety rather than product polish:

- **`requires` should be NOT NULL.** It is what the client must already be able
  to do, and the app shows it before they can enquire. A guide advertising the
  Hörnli with a blank prerequisite is how somebody books a route they cannot
  climb and finds out at 3,000 m.
- **Owner decision 12 applies by analogy.** For a company, availability and spot
  counts are written directly with no approval, while price and dates go through
  `content_versions` — availability going stale hurts the climber, and price is
  what an operator has most reason to overstate. A guide is the same trade, and
  the same split should hold unless you have a reason it should not.

---

## 3. MEDIUM — no payouts ledger

`icefall-guide` has a full Payouts screen — held / releasable / sent, per-booking
breakdown, release dates. All of it is derived in the front end from
`payoutStatusFor` in the shared money model. There is no `payouts` table, no
payout account, and no settlement record anywhere in `icefall-supabase`.

That is correct for today: there is no payment processor and no money has ever
moved, and the screen says so. It becomes urgent the moment one exists, and it
should not be designed under that pressure.

**One property to build in from the start**, because retrofitting it restates
what guides were paid: **store the commission rate and the commission amount on
the payout record itself**, exactly as `commissions` already does for the
referral stream. The freeze test that matters is the one Session 03 already
wrote for referrals — *"changing a guide's rate does not rewrite what they
already earned"* — and it matters more here, because a guide is a person whose
past income would otherwise silently restate.

---

## 4. LOW — `analytics_events` cannot attribute a view to a guide

`public.analytics_events` has `company_id`, `destination_id`, `product_id`,
`thread_id`, `lead_id` — and **no guide or profile column at all**.

So a guide's profile views are unmeasurable twice over: nothing in the family
emits a `listing_view` (constitution §6c), and even a working emitter would have
nowhere to attribute a view of a *guide's* page.

**Priority is genuinely low**, for the same reason Session 04's version of this
was: the unavailable state is honest, the guide is told one thing rather than
two, and it is the same code path the real figure will arrive on. Nothing is
blocked.

**When it is done:** add `guide_profile_id uuid references
public.guide_profiles(id) on delete set null`, and **do not loosen the insert
policy** to make it easier. `source in ('client','server')` with
`with check (source = 'client' or is_staff())` is the only thing standing between
a guide's own renewal decision and a number they can write themselves. A guide
inflating their own view count is the same forgery as a company doing it, and the
guide app already refuses to count `client` rows for exactly that reason.

---

## What Session 05 did NOT do

- Did not write a migration.
- Did not hand-edit `src/money/model.ts` or `src/domain/companies.ts` — both are
  generated copies.
- Did not work around any of the above by inventing a number. Every gap here is
  visible on screen as a sentence explaining the absence.

## One thing going the other way — a defect found in a generated copy

`icefall-guide/src/data/demo.ts` declared its own `COMMISSION_PCT = 12` and
`Payouts.tsx` computed `Math.round((paid * 12) / 100)` from it. That is a **fifth
commission model**, in a family that had already found and reconciled four.

It was wrong three ways at once, and the third is the one worth your attention:

| | |
|---|---|
| the rate | 12% against the settled 10% |
| the rounding | `Math.round` where the shared model deliberately **floors**, so the fraction goes to the guide — this rounded toward ICEFALL, on the screen a self-employed person checks their income on |
| the basis | charged on everything the client paid, **including huts and lifts** the guide hands straight on — contrary to owner decision 13 |

Deleted rather than corrected to 10, per §6g: importing the constant would have
protected the rate and not the rule, and the rounding and the basis *are* the
rule. Every figure now delegates to `totalsForAmount`.

**Why it survived every previous sweep, which is the part that generalises:** it
lived in a different app under a different name. Session 01's reconciliation
searched `icefall-app` for `PLATFORM_COMMISSION_PCT` and `GUIDE_COMMISSION_PCT`
and found four models; nothing looked in `icefall-guide` for a constant called
`COMMISSION_PCT`. **The sync list is not the consumer list** (§6f) — `money.ts`
reaches this app correctly, and the app then ignored it. Worth a grep across all
six trees for any local percentage applied to money.
