import { AlertTriangle, Clock, HandCoins, Hourglass } from "lucide-react";
import { Card, DemoBanner, PageHead, Pill, SectionLabel } from "@/components/ui";
import {
  REFERRALS,
  fmtDate,
  orgById,
  referralAmount,
  type Referral,
} from "@/data/demo";
import {
  attributionDeadline,
  formatEur,
  isWithinAttribution,
  payoutEligibility,
} from "@/money/model";

/**
 * Referral fees from expedition companies.
 *
 * ICEFALL never touches this money — an expedition is settled by wire, and the
 * big operators are in countries the processor cannot pay out to anyway. What
 * ICEFALL sells is the introduction, and it earns a percentage of the bookings
 * that introduction produces, within an attribution window.
 *
 * Because it cannot force payment, this screen is built to surface the risk, not
 * to hide it: fees owed, fees DISPUTED, and windows about to close with no
 * booking reported are each called out. An honest referral ledger shows you what
 * you might not get, not just what you will.
 */

const days = (fromIso: string, toIso: string) =>
  Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);

export default function Referrals() {
  const now = "2026-08-17T00:00:00Z";

  const owed = REFERRALS.filter((r) => r.status === "booked" || r.status === "invoiced").reduce(
    (a, r) => a + referralAmount(r),
    0,
  );
  const collected = REFERRALS.filter((r) => r.status === "paid").reduce(
    (a, r) => a + referralAmount(r),
    0,
  );
  const disputed = REFERRALS.filter((r) => r.status === "disputed");
  const disputedValue = disputed.reduce((a, r) => a + referralAmount(r), 0);
  const live = REFERRALS.filter((r) => r.status === "introduced");

  return (
    <>
      <PageHead
        title="Referrals"
        subtitle="Expedition companies — the fee ICEFALL earns on introductions it made."
      />

      <DemoBanner>
        Placeholder figures. No company has actually reported a booking; these states show how the
        referral ledger tracks what is owed, disputed and at risk.
      </DemoBanner>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={HandCoins} label="Fees owed" value={formatEur(owed)} foot="booked, not yet paid" />
        <Kpi icon={HandCoins} label="Collected" value={formatEur(collected)} foot="settled" />
        <Kpi
          icon={AlertTriangle}
          label="Disputed"
          value={formatEur(disputedValue)}
          foot={`${disputed.length} contested`}
          alert={disputed.length > 0}
        />
        <Kpi icon={Hourglass} label="Live introductions" value={String(live.length)} foot="awaiting a booking" />
      </div>

      {/* ---- The strategic point ------------------------------------------ */}
      <Card className="mt-4 border-accent/25 bg-accent-soft/40">
        <div className="flex gap-3">
          <HandCoins size={17} strokeWidth={1.7} className="mt-px shrink-0 text-accent-ink" />
          <div>
            <p className="text-[13px] font-medium text-accent-ink">
              Referrals are how ICEFALL earns where it cannot process the money
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              An expedition never runs through ICEFALL's checkout — the amounts are too large and the
              biggest operators are in payout-blocked countries. The referral fee turns those exact
              bookings, which the Transactions screen can never touch, into revenue. It depends on the
              company reporting honestly, so the window and the dispute state below are the whole
              game.
            </p>
          </div>
        </div>
      </Card>

      {/* ---- Ledger -------------------------------------------------------- */}
      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <SectionLabel>Every introduction</SectionLabel>
          <span className="tnum text-[12px] text-faint">{REFERRALS.length} shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {["Client", "Company", "Objective", "Introduced", "Window", "Booking", "Fee", "Status"].map((h) => (
                  <th key={h} className="label px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {REFERRALS.map((r) => {
                const org = orgById(r.orgId);
                const deadline = attributionDeadline(r.introducedAt);
                const daysLeft = days(now, deadline);
                const attributable =
                  r.bookedAt ? isWithinAttribution(r.introducedAt, r.bookedAt) : daysLeft > 0;
                const canPayout = payoutEligibility(org?.country ?? "").ok;

                return (
                  <tr key={r.id} className="hover:bg-raised">
                    <td className="px-4 py-3 text-[13px] text-ink">{r.client}</td>
                    <td className="px-4 py-3">
                      <p className="text-[12.5px] text-muted">{org?.name}</p>
                      <p className="text-[11.5px] text-faint">
                        {org?.country}
                        {!canPayout && " · no payouts"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-muted">{r.objective}</td>
                    <td className="tnum px-4 py-3 text-[12px] text-faint">{fmtDate(r.introducedAt)}</td>
                    <td className="px-4 py-3">
                      {r.status === "introduced" ? (
                        <span
                          className={`tnum inline-flex items-center gap-1 text-[11.5px] ${daysLeft < 60 ? "text-[oklch(0.6_0.15_35)]" : "text-faint"}`}
                        >
                          <Clock size={11} strokeWidth={1.9} />
                          {daysLeft}d left
                        </span>
                      ) : r.status === "expired" ? (
                        <span className="text-[11.5px] text-faint">closed</span>
                      ) : (
                        <span className={`text-[11.5px] ${attributable ? "text-[oklch(0.5_0.12_150)]" : "text-[oklch(0.6_0.15_35)]"}`}>
                          {attributable ? "in window" : "out of window"}
                        </span>
                      )}
                    </td>
                    <td className="tnum px-4 py-3 text-[12.5px] text-ink">
                      {r.bookingValue ? formatEur(r.bookingValue) : "—"}
                    </td>
                    <td className="tnum px-4 py-3 text-[12.5px] text-accent-ink">
                      {r.bookingValue ? formatEur(referralAmount(r)) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {disputed.length > 0 && (
        <Card className="mt-4 border-[oklch(0.88_0.06_40)] bg-[oklch(0.985_0.018_40)]">
          <div className="flex gap-3">
            <AlertTriangle size={17} strokeWidth={1.8} className="mt-px shrink-0 text-[oklch(0.6_0.15_35)]" />
            <div>
              <p className="text-[13px] font-medium text-[oklch(0.44_0.12_35)]">
                {disputed.length} disputed — {formatEur(disputedValue)} at risk
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[oklch(0.45_0.08_35)]">
                A company is contesting that ICEFALL originated the introduction, or the amount. This
                is the failure mode of a referral model — the resolution is the timestamped
                introduction record and the partner agreement, not a chargeback. Weigh a persistent
                disputer against the value of the leads you send them.
              </p>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

function StatusPill({ status }: { status: Referral["status"] }) {
  const map: Record<Referral["status"], { tone: "neutral" | "amber" | "green" | "red"; label: string }> = {
    introduced: { tone: "neutral", label: "Introduced" },
    booked: { tone: "amber", label: "Booked — fee due" },
    invoiced: { tone: "amber", label: "Invoiced" },
    paid: { tone: "green", label: "Paid" },
    disputed: { tone: "red", label: "Disputed" },
    expired: { tone: "neutral", label: "Expired" },
  };
  const { tone, label } = map[status];
  return <Pill tone={tone}>{label}</Pill>;
}

function Kpi({
  icon: Icon,
  label,
  value,
  foot,
  alert,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: string;
  foot: string;
  alert?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <SectionLabel>{label}</SectionLabel>
        <Icon size={16} strokeWidth={1.7} className={alert ? "text-[oklch(0.6_0.15_35)]" : "text-faint"} />
      </div>
      <p className="tnum mt-3 text-[24px] font-light leading-none text-ink">{value}</p>
      <p className="mt-2 text-[12px] text-faint">{foot}</p>
    </Card>
  );
}
