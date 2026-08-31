import {
  ATTRIBUTION_WINDOW_MONTHS,
  DEFAULT_REFERRAL_PCT,
  DEPOSIT_PCT,
  FLEXIBLE_POLICY,
  attributionDeadline,
  isWithinAttribution,
  referralFee,
  GUIDE_COMMISSION_PCT,
  STANDARD_POLICY,
  eur,
  formatEur,
  instalmentsFor,
  payoutEligibility,
  payoutStatusFor,
  refundFor,
  totalsFor,
  totalsForAmount,
  type Quote,
} from "./money";

let pass = 0;
const fails: string[] = [];
const is = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
    console.log(` PASS  ${name}`);
  } else {
    fails.push(name);
    console.log(` FAIL  ${name}\n         got  ${g}\n         want ${w}`);
  }
};

const NOW = new Date("2026-08-17T12:00:00Z");
const quote = (over: Partial<Quote> = {}): Quote => ({
  id: "q1",
  lines: [
    { label: "Guiding fee", amount: eur(690), per: "person" },
    { label: "Hut and half board", amount: eur(180), per: "person" },
    { label: "Shared transfer", amount: eur(120), per: "party" },
  ],
  exclusions: [{ label: "Cable car", approxAmount: eur(64) }],
  cancellation: STANDARD_POLICY,
  partySize: 2,
  departureIso: "2027-04-17T00:00:00Z",
  validUntilIso: "2026-09-17T00:00:00Z",
  ...over,
});

/* ---- formatting ---------------------------------------------------------- */
is("formatEur whole", formatEur(eur(1850)), "€1,850");
is("formatEur with cents", formatEur(123456), "€1,234.56");
is("formatEur negative", formatEur(-eur(50)), "−€50");
is("eur() makes integers", eur(19.99), 1999);

/* ---- the float trap ------------------------------------------------------ */
is("0.1 + 0.2 in cents is exact", eur(0.1) + eur(0.2), eur(0.3));

/* ---- totals -------------------------------------------------------------- */
const t = totalsFor(quote(), 12);
// (690 + 180) * 2 people + 120 party = 1,860
is("total mixes per-person and per-party", t.total, eur(1860));
is("commission is 12%", t.commission, eur(223.2));
is("guide receives the rest", t.guideReceives, t.total - t.commission);
is("split reconciles exactly", t.commission + t.guideReceives, t.total);
is("per person", t.perPerson, eur(930));

// Rounding must never favour ICEFALL: an odd total leaves the remainder with
// the guide, and the two parts still sum to the whole.
const odd = totalsFor(quote({ lines: [{ label: "x", amount: 3333, per: "party" }], partySize: 1 }), 12);
is("odd total still reconciles", odd.commission + odd.guideReceives, 3333);

/* ---- instalments --------------------------------------------------------- */
const far = instalmentsFor(eur(1860), "2027-04-17T00:00:00Z", NOW);
is("far departure splits in two", far.length, 2);
is("deposit is 20%", far[0].amount, eur(372));
is("instalments sum to total", far[0].amount + far[1].amount, eur(1860));
is("deposit pct constant", DEPOSIT_PCT, 20);

// 10 days out — inside the 42-day balance window, so one payment.
const near = instalmentsFor(eur(1860), "2026-08-27T00:00:00Z", NOW);
is("near departure is a single payment", near.length, 1);
is("single payment is the full amount", near[0].amount, eur(1860));

/* ---- cancellation -------------------------------------------------------- */
const paid = eur(372);
const dep = "2026-10-16T00:00:00Z"; // 60 days after NOW

is(
  "60 days' notice → full refund",
  refundFor(STANDARD_POLICY, { paid, departureIso: dep, by: "client", now: NOW }).pct,
  100,
);
is(
  "40 days' notice → 50%",
  refundFor(STANDARD_POLICY, { paid, departureIso: "2026-09-26T00:00:00Z", by: "client", now: NOW }).pct,
  50,
);
is(
  "20 days' notice → 25%",
  refundFor(STANDARD_POLICY, { paid, departureIso: "2026-09-06T00:00:00Z", by: "client", now: NOW }).pct,
  25,
);
is(
  "3 days' notice → 0%",
  refundFor(STANDARD_POLICY, { paid, departureIso: "2026-08-20T00:00:00Z", by: "client", now: NOW }).pct,
  0,
);

// THE CASE THAT MATTERS. Weather call on the morning gives zero days' notice,
// which must NOT fall through to the 0% tier.
const morning = refundFor(STANDARD_POLICY, {
  paid,
  departureIso: "2026-08-17T18:00:00Z",
  by: "conditions",
  now: NOW,
});
is("conditions call on the morning → 100%", morning.pct, 100);
is("conditions refund is the whole amount paid", morning.refund, paid);
is("conditions retains nothing", morning.retained, 0);

