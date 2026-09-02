/**
 * Tracking accuracy tests — the owner's ten field cases, run at a desk.
 *
 * WHY THIS FILE EXISTS AND WHY IT LOOKS LIKE THIS.
 *
 * There is no test runner in this project (no vitest, no jest, no @types/node),
 * and adding one was not the job. So this file is a plain TypeScript program
 * with a thirty-line harness at the top. It is inside `src/` on purpose: that
 * means `npm run typecheck` checks the tests against the same types the app
 * uses, so a test cannot rot into passing against a signature that no longer
 * exists. Nothing in the app imports it, so it is not shipped in the bundle.
 *
 *   npm run test        # bundles with the esbuild that already ships with vite
 *                       # and runs the result on node
 *
 * WHAT THESE TESTS CAN AND CANNOT PROVE. They drive SYNTHETIC fix streams
 * through the real `GpsFilter`, the real `MovementMachine` and the real
 * `ActivityRecorder`, on a fake clock. That is enough to prove the ARITHMETIC
 * and the STATE LOGIC — that a slow walker is never classified as stopped, that
 * one noisy fix cannot resume a stop, that moving time never exceeds elapsed.
 * It is NOT enough to prove field behaviour: a synthetic fix stream is a model
 * of a GPS chipset, not a GPS chipset. Everything that needs a real device is
 * listed at the bottom of this file and in the report, and no test here claims
 * otherwise.
 *
 * Every threshold asserted against is DERIVED FROM THE SHIPPED CONFIG, not
 * typed in as a number that happens to make the test green. Where a test needs
 * a bound that the config does not supply, the bound is stated with its
 * reasoning at the assertion.
 */

import { ActivityRecorder } from "./recorder";
import { GpsFilter, haversine } from "./filters";
import { MovementMachine, type MovementObservation, type MovementState } from "./movement";
import {
  MIN_DISPLAY_SPEED_MPS,
  SPEED_WINDOW_MS,
  movementConfigFor,
  noiseFloorM,
  requiredQuietMs,
} from "./config";
import type { ActivityTypeId, GeoSample, RecorderSnapshot } from "./types";

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `process` is referenced only to set an exit code so CI can fail. @types/node
 * is not installed and adding it for one field would be a heavier change than
 * this file deserves, so the shape is declared locally.
 */
const proc = (globalThis as { process?: { exitCode?: number } }).process;

let passCount = 0;
const failures: string[] = [];
let currentCase = "";

