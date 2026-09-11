import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check } from "lucide-react";

import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Group } from "@/components/settings/kit";
import { DateField } from "@/components/ui/DateField";
import { mountainById } from "@/data/mock/mountains";
import { MOUNTAINS } from "@/data/mock/mountains";
import { athleteFactsFrom } from "@/coach/mountainReadiness";
import {
  buildObjectiveDebrief,
  DEBRIEF_LOCAL_NOTICE,
  OUTCOME_DETAIL,
  OUTCOME_LABEL,
  useObjectiveDebrief,
  saveObjectiveDebrief,
  type BuiltObjectiveDebrief,
  type HighPointSource,
  type ObjectiveOutcome,
  type ProposedWrite,
} from "@/objectives/objectiveDebrief";
import {
  bridgeProposals,
  proposeNextObjective,
  BRIDGE_NO_RECOVERY_RULE,
} from "@/objectives/nextObjective";
import { ATHLETE_SKILLS, type AthleteSkillId } from "@/objectives/requirements";
import { addSummitLog, useSummitLogs } from "@/social/summitLog";
import { addAdjustments } from "@/tracking/adjustments";
import { useRecordedActivities } from "@/tracking/feed";
import { useTraining } from "@/tracking/training";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";

/**
 * THE POST-TRIP DEBRIEF SCREEN.
 *
 * Three phases on one page, in the order the athlete lives them:
 *
 *   ASK      what happened, in as few questions as will carry the answer.
 *   REVIEW   what ICEFALL proposes to change, each with the sentence that is
 *            the whole consent, and what it is NOT changing, with the reason.
 *   AFTER    the shortlist for next time, and the days the trip took out of
 *            the plan.
 *
 * THE REVIEW PHASE IS NOT A CONFIRMATION DIALOG. Every proposal is a switch,
 * defaulted ON but individually refusable, and the sentence beside it is the
 * one `objectives/objectiveDebrief.ts` built — not a summary of it. The
 * withheld list is rendered beneath, at the same size, because "ICEFALL is not
 * changing your highest altitude, and here is why" is information, not an
 * omission (rule 2).
 *
 * A SAFETY HIT RENDERS FIRST AND IN FULL. `checkSafety` has already run inside
 * the builder, offline, on the note. Its message, its category and its
 * disclaimer are printed verbatim above everything else — no paraphrase, and
 * nothing about the trip record is used to soften it.
 *
 * NO BOXES. Flat rows, hairlines and spacing.
 */

const FIELD =
  "w-full rounded-none border-0 border-b border-hairline bg-transparent px-0 py-2 text-[15px] text-snow outline-none placeholder:text-mist focus:border-snow/40";

const ACTION =
  "mt-5 w-full rounded-full border border-azure/45 px-4 py-2.5 text-[13px] text-azure transition-colors hover:bg-azure/10 disabled:border-hairline disabled:text-mist-dim disabled:hover:bg-transparent";

function isoToday(): string {
  return localDay(new Date().toISOString()) ?? "";
}

