import { useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Send,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, Card, Disclaimer } from "@/components/ui/primitives";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { MountainThumb } from "@/components/domain/MountainImage";
import { fmtDate, fmtDateShort, fmtPrice, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  GUIDE_BOOKING_NOT_REAL,
  GUIDE_QUOTE_ILLUSTRATION,
  GUIDE_REQUEST_NOT_SENT,
  useGuideStore,
} from "@/guides/store";
import { CREDENTIAL_CLAIM_NOTICE, demoPortraitFor, guideById } from "@/guides/types";
import {
  EXPERIENCE_BAND_COPY,
  NO_PAYMENT_NOTICE,
  useEngagementStore,
  type CancellationPolicy,
  type QuoteLine,
} from "@/guides/engagement";
import { formatDateRange, nightsToDays } from "@/guides/dates";
import { GuidePortrait } from "./shared";
import {
  CancellationBlock,
  CancellationMissing,
  Caution,
  DemoBadge,
  InclusionLists,
  NotKnown,
  PriceBreakdown,
  TextArea,
} from "./bookingParts";

/**
 * One engagement, from the request through the quote to the booking.
 *
 * The screen is deliberately a single scroll rather than three routes: the
 * objective stays pinned at the top, the conversation runs beneath it, and the
 * quote sits in the conversation where it happened. Somebody deciding whether to
 * accept a price should never have to navigate away to check what the price is
 * for.
 *
 * TWO THINGS THIS SCREEN WILL NOT DO
 *
 *   It will not fabricate terms. A quote with no cancellation policy renders as
 *   a quote with no cancellation policy, and Accept stays disabled until one
 *   exists. Filling the gap with ICEFALL's suggested ladder would attach terms
 *   to a guide who never wrote them.
 *
 *   It will not imply anything was sent, agreed or paid. The request notice sits
 *   above the conversation, the no-payment notice sits beside the Accept button
 *   rather than on the screen after it, and the booking that results says
 *   plainly that it is a local record.
 *
 * THE QUOTE IS NOT A GUIDE'S MESSAGE. It renders as an attachment in the thread,
 * but never inside a guide's bubble and never with a guide's portrait against
 * it: `origin` is `"demo-illustration"`, meaning this app produced it from an
 * invented day rate. A bubble would say a person wrote it.
 */

/** One thing in the conversation, in the order it happened. */
type StreamItem =
  | { kind: "message"; id: string; from: "athlete" | "guide"; body: string; at: string }
  | { kind: "quote"; id: string; at: string };

