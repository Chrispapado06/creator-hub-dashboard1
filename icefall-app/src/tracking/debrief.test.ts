/**
 * TEST SET FOR THE POST-ACTIVITY DEBRIEF.
 *
 * `npm run test:debrief` — esbuild to node, like every other suite here.
 * `buildDebrief` and `debriefSignals` are pure and survive `localStorage` being
 * absent, which it is on node, so these are run rather than reasoned about.
 *
 * THE ONE THING THIS FILE EXISTS FOR is suite 1. Everything else here is
 * ordinary correctness; suite 1 is the boundary the brief drew and the only
 * place in this feature where getting it wrong hurts somebody:
 *
 *   A PAIN ANSWER IN A DEBRIEF IS TRAINING DATA. A DESCRIPTION OF SOMETHING
 *   ACUTE IS NOT, AND MUST REACH THE SAFETY LAYER'S ANSWER RATHER THAN BE
 *   FILED AS SORENESS.
 *
 * The failure mode is quiet and it looks like success: "I fell and can't put
 * any weight on it" contains the word "ankle" often enough that a matcher will
 * happily classify it, the next session loses its step-ups, and the app reads
 * as having dealt with a suspected fracture. So suite 1 runs the safety
 * module's own corpus through the DEBRIEF box and asserts, for each one, that
 * the fixed answer came back, that no trainable area was attached, and that
 * `debriefSignals` routed it to `medical` and not to `trainAround`.
 *
 * Note what is NOT tested here: whether `checkSafety` detects any of it. That
 * is `coach/safety.test.ts`'s job over a 100-message corpus, and duplicating it
 * would create a second, weaker copy of the same claim. This file tests the
 * ROUTING around a layer it treats as given.
 */
import {
  buildDebrief,
  loadDebriefs,
  DEBRIEF_EFFORT,
  HARD_EFFORT,
  type ActivityDebrief,
} from "@/tracking/debrief";
import { debriefSignals, recentDebriefs, PAIN_CARRY_DAYS } from "@/tracking/debriefEffects";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

const NOW = new Date("2026-09-11T18:00:00.000Z");
const hoursBefore = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function answer(painNote: string, effort = 6, at = hoursBefore(3)): ActivityDebrief {
  return buildDebrief(
    {
      activityId: `a-${painNote.slice(0, 12)}-${effort}-${at}`,
      activityStartedAt: at,
      effort,
      body: "normal",
      painNote,
    },
    NOW,
  ).debrief;
}

/* Taken from `coach/safety.test.ts`'s corpus rather than written fresh, so the
   two files cannot drift on what counts as acute. */
const ACUTE: string[] = [
  "crushing chest pain spreading into my jaw",
  "my chest has been really tight and heavy, feels like an elephant on it",
  "banged my head and I've been sick three times",
  "knocked out for a minute after the slip",
  "headache and nausea at 4,200 m",
  "he fell and can't put any weight on it",
  "I think I've broken my ankle",
];

/* Ordinary training soreness. Every one names a body area the session engine
   can work around — that is the point: the words overlap with the acute set. */
const SORE: [string, string][] = [
  ["my knee was sore on the descent", "knee"],
  ["left calf tightened up on the last climb", "lower leg"],
  ["lower back ached under the pack", "back"],
  ["shoulders were stiff from the straps", "shoulder"],
];

