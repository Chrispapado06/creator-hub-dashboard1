import { AlertTriangle, Lock, TrendingUp } from "lucide-react";
import { Card, DemoBanner, PageHead, Pill, SectionLabel } from "@/components/ui";
import { DEALS, ORGANISATIONS, contactById, orgById } from "@/data/demo";
import { eur as toCents, formatEur, payoutEligibility, payoutStatusFor } from "@/money/model";

/**
 * Every euro moving through ICEFALL.
 *
 * Three questions this screen answers, in order of how often they get asked:
 * what have we earned, what are we holding on behalf of somebody else, and
 * which of it we cannot actually pay out.
 *
 * That last one is the important column. Payouts only reach the UK, EEA,
 * Switzerland, the US and Canada, so a booking with a Nepali or Argentinian
 * partner is money we can take from a client and then not forward. It is
 * flagged here rather than discovered at payout time.
 */
export default function Transactions() {
  // Everything past a bare enquiry. A deal only reaches this screen once there
  // is a real prospect of money moving — and the payout corridor needs checking
  // then, not after a client has already paid.
  const rows = DEALS.filter((d) => d.stage !== "new").map((d) => {
    const org = orgById(d.orgId);
    const total = toCents(d.valueEur);
    const commission = Math.round((total * (org?.commissionPct ?? 12)) / 100);
    const booked = d.stage === "won";
    return {
      ...d,
      org,
      total,
      commission,
      guideReceives: total - commission,
      booked,
      payout: payoutStatusFor({
        status: booked ? "paid_in_full" : "awaiting_deposit",
        departureIso: d.departs,
      }),
      eligibility: payoutEligibility(org?.country ?? ""),
    };
  });

  const booked = rows.filter((r) => r.booked);
  const earned = booked.reduce((a, r) => a + r.commission, 0);
  const held = booked.reduce((a, r) => a + (r.payout === "held" ? r.guideReceives : 0), 0);
  const blocked = rows.filter((r) => !r.eligibility.ok);
  const blockedValue = blocked.reduce((a, r) => a + r.total, 0);

  return (
    <>
      <PageHead title="Transactions" subtitle="What ICEFALL has earned, and what it is holding." />

      <DemoBanner>
        Placeholder figures. No payment provider is connected — nothing has been charged, nothing is
        held and nothing has been paid out.
      </DemoBanner>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={TrendingUp} label="Commission earned" value={formatEur(earned)} foot={`${booked.length} booked trips`} />
        <Kpi icon={Lock} label="Held for guides" value={formatEur(held)} foot="released as each trip starts" />
        <Kpi
          icon={AlertTriangle}
          label="Cannot pay out"
          value={String(blocked.length)}
          foot={blocked.length ? `${formatEur(blockedValue)} of bookings` : "all corridors supported"}
          alert={blocked.length > 0}
        />
      </div>

      {/* ---- The corridor problem, stated once ---------------------------- */}
      {blocked.length > 0 && (
        <Card className="mt-4 border-[oklch(0.88_0.06_40)] bg-[oklch(0.985_0.018_40)]">
          <div className="flex gap-3">
            <AlertTriangle size={17} strokeWidth={1.8} className="mt-px shrink-0 text-[oklch(0.6_0.15_35)]" />
            <div>
              <p className="text-[13px] font-medium text-[oklch(0.44_0.12_35)]">
                {blocked.length} partner{blocked.length === 1 ? "" : "s"} we cannot pay out to
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[oklch(0.45_0.08_35)]">
                Cross-border payouts settle to the UK, EEA, Switzerland, the US and Canada only.
                Taking a client's money for a trip we cannot forward payment for would leave us
                holding it with no way to complete the booking — so these should either invoice the
                client directly, or be paid into a company account in a supported country.
              </p>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {[...new Set(blocked.map((b) => b.org?.name))].map((n) => (
                  <Pill key={n} tone="red">
                    {n}
                  </Pill>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-4" pad={false}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <SectionLabel>Bookings</SectionLabel>
          <span className="tnum text-[12px] text-faint">{rows.length} shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {["Trip", "Partner", "Client pays", "ICEFALL", "Guide", "Payout"].map((h) => (
                  <th key={h} className="label px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-raised">
                  <td className="px-4 py-3">
                    <p className="text-[13px] text-ink">{r.peak}</p>
                    <p className="text-[11.5px] text-faint">{contactById(r.contactId)?.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[12.5px] text-muted">{r.org?.name}</p>
                    <p className="text-[11.5px] text-faint">{r.org?.country}</p>
                  </td>
                  <td className="tnum px-4 py-3 text-[12.5px] text-ink">{formatEur(r.total)}</td>
                  <td className="tnum px-4 py-3 text-[12.5px] text-accent-ink">
                    {formatEur(r.commission)}
                  </td>
                  <td className="tnum px-4 py-3 text-[12.5px] text-muted">
                    {formatEur(r.guideReceives)}
                  </td>
                  <td className="px-4 py-3">
                    {!r.eligibility.ok ? (
                      <Pill tone="red">Blocked</Pill>
                    ) : !r.booked ? (
                      <Pill>Not booked</Pill>
                    ) : r.payout === "held" ? (
                      <Pill tone="amber">Held</Pill>
                    ) : (
                      <Pill tone="green">Releasable</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <SectionLabel>Where partners can be paid</SectionLabel>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ORGANISATIONS.map((o) => {
            const e = payoutEligibility(o.country);
            return (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-tile border border-line px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] text-ink">{o.name}</p>
                  <p className="text-[11.5px] text-faint">{o.country}</p>
                </div>
                {e.ok ? <Pill tone="green">Payouts OK</Pill> : <Pill tone="red">No payouts</Pill>}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
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
