import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, CalendarDays, ChevronRight, Lock, ShieldCheck, Star, Users } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/primitives";
import { useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { StripeMark } from "./PayMarks";
import { BOOKING, GUIDE } from "@/screens/booking/data";
import { formatEur } from "@/money/model";

/* -------------------------------------------------------------------------- */
/* Guide identity                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The verified tick.
 *
 * It is a BUTTON, not decoration, and what it opens is the exact sentence
 * ICEFALL is entitled to say: a member of staff read this guide's documents on
 * a date, and did not ring the association. A bare tick means "trust this
 * person" to someone about to follow them onto a glacier, and ICEFALL has not
 * earned the right to say that much.
 */
export function VerifiedTick({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={GUIDE.verificationSentence}
      aria-label={GUIDE.verificationSentence}
      className="shrink-0 text-azure transition-opacity hover:opacity-80"
    >
      <BadgeCheck size={15} strokeWidth={2} />
    </button>
  );
}

export function GuideRow({
  compact,
  onVerified,
}: {
  compact?: boolean;
  onVerified?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded-full border border-hairline-strong bg-slate",
          compact ? "h-11 w-11" : "h-14 w-14",
        )}
      >
        <img src={GUIDE.photo} alt="" aria-hidden className="h-full w-full object-cover" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={cn("truncate text-snow", compact ? "text-[14px]" : "text-[16px]")}>
            {GUIDE.name}
          </p>
          <VerifiedTick onClick={onVerified} />
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-mist">{GUIDE.credential}</p>

        {compact ? (
          <Link to="/explore/guides" className="mt-1 inline-flex items-center gap-0.5 text-[11.5px] text-azure">
            View profile <ChevronRight size={12} strokeWidth={1.9} />
          </Link>
        ) : (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="flex items-center gap-[1px]" aria-hidden>
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  size={11}
                  strokeWidth={1.6}
                  className={i <= Math.round(GUIDE.rating) ? "text-azure" : "text-mist-dim/50"}
                  fill={i <= Math.round(GUIDE.rating) ? "currentColor" : "none"}
                />
              ))}
            </span>
            <span className="tnum text-[12px] text-snow">{GUIDE.rating.toFixed(1)}</span>
            <span className="tnum text-[11.5px] text-mist-dim">({GUIDE.reviews})</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The objective                                                               */
/* -------------------------------------------------------------------------- */

export function MountainRow({ compact }: { compact?: boolean }) {
  const art = useMountainImage({
    name: BOOKING.peak,
    elevationM: BOOKING.elevationM,
    lat: BOOKING.lat,
    lon: BOOKING.lon,
  });

  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "block shrink-0 overflow-hidden rounded-tile border border-hairline bg-slate",
          compact ? "h-11 w-11" : "h-14 w-14",
        )}
      >
        <img src={art.src} alt="" aria-hidden className="h-full w-full object-cover" />
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate uppercase tracking-[0.08em] text-snow", compact ? "text-[13px]" : "text-[14px]")}>
          {BOOKING.peak}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-mist">{BOOKING.route}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-mist-dim">
          <span className="tnum flex items-center gap-1.5">
            <CalendarDays size={11} strokeWidth={1.7} />
            {BOOKING.dateLabel}
          </span>
          <span className="tnum flex items-center gap-1.5">
            <Users size={11} strokeWidth={1.7} />
            {BOOKING.climbers} climbers
          </span>
        </div>
      </div>
    </div>
  );
}