function main() {
  /* ------------------------------------------------------------------------ */
  /* Suite 1 — the boundary                                                    */
  /* ------------------------------------------------------------------------ */

  for (const note of ACUTE) {
    const built = buildDebrief(
      {
        activityId: "acute",
        activityStartedAt: hoursBefore(2),
        effort: 7,
        body: "worked",
        painNote: note,
      },
      NOW,
    );

    ok(built.safety !== null, `"${note}": the safety layer was not reached from the debrief box`);
    if (!built.safety) continue;

    ok(
      built.safety.body.length > 0 && built.safety.disclaimer.length > 0,
      `"${note}": the safety answer came back without its message or its disclaimer`,
    );

    const pain = built.debrief.pain;
    ok(pain.reported, `"${note}": an acute report was recorded as no pain`);
    if (!pain.reported) continue;

    ok(
      pain.safety === built.safety.category,
      `"${note}": the record does not carry the category the layer matched`,
    );
    ok(
      pain.area === null,
      `"${note}": an acute report was ALSO labelled as the trainable area "${pain.area}" — the next session would be quietly eased for it`,
    );

    const signals = debriefSignals([built.debrief], NOW);
    ok(signals.medical !== null, `"${note}": did not route to medical`);
    ok(
      signals.trainAround === null,
      `"${note}": routed to trainAround — the session screen would offer to train around it`,
    );
    ok(
      signals.consequences.some((c) => c.id === "medical"),
      `"${note}": the athlete was not told the app will not train around it`,
    );
    ok(
      !signals.consequences.some((c) => c.id === "next-session"),
      `"${note}": the athlete was told the next session would be built around it`,
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Suite 2 — ordinary soreness still reaches the next session                */
  /* ------------------------------------------------------------------------ */

  for (const [note, area] of SORE) {
    const built = buildDebrief(
      {
        activityId: "sore",
        activityStartedAt: hoursBefore(20),
        effort: 6,
        body: "worked",
        painNote: note,
      },
      NOW,
    );
    ok(built.safety === null, `"${note}": ordinary soreness triggered the safety layer`);
    const pain = built.debrief.pain;
    ok(
      pain.reported && pain.area === area,
      `"${note}": matched "${pain.reported ? pain.area : "not reported"}", expected "${area}"`,
    );

    const signals = debriefSignals([built.debrief], NOW);
    ok(signals.trainAround?.area === area, `"${note}": did not reach the next session`);
    ok(signals.medical === null, `"${note}": ordinary soreness was routed to medical`);
  }

  /* An area the engine cannot act on is said plainly rather than filed. */
  const unmatched = debriefSignals([answer("felt sick the whole way round")], NOW);
  ok(unmatched.trainAround === null, "an unmatched area was offered to the session engine anyway");
  ok(
    unmatched.consequences.some((c) => c.text.includes("could not match")),
    "an unmatched pain report was saved in silence",
  );

  /* ------------------------------------------------------------------------ */
  /* Suite 3 — recovery                                                        */
  /* ------------------------------------------------------------------------ */

  const hard = debriefSignals([answer("", HARD_EFFORT, hoursBefore(14))], NOW);
  ok(
    hard.hardSessionHoursAgo !== null && Math.round(hard.hardSessionHoursAgo) === 14,
    `a ${HARD_EFFORT}/10 session 14 hours ago came back as ${hard.hardSessionHoursAgo}`,
  );

  const easy = debriefSignals([answer("", HARD_EFFORT - 1, hoursBefore(14))], NOW);
  ok(
    easy.hardSessionHoursAgo === null,
    "a session the athlete did not call hard was counted as a hard session",
  );

  /* Aged from the ACTIVITY, not from when the questions were answered. */
  const answeredLate = buildDebrief(
    {
      activityId: "late",
      activityStartedAt: hoursBefore(60),
      effort: 10,
      body: "wrecked",
      painNote: "",
    },
    NOW,
  ).debrief;
  const late = debriefSignals([answeredLate], NOW);
  ok(
    late.hardSessionHoursAgo !== null && Math.round(late.hardSessionHoursAgo) === 60,
    "a debrief answered late aged from the answer rather than from the session",
  );

  /* A clock problem must not read as "a hard session just now". */
  const future = debriefSignals(
    [answer("", 10, new Date(NOW.getTime() + 3_600_000).toISOString())],
    NOW,
  );
  ok(future.hardSessionHoursAgo === null, "an activity dated in the future counted as just now");

  /* ------------------------------------------------------------------------ */
  /* Suite 4 — the windows, and the records                                    */
  /* ------------------------------------------------------------------------ */

  const stale = debriefSignals(
    [answer("my knee was sore on the descent", 6, hoursBefore((PAIN_CARRY_DAYS + 2) * 24))],
    NOW,
  );
  ok(
    stale.trainAround === null,
    "a pain report older than the carry window still held a session down",
  );

  const clamped = buildDebrief(
    { activityId: "c", activityStartedAt: hoursBefore(1), effort: 99, body: "fresh", painNote: "" },
    NOW,
  ).debrief;
  ok(clamped.effort === DEBRIEF_EFFORT.max, `effort 99 was stored as ${clamped.effort}`);

  const blank = buildDebrief(
    {
      activityId: "b",
      activityStartedAt: hoursBefore(1),
      effort: 5,
      body: "fresh",
      painNote: "   ",
    },
    NOW,
  );
  ok(blank.debrief.pain.reported === false, "whitespace was recorded as a pain report");
  ok(blank.safety === null, "an empty note reached the safety layer");

  /* Every debrief lands somewhere, and says so in words. */
  ok(
    debriefSignals([answer("", 5)], NOW).consequences.length > 0,
    "a debrief produced no consequence at all — the athlete answered into silence",
  );
  ok(
    debriefSignals([answer("", 5)], NOW).consequences.every((c) => c.text.trim().length > 0),
    "a consequence with no text",
  );

  const many = Array.from({ length: 12 }, (_, i) => answer("", 5, hoursBefore(i * 24 + 1)));
  ok(recentDebriefs(many, 5, NOW).length === 5, "the coach's prompt was not capped at five");
  ok(
    recentDebriefs(many, 5, NOW, 2).every(
      (d) => NOW.getTime() - new Date(d.activityStartedAt).getTime() <= 2 * 86_400_000,
    ),
    "the coach's prompt carried a debrief older than its window",
  );

  /* Storage is absent on node. It must be a no-op, not a throw. */
  ok(loadDebriefs().length === 0, "loading without localStorage did not return an empty list");

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }
}

main();

export {};
