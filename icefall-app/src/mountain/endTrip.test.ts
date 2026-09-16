/**
 * The order "Back down / End trip" runs in, and the promises that order makes:
 * the recording stops first, nothing is sent without a confirmed connection,
 * and no failure stops the steps after it.
 *
 * Run: npm run test:end-trip
 */

import {
  DEBRIEF_NOT_SAVED_SENTENCE,
  DEBRIEF_QUEUED_SENTENCE,
  NO_OBJECTIVE_SENTENCE,
  clearPendingDebrief,
  queuePendingDebrief,
  readPendingDebrief,
  runEndTrip,
  type EndTripInput,
  type EndTripPorts,
  type EndTripStepName,
} from "./endTrip";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
let passCount = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failures.push(name);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail ? ` — ${detail}` : ""}`);
  }
}

function testCase(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/* -------------------------------------------------------------------------- */
/* A recording harness: every port writes its name into one shared log          */
/* -------------------------------------------------------------------------- */

interface Harness {
  log: string[];
  ports: EndTripPorts;
}

function harness(over: Partial<EndTripPorts> = {}, log: string[] = []): Harness {
  const ports: EndTripPorts = {
    stopRecording: async () => {
      log.push("stopRecording");
      return { activityId: "a1" };
    },
    runSync: async () => {
      log.push("runSync");
      return { sent: 3 };
    },
    clearTrip: (id) => {
      log.push(`clearTrip:${id}`);
    },
    queueDebrief: (goalId) => {
      log.push(`queueDebrief:${goalId}`);
      return true;
    },
    startDebrief: (goalId) => {
      log.push(`startDebrief:${goalId}`);
    },
    ...over,
  };
  return { log, ports };
}

const ONLINE: EndTripInput = { tripRecordId: "t1", goalId: "g1", online: true, recording: true };
const OFFLINE: EndTripInput = { ...ONLINE, online: false };

const stateOf = (r: { steps: { name: EndTripStepName; state: string }[] }, n: EndTripStepName) =>
  r.steps.find((s) => s.name === n)?.state;

async function run() {
  /* ---------------------------------------------------------------------- */
  testCase("1 — With a signal: recording, sync, trip, debrief, in that order");

  {
    const h = harness();
    const r = await runEndTrip(ONLINE, h.ports);
    check(
      "every port ran once, in the brief's order",
      h.log.join(" → ") === "stopRecording → runSync → clearTrip:t1 → startDebrief:g1",
      h.log.join(" → "),
    );
    check(
      "the run reports the same four steps in the same order",
      r.ran.join(",") === "recording,sync,trip,debrief",
      r.ran.join(","),
    );
    check(
      "the debrief is started, not queued",
      r.debrief === "started" && !h.log.some((l) => l.startsWith("queueDebrief")),
    );
    check(
      "the sync step counts what went",
      r.steps.find((s) => s.name === "sync")?.detail === "Synced 3 items.",
    );
    check(
      "every step has a sentence",
      r.steps.every((s) => s.detail.trim().length > 0),
    );
  }

  {
    const h = harness({ runSync: async () => ({ sent: 0 }) });
    const r = await runEndTrip(ONLINE, h.ports);
    check(
      "nothing waiting says so rather than 'Synced 0 items'",
      r.steps.find((s) => s.name === "sync")?.detail === "Nothing was waiting to sync.",
    );
  }

  {
    const h = harness({ runSync: async () => ({ sent: 1 }) });
    const r = await runEndTrip(ONLINE, h.ports);
    check(
      "one item is an item, not items",
      r.steps.find((s) => s.name === "sync")?.detail === "Synced 1 item.",
    );
  }

  /* ---------------------------------------------------------------------- */
  testCase("2 — The recording stops BEFORE anything else touches the trip");

  {
    const order: string[] = [];
    const h = harness(
      {
        stopRecording: async () => {
          // A real stop takes a turn or two. Nothing may overtake it.
          await new Promise((res) => setTimeout(res, 5));
          order.push("stopRecording");
          return { activityId: "a1" };
        },
      },
      order,
    );
    await runEndTrip(ONLINE, h.ports);
    check("a slow stop still finishes first", order[0] === "stopRecording", order.join(" → "));
    check(
      "the trip is closed after it",
      order.indexOf("clearTrip:t1") > order.indexOf("stopRecording"),
    );
    check(
      "the debrief opens after it",
      order.indexOf("startDebrief:g1") > order.indexOf("stopRecording"),
    );
  }

  {
    const h = harness();
    await runEndTrip({ ...ONLINE, recording: false }, h.ports);
    check(
      "with nothing recording, the recorder is not touched",
      !h.log.includes("stopRecording"),
      h.log.join(" → "),
    );
  }

  {
    const h = harness({ stopRecording: async () => null });
    const r = await runEndTrip(ONLINE, h.ports);
    check(
      "a recording that had already finished is skipped, not reported as saved",
      stateOf(r, "recording") === "skipped",
    );
    check("the rest still ran", r.ran.join(",") === "sync,trip,debrief", r.ran.join(","));
  }

  /* ---------------------------------------------------------------------- */
  testCase("3 — Offline: nothing is sent, nothing navigates, the debrief is written down");

  {
    const h = harness();
    const r = await runEndTrip(OFFLINE, h.ports);
    check(
      "the sync runner is never called without a confirmed connection",
      !h.log.includes("runSync"),
      h.log.join(" → "),
    );
    check(
      "the debrief screen is never opened offline",
      !h.log.some((l) => l.startsWith("startDebrief")),
    );
    check(
      "the debrief is queued instead",
      h.log.includes("queueDebrief:g1") && r.debrief === "queued",
    );
    check(
      "and the sentence is the promised one",
      r.sentence === DEBRIEF_QUEUED_SENTENCE,
      r.sentence,
    );
    check("the trip is still closed offline", h.log.includes("clearTrip:t1"));
    check("the recording is still stopped offline", h.log[0] === "stopRecording");
    check(
      "the skipped sync says why",
      stateOf(r, "sync") === "skipped" &&
        /No signal/.test(r.steps.find((s) => s.name === "sync")?.detail ?? ""),
    );
  }

  {
    const h = harness({ queueDebrief: () => false });
    const r = await runEndTrip(OFFLINE, h.ports);
    check(
      "a phone that will not save the note says so",
      r.debrief === "not-saved" && r.sentence === DEBRIEF_NOT_SAVED_SENTENCE,
    );
    check("and that step reads as failed, not done", stateOf(r, "debrief") === "failed");
  }

  /* ---------------------------------------------------------------------- */
  testCase("4 — No step can stop the ones after it");

  {
    const h = harness({
      stopRecording: async () => {
        throw new Error("storage is full");
      },
    });
    const r = await runEndTrip(ONLINE, h.ports);
    check(
      "a recording that will not stop still closes the trip",
      h.log.includes("clearTrip:t1"),
      h.log.join(" → "),
    );
    check("and still opens the debrief", h.log.includes("startDebrief:g1"));
    check(
      "the failure is reported in its own words",
      stateOf(r, "recording") === "failed" && /storage is full/.test(r.steps[0].detail),
    );
  }

  {
    const h = harness({
      runSync: async () => {
        throw new Error("the server refused");
      },
    });
    const r = await runEndTrip(ONLINE, h.ports);
    check("a failed sync does not leave the trip open", h.log.includes("clearTrip:t1"));
    check(
      "a failed sync is named, and says it tries again",
      stateOf(r, "sync") === "failed" && /tries again/.test(r.steps[1].detail),
    );
  }

  {
    const h = harness({
      clearTrip: () => {
        throw new Error("no storage");
      },
    });
    const r = await runEndTrip(ONLINE, h.ports);
    check("a trip that will not close still opens the debrief", h.log.includes("startDebrief:g1"));
    check(
      "and the screen is told the trip is still open",
      stateOf(r, "trip") === "failed" && /still open/.test(r.steps[2].detail),
    );
  }

  {
    const h = harness({
      startDebrief: () => {
        throw new Error("no route");
      },
    });
    const r = await runEndTrip(ONLINE, h.ports);
    check(
      "a debrief that will not open is written down instead",
      r.debrief === "queued" && h.log.includes("queueDebrief:g1"),
    );
  }

  {
    const h = harness({
      stopRecording: async () => {
        throw new Error("gone");
      },
      runSync: async () => {
        throw new Error("gone");
      },
      clearTrip: () => {
        throw new Error("gone");
      },
    });
    const r = await runEndTrip(ONLINE, h.ports);
    check(
      "with everything failing, all four steps are still reported",
      r.steps.length === 4,
      String(r.steps.length),
    );
    check("and the debrief still opens", r.debrief === "started");
  }

  /* ---------------------------------------------------------------------- */
  testCase("5 — The example trip ends nothing, and a trip with no objective says so");

  {
    const h = harness();
    const r = await runEndTrip({ ...ONLINE, tripRecordId: null }, h.ports);
    check(
      "no record means nothing is closed",
      !h.log.some((l) => l.startsWith("clearTrip")),
      h.log.join(" → "),
    );
    check(
      "and the screen is told it is the example",
      stateOf(r, "trip") === "skipped" && /example trip/i.test(r.steps[2].detail),
    );
  }

  {
    const h = harness();
    const r = await runEndTrip({ ...ONLINE, goalId: null }, h.ports);
    check(
      "no objective means no debrief is invented",
      r.debrief === "none" && !h.log.some((l) => l.startsWith("startDebrief")),
    );
    check("and it is said plainly", r.sentence === NO_OBJECTIVE_SENTENCE);
  }

  {
    const h = harness();
    const r = await runEndTrip(
      { tripRecordId: null, goalId: null, online: false, recording: false },
      h.ports,
    );
    check("with nothing at all to do, no port is called", h.log.length === 0, h.log.join(" → "));
    check(
      "and all four steps still explain themselves",
      r.steps.length === 4 && r.steps.every((s) => s.state === "skipped" && s.detail),
    );
  }

  /* ---------------------------------------------------------------------- */
  testCase("6 — The note saying a debrief is owed");

  {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };

    check("nothing owed to start with", readPendingDebrief() === null);
    check("writing it reports success", queuePendingDebrief("g9", 1_700_000_000_000) === true);
    const p = readPendingDebrief();
    check(
      "it comes back with the objective and the time",
      p?.goalId === "g9" && p?.at === 1_700_000_000_000,
    );
    clearPendingDebrief();
    check("clearing it leaves nothing", readPendingDebrief() === null);

    store.set("icefall.mountain.debrief.pending.v1", "{ not json");
    check("a corrupt note reads as nothing owed, not a crash", readPendingDebrief() === null);
    store.set("icefall.mountain.debrief.pending.v1", JSON.stringify({ at: 1 }));
    check("a note with no objective is ignored", readPendingDebrief() === null);

    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    check(
      "a phone that blocks storage reports the failure rather than lying",
      queuePendingDebrief("g9") === false,
    );
    check("and reading it is still safe", readPendingDebrief() === null);
    clearPendingDebrief();
  }

  console.log(`\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m`);
  if (failures.length && proc) proc.exitCode = 1;
}

void run();
