import { motion } from "framer-motion";
import { Button, Disclaimer } from "@/components/ui/primitives";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { sync } from "@/services/repository";
import { fmtDate } from "@/lib/format";

/**
 * Screen 14 — ICEFALL PRIVATE.
 *
 * Restraint is the whole design. No pricing table, no feature grid, no
 * urgency. Benefits are stated plainly and honestly — nothing promises private
 * expeditions, because those belong to professional operators.
 */
const BENEFITS = [
  ["Private events", "Invitation-only gatherings with athletes, guides and the founders."],
  ["Early access", "First sight of new collections, before general release."],
  ["Limited collections", "Pieces produced in small runs and not restocked."],
  ["Founder access", "A direct line for feedback on what we make next."],
  ["Private training", "Small-group sessions with certified mountain guides."],
  ["Partner experiences", "Introductions to expedition operators and mountain houses."],
];

export default function Private() {
  const privateEvents = sync.events.filter((e) => e.privateOnly);

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title="" back="/profile" />
      </div>

      {/* Cinematic opening */}
      <div className="grain relative -mt-6 aspect-[3/4] overflow-hidden">
        <motion.img
          src="/img/private-hero.jpg"
          alt=""
          initial={{ scale: 1.06 }}
          animate={{ scale: 1 }}
          transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 scrim-full" />
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-10">
          <IcefallMark className="h-7 text-snow" />
          <h1 className="mt-5 text-[15px] font-light tracking-[0.34em] text-snow">PRIVATE</h1>
          <p className="display mt-6 text-[26px] text-snow/90">Access is earned.</p>
        </div>
      </div>

      <Stagger className="px-5">
        <Rise className="pt-8">
          <p className="text-[13px] leading-relaxed text-mist">
            ICEFALL Private is not a subscription. Membership is extended to athletes whose
            commitment to the mountains is evident — through what they climb, what they contribute,
            and how they carry themselves on the hill.
          </p>
        </Rise>

        <Rise className="pt-8">
          <div className="space-y-px overflow-hidden rounded-card border border-hairline">
            {BENEFITS.map(([title, detail]) => (
              <div key={title} className="bg-graphite px-4 py-4">
                <p className="text-[14px] text-snow">{title}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">{detail}</p>
              </div>
            ))}
          </div>
        </Rise>

        {privateEvents.length > 0 && (
          <Rise className="pt-8">
            <p className="section-label">This season</p>
            <div className="mt-3 space-y-2.5">
              {privateEvents.map((e) => (
                <div key={e.id} className="rounded-card border border-azure/20 bg-azure/[0.04] p-4">
                  <p className="section-label text-azure/80">{fmtDate(e.date)}</p>
                  <p className="mt-2 text-[15px] font-light text-snow">{e.title}</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{e.summary}</p>
                </div>
              ))}
            </div>
          </Rise>
        )}

        <Rise className="pt-9">
          <Button size="lg" variant="secondary" className="w-full">
            Register interest
          </Button>
          <p className="mt-3 text-center text-[11px] text-mist-dim">
            Registrations are reviewed at the end of each season.
          </p>
        </Rise>

        <Rise className="pt-7">
          <Disclaimer>
            Membership does not include expeditions. Major objectives are arranged through
            independent certified operators, who assess each climber individually.
          </Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}
