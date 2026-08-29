# 03 → 04: the schema is live. Build against this, not against an assumption.

> **This is also the reply to `01-operator-schema.md`.** That request was
> excellent and most of it is now built. Read "Answers to your three blockers"
> first, then "Where I diverged from your request" — there are four places, and
> each has a reason you can check.

**Status: applied and tested.** Two migrations are in `icefall-supabase/migrations/`:

- `20260828100000_crm_foundation.sql` — staff roles, audit, mountains, companies
- `20260828110000_crm_marketplace.sql` — placements, products, media, content versions

`cd icefall-supabase && npm test` → **31/31** (existing) + **62/62** (new CRM
attacks, including your test list §7 items 1–14). Run it before and after
anything you build on top.

These two files have never been applied to a real database — no Supabase project
exists yet — so I edited them in place rather than stacking a corrective
migration. Once one is linked, that stops and changes come as new files.

---

## Answers to your three blockers

### §1 — `CompanyMountain` vs `Placement`: **two tables, not one.**

I know you asked for one and offered to follow my naming. The reason for two is
in your own spec, §18:

> *Placement expires while the operator still has products → products remain,
> placement state becomes Expired until ICEFALL renews.*
> *Operator loses mountain access → preserve historical records, prevent new edits.*

Those are two different lifecycles on one row if they share a table. If the paid
position and the edit-authorization are the same record, a placement expiring
takes the operator's edit rights with it — which contradicts the first line, and
makes the second unreachable independently. So:

| Table | What it decides |
|---|---|
| `company_mountains` | **Authorization.** May this company edit this mountain's content? `status` ∈ `active`\|`suspended`\|`ended`. No position, no price. |
| `placements` | **The paid slot.** `slot_position` 1–5, term, price, status. |

Suspending a company's mountain access and cancelling their placement are now
separate acts, which is what your two edge cases need. Your
`company_has_mountain(c, m)` is `company_may_edit_mountain(company_id, mountain_id)`
and it requires `company_mountains.status = 'active'`, exactly as you specified.

### §5 — `product_departures`: **built as your §5 specifies.**

> **Provenance, settled.** You were right and I was wrong to hedge this. I
> briefly annotated it as an unverified second-hand claim, because it had reached
> me through your §5 rather than from the owner. You had in fact put it to the
> owner first-hand, with three options, and recorded the answer accurately — and
> the owner has since confirmed it directly. It is now constitution §6 decision
> 12, with the question and the options written in. The hedge is removed from
> both this document and the migration comment; leaving it would have been the
> false statement.
>
> Nothing about the implementation moved at any point.

Split write path, enforced as column privileges rather than a policy:

| Columns | Who writes |
|---|---|
| `availability`, `spots_total`, `spots_left` | The operator, directly. No approval. |
| `departure_date`, `end_date`, `price_cents` | `set_departure_terms(...)`, staff only. |

`authenticated` holds `update (availability, spots_total, spots_left)` and no
more, so your test 18 passes at the privilege layer:

```
operator updating spots_left        → works
the same statement touching price   → permission denied for table product_departures
```

Adding or removing a departure follows the product: free while the parent is a
`draft`, staff-only once it is live.

### §0.1 — `operator_profiles`: **kept, marked legacy, not dropped.**

You are right that it cannot become `Company` — the primary key is the problem,
as you said. But it is declared in `icefall-app/src/backend/types.ts`, which is
Session 01's file, and dropping a table out from under another session's
generated types is not a change to make from here. It now carries a table comment
saying it is superseded and that nothing new should read it. `companies` +
`company_users` are canonical. If the owner wants it gone, that is a one-line
migration once Session 01 has regenerated their types.

---

## Where I diverged from your request

**1. `mountains.id` is TEXT — the slug itself. There is no uuid and no separate
`slug` column.** This is the correction most likely to bite you, because your
request assumes `mountain_id uuid`. `icefall-web/src/data/peaks.ts` keys its 52
peaks by `id: "everest"`, and `trekRecords.ts` already carries
`mountainIds: ["mont-blanc"]`. A uuid PK would mean a lookup on every join from
data that already exists. **Every `mountain_id` in the schema is `text`.**

**2. Multiple pending versions per entity, not one.** You asked for
`unique (entity_type, entity_id) where status = 'pending'`. I went further: the
conflict check is **field-scoped**, so two pending versions coexist when their
field sets are disjoint and clash only when they touch the same field:

> `a review is already pending for: price_from_cents`

This is a superset of what you asked for — you never get a silent overwrite, and
an operator fixing a typo in the summary is not blocked by a price change waiting
on review. My spec §9 requires that granularity; yours permits it.

**3. `base_snapshot`, not `version`/`base_version`.** Same goal, less machinery.
A version records the live values of the fields it is changing, as they were when
editing started. At approval, if any of them has moved since, the change is
refused rather than applied over the top:

> `the live value of summary changed after this was proposed`

No counter to maintain, and it catches the case a counter misses: ICEFALL editing
a field directly while an operator's change to it sits pending.

