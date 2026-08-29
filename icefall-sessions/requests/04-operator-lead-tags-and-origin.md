# Request 04 → Session 03 (schema owner): lead tags, lead origin, operator-created leads

**From:** Session 04 (operator portal)
**Date:** 2026-08-29
**Status:** open — built against the in-memory adapter, needs the real columns

The owner asked the operator portal for three things: easier notes/tags per
lead, the ability to **add** leads, and a **pipeline** view. Notes and the
pipeline stages already exist in the shipped shape (`lead_notes`,
`leads.status`). The other two need schema I do not own, so this is the request.

I have implemented all of it in `icefall-operator/src/domain/memory/adapter.ts`
so the UI is real and the rules are tested (61/61). Nothing here assumes your
answer — if you model it differently, I change my adapter, not the portal.

---

## 1. `leads.tags` — the operator's own labels

```
tags  text[]  not null  default '{}'
```

Written by the operator, read only by their own company. Constraints I enforce
client-side and would like enforced in the database too, because a client-side
cap is a suggestion:

- max **8** tags per lead
- max **24** characters per tag
- trimmed, inner whitespace collapsed
- **de-duplicated case-insensitively** — "Deposit"/"deposit" must be one tag,
  or a pipeline filter silently splits in half and neither column is right

A `check` on `cardinality(tags) <= 8` plus a trigger normalising them would do
it. If you would rather have a `lead_tags` child table, that is fine too — say
so and I will move; I have no attachment to the array.

**Not to be confused with `company_internal.tags`**, which is ICEFALL's
commercial view of a company and which this app must never read. These are a
company's labels on their own customers. Different owner, different table,
different audience.

## 2. `leads.origin` — who produced the lead

```
origin  text  not null  default 'icefall'  check (origin in ('icefall','company'))
```

**This is the one that matters commercially.** Today every lead is an ICEFALL
enquiry, so every figure in the portal is honestly attributable to us. The
moment an operator can type in their own phone enquiries, that stops being true
unless the two are distinguishable in the row itself.

What I do with it, and what I would ask the API to preserve:

- The **Dashboard and Analytics** figures (enquiries, qualified, bookings,
  revenue) count `origin = 'icefall'` **only**. They exist to answer "is ICEFALL
  worth what I pay for it"; a busy month of the operator's own referrals must
  not flatter us with their work.
- The **Bookings** screen is headed *"attributed to Icefall because the enquiry
  started here"*. A booking whose lead is `origin = 'company'` is excluded from
  the ICEFALL revenue total. This is not cosmetic — if referral revenue ever
  carries a percentage, this column is the difference between an invoice that
  is right and one that is not.
- The **Pipeline** screen shows both, labelled, with a filter. That is the
  operator's own workspace and it should hold everything they are working.

Insert-side rule I would like at the database, not just in my adapter:

> an operator-authored insert may only produce `origin = 'company'`

i.e. the operator-facing insert policy should force the value rather than trust
it. In my adapter `createLead` hard-codes `"company"` and the input type has no
`origin` field at all, so no UI mistake and no later refactor can promote a
self-added lead into ICEFALL's numbers. A `with check (origin = 'company')` on
the operator insert policy would make that guarantee real. There is a test that
tries to smuggle `origin: "icefall"` through and asserts the stored row is
`company`.

## 3. Operator-created leads — the columns that must tolerate NULL

An operator-added lead has **no ICEFALL conversation**, because ICEFALL has no
thread with that customer and cannot message them. So:

- `conversation_id` must stay nullable (it already is) and stay NULL for these
- `customer_id` — these people are not ICEFALL users. Either let this be
  nullable for `origin = 'company'`, or tell me what you want written there. I
  am currently minting a local id, which is wrong for the real backend and is
  the one thing in this feature I know I have fudged.
- `source` becomes free text for these rows ("Phone", "Referral", "Walk-in")
  rather than one of the channel enum values. If `source` is constrained
  server-side, these rows need either an escape or a separate column.

That third bullet is the open question I most need answered.

## What is already true client-side

- Tags and lead names go through the same `findContactDetailsIn` guard as every
  other operator-authored field — "Call 07700 900123" typed into a tag is the
  same customer-escape route as typing it into a description, and is refused.
- A lead cannot be created against another company's product or a mountain the
  company is not assigned to.
- Company-origin leads are in `getLeads` (the pipeline) and out of
  `getDashboard`/`getAnalytics` (the scorecard), with tests asserting the
  August figure stays exactly 28 while three company leads sit alongside it.

## What I need back

1. Ack or redesign of `leads.tags` (array vs child table).
2. Ack of `leads.origin` **and** the insert-policy force to `'company'`.
3. An answer on `customer_id` for operator-created leads.

Until then the portal runs on the in-memory adapter, which enforces all of the
above. Nothing ships to a real operator on assumed schema.
