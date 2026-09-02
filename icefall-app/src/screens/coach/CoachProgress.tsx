import { useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Button } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { UnavailableState } from "@/components/coach/DataState";
import { DonutChart, StatTile, TrendLine } from "@/components/coach/CoachUI";
import { useCoachIntel } from "@/coach/hooks";
import { DETRAINING_RATIO, LOAD_DISCLAIMER, MIN_DAYS_FOR_RATIO, RAMPING_RATIO } from "@/coach/load";
import { monthlyReview, weeklyReview, type Review, type ReviewStat } from "@/coach/reviews";
import { COACH_DISCLAIMER } from "@/coach/types";
import { activityById } from "@/tracking/activities";
import { useAllTimeRecords, useRecordedActivities } from "@/tracking/feed";
import type { RecordedActivity } from "@/tracking/types";
import { fmtDistance, fmtDurationCompact, fmtElevation } from "@/lib/format";

/**
 * Progress — what the athlete has actually done.
 *
 * Everything on this screen is arithmetic over recorded activities, and it is
 * allowed to say nothing at all. Three refusals shape it:
 *
 *  1. NO DELTA AGAINST AN EMPTY PERIOD. If the previous window holds no
 *     recorded activity we cannot tell a rest block from an unrecorded one, so
 *     the comparison is dropped. "+100%" against nothing is the single most
 *     common lie a training app tells.
 *  2. NO LOAD RATIO UNDER A FORTNIGHT. `computeTrainingLoad` already withholds
 *     it; this screen plots nothing in that state and says how much history the
 *     comparison needs, rather than drawing a confident-looking line through
 *     four points.
 *  3. NO INVENTED TARGET. The band behind the load line is the athlete's OWN
 *     twenty-eight-day average, and the caption says so. Calling it "optimal"
 *     would turn a description into an instruction to train more.
 *
 * The reviews, the load model and the records all come from modules that
 * already enforce these rules — this file renders their output and never
 * recomputes a figure that one of them owns.
 *
 * CAPTIONS ARE SCOPE, NOT ESSAY. Every caption below earns its place by saying
 * what a figure is measured over — which window, out of how many sessions,
 * against what — or it is not there. The reasoning behind each refusal lives in
 * these comments, where it belongs; it used to live on the screen as well, and
 * an athlete reading four lines of philosophy above three numbers stops reading
 * the numbers. Cut prose freely here. Never cut the window, the denominator, or
 * the sentence that stops a figure being read as a target.
 */

/* -------------------------------------------------------------------------- */
/* Ranges                                                                      */
/* -------------------------------------------------------------------------- */

type RangeId = "week" | "month" | "quarter" | "year";

/**
 * Rolling windows, not calendar periods. A rolling window has an unambiguous
 * predecessor of exactly the same length, which is what makes the comparison
 * fair — "this month so far" against "all of last month" would report a
 * collapse in training on the second of every month. The calendar view lives in
 * the weekly and monthly reviews further down, where reviews.ts trims the
 * previous period to the elapsed length itself.
 */
const RANGES: { value: RangeId; label: string; days: number; noun: string }[] = [
  { value: "week", label: "Week", days: 7, noun: "7 days" },
  { value: "month", label: "Month", days: 30, noun: "30 days" },
  { value: "quarter", label: "3 Months", days: 90, noun: "90 days" },
  { value: "year", label: "Year", days: 365, noun: "365 days" },
];

const DAY_MS = 86_400_000;

interface Totals {
  activities: number;
  distanceM: number;
  elevationGainM: number;
  /** Summed only over activities that reported time on the move. */
  movingSec: number;
  timedActivities: number;
}

const EMPTY_TOTALS: Totals = {
  activities: 0,
  distanceM: 0,
  elevationGainM: 0,
  movingSec: 0,
  timedActivities: 0,
};

function totalsIn(acts: RecordedActivity[], fromMs: number, toMs: number): Totals {
  const out: Totals = { ...EMPTY_TOTALS };
  for (const a of acts) {
    const t = new Date(a.startedAt).getTime();
    // An unparseable timestamp is dropped rather than dated to now, which would
    // move a session into a window it does not belong to.
    if (!Number.isFinite(t) || t < fromMs || t >= toMs) continue;
    out.activities += 1;
    out.distanceM += a.distanceM;
    out.elevationGainM += a.elevationGainM;
    if (a.movingSec > 0) {
      out.movingSec += a.movingSec;
      out.timedActivities += 1;
    }
  }
  return out;
}

interface RangeWindow {
  current: Totals;
  /** Null when the preceding window of the same length held no activity. */
  previous: Totals | null;
}

