import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Badge, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Notice } from "@/components/guide";
import { APPLICATION, DEMO_NOTICE, ME, eur } from "@/data/demo";
import { canListPublicly, effectiveStatus, verificationSentence } from "@/data/model";

/** How an athlete sees this guide. A preview of the real listing. */
export default function Profile() {
  const listed = canListPublicly(APPLICATION);
  const status = effectiveStatus(APPLICATION);

  return (
    <Screen>
      <Stagger>
        <ScreenHeader title="Profile" subtitle="Exactly what an athlete sees." />

        <Rise>
          <Disclaimer>{DEMO_NOTICE}</Disclaimer>
        </Rise>

        <Rise className="pt-5">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>Visibility</SectionLabel>
              {listed ? <Badge tone="summit">Live to athletes</Badge> : <Badge tone="danger">Hidden</Badge>}
            </div>
            <p className="mt-2.5 text-[12px] text-mist-dim">Status: {status}</p>
          </Card>
        </Rise>

        <Rise className="pt-4">
          <Card>
            <div className="flex items-start gap-3.5">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-tile border border-hairline bg-elevated/50 text-[15px] tracking-[0.06em] text-mist">
                {ME.name.split(" ").map((w) => w[0]).join("")}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[18px] font-light text-snow">{ME.name}</h2>
                <p className="mt-0.5 text-[12px] text-mist">{ME.basedIn}</p>
              </div>
            </div>

            <p className="mt-3.5 text-[12.5px] leading-relaxed text-mist">{ME.headline}</p>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-hairline pt-4">
              <Figure label="Years" value={String(ME.yearsGuiding)} />
              <Figure label="Day rate" value={eur(ME.dailyRateEur)} />
              <Figure label="Languages" value={String(ME.languages.length)} />
            </div>
          </Card>
        </Rise>

        <Rise className="pt-4">
          <SectionLabel>What ICEFALL tells the client</SectionLabel>
          <Card className="mt-3">
            <p className="text-[12.5px] leading-relaxed text-mist">
              {verificationSentence(APPLICATION)}
            </p>
          </Card>
        </Rise>

        <Rise className="pt-4">
          <Notice tone="neutral">
            Your qualifications appear as what you have shown us — never as an endorsement. ICEFALL
            does not rank guides by payment, and there is no way to buy a higher position in a
            client's results.
          </Notice>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p className="tnum mt-1.5 text-[15px] font-light text-snow">{value}</p>
    </div>
  );
}
