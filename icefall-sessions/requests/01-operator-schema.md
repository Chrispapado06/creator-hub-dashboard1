# Request 01 — Operator CRM schema (Session 04 → Session 03)

**From:** Session 04 (`icefall-operator/`)
**To:** Session 03 — owner of `icefall-supabase/migrations/*` and `icefall-shared/money.ts`
**Filed:** 2026-08-28
**Blocks:** everything in `icefall-operator/` past the shell. Nothing in the
operator portal can be built against an assumed schema.

Source of truth for this request: `~/Downloads/ICEFALL_OPERATOR_CRM_CLAUDE_CODE_SPEC.pdf`
§15 (Data Model), §16 (Shared Backend Rules), §18 (Edge Cases), §20 (Acceptance).

---

## 0. Read this part first — the four things that are not just column lists

Most of this document is a table specification you can skim. These four are
design decisions, and if we settle them differently the two CRMs will not be two
interfaces onto one backend.

### 0.1 `operator_profiles` cannot become `Company`

`public.operator_profiles` (foundation migration) is keyed
`id uuid primary key references public.profiles(id)`. It is **one row per auth
user** — a person-shaped record. The Operator CRM needs one company with *many*
staff logins in two roles (spec §2, §13). There is no widening of
`operator_profiles` that gets there; the primary key is the problem.

**Ask:** a new canonical `public.companies`, plus `public.company_users` as the
join. `operator_profiles` then has no job left — it should be backfilled into
`companies` and dropped, or explicitly marked legacy. Please don't leave both
alive as two answers to "who is this operator", which is the exact duplication
§16 forbids.

### 0.2 We already have a messaging spine. Do not build `Conversation`/`Message`.

Spec §15 lists `Conversation` and `Message` as if they were new. They are not:
`threads` / `thread_participants` / `messages` exist with full RLS, realtime, and
`thread_participants.last_read_at` already giving per-person unread state.

**Ask:** extend `threads` with operator context columns rather than adding a
parallel table. Details in §3.10.

Two invariants I am explicitly **not** asking you to relax:

- **No UPDATE/DELETE policy on `messages`, for anyone, including admin.** The
  operator CRM will never need to edit a sent message.
- Signup always creates an `athlete`.

One consequence that matters: spec §9 requires an **internal note a sales
employee can add that the customer cannot see.** That must not live in
`messages` — the existing `messages_select` policy shows every participant every
row, so an internal note in that table is a data leak to the customer. It needs
its own table (§3.14).

### 0.3 The publication boundary should be enforced by grants, not by convention

Spec §2: *operator edits are never immediately public*. The strongest form of
that is structural:

- `companies` and `products` hold the **live, approved** values.
- Operators get `SELECT` on their own rows and **no `UPDATE` grant at all** on
  the public-facing content columns.
- Operators write only to `content_versions` (draft / pending).
- Promotion pending → live happens in one `SECURITY DEFINER` function callable
  only by staff.