**4. Operators write to `products` directly while the row is a `draft`.** Your
§0.3 asked for no operator UPDATE at all. I kept a narrow one because the
alternative — creating a product that does not exist yet via a content version
pointing at nothing — is worse. The publication boundary is intact: the UPDATE
policy's `USING` clause only matches `status = 'draft'`, so **a live or in-review
product cannot be touched by its operator at all.** Tested both ways.

I did take your §0.4 argument, and further than you asked — see below.

---

## What your §0.4 argument changed

You asked for placements to be privilege-locked rather than policy-locked. Taking
that seriously turned up a hole in my own design: `move_placement` wrote an audit
event, but nothing stopped a staff member issuing a plain `UPDATE` and skipping
it. My spec §7 requires *every* position change to be audited, and a policy
cannot make a writer record what they did.

So `authenticated` now has **`select` only** on `placements` — staff included.
Every write goes through one of four functions, each of which writes the audit
event as part of the same statement:

```
create_placement(company_id, mountain_id, slot_position, starts_on, ends_on, price_cents, currency, status)
move_placement(placement_id, slot_position, reason)
set_placement_terms(placement_id, starts_on, ends_on, price_cents, status, reason)
cancel_placement(placement_id, reason)          -- the only thing that frees a slot
```

Your test 3 — *an operator cannot update its own placement position* — now fails
at the privilege layer before any policy is consulted, and so does the same
statement from an ICEFALL administrator.

---

## The rest of your request: accepted as specified

- **`documents_checked_at` / `documents_checked_by`** — adopted verbatim,
  replacing my `verified_at`/`verified_by`. Your naming is better: it cannot be
  misread as "the issuing association confirmed it". A coherence constraint makes
  a check date on an unverified company, and a verified company with no date,
  both unstorable.
- **`my_company_id()`** — added.
- **`media_assets`** — `document` added to the type; `mime_type` and `byte_size`
  added. An asset cannot reach `approved` without a licence *and* a credit.
- **`looks_like_contact_details(text)`** — built, and **advisory, not blocking**,
  exactly as you suggested it might have to be. The validator sets
  `content_versions.flags = {possible_contact_details}`; the Approval Center
  surfaces it. "Call the hut on arrival to confirm beds" is not flagged;
  `hello@example.com` is. A regex that refused submissions would teach operators
  to evade it.
- **Two roles, enforced.** Content is a Company Admin's job. A Sales Employee
  reads the catalogue and cannot edit products, submit content or upload media —
  your test 13. They get conversations, leads and notes when those land.
- `product_mountains` gated on `company_may_edit_mountain` — your test 10, passing.

## Still to come (next migration, shapes fixed)

`leads`, `bookings`, `conversation_notes`, `operator_notifications`,
`analytics_events`, and the `threads` extension. All accepted as you specified,
with two notes:

- **`bookings.value_status`** takes your vocabulary — `reported` \| `pending` \|
  `unknown` — with `reported` requiring a figure and the other two requiring
  NULL. Storing an unknown value as `0` is unrepresentable.
- **`conversation_notes` is right and I had missed it.** An internal note in
  `messages` is visible to the customer under the existing `messages_select`
  policy. It gets its own table, out of the realtime publication.

## Two things I am NOT doing, and why

- **Widening `threads_select` is deferred until I write that migration.** It
  touches a policy protecting private correspondence that 31 attack tests cover.
  It will be a single added `or public.is_company_member(company_id)` branch,
  landing with tests, not squeezed in beside unrelated work.
- **Public/anon read of live content is not mine to decide** — you flagged it and
  you were right to. `icefall-web` is a waitlist page today, so nothing needs it
  yet. Logged in `FINDINGS.md`; the brain holds the product question.

## The referral rate

Deferred, and I have not picked one. The engine will be configurable,
effective-dated, and the rate is stored **on the commission record** — so
whichever number lands, no historical figure moves. `money.ts` still reads
`DEFAULT_REFERRAL_PCT = 10`; I am not resolving that by hardcoding 7.5, per your
note and the brain's. Seeds will carry a visibly-marked placeholder.

---

## Your thirteen entities, mapped

| Your entity | Table | Notes |
|---|---|---|
| `Company` | `companies` | Canonical. One row per company, not per user. |
| `CompanyUser` | `company_users` | `(company_id, profile_id)` PK, `company_role` is `'admin'`\|`'sales'` — your two roles, no matrix. |
| `Mountain` | `mountains` | **Text PK = the existing slug** (`mont-blanc`, `everest`). Same vocabulary `icefall-web`'s trek records already use. |
| `CompanyMountain` | `company_mountains` | Your authorization boundary. |
| `Product` | `products` | `kind` is `'expedition'`\|`'trek'`. |
| `ProductMountain` | `product_mountains` | |
| `ProductDeparture` | `product_departures` | |
| `MediaAsset` | `media_assets` | |
| `ContentVersion` | `content_versions` | See "the approval workflow" below — it is not shaped how you may expect. |
| `Conversation` | `threads` | **Already existed.** Do not create a second one. |
| `Message` | `messages` | Already existed. No UPDATE/DELETE for anyone. |
| `Lead` | *(next migration)* | Coming with bookings/commissions. Shapes below so you can design against them. |
| `Booking` | *(next migration)* | |
| `OperatorNotification` | *(next migration)* | |

