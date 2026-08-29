import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Avatar, Card, PageHead, Pill, SectionLabel, Stat } from "@/components/ui";
import { Resolve, Unavailable } from "@/components/states";
import {
  listAuditEvents,
  listBookings,
  listCompanies,
  listCustomers,
  listDocuments,
  listGuides,
  listInvoices,
  listLeads,
  listPendingApprovals,
  listPlacements,
  listRevenue,
} from "@/data/queries";
import { formatCents, formatCentsShort, formatRatio, loading, type Result } from "@/data/result";
import type {
  AuditEvent,
  Booking,
  Company,
  ContentVersion,
  CustomerRecord,
  GuideRecord,
  Invoice,
  Lead,
  PlacementView,
  RevenueRecord,
  RevenueStream,
  VerificationDocument,
} from "@/data/types";
import { daysUntil, formatDay, formatMoment } from "@/lib/utils";

/**
 * The executive dashboard — the screen most likely to be believed without
 * checking, and therefore the one that has to be most careful.
 *
 * A dashboard is read as fact. Whatever it prints becomes what the business
 * "knows", so every figure here is either something ICEFALL actually counted or
 * a sentence saying why it did not. Three absences are load-bearing:
 *
 * ACTIVE USERS. Nothing records a sign-in, a session or a page view, so there is
 * no last-seen date to count from. The tile keeps its position and says so,
 * because a metric that quietly disappears is one the reader assumes is healthy.
 *
 * VIEWS. The funnel the mockup draws starts at Views; this one starts at
 * Enquiries. Nothing writes an analytics event, and a row written by a browser
 * would be self-reported anyway — so the first step is named as unmeasured and
 * the first conversion percentage cannot exist: a rate with no denominator is
 * unavailable, not 0%.
 *
 * DELTAS. Not one "+16.4%" appears. A change needs a previous period, and the
 * only history ICEFALL holds is the revenue ledger's own recognition dates. The
 * month-by-month line below is drawn from those; everything else is all-time,
 * which is why there is no date-range control in the header either.
 *
 * Money is never added across currencies. ICEFALL holds no exchange rate, so a
 * mixed-currency ledger produces a stated refusal rather than an invented total.
 */

const STREAMS: { id: RevenueStream; label: string; colour: string }[] = [
  { id: "placement", label: "Mountain placements", colour: "var(--crm-accent)" },
  { id: "referral", label: "Referral fees", colour: "var(--crm-stage-proposal)" },
  { id: "guide_commission", label: "Guide commissions", colour: "var(--crm-stage-onboarding)" },
  { id: "subscription", label: "Consumer subscriptions", colour: "var(--crm-stage-renewal)" },
];

/** Why a figure is absent, taken from the read that failed rather than guessed. */
const reasonFor = (r: Result<unknown>): string =>
  r.state === "loading" ? "Still loading." : r.state === "ok" ? "Not recorded" : r.reason;

const countOf = <T,>(r: Result<T[]>, of: (v: T) => boolean = () => true): number | null =>
  r.state === "ok" ? r.value.filter(of).length : null;

const text = (n: number | null): string | null => (n === null ? null : n.toLocaleString("en-GB"));

/**
 * `formatCentsShort` has no symbol fallback — anything that is not EUR or GBP
 * renders as "$", which would mislabel a Nepali or Chilean figure. For those the
 * exact formatter is correct, because it prints the currency code instead.
 */
const money = (cents: number, currency: string): string | null =>
  currency === "EUR" || currency === "GBP" || currency === "USD"
    ? formatCentsShort(cents, currency)
    : formatCents(cents, currency);

interface MonthPoint {
  key: string;
  label: string;
  cents: number;
}

/**
 * A month label built from the parts of the date string.
 *
 * `new Date("2026-08")` walks into the same UTC-midnight trap `formatDay` exists
 * to avoid, and west of Greenwich it would file July's revenue under June. A
 * month bucket is not a calendar day so `formatDay` cannot label it, but the
 * parsing rule is identical: split, then build a local date.
 */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short" });
}

function byMonth(records: RevenueRecord[]): MonthPoint[] {
  const buckets = new Map<string, number>();
  for (const r of records) {
    const key = r.recognised_on.slice(0, 7);
    buckets.set(key, (buckets.get(key) ?? 0) + r.amount_cents);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, cents]) => ({ key, label: monthLabel(key), cents }));
}

