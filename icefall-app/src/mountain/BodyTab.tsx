/**
 * MOUNTAIN MODE · BODY (brief M5, plan §3.4, slice item 6).
 *
 * Imported directly into App.tsx (plan §2.3), so it stays light: no map, no
 * network, no subscription check. The symptom check here is the existing Lake
 * Louise engine and its existing words, asked one question per screen.
 *
 * REBUILT TO THE OWNER'S MOCKUP (docs/mountain-mode-mockups.md §7, mockup 4).
 * Nothing about the logic, the storage or the safety order moved. What moved is
 * the hierarchy:
 *
 *   SYMPTOM CHECK (filled azure)  — the primary action, now at the very top
 *   TONIGHT / Sleep no higher than / the one hero number
 *   three equal state buttons, the chosen one amber-outlined
 *   DRINK and EAT, each with its elapsed time and an azure-outlined LOG
 *   the altitude standing line, amber-framed when the athlete reported symptoms
 *
 * HONESTY. Every number here is computed or absent. `tonightView` returns the
 * schedule's own sentences when it cannot give a ceiling, and that sentence
 * keeps the hero's slot rather than collapsing it. The elapsed times are the
 * phone's own log, and read "Nothing logged yet" when there is none.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { ArrowLeft, Info } from "lucide-react";

import { ALTITUDE_STANDING_LINE, SAFETY_DISCLAIMER, SAFETY_MESSAGES } from "@/coach/safety";
import { NOT_KEPT, type SavedHere } from "@/device/savedHere";
import { cn } from "@/lib/utils";
import { asAltitudeIllnessHistory } from "@/services/acclimatisation";
import { useApp } from "@/state/AppState";
import {
  ATAXIA_TEST_NOTE,
  DESCENT_IS_ALWAYS_AVAILABLE,
  ESCALATION_HEADING,
  FUNCTIONAL_OPTIONS,
  FUNCTIONAL_QUESTION,
  LAKE_LOUISE_QUESTIONS,
  RED_FLAG_QUESTIONS,
  scoreLakeLouise,
  type LikertScore,
} from "@/trip/lakeLouise";
import { addCheck, useTrip } from "@/trip/trip";

import {
  CHECK_IN_LABEL,
  CHECK_STEPS,
  bodyStorageSentence,
  checkInToday,
  emptyDraft,
  forgetBodyEvent,
  readBodyLog,
  recordBodyEvent,
  toAnswers,
  tonightView,
  unsureFlags,
  useBodyLog,
  useNowMs,
  withCheckIn,
  withIntake,
  writeBodyLog,
  type BodyEventSaved,
  type CheckDraft,
  type CheckInChoice,
  type FlagChoice,
} from "./body";
import { ageLabel } from "./format";
import { MOUNTAIN_PATHS } from "./paths";
import { useMountainTrip } from "./trip";
import { BigButton, HeroNumber, M_ROW, SectionLabel, buttonClass } from "./ui";

const CHECK_PATH = `${MOUNTAIN_PATHS.body}/check`;
const UNWELL_PATH = `${MOUNTAIN_PATHS.body}/unwell`;

const fmtM = (m: number) => Math.round(m).toLocaleString("en-GB");

/**
 * The mockup's amber notice is two lines: the question, then what to do. Both
 * are `ALTITUDE_STANDING_LINE` split at its own question mark rather than
 * retyped, so the safety copy still has exactly one home.
 */
const STANDING_SPLIT = ALTITUDE_STANDING_LINE.indexOf("?");
const STANDING_QUESTION = ALTITUDE_STANDING_LINE.slice(0, STANDING_SPLIT + 1);
const STANDING_ACTION = ALTITUDE_STANDING_LINE.slice(STANDING_SPLIT + 1).trim();

/** The mockup's footnote under every symptom-check question. */
const SCORE_NOT_DIAGNOSIS = "This gives a score, not a diagnosis.";

/** The order the three state buttons sit in, left to right. */
const CHECK_IN_ORDER: readonly CheckInChoice[] = ["good", "symptoms", "unwell"];

