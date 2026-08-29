# Session 03 — ICEFALL Internal Business CRM (`icefall-crm/`)

> **Read `icefall-sessions/00-CONSTITUTION.md` first.** It holds the honesty
> doctrine, the standing rules, the anti-drift protocol and the owner's
> decisions. This brief only covers what is specific to your scope.

## Your scope

**A NEW project: `icefall-crm/`, port 5197.** It does not exist yet — you are
creating it. It is connected to ICEFALL through the shared backend, not carved
out of an existing app.

**Source of truth:** `~/Downloads/ICEFALL_INTERNAL_BUSINESS_CRM_CLAUDE_CODE_SPEC.pdf`
(13 pages, 30 sections). Read it in full before writing code. This brief
orients you; the spec decides.

### You are the backbone of all four sessions

You own two shared assets that everyone else depends on:

| Asset | Your duty |
|---|---|
| `icefall-supabase/migrations/*` | **You are the sole owner of the schema.** Sessions 01, 02 and 04 file requests in `icefall-sessions/requests/`; you design and write the migrations. 31 RLS attack tests currently pass (`npm test`) and must keep passing. |
| `icefall-shared/money.ts` | The one canonical commission model. 58 assertions pass. Edit the source here, then run `npm run sync` — it copies the file verbatim into the consuming apps. **Never let anyone hand-edit `src/money/model.ts`.** |

Check `icefall-sessions/requests/` at the start of every working session.

## What this system is

> *Icefall controls the marketplace; operators control their own content;
> Icefall controls approval, placement and commercial attribution.*

The internal operating system for running ICEFALL's commercial marketplace — the
operational source of truth for every commercial relationship between ICEFALL,
expedition companies, guides and customers. It is private, staff-only, and must
never leak internal commercial information to an operator.

**Architecture:** one shared backend, two internal interfaces. You are the
staff-facing one; Session 04 builds the company-facing one. The internal CRM
must see *the same record* the operator is editing, plus internal-only fields
and controls. **Do not duplicate operator or product data — you manage it.**

## 15 modules

Overview · Companies · Sales Pipeline · Mountains & Placements · Products ·
Approvals · Leads · Bookings · Revenue · Guides · Support · Analytics · Tasks ·
Audit Log · Settings — across 21 `/admin/*` routes.

Explicitly **out of scope**: consumer app design, the AI Coach, activity
tracking, a full accounting/ERP replacement, and **automatic marketplace
ranking**.

## The machinery that actually matters

**Mountain & Placement Manager.** Paid positions **#1–#5**, manual assignment
only. The system must prevent duplicate active occupancy. **If a slot expires,
flag it — never auto-reassign.** Worked example from the spec: Elite Expeditions
→ Everest → #1 Featured → 01–30 Sep. At expiry the placement becomes
Expired/Needs Review, but **Elite stays #1 until an admin moves them.** Every
position change writes an audit event with old position, new position, actor and
timestamp.

**Content Approval Center.** The moderation layer between operator editing and
public publication. Queue, filters, **live-vs-proposed comparison**, media
preview, approve / reject / request-changes with a stored reason, preserved
version history. Must be granular enough that one price edit does not force
every other change back into review.

**Commission engine (§22) — configurable, never hard-coded.** Default referral
**7.5%**, company override (Elite → 6%), product override, a separate guide rate,
optional min/max, effective dates.

> **The system must preserve the exact rate used at the time of conversion so
> later rate changes do not rewrite historical revenue.**

That sentence is the whole design. Store the rate *on the commission record*,
not by looking it up at read time.

**Revenue ledger.** Four separate streams — placement fees, referral fees, guide
commissions, consumer subscriptions — plus MRR/ARR, GMV, collected vs
outstanding, and revenue by mountain / operator / product type / source. This is
a commercial ledger and a management view, **not** accounting software.