export function GuideThread() {
  const { id: requestId = "" } = useParams<{ id: string }>();
  const { requests, quotesFor, acceptQuote, declineQuote, bookingForRequest, removeRequest } =
    useGuideStore();
  const {
    detailFor,
    messagesFor,
    postMessage,
    termsForQuote,
    termsForBooking,
    recordBookingTerms,
    forgetRequest,
  } = useEngagementStore();

  const composer = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  // Open by default: the illustration notice, the missing cancellation terms and
  // the no-payment line all live in here, and none of them may sit behind a tap
  // while a decision is still to be made.
  const [quoteOpen, setQuoteOpen] = useState(true);

  const request = requests.find((r) => r.id === requestId);
  const quotes = quotesFor(requestId);
  const booking = bookingForRequest(requestId);
  const detail = detailFor(requestId);
  const thread = messagesFor(requestId);

  /**
   * The live quote: the one that has not been settled. A request may carry more
   * than one over its life, and showing two open prices for one set of dates is
   * how somebody accepts the wrong one.
   */
  const quote = useMemo(
    () => quotes.find((q) => q.status === "open") ?? quotes.find((q) => q.status === "accepted"),
    [quotes],
  );

  if (!request) return <Navigate to="/explore/guides" replace />;

  const guide = guideById(request.guideId);
  const isDemo = guide?.demo === true || quote?.demo === true;
  const terms = quote ? termsForQuote(quote.id) : undefined;
  const bookingTerms = booking ? termsForBooking(booking.id) : undefined;

  const hasDates = Boolean(request.fromIso && request.toIso);
  const days = hasDates ? nightsToDays(request.fromIso!, request.toIso!) : null;

  /**
   * The whole engagement in order: the message written on the request form, the
   * illustrative quote, then everything added since. Kept as one sequence so the
   * screen reads as a conversation rather than a form with a chat bolted under
   * it. Ties keep insertion order — the request was written before the quote was
   * computed from it, even when both landed in the same millisecond.
   */
  const opening: StreamItem[] = request.message.trim()
    ? [
        {
          kind: "message",
          id: `${request.id}-opening`,
          from: "athlete",
          body: request.message,
          at: request.createdAt,
        },
      ]
    : [];
  const quoteItem: StreamItem[] = quote
    ? [{ kind: "quote", id: quote.id, at: quote.createdAt }]
    : [];
  const stream: StreamItem[] = [
    ...opening,
    ...quoteItem,
    ...thread.map<StreamItem>((m) => ({
      kind: "message",
      id: m.id,
      from: m.from,
      body: m.body,
      at: m.at,
    })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  const messageCount = stream.filter((item) => item.kind === "message").length;

  /* ---- Accepting -------------------------------------------------------- */

  /**
   * The guide's fee for this engagement.
   *
   * Terms written by the guide win over the arithmetic in `@/guides/store`,
   * which only ever multiplies a day rate by a day count. Null means there is
   * nothing to price, and Accept is disabled rather than defaulting to zero.
   */
  const guideFeeEur: number | null = terms?.guideFeeEur ?? quote?.subtotalEur ?? null;
  const additionalCosts: QuoteLine[] = terms?.additionalCosts ?? [];
  const included = terms?.included ?? quote?.includes ?? [];
  const excluded = terms?.excluded ?? quote?.excludes ?? [];
  const policy: CancellationPolicy | undefined = terms?.cancellationPolicy;

  const blockedReason =
    guideFeeEur === null
      ? (quote?.unknownReason ?? "There is no priced figure on this quote yet.")
      : policy === undefined
        ? "No cancellation policy is attached. Ask the guide for their terms — accepting without them is agreeing to nothing."
        : null;

  function accept() {
    if (!quote || guideFeeEur === null || !policy) return;
    // The marketplace record first — it issues the booking id everything else
    // is keyed to.
    const bookingId = acceptQuote(quote.id);
    if (!bookingId) return;
    // Then freeze the commercial terms, including ICEFALL's fee, at the figure
    // agreed now. Never recomputed on render — see `@/guides/engagement`.
    recordBookingTerms(bookingId, {
      guideFeeEur,
      additionalCosts,
      included,
      excluded,
      cancellationPolicy: policy,
    });
  }

  function askAQuestion() {
    composer.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    composer.current?.focus();
  }

  function discard() {
    // Re-checked rather than asserted: a hoisted function declaration does not
    // inherit the narrowing from the guard above it, and `!` would hide that.
    if (!request) return;
    // Both stores, so nothing is left keyed to a request that has gone.
    forgetRequest(
      request.id,
      quotes.map((q) => q.id),
      booking ? [booking.id] : [],
    );
    removeRequest(request.id);
  }

  /* ---- The quote, as an attachment -------------------------------------- */

  const quoteBlock = quote && (
    <div className="rounded-card border border-hairline bg-graphite">
      <button
        type="button"
        onClick={() => setQuoteOpen((open) => !open)}
        aria-expanded={quoteOpen}
        className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-tile border border-hairline bg-obsidian/50 text-mist-dim">
          <FileText size={17} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] text-snow">
              Quote — {request.peakName.trim() || "no mountain named"}
              {quote.days !== null ? `, ${quote.days} ${quote.days === 1 ? "day" : "days"}` : ""}
            </span>
            <Badge tone={quote.status === "open" ? "azure" : "neutral"} className="shrink-0">
              {quote.status === "open"
                ? "Open"
                : quote.status === "accepted"
                  ? "Accepted"
                  : "Declined"}
            </Badge>
          </span>
          {/* Where it came from, on the row itself. `origin` has one member and
              it is not a person — so this line never says a guide sent it, and
              there is no file behind it to give a size to. */}
          <span className="mt-1 block truncate text-[11px] text-mist-dim">
            Illustration · no document · not sent by {quote.guideName}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn("shrink-0 text-mist-dim transition-transform", quoteOpen && "rotate-90")}
        >
          <ChevronRight size={16} strokeWidth={1.6} />
        </span>
      </button>

      {/* The download affordance, visibly refused rather than silently inert.
          There is no document: this quote is arithmetic inside the app. */}
      <div className="flex items-center gap-2.5 border-t border-hairline px-3.5 py-2.5">
        <button
          type="button"
          disabled
          title="There is no document. This quote is arithmetic inside ICEFALL, not a file anyone attached."
          className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline px-3 text-[11px] text-mist-dim opacity-45"
        >
          <Download size={12} strokeWidth={1.7} aria-hidden="true" />
          Download
        </button>
        <p className="text-[11px] leading-relaxed text-mist-dim">
          Nothing to download — no file exists.
        </p>
      </div>

      {quoteOpen && (
        <div className="border-t border-hairline p-4">
          <p className="tnum text-[11px] text-mist-dim">
            {fmtDate(quote.createdAt)}
            {terms?.validUntil ? ` · valid until ${fmtDate(terms.validUntil)}` : ""}
          </p>

          {/* Where the numbers came from. `@/guides/store` only ever produces a
              quote for a demonstration guide, so every quote that reaches this
              screen is arithmetic on an invented day rate — and saying so is the
              difference between a demo and a misrepresentation. When guides can
              really reply, `origin` gains a second member and this branches. */}
          <Disclaimer className="mt-3">{GUIDE_QUOTE_ILLUSTRATION}</Disclaimer>

          {guideFeeEur === null ? (
            <div className="mt-4 rounded-tile border border-dashed border-hairline-strong p-3.5">
              <p className="section-label">Guide's fee</p>
              {/* Never a zero. The reason is the value. */}
              <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
                {quote.unknownReason ?? "Not priced."}
              </p>
              <p className="tnum mt-2.5 text-[11px] text-mist-dim">
                Listed day rate {fmtPrice(quote.dailyRateEur)}
              </p>
            </div>
          ) : (
            <PriceBreakdown
              className="mt-4"
              audience="client"
              guideFeeEur={guideFeeEur}
              additionalCosts={additionalCosts}
            />
          )}

          {additionalCosts.length === 0 && guideFeeEur !== null && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
              No additional costs itemised. Permits, hut nights, lifts and the guide's own expenses
              on the hill are usually charged on top — ask for them in writing.
            </p>
          )}

          <InclusionLists className="mt-4" included={included} excluded={excluded} />

          {policy ? (
            <CancellationBlock className="mt-3" policy={policy} />
          ) : (
            <CancellationMissing className="mt-3" />
          )}

          {/* ---- Decision --------------------------------------------- */}

          {!booking && quote.status === "open" && (
            <div className="mt-5 border-t border-hairline pt-5">
              {/* At the point of confirmation, not on the screen after it. */}
              <Disclaimer>{NO_PAYMENT_NOTICE}</Disclaimer>

              {blockedReason && <Caution className="mt-3.5">{blockedReason}</Caution>}

              <Button className="mt-4 w-full" onClick={accept} disabled={blockedReason !== null}>
                <CheckCircle2 size={15} strokeWidth={1.8} />
                Accept and record this booking
              </Button>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <Button variant="secondary" onClick={askAQuestion}>
                  <MessageSquare size={15} strokeWidth={1.8} />
                  Ask a question
                </Button>
                <Button variant="ghost" onClick={() => declineQuote(quote.id)}>
                  Decline
                </Button>
              </div>
            </div>
          )}

          {quote.status === "declined" && (
            <p className="mt-4 border-t border-hairline pt-4 text-[12px] leading-relaxed text-mist-dim">
              Declined. The figures are kept so this thread still reads as a record of what was
              offered.
            </p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Screen>
      {/* ---- Header ------------------------------------------------------ */}

      <header className="flex items-center gap-3 pb-4 pt-6">
        <Link
          to="/explore/guides"
          aria-label="Back to guides"
          className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <ChevronLeft size={20} strokeWidth={1.5} />
        </Link>

        {/* Demo guides carry a GAN portrait of a person who does not exist;
            everyone else falls back to initials. Never a real guide's photo. */}
        <GuidePortrait name={request.guideName} src={demoPortraitFor(request.guideId)} size={40} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] text-snow">{request.guideName}</p>
            <DemoBadge demo={isDemo} />
          </div>
          {/* The status of the engagement, said as it is. There is no "sent",
              no "delivered" and no "read" — nothing left this device. */}
          <p className="tnum truncate text-[11px] text-mist-dim">
            Queued {fmtDate(request.createdAt)} · never sent
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label="More actions"
          className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <MoreVertical size={18} strokeWidth={1.6} />
        </button>
      </header>

      {menuOpen && (
        <Card inset={false} className="mb-4 overflow-hidden">
          <MenuLink to="/explore/guides/dashboard" onSelect={() => setMenuOpen(false)}>
            Open the guide view
          </MenuLink>
          {detail?.goalId && (
            <MenuLink to={`/goals/${detail.goalId}`} onSelect={() => setMenuOpen(false)}>
              Back to your objective
            </MenuLink>
          )}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              discard();
            }}
            className="flex min-h-[48px] w-full items-center gap-2.5 border-t border-hairline px-4 py-3 text-left text-[13px] text-danger transition-colors hover:bg-danger/[0.06]"
          >
            <Trash2 size={14} strokeWidth={1.7} aria-hidden="true" />
            Delete this request
          </button>
        </Card>
      )}

      <Stagger>
        {/* ---- Pinned objective ------------------------------------------ */}

        <Rise>
          <ObjectiveCard
            mountain={request.peakName}
            elevationM={request.elevationM}
            dates={
              hasDates && days !== null
                ? `${formatDateRange(request.fromIso!, request.toIso!)} · ${days} ${days === 1 ? "day" : "days"}`
                : null
            }
            groupSize={request.groupSize}
            route={detail?.route ?? ""}
            goalId={detail?.goalId}
          />
        </Rise>

        {detail && (
          <Rise className="pt-3">
            <Card>
              <p className="section-label">Experience, as the athlete described it</p>
              <p className="mt-2 text-[13px] leading-relaxed text-mist">
                {EXPERIENCE_BAND_COPY[detail.experience]}
              </p>
              {/* Their words, not a level ICEFALL derived from training data. */}
              <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
                Self-reported. ICEFALL has not assessed anyone's competence and does not infer this
                from recorded activity.
              </p>
            </Card>
          </Rise>
        )}

        <Rise className="pt-4">
          <Caution>{GUIDE_REQUEST_NOT_SENT}</Caution>
        </Rise>

        {/* ---- Booking, once accepted ------------------------------------ */}

        {booking && (
          <Rise className="pt-5">
            <BookingConfirmation
              guideName={booking.guideName}
              mountain={booking.peakName || request.peakName}
              route={detail?.route ?? ""}
              startDate={booking.fromIso ?? request.fromIso}
              endDate={booking.toIso ?? request.toIso}
              groupSize={request.groupSize}
              confirmedAt={booking.createdAt}
              demo={isDemo}
              terms={bookingTerms}
              fallbackTotalEur={booking.totalEur}
            />
          </Rise>
        )}

        {/* ---- Conversation ---------------------------------------------- */}

        <Rise className="pt-6">
          <p className="section-label">Conversation</p>
        </Rise>

        {messageCount === 0 && (
          <Rise className="pt-3">
            <p className="text-[12px] leading-relaxed text-mist-dim">
              Nothing written yet. Anything added here stays on this device.
            </p>
          </Rise>
        )}

        {stream.map((item) =>
          item.kind === "quote" ? (
            <Rise key={item.id} className="pt-4">
              {quoteBlock}
            </Rise>
          ) : (
            <Rise key={item.id} className="pt-3">
              <MessageBubble
                from={item.from}
                body={item.body}
                at={item.at}
                guideName={request.guideName}
                guideId={request.guideId}
              />
            </Rise>
          ),
        )}

        {!quote && !booking && (
          <Rise className="pt-4">
            <Card>
              <p className="section-label">Quote</p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
                Nothing has come back, and nothing will: this request has not left the device.
              </p>
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
                In this outline the guide's side of the marketplace runs on the same device. Open it
                to answer this request and watch the quote appear here.
              </p>
              <Button asChild variant="secondary" className="mt-3.5 w-full">
                <Link to="/explore/guides/dashboard">Open the guide view</Link>
              </Button>
            </Card>
          </Rise>
        )}

        {/* ---- Composer --------------------------------------------------- */}

        <Rise className="pt-5">
          <div className="rounded-card border border-hairline bg-graphite p-2.5">
            <TextArea
              ref={composer}
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about the ratio, the turnaround time, what happens if the weather closes…"
              aria-label="Message"
              className="border-transparent bg-transparent px-1.5 py-1.5 focus:border-transparent"
            />
            <div className="mt-1 flex items-center gap-1">
              {/* Neither of these can do anything, so neither of them pretends
                  to: disabled, with the reason on the control and beneath it. A
                  paperclip that silently swallows a tap is worse than no
                  paperclip. */}
              <DeadAffordance
                icon={Paperclip}
                label="Attach a file"
                reason="Attachments are not built. ICEFALL has no file store and nowhere to send one."
              />
              <DeadAffordance
                icon={Camera}
                label="Add a photograph"
                reason="The camera is not connected. There is nowhere for a photograph to go."
              />
              <span className="flex-1" />
              <Button
                size="sm"
                variant="secondary"
                disabled={!draft.trim()}
                onClick={() => {
                  postMessage(request.id, "athlete", draft);
                  setDraft("");
                }}
              >
                <Send size={14} strokeWidth={1.8} />
                Add to thread
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            Attach and camera are switched off, not broken: there is no file store behind this
            screen and nowhere for anything to be sent.
          </p>
        </Rise>

        {/* ---- Footer ----------------------------------------------------- */}

        <Rise className="pt-7">
          <Disclaimer>{CREDENTIAL_CLAIM_NOTICE}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* The objective                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The engagement itself, pinned above the conversation.
 *
 * Mountain, dates, party and route are the four things an argument three weeks
 * before departure is always about, so they stay at the top rather than
 * scrolling away above a message list.
 *
 * Every field renders its own absence. A missing party size is not "1 climber":
 * a guide reading that would plan for a rope of two and meet a rope of four. The
 * chevron exists only when there is an ICEFALL objective to open — a control
 * that goes nowhere is not a control.
 */
function ObjectiveCard({
  mountain,
  elevationM,
  dates,
  groupSize,
  route,
  goalId,
}: {
  mountain: string;
  elevationM?: number;
  /** Preformatted window, or null when the request carried no dates. */
  dates: string | null;
  groupSize?: number;
  /** Empty means NOT DECIDED, which is a real answer rather than a gap. */
  route: string;
  goalId?: string;
}) {
  const named = mountain.trim();

  const body = (
    <>
      {named ? (
        <MountainThumb peak={{ name: named, elevationM }} size={52} />
      ) : (
        // No mountain, no picture. `useMountainImage` would fall back to terrain
        // for an altitude band, and band artwork beside "no mountain named"
        // would illustrate a peak this request never identified.
        <span
          aria-hidden="true"
          className="block h-[52px] w-[52px] shrink-0 rounded-[10px] border border-dashed border-hairline-strong"
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-light uppercase tracking-[0.04em] text-snow">
          {named || <NotKnown reason="No mountain named" />}
        </p>
        <p className="tnum mt-1 truncate text-[12px] text-mist">
          {dates ?? <NotKnown reason="No dates given" />}
        </p>
        <p className="section-label mt-1.5 truncate">
          {groupSize === undefined
            ? "Party not stated"
            : `${groupSize} ${groupSize === 1 ? "climber" : "climbers"}`}
          {" · "}
          {route.trim() || "Route not decided"}
        </p>
      </div>

      {goalId && (
        <ChevronRight
          size={16}
          strokeWidth={1.6}
          aria-hidden="true"
          className="shrink-0 text-mist-dim"
        />
      )}
    </>
  );

  if (goalId) {
    return (
      <Link
        to={`/goals/${goalId}`}
        className="flex items-center gap-3.5 rounded-card border border-hairline bg-graphite p-3.5 transition-colors hover:border-hairline-strong"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="rounded-card border border-hairline bg-graphite p-3.5">
      <div className="flex items-center gap-3.5">{body}</div>
      <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
        Not linked to an ICEFALL objective, so there is nothing to open. The facts above are the
        ones this request carried.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Conversation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One message. The guide's sit left behind their portrait, the athlete's sit
 * right in muted azure — the same accent the rest of the app reserves for the
 * athlete's own actions.
 */
function MessageBubble({
  from,
  body,
  at,
  guideName,
  guideId,
}: {
  from: "athlete" | "guide";
  body: string;
  at: string;
  guideName: string;
  guideId: string;
}) {
  const mine = from === "athlete";

  return (
    <div className={cn("flex items-end gap-2.5", mine && "justify-end")}>
      {!mine && (
        <GuidePortrait
          name={guideName}
          src={demoPortraitFor(guideId)}
          size={28}
          className="mb-0.5"
        />
      )}
      <div
        className={cn(
          "max-w-[78%] rounded-card px-3.5 py-3",
          mine
            ? "rounded-br-[4px] border border-azure/25 bg-azure/[0.07]"
            : "rounded-bl-[4px] border border-hairline bg-graphite",
        )}
      >
        {!mine && <p className="section-label mb-1.5 text-azure/85">{guideName}</p>}
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-mist">{body}</p>
        <p className={cn("tnum mt-1.5 text-[10px] text-mist-dim", mine && "text-right")}>
          {fmtDateShort(at)} · {fmtTime(at)}
        </p>
      </div>
    </div>
  );
}

/**
 * A control that cannot do its job, drawn as one that cannot do its job.
 *
 * Disabled, dimmed, and carrying the reason in its title and its accessible
 * name. The alternative — an enabled paperclip that quietly does nothing — is
 * the same lie as a "sent" confirmation with no network behind it.
 */
function DeadAffordance({
  icon: Icon,
  label,
  reason,
}: {
  icon: LucideIcon;
  label: string;
  reason: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={reason}
      aria-label={`${label} — unavailable. ${reason}`}
      className="grid h-11 w-11 place-items-center rounded-full text-mist-dim opacity-40"
    >
      <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
    </button>
  );
}

function MenuLink({
  to,
  onSelect,
  children,
}: {
  to: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      onClick={onSelect}
      className="flex min-h-[48px] items-center border-t border-hairline px-4 py-3 text-[13px] text-snow transition-colors first:border-t-0 hover:bg-white/[0.03]"
    >
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Booking confirmation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What was agreed, frozen at the moment it was agreed.
 *
 * Every figure comes from `BookingTerms`, which stored ICEFALL's fee and the
 * percentage it was calculated at. Nothing is recomputed here, so changing the
 * commission tomorrow cannot restate what somebody accepted today.
 *
 * `GUIDE_BOOKING_NOT_REAL` leads, before the price. Somebody who reads only the
 * first line of this card must come away knowing that no guide has agreed to
 * anything.
 */
function BookingConfirmation({
  guideName,
  mountain,
  route,
  startDate,
  endDate,
  groupSize,
  confirmedAt,
  demo,
  terms,
  fallbackTotalEur,
}: {
  guideName: string;
  mountain: string;
  route: string;
  startDate?: string;
  endDate?: string;
  groupSize?: number;
  confirmedAt: string;
  demo: boolean;
  terms?: {
    guideFeeEur: number;
    additionalCosts: QuoteLine[];
    platformFeeEur: number;
    platformCommissionPct: number;
    totalEur: number;
    included: string[];
    excluded: string[];
    cancellationPolicy: CancellationPolicy;
  };
  /** The marketplace record's own total, when the itemised terms are absent. */
  fallbackTotalEur: number | null;
}) {
  return (
    <Card className="border-azure/35">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-label text-azure/85">Booking recorded</p>
          <h2 className="display mt-2 text-[22px] text-snow">{mountain}</h2>
        </div>
        <DemoBadge demo={demo} />
      </div>

      {/* Before the money, not after it. */}
      <Caution className="mt-4">{GUIDE_BOOKING_NOT_REAL}</Caution>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-hairline pt-4">
        <Row label="Guide">{guideName}</Row>
        <Row label="Route">{route.trim() ? route : <NotKnown reason="Not decided" />}</Row>
        <Row label="Dates">
          {startDate && endDate ? (
            `${fmtDate(startDate)} – ${fmtDate(endDate)}`
          ) : (
            <NotKnown reason="No dates given" />
          )}
        </Row>
        <Row label="Party">
          {groupSize === undefined ? (
            <NotKnown reason="Not stated" />
          ) : (
            <>
              <span className="tnum">{groupSize}</span> {groupSize === 1 ? "climber" : "climbers"}
            </>
          )}
        </Row>
        <Row label="Recorded">{fmtDate(confirmedAt)}</Row>
        <Row label="Payment">Nothing taken</Row>
      </dl>

      {terms ? (
        <>
          {/* THE CLIENT'S VIEW, and it carries no platform-fee line — under the
              deducted model there is nothing here for them to pay. ICEFALL's
              cut comes out of the guide's fee, so the client's total is the
              guide's fee plus the pass-through costs and nothing else. The
              guide sees the deduction on their own dashboard. */}
          <PriceBreakdown
            className="mt-4"
            audience="client"
            guideFeeEur={terms.guideFeeEur}
            additionalCosts={terms.additionalCosts}
          />
          <p className="tnum mt-2.5 text-[11px] leading-relaxed text-mist-dim">
            Agreed at a platform fee of {terms.platformCommissionPct}%. The rate is stored on this
            booking, so a later change to ICEFALL's commission does not restate it.
          </p>
          <InclusionLists className="mt-4" included={terms.included} excluded={terms.excluded} />
          <CancellationBlock className="mt-3" policy={terms.cancellationPolicy} />
        </>
      ) : (
        <div className="mt-4 rounded-tile border border-dashed border-hairline-strong p-3.5">
          <p className="section-label">Itemised terms</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
            Not recorded for this booking. It was accepted without itemised costs, inclusions or a
            cancellation policy attached — so there is nothing to show here, and nothing to hold
            anyone to.
          </p>
          <p className="tnum mt-2.5 text-[13px] text-snow">
            {fallbackTotalEur === null ? (
              <NotKnown reason="No total was priced" />
            ) : (
              `Recorded total ${fmtPrice(fallbackTotalEur)}`
            )}
          </p>
        </div>
      )}

      <Disclaimer className="mt-4">{NO_PAYMENT_NOTICE}</Disclaimer>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="section-label">{label}</dt>
      <dd className="mt-1.5 text-[13px] leading-snug text-snow">{children}</dd>
    </div>
  );
}

export default GuideThread;
