import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Group } from "@/components/settings/kit";
import { Button } from "@/components/ui/primitives";
import { COMPUTED_ON_THIS_DEVICE } from "@/trip/connectivity";
import {
  ATAXIA_TEST_NOTE,
  ESCALATION_HEADING,
  FUNCTIONAL_OPTIONS,
  FUNCTIONAL_QUESTION,
  LAKE_LOUISE_ITEMS,
  LAKE_LOUISE_QUESTIONS,
  RECENT_ASCENT_PRECONDITION,
  RED_FLAG_ORDER,
  RED_FLAG_QUESTIONS,
  emptyAnswers,
  scoreLakeLouise,
  type LakeLouiseAnswers,
  type LikertScore,
  type RedFlagId,
} from "@/trip/lakeLouise";
import { useTrip } from "@/trip/trip";

/**
 * THE LAKE LOUISE SELF-CHECK SCREEN.
 *
 * ============================================================================
 * THE RESULT IS ON SCREEN BEFORE THE FORM IS FINISHED, AND THAT IS THE DESIGN
 * ============================================================================
 *
 * `scoreLakeLouise` runs on every render against whatever has been filled in so
 * far, and the escalation strip sits ABOVE the questions. So the moment
 * somebody ticks "unsteady on their feet", the descent card is already on the
 * screen — they do not have to answer four more questions, scroll, and press
 * Submit to be told to go down. There is no submit gate on the advice.
 *
 * Saving the check to the trip log is a separate, optional tap. If the athlete
 * closes the phone and walks down without saving, the app has done its job.
 *
 * ============================================================================
 * NOTHING HERE TOUCHES THE NETWORK OR A TIER
 * ============================================================================
 *
 * Every import on this screen is local: the scorer (which imports only
 * `coach/safety.ts`, which imports nothing), the trip store (localStorage), and
 * chrome. There is no `useEntitlement`, no paywall branch and no model call,
 * and `src/trip/offline.test.ts` fails the moment one appears.
 *
 * ============================================================================
 * NO BOXES
 * ============================================================================
 *
 * Flat rows, hairline separators, spacing. The one exception is the escalation
 * strip, which is a genuinely distinct object — an instruction that is not part
 * of the form — and it is a left rule and a tint rather than a bordered card.
 */

/* -------------------------------------------------------------------------- */
/* Controls                                                                    */
/* -------------------------------------------------------------------------- */

