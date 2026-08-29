# Session 05 — ICEFALL Guide App

> **Read `icefall-sessions/00-CONSTITUTION.md` first.** It holds the honesty
> doctrine, the standing rules, the anti-drift protocol and the product owner's
> decisions. This brief only covers what is specific to your scope.

## Your scope

**`icefall-guide/` and nothing else.** Dev server: launch config
**`icefall-guide`**, port **5193**. This is the phone app *for guides* — the
professional on the other side of the marketplace from the athlete.

It is built in the phone app's own idiom: dark, cinematic, `PhoneShell`, the
same design tokens as `icefall-app`. It already exists as a shell (Auth, Today,
Openings, Enquiries, Profile, Verification, Payouts). Your job is to make it a
real, focused tool — not to redesign the athlete app.

## What the owner asked for, in their words

> "the same as phone app but focused for the guides — show them stats like
> bookings, page views, dates available, etc."

So the guide opens this app to answer, at a glance:
- **What have I earned and what is coming?** Confirmed bookings, upcoming
  departures, payouts due.
- **Who wants me?** Enquiries waiting on a reply, and how long they have waited.
- **How am I doing on the marketplace?** Profile views, enquiry count, how many
  turned into bookings — the guide's ROI on being listed with ICEFALL.
- **When am I free?** Availability / open dates they can edit.

This is the guide-facing twin of the operator portal's dashboard. Study
`icefall-operator/src/screens/Dashboard.tsx` — a guide is an individual, not a
company, but the *shape* of "what has ICEFALL done for me, and what do I owe
someone a reply on" is the same, and the honesty rules are identical.

## THE HONESTY DOCTRINE APPLIES IN FULL — and hits hardest on the stats

Every number on this screen is a claim about the guide's own livelihood, so it
must be measured or it must not appear.

- **Page/profile views: not measured yet.** Nothing in the family emits a
  `listing_view` event — this is documented across `00-CONSTITUTION.md` §6d and
  the operator portal's own `viewsReading()`. So a "profile views" tile must show
  the honest **"not counted yet"** state, exactly as the operator portal does, and
  NOT a fabricated number. When a trusted (server-written) view count exists, it
  fills in. Copy the operator portal's three-state reading — it already draws the
  right line, and §6d explains why a client-written count is forgeable.
- **A booking with no value is Pending/Unknown, never €0** (the schema enforces
  this — `bookings.value_state`).
- **No conversion rate without a denominator** — unavailable, not 0%.
- **Earnings shown are what the ledger records, floored in the guide's favour**
  (`money.ts`, `GUIDE_COMMISSION_PCT = 10`, deducted). Never recompute a
  commission locally — import the shared model; §6g, "importing the constant
  protects the rate, not the rule".
- **Verification is "documents checked by ICEFALL"**, never an implication the
  issuing association was contacted. A guide credential carries a literal
  `verified: false` until a server sets it.

## The backend, and how you connect

There is **no live backend yet** (no Supabase project provisioned). Like every
other app, you run on local/seeded data until one exists, and `null` is a
supported state, not a bug. **Copy `icefall-app/src/backend/client.ts`** — it is
the canonical seam: `isBackendConfigured()` returns false, the app runs on
localStorage, and the day a project exists it goes live with two env vars.

**The key name is `VITE_SUPABASE_PUBLISHABLE_KEY`, never `..._ANON_KEY`** — the
wrong name resolves to `undefined` and fails silently.

## Your dependency on Session 03

**You do not own the schema.** Session 03 owns `icefall-supabase/migrations/`.
The schema already has `guide_profiles`, guide bookings, guide commissions and
the verification model. Read them — do not assume shapes. If you need a table,
column, view or read path that does not exist, **file a request in
`icefall-sessions/requests/`** and tell the brain; never write a migration.

Session 03 is also building the family's live integration layer (auth, and the
web-live / app-scheduled propagation — decision 20). Your app is one of the
consumers. When you need the guide's real bookings/availability/views, they come
through that layer; until it is live, seed them locally behind the demo flag.

## Seed data — demo flag, fictional guides only

Any populated screen you build for the owner to judge uses the doctrine's fourth
tier: one named flag (`VITE_SHOW_DEMO`), gated at definition so an ordinary build
carries none of the strings, a banner on every screen, a delete-this note.
**Fictional guide names only** — the same rule that took the four real company
names out (decision 2). And the demo precondition (§7.5) is non-negotiable:
`VITE_SHOW_DEMO=1` only on a deployment Deployment-Protection actually refuses.

## Register — this is the athlete's dark app, not a CRM

Decisions 9 and 18 made both CRMs light. The guide app is NOT a CRM — it is a
phone app a professional carries, the athlete app's twin. It stays **dark and
cinematic**, azure accent, `PhoneShell`, the phone app's tokens. Gilt (§6.10)
does not apply inside it the way it does not apply inside the operator portal —
in a guide's own tool every screen is their business; the useful axis is *what
the guide controls* (azure) versus *what ICEFALL controls* (locked), exactly as
Session 04 reasoned for the operator portal.

## Verify

```bash
cd icefall-guide && npx tsc --noEmit
```
Then open it in the browser — "verified" means looked at. Never run
`npm run build` while the dev server runs; never start a dev server from Bash
(use the launch config); never deploy or commit without an explicit go-ahead.

Report to the brain when a screen renders, with what you verified in a browser
rather than by typecheck.