function testCase(title: string) {
  currentCase = title;
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failures.push(`${currentCase} — ${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  }
}

/** A measured value printed for the record. Not an assertion. */
function note(text: string) {
  console.log(`  \x1b[2m·\x1b[0m \x1b[2m${text}\x1b[0m`);
}

const n1 = (v: number) => v.toFixed(1);
const n2 = (v: number) => v.toFixed(2);

/* -------------------------------------------------------------------------- */
/* Fake clock                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The recorder reads `Date.now()` and owns a 1 Hz `setInterval`. Both are
 * replaced so a six-hour activity runs in milliseconds and every accrual is
 * deterministic.
 *
 * NOTE THE LIMIT HONESTLY: this proves the recorder's time ARITHMETIC. It
 * cannot prove that a real `setInterval` fires on time on a backgrounded iOS
 * tab — the opposite is true there, and only a device can show it.
 */
interface FakeTimer {
  id: number;
  fn: () => void;
  every: number;
  next: number;
}

class Clock {
  now = 1_756_000_000_000; // a fixed epoch, so failures are reproducible
  private timers = new Map<number, FakeTimer>();
  private seq = 1;
  private realNow = Date.now;
  private realSet = globalThis.setInterval;
  private realClear = globalThis.clearInterval;

  install() {
    const g = globalThis as unknown as Record<string, unknown>;
    Date.now = () => this.now;
    g.setInterval = (fn: () => void, ms: number) => {
      const every = Math.max(1, ms);
      const id = this.seq++;
      this.timers.set(id, { id, fn, every, next: this.now + every });
      return id;
    };
    g.clearInterval = (id: unknown) => {
      this.timers.delete(id as number);
    };
  }

  uninstall() {
    const g = globalThis as unknown as Record<string, unknown>;
    Date.now = this.realNow;
    g.setInterval = this.realSet;
    g.clearInterval = this.realClear;
    this.timers.clear();
  }

  /** Run the clock forward to `target`, firing every interval on the way. */
  advanceTo(target: number) {
    for (let guard = 0; guard < 5_000_000; guard++) {
      let due: FakeTimer | null = null;
      for (const t of this.timers.values()) {
        if (t.next <= target && (due === null || t.next < due.next)) due = t;
      }
      if (!due) break;
      this.now = due.next;
      due.next += due.every;
      due.fn();
    }
    if (target > this.now) this.now = target;
  }
}

/* -------------------------------------------------------------------------- */
/* Synthetic GPS                                                               */
/* -------------------------------------------------------------------------- */

/** Deterministic PRNG — a failing test must fail the same way twice. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian noise, so the synthetic error looks like GPS error and not a saw. */
function gaussian(rand: () => number) {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const ORIGIN = { lat: 46.5372, lon: 7.9625 }; // Jungfrau region — steep ground
const M_PER_DEG_LAT = 111_132;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);

function atMetres(northM: number, eastM: number) {
  return {
    lat: ORIGIN.lat + northM / M_PER_DEG_LAT,
    lon: ORIGIN.lon + eastM / M_PER_DEG_LON,
  };
}

/**
 * THE ERROR MODEL, AND WHY IT IS NOT WHITE NOISE.
 *
 * The first version of this file added an independent Gaussian error to every
 * fix. That is wrong, and wrong in a way that quietly invalidates every result:
 * at 1 Hz it produces a MEAN FIX-TO-FIX JUMP LARGER THAN THE NOISE FLOOR at
 * every accuracy the app accepts —
 *
 *     reported accuracy   noise floor   white-noise jump   correlated jump
 *              5 m           2.5 m           2.98 m            0.47 m
 *              8 m           4.0 m           4.73 m            0.74 m
 *             20 m          10.0 m          11.82 m            1.87 m
 *             35 m          17.5 m          20.72 m            3.26 m
 *
 * so a phone left on a rock banks a step on most fixes BY CONSTRUCTION, and no
 * filter that could be written would pass. Under that model a stationary phone
 * accumulated 1.8 km in ten minutes. Real receivers do not behave like that,
 * and if they did no tracking app would work at all.
 *
 * Real GNSS error is dominated by multipath, ionospheric delay and satellite
 * geometry, all of which vary over TENS OF SECONDS TO MINUTES, and the chipset
 * smooths on top of that. So the error here is a Gauss-Markov (AR(1)) process:
 * it wanders around the true position with a standard deviation set by the
 * reported accuracy, and it is strongly correlated between consecutive fixes.
 * That reproduces both real behaviours that matter — small fix-to-fix jitter,
 * and a slow bias that can sit tens of metres off for a minute at a time.
 *
 * The white-noise model is kept as `errorModel: "white"` and used in one
 * explicitly labelled STRESS test, because the number it produces is a useful
 * worst case even though it is not a plausible one.
 */
type ErrorModel = "correlated" | "white";

/**
 * Correlation time of the position error, seconds.
 *
 * Chosen from the physical cause rather than to make anything pass: multipath
 * geometry and satellite elevation change on this timescale, so an error that
 * decorrelates in about a minute and a half is the standard first-order model.
 * Shorter would understate drift's persistence; much longer would make the
 * error a constant offset, which distance is blind to anyway.
 */
const ERROR_TAU_S = 90;

/**
 * Position error sigma as a fraction of the REPORTED accuracy.
 *
 * The W3C Geolocation API defines `accuracy` as a 95% confidence radius, which
 * for a 2-D Gaussian is about 2.45 sigma; browsers and both mobile platforms
 * are looser than that in practice and commonly report something nearer 1 sigma
 * to 68%. Half is the conservative middle: it makes the synthetic error LARGER
 * than the strict reading of the spec, so the tests are harder than the spec
 * requires rather than easier.
 */
const ERROR_SIGMA_FRACTION = 0.5;

interface StreamOptions {
  t0: number;
  durationS: number;
  /** Fix interval in seconds. 1 Hz is what a phone gives while tracking. */
  everyS?: number;
  /** True ground speed, m/s. A function of elapsed seconds for varying pace. */
  speedMps: number | ((tSec: number) => number);
  /** Reported horizontal accuracy, m. */
  accuracyM: number | ((tSec: number) => number);
  errorModel?: ErrorModel;
  /** Override the error sigma, m. Defaults to accuracy × ERROR_SIGMA_FRACTION. */
  sigmaM?: number;
  /** Altitude in metres, or null for a device with no altitude. */
  altitudeM?: number | ((tSec: number) => number) | null;
  /** 1-sigma altitude error, m — correlated on the same clock as position. */
  altitudeNoiseM?: number;
  /**
   * What the device puts in `speed`.
   *  - "truth"  — an honest Doppler solution
   *  - "none"   — null, which many phones give (and the machine must not read as 0)
   *  - "zero"   — the flat 0 placeholder some chipsets emit with no solution
   */
  reported?: "truth" | "none" | "zero";
  seed?: number;
  /** Starting distance along the track, m — for continuing a stream. */
  startNorthM?: number;
}

interface Stream {
  fixes: GeoSample[];
  /** Ground truth distance travelled, m. */
  truthM: number;
  endNorthM: number;
  /** Naive sum of raw fix-to-fix distances — what no filtering would give. */
  naiveM: number;
}

function stream(o: StreamOptions): Stream {
  const everyS = o.everyS ?? 1;
  const rand = rng(o.seed ?? 12345);
  const model = o.errorModel ?? "correlated";
  const rho = model === "white" ? 0 : Math.exp(-everyS / ERROR_TAU_S);
  const innovation = Math.sqrt(1 - rho * rho);

  const fixes: GeoSample[] = [];
  let north = o.startNorthM ?? 0;
  let truth = 0;
  let ex = 0;
  let ey = 0;
  let ez = 0;

  for (let i = 0; i * everyS <= o.durationS; i++) {
    const tSec = i * everyS;
    const v = typeof o.speedMps === "function" ? o.speedMps(tSec) : o.speedMps;
    if (i > 0) {
      north += v * everyS;
      truth += v * everyS;
    }
    const acc = typeof o.accuracyM === "function" ? o.accuracyM(tSec) : o.accuracyM;
    const sigma = o.sigmaM ?? acc * ERROR_SIGMA_FRACTION;

    ex = rho * ex + innovation * sigma * gaussian(rand);
    ey = rho * ey + innovation * sigma * gaussian(rand);
    const p = atMetres(north + ex, ey);

    let altitude: number | null = null;
    if (o.altitudeM !== null && o.altitudeM !== undefined) {
      const base = typeof o.altitudeM === "function" ? o.altitudeM(tSec) : o.altitudeM;
      const az = o.altitudeNoiseM ?? 0;
      ez = rho * ez + innovation * az * gaussian(rand);
      altitude = base + ez;
    }

    fixes.push({
      t: o.t0 + tSec * 1000,
      lat: p.lat,
      lon: p.lon,
      accuracy: acc,
      altitude,
      altitudeAccuracy: altitude === null ? null : acc * 1.5,
      speed: o.reported === "truth" ? v : o.reported === "zero" ? 0 : null,
      heading: 0,
    });
  }

  let naive = 0;
  for (let i = 1; i < fixes.length; i++) naive += haversine(fixes[i - 1], fixes[i]);

  return { fixes, truthM: truth, endNorthM: north, naiveM: naive };
}

/* -------------------------------------------------------------------------- */
/* Recorder rig                                                                */
/* -------------------------------------------------------------------------- */

interface Rig {
  rec: ActivityRecorder;
  clock: Clock;
  /** Every autoPaused change, in order. */
  flips: { t: number; paused: boolean }[];
  /** Highest movingMs ever seen above elapsedMs — must stay 0. */
  maxOvercount: number;
  /** True if distance ever went backwards. */
  distanceWentBack: boolean;
  /** Every non-null live speed published, for testing the ESTIMATOR not one draw. */
  liveSpeeds: number[];
  snap: () => RecorderSnapshot;
  feed: (fixes: GeoSample[]) => void;
  /** Advance the clock with no fixes at all. */
  idle: (seconds: number) => void;
  done: () => void;
}

function rig(activityTypeId: ActivityTypeId, opts: { gps?: boolean } = {}): Rig {
  const clock = new Clock();
  clock.install();
  const rec = new ActivityRecorder(activityTypeId, { autoPause: true, bodyMassKg: 72 });
  if (opts.gps !== false) rec.setGpsAvailable(true);

  const flips: { t: number; paused: boolean }[] = [];
  let last: boolean | null = null;
  let maxOvercount = 0;
  let lastDistance = 0;
  let distanceWentBack = false;
  const liveSpeeds: number[] = [];

  rec.subscribe((s) => {
    if (s.speedMps !== null) liveSpeeds.push(s.speedMps);
    if (last === null) last = s.autoPaused;
    else if (s.autoPaused !== last) {
      last = s.autoPaused;
      flips.push({ t: clock.now, paused: s.autoPaused });
    }
    maxOvercount = Math.max(maxOvercount, s.movingMs - s.elapsedMs);
    if (s.distanceM < lastDistance - 1e-6) distanceWentBack = true;
    lastDistance = s.distanceM;
  });

  rec.start();

  const self: Rig = {
    rec,
    clock,
    flips,
    get maxOvercount() {
      return maxOvercount;
    },
    get distanceWentBack() {
      return distanceWentBack;
    },
    liveSpeeds,
    snap: () => rec.snapshot(),
    feed: (fixes) => {
      for (const f of fixes) {
        clock.advanceTo(f.t);
        rec.pushGeo(f);
      }
    },
    idle: (seconds) => clock.advanceTo(clock.now + seconds * 1000),
    done: () => {
      rec.destroy();
      clock.uninstall();
    },
  } as Rig;
  return self;
}

/* -------------------------------------------------------------------------- */
/* Machine rig — the pure layer, no clock, no recorder                         */
/* -------------------------------------------------------------------------- */

/**
 * Drive the machine through the real `GpsFilter`, exactly as the recorder does,
 * and report what it decided. Using the real filter matters: the machine's
 * whole contract is about what the filter's SILENCE means, so a harness that
 * fabricated `stepM` would be testing a different program.
 */
function driveMachine(
  activityTypeId: ActivityTypeId,
  fixes: GeoSample[],
  maxSpeedMps: number,
): {
  states: { t: number; state: MovementState; paused: boolean }[];
  bankedM: number;
  everStopped: boolean;
  transitions: number;
  pauseFlips: number;
  reasons: string[];
} {
  const filter = new GpsFilter({ maxSpeedMps });
  const machine = new MovementMachine({ activityTypeId });
  const states: { t: number; state: MovementState; paused: boolean }[] = [];
  const reasons: string[] = [];
  let banked = 0;
  let prevT: number | null = null;
  let transitions = 0;
  let pauseFlips = 0;
  let lastPaused = false;

  for (const f of fixes) {
    const res = filter.push(f);
    const obs: MovementObservation = {
      t: f.t,
      stepM: res.stepM,
      dtSec: prevT === null ? Number.POSITIVE_INFINITY : (f.t - prevT) / 1000,
      accuracy: f.accuracy,
      derivedSpeed: res.derivedSpeed,
      reportedSpeed: f.speed,
      accepted: res.accepted,
    };
    prevT = f.t;
    if (res.accepted) banked += res.stepM;
    const u = machine.push(obs);
    if (u.changed) {
      transitions++;
      reasons.push(`${(u.previous + " -> " + u.state).padEnd(34)} ${u.reason}`);
    }
    if (u.autoPaused !== lastPaused) {
      lastPaused = u.autoPaused;
      pauseFlips++;
    }
    states.push({ t: f.t, state: u.state, paused: u.autoPaused });
  }

  return {
    states,
    bankedM: banked,
    everStopped: states.some((s) => s.state === "stopped"),
    transitions,
    pauseFlips,
    reasons,
  };
}

/* ========================================================================== */
/* SANITY — the synthetic generator itself                                     */
/* ========================================================================== */

function caseZero() {
  testCase("Case 0 — the synthetic stream is what it claims to be");

  const a = atMetres(0, 0);
  const b = atMetres(100, 0);
  const d = haversine(a, b);
  check("100 m north measures 100 m by haversine", Math.abs(d - 100) < 0.5, `${n2(d)} m`);

  const c = atMetres(0, 100);
  const e = haversine(a, c);
  check("100 m east measures 100 m by haversine", Math.abs(e - 100) < 0.5, `${n2(e)} m`);

  const s = stream({ t0: 0, durationS: 600, speedMps: 1.4, accuracyM: 5, sigmaM: 0 });
  let raw = 0;
  for (let i = 1; i < s.fixes.length; i++) raw += haversine(s.fixes[i - 1], s.fixes[i]);
  check(
    "a noiseless 1.4 m/s stream sums to its own ground truth",
    Math.abs(raw - s.truthM) < 1,
    `raw ${n1(raw)} m vs truth ${n1(s.truthM)} m`,
  );
}

/* ========================================================================== */
/* CASE 1 — walking continuously                                               */
/* ========================================================================== */

function caseOne() {
  testCase("Case 1 — walking continuously: smooth distance, stable speed, moving time rises");

  const r = rig("hiking");
  const s = stream({
    t0: r.clock.now,
    durationS: 20 * 60,
    speedMps: 1.4,
    accuracyM: 8,
    altitudeM: (t) => 1200 + t * 0.12, // a steady 430 m/h climb
    altitudeNoiseM: 1.5,
    seed: 101,
  });
  r.feed(s.fixes);
  const snap = r.snap();

  const err = (snap.distanceM - s.truthM) / s.truthM;
  check(
    "distance is within 10% of ground truth",
    Math.abs(err) < 0.1,
    `${n1(snap.distanceM)} m vs ${n1(s.truthM)} m (${n1(err * 100)}%)`,
  );
  check("distance never went backwards", !r.distanceWentBack);
  check("never auto-paused while walking", r.flips.length === 0, `${r.flips.length} flips`);
  check(
    "moving time equals elapsed time while continuously moving",
    Math.abs(snap.movingMs - snap.elapsedMs) < 1500,
    `moving ${n1(snap.movingMs / 1000)} s, elapsed ${n1(snap.elapsedMs / 1000)} s`,
  );
  check("moving time never exceeded elapsed", r.maxOvercount <= 0, `${r.maxOvercount} ms`);
  check(
    "average speed is within 10% of truth",
    snap.avgSpeedMps !== null && Math.abs(snap.avgSpeedMps - 1.4) / 1.4 < 0.1,
    `${snap.avgSpeedMps === null ? "null" : n2(snap.avgSpeedMps)} m/s`,
  );
  check(
    "live speed is a number, not an em dash, while walking",
    snap.speedMps !== null && snap.speedMps > 0.5,
    `${snap.speedMps === null ? "null" : n2(snap.speedMps)} m/s`,
  );
  /**
   * The live figure is tested as an ESTIMATOR, not as one reading.
   *
   * A single instantaneous speed is the mean of about seven banked steps inside
   * a 20 s window, each carrying roughly a third of a noise floor of error, so
   * its standard error is 15-20% and any one draw landing 20% out proves
   * nothing. What must be true is that it is UNBIASED — that the live number
   * and the average number are estimates of the same thing rather than two
   * different quantities, which is the contradiction brief 18 asks about.
   */
  const liveMean = r.liveSpeeds.reduce((a, b) => a + b, 0) / Math.max(1, r.liveSpeeds.length);
  check(
    "the live speed is unbiased — its mean over the walk matches ground truth",
    Math.abs(liveMean - 1.4) / 1.4 < 0.12,
    `mean of ${r.liveSpeeds.length} live readings ${n2(liveMean)} m/s vs 1.40 m/s truth`,
  );
  check(
    "and the live mean agrees with the average-speed tile",
    snap.avgSpeedMps !== null && Math.abs(liveMean - snap.avgSpeedMps) / snap.avgSpeedMps < 0.12,
    `live mean ${n2(liveMean)} vs avg tile ${snap.avgSpeedMps === null ? "null" : n2(snap.avgSpeedMps)} m/s`,
  );
  note(
    `the instantaneous reading at the end was ${
      snap.paceSecPerKm === null ? "null" : n1(snap.paceSecPerKm) + " s/km"
    } against an average of ${
      snap.avgPaceSecPerKm === null ? "null" : n1(snap.avgPaceSecPerKm) + " s/km"
    } — a 20 s window is that noisy, and it is not smoothed to hide it`,
  );

  // Brief 18 — every metric must come off the same validated track.
  const fromTrack = snap.points.length ? snap.points[snap.points.length - 1].distanceM : 0;
  check(
    "the distance tile equals the distance on the last track point",
    Math.abs(fromTrack - snap.distanceM) < 1e-6,
    `${n1(fromTrack)} m`,
  );
  check(
    "average speed equals distance / moving time exactly",
    snap.avgSpeedMps !== null &&
      Math.abs(snap.avgSpeedMps - snap.distanceM / (snap.movingMs / 1000)) < 1e-9,
  );

  const truthGain = 20 * 60 * 0.12;
  note(
    `elevation gain ${n1(snap.elevationGainM)} m against ${n1(truthGain)} m of true climb, ` +
      `loss ${n1(snap.elevationLossM)} m`,
  );
  check(
    "elevation gain is within 20% of truth on a steady climb",
    Math.abs(snap.elevationGainM - truthGain) / truthGain < 0.2,
    `${n1(snap.elevationGainM)} m vs ${n1(truthGain)} m`,
  );

  r.done();
}

/* ========================================================================== */
/* CASE 2 — walk then stop                                                     */
/* ========================================================================== */

function caseTwo() {
  testCase("Case 2 — walk then stop: no bouncing, stopped only after confirmation");

  const r = rig("hiking");
  const t0 = r.clock.now;
  const walk = stream({
    t0,
    durationS: 5 * 60,
    speedMps: 1.3,
    accuracyM: 8,
    seed: 202,
  });
  r.feed(walk.fixes);
  const walkedM = r.snap().distanceM;
  const stopStart = r.clock.now;

  const still = stream({
    t0: stopStart + 1000,
    durationS: 10 * 60,
    speedMps: 0,
    accuracyM: 8,
    startNorthM: walk.endNorthM,
    seed: 203,
  });
  r.feed(still.fixes);
  const snap = r.snap();

  check("auto-pause engaged exactly once", r.flips.length === 1, `${r.flips.length} flips`);
  check("and it engaged, not disengaged", r.flips[0]?.paused === true);
  if (r.flips[0]) {
    note(`stop confirmed ${n1((r.flips[0].t - stopStart) / 1000)} s after movement ceased`);
  }
  check("still auto-paused ten minutes later", snap.autoPaused === true);

  const drift = snap.distanceM - walkedM;
  const driftRate = drift / (10 * 60);
  const cfg = movementConfigFor("hiking");
  check(
    "distance banked while standing stays under the config's own still rate",
    driftRate <= cfg.stoppedRateMps,
    `${n1(drift)} m over 10 min = ${n2(driftRate)} m/s, ceiling ${cfg.stoppedRateMps} m/s`,
  );

  check(
    "moving time stopped rising once the stop was confirmed",
    snap.elapsedMs - snap.movingMs > 8 * 60_000,
    `elapsed ${n1(snap.elapsedMs / 1000)} s, moving ${n1(snap.movingMs / 1000)} s`,
  );
  check("moving time never exceeded elapsed", r.maxOvercount <= 0);
  check("live pace is unavailable while auto-paused", snap.paceSecPerKm === null);
  check("live speed is unavailable while auto-paused", snap.speedMps === null);
  check(
    "average pace is still reported — it is an average over the whole activity",
    snap.avgPaceSecPerKm !== null,
    `${snap.avgPaceSecPerKm === null ? "null" : n1(snap.avgPaceSecPerKm)} s/km`,
  );

  /**
   * DISTANCE IS NOT GATED BY AUTO-PAUSE, BUT TIME IS.
   *
   * `pushGeo` banks `res.stepM` whether or not the machine has concluded the
   * athlete is stopped, while `accrue` freezes moving time the moment it has.
   * So drift banked during a stop lands on the top of the average-speed
   * fraction while the bottom is held still, and the average comes out FAST.
   *
   * Deliberately measured rather than "fixed". Gating distance on the machine's
   * verdict would DELETE real distance every time the verdict is wrong, and the
   * false-pause measurements in case 5 show that happens to slow walkers. Losing
   * an athlete's metres is the worse error. The size of what is kept instead is
   * on the record here.
   */
  const avgErrPct = snap.avgSpeedMps === null ? 0 : ((snap.avgSpeedMps - 1.3) / 1.3) * 100;
  note(
    `average speed reads ${
      snap.avgSpeedMps === null ? "null" : n2(snap.avgSpeedMps)
    } m/s against a true walking speed of 1.30 m/s (${n1(avgErrPct)}%) — ` +
      `${n1(drift)} m of drift was banked during the stop while moving time was frozen`,
  );
  check(
    "and that inflation stays under 25% after a ten-minute stop",
    Math.abs(avgErrPct) < 25,
    `${n1(avgErrPct)}%`,
  );

  r.done();
}

/* ========================================================================== */
/* CASE 3 — stop then walk again                                               */
/* ========================================================================== */

function caseThree() {
  testCase("Case 3 — stop then walk again: stays stopped until movement is confident");

  const r = rig("hiking");
  const t0 = r.clock.now;
  const walk = stream({ t0, durationS: 4 * 60, speedMps: 1.3, accuracyM: 8, seed: 301 });
  r.feed(walk.fixes);

  const still = stream({
    t0: r.clock.now + 1000,
    durationS: 5 * 60,
    speedMps: 0,
    accuracyM: 8,
    startNorthM: walk.endNorthM,
    seed: 302,
  });
  r.feed(still.fixes);
  check("auto-paused after the stop", r.snap().autoPaused === true);
  const flipsAfterStop = r.flips.length;

  // ---- One noisy fix. A single 9 m jump, well clear of the 4 m noise floor
  //      at 8 m accuracy, and then stillness again. This is bug 2's exact shape.
  const jumpAt = r.clock.now + 1000;
  const jumped = atMetres(still.endNorthM + 9, 0);
  r.clock.advanceTo(jumpAt);
  r.rec.pushGeo({
    t: jumpAt,
    lat: jumped.lat,
    lon: jumped.lon,
    accuracy: 8,
    altitude: null,
    altitudeAccuracy: null,
    speed: null,
    heading: null,
  });
  check("one noisy fix does not resume on the spot", r.snap().autoPaused === true);

  const after = stream({
    t0: jumpAt + 1000,
    durationS: 20,
    speedMps: 0,
    accuracyM: 8,
    startNorthM: still.endNorthM + 9,
    seed: 303,
  });
  r.feed(after.fixes);
  check(
    "and it does not resume over the following twenty seconds either",
    r.snap().autoPaused === true && r.flips.length === flipsAfterStop,
    `${r.flips.length - flipsAfterStop} extra flips`,
  );

  // ---- A genuine restart.
  const restartAt = r.clock.now;
  const again = stream({
    t0: restartAt + 1000,
    durationS: 3 * 60,
    speedMps: 1.3,
    accuracyM: 8,
    startNorthM: still.endNorthM + 9,
    seed: 304,
  });
  r.feed(again.fixes);

  check("a genuine restart does resume", r.snap().autoPaused === false);
  const resume = r.flips.find((f) => f.t > restartAt && !f.paused);
  if (resume) note(`resume confirmed ${n1((resume.t - restartAt) / 1000)} s after walking resumed`);
  check(
    "exactly two flips across the whole activity — one stop, one resume",
    r.flips.length === 2,
    r.flips.map((f) => (f.paused ? "stop" : "go")).join(", "),
  );
  check("moving time never exceeded elapsed", r.maxOvercount <= 0);

  const snap = r.snap();
  check(
    "moving time is less than elapsed by roughly the length of the stop",
    snap.elapsedMs - snap.movingMs > 4 * 60_000 && snap.elapsedMs - snap.movingMs < 8 * 60_000,
    `gap ${n1((snap.elapsedMs - snap.movingMs) / 1000)} s across a ~5.5 min stop`,
  );

  r.done();
}

/* ========================================================================== */
/* CASE 4 — standing still                                                     */
/* ========================================================================== */

function caseFour() {
  testCase("Case 4 — standing still: distance stable, pace unavailable rather than absurd");

  const r = rig("hiking");
  const s = stream({
    t0: r.clock.now,
    durationS: 10 * 60,
    speedMps: 0,
    accuracyM: 6,
    altitudeM: 1840,
    altitudeNoiseM: 2,
    seed: 401,
  });
  r.feed(s.fixes);
  const snap = r.snap();

  const cfg = movementConfigFor("hiking");
  const rate = snap.distanceM / (10 * 60);
  check(
    "ten minutes of standing banks less than the config's still rate",
    rate <= cfg.stoppedRateMps,
    `${n1(snap.distanceM)} m total = ${n2(rate)} m/s`,
  );
  check("auto-paused", snap.autoPaused === true);
  check(
    "live pace is null, not a huge number and not zero",
    snap.paceSecPerKm === null,
    `${snap.paceSecPerKm === null ? "null (em dash)" : String(snap.paceSecPerKm)}`,
  );
  check("live speed is null", snap.speedMps === null);
  check(
    "average pace is either null or a real figure — never Infinity or NaN",
    snap.avgPaceSecPerKm === null || Number.isFinite(snap.avgPaceSecPerKm),
    `${snap.avgPaceSecPerKm === null ? "null" : n1(snap.avgPaceSecPerKm)}`,
  );
  check(
    "calories is null or finite, never NaN",
    snap.calories === null || Number.isFinite(snap.calories),
    `${snap.calories === null ? "null" : n1(snap.calories)} kcal`,
  );
  check("grade is null or finite", snap.gradePct === null || Number.isFinite(snap.gradePct));
  check(
    "vertical rate is null or finite",
    snap.verticalRateMPerH === null || Number.isFinite(snap.verticalRateMPerH),
  );

  // Elevation is the metric with no auto-pause gate on it at all. Measured, not
  // asserted against a guess — see the report.
  note(
    `phantom elevation over ten still minutes with 2 m altitude noise: ` +
      `+${n1(snap.elevationGainM)} m / -${n1(snap.elevationLossM)} m`,
  );
  check(
    "phantom elevation stays under 10 m in ten still minutes",
    snap.elevationGainM < 10 && snap.elevationLossM < 10,
    `+${n1(snap.elevationGainM)} / -${n1(snap.elevationLossM)}`,
  );

  r.done();
}

/* ========================================================================== */
/* CASE 5 — SLOW WALKING (the critical one)                                    */
/* ========================================================================== */

function slowWalk(
  activityTypeId: ActivityTypeId,
  speedMps: number,
  accuracyM: number,
  reported: "truth" | "none" | "zero",
  minutes: number,
  seed: number,
) {
  const r = rig(activityTypeId);
  const s = stream({
    t0: r.clock.now,
    durationS: minutes * 60,
    speedMps,
    accuracyM,
    reported,
    seed,
  });
  r.feed(s.fixes);
  const snap = r.snap();
  const out = {
    paused: snap.autoPaused,
    flips: r.flips.length,
    distanceM: snap.distanceM,
    truthM: s.truthM,
    movingMs: snap.movingMs,
    elapsedMs: snap.elapsedMs,
    paceSecPerKm: snap.paceSecPerKm,
  };
  r.done();
  return out;
}

function caseFive() {
  testCase("Case 5 — SLOW WALKING must not be classified as stopped");

  // The brief's number: about 0.6 m/s on steep ground, with no device speed at
  // all, which is the hard case — every frame is held and every derived speed
  // is null, so the ONLY evidence is the filter's silence.
  const a = slowWalk("hiking", 0.6, 10, "none", 20, 501);
  check(
    "0.6 m/s for twenty minutes on a 10 m fix is never auto-paused",
    !a.paused && a.flips === 0,
    `${a.flips} flips`,
  );
  check(
    "and the distance is still right",
    Math.abs(a.distanceM - a.truthM) / a.truthM < 0.15,
    `${n1(a.distanceM)} m vs ${n1(a.truthM)} m`,
  );
  check(
    "and the full twenty minutes counts as moving time",
    a.elapsedMs - a.movingMs < 2000,
    `moving ${n1(a.movingMs / 1000)} s of ${n1(a.elapsedMs / 1000)} s`,
  );

  // Harder still: the same walker on a poor fix.
  const b = slowWalk("hiking", 0.6, 25, "none", 20, 502);
  check(
    "0.6 m/s on a 25 m fix is never auto-paused",
    !b.paused && b.flips === 0,
    `${b.flips} flips, ${n1(b.distanceM)} m vs ${n1(b.truthM)} m`,
  );

  // The chipset that lies with a flat zero — the `?? 0` failure, wearing the
  // hardware's own hat this time.
  const c = slowWalk("hiking", 0.6, 30, "zero", 20, 503);
  check(
    "0.6 m/s is not auto-paused even when the chipset reports a flat speed of 0",
    !c.paused && c.flips === 0,
    `${c.flips} flips`,
  );

  // The brief's bar across every accuracy the app will accept a fix at. This is
  // the requirement, and it must hold everywhere, not at one convenient fix.
  for (const acc of [5, 8, 12, 20, 30]) {
    const x = slowWalk("hiking", 0.6, acc, "none", 20, 5100 + acc);
    check(
      `0.6 m/s at ${acc} m accuracy: never auto-paused`,
      !x.paused && x.flips === 0,
      `${x.flips} flips, ${n1(x.distanceM)} m banked vs ${n1(x.truthM)} m truth`,
    );
  }

  /**
   * THE CONFIG'S OWN, STRICTER PROMISE — and where it stops holding.
   *
   * `slowestMovingSpeedMps` reads like a floor: 0.22 m/s for backpacking, 0.15
   * for mountaineering. It is not one. `quietSafetyFactor` sizes the quiet
   * window from the NOISE-FREE time to bank a step, and the real interval has a
   * long right tail, so an athlete only just above the declared floor is falsely
   * paused a good fraction of the time. Measured below and written up at
   * `quietSafetyFactor` in config.ts.
   *
   * Asserted at THREE TIMES the declared floor, which a multi-seed sweep across
   * three activities and three accuracies shows is where false pauses actually
   * reach zero; measured and printed at 2x and at the floor itself, which is
   * what the config's wording claims.
   */
  for (const [id, floor] of [
    ["backpacking", 0.22],
    ["mountaineering", 0.15],
    ["hiking", 0.3],
  ] as const) {
    const solid = slowWalk(id, floor * 3, 12, "none", 20, 5200);
    check(
      `${id} at 3x its declared floor (${n2(floor * 3)} m/s) is never auto-paused`,
      !solid.paused && solid.flips === 0,
      `${solid.flips} flips`,
    );
    for (const ratio of [2, 1]) {
      const marginal = slowWalk(id, floor * ratio, 12, "none", 20, 5200);
      note(
        `  ${id} at ${ratio}x its declared floor (${n2(floor * ratio)} m/s): ${
          marginal.flips
        } flips in 20 min, ${n1(
          100 - (100 * marginal.movingMs) / marginal.elapsedMs,
        )}% of the walk wrongly paused`,
      );
    }
  }
  note(
    "  the declared floor is optimistic by about 3x — quietSafetyFactor sizes the " +
      "quiet window from the NOISE-FREE step interval. Measured table in config.ts.",
  );

  // What the OLD code would have done, for the record. The deleted rule was
  // `mean speed < 0.4 m/s for 8 s` -> paused, and 0.6 m/s on a 10 m fix banks a
  // step only every ~8 s, so its rolling mean sat under 0.4 for most of the walk.
  note(
    `for contrast, the deleted rule paused at a mean speed below 0.4 m/s — ` +
      `every walker above is slower than that`,
  );

  // Live pace at these speeds: honest, but worth stating.
  note(
    `live pace at 0.6 m/s: ${
      a.paceSecPerKm === null ? "em dash (below MIN_DISPLAY_SPEED_MPS " + MIN_DISPLAY_SPEED_MPS + ")" : n1(a.paceSecPerKm) + " s/km"
    }`,
  );
}

/* ========================================================================== */
/* CASE 6 — GPS drift while stationary (the brief's own numbers)               */
/* ========================================================================== */

function caseSix() {
  testCase("Case 6 — GPS drift while stationary: 2.1 + 3.4 + 1.7 + 2.8 m must not become 10 m");

  /**
   * The brief's four displacements, arranged as a CLOSED quadrilateral.
   *
   * That arrangement is the point. Stationary drift is a wander that comes back
   * — the phone is on a rock and the error is bounded by the accuracy circle —
   * so four consecutive displacements of 2.1, 3.4, 1.7 and 2.8 m that return to
   * where they started is exactly the brief's case: 10 m of naive fix-to-fix
   * distance and 0 m of travel. A drift that marched off in a straight line
   * would be indistinguishable from walking, and no filter could or should
   * reject it.
   *
   * Bearings are solved rather than guessed: the first two legs are placed, and
   * the last two are the triangle that closes the loop. So the naive sum is
   * exactly 10.0 m and the net displacement is exactly 0, every cycle.
   */
  const STEPS = [2.1, 3.4, 1.7, 2.8] as const;

  function driftLegs(): { north: number; east: number }[] {
    const a1 = 0;
    const a2 = (110 * Math.PI) / 180;
    const v1 = { north: STEPS[0] * Math.cos(a1), east: STEPS[0] * Math.sin(a1) };
    const v2 = { north: STEPS[1] * Math.cos(a2), east: STEPS[1] * Math.sin(a2) };
    // R is what legs 3 and 4 must sum to for the loop to close.
    const R = { north: -(v1.north + v2.north), east: -(v1.east + v2.east) };
    const r = Math.hypot(R.north, R.east);
    const theta = Math.atan2(R.east, R.north);
    // Triangle with sides r, STEPS[2], STEPS[3] — the angle leg 3 makes with R.
    const cosA = (r * r + STEPS[2] ** 2 - STEPS[3] ** 2) / (2 * r * STEPS[2]);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const a3 = theta + alpha;
    const v3 = { north: STEPS[2] * Math.cos(a3), east: STEPS[2] * Math.sin(a3) };
    const v4 = { north: R.north - v3.north, east: R.east - v3.east };
    return [v1, v2, v3, v4];
  }

  const legs = driftLegs();

  function driftFixes(t0: number, accuracyM: number, cycles: number): GeoSample[] {
    const out: GeoSample[] = [];
    let north = 0;
    let east = 0;
    let i = 0;
    for (let c = 0; c < cycles; c++) {
      for (const leg of legs) {
        north += leg.north;
        east += leg.east;
        const p = atMetres(north, east);
        out.push({
          t: t0 + i * 1000,
          lat: p.lat,
          lon: p.lon,
          accuracy: accuracyM,
          altitude: null,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
        });
        i++;
      }
    }
    return out;
  }

  // Prove the stream really is the brief's stream before asserting anything on it.
  const legSum = legs.reduce((a, l) => a + Math.hypot(l.north, l.east), 0);
  const closure = Math.hypot(
    legs.reduce((a, l) => a + l.north, 0),
    legs.reduce((a, l) => a + l.east, 0),
  );
  check(
    "the four legs are the brief's 2.1 + 3.4 + 1.7 + 2.8 = 10 m",
    Math.abs(legSum - 10) < 0.01,
    `${n2(legSum)} m of naive fix-to-fix distance per cycle`,
  );
  check(
    "and they close, so the true displacement per cycle is zero",
    closure < 0.01,
    `net ${closure.toFixed(4)} m`,
  );

  const cfg = movementConfigFor("hiking");

  /**
   * Asserted at 8 m and worse. NOT at 5 m, and the reason is stated rather than
   * hidden: a 3.4 m jump between consecutive 1 Hz fixes is not what a receiver
   * reporting 5 m accuracy does — the correlated-error table above puts its real
   * fix-to-fix jitter at about 0.5 m. Feeding the brief's drift magnitudes in at
   * 5 m accuracy models a device that UNDER-REPORTS its own error, which is a
   * real thing that happens and which this app cannot detect, because the noise
   * floor is derived from the number the device supplies. The 5 m row is
   * measured and printed below so the size of that exposure is on the record.
   */
  for (const acc of [8, 12, 20, 30]) {
    const r = rig("hiking");
    const fixes = driftFixes(r.clock.now, acc, 75); // 300 fixes = 5 minutes at 1 Hz
    let naive = 0;
    for (let i = 1; i < fixes.length; i++) naive += haversine(fixes[i - 1], fixes[i]);
    r.feed(fixes);
    const snap = r.snap();
    const rate = snap.distanceM / 300;

    check(
      `drift at ${acc} m accuracy banks less than the config's still rate`,
      rate <= cfg.stoppedRateMps,
      `${n1(snap.distanceM)} m banked of ${n1(naive)} m naive = ${n2(rate)} m/s`,
    );
    check(`drift at ${acc} m accuracy ends auto-paused`, snap.autoPaused === true);
    check(
      `drift at ${acc} m accuracy does not make the state rattle`,
      r.flips.length <= 1,
      `${r.flips.length} flips`,
    );
    note(
      `  ${acc} m fix: naive ${n1(naive)} m -> banked ${n1(snap.distanceM)} m ` +
        `(${n1((snap.distanceM / naive) * 100)}% of naive), ${r.flips.length} auto-pause flip(s)`,
    );
    r.done();
  }

  // The under-reporting exposure, measured and printed, asserted only for the
  // one thing that must hold regardless: the app must never bank MORE than the
  // raw fixes contain.
  {
    const r = rig("hiking");
    const fixes = driftFixes(r.clock.now, 5, 75);
    let naive = 0;
    for (let i = 1; i < fixes.length; i++) naive += haversine(fixes[i - 1], fixes[i]);
    r.feed(fixes);
    const snap = r.snap();
    check(
      "at 5 m accuracy the app still never invents distance beyond the raw fixes",
      snap.distanceM <= naive,
      `${n1(snap.distanceM)} m banked of ${n1(naive)} m naive`,
    );
    note(
      `  5 m fix (a device UNDER-REPORTING its error): banked ${n1(snap.distanceM)} m ` +
        `over 5 min = ${n2(snap.distanceM / 300)} m/s, auto-paused: ${snap.autoPaused}. ` +
        `The 2.5 m floor cannot tell a 3.4 m drift step from a 3.4 m stride. NEEDS A DEVICE.`,
    );
    r.done();
  }
}

/* ========================================================================== */
/* CASE 7 — one wild coordinate                                                */
/* ========================================================================== */

function caseSeven() {
  testCase("Case 7 — one wild coordinate: no distance spike, no map jump");

  const r = rig("hiking");
  const t0 = r.clock.now;
  const first = stream({ t0, durationS: 3 * 60, speedMps: 1.3, accuracyM: 6, seed: 701 });
  r.feed(first.fixes);
  const before = r.snap();
  const pointsBefore = before.points.length;

  // 5 km away, one second later. A real urban-canyon teleport.
  const wildAt = r.clock.now + 1000;
  const wild = atMetres(first.endNorthM + 5000, 0);
  r.clock.advanceTo(wildAt);
  r.rec.pushGeo({
    t: wildAt,
    lat: wild.lat,
    lon: wild.lon,
    accuracy: 6,
    altitude: null,
    altitudeAccuracy: null,
    speed: null,
    heading: null,
  });
  const after = r.snap();

  check(
    "the wild fix adds no distance",
    Math.abs(after.distanceM - before.distanceM) < 1e-6,
    `${n1(before.distanceM)} -> ${n1(after.distanceM)} m`,
  );
  check(
    "the wild fix never reaches the track, so the map cannot jump to it",
    after.points.length === pointsBefore,
    `${pointsBefore} -> ${after.points.length} points`,
  );
  check("the wild fix does not auto-pause anyone", after.autoPaused === false);

  // And the anchor must survive it: the next real fix has to measure from where
  // the athlete actually was, not from the discarded 5 km.
  const rest = stream({
    t0: wildAt + 1000,
    durationS: 3 * 60,
    speedMps: 1.3,
    accuracyM: 6,
    startNorthM: first.endNorthM,
    seed: 702,
  });
  r.feed(rest.fixes);
  const end = r.snap();
  const truth = first.truthM + rest.truthM;
  check(
    "distance after the teleport still tracks ground truth",
    Math.abs(end.distanceM - truth) / truth < 0.12,
    `${n1(end.distanceM)} m vs ${n1(truth)} m`,
  );
  check("distance never went backwards", !r.distanceWentBack);
  check("no auto-pause flips at all across the incident", r.flips.length === 0);

  // The filter's own verdict, so a future refactor cannot silently accept it.
  const f = new GpsFilter({ maxSpeedMps: 4 });
  f.push(first.fixes[0]);
  f.push(first.fixes[1]);
  const res = f.push({ ...first.fixes[2], lat: wild.lat, lon: wild.lon });
  check("the filter rejects it as a speed jump", res.accepted === false && res.reason === "speed-jump", res.reason ?? "null");

  r.done();
}

/* ========================================================================== */
/* CASE 8 — poor accuracy                                                      */
/* ========================================================================== */

function caseEight() {
  testCase("Case 8 — poor accuracy: metrics stay stable, low confidence is not trusted");

  const cfg = movementConfigFor("hiking");

  // (a) Beyond the gate entirely: nothing may be banked and nothing may change.
  {
    const r = rig("hiking");
    const s = stream({
      t0: r.clock.now,
      durationS: 5 * 60,
      speedMps: 1.2,
      accuracyM: 60,
      seed: 801,
    });
    r.feed(s.fixes);
    const snap = r.snap();
    check(
      `fixes worse than the ${cfg.maxUsableAccuracyM} m gate bank no distance`,
      snap.distanceM === 0,
      `${n1(snap.distanceM)} m`,
    );
    check("and reach no track point", snap.points.length === 0, `${snap.points.length} points`);
    check("and publish no speed", snap.speedMps === null);
    check("and publish no pace", snap.paceSecPerKm === null);
    check(
      "and do not auto-pause anyone — a broken sensor is not a measurement of stillness",
      snap.autoPaused === false && r.flips.length === 0,
      `${r.flips.length} flips`,
    );
    check("gps quality reports weak or none", snap.gpsQuality === "weak" || snap.gpsQuality === "none", snap.gpsQuality);
    r.done();
  }

  // (b) Inside the gate but poor: the requirements must GROW, not shrink.
  {
    const good = requiredQuietMs(5, cfg);
    const poor = requiredQuietMs(35, cfg);
    check(
      "a 35 m fix demands more quiet time than a 5 m fix before declaring a stop",
      poor > good,
      `${n1(poor / 1000)} s vs ${n1(good / 1000)} s`,
    );
    check(
      "the noise floor scales with accuracy",
      noiseFloorM(35, cfg) > noiseFloorM(5, cfg),
      `${n1(noiseFloorM(35, cfg))} m vs ${n1(noiseFloorM(5, cfg))} m`,
    );

    const r = rig("hiking");
    const s = stream({
      t0: r.clock.now,
      durationS: 15 * 60,
      speedMps: 1.0,
      accuracyM: 35,
      seed: 802,
    });
    r.feed(s.fixes);
    const snap = r.snap();
    check(
      "a 1 m/s walker on a 35 m fix is not auto-paused",
      snap.autoPaused === false && r.flips.length === 0,
      `${r.flips.length} flips`,
    );
    check(
      "and their distance is not wildly inflated by the noise",
      snap.distanceM < s.truthM * 1.6,
      `${n1(snap.distanceM)} m vs ${n1(s.truthM)} m truth`,
    );
    note(`distance error on a 35 m fix: ${n1(((snap.distanceM - s.truthM) / s.truthM) * 100)}%`);
    r.done();
  }

  // (c) Accuracy collapsing mid-walk must not itself flip the state.
  {
    const r = rig("hiking");
    const s = stream({
      t0: r.clock.now,
      durationS: 10 * 60,
      speedMps: 1.2,
      // A gorge: 6 m outside, 38 m for ninety seconds in the middle.
      accuracyM: (t) => (t > 300 && t < 390 ? 38 : 6),
      seed: 803,
    });
    r.feed(s.fixes);
    check(
      "a ninety-second accuracy collapse mid-walk causes no auto-pause",
      r.snap().autoPaused === false && r.flips.length === 0,
      `${r.flips.length} flips`,
    );
    r.done();
  }
}

/* ========================================================================== */
/* CASE 9 — temporary GPS loss                                                 */
/* ========================================================================== */

function caseNine() {
  testCase("Case 9 — temporary GPS loss: no fake distance and no fake speed");

  const r = rig("hiking");
  const t0 = r.clock.now;
  const before = stream({ t0, durationS: 3 * 60, speedMps: 1.3, accuracyM: 6, seed: 901 });
  r.feed(before.fixes);
  const atLoss = r.snap();

  // Three minutes with no fix at all. The ticker keeps running.
  r.idle(30);
  const s30 = r.snap();
  check("signal-lost is raised within 30 s of the last fix", s30.signalLost === true);
  check(
    `speed goes to null once the last sample ages past the ${SPEED_WINDOW_MS / 1000} s window`,
    s30.speedMps === null,
    `${s30.speedMps === null ? "null" : n2(s30.speedMps)}`,
  );
  check("pace goes to null with it", s30.paceSecPerKm === null);
  check("gps quality reports none", s30.gpsQuality === "none", s30.gpsQuality);

  r.idle(150);
  const dark = r.snap();
  check(
    "no distance is invented across three minutes of silence",
    Math.abs(dark.distanceM - atLoss.distanceM) < 1e-6,
    `${n1(atLoss.distanceM)} -> ${n1(dark.distanceM)} m`,
  );
  check("no track points are invented", dark.points.length === atLoss.points.length);
  check(
    "elevation is not invented either",
    Math.abs(dark.elevationGainM - atLoss.elevationGainM) < 1e-6,
  );
  check(
    "the machine does not auto-pause on silence — holding is the honest answer",
    dark.autoPaused === false,
  );
  note(
    `moving time DID keep accruing through the blackout ` +
      `(+${n1((dark.movingMs - atLoss.movingMs) / 1000)} s). That is the documented choice: ` +
      `pausing on absence would under-count moving time and flatter average pace. See report.`,
  );

  // Signal returns. The athlete really did walk 180 m of ground in the dark.
  const after = stream({
    t0: r.clock.now + 1000,
    durationS: 3 * 60,
    speedMps: 1.3,
    accuracyM: 6,
    startNorthM: before.endNorthM + 180,
    seed: 902,
  });
  r.feed(after.fixes);
  const back = r.snap();
  const jump = back.distanceM - dark.distanceM;
  check(
    "distance credited on return is the straight-line displacement, never more",
    jump <= 180 + after.truthM + 20,
    `+${n1(jump)} m against ${n1(180 + after.truthM)} m of real ground`,
  );
  check("live speed comes back", back.speedMps !== null, `${back.speedMps === null ? "null" : n2(back.speedMps)} m/s`);
  check("signal-lost clears", back.signalLost === false);
  check("moving time never exceeded elapsed", r.maxOvercount <= 0);

  r.done();
}

/* ========================================================================== */
/* CASE 10 — long activity                                                     */
/* ========================================================================== */

function caseTen() {
  testCase("Case 10 — six hours: no timer drift, no leak, no degradation");

  const r = rig("mountaineering");
  const t0 = r.clock.now;
  const HOURS = 6;
  const TOTAL_S = HOURS * 3600;

  /** Walk for 50 min, stand for 10, six times over. A real alpine day. */
  const speedAt = (t: number) => (t % 3600 < 3000 ? 0.9 : 0);
  const s = stream({
    t0,
    durationS: TOTAL_S,
    speedMps: speedAt,
    accuracyM: 8,
    altitudeM: (t) => 1800 + 900 * Math.sin((Math.PI * t) / TOTAL_S),
    altitudeNoiseM: 1.5,
    seed: 1001,
  });

  let peakWindow = 0;
  // A second machine fed the same stream, so window growth can be observed.
  const shadow = new MovementMachine({ activityTypeId: "mountaineering" });
  const shadowFilter = new GpsFilter({ maxSpeedMps: 3 });
  let prevT: number | null = null;

  for (const f of s.fixes) {
    r.clock.advanceTo(f.t);
    r.rec.pushGeo(f);
    const res = shadowFilter.push(f);
    const u = shadow.push({
      t: f.t,
      stepM: res.stepM,
      dtSec: prevT === null ? Number.POSITIVE_INFINITY : (f.t - prevT) / 1000,
      accuracy: f.accuracy,
      derivedSpeed: res.derivedSpeed,
      reportedSpeed: f.speed,
      accepted: res.accepted,
    });
    prevT = f.t;
    peakWindow = Math.max(peakWindow, u.window.fixes);
  }

  const snap = r.snap();

  check(
    "elapsed time equals the wall clock exactly",
    Math.abs(snap.elapsedMs - TOTAL_S * 1000) <= 1000,
    `${n1(snap.elapsedMs / 1000)} s against ${TOTAL_S} s`,
  );
  check("moving time never exceeded elapsed at any point", r.maxOvercount <= 0, `${r.maxOvercount} ms`);
  check("moving time is non-negative", snap.movingMs >= 0, `${n1(snap.movingMs / 1000)} s`);
  check("distance never went backwards", !r.distanceWentBack);

  const truth = s.truthM;
  check(
    "distance over six hours is within 12% of ground truth",
    Math.abs(snap.distanceM - truth) / truth < 0.12,
    `${n1(snap.distanceM / 1000)} km vs ${n1(truth / 1000)} km`,
  );

  check(
    "the movement window stays bounded — no unbounded growth over six hours",
    peakWindow <= 400,
    `peak ${peakWindow} retained fixes`,
  );
  check(
    "auto-pause flipped twice per real stop and no more",
    r.flips.length <= 2 * HOURS,
    `${r.flips.length} flips across ${HOURS} stops`,
  );
  note(
    `moving ${n1(snap.movingMs / 60000)} min of ${n1(snap.elapsedMs / 60000)} min elapsed; ` +
      `${HOURS} stops of 10 min = ${HOURS * 10} min of standing`,
  );
  note(`track points retained: ${snap.points.length}; splits: ${snap.splits.length}`);

  // No degradation: the last hour must behave like the first.
  const firstHourFlips = r.flips.filter((f) => f.t - t0 < 3_600_000).length;
  const lastHourFlips = r.flips.filter((f) => f.t - t0 >= 5 * 3_600_000).length;
  check(
    "the sixth hour behaves like the first — no drift in the state machine",
    Math.abs(firstHourFlips - lastHourFlips) <= 1,
    `hour 1: ${firstHourFlips} flips, hour 6: ${lastHourFlips} flips`,
  );

  const record = r.rec.finish();
  check(
    "the finished record's moving time never exceeds its duration",
    record.movingSec <= record.durationSec,
    `${record.movingSec} s of ${record.durationSec} s`,
  );
  check(
    "the finished record's average speed equals distance / moving time",
    record.avgSpeedMps !== null &&
      Math.abs(record.avgSpeedMps - record.distanceM / record.movingSec) < 0.01,
  );

  r.done();
}

/* ========================================================================== */
/* REGRESSIONS — the three named defects, each with its own test               */
/* ========================================================================== */

function regressionBugOne() {
  testCase("Regression, bug 1 — the boolean with no hysteresis must not rattle");

  // The deleted rule was a single threshold at 0.4 m/s in both directions. Park
  // an athlete right on it for ten minutes and count the flips.
  const r = rig("hiking");
  const s = stream({
    t0: r.clock.now,
    durationS: 10 * 60,
    speedMps: (t) => 0.4 + 0.05 * Math.sin(t / 3),
    accuracyM: 8,
    reported: "truth",
    seed: 1101,
  });
  r.feed(s.fixes);
  check(
    "ten minutes hovering on the OLD 0.4 m/s threshold produces no flips at all",
    r.flips.length === 0,
    `${r.flips.length} flips`,
  );
  note("the deleted rule would have flipped on every crossing of that line");
  r.done();

  // And the hysteresis band is real, measured off the shipped config.
  const cfg = movementConfigFor("hiking");
  check(
    "the moving threshold is more than double the stopped threshold",
    cfg.movingSpeedMps > cfg.stoppedSpeedMps * 2,
    `${cfg.movingSpeedMps} vs ${cfg.stoppedSpeedMps} m/s`,
  );
  check(
    "entering a stop and leaving one use different kinds of evidence",
    cfg.resumeDistanceFactor > 0 && cfg.minResumeFixes >= 2 && cfg.minQuietFixes >= 2,
    `resume needs ${cfg.minResumeFixes} fixes and ${cfg.resumeDistanceFactor}x the noise floor`,
  );
}

function regressionBugTwo() {
  testCase("Regression, bug 2 — one fix cannot resume, at the machine level");

  const cfg = movementConfigFor("hiking");
  const machine = new MovementMachine({ activityTypeId: "hiking", startState: "moving" });
  const t0 = 1_000_000;
  const floor = noiseFloorM(8, cfg);

  // Sixty still fixes: a confirmed stop.
  let t = t0;
  for (let i = 0; i < 60; i++) {
    machine.push({ t, stepM: 0, dtSec: 1, accuracy: 8, derivedSpeed: null, reportedSpeed: null });
    t += 1000;
  }
  check("sixty still fixes confirm a stop", machine.current === "stopped", machine.current);

  // One fix, three noise floors long. Enormous for a single step.
  const one = machine.push({
    t,
    stepM: floor * 3,
    dtSec: 1,
    accuracy: 8,
    derivedSpeed: floor * 3,
    reportedSpeed: null,
  });
  check(
    "one large step does not reach 'moving'",
    one.state !== "moving",
    `${one.state}: ${one.reason}`,
  );
  check("and it still reports auto-paused", one.autoPaused === true);

  // Ten seconds of ticks with nothing further.
  for (let i = 0; i < 10; i++) {
    t += 1000;
    const u = machine.evaluateAt(t);
    if (u.state === "moving") {
      check("no tick can promote a single step to 'moving'", false, `promoted at +${i + 1}s: ${u.reason}`);
      break;
    }
  }
  check(
    "still not moving ten seconds after the single step",
    machine.current !== "moving",
    machine.current,
  );

  // A real restart: repeated steps.
  for (let i = 0; i < 8; i++) {
    t += 1000;
    machine.push({ t, stepM: floor * 1.2, dtSec: 1, accuracy: 8, derivedSpeed: floor * 1.2, reportedSpeed: null });
  }
  check("a real restart does reach 'moving'", machine.current === "moving", machine.current);
}

function regressionBugThree() {
  testCase("Regression, bug 3 — an unknown speed must not vote");

  const cfg = movementConfigFor("hiking");
  const machine = new MovementMachine({ activityTypeId: "hiking" });
  let t = 2_000_000;

  // A rejected fix must be inert, not still. Ten of them in a row must not
  // build a stop, because a rejected fix bounds nothing.
  for (let i = 0; i < 60; i++) {
    machine.push({
      t,
      stepM: 0,
      dtSec: 1,
      accuracy: 8,
      derivedSpeed: null,
      reportedSpeed: null,
      accepted: false,
    });
    t += 1000;
  }
  check(
    "sixty REJECTED fixes never confirm a stop",
    machine.current === "moving",
    `${machine.current}`,
  );

  // A fix past the accuracy gate is equally inert.
  const m2 = new MovementMachine({ activityTypeId: "hiking" });
  t = 3_000_000;
  for (let i = 0; i < 60; i++) {
    m2.push({
      t,
      stepM: 0,
      dtSec: 1,
      accuracy: cfg.maxUsableAccuracyM + 20,
      derivedSpeed: null,
      reportedSpeed: null,
    });
    t += 1000;
  }
  check("sixty fixes past the accuracy gate never confirm a stop", m2.current === "moving", m2.current);

  // A flat reported 0 on a weak fix must not be believed.
  const m3 = new MovementMachine({ activityTypeId: "hiking" });
  t = 4_000_000;
  const floor = noiseFloorM(cfg.speedTrustAccuracyM + 10, cfg);
  for (let i = 0; i < 40; i++) {
    m3.push({
      t,
      stepM: floor * 1.1, // genuinely moving
      dtSec: 1,
      accuracy: cfg.speedTrustAccuracyM + 10,
      derivedSpeed: null,
      reportedSpeed: 0, // the chipset's placeholder
      accepted: true,
    });
    t += 1000;
  }
  check(
    "a chipset's flat 0 on a weak fix cannot stop a walker who is banking metres",
    m3.current === "moving",
    m3.current,
  );

  // A speed inside the hysteresis band casts no vote either way.
  const m4 = new MovementMachine({ activityTypeId: "hiking" });
  t = 5_000_000;
  const band = (cfg.stoppedSpeedMps + cfg.movingSpeedMps) / 2;
  for (let i = 0; i < 120; i++) {
    m4.push({ t, stepM: 0, dtSec: 1, accuracy: 5, derivedSpeed: band, reportedSpeed: null });
    t += 1000;
  }
  check(
    `a speed of ${band} m/s sits in the band and never confirms a stop`,
    m4.current === "moving",
    m4.current,
  );
}

/* ========================================================================== */
/* CROSS-METRIC CONSISTENCY — brief 18                                         */
/* ========================================================================== */

function crossMetric() {
  testCase("Brief 18 — every metric must derive from the same validated track");

  const r = rig("hiking");
  const s = stream({
    t0: r.clock.now,
    durationS: 30 * 60,
    speedMps: (t) => (t % 600 < 480 ? 1.3 : 0),
    accuracyM: 7,
    altitudeM: (t) => 1500 + t * 0.08,
    altitudeNoiseM: 1.5,
    seed: 1201,
  });
  r.feed(s.fixes);
  const snap = r.snap();

  const lastPoint = snap.points[snap.points.length - 1];
  check(
    "distance tile == last track point's cumulative distance",
    Math.abs(lastPoint.distanceM - snap.distanceM) < 1e-6,
  );
  check(
    "average speed == distance / moving time",
    snap.avgSpeedMps !== null &&
      Math.abs(snap.avgSpeedMps - snap.distanceM / (snap.movingMs / 1000)) < 1e-9,
  );
  check(
    "average pace == 1000 / average speed",
    snap.avgPaceSecPerKm !== null &&
      snap.avgSpeedMps !== null &&
      Math.abs(snap.avgPaceSecPerKm - 1000 / snap.avgSpeedMps) < 1e-9,
  );
  check(
    "live pace == 1000 / live speed, or both are null together",
    (snap.speedMps === null && snap.paceSecPerKm === null) ||
      (snap.speedMps !== null &&
        (snap.speedMps <= MIN_DISPLAY_SPEED_MPS
          ? snap.paceSecPerKm === null
          : snap.paceSecPerKm !== null && Math.abs(snap.paceSecPerKm - 1000 / snap.speedMps) < 1e-9)),
  );
  check(
    "splits sum to no more than the distance",
    snap.splits.reduce((a, x) => a + x.distanceM, 0) <= snap.distanceM + 1e-6,
    `${snap.splits.length} splits`,
  );
  check(
    "split durations sum to no more than elapsed",
    snap.splits.reduce((a, x) => a + x.durationSec, 0) <= snap.elapsedMs / 1000 + 1,
  );
  check(
    "the max altitude is never below the current altitude",
    snap.maxAltitudeM === null || snap.altitudeM === null || snap.maxAltitudeM >= snap.altitudeM,
  );
  check(
    "moving time <= elapsed time",
    snap.movingMs <= snap.elapsedMs,
    `${n1(snap.movingMs / 1000)} / ${n1(snap.elapsedMs / 1000)} s`,
  );

  // The one that is NOT consistent — measured, not asserted. See the report.
  const walkFraction = 480 / 600;
  const expectedMovingS = (snap.elapsedMs / 1000) * walkFraction;
  note(
    `moving time ${n1(snap.movingMs / 1000)} s against ${n1(expectedMovingS)} s of real walking ` +
      `(${n1(((snap.movingMs / 1000 - expectedMovingS) / expectedMovingS) * 100)}% — the cost of ` +
      `confirmation latency at each of the ${Math.floor((30 * 60) / 600)} stops)`,
  );
  note(`calories: ${snap.calories === null ? "null" : n1(snap.calories) + " kcal"}`);

  r.done();
}

/* ========================================================================== */
/* CONTRADICTION PROBES — things two code paths might disagree about           */
/* ========================================================================== */

function contradictionProbes() {
  testCase("Contradiction probes — do two code paths compute the same quantity differently?");

  const cfg = movementConfigFor("hiking");

  // PROBE 1. `movement.ts` refuses to believe a device speed on a fix worse
  // than `speedTrustAccuracyM`. Does the recorder's DISPLAYED speed apply the
  // same rule? `recorder.pushGeo` does `res.derivedSpeed ?? sample.speed`.
  {
    const r = rig("hiking");
    const t0 = r.clock.now;
    // Walking at 1.2 m/s on a 32 m fix — past speedTrustAccuracyM (25) but
    // inside the filter's 40 m gate — with the chipset reporting a flat 0.
    const s = stream({
      t0,
      durationS: 4 * 60,
      speedMps: 1.2,
      accuracyM: 32,
      reported: "zero",
      seed: 1301,
    });
    r.feed(s.fixes);
    const snap = r.snap();
    const displayed = snap.speedMps;
    check(
      "the recorder does not display a speed built from a chipset's untrusted zero",
      displayed === null || displayed > cfg.stoppedSpeedMps,
      `displayed ${displayed === null ? "null" : n2(displayed)} m/s while truly walking at 1.20 m/s ` +
        `on a ${32} m fix (speedTrustAccuracyM = ${cfg.speedTrustAccuracyM} m)`,
    );
    r.done();
  }

  // PROBE 2. Elevation gain has no auto-pause gate. Measure what a phone on a
  // rock adds to the ascent figure over an hour of realistic altitude noise.
  {
    const r = rig("hiking");
    const s = stream({
      t0: r.clock.now,
      durationS: 60 * 60,
      speedMps: 0,
      accuracyM: 6,
      altitudeM: 2400,
      altitudeNoiseM: 3, // GPS altitude error is routinely 1.5-2x horizontal
      seed: 1302,
    });
    r.feed(s.fixes);
    const snap = r.snap();
    note(
      `one hour auto-paused on a rock: +${n1(snap.elevationGainM)} m gain, ` +
        `-${n1(snap.elevationLossM)} m loss, distance ${n1(snap.distanceM)} m`,
    );
    check(
      "an hour of standing still does not invent a hundred metres of ascent",
      snap.elevationGainM < 100,
      `+${n1(snap.elevationGainM)} m`,
    );
    r.done();
  }

  // PROBE 3. The two noise floors — `filters.ts` computes its own, `config.ts`
  // mirrors the formula. If they ever disagree the machine misreads silence.
  {
    const f = new GpsFilter({ maxSpeedMps: 4 });
    // Drive a step exactly at the mirrored floor and check the filter banks it.
    const acc = 12;
    const floor = noiseFloorM(acc, cfg);
    const t = 6_000_000;
    const a = atMetres(0, 0);
    f.push({ t, lat: a.lat, lon: a.lon, accuracy: acc, altitude: null, altitudeAccuracy: null, speed: null, heading: null });
    const justUnder = atMetres(floor * 0.95, 0);
    const under = f.push({
      t: t + 1000,
      lat: justUnder.lat,
      lon: justUnder.lon,
      accuracy: acc,
      altitude: null,
      altitudeAccuracy: null,
      speed: null,
      heading: null,
    });
    const justOver = atMetres(floor * 1.05, 0);
    const over = f.push({
      t: t + 2000,
      lat: justOver.lat,
      lon: justOver.lon,
      accuracy: acc,
      altitude: null,
      altitudeAccuracy: null,
      speed: null,
      heading: null,
    });
    check(
      "config.noiseFloorM matches the floor filters.ts actually applies",
      under.stepM === 0 && over.stepM > 0,
      `floor ${n1(floor)} m: 0.95x banked ${n1(under.stepM)} m, 1.05x banked ${n1(over.stepM)} m`,
    );
  }

  // PROBE 4. Does the recorder ever publish a moving time greater than elapsed
  // when a resume lands on the same millisecond as a tick?
  {
    const r = rig("hiking");
    const t0 = r.clock.now;
    // Alternate 20 s of walking and 40 s of standing, twenty times, so stop and
    // resume edges land all over the tick boundary.
    let north = 0;
    const fixes: GeoSample[] = [];
    for (let i = 0; i < 20 * 60; i++) {
      const phase = i % 60;
      const moving = phase < 20;
      if (moving) north += 1.3;
      const p = atMetres(north, 0);
      fixes.push({
        t: t0 + i * 1000,
        lat: p.lat,
        lon: p.lon,
        accuracy: 6,
        altitude: null,
        altitudeAccuracy: null,
        speed: null,
        heading: null,
      });
    }
    r.feed(fixes);
    check(
      "moving never exceeded elapsed across 20 stop/start cycles",
      r.maxOvercount <= 0,
      `worst overcount ${r.maxOvercount} ms, ${r.flips.length} flips`,
    );
    check("moving time is not negative", r.snap().movingMs >= 0, `${n1(r.snap().movingMs / 1000)} s`);
    r.done();
  }
}

/* ========================================================================== */
/* STRESS — the implausible worst case, measured and reported, not asserted     */
/* ========================================================================== */

/**
 * The white-noise model, kept honest by being labelled.
 *
 * A receiver whose error is uncorrelated between fixes would produce fix-to-fix
 * jumps LARGER than the noise floor at every accuracy the app accepts, so every
 * fix would look like a step and no filter could help. Real receivers are not
 * like that, which is why the suite above does not use it. But the number is a
 * useful upper bound on how wrong things can go if a chipset ever behaves this
 * way, so it is measured and printed rather than hidden — and NOT asserted,
 * because passing a test nobody should pass would be the more dishonest choice.
 */
function stressWhiteNoise() {
  testCase("Stress — an implausible receiver with uncorrelated error (reported, not asserted)");

  for (const acc of [5, 8, 20]) {
    const r = rig("hiking");
    const s = stream({
      t0: r.clock.now,
      durationS: 10 * 60,
      speedMps: 0,
      accuracyM: acc,
      errorModel: "white",
      seed: 1401,
    });
    r.feed(s.fixes);
    const snap = r.snap();
    note(
      `standing still, ${acc} m fix, WHITE noise: banked ${n1(snap.distanceM)} m in 10 min ` +
        `(${n2(snap.distanceM / 600)} m/s), ${r.flips.length} auto-pause flips, ` +
        `naive raw sum ${n1(s.naiveM)} m`,
    );
    r.done();
  }

  const r = rig("hiking");
  const s = stream({
    t0: r.clock.now,
    durationS: 20 * 60,
    speedMps: 1.4,
    accuracyM: 8,
    errorModel: "white",
    seed: 1402,
  });
  r.feed(s.fixes);
  note(
    `walking 1.4 m/s, 8 m fix, WHITE noise: ${n1(r.snap().distanceM)} m banked against ` +
      `${n1(s.truthM)} m truth — ${n1(((r.snap().distanceM - s.truthM) / s.truthM) * 100)}% inflation`,
  );
  check(
    "even under the implausible model, nothing crashes and the invariants hold",
    r.maxOvercount <= 0 && !r.distanceWentBack && r.snap().movingMs <= r.snap().elapsedMs,
  );
  r.done();
}

/* ========================================================================== */
/* Run                                                                         */
/* ========================================================================== */

function main() {
  console.log("\n\x1b[1mICEFALL tracking — synthetic fix-stream tests\x1b[0m");
  console.log("\x1b[2mNo device involved. See the bottom of this file for what that cannot prove.\x1b[0m");

  caseZero();
  caseOne();
  caseTwo();
  caseThree();
  caseFour();
  caseFive();
  caseSix();
  caseSeven();
  caseEight();
  caseNine();
  caseTen();
  regressionBugOne();
  regressionBugTwo();
  regressionBugThree();
  crossMetric();
  contradictionProbes();
  stressWhiteNoise();

  console.log(
    `\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m`,
  );
  if (failures.length) {
    console.log("\n\x1b[31mFailures\x1b[0m");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }

  console.log(
    "\n\x1b[2mWHAT THIS RUN DOES NOT PROVE: real chipset behaviour (duty cycling, Kalman-\n" +
      "smoothed positions, accuracy under-reporting), iOS/Android background timer\n" +
      "suspension, wake-lock behaviour, barometric altitude, battery cost, and the\n" +
      "feel of the auto-pause latency in the hand. Those need a phone on a hill.\x1b[0m",
  );
}

main();

export {};
