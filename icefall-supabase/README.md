# ICEFALL — database

Schema, row-level security policies and security tests for ICEFALL. **Shared by
two applications**, which is why it lives here rather than inside either one:

| App | Role | Reads this database as |
|---|---|---|
| `icefall-app/` | the athlete-facing product | `athlete`, `guide`, `operator` |
| `icefall-crm/` | ICEFALL's internal business CRM | `admin` + a `staff_members` row |
| `icefall-operator/` | the operator self-service portal | `operator`, via `company_users` |
| `icefall-admin/` | the older staff back office (reference only) | `admin` |

## What exists so far

`20260817120000_icefall_foundation.sql` — identity, roles and the messaging
spine:

- `profiles` — one row per auth user, carrying the role
- `guide_profiles` / `operator_profiles` — provider detail, hidden until `listed`
- `threads`, `thread_participants`, `messages` — private correspondence

## The rule this schema exists to enforce

A thread between an athlete and a guide holds that person's plans, their dates
and their own assessment of their ability. Access is granted **only** through
membership of a thread. There is no "any authenticated user can read messages"
policy anywhere in the migration, and none may be added.

Messages have **no UPDATE and no DELETE policy for anyone, including admin**. A
message is a record of what was said; letting either side rewrite it after the
fact would matter most to the athlete, who is the party with less power in a
commercial conversation.

### The commercial system

Eight migrations add the marketplace and the money: staff
desks, an audit log, companies, mountains, paid placements, products, media, the
content-approval boundary, then leads, bookings, commissions, revenue, internal
sales notes and the analytics event log.

Six invariants across those files are load-bearing, and each is enforced a level
below the application:

- **`audit_events` is append-only for everyone.** No UPDATE or DELETE policy
  exists, and a trigger refuses both even from the service role. A correction is
  a new event. Dropping those two triggers is the deliberate act that makes the
  log editable.
- **`placements` is SELECT-only at the privilege layer, staff included.** Every
  write goes through `create_placement`, `move_placement`, `set_placement_terms`
  or `cancel_placement`, each of which records its own audit event in the same
  statement. A policy can say who may write; it cannot make the writer also
  record what they did.
- **Expiry is derived, never stored.** `placements.status` holds only what an
  administrator set; `placement_status` computes `expired` at read time. Nothing
  writes to the table on a timer, so no background job can move a company out of
  position #1. A placement past its term keeps its slot until a person acts.
- **A live product cannot be updated by its operator at all.** The UPDATE
  policy's `USING` clause matches only `status = 'draft'`. Live content moves
  exclusively through an approved `content_versions` patch.

- **The commission engine refuses to invent a rate.** No default rule is seeded,
  and `record_commission` raises rather than falling back to a constant — the
  referral rate is an open owner decision. It also refuses a booking whose value
  is not recorded, because a fee computed on an absence is a fabricated fee.
- **A commission copies the whole applied rule and then freezes.** Rate, fixed
  fee, floor and cap are all written onto the record at conversion, never looked
  up at read time, and a trigger blocks changing any of them once the booking
  completes. Changing a rate afterwards moves nothing that was already earned —
  and deleting the rule nulls `rule_id` while leaving the figures standing.

- **There is no outstanding-balance column, and there must not be one.** An
  invoice balance is `total − payments − credit notes`, derived by the
  `invoice_balances` view every time it is read. A stored balance can disagree
  with its own components, and worse, it defaults: a company with no invoices
  would read €0.00 outstanding, which says they owe nothing rather than that
  nothing has been billed.
- **A payment is a staff member's assertion, not a processor's confirmation.**
  No payment provider exists anywhere in ICEFALL. `payments.recorded_by` is NOT
  NULL and the table has no INSERT grant — `record_payment` is the only route,
  and it writes the audit event in the same statement.
- **A refund is a credit note with a mandatory reason, never a negative
  payment.** Every money column in the family is `check (>= 0)` because a sign
  error in a marketplace ledger is silent and compounds.
- **An expiry date cannot be stored without saying where it came from.**
  `verification_documents.expiry_source` is `printed_on_document` or
  `stated_by_holder`. A document with no expiry renders "not recorded" — never
  "expired" — and the expiry sweep skips it rather than raising a task nobody
  can act on.

