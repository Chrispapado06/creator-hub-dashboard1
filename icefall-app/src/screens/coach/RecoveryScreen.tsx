import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, PenLine, ShieldAlert } from "lucide-react";

import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { QualifierBadge, UnavailableState, type DataQualifier } from "@/components/coach/DataState";
import { FactorBar, ScoreRing, TrendLine } from "@/components/coach/CoachUI";

import { useApp } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";
import { useCoachIntel } from "@/coach/hooks";
import { COACH_DISCLAIMER, CHECK_IN_MAX, CHECK_IN_MIN, known, unavailable } from "@/coach/types";
import type { CheckIn, Score } from "@/coach/types";
import type { RecoveryStatus } from "@/coach/recovery";

/**
 * Screen 09 — Recovery.
 *
 * Recovery here is a PLANNING AID assembled almost entirely from what the
 * athlete reported about themselves. It is not a measurement of the body, it
 * cannot tell anyone whether they are recovered, and the six factors on this
 * screen are honest about which half is opinion and which half does not exist
 * at all on this platform.
 *
 * Three of the six — sleep, HRV and resting heart rate — have no data source in
 * this build. No browser exposes any of them and there is no wearable bridge,
 * so they render as NO SENSOR rather than as an empty bar. The other three are
 * the athlete's own sliders and carry a self-reported qualifier everywhere they
 * appear, because a number someone typed about how they feel and a number a
 * device measured must never look identical.
 *
 * The referral path is the load-bearing part of this file. When `assessRecovery`
 * sets `flagForProfessional`, that panel is rendered FIRST, above the score,
 * in the strongest treatment the design system has — it must not be something
 * an athlete can scroll past on the way to a training recommendation.
 */

const TABS = [
  { value: "today", label: "Today" },
  { value: "trends", label: "Trends" },
] as const;

type Tab = (typeof TABS)[number]["value"];

/** Days shown in the reported-check-in history. */
const HISTORY_DAYS = 14;

const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];

/** The word beside the ring. Matches assessRecovery's own banding exactly. */
const STATUS_WORD: Record<RecoveryStatus, string> = {
  good: "Good",
  moderate: "Partial",
  poor: "Poor",
  // Never rendered — an unknown status carries a null score, so the ring shows
  // the unavailable state instead of a word.
  unknown: "Unknown",
};

/* -------------------------------------------------------------------------- */
/* Reported values                                                             */
/* -------------------------------------------------------------------------- */

type ReportedId = "energy" | "soreness" | "sleep" | "stress" | "motivation";

/**
 * The five sliders, with the direction each one runs.
 *
 * DIRECTION IS THE WHOLE POINT OF THIS TABLE. Soreness and stress are reported
 * on a scale where the TOP is the worst day; energy, sleep and motivation run
 * the other way. Every bar and every line on this screen is drawn in one
 * orientation — fuller is the better end — so the two inverted fields are
 * flipped here, once, rather than in five call sites where a sign could be lost
 * and a poor morning could be drawn as a good one.
 */
const REPORTED: { id: ReportedId; label: string; higherIsBetter: boolean; scale: string }[] = [
  { id: "energy", label: "Energy", higherIsBetter: true, scale: "1 empty, 5 fresh" },
  { id: "soreness", label: "Muscle soreness", higherIsBetter: false, scale: "1 none, 5 severe" },
  { id: "sleep", label: "Sleep quality", higherIsBetter: true, scale: "1 broken, 5 deep" },
  { id: "stress", label: "Stress", higherIsBetter: false, scale: "1 settled, 5 very high" },
  { id: "motivation", label: "Motivation", higherIsBetter: true, scale: "1 flat, 5 eager" },
];

/** A reported 1–5 figure as a 0–100 score in the favourable orientation. */
function favourable(raw: number, higherIsBetter: boolean): Score {
  const span = CHECK_IN_MAX - CHECK_IN_MIN;
  const unit = higherIsBetter ? (raw - CHECK_IN_MIN) / span : (CHECK_IN_MAX - raw) / span;
  return known(unit * 100);
}