function windowsFor(acts: RecordedActivity[], days: number, now: Date): RangeWindow {
  const to = now.getTime();
  const from = to - days * DAY_MS;
  const previousRaw = totalsIn(acts, from - days * DAY_MS, from);
  return {
    current: totalsIn(acts, from, to),
    previous: previousRaw.activities > 0 ? previousRaw : null,
  };
}

/**
 * A signed change, or nothing.
 *
 * Absolute rather than percentage: a percentage against a small base reads as
 * drama ("+340%") for a difference of two kilometres. Deliberately carries no
 * colour anywhere it is rendered — more training is not automatically better,
 * and a green arrow on a rising load would be encouragement to keep rising.
 */
function deltaText(
  current: number,
  previous: number | null,
  format: (v: number) => string,
  epsilon: number,
): string | undefined {
  if (previous === null) return undefined;
  const diff = current - previous;
  if (Math.abs(diff) <= epsilon) return "no change";
  return `${diff > 0 ? "+" : "−"}${format(Math.abs(diff))}`;
}

/* -------------------------------------------------------------------------- */
/* Distribution                                                                */
/* -------------------------------------------------------------------------- */

/** Azure leads, then white at decreasing opacity. Keeps the accent scarce. */
const SEGMENT_COLOURS = [
  "var(--ice-azure)",
  "var(--ice-azure-deep)",
  "oklch(1 0 0 / 34%)",
  "oklch(1 0 0 / 22%)",
  "oklch(1 0 0 / 13%)",
  "oklch(1 0 0 / 8%)",
];

/** Beyond this many types the tail is grouped, so the legend stays readable. */
const MAX_SEGMENTS = 5;

