import { useState } from "react";
import { peakImage } from "./peakPlate";
import { Link } from "react-router-dom";
import {
  ArrowRight, Building2, CalendarDays, FileText, MapPin, MessageSquare, Mountain, Wallet,
} from "lucide-react";
import { Badge, Button, VerifiedTick } from "@/components/ui";
import { DEMO_NOTICE, EXPEDITIONS, IS_DEMO, type Expedition } from "@/data/demo";
import { formatEur } from "@/money/model";
import { cn } from "@/lib/utils";
import { DEPARTURE_ISO as SHARED_DEPARTURE_ISO } from "./trip";

/**
 * Bookings — what you have booked, and the itinerary behind it.
 *
 * ── THE PAGE MOST AT RISK OF LYING ──────────────────────────────────────────
 *
 * A page headed "Bookings" implies three things ICEFALL does not do: it took
 * your money, it holds your dates, and it can change or cancel them for you.
 * None of that is true and none of it is close to true — there is no payment
 * processor, no server and no agreement with any company. So the money panel is
 * not a footnote here, it is a fixture: it renders in every state, including
 * production where there is no booking at all, because the statement it makes
 * is a fact about ICEFALL rather than a detail of a booking.
 *
 * Expeditions are also the one thing ICEFALL will never charge for even once a
 * processor is live (see `money/model.ts`): a €50k trip is settled by wire and
 * contract with the operator over months, and the operators sit in countries our
 * provider cannot pay out to. What ICEFALL sells a company is the introduction.
 * The climber pays the company. That is stated here rather than deferred.
 *
 * ── HOW THAT IS SAID, AFTER THE TIGHTENING PASS ─────────────────────────────
 *
 * All of the above used to be on screen, in about fifteen grey paragraphs: the
 * money panel apologised three times, the Past card explained twice why it was
 * empty, every Fact carried a caveat and the disabled buttons had an essay
 * defending themselves. Honesty repeated is not more honest, it just buries the
 * trip. The rule now is: the claim is made once, in the money panel, in two
 * short sentences; everything else that used to be a paragraph is a label
 * ("None", "Their terms", "Needs an account", "None yet"). The reasoning lives
 * in comments like this one. Nothing was softened — only said once.
 */

/**
 * The demo booking's first day.
 *
 * Invented, like the rest of the demo — the expedition data carries a season
 * ("Apr – May") and nothing finer, and an itinerary needs a date to hang off.
 * Chosen so the 62 days land inside the window the operator publishes: a demo
 * booking running outside its own listed months is the sort of small
 * inconsistency that makes everything around it look invented too.
 */
const START_ISO = SHARED_DEPARTURE_ISO;

/**
 * Dates here are calendar days, not instants, so they are formatted in UTC. A
 * browser west of Greenwich would otherwise render day one as the day before.
 */