/** Reads one slider off a check-in, or says it was not reported. */
function reportedScore(
  checkIn: CheckIn | undefined,
  id: ReportedId,
  higherIsBetter: boolean,
): Score {
  const raw = checkIn?.[id];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return unavailable("not-reported");
  return favourable(raw, higherIsBetter);
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

function buildFactors(checkIn: CheckIn | undefined): Factor[] {
  const reported = (id: ReportedId): Factor => {
    const cfg = REPORTED.find((r) => r.id === id);
    // The table above is exhaustive over ReportedId; this only satisfies the
    // compiler without an `any` or a non-null assertion.
    if (!cfg) throw new Error(`Unknown reported field: ${id}`);

    const raw = checkIn?.[id];
    const has = typeof raw === "number" && Number.isFinite(raw);

    return {
      id,
      label: cfg.label,
      score: reportedScore(checkIn, id, cfg.higherIsBetter),
      note: has
        ? `You reported ${raw} of ${CHECK_IN_MAX} — ${cfg.scale}.${
            cfg.higherIsBetter
              ? ""
              : " The bar is inverted so a fuller bar is always the better end."
          }`
        : "Not in today's check-in, so it is left out rather than assumed to be average.",
      qualifier: has ? "self-reported" : undefined,
    };
  };

  return [
    {
      id: "sleep-measured",
      label: "Sleep",
      // `assessRecovery` is handed an explicit null by the coach hook and types
      // that as `no-data`. From the athlete's side the truthful reason is that
      // nothing is connected, so NO SENSOR is what is shown here.
      score: unavailable("not-connected"),
      note: checkIn
        ? "No sleep source is connected, so ICEFALL is not reading last night. The sleep quality you reported in today's check-in is a separate, self-reported figure and it is counted."
        : "No sleep source is connected, so ICEFALL is not reading last night and nothing has been assumed about it.",
    },
    {
      id: "hrv",
      label: "HRV",
      score: unavailable("not-connected"),
      note: "ICEFALL cannot read heart-rate variability. No browser exposes it and no wearable is linked, so there is nothing here to show.",
    },
    {
      id: "resting-hr",
      label: "Resting HR",
      score: unavailable("not-connected"),
      note: "No resting heart rate is available. Even with one, a single reading is shown for context and never scored — without your own baseline it means nothing.",
    },
    reported("soreness"),
    reported("stress"),
    reported("energy"),
  ];
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function RecoveryScreen() {
  const intel = useCoachIntel();
  const { todaysCheckIn, checkIns } = useApp();
  const activities = useRecordedActivities();
  const [tab, setTab] = useState<Tab>("today");

  // A genuinely new athlete: nothing recorded, nothing reported, no objective.
  const blank = activities.length === 0 && checkIns.length === 0 && !intel.goal;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title="Recovery" subtitle="What you have reported today" back="/coach/today" />
        {!blank && <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />}
      </div>

      {blank ? (
        <BlankState />
      ) : (
        <Stagger key={tab} className="px-5">
          {tab === "today" ? (
            <TodayTab intel={intel} checkIn={todaysCheckIn} />
          ) : (
            <TrendsTab checkIns={checkIns} />
          )}
        </Stagger>
      )}
    </Screen>
  );
}

type Intel = ReturnType<typeof useCoachIntel>;

/* -------------------------------------------------------------------------- */
/* Today                                                                       */
/* -------------------------------------------------------------------------- */

function TodayTab({ intel, checkIn }: { intel: Intel; checkIn: CheckIn | undefined }) {
  const { recovery } = intel;
  const factors = buildFactors(checkIn);

  return (
    <>
      {/* First, above everything. A referral must never sit below a training
          recommendation the athlete might read instead. */}
      {recovery.flagForProfessional && <ProfessionalFlag reason={recovery.flagReason} />}

      <Rise className="pt-6">
        <Card>
          <div className="flex flex-col items-center text-center">
            <ScoreRing
              score={recovery.score}
              size={180}
              label={recovery.score.value === null ? undefined : STATUS_WORD[recovery.status]}
              caption="Recovery"
            />
            {recovery.score.value !== null && recovery.reportedCount > 0 && (
              <span className="mt-3">
                {/* The score is a weighted mean of sliders the athlete moved.
                    It is an opinion with arithmetic on top, and it says so.
                    Gated on reportedCount: badging a derived number as
                    "self-reported" told the athlete they had said something they
                    never said, directly above a card offering them the check-in. */}
                <QualifierBadge kind="self-reported" />
              </span>
            )}
          </div>
          <p className="mt-5 text-[13px] leading-relaxed text-mist">{recovery.summary}</p>
        </Card>
      </Rise>

      {!checkIn && <CheckInPrompt />}

      <Rise className="pt-6">
        <SectionLabel>Recovery factors</SectionLabel>
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

      {recovery.recommendations.length > 0 && (
        <Rise className="pt-6">
          <SectionLabel>What to do with today</SectionLabel>
          <Card className="mt-3">
            <ul className="space-y-3">
              {recovery.recommendations.map((r) => (
                <li key={r} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                  {r}
                </li>
              ))}
            </ul>
          </Card>
        </Rise>
      )}

      {/* Without a check-in, CheckInPrompt below already carries the azure
          primary "Check in" — two identical azure primaries in one view read as
          a rendering mistake. This one exists only once there is something to
          update. */}
      {checkIn && (
        <Rise className="pt-6">
          <Link to="/coach/check-in" className="block">
            <Button className="w-full">
              <PenLine size={15} strokeWidth={1.8} />
              Update today's check-in
            </Button>
          </Link>
        </Rise>
      )}

      <Rise className="pt-6">
        <Link
          to="/coach/readiness"
          className="flex items-center gap-2.5 rounded-card border border-hairline bg-graphite px-4 py-3.5 text-[13px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
        >
          <span className="flex-1">Open readiness</span>
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
/* Trends                                                                      */
/* -------------------------------------------------------------------------- */

interface ReportedDay {
  date: string;
  label: string;
  checkIn: CheckIn | undefined;
}

/** Local calendar key. Never toISOString — that shifts the day west of GMT. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The last `days` calendar days, each carrying that day's check-in if there was
 * one. Nothing is recomputed and nothing is interpolated: a day without a
 * check-in stays empty, which is why the lines below have gaps in them rather
 * than a straight segment drawn across a week nobody reported.
 */
function useReportedDays(checkIns: CheckIn[], days: number): ReportedDay[] {
  return useMemo(() => {
    const byDate = new Map(checkIns.map((c) => [c.date, c]));
    const out: ReportedDay[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      out.push({ date: key, label: WEEKDAY_INITIAL[d.getDay()], checkIn: byDate.get(key) });
    }
    return out;
  }, [checkIns, days]);
}

function TrendsTab({ checkIns }: { checkIns: CheckIn[] }) {
  const history = useReportedDays(checkIns, HISTORY_DAYS);
  const logged = history.filter((d) => d.checkIn !== undefined).length;

  if (logged < 2) {
    return (
      <>
        <Rise className="pt-6">
          <Card>
            <div className="py-4">
              <UnavailableState reason="too-little-history" size="lg" className="mx-auto" />
              <p className="mt-4 text-center text-[12px] leading-relaxed text-mist-dim">
                {logged === 0
                  ? `No check-ins in the last ${HISTORY_DAYS} days.`
                  : `One check-in in the last ${HISTORY_DAYS} days.`}{" "}
                A trend needs at least two, and ICEFALL will not draw a line through days you did
                not report.
              </p>
            </div>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <Link to="/coach/check-in" className="block">
            <Button className="w-full">
              <PenLine size={15} strokeWidth={1.8} />
              Check in
            </Button>
          </Link>
        </Rise>

        <Rise className="pt-6">
          <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
        </Rise>
      </>
    );
  }

  return (
    <>
      <Rise className="pt-6">
        <SectionLabel action={<QualifierBadge kind="self-reported" />}>
          Last {HISTORY_DAYS} days
        </SectionLabel>
        <Card className="mt-3">
          <p className="text-[12px] leading-relaxed text-mist">
            You logged {logged} check-ins in the last {HISTORY_DAYS} days. Every line reads the same
            way — higher is the better end of the day — so soreness and stress are drawn inverted,
            because you report those on a scale where five is the worst. Days you did not check in
            are gaps, not zeroes.
          </p>
        </Card>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>What you reported</SectionLabel>
        <Card className="mt-3" inset={false}>
          {REPORTED.map((field, i) => {
            const points = history.map((d) => ({
              label: d.label,
              score: reportedScore(d.checkIn, field.id, field.higherIsBetter),
            }));
            // Most recent report of THIS field, which may be older than the most
            // recent check-in if a slider was left untouched.
            const latest = [...history].reverse().find((d) => {
              const raw = d.checkIn?.[field.id];
              return typeof raw === "number" && Number.isFinite(raw);
            })?.checkIn?.[field.id];

            return (
              <div
                key={field.id}
                className={i === 0 ? "px-4 py-4" : "border-t border-hairline px-4 py-4"}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] text-snow">{field.label}</p>
                  <p className="tnum text-[12px] text-mist-dim">
                    {typeof latest === "number" ? `${latest} of ${CHECK_IN_MAX}` : "Not reported"}
                  </p>
                </div>
                <div className="mt-3">
                  <TrendLine points={points} height={64} />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
                  Scale {field.scale}.
                  {field.higherIsBetter
                    ? ""
                    : " Drawn inverted so a higher line is the better end."}
                </p>
              </div>
            );
          })}
        </Card>
      </Rise>

      <Rise className="pt-6">
        <Link to="/coach/check-in" className="block">
          <Button variant="secondary" className="w-full">
            <PenLine size={15} strokeWidth={1.8} />
            Check in
          </Button>
        </Link>
      </Rise>

      <Rise className="pt-6">
        <Disclaimer>
          These are your own reports, not measurements. They move with mood, weather and the week
          you are having, and ICEFALL reads them as opinion — which is what makes them useful and
          what stops them being a diagnosis.
        </Disclaimer>
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
 * The referral panel.
 *
 * House rule 4: ICEFALL defers to professionals, and this is the one screen
 * where that rule has a trigger attached. It is rendered above the score, in
 * danger tone, at body size rather than caption size, and it offers no training
 * action alongside it — nothing here may give the athlete a way to read past it
 * into a session. The wording is `assessRecovery`'s, which suggests an
 * assessment and never names a condition.
 */
function ProfessionalFlag({ reason }: { reason?: string }) {
  return (
    <Rise className="pt-6">
      <Card className="border-danger/45 bg-danger/[0.07]">
        <div className="flex items-start gap-3">
          <ShieldAlert size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="section-label text-danger">Have this assessed</p>
            <p className="mt-2.5 text-[14px] leading-relaxed text-snow">
              {reason ??
                "You have reported something that belongs with a professional rather than with a training app."}
            </p>
          </div>
        </div>
        <Disclaimer className="mt-4 border-danger/40">
          ICEFALL cannot evaluate symptoms and does not try to. Speak to a doctor or a
          physiotherapist before you train hard again, and stop at the first sign that movement
          makes it worse.
        </Disclaimer>
      </Card>
    </Rise>
  );
}

/**
 * The check-in call to action. States what the check-in buys ICEFALL rather
 * than what it buys the athlete — there is no streak and no unlock, because a
 * reward attached to self-reported data teaches people to report whatever keeps
 * the number up.
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
              Five sliders. Without them recovery rests on training load alone, and most of what it
              would describe is missing rather than estimated.
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

/**
 * A new athlete.
 *
 * No ring at zero and no sample data. Recovery is almost entirely self-report,
 * so the honest empty state is an explanation of that and one way in.
 */
function BlankState() {
  return (
    <Stagger className="px-5">
      <Rise className="pt-6">
        <Card>
          <p className="section-label">Nothing reported yet</p>
          <p className="mt-3 text-[13px] leading-relaxed text-mist">
            Recovery is built from your own check-in — energy, soreness, sleep, stress and
            motivation — with recorded training load behind it. None of that exists yet, so there is
            no score. ICEFALL will not put an average in its place.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-mist">
            Sleep, HRV and resting heart rate stay empty regardless. No browser can read them and no
            wearable is linked, so they are shown as missing rather than filled in.
          </p>
        </Card>
      </Rise>

      <Rise className="pt-6">
        <Link to="/coach/check-in" className="block">
          <Button className="w-full">
            <PenLine size={15} strokeWidth={1.8} />
            Log your first check-in
          </Button>
        </Link>
      </Rise>

      <Rise className="pt-6">
        <Link
          to="/activity/select"
          className="flex items-center gap-2.5 rounded-card border border-hairline bg-graphite px-4 py-3.5 text-[13px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
        >
          <span className="flex-1">Record a session</span>
          <ChevronRight size={15} strokeWidth={1.7} />
        </Link>
      </Rise>

      <Rise className="pt-6">
        <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
      </Rise>
    </Stagger>
  );
}
