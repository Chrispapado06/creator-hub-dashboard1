import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, Card, PageHead, SectionLabel, Stat, StatusChip, TableCard } from "@/components/ui";
import { Resolve, Unavailable } from "@/components/states";
import {
  listBookings,
  listCommissions,
  listCompanies,
  listCustomers,
  listLeads,
  listRevenue,
} from "@/data/queries";
import {
  formatCents,
  formatCentsShort,
  formatRatio,
  loading,
  type Ratio,
  type Result,
} from "@/data/result";
import type {
  Booking,
  Commission,
  Company,
  CustomerRecord,
  Lead,
  RevenueRecord,
  RevenueStream,
} from "@/data/types";

/**
 * Analytics — and the honest account of how little of it ICEFALL can measure.
 *
 * The owner asked for four groups: Audience, Marketplace, Funnel and Financial.
 * Three of the four are mostly unmeasurable today, and the useful thing this
 * screen can do is say so per group rather than fill the layout with zeros that
 * a reader would take as facts about the business.
 *
 * WHAT IS NOT HERE, AND WHY.
 *
 * Daily and monthly active users, retention, and every view count — mountain,
 * expedition, trek, company profile — have NO SOURCE AT ALL. Nothing in the
 * family writes an analytics event, and an event the client writes about itself
 * is self-reported rather than observed. A zero in those tiles would describe
 * the instrumentation while being read as a description of the business, which
 * is the exact confusion this product exists to avoid. They keep their headings
 * and state the absence; a metric that disappears is one the reader assumes is
 * fine.
 *
 * Nor is there a date-range control or an export button in the header. Both
 * appear in the mockup and neither would do anything: a range picker over data
 * with no event history filters nothing, and a control that implies a capability
 * ICEFALL does not have is the same lie in a smaller font.
 *
 * WHAT IS HERE IS MEASURED, NOT INFERRED.
 *
 * Growth is counted from the join date written on each customer record — real
 * registrations, not activity. The funnel from Enquiries onward is counted over
 * one population (the leads) so the stages divide into each other honestly; its
 * first stage, Views, has no source and so the first conversion percentage does
 * not exist either. Financial figures sum only rows that carry a figure, in a
 * single currency, and say what they left out. Operator performance is a real
 * grouping of leads, bookings and revenue by company — the most useful thing on
 * the page precisely because every column of it comes from a table that exists.
 */

const STREAMS: { id: RevenueStream; label: string }[] = [
  { id: "placement", label: "Mountain placements" },
  { id: "referral", label: "Referral fees" },
  { id: "guide_commission", label: "Guide commissions" },
  { id: "subscription", label: "Consumer subscriptions" },
  { id: "other", label: "Other" },
];

/**
 * A commission's status, read as settled / waiting / refused.
 *
 * Only `paid` is money that arrived, so only `paid` is settled. Accrued and
 * invoiced are claims and are drawn as waiting; disputed is a refusal; waived is
 * neither — it was given up, not withheld — so it stays neutral rather than
 * borrowing the colour of a dispute.
 */
const COMMISSION_STATUSES: {
  id: Commission["status"];
  state: "ok" | "pending" | "bad" | "neutral";
}[] = [
  { id: "accrued", state: "pending" },
  { id: "invoiced", state: "pending" },
  { id: "paid", state: "ok" },
  { id: "disputed", state: "bad" },
  { id: "waived", state: "neutral" },
];

const NO_EVENT_STREAM =
  "ICEFALL records no page views, no sessions and no app opens. Nothing writes an analytics event anywhere " +
  "in the family, and a row written by the same client that is being measured would be self-reported rather " +
  "than observed. There is no source for these figures at all — not an empty one, an absent one.";

const AUDIENCE_ABSENT =
  "Daily active users, monthly active users and retention are not shown. " +
  NO_EVENT_STREAM +
  " The customer record carries a last-active field for the day this is instrumented; it is null until then, " +
  "and null is not zero.";

const MARKETPLACE_ABSENT =
  "Mountain views, expedition views, trek views and company profile views are not shown. " +
  NO_EVENT_STREAM +
  " Nothing on this screen may stand in for them either: ICEFALL collects no ratings, no popularity signal and " +
  "no scarcity signal, so there is no proxy to quietly substitute.";

const MIXED_CURRENCY =
  "These records are held in more than one currency and ICEFALL stores no exchange rates. There is no total " +
  "to show — converting them here would invent both a rate and a date to have taken it on.";

