import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, Lock, ShieldCheck, UserRound, Users } from "lucide-react";
import { Button, Card, SectionLabel } from "@/components/ui/primitives";
import { useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { BOOKING, FEE_DISCLOSURE, GUIDE } from "@/screens/booking/data";
import { formatEur } from "@/money/model";

/* -------------------------------------------------------------------------- */
/* Guide identity                                                              */
/* -------------------------------------------------------------------------- */

/**
 * THE VERIFIED TICK IS GONE, AND SO ARE THE STARS.
 *
 * This block used to render a tick that opened "Documents checked by ICEFALL on
 * 5 Jun 2026", and, in its full-size form, a five-star row reading 4.9 (127).
 * Both were invented. ICEFALL has read nobody's documents and holds no reviews
 * to average, and a tick plus a rating beside a name is precisely the pair a
 * client reads as "this person has been checked and other people were happy" —
 * the two claims most likely to decide who they follow onto a glacier.
 *
 * What stands in their place is the guide's own claim about their licence,
 * labelled as a claim, and one sentence saying ICEFALL has not checked it. That
 * is less reassuring and it is what is true. If document checks are ever run,
 * the record comes back carrying the date they actually happened.
 */
export function GuideRow({ compact }: { compact?: boolean }) {
  if (GUIDE === null) return <NoGuideRow compact={compact} />;

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
        <p className={cn("truncate text-snow", compact ? "text-[14px]" : "text-[16px]")}>
          {GUIDE.name}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-mist">{GUIDE.claimedCredential}</p>

        {compact ? (
          <Link
            to="/explore/guides"
            className="mt-1 inline-flex items-center gap-0.5 text-[11.5px] text-azure"
          >
            View profile <ChevronRight size={12} strokeWidth={1.9} />
          </Link>
        ) : (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
            ICEFALL has not checked this licence.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * What the row is in an ordinary build: empty.
 *
 * The layout has to survive having no guide, because in production there is
 * none — and an avatar with a plausible name dropped into the gap is how the
 * fabricated guide got here in the first place.
 */
function NoGuideRow({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full border border-dashed border-hairline-strong text-mist-dim",
          compact ? "h-11 w-11" : "h-14 w-14",
        )}
      >
        <UserRound size={compact ? 17 : 21} strokeWidth={1.4} />
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-mist", compact ? "text-[14px]" : "text-[16px]")}>
          No guide attached
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-mist-dim">
          Nobody has listed with ICEFALL yet
        </p>
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
export function BookingSummary() {
  return (
    <>
      <SectionLabel>Booking summary</SectionLabel>
      <Card className="mt-3" inset={false}>
        <div className="p-4">
          <GuideRow compact />
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

/**
 * ONE LINE AND A TOTAL, AND THEY ARE THE SAME NUMBER.
 *
 * There was a second row here — "ICEFALL service fee (5%)" with its own amount
 * and an (i) that opened an explainer — because the model added a fee on top of
 * the guide's rate. It does not any more: ICEFALL's 10% is deducted from what
 * the guide receives, so the client's total is the guide's rate and nothing
 * else, and a fee row would be charging them for something twice.
 *
 * The disclosure below is not a charge. It says where ICEFALL's money comes
 * from, which the client is entitled to know and which is a statement about the
 * guide's earnings rather than about their bill.
 */
export function PriceLines() {
  return (
    <Card className="mt-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[13px] text-snow">Guiding service ({BOOKING.days} days)</p>
          <p className="tnum mt-0.5 text-[11.5px] text-mist-dim">
            {formatEur(BOOKING.dayRate)} / day
          </p>
        </div>
        <p className="tnum shrink-0 text-[14px] text-snow">{formatEur(BOOKING.totals.total)}</p>
      </div>

      <div className="mt-3.5 flex items-baseline justify-between gap-3 border-t border-hairline pt-3.5">
        <p className="text-[14px] text-snow">Total</p>
        <p className="tnum text-[19px] font-light text-azure">{formatEur(BOOKING.totals.total)}</p>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{FEE_DISCLOSURE}</p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* What happens next                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Written in the conditional, because none of it happens yet. The guide step
 * names the guide only when there is one — with no listing attached, "Tomás is
 * told straight away" would be a promise about a person who is not there.
 */
const STEPS: readonly (readonly [string, string])[] = [
  ["Booking confirmed", "You would get a confirmation with everything in one place."],
  [
    "Guide notified",
    GUIDE
      ? `${GUIDE.firstName} would be told straight away and would be in touch within 24 hours.`
      : "Your guide would be told straight away and would be in touch within 24 hours.",
  ],
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
 * Every claim here is one ICEFALL can actually stand behind, and after the
 * verification record came out of this flow that meant putting the rest of the
 * block into the same tense. It previously read "Card details go straight to our
 * payment provider", "Processed by Stripe. Encrypted in transit, PCI-compliant"
 * and "We read every guide's licence, insurance and first aid before they can
 * list" — three present-tense descriptions of infrastructure that does not
 * exist. No processor is connected, none has been chosen publicly, and no
 * guide's documents have ever been read. Describing an intention in the present
 * tense is how an intention gets read as a fact.
 *
 * Still deliberately NOT said, because they are the usual wording and they are
 * not true: "100% secure" (nobody can promise that), and "all guides are
 * verified" — reading the documents a guide uploads is a real check but a much
 * narrower claim than the phrase implies.
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
              None of this is running yet. When payments are connected, card details will go
              straight to the provider — ICEFALL will never see or store your card number — and
              your money will be held until the day you meet your guide.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <TrustTile
          title="Document checks"
          body="No guide's documents have been read, because no guide has listed. When they can, we will read the licence, insurance and first aid before a listing goes live — and we will not contact the issuing association."
        />
        <TrustTile
          title="Payments"
          body="No payment provider is connected. When one is, card entry will run inside its own hosted fields, so the number never reaches ICEFALL."
        />
      </div>

      {/* THIS SAID SUPPORT DID NOT EXIST, AND IT NOW DOES. The sentence here
          was "Support is not staffed yet — this build has no inbox behind it",
          written when the only contact route was a `mailto:` at an address
          nobody read. There is a desk now: a request from this screen is
          stored and comes back with a reference. The type is pre-set to
          `booking`, because that is what somebody standing on a checkout
          screen is asking about. */}
      <Card>
        <p className="text-[13px] text-snow">Need help?</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
          A question about this booking goes to ICEFALL's support desk and comes back with a
          reference. No reply time is promised — nobody has been answered there yet.
        </p>
        <Button asChild variant="secondary" size="sm" className="mt-3.5">
          <Link to="/settings/contact?type=booking">Contact support</Link>
        </Button>
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