**Audit log.** Actor, timestamp, action, entity type, entity id, previous value,
new value, optional reason. Every commercially meaningful action.

**Five internal roles:** Super Admin, Sales, Operations, Finance, Support.
Role-based, but keep the UX simple — the goal is safe separation, not enterprise
complexity.

## Data model

```
Company → CompanyUser → Placement → Mountain → Product → Lead → Conversation
        → Booking → Commission → RevenueRecord
```
Plus `Approval` (belongs to changed entity + submitted version + reviewer) and
`AuditEvent` (belongs to actor + affected entity). Normalised — one piece of
information must not be duplicated across company, mountain and product pages.

## Build order (spec §27 — do not start with cosmetic dashboard work)

1. **Foundation** — auth, roles, layout, navigation, **database schema, audit infrastructure**
2. **Companies** — records, users, profile data, search, detail pages
3. **Mountains & placements** — inventory, placement records, #1–#5 manager, expiry logic, audit
4. **Products** — expedition/trek records, mountain relationships, operator ownership
5. **Approval engine** — pending versions, review queue, media review, decisions
6. **Sales CRM** — 10-stage pipeline (Prospect→Lost), deals, tasks, contracts, renewals
7. **Messaging + leads** — conversation links, automatic lead creation, lifecycle
8. **Bookings + commissions** — attribution and the configurable commission engine
9. **Revenue** — financial records, invoice/payment status, dashboard
10. **Support + verification** — tickets, disputes, documents, expiry alerts
11. **Analytics** — events, reporting, operator ROI, executive dashboard
12. Remaining polish

## Before you write any code

1. Read the spec in full.
2. **Mine `icefall-admin/` for patterns, then leave it alone.** It is ~1,640
   lines across 9 screens (Dashboard, Deals, Conversations, Contacts, Partners,
   Verification, Transactions, Referrals, Settings) and maps onto roughly **5 of
   your 15 modules**. It already has a commission concept —
   `totalsFor(quote, commissionPct)`. But **it has no data layer at all**:
   everything reads 203 lines of hardcoded demo data, and the Deals board's
   drag-and-drop resets on reload because there is nowhere to persist to. It is
   reference material and a source of UI patterns, **not the thing to build in**.
3. Read `icefall-supabase/migrations/` — three migrations exist
   (foundation, chat, waitlist) with full RLS. Deliberate invariants you must
   preserve: **no UPDATE/DELETE policy on messages for anyone, including admin**;
   `guide_profiles.credentials_verified` carries `CHECK (= false)`, so removing
   that constraint is the deliberate act that turns real verification on; signup
   always creates an `athlete`, never a higher role.
4. Reuse ICEFALL's design tokens (Session 01 owns them) — but note `icefall-admin`
   is deliberately light, dense and data-forward so **nobody mistakes a staff
   screen for a customer one.** Keep that distinction.

## Honesty rules that apply to a CRM

The doctrine is not only for the consumer app:
- **A booking may be recorded without a value** — mark revenue Pending/Unknown
  rather than inventing a figure or defaulting to 0.
- **Do not seed real company names.** Owner decision #2 — fictional names only,
  in seed data too.
- **A conversion rate with no denominator is not 0%** — it is unavailable.
- Verification is **"documents checked by ICEFALL"**, never an implication that
  the issuing association was contacted. Never a fabricated check date.
- Alerts may notify, but **no automated action may alter a marketplace placement
  without an administrator.**

## Seed data requirement
≥3 companies, 5 mountains, placements covering #1–#5, and leads at every stage.
Fictional names.

## Verify
```bash
cd icefall-crm       && npx tsc --noEmit
cd icefall-supabase  && npm test   # 31/31 must still pass after any migration
cd icefall-shared    && npm test   # 58/58 must still pass after any money.ts edit
```
Write automated tests for authorization, publication state, placement occupancy
and commission-rate preservation. Unlike the front-end apps, this system holds
money — it earns tests.