interface Segment {
  id: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Share of recorded sessions by activity type, largest first.
 *
 * Counted by session rather than by time or distance: those two would let one
 * long day dominate a legend that claims to describe what the athlete does, and
 * a third of the recorded sessions have no moving time to weight by anyway.
 */
function distributionIn(acts: RecordedActivity[], days: number, now: Date): Segment[] {
  const to = now.getTime();
  const from = to - days * DAY_MS;

  const counts = new Map<string, number>();
  for (const a of acts) {
    const t = new Date(a.startedAt).getTime();
    if (!Number.isFinite(t) || t < from || t >= to) continue;
    const label = activityById(a.activityTypeId).label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, MAX_SEGMENTS);
  const tail = sorted.slice(MAX_SEGMENTS);

  const segments: Segment[] = head.map(([label, value], i) => ({
    id: label,
    label,
    value,
    color: SEGMENT_COLOURS[i] ?? SEGMENT_COLOURS[SEGMENT_COLOURS.length - 1],
  }));

  if (tail.length > 0) {
    segments.push({
      id: "__other",
      label: `${tail.length} other ${tail.length === 1 ? "type" : "types"}`,
      value: tail.reduce((sum, [, v]) => sum + v, 0),
      color: SEGMENT_COLOURS[SEGMENT_COLOURS.length - 1],
    });
  }

  return segments;
}

/* -------------------------------------------------------------------------- */
/* Entrance                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The house entrance, and the one preference that switches it off.
 *
 * `Stagger`/`Rise` animate through framer-motion, which drives inline styles
 * from its own loop rather than declaring a CSS transition — so the global
 * `prefers-reduced-motion` rule in index.css, which flattens
 * `transition-duration` and `animation-duration`, never reaches them. A screen
 * that wants to honour the preference has to check it in TypeScript.
 *
 * Under the preference this renders a plain div, which is enough on its own:
 * `Rise` is a `motion.div` carrying only `variants`, and with no motion parent
 * there is no `initial`/`animate` for it to inherit, so the variants sit unused
 * and every section is simply present on the first frame.
 *
 * `resetKey` re-runs the cascade when the athlete changes the range — the same
 * thing CoachPlan does when its tab changes. Every figure underneath belongs to
 * a different window after that tap, and swapping four numbers in place reads
 * as a glitch rather than as a new answer to a new question.
 */
function Entrance({
  still,
  resetKey,
  className,
  children,
}: {
  still: boolean;
  resetKey?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (still) return <div className={className}>{children}</div>;
  return (
    <Stagger key={resetKey} className={className}>
      {children}
    </Stagger>
  );
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function CoachProgress() {
  const intel = useCoachIntel();
  const activities = useRecordedActivities();
  const records = useAllTimeRecords();
  const [range, setRange] = useState<RangeId>("month");
  const still = useReducedMotion() ?? false;

  // One instant for the whole render, so the window boundaries, the reviews and
  // the distribution cannot disagree by a few milliseconds mid-paint.
  const now = useMemo(() => new Date(), []);
  const config = RANGES.find((r) => r.value === range) ?? RANGES[1];

  const { current, previous } = useMemo(
    () => windowsFor(activities, config.days, now),
    [activities, config.days, now],
  );
  const segments = useMemo(
    () => distributionIn(activities, config.days, now),
    [activities, config.days, now],
  );
  const week = useMemo(() => weeklyReview(activities, now), [activities, now]);
  const month = useMemo(() => monthlyReview(activities, now), [activities, now]);

  // Nothing recorded means nothing on this screen can be computed, and every
  // section would be an absence state. One honest page beats eight empty cards.
  if (activities.length === 0) {
    return <FirstRun hasGoal={Boolean(intel.goal)} hasPlan={Boolean(intel.plan)} />;
  }

  const load = intel.load;
  const plotLoad = load.trend !== "insufficient-data" && load.daily.length > 1;
  // The band is the athlete's own twenty-eight-day average, spanning the
  // thresholds at which load.ts stops calling a week steady. It exists only
  // when that average exists — see MIN_DAYS_FOR_RATIO.
  const band =
    load.chronic !== null && load.chronic > 0
      ? { from: load.chronic * DETRAINING_RATIO, to: load.chronic * RAMPING_RATIO }
      : undefined;

  return (
    <Screen padded={false}>
      {/* The header and the range strip animate in with everything else — they
          are the first thing on screen, and a page that opens with its top
          block already planted and its body still arriving looks like two
          screens loading at different speeds. Their entrance is separate from
          the content's so that changing the range re-runs the body only. */}
      <Entrance still={still} className="px-5">
        <Rise>
          <ScreenHeader title="Progress" />
        </Rise>
        <Rise>
          <SegmentedTabs tabs={RANGES} value={range} onChange={setRange} />
        </Rise>
      </Entrance>

      <Entrance still={still} resetKey={range} className="px-5">
        {/* ---- Totals for the selected window ------------------------------ */}
        <Rise className="pt-6">
          <SectionLabel>Last {config.noun}</SectionLabel>

          {current.activities === 0 ? (
            <Card className="mt-3 py-8">
              <UnavailableState reason="no-data" size="md" className="mx-auto" />
              {/* The tiles are absent rather than zeroed — the reason is refusal
                  1 at the top of this file, and it does not need restating to
                  the athlete beside an obviously empty card. */}
              <p className="mt-4 text-center text-[12px] leading-relaxed text-mist-dim">
                Nothing recorded in the last {config.noun}.
              </p>
            </Card>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                <StatTile
                  label="Distance"
                  value={fmtDistance(current.distanceM / 1000)}
                  unit="km"
                  delta={deltaText(
                    current.distanceM,
                    previous?.distanceM ?? null,
                    (v) => `${fmtDistance(v / 1000)} km`,
                    50,
                  )}
                />
                <StatTile
                  label="Ascent"
                  value={fmtElevation(current.elevationGainM)}
                  unit="m"
                  delta={deltaText(
                    current.elevationGainM,
                    previous?.elevationGainM ?? null,
                    (v) => `${fmtElevation(v)} m`,
                    10,
                  )}
                />
                {current.timedActivities === 0 ? (
                  // Every session in the window recorded distance but no moving
                  // time. Elapsed time is not a substitute, so the tile is empty.
                  <Card className="grid place-items-center py-5">
                    <UnavailableState reason="no-data" size="sm" />
                  </Card>
                ) : (
                  <StatTile
                    label="Time"
                    value={fmtDurationCompact(current.movingSec)}
                    delta={deltaText(
                      current.movingSec,
                      previous && previous.timedActivities > 0 ? previous.movingSec : null,
                      fmtDurationCompact,
                      60,
                    )}
                  />
                )}
              </div>

              {/* What the deltas are measured against, and how much of the
                  window the time figure actually covers. Both are scope, not
                  commentary — without them "+2.4 km" and a time total that
                  silently excludes half the sessions are unreadable. */}
              <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
                {previous
                  ? `Change vs the previous ${config.noun}.`
                  : `Nothing recorded in the previous ${config.noun} — no comparison.`}
                {current.timedActivities > 0 &&
                  current.timedActivities < current.activities &&
                  ` Time from ${current.timedActivities} of ${current.activities} activities.`}
              </p>
            </>
          )}
        </Rise>

        {/* ---- Training load ------------------------------------------------ */}
        <Rise className="pt-6">
          <SectionLabel>Training load</SectionLabel>
          <Card className="mt-3">
            {plotLoad ? (
              <>
                <TrendLine data={load.daily} band={band} height={104} />
                {/* "Not a target" stays however short this caption gets. It is
                    the whole of refusal 3: the band is a description of the
                    athlete's own normal, and a band on a chart with nothing
                    saying otherwise is read as a thing to get inside. */}
                <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
                  {band
                    ? "Band: your own 28-day average, 0.8× to 1.15×. Not a target."
                    : "Each point is one day's recorded load."}
                </p>
              </>
            ) : (
              <div className="py-6">
                <UnavailableState reason="too-little-history" size="md" className="mx-auto" />
                <p className="mt-4 text-center text-[12px] leading-relaxed text-mist-dim">
                  Needs {MIN_DAYS_FOR_RATIO} days of history and four sessions. You have{" "}
                  {load.observedDays} {load.observedDays === 1 ? "day" : "days"}.
                </p>
              </div>
            )}

            <p className="mt-4 text-[13px] leading-relaxed text-mist">{load.summary}</p>

            {load.caution && (
              <p className="mt-3 border-l border-alert/40 pl-3 text-[12px] leading-relaxed text-mist">
                {load.caution}
              </p>
            )}

            <Disclaimer className="mt-4">{LOAD_DISCLAIMER}</Disclaimer>
          </Card>
        </Rise>

        {/* ---- Workout distribution ----------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Workout distribution</SectionLabel>
          <Card className="mt-3">
            {segments.length === 0 ? (
              <div className="py-6">
                <UnavailableState reason="no-data" size="md" className="mx-auto" />
                <p className="mt-4 text-center text-[12px] leading-relaxed text-mist-dim">
                  Nothing recorded in the last {config.noun}.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-5">
                  <DonutChart segments={segments} size={112} />
                  <Legend segments={segments} />
                </div>
                {/* The denominator and the unit of counting. A reader who
                    assumes these percentages are shares of TIME reads a legend
                    that says something else entirely. */}
                <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">
                  {current.activities} {current.activities === 1 ? "session" : "sessions"} in the
                  last {config.noun}, by count not by time.
                </p>
              </>
            )}
          </Card>
        </Rise>

        {/* ---- Reviews ------------------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>This week</SectionLabel>
          <ReviewBlock review={week} noun="week" />
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>This month</SectionLabel>
          <ReviewBlock review={month} noun="month" />
        </Rise>

        {/* ---- Personal records ---------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Personal records</SectionLabel>
          {records.length === 0 ? (
            <Card className="mt-3 py-8">
              <UnavailableState reason="no-data" size="md" className="mx-auto" />
              {/* The scope survives every cut: a climber who reads these as
                  career bests is reading a different number than the one shown. */}
              <p className="mt-4 text-center text-[12px] leading-relaxed text-mist-dim">
                Bests within ICEFALL only, not of your career.
              </p>
            </Card>
          ) : (
            <>
              <Card className="mt-3" inset={false}>
                {records.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3.5 last:border-b-0"
                  >
                    <span className="min-w-0 text-[13px] text-mist">{r.label}</span>
                    <span className="tnum shrink-0 text-[15px] font-light text-snow">
                      {r.value}
                    </span>
                  </div>
                ))}
              </Card>
              <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
                All-time, within ICEFALL only.
              </p>
            </>
          )}
        </Rise>

        <Rise className="pt-6">
          <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
        </Rise>
      </Entrance>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Legend                                                                      */
