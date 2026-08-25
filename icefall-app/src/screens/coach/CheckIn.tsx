import { useMemo, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { QualifierBadge, ScoreValue, UnavailableState } from "@/components/coach/DataState";
import { CHECKIN_FIELDS, type CheckInField, type RecoveryStatus } from "@/coach/recovery";
import { CHECK_IN_MAX, CHECK_IN_MIN, COACH_DISCLAIMER } from "@/coach/types";
import type { CheckIn as CheckInReport } from "@/coach/types";
import { useCoachIntel } from "@/coach/hooks";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";

/**
 * The daily check-in.
 *
 * Five questions, each one the athlete's own opinion. Nothing on this screen is
 * measured, and the copy says so in three separate places on purpose — a number
 * that came out of a slider looks identical to a number that came off a chest
 * strap once it reaches a card, and only the athlete can tell them apart if we
 * label them.
 *
 * Design decisions that are safety rules, not preferences:
 *
 *  - NO PRE-SELECTED DEFAULT. An unanswered field stays empty and the save
 *    control stays disabled. Seeding every row at the midpoint would post a
 *    full report the athlete never made, and recovery would then score it.
 *  - NO GOOD/BAD COLOUR ON THE SCALE. Soreness and stress run the other way
 *    (see CheckIn in @/coach/types), so a green "5" would be right for three
 *    fields and wrong for two. The anchor words carry the direction instead.
 *  - THE ASSESSMENT IS NEVER SHOWN BEFORE IT EXISTS. Until the report is saved
 *    there is nothing to assess, and an empty status card would read as "fine".
 */

/** The five values in progress. A field the athlete has not answered is absent. */
type Answers = Partial<Record<CheckInField, number>>;

/** 1…5 inclusive, straight from the shared constants rather than a literal. */
const SCALE: number[] = Array.from(
  { length: CHECK_IN_MAX - CHECK_IN_MIN + 1 },
  (_, i) => CHECK_IN_MIN + i,
);

const STATUS_LABEL: Record<RecoveryStatus, string> = {
  good: "Good",
  moderate: "Partial",
  poor: "Poor",
  unknown: "Not assessed",
};

/** Tone follows the primitives' vocabulary. Poor is alert, never danger red. */
const STATUS_TONE: Record<RecoveryStatus, "neutral" | "azure" | "summit" | "alert"> = {
  good: "summit",
  moderate: "azure",
  poor: "alert",
  unknown: "neutral",
};

function answersFrom(saved: CheckInReport | undefined): Answers {
  if (!saved) return {};
  return {
    energy: saved.energy,
    soreness: saved.soreness,
    sleep: saved.sleep,
    stress: saved.stress,
    motivation: saved.motivation,
  };
}

/**
 * The answers as a complete report, or null when one is still outstanding.
 * Returning null rather than filling the gap is the whole point: a partial
 * report must not reach `saveCheckIn`, because every consumer downstream
 * treats a stored field as something the athlete actually said.
 */
function completeReport(a: Answers): Omit<CheckInReport, "date"> | null {
  const { energy, soreness, sleep, stress, motivation } = a;
  if (
    typeof energy !== "number" ||
    typeof soreness !== "number" ||
    typeof sleep !== "number" ||
    typeof stress !== "number" ||
    typeof motivation !== "number"
  ) {
    return null;
  }
  return { energy, soreness, sleep, stress, motivation };
}

export default function CheckIn() {
  const { todaysCheckIn, saveCheckIn } = useApp();
  const { recovery } = useCoachIntel();

  const [answers, setAnswers] = useState<Answers>(() => answersFrom(todaysCheckIn));
  // A returning athlete sees the assessment their saved report produced, rather
  // than being asked to answer the same five questions again to see it.
  const [showAssessment, setShowAssessment] = useState(Boolean(todaysCheckIn));

  const report = completeReport(answers);
  const answered = CHECKIN_FIELDS.filter((f) => typeof answers[f.id] === "number").length;

  // Edits made after saving are flagged rather than silently ignored: the card
  // below still describes the SAVED report, and saying so is cheaper than
  // letting the athlete believe the words moved with the sliders.
  const dirty = useMemo(() => {
    if (!todaysCheckIn) return false;
    return CHECKIN_FIELDS.some((f) => answers[f.id] !== todaysCheckIn[f.id]);
  }, [answers, todaysCheckIn]);

  const submit = () => {
    if (!report) return;
    saveCheckIn(report);
    setShowAssessment(true);
  };

  const counted = recovery.inputs.filter((i) => i.value !== null);
  const missing = recovery.inputs.filter((i) => i.value === null);
  const missingHealthSource = missing.some(
    (i) => i.id === "sleepDuration" || i.id === "restingHeartRate",
  );

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Daily check-in"
          subtitle="Five questions, answered by you"
          back="/coach/today"
          action={<QualifierBadge kind="self-reported" />}
        />
      </div>

      <Stagger className="px-5">
        {/* What this is — and, more importantly, what it is not. */}
        <Rise>
          <Card>
            <p className="text-[13px] leading-relaxed text-mist">
              These five answers are your own report of how you feel today. ICEFALL cannot measure
              any of them. It records what you tell it and uses that to shape the session it
              suggests — nothing here is a physiological reading, and nothing here is a medical
              assessment.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-mist">
              Two of the five run the other way: high soreness and high stress are the harder end.
              The words under each row say which end is which.
            </p>
          </Card>
        </Rise>

        {/* The report */}
        <Rise className="pt-6">
          <SectionLabel
            action={
              <span className="tnum text-[10px] tracking-[0.12em] text-mist-dim">
                {answered} / {CHECKIN_FIELDS.length}
              </span>
            }
          >
            Today
          </SectionLabel>

          <div className="mt-3 space-y-3">
            {CHECKIN_FIELDS.map((field) => (
              <ScaleField
                key={field.id}
                label={field.label}
                low={field.low}
                high={field.high}
                value={answers[field.id]}
                onChange={(v) => setAnswers((prev) => ({ ...prev, [field.id]: v }))}
              />
            ))}
          </div>
        </Rise>

        {/* Save */}
        <Rise className="pt-6">
          <Button className="w-full" size="lg" onClick={submit} disabled={report === null}>
            {todaysCheckIn ? "Update today's check-in" : "Save check-in"}
          </Button>
          {report === null && (
            <p className="mt-3 text-center text-[12px] leading-relaxed text-mist-dim">
              {CHECKIN_FIELDS.length - answered} still to answer. Unanswered questions are left
              unanswered rather than filled in with a middle value.
            </p>
          )}
          {report !== null && dirty && (
            <p className="mt-3 text-center text-[12px] leading-relaxed text-mist-dim">
              You have changed an answer since saving. The assessment below still describes the
              saved report.
            </p>
          )}
          {todaysCheckIn && !dirty && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-mist-dim">
              <Check size={12} strokeWidth={1.8} aria-hidden="true" />
              Saved for today
            </p>
          )}
        </Rise>

        {/* The assessment this report produced */}
        {showAssessment && todaysCheckIn && (
          <>
            <Rise className="pt-6">
              <SectionLabel>Recovery</SectionLabel>
              <Card className="mt-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <ScoreValue score={recovery.score} size="lg" qualifier="self-reported" />
                  </div>
                  <Badge tone={STATUS_TONE[recovery.status]} size="md" className="mt-1 shrink-0">
                    {STATUS_LABEL[recovery.status]}
                  </Badge>
                </div>
                <p className="mt-4 text-[13px] leading-relaxed text-mist">{recovery.summary}</p>
              </Card>
            </Rise>

            {/* Professional referral, placed above the recommendations so it is
                read before any advice about training. */}
            {recovery.flagForProfessional && recovery.flagReason && (
              <Rise className="pt-6">
                <Card className="border-alert/35 bg-alert/[0.05]">
                  <div className="flex items-center gap-2">
                    <TriangleAlert size={14} strokeWidth={1.6} className="shrink-0 text-alert" />
                    <p className="section-label text-alert">Have this assessed</p>
                  </div>
                  <Disclaimer className="mt-3 border-alert/40 text-[12px] text-mist">
                    {recovery.flagReason}
                  </Disclaimer>
                </Card>
              </Rise>
            )}

            {recovery.recommendations.length > 0 && (
              <Rise className="pt-6">
                <SectionLabel>What this means for today</SectionLabel>
                <Card className="mt-3" inset={false}>
                  <ul>
                    {recovery.recommendations.map((line) => (
                      <li
                        key={line}
                        className="border-b border-hairline p-4 text-[13px] leading-relaxed text-mist last:border-b-0"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Rise>
            )}

            {/* Provenance: what was counted, and what was not. */}
            <Rise className="pt-6">
              <SectionLabel>What went into it</SectionLabel>

              {counted.length > 0 && (
                <Card className="mt-3" inset={false}>
                  {counted.map((input) => (
                    <div
                      key={input.id}
                      className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3 last:border-b-0"
                    >
                      <span className="min-w-0 text-[13px] text-mist">{input.label}</span>
                      <span className="tnum shrink-0 text-[13px] font-light text-snow">
                        {input.value}
                      </span>
                    </div>
                  ))}
                </Card>
              )}

              {missing.length > 0 && (
                <>
                  <p className="mt-4 text-[12px] leading-relaxed text-mist-dim">
                    Not counted. These are left out of the score rather than filled in with an
                    average.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {missing.map((input) => (
                      <Card key={input.id} className="flex flex-col items-center py-5 text-center">
                        {/* A null with no reason is an upstream bug; `no-data`
                            is the weakest honest claim available. */}
                        <UnavailableState reason={input.reason ?? "no-data"} size="sm" />
                        <p className="mt-3 text-[11px] leading-relaxed text-mist">{input.label}</p>
                      </Card>
                    ))}
                  </div>
                  {missingHealthSource && (
                    <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
                      Sleep duration and resting heart rate would come from Apple Health or Health
                      Connect. No browser can read either, so on the web they stay empty rather than
                      being estimated.
                    </p>
                  )}
                </>
              )}
            </Rise>
          </>
        )}

        <Rise className="pt-6">
          <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* ScaleField                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One question: a labelled row of choices across CHECK_IN_MIN..CHECK_IN_MAX with
 * the anchor words beneath the ends they belong to.
 *
 * Rendered as a radiogroup rather than an `<input type="range">` because a
 * slider always has a thumb somewhere, which means it always looks answered.
 * Five discrete controls can genuinely show "nothing chosen", and each one is
 * 44 px tall so it can be hit on a mountain with gloves on.
 */
function ScaleField({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-light text-snow">{label}</p>
        <span className="tnum shrink-0 text-[11px] text-mist-dim">
          {typeof value === "number" ? `${value} of ${CHECK_IN_MAX}` : "Not answered"}
        </span>
      </div>

      <div role="radiogroup" aria-label={label} className="mt-3.5 flex gap-2">
        {SCALE.map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${label}: ${n} of ${CHECK_IN_MAX}`}
              onClick={() => onChange(n)}
              className={cn(
                "tnum h-11 flex-1 rounded-tile border text-[14px] transition-colors duration-200",
                selected
                  ? "border-azure/50 bg-azure/10 text-azure"
                  : "border-hairline-strong text-mist hover:border-azure/30 hover:text-snow",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-mist-dim">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </Card>
  );
}