/** Built from the string's own parts. Never `new Date("2026-08-01")` — see `formatDay`. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ratio = (numerator: number, denominator: number): Ratio => ({ numerator, denominator });

/** The house idiom: the real failure message where there is one, the generic phrase otherwise. */
const absence = <T,>(r: Result<T>): string =>
  r.state === "unavailable" || r.state === "error" ? r.reason : "Not recorded";

/**
 * `formatCentsShort`'s symbol table has no fallback — anything that is not EUR
 * or GBP is drawn with a dollar sign — so the compact form is used only for the
 * three currencies it actually knows. A Nepali rupee total rendered as dollars
 * is a wrong figure, not an untidy one.
 */
const money = (cents: number, currency: string): string | null =>
  currency === "EUR" || currency === "GBP" || currency === "USD"
    ? formatCentsShort(cents, currency)
    : formatCents(cents, currency);

/** The one currency these rows share, or null if they share none (or there are none). */
function oneCurrency(rows: { currency: string }[]): string | null {
  const first = rows[0]?.currency;
  if (first === undefined) return null;
  return rows.every((r) => r.currency === first) ? first : null;
}

/** A total, or the reason there isn't one. Never a zero standing in for either. */
function totalOf(
  rows: { amount_cents: number; currency: string }[],
  emptyReason: string,
): { value: string | null; reason: string } {
  if (rows.length === 0) return { value: null, reason: emptyReason };
  const currency = oneCurrency(rows);
  if (currency === null) return { value: null, reason: MIXED_CURRENCY };
  return { value: money(rows.reduce((n, r) => n + r.amount_cents, 0), currency), reason: "" };
}

interface MonthCount {
  key: string;
  label: string;
  count: number;
}

/**
 * Registrations per calendar month.
 *
 * Months with nobody joining are filled in rather than skipped, and a zero in
 * one of them is a real count: the customer table was read in full, so "nobody
 * joined in September" is a measurement and not a gap. Squeezing the empty
 * months out would make the axis lie about time instead.
 */
function joinsByMonth(customers: CustomerRecord[]): MonthCount[] {
  const counts = new Map<string, number>();
  for (const c of customers) {
    const [y, m] = c.joined_on.slice(0, 7).split("-").map(Number);
    // A record whose join date cannot be read is not filed under a guessed
    // month. The caller counts the shortfall and says so.
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) continue;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = [...counts.keys()].sort();
  if (keys.length === 0) return [];
  const out: MonthCount[] = [];
  const [firstY, firstM] = keys[0].split("-").map(Number);
  const [lastY, lastM] = keys[keys.length - 1].split("-").map(Number);
  let y = firstY;
  let m = firstM;
  while (y < lastY || (y === lastY && m <= lastM)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ key, label: `${MONTHS[m - 1]} ${y}`, count: counts.get(key) ?? 0 });
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }
  return out;
}

/** One stage of the funnel, or the reason the stage has no figure. */
function FunnelStage({
  label,
  value,
  share,
  note,
}: {
  label: string;
  value: number | null;
  share: string | null;
  note: string;
}) {
  return (
    <Card className="flex flex-col justify-between">
      <p className="text-[14px] font-semibold text-muted">{label}</p>
      {value === null ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-faint">{note}</p>
      ) : (
        <>
          <p className="tnum mt-3 text-[36px] font-bold leading-none tracking-[-0.03em] text-ink">
            {value}
          </p>
          <div className="mt-4 h-[5px] w-full overflow-hidden rounded-pill bg-raised">
            {share !== null && <div className="h-full rounded-pill bg-accent" style={{ width: share }} />}
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-faint">{note}</p>
        </>
      )}
    </Card>
  );
}

