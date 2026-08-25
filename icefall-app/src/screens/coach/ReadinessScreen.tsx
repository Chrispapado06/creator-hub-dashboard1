import { useMemo, useState } from "react";
import { readinessWord } from "@/coach/readiness";
import { Link } from "react-router-dom";
import { ChevronRight, Flag, PenLine, Route as RouteIcon, TriangleAlert } from "lucide-react";

import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { QualifierBadge, UnavailableState, type DataQualifier } from "@/components/coach/DataState";
import { FactorBar, ScoreRing, TrendLine } from "@/components/coach/CoachUI";

import { useApp } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";
import { useCoachIntel } from "@/coach/hooks";
import { computeTrainingLoad } from "@/coach/load";
import { assessRecovery } from "@/coach/recovery";
import { computeReadiness } from "@/coach/readiness";
import { COACH_DISCLAIMER, CHECK_IN_MAX, CHECK_IN_MIN, known, unavailable } from "@/coach/types";
import type { CheckIn, Score } from "@/coach/types";
import type { Trend } from "@/coach/memory";
import type { RecordedActivity } from "@/tracking/types";

/**
 * Screen 04 — Readiness.
 *
 * How well today suits hard work, given the four things ICEFALL can actually
 * see. It is a planning aid and nothing more: it does not measure fatigue,
 * illness or altitude tolerance, and no line on this screen may be read as a
 * clinical claim. All of the reasoning lives in `computeReadiness`; this file
 * only decides what the athlete sees, and what they are told is missing.
 *
 * The hard part of this screen is the absences. Six factors are presented and
 * only three of them have a data source in this build — HRV and sleep have no
 * source at all on any browser, and stress exists only when the athlete has
 * reported it. Every one of those gaps is rendered as a designed state rather
 * than a zeroed bar, because a flat bar and an empty bar are indistinguishable
 * at a glance and lead to opposite decisions on a mountain morning.
 */

const TABS = [
  { value: "today", label: "Today" },
  { value: "trend", label: "Trend" },
] as const;

type Tab = (typeof TABS)[number]["value"];

/** Days in the Today strip and in the Trend chart. */
const WEEK_DAYS = 7;
const FOUR_WEEKS = 28;

const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The word beside the ring.
 *
 * Thresholds are copied from `band()` in readiness.ts on purpose: the word and
 * the explanation sit inches apart, so a screen that called 66 "Ready" while
 * the paragraph underneath said "better suited to easy work" would be the kind
 * of quiet contradiction an athlete resolves in favour of training. Descriptive
 * of the day, never a verdict on the person.
 */

/* -------------------------------------------------------------------------- */
/* Readiness history                                                           */
/* -------------------------------------------------------------------------- */

export interface ReadinessPoint {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  label: string;
  score: Score;
}

/** Local calendar key. Never toISOString — that shifts the day west of GMT. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Mirrors the private helper in coach/hooks.ts. Duplicated rather than exported
 * because this one has to answer the question as of a PAST day, and the shared
 * thresholds (600 m of ascent, or three hours moving) are the same ones
 * readiness.ts uses so the history cannot disagree with today.
 */