const guideCancels = refundFor(STANDARD_POLICY, {
  paid,
  departureIso: "2026-08-18T00:00:00Z",
  by: "guide",
  now: NOW,
});
is("guide cancels → 100% however late", guideCancels.pct, 100);

const late = refundFor(STANDARD_POLICY, {
  paid,
  departureIso: "2026-08-10T00:00:00Z",
  by: "client",
  now: NOW,
});
is("cancelling after departure → 0%", late.pct, 0);
is("refund never exceeds what was paid", late.refund <= paid, true);

/* ---- payout eligibility -------------------------------------------------- */
is("France pays out", payoutEligibility("France").ok, true);
is("Switzerland pays out", payoutEligibility("Switzerland").ok, true);
is("United Kingdom pays out", payoutEligibility("United Kingdom").ok, true);
is("United States pays out", payoutEligibility("United States").ok, true);
is("Poland pays out", payoutEligibility("Poland").ok, true);
is("Nepal does NOT pay out", payoutEligibility("Nepal").ok, false);
is("Argentina does NOT pay out", payoutEligibility("Argentina").ok, false);
is("Morocco does NOT pay out", payoutEligibility("Morocco").ok, false);
is(
  "a blocked country is given options",
  payoutEligibility("Nepal").ok === false && payoutEligibility("Nepal").options.length > 0,
  true,
);

/* ---- payout timing -------------------------------------------------------- */
is(
  "money is held before departure",
  payoutStatusFor({ status: "paid_in_full", departureIso: "2027-01-01T00:00:00Z", now: NOW }),
  "held",
);
is(
  "releasable once they have walked in",
  payoutStatusFor({ status: "paid_in_full", departureIso: "2026-08-16T00:00:00Z", now: NOW }),
  "releasable",
);
is(
  "a cancelled booking never releases",
  payoutStatusFor({ status: "cancelled", departureIso: "2026-08-16T00:00:00Z", now: NOW }),
  "held",
);


/* ---- the guide commission, DEDUCTED ------------------------------------- */

// The owner's worked example, as a test. A guide charges EUR 1,000 for a day;
// the climber pays EUR 1,000; the guide receives EUR 900; ICEFALL keeps EUR 100.
const dayRate: Quote = {
  id: "q-day",
  lines: [{ label: "Guided day", amount: eur(1000), per: "party" }],
  exclusions: [],
  cancellation: STANDARD_POLICY,
  partySize: 1,
  departureIso: "2027-06-01T00:00:00Z",
  validUntilIso: "2026-12-01T00:00:00Z",
};
const g = totalsFor(dayRate);
is("the climber pays the advertised price", g.total, eur(1000));
is("ICEFALL keeps 15% of it", g.commission, eur(150));
is("the guide receives the rest", g.guideReceives, eur(850));
is("the fee is DEDUCTED, not added", g.total === eur(1000), true);
is("parts reconcile", g.commission + g.guideReceives, g.total);
is("default guide commission pct", GUIDE_COMMISSION_PCT, 15);

// Rounding goes to the guide, never to ICEFALL. Rounding in the platform's
// favour on every booking is how a marketplace quietly skims.
const oddDay = totalsFor({ ...dayRate, lines: [{ label: "x", amount: 3333, per: "party" }] });
is("rounding favours the guide", oddDay.commission + oddDay.guideReceives, 3333);
is("...and the commission rounds down", oddDay.commission, 499);

/* ---- pass-through costs carry no commission ------------------------------ */

// Owner decision, 2026-08-28: ICEFALL earns on the work somebody did, not on
// money that merely passed through their hands. A hut raising its charges must
// never increase what ICEFALL takes.
const withHuts = totalsFor({
  ...dayRate,
  lines: [
    { label: "Guided day", amount: eur(1000), per: "party" },
    { label: "Hut beds", amount: eur(240), per: "party", passThrough: true },
  ],
});
is("the climber pays the whole advertised price", withHuts.total, eur(1240));
is("pass-through is excluded from the basis", withHuts.commissionable, eur(1000));
is("...and reported separately", withHuts.passedThrough, eur(240));
is("ICEFALL still keeps 150, not 186", withHuts.commission, eur(150));
is("the guide receives everything else", withHuts.guideReceives, eur(1090));
is("parts reconcile", withHuts.commission + withHuts.guideReceives, withHuts.total);

