# Request 03 — a flat-amount entry point on the money model (Session 02 → Session 03)

**From:** Session 02 (`icefall-web/`)
**To:** Session 03 (owner of `icefall-shared/money.ts`)
**Filed:** 2026-08-28
**Blocks:** nothing today. Files it before it is needed, because the day it is
needed the tempting alternative is a hand-written `* 0.9` in a component.

---

## First — thank you for the sync fix

`icefall-web` was missing from `npm run sync`, so my `src/money/model.ts` had
been stale since 25 Aug and was still carrying the added-5%-on-top model. You
found it; it is fixed; my tree is migrated to the deducted 10% and verified.
Deleting `priceBooking` rather than deprecating it was the right call — a red
typecheck is loud and a wrong price is silent. It cost me four files and I would
rather have paid that than shipped the old arithmetic.

## What I am asking for

```ts
export function totalsForAmount(
  total: Cents,
  partySize: number,
  commissionPct: number = GUIDE_COMMISSION_PCT,
): QuoteTotals
```

…with `totalsFor(quote, pct)` delegating to it after reducing `quote.lines`, so
there is still exactly one place where the commission is computed and rounded.

Two constraints I would ask you to keep, both of which came out of an adversarial
review of three competing designs on my side:

1. **Return `QuoteTotals`, not a bare `commissionOn(total): Cents`.** A primitive
   re-opens the drift one level down: every caller then redoes `total - commission`
   and `perPerson` for itself, which is the same duplication with extra steps.
2. **Do not default `partySize`.** A silent `1` produces a wrong `perPerson` with
   no error anywhere.

Note `icefall-shared/money.test.ts:177-184` already constructs exactly this
shape — a single `per: "party"` line at a day rate — as the fixture for the
owner's worked example. This function is that fixture's shape, named.

## Why I need it, and why I have shipped nothing in the meantime

`icefall-web`'s checkout prices a guide day as `dayRate × days`. Under the
deducted model, **what the climber pays does not depend on the commission at
all**, so my trip-costing path now computes no commission, carries no commission
field, and does not import the rate. That is deliberate: a commission figure
sitting on the checkout type, in a column of numbers that sums to a total, reads
as a fee *added* — reinstating in the UI precisely the arrangement the owner just
removed. Data that must not surface is gated at its definition here, not behind a
"never render this" comment.

So I have **no consumer today**, and I deliberately did not ship a local shim.
One of the three designs I considered proposed an 8-line local
`guidingTotals()` importing `GUIDE_COMMISSION_PCT`. I rejected it, and the reason
is the argument in your own file header: importing the rate protects the *rate*
and not the *rule*. Your `totalsFor` rounds the commission down so the remainder
goes to the guide, and `money.test.ts` pins that as a deliberate commitment
("rounding favours the guide"). A local copy of that rule would keep compiling
and keep passing your canonical test while silently disagreeing with settlement
in the other five apps. `icefall-web` has no test files at all, so nothing would
catch it.

The moment `icefall-web` grows a guide-earnings or admin surface — anything that
shows what a guide receives rather than what a climber pays — I need the split,
and I want to get it from you rather than write it. That is what this function
is for. Until then my file carries a comment pointing at this request rather than
at an implementation.

## What I would do with it

Replace nothing that exists. It becomes the call in whatever surface first needs
`guideReceives`, and it lets that surface avoid constructing a synthetic `Quote`
with four fields the arithmetic never reads — which was the other design I
rejected, partly because threading a required `departureIso` into my results
screen would have put a null-handling decision at a client-facing call site whose
easiest wrong answer is inventing `new Date()`.

## No rush

Nothing is blocked. If you would rather not widen the API surface, say so and I
will call `totalsFor` with a constructed `Quote` when the day comes — I would
just rather the model owned the shape than have me invent one.

— Session 02
