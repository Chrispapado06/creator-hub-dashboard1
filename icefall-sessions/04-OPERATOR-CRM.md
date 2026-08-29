# Session 04 — ICEFALL Operator CRM (`icefall-operator/`)

> **Read `icefall-sessions/00-CONSTITUTION.md` first.** It holds the honesty
> doctrine, the standing rules, the anti-drift protocol and the owner's
> decisions. This brief only covers what is specific to your scope.

## Your scope

**A NEW project: `icefall-operator/`, port 5196.** It does not exist yet — you
are creating it. It is connected to ICEFALL through the shared backend, not
carved out of an existing app.

**Source of truth:** `~/Downloads/ICEFALL_OPERATOR_CRM_CLAUDE_CODE_SPEC.pdf`
("System A", 8 pages, 22 sections). Read it in full before writing code. This
brief orients you; the spec decides.

**Nothing of this exists yet.** Verified: no `/operator/*` routes anywhere in the
family, and no `ContentVersion`, `PendingChange` or `approvalStatus` symbol in
any ICEFALL source or migration. Roughly **1 of the spec's 13 entities** exists
partially — `public.operator_profiles` in the foundation migration, 11 columns,
with no CompanyUser, no CompanyMountain, no products, no placements, no
versioning.

## What this system is

A **self-service portal for expedition and trekking companies**, deliberately
simple. Operators manage their own public-facing company and product information
and talk to customers inside ICEFALL. **ICEFALL retains final approval and all
control over commercial mountain placement.**

The dashboard should answer one question immediately:
> *"How is Icefall performing for my company, and what do I need to respond to today?"*

**Explicitly not in scope:** consumer app UX, internal ICEFALL ranking controls,
accounting, complex enterprise permissions. Do not invent operator enterprise
features.

## The non-negotiable business rules (spec §2)

These are the product. Every one of them is a rule your code must enforce, not a
guideline:

1. Operators edit **only** their own company and products.
2. Operators may only manage mountains/products **ICEFALL has assigned them
   commercially**. `CompanyMountain` is the authorization boundary.
3. **Operators cannot choose, change or negotiate their ranking position.**
   `placementPosition` is read-only to operators, writable only by ICEFALL staff.
4. **Operator edits are never immediately public.** They enter a pending state
   and require ICEFALL approval. The existing approved version **stays live**
   while a new version awaits review. `ContentVersion` is the publication
   boundary.
5. **Customer communication stays inside ICEFALL.** No phone numbers, email
   addresses, WhatsApp handles or direct booking links in public-facing operator
   content. The purpose is to keep enquiries and attribution in-platform.
6. One company → many mountains; many products per mountain.
7. Two roles only: **Company Admin** and **Sales Employee**. Keep permissions
   simple — no configurable matrix.
8. When a placement expires, create a reminder — **never automatically reorder
   the mountain.**
9. Every significant approval or placement change must be auditable.

## 15 routes

```
/operator/dashboard              Overview and daily actions
/operator/company                Company profile
/operator/mountains              Assigned mountains
/operator/mountains/:id          Mountain-specific workspace
/operator/products               All expeditions/treks
/operator/products/new           Create product
/operator/products/:id           Product detail/edit
/operator/products/:id/preview   Preview before submission
/operator/inbox                  Customer conversations
/operator/inbox/:id              Conversation + lead context
/operator/leads                  Lead list
/operator/leads/:id              Lead detail
/operator/analytics              Performance
/operator/team                   Staff management
/operator/settings               Account settings
```

## 13 entities

`Company` · `CompanyUser` · `Mountain` · `CompanyMountain` · `Product` ·
`ProductMountain` · `ProductDeparture` · `MediaAsset` · `ContentVersion` ·
`Conversation` · `Message` · `Lead` · `Booking` · `OperatorNotification`

**Shared-backend rules:** one canonical `Company` record and one canonical
`Product` record — never a separate copy for the public profile and the operator
portal. The operator portal edits through pending versions; the public app reads
the approved/live version. `Conversation` and `Lead` must stay linked so
communication and commercial attribution cannot become detached.

## The approval workflow — build this correctly first