/** "3d ago". A stamp in the future is printed absolutely — it is not "ago". */
function relativeTime(iso: string): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 0) return formatMoment(iso);
  if (secs < 90) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatMoment(iso);
}

export default function Dashboard() {
  const [customers, setCustomers] = useState<Result<CustomerRecord[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [guides, setGuides] = useState<Result<GuideRecord[]>>(loading);
  const [leads, setLeads] = useState<Result<Lead[]>>(loading);
  const [bookings, setBookings] = useState<Result<Booking[]>>(loading);
  const [revenue, setRevenue] = useState<Result<RevenueRecord[]>>(loading);
  const [approvals, setApprovals] = useState<Result<ContentVersion[]>>(loading);
  const [placements, setPlacements] = useState<Result<PlacementView[]>>(loading);
  const [invoices, setInvoices] = useState<Result<Invoice[]>>(loading);
  const [documents, setDocuments] = useState<Result<VerificationDocument[]>>(loading);
  const [events, setEvents] = useState<Result<AuditEvent[]>>(loading);

  useEffect(() => {
    void listCustomers().then(setCustomers);
    void listCompanies().then(setCompanies);
    void listGuides().then(setGuides);
    void listLeads().then(setLeads);
    void listBookings().then(setBookings);
    void listRevenue().then(setRevenue);
    void listPendingApprovals().then(setApprovals);
    void listPlacements().then(setPlacements);
    void listInvoices().then(setInvoices);
    void listDocuments().then(setDocuments);
    void listAuditEvents(6).then(setEvents);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* The funnel. Three of its four steps are countable.                      */
  /* ---------------------------------------------------------------------- */

  // Every stage is counted over ONE population — the enquiries — and read from
  // the timestamp each stage writes rather than from the current status. Two
  // consequences, both deliberate. A lead that booked and was later disputed
  // still passed through both stages, so arrival is what is counted. And the
  // last step counts enquiries that booked, not bookings: a booking that never
  // came through an enquiry did not pass through this funnel, and counting it
  // here would make the final stage stop dividing into the one above it.
  // Analytics counts the same four stages the same way; two screens naming one
  // funnel and printing two different figures is the failure being avoided.
  const enquiries = countOf(leads);
  const qualified = countOf(leads, (l) => l.qualified_at !== null);
  const booked = countOf(leads, (l) => l.booked_at !== null);

  const share = (n: number | null): number | null =>
    n === null || enquiries === null || enquiries <= 0 ? null : Math.min(100, (n / enquiries) * 100);

  const qualifiedRate =
    enquiries === null || qualified === null
      ? null
      : formatRatio({ numerator: qualified, denominator: enquiries });

  const bookedRate =
    qualified === null || booked === null
      ? null
      : formatRatio({ numerator: booked, denominator: qualified });

  // Bookings that never came through an enquiry are outside the funnel entirely.
  // The count is stated so that "bookings" on this card is not read as every
  // booking ICEFALL holds.
  const unattributed = countOf(bookings, (b) => b.lead_id === null);

  /* ---------------------------------------------------------------------- */
  /* Gross booking value — reported bookings only, and it says what it left. */
  /* ---------------------------------------------------------------------- */

  const gmv = (() => {
    if (bookings.state !== "ok") return { value: null as string | null, note: reasonFor(bookings) };
    const reported = bookings.value.filter((b) => b.value_status === "reported");
    const excluded = bookings.value.length - reported.length;
    if (reported.length === 0) {
      return {
        value: null,
        note:
          bookings.value.length === 0
            ? "No booking has been recorded yet."
            : `None of the ${bookings.value.length} recorded bookings carries a reported value. The database stores an unknown as NULL rather than as zero, so there is nothing to total.`,
      };
    }
    const currencies = new Set(reported.map((b) => b.currency));
    if (currencies.size > 1) {
      return {
        value: null,
        note: `Reported bookings are held in ${currencies.size} currencies and ICEFALL holds no exchange rate, so they are not added together.`,
      };
    }
    const currency = [...currencies][0];
    // `?? 0` is safe only because `value_status === "reported"` is the one state
    // the database guarantees a figure for.
    const total = reported.reduce((n, b) => n + (b.value_cents ?? 0), 0);
    return {
      value: money(total, currency),
      note:
        excluded > 0
          ? `Excludes ${excluded} booking${excluded === 1 ? "" : "s"} whose value has not been reported.`
          : "Every recorded booking has a reported value.",
    };
  })();

  const activeCompanies = countOf(companies, (c) => c.status === "active");
  const listedGuides = countOf(guides, (g) => g.listed);

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle="What ICEFALL can currently measure about the marketplace, all-time. Every figure it cannot measure keeps its place here and says why, because a tile that disappears is one you stop asking about."
      />

      {/* ------------------------------------------------------------------ */}
      {/* Four tiles. One of them is a permanent statement of absence.        */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="butter"
          label="Total users"
          value={text(countOf(customers))}
          reason={reasonFor(customers)}
          hint="Registered accounts. How many of them are using ICEFALL is a different question."
        />
        <Stat tone="sky"
          label="Active users"
          value={null}
          reason="Not measurable. Nothing records a sign-in, a session or a page view anywhere in the schema, so there is no last-seen date to count against. This tile stays put rather than showing a zero."
        />
        <Stat tone="lilac"
          label="Companies"
          value={text(countOf(companies))}
          reason={reasonFor(companies)}
          hint={activeCompanies === null ? undefined : `${activeCompanies} with an active account.`}
        />
        <Stat tone="mint"
          label="Guides"
          value={text(countOf(guides))}
          reason={reasonFor(guides)}
          hint={listedGuides === null ? undefined : `${listedGuides} listed on the marketplace.`}
        />
      </div>
      <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-faint">
        No period-over-period change is shown on these tiles. A delta needs a figure for a previous
        period, and ICEFALL keeps no snapshot of any of these counts — an arrow drawn without one
        would be decoration.
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* Marketplace funnel. It begins one step later than the mockup does.  */}
      {/* ------------------------------------------------------------------ */}
      <section className="mt-6">
        <SectionLabel>Marketplace funnel</SectionLabel>
        <Card className="mt-1.5">
          <div className="flex flex-wrap items-stretch gap-1.5">
            <Step
              label="Views"
              count={null}
              reason="Not measured. Nothing writes an analytics event, and a view counted by the browser would be self-reported."
              width={null}
            />
            <Gap rate={null} absence="No view count to divide by" />
            <Step
              label="Enquiries"
              count={enquiries}
              reason={reasonFor(leads)}
              width={share(enquiries)}
            />
            <Gap rate={qualifiedRate} absence="No enquiries to divide by" />
            <Step
              label="Qualified"
              count={qualified}
              reason={reasonFor(leads)}
              width={share(qualified)}
            />
            <Gap rate={bookedRate} absence="No qualified leads to divide by" />
            <Step label="Bookings" count={booked} reason={reasonFor(leads)} width={share(booked)} />
          </div>
          <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-faint">
            Bars are drawn against the enquiry count, which is the first step ICEFALL can count. Each
            stage counts arrival, read from the timestamp that stage writes, so a lead that booked
            and was later disputed still counts as having passed through both.
            {unattributed !== null && unattributed > 0 && (
              <>
                {" "}
                {unattributed} booking{unattributed === 1 ? " is" : "s are"} recorded with no enquiry
                attached and {unattributed === 1 ? "does" : "do"} not appear above, because{" "}
                {unattributed === 1 ? "it" : "they"} did not pass through this funnel.
              </>
            )}
          </p>
        </Card>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Revenue. Total, trend, and the split by stream.                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="mt-6">
        <SectionLabel>Revenue</SectionLabel>
        <div className="mt-1.5">
          <Resolve
            result={revenue}
            what="revenue records"
            isEmpty={(v) => v.length === 0}
            empty="Nothing has been recognised yet. A revenue record is written when a placement is invoiced or a booking converts a commission."
          >
            {(records) => {
              const currencies = new Set(records.map((r) => r.currency));
              const mixed = currencies.size > 1;
              const currency = [...currencies][0] ?? "EUR";
              const total = records.reduce((n, r) => n + r.amount_cents, 0);
              const months = byMonth(records);
              const streamTotal = (id: RevenueStream) =>
                records.filter((r) => r.stream === id).reduce((n, r) => n + r.amount_cents, 0);
              const uncategorised = records
                .filter((r) => !STREAMS.some((s) => s.id === r.stream))
                .reduce((n, r) => n + r.amount_cents, 0);

              return (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <Card className="lg:col-span-2">
                    <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
                      <div className="min-w-[10rem]">
                        <SectionLabel>Recognised revenue</SectionLabel>
                        {mixed ? (
                          <p className="mt-2 max-w-xs text-[12.5px] leading-snug text-faint">
                            Records are held in {currencies.size} currencies and ICEFALL holds no
                            exchange rate. A single total would be an invented conversion.
                          </p>
                        ) : (
                          <p className="tnum mt-1.5 text-[26px] font-light leading-none text-ink">
                            {formatCents(total, currency)}
                          </p>
                        )}
                        <p className="mt-1.5 max-w-xs text-[12px] leading-relaxed text-faint">
                          All-time, across the four streams. They are kept apart on Finance because a
                          placement invoice, a referral claim and a guide commission are chased by
                          different people and carry different collection risk.
                        </p>
                      </div>
                      <div className="min-w-[10rem]">
                        <SectionLabel>Booking value through ICEFALL</SectionLabel>
                        {gmv.value === null ? (
                          <p className="mt-2 max-w-xs text-[12.5px] leading-snug text-faint">
                            {gmv.note}
                          </p>
                        ) : (
                          <>
                            <p className="tnum mt-1.5 text-[26px] font-light leading-none text-ink">
                              {gmv.value}
                            </p>
                            <p className="mt-1.5 max-w-xs text-[12px] leading-relaxed text-faint">
                              {gmv.note}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 border-t border-line-soft pt-4">
                      <SectionLabel>Recognised by month</SectionLabel>
                      {mixed ? (
                        <p className="mt-2 text-[12.5px] leading-snug text-faint">
                          Not drawn. A line across three currencies would be a line across nothing.
                        </p>
                      ) : months.length < 2 ? (
                        <p className="mt-2 text-[12.5px] leading-snug text-faint">
                          {months.length === 1
                            ? `Everything recognised so far falls in one month (${months[0].label}). A trend needs at least two.`
                            : "No month carries a recognised figure yet."}
                        </p>
                      ) : (
                        <Trend points={months} currency={currency} />
                      )}
                      <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-faint">
                        No month-on-month change is printed. The most recent month is still open, and
                        comparing an open month against a closed one reports a shortfall that is only
                        the calendar.
                      </p>
                    </div>
                  </Card>

                  <Card>
                    <SectionLabel>Revenue by source</SectionLabel>
                    {mixed ? (
                      <p className="mt-2 text-[12.5px] leading-snug text-faint">
                        Shares are not computed across {currencies.size} currencies — the proportions
                        would be arithmetic on incomparable amounts.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {STREAMS.map((s) => {
                          const cents = streamTotal(s.id);
                          const drawn = formatRatio({ numerator: cents, denominator: total });
                          return (
                            <div key={s.id}>
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink">
                                  <span
                                    aria-hidden
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ background: s.colour }}
                                  />
                                  <span className="truncate">{s.label}</span>
                                </span>
                                {cents === 0 ? (
                                  <span className="shrink-0 text-[11.5px] text-faint">
                                    Nothing recognised
                                  </span>
                                ) : (
                                  <span className="tnum shrink-0 text-[12.5px] text-muted">
                                    {money(cents, currency)}
                                    {drawn !== null && <span className="text-faint"> · {drawn}</span>}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-raised ring-1 ring-line">
                                {total > 0 && cents > 0 && (
                                  <div
                                    className="h-full rounded-pill"
                                    style={{
                                      width: `${(cents / total) * 100}%`,
                                      background: s.colour,
                                    }}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {streamTotal("subscription") === 0 && (
                          <p className="text-[12px] leading-relaxed text-faint">
                            Consumer subscriptions have recognised nothing because there is no
                            subscription product to recognise it from. The row stays so the gap is
                            visible.
                          </p>
                        )}
                        {uncategorised > 0 && (
                          <p className="text-[12px] leading-relaxed text-faint">
                            {money(uncategorised, currency)} sits in records with no stream of their
                            own and is excluded from the four bars above.
                          </p>
                        )}
                      </div>
                    )}
                  </Card>
                </div>
              );
            }}
          </Resolve>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Alerts and activity.                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section>
          <SectionLabel>Alerts</SectionLabel>
          <Card className="mt-1.5" pad={false}>
            <ul>
              <AlertLine
                to="/admin/approvals"
                label="Content awaiting approval"
                detail="Operator changes that cannot reach the marketplace until somebody reads them."
                count={countOf(approvals)}
                reason={reasonFor(approvals)}
                colour="var(--crm-accent)"
                tone="accent"
              />
              <AlertLine
                to="/admin/placements"
                // The label names the window the count actually uses. "At or past
                // their term" over a 30-day filter would report positions that
                // still have a month to run as though they had run out.
                label="Placements ending within 30 days"
                detail="Terms inside 30 days of their end date, including those already past it. A term ending changes nothing on its own — the company keeps the position until an administrator moves it."
                count={countOf(
                  placements,
                  (p) => p.effective_status !== "cancelled" && p.days_remaining <= 30,
                )}
                reason={reasonFor(placements)}
                colour="var(--crm-warn)"
                tone="amber"
              />
              <AlertLine
                to="/admin/billing"
                label="Invoices past their due date"
                detail="Issued and unpaid after the due date. Nothing chases them automatically."
                count={countOf(
                  invoices,
                  (i) => (i.status === "overdue" || i.status === "sent") && daysUntil(i.due_on) < 0,
                )}
                reason={reasonFor(invoices)}
                colour="var(--crm-bad)"
                tone="red"
              />
              <AlertLine
                to="/admin/verification"
                label="Documents lapsed or lapsing"
                detail="Within 60 days of a recorded expiry date, or already past it. A document that arrived without an expiry date is not counted — ICEFALL was never told when that cover lapses. Checked means a member of ICEFALL staff read the document; it never means the issuing body was contacted."
                count={countOf(
                  documents,
                  (d) => d.state !== "rejected" && d.expires_on !== null && daysUntil(d.expires_on) <= 60,
                )}
                reason={reasonFor(documents)}
                colour="var(--crm-warn)"
                tone="amber"
                note={
                  documents.state === "ok"
                    ? (() => {
                        const soonest = documents.value
                          .filter(
                            (d) =>
                              d.state !== "rejected" &&
                              d.expires_on !== null &&
                              daysUntil(d.expires_on) <= 60,
                          )
                          .map((d) => d.expires_on as string)
                          .sort((a, b) => a.localeCompare(b))[0];
                        // `formatDay` returns null on a date it cannot parse, and
                        // interpolating that prints the word "null" as if it were
                        // the date. The line is dropped instead.
                        const day = soonest ? formatDay(soonest) : null;
                        return day ? `Soonest lapse ${day}` : undefined;
                      })()
                    : undefined
                }
              />
            </ul>
          </Card>
        </section>

        <section>
          <SectionLabel>Recent activity</SectionLabel>
          <div className="mt-1.5">
            <Resolve
              result={events}
              what="audit events"
              isEmpty={(v) => v.length === 0}
              empty="Nothing has been recorded yet. Every commercially meaningful action writes an entry here as it happens."
            >
              {(rows) => (
                <Card pad={false}>
                  <ul>
                    {rows.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-start gap-3 border-b border-line-soft px-4 py-3 last:border-0"
                      >
                        <Avatar name={(e.actor_role ?? "").replace(/_/g, " ")} size={26} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-snug text-ink">
                            <span className="font-medium">
                              {e.actor_role ? e.actor_role.replace(/_/g, " ") : "Actor not recorded"}
                            </span>
                            <span className="text-muted"> · {e.action}</span>
                          </p>
                          <p className="mt-0.5 truncate text-[12px] text-faint">
                            {e.entity_type} · {e.entity_id.slice(0, 8)}…
                          </p>
                        </div>
                        <p className="tnum shrink-0 whitespace-nowrap text-[12px] text-faint">
                          {relativeTime(e.created_at) ?? "at an unrecorded time"}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <div className="px-4 py-2.5">
                    <Link
                      to="/admin/activity"
                      className="text-[12.5px] font-medium text-muted hover:text-accent"
                    >
                      Open the full log
                    </Link>
                  </div>
                </Card>
              )}
            </Resolve>
          </div>
          <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-faint">
            The log records which account acted and under which desk, not a display name — so the
            actor is shown as the role it held at the time.
          </p>
        </section>
      </div>

      <div className="mt-6">
        <Unavailable
          reason={
            "Three things the mockup puts on this page are not here. There is no date-range control, " +
            "because every figure above is all-time and a range that filtered nothing would imply it " +
            "did. There is no Export, because nothing on this screen is assembled into a file yet. And " +
            "there are no growth percentages, on any tile: ICEFALL keeps no snapshot of a previous " +
            "period to compare against, so each one would be a number invented to fill a space."
          }
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces used only by this screen                                            */
/* -------------------------------------------------------------------------- */

/** One funnel stage. `width` is a percentage of the widest countable stage. */
function Step({
  label,
  count,
  reason,
  width,
}: {
  label: string;
  count: number | null;
  reason: string;
  width: number | null;
}) {
  return (
    <div className="min-w-[8.5rem] flex-1 rounded-tile border border-line bg-raised px-3 py-2.5">
      <SectionLabel>{label}</SectionLabel>
      {count === null ? (
        <p className="mt-1.5 text-[11.5px] leading-snug text-faint">{reason}</p>
      ) : (
        <>
          <p className="tnum mt-1 text-[22px] font-light leading-none text-ink">
            {count.toLocaleString("en-GB")}
          </p>
          <div className="mt-2.5 h-1 w-full overflow-hidden rounded-pill bg-line">
            {width !== null && width > 0 && (
              <div className="h-full rounded-pill bg-accent" style={{ width: `${width}%` }} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** The conversion between two stages, or the reason it has no denominator. */
function Gap({ rate, absence }: { rate: string | null; absence: string }) {
  return (
    <div className="flex w-24 shrink-0 flex-col items-center justify-center px-1 text-center">
      <ChevronRight size={16} strokeWidth={1.8} className="text-faint" />
      {rate === null ? (
        <span className="mt-1 text-[11px] leading-tight text-faint">{absence}</span>
      ) : (
        <span className="tnum mt-1 text-[12.5px] font-medium text-ink">{rate}</span>
      )}
    </div>
  );
}

/**
 * An alert row. A count of zero is a real measurement here — the set was read
 * and it was empty — so it renders as a word rather than as a figure, and only a
 * count that could not be read at all falls back to the reason.
 */
function AlertLine({
  to,
  label,
  detail,
  count,
  reason,
  colour,
  tone,
  note,
}: {
  to: string;
  label: string;
  detail: string;
  count: number | null;
  reason: string;
  colour: string;
  tone: "accent" | "amber" | "red";
  note?: string;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-line-soft px-4 py-3 last:border-0">
      <span
        aria-hidden
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ background: count === 0 ? "var(--crm-line)" : colour }}
      />
      <div className="min-w-0 flex-1">
        <Link to={to} className="text-[13px] font-medium text-ink hover:text-accent">
          {label}
        </Link>
        <p className="mt-0.5 max-w-md text-[12px] leading-relaxed text-faint">{detail}</p>
        {note && count !== null && count > 0 && (
          <p className="tnum mt-1 text-[12px] text-muted">{note}</p>
        )}
      </div>
      {count === null ? (
        <span className="max-w-[9rem] shrink-0 text-right text-[11.5px] leading-tight text-faint">
          {reason}
        </span>
      ) : count === 0 ? (
        <span className="shrink-0 text-[11.5px] text-faint">None</span>
      ) : (
        <Pill tone={tone}>{count}</Pill>
      )}
    </li>
  );
}

/**
 * The month-by-month line.
 *
 * No chart library is available and none is wanted for one polyline. The shape
 * is stretched to the card width, so the stroke is pinned with
 * `vectorEffect` and the points are drawn as round-capped zero-length lines —
 * a circle would arrive as an ellipse.
 */
function Trend({ points, currency }: { points: MonthPoint[]; currency: string }) {
  const W = 600;
  const H = 128;
  const top = 8;
  const floor = H - 8;
  const max = Math.max(...points.map((p) => p.cents));
  if (max <= 0) {
    return (
      <p className="mt-2 text-[12.5px] leading-snug text-faint">
        Every month so far recognised nothing, so there is no height to draw.
      </p>
    );
  }
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (c: number) => floor - (c / max) * (floor - top);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`).join(" ");
  const area = `0,${floor} ${line} ${W},${floor}`;

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-28 w-full overflow-visible"
        role="img"
        aria-label={`Recognised revenue by month, ${points.map((p) => p.label).join(" to ")}`}
      >
        <polygon points={area} fill="var(--crm-accent-soft)" />
        <line
          x1={0}
          y1={floor}
          x2={W}
          y2={floor}
          stroke="var(--crm-line)"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={line}
          fill="none"
          stroke="var(--crm-accent)"
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <line
            key={p.key}
            x1={x(i)}
            y1={y(p.cents)}
            x2={x(i)}
            y2={y(p.cents)}
            stroke="var(--crm-accent)"
            strokeWidth={5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-2 flex items-start justify-between gap-1">
        {points.map((p, i) => (
          <div
            key={p.key}
            className={
              i === 0
                ? "min-w-0 text-left"
                : i === points.length - 1
                  ? "min-w-0 text-right"
                  : "min-w-0 text-center"
            }
          >
            <p className="text-[11px] leading-none text-muted">{p.label}</p>
            <p className="tnum mt-1 text-[11px] leading-none text-faint">
              {money(p.cents, currency)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
