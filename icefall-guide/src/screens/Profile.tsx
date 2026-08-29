import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Badge, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Notice } from "@/components/guide";
import { Provenance, StatTile } from "@/components/Figure";
import { marketplace } from "@/domain/season";
import { APPLICATION, DEMO_NOTICE, ME, eur } from "@/data/demo";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { canListPublicly, effectiveStatus, verificationSentence } from "@/data/model";

/**
 * How an athlete sees this guide. A preview of the real listing.
 *
 * The two figures on this screen — profile views and enquiries — are here rather
 * than only on Today because this is the screen a guide is on when they wonder
 * whether their listing is working. Both come from the same `marketplace()` call
 * the home screen makes, not a second reading of the same rows, so the two
 * screens cannot show different answers to "how am I doing".
 *
 * Views currently says ICEFALL is not counting, which is the true state and the
 * same code path the real figure will arrive on. The enquiry count carries its
 * provenance line for the reason given where it is rendered.
 */
export default function Profile() {
  const listed = canListPublicly(APPLICATION);
  const status = effectiveStatus(APPLICATION);
  const market = marketplace();

  if (!ME) {
    return (
      <Screen>
        <Stagger>
          <ScreenHeader title="Profile" subtitle="Exactly what an athlete sees." />
          <Rise className="pt-5">
            <Card>
              <p className="text-[12.5px] leading-relaxed text-mist">
                There is no guide profile on this device yet. Nothing is listed, and nothing is
                hidden — an athlete searching for a guide simply does not find you, because you
                have not applied.
              </p>
              <Link
                to="/welcome"
                className="mt-3.5 inline-flex items-center gap-1.5 text-[12.5px] text-azure"
              >
                Apply to guide <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </Card>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stagger>
        <ScreenHeader title="Profile" subtitle="Exactly what an athlete sees." />

        {SHOW_DEMO_DATA && (
          <Rise>
            <Disclaimer>{DEMO_NOTICE}</Disclaimer>
          </Rise>
        )}

        <Rise className="pt-5">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>Visibility</SectionLabel>
              {listed ? (
                <Badge tone="summit">Live to athletes</Badge>
              ) : (
                <Badge tone="danger">Hidden</Badge>
              )}
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
              {listed
                ? "Athletes can find you and enquire about your dates."
                : "Your listing is not being shown. Your dates and clients are untouched — see Checks for what is outstanding."}
            </p>
          </Card>
        </Rise>

        <Rise className="pt-4">
          <Card>
            <div className="flex items-start gap-3.5">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-tile border border-hairline bg-elevated/50 text-[15px] tracking-[0.06em] text-mist">
                {ME.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
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

        {/* ---- How the listing is doing -------------------------------------- */}
        <Rise className="pt-4">
          <SectionLabel>How your listing is doing</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <StatTile label="Profile views" reading={market.views} format={String} />
            <StatTile
              label="Enquiries"
              reading={market.enquiries}
              format={String}
              href="/enquiries"
            />
          </div>
          {/*
            THE SAME SENTENCE TODAY CARRIES, and it belongs here more than there.
            `season.ts` declares `provenance` as the line that must sit under any
            rendering of this count so it is not read as a measured marketplace
            funnel — and this is the screen a guide is on when they are deciding
            whether being listed is worth the commission. A count of threads held
            on one device, under a heading that says "how your listing is doing",
            answers that question falsely if it answers it at all.
          */}
          <Provenance>{market.provenance}</Provenance>
        </Rise>

        <Rise className="pt-4">
          <SectionLabel>What ICEFALL tells the client</SectionLabel>
          <Card className="mt-3">
            <p className="text-[12.5px] leading-relaxed text-mist">
              {verificationSentence(APPLICATION)}
            </p>
            {status !== "approved" && (
              <Link
                to="/verification"
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-azure"
              >
                Open verification <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            )}
          </Card>
        </Rise>

        <Rise className="pt-4 pb-2">
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
