import { AlertTriangle, Banknote } from "lucide-react";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Notice } from "@/components/guide";
import { Figure, StatTile } from "@/components/Figure";
import { GUIDE_NOTICES, bookingValueReading, excludedNote, fold } from "@/domain/honesty";
import { bookingBreakdown, earningsSplit, stagedBookings } from "@/domain/season";
import { DEMO_NOTICE, PAYOUT_COUNTRY, fmtDate } from "@/data/demo";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import {
  GUIDE_COMMISSION_PCT,
  PAYMENTS_NOT_CONNECTED,
  formatEur,
  payoutEligibility,
} from "@/money/model";

/**
 * What the guide is owed, and when it arrives.
 *
 * The whole screen turns on one honest statement: ICEFALL holds a client's money
 * until the party actually walks in. That is a real cost to the guide — they are
 * waiting — so the reason is stated rather than buried, and the release date is
 * on every row. A marketplace that is vague about when a professional gets paid
 * is one they will leave.
 *
 * THE COMMISSION IS NOT COMPUTED ON THIS SCREEN, AND THAT IS THE POINT.
 *
 * Until 2026-08-29 it was. This file read a `COMMISSION_PCT = 12` declared in
 * the app's own demo data and did `Math.round((paid * 12) / 100)` — a FIFTH
 * commission model in a family that had already found and reconciled four, and
 * the only one nobody had looked for, because it lived in a different app under
 * a different name. It was wrong in three separate ways at once:
 *
 *   · THE RATE. The owner settled 10% against a worked example on 2026-08-28.
 *   · THE ROUNDING. The shared model FLOORS, deliberately, so the fraction goes
 *     to the guide; `Math.round` sends half of them to ICEFALL instead. A cent
 *     at a time on the one screen a self-employed person checks their income on.
 *   · THE BASIS. It charged on everything the client paid, including hut fees
 *     and lift passes the guide collects and hands straight on. Owner decision
 *     13: ICEFALL earns on the work a counterparty did, never on money that
 *     merely passed through their hands.
 *
 * All three came from the same cause — a second implementation — so the fix was
 * to DELETE it, not to change the 12 to a 10. Importing the constant would have
 * protected the rate and not the rule (§6g), and the rounding and the basis are
 * the rule. Every figure below now comes from `@/domain/season`, which delegates
 * to the shared money model, and the totals are the same call the home screen
 * makes so the two screens cannot show this person two different incomes.
 */
