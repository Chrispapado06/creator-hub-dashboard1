/**
 * MOUNTAIN MODE · COACH — the one thing this suite exists to hold: THE SAFETY
 * LAYER RUNS FIRST, on every path, including on a question that was queued.
 *
 * Three places a question can be answered, and safety is ahead of all three:
 *   1. `answerOffline` — before the stored answers and before the rules.
 *   2. `enqueueCoachQuestion` — before anything is written to the queue, so an
 *      emergency is never sitting in an outbox waiting for a signal.
 *   3. the handler's `beforeSend` — again, immediately before the request, so a
 *      question queued under older rules is stopped by today's.
 *
 * Run: esbuild src/mountain/mountainCoach.test.ts --bundle --platform=node
 *      --format=esm --define:import.meta.env={} --alias:@=./src --outfile=... && node ...
 */

import { __resetDeviceStorageForTests, __useBrokenDeviceStorage, __useMemoryDeviceStorage, deviceStore } from "@/device/db";
import { __resetSyncQueueForTests, readSyncQueue, registerSyncHandler, runSyncQueue, type SendOutcome } from "@/device/syncQueue";

import {
  EMPTY_MOUNTAIN_CONTEXT,
  MOUNTAIN_COACH_KIND,
  NOT_KEPT_SENTENCE,
  QUEUED_SENTENCE,
  SAFETY_BLOCKED,
  TRANSCRIPT_KEY,
  answerOffline,
  blockedTranscriptAnswer,
  dedupeKeyFor,
  describeTripForCoach,
  enqueueCoachQuestion,
  parseTranscript,
  readTranscript,
  registerMountainCoachHandler,
  writeTranscript,
  type MountainCoachContext,
  type QueuedCoachQuestion,
} from "./mountainCoach";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
let passCount = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } else {
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const ctx: MountainCoachContext = {
  ...EMPTY_MOUNTAIN_CONTEXT,
  tripName: "Mont Blanc",
  peakName: "Mont Blanc",
  dayLine: "Day 2 of 4",
  turnaroundTime: "11:00",
};

/**
 * Red flags, taken from the classes `coach/safety.test.ts` covers rather than
 * copied from its strings: one altitude emergency, one cardiac, one cold.
 */
const RED_FLAGS: ReadonlyArray<readonly [string, string]> = [
  ["Headache and vomiting at 4,200 m", "altitude"],
  ["my chest feels tight and the pain is spreading into my arm", "chest"],
  ["he has stopped shivering and he is slurring his words", "cold"],
  ["my mate is stumbling and confused up here at 5,000 m", "ataxia"],
];

/* -------------------------------------------------------------------------- */
console.log("\n1. Safety runs before the stored answers and the rules");
/* -------------------------------------------------------------------------- */

for (const [text, label] of RED_FLAGS) {
  const a = answerOffline(text, ctx);
  check(`${label}: answered by the safety layer`, a?.source === "safety", `got ${a?.source ?? "null"}`);
  check(`${label}: carries the safety disclaimer`, Boolean(a?.disclaimer));
}

/*
 * The one that proves the ORDER rather than the presence: this text matches the
 * altitude stored answer's pattern AND is a red flag. Safety has to win.
 */
const overlap = "I'm at altitude and my headache will not lift, I keep vomiting and I can't walk straight";
eq("a red flag that also matches a stored answer gets the safety card", answerOffline(overlap, ctx)?.source, "safety");

eq(
  "a red flag that also matches the descend rule gets the safety card",
  answerOffline("should we go down, he is confused and stumbling at 5,200 m", ctx)?.source,
  "safety",
);

/* -------------------------------------------------------------------------- */
console.log("\n2. Stored answers and rules, when nothing is wrong");
/* -------------------------------------------------------------------------- */

const turnaround = answerOffline("when should I turn around?", ctx);
eq("a turnaround question is a rule, not a queued one", turnaround?.id, "rule:turnaround");
check("the rule prints the time the athlete typed", turnaround!.body.includes("11:00"));

const unset = answerOffline("when should I turn around?", EMPTY_MOUNTAIN_CONTEXT);
check("with no time set it says so and invents nothing", /No turnaround time set/.test(unset!.body) && !/\d\d:\d\d/.test(unset!.body));

eq("how do I call for help is the SOS answer", answerOffline("how do I call for help up here", ctx)?.id, "stored:help");
eq("lost in cloud is the retrace answer", answerOffline("we are lost, it's a whiteout", ctx)?.id, "stored:lost");
eq("eating and drinking is the fuel answer", answerOffline("should I be drinking more water", ctx)?.id, "stored:fuel");
eq("a forecast question is the weather rule", answerOffline("what is the weather doing tomorrow", ctx)?.id, "rule:weather");

check(
  "the weather rule refuses to give a forecast and says why",
  /will not guess|will not refresh/.test(answerOffline("what is the forecast", ctx)!.body),
);
check(
  "the progress rule refuses to predict the summit",
  /will not tell you whether you will make it/.test(answerOffline("are we going to make it to the top", ctx)!.body),
);

eq("an ordinary training question is not answered offline", answerOffline("should I change my plan for next month", ctx), null);
eq("an empty question is not answered offline", answerOffline("", ctx), null);

/* -------------------------------------------------------------------------- */
console.log("\n3. Trip context attached to a question");
/* -------------------------------------------------------------------------- */

const block = describeTripForCoach(ctx);
check("names the trip, the day and the turnaround time", /Mont Blanc/.test(block) && /Day 2 of 4/.test(block) && /11:00/.test(block));
check("says the turnaround is not set when it is not", /Turnaround time: not set/.test(describeTripForCoach({ ...ctx, turnaroundTime: null })));
eq("nothing known about a trip attaches nothing", describeTripForCoach(EMPTY_MOUNTAIN_CONTEXT), "");
check("an aged fix is simply absent, never printed", !/Altitude now/.test(block));
check("a fresh fix is printed", /Altitude now: 3,?817 m|Altitude now: 3817 m/.test(describeTripForCoach({ ...ctx, altitudeM: 3817.4 })));

/* -------------------------------------------------------------------------- */
console.log("\n4. Queueing — safety runs before anything is written");
/* -------------------------------------------------------------------------- */

async function run() {
  __useMemoryDeviceStorage();
  __resetSyncQueueForTests();

  for (const [text, label] of RED_FLAGS) {
    const a = await enqueueCoachQuestion(text, ctx);
    check(`${label}: answered, not queued`, a.source === "safety", `got ${a.source}`);
  }
  eq("nothing was written to the queue for any red flag", (await readSyncQueue()).waiting, 0);

  const queued = await enqueueCoachQuestion("should I change my plan for next month", ctx, 1_000);
  eq("an ordinary question is queued", queued.source, "queued");
  eq("and says when it will be answered", queued.body, QUEUED_SENTENCE);

  const snapshot = await readSyncQueue();
  eq("one item waiting", snapshot.waiting, 1);
  const rows = await deviceStore("syncQueue").getAll();
  eq("stored under the coach kind", rows[0]?.kind, MOUNTAIN_COACH_KIND);
  const payload = rows[0]?.payload as QueuedCoachQuestion;
  eq("the trip travels with it", payload.trip.tripName, "Mont Blanc");
  eq("so does the time it was asked", payload.askedAt, 1_000);

  await enqueueCoachQuestion("Should I change my plan   for next month", ctx, 2_000);
  eq("the same question asked twice is one item", (await readSyncQueue()).waiting, 1);
  eq("dedupe key flattens case and spacing", dedupeKeyFor("  Should I  CHANGE it "), "should i change it");

  /* ------------------------------------------------------------------------ */
  console.log("\n5. Safety runs AGAIN before a queued question is sent");
  /* ------------------------------------------------------------------------ */

  __resetSyncQueueForTests();
  await deviceStore("syncQueue").clear();

  /*
   * The case this exists for: a question that today's rules call an emergency
   * is already in the queue — put there by an older build, or by a rule that
   * has since been widened. It must never reach the coach.
   */
  const sent: string[] = [];
  const stop = registerMountainCoachHandler(async (p): Promise<SendOutcome> => {
    sent.push(p.question);
    return { ok: true };
  });

  const smuggled: QueuedCoachQuestion = {
    question: "Headache and vomiting at 4,200 m",
    askedAt: 1_000,
    trip: ctx,
  };
  await deviceStore("syncQueue").put({
    id: "smuggled", kind: MOUNTAIN_COACH_KIND, dedupeKey: null, payload: smuggled,
    createdAt: 1_000, attempts: 0, nextAttemptAt: 1_000, lastError: null, state: "waiting", finishedAt: null,
  });
  await deviceStore("syncQueue").put({
    id: "ordinary", kind: MOUNTAIN_COACH_KIND, dedupeKey: null,
    payload: { question: "should I change my plan for next month", askedAt: 1_000, trip: ctx },
    createdAt: 1_000, attempts: 0, nextAttemptAt: 1_000, lastError: null, state: "waiting", finishedAt: null,
  });

  const result = await runSyncQueue(() => 2_000);
  eq("the ordinary question was sent", sent, ["should I change my plan for next month"]);
  check("the red flag never reached the sender", !sent.some((q) => /vomiting/.test(q)));
  eq("it was stopped, not retried", result.stopped, 1);

  const after = await readSyncQueue();
  const blocked = after.stopped.find((i) => i.id === "smuggled");
  check("it is kept and shown, never silently dropped", Boolean(blocked));
  check("with the reason recorded", String(blocked?.lastError ?? "").includes(SAFETY_BLOCKED));
  eq(
    "the transcript shows the safety card in its place",
    blockedTranscriptAnswer(smuggled.question).source,
    "safety",
  );
  stop();

  /* ------------------------------------------------------------------------ */
  console.log("\n6. A phone with no database");
  /* ------------------------------------------------------------------------ */

  __useBrokenDeviceStorage();
  __resetSyncQueueForTests();
  const broken = await enqueueCoachQuestion("should I change my plan for next month", ctx);
  eq("says plainly that nothing is waiting", broken.body, NOT_KEPT_SENTENCE);
  eq("and is not shown as queued", broken.source, "not-queued");
  eq(
    "a red flag is still answered with no database at all",
    (await enqueueCoachQuestion("Headache and vomiting at 4,200 m", ctx)).source,
    "safety",
  );
  __resetDeviceStorageForTests();

  /* ------------------------------------------------------------------------ */
  console.log("\n7. The transcript stays on this phone");
  /* ------------------------------------------------------------------------ */

  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  check("writes", writeTranscript([{ id: "a", at: 1, role: "athlete", body: "hello" }], store));
  eq("reads back", readTranscript(store).length, 1);
  eq("under one key only", [...mem.keys()], [TRANSCRIPT_KEY]);
  eq("corrupt record reads empty, never throws", parseTranscript("{not json"), []);
  eq("a row with no body is dropped", parseTranscript('[{"role":"coach","at":1}]'), []);
  check("a phone that refuses to store says so", writeTranscript([], null) === false);
  writeTranscript(
    Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, at: i, role: "athlete" as const, body: `q${i}` })),
    store,
  );
  const kept = readTranscript(store);
  check("older turns are dropped rather than growing forever", kept.length === 40 && kept[0].body === "q20");

  /* ------------------------------------------------------------------------ */
  console.log("\n8. Nothing here can reach the network");
  /* ------------------------------------------------------------------------ */

  // The sender is passed in; registering without one leaves the kind unhandled
  // rather than sending anywhere by itself.
  __useMemoryDeviceStorage();
  __resetSyncQueueForTests();
  const noHandler = await runSyncQueue(() => 3_000);
  eq("no sender registered means nothing is sent", noHandler.sent, 0);
  const off = registerSyncHandler(MOUNTAIN_COACH_KIND, { send: async () => ({ ok: true }) });
  off();

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  - ${f}`));
    if (proc) proc.exitCode = 1;
  }
}

void run();