const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const LONG_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function dayOf(startIso: string, day: number): Date {
  const d = new Date(`${startIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (day - 1));
  return d;
}

interface Stage {
  key: string;
  label: string;
  detail: string;
  /** Weight, not a percentage — the shares are normalised before use. */
  share: number;
}

/**
 * The shape of an expedition, in phases rather than days.
 *
 * Deliberately generic. These are the stages every expedition of this kind runs
 * through, which is a real thing to say; a per-day schedule naming huts, camps
 * and dates would be a document ICEFALL invented and attributed to a company.
 *
 * The details are fragments, not sentences. Seven rows of prose is a wall; seven
 * rows of six words is a timeline you can read in one pass.
 */
const STAGES: readonly Stage[] = [
  {
    key: "arrive",
    label: "Arrive and brief",
    detail: "Team, permits, kit check.",
    share: 5,
  },
  {
    key: "walk-in",
    label: "Walk in",
    detail: "Approach to base camp, paced for acclimatisation.",
    share: 18,
  },
  {
    key: "base",
    label: "Base camp established",
    detail: "Camp built, ropes and skills, altitude adjustment.",
    share: 10,
  },
  {
    key: "rotations",
    label: "Acclimatisation rotations",
    detail: "Carries and nights higher, then down to recover.",
    share: 32,
  },
  {
    key: "rest",
    label: "Rest low",
    detail: "Thicker air, proper food and sleep.",
    share: 13,
  },
  {
    key: "window",
    label: "Summit window",
    detail: "Wait on the forecast, then push.",
    share: 14,
  },
  {
    key: "out",
    label: "Strip camp and travel home",
    detail: "Clear the mountain, carry out, fly home.",
    share: 8,
  },
];

interface Leg extends Stage {
  startDay: number;
  endDay: number;
}

/**
 * Spread the phases across the days the operator publishes.
 *
 * The cumulative share is what gets rounded, never each stage on its own:
 * rounding stage by stage lets the errors accumulate until the timeline ends a
 * day or two away from the duration it was derived from, and a reader comparing
 * "62 days" at the top with a last row saying day 60 has caught the page being
 * sloppy about the one number that matters. The final stage is pinned to the
 * last day outright, so the two cannot disagree at all.
 */
function legsFor(days: number): Leg[] {
  // A four-day trip does not have seven phases. Trimming beats squeezing them
  // in, which would produce rows covering no days.
  const stages = STAGES.slice(0, Math.max(1, Math.min(STAGES.length, days)));
  const total = stages.reduce((sum, s) => sum + s.share, 0);

  const legs: Leg[] = [];
  let cumulative = 0;
  let startDay = 1;

  stages.forEach((stage, i) => {
    cumulative += stage.share;
    const isLast = i === stages.length - 1;
    const rounded = Math.round((cumulative / total) * days);
    // Keep one day in hand for every stage still to come.
    const roomLeft = days - (stages.length - 1 - i);
    const endDay = isLast ? days : Math.max(startDay, Math.min(rounded, roomLeft));
    legs.push({ ...stage, startDay, endDay });
    startDay = endDay + 1;
  });

  return legs;
}

export default function Bookings() {
  // Empty in a production build — `EXPEDITIONS` is itself gated on IS_DEMO.
  const booking: Expedition | undefined = IS_DEMO ? EXPEDITIONS[0] : undefined;

  // Upcoming and Past used to stack, which put a large empty card between the
  // one thing on this page worth reading and the bottom of the screen. As tabs,
  // Past costs a count in a pill until it has something in it.
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const upcomingCount = booking === undefined ? 0 : 1;

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">Bookings</h1>
          <p className="mt-1.5 text-[13px] text-mist">Your trips and the itineraries behind them.</p>
        </div>

        <div className="inline-flex rounded-pill border border-hairline bg-graphite p-1">
          <TabButton
            label="Upcoming"
            count={upcomingCount}
            active={tab === "upcoming"}
            onClick={() => setTab("upcoming")}
          />
          <TabButton
            label="Past"
            count={0}
            active={tab === "past"}
            onClick={() => setTab("past")}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0">
          {tab === "past" ? (
            // A trip lands here only after ICEFALL arranged it and it finished.
            // Never backfilled from mountains a user claims — a record is worth
            // having only if the app watched it happen.
            <EmptyCard title="None yet" />
          ) : booking === undefined ? (
            <NothingBooked />
          ) : (
            <UpcomingBooking expedition={booking} />
          )}
        </div>

        <MoneyPanel expedition={booking} />
      </div>

      {booking !== undefined && (
        <p className="mt-8 border-l-2 border-azure/30 pl-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE}
        </p>
      )}
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 rounded-pill px-4 py-1.5 text-[12.5px] transition-colors",
        active ? "bg-elevated text-snow" : "text-mist hover:text-snow",
      )}
    >
      {label}
      <span className={cn("tnum text-[11px]", active ? "text-azure" : "text-mist-dim")}>{count}</span>
    </button>
  );
}

function EmptyCard({ title }: { title: string }) {
  return (
    <div className="rounded-card border border-hairline bg-graphite px-6 py-14 text-center">
      <p className="text-[14px] text-mist">{title}</p>
    </div>
  );
}

function UpcomingBooking({ expedition }: { expedition: Expedition }) {
  const legs = legsFor(expedition.durationDays);
  const firstDay = dayOf(START_ISO, 1);
  const lastDay = dayOf(START_ISO, expedition.durationDays);

  return (
    <section className="overflow-hidden rounded-card border border-hairline bg-graphite">
      <div className="relative h-[210px]">
        <img
          src={peakImage(expedition.heroPeak)}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div aria-hidden className="scrim-bottom absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 p-6">
          <Badge tone="azure">Demo booking</Badge>
          <h2 className="mt-3 text-[26px] font-light tracking-[-0.02em] text-snow">
            {expedition.objective}
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-mist">
            <Building2 size={13} strokeWidth={1.8} className="text-azure" />
            {expedition.company}
            <VerifiedTick verifiedOn={expedition.verifiedOn} size={13} />
            <span className="text-mist-dim">·</span>
            <MapPin size={13} strokeWidth={1.8} className="text-azure" />
            {expedition.country}
          </p>
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-4 border-b border-hairline p-6 sm:grid-cols-3">
        {/* Notes are labels, never caveats. The caveat is made once, in the
            money panel: no money taken, no dates held. */}
        <Fact
          icon={CalendarDays}
          label="Dates"
          value={`${LONG_DATE.format(firstDay)} – ${LONG_DATE.format(lastDay)}`}
          note={`${expedition.months} departure · not held`}
        />
        <Fact
          icon={Mountain}
          label="On the mountain"
          value={`${expedition.durationDays} days`}
          note="Door to door"
        />
        <Fact
          icon={Wallet}
          label="From"
          value={formatEur(expedition.fromEur)}
          note="Indicative"
        />
      </div>

      <div className="p-6">
        {/* The provenance line is a label, not a paragraph. What it replaces:
            these phases are derived in proportion from the duration the company
            publishes — nobody sent us a schedule, nobody has committed to one,
            and on the hill rotations stretch and windows move anyway. The only
            fixed points are the fly-in day and the day the permit ends. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="section-label">Day by day</p>
          <span className="text-[11px] text-mist-dim">
            Derived from {expedition.durationDays} days · not the company's schedule
          </span>
        </div>

        <ol className="mt-5">
          {legs.map((leg, i) => {
            const from = dayOf(START_ISO, leg.startDay);
            const to = dayOf(START_ISO, leg.endDay);
            const isLast = i === legs.length - 1;
            return (
              <li key={leg.key} className="relative flex gap-4 pb-5 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-[5px] top-3.5 w-px bg-hairline-strong"
                  />
                )}
                <span
                  aria-hidden
                  className={cn(
                    "relative mt-2 h-[11px] w-[11px] shrink-0 rounded-full border",
                    // The summit window is the one stage the whole trip is built
                    // around, so it is the one that is filled in.
                    leg.key === "window" ? "border-azure bg-azure" : "border-azure/50 bg-obsidian",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="section-label tnum text-azure/80">
                      {leg.startDay === leg.endDay
                        ? `Day ${leg.startDay}`
                        : `Days ${leg.startDay}–${leg.endDay}`}
                    </span>
                    <span className="text-[13.5px] text-snow">{leg.label}</span>
                    <span className="tnum ml-auto text-[11.5px] text-mist-dim">
                      {SHORT_DATE.format(from)}
                      {leg.startDay !== leg.endDay && ` – ${SHORT_DATE.format(to)}`}
                    </span>
                  </div>
                  <p className="mt-1 max-w-[70ch] text-[12px] text-mist">{leg.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-hairline pt-5">
          <Button variant="secondary" size="sm" disabled>
            <MessageSquare size={14} strokeWidth={1.8} />
            Message the company
          </Button>
          <Button variant="ghost" size="sm" disabled>
            <FileText size={14} strokeWidth={1.8} />
            Save the itinerary
          </Button>
          {/* Disabled, not broken: there is no server to carry a message or
              build a file. A button that quietly does nothing is worse than one
              that admits it — but it admits it in three words, not a paragraph. */}
          <span className="text-[11px] text-mist-dim">Needs an account</span>
        </div>
      </div>
    </section>
  );
}

/**
 * The production state.
 *
 * What this used to say in two paragraphs: there are no accounts, no bookings
 * and no agreements with any company yet, so there is no trip in progress and no
 * enquiry waiting on a reply. When there is one, this card holds the published
 * dates, the itinerary the company sent, and the state of the arrangement — but
 * never the money. All of that is either obvious from "Nothing booked" or
 * already stated once in the money panel, so on screen it is a heading and a way
 * out of the empty state.
 */
function NothingBooked() {
  return (
    <div className="rounded-card border border-hairline bg-graphite px-6 py-12 text-center">
      <p className="text-[15px] text-snow">Nothing booked</p>
      <Link
        to="/app/explore"
        className="mt-5 inline-flex items-center gap-2 rounded-tile border border-azure/45 px-4 py-2.5 text-[12.5px] text-azure transition-colors hover:bg-azure/10"
      >
        Explore expeditions
        <ArrowRight size={14} strokeWidth={1.9} />
      </Link>
    </div>
  );
}

/**
 * Payment and status — the page's ONE explanatory block.
 *
 * Renders whether or not there is a booking, because the point it makes does not
 * depend on one. The figures are the honest zeroes rather than a total: someone
 * scanning this page for "how much have I paid and who has it" gets the answer
 * without reading a paragraph.
 *
 * Deleted from view, kept here because it is still true:
 *  • No payment provider is connected, no card is on file, and no account exists
 *    with the user's name against it.
 *  • An expedition is not an in-app purchase and is not planned to become one.
 *    A €50k trip settles by wire and contract over months, and most operators
 *    sit in countries our provider cannot pay out to. ICEFALL never sits in the
 *    middle, never sees a card, and has nothing it could refund.
 *  • Cancellation terms are the company's, in the document the climber signed
 *    with them. ICEFALL holds no copy and cannot cancel, move or amend anything.
 *  • A place on a departure is confirmed by the company, never by this page.
 * On screen that is two sentences and five rows, because saying it five times
 * does not make it truer — it just hides the trip.
 */
function MoneyPanel({ expedition }: { expedition?: Expedition }) {
  return (
    <aside className="min-w-0 rounded-card border border-hairline bg-graphite p-5 xl:sticky xl:top-[84px]">
      <div className="flex items-center gap-2">
        <Wallet size={15} strokeWidth={1.7} className="text-azure" />
        <p className="section-label">Payment and status</p>
      </div>

      <p className="mt-3.5 text-[13px] leading-relaxed text-snow">
        ICEFALL takes no money and holds no dates. You pay{" "}
        {expedition?.company ?? "the company"} directly, on their terms.
      </p>

      <dl className="mt-4 divide-y divide-hairline border-y border-hairline">
        <Row label="Charged by ICEFALL" value={formatEur(0)} />
        <Row label="Held by ICEFALL" value={formatEur(0)} />
        <Row
          label="Quoted by the company"
          value={expedition === undefined ? "—" : `${formatEur(expedition.fromEur)} from`}
          note={expedition === undefined ? undefined : "Indicative"}
        />
        <Row label="Deposit and balance" value="Their terms" />
        <Row label="Cancellation" value="Their terms" />
        <Row label="Dates held" value="None" />
      </dl>
    </aside>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="shrink-0 text-[12px] text-mist">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className="tnum block text-[12.5px] text-snow">{value}</span>
        {note !== undefined && (
          <span className="mt-0.5 block text-[10.5px] leading-relaxed text-mist-dim">{note}</span>
        )}
      </dd>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] text-mist-dim">
        <Icon size={13} strokeWidth={1.7} className="text-azure/70" />
        {label}
      </p>
      <p className="tnum mt-1.5 text-[14px] text-snow">{value}</p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-mist-dim">{note}</p>
    </div>
  );
}