export default function Payouts() {
  const eligibility = payoutEligibility(PAYOUT_COUNTRY);
  const rows = stagedBookings();
  const totals = earningsSplit(rows);
  const held = rows.filter((r) => r.payout === "held");
  const releasable = rows.filter((r) => r.payout === "releasable");
  const sent = rows.filter((r) => r.payout === "sent");

  return (
    <Screen>
      <Stagger>
        <ScreenHeader title="Payouts" subtitle="What you are owed, and when it lands." back />

        <Rise>
          <Disclaimer>
            {SHOW_DEMO_DATA ? `${DEMO_NOTICE} ` : ""}
            {PAYMENTS_NOT_CONNECTED}
          </Disclaimer>
        </Rise>

        {/* ---- Can we even pay this person? -------------------------------- */}
        {!eligibility.ok && (
          <Rise className="pt-5">
            <Notice tone="danger">
              <div className="flex gap-2.5">
                <AlertTriangle size={15} strokeWidth={1.8} className="mt-px shrink-0 text-danger" />
                <div>
                  <p className="text-snow">We cannot pay out to {PAYOUT_COUNTRY}</p>
                  <p className="mt-1.5">{eligibility.reason}</p>
                  <ul className="mt-2.5 space-y-1.5">
                    {eligibility.options.map((o) => (
                      <li key={o} className="flex gap-2">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Notice>
          </Rise>
        )}

        {/* ---- Totals ------------------------------------------------------- */}
        <Rise className="pt-5">
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile
              label="Coming"
              reading={totals.coming}
              format={formatEur}
              footnote={
                /*
                  KEYED ON THE SAME SET THE FIGURE SUMS, which it was not.
                  `coming` totals every booking whose payout is not "sent" —
                  held AND releasable — while this branch asked only about
                  `held`. A guide with one outstanding booking whose departure
                  had passed would have seen a real amount above the words
                  "Nothing due." Not reachable from today's seed (every
                  outstanding booking is dated ahead), which is exactly why it
                  needed finding by reading rather than by looking.
                */
                excludedNote(totals.coming, totals.comingExcluded) ??
                (totals.coming.available
                  ? held.length > 0
                    ? "Held until each trip starts."
                    : "Released — on its way to your account."
                  : undefined)
              }
            />
            <StatTile
              label="Paid out"
              reading={totals.paidOut}
              format={formatEur}
              footnote={excludedNote(totals.paidOut, totals.paidOutExcluded)}
            />
          </div>
          {(totals.coming.available || totals.paidOut.available) && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
              {GUIDE_NOTICES.EARNINGS_ARE_NET}
              {releasable.length > 0 && " Released money clears in two to three days."}
            </p>
          )}
        </Rise>

        {/* ---- Why it is held ----------------------------------------------- */}
        <Rise className="pt-4">
          <Notice tone="neutral">
            <p className="text-snow">Why your money is held</p>
            <p className="mt-1.5">
              A client pays when they book, sometimes a year ahead. We hold it until the day you
              meet them, then release it. It protects them from paying a stranger for a trip that
              never happens — which is a large part of why they were willing to book at all.
            </p>
          </Notice>
        </Rise>

        {/* ---- Rows ---------------------------------------------------------- */}
        <Rise className="pt-7">
          <SectionLabel>Every booking</SectionLabel>
          <div className="mt-3 space-y-2.5">
            {rows.map((r) => {
              const breakdown = bookingBreakdown(r);
              const paid = bookingValueReading(r.paid);
              /**
               * Both absent, and for the same reason, prints the same sentence
               * twice in one card — "Value not yet reported" above "Client has
               * paid — Value not yet reported". Saying it once is the same
               * information; saying it twice reads as a screen that is padding,
               * and the reader starts skipping the line that matters.
               */
              const showPaid = breakdown.available || paid.available;
              return (
                <Card key={r.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13.5px] text-snow">{r.peak}</p>
                      <p className="mt-0.5 text-[11.5px] text-mist-dim">
                        {r.client} · {r.partySize} {r.partySize === 1 ? "climber" : "climbers"}
                      </p>
                    </div>
                    <PayoutBadge status={r.payout} />
                  </div>

                  <div className="mt-3 border-t border-hairline pt-3 text-[12.5px]">
                    {fold(
                      breakdown,
                      (t) => (
                        <>
                          {/*
                            THE COLUMN HAS TO ADD UP, and the first version of it
                            did not. It read:

                              Booking value   €780
                              Huts and lifts  −€96
                              ICEFALL 10%     −€68.40
                              Yours           €711.60

                            — and 780 − 96 − 68.40 is €615.60, not €711.60. The
                            hut fee is NOT taken out of what ICEFALL sends the
                            guide; it is money the guide collects and hands to
                            the hut, and it appeared there only to explain why
                            the commission was smaller than 10% of the total.
                            "A row in a column that sums to a total reads as an
                            addition whatever it is called" (§6g) — and a
                            negative row reads as a subtraction, so a guide
                            checking the arithmetic found it wrong.

                            Now the sum is exactly two operations, and the
                            pass-through sits BELOW the total as what it is: part
                            of the money arriving that is already spoken for.
                          */}
                          <dl className="space-y-1.5">
                            <Row label="Booking value" value={formatEur(t.total)} />
                            <Row
                              label={
                                t.passedThrough > 0
                                  ? `ICEFALL ${GUIDE_COMMISSION_PCT}% of your ${formatEur(t.commissionable)} fee`
                                  : `ICEFALL ${GUIDE_COMMISSION_PCT}%`
                              }
                              value={`−${formatEur(t.commission)}`}
                              dim
                            />
                            <Row label="You receive" value={formatEur(t.guideReceives)} strong />
                          </dl>
                          {t.passedThrough > 0 && (
                            <p className="mt-2 border-t border-hairline pt-2 text-[11px] leading-relaxed text-mist-dim">
                              {formatEur(t.passedThrough)} of that is huts, lifts and permits you
                              pay on. ICEFALL takes no commission on those — only on your fee.
                            </p>
                          )}
                        </>
                      ),
                      (reason) => (
                        <p className="text-[12px] leading-relaxed text-mist-dim">{reason}</p>
                      ),
                    )}
                  </div>

                  {/* What the client has actually handed over, kept separate from
                      the breakdown above. A deposit is not a smaller booking. */}
                  {showPaid && (
                    <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-hairline pt-3 text-[11.5px]">
                      <span className="text-mist-dim">Client has paid</span>
                      <Figure reading={paid} format={formatEur} size="md" />
                    </div>
                  )}

                  <p className="tnum mt-3 text-[11px] text-mist-dim">
                    {r.payout === "sent"
                      ? `Paid out after ${fmtDate(r.departureIso)}`
                      : r.payout === "releasable"
                        ? "Released — on its way to your account"
                        : `Releases ${fmtDate(r.departureIso)}`}
                  </p>
                </Card>
              );
            })}

            {rows.length === 0 && (
              <Card>
                <p className="py-4 text-center text-[13px] text-mist-dim">
                  No bookings yet. Nothing is owed to you, and nothing is being held.
                </p>
              </Card>
            )}
          </div>
        </Rise>

        {sent.length > 0 && (
          <Rise className="pt-6">
            <Disclaimer>
              {sent.length} past {sent.length === 1 ? "booking has" : "bookings have"} been settled.
              Statements will be downloadable here once payments are connected.
            </Disclaimer>
          </Rise>
        )}

        <Rise className="pt-6 pb-2">
          <Button variant="secondary" className="w-full" disabled>
            <Banknote size={15} strokeWidth={1.8} />
            Set up payouts
          </Button>
          <p className="mt-2.5 text-center text-[11px] leading-relaxed text-mist-dim">
            Bank details are entered with our payment provider, never with ICEFALL. We never see
            your account number.
          </p>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Row({
  label,
  value,
  dim,
  strong,
}: {
  label: string;
  value: string;
  dim?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={dim ? "text-mist-dim" : "text-mist"}>{label}</dt>
      <dd
        className={`tnum ${strong ? "text-[14px] text-snow" : dim ? "text-mist-dim" : "text-mist"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function PayoutBadge({ status }: { status: "held" | "releasable" | "sent" }) {
  if (status === "sent") return <Badge tone="neutral">Paid out</Badge>;
  if (status === "releasable") return <Badge tone="summit">Ready</Badge>;
  return <Badge tone="azure">Held</Badge>;
}
