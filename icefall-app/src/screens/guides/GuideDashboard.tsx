import { useMemo, useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Send, X } from "lucide-react";
import { Badge, Button, Card, Disclaimer, Metric, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { fmtDate, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useGuideStore } from "@/guides/store";
import type { GuideQuote, GuideRequest } from "@/guides/store";
import { AVAILABILITY_LABELS, SPECIALITY_LABELS, type Availability } from "@/guides/types";
import {
  DAY_AVAILABILITY_COPY,
  DEFAULT_CANCELLATION_POLICY,
  EARNINGS_NOT_PAID_NOTICE,
  EXPERIENCE_BAND_COPY,
  GUIDE_VIEW_NOTICE,
  PLATFORM_COMMISSION_PCT,
  platformNetFor,
  REVIEWS_NEED_BOOKINGS_NOTICE,
  VERIFICATION_CATEGORIES,
  VERIFICATION_NOT_RUN_NOTICE,
  earningsFrom,
  quoteTotals,
  useEngagementStore,
  type CancellationPolicy,
  type QuoteLine,
} from "@/guides/engagement";
import {
  addDays,
  formatDateRange,
  monthDays,
  monthLabel,
  mondayFirstIndex,
  shiftMonth,
  todayKey,
} from "@/guides/dates";
import {
  CancellationBlock,
  Caution,
  FieldLabel,
  Money,
  NotKnown,
  PriceBreakdown,
  TextArea,
  TextInput,
} from "./bookingParts";

/**
 * The guide's side of the marketplace, built as an outline.
 *
 * IT IS THE SAME STORE. Every request listed here was queued by the athlete
 * screens on this device, and a reply written here lands on the athlete's
 * thread. That is the point of the outline: the two-sided flow can be walked
 * end to end without a server, and the seams where a server would go are
 * visible rather than described.
 *
 * IT IS NOT A GUIDE ACCOUNT. In a real build this would sit behind its own
 * sign-in and an athlete would never reach it. That is stated at the top of the
 * screen rather than assumed, because a marketplace where the buyer can open the
 * seller's dashboard is not a design anybody should copy.
 *
 * WHAT IT REFUSES TO INVENT: reviews (none exist and none can — a review needs a
 * completed ICEFALL booking), verification (nothing checks anything), and the
 * guide's own listing (empty until the guide types something; an unmarked day is
 * not an available day). Earnings are real arithmetic over local bookings and
 * are labelled as the local records they are.
 */

type Tab = "requests" | "calendar" | "listing" | "business";

const TABS: readonly { value: Tab; label: string }[] = [
  { value: "requests", label: "Requests" },
  { value: "calendar", label: "Calendar" },
  { value: "listing", label: "Listing" },
  { value: "business", label: "Business" },
];

/** How long a quote stands by default. The guide can change it before sending. */
const QUOTE_VALID_DAYS = 14;

export function GuideDashboard() {
  const [tab, setTab] = useState<Tab>("requests");

  return (
    <Screen>
      <ScreenHeader
        title="Guide view"
        subtitle="The other side of the marketplace"
        back="/explore/guides"
        action={<Badge tone="neutral">Outline</Badge>}
      />

      <Stagger>
        <Rise>
          <Caution>{GUIDE_VIEW_NOTICE}</Caution>
        </Rise>

        <Rise className="pt-5">
          <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
        </Rise>

        <Rise className="pt-5">
          {tab === "requests" && <RequestsTab />}
          {tab === "calendar" && <CalendarTab />}
          {tab === "listing" && <ListingTab />}
          {tab === "business" && <BusinessTab />}
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* ========================================================================== */
/* Requests                                                                    */
/* ========================================================================== */

function RequestsTab() {
  const { requests, quotes, bookings } = useGuideStore();
  const { details, quoteTerms, termsForBooking } = useEngagementStore();
  const today = todayKey();

  const bookedRequestIds = useMemo(() => new Set(bookings.map((b) => b.requestId)), [bookings]);

  /**
   * Three piles, because they need three different things from the guide:
   * one wants an answer, one is waiting on the client, one is work in the diary.
   */
  const needsAnswer: GuideRequest[] = [];
  const awaitingClient: GuideRequest[] = [];

  for (const request of requests) {
    if (bookedRequestIds.has(request.id)) continue;
    const quote = quotes.find((q) => q.requestId === request.id && q.status === "open");
    if (quote && quoteTerms[quote.id]) awaitingClient.push(request);
    else needsAnswer.push(request);
  }

  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => (b.fromIso ?? "") >= today || !b.fromIso)
        .sort((a, b) => (a.fromIso ?? "").localeCompare(b.fromIso ?? "")),
    [bookings, today],
  );

  return (
    <div>
      {/* ---- New requests ------------------------------------------------- */}

      <SectionLabel>New requests</SectionLabel>
      <div className="mt-3 space-y-3">
        {needsAnswer.length === 0 ? (
          <Empty>
            No requests waiting. Queue one from a guide's profile on the athlete side and it appears
            here — same device, same store.
          </Empty>
        ) : (
          needsAnswer.map((request) => (
            <RequestCard key={request.id} request={request} detail={details[request.id]} />
          ))
        )}
      </div>

      {/* ---- Awaiting the client ------------------------------------------ */}

      {awaitingClient.length > 0 && (
        <>
          <SectionLabel className="mt-8">Quoted — waiting on the client</SectionLabel>
          <div className="mt-3 space-y-3">
            {awaitingClient.map((request) => (
              <RequestCard key={request.id} request={request} detail={details[request.id]} quoted />
            ))}
          </div>
        </>
      )}

      {/* ---- Upcoming bookings -------------------------------------------- */}

      <SectionLabel className="mt-8">Upcoming bookings</SectionLabel>
      <div className="mt-3 space-y-3">
        {upcoming.length === 0 ? (
          <Empty>Nothing in the diary. Accepted quotes land here.</Empty>
        ) : (
          upcoming.map((booking) => {
            const terms = termsForBooking(booking.id);
            return (
              <Card key={booking.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] text-snow">
                      {booking.peakName || "Objective not named"}
                    </p>
                    <p className="tnum mt-1 text-[12px] text-mist">
                      {booking.fromIso && booking.toIso ? (
                        formatDateRange(booking.fromIso, booking.toIso)
                      ) : (
                        <NotKnown reason="No dates given" />
                      )}
                    </p>
                  </div>
                  <Badge tone="azure">Local record</Badge>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-hairline pt-3">
                  <span className="text-[12px] text-mist">Your fee</span>
                  {terms ? (
                    <Money eur={terms.guideFeeEur} className="text-[14px] text-snow" />
                  ) : booking.totalEur !== null ? (
                    <Money eur={booking.totalEur} className="text-[14px] text-snow" />
                  ) : (
                    /* Never a zero: an unpriced booking is unpriced. */
                    <NotKnown reason="Not priced" />
                  )}
                </div>
                <Button asChild variant="ghost" className="mt-2 w-full">
                  <Link to={`/explore/guides/thread/${booking.requestId}`}>Open the thread</Link>
                </Button>
              </Card>
            );
          })
        )}
      </div>

      {/* ---- Messages ------------------------------------------------------ */}

      <SectionLabel className="mt-8">Messages</SectionLabel>
      <MessagesBlock />
    </div>
  );
}

/**
 * One request, with the terms composer folded underneath it.
 *
 * The composer is where a guide states a price and, more importantly, what the
 * price does not cover. It opens on nothing: no fee, no costs, no inclusions
 * copied in from anywhere. The one exception is the cancellation ladder, which
 * is offered as a starting point and only reaches the client when the guide
 * presses the button — ICEFALL suggesting terms is different from ICEFALL
 * attaching them.
 */
function RequestCard({
  request,
  detail,
  quoted,
}: {
  request: GuideRequest;
  detail?: { route: string; experience: keyof typeof EXPERIENCE_BAND_COPY };
  quoted?: boolean;
}) {
  const { quotes } = useGuideStore();
  const { postMessage, termsForQuote } = useEngagementStore();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");

  const quote = quotes.find((q) => q.requestId === request.id && q.status === "open");
  const terms = quote ? termsForQuote(quote.id) : undefined;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] text-snow">{request.peakName || "Objective not named"}</p>
          <p className="tnum mt-1 text-[12px] text-mist">
            {request.fromIso && request.toIso ? (
              formatDateRange(request.fromIso, request.toIso)
            ) : (
              <NotKnown reason="No dates given" />
            )}
          </p>
        </div>
        <Badge tone={quoted ? "neutral" : "azure"}>{quoted ? "Quoted" : "New"}</Badge>
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-hairline pt-3.5">
        <div>
          <dt className="section-label">Route</dt>
          <dd className="mt-1.5 text-[13px] text-snow">
            {detail?.route?.trim() ? detail.route : <NotKnown reason="Not decided" />}
          </dd>
        </div>
        <div>
          <dt className="section-label">Party</dt>
          <dd className="mt-1.5 text-[13px] text-snow">
            {request.groupSize === undefined ? (
              <NotKnown reason="Not stated" />
            ) : (
              <>
                <span className="tnum">{request.groupSize}</span>{" "}
                {request.groupSize === 1 ? "climber" : "climbers"}
              </>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3.5 border-t border-hairline pt-3.5">
        <p className="section-label">Their experience, in their words</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
          {detail ? (
            EXPERIENCE_BAND_COPY[detail.experience]
          ) : (
            <NotKnown reason="Not recorded on this request" />
          )}
        </p>
      </div>

      {request.message.trim() && (
        <div className="mt-3.5 border-t border-hairline pt-3.5">
          <p className="section-label">Message</p>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
            {request.message}
          </p>
        </div>
      )}

      {/* ---- Reply -------------------------------------------------------- */}

      <div className="mt-4 border-t border-hairline pt-4">
        <TextArea
          rows={3}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Reply as the guide…"
          aria-label="Reply as the guide"
        />
        <Button
          variant="secondary"
          className="mt-2.5 w-full"
          disabled={!reply.trim()}
          onClick={() => {
            // Lands on the athlete's thread, because it is the same store.
            postMessage(request.id, "guide", reply);
            setReply("");
          }}
        >
          <Send size={15} strokeWidth={1.8} />
          Send to the thread
        </Button>
      </div>

      {/* ---- Terms -------------------------------------------------------- */}

      <div className="mt-3">
        {quote ? (
          <>
            <Button variant="ghost" className="w-full" onClick={() => setOpen((v) => !v)}>
              {open ? "Close" : terms ? "Revise the terms" : "Write the terms of your quote"}
            </Button>
            {open && <TermsComposer quote={quote} onDone={() => setOpen(false)} />}
            {terms && !open && (
              <div className="mt-3 rounded-tile border border-hairline bg-obsidian/40 p-3.5">
                <p className="section-label">Sent to the client</p>
                {/* Deliberately the CLIENT's view, on the guide's screen. This
                    block reproduces the document the client received, and the
                    client's document has no platform-fee line. The guide's own
                    deduction is on the quote composer and the earnings card. */}
                <PriceBreakdown
                  className="mt-2.5 border-0 bg-transparent p-0"
                  audience="client"
                  guideFeeEur={terms.guideFeeEur}
                  additionalCosts={terms.additionalCosts}
                />
              </div>
            )}
          </>
        ) : (
          /* A quote only exists for a demonstration guide — see the store. For
             anyone real the request simply sits here, which is the truth of a
             marketplace with no guides in it. */
          <p className="text-[11px] leading-relaxed text-mist-dim">
            No quote record exists for this request, so there is nothing to price. Quotes are only
            generated against demonstration guides in this build.
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * Where a guide states a price and its conditions.
 *
 * The fee opens on the arithmetic figure from the store — a day rate times a day
 * count — clearly labelled as arithmetic rather than a quote, because that is
 * exactly the number a guide has to correct. Inclusions and exclusions open on
 * whatever the store's illustrative quote listed, and are editable.
 */
function TermsComposer({ quote, onDone }: { quote: GuideQuote; onDone: () => void }) {
  const { setQuoteTerms, termsForQuote } = useEngagementStore();
  const existing = termsForQuote(quote.id);

  const [fee, setFee] = useState(String(existing?.guideFeeEur ?? quote.subtotalEur ?? ""));
  const [lines, setLines] = useState<QuoteLine[]>(existing?.additionalCosts ?? []);
  const [included, setIncluded] = useState<string[]>(existing?.included ?? quote.includes);
  const [excluded, setExcluded] = useState<string[]>(existing?.excluded ?? quote.excludes);
  const [policy, setPolicy] = useState<CancellationPolicy>(
    existing?.cancellationPolicy ?? DEFAULT_CANCELLATION_POLICY,
  );
  const [validUntil, setValidUntil] = useState(
    existing?.validUntil ?? addDays(todayKey(), QUOTE_VALID_DAYS),
  );

  const feeNumber = Number(fee);
  const feeValid = fee.trim() !== "" && Number.isFinite(feeNumber) && feeNumber >= 0;
  // Only ever read behind `feeValid`. The zero is arithmetic filler for a
  // figure that is never displayed, not a stand-in for an unset fee.
  const totals = quoteTotals({ guideFeeEur: feeValid ? feeNumber : 0, additionalCosts: lines });

  function addLine() {
    setLines((prev) => [
      ...prev,
      { id: `line-${Date.now().toString(36)}-${prev.length}`, label: "", amountEur: 0 },
    ]);
  }

  function save() {
    if (!feeValid) return;
    setQuoteTerms(quote.id, {
      guideFeeEur: Math.round(feeNumber),
      additionalCosts: lines.filter((l) => l.label.trim() !== ""),
      included,
      excluded,
      cancellationPolicy: policy,
      validUntil,
      // The quote it attaches to is a demonstration record, so the terms are
      // demonstration terms. The flag rides along rather than being inferred.
      demo: quote.demo === true,
    });
    onDone();
  }

  return (
    <div className="mt-3 rounded-tile border border-hairline bg-obsidian/40 p-3.5">
      <FieldLabel hint="What you are charging for your own time across the whole engagement.">
        Your fee (EUR)
      </FieldLabel>
      <TextInput
        type="number"
        inputMode="numeric"
        min={0}
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        aria-label="Guide fee in euros"
      />
      <p className="tnum mt-2 text-[11px] leading-relaxed text-mist-dim">
        {quote.subtotalEur === null
          ? (quote.unknownReason ?? "No arithmetic figure — no dates were given.")
          : `Arithmetic starting point: ${fmtPrice(quote.dailyRateEur)} a day × ${quote.days} = ${fmtPrice(quote.subtotalEur)}. Correct it.`}
      </p>

      {/* ---- Additional costs -------------------------------------------- */}

      <div className="mt-5">
        <FieldLabel hint="Everything you pass through at cost: huts, permits, lifts, transport, hire kit. ICEFALL takes no fee on these.">
          Additional costs
        </FieldLabel>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={line.id} className="flex gap-2">
              <TextInput
                value={line.label}
                placeholder="What it is"
                aria-label={`Cost ${i + 1} description`}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l) => (l.id === line.id ? { ...l, label: e.target.value } : l)),
                  )
                }
              />
              <TextInput
                type="number"
                inputMode="numeric"
                min={0}
                className="w-24 shrink-0"
                value={String(line.amountEur)}
                aria-label={`Cost ${i + 1} amount in euros`}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l) =>
                      l.id === line.id ? { ...l, amountEur: Number(e.target.value) || 0 } : l,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label={`Remove cost ${i + 1}`}
                onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-tile border border-hairline text-mist-dim transition-colors hover:text-snow"
              >
                <X size={14} strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={addLine}>
          <Plus size={14} strokeWidth={1.8} />
          Add a cost
        </Button>
      </div>

      {/* ---- Inclusions --------------------------------------------------- */}

      <div className="mt-5">
        <FieldLabel>Included</FieldLabel>
        <ChipEditor items={included} onChange={setIncluded} placeholder="Add what the fee covers" />
      </div>

      <div className="mt-5">
        <FieldLabel hint="The list that prevents an argument at the trailhead. Be specific.">
          Not included
        </FieldLabel>
        <ChipEditor
          items={excluded}
          onChange={setExcluded}
          placeholder="Add what it does not cover"
        />
      </div>

      {/* ---- Cancellation ------------------------------------------------- */}

      <div className="mt-5">
        <FieldLabel hint="Your terms, not ICEFALL's. This ladder is a starting point and reaches the client only when you attach it.">
          Cancellation policy
        </FieldLabel>
        <TextArea
          rows={2}
          value={policy.summary}
          aria-label="Cancellation summary"
          onChange={(e) => setPolicy((p) => ({ ...p, summary: e.target.value }))}
        />
        <div className="mt-2.5 space-y-2">
          {policy.tiers.map((tier, i) => (
            <div key={tier.fromDaysBefore} className="flex items-center gap-3">
              <span className="tnum flex-1 text-[12px] text-mist">
                {tier.fromDaysBefore === 0
                  ? "Under 14 days"
                  : `${tier.fromDaysBefore}+ days before`}
              </span>
              <TextInput
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                className="w-20 shrink-0"
                value={String(tier.refundPct)}
                aria-label={`Refund percentage at ${tier.fromDaysBefore} days`}
                onChange={(e) =>
                  setPolicy((p) => ({
                    ...p,
                    tiers: p.tiers.map((t, j) =>
                      j === i
                        ? {
                            ...t,
                            refundPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                          }
                        : t,
                    ),
                  }))
                }
              />
              <span className="text-[12px] text-mist-dim">%</span>
            </div>
          ))}
        </div>
        <TextArea
          className="mt-2.5"
          rows={2}
          value={policy.guideCancels}
          aria-label="What happens if the guide cancels"
          onChange={(e) => setPolicy((p) => ({ ...p, guideCancels: e.target.value }))}
        />
      </div>

      {/* ---- Validity ------------------------------------------------------ */}

      <div className="mt-5">
        <FieldLabel hint="A quote with no expiry is not a quote — your costs and your diary both move.">
          Valid until
        </FieldLabel>
        <DateField
          label="Quote valid until"
          value={validUntil}
          min={todayKey()}
          onChange={setValidUntil}
        />
      </div>

      {/* ---- What the client will see -------------------------------------- */}

      <div className="mt-5 border-t border-hairline pt-4">
        <p className="section-label">What the client sees</p>
        {/* No fee, no preview. Rendering the breakdown against a zero would put
            "Guide's fee €0" on screen and compute a platform fee from it — the
            same substitution this feature refuses everywhere else. */}
        {feeValid ? (
          <>
            <PriceBreakdown
              className="mt-2.5"
              audience="guide"
              guideFeeEur={feeNumber}
              additionalCosts={lines}
            />
            {/* Worked in full rather than stated as a percentage. This sentence
                read "ICEFALL's 12% is added on top of your fee rather than
                taken out of it" — the opposite of what the earnings card on
                this same screen has always computed, and the opposite of the
                model. It is the guide's own money; it gets three numbers and no
                inference. */}
            <p className="tnum mt-2.5 text-[11px] leading-relaxed text-mist-dim">
              The client pays {fmtPrice(totals.totalEur)}. ICEFALL's {PLATFORM_COMMISSION_PCT}% —{" "}
              {fmtPrice(totals.platformFeeEur)} — comes out of your fee rather than being added to
              theirs, so you receive {fmtPrice(totals.guideReceivesEur)}.
            </p>
          </>
        ) : (
          <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
            <NotKnown reason="Enter your fee to see the client's breakdown" />
          </p>
        )}
      </div>

      <Button className="mt-4 w-full" onClick={save} disabled={!feeValid}>
        Attach these terms
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

function MessagesBlock() {
  const { requests } = useGuideStore();
  const { messages } = useEngagementStore();

  const recent = useMemo(() => {
    const rows = requests
      .map((request) => {
        const thread = messages[request.id] ?? [];
        const last = thread[thread.length - 1];
        return last ? { request, last, count: thread.length } : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    return rows.sort((a, b) => b.last.at.localeCompare(a.last.at));
  }, [requests, messages]);

  if (recent.length === 0) {
    return (
      <div className="mt-3">
        <Empty>No conversations yet. Replying to a request above starts one.</Empty>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {recent.map(({ request, last, count }) => (
        <Link key={request.id} to={`/explore/guides/thread/${request.id}`}>
          <Card className="transition-colors hover:border-hairline-strong">
            <div className="flex items-center gap-2">
              <p className="truncate text-[13px] text-snow">
                {request.peakName || "Objective not named"}
              </p>
              <span className="flex-1" />
              <p className="tnum shrink-0 text-[11px] text-mist-dim">{fmtDate(last.at)}</p>
            </div>
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-mist">
              <span className="text-mist-dim">{last.from === "guide" ? "You: " : "Client: "}</span>
              {last.body}
            </p>
            <p className="tnum mt-1.5 text-[11px] text-mist-dim">
              {count} message{count === 1 ? "" : "s"} · held on this device
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/* ========================================================================== */
/* Calendar                                                                    */
/* ========================================================================== */

/** Tapping a day walks this cycle, ending back at NOT SET so a mis-tap is undoable. */
const CYCLE: (Availability | null)[] = ["available", "limited", "unavailable", null];

const DAY_TONE: Record<Availability, string> = {
  available: "border-summit/45 bg-summit/[0.12] text-snow",
  limited: "border-alert/45 bg-alert/[0.10] text-snow",
  unavailable: "border-hairline-strong bg-white/[0.02] text-mist-dim line-through",
};

function CalendarTab() {
  const { listing, setDayAvailability } = useEngagementStore();
  const [cursor, setCursor] = useState(() => todayKey());
  const today = todayKey();

  const days = useMemo(() => monthDays(cursor), [cursor]);
  const offset = days.length > 0 ? mondayFirstIndex(days[0]) : 0;

  const counts = useMemo(() => {
    const out = { available: 0, limited: 0, unavailable: 0, unset: 0 };
    for (const day of days) {
      const status = listing.availability[day];
      if (status) out[status] += 1;
      else out.unset += 1;
    }
    return out;
  }, [days, listing.availability]);

  return (
    <div>
      <SectionLabel>Availability</SectionLabel>

      <Card className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setCursor((c) => shiftMonth(c, -1))}
            className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
          >
            <ChevronLeft size={17} strokeWidth={1.6} />
          </button>
          <p className="text-[14px] text-snow">{monthLabel(cursor)}</p>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setCursor((c) => shiftMonth(c, 1))}
            className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
          >
            <ChevronRight size={17} strokeWidth={1.6} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {["M", "T", "W", "T", "F", "S", "S"].map((label, i) => (
            <span key={`${label}-${i}`} className="section-label text-center">
              {label}
            </span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`pad-${i}`} aria-hidden="true" />
          ))}
          {days.map((day) => {
            const status = listing.availability[day];
            const isToday = day === today;
            const next = CYCLE[(CYCLE.indexOf(status ?? null) + 1) % CYCLE.length];
            return (
              <button
                key={day}
                type="button"
                onClick={() => setDayAvailability(day, next)}
                aria-label={`${day} — ${status ? DAY_AVAILABILITY_COPY[status] : "Not set"}. Tap to change.`}
                className={cn(
                  "tnum grid aspect-square place-items-center rounded-tile border text-[12px] transition-colors",
                  status
                    ? DAY_TONE[status]
                    : "border-dashed border-hairline text-mist-dim hover:border-hairline-strong",
                  isToday && "ring-1 ring-azure/50",
                )}
              >
                {Number(day.slice(-2))}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-hairline pt-3.5">
          <Legend tone="available" />
          <Legend tone="limited" />
          <Legend tone="unavailable" />
          <span className="flex items-center gap-2 text-[11px] text-mist-dim">
            <span className="h-3 w-3 rounded-[4px] border border-dashed border-hairline-strong" />
            Not set
          </span>
        </div>

        {/* The distinction that matters. A day nobody marked is not a day
            somebody offered — the athlete-facing screens say the same. */}
        <p className="tnum mt-3.5 text-[11px] leading-relaxed text-mist-dim">
          {counts.unset} of {days.length} days this month are NOT SET. That is not the same as
          unavailable: it means you have not said, and nothing will imply that you have.
        </p>
      </Card>
    </div>
  );
}

function Legend({ tone }: { tone: Availability }) {
  return (
    <span className="flex items-center gap-2 text-[11px] text-mist-dim">
      <span className={cn("h-3 w-3 rounded-[4px] border", DAY_TONE[tone])} />
      {DAY_AVAILABILITY_COPY[tone]}
    </span>
  );
}

/* ========================================================================== */
/* Listing                                                                     */
/* ========================================================================== */

function ListingTab() {
  const { listing, updateListing } = useEngagementStore();

  return (
    <div className="space-y-8">
      {/* ---- Rates -------------------------------------------------------- */}

      <div>
        <SectionLabel>Rates</SectionLabel>
        <Card className="mt-3">
          <FieldLabel hint="EUR per guiding day. Leave it empty rather than putting a placeholder in — an unset rate shows as unset, never as free.">
            Day rate
          </FieldLabel>
          <TextInput
            type="number"
            inputMode="numeric"
            min={0}
            value={listing.dayRateEur === undefined ? "" : String(listing.dayRateEur)}
            placeholder="Not set"
            aria-label="Day rate in euros"
            onChange={(e) => {
              const raw = e.target.value.trim();
              // An emptied field clears the rate rather than storing 0 — see the
              // hint above. A zero here would advertise free guiding.
              updateListing({
                dayRateEur: raw === "" ? undefined : Math.max(0, Number(raw) || 0),
              });
            }}
          />
          <p className="tnum mt-2.5 text-[12px] text-mist">
            {listing.dayRateEur === undefined ? (
              <NotKnown reason="No rate set" />
            ) : (
              `Clients see ${fmtPrice(listing.dayRateEur)} a day and pay ${fmtPrice(listing.dayRateEur)} a day. ICEFALL's ${PLATFORM_COMMISSION_PCT}% comes out of it, so you receive ${fmtPrice(platformNetFor(listing.dayRateEur))} a day.`
            )}
          </p>
        </Card>
      </div>

      {/* ---- Mountains ---------------------------------------------------- */}

      <div>
        <SectionLabel>Mountains</SectionLabel>
        <Card className="mt-3">
          <FieldLabel hint="The peaks you actually work on. This is what the marketplace searches — an athlete finds you through the mountain they are training for.">
            Objectives you guide
          </FieldLabel>
          <ChipEditor
            items={listing.mountains}
            onChange={(mountains) => updateListing({ mountains })}
            placeholder="Add a mountain"
          />
        </Card>
      </div>

      {/* ---- Specialities -------------------------------------------------- */}

      <div>
        <SectionLabel>Specialities</SectionLabel>
        <Card className="mt-3">
          <FieldLabel hint="Pick the ground you take clients onto.">
            Terrain and disciplines
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SPECIALITY_LABELS) as (keyof typeof SPECIALITY_LABELS)[]).map((id) => {
              const active = listing.specialities.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    updateListing({
                      specialities: active
                        ? listing.specialities.filter((s) => s !== id)
                        : [...listing.specialities, id],
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                    active
                      ? "border-azure/50 bg-azure/10 text-azure"
                      : "border-hairline-strong text-mist hover:border-azure/40 hover:text-snow",
                  )}
                >
                  {SPECIALITY_LABELS[id]}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ---- Languages ---------------------------------------------------- */}

      <div>
        <SectionLabel>Languages</SectionLabel>
        <Card className="mt-3">
          <FieldLabel hint="The languages you can run a day in — including the difficult conversation about turning round.">
            Working languages
          </FieldLabel>
          <ChipEditor
            items={listing.languages}
            onChange={(languages) => updateListing({ languages })}
            placeholder="Add a language"
          />
        </Card>
      </div>

      {/* ---- Qualifications ------------------------------------------------ */}

      <div>
        <SectionLabel>Qualifications</SectionLabel>
        <Card className="mt-3">
          <FieldLabel hint="What you hold. Everything entered here reaches a client labelled CLAIMED, because ICEFALL has checked none of it — see the verification list under Business.">
            Qualifications you claim
          </FieldLabel>
          <ChipEditor
            items={listing.qualificationClaims}
            onChange={(qualificationClaims) => updateListing({ qualificationClaims })}
            placeholder="Add a qualification"
          />
          {listing.qualificationClaims.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-hairline pt-3">
              {listing.qualificationClaims.map((q) => (
                <Badge key={q} tone="neutral">
                  {q} · Claimed
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ---- Standing status ----------------------------------------------- */}

      <div>
        <SectionLabel>Where you work</SectionLabel>
        <Card className="mt-3">
          <FieldLabel hint="A town, valley or range — where you work from, never a home address. ICEFALL holds no personal address, phone number or private email for anyone.">
            Based in
          </FieldLabel>
          <TextInput
            value={listing.basedIn ?? ""}
            placeholder="Not set"
            aria-label="Based in"
            onChange={(e) => updateListing({ basedIn: e.target.value || undefined })}
          />
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
            Standing statuses on a profile — {Object.values(AVAILABILITY_LABELS).join(", ")} — say
            what you are generally taking on. The calendar tab is where particular days are marked.
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Business                                                                    */
/* ========================================================================== */

function BusinessTab() {
  const { bookings } = useGuideStore();
  const { bookingTerms } = useEngagementStore();

  const terms = useMemo(
    () =>
      bookings.map((b) => bookingTerms[b.id]).filter((t): t is NonNullable<typeof t> => Boolean(t)),
    [bookings, bookingTerms],
  );
  const money = earningsFrom(terms);
  const unpriced = bookings.length - terms.length;

  return (
    <div className="space-y-8">
      {/* ---- Earnings ------------------------------------------------------ */}

      <div>
        <SectionLabel>Earnings</SectionLabel>
        <Card className="mt-3">
          <div className="grid grid-cols-3 gap-3">
            <Metric size="sm" label="Quoted" value={fmtPrice(money.grossEur)} />
            <Metric
              size="sm"
              label={`ICEFALL ${PLATFORM_COMMISSION_PCT}%`}
              value={fmtPrice(money.platformFeeEur)}
            />
            <Metric size="sm" label="To you" value={fmtPrice(money.netEur)} />
          </div>
          <p className="tnum mt-3.5 border-t border-hairline pt-3.5 text-[12px] text-mist">
            Across {money.count} accepted engagement{money.count === 1 ? "" : "s"}.
            {unpriced > 0 &&
              ` ${unpriced} booking${unpriced === 1 ? "" : "s"} had no itemised terms and ${unpriced === 1 ? "is" : "are"} excluded rather than estimated.`}
          </p>
          <Disclaimer className="mt-3">{EARNINGS_NOT_PAID_NOTICE}</Disclaimer>
        </Card>
      </div>

      {/* ---- Reviews ------------------------------------------------------- */}

      <div>
        <SectionLabel>Reviews</SectionLabel>
        <Card className="mt-3">
          <div className="flex items-baseline gap-3">
            {/* Not 0.0 out of 5. There is no average of nothing, and a zero
                score on a guide's profile is a specific and damaging claim. */}
            <NotKnown reason="No reviews — none can exist yet" />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-mist">
            {REVIEWS_NEED_BOOKINGS_NOTICE}
          </p>
        </Card>
      </div>

      {/* ---- Verification --------------------------------------------------- */}

      <div>
        <SectionLabel>Verification</SectionLabel>
        <Card className="mt-3">
          <Caution>{VERIFICATION_NOT_RUN_NOTICE}</Caution>
          <ul className="mt-4 space-y-4">
            {VERIFICATION_CATEGORIES.map((category) => (
              <li
                key={category.id}
                className="border-t border-hairline pt-4 first:border-0 first:pt-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13.5px] text-snow">{category.label}</p>
                  {/* The only status this build can render. `Verified` exists in
                      the model and is unreachable — nothing performs a check. */}
                  <Badge tone="neutral" className="shrink-0">
                    Not verified
                  </Badge>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-mist">
                  <span className="text-mist-dim">Would require: </span>
                  {category.requirement}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">{category.why}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ---- Terms reference ------------------------------------------------ */}

      <div>
        <SectionLabel>Your standard cancellation terms</SectionLabel>
        <div className="mt-3">
          <CancellationBlock policy={DEFAULT_CANCELLATION_POLICY} />
          <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
            A starting point ICEFALL suggests, not terms it imposes. Nothing reaches a client until
            you attach it to a specific quote.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Shared                                                                      */
/* ========================================================================== */

/**
 * A free-text list the guide builds themselves.
 *
 * Starts empty and stays empty until they type. Nothing is suggested and
 * nothing is pre-ticked — a mountain list seeded with "Mont Blanc" would be
 * ICEFALL claiming a guide works somewhere they have never been.
 */
function ChipEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    // Case-insensitive duplicate check: "English" and "english" are one language.
    if (!value || items.some((i) => i.toLowerCase() === value.toLowerCase())) return;
    onChange([...items, value]);
    setDraft("");
  }

  return (
    <div>
      <div className="flex gap-2">
        <TextInput
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" className="shrink-0" onClick={add} disabled={!draft.trim()}>
          <Plus size={15} strokeWidth={1.8} />
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="mt-2.5 text-[11px] text-mist-dim">Nothing added yet.</p>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong px-3 py-1.5 text-[12px] text-mist"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((i) => i !== item))}
                className="text-mist-dim transition-colors hover:text-snow"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <p className="text-[13px] leading-relaxed text-mist-dim">{children}</p>
    </Card>
  );
}

export default GuideDashboard;
