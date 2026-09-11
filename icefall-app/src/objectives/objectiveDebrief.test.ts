import { checkSafety } from "@/coach/safety";
import { MOUNTAINS } from "@/data/mock/mountains";
import type { AthleteFacts } from "@/objectives/compare";
import {
  buildObjectiveDebrief,
  type DebriefContext,
  type ObjectiveDebriefAnswers,
} from "@/objectives/objectiveDebrief";
import {
  bridgeProposals,
  heldAltitude,
  proposeNextObjective,
  NEXT_OBJECTIVE_NO_CATALOGUE,
} from "@/objectives/nextObjective";
import { PLAN_MIN_WEEKS } from "@/tracking/planLength";
import type { Mountain, TrainingPlan } from "@/types";

/**
 * THE POST-TRIP DEBRIEF AND THE NEXT-OBJECTIVE PROPOSAL.
 *
 * `npm run test:objective-debrief` — esbuild to node, like every other suite.
 *
 * WHAT IT IS GUARDING, in the order the failures would hurt:
 *
 *   1. "A MEASUREMENT NEVER BECOMES A CLAIM." A high point ICEFALL recorded is
 *      never proposed for `coachProfile.maxAltitudeM`, which is the
 *      self-reported field. Suite 2 fails if a write of any provenance but
 *      `self-reported` ever appears, and fails if a recorded figure produces a
 *      write at all. This is the single rule the module exists for.
 *   2. "A SUMMIT IS NOT A CERTIFICATE." A competence ticked after a trip is
 *      self-reported, is added to the same field onboarding writes, and the
 *      sentence the athlete consents to says so. Suite 3.
 *   3. "NOTHING IS WRITTEN SILENTLY." Every proposal carries a sentence, and a
 *      write that was not offered carries its reason instead of vanishing —
 *      rule 2. Suite 1 checks both lists are complete and disjoint.
 *   4. "THE SAFETY LAYER RUNS FIRST, OFFLINE, UNCHANGED." Suite 5 puts a HACE
 *      description in the free-text box and asserts the answer is byte-identical
 *      to `checkSafety`'s own — not a paraphrase, and not conditional on
 *      anything.
 *   5. "THE PROPOSAL INVENTS NO MOUNTAIN, NO DATE AND NO DIFFICULTY." Suite 6
 *      scans the whole serialised proposal for a date and fails on one, checks
 *      every candidate id against the catalogue it was given, and checks every
 *      difficulty word came out of the catalogue record.
 *   6. "THE BRIDGE CANNOT MAKE A DAY HARDER." Suite 7. Phase 2's vocabulary has
 *      no verb that could, and the test asserts the only verb used is `rest`.
 */

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const NOW = new Date("2026-09-20T10:00:00.000Z");

const BASE_ANSWERS: ObjectiveDebriefAnswers = {
  goalId: "goal-custom-1",
  objectiveName: "Mont Blanc",
  startedOn: "2026-09-10",
  endedOn: "2026-09-16",
  outcome: "turned-around",
  highPoint: { kind: "not-given" },
  skillsUsed: [],
  note: "",
};

const BASE_CONTEXT: DebriefContext = {
  profileMaxAltitudeM: null,
  recordedHighestAltitudeM: null,
  reportedSkillLabels: [],
  objectiveCanClose: true,
};

const answers = (patch: Partial<ObjectiveDebriefAnswers> = {}): ObjectiveDebriefAnswers => ({
  ...BASE_ANSWERS,
  ...patch,
});
const context = (patch: Partial<DebriefContext> = {}): DebriefContext => ({
  ...BASE_CONTEXT,
  ...patch,
});

const EMPTY_FACTS: AthleteFacts = {
  reportedSkillLabels: [],
  highestAltitude: null,
  biggestDayAscentM: null,
  longestDayHours: null,
  weeklyAscentM: null,
  summits: [],
};

