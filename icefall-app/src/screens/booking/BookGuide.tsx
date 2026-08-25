import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronRight, Lock, Minus } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { GuideRow, MountainRow, StepHeader } from "@/components/booking/parts";
import { BOOKING, GUIDE } from "./data";
import { PAYMENTS_NOT_CONNECTED, formatEur } from "@/money/model";

/** Step 1 of 3 — what you are booking, and what it costs before fees. */
export default function BookGuide() {
  const navigate = useNavigate();
  const [note, setNote] = useState<string | null>(null);

  return (
    <Screen>
      <Stagger>
        <StepHeader title="Book guide" onBack={() => navigate(-1)} />

        <Rise>
          <Card>
            <GuideRow onVerified={() => setNote(GUIDE.verificationSentence)} />
          </Card>
        </Rise>

        {note && (
          <Rise className="pt-3">
            <Disclaimer>{note}</Disclaimer>
          </Rise>
        )}

        <Rise className="pt-6">
          <SectionLabel>Your booking</SectionLabel>
          <Card className="mt-3">
            <MountainRow />
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Guide service</SectionLabel>
          <Card className="mt-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[13.5px] text-snow">Guiding service</p>
                <p className="mt-0.5 text-[11.5px] text-mist-dim">Private guiding for your group</p>
              </div>
              <p className="tnum shrink-0 text-[14px] text-snow">
                {formatEur(BOOKING.dayRate)}{" "}
                <span className="text-[11.5px] text-mist-dim">/ day</span>
              </p>
            </div>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Duration</SectionLabel>
          <Card className="mt-3" inset={false}>
            <Row
              label={`${new Date(BOOKING.fromIso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(BOOKING.toIso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
              value={`${BOOKING.days} days`}
            />
            <Row label={`${BOOKING.climbers} climbers`} border />
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>What's included</SectionLabel>
          <Card className="mt-3">
            <ul className="space-y-2.5">
              {BOOKING.included.map((x) => (
                <li key={x} className="flex items-start gap-2.5 text-[12.5px] text-mist">
                  <Check size={14} strokeWidth={2} className="mt-px shrink-0 text-summit" />
                  {x}
                </li>
              ))}
            </ul>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>What's not included</SectionLabel>
          <Card className="mt-3">
            {/* A DASH, not a tick. In the reference design this list used the
                same green tick as the included list, which at a glance reads as
                "you get these too" — the exact misreading the section exists to
                prevent, and the one that turns into an argument in a car park. */}
            <ul className="space-y-2.5">
              {BOOKING.excluded.map((x) => (
                <li key={x} className="flex items-start gap-2.5 text-[12.5px] text-mist-dim">
                  <Minus size={14} strokeWidth={2} className="mt-px shrink-0 text-mist-dim" />
                  {x}
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
              You arrange and pay for these yourself. They are listed here so nothing lands on you
              on the morning.
            </p>
          </Card>
        </Rise>

        <Rise className="pt-7">
          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <SectionLabel>Total ({BOOKING.days} days)</SectionLabel>
                <p className="tnum mt-1.5 text-[11.5px] text-mist-dim">
                  {formatEur(BOOKING.dayRate)} / day
                </p>
              </div>
              <p className="tnum text-[24px] font-light text-azure">
                {formatEur(BOOKING.pricing.guideFee)}
              </p>
            </div>
            <p className="mt-2.5 border-t border-hairline pt-2.5 text-[11px] text-mist-dim">
              ICEFALL's {BOOKING.serviceFeePct}% service fee is added at the next step.
            </p>
          </Card>

          <Button size="lg" className="mt-4 w-full" onClick={() => navigate("/book/payment")}>
            Continue to payment
          </Button>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-mist-dim">
            <Lock size={11} strokeWidth={1.8} />
            Card details are handled by our payment provider, never by ICEFALL
          </p>

          <Disclaimer className="mt-4">{PAYMENTS_NOT_CONNECTED}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Row({ label, value, border }: { label: string; value?: string; border?: boolean }) {
  return (
    <button
      type="button"
      className={cnRow(border)}
      aria-label={label}
    >
      <span className="min-w-0 flex-1 truncate text-left text-[13.5px] text-snow">{label}</span>
      {value && <span className="tnum shrink-0 text-[12.5px] text-mist">{value}</span>}
      <ChevronRight size={16} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
    </button>
  );
}

const cnRow = (border?: boolean) =>
  `flex w-full items-center gap-3 px-4 py-3.5 ${border ? "border-t border-hairline" : ""}`;
