import { Building2, Users } from "lucide-react";
import { Card, DemoBanner, PageHead, Pill, SectionLabel } from "@/components/ui";
import { DEALS, DEMO_NOTICE, ORGANISATIONS, eurFull, fmtDate } from "@/data/demo";

export default function Partners() {
  return (
    <>
      <PageHead
        title="Partners"
        subtitle="Guiding companies listing on ICEFALL, and what each is worth."
      />
      <DemoBanner>{DEMO_NOTICE}</DemoBanner>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {ORGANISATIONS.map((o) => {
          const theirs = DEALS.filter((d) => d.orgId === o.id);
          const booked = theirs.filter((d) => d.stage === "won");
          const value = theirs.reduce((a, d) => a + d.valueEur, 0);
          const commission = Math.round((value * o.commissionPct) / 100);

          return (
            <Card key={o.id}>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-raised text-[12px] font-medium text-muted ring-1 ring-line">
                  {o.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[14px] text-ink">{o.name}</h2>
                    <Pill tone={o.status === "active" ? "green" : o.status === "onboarding" ? "amber" : "neutral"}>
                      {o.status}
                    </Pill>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 size={12} strokeWidth={1.7} />
                      {o.country}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Users size={12} strokeWidth={1.7} />
                      {o.guides} guides
                    </span>
                    <span>Partner since {fmtDate(o.since)}</span>
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-3.5">
                <Figure label="Booking value" value={eurFull(value)} />
                <Figure label={`ICEFALL @ ${o.commissionPct}%`} value={eurFull(commission)} accent />
                <Figure label="Booked" value={`${booked.length} of ${theirs.length}`} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p className={`tnum mt-1.5 text-[16px] font-light ${accent ? "text-accent-ink" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}