- **The customer opens every conversation.** A guide or operator may reply but
  may never send the first message in a thread (owner decision 19). Party chat,
  athlete-to-athlete threads and ICEFALL staff are unaffected. This replaced a
  documented paid-booking gate that would have frozen every lead at `new`.
- **A content version can only name its own company's record.** `company_id` and
  `entity_id` are both supplied by the operator, and binding them is what stops
  one company submitting an edit against a competitor's live listing. Checked at
  submission AND again at approval, because a version can outlive the validator.

Two honesty constraints worth knowing before writing an INSERT: a company cannot
be `verified` without a real reviewer and a real `documents_checked_at`, and a
product whose `price_state` is not `known` cannot carry a price at all. Both are
CHECK constraints — the fabrication is unstorable, not merely discouraged.

`20260825120000_waitlist.sql` — the pre-launch signup list written by
`icefall-web`. **Insert-only to the public:** anyone may add themselves, and
nobody reachable from a browser can read, change or delete a row. Both the RLS
policies and the table grants are locked down, because Supabase's default
privileges hand `anon` full access to every new table in `public` and leaving
either one out publishes the list. Reading it is a service-role operation.

`guide_profiles.credentials_verified` carries a `CHECK (= false)`. ICEFALL
verifies nothing today, and a tick beside "IFMGA" is the whole of what stops a
client asking to see the carnet. Dropping that constraint is the deliberate act
that turns verification on.

## Tests

The policies are tested by attacking them — an outsider trying to read a private
thread, a participant trying to forge a message in someone else's name, a user
trying to promote themselves to admin. They run on PGlite (real Postgres,
compiled to WASM), so no Docker and no local Postgres are needed:

```bash
cd icefall-supabase && npm install && npm test
```

Five suites, **263 checks**, all of which must stay green:

| Suite | What it does |
|---|---|
| `tests/rls.test.mjs` | 31 attacks on the messaging and waitlist policies |
| `tests/crm.test.mjs` | 77 attacks on the marketplace, the media convention, the expiry sweep and the sales pipeline — one operator reaching another, an operator publishing its own content, two companies in one paid slot, a staffer editing the audit log, a Sales Employee editing the catalogue |
| `tests/commercial.test.mjs` | 53 checks on the money layer — rate preservation across a rate change, rule precedence and effective dating, a booking with no value, internal notes hidden from the customer, operator isolation extended to leads, bookings, commissions and revenue |
| `tests/finance.test.mjs` | 38 checks on invoicing, payments, credit notes, verification documents and support — the arithmetic that decides what a company owes, and the isolation that stops one operator reading another's arrears |
| `tests/seed.test.mjs` | 17 checks that the seed still satisfies its own constraints |

The one to protect above the others: *"changing the rate does not rewrite
historical revenue."* That failure does not throw, does not render wrong and does
not show up in a browser — it quietly restates what the business earned last
quarter, and nobody finds it by looking.

Run it after any change to a migration — a policy edit that quietly opens the
message store, or a company's commercial position to a competitor, would
otherwise be invisible.

## Seed data

```bash
psql "$DATABASE_URL" -f icefall-supabase/seed/crm_seed.sql
```

Applied deliberately, never bundled into an application. Every company in it is
invented — attaching invented prices and placements to a real operator is a live
exposure, and the product owner has ruled fictional names everywhere. The
mountains are real, keyed by the slugs the consumer apps already use. Nothing in
the seed is verified and no referral rate appears in it: that rate is still an
open decision, and a plausible-looking placeholder is how an unmade decision
starts being quoted back as a made one.

## Applying it

You need a Supabase project. Create one at
[supabase.com/dashboard](https://supabase.com/dashboard), then from the repo
root:

```bash
cd icefall-supabase && supabase link --project-ref YOUR_PROJECT_REF
```

```bash
cd icefall-supabase && supabase db push
```

Then put the project's URL and publishable (anon) key into **both** apps:

```bash
printf 'VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY\n' > icefall-app/.env.local
```

The variable is `VITE_SUPABASE_PUBLISHABLE_KEY`, not `..._ANON_KEY` — the wrong
name fails silently rather than erroring.

## Promoting a user

Signing up always creates an `athlete`. Staff and providers are promoted
deliberately, never by registering — run this in the SQL editor:

```sql
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
```
