import { Link } from "react-router-dom";
import { readinessWord } from "@/coach/readiness";
import {
  Apple,
  Backpack,
  BarChart3,
  CalendarCheck,
  Dumbbell,
  Footprints,
  Gauge,
  Moon,
  MountainSnow,
  Route as RouteIcon,
  Timer,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Avatar, Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { ProgressRing } from "@/components/ui/charts";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { useMountainImage } from "@/components/domain/MountainImage";
import { QualifierBadge, UnavailableState } from "@/components/coach/DataState";
import { QuickActionTile, ScoreRing, SegmentBars, StatTile } from "@/components/coach/CoachUI";
import { useCoachIntel, type CoachIntel } from "@/coach/hooks";
import { COACH_DISCLAIMER, isKnown } from "@/coach/types";
import { useWeeklyProgress } from "@/tracking/feed";
import {
  FOCUS_LABELS,
  fmtCountdown,
  fmtDate,
  fmtDistance,
  fmtDurationCompact,
  fmtElevation,
  fmtHours,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TrainingFocus } from "@/types";

/**
 * Screen 01 — the Coach's front page.
 *
 * Everything here is read from `useCoachIntel()`. Nothing on this screen
 * recomputes a coach figure: the readiness number in this card, the number on
 * the readiness screen and the number behind an adapted session are the same
 * number computed once, and a second opinion assembled in a component would be
 * the fastest way to break that.
 *
 * The screen is built around one rule that outranks the layout: a metric is a
 * value or it is a reason there is no value. So the readiness ring is only ever
 * drawn from a known `Score`; a null score gets `UnavailableState` and the ring
 * is not drawn at all, because a full ring reads as a measurement and an empty
 * one reads as zero — and "readiness unknown" and "readiness 0" would send an
 * athlete up two different mountains.
 *
 * Two further honesty decisions live in here rather than in the coach modules,
 * because they are presentation problems:
 *
 *  - HRV and sleep are shown as NO SENSOR, permanently. There is no browser API
 *    for either, and iOS gives no Web Bluetooth, so ICEFALL cannot read them on
 *    this device. They appear because the athlete is owed the knowledge that the
 *    readiness number was computed without them, not because we hope to fill
 *    them in later.
 *  - Where the briefing has held back a prescribed hard session, the prescribed
 *    distance and duration are suppressed. They belong to a session that is no
 *    longer today's, and printed beside "Easy session or rest" they would read
 *    as targets — which is exactly the nudge to train through a bad day that
 *    this product must never give.
 */

/* -------------------------------------------------------------------------- */
/* Copy helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One word for the centre of the ring.
 *
 * Every band describes the SESSION the day suits, never the athlete. "Rest" is
 * a statement about training; "depleted" or "fatigued" would be statements
 * about a body ICEFALL has not measured and is not qualified to describe.
 */

/**
 * The card gets one sentence; the readiness screen gets the paragraph.
 *
 * Split on ". " rather than "." so a decimal inside the explanation — the load
 * ratio arrives as "1.24× your 28-day average" — cannot truncate the line
 * mid-number and turn a real figure into a different one.
 */
function firstSentence(text: string): string {
  const end = text.indexOf(". ");
  return end === -1 ? text : text.slice(0, end + 1);
}

/**
 * How the athlete supplies a component readiness could not compute.
 *
 * Keyed by component id rather than label so a copy change upstream cannot
 * silently detach the action from the thing it fixes. Every line is an
 * instruction, never a lever: "log a check-in" is a fact about what is missing,
 * whereas "log it to unlock your score" would push people to report a day they
 * have not had.
 */
const SUPPLY: Record<string, { to: string; cta: string }> = {
  training: { to: "/activity/select", cta: "Record a session" },
  recovery: { to: "/coach/check-in", cta: "Log today's check-in" },
  consistency: { to: "/activity/select", cta: "Record a session" },
  "goal-alignment": { to: "/goals", cta: "Set an objective" },
};

/** One icon per focus, so the plan card is readable before it is read. */
const FOCUS_ICON: Record<TrainingFocus, LucideIcon> = {
  recovery: Waves,
  endurance: Footprints,
  strength: Dumbbell,
  intervals: Timer,
  "long-mountain": MountainSnow,
  rest: Moon,
  technical: RouteIcon,
};

const QUICK_ACTIONS: { label: string; icon: LucideIcon; to: string }[] = [
  { label: "Today's plan", icon: CalendarCheck, to: "/coach/training" },
  { label: "Analyse week", icon: BarChart3, to: "/coach/progress" },
  { label: "Readiness", icon: Gauge, to: "/coach/readiness" },
  { label: "Nutrition", icon: Apple, to: "/coach/nutrition" },
  // The gear catalogue already carries the objective-specific rationale, so this
  // points at the screen that exists rather than at a coach-only duplicate.
  { label: "Gear advice", icon: Backpack, to: "/gear" },
  { label: "Mountains", icon: MountainSnow, to: "/explore" },
];

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function CoachHome() {
  const intel = useCoachIntel();
  const weekly = useWeeklyProgress();

  // Monday-first, matching `useWeeklyProgress`'s own bucketing.
  const todayIndex = (new Date().getDay() + 6) % 7;

  /**
   * A genuinely new athlete: no objective, no plan, and too few sessions for
   * any of the coach modules to speak. Showing them the full dashboard would be
   * six cards of "not enough data", which teaches people to ignore the absence
   * states everywhere else in the app.
   */
  const blank = !intel.goal && !intel.plan && intel.cold;

  return (
    <Screen padded={false}>
      <Stagger className="px-5">
        <Rise className="pt-6">
          <p className="section-label">Coach</p>
          <h1 className="mt-2.5 text-[22px] font-light leading-snug tracking-[-0.02em] text-snow">
            {intel.briefing.greeting}
          </h1>
          <p className="mt-2.5 flex gap-2.5 text-[13px] leading-relaxed text-mist">
            <span
              aria-hidden="true"
              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-azure"
            />
            <span className="min-w-0">{intel.briefing.status}</span>
          </p>
        </Rise>

        {blank ? (
          <FirstDays />
        ) : (
          <>
            {intel.cold && <ColdNotice />}
            <ReadinessCard intel={intel} />
            <PlanCard intel={intel} />
            {intel.goal && <GoalCard goal={intel.goal} />}
            <InsightCard note={intel.briefing.note} />

            <Rise className="pt-6">
              <SectionLabel action={<span className="section-label text-mist-dim">This week</span>}>
                Weekly progress
              </SectionLabel>
              <Card className="mt-3">
                <div className="grid grid-cols-3 gap-3">
                  <StatTile label="Distance" value={fmtDistance(weekly.distanceKm)} unit="km" />
                  <StatTile label="Ascent" value={fmtElevation(weekly.elevationM)} unit="m" />
                  <StatTile label="Time" value={fmtHours(weekly.timeHours)} />
                </div>
                <SegmentBars
                  className="mt-5"
                  data={weekly.daily}
                  labels={DAY_LABELS}
                  activeIndex={todayIndex}
                />
                {/* A zero here is a real count, not a substituted one — but only
                    if the label says what was counted. These are recorded
                    sessions, not everything the athlete did. */}
                <p className="mt-4 border-t border-hairline pt-3.5 text-[11px] leading-relaxed text-mist-dim">
                  {weekly.activities === 0
                    ? "Nothing recorded since Monday. These figures count what you record, not what you did."
                    : `From ${weekly.activities} recorded ${weekly.activities === 1 ? "activity" : "activities"} since Monday. Daily bars show distance.`}
                </p>
              </Card>
            </Rise>
          </>
        )}

        <Rise className="pt-6">
          <SectionLabel>Quick actions</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {QUICK_ACTIONS.map((a) => (
              <QuickActionTile key={a.label} to={a.to} icon={a.icon} label={a.label} />
            ))}
          </div>
        </Rise>

        <Rise className="pt-8">
          <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Cold start                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Shown while there is a plan or an objective but barely any recorded history.
 * The point is to set the expectation before the athlete reads a thin number,
 * not to apologise for one afterwards.
 */
function ColdNotice() {
  return (
    <Rise className="pt-6">
      <Card className="border-hairline-strong">
        <p className="section-label">Still learning you</p>
        <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
          The Coach sharpens with every session you record. Until a few weeks sit behind it, expect
          gaps here rather than confident figures — a number built on two sessions would read like a
          verdict on everything.
        </p>
      </Card>
    </Rise>
  );
}

/**
 * The true empty state: nothing recorded, nothing planned, nothing to aim at.
 *
 * Three concrete inputs, in the order that makes the rest work. No numbers, no
 * placeholder rings, no sample data dressed up as the athlete's own.
 */
function FirstDays() {
  const steps: { label: string; detail: string; to: string; cta: string }[] = [
    {
      label: "Set an objective",
      detail:
        "A mountain and a date. The plan is built backwards from it, and preparation is measured against it.",
      to: "/goals",
      cta: "Choose a mountain",
    },
    {
      label: "Record a session",
      detail:
        "Load, consistency and every trend on this screen are read from recorded activities. Nothing is inferred from what you tell us you usually do.",
      to: "/activity/select",
      cta: "Start an activity",
    },
    {
      label: "Report how you feel",
      detail:
        "Five sliders. It is the only input that reflects the whole day, and without it recovery stays unknown rather than assumed average.",
      to: "/coach/check-in",
      cta: "Log a check-in",
    },
  ];

  return (
    <Rise className="pt-6">
      <SectionLabel>Getting started</SectionLabel>
      <Card className="mt-3">
        <p className="text-[13px] leading-relaxed text-mist">
          The Coach has nothing to work from yet. It will not guess: until there is something
          recorded, every figure on this screen stays withheld rather than filled in.
        </p>
      </Card>

      <div className="mt-2.5 space-y-2.5">
        {steps.map((s, i) => (
          <Card key={s.label} inset={false} className="p-4">
            <div className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-full border border-hairline-strong text-[11px] text-mist-dim"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-snow">{s.label}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{s.detail}</p>
                <Link
                  to={s.to}
                  className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-azure transition-colors hover:text-azure-bright"
                >
                  {s.cta}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Rise>
  );
}

/* -------------------------------------------------------------------------- */
/* Readiness                                                                  */
/* -------------------------------------------------------------------------- */

function ReadinessCard({ intel }: { intel: CoachIntel }) {
  const { readiness } = intel;
  const score = readiness.score;

  // Missing components are read back off the components list rather than off
  // `readiness.missing`, which carries labels only. The id is what maps to an
  // action the athlete can actually take.
  const gaps = readiness.components.filter((c) => c.score.value === null);

  return (
    <Rise className="pt-6">
      <SectionLabel>Today's readiness</SectionLabel>
      <Card className="mt-3" inset={false}>
        <div className="p-4">
          {isKnown(score) ? (
            <div className="flex items-center gap-5">
              <div className="shrink-0">
                <ScoreRing score={score} unit="/100" size={96} label={readinessWord(score.value)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-relaxed text-mist">
                  {firstSentence(readiness.explanation)}
                </p>
                {/* Readiness is composed from recorded training and a self-report,
                    not measured. The badge is the difference between a figure the
                    athlete can act on and one they can be misled by. */}
                <span className="mt-3 inline-block">
                  <QualifierBadge kind="estimated" />
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-1.5 text-center">
              {/* No ring. A ring at 0% is indistinguishable from a measured zero,
                  and a ring at 100% would be an outright fabrication. */}
              <UnavailableState reason={score.reason ?? "no-data"} size="lg" />
              <p className="mt-4 text-[13px] leading-relaxed text-mist">
                {firstSentence(readiness.explanation)}
              </p>
            </div>
          )}
        </div>

        {gaps.length > 0 && (
          <div className="border-t border-hairline px-4 py-3.5">
            <p className="section-label">
              {isKnown(score) ? "Not counted in this number" : "What is missing"}
            </p>
            <ul className="mt-3 space-y-3">
              {gaps.map((c) => {
                const supply = SUPPLY[c.id];
                return (
                  <li key={c.id}>
                    <p className="text-[13px] text-snow">{c.label}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-mist">{c.note}</p>
                    {supply && (
                      <Link
                        to={supply.to}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-azure transition-colors hover:text-azure-bright"
                      >
                        {supply.cta}
                        <span aria-hidden="true">→</span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/*
          Permanently absent, and shown as such.

          Neither figure has a source on this device: no browser exposes heart-rate
          variability or sleep, and iOS has no Web Bluetooth to reach a strap with.
          They sit here as NO SENSOR rather than as an empty bar, because an empty
          bar says "your HRV is low" to anyone glancing at it.
        */}
        <div className="border-t border-hairline px-4 py-3.5">
          <p className="section-label">Not available to ICEFALL</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <SensorGap label="HRV" />
            <SensorGap label="Sleep" />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
            ICEFALL cannot read heart-rate variability or sleep on this device, so neither is part
            of the figure above. Nothing has been estimated in their place.
          </p>
        </div>

        <Link
          to="/coach/readiness"
          className="flex items-center gap-2 border-t border-hairline px-4 py-3.5 text-[13px] text-azure transition-colors hover:text-azure-bright"
        >
          <span className="flex-1">View details</span>
          <span aria-hidden="true">→</span>
        </Link>
      </Card>
    </Rise>
  );
}

function SensorGap({ label }: { label: string }) {
  return (
    <div className="rounded-tile border border-hairline px-3 py-3.5">
      <p className="section-label text-center text-[9px]">{label}</p>
      <UnavailableState reason="not-connected" size="sm" className="mt-2.5" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Today's plan                                                               */
/* -------------------------------------------------------------------------- */

function PlanCard({ intel }: { intel: CoachIntel }) {
  const training = intel.briefing.training;
  const planned = intel.today ?? null;

  /**
   * The briefing swaps a prescribed hard session for recovery when recovery is
   * poor, load has spiked, or readiness is low. A different focus is the reliable
   * signal that it did: the pass-through branch copies `today.focus` verbatim,
   * and the substitution branch always writes "recovery" over a focus that was
   * in the hard set, so the two can never coincide.
   */
  const adapted = Boolean(planned && training && training.focus !== planned.focus);

  const hasTargets = Boolean(
    planned && (planned.durationMin || planned.distanceKm || planned.elevationM),
  );
  const showTargets = Boolean(planned && !adapted && hasTargets);

  const Icon = training ? FOCUS_ICON[training.focus] : Moon;

  return (
    <Rise className="pt-6">
      <SectionLabel>Today's plan</SectionLabel>
      <Card className="mt-3" inset={false}>
        {training ? (
          <>
            <div className="flex items-start gap-3.5 p-4">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-slate"
              >
                <Icon size={17} strokeWidth={1.4} className="text-azure" />
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-normal leading-snug text-snow">{training.title}</h3>
                <p className="section-label mt-1.5 text-azure/80">
                  {FOCUS_LABELS[training.focus] ?? training.focus}
                </p>
                {planned && !adapted && !hasTargets && (
                  // Absence with a reason, not an em-dash: some sessions are
                  // prescribed by intent rather than by numbers.
                  <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
                    No distance or duration prescribed for this session.
                  </p>
                )}
              </div>

              {showTargets && planned ? (
                <div className="shrink-0 text-right">
                  {planned.durationMin ? (
                    <p className="tnum text-[16px] font-light leading-none text-snow">
                      {fmtDurationCompact(planned.durationMin * 60)}
                    </p>
                  ) : null}
                  {planned.distanceKm ? (
                    <p className="tnum mt-2 text-[12px] text-mist">
                      {fmtDistance(planned.distanceKm)} km
                    </p>
                  ) : planned.elevationM ? (
                    <p className="tnum mt-2 text-[12px] text-mist">
                      {fmtElevation(planned.elevationM)} m
                    </p>
                  ) : null}
                </div>
              ) : adapted ? (
                // The prescribed figures are deliberately not printed here. See
                // the note on `adapted` above.
                <Badge tone="azure" className="shrink-0">
                  Adjusted
                </Badge>
              ) : null}
            </div>

            <div className="border-t border-hairline px-4 py-3.5">
              <p className="section-label">Purpose</p>
              <p className="mt-2 text-[13px] leading-relaxed text-mist">{training.detail}</p>
            </div>

            <div className="p-4">
              {planned ? (
                <Button asChild className="w-full text-[12px] uppercase tracking-[0.14em]">
                  <Link to={`/coach/session/${planned.date}`}>Start session</Link>
                </Button>
              ) : (
                // The briefing can recommend recovery on a day the plan has
                // nothing scheduled. There is no session to open, and inventing a
                // date would open one that was never prescribed.
                <Button asChild variant="secondary" className="w-full">
                  <Link to="/activity/select">Record what you do instead</Link>
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="p-4">
            <p className="text-[13px] leading-relaxed text-mist">Nothing scheduled today.</p>
            {/* Missed and empty days are not debts. Nothing here suggests
                catching up, which is how athletes turn a rest day into a spike. */}
            <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
              Rest is part of the build, and nothing needs making up.
            </p>
          </div>
        )}
      </Card>
    </Rise>
  );
}

/* -------------------------------------------------------------------------- */
/* Current goal                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Held in its own component so `useMountainImage` is only mounted when there is
 * a mountain to look up — a hook cannot be called conditionally, and an athlete
 * with no objective should not be firing a photo request for one.
 */
function GoalCard({ goal }: { goal: NonNullable<CoachIntel["goal"]> }) {
  const image = useMountainImage({ name: goal.name, elevationM: goal.elevationM });
  const preparation = Math.round(goal.preparation);

  return (
    <Rise className="pt-6">
      <SectionLabel>Current goal</SectionLabel>
      <div className="relative mt-3 overflow-hidden rounded-card border border-hairline bg-graphite">
        <img
          src={image.src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          // Derived terrain is held back so it reads as texture. A photograph of
          // the actual peak is the only image shown at full strength.
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            image.real ? "opacity-100" : "opacity-40",
          )}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/85 to-obsidian/30" />

        <div className="relative flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[17px] font-normal text-snow">{goal.name}</h3>
            <p className="tnum mt-1.5 text-[12px] text-mist">
              {goal.elevationM ? `${fmtElevation(goal.elevationM)} m · ` : ""}
              {fmtCountdown(goal.targetDate)}
            </p>
            <p className="tnum mt-1 text-[11px] text-mist-dim">Target {fmtDate(goal.targetDate)}</p>
          </div>

          <div className="shrink-0 text-center">
            <ProgressRing value={preparation} size={72} stroke={2.5}>
              <div className="text-center">
                <p className="tnum text-[18px] font-extralight leading-none text-snow">
                  {preparation}%
                </p>
                <p className="section-label mt-1 text-[8px] text-azure/85">Prepared</p>
              </div>
            </ProgressRing>
            {/* Preparation is derived from completed training against the plan,
                not a figure the athlete set or a measurement of the mountain. */}
            <span className="mt-2.5 inline-block">
              <QualifierBadge kind="estimated" />
            </span>
          </div>
        </div>

        {!image.real && image.caption && (
          <p className="relative px-4 pb-2 text-[10px] text-mist-dim">{image.caption}</p>
        )}

        <Link
          to={`/goals/${goal.id}`}
          className="relative flex items-center gap-2 border-t border-hairline px-4 py-3.5 text-[13px] text-azure transition-colors hover:text-azure-bright"
        >
          <span className="flex-1">View goal</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </Rise>
  );
}

/* -------------------------------------------------------------------------- */
/* Coach insight                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `CoachInsight` in domain/cards carries the same treatment but has no room for
 * the avatar this screen's design calls for, so the card is composed here from
 * the same tokens rather than the shared component being widened for one screen.
 */
function InsightCard({ note }: { note: string }) {
  return (
    <Rise className="pt-6">
      <SectionLabel>Coach insight</SectionLabel>
      <Card className="mt-3 border-azure/20 bg-azure/[0.04]">
        <div className="flex gap-3.5">
          <Avatar name="ICEFALL Coach" size={32} />
          <div className="min-w-0 flex-1">
            <p className="section-label text-azure/80">ICEFALL Coach</p>
            <blockquote className="mt-2.5 border-l border-azure/30 pl-3 text-[13px] leading-relaxed text-snow/85">
              {note}
            </blockquote>
          </div>
        </div>
      </Card>
    </Rise>
  );
}