/** Guide + mountain, the block that repeats on payment and review. */
export function BookingSummary({ onVerified }: { onVerified?: () => void }) {
  return (
    <>
      <SectionLabel>Booking summary</SectionLabel>
      <Card className="mt-3" inset={false}>
        <div className="p-4">
          <GuideRow compact onVerified={onVerified} />
        </div>
        <div className="border-t border-hairline p-4">
          <MountainRow compact />
        </div>
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Price                                                                       */
/* -------------------------------------------------------------------------- */

export function PriceLines({ onFeeInfo }: { onFeeInfo?: () => void }) {
  const p = BOOKING.pricing;
  return (
    <Card className="mt-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[13px] text-snow">Guiding service ({BOOKING.days} days)</p>
          <p className="tnum mt-0.5 text-[11.5px] text-mist-dim">
            {formatEur(BOOKING.dayRate)} / day
          </p>
        </div>
        <p className="tnum shrink-0 text-[14px] text-snow">{formatEur(p.guideFee)}</p>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={onFeeInfo}
          className="flex items-center gap-1.5 text-[13px] text-mist transition-colors hover:text-snow"
        >
          ICEFALL service fee ({BOOKING.serviceFeePct}%)
          <span className="grid h-[14px] w-[14px] place-items-center rounded-full border border-hairline-strong text-[9px] text-mist-dim">
            i
          </span>
        </button>
        <p className="tnum shrink-0 text-[14px] text-snow">{formatEur(p.serviceFee)}</p>
      </div>

      <div className="mt-3.5 flex items-baseline justify-between gap-3 border-t border-hairline pt-3.5">
        <p className="text-[14px] text-snow">Total</p>
        <p className="tnum text-[19px] font-light text-azure">{formatEur(p.total)}</p>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* What happens next                                                           */
/* -------------------------------------------------------------------------- */

const STEPS = [
  ["Booking confirmed", "You'll get a confirmation with everything in one place."],
  ["Guide notified", `${GUIDE.firstName} is told straight away and will be in touch within 24 hours.`],
  ["Plan together", "Itinerary, logistics, and anything particular to you."],
  ["Be ready", "Prepare for your objective — ICEFALL's training plan follows your dates."],
  ["Summit", "The part nobody can promise you. Go well."],
] as const;

export function WhatHappensNext() {
  return (
    <div>
      <SectionLabel>What happens next</SectionLabel>
      <ol className="mt-4 space-y-0">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <span className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-full border border-azure/45 text-[11px] text-azure">
                {i + 1}
              </span>
              {i < STEPS.length - 1 && <span className="my-1 w-px flex-1 bg-hairline" />}
            </div>
            <div className={cn("min-w-0", i < STEPS.length - 1 && "pb-5")}>
              <p className="text-[13.5px] text-snow">{title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-mist">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Trust                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The reassurance block.
 *
 * Every claim here is one ICEFALL can actually stand behind. Deliberately NOT
 * said, because they are the usual wording and they are not true: "100% secure"
 * (nobody can promise that), and "all guides are verified" — ICEFALL reads the
 * documents a guide uploads, which is a real check but a much narrower claim
 * than the phrase implies. The wording below is what the verification screen
 * says, so a client cannot be told two different things.
 */
export function TrustBlock() {
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} strokeWidth={1.6} className="mt-px shrink-0 text-azure" />
          <div>
            <p className="text-[13.5px] text-snow">Booking through ICEFALL</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
              Card details go straight to our payment provider — ICEFALL never sees or stores your
              card number. Your money is held until the day you meet your guide.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <TrustTile
          title="Documents checked"
          body="We read every guide's licence, insurance and first aid before they can list. We do not contact the issuing association."
        />
        <TrustTile
          title="Payments"
          body={
            <>
              Processed by <StripeMark className="inline-block h-3.5 w-auto align-[-2px] text-snow" />
              <span className="sr-only">Stripe</span>. Encrypted in transit, PCI-compliant.
            </>
          }
        />
      </div>

      <Card>
        <p className="text-[13px] text-snow">Need help?</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
          Support is not staffed yet — this build has no inbox behind it. When it is, the address
          will be here.
        </p>
      </Card>
    </div>
  );
}

function TrustTile({ title, body }: { title: string; body: ReactNode }) {
  return (
    <Card>
      <Lock size={14} strokeWidth={1.7} className="text-mist-dim" />
      <p className="mt-2.5 text-[12.5px] text-snow">{title}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{body}</p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Step header                                                                 */
/* -------------------------------------------------------------------------- */

export function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex items-center gap-2 pb-4 pt-6">
      <button
        onClick={onBack}
        aria-label="Back"
        className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
      >
        <ChevronRight size={20} strokeWidth={1.6} className="rotate-180" />
      </button>
      <h1 className="flex-1 text-center text-[13px] uppercase tracking-[0.18em] text-snow">
        {title}
      </h1>
      <span className="h-10 w-10 shrink-0" aria-hidden />
    </header>
  );
}
