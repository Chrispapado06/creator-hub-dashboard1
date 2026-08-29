import { useState } from "react";
import { Plus } from "lucide-react";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Notice } from "@/components/guide";
import { APPLICATION, DEMO_NOTICE, OPENINGS, type OpeningStatus, eur, fmtRange } from "@/data/demo";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { availability } from "@/domain/season";
import { canListPublicly } from "@/data/model";

type Tab = OpeningStatus | "all";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "full", label: "Full" },
  { value: "draft", label: "Drafts" },
  { value: "past", label: "Past" },
];

/**
 * The dates a guide is offering.
 *
 * `requires` is mandatory on every opening and shown to the client BEFORE they
 * can enquire. A guide advertising the Hörnli ridge has to say what the client
 * must already be able to do; the alternative is somebody booking a route they
 * cannot climb and finding out at 3,000 m.
 */
export default function Openings() {
  const [tab, setTab] = useState<Tab>("all");
  const listed = canListPublicly(APPLICATION);
  const dates = availability();
  const list = tab === "all" ? OPENINGS : OPENINGS.filter((o) => o.status === tab);

  return (
    <Screen>
      <Stagger>
        <ScreenHeader
          title="Your dates"
          subtitle="What you are offering, and what is taken."
          action={
            <Button size="sm" disabled title="Adding a date is not connected yet.">
              <Plus size={14} strokeWidth={2} />
              New
            </Button>
          }
        />

        {SHOW_DEMO_DATA && OPENINGS.length > 0 && (
          <Rise>
            <Disclaimer>{DEMO_NOTICE}</Disclaimer>
          </Rise>
        )}

        {!listed && OPENINGS.length > 0 && (
          <Rise className="pt-4">
            <Notice tone="alert">
              Your verification is not current, so nothing below is visible to athletes. Your dates
              are kept exactly as you left them and reappear the moment your documents are in order.
            </Notice>
          </Rise>
        )}

        {dates.emptyReason ? (
          <Rise className="pt-5">
            <Card>
              <p className="text-[12.5px] leading-relaxed text-mist">{dates.emptyReason}</p>
            </Card>
          </Rise>
        ) : (
          <Rise className="pt-5">
            <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
          </Rise>
        )}

        <Rise className="space-y-2.5 pt-5">
          {!dates.emptyReason &&
            list.map((o) => (
            <Card key={o.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[15px] text-snow">{o.peak}</h2>
                  <p className="mt-0.5 text-[12px] text-mist">{o.route}</p>
                </div>
                <StatusBadge status={o.status} />
              </div>

              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="tnum text-[12px] text-mist">{fmtRange(o.from, o.to)}</p>
                <div className="text-right">
                  <p className="tnum text-[16px] font-light text-snow">{eur(o.priceEur)}</p>
                  <p className="text-[10px] text-mist-dim">per person</p>
                </div>
              </div>

              <div className="mt-3 border-t border-hairline pt-3">
                <div className="flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-elevated">
                    <div
                      className="h-full rounded-pill bg-azure"
                      style={{ width: `${(o.taken / o.places) * 100}%` }}
                    />
                  </div>
                  <span className="tnum shrink-0 text-[11.5px] text-mist">
                    {o.taken}/{o.places} taken
                  </span>
                </div>
              </div>

              <div className="mt-3">
                <SectionLabel>The client must already be able to</SectionLabel>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{o.requires}</p>
              </div>
            </Card>
            ))}

          {!dates.emptyReason && list.length === 0 && (
            <Card>
              <p className="py-4 text-center text-[13px] text-mist-dim">
                No dates in this list.
              </p>
            </Card>
          )}
        </Rise>

        {/*
          WHAT THIS SCREEN CANNOT DO YET, said once, at the bottom, plainly.

          There is no table behind these dates. `guide_profiles.availability` is
          a single enum for the whole person — available / limited / unavailable
          — and `product_departures` belongs to a company. So a dated, priced,
          place-counted guide opening exists only in this app. Filed to Session
          03. Stated here rather than left implied, because a guide who edits a
          date and closes the app should know whether anybody else can see it.
        */}
        {!dates.emptyReason && (
          <Rise className="pt-6 pb-2">
            <Notice tone="neutral">
              ICEFALL does not store a guide's dates yet, so nothing on this screen has left this
              device. Athletes cannot see these until it does — what you set here is kept, not
              published.
            </Notice>
          </Rise>
        )}
      </Stagger>
    </Screen>
  );
}

function StatusBadge({ status }: { status: OpeningStatus }) {
  if (status === "open") return <Badge tone="summit">Open</Badge>;
  if (status === "full") return <Badge tone="azure">Full</Badge>;
  if (status === "draft") return <Badge>Draft</Badge>;
  return <Badge>Past</Badge>;
}