1. Operator opens company profile or product
2. Edits fields / uploads media
3. Saves **Draft**, or submits for review
4. Submission creates a **Pending Change** record
5. **Current Live version stays public**
6. ICEFALL admin reviews it in the internal CRM (Session 03)
7. Admin chooses Approve / Reject / Request Changes
8. Approve promotes pending → Live
9. Reject leaves Live unchanged and records the reason
10. Request Changes returns it to the operator with a note
11. All decisions timestamped and attributable

On edit screens the **Save Draft vs Submit for Approval** distinction must be
obvious. For rejected content, show ICEFALL's reason next to the affected item.
Status chips: Live · Draft · Pending Approval · Rejected · Expired.

## Lead pipeline

`New → Contacted → Qualified → Quoted → Booked / Lost`

Each lead stores: customer, company, mountain, product, source page, created
date, assigned sales user, status, notes, booking value if known, conversion
timestamps.

## Analytics — keep it simple and tied to operator ROI

Views · Enquiries · Qualified · Bookings · Conversion rate · Estimated GMV ·
week/month trend. Build the event layer so mountain-level and product-level
performance can be added later without redesigning the dashboard.

## Your dependency on Session 03

**You do not own the schema.** Session 03 owns `icefall-supabase/migrations/`.
Your entities are the largest schema request in the project — file it early and
in detail:

> `icefall-sessions/requests/NN-operator-<topic>.md`

Then tell the product owner it is there. Do not write migrations yourself, and
do not build against a schema you have assumed. Sessions 03 and 04 are two
interfaces onto **one** backend; if you each invent a `Company` table the whole
architecture is lost.

Session 03 builds the *other* half of your approval workflow (the Approval
Center) and the placement manager that decides what you are allowed to edit.
Coordinate on entity shapes before either of you commits to one.

## Honesty rules that apply here

- **A booking may be recorded without a value** — Pending/Unknown, never 0.
- **Do not seed real company names.** Owner decision #2 — fictional only.
- Conversion rate with no denominator is unavailable, not 0%.
- Analytics must show what ICEFALL actually measured. An operator making
  commercial decisions on invented view counts is the same failure as an athlete
  making mountain decisions on invented readiness.
- Verification is "documents checked by ICEFALL", never an implication that the
  issuing association was contacted.

## Edge cases the spec calls out (§18)

- Operator submits a change while another is pending → merge or clearly
  serialize; **never silently lose edits.**
- Placement expires while the operator still has products → products remain,
  placement state becomes Expired until ICEFALL renews.
- Operator loses mountain access → preserve historical product/lead records,
  prevent new edits.
- Operator removed → retain leads, bookings, conversations, audit records.
- Message belongs to a deleted product → keep history, show the historical name.
- Unsupported media → validate type, size and dimensions before submission.

## Build order (spec §19)

1. Inspect the existing repo — routing, auth, schema, UI components, design
   tokens — **before changing anything**
2. Create/extend shared Company, CompanyUser, Mountain, CompanyMountain, Product
3. Operator auth + the two-role model
4. Dashboard → 5. Company profile → 6. My Mountains + access rules →
   7. Product CRUD → 8. Draft/pending/live versioning + media →
   9. Inbox + conversation-to-lead linking → 10. Lead pipeline →
   11. Analytics → 12. Notifications → 13. Connect live records to the consumer app
14. Automated tests for **authorization, publication state, mountain assignment,
    messaging and lead attribution**
15. Verify the consumer apps have not regressed

## Where you plug into the existing product

`icefall-web`'s 252 treks all carry `operatorIds: []` and `guideIds: []`. The
relations are already derived (`operatorsForTrek`, `treksForOperator`) — they
need *data*, not code. That is your seam: when a real operator lists a trek, that
array fills. Coordinate with Session 02 before changing anything in their tree.

`icefall-guide/` is a different product — an *individual guide's* phone app
(Today queue, Openings, Enquiries, Verification, Payouts). It is guide-shaped,
not company-shaped: no company/staff roles, no products, no mountain assignment,
no versioning. Useful as a reference for the inbox and verification screens.
**Do not build in it.**

## Verify
```bash
cd icefall-operator && npx tsc --noEmit
```
Plus the authorization tests above. The single most important test in this
system: **an operator cannot read or write another company's data, and cannot
change its own placement position.**