/** 0-3, as four flat options. Never a slider: a slider implies a continuum. */
function ScoreChoice({
  options,
  value,
  onChange,
  name,
}: {
  options: readonly [string, string, string, string];
  value: LikertScore | null;
  onChange: (v: LikertScore) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="mt-2">
      {options.map((label, i) => {
        const score = i as LikertScore;
        const on = value === score;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(score)}
            className={`-mx-5 flex w-full items-center gap-3 border-t border-hairline px-5 py-3 text-left transition-colors first:border-t-0 ${
              on ? "bg-azure/[0.07]" : "hover:bg-white/[0.03]"
            }`}
          >
            <span
              aria-hidden
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                on ? "border-azure bg-azure" : "border-hairline-strong"
              }`}
            >
              {on && <span className="h-1.5 w-1.5 rounded-full bg-obsidian" />}
            </span>
            <span className={`flex-1 text-[14px] ${on ? "text-snow" : "text-mist"}`}>{label}</span>
            <span className="tnum shrink-0 text-[12px] text-mist-dim">{score}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Yes / no / not answered. "Not answered" stays visible — it is a real state. */
function YesNo({
  value,
  onChange,
  label,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="mt-2.5 flex gap-2" role="radiogroup" aria-label={label}>
      {[
        { v: true, text: "Yes" },
        { v: false, text: "No" },
      ].map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.text}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.v)}
            className={`h-9 flex-1 rounded-[8px] border text-[13px] transition-colors ${
              on
                ? o.v
                  ? "border-danger/60 bg-danger/15 text-danger"
                  : "border-azure/50 bg-azure/10 text-snow"
                : "border-hairline-strong text-mist hover:text-snow"
            }`}
          >
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The escalation strip                                                        */
/* -------------------------------------------------------------------------- */

const STRIP: Record<string, string> = {
  "descend-now": "border-danger bg-danger/[0.08]",
  "stop-ascending": "border-danger/70 bg-danger/[0.05]",
  "tell-someone": "border-azure/60 bg-azure/[0.05]",
  "nothing-recorded": "border-hairline-strong",
  incomplete: "border-hairline-strong",
};

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function LakeLouiseCheck() {
  const navigate = useNavigate();
  const { trip, addCheck } = useTrip();
  const [answers, setAnswers] = useState<LakeLouiseAnswers>(emptyAnswers);
  const [altitude, setAltitude] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  /* RE-SCORED ON EVERY KEYSTROKE. See the header: the advice must not wait for
     a submit button, so there is no submit button in front of it. */
  const result = useMemo(() => scoreLakeLouise(answers), [answers]);

  const setItem = (id: (typeof LAKE_LOUISE_ITEMS)[number], v: LikertScore) =>
    setAnswers((a) => ({ ...a, items: { ...a.items, [id]: v } }));

  const setFlag = (id: RedFlagId, v: boolean) =>
    setAnswers((a) => ({ ...a, redFlags: { ...a.redFlags, [id]: v } }));

  const altitudeM = altitude.trim() === "" ? null : Number(altitude);
  const altitudeUsable = altitudeM === null || (Number.isFinite(altitudeM) && altitudeM >= -500 && altitudeM <= 9000);

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Altitude self-check"
          subtitle="The Lake Louise questionnaire, 2018 revision"
          back="/trip"
        />
      </div>

      <Stagger className="px-5">
        {/* ---------------------------------------------------------------- */}
        {/* THE RESULT, FIRST. Not at the bottom, not behind a submit.        */}
        {/* ---------------------------------------------------------------- */}
        <Rise>
          <div className={`border-l-2 py-3.5 pl-4 ${STRIP[result.escalation]}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mist-dim">
              {ESCALATION_HEADING[result.escalation]}
            </p>
            {result.body.split("\n\n").map((p, i) => (
              <p
                key={i}
                className={`mt-2 leading-relaxed ${
                  i === 0 ? "text-[15px] text-snow" : "text-[13px] text-mist"
                }`}
              >
                {p}
              </p>
            ))}
          </div>

          {/* THE DESCENT LINE. On every result, at every score, unconditionally. */}
          <p className="mt-3.5 text-[13px] leading-relaxed text-snow">{result.descent}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-mist">{result.moment}</p>
        </Rise>

        {/* ---------------------------------------------------------------- */}
        {/* The warning signs — asked FIRST, never scored                     */}
        {/* ---------------------------------------------------------------- */}
        <Group label="Warning signs · not part of the score">
          <p className="text-[13px] leading-relaxed text-mist">
            These are not on the questionnaire and are not added to anything. They are the signs
            that the score cannot see, and any one of them answered yes is the whole answer.
          </p>
          <div className="mt-3">
            {RED_FLAG_ORDER.map((id) => (
              <div key={id} className="-mx-5 border-t border-hairline px-5 py-3.5 first:border-t-0">
                <p className="text-[14px] leading-relaxed text-snow">{RED_FLAG_QUESTIONS[id]}</p>
                {id === "ataxia" && (
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">
                    {ATAXIA_TEST_NOTE}
                  </p>
                )}
                <YesNo
                  value={answers.redFlags[id]}
                  onChange={(v) => setFlag(id, v)}
                  label={RED_FLAG_QUESTIONS[id]}
                />
              </div>
            ))}
          </div>
        </Group>

        {/* ---------------------------------------------------------------- */}
        {/* The four scored questions                                         */}
        {/* ---------------------------------------------------------------- */}
        <Group label="The questionnaire · four questions, 0 to 3 each">
          <p className="text-[13px] leading-relaxed text-mist">{RECENT_ASCENT_PRECONDITION}</p>
          <div className="mt-3">
            {LAKE_LOUISE_ITEMS.map((id) => {
              const q = LAKE_LOUISE_QUESTIONS[id];
              return (
                <div key={id} className="-mx-5 border-t border-hairline px-5 py-4 first:border-t-0">
                  <p className="text-[14px] text-snow">{q.question}</p>
                  <ScoreChoice
                    options={q.options}
                    value={answers.items[id]}
                    onChange={(v) => setItem(id, v)}
                    name={q.question}
                  />
                </div>
              );
            })}
          </div>
        </Group>

        {/* ---------------------------------------------------------------- */}
        {/* The functional question — asked, reported, never added            */}
        {/* ---------------------------------------------------------------- */}
        <Group label="One more · reported separately, never added to the total">
          <div className="-mx-5 px-5 py-1">
            <p className="text-[14px] leading-relaxed text-snow">{FUNCTIONAL_QUESTION}</p>
            <ScoreChoice
              options={FUNCTIONAL_OPTIONS}
              value={answers.functional}
              onChange={(v) => setAnswers((a) => ({ ...a, functional: v }))}
              name={FUNCTIONAL_QUESTION}
            />
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-mist-dim">
            The 2018 questionnaire asks this separately and does not add it to the score, so neither
            does ICEFALL. It also dropped the old sleep question from the score, which is why there
            is not one here.
          </p>
        </Group>

        {/* ---------------------------------------------------------------- */}
        {/* What the score is, in the questionnaire's own terms               */}
        {/* ---------------------------------------------------------------- */}
        <Group label="What the form says">
          <p className="text-[14px] leading-relaxed text-snow">{result.scoreReading}</p>
          {result.functional !== null && (
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
              Your functional answer is {result.functional} of 3, reported on its own and not added
              to the total above.
            </p>
          )}
          {!result.redFlagsAnswered && (
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
              Not every warning sign above has a yes or a no yet. Unanswered is not the same as no,
              and ICEFALL has not read it as one.
            </p>
          )}
          <p className="mt-3 text-[12.5px] leading-relaxed text-mist-dim">{result.notADiagnosis}</p>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-dim">{result.disclaimer}</p>
        </Group>

        {/* ---------------------------------------------------------------- */}
        {/* Saving it to the trip — optional, and after the advice            */}
        {/* ---------------------------------------------------------------- */}
        <Group label="Keep this check">
          {trip ? (
            <>
              <p className="text-[13px] leading-relaxed text-mist">
                Saved to {trip.name} on this phone only. Nothing is sent anywhere — ICEFALL has no
                server for trips — so the log is yours and it does not reach your guide unless you
                show them.
              </p>
              <label className="mt-3.5 block">
                <span className="section-label">Altitude now, if you know it (metres)</span>
                <input
                  inputMode="numeric"
                  value={altitude}
                  onChange={(e) => setAltitude(e.target.value)}
                  placeholder="Leave blank if you are not sure"
                  className="mt-1.5 h-11 w-full border-b border-hairline-strong bg-transparent text-[15px] text-snow placeholder:text-mist-dim focus:border-azure focus:outline-none"
                />
              </label>
              <p className="mt-1.5 text-[12px] text-mist-dim">
                Your own reading, recorded as self-reported. ICEFALL does not measure altitude.
              </p>
              {!altitudeUsable && (
                <p className="mt-2 text-[12.5px] text-danger">
                  That is not a height ICEFALL will store. Give metres between -500 and 9,000, or
                  leave it blank.
                </p>
              )}
              <div className="mt-4 flex gap-2.5">
                <Button
                  variant="secondary"
                  size="md"
                  disabled={!altitudeUsable}
                  onClick={() => {
                    const c = addCheck({
                      tripId: trip.id,
                      answers,
                      altitudeM: altitudeUsable ? altitudeM : null,
                    });
                    setSaved(c.id);
                  }}
                >
                  Save to this trip
                </Button>
                <Button variant="ghost" size="md" onClick={() => navigate("/trip")}>
                  Back to the trip
                </Button>
              </div>
              {saved && (
                <p className="mt-3 text-[13px] text-azure">
                  Saved. The trip keeps your answers, and re-reads them with the current scoring
                  rules every time it shows them.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-[14px] leading-relaxed text-snow">
                There is no trip open, so there is nowhere to file this check.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-mist">
                The questionnaire above works exactly the same without one — everything it told you
                is on this screen already. A trip only gives it somewhere to be kept.
              </p>
              <div className="mt-4">
                <Button variant="secondary" size="md" onClick={() => navigate("/trip")}>
                  Open trip mode
                </Button>
              </div>
            </>
          )}
        </Group>

        <Rise>
          <p className="pt-7 text-[12px] leading-relaxed text-mist-dim">
            {COMPUTED_ON_THIS_DEVICE}
          </p>
        </Rise>
      </Stagger>
    </Screen>
  );
}