function main() {
  /* ======================================================================== */
  /* Suite 1 — every outcome is accounted for, in one list or the other       */
  /* ======================================================================== */

  {
    const built = buildObjectiveDebrief(answers(), context(), NOW);

    for (const w of built.writes) {
      ok(w.line.trim().length > 20, `a proposed ${w.kind} write carries no sentence`);
    }
    for (const w of built.withheld) {
      ok(w.line.trim().length > 20, `a withheld ${w.kind} carries no reason`);
    }

    // Rule 2: an absent write is a state with a reason, not a blank. Every kind
    // the module knows about appears in exactly one of the two lists.
    const kinds = new Set([
      ...built.writes.map((w) => w.kind),
      ...built.withheld.map((w) => w.kind),
    ]);
    ok(kinds.has("close-objective"), "the objective's own state went unmentioned");
    ok(kinds.has("max-altitude"), "the altitude question vanished instead of being answered");
    ok(kinds.has("skills"), "the competence question vanished instead of being answered");

    const both = built.writes
      .map((w) => w.kind)
      .filter((k) => built.withheld.some((x) => x.kind === k));
    ok(both.length === 0, `a kind was both proposed and withheld: ${both.join(", ")}`);

    // PURE. Same answers, same context, same clock → identical output.
    const again = buildObjectiveDebrief(answers(), context(), NOW);
    ok(
      JSON.stringify(built) === JSON.stringify(again),
      "buildObjectiveDebrief is not deterministic",
    );

    // It does not touch a store: calling it twice did not save anything, and
    // nothing here has imported a writer.
    ok(built.record.answeredAt === NOW.toISOString(), "the clock was not the argument given");
  }

  /* ======================================================================== */
  /* Suite 2 — THE ALTITUDE RULE                                              */
  /* ======================================================================== */

  {
    /* A figure ICEFALL RECORDED is never written to the self-reported field. */
    const recorded = buildObjectiveDebrief(
      answers({ highPoint: { kind: "recorded", metres: 4810, activityId: "act-1" } }),
      context({ profileMaxAltitudeM: 3000, recordedHighestAltitudeM: 4810 }),
      NOW,
    );
    ok(
      !recorded.writes.some((w) => w.kind === "max-altitude"),
      "a RECORDED altitude was proposed for the self-reported profile field",
    );
    const why = recorded.withheld.find((w) => w.kind === "max-altitude");
    ok(why !== undefined, "a recorded altitude was dropped with no reason given");
    ok(
      (why?.line ?? "").includes("measurement"),
      "the reason did not say why a measurement is not copied into a claim",
    );

    /* A TYPED figure above the profile is proposed, and is self-reported. */
    const typed = buildObjectiveDebrief(
      answers({ highPoint: { kind: "typed", metres: 4810 } }),
      context({ profileMaxAltitudeM: 3000 }),
      NOW,
    );
    const write = typed.writes.find((w) => w.kind === "max-altitude");
    ok(write !== undefined, "a new self-reported high point produced no proposal");
    if (write && write.kind === "max-altitude") {
      ok(write.metres === 4810, "the proposed altitude was not the figure given");
      ok(write.previousM === 3000, "the proposal did not carry what it replaces");
      ok(write.provenance === "self-reported", "a debrief figure claimed a provenance it has not");
      ok(
        write.line.toLowerCase().includes("self-reported"),
        "the consent sentence does not say the figure is self-reported",
      );
    }

    /* Rule 4 at the type level as well: there is no other provenance value in
       the union, so this loop is a belt on top of a brace. */
    for (const w of typed.writes) {
      if (w.kind === "max-altitude") {
        ok(
          (w.provenance as string) === "self-reported",
          "a max-altitude proposal escaped with another provenance",
        );
      }
    }

    /* Not higher than the profile → unchanged, and it says why. */
    const lower = buildObjectiveDebrief(
      answers({ highPoint: { kind: "typed", metres: 2000 } }),
      context({ profileMaxAltitudeM: 4810 }),
      NOW,
    );
    ok(
      !lower.writes.some((w) => w.kind === "max-altitude"),
      "a lower figure overwrote a height already reached",
    );

    /* Not higher than what the FEED recorded → the measurement stands. */
    const belowRecorded = buildObjectiveDebrief(
      answers({ highPoint: { kind: "typed", metres: 3000 } }),
      context({ recordedHighestAltitudeM: 4000 }),
      NOW,
    );
    ok(
      !belowRecorded.writes.some((w) => w.kind === "max-altitude"),
      "an estimate below a measurement was written to the profile",
    );

    /* Implausible figures are refused rather than clamped. */
    for (const m of [9200, -800, Number.NaN]) {
      const bad = buildObjectiveDebrief(
        answers({ highPoint: { kind: "typed", metres: m } }),
        context(),
        NOW,
      );
      ok(
        !bad.writes.some((w) => w.kind === "max-altitude"),
        `${m} was accepted as an altitude`,
      );
    }

    /* The catalogue elevation of a summit somebody says they reached is still
       self-reported, and says so in different words from a typed figure. */
    const claimed = buildObjectiveDebrief(
      answers({ outcome: "summited", highPoint: { kind: "objective-elevation", metres: 4808 } }),
      context(),
      NOW,
    );
    const claimedWrite = claimed.writes.find((w) => w.kind === "max-altitude");
    ok(claimedWrite !== undefined, "a summit claim produced no altitude proposal");
    if (claimedWrite && claimedWrite.kind === "max-altitude") {
      ok(
        claimedWrite.provenance === "self-reported",
        "a catalogue elevation was passed off as measured",
      );
      ok(
        claimedWrite.line.includes("cannot verify is that you were there"),
        "the catalogue-elevation sentence lost the part that makes it honest",
      );
    }
  }

  /* ======================================================================== */
  /* Suite 3 — A SUMMIT IS NOT A CERTIFICATE                                  */
  /* ======================================================================== */

  {
    const built = buildObjectiveDebrief(
      answers({ skillsUsed: ["crevasse-rescue", "fixed-line"] }),
      context(),
      NOW,
    );
    const skills = built.writes.find((w) => w.kind === "skills");
    ok(skills !== undefined, "competences used on a trip produced no proposal");
    if (skills && skills.kind === "skills") {
      ok(skills.skillIds.length === 2, "a claimed competence was dropped");
      ok(
        skills.labels.includes("Crevasse rescue"),
        "the proposal did not resolve ids to the labels the profile stores",
      );
      ok(
        skills.line.includes("SELF-REPORTED"),
        "the competence proposal does not say the claim is self-reported",
      );
      ok(
        skills.line.includes("not a certificate"),
        "the proposal lost the sentence that stops a summit reading as verification",
      );
    }

    /* Already held → nothing to add, and it says so rather than re-adding. */
    const held = buildObjectiveDebrief(
      answers({ skillsUsed: ["crevasse-rescue"] }),
      context({ reportedSkillLabels: ["Crevasse rescue"] }),
      NOW,
    );
    ok(
      !held.writes.some((w) => w.kind === "skills"),
      "a competence already on the profile was proposed again",
    );

    /* Duplicates collapse. */
    const dupes = buildObjectiveDebrief(
      answers({ skillsUsed: ["fixed-line", "fixed-line", "fixed-line"] }),
      context(),
      NOW,
    );
    const dupeWrite = dupes.writes.find((w) => w.kind === "skills");
    ok(
      dupeWrite !== undefined && dupeWrite.kind === "skills" && dupeWrite.skillIds.length === 1,
      "a repeated competence was counted more than once",
    );

    /* Naming none is not a statement that you lack any. */
    const none = buildObjectiveDebrief(answers({ skillsUsed: [] }), context(), NOW);
    const noneLine = none.withheld.find((w) => w.kind === "skills");
    ok(
      (noneLine?.line ?? "").includes("not a statement that you lack it"),
      "an empty competence list was allowed to read as a denial",
    );
  }

  /* ======================================================================== */
  /* Suite 4 — the outcome decides what may be claimed                        */
  /* ======================================================================== */

  {
    /* A trip that did not happen claims nothing from itself. */
    const ghost = buildObjectiveDebrief(
      answers({
        outcome: "did-not-travel",
        skillsUsed: ["crevasse-rescue"],
        highPoint: { kind: "typed", metres: 6000 },
      }),
      context(),
      NOW,
    );
    ok(ghost.record.skillsUsed.length === 0, "a competence was claimed off a trip nobody took");
    ok(
      !ghost.writes.some((w) => w.kind === "skills"),
      "competences were proposed from a trip that did not happen",
    );
    ok(
      !ghost.writes.some((w) => w.kind === "max-altitude"),
      "an altitude was claimed from a trip that did not happen",
    );
    ok(
      ghost.record.highPoint.kind === "not-given",
      "a high point survived on a trip that did not happen",
    );
    ok(
      ghost.withheld.some((w) => w.kind === "skills" && w.line.includes("did not take")),
      "the dropped competences were dropped silently",
    );
    /* It still closes the objective — that is the one honest write it makes. */
    ok(
      ghost.writes.some((w) => w.kind === "close-objective"),
      "a trip that did not happen left the objective open with no way to close it",
    );

    /* A summit produces a summit log; anything else does not. */
    const summit = buildObjectiveDebrief(
      answers({ outcome: "summited", highPoint: { kind: "typed", metres: 4808 } }),
      context(),
      NOW,
    );
    const log = summit.writes.find((w) => w.kind === "summit-log");
    ok(log !== undefined, "a summit produced no log proposal");
    if (log && log.kind === "summit-log") {
      ok(log.date === "2026-09-16", "the summit log took a date other than the day given");
      ok(log.elevationM === 4808, "the summit log lost the high point");
      ok(
        log.line.includes("self-logged"),
        "the summit-log proposal does not say a log is self-logged",
      );
    }
    ok(
      !buildObjectiveDebrief(answers(), context(), NOW).writes.some(
        (w) => w.kind === "summit-log",
      ),
      "a summit was logged for a trip that turned back",
    );

    /* Closing: the seeded fixtures are not the athlete's to finish. */
    const seeded = buildObjectiveDebrief(
      answers(),
      context({ objectiveCanClose: false }),
      NOW,
    );
    ok(
      !seeded.writes.some((w) => w.kind === "close-objective"),
      "a seeded fixture was offered for completion",
    );
    ok(
      seeded.withheld.some((w) => w.kind === "close-objective"),
      "a seeded fixture was dropped with no explanation",
    );

    /* An unreadable date closes nothing and guesses nothing. */
    const badDate = buildObjectiveDebrief(answers({ endedOn: "last Tuesday" }), context(), NOW);
    ok(
      !badDate.writes.some((w) => w.kind === "close-objective"),
      "an unreadable date was stamped on an objective",
    );

    /* The completion date is the day given, never the clock. */
    const closed = buildObjectiveDebrief(answers(), context(), NOW);
    const close = closed.writes.find((w) => w.kind === "close-objective");
    ok(
      close !== undefined && close.kind === "close-objective" && close.completedOn === "2026-09-16",
      "the objective was closed on the day the form was filled in rather than the day given",
    );
  }

  /* ======================================================================== */
  /* Suite 5 — THE SAFETY LAYER, FIRST AND UNCHANGED                          */
  /* ======================================================================== */

  {
    const note =
      "Since the summit push my headache will not lift and I am unsteady on my feet, stumbling on the descent";
    const built = buildObjectiveDebrief(answers({ note }), context(), NOW);
    const direct = checkSafety(note);

    ok(direct !== null, "the corpus sentence no longer fires the safety layer");
    ok(built.safety !== null, "a symptom report in the debrief did not reach the safety layer");
    ok(
      built.safety?.body === direct?.body,
      "the debrief returned something other than safety.ts's own words",
    );
    ok(
      built.safety?.category === direct?.category,
      "the debrief changed the safety category",
    );
    ok(
      built.record.note.written === true && built.record.note.safety === direct?.category,
      "the record did not carry the safety category onto the note",
    );
    /* A trip is still recorded. Somebody reporting a symptom has not stopped
       having been on a mountain, and refusing to record it would teach people
       to leave the box empty. */
    ok(built.writes.length > 0, "a safety hit silently discarded the whole debrief");

    /* An ordinary note is stored verbatim and fires nothing. */
    const plain = buildObjectiveDebrief(
      answers({ note: "  Cold on the summit ridge, rope work was slow.  " }),
      context(),
      NOW,
    );
    ok(plain.safety === null, "an ordinary trip note fired the safety layer");
    ok(
      plain.record.note.written === true &&
        plain.record.note.text === "Cold on the summit ridge, rope work was slow.",
      "the note was not stored in the athlete's own words",
    );

    const blank = buildObjectiveDebrief(answers({ note: "   " }), context(), NOW);
    ok(blank.record.note.written === false, "whitespace was stored as a note");
  }

  /* ======================================================================== */
  /* Suite 6 — THE NEXT OBJECTIVE INVENTS NOTHING                             */
  /* ======================================================================== */

  {
    const facts: AthleteFacts = {
      ...EMPTY_FACTS,
      highestAltitude: { value: 4000, provenance: "recorded" },
    };
    const bridge = bridgeProposals({
      plan: null,
      goalId: "goal-custom-1",
      startedOn: "2026-09-10",
      endedOn: "2026-09-16",
      objectiveName: "Mont Blanc",
    });

    const proposal = proposeNextObjective({
      catalogue: MOUNTAINS,
      facts,
      finishedMountainId: "mont-blanc",
      bridge,
    });

    /* NO INVENTED MOUNTAIN. */
    for (const c of proposal.candidates) {
      const source = MOUNTAINS.find((m) => m.id === c.mountainId);
      ok(source !== undefined, `"${c.name}" is not a mountain in the catalogue it was given`);
      if (source) {
        ok(c.name === source.name, `${c.mountainId}: the name was rewritten`);
        ok(c.elevationM === source.elevationM, `${c.mountainId}: the elevation was recomputed`);
        /* NO INVENTED DIFFICULTY — the word is the catalogue's, character for
           character, and nothing here derives a grade or a step up. */
        ok(
          c.difficultyLabel === source.difficultyLabel,
          `${c.mountainId}: the difficulty label was not the catalogue's`,
        );
      }
    }
    ok(
      !proposal.candidates.some((c) => c.mountainId === "mont-blanc"),
      "the objective just finished was offered as the next one",
    );

    /* NO INVENTED DATE. Not one anywhere in the serialised proposal. */
    const serialised = JSON.stringify(proposal);
    ok(
      /\d{4}-\d{2}-\d{2}/.test(serialised) === false,
      "the next-objective proposal contains a date",
    );
    ok(
      proposal.dateNote.includes(`${PLAN_MIN_WEEKS} weeks`),
      "the date note stopped quoting the generator's own minimum",
    );

    /* PHASE 3 IS ROUTED THROUGH, ON EVERY CANDIDATE. Today that means every
       one of them reports an unreviewed set and compares nothing — and the
       proposal says so rather than printing an empty tick list. */
    for (const c of proposal.candidates) {
      ok(c.requirementState === "unreviewed", `${c.mountainId}: unexpected requirement state`);
      ok(c.comparison.results.length === 0, `${c.mountainId}: an unreviewed set produced results`);
      ok(c.comparison.attribution === null, `${c.mountainId}: an unreviewed set was attributed`);
      ok(c.comparison.note.length > 0, `${c.mountainId}: no sentence for the unreviewed state`);
    }
    ok(
      proposal.requirementNote.includes("None of these"),
      "the proposal did not say that nothing was checked",
    );
    ok(
      proposal.headline.includes("not a recommendation"),
      "the shortlist stopped saying it is not a recommendation",
    );

    /* The ordering is by height above the held altitude, nearest first, and it
       says what that does and does not mean. */
    const above = proposal.candidates.filter((c) => (c.aboveHeldM ?? 0) > 0);
    for (let i = 1; i < above.length; i++) {
      ok(
        (above[i - 1].aboveHeldM ?? 0) <= (above[i].aboveHeldM ?? 0),
        "the shortlist is not ordered by height above the held altitude",
      );
    }
    ok(
      proposal.basis.includes("weakest"),
      "the ordering lost the sentence that stops it reading as a difficulty ranking",
    );
    /* THE ORDER TURNS ON ONE FIGURE, AND THE PAGE NAMES IT AND ITS PROVENANCE.
       The likeliest reader of this shortlist typed their high point into a form
       ninety seconds ago; an order built on that number must say so. */
    ok(
      proposal.heldAltitude?.value === 4000 && proposal.heldAltitude.provenance === "recorded",
      "the proposal did not carry the altitude its ordering is measured from",
    );
    ok(
      proposal.basis.includes("4,000 m"),
      "the basis does not name the figure the order is measured from",
    );
    const claimedOrder = proposeNextObjective({
      catalogue: MOUNTAINS,
      facts: { ...EMPTY_FACTS, highestAltitude: { value: 6000, provenance: "self-reported" } },
      bridge,
    });
    ok(
      claimedOrder.basis.includes("what you have told ICEFALL") &&
        claimedOrder.basis.includes("Nobody has verified it"),
      "an order built on a self-reported altitude did not say the altitude is self-reported",
    );
    ok(
      blindProvenanceCheck(claimedOrder.heldAltitude) === "self-reported",
      "the proposal lost the provenance of the figure it ordered by",
    );

    /* With no altitude at all there is no comparison to make, and it says so. */
    const blind = proposeNextObjective({ catalogue: MOUNTAINS, facts: EMPTY_FACTS, bridge });
    ok(blind.heldAltitude === null, "an altitude appeared where ICEFALL holds none");
    ok(
      blind.candidates.every((c) => c.aboveHeldM === null),
      "a height comparison was made against an altitude ICEFALL does not hold",
    );
    ok(
      blind.basis.includes("holds no altitude for you"),
      "the no-altitude case did not say why there is no ordering",
    );

    /* An empty catalogue produces nothing, with a reason. It does not compose. */
    const nothing = proposeNextObjective({ catalogue: [], facts, bridge });
    ok(nothing.candidates.length === 0, "a shortlist appeared from an empty catalogue");
    ok(
      nothing.unavailable === NEXT_OBJECTIVE_NO_CATALOGUE,
      "an empty catalogue produced no reason",
    );

    /* Marked summits count towards the held altitude the same way `compare.ts`
       folds them in, so the two cannot disagree on one screen. */
    const withSummit = heldAltitude({
      ...EMPTY_FACTS,
      highestAltitude: { value: 3000, provenance: "recorded" },
      summits: [{ name: "Mont Blanc", elevationM: 4808, date: "2026-09-16" }],
    });
    ok(
      withSummit?.value === 4808 && withSummit.provenance === "self-reported",
      "a marked summit above the recorded ceiling did not raise the held altitude, or lost its provenance",
    );

    /* A mountain already logged is marked, not hidden. */
    const logged = proposeNextObjective({
      catalogue: MOUNTAINS,
      facts: {
        ...facts,
        summits: [{ name: MOUNTAINS[0].name, elevationM: MOUNTAINS[0].elevationM, date: "2026-01-01" }],
      },
      bridge,
    });
    ok(
      logged.candidates.some((c) => c.mountainId === MOUNTAINS[0].id && c.alreadyLogged),
      "a peak the athlete has logged was not marked as logged",
    );
  }

  /* ======================================================================== */
  /* Suite 7 — THE BRIDGE CANNOT MAKE A DAY HARDER                            */
  /* ======================================================================== */

  {
    const plan: TrainingPlan = {
      id: "plan-1",
      goalId: "goal-custom-1",
      title: "Test plan",
      totalWeeks: 2,
      currentWeek: 1,
      weeks: [
        {
          index: 1,
          block: "Base 1",
          startDate: "2026-09-07",
          days: [
            { date: "2026-09-09", focus: "endurance", title: "Before", difficulty: 3, completed: false },
            { date: "2026-09-11", focus: "endurance", title: "Inside", difficulty: 3, completed: false },
            { date: "2026-09-12", focus: "rest", title: "Rest", difficulty: 1, completed: false },
            { date: "2026-09-13", focus: "strength", title: "Done inside", difficulty: 3, completed: true },
          ],
        },
        {
          index: 2,
          block: "Base 2",
          startDate: "2026-09-14",
          days: [
            { date: "2026-09-15", focus: "intervals", title: "Inside 2", difficulty: 4, completed: false },
            { date: "2026-09-18", focus: "endurance", title: "After", difficulty: 3, completed: false },
          ],
        },
      ],
    };

    const bridge = bridgeProposals({
      plan,
      goalId: "goal-custom-1",
      startedOn: "2026-09-10",
      endedOn: "2026-09-16",
      objectiveName: "Mont Blanc",
    });

    ok(bridge.none === null, "a bridge with days to clear reported nothing to do");
    ok(bridge.proposals.length === 2, `expected 2 cleared days, got ${bridge.proposals.length}`);

    /* THE GUARDRAIL. Phase 2's vocabulary has no verb that could make a day
       harder, and the bridge uses exactly one of them. */
    for (const p of bridge.proposals) {
      ok(p.change.kind === "rest", `the bridge proposed "${p.change.kind}" rather than rest`);
      ok(p.goalId === "goal-custom-1", "a proposal was keyed to the wrong plan");
      ok(/^\d{4}-\d{2}-\d{2}$/.test(p.date), "a proposal was keyed on something other than a date");
      ok(p.date >= "2026-09-10" && p.date <= "2026-09-16", `${p.date} is outside the trip`);
      ok(p.why.length > 0 && p.why.length <= 240, "a proposal carries no reason, or an oversized one");
      ok(p.by === "athlete", "the bridge attributed the change to somebody who did not make it");
    }

    const dates = bridge.proposals.map((p) => p.date).sort();
    ok(dates.join(",") === "2026-09-11,2026-09-15", `cleared the wrong days: ${dates.join(",")}`);

    /* NOTHING IS SAVED. The proposals are records the screen has yet to make —
       they carry no id and no timestamp, which a saved `PlanAdjustment` would. */
    for (const p of bridge.proposals) {
      ok(!("id" in p), "the bridge returned a saved adjustment rather than a proposal");
      ok(!("at" in p), "the bridge stamped a proposal it has not made");
    }

    /* No plan, no days, bad dates: three different states, three reasons. */
    const noPlan = bridgeProposals({
      plan: null,
      goalId: "g",
      startedOn: "2026-09-10",
      endedOn: "2026-09-16",
      objectiveName: "X",
    });
    ok(noPlan.proposals.length === 0 && noPlan.none !== null, "a missing plan gave no reason");

    const badDates = bridgeProposals({
      plan,
      goalId: "goal-custom-1",
      startedOn: "whenever",
      endedOn: "2026-09-16",
      objectiveName: "X",
    });
    ok(
      badDates.proposals.length === 0 && (badDates.none ?? "").includes("could not read"),
      "an unreadable trip window was guessed at rather than refused",
    );

    const backwards = bridgeProposals({
      plan,
      goalId: "goal-custom-1",
      startedOn: "2026-09-16",
      endedOn: "2026-09-10",
      objectiveName: "X",
    });
    ok(backwards.proposals.length === 0, "a window that ends before it starts cleared days");

    const untouched = bridgeProposals({
      plan,
      goalId: "goal-custom-1",
      startedOn: "2026-10-01",
      endedOn: "2026-10-07",
      objectiveName: "X",
    });
    ok(
      untouched.proposals.length === 0 && (untouched.none ?? "").includes("nothing to clear"),
      "a window with no sessions in it did not say so",
    );

    /* And it proposes no recovery, because ICEFALL holds no rule for one. */
    ok(
      bridge.note.includes("Nothing is made harder"),
      "the bridge note lost the guarantee it is making",
    );
  }

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }
}

function blindProvenanceCheck(o: { provenance: string } | null): string | null {
  return o ? o.provenance : null;
}

/* Referenced so the fixture type import is not elided by an unused-import pass. */
export type { Mountain };

main();