function hoursSinceHardSession(acts: RecordedActivity[], asOf: Date): number | null {
  const hard = acts.filter((a) => a.elevationGainM >= 600 || a.movingSec >= 3 * 3600);
  if (hard.length === 0) return null;
  const latest = hard.reduce((acc, a) => (a.startedAt > acc.startedAt ? a : acc), hard[0]);
  const ms = asOf.getTime() - new Date(latest.startedAt).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

/**
 * Readiness for each of the last `days` days.
 *
 * ICEFALL does not store a readiness score. These points are RECOMPUTED now,
 * each one from only the sessions and the check-in that existed on that day —
 * activities recorded later are excluded, so a day cannot be improved after the
 * fact by work that had not happened yet.
 *
 * Two honest caveats, both surfaced in the caption beside the chart rather than
 * buried here:
 *
 *  1. Objective preparation is not versioned, so today's figure is applied to
 *     every day. It carries 6% of the composite, which shifts an old point by a
 *     point or two — small, but the athlete is told rather than left to assume.
 *  2. Today's point is taken straight from `useCoachIntel` instead of being
 *     recomputed, so the last point on the line is always the same number as the
 *     ring above it. Two different readiness figures on one screen would be
 *     worse than no chart at all.
 *
 * Days that cannot be computed come back as `{ value: null, reason }` and are
 * drawn as gaps. They are never zeroed — a zero would read as "you were wrecked
 * that day" when it means "ICEFALL was not watching".
 */
function useReadinessSeries(args: {
  activities: RecordedActivity[];
  checkIns: CheckIn[];
  goalPreparation: number | null;
  todayScore: Score;
  days: number;
}): ReadinessPoint[] {
  const { activities, checkIns, goalPreparation, todayScore, days } = args;

  return useMemo(() => {
    const byDate = new Map(checkIns.map((c) => [c.date, c]));
    const out: ReadinessPoint[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      end.setDate(end.getDate() - i);
      const key = dayKey(end);
      const label = WEEKDAY_INITIAL[end.getDay()];

      if (i === 0) {
        out.push({ date: key, label, score: todayScore });
        continue;
      }

      // Only what had been recorded by the end of that day. computeReadiness
      // filters its window backwards from `now` but places no upper bound, so
      // without this a session logged yesterday would leak into last Tuesday.
      const upTo = activities.filter((a) => new Date(a.startedAt).getTime() <= end.getTime());

      const load = computeTrainingLoad(upTo, end);
      const recovery = assessRecovery({
        checkIn: byDate.get(key),
        // No health bridge exists on the web, then or now.
        restingHeartRateBpm: null,
        sleepMinutes: null,
        recentLoad: { acute: load.acute, chronic: load.chronic },
        hardSessionHoursAgo: hoursSinceHardSession(upTo, end),
      });
      const readiness = computeReadiness({
        load,
        recovery,
        activities: upTo,
        goalPreparation,
        now: end,
      });

      out.push({ date: key, label, score: readiness.score });
    }

    return out;
  }, [activities, checkIns, goalPreparation, todayScore, days]);
}

/* -------------------------------------------------------------------------- */
/* Factors                                                                     */
/* -------------------------------------------------------------------------- */

interface Factor {
  id: string;
  label: string;
  score: Score;
  note: string;
  qualifier?: DataQualifier;
}

/**
 * The six factors of the design, in the design's order.
 *
 * Three come from the composite. Three do not exist as measurements in this
 * build and are declared as such:
 *
 *   HRV    no API on any browser, no wearable bridge — NO SENSOR, always.
 *   Sleep  same. `assessRecovery` is handed an explicit null by the coach hook
 *          and types that as `no-data`, but from the athlete's side the true
 *          reason is that nothing is connected, so NO SENSOR is what is shown.
 *   Stress the athlete's own report, or NOT REPORTED. Never inferred from load.
 */
function buildFactors(args: {
  components: { id: string; label: string; score: Score; note: string }[];
  checkIn: CheckIn | undefined;
}): Factor[] {
  const { components, checkIn } = args;
  const byId = new Map(components.map((c) => [c.id, c]));

  const from = (id: string, label: string): Factor => {
    const c = byId.get(id);
    return {
      id,
      label,
      score: c?.score ?? unavailable("no-data"),
      note: c?.note ?? "This component was not computed.",
    };
  };

  const stress = checkIn && Number.isFinite(checkIn.stress) ? checkIn.stress : null;

  return [
    from("recovery", "Recovery"),
    {
      id: "hrv",
      label: "HRV",
      score: unavailable("not-connected"),
      note: "ICEFALL cannot read heart-rate variability. No browser exposes it and no wearable is linked, so there is nothing here to show.",
    },
    {
      id: "sleep",
      label: "Sleep",
      score: unavailable("not-connected"),
      note: "No sleep source is connected. Last night is not in this number, and nothing has been assumed about it.",
    },
    // "Training load" upstream. Named "Recent load" here because that is what
    // the component actually reads — the last seven days against the athlete's
    // own twenty-eight-day average — and the design's label is the honest one.
    from("training", "Recent load"),
    {
      id: "stress",
      label: "Stress",
      score:
        stress === null
          ? unavailable("not-reported")
          : // DIRECTION: 5 is the worst end of the stress slider, so the bar is
            // inverted to keep every factor reading the same way — a fuller bar
            // is always the better day. Getting this backwards would recommend
            // hard sessions on the athlete's worst days.
            known(((CHECK_IN_MAX - stress) / (CHECK_IN_MAX - CHECK_IN_MIN)) * 100),
      note:
        stress === null
          ? "You have not reported life stress today, so it is left out rather than assumed to be average."
          : `You reported life stress at ${stress} of ${CHECK_IN_MAX}. Higher is more stress, so a fuller bar is the settled end.`,
      qualifier: stress === null ? undefined : "self-reported",
    },
    from("consistency", "Consistency"),
  ];
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function ReadinessScreen() {
  const intel = useCoachIntel();
  const { todaysCheckIn, checkIns } = useApp();
  const recorded = useRecordedActivities();
  const [tab, setTab] = useState<Tab>("today");

  // Simulated sessions are excluded here, as `useCoachIntel` already does for
  // today's score. Without this the trend chart is drawn from a different set of
  // activities than the number above it, so a simulated run lifts every
  // historical point while leaving today's alone — the chart would show a
  // decline the athlete never had.
  const activities = useMemo(() => recorded.filter((a) => !a.simulated), [recorded]);

  // A genuinely new athlete: nothing recorded, nothing reported, no objective.
  // Not the same as `intel.cold`, which is only about session count.
  const blank = activities.length === 0 && checkIns.length === 0 && !intel.goal;

  return (
    <Screen padded={false}>
      <div className="px-5">
        {/* The qualitative word lives on the ring and nowhere else. Repeating
            it in the header would put two verdicts on one screen, and a
            skimmed header is exactly where a number loses its caveats. */}
        <ScreenHeader title="Readiness" subtitle="How well today suits hard work" back="/coach/today" />
        {!blank && <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />}
      </div>

      {blank ? (
        <BlankState />
      ) : (
        <Stagger key={tab} className="px-5">
          {tab === "today" ? (
            <TodayTab
              intel={intel}
              checkIn={todaysCheckIn}
              checkIns={checkIns}
              activities={activities}
            />
          ) : (
            <TrendTab intel={intel} checkIns={checkIns} activities={activities} />
          )}
        </Stagger>
      )}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Today                                                                       */
/* -------------------------------------------------------------------------- */

type Intel = ReturnType<typeof useCoachIntel>;

function TodayTab({
  intel,
  checkIn,
  checkIns,
  activities,
}: {
  intel: Intel;
  checkIn: CheckIn | undefined;
  checkIns: CheckIn[];
  activities: RecordedActivity[];
}) {
  const { readiness, load } = intel;
  const factors = buildFactors({ components: readiness.components, checkIn });

  const series = useReadinessSeries({
    activities,
    checkIns,
    goalPreparation: intel.goal?.preparation ?? null,
    todayScore: readiness.score,
    days: WEEK_DAYS,
  });

  const computed = series.filter((p) => p.score.value !== null).length;

  return (
    <>
      {/* The number, the word, and the paragraph that justifies both. */}
      <Rise className="pt-6">
        <Card>
          <div className="flex flex-col items-center text-center">
            {/* A null score never reaches the ring as a number — ScoreRing draws
                the unavailable state instead, and no word is offered for a
                figure that does not exist. */}
            <ScoreRing
              score={readiness.score}
              unit="/100"
              size={168}
              label={
                readiness.score.value === null ? undefined : readinessWord(readiness.score.value)
              }
            />
            <p className="section-label mt-4">Readiness</p>
          </div>
          <p className="mt-5 text-[13px] leading-relaxed text-mist">{readiness.explanation}</p>
        </Card>
      </Rise>

      {/* No check-in today. Placed above the factors because it is the one
          thing the athlete can do right now that changes what ICEFALL sees. */}
      {!checkIn && <CheckInPrompt />}

      {readiness.missing.length > 0 && <MissingPanel missing={readiness.missing} />}

      <Rise className="pt-6">
        <SectionLabel>Readiness factors</SectionLabel>
        <Card className="mt-3" inset={false}>
          {factors.map((f, i) => (
            <div
              key={f.id}
              className={i === 0 ? "px-4 py-4" : "border-t border-hairline px-4 py-4"}
            >
              <FactorBar label={f.label} score={f.score} note={f.note} qualifier={f.qualifier} />
            </div>
          ))}
        </Card>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel action={<QualifierBadge kind="estimated" />}>Last seven days</SectionLabel>
        <Card className="mt-3">
          {computed >= 2 ? (
            <>
              <TrendLine points={series.map((p) => ({ label: p.label, score: p.score }))} />
              <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
                {computed} of the last {WEEK_DAYS} days could be computed; the rest are gaps rather
                than zeroes. ICEFALL does not store a daily readiness score, so these points are
                recalculated from the sessions and check-ins recorded at the time. Today&rsquo;s
                objective preparation is applied throughout, which moves an older point by a point
                or two.
              </p>
            </>
          ) : (
            <div className="py-6">
              <UnavailableState reason="too-little-history" size="md" className="mx-auto" />
              <p className="mt-3 text-center text-[11px] leading-relaxed text-mist-dim">
                A line needs at least two computable days. {computed} of the last {WEEK_DAYS} has
                enough behind it so far.
              </p>
            </div>
          )}
        </Card>
      </Rise>

      {load.caution && <CautionStrip caution={load.caution} />}

      <Rise className="pt-6">
        <Link
          to="/coach/recovery"
          className="flex items-center gap-2.5 rounded-card border border-hairline bg-graphite px-4 py-3.5 text-[13px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
        >
          <span className="flex-1">Open recovery</span>
          <ChevronRight size={15} strokeWidth={1.7} />
        </Link>
      </Rise>

      <Rise className="pt-6">
        <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
      </Rise>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Trend                                                                       */
/* -------------------------------------------------------------------------- */

const DIRECTION_COPY: Record<Trend["direction"], string> = {
  improving: "Improving",
  declining: "Declining",
  stable: "Stable",
  // NEVER "stable". An unknown direction means the two windows were too thin to
  // compare, which is a different claim entirely — and the one an athlete would
  // otherwise read as "nothing is changing, carry on".
  unknown: "Not enough history",
};

const DIRECTION_TONE: Record<Trend["direction"], "neutral" | "azure" | "summit"> = {
  improving: "summit",
  declining: "neutral",
  stable: "neutral",
  unknown: "neutral",
};

function TrendTab({
  intel,
  checkIns,
  activities,
}: {
  intel: Intel;
  checkIns: CheckIn[];
  activities: RecordedActivity[];
}) {
  const series = useReadinessSeries({
    activities,
    checkIns,
    goalPreparation: intel.goal?.preparation ?? null,
    todayScore: intel.readiness.score,
    days: FOUR_WEEKS,
  });

  const computed = series.filter((p) => p.score.value !== null).length;

  return (
    <>
      <Rise className="pt-6">
        <SectionLabel action={<QualifierBadge kind="estimated" />}>Four weeks</SectionLabel>
        <Card className="mt-3">
          {computed >= 2 ? (
            <>
              <TrendLine
                points={series.map((p, i) => ({
                  // 28 labels will not fit a phone. One a week keeps the axis
                  // readable without thinning the data behind it.
                  label: i % 7 === 0 || i === series.length - 1 ? p.label : "",
                  score: p.score,
                }))}
                height={120}
              />
              <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
                {computed} of {FOUR_WEEKS} days could be computed. Readiness is not stored day by
                day, so each point is recalculated from what had been recorded by that evening; days
                without enough behind them are left as gaps.
              </p>
            </>
          ) : (
            <div className="py-6">
              <UnavailableState reason="too-little-history" size="md" className="mx-auto" />
              <p className="mt-3 text-center text-[11px] leading-relaxed text-mist-dim">
                Four weeks of readiness needs at least two days ICEFALL could put a number on.
              </p>
            </div>
          )}
        </Card>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>What has changed</SectionLabel>
        <Card className="mt-3" inset={false}>
          {intel.memory.trends.map((t, i) => (
            <div
              key={t.id}
              className={i === 0 ? "px-4 py-3.5" : "border-t border-hairline px-4 py-3.5"}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-snow">{t.label}</p>
                <Badge tone={DIRECTION_TONE[t.direction]}>{DIRECTION_COPY[t.direction]}</Badge>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">{t.detail}</p>
            </div>
          ))}
        </Card>
      </Rise>

      <Rise className="pt-6">
        <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
      </Rise>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The check-in call to action. Deliberately states what the check-in buys
 * ICEFALL rather than what it buys the athlete — there is no streak, no unlock
 * and no score to chase, because a lever attached to self-reported data teaches
 * people to report what keeps the number up.
 */
function CheckInPrompt() {
  return (
    <Rise className="pt-6">
      <Card className="border-azure/25 bg-azure/[0.04]">
        <div className="flex items-start gap-3">
          <PenLine size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] text-snow">No check-in today</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
              Recovery and stress are your report, not a measurement. Without today&rsquo;s they are
              left out of the number rather than filled in with an average.
            </p>
          </div>
        </div>
        <Link to="/coach/check-in" className="mt-4 block">
          <Button className="w-full">Check in</Button>
        </Link>
      </Card>
    </Rise>
  );
}

/** What could not be computed, and the one action that supplies each of them. */
function MissingPanel({ missing }: { missing: string[] }) {
  const HOW: Record<string, { detail: string; to: string; cta: string }> = {
    Recovery: {
      detail: "Comes from your daily check-in.",
      to: "/coach/check-in",
      cta: "Check in",
    },
    "Training load": {
      detail:
        "Needs about a fortnight of recorded sessions before a seven-day average can be compared with a twenty-eight-day one.",
      to: "/activity/select",
      cta: "Record a session",
    },
    Consistency: {
      detail: "Needs a few sessions across a few weeks before a pattern exists to read.",
      to: "/activity/select",
      cta: "Record a session",
    },
    "Goal alignment": {
      detail: "Needs an objective, so there is something to align your training against.",
      to: "/goals",
      cta: "Set an objective",
    },
  };

  return (
    <Rise className="pt-6">
      <SectionLabel>What ICEFALL cannot see</SectionLabel>
      <Card className="mt-3" inset={false}>
        {missing.map((label, i) => {
          const how = HOW[label];
          return (
            <div
              key={label}
              className={i === 0 ? "px-4 py-3.5" : "border-t border-hairline px-4 py-3.5"}
            >
              <p className="text-[13px] text-snow">{label}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-mist-dim">
                {how?.detail ?? "Not enough recorded yet to compute this."}
              </p>
              {how && (
                <Link
                  to={how.to}
                  className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-azure transition-colors hover:text-azure-bright"
                >
                  {how.cta}
                  <ChevronRight size={13} strokeWidth={1.7} />
                </Link>
              )}
            </div>
          );
        })}
      </Card>
    </Rise>
  );
}

/**
 * The load caution, verbatim from `computeTrainingLoad`.
 *
 * Alert-toned, never danger-toned: this is an observation about recorded
 * training, not a claim about the athlete's body, and a red panel would read as
 * a diagnosis. The copy itself is owned by load.ts so the wording cannot drift.
 */
function CautionStrip({ caution }: { caution: string }) {
  return (
    <Rise className="pt-6">
      <Card className="border-alert/30 bg-alert/[0.05]">
        <div className="flex items-start gap-3">
          <TriangleAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-alert" />
          <div className="min-w-0">
            <p className="section-label text-alert/85">Worth noticing</p>
            <p className="mt-2 text-[13px] leading-relaxed text-snow/85">{caution}</p>
          </div>
        </div>
      </Card>
    </Rise>
  );
}

/**
 * A new athlete.
 *
 * No score, no chart and no placeholder ring — an empty ring at zero would be
 * the first thing this app promises never to show. Three concrete steps, in the
 * order that makes the number appear soonest.
 */
function BlankState() {
  const steps: { icon: typeof PenLine; title: string; detail: string; to: string }[] = [
    {
      icon: RouteIcon,
      title: "Record a session",
      detail: "Training load and consistency are read from what you actually record.",
      to: "/activity/select",
    },
    {
      icon: PenLine,
      title: "Log a check-in",
      detail: "Recovery and stress are your own report. Nothing stands in for them.",
      to: "/coach/check-in",
    },
    {
      icon: Flag,
      title: "Set an objective",
      detail: "Goal alignment asks whether recent work is the kind a mountain needs.",
      to: "/goals",
    },
  ];

  return (
    <Stagger className="px-5">
      <Rise className="pt-6">
        <Card>
          <p className="section-label">Nothing to read yet</p>
          <p className="mt-3 text-[13px] leading-relaxed text-mist">
            Readiness is built from four things: your recorded training, your own check-in, how
            regularly you have been out, and whether that work resembles what your objective asks
            for. None of them exist yet, so there is no number. An invented one would be worse than
            none.
          </p>
        </Card>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>Where it comes from</SectionLabel>
        <Card className="mt-3" inset={false}>
          {steps.map((s, i) => (
            <Link
              key={s.title}
              to={s.to}
              className={`flex items-start gap-3 px-4 py-4 transition-colors hover:bg-white/[0.02] ${
                i === 0 ? "" : "border-t border-hairline"
              }`}
            >
              <s.icon size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-snow">{s.title}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-mist-dim">{s.detail}</p>
              </div>
              <ChevronRight size={15} strokeWidth={1.7} className="mt-0.5 shrink-0 text-mist-dim" />
            </Link>
          ))}
        </Card>
      </Rise>

      <Rise className="pt-6">
        <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
      </Rise>
    </Stagger>
  );
}
