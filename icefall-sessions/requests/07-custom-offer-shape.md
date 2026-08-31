# The custom-offer shape — one shape for GU-03 and OP-05

**From:** Session 05 (`icefall-guide`) · **Date:** 2026-08-31
**For:** Session 04 (`icefall-operator`) and the brain

The owner asked for a custom offer in the guide app (GU-03) and the same for
companies (OP-05). The task files say agree one shape rather than ship two. Here
is what the guide app built, so Session 04 can match it or argue with it before
either is hard to move.

## It is the shared money model's `Quote`, not a new type

`icefall-shared/money.ts` already has exactly this shape and it needed nothing
added:

```ts
interface QuoteLine { label: string; amount: Cents; per: "person" | "party"; passThrough?: boolean }
interface Quote { id; lines: QuoteLine[]; exclusions: Exclusion[]; cancellation; partySize; departureIso; validUntilIso }
totalsFor(quote) -> { total, commissionable, passedThrough, commission, guideReceives, perPerson }
```

**Use `totalsFor`. Do not compute a commission in a screen.** It floors so the
remainder goes to the seller, and this app shipped its own version once — wrong
rate, wrong rounding, wrong basis, on the screen telling a self-employed person
what they had earned. Importing the constant is not enough; the whole calculation
has to be the shared one (§6g).

## Three things worth matching

1. **`passThrough` is a flag the seller sets per line, never inferred.** A hut
   bed collected and handed on is not their fee, and ICEFALL takes nothing on it
   (decision 13). Verified in the guide app at the current 15%: €1,800 guiding +
   €240 hut → client pays €2,040, ICEFALL takes **€270** (15% of the €1,800 fee),
   **not €306** (15% of the total). If you copy a worked example into your own
   notes, copy the rule with it — this one was written at 10% and went stale the
   day the rate moved.
2. **Show what the SELLER receives, not just what the client pays.** That is the
   number they are actually deciding on, and it is the one they cannot get
   anywhere else in the app.
3. **`per: "person" | "party"` is explicit on every line**, because a per-person
   figure sitting beside a party total is how a €500 gets read as a €1,340.

## Where the two apps must differ

The guide's commission is `GUIDE_COMMISSION_PCT` deducted from their fee. **An
operator's is the referral stream — a different rate, a different basis, and
`money.ts` warns in its own header that mixing the two models on one booking is a
real bug.** Same `Quote` shape, same `passThrough` rule, different commission
function. Do not reach for `totalsFor` on the operator side without checking that.

## SETTLED 2026-08-31 — the guide commission is 15%

The owner answered `GU-03c`: **"Make it 15% comission."** `GUIDE_COMMISSION_PCT`
is now 15 in `icefall-shared/money.ts`, synced to every consuming app.

**Nothing in the guide app was edited to make that happen**, and that is the
point of this section rather than a footnote. The offer composer, the payouts
rows and the booking detail all read the constant, so the rate moved and the
screens moved with it — verified in the browser: €900 × 2 → client €1,800,
ICEFALL **€270**, guide **€1,530**; with a €240 pass-through hut → client €2,040,
ICEFALL still **€270**, guide €1,770.

Had either app hardcoded the rate, it would have quoted a payout the athlete app
contradicted for the same booking until somebody ran sync. **Read the constant.**

## What is blocked on both sides

Sending. The guide app has no message path at all, so the offer is composed and
cannot be delivered, and the screen says so rather than offering a Send. If the
operator portal can already send, say so — that asymmetry is worth knowing before
the owner sees one working and one not.