/** An ISO instant as the calendar day it was ON, where the athlete was. */
function localDay(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const OUTCOMES: ObjectiveOutcome[] = ["summited", "turned-around", "did-not-travel"];

export default function ObjectiveDebriefScreen() {
  const { goalId } = useParams<{ goalId: string }>();
  const navigate = useNavigate();

  const {
    goals,
    coachProfile,
    updateCoachProfile,
    completeGoal,
    canCompleteGoal,
  } = useApp();
  const feed = useRecordedActivities();
  const summits = useSummitLogs();

  const goal = goals.find((g) => g.id === goalId);
  const mountain = goal?.mountainId ? mountainById(goal.mountainId) : undefined;
  const training = useTraining(goal);
  const existing = useObjectiveDebrief(goalId);

  /* ---- The answers ------------------------------------------------------ */

  const [outcome, setOutcome] = useState<ObjectiveOutcome>("turned-around");
  const [startedOn, setStartedOn] = useState("");
  const [endedOn, setEndedOn] = useState(isoToday());
  const [typedHighPoint, setTypedHighPoint] = useState("");
  const [skills, setSkills] = useState<AthleteSkillId[]>([]);
  const [note, setNote] = useState("");
  const [built, setBuilt] = useState<BuiltObjectiveDebrief | null>(null);
  const [refused, setRefused] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);
  /**
   * Writes that were accepted and did not happen.
   *
   * `completeGoal` returns false rather than throwing — the objective is not
   * one the athlete created, or it is already closed. The builder checks the
   * same condition before it offers the proposal, so this is narrow; but the
   * cost of not checking is a screen that says "What was changed" above a
   * change that did not occur, which is the worst failure in this whole file.
   */
  const [refusedByApp, setRefusedByApp] = useState<string[]>([]);
  const [bridgeTaken, setBridgeTaken] = useState(false);

  /**
   * The highest altitude ICEFALL RECORDED during the trip window, if any.
   *
   * A real derivation off the feed, not a guess: the highest `maxAltitudeM` on
   * a non-simulated session that started between the two dates. When it exists
   * it is offered INSTEAD of the typed box, because a measurement must not be
   * retyped into a self-reported field — see the module header.
   */
  const recordedOnTrip = useMemo(() => {
    if (!startedOn || !endedOn || startedOn > endedOn) return null;
    let best: { metres: number; activityId: string; on: string } | null = null;
    for (const a of feed) {
      if (a.simulated === true) continue;
      /* THE LOCAL CALENDAR DAY, not `startedAt.slice(0, 10)`.
         `startedAt` is a UTC instant, and slicing it puts a session that began
         at 22:00 on the 14th in Chamonix on the 15th — which on a trip window
         is the difference between a summit day being inside the trip and being
         outside it. This codebase has fixed the same bug several times; see
         `daysUntilLocal` in `coach/context.ts`. */
      const day = localDay(a.startedAt);
      if (day === null || day < startedOn || day > endedOn) continue;
      const alt = a.maxAltitudeM;
      if (typeof alt !== "number" || !Number.isFinite(alt)) continue;
      if (best === null || alt > best.metres) {
        best = { metres: alt, activityId: a.id, on: day };
      }
    }
    return best;
  }, [feed, startedOn, endedOn]);

  const highPoint = useMemo<HighPointSource>(() => {
    if (recordedOnTrip) {
      return {
        kind: "recorded",
        metres: recordedOnTrip.metres,
        activityId: recordedOnTrip.activityId,
      };
    }
    const typed = Number(typedHighPoint);
    if (typedHighPoint.trim().length > 0 && Number.isFinite(typed)) {
      return { kind: "typed", metres: typed };
    }
    /* A summit claim with nothing typed falls back to the catalogue elevation —
       offered, labelled differently, and still self-reported. */
    if (outcome === "summited") {
      const elevation = mountain?.elevationM ?? goal?.elevationM;
      if (typeof elevation === "number" && Number.isFinite(elevation)) {
        return { kind: "objective-elevation", metres: elevation };
      }
    }
    return { kind: "not-given" };
  }, [recordedOnTrip, typedHighPoint, outcome, mountain, goal]);

  const facts = useMemo(
    () =>
      athleteFactsFrom({
        activities: feed,
        summitsLogged: summits
          .filter((l) => typeof l.elevationM === "number")
          .map((l) => ({ name: l.peakName, elevationM: l.elevationM as number, date: l.date })),
        selfReported: {
          technicalSkills: coachProfile.technicalSkills,
          maxAltitudeM: coachProfile.maxAltitudeM,
        },
      }),
    [feed, summits, coachProfile.technicalSkills, coachProfile.maxAltitudeM],
  );

  if (!goal) {
    return (
      <Screen padded={false}>
        <div className="px-5">
          <ScreenHeader title="Trip debrief" back="/coach" large />
        </div>
        <Stagger className="px-5">
          <Rise>
            <p className="text-[13px] leading-relaxed text-mist">
              That objective is not in your list. Nothing has been recorded.
            </p>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  /* ---- Review -------------------------------------------------------- */

  function review() {
    if (!goal) return;
    setBuilt(
      buildObjectiveDebrief(
        {
          goalId: goal.id,
          objectiveName: goal.name,
          startedOn: startedOn || endedOn,
          endedOn,
          outcome,
          highPoint,
          skillsUsed: skills,
          note,
        },
        {
          profileMaxAltitudeM: coachProfile.maxAltitudeM ?? null,
          recordedHighestAltitudeM:
            facts.highestAltitude?.provenance === "recorded" ? facts.highestAltitude.value : null,
          reportedSkillLabels: coachProfile.technicalSkills ?? [],
          objectiveCanClose: canCompleteGoal(goal.id),
        },
      ),
    );
    setRefused(new Set());
    setApplied(false);
  }

  /**
   * Perform the accepted writes, and nothing else.
   *
   * Each branch writes through the app's OWN existing path — the coaching
   * profile for the two self-reported fields, `completeGoal` for the objective,
   * `addSummitLog` for the log. Nothing here invents a second write path, which
   * is what keeps a figure entered after a trip indistinguishable, downstream,
   * from the same figure entered in the profile editor: self-reported, labelled,
   * for ever.
   */
  function apply() {
    if (!built) return;
    const problems: string[] = [];
    for (const w of built.writes) {
      if (refused.has(keyOf(w))) continue;
      switch (w.kind) {
        case "close-objective":
          if (!completeGoal(w.goalId, w.completedOn)) {
            problems.push(
              "The objective was not closed. ICEFALL only closes objectives you created yourself, and this one was already finished or is not yours. Nothing else in this list was affected.",
            );
          }
          break;
        case "max-altitude":
          updateCoachProfile({ maxAltitudeM: w.metres });
          break;
        case "skills":
          updateCoachProfile({
            technicalSkills: [...(coachProfile.technicalSkills ?? []), ...w.labels],
          });
          break;
        case "summit-log":
          addSummitLog({
            peakName: w.peakName,
            peakId: goal?.mountainId,
            elevationM: w.elevationM ?? undefined,
            date: w.date,
          });
          break;
      }
    }
    saveObjectiveDebrief(built.record);
    setRefusedByApp(problems);
    setApplied(true);
  }

  const bridge = built
    ? bridgeProposals({
        plan: training.plan,
        goalId: goal.id,
        startedOn: built.record.startedOn,
        endedOn: built.record.endedOn,
        objectiveName: goal.name,
      })
    : null;

  const next =
    built && applied
      ? proposeNextObjective({
          catalogue: MOUNTAINS,
          facts,
          finishedMountainId: goal.mountainId,
          limit: 5,
          bridge: bridge ?? { proposals: [], note: "", none: "No bridge was built." },
        })
      : null;

  /* ------------------------------------------------------------------ */

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title="Trip debrief" subtitle={goal.name} back="/coach" large />
      </div>

      <Stagger className="px-5">
        {existing && !built ? (
          <Rise>
            <p className="text-[13px] leading-relaxed text-mist">
              You debriefed this objective on {existing.answeredAt.slice(0, 10)}:{" "}
              {OUTCOME_LABEL[existing.outcome].toLowerCase()}. Answering again replaces that record.
              It does not undo any profile change you already accepted — those are edits to your
              profile and are yours to change there.
            </p>
          </Rise>
        ) : null}

        {/* ---- ASK -------------------------------------------------------- */}

        {!built ? (
          <>
            <Group label="How it ended">
              <div>
                {OUTCOMES.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setOutcome(id)}
                    className="-mx-5 flex w-[calc(100%+2.5rem)] items-start gap-3.5 border-t border-hairline px-5 py-3.5 text-left first:border-t-0"
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                        outcome === id ? "border-azure/50 text-azure" : "border-hairline text-transparent",
                      )}
                    >
                      <Check size={13} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] text-snow">{OUTCOME_LABEL[id]}</span>
                      <span className="mt-0.5 block text-[13px] leading-relaxed text-mist">
                        {OUTCOME_DETAIL[id]}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Group>

            <Group label="When">
              <div className="flex flex-col gap-4 pt-1">
                <DateField
                  label="The day you left"
                  value={startedOn}
                  onChange={setStartedOn}
                  placeholder="The day you left"
                />
                <DateField
                  label="The day it ended"
                  value={endedOn}
                  onChange={setEndedOn}
                  placeholder="The day it ended"
                />
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-mist">
                Both are dates you give. ICEFALL does not infer them from your feed — a trip with the
                watch off would come back as no trip at all.
              </p>
            </Group>

            {outcome !== "did-not-travel" ? (
              <Group label="Your high point">
                {recordedOnTrip ? (
                  <p className="text-[13px] leading-relaxed text-mist">
                    ICEFALL recorded{" "}
                    <span className="text-snow">
                      {Math.round(recordedOnTrip.metres).toLocaleString("en-GB")} m
                    </span>{" "}
                    on {recordedOnTrip.on}, inside the dates you gave. That is a measurement and it
                    already counts — the readiness engine reads it straight off your activity feed.
                    There is nothing to type, and ICEFALL will not copy it into the self-reported
                    field on your profile.
                  </p>
                ) : (
                  <>
                    <input
                      className={FIELD}
                      inputMode="numeric"
                      value={typedHighPoint}
                      onChange={(e) => setTypedHighPoint(e.target.value.replace(/[^\d-]/g, ""))}
                      placeholder="Metres, if you know it"
                      aria-label="Your high point in metres"
                    />
                    <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
                      Self-reported. ICEFALL recorded nothing above sea level inside these dates, so
                      anything here is your word for it and will be labelled that way wherever it
                      appears — including on anything you send an operator.
                      {outcome === "summited" && (mountain?.elevationM ?? goal.elevationM)
                        ? " Leave it blank and ICEFALL will offer this objective's catalogue elevation instead, which is still your claim rather than its measurement."
                        : ""}
                    </p>
                  </>
                )}
              </Group>
            ) : null}

            {outcome !== "did-not-travel" ? (
              <Group label="Competences you used">
                <p className="pb-1 text-[13px] leading-relaxed text-mist">
                  These go onto your profile as self-reported, exactly like the ones you ticked at
                  signup. Using something on a trip is not a certificate: nobody at ICEFALL watched,
                  and no screen will ever call one of these verified.
                </p>
                <div>
                  {ATHLETE_SKILLS.map((s) => {
                    const on = skills.includes(s.id);
                    const held = (coachProfile.technicalSkills ?? []).some(
                      (l) => l.toLowerCase() === s.label.toLowerCase(),
                    );
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setSkills((cur) =>
                            cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id],
                          )
                        }
                        className="-mx-5 flex w-[calc(100%+2.5rem)] items-center gap-3.5 border-t border-hairline px-5 py-3 text-left first:border-t-0"
                      >
                        <span
                          className={cn(
                            "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                            on ? "border-azure/50 text-azure" : "border-hairline text-transparent",
                          )}
                        >
                          <Check size={13} strokeWidth={2.2} />
                        </span>
                        <span className="min-w-0 flex-1 text-[15px] text-snow">{s.label}</span>
                        {held ? (
                          <span className="shrink-0 text-[12px] text-mist">already on profile</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </Group>
            ) : null}

            <Group label="Anything worth writing down">
              <textarea
                className={cn(FIELD, "min-h-[88px] resize-none")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Conditions, the turnaround, how you felt"
                aria-label="Trip note"
              />
              <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
                Your words, kept as you wrote them. If what you type describes symptoms, ICEFALL's
                offline safety layer answers first and says the same thing it would say anywhere
                else in the app.
              </p>
            </Group>

            <Rise>
              <button type="button" className={ACTION} onClick={review} disabled={!endedOn}>
                See what this changes
              </button>
              <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
                Nothing is written yet. The next step shows you every change, one at a time, and
                nothing happens until you accept it.
              </p>
            </Rise>
          </>
        ) : null}

        {/* ---- REVIEW ----------------------------------------------------- */}

        {built ? (
          <>
            {built.safety ? (
              <Group label="Read this first">
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-snow">
                  {built.safety.body}
                </p>
                <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
                  {built.safety.disclaimer}
                </p>
              </Group>
            ) : null}

            {built.writes.length > 0 ? (
              <Group label={applied ? "What was changed" : "What ICEFALL will change"}>
                {applied ? (
                  <p className="pb-1 text-[13px] leading-relaxed text-mist">
                    Done. These are edits to your profile now, not pending changes — the switches no
                    longer do anything here, and anything you want to take back is changed in your
                    coaching profile, where it lives.
                  </p>
                ) : null}
                {refusedByApp.map((line, i) => (
                  <p key={i} className="pb-1 text-[13px] leading-relaxed text-snow">
                    {line}
                  </p>
                ))}
                <div>
                  {built.writes.map((w) => {
                    const key = keyOf(w);
                    const off = refused.has(key);
                    return (
                      <div
                        key={key}
                        className="-mx-5 flex items-start gap-3.5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                      >
                        <button
                          type="button"
                          disabled={applied}
                          onClick={() =>
                            setRefused((cur) => {
                              const nextSet = new Set(cur);
                              if (nextSet.has(key)) nextSet.delete(key);
                              else nextSet.add(key);
                              return nextSet;
                            })
                          }
                          aria-label={off ? `Accept: ${w.line}` : `Refuse: ${w.line}`}
                          className={cn(
                            "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                            off ? "border-hairline text-transparent" : "border-azure/50 text-azure",
                          )}
                        >
                          <Check size={13} strokeWidth={2.2} />
                        </button>
                        <p
                          className={cn(
                            "min-w-0 flex-1 text-[13px] leading-relaxed",
                            off ? "text-mist-dim" : "text-mist",
                          )}
                        >
                          {w.line}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Group>
            ) : null}

            {built.withheld.length > 0 ? (
              <Group label="What ICEFALL is not changing, and why">
                <div>
                  {built.withheld.map((w, i) => (
                    <p
                      key={`${w.kind}-${i}`}
                      className="-mx-5 border-t border-hairline px-5 py-3.5 text-[13px] leading-relaxed text-mist first:border-t-0"
                    >
                      {w.line}
                    </p>
                  ))}
                </div>
              </Group>
            ) : null}

            {!applied ? (
              <Rise>
                <button
                  type="button"
                  className={ACTION}
                  onClick={apply}
                  disabled={built.writes.length === refused.size}
                >
                  {built.writes.length === refused.size
                    ? "Nothing accepted"
                    : `Accept ${built.writes.length - refused.size} change${built.writes.length - refused.size === 1 ? "" : "s"}`}
                </button>
                <button
                  type="button"
                  className="mt-3 w-full rounded-full border border-hairline-strong px-4 py-2.5 text-[13px] text-mist transition-colors hover:text-snow"
                  onClick={() => setBuilt(null)}
                >
                  Back to the answers
                </button>
                <p className="mt-3 text-[13px] leading-relaxed text-mist">
                  {DEBRIEF_LOCAL_NOTICE}
                </p>
              </Rise>
            ) : null}
          </>
        ) : null}

        {/* ---- AFTER ------------------------------------------------------ */}

        {applied && bridge ? (
          <Group label="The days you were away">
            {bridge.none ? (
              <p className="text-[13px] leading-relaxed text-mist">{bridge.none}</p>
            ) : (
              <>
                <p className="text-[13px] leading-relaxed text-mist">{bridge.note}</p>
                <button
                  type="button"
                  className={ACTION}
                  disabled={bridgeTaken}
                  onClick={() => {
                    addAdjustments(bridge.proposals);
                    setBridgeTaken(true);
                  }}
                >
                  {bridgeTaken
                    ? "Cleared — see the plan history to undo"
                    : `Clear ${bridge.proposals.length} day${bridge.proposals.length === 1 ? "" : "s"} from the plan`}
                </button>
              </>
            )}
            <p className="mt-3 text-[13px] leading-relaxed text-mist">{BRIDGE_NO_RECOVERY_RULE}</p>
          </Group>
        ) : null}

        {applied && next ? (
          <>
            <Group label="What next">
              <p className="text-[13px] leading-relaxed text-mist">{next.headline}</p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-mist">{next.basis}</p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-mist">{next.requirementNote}</p>
            </Group>

            {next.unavailable ? (
              <Rise>
                <p className="text-[13px] leading-relaxed text-mist">{next.unavailable}</p>
              </Rise>
            ) : (
              <Group label="Objectives ICEFALL holds a record for">
                <div>
                  {next.candidates.map((c) => (
                    <Link
                      key={c.mountainId}
                      to={`/explore/mountain/${c.mountainId}`}
                      className="-mx-5 block border-t border-hairline px-5 py-3.5 first:border-t-0"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-[15px] text-snow">{c.name}</span>
                        <span className="shrink-0 text-[13px] text-mist">
                          {c.elevationM.toLocaleString("en-GB")} m
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-mist">
                        {c.range}, {c.country} · {c.difficultyLabel}
                        {c.alreadyLogged ? " · you have logged this one" : ""}
                      </span>
                      <span className="mt-1.5 block text-[13px] leading-relaxed text-mist">
                        {c.aboveHeldM === null
                          ? "ICEFALL holds no altitude for you, so it cannot say how this compares."
                          : c.aboveHeldM > 0
                            ? `${c.aboveHeldM.toLocaleString("en-GB")} m above the highest altitude ICEFALL holds for you.`
                            : `At or below the highest altitude ICEFALL holds for you.`}
                      </span>
                      <span className="mt-1.5 block text-[12.5px] leading-relaxed text-mist">
                        {c.comparison.note}
                      </span>
                    </Link>
                  ))}
                </div>
              </Group>
            )}

            <Group label="When">
              <p className="text-[13px] leading-relaxed text-mist">{next.dateNote}</p>
            </Group>

            <Rise>
              <button
                type="button"
                className={ACTION}
                onClick={() => navigate(`/objective/${goal.id}/report`)}
              >
                See the page an operator would read
              </button>
            </Rise>
          </>
        ) : null}
      </Stagger>
    </Screen>
  );
}

/** A stable key per proposal, so refusing one cannot toggle another. */
function keyOf(w: ProposedWrite): string {
  return w.kind;
}
