import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Check, CreditCard, Lock, ShieldCheck, Users } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import {
  BookingSummary,
  PriceLines,
  StepHeader,
  TrustBlock,
  WhatHappensNext,
} from "@/components/booking/parts";
import { BOOKING, BOOKING_NOTICE } from "./data";
import { PAYMENTS_NOT_CONNECTED, formatEur, refundFor } from "@/money/model";
import { cn } from "@/lib/utils";

/** Step 3 of 3 — the last screen before money would move. */
export default function Review() {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);

  const freeUntil = new Date(
    new Date(BOOKING.departureIso).getTime() - 14 * 86_400_000,
  ).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // Computed, not asserted: what they would actually get back today.
  const today = refundFor(BOOKING.cancellation, {
    paid: BOOKING.totals.total,
    departureIso: BOOKING.departureIso,
    by: "client",
  });

  return (
    <Screen>
      <Stagger>
        <StepHeader title="Review & confirm" onBack={() => navigate(-1)} />

        {/* THE "SECURE CHECKOUT" CARD IS GONE.
            A green-ticked panel at the top of this screen said "Your card
            details are entered with our payment provider and encrypted in
            transit" — present tense, about a provider that does not exist, on
            the last screen before someone believes money is moving. The true
            version of that sentence is in `TrustBlock` below in the tense it
            belongs in, and `PAYMENTS_NOT_CONNECTED` sits beside the confirm
            button, which is where the claim would actually be acted on. */}
        <Rise>
          <BookingSummary />
        </Rise>

        <Rise className="pt-3">
          <Disclaimer>{BOOKING_NOTICE}</Disclaimer>
        </Rise>

        <Rise className="pt-4">
          <PriceLines />
        </Rise>

        {/* ---- Method --------------------------------------------------------- */}
        {/* THERE IS NO CARD, SO NO CARD IS DRAWN.
            This row used to render a Visa mark and "•••• 4242 · Change" — the
            exact fabricated payment record `screens/auth/Trial.tsx` bans by
            name. Nothing has ever taken a card, nothing stores one, and a
            masked number beside a brand mark is read as "my card is on file"
            on the last screen before someone believes money moves. The row
            below says what is actually true and keeps the way back to the
            method step. */}
        <Rise className="pt-6">
          <SectionLabel>Payment method</SectionLabel>
          <Card className="mt-3">
            <div className="flex items-center gap-3">
              <CreditCard size={17} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
              <span className="flex-1 text-[13px] text-mist">No card is stored</span>
              <button
                onClick={() => navigate("/book/payment")}
                className="shrink-0 text-[12.5px] text-azure"
              >
                Back
              </button>
            </div>
          </Card>
        </Rise>

        {/* ---- Terms ----------------------------------------------------------- */}
        <Rise className="pt-6">
          <Card inset={false}>
            <Detail icon={Users} label="Booking for" value={`${BOOKING.climbers} climbers`} />
            <Detail
              icon={CalendarClock}
              label="Guide availability"
              value={BOOKING.dateLabel}
              border
            />
            <div className="border-t border-hairline px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5 text-[13px] text-mist">
                  <ShieldCheck size={15} strokeWidth={1.6} className="text-mist-dim" />
                  Cancellation
                </span>
                <span className="text-[13px] text-summit">{BOOKING.cancellationLabel}</span>
              </div>
              <p className="mt-2 pl-[26px] text-[11.5px] leading-relaxed text-mist-dim">
                Free cancellation until <span className="text-mist">{freeUntil}</span> — 14 days
                before you start. Cancelling today returns{" "}
                <span className="tnum text-mist">{formatEur(today.refund)}</span> of{" "}
                {formatEur(BOOKING.totals.total)}.
              </p>
              <p className="mt-2 pl-[26px] text-[11.5px] leading-relaxed text-mist-dim">
                If the guide judges the route unsafe, or conditions prevent an attempt, you are
                refunded in full — including on the morning.
              </p>
            </div>
          </Card>
        </Rise>

        {/* ---- Agree ------------------------------------------------------------ */}
        <Rise className="pt-6">
          <button
            onClick={() => setAgreed((a) => !a)}
            className="flex w-full items-start gap-3 text-left"
          >
            <span
              className={cn(
                "mt-px grid h-[20px] w-[20px] shrink-0 place-items-center rounded-[6px] border transition-colors",
                agreed ? "border-azure bg-azure text-obsidian" : "border-hairline-strong",
              )}
            >
              {agreed && <Check size={13} strokeWidth={2.6} />}
            </span>
            <span className="text-[12.5px] leading-relaxed text-mist">
              I have read and agree to the{" "}
              <span className="text-azure">Terms of Service</span> and{" "}
              <span className="text-azure">Privacy Policy</span>.
            </span>
          </button>
        </Rise>

        <Rise className="pt-5">
          {/* Disabled for two reasons, and only one of them is temporary: nothing
              is connected, AND the box is unticked. The second guard stays. */}
          <Button size="lg" className="w-full" disabled>
            <Lock size={15} strokeWidth={1.8} />
            Confirm &amp; book
          </Button>
          <p className="tnum mt-3 text-center text-[12px] text-mist">
            You would be charged {formatEur(BOOKING.totals.total)}
          </p>
          {!agreed && (
            <p className="mt-1.5 text-center text-[11px] text-mist-dim">
              Agree to the terms to continue
            </p>
          )}
          <Disclaimer className="mt-4">{PAYMENTS_NOT_CONNECTED}</Disclaimer>
        </Rise>

        <Rise className="pt-9">
          <WhatHappensNext />
        </Rise>

        <Rise className="pt-9">
          <TrustBlock />
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  border,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: string;
  border?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3.5",
        border && "border-t border-hairline",
      )}
    >
      <span className="flex items-center gap-2.5 text-[13px] text-mist">
        <Icon size={15} strokeWidth={1.6} className="text-mist-dim" />
        {label}
      </span>
      <span className="tnum text-[13px] text-snow">{value}</span>
    </div>
  );
}