// A per-person pass-through scales with the party, and is still excluded.
const party = totalsFor({
  ...dayRate,
  partySize: 3,
  lines: [
    { label: "Guided day", amount: eur(1500), per: "party" },
    { label: "Lift pass", amount: eur(60), per: "person", passThrough: true },
  ],
});
is("per-person pass-through scales", party.passedThrough, eur(180));
is("...and the commission ignores all of it", party.commission, eur(225));

// A quote with no flags behaves exactly as before — the flag is opt-in, so no
// existing quote silently changes what it charges.
is("an unflagged quote is unchanged", totalsFor(dayRate).commission, eur(150));

// FLOOR, NOT ROUND. 3,330 cents at 15% is 499.5; the half-cent goes to the
// guide. `Math.round` would have sent it to ICEFALL half the time.
const halfCent = totalsFor({ ...dayRate, lines: [{ label: "x", amount: 3330, per: "party" }] });
is("a half-cent goes to the guide, never to ICEFALL", halfCent.commission, 499);
is("parts still reconcile on a fraction", halfCent.commission + halfCent.guideReceives, 3330);

/* ---- one implementation, two entry points -------------------------------- */

// Session 02 holds a flat total rather than quote lines. The two entry points
// must not be able to disagree about the deduction or the rounding.
const flat = totalsForAmount(eur(1240), 1, GUIDE_COMMISSION_PCT, eur(240));
is("a flat amount deducts the same way", flat.commission, eur(150));
is("...and reports the same basis", flat.commissionable, eur(1000));
is("...and the same net to the guide", flat.guideReceives, eur(1090));
is("the two entry points agree exactly", JSON.stringify(flat), JSON.stringify(withHuts));

// partySize is required and is used, not assumed.
is("per-person divides by the party", totalsForAmount(eur(900), 3).perPerson, eur(300));
is("a zero party does not divide by zero", totalsForAmount(eur(900), 0).perPerson, eur(900));

// A flat caller that says nothing about pass-through is asserting there is none.
is("no pass-through means the whole amount is commissionable",
  totalsForAmount(eur(1000), 1).commissionable, eur(1000));

/* ---- flexible policy ----------------------------------------------------- */
const flexDep = "2026-09-16T00:00:00Z"; // 30 days after NOW
is(
  "flexible: 30 days out → full refund",
  refundFor(FLEXIBLE_POLICY, { paid: eur(100), departureIso: flexDep, by: "client", now: NOW }).pct,
  100,
);
is(
  "flexible: exactly 14 days out → still full refund",
  refundFor(FLEXIBLE_POLICY, { paid: eur(100), departureIso: "2026-08-31T00:00:00Z", by: "client", now: NOW }).pct,
  100,
);
is(
  "flexible: 13 days out → nothing back",
  refundFor(FLEXIBLE_POLICY, { paid: eur(100), departureIso: "2026-08-30T00:00:00Z", by: "client", now: NOW }).pct,
  0,
);
is(
  "flexible: conditions still refund in full",
  refundFor(FLEXIBLE_POLICY, { paid: eur(100), departureIso: "2026-08-18T00:00:00Z", by: "conditions", now: NOW }).pct,
  100,
);


/* ---- referrals (expedition companies) ------------------------------------ */

is("referral fee is 10% of a €50k booking", referralFee(eur(50000), 10), eur(5000));
is("referral fee default rate", referralFee(eur(1000)), referralFee(eur(1000), DEFAULT_REFERRAL_PCT));
is("the settled referral rate is 7.5%", DEFAULT_REFERRAL_PCT, 7.5);
is("7.5% of a EUR 50k booking", referralFee(eur(50000)), eur(3750));
// The two streams must not converge on one number by accident.
is("guide and referral rates are distinct", GUIDE_COMMISSION_PCT === DEFAULT_REFERRAL_PCT, false);
is("referral fee never exceeds the booking", referralFee(eur(50000), 10) <= eur(50000), true);
is("attribution window constant", ATTRIBUTION_WINDOW_MONTHS, 12);

const intro = "2027-01-10T00:00:00Z";
is("booking 5 months after intro is attributable", isWithinAttribution(intro, "2027-06-10T00:00:00Z"), true);
is("booking on the deadline is attributable", isWithinAttribution(intro, attributionDeadline(intro)), true);
is("booking 13 months after intro is NOT attributable", isWithinAttribution(intro, "2028-02-10T00:00:00Z"), false);
is("booking BEFORE the intro is NOT attributable", isWithinAttribution(intro, "2026-12-10T00:00:00Z"), false);
is("deadline is 12 months on", attributionDeadline(intro).slice(0, 7), "2028-01");

console.log("\n" + "=".repeat(58));
console.log(`${pass}/${pass + fails.length} passed`);
if (fails.length) {
  console.log("FAILED: " + fails.join(", "));
  process.exit(1);
}