export default function Analytics() {
  const [customers, setCustomers] = useState<Result<CustomerRecord[]>>(loading);
  const [leads, setLeads] = useState<Result<Lead[]>>(loading);
  const [bookings, setBookings] = useState<Result<Booking[]>>(loading);
  const [revenue, setRevenue] = useState<Result<RevenueRecord[]>>(loading);
  const [commissions, setCommissions] = useState<Result<Commission[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);

  useEffect(() => {
    void listCustomers().then(setCustomers);
    void listLeads().then(setLeads);
    void listBookings().then(setBookings);
    void listRevenue().then(setRevenue);
    void listCommissions().then(setCommissions);
    void listCompanies().then(setCompanies);
  }, []);

  // Narrowed once, so nothing below has to ask a Result what it is mid-render.
  const leadRows = leads.state === "ok" ? leads.value : null;
  const bookingRows = bookings.state === "ok" ? bookings.value : null;
  const revenueRows = revenue.state === "ok" ? revenue.value : null;
  const commissionRows = commissions.state === "ok" ? commissions.value : null;

  /*
   * The funnel is counted over ONE population — the leads — so that each stage
   * genuinely divides into the one before it. Arrival is read from the stage
   * timestamps rather than the current status: a lead that was booked and later
   * disputed still passed through both stages, and a funnel that forgets that
   * reports the pipeline as narrower than it was.
   */
  const enquiries = leadRows === null ? null : leadRows.length;
  const qualified = leadRows === null ? null : leadRows.filter((l) => l.qualified_at !== null).length;
  const booked = leadRows === null ? null : leadRows.filter((l) => l.booked_at !== null).length;
  const unlinkedBookings = bookingRows === null ? null : bookingRows.filter((b) => b.lead_id === null).length;

  const shareOfEnquiries = (n: number | null): string | null =>
    n === null || enquiries === null ? null : formatRatio(ratio(n, enquiries));

  // Each rate is null rather than 0% when the stage above it is empty: nothing
  // to divide by is a different statement from nobody converting.
  const qualifiedRate =
    qualified === null || enquiries === null ? null : formatRatio(ratio(qualified, enquiries));
  const bookedRate = booked === null || qualified === null ? null : formatRatio(ratio(booked, qualified));

  // Reported bookings only. The database refuses to store an unknown value as a
  // zero, and GMV must not undo that by treating null as nothing.
  const reportedBookings = bookingRows === null ? null : bookingRows.filter((b) => b.value_status === "reported");
  const gmv =
    reportedBookings === null
      ? { value: null, reason: absence(bookings) }
      : totalOf(
          // `value_status === "reported"` is the state that carries a figure; the
          // others carry NULL, so this coalesce can never fire on a filtered row.
          reportedBookings.map((b) => ({ amount_cents: b.value_cents ?? 0, currency: b.currency })),
          "No booking has been reported with a value yet.",
        );
  const unreportedBookings =
    bookingRows === null || reportedBookings === null ? 0 : bookingRows.length - reportedBookings.length;

  const revenueTotal = (pick: (r: RevenueRecord) => boolean, emptyReason: string) =>
    revenueRows === null
      ? { value: null, reason: absence(revenue) }
      : totalOf(revenueRows.filter(pick), emptyReason);

  const recognised = revenueTotal(() => true, "Nothing has been recognised yet.");
  const placementRevenue = revenueTotal(
    (r) => r.stream === "placement",
    "No placement fee has been recognised yet.",
  );
  const commissionValue =
    commissionRows === null
      ? { value: null, reason: absence(commissions) }
      : totalOf(commissionRows, "No commission has been computed on a booking yet.");

  // The stream split is drawn only when every record shares one currency: a
  // share of a total that was summed across currencies would be a fraction of a
  // number that does not mean anything.
  const revenueCurrency = revenueRows === null ? null : oneCurrency(revenueRows);
  const revenueGrandTotal =
    revenueRows === null ? null : revenueRows.reduce((n, r) => n + r.amount_cents, 0);

  return (
    <>
      <PageHead
        title="Analytics"
        subtitle="Audience, marketplace, funnel and financial performance. Most of what an analytics page normally shows has no source in ICEFALL yet, so each group states which part of itself is missing and why rather than drawing it as zero."
      />

      {/* ---------------------------------------------------------------- */}
      {/* Audience                                                          */}
      {/* ---------------------------------------------------------------- */}
      <SectionLabel>Audience</SectionLabel>
      <div className="mt-1.5">
        <Unavailable reason={AUDIENCE_ABSENT} />
      </div>

      <div className="mt-3">
        <Resolve
          result={customers}
          what="customer records"
          isEmpty={(v) => v.length === 0}
          empty="Nobody has registered yet. A customer record is created at signup, and the join date on it is what this chart counts."
        >
          {(all) => {
            const months = joinsByMonth(all);
            const shown = months.slice(-12);
            const counted = months.reduce((n, m) => n + m.count, 0);
            const inShown = shown.reduce((n, m) => n + m.count, 0);
            const earlier = counted - inShown;
            const undated = all.length - counted;
            const peak = shown.reduce((n, m) => Math.max(n, m.count), 0);

            return (
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[17px] font-bold tracking-[-0.02em] text-ink">
                    New customers by month
                  </h2>
                  <p className="tnum text-[13px] font-semibold text-ink">{all.length} on record</p>
                </div>
                <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
                  Counted from the join date on each customer record. This is registration, not activity —
                  somebody who signed up once and never returned is counted here exactly like somebody who
                  books every season, and ICEFALL cannot yet tell the two apart.
                </p>

                {shown.length === 0 ? (
                  <p className="mt-3 text-[12.5px] leading-snug text-faint">
                    No customer record carries a readable join date, so there is no month to count them into.
                  </p>
                ) : (
                  <div className="mt-5 space-y-2.5">
                    {shown.map((m, i) => {
                      const width = formatRatio(ratio(m.count, peak));
                      const change = i === 0 ? null : m.count - shown[i - 1].count;
                      return (
                        <div key={m.key} className="flex items-center gap-3.5">
                          <p className="w-[72px] shrink-0 text-[12.5px] font-medium text-muted">{m.label}</p>
                          <div className="h-[8px] min-w-0 flex-1 overflow-hidden rounded-pill bg-raised">
                            {width !== null && m.count > 0 && (
                              <div className="h-full rounded-pill bg-accent" style={{ width }} />
                            )}
                          </div>
                          <p className="tnum w-[40px] shrink-0 text-right text-[14px] font-bold text-ink">
                            {m.count}
                          </p>
                          <p className="tnum w-[92px] shrink-0 text-right text-[12px] text-faint">
                            {change === null
                              ? "first month"
                              : `${change > 0 ? "+" : change < 0 ? "−" : "±"}${Math.abs(change)} vs prev`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/*
                 * The month-on-month figure is a COUNT DIFFERENCE, never a
                 * percentage. A percentage needs the previous month as a
                 * denominator, and the month before the first one recorded does
                 * not exist — "+300%" off a base of one is a number that travels
                 * a lot further than it deserves to.
                 */}
                <p className="mt-3 text-[12px] leading-relaxed text-faint">
                  The right-hand column is a count difference against the previous month, not a growth
                  percentage: a percentage would need a previous month to divide by, and the first month
                  recorded has none.
                  {earlier > 0 &&
                    ` ${earlier} customer${earlier === 1 ? " joined" : "s joined"} before ${shown[0].label} and ${earlier === 1 ? "is" : "are"} not drawn.`}
                  {undated > 0 &&
                    ` ${undated} record${undated === 1 ? " carries" : "s carry"} no readable join date and ${undated === 1 ? "is" : "are"} counted in the total only.`}
                </p>
              </Card>
            );
          }}
        </Resolve>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Marketplace                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-6">
        <SectionLabel>Marketplace</SectionLabel>
        <div className="mt-1.5">
          <Unavailable reason={MARKETPLACE_ABSENT} />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Funnel                                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-6">
        <SectionLabel>Funnel</SectionLabel>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FunnelStage
            label="Views"
            value={null}
            share={null}
            note="Not measured, so the view-to-enquiry rate does not exist either. Nothing writes an analytics event, and the number of people who looked cannot be inferred from the number who wrote in."
          />
          <FunnelStage
            label="Enquiries"
            value={enquiries}
            share={enquiries === null ? null : "100%"}
            note={enquiries === null ? absence(leads) : "Every enquiry made through ICEFALL. The base this funnel divides."}
          />
          <FunnelStage
            label="Qualified"
            value={qualified}
            share={shareOfEnquiries(qualified)}
            note={
              qualified === null
                ? absence(leads)
                : qualifiedRate === null
                  ? "No enquiries to divide by."
                  : `${qualifiedRate} of enquiries reached qualified.`
            }
          />
          <FunnelStage
            label="Bookings"
            value={booked}
            share={shareOfEnquiries(booked)}
            note={
              booked === null
                ? absence(leads)
                : bookedRate === null
                  ? "No qualified enquiries to divide by."
                  : `${bookedRate} of qualified enquiries booked.`
            }
          />
        </div>
        <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-faint">
          Stages count arrival, read from the timestamp each stage writes — a lead that booked and was later
          disputed still passed through both. Every stage is counted over the same population, so the
          percentages divide into each other honestly.
          {unlinkedBookings !== null && unlinkedBookings > 0 &&
            ` ${unlinkedBookings} booking${unlinkedBookings === 1 ? " is" : "s are"} recorded with no enquiry attached; ${unlinkedBookings === 1 ? "it does" : "they do"} not appear above because ${unlinkedBookings === 1 ? "it" : "they"} did not pass through this funnel.`}
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Financial                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-6">
        <SectionLabel>Financial</SectionLabel>
        {/*
          The pastel is attached to the figure, not to the heading. `Stat` drops
          a toned tile back to plain surface the moment its value is null, so a
          tile explaining why a total cannot be shown never carries the same
          colour across a room as one carrying a total.
        */}
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            tone="butter"
            label="Revenue recognised"
            value={recognised.value}
            reason={recognised.reason}
          />
          <Stat
            tone="sky"
            label="GMV from reported bookings"
            value={gmv.value}
            reason={gmv.reason}
            hint={
              unreportedBookings > 0
                ? `Excludes ${unreportedBookings} booking${unreportedBookings === 1 ? "" : "s"} whose value has not been reported.`
                : "Every recorded booking has a reported value."
            }
          />
          <Stat
            tone="lilac"
            label="Placement revenue"
            value={placementRevenue.value}
            reason={placementRevenue.reason}
          />
          <Stat
            tone="mint"
            label="Commission value recorded"
            value={commissionValue.value}
            reason={commissionValue.reason}
            hint="Across every status, including disputed and waived. The split is below."
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-[17px] font-bold tracking-[-0.02em] text-ink">Revenue by stream</h2>
          {revenueRows === null ? (
            <p className="mt-2 text-[12.5px] leading-snug text-faint">{absence(revenue)}</p>
          ) : revenueRows.length === 0 ? (
            <p className="mt-2 text-[12.5px] leading-snug text-faint">
              Nothing has been recognised yet, so there is nothing to divide between the streams.
            </p>
          ) : revenueCurrency === null || revenueGrandTotal === null ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-faint">{MIXED_CURRENCY}</p>
          ) : (
            <div className="mt-4 space-y-3.5">
              {STREAMS.map((s) => {
                const rows = revenueRows.filter((r) => r.stream === s.id);
                const sum = rows.reduce((n, r) => n + r.amount_cents, 0);
                const share = formatRatio(ratio(sum, revenueGrandTotal));
                return (
                  <div key={s.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[13px] font-medium text-ink">{s.label}</p>
                      <p className="tnum text-[14px] font-bold tracking-[-0.01em] text-ink">
                        {rows.length === 0 ? (
                          <span className="text-[12.5px] font-normal tracking-normal text-faint">
                            None recognised
                          </span>
                        ) : (
                          <>
                            {money(sum, revenueCurrency)}
                            {share !== null && (
                              <span className="ml-2 text-[12px] font-medium text-faint">{share}</span>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="mt-2 h-[7px] w-full overflow-hidden rounded-pill bg-raised">
                      {share !== null && rows.length > 0 && (
                        <div className="h-full rounded-pill bg-accent" style={{ width: share }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/*
           * Consumer subscriptions will read "None recognised" for the
           * foreseeable future: there is no subscription product. That is the
           * correct output — the stream is defined, nothing has been recognised
           * against it, and inventing an MRR from placement invoices to fill the
           * slice would be the single most misleading figure on this screen.
           */}
        </Card>

        <Card>
          <h2 className="text-[17px] font-bold tracking-[-0.02em] text-ink">Commissions by status</h2>
          {commissionRows === null ? (
            <p className="mt-2 text-[12.5px] leading-snug text-faint">{absence(commissions)}</p>
          ) : commissionRows.length === 0 ? (
            <p className="mt-2 text-[12.5px] leading-snug text-faint">
              No commission has been computed yet. One is written when a booking is converted against a rate
              somebody agreed.
            </p>
          ) : (
            <div className="mt-4 space-y-3.5">
              {COMMISSION_STATUSES.map((s) => {
                const rows = commissionRows.filter((c) => c.status === s.id);
                const currency = oneCurrency(rows);
                const sum = rows.reduce((n, c) => n + c.amount_cents, 0);
                return (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <StatusChip state={s.state} label={s.id} />
                      <span className="tnum text-[12.5px] text-faint">
                        {rows.length} record{rows.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="tnum text-[15px] font-bold tracking-[-0.01em] text-ink">
                      {rows.length === 0 ? (
                        <span className="text-[12.5px] font-normal tracking-normal text-faint">None</span>
                      ) : currency === null ? (
                        <span className="text-[12.5px] font-normal tracking-normal text-faint">
                          Mixed currencies, no total
                        </span>
                      ) : (
                        money(sum, currency)
                      )}
                    </p>
                  </div>
                );
              })}
              <p className="pt-1 text-[12px] leading-relaxed text-faint">
                A commission carries the rate copied at conversion, never one looked up now. Accrued and
                invoiced are claims; only paid is money that arrived.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Operator performance                                              */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-6">
        <SectionLabel>Operator performance</SectionLabel>
        <p className="mt-1 mb-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
          Leads, bookings and recognised revenue grouped by the company each row is attributed to. Every
          column here comes from a table that exists, which is why this is the part of the page worth acting
          on. A zero is a real count — the lead and booking tables were read in full — while a column that
          could not be read says so instead.
        </p>
        <Resolve
          result={companies}
          what="companies"
          isEmpty={(v) => v.length === 0}
          empty="No company records exist yet, so there is nothing to group performance by."
        >
          {(all) => {
            const rows = [...all].sort((a, b) => {
              if (leadRows !== null) {
                const byLeads =
                  leadRows.filter((l) => l.company_id === b.id).length -
                  leadRows.filter((l) => l.company_id === a.id).length;
                if (byLeads !== 0) return byLeads;
              }
              return a.name.localeCompare(b.name);
            });
            return (
              <TableCard>
                <table className="w-full min-w-[940px] text-[13.5px]">
                  <thead>
                    <tr className="border-b border-line-soft text-left">
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Company</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Leads</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Qualified</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Booked / conversion</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Bookings</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Revenue recognised</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => {
                      const mine = leadRows === null ? null : leadRows.filter((l) => l.company_id === c.id);
                      const mineQualified = mine === null ? null : mine.filter((l) => l.qualified_at !== null).length;
                      const mineBooked = mine === null ? null : mine.filter((l) => l.booked_at !== null).length;
                      const conversion =
                        mine === null || mineBooked === null ? null : formatRatio(ratio(mineBooked, mine.length));
                      const theirBookings =
                        bookingRows === null ? null : bookingRows.filter((b) => b.company_id === c.id).length;
                      const theirRevenue =
                        revenueRows === null ? null : revenueRows.filter((r) => r.company_id === c.id);
                      const revenueCurrency = theirRevenue === null ? null : oneCurrency(theirRevenue);
                      return (
                        <tr key={c.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
                          <td className="px-5 py-3.5">
                            <Link
                              to={`/admin/companies/${c.id}`}
                              className="group inline-flex items-center gap-3"
                            >
                              <Avatar name={c.name} size={34} />
                              <span className="font-medium text-ink group-hover:text-accent">{c.name}</span>
                            </Link>
                          </td>
                          <td className="tnum px-5 py-3.5 font-semibold text-ink">
                            {mine === null ? (
                              <span className="font-normal text-faint">Unavailable</span>
                            ) : (
                              mine.length
                            )}
                          </td>
                          <td className="tnum px-5 py-3.5 font-semibold text-ink">
                            {mineQualified === null ? (
                              <span className="font-normal text-faint">Unavailable</span>
                            ) : (
                              mineQualified
                            )}
                          </td>
                          <td className="tnum px-5 py-3.5 font-semibold text-ink">
                            {mineBooked === null ? (
                              <span className="font-normal text-faint">Unavailable</span>
                            ) : (
                              <>
                                {mineBooked}
                                {/* No leads means no conversion rate — not a rate of zero. */}
                                <span className="ml-2 font-normal text-faint">
                                  {conversion ?? "no leads to divide by"}
                                </span>
                              </>
                            )}
                          </td>
                          <td className="tnum px-5 py-3.5 font-semibold text-ink">
                            {theirBookings === null ? (
                              <span className="font-normal text-faint">Unavailable</span>
                            ) : (
                              theirBookings
                            )}
                          </td>
                          <td className="tnum px-5 py-3.5 text-[14px] font-bold tracking-[-0.01em] text-ink">
                            {theirRevenue === null ? (
                              <span className="text-[13.5px] font-normal tracking-normal text-faint">
                                Unavailable
                              </span>
                            ) : theirRevenue.length === 0 ? (
                              <span className="text-[13.5px] font-normal tracking-normal text-faint">
                                None recognised
                              </span>
                            ) : revenueCurrency === null ? (
                              <span className="text-[13.5px] font-normal tracking-normal text-faint">
                                Mixed currencies, no total
                              </span>
                            ) : (
                              money(theirRevenue.reduce((n, r) => n + r.amount_cents, 0), revenueCurrency)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableCard>
            );
          }}
        </Resolve>
      </div>
    </>
  );
}