export default function BodyTab() {
  return (
    <Routes>
      <Route index element={<Overview />} />
      <Route path="check" element={<GloveCheck />} />
      <Route path="unwell" element={<Unwell />} />
      <Route path="*" element={<Overview />} />
    </Routes>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                    */
/* -------------------------------------------------------------------------- */

function Overview() {
  const navigate = useNavigate();
  const { trip, day, today } = useMountainTrip();
  const { nights } = useTrip();
  const { coachProfile } = useApp();
  const log = useBodyLog();
  const now = useNowMs();
  /* One line for the whole tab: did the phone keep it, and is anything waiting.
     `where` comes back from the sync queue, so this screen never claims it. */
  const [status, setStatus] = useState<{ notKept: boolean; where: SavedHere | null }>({
    notKept: false,
    where: null,
  });
  const report = (p: Partial<{ notKept: boolean; where: SavedHere | null }>) =>
    setStatus((s) => ({ ...s, ...p }));

  const history = asAltitudeIllnessHistory(coachProfile.altitudeIllness);
  const view = useMemo(
    () => tonightView(trip, day, nights, history, today),
    [trip, day, nights, history, today],
  );
  const checkIn = checkInToday(log, today);
  const tripId = trip?.record?.id ?? null;

  const checkInWith = (choice: CheckInChoice) => {
    const at = Date.now();
    report({ notKept: !writeBodyLog(withCheckIn(readBodyLog(), choice, at)), where: null });
    void recordBodyEvent({ kind: "check-in", at, tripId, choice }).then((s) =>
      report({ where: s.where }),
    );
    /* UNCHANGED, AND NOT TO BE CHANGED: "Unwell" opens the advice before
       anything else. The questions come after it, never in front of it. */
    if (choice === "unwell") navigate(UNWELL_PATH);
    else if (choice === "symptoms") navigate(CHECK_PATH);
  };

  /* The amber frame is a response to what the athlete reported, not decoration.
     With nothing reported, or "Feeling good", the same two lines stay in the
     same slot in quiet grey — this line is a standing one and never leaves. */
  const flagged = checkIn?.choice === "symptoms" || checkIn?.choice === "unwell";

  return (
    <div className="flex min-h-full flex-col pb-8">
      {/* 1 — the primary action, above everything else */}
      <div className="px-5 pt-5">
        <BigButton variant="azure" to={CHECK_PATH}>
          Symptom check
        </BigButton>
      </div>

      {/* 2 — tonight's ceiling: the one hero on this screen */}
      <section className="px-5 pt-8" aria-labelledby="tonight-heading">
        <SectionLabel as="h2" id="tonight-heading">
          Tonight
        </SectionLabel>
        {view.kind === "ceiling" ? (
          <>
            <p className="m-text-body mt-1 text-mist">Sleep no higher than</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <HeroNumber size="large" value={fmtM(view.ceilingM)} unit="m" />
              <p className="m-text-label max-w-[45%] shrink-0 text-right leading-tight text-mist">
                acclimatisation plan
              </p>
            </div>
            <p className="m-text-label mt-3 leading-snug text-mist">{view.sentence}</p>
          </>
        ) : (
          /* No number can be computed, so the schedule's own reason keeps the
             slot. The layout does not collapse and nothing is invented. */
          <p className="m-text-body mt-2 leading-snug text-mist">{view.sentence}</p>
        )}
        {view.kind !== "no-trip" && view.caveat && (
          <p className="m-text-label mt-2 leading-snug text-mist">{view.caveat}</p>
        )}
        {view.kind !== "no-trip" && view.medicalNote && (
          <p className="m-text-label mt-2 leading-snug text-mist">{view.medicalNote}</p>
        )}
        {trip?.notice && <p className="m-text-label mt-2 leading-snug text-mist-dim">{trip.notice}</p>}
      </section>

      {/* 3 — how do you feel: three equal states, the chosen one amber */}
      <section className="px-5 pt-8" aria-labelledby="checkin-heading">
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel as="h2" id="checkin-heading">
            How do you feel?
          </SectionLabel>
          <p className="m-text-label shrink-0 text-right text-mist">
            {checkIn ? ageLabel(now - checkIn.at) : "Nothing logged today"}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-labelledby="checkin-heading">
          {CHECK_IN_ORDER.map((choice) => {
            const on = checkIn?.choice === choice;
            return (
              <button
                key={choice}
                type="button"
                aria-pressed={on}
                onClick={() => checkInWith(choice)}
                className={cn(
                  buttonClass("amber-outline", "sm"),
                  "w-full whitespace-normal px-1 tracking-[0.04em]",
                  /* Unselected is a plain outline; only the chosen state is
                     amber, which is how the mockup shows the answer. */
                  !on && "border-hairline-strong text-snow",
                )}
              >
                {CHECK_IN_LABEL[choice]}
              </button>
            );
          })}
        </div>
      </section>

      {/* 4 — drink and eat */}
      <section className="mt-8" aria-label="Drink and eat">
        <IntakeRow kind="drink" label="Drink" at={log.drinkAt} now={now} tripId={tripId} report={report} />
        <IntakeRow kind="eat" label="Eat" at={log.eatAt} now={now} tripId={tripId} report={report} />
      </section>

      {/* 5 — the standing altitude line, framed amber when it applies */}
      <div
        className={cn(
          "mx-5 mt-8",
          flagged && "rounded-[12px] border-[1.5px] border-alert px-4 py-4",
        )}
      >
        <p className={cn("m-text-body font-medium leading-snug", flagged ? "text-alert" : "text-mist")}>
          {STANDING_QUESTION}
        </p>
        <p className={cn("m-text-body mt-1 leading-snug", flagged ? "text-alert" : "text-mist")}>
          {STANDING_ACTION}
        </p>
      </div>

      <div className="mt-auto pt-6">
        <SaveLine status={status} />
        <p className="m-text-label px-5 leading-snug text-mist-dim">{bodyStorageSentence()} No reminders.</p>
      </div>
    </div>
  );
}

/** Where the last tap went, in one short line. Silent until something is tapped. */
function SaveLine({ status }: { status: { notKept: boolean; where: SavedHere | null } }) {
  const sentence = status.notKept ? NOT_KEPT : (status.where?.sentence ?? null);
  if (!sentence) return null;
  const bad = status.notKept || status.where?.state === "not-kept";
  return (
    <p className={cn("m-text-label px-5 pb-2 leading-snug", bad ? "text-alert" : "text-mist-dim")}>
      {sentence}
    </p>
  );
}

function IntakeRow({
  kind,
  label,
  at,
  now,
  tripId,
  report,
}: {
  kind: "drink" | "eat";
  label: string;
  at: number | null;
  now: number;
  tripId: string | null;
  report: (p: Partial<{ notKept: boolean; where: SavedHere | null }>) => void;
}) {
  /* One step of undo for a mis-tap; it does not survive leaving the screen.
     The save is held as a PROMISE, not its result: in gloves the undo beats the
     write often, and holding the result would leave the history row behind. */
  const [undo, setUndo] = useState<{ previous: number | null; saved: Promise<BodyEventSaved> } | null>(null);

  const log = () => {
    const current = readBodyLog();
    const loggedAt = Date.now();
    report({ notKept: !writeBodyLog(withIntake(current, kind, loggedAt)), where: null });
    const saved = recordBodyEvent({ kind, at: loggedAt, tripId, choice: null });
    void saved.then((s) => report({ where: s.where }));
    setUndo({ previous: kind === "drink" ? current.drinkAt : current.eatAt, saved });
  };
  const revert = () => {
    if (!undo) return;
    report({ notKept: !writeBodyLog(withIntake(readBodyLog(), kind, undo.previous)), where: null });
    void undo.saved.then(forgetBodyEvent);
    setUndo(null);
  };

  return (
    <div className={cn(M_ROW, "gap-3 py-3 pr-3")}>
      <div className="min-w-0 flex-1">
        <SectionLabel>{label}</SectionLabel>
        <p className={cn("m-text-title mt-0.5 leading-tight", at ? "text-snow" : "text-mist")}>
          {at ? ageLabel(now - at) : "Nothing logged yet"}
        </p>
      </div>
      {undo && (
        <button type="button" onClick={revert} className="m-text-label min-h-16 min-w-16 shrink-0 px-2 text-mist">
          Undo
        </button>
      )}
      <button
        type="button"
        onClick={log}
        aria-label={`Log ${label.toLowerCase()} now`}
        className={cn(buttonClass("azure-outline", "sm"), "shrink-0")}
      >
        Log
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* "Unwell" — the advice first, the questions second                           */
/* -------------------------------------------------------------------------- */

function Unwell() {
  const [first, ...rest] = SAFETY_MESSAGES["altitude-ams"].split("\n\n");
  // The shell's scroller keeps its position across routes; the advice must open at its first line.
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.closest("main")?.scrollTo(0, 0);
  }, []);
  return (
    <div ref={top} className="flex min-h-full flex-col">
      <section className="px-5 pt-6">
        <p className="text-[28px] font-medium leading-tight text-danger">{first}</p>
        {rest.map((p, i) => (
          <p key={i} className="m-text-body mt-3 leading-snug text-snow">
            {p}
          </p>
        ))}
        <p className="m-text-body mt-4 leading-snug text-snow">{DESCENT_IS_ALWAYS_AVAILABLE}</p>
        <p className="m-text-label mt-4 leading-snug text-mist-dim">{SAFETY_DISCLAIMER}</p>
      </section>
      <section className="mt-auto flex flex-col gap-3 px-5 pb-6 pt-8">
        <BigButton variant="azure" to={CHECK_PATH}>
          Answer a few questions
        </BigButton>
        <BigButton variant="red" to={MOUNTAIN_PATHS.sos}>
          SOS · numbers and your position
        </BigButton>
        <Link
          to={MOUNTAIN_PATHS.body}
          className="m-text-body flex min-h-16 items-center justify-center text-mist"
        >
          Back
        </Link>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The symptom check, one question per screen                                  */
/* -------------------------------------------------------------------------- */

/**
 * The hero question, sized to what it actually says. The mockup's question is
 * one word; ours range from "Headache" to a whole sentence of red-flag wording
 * that is quoted verbatim and cannot be shortened. Long questions step down so
 * they still fit a 320 px screen on one screenful.
 */
function questionSize(text: string): string {
  const px = text.length <= 24 ? 52 : text.length <= 44 ? 38 : text.length <= 80 ? 30 : 26;
  return `calc(${px}px * var(--mountain-text-scale, 1))`;
}

function GloveCheck() {
  const navigate = useNavigate();
  const { trip } = useMountainTrip();
  const [draft, setDraft] = useState<CheckDraft>(emptyDraft);
  const [step, setStep] = useState(0);
  const [showResult, setShowResult] = useState(false);
  // Where "Keep answering" returns to after the result was opened early.
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [savedWhere, setSavedWhere] = useState<SavedHere | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const result = useMemo(() => scoreLakeLouise(toAnswers(draft)), [draft]);
  const urgent = result.escalation === "descend-now" || result.escalation === "stop-ascending";

  useEffect(() => {
    top.current?.closest("main")?.scrollTo(0, 0);
  }, [step, showResult]);

  const advance = (next: CheckDraft, jumpToResult: boolean) => {
    setDraft(next);
    setSavedTo(null);
    setSavedWhere(null);
    if (step >= CHECK_STEPS.length - 1) {
      setResumeAt(null);
      setShowResult(true);
    } else if (jumpToResult) {
      setResumeAt(step + 1);
      setShowResult(true);
    } else setStep(step + 1);
  };

  if (showResult) {
    const unsure = unsureFlags(draft).length;
    const [first, ...rest] = result.body.split("\n\n");
    const record = trip?.record ?? null;
    return (
      <div ref={top} className="flex min-h-full flex-col">
        <section className="px-5 pt-6">
          <h1
            className={cn(
              "font-light leading-none tracking-[-0.02em]",
              urgent ? "text-danger" : "text-snow",
            )}
            style={{ fontSize: "calc(40px * var(--mountain-text-scale, 1))" }}
          >
            {ESCALATION_HEADING[result.escalation]}
          </h1>
          <p className="m-text-body mt-4 leading-snug text-snow">{first}</p>
          {rest.map((p, i) => (
            <p key={i} className="m-text-body mt-3 leading-snug text-mist">
              {p}
            </p>
          ))}
          <p className="m-text-body mt-4 leading-snug text-snow">{result.descent}</p>
        </section>

        <section className="mt-6 border-t border-hairline px-5 py-5" aria-labelledby="form-says">
          <SectionLabel as="h2" id="form-says">
            Your score
          </SectionLabel>
          <HeroNumber
            size="large"
            className="mt-1"
            value={result.total === null ? "No total" : `${result.total} / 12`}
            tone={result.total === null ? "mist" : "snow"}
          />
          <p className="m-text-body mt-2 leading-snug text-mist">{result.scoreReading}</p>
          {result.functional !== null && (
            <p className="m-text-label mt-2 leading-snug text-mist">
              Effect on your day: {result.functional} of 3, not added to the total.
            </p>
          )}
          {unsure > 0 && (
            <p className="m-text-label mt-2 leading-snug text-mist">
              You said "Not sure" to {unsure} warning sign{unsure === 1 ? "" : "s"}. That is not read as no.
            </p>
          )}
          <p className="m-text-label mt-3 leading-snug text-mist-dim">{result.notADiagnosis}</p>
          <p className="m-text-label mt-2 leading-snug text-mist-dim">{result.moment}</p>
          <p className="m-text-label mt-2 leading-snug text-mist-dim">{result.disclaimer}</p>
        </section>

        <section className="mt-auto flex flex-col gap-3 px-5 pb-6 pt-4">
          {resumeAt !== null && (
            <BigButton
              variant="azure-outline"
              onClick={() => {
                setShowResult(false);
                setStep(resumeAt);
                setResumeAt(null);
              }}
            >
              Keep answering
            </BigButton>
          )}
          {record ? (
            savedTo ? (
              <div className="flex min-h-16 flex-col items-center justify-center gap-1 px-5 text-center">
                <p className="m-text-body text-mist">Saved to {savedTo}</p>
                {savedWhere && (
                  <p
                    className={cn(
                      "m-text-label leading-snug",
                      savedWhere.state === "not-kept" ? "text-alert" : "text-mist-dim",
                    )}
                  >
                    {savedWhere.sentence}
                  </p>
                )}
              </div>
            ) : (
              <BigButton
                variant="azure-outline"
                onClick={() => {
                  const saved = addCheck({ tripId: record.id, answers: toAnswers(draft), altitudeM: null });
                  setSavedTo(record.name);
                  void recordBodyEvent({
                    kind: "symptom-check",
                    at: new Date(saved.at).getTime(),
                    tripId: record.id,
                    choice: result.escalation,
                    score: result.total,
                  }).then((s) => setSavedWhere(s.where));
                }}
              >
                Save to this trip
              </BigButton>
            )
          ) : (
            <p className="m-text-label flex min-h-16 items-center justify-center text-center text-mist-dim">
              No trip of yours is open, so this check is not saved.
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setShowResult(false);
                setResumeAt(null);
                setStep(0);
              }}
              className="m-text-body min-h-16 flex-1 text-mist"
            >
              Change answers
            </button>
            <BigButton variant="azure" className="flex-1" onClick={() => navigate(MOUNTAIN_PATHS.body)}>
              Done
            </BigButton>
          </div>
        </section>
      </div>
    );
  }

  const s = CHECK_STEPS[step];
  const kindLabel =
    s.kind === "flag" ? "Warning sign · not scored" : s.kind === "item" ? "Scored 0 to 3" : "Not added to the score";
  const question =
    s.kind === "flag" ? RED_FLAG_QUESTIONS[s.id] : s.kind === "item" ? LAKE_LOUISE_QUESTIONS[s.id].question : FUNCTIONAL_QUESTION;
  const last = step >= CHECK_STEPS.length - 1;

  /* The answer button, one shape for all three kinds of question: full width,
     generously tall, outlined, uppercase. Only the chosen one fills. */
  const answerClass = (on: boolean, red: boolean) =>
    cn(
      "flex min-h-[72px] w-full items-center justify-between gap-3 rounded-[12px] px-5 py-4 text-left",
      "m-text-body font-semibold uppercase leading-snug tracking-[0.06em] transition-colors",
      red
        ? on
          ? "bg-[color:var(--ice-danger-fill,#d92b1f)] text-[color:var(--ice-on-accent)]"
          : "border-[1.5px] border-danger text-danger"
        : on
          ? "bg-azure text-obsidian"
          : "border-[1.5px] border-hairline-strong text-snow",
    );

  return (
    <div ref={top} className="flex min-h-full flex-col">
      {/* Back · progress · cancel — the mockup's top row */}
      <div className="flex items-start justify-between gap-2 px-2 pt-1">
        <button
          type="button"
          aria-label={step === 0 ? "Back to Body" : "Previous question"}
          onClick={() => (step === 0 ? navigate(MOUNTAIN_PATHS.body) : setStep(step - 1))}
          className="flex min-h-16 min-w-16 items-center justify-center text-snow"
        >
          <ArrowLeft size={24} strokeWidth={1.8} aria-hidden />
        </button>
        <div className="flex flex-col items-center gap-2 pt-5">
          <div className="flex items-center gap-1.5" aria-hidden>
            {CHECK_STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-2 w-2 rounded-full",
                  i === step ? "bg-azure" : i < step ? "bg-mist-dim" : "bg-hairline-strong",
                )}
              />
            ))}
          </div>
          <p className="section-label tnum text-mist">
            {step + 1} of {CHECK_STEPS.length}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(MOUNTAIN_PATHS.body)}
          className="section-label flex min-h-16 min-w-16 items-center justify-center px-2 text-mist"
        >
          Cancel
        </button>
      </div>

      <section className="px-5 pt-3">
        <SectionLabel as="h2">Symptom check</SectionLabel>

        {urgent && (
          <div className="mt-4 border-l-2 border-danger py-2 pl-4">
            <p className="m-text-body font-medium text-danger">{ESCALATION_HEADING[result.escalation]}</p>
            <button
              type="button"
              onClick={() => {
                setResumeAt(step);
                setShowResult(true);
              }}
              className="m-text-body flex min-h-16 items-center text-snow underline underline-offset-4"
            >
              Read what to do now
            </button>
          </div>
        )}

        <h1
          className="mt-3 font-light uppercase leading-[1.06] tracking-[-0.01em] text-snow"
          style={{ fontSize: questionSize(question) }}
        >
          {question}
        </h1>
        <p className="m-text-label mt-2 text-mist">{kindLabel}</p>
        {s.kind === "flag" && s.id === "ataxia" && (
          <p className="m-text-label mt-2 leading-snug text-mist">{ATAXIA_TEST_NOTE}</p>
        )}
      </section>

      <section className="mt-auto flex flex-col gap-2.5 px-5 pt-5" role="radiogroup" aria-label={question}>
        {s.kind === "flag"
          ? (
              [
                { v: "yes", text: "Yes" },
                { v: "no", text: "No" },
                { v: "unsure", text: "Not sure" },
              ] as { v: FlagChoice; text: string }[]
            ).map((o) => {
              const on = draft.flags[s.id] === o.v;
              return (
                <button
                  key={o.v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => advance({ ...draft, flags: { ...draft.flags, [s.id]: o.v } }, o.v === "yes")}
                  className={answerClass(on, o.v === "yes")}
                >
                  <span>{o.text}</span>
                </button>
              );
            })
          : (s.kind === "item" ? LAKE_LOUISE_QUESTIONS[s.id].options : FUNCTIONAL_OPTIONS).map((label, i) => {
              const score = i as LikertScore;
              const current = s.kind === "item" ? draft.items[s.id] : draft.functional;
              const on = current === score;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() =>
                    s.kind === "item"
                      ? advance({ ...draft, items: { ...draft.items, [s.id]: score } }, false)
                      : advance({ ...draft, functional: score }, score === 3)
                  }
                  className={answerClass(on, false)}
                >
                  <span className="min-w-0 flex-1">{label}</span>
                  {/* The score this answer carries. Quiet, but never hidden: the
                      athlete can see what the form is about to add up. */}
                  <span className={cn("tnum m-text-label shrink-0 font-normal", on ? "opacity-70" : "text-mist")}>
                    {score}
                  </span>
                </button>
              );
            })}

        {/* Skipping leaves the question unanswered, which the scorer reads as
            unanswered rather than as "no". Quiet, because it is the rare path. */}
        <button
          type="button"
          onClick={() => {
            if (!last) return setStep(step + 1);
            setResumeAt(null);
            setShowResult(true);
          }}
          className="m-text-label flex min-h-16 items-center justify-center text-mist"
        >
          {last ? "See result" : "Skip this question"}
        </button>

        <p className="m-text-label flex items-center justify-center gap-2 pb-6 text-center text-mist">
          <Info size={16} strokeWidth={1.8} aria-hidden className="shrink-0" />
          {SCORE_NOT_DIAGNOSIS}
        </p>
      </section>
    </div>
  );
}