Then "an approved change is the only way live content moves" is guaranteed by
table privileges rather than by every screen remembering to behave. It also
makes the acceptance test in §20 ("public/live content remains unchanged while
edits are pending") true by construction.

The same argument applies to `company_mountains` — see §0.4.

### 0.4 Operators should have no write path to `company_mountains` whatsoever

Spec §2 and §16: `placementPosition` is read-only to operators. Rather than a
policy that pins the column to its current value, I'd ask for the blunter
version: **no `UPDATE` or `DELETE` grant on `company_mountains` to
`authenticated`**, staff writes going through admin-only paths. Operators need
`SELECT` on their own rows and nothing else.

That makes the single most important test in my system — *an operator cannot
change its own placement position* — pass at the privilege layer, before any
policy is consulted.

Defence in depth, if you want the policy too: pin the column the way
`profiles_update_self` pins `role`.

> Note on a NULL trap we already know about: write membership tests as
> `where <test> is not true` rather than `where not <test>`, and keep the
> `coalesce(..., false)` on every `SECURITY DEFINER` helper — the foundation
> migration's header explains why, and it applies to every function below.

---

## 1. Naming reconciliation — two entities, two names

Your brief and my spec name the same records differently. One table each,
please; you choose the name and I will follow it.

| My spec (§15) | Your brief | What it is | My preference |
|---|---|---|---|
| `CompanyMountain` | `Placement` | company↔mountain commercial assignment + placement position + dates | `company_mountains` — it is the authorization boundary first and a placement record second, and spec §16 names it in that role |
| `ContentVersion` | `Approval` | the submitted-edit record and its review decision | `content_versions` — one row carrying submission *and* decision; a separate `approvals` table would duplicate the reviewer fields my spec §15 already puts on `ContentVersion` |

Your `AuditEvent` is yours; I only need to be able to *read* audit rows for my
own company (spec §2: approval and placement changes must be auditable). I do
not need to write them.

---

## 2. Enums

```
company_status        : 'active' | 'suspended' | 'archived'
company_user_role     : 'company_admin' | 'sales_employee'
company_user_status   : 'active' | 'invited' | 'disabled'
commercial_status     : 'active' | 'expired' | 'suspended' | 'ended'
product_type          : 'expedition' | 'trek'
publication_status    : 'draft' | 'pending' | 'live' | 'rejected' | 'archived'
content_entity_type   : 'company' | 'product' | 'company_mountain' | 'media_asset'
content_version_status: 'draft' | 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'withdrawn'
media_type            : 'image' | 'video' | 'document'
lead_status           : 'new' | 'contacted' | 'qualified' | 'quoted' | 'booked' | 'lost'
booking_value_status  : 'reported' | 'pending' | 'unknown'
attribution_status    : 'icefall' | 'disputed' | 'external'
```

`publication_status` deliberately carries the five chips spec §17 requires
(Live · Draft · Pending Approval · Rejected · Expired). *Expired* is a state of
`company_mountains.commercial_status`, not of a product — a product on an
expired placement stays alive (spec §18).

---

## 3. Tables

Money is **integer minor units** (`bigint` cents) throughout, per the
constitution. Flagging one inconsistency rather than fixing it:
`guide_profiles.daily_rate_eur` is `numeric(10,2)`. That is exact, not a float
bug, but it is a second money representation in the same schema — your call
whether to unify.

### 3.1 `companies` — canonical company record

```
id                  uuid pk default gen_random_uuid()
name                text not null, 1..120 trimmed
slug                text not null unique
status              company_status not null default 'active'
logo_media_id       uuid null -> media_assets(id)
tagline             text null
description         text null
about               text null
city                text null
country             text null
faq                 jsonb not null default '[]'
certifications      jsonb not null default '[]'
team                jsonb not null default '[]'
documents_checked_at timestamptz null
documents_checked_by uuid null -> profiles(id)
referral_pct_override numeric(5,2) null
created_at / updated_at timestamptz not null default now()
```

Three notes:

- **`documents_checked_at` has no default and is never set by an operator.** It
  exists so the surface can say *"documents checked by ICEFALL on <date>"* and
  nothing more. `icefall-web/src/data/companies.ts` currently hardcodes
  `verifiedOn: "2 Mar 2026"` on demo records; the real column must stay NULL
  until a staff action actually recorded a check, and the UI renders the absence
  rather than a date.
- **No contact columns.** Deliberately no `phone`, `email`, `whatsapp`,
  `booking_url`. Spec §2 and §5 forbid customer escape routes in operator
  content, and the cheapest way to enforce that is for the columns not to exist.
  See §6 for the free-text side of the same rule.
- `referral_pct_override` is written by staff only — it is your commission
  engine's per-company override. I need to *read* nothing here; operators must
  not see it. Consider putting it on a staff-only table instead if column-level
  exposure is awkward under RLS.

  **The default rate itself is deferred and must stay unpicked** (owner decision
  relayed by the brain session, 2026-08-28). Neither 7.5% nor 10% is settled.
  Build the engine fully rate-agnostic — configurable, effective-dated, and with
  the rate stored on the commission record so a later change never rewrites
  historical revenue. Seed a **visibly-marked placeholder**, not a real-looking
  number. Please don't resolve the `money.ts` discrepancy by hardcoding 7.5.
  The consumer-side 5% service fee is settled and correct as it stands.

### 3.2 `company_users` — CompanyUser

```
id          uuid pk
company_id  uuid not null -> companies(id) on delete cascade
user_id     uuid not null -> profiles(id) on delete cascade
role        company_user_role not null
status      company_user_status not null default 'invited'
invited_by  uuid null -> profiles(id)
created_at / updated_at
unique (company_id, user_id)
```

Two roles only (spec §3). No permission matrix, no custom roles.

**Edge case §18 (operator removed):** disabling a user must not delete this row —
leads, bookings and conversations reference it. `status = 'disabled'` is the
removal mechanism; `on delete cascade` here is only for a real auth-user
deletion.

### 3.3 `mountains` — Mountain

```
id           uuid pk
slug         text not null unique
name         text not null
elevation_m  int null check between 0 and 9000
range        text null
country      text null
region       text null
content      jsonb not null default '{}'
created_at / updated_at
```

Seed from `icefall-web/src/data/peaks.ts` (52 peaks, already carries
`id`/`name`/`elevationM`/`range`/`country`/`region` — the slugs there should
become `mountains.slug` so the consumer surfaces keep resolving). Staff-writable
only; operators read.

### 3.4 `company_mountains` — CompanyMountain / Placement · **the authorization boundary**

```
id                 uuid pk
company_id         uuid not null -> companies(id)
mountain_id        uuid not null -> mountains(id)
commercial_status  commercial_status not null default 'active'
placement_position smallint null check (placement_position between 1 and 5)
start_date         date null
expiry_date        date null
assigned_at        timestamptz not null default now()
assigned_by        uuid null -> profiles(id)
created_at / updated_at
unique (company_id, mountain_id)
check (start_date is null or expiry_date is null or start_date <= expiry_date)
```

Requests on top of the columns:

- **Partial unique index preventing duplicate active occupancy:**
  `unique (mountain_id, placement_position) where commercial_status = 'active' and placement_position is not null`.
  Your brief requires the system to prevent two companies holding the same slot;
  this makes it impossible rather than validated.
- **No expiry trigger that reorders anything.** Spec §2 and §18, and your own
  worked example: at expiry the placement becomes Expired/Needs Review and the
  company *stays where it is* until an admin moves them. Please let expiry
  produce a notification row (§3.13) and nothing else. If a `pg_cron` job flips
  `commercial_status` to `'expired'` on `expiry_date`, that is fine — it must
  not touch `placement_position` or any other company's row.
- Grants: `select` to `authenticated`; **no `insert`/`update`/`delete`**. See
  §0.4.

### 3.5 `products` — Product (live/approved values)

```
id             uuid pk
company_id     uuid not null -> companies(id)
type           product_type not null
name           text not null
slug           text not null
status         publication_status not null default 'draft'
description    text null
duration_days  int null
difficulty     text null
max_altitude_m int null check between 0 and 9000
price_from_cents  bigint null check (>= 0)
price_to_cents    bigint null check (>= 0)
currency       text not null default 'EUR'
itinerary      jsonb not null default '[]'
equipment      jsonb not null default '[]'
inclusions     jsonb not null default '[]'
exclusions     jsonb not null default '[]'
faq            jsonb not null default '[]'
seasonality    text null
archived_at    timestamptz null
referral_pct_override numeric(5,2) null   -- staff-only, per your §22
created_at / updated_at
unique (company_id, slug)
check (price_from_cents is null or price_to_cents is null or price_from_cents <= price_to_cents)
```

- `max_altitude_m` matters: `icefall-web`'s `Expedition.maxAltitudeM` exists
  because an EBC trek tops out at 5,364 m, not Everest's 8,849 m. Keep it.
- Prices are nullable. An expedition is quoted, not priced off a card, and a
  missing price must render as absent rather than €0.
- **`archived_at` rather than deletion.** Spec §18: a message belonging to a
  deleted product must keep its history and show the historical product name.

### 3.6 `product_mountains` — ProductMountain

```
product_id  uuid not null -> products(id) on delete cascade
mountain_id uuid not null -> mountains(id)
is_primary  boolean not null default false
primary key (product_id, mountain_id)
```

**The rule I need enforced:** a product may only be attached to a mountain the
company holds an *active* `company_mountains` row for. Ideally a trigger or a
policy `with check (public.company_has_mountain(<product's company>, mountain_id))`.
Spec §2 rule 2, and it is one of my required tests.

### 3.7 `product_departures` — ProductDeparture

```
id             uuid pk
product_id     uuid not null -> products(id) on delete cascade
departure_date date not null
end_date       date null
availability   text null            -- 'available' | 'limited' | 'full' | 'unavailable'
spots_total    int null check (>= 0)
spots_left     int null check (>= 0)
price_cents    bigint null check (>= 0)
created_at / updated_at
check (end_date is null or departure_date <= end_date)
check (spots_left is null or spots_total is null or spots_left <= spots_total)
```

`spots_left` nullable and never defaulted to 0 — "not stated" and "sold out" are
different statements, and the app must be able to tell them apart.

### 3.8 `media_assets` — MediaAsset

```
id              uuid pk
company_id      uuid null -> companies(id)
product_id      uuid null -> products(id)
type            media_type not null
storage_path    text not null
mime_type       text not null
byte_size       bigint not null check (> 0)
width_px        int null
height_px       int null
alt_text        text null
approval_status publication_status not null default 'draft'
uploaded_by     uuid not null -> profiles(id)
created_at
check (num_nonnulls(company_id, product_id) = 1)
```

Two nullable FKs with a `num_nonnulls` check rather than a polymorphic
`owner_type`/`owner_id`, so referential integrity is real.

Spec §18 asks for type/size/dimension validation *before* submission. I will do
that client-side; a `byte_size` ceiling and a `mime_type` allowlist as CHECK
constraints would be a useful backstop. A Supabase Storage bucket + RLS policy
scoped to the company folder is also needed — happy to take whatever bucket
convention you prefer.

### 3.9 `content_versions` — ContentVersion · **the publication boundary**

```
id            uuid pk
entity_type   content_entity_type not null
entity_id     uuid not null
company_id    uuid not null -> companies(id)     -- denormalised, so RLS is one hop
version       int not null
base_version  int null
payload       jsonb not null                      -- CHANGED FIELDS ONLY
status        content_version_status not null default 'draft'
submitted_by  uuid null -> profiles(id)
submitted_at  timestamptz null
reviewed_by   uuid null -> profiles(id)
reviewed_at   timestamptz null
review_note   text null
created_at / updated_at
unique (entity_type, entity_id, version)
```

The parts that carry the workflow:

- **`payload` holds only the changed fields**, and approval applies it as a
  patch. This is what lets your Approval Center be "granular enough that one
  price edit does not force every other change back into review".
- **`base_version`** is the live version the operator started from. If it no
  longer matches at submission time, that is a conflict to show the operator —
  not an overwrite. Spec §18: *never silently lose edits*.
- **One pending submission per entity at a time**, via
  `unique (entity_type, entity_id) where status = 'pending'`. Spec §18 allows
  "merge or clearly serialize"; serialize is the honest one, and combined with
  field-scoped payloads it costs the operator nothing.
- **Per-field decisions**, if you want the granularity in the data rather than
  in the payload split — an optional child table:
  `content_version_fields (version_id, field_path text, decision text, note text)`.
  I can work with either; say which and I will build the operator side to match.
- `company_id` is denormalised on purpose so every policy on this table is a
  single membership test rather than a four-way join through `entity_type`.

**Promotion function.** One `SECURITY DEFINER` function, staff-only:

```
public.approve_content_version(v uuid, note text default null) returns void
public.reject_content_version(v uuid, reason text not null) returns void
public.request_content_changes(v uuid, note text not null) returns void
```

Reject must leave the live row untouched and store the reason (spec §8 step 9,
§20). All three timestamp and attribute the decision.

Operator-side grants: `insert`/`update` on own-company rows only while
`status in ('draft','changes_requested')`; a withdraw path
`pending → withdrawn → draft`. No operator write once `status = 'pending'`.

### 3.10 `threads` — Conversation (EXTEND, do not create)

Add to the existing table:

```
company_id   uuid null -> companies(id)
product_id   uuid null -> products(id)
mountain_id  uuid null -> mountains(id)
lead_id      uuid null -> leads(id)
source_page  text null
product_name_at_creation text null
```

- `product_name_at_creation` is the §18 requirement in a column: a conversation
  about an archived product still shows the historical name.
- `threads.kind` already exists from the chat migration — I need a value for an
  operator enquiry (`'operator_enquiry'`, or whatever you prefer).
- Operator visibility: a company user must be able to read threads for their own
  company. That is a *new* access path — today `threads_select` is
  `is_thread_participant(id) or is_admin()`. The clean version is to add the
  responding company user as a `thread_participant` when they open it, and widen
  `threads_select` with `public.is_company_member(company_id)` so an unopened
  enquiry is visible in the inbox before anyone has replied. Your call which.
- Spec §16: `Conversation` and `Lead` must stay linked. `threads.lead_id` plus
  `leads.thread_id` is a two-way link; if you prefer one direction, keep
  `leads.thread_id` and index it.

### 3.11 `leads` — Lead

```
id             uuid pk
company_id     uuid not null -> companies(id)
customer_id    uuid not null -> profiles(id)
thread_id      uuid null -> threads(id)
product_id     uuid null -> products(id)
mountain_id    uuid null -> mountains(id)
status         lead_status not null default 'new'
assigned_to    uuid null -> company_users(id)
booking_id     uuid null -> bookings(id)
source_page    text null
created_at     timestamptz not null default now()
contacted_at / qualified_at / quoted_at / booked_at / lost_at  timestamptz null
lost_reason    text null
updated_at
```

The five nullable timestamps are spec §10's "conversion timestamps" — they are
what makes the funnel measurable without recomputing from an event log.

`assigned_to` references `company_users`, not `profiles`, so an assignment
cannot survive the person leaving the company.

### 3.12 `bookings` — Booking

```
id                   uuid pk
lead_id              uuid null -> leads(id)
company_id           uuid not null -> companies(id)
product_id           uuid null -> products(id)
mountain_id          uuid null -> mountains(id)
booking_value_cents  bigint null check (booking_value_cents is null or booking_value_cents >= 0)
value_status         booking_value_status not null default 'pending'
currency             text not null default 'EUR'
booked_at            timestamptz not null default now()
attribution_status   attribution_status not null default 'icefall'
referral_pct_at_booking numeric(5,2) null
created_at / updated_at
check (value_status <> 'reported' or booking_value_cents is not null)
```

**This is the honesty doctrine as a constraint.** Spec §18: a booking may be
recorded without a value. `booking_value_cents` must therefore be nullable with
**no default of 0**, and `value_status` says *why* it is absent. The CHECK stops
`'reported'` from ever meaning "reported as nothing". Estimated GMV then sums
only `value_status = 'reported'` rows and states how many bookings it excluded,
rather than quietly treating unknowns as zero.

`referral_pct_at_booking` is the column that makes the deferred rate safe: with
the rate written onto the booking at conversion, the owner can settle 7.5% vs
10% whenever they like and no historical figure moves. It is your §22
requirement — *"preserve the exact rate
used at the time of conversion"*. It belongs on the record, written once at
booking, never looked up at read time. Yours to own; I only need it to exist so
the operator's own revenue view cannot drift when a rate changes.

### 3.13 `operator_notifications` — OperatorNotification

```
id              uuid pk
company_user_id uuid not null -> company_users(id) on delete cascade
company_id      uuid not null -> companies(id)
type            text not null
payload         jsonb not null default '{}'
created_at      timestamptz not null default now()
read_at         timestamptz null
```

Types needed by spec §12: `enquiry_new`, `message_new`, `lead_assigned`,
`lead_status_changed`, `booking_recorded`, `content_approved`,
`content_rejected`, `content_changes_requested`, `info_missing`,
`admin_message`, plus **`placement_expiring`** and **`placement_expired`** —
the reminder that spec §2 requires *instead of* an automatic reorder.

### 3.14 `conversation_notes` — internal sales notes (NOT in `messages`)

```
id          uuid pk
thread_id   uuid not null -> threads(id) on delete cascade
company_id  uuid not null -> companies(id)
author_id   uuid not null -> profiles(id)
body        text not null
created_at
```

Readable only by members of `company_id` and staff. Never by the customer, and
never in the realtime publication that `messages` is in. Spec §9.

### 3.15 `analytics_events` — the event layer

```
id           uuid pk
occurred_at  timestamptz not null default now()
event_type   text not null    -- 'listing_view' | 'enquiry_started' | ...
company_id   uuid null -> companies(id)
mountain_id  uuid null -> mountains(id)
product_id   uuid null -> products(id)
thread_id    uuid null -> threads(id)
lead_id      uuid null -> leads(id)
source_page  text null
visitor_hash text null
```

Spec §11 asks that mountain-level and product-level performance can be added
later without redesigning the dashboard — hence the nullable dimension columns
on every row rather than a pre-aggregated table.

**A dependency I want on the record:** nothing currently emits `listing_view`.
Until `icefall-web` and `icefall-app` write these rows, **Views is unavailable,
not 0**, and my analytics screen will say so. I am not going to render a view
count ICEFALL did not measure. If you agree the shape, I will file a separate
request to Sessions 01/02 for the emit call.

---

## 4. Authorization helpers

Same style as `is_admin()` / `is_thread_participant()`: `SECURITY DEFINER`,
`stable`, `set search_path = public, pg_temp`, `coalesce(..., false)`, taking an
id and returning a yes/no.

```
public.my_company_id()                         returns uuid
public.is_company_member(c uuid)               returns boolean
public.is_company_admin(c uuid)                returns boolean
public.company_has_mountain(c uuid, m uuid)    returns boolean
```

`company_has_mountain` must require `commercial_status = 'active'` — that is
what makes spec §18's "operator loses access to a mountain" work: historical
records stay readable, new edits stop.

`is_company_admin` is the only one that distinguishes the two roles. Sales
Employee gets conversations, leads, notes and read-only product context (spec
§3); Company Admin additionally gets company profile, products, media,
certifications and staff management.

---

## 5. RLS shape I am building against

| Table | Operator SELECT | Operator WRITE |
|---|---|---|
| `companies` | own company | **none** (via `content_versions` only) |
| `company_users` | own company | Company Admin: invite/disable within own company |
| `mountains` | all | none |
| `company_mountains` | own company | **none** — §0.4 |
| `products` | own company | **none** (via `content_versions` only) |
| `product_mountains` | own company | insert/delete gated on `company_has_mountain` |
| `product_departures` | own company | own company (or via versions — your call, see below) |
| `media_assets` | own company | insert own; delete own while `draft` |
| `content_versions` | own company | insert/update own while `draft`/`changes_requested` |
| `threads` | own company | reply as participant (existing policy) |
| `messages` | existing policy | existing policy — insert only |
| `conversation_notes` | own company | own company |
| `leads` | own company | own company |
| `bookings` | own company | **none** — staff-recorded |
| `operator_notifications` | own rows | update `read_at` on own rows |
| `analytics_events` | none (read through an aggregate view) | none |

**`product_departures` — ANSWERED BY THE OWNER, 2026-08-28.**

> **Provenance** (added after the brain queried this line, and it stands).
> Session 04 put this to the product owner directly, in session, as a product
> question with three options. The owner selected **"Spaces instant, rest
> approved"**, described to them as: *"3 spaces left" and "full" update the
> moment the company changes them; price changes, and adding or removing a
> departure date, still wait for Icefall approval.* The other two options
> offered were "everything waits for approval" and "all dates and spaces
> instant". This was not relayed from another session and is not an inference.
>
> **Settled: this is now constitution §6 decision 12**, after the owner
> confirmed it directly to the brain as well. Nothing here needs re-checking.
> The episode is written up in §6b — an absence in the central record means
> "not yet reported", never "did not happen".

The question was
whether departures go through `content_versions` like the rest of product
content. Spec §7 lists "Dates / departures" as editable and §6 says availability
changes go "through pending edits", which argued for versioning — but an
operator marking a departure full on a Tuesday and waiting for ICEFALL approval
is an operational trap, and the climber who enquires on a sold-out trip in the
meantime is the one who pays for it.

**The decision: split the table's write path.**

| Column | Write path |
|---|---|
| `availability`, `spots_left`, `spots_total` | **Direct write**, own company, no approval |
| `price_cents`, `departure_date`, `end_date`, row INSERT/DELETE | **Through `content_versions`** |

Rationale the owner endorsed: availability is a fact about the operator's own
logistics and going stale hurts the climber; price and the existence of a
departure are advertised claims, and they are the two things an operator has
most reason to overstate.

Implementation ask: column-level privileges rather than a policy —
`grant update (availability, spots_total, spots_left) on public.product_departures to authenticated`,
with the row policy restricting to own company, and **no update grant on the
price or date columns**. Same reasoning as §0.3: the boundary should be a
privilege, not a screen remembering to behave.

Test 18 for §7: *an operator can update `spots_left` on its own departure, and
the same statement updating `price_cents` is rejected.*

---

## 6. The "no customer escape routes" rule at the database layer

Spec §2 and §5 forbid phone numbers, email addresses, WhatsApp handles and
direct booking links in public-facing operator content. §3.1 removes the
*columns*; the free-text fields (`description`, `about`, `faq`, product
`description`, `itinerary`) are the remaining hole.

I will validate on submit in the operator UI, and it should also be a rejection
reason in your Approval Center. If you want a backstop in the database, an
`immutable` helper —

```
public.looks_like_contact_details(t text) returns boolean
```

— matching email, `+NN` phone runs, `wa.me`, `t.me` and bare external URLs,
applied as a CHECK on the live content columns, would make it structural. It is
a heuristic and it will have false positives, so it is your call whether it
belongs in the schema or only in review. I am not asking for it as a blocker.

---

## 7. Tests I am relying on (`icefall-supabase/tests/`)

The harness already runs every migration through PGlite and asserts attack
cases. These are the ones the Operator CRM's acceptance criteria (spec §20) rest
on. Happy to write them and hand them to you if that is easier than specifying
them.

1. **Operator A cannot SELECT company B's `companies` row.**
2. **Operator A cannot SELECT company B's products, leads, bookings, threads,
   conversation_notes or media.**
3. **Operator A cannot UPDATE its own `company_mountains.placement_position`** —
   the single most important test in this system.
4. Operator A cannot UPDATE another company's placement either.
5. **Operator A cannot UPDATE `companies` or `products` directly** — live
   content only moves through an approved `content_version`.
6. A `pending` content version cannot be edited by the operator who submitted
   it.
7. Rejecting a version leaves the live row byte-identical.
8. Approving a version applies only the fields in `payload`.
9. Two pending versions for the same entity cannot both exist.
10. **A product cannot be attached to a mountain the company has no active
    `company_mountains` row for.**
11. When `commercial_status` goes to `'expired'`, existing products and leads
    remain readable and no other row's `placement_position` changes.
12. Two active placements cannot hold the same `(mountain_id, position)`.
13. A Sales Employee cannot edit the company profile or products.
14. A Company Admin cannot invite a user into another company.
15. A customer cannot read `conversation_notes` on a thread they are in.
16. A disabled `company_user` loses all company access but their `leads` and
    `bookings` rows survive.
17. `anon` can read nothing on any of these tables.

That last one has a corollary worth raising: **the foundation migration gives
`anon` nothing, and the consumer app has to render approved company and product
pages to signed-out visitors.** Public read of *live* content is a schema
decision I don't own — either a narrow `anon` SELECT on
`status = 'live'` rows, or a server-side read. Flagging it rather than assuming.

---

## 8. What I will do while this is open

Build the operator portal shell, routing, the two-role model, design system and
every screen against a **typed local adapter** with an interface that matches
this document exactly — one module, one seam. When the migration lands, the
adapter's implementation is swapped for Supabase queries and nothing else moves.
Seed data will use fictional company names only (owner decision #2).

I will not write a migration, and I will not build against a schema you have not
confirmed.

**What would unblock me fastest, in order:** §1 (the two names), §5's
`product_departures` question, and §0.1 (whether `operator_profiles` is being
backfilled or kept).

— Session 04
