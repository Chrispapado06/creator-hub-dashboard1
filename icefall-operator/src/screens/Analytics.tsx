/**
 * Analytics, built to the mockup: five metric tiles, then Overview /
 * Expeditions / Treks / Mountains / Sources / Speed / Drop-off / Team sub-tabs.
 *
 * THIS IS THE SCREEN A COMPANY USES TO DECIDE WHETHER ICEFALL IS WORTH PAYING
 * FOR, which makes it the screen where an invented number does the most damage.
 * Every figure here is counted from the same lead rows, through the backend:
 *
 *   PROFILE VIEWS — the one sanctioned exception. The tile renders through
 *   @/domain/demo (owner decision, constitution §6 #18): a deterministic local
 *   demo figure while the portal is local-only. Flip that module's flag off and
 *   the tile falls back to the honest "not counted yet" reading underneath.
 *
 *   PER-LISTING VIEWS — the same flag, the same fence. Every tab that shows a
 *   views column says once, at the top, that these are demo figures for this
 *   local build. With the flag off the line disappears and every cell carries
 *   the adapter's own reason instead, which is the only honest thing there.
 *
 *   THE DONUT — segments are the REAL per-source counts from `getAnalytics`,
 *   counted from the same rows as the enquiry tile, so the ring always sums to
 *   the figure beside it.
 *
 *   THE RANKING TABS — everything ICEFALL has recorded, ranked by what it
 *   actually measures (enquiries, then bookings). Conversion refuses the 0/0
 *   case: a dash means "no enquiries to convert", never a fabricated 0%.
 *
 *   SPEED / DROP-OFF / TEAM — `getInsights`, which reads only stamps the
 *   pipeline writes. Medians over an empty set are Unavailable, never 0, and
 *   the funnel refuses to draw at all rather than draw zero-width bars from a
 *   share nobody could work out.
 *
 * THE REPORTING WINDOW (OP-02, the owner by name: "should have to be able to
 * select exact dates they want to see analytics from"): a date-range control
 * with preset pills — 7 days · 30 days · Custom — drives the tiles, the
 * Overview charts AND everything from `getInsights`. The presets are the old
 * week/month toggle as derived ranges, so nothing the owner knew disappears;
 * Custom is the addition. The chosen range renders IN WORDS everywhere the old
 * label appeared, and every "vs" delta names the actual previous window — the
 * same length, immediately before. The product ranking tabs are all recorded
 * activity, and each table says in its own words which of the two it is.
 *
 * Under DEMO the backend is the frozen fixture implementation, which cannot
 * resolve exact dates — so this screen keeps its original week/month toggle
 * there rather than labelling preset data with dates it does not honour.
 * Spelled DEMO, not OFFLINE, per the flag split (12-DEMO-FLAG-SPLIT.md):
 * this is a WHERE-DATA-COMES-FROM question, not a connectivity one. That
 * branch is the fixture's, owned elsewhere, and unchanged.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { TrendChart } from "@/components/TrendChart";
import { Monogram } from "@/components/Shell";
import {
  Card, Donut, EmptyState, Figure, MetricTile, Notice, PageHeader, Pill, SectionHeading,
  StatTile, Tabs, formatMoney,
} from "@/components/ui";
import { DateRangeField, type DateRange } from "@/components/controls";
import type { AnalyticsWindow, MountainPerformance, OperatorInsights, SourceQuality } from "@/domain/adapter";
import { formatDay, formatRange, parseDay, TODAY } from "@/domain/dates";
import { DEMO_PROFILE_VIEWS, demoViewsDelta, demoViewsReading } from "@/domain/demo";
import { DEMO } from "@/offline/offline";
import {
  conversionRate, fold, measured, OPERATOR_NOTICES, unavailable, type Reading,
} from "@/domain/honesty";
import type { Lead } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

type SubTab =
  | "overview" | "expeditions" | "treks" | "mountains" | "sources" | "speed" | "dropoff" | "team";

/**
 * The four enquiry channels, with the mockup's labels and the donut's colours.
 * Colour is assigned by CHANNEL, not by rank, so a segment keeps its colour
 * when the ordering changes between weeks.
 */
const SOURCE_META: Record<string, { label: string; colour: string }> = {
  website: { label: "Website", colour: "var(--op-azure)" },
  "icefall-app": { label: "Icefall App", colour: "var(--op-live)" },
  marketplace: { label: "Marketplace", colour: "var(--op-pending)" },
  other: { label: "Other", colour: "var(--op-faint)" },
};
const SOURCE_ORDER = ["website", "icefall-app", "marketplace", "other"] as const;