/* -------------------------------------------------------------------------- */

function Legend({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <ul className="min-w-0 flex-1 space-y-2">
      {segments.map((s) => (
        <li key={s.id} className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: s.color }}
          />
          <span className="min-w-0 flex-1 truncate text-[12px] text-mist">{s.label}</span>
          <span className="tnum shrink-0 text-[12px] text-snow">
            {total > 0 ? Math.round((s.value / total) * 100) : 0}%
          </span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Review                                                                      */
/* -------------------------------------------------------------------------- */

function ReviewBlock({ review, noun }: { review: Review; noun: "week" | "month" }) {
  return (
    <div className="mt-3 space-y-3">
      <Card>
        <p className="text-[13px] text-snow">{review.periodLabel}</p>

        <div className="mt-4 space-y-2.5">
          {review.stats.map((stat) => (
            <StatRow key={stat.label} stat={stat} />
          ))}
        </div>
      </Card>

      {review.sparse ? (
        <Card className="py-8">
          {/* reviews.ts refuses to describe a period holding fewer than two
              sessions. Rendering its stats above and this state here is the
              whole of what can honestly be said. */}
          <UnavailableState reason="too-little-history" size="md" className="mx-auto" />
          <p className="mt-4 text-center text-[12px] leading-relaxed text-mist-dim">
            {review.toImprove[0]}
          </p>
          <p className="mt-3 text-center text-[12px] leading-relaxed text-mist">
            {review.nextFocus}
          </p>
        </Card>
      ) : (
        <>
          <ObservationList title="What went well" items={review.wentWell} />
          <ObservationList title="What to improve" items={review.toImprove} />
          <Card>
            <p className="section-label text-azure/85">Next focus</p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">{review.nextFocus}</p>
          </Card>
        </>
      )}

      {review.verdict && (
        <Card>
          <p className="section-label">Verdict</p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-mist">{review.verdict}</p>
        </Card>
      )}

      {!review.sparse && (
        <p className="text-[11px] leading-relaxed text-mist-dim">
          To date, against the same span of the previous {noun}.
        </p>
      )}
    </div>
  );
}

/**
 * One review statistic. The delta is rendered in the same neutral ink as the
 * label: an increase in ascent is not praise and a decrease is not a failure,
 * so nothing here is coloured for direction.
 */
function StatRow({ stat }: { stat: ReviewStat }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="min-w-0 truncate text-[12px] text-mist">{stat.label}</span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span className="tnum text-[13px] font-light text-snow">{stat.value}</span>
        {/* No delta means the previous period held nothing to compare with. */}
        {stat.delta && <span className="tnum text-[11px] text-mist-dim">{stat.delta}</span>}
      </span>
    </div>
  );
}

function ObservationList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card inset={false}>
      <p className="section-label px-4 pt-4">{title}</p>
      <ul className="mt-1">
        {items.map((line) => (
          <li
            key={line}
            className="border-b border-hairline px-4 py-3 text-[13px] leading-relaxed text-mist last:border-b-0"
          >
            {line}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* First run                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The genuine empty state.
 *
 * No sample charts, no greyed-out placeholder numbers, no "you could be here"
 * projection. An athlete with nothing recorded is told exactly what this screen
 * will show once there is something to show, and given the one control that
 * gets them there.
 *
 * The "what appears here" rows are a contents page, not an explanation. Each
 * one carries the fact a climber would otherwise have to discover — the windows,
 * the two thresholds, which records — and nothing else. They used to run two or
 * three sentences each, which made the emptiest screen in the app also the
 * wordiest one.
 */
function FirstRun({ hasGoal, hasPlan }: { hasGoal: boolean; hasPlan: boolean }) {
  const still = useReducedMotion() ?? false;

  return (
    <Screen padded={false}>
      <Entrance still={still} className="px-5">
        <Rise>
          <ScreenHeader title="Progress" subtitle="Nothing recorded yet" />
        </Rise>

        <Rise className="pt-6">
          <Card className="py-10">
            <UnavailableState reason="no-data" size="lg" className="mx-auto" />
            <p className="mt-5 text-center text-[13px] leading-relaxed text-mist">
              Everything here is built from activities you record.
            </p>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>What appears here</SectionLabel>
          <Card className="mt-3" inset={false}>
            {[
              {
                title: "Distance, ascent and time",
                detail: "Week, month, three months or year.",
              },
              {
                title: "Training load",
                detail: `Needs ${MIN_DAYS_FOR_RATIO} days of history and four sessions.`,
              },
              {
                title: "Weekly and monthly reviews",
                detail: "From two recorded sessions in a period upward.",
              },
              {
                title: "Personal records",
                detail: "Your longest, highest and biggest days.",
              },
            ].map((row) => (
              <div key={row.title} className="border-b border-hairline p-4 last:border-b-0">
                <p className="text-[13px] text-snow">{row.title}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">{row.detail}</p>
              </div>
            ))}
          </Card>
        </Rise>

        <Rise className="pt-6">
          <Link to="/activity/select">
            <Button className="w-full" size="lg">
              Record an activity
            </Button>
          </Link>
          {!hasGoal && (
            <Link to="/goals" className="mt-2.5 block">
              <Button variant="secondary" className="w-full" size="lg">
                Set an objective
              </Button>
            </Link>
          )}
          {hasGoal && !hasPlan && (
            <Link to="/coach/training" className="mt-2.5 block">
              <Button variant="secondary" className="w-full" size="lg">
                Build a training plan
              </Button>
            </Link>
          )}
        </Rise>

        <Rise className="pt-6">
          <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
        </Rise>
      </Entrance>
    </Screen>
  );
}
