import { AlertTriangle, Banknote, Lock, Wallet } from "lucide-react";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Notice } from "@/components/guide";
import { BOOKINGS, COMMISSION_PCT, DEMO_NOTICE, PAYOUT_COUNTRY, fmtDate } from "@/data/demo";
import {
  PAYMENTS_NOT_CONNECTED,
  formatEur,
  payoutEligibility,
  payoutStatusFor,
} from "@/money/model";

/**
 * What the guide is owed, and when it arrives.
 *
 * The whole screen turns on one honest statement: ICEFALL holds a client's
 * money until the party actually walks in. That is a real cost to the guide —
 * they are waiting — so the reason is stated rather than buried, and the release
 * date is on every row. A marketplace that is vague about when a professional
 * gets paid is one they will leave.
 */
export default function Payouts() {
  const eligibility = payoutEligibility(PAYOUT_COUNTRY);

  const rows = BOOKINGS.filter((b) => b.status !== "cancelled").map((b) => {
    const status = payoutStatusFor({ status: b.status, departureIso: b.departureIso });
    const commission = Math.round((b.paid * COMMISSION_PCT) / 100);
    return { ...b, payout: status, commission, yours: b.paid - commission };
  });

  const held = rows.filter((r) => r.payout === "held");
  const releasable = rows.filter((r) => r.payout === "releasable");
  const sent = rows.filter((r) => r.payout === "sent");
  const sum = (list: typeof rows) => list.reduce((a, r) => a + r.yours, 0);

  return (
    <Screen>
      <Stagger>
        <ScreenHeader title="Payouts" subtitle="What you are owed, and when it lands." back />

        <Rise>
          <Disclaimer>
            {DEMO_NOTICE} {PAYMENTS_NOT_CONNECTED}
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
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold" />
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
            <Total icon={Lock} label="Held" value={formatEur(sum(held))} foot="until each trip starts" />
            <Total
              icon={Wallet}
              label="Ready"
              value={formatEur(sum(releasable))}
              foot={releasable.length ? "clears in 2–3 days" : "nothing due"}
              accent={sum(releasable) > 0}
            />
          </div>
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
            {rows.map((r) => (
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

                <dl className="mt-3 space-y-1.5 border-t border-hairline pt-3 text-[12.5px]">
                  <Row label="Client paid" value={formatEur(r.paid)} />
                  <Row label={`ICEFALL ${COMMISSION_PCT}%`} value={`−${formatEur(r.commission)}`} dim />
                  <Row label="Yours" value={formatEur(r.yours)} strong />
                </dl>

                <p className="tnum mt-3 text-[11px] text-mist-dim">
                  {r.payout === "sent"
                    ? `Paid out after ${fmtDate(r.departureIso)}`
                    : r.payout === "releasable"
                      ? "Released — on its way to your account"
                      : `Releases ${fmtDate(r.departureIso)}`}
                </p>
              </Card>
            ))}
          </div>
        </Rise>

        {sent.length > 0 && (
          <Rise className="pt-6">
            <Disclaimer>
              {sent.length} past {sent.length === 1 ? "booking has" : "bookings have"} been paid out.
              Statements will be downloadable here once payments are connected.
            </Disclaimer>
          </Rise>
        )}

        <Rise className="pt-6">
          <Button variant="secondary" className="w-full" disabled>
            <Banknote size={15} strokeWidth={1.8} />
            Set up payouts
          </Button>
          <p className="mt-2.5 text-center text-[11px] text-mist-dim">
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
      <dd className={`tnum ${strong ? "text-[14px] text-snow" : dim ? "text-mist-dim" : "text-mist"}`}>
        {value}
      </dd>
    </div>
  );
}

function PayoutBadge({ status }: { status: "held" | "releasable" | "sent" }) {
  if (status === "sent") return <Badge tone="neutral">Paid out</Badge>;
  if (status === "releasable") return <Badge tone="summit">Ready</Badge>;
  return <Badge tone="gold">Held</Badge>;
}

function Total({
  icon: Icon,
  label,
  value,
  foot,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: string;
  foot: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <SectionLabel>{label}</SectionLabel>
        <Icon size={14} strokeWidth={1.7} className={accent ? "text-summit" : "text-mist-dim"} />
      </div>
      <p className={`tnum mt-3 text-[20px] font-light leading-none ${accent ? "text-summit" : "text-snow"}`}>
        {value}
      </p>
      <p className="mt-2 text-[11px] text-mist-dim">{foot}</p>
    </Card>
  );
}