---

## The three things that will surprise you

### 1. `ContentVersion.payload` is a PARTIAL PATCH, not a full copy of the record

`payload` is a jsonb object holding **only the fields being changed**:

```json
{ "price_from_cents": 5900000 }
```

`changed_fields` is derived from the payload by a trigger — **do not set it**, it
will be overwritten. This is what makes your §9 granularity requirement work: two
pending versions on one product coexist while their field sets are disjoint.

Submitting a second pending version touching a field another pending version
already claims **raises**, with the clashing field named:

> `a review is already pending for: price_from_cents`

That is deliberate — it is the "clearly serialize, never silently lose an edit"
edge case. Catch it and show the operator which change is already in flight.

**Only whitelisted fields may be proposed.** The list lives in `editable_fields`
(readable by any signed-in user, so your edit form can drive itself off it).
A payload containing anything else raises:

> `these fields cannot be changed through an operator submission: status`

So `status`, `company_id`, `live_at` and every commercial column are unproposable
by construction. Do not try to route a publication state through a version.

### 2. An operator cannot UPDATE a live product AT ALL

The publication boundary is the UPDATE policy's `USING` clause on `products`: it
only matches rows whose `status = 'draft'`. Consequences for your UI:

- **Draft** → direct edits work normally. Save Draft writes straight to `products`.
- **Pending review / Live / Archived** → every write is refused. The only route is
  a `content_versions` row. Your "Submit for Approval" button must create a
  version, never an update.

Status chips map to: `products.status` ∈ `draft` \| `pending_review` \| `live` \|
`archived`, plus `content_versions.state` ∈ `draft` \| `pending` \| `approved` \|
`rejected` \| `changes_requested` \| `superseded` for the per-change chip. Your
"Rejected" chip reads `decision_reason`, which is **guaranteed non-empty** — a
refusal without a reason is refused by a constraint.

### 3. Placement expiry is DERIVED, never stored

`placements.status` holds only `reserved` \| `active` \| `cancelled`. There is no
stored `expired`, and **nothing writes to that table on a timer.**

Read `placement_status` instead — a view giving you `effective_status`
(including `'expired'`), `needs_review` and `days_remaining`. It is
`security_invoker`, so it obeys the same row policies as the table.

An expired placement **still holds its position** until a human moves the
company. Your §18 edge case — "placement expires while the operator still has
products" — is therefore: products remain, `effective_status` reads `expired`,
and the operator's mountain access is governed separately by
`company_mountains.status`. Set that to `suspended`/`ended` to remove edit rights
while preserving history; the placement row is untouched.

---

## Authorization helpers you can call

All are `SECURITY DEFINER`, all coalesce to false, all granted to `authenticated`:

- `is_company_member(company_id uuid) → bool`
- `is_company_admin(company_id uuid) → bool` — your Company Admin role
- `company_may_edit_mountain(company_id uuid, mountain_id text) → bool` —
  membership **and** an active mountain assignment, both halves
- `is_staff() → bool` / `has_staff_role(text[]) → bool` — ICEFALL side; you will
  not need these but they appear in policies you are reading

**Do not re-implement these in TypeScript.** The policies use them; a second
definition in your client is a second answer to the same question.

## What your users must NEVER see

`company_internal` — account owner, source, priority, tags, internal notes. It is
a separate table precisely because RLS is row-level: had those columns stayed on
`companies`, an operator reading their own row would read all of them. There is
**no operator-facing policy on it at all**. If you find yourself needing a field
from it, you are about to leak ICEFALL's commercial position — file a request
instead.

Operators also cannot read `audit_events`, `staff_members`, or any other
company's rows on any table. That is tested (`crm.test.mjs`).

## Shapes for the entities still to come

Design against these; they will not change without telling you.

```
leads    id, customer_id→profiles, company_id, mountain_id, product_id,
         thread_id→threads, source, owner_id→profiles (your sales employee),
         status: new|contacted|qualified|quoted|booked|lost|disputed,
         created_at, first_response_at, qualified_at, booked_at, lost_at, lost_reason

bookings id, lead_id, company_id, product_id, mountain_id, customer_id, thread_id,
         value_cents  bigint NULL,
         value_status reported|pending|unknown,   -- your vocabulary, adopted
         status, booked_at, starts_on, completed_at
```

**Note `value_status`.** A booking recorded without a value is `pending`/`unknown`
with `value_cents` NULL — a coherence constraint makes storing an unknown value
as `0` impossible. Your analytics must treat it as absent, not as zero, and a
conversion rate with no denominator is unavailable rather than `0%`.

## Two standing decisions that reached me via the brain

- **One accent across the family: alpine azure.** Nothing stays gold. The staff
  and operator tools derive a darkened azure for legibility on a light background.
- **The referral rate is DEFERRED** — the owner has not chosen between 7.5% and
  10%. Do not display a rate as though it were settled, and do not ask them. The
  commission engine is being built rate-agnostic with the rate stored on each
  commission record, so historical revenue is never rewritten when the number
  lands.

— Session 03, 2026-08-28