/** Null when there is nothing to compare against — never a fabricated 0%. */
function delta(now: number, before: number | undefined): number | null {
  if (before === undefined || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/* -------------------------------------------------------------------------- */
/* The reporting window (OP-02)                                               */
/* -------------------------------------------------------------------------- */

/**
 * `iso` shifted by whole days, via UTC arithmetic only — the same sums the
 * adapter and the range control do, so a pill lights exactly when the picked
 * range IS that preset's range.
 */
function shiftDayIso(iso: string, delta: number): string {
  const d = parseDay(iso);
  if (!d) return iso;
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + delta));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The trailing window a preset pill selects: `days` days ending TODAY. */
function presetRange(days: number): { from: string; to: string } {
  return { from: shiftDayIso(TODAY, -(days - 1)), to: TODAY };
}

/** The range in words. One day reads as the day, not "28 Aug – 28 Aug 2026". */
function rangeWords(from: string, to: string): string {
  return from === to ? formatDay(from) : formatRange(from, to);
}

/* -------------------------------------------------------------------------- */
/* Small shared helpers                                                       */
/* -------------------------------------------------------------------------- */

const percent = (v: number) => `${Math.round(v * 100)}%`;
const whole = (v: number) => v.toLocaleString("en-GB");

function medianOf(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Hours, said the way a person would say them. Under an hour reads in minutes,
 * a working span reads in hours, anything longer reads in days — because "62.4 h"
 * is a figure an operator has to convert in their head before they can act on it.
 */
function formatHours(h: number): string {
  if (h < 1) {
    const m = Math.round(h * 60);
    return m < 1 ? "under a minute" : `${m} min`;
  }
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

const formatDays = (d: number) => (d < 1 ? formatHours(d * 24) : `${d.toFixed(1)} days`);

/**
 * Two totals on one screen need explaining, not hiding.
 *
 * `getInsights` counts the leads the company recorded themselves as well as the
 * ones ICEFALL delivered, because these tabs are the operator judging their own
 * sales work. The Enquiries tile is ICEFALL's attribution figure. They are
 * different numbers on purpose, and an operator who spots the gap deserves the
 * reason rather than a support ticket.
 */
const INCLUDES_OWN_LEADS =
  "This counts leads you recorded yourself as well as the ones Icefall delivered, so the totals here can run above the Enquiries tile.";

/**
 * The one line that fences the views columns.
 *
 * Rendered ONLY with the demo flag on. With it off, every views cell carries
 * the adapter's own sentence ("Icefall is not counting listing views yet…") and
 * this line would contradict it by implying there are figures to read.
 */
function ViewsNote() {
  if (!DEMO_PROFILE_VIEWS) return null;
  return (
    <p className="mb-3 text-[11.5px] leading-snug text-muted">
      Icefall is not counting listing views yet. The view figures below are demo
      numbers for this local build — not a measurement, and not something to make
      a commercial decision on.{" "}
      {/*
       * Constitution §6q: a derived figure must carry the PROVENANCE of its
       * inputs, not only its arithmetic. "Per 100 views" is a real numerator
       * over an invented denominator, and the "Seen, rarely asked about" flag
       * is a recommendation to ACT computed entirely from invented traffic.
       * Naming the arithmetic without naming the input reads as analysis.
       */}
      <span className="text-faint">
        Anything worked out from them — the “per 100 views” column and the
        “seen, rarely asked about” flag — is invented for the same reason, however
        real the enquiry counts beside it are.
      </span>
    </p>
  );
}

/**
 * Enquiries per 100 views — the column that makes a views column actionable.
 *
 * Unavailable propagates: when views carry a reason, THAT reason is the answer,
 * because a rate worked out from a number nobody measured is not a rate.
 */
function enquiriesPerHundredViews(enquiries: number, views: Reading<number>): Reading<number> {
  return fold(
    views,
    (v) =>
      v > 0
        ? measured((enquiries / v) * 100)
        : unavailable("No views recorded for this listing, so there is no rate to work out."),
    (reason) => unavailable(reason),
  );
}

/**
 * A `Reading` inside a table row.
 *
 * `Figure` is the tile-sized rendering and would make the demo view columns the
 * loudest thing in a row of measured counts — exactly the wrong emphasis. This
 * folds instead, at the row's own weight, and prints the reason verbatim where
 * there is no figure. It is `fold`, not a default: nothing here can become a 0.
 */
function ReadingCell({
  reading,
  format,
}: {
  reading: Reading<number>;
  format: (v: number) => string;
}) {
  return fold(
    reading,
    (v) => <span className="tnum text-[12.5px] text-ink">{format(v)}</span>,
    (reason) => (
      <span className="block max-w-[26ch] text-[11px] leading-snug text-muted">{reason}</span>
    ),
  );
}

/** A numeric cell: labelled when the table is stacked on a phone, bare on desktop. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 md:block">
      <span className="lbl shrink-0 md:hidden">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The ranking table the product and source tabs share                        */
/* -------------------------------------------------------------------------- */

interface RankRow {
  id: string;
  name: string;
  /** Small caption under the name — the product kind, where there is one. */
  sub?: string;
  enquiries: number;
  qualified: number;
  bookings: number;
  conversion: Reading<number>;
  /** Demo-flagged; Unavailable with its own reason when the flag is off. */
  views?: Reading<number>;
}

const rankRows = (rows: RankRow[]) =>
  [...rows].sort(
    (a, b) => b.enquiries - a.enquiries || b.bookings - a.bookings || a.name.localeCompare(b.name),
  );

const rowFromLeads = (id: string, name: string, ls: readonly Lead[]): RankRow => {
  const bookings = ls.filter((l) => l.bookedAt !== null).length;
  return {
    id,
    name,
    enquiries: ls.length,
    qualified: ls.filter((l) => l.qualifiedAt !== null).length,
    bookings,
    conversion: conversionRate(bookings, ls.length),
  };
};

/**
 * Which rows are well-viewed and rarely asked about.
 *
 * The threshold is COMPUTED FROM THIS TABLE, never a number somebody picked:
 * a row is flagged when it draws at least the table's median views and converts
 * those views into enquiries at under half the table's median rate. Below four
 * comparable rows nothing is flagged at all — a median over three listings is
 * not a benchmark, and a pill on a two-row table is decoration, not a finding.
 *
 * It is expected for this to flag NOTHING. A company whose listings all convert
 * views at a similar rate has no outlier, and inventing one to make the feature
 * visible would be the same failure as inventing the views themselves.
 */
const MIN_ROWS_FOR_A_MEDIAN = 4;

function seenRarelyAsked(rows: RankRow[]): Set<string> {
  const comparable = rows.flatMap((r) =>
    r.views && r.views.available && r.views.value > 0
      ? [{ id: r.id, views: r.views.value, rate: (r.enquiries / r.views.value) * 100 }]
      : [],
  );
  if (comparable.length < MIN_ROWS_FOR_A_MEDIAN) return new Set();
  const medianViews = medianOf(comparable.map((c) => c.views));
  const medianRate = medianOf(comparable.map((c) => c.rate));
  if (medianRate <= 0) return new Set();
  return new Set(
    comparable.filter((c) => c.views >= medianViews && c.rate < medianRate / 2).map((c) => c.id),
  );
}

function RankTable({
  title,
  detail,
  firstCol,
  rows,
  serif = false,
  showViews = false,
  empty,
}: {
  title: string;
  detail: string;
  firstCol: string;
  rows: RankRow[];
  /** Serif for NAMES per the house rule — mountains yes, products no. */
  serif?: boolean;
  /** Adds the views and enquiries-per-100-views columns. */
  showViews?: boolean;
  empty: { title: string; detail?: string };
}) {
  if (rows.length === 0) return <EmptyState title={empty.title} detail={empty.detail} />;
  const cols = showViews
    ? "md:grid-cols-[1.8fr_0.9fr_0.8fr_0.8fr_0.7fr_0.8fr_1.1fr]"
    : "md:grid-cols-[2fr_0.9fr_0.9fr_0.9fr_1fr]";
  const headers = showViews
    ? [firstCol, "Views", "Enquiries", "Qualified", "Booked", "Conversion", "Per 100 views"]
    : [firstCol, "Enquiries", "Qualified", "Booked", "Conversion"];
  const flagged = showViews ? seenRarelyAsked(rows) : new Set<string>();
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line-soft px-4 py-3">
        <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-[11.5px] text-muted">{detail}</p>
      </div>
      <div className={`hidden gap-3 border-b border-line px-4 py-2.5 md:grid ${cols}`}>
        {headers.map((h) => (
          <div key={h} className="lbl">{h}</div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={r.id}
          className={`grid grid-cols-1 gap-x-3 gap-y-1 px-4 py-3 md:items-center ${cols} ${
            i > 0 ? "border-t border-line-soft" : ""
          }`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="tnum w-4 shrink-0 text-[12px] text-faint">{i + 1}</span>
            <span className="min-w-0">
              <span className={`block truncate text-ink ${serif ? "ser text-[14px]" : "text-[12.5px] font-medium"}`}>
                {r.name}
              </span>
              {r.sub && <span className="block text-[11px] text-faint capitalize">{r.sub}</span>}
              {flagged.has(r.id) && (
                <span className="mt-1 inline-flex items-center rounded-pill bg-pending-soft px-2 py-0.5 text-[10px] font-medium text-pending">
                  Seen, rarely asked about
                </span>
              )}
            </span>
          </div>
          {showViews && (
            <Cell label="Views">
              <ReadingCell reading={r.views ?? unavailable(OPERATOR_NOTICES.VIEWS_NOT_COUNTED)} format={whole} />
            </Cell>
          )}
          <Cell label="Enquiries"><span className="tnum text-[12.5px] text-ink">{r.enquiries}</span></Cell>
          <Cell label="Qualified"><span className="tnum text-[12.5px] text-ink">{r.qualified}</span></Cell>
          <Cell label="Booked"><span className="tnum text-[12.5px] text-ink">{r.bookings}</span></Cell>
          <Cell label="Conversion">
            <span className="tnum text-[12.5px] text-muted">
              {fold(r.conversion, percent, () => "—")}
            </span>
          </Cell>
          {showViews && (
            <Cell label="Per 100 views">
              <ReadingCell
                reading={enquiriesPerHundredViews(r.enquiries, r.views ?? unavailable(OPERATOR_NOTICES.VIEWS_NOT_COUNTED))}
                format={(v) => v.toFixed(1)}
              />
            </Cell>
          )}
        </div>
      ))}
      <div className="border-t border-line-soft px-4 py-2.5 text-[11px] leading-snug text-faint">
        Conversion is bookings ÷ enquiries. A dash means there were no enquiries to convert — not a 0% rate.
        {showViews && (
          <>
            {" "}Per 100 views is enquiries ÷ views × 100 — a measured enquiry count over a
            view count Icefall does not yet record.
            {flagged.size > 0 &&
              " A listing is marked “Seen, rarely asked about” when it draws at least the median views in this table and turns fewer than half the median share of them into enquiries."}
          </>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Mountains — the owner's "which peak is working" table                      */
/* -------------------------------------------------------------------------- */

const MOUNTAIN_COLS = "md:grid-cols-[1.7fr_0.6fr_0.9fr_0.8fr_0.8fr_0.6fr_0.8fr_1fr]";

function MountainTable({ rows, windowLabel }: { rows: MountainPerformance[]; windowLabel: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No mountains assigned yet"
        detail="This table appears once Icefall assigns a mountain to your company."
      />
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line-soft px-4 py-3">
        <h2 className="text-[13.5px] font-semibold text-ink">Mountains</h2>
        <p className="mt-0.5 text-[11.5px] text-muted">
          Every mountain assigned to you, ranked by enquiries over {windowLabel}. A peak with no
          enquiries still appears — that zero is measured, and worth seeing.
        </p>
      </div>
      <div className={`hidden gap-3 border-b border-line px-4 py-2.5 md:grid ${MOUNTAIN_COLS}`}>
        {["Mountain", "Trips", "Views", "Enquiries", "Qualified", "Booked", "Conversion", "Revenue"].map((h) => (
          <div key={h} className="lbl">{h}</div>
        ))}
      </div>
      {rows.map((m, i) => (
        <div
          key={m.mountainId}
          className={`grid grid-cols-1 gap-x-3 gap-y-1 px-4 py-3 md:items-center ${MOUNTAIN_COLS} ${
            i > 0 ? "border-t border-line-soft" : ""
          }`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="tnum w-4 shrink-0 text-[12px] text-faint">{i + 1}</span>
            <span className="ser min-w-0 truncate text-[14px] text-ink">{m.name}</span>
          </div>
          <Cell label="Trips"><span className="tnum text-[12.5px] text-ink">{m.products}</span></Cell>
          <Cell label="Views"><ReadingCell reading={m.views} format={whole} /></Cell>
          <Cell label="Enquiries"><span className="tnum text-[12.5px] text-ink">{m.enquiries}</span></Cell>
          <Cell label="Qualified"><span className="tnum text-[12.5px] text-ink">{m.qualified}</span></Cell>
          <Cell label="Booked"><span className="tnum text-[12.5px] text-ink">{m.bookings}</span></Cell>
          <Cell label="Conversion">
            <span className="tnum text-[12.5px] text-muted">{fold(m.conversion, percent, () => "—")}</span>
          </Cell>
          <Cell label="Revenue">
            <ReadingCell reading={m.revenue} format={(v) => formatMoney(v)} />
          </Cell>
        </div>
      ))}
      <div className="border-t border-line-soft px-4 py-2.5 text-[11px] leading-snug text-faint">
        Trips is the number of your published expeditions and treks on that mountain. Revenue counts
        the reported value of confirmed and completed bookings only.
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Channel quality — the biggest channel is not always the best one           */
/* -------------------------------------------------------------------------- */

const QUALITY_COLS = "md:grid-cols-[1.6fr_0.8fr_0.8fr_0.7fr_1.2fr]";

function ChannelQuality({ rows, windowLabel }: { rows: SourceQuality[]; windowLabel: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No enquiries in this period"
        detail="Channel quality appears once there are enquiries in the selected period to compare."
      />
    );
  }
  // The bar is scaled to the BEST channel in this table, not to 100%, so the
  // difference between a 6% channel and a 9% one is visible rather than two
  // near-identical stubs. The number beside it is the real rate either way.
  const best = rows.reduce((m, r) => (r.conversion.available ? Math.max(m, r.conversion.value) : m), 0);
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line-soft px-4 py-3">
        <h2 className="text-[13.5px] font-semibold text-ink">Channel quality</h2>
        <p className="mt-0.5 text-[11.5px] text-muted">
          Enquiries over {windowLabel}, ordered by volume — but read the conversion column. The
          channel that sends the most is not always the one that books the most.
        </p>
      </div>
      <div className={`hidden gap-3 border-b border-line px-4 py-2.5 md:grid ${QUALITY_COLS}`}>
        {["Channel", "Enquiries", "Qualified", "Booked", "Conversion"].map((h) => (
          <div key={h} className="lbl">{h}</div>
        ))}
      </div>
      {rows.map((s, i) => (
        <div
          key={s.source}
          className={`grid grid-cols-1 gap-x-3 gap-y-1 px-4 py-3 md:items-center ${QUALITY_COLS} ${
            i > 0 ? "border-t border-line-soft" : ""
          }`}
        >
          <div className="min-w-0 truncate text-[12.5px] font-medium text-ink">
            {SOURCE_META[s.source]?.label ?? s.source}
          </div>
          <Cell label="Enquiries"><span className="tnum text-[12.5px] text-ink">{s.enquiries}</span></Cell>
          <Cell label="Qualified"><span className="tnum text-[12.5px] text-ink">{s.qualified}</span></Cell>
          <Cell label="Booked"><span className="tnum text-[12.5px] text-ink">{s.bookings}</span></Cell>
          <div className="min-w-0">
            {fold(
              s.conversion,
              (v) => (
                <>
                  <span className="tnum text-[15px] font-medium text-ink">{percent(v)}</span>
                  <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-pill bg-raised">
                    <span
                      className="block h-full rounded-pill bg-azure"
                      style={{
                        // A measured 0% draws NO bar. The 2% floor exists so a
                        // small real rate stays visible, not to give nothing a
                        // sliver that reads as something.
                        width: v <= 0 || best <= 0 ? "0%" : `${Math.max(2, (v / best) * 100)}%`,
                      }}
                    />
                  </span>
                </>
              ),
              (reason) => <span className="block text-[11.5px] leading-snug text-muted">{reason}</span>,
            )}
          </div>
        </div>
      ))}
      <div className="border-t border-line-soft px-4 py-2.5 text-[11px] leading-snug text-faint">
        The bar is drawn against the best-converting channel in this table, so the gap between
        channels is visible. The percentage beside it is the real rate. {INCLUDES_OWN_LEADS}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Speed                                                                      */
/* -------------------------------------------------------------------------- */

function SpeedTab({ insights, windowLabel }: { insights: OperatorInsights; windowLabel: string }) {
  const waiting = insights.awaitingFirstReply;
  return (
    <div className="grid gap-4">
      {waiting > 0 ? (
        <Notice
          tone="pending"
          title={
            waiting === 1
              ? "1 enquiry is still waiting for a first reply"
              : `${waiting} enquiries are still waiting for a first reply`
          }
        >
          Nobody has answered {waiting === 1 ? "it" : "them"} yet. This is the fastest thing on this
          screen to fix.{" "}
          <Link to="/operator/leads" className="font-semibold underline underline-offset-2">
            Open leads
          </Link>
        </Notice>
      ) : (
        <Notice>Every enquiry in this period has had a first reply. Nothing is sitting unanswered.</Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Median first reply" footnote={`Over ${windowLabel}, on enquiries that were answered.`}>
          <Figure reading={insights.medianResponseHours} format={formatHours} />
        </StatTile>
        <StatTile label="Slowest first reply" footnote="The worst case, so the median is not read as the whole story.">
          <Figure reading={insights.slowestResponseHours} format={formatHours} />
        </StatTile>
        <StatTile label="Median time to book" footnote="From the enquiry arriving to the booking being recorded.">
          <Figure reading={insights.medianDaysToBook} format={formatDays} />
        </StatTile>
      </div>

      <Card className="p-4">
        <SectionHeading
          title="How these are counted"
          detail="Every figure on this tab is a stamp Icefall recorded, not an estimate."
        />
        <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted">
          <li>
            Reply time is measured from the enquiry arriving to your first message on it. Enquiries
            you have not replied to yet are not in the median — they are the count above.
          </li>
          <li>
            A median over nothing is not zero. Where no enquiry has been answered or booked in this
            period, the tile says so in words rather than showing a figure.
          </li>
          <li>{INCLUDES_OWN_LEADS}</li>
        </ul>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Drop-off                                                                   */
/* -------------------------------------------------------------------------- */

function DropOffTab({ insights, windowLabel }: { insights: OperatorInsights; windowLabel: string }) {
  const stages = insights.stageReach;
  // One unavailable share means the funnel has no denominator at all. Drawing
  // zero-width bars would read as "nobody got past the first stage", which is a
  // different and false statement — so the whole funnel declines to draw.
  const missing = stages.find((s) => !s.share.available);
  const lostTotal = insights.lostReasons.reduce((a, r) => a + r.count, 0);

  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <SectionHeading
          title="How far leads get"
          detail={`Every enquiry from ${windowLabel}, and the share of them that reached each stage. ${INCLUDES_OWN_LEADS}`}
        />
        {missing || stages.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] leading-relaxed text-muted">
            {missing && !missing.share.available
              ? missing.share.reason
              : OPERATOR_NOTICES.NO_LEADS_IN_WINDOW}
          </p>
        ) : (
          <div className="space-y-3">
            {stages.map((s) => (
              <div key={s.stage}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] font-medium text-ink">{s.label}</span>
                  <span className="tnum text-[12px] text-muted">
                    {s.reached} · {fold(s.share, percent, () => "—")}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-pill bg-raised">
                  <div
                    className="h-full rounded-pill bg-azure"
                    style={{ width: fold(s.share, (v) => `${v * 100}%`, () => "0%") }}
                  />
                </div>
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-snug text-faint">
              Each bar is the share of this period's enquiries that ever reached that stage — not the
              share that stopped there. The gap between two bars is where leads are being lost.
            </p>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line-soft px-4 py-3">
          <h2 className="text-[13.5px] font-semibold text-ink">Why leads are lost</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            The reason recorded when a lead was marked lost, over {windowLabel}.
          </p>
        </div>
        {insights.lostReasons.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-muted">
            No lead has been marked lost in this period.
          </p>
        ) : (
          <>
            <div className="hidden grid-cols-[2fr_0.7fr_0.9fr] gap-3 border-b border-line px-4 py-2.5 md:grid">
              {["Reason", "Leads", "Share of lost"].map((h) => (
                <div key={h} className="lbl">{h}</div>
              ))}
            </div>
            {insights.lostReasons.map((r, i) => (
              <div
                key={r.reason}
                className={`grid grid-cols-1 gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[2fr_0.7fr_0.9fr] md:items-center ${
                  i > 0 ? "border-t border-line-soft" : ""
                }`}
              >
                <div className="min-w-0 text-[12.5px] text-ink">
                  {r.reason}
                  {r.reason === "No reason recorded" && (
                    <span className="mt-0.5 block text-[11px] text-faint">
                      Nobody wrote down why. That is a fact about the process, not a category.
                    </span>
                  )}
                </div>
                <Cell label="Leads"><span className="tnum text-[12.5px] text-ink">{r.count}</span></Cell>
                <Cell label="Share of lost">
                  <span className="tnum text-[12.5px] text-muted">
                    {lostTotal > 0 ? percent(r.count / lostTotal) : "—"}
                  </span>
                </Cell>
              </div>
            ))}
            <div className="border-t border-line-soft px-4 py-2.5 text-[11px] leading-snug text-faint">
              Share is of the {lostTotal} lead{lostTotal === 1 ? "" : "s"} marked lost in this period,
              not of all enquiries.
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Team                                                                       */
/* -------------------------------------------------------------------------- */

const TEAM_COLS = "md:grid-cols-[2fr_0.8fr_0.8fr_1.2fr]";

function TeamTab({ insights, windowLabel }: { insights: OperatorInsights; windowLabel: string }) {
  if (insights.byOwner.length === 0) {
    return (
      <EmptyState
        title="No team members yet"
        detail="Invite colleagues from the Team page and their assigned leads will be summarised here."
      />
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line-soft px-4 py-3">
        <h2 className="text-[13.5px] font-semibold text-ink">Team</h2>
        <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
          This counts the leads from {windowLabel} currently assigned to each person. It is not a
          league table — leads are assigned for all sorts of reasons, reassignment rewrites who a
          lead belongs to, and unassigned leads count against nobody.
        </p>
      </div>
      <div className={`hidden gap-3 border-b border-line px-4 py-2.5 md:grid ${TEAM_COLS}`}>
        {["Person", "Open leads", "Booked", "Median first reply"].map((h) => (
          <div key={h} className="lbl">{h}</div>
        ))}
      </div>
      {insights.byOwner.map((o, i) => (
        <div
          key={o.companyUserId}
          className={`grid grid-cols-1 gap-x-3 gap-y-1 px-4 py-3 md:items-center ${TEAM_COLS} ${
            i > 0 ? "border-t border-line-soft" : ""
          }`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Monogram name={o.name} size={28} />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate text-[12.5px] font-medium text-ink">{o.name}</span>
                {!o.active && <Pill>Inactive</Pill>}
              </span>
              {!o.active && (
                <span className="mt-0.5 block text-[11px] leading-snug text-faint">
                  No longer active — their leads are still counted here until they are reassigned.
                </span>
              )}
            </span>
          </div>
          <Cell label="Open leads"><span className="tnum text-[12.5px] text-ink">{o.open}</span></Cell>
          <Cell label="Booked"><span className="tnum text-[12.5px] text-ink">{o.booked}</span></Cell>
          <Cell label="Median first reply">
            <ReadingCell reading={o.medianResponseHours} format={formatHours} />
          </Cell>
        </div>
      ))}
      <div className="border-t border-line-soft px-4 py-2.5 text-[11px] leading-snug text-faint">
        Open leads are those not yet booked or lost. Median first reply is measured only over the
        leads this person has actually replied to. {INCLUDES_OWN_LEADS}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

export default function Analytics() {
  const session = useSession();
  const { backend, revision } = useOperator();
  const [tab, setTab] = useState<SubTab>("overview");

  /*
   * TWO PIECES OF RANGE STATE, deliberately. `picked` is whatever the control
   * holds, half-finished picks included (the first click of a custom range is
   * `{from, to: null}`). `applied` is the last COMPLETE range and is what every
   * query runs on — so mid-pick the screen keeps showing the last real window
   * instead of flashing empty or querying a range with no end.
   */
  const [picked, setPicked] = useState<DateRange>(() => presetRange(30));
  const [applied, setApplied] = useState<{ from: string; to: string }>(() => presetRange(30));
  const onRange = (v: DateRange) => {
    setPicked(v);
    if (v.from && v.to) setApplied({ from: v.from, to: v.to });
  };

  /** Offline only: the fixture backend's original toggle, unchanged. */
  const [legacy, setLegacy] = useState<"week" | "month">("month");

  const isPreset = (days: number) => {
    const p = presetRange(days);
    return applied.from === p.from && applied.to === p.to;
  };

  /*
   * What the seam is asked for. A range equal to a preset is sent AS the
   * preset — one signature, and the adapter derives the identical range — so
   * an implementation that only knows the presets (offline) still serves them.
   * Memoised because a fresh object every render would re-run every query.
   */
  const windowArg: AnalyticsWindow = useMemo(() => {
    if (DEMO) return legacy;
    if (isPreset(7)) return "week";
    if (isPreset(30)) return "month";
    return { fromIso: applied.from, toIso: applied.to };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacy, applied.from, applied.to]);

  const data = useAsync(() => backend.getAnalytics(session, windowArg), [session, windowArg, revision], null);
  const insights = useAsync<OperatorInsights | null>(
    () => backend.getInsights(session, windowArg),
    [session, windowArg, revision],
    null,
  );
  const perProduct = useAsync(() => backend.getProductPerformance(session), [session, revision], []);
  const leads = useAsync(() => backend.getLeads(session), [session, revision], []);
  /**
   * The chart follows the SAME range as the tiles — `getTrendRange` over the
   * applied dates, presets included, so the daily counts cover exactly the
   * window the figures above were counted over. Offline (no `getTrendRange`)
   * the original trailing windows stand, matching the fixture's toggle.
   */
  const trend = useAsync(
    () =>
      DEMO || !backend.getTrendRange
        ? backend.getTrend(session, legacy === "week" ? 8 : 32)
        : backend.getTrendRange(session, { fromIso: applied.from, toIso: applied.to }),
    [session, windowArg, revision],
    [],
  );

  if (!data) return null;

  /*
   * The label everywhere the old "the last week/month" wording sat is now the
   * range IN WORDS — taken from the adapter's own resolved `range` when it has
   * arrived, so the words always name the days that were actually counted.
   */
  const shown = !DEMO && data.range ? { from: data.range.fromIso, to: data.range.toIso } : applied;
  const windowLabel = DEMO
    ? legacy === "week"
      ? "the last week"
      : "the last month"
    : rangeWords(shown.from, shown.to);
  /** "vs 23 – 29 Jul 2026" — the ACTUAL previous window, or nothing at all. */
  const vsNote =
    !DEMO && data.previousRange
      ? `vs ${rangeWords(data.previousRange.fromIso, data.previousRange.toIso)}`
      : undefined;

  /* ---- the donut: real per-source counts, channel-stable colours ---------- */
  const counts = new Map(data.enquiriesBySource.map((s) => [s.source, s.count]));
  const segments = [
    ...SOURCE_ORDER.filter((k) => counts.has(k)),
    ...data.enquiriesBySource.map((s) => s.source).filter((s) => !(SOURCE_ORDER as readonly string[]).includes(s)),
  ].map((key) => ({
    label: SOURCE_META[key]?.label ?? key,
    value: counts.get(key) ?? 0,
    colour: SOURCE_META[key]?.colour ?? "var(--op-faint)",
  }));

  /* ---- the ranking tabs: everything recorded, counted from lead rows ------ */
  const productRows = (kind: "expedition" | "trek"): RankRow[] =>
    rankRows(
      perProduct
        .filter((p) => p.kind === kind)
        .map((p) => ({
          id: p.productId,
          name: p.name,
          sub: p.kind,
          enquiries: p.enquiries,
          qualified: p.qualified,
          bookings: p.bookings,
          conversion: p.conversion,
          views: p.views,
        })),
    );

  const sourceRows = (): RankRow[] => {
    const groups = new Map<string, Lead[]>(SOURCE_ORDER.map((s) => [s, []]));
    for (const l of leads) {
      const key = l.source ?? "other";
      const list = groups.get(key);
      if (list) list.push(l);
      else groups.set(key, [l]);
    }
    return rankRows(
      [...groups.entries()].map(([key, ls]) => rowFromLeads(key, SOURCE_META[key]?.label ?? key, ls)),
    );
  };

  const ALL_TIME = "Ranked by enquiries, then bookings — everything Icefall has recorded for you. The selected dates apply to the tiles and the overview, not to this ranking.";
  const NO_LEADS = {
    title: "No enquiries recorded yet",
    detail: "This ranking appears once Icefall records enquiries for you.",
  };

  return (
    <>
      <PageHeader
        title="Analytics"
        detail="Insights into your performance."
        action={
          DEMO ? (
            // The fixture backend serves the two presets and nothing else, so
            // offline keeps the control that promises exactly that.
            <Tabs
              active={legacy}
              onChange={setLegacy}
              tabs={[
                { key: "week" as const, label: "This week" },
                { key: "month" as const, label: "This month" },
              ]}
            />
          ) : (
            <div className="w-[240px]">
              <DateRangeField
                label="Reporting dates"
                value={picked}
                onChange={onRange}
                presets={[
                  { label: "7 days", days: 7 },
                  { label: "30 days", days: 30 },
                  { label: "Custom" },
                ]}
              />
            </div>
          )
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {/*
          The ONE sanctioned invention (owner decision 18): a local demo figure
          via @/domain/demo. Everything else on this row is counted.

          ITS DELTA IS FENCED TO THE 30-DAY PRESET. The demo delta was authored
          as the mockup's month figure; on any other range a made-up percentage
          would sit beside three deltas computed from a REAL previous window and
          read as the same kind of fact — a new lie. So off the 30-day preset
          the tile keeps the demo figure, drops the delta, and says why in a
          footnote. (Offline keeps the fixture's original behaviour.)
        */}
        <MetricTile
          label="Profile views"
          reading={demoViewsReading(data.views)}
          format={(v) => v.toLocaleString("en-GB")}
          delta={DEMO || isPreset(30) ? demoViewsDelta() : null}
          footnote={
            !DEMO && DEMO_PROFILE_VIEWS && !isPreset(30)
              ? "A demo figure for this local build — it does not follow the selected dates, so there is no change to report."
              : undefined
          }
        />
        <MetricTile
          label="Enquiries"
          reading={measured(data.funnel.enquiries)}
          format={String}
          delta={delta(data.funnel.enquiries, data.previous?.enquiries)}
          footnote={delta(data.funnel.enquiries, data.previous?.enquiries) !== null ? vsNote : undefined}
        />
        <MetricTile
          label="Qualified leads"
          reading={measured(data.funnel.qualified)}
          format={String}
          delta={delta(data.funnel.qualified, data.previous?.qualified)}
          footnote={delta(data.funnel.qualified, data.previous?.qualified) !== null ? vsNote : undefined}
        />
        <MetricTile
          label="Bookings"
          reading={measured(data.funnel.bookings)}
          format={String}
          delta={delta(data.funnel.bookings, data.previous?.bookings)}
          footnote={delta(data.funnel.bookings, data.previous?.bookings) !== null ? vsNote : undefined}
        />
        <MetricTile
          label="Revenue"
          reading={data.estimatedGmv}
          format={(v) => formatMoney(v)}
          footnote={
            data.gmvExcludedCount > 0
              ? OPERATOR_NOTICES.gmvExcludes(data.gmvExcludedCount)
              : "All bookings have a reported value."
          }
        />
      </div>

      <div className="mb-4">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "overview" as const, label: "Overview" },
            { key: "expeditions" as const, label: "Expeditions" },
            { key: "treks" as const, label: "Treks" },
            { key: "mountains" as const, label: "Mountains" },
            { key: "sources" as const, label: "Sources" },
            { key: "speed" as const, label: "Speed" },
            { key: "dropoff" as const, label: "Drop-off" },
            { key: "team" as const, label: "Team" },
          ]}
        />
      </div>

      {tab === "overview" &&
        /*
         * A range that holds nothing SAYS so. An empty chart and a hollow
         * donut would leave the operator inferring the statement; the screen
         * makes it instead. The condition checks the chart's counts as well as
         * the tile's, because the tile is Icefall-attributed and the chart
         * counts self-recorded leads too — if either has something, it draws.
         */
        (data.funnel.enquiries === 0 &&
        trend.every((t) => t.enquiries === 0 && t.qualified === 0 && t.bookings === 0) ? (
          <EmptyState
            title={`No enquiries ${!DEMO && shown.from === shown.to ? "on" : "over"} ${windowLabel}`}
            detail="Icefall recorded nothing for you in these dates — that zero is a measurement, not a gap in the data. Pick another range to see recorded activity."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="p-4">
              <SectionHeading
                title="Enquiries over time"
                detail={`Daily enquiries over ${windowLabel}.`}
              />
              {trend.length === 1 ? (
                /*
                 * A one-day range is a figure, not a trend — a single point
                 * pretending to be a line would imply a shape nobody measured.
                 */
                <p className="py-8 text-center text-[12.5px] leading-relaxed text-muted">
                  {trend[0]!.enquiries === 1 ? "1 enquiry" : `${trend[0]!.enquiries} enquiries`} on{" "}
                  {formatDay(trend[0]!.day)}. One day is a figure, not a trend — pick a longer range
                  to see a line.
                </p>
              ) : (
                <TrendChart
                  days={trend.map((t) => t.label)}
                  series={[
                    {
                      key: "enq",
                      label: "Enquiries",
                      colour: "var(--op-azure)",
                      points: trend.map((t) => t.enquiries),
                    },
                  ]}
                />
              )}
            </Card>
            <Card className="p-4">
              <SectionHeading
                title="Enquiries by source"
                detail="Which channel each of the period's enquiries arrived through."
              />
              <Donut segments={segments} centreLabel="total" />
            </Card>
          </div>
        ))}

      {tab === "expeditions" && (
        <>
          <ViewsNote />
          <RankTable
            title="Expeditions"
            detail={ALL_TIME}
            firstCol="Expedition"
            rows={productRows("expedition")}
            showViews
            empty={{
              title: "No expeditions to rank",
              detail: "When you list an expedition and Icefall records enquiries for it, it will be ranked here.",
            }}
          />
        </>
      )}

      {tab === "treks" && (
        <>
          <ViewsNote />
          <RankTable
            title="Treks"
            detail={ALL_TIME}
            firstCol="Trek"
            rows={productRows("trek")}
            showViews
            empty={{
              title: "No treks to rank",
              detail: "When you list a trek and Icefall records enquiries for it, it will be ranked here.",
            }}
          />
        </>
      )}

      {tab === "mountains" && insights && (
        <>
          <ViewsNote />
          <MountainTable rows={insights.byMountain} windowLabel={windowLabel} />
        </>
      )}

      {tab === "sources" && (
        <div className="grid gap-4">
          <RankTable
            title="Sources"
            detail={ALL_TIME}
            firstCol="Source"
            rows={leads.length === 0 ? [] : sourceRows()}
            empty={NO_LEADS}
          />
          {insights && <ChannelQuality rows={insights.sourceQuality} windowLabel={windowLabel} />}
        </div>
      )}

      {tab === "speed" && insights && <SpeedTab insights={insights} windowLabel={windowLabel} />}

      {tab === "dropoff" && insights && <DropOffTab insights={insights} windowLabel={windowLabel} />}

      {tab === "team" && insights && <TeamTab insights={insights} windowLabel={windowLabel} />}
    </>
  );
}
