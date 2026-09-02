import {
  movementConfigFor,
  noiseFloorM,
  requiredQuietMs,
  windowKeepMs,
  type MovementConfig,
} from "./config";
import type { ActivityTypeId } from "./types";

/**
 * Movement state machine.
 *
 * Decides whether the athlete is moving or stopped, and nothing else. It holds
 * no timers, touches no React, reads no clock and has no side effects: you feed
 * it observations and it returns a state and a sentence explaining the state.
 * That is deliberate — every edge case below can be reproduced at a desk in
 * milliseconds, which is the only way this class of bug gets tested honestly.
 *
 * WHY IT EXISTS. Auto-pause used to be one boolean recomputed every second:
 *
 *     const still = Date.now() - lastMovementAt > AUTO_PAUSE_AFTER_MS;
 *     const slow  = (speed.mean ?? 0) < AUTO_PAUSE_SPEED_MPS;
 *     autoPaused  = still && slow;
 *
 * Three separate defects in three lines, all of which this module answers:
 *
 *   1. ONE threshold and ONE dwell for both directions, so the state sat on the
 *      boundary and rattled. Here, entering a stop and leaving one use
 *      different thresholds, different dwell times and different KINDS of
 *      evidence, with two candidate states in between.
 *   2. A single banked step set `autoPaused = false` immediately, so one noisy
 *      fix resumed recording. Here, leaving a stop needs independent fixes and
 *      integrated metres, never one observation.
 *   3. `?? 0` turned "speed unknown" into "speed is zero", which reads as
 *      stopped. `GpsFilter` returns null on a held frame ON PURPOSE, and says
 *      so in a comment — this module never coerces that null. An unknown speed
 *      neither confirms nor denies anything.
 *
 * THE EDGE CASES IT IS BUILT AGAINST, each handled where the code says so:
 *
 *   1.  Phone stationary on a rock, GPS drifting          → still evidence, rate test
 *   2.  Slow walker on steep ground (~0.3 m/s)            → `quietSafetyFactor`
 *   3.  One noisy fix while stopped                       → `minResumeFixes`
 *   4.  Accuracy collapsing under a cliff                 → `degradeGuardM`
 *   5.  Signal lost, then regained                        → `evidenceStaleAfterMs`
 *   6.  Teleport / rejected fix                           → `accepted: false` is inert
 *   7.  Chipset reporting a flat 0 with no Doppler        → `speedTrustAccuracyM`
 *   8.  Duplicate or out-of-order timestamps              → `dtSec <= 0` is inert
 *   9.  Genuine stop, then a genuine restart              → both confirmations
 *   10. Activity started before the first fix arrives     → stale guard, holds `moving`
 *
 * WHAT IT DOES NOT DO. It never invents a number. When it cannot tell, it holds
 * the state it already had and says why — it does not guess, and it does not
 * clamp anything into a range that merely looks plausible.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type MovementState = "moving" | "possibly-stopped" | "stopped" | "possibly-moving";

/**
 * What one observation is worth.
 *
 * The distinction between `still` and `inert` is the heart of the module.
 *
 *  - `still`  — an accepted, accurate fix that banked no distance. This is a
 *               BOUNDED measurement: it says displacement since the filter's
 *               anchor is below the noise floor. It is not a speed of zero and
 *               is never treated as one, but it is real information.
 *  - `inert`  — a fix that was rejected, too inaccurate to bound anything, or
 *               out of order. It carries NO information. It votes on nothing,
 *               it does not extend a quiet run, and it does not restart any
 *               clock. This is the `?? 0` bug's proper answer.
 *  - `ambiguous` — a known speed sitting inside the hysteresis band. Also no
 *               vote, by construction: the band exists so that a speed hovering
 *               near the threshold cannot flip the state.
 */
export type MovementEvidence = "movement" | "still" | "ambiguous" | "inert";

/** One GPS fix, already through `GpsFilter`. */
export interface MovementObservation {
  /** Epoch milliseconds, from the fix itself rather than the wall clock. */
  t: number;
  /** Distance the filter banked for this fix, metres. 0 on a held frame. */
  stepM: number;
  /** Seconds since the previous fix. `<= 0` marks a duplicate or reordering. */
  dtSec: number;
  /** Horizontal accuracy, metres — lower is better. */
  accuracy: number;
  /**
   * Speed derived from the filtered track, m/s.
   *
   * NULL MEANS UNKNOWN AND MUST STAY NULL. `GpsFilter` returns null on a held
   * frame precisely so that a slow athlete's pace is not halved by phantom
   * zeroes; the same null means "no vote" here.
   */
  derivedSpeed: number | null;
  /** Device-reported ground speed, m/s, or null when the device gave none. */
  reportedSpeed: number | null;
  /** False when `GpsFilter` rejected the fix. Defaults to true. */
  accepted?: boolean;
  /**
   * Straight-line distance from the position at which the current stop was
   * declared, metres. Null or absent when there is no stop to measure from, or
   * when the caller cannot supply a position.
   *
   * WHY THE MACHINE NEEDS THIS AND CANNOT DERIVE IT. Everything else here is
   * PATH LENGTH, and bounded GPS drift accumulates path length without limit:
   * a phone on a rock at 8 m accuracy banks a ~4 m step roughly every 27 s, and
   * two of those landing 11 s apart read as 0.86 m/s of honest walking. Over
   * ten stationary minutes that resumed the recording ELEVEN times — the
   * owner's bouncing, surviving inside the module built to remove it. No test
   * on `stepM` alone can separate the two, because over twenty seconds they are
   * the same measurement.
   *
   * DISPLACEMENT separates them completely. Drift is a bounded random walk
   * about a fixed point, so its displacement from that point cannot grow; a
   * walker's grows without limit. `stepM` cannot express that, because the
   * machine is given distances and never positions.
   */
  netFromStopM?: number | null;
}

/** The thresholds in force for this decision, scaled for current accuracy. */
export interface MovementRequirements {
  /** Accuracy the requirements were scaled from, metres. */
  accuracyM: number;
  /** Shortest displacement distinguishable from drift at that accuracy, m. */
  noiseFloorM: number;
  /** Quiet span needed before a stop may be declared, ms. */
  quietMs: number;
  /** Usable fixes needed inside that span. */
  quietFixes: number;
  /** Banked metres per second allowed inside that span. */
  quietRateMps: number;
  /** Banked metres needed to leave a stop. */
  resumeDistanceM: number;
  /** Independent movement fixes needed to leave a stop. */
  resumeFixes: number;
  /** Minimum time in `possibly-moving` before a resume is confirmed, ms. */
  resumeDwellMs: number;
}

/** The rolling window the decision was made from. */
export interface MovementWindow {
  /** Span actually covered by retained fixes, ms. */
  spanMs: number;
  fixes: number;
  movementFixes: number;
  /** Retained fixes that banked no distance. */
  stillFixes: number;
  /** Metres banked across the whole retained window. */
  distanceM: number;
  meanAccuracyM: number | null;
  /** Mean of the speeds that were KNOWN. Null when none were. */
  meanKnownSpeedMps: number | null;
  knownSpeedFixes: number;
}

export interface MovementSnapshot {
  state: MovementState;
  /** When the current state was entered, epoch ms. */
  enteredAt: number | null;
  /**
   * Whether the recorder should stop accruing moving time.
   *
   * True in `stopped` and `possibly-moving`, false in `moving` and
   * `possibly-stopped`. That asymmetry is the hysteresis made visible: a
   * suspected stop keeps counting until it is proven, and a suspected resume
   * stays paused until it is proven. Both are corrected retroactively by the
   * two timestamps below, so neither guess costs the athlete real time.
   */
  autoPaused: boolean;
  /** What the last observation was worth. */
  evidence: MovementEvidence;
  /** Last fix that banked distance — the last proof of movement, epoch ms. */
  lastMovementAt: number | null;
  /**
   * When the current run of still fixes began, epoch ms.
   *
   * On a confirmed stop the true stop instant lies somewhere between
   * `lastMovementAt` and this; the recorder should pick one, debit moving time
   * back to it, and be able to say which it picked. Debiting to
   * `lastMovementAt` over-debits, because the athlete may have kept moving
   * below the noise floor after it.
   */
  quietSinceT: number | null;
  /**
   * The earliest fix that the confirmed resume rests on, epoch ms.
   *
   * Movement demonstrably began no later than this, so moving time should be
   * credited from here rather than from the moment confirmation completed.
   * Without that back-date, a slow resume silently under-counts moving time,
   * which makes average pace look FASTER than it was — a flattering lie.
   */
  movingSinceT: number | null;
  window: MovementWindow;
  required: MovementRequirements;
  /** Why the machine is where it is, in a sentence. For the debug overlay. */
  reason: string;
}

export interface MovementUpdate extends MovementSnapshot {
  changed: boolean;
  previous: MovementState;
}

export interface MovementMachineOptions {
  activityTypeId?: ActivityTypeId;
  /** Per-recording overrides on top of the activity's config. */
  config?: Partial<MovementConfig>;
  /**
   * State to start in. `moving` by default: a human pressed Start, which is the
   * strongest statement of intent available, and the machine requires positive
   * evidence of stillness to leave it.
   */
  startState?: MovementState;
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */

interface WindowEntry {
  t: number;
  stepM: number;
  accuracyM: number;
  knownSpeed: number | null;
  movement: boolean;
}

const m = (v: number) => `${v.toFixed(1)}m`;
const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const mps = (v: number) => `${v.toFixed(2)}m/s`;

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/* -------------------------------------------------------------------------- */
/* The machine                                                                 */
/* -------------------------------------------------------------------------- */

export class MovementMachine {
  private cfg: MovementConfig;

  private state: MovementState;
  private enteredAt: number | null = null;

  private window: WindowEntry[] = [];

  /** Last observation timestamp of ANY kind — ordering guard only. */
  private lastObsT: number | null = null;
  /** Last observation that carried information — staleness is measured on it. */
  private lastUsableT: number | null = null;
  private lastAccuracyM: number | null = null;
  private lastEvidence: MovementEvidence = "inert";

  private lastMovementAt: number | null = null;
  private quietSinceT: number | null = null;
  private stillRunFixes = 0;
  private movingSinceT: number | null = null;

  /** Set when the newest fix is materially worse than the recent mean. */
  private degrading = false;

  /**
   * Newest reported displacement from the stop position, metres, or null.
   *
   * Held so the 1 Hz `evaluateAt` reasons from the same evidence the last fix
   * carried rather than silently losing the test between fixes.
   */
  private netFromStopM: number | null = null;

  private reason = "idle";

  constructor(opts: MovementMachineOptions = {}) {
    this.cfg = movementConfigFor(opts.activityTypeId ?? "other", opts.config);
    this.state = opts.startState ?? "moving";
  }

  /**
   * Clear all evidence.
   *
   * The recorder must call this when the athlete resumes from a MANUAL pause.
   * Otherwise the quiet run accumulated while they were parked at a hut is
   * still sitting in the window, and the machine auto-pauses them again within
   * a second of restarting — a stop confirmed from evidence gathered before the
   * user told us they had stopped.
   */
  reset(startState: MovementState = "moving") {
    this.state = startState;
    this.enteredAt = null;
    this.window = [];
    this.lastObsT = null;
    this.lastUsableT = null;
    this.lastAccuracyM = null;
    this.lastEvidence = "inert";
    this.lastMovementAt = null;
    this.quietSinceT = null;
    this.stillRunFixes = 0;
    this.movingSinceT = null;
    this.degrading = false;
    this.netFromStopM = null;
    this.reason = "reset";
  }

  /** Swap configuration mid-recording — the activity type can change. */
  configure(activityTypeId: ActivityTypeId, overrides: Partial<MovementConfig> = {}) {
    this.cfg = movementConfigFor(activityTypeId, overrides);
  }

  get current(): MovementState {
    return this.state;
  }

  /* ---------------------------------------------------------------------- */
  /* Ingest                                                                  */
  /* ---------------------------------------------------------------------- */

  push(obs: MovementObservation): MovementUpdate {
    const previous = this.state;

    if (!Number.isFinite(obs.t)) {
      this.lastEvidence = "inert";
      return this.result(previous, this.lastObsT ?? 0, "fix has no usable timestamp — ignored");
    }

    // Edge case 8. Duplicate and out-of-order fixes carry no new information,
    // and letting one through would corrupt every span the window measures.
    // `GpsFilter` rejects these for the same reason.
    if (
      (this.lastObsT !== null && obs.t <= this.lastObsT) ||
      (Number.isFinite(obs.dtSec) && obs.dtSec <= 0)
    ) {
      this.lastObsT = Math.max(this.lastObsT ?? obs.t, obs.t);
      this.lastEvidence = "inert";
      return this.result(previous, obs.t, "duplicate or out-of-order fix — no vote");
    }

    const priorMeanAccuracy = mean(this.window.map((e) => e.accuracyM));
    const evidence = this.classify(obs);

    this.lastObsT = obs.t;
    this.lastEvidence = evidence;

    if (evidence === "inert") {
      // Edge cases 4 and 6. A rejected or hopeless fix must not extend a quiet
      // run, must not reset one, and must not enter the window. Silence from a
      // broken sensor is not a measurement of stillness.
      return this.evaluate(obs.t, `${describeInert(obs, this.cfg)} — unknown does not vote`);
    }

    this.lastUsableT = obs.t;
    this.lastAccuracyM = obs.accuracy;
    this.netFromStopM =
      obs.netFromStopM === null || obs.netFromStopM === undefined || !Number.isFinite(obs.netFromStopM)
        ? null
        : obs.netFromStopM;

    // Brief 19. Compare against the mean BEFORE this fix joins it, or a single
    // very bad fix drags the mean towards itself and hides its own degradation.
    this.degrading =
      priorMeanAccuracy !== null && obs.accuracy > priorMeanAccuracy + this.cfg.degradeGuardM;

    const step = Number.isFinite(obs.stepM) && obs.stepM > 0 ? obs.stepM : 0;
    this.window.push({
      t: obs.t,
      stepM: step,
      accuracyM: obs.accuracy,
      knownSpeed: usableSpeed(obs, this.cfg),
      movement: evidence === "movement",
    });
    this.prune(obs.t);

    if (evidence === "movement") {
      this.lastMovementAt = obs.t;
      this.quietSinceT = null;
      this.stillRunFixes = 0;
    } else if (evidence === "still") {
      if (this.quietSinceT === null) this.quietSinceT = obs.t;
      this.stillRunFixes++;
    }
    // `ambiguous` deliberately touches none of the above. A speed inside the
    // hysteresis band is not evidence of anything, so it leaves the state and
    // both run clocks exactly where they were.

    return this.evaluate(obs.t);
  }

  /**
   * Re-decide at time `t` without new evidence.
   *
   * The 1 Hz ticker calls this so a dwell that is already satisfied on evidence
   * can complete on the clock. It can never CREATE evidence: with no usable fix
   * inside `evidenceStaleAfterMs` it refuses to transition at all.
   */
  evaluateAt(t: number): MovementUpdate {
    return this.evaluate(t);
  }

  snapshot(t?: number): MovementSnapshot {
    const at = t ?? this.lastObsT ?? 0;
    return {
      state: this.state,
      enteredAt: this.enteredAt,
      autoPaused: this.state === "stopped" || this.state === "possibly-moving",
      evidence: this.lastEvidence,
      lastMovementAt: this.lastMovementAt,
      quietSinceT: this.quietSinceT,
      movingSinceT: this.movingSinceT,
      window: this.windowSummary(at),
      required: this.requirements(),
      reason: this.reason,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Classification                                                          */
  /* ---------------------------------------------------------------------- */

  private classify(obs: MovementObservation): MovementEvidence {
    if (obs.accepted === false) return "inert";

    // Edge case 4. A fix worse than the upstream filter's own gate bounds
    // nothing. It was previously arriving here as `stepM: 0`, which is
    // indistinguishable from stillness unless you check accuracy — and not
    // checking it is how a walk through a gorge became a pause.
    if (!Number.isFinite(obs.accuracy) || obs.accuracy > this.cfg.maxUsableAccuracyM) {
      return "inert";
    }

    const floor = noiseFloorM(obs.accuracy, this.cfg);
    const step = Number.isFinite(obs.stepM) ? obs.stepM : 0;

    // A banked step above the noise floor is measured displacement. The module
    // re-checks the floor rather than trusting `stepM > 0`, so it behaves the
    // same when driven directly from a test harness as it does behind the
    // filter.
    if (step >= floor) return "movement";

    const known = usableSpeed(obs, this.cfg);
    if (known !== null) {
      if (known >= this.cfg.movingSpeedMps) return "movement";
      if (known <= this.cfg.stoppedSpeedMps) return "still";
      return "ambiguous";
    }

    // No usable speed, nothing banked, but the fix itself was good: displacement
    // since the filter's anchor is BELOW THE NOISE FLOOR. Bounded, not unknown.
    //
    // Read this together with `quietSafetyFactor`. One such observation
    // confirms nothing on its own; a stop needs a run of them longer than the
    // time a walker at `slowestMovingSpeedMps` takes to bank a step, so anyone
    // moving at that speed or better interrupts the run before it matures.
    return "still";
  }

  /* ---------------------------------------------------------------------- */
  /* Window                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Accuracy the thresholds are scaled from.
   *
   * The window mean, not the newest fix: one lucky 5 m fix in a run of 30 m
   * fixes should not suddenly make the machine decisive. With no window at all
   * it assumes the worst accepted accuracy, so the machine demands the MOST
   * evidence when it knows the least.
   */
  private scaleAccuracyM(): number {
    return mean(this.window.map((e) => e.accuracyM)) ?? this.lastAccuracyM ?? this.cfg.maxUsableAccuracyM;
  }

  private prune(t: number) {
    const keep = windowKeepMs(this.scaleAccuracyM(), this.cfg);
    const cutoff = t - keep;
    while (this.window.length && this.window[0].t < cutoff) this.window.shift();
  }

  private windowSummary(t: number): MovementWindow {
    const known = this.window.map((e) => e.knownSpeed).filter((v): v is number => v !== null);
    return {
      spanMs: this.window.length ? t - this.window[0].t : 0,
      fixes: this.window.length,
      movementFixes: this.window.filter((e) => e.movement).length,
      stillFixes: this.window.filter((e) => !e.movement).length,
      distanceM: this.window.reduce((a, e) => a + e.stepM, 0),
      meanAccuracyM: mean(this.window.map((e) => e.accuracyM)),
      meanKnownSpeedMps: mean(known),
      knownSpeedFixes: known.length,
    };
  }

  private requirements(): MovementRequirements {
    const acc = this.scaleAccuracyM();
    const floor = noiseFloorM(acc, this.cfg);
    return {
      accuracyM: acc,
      noiseFloorM: floor,
      quietMs: requiredQuietMs(acc, this.cfg),
      quietFixes: this.cfg.minQuietFixes,
      quietRateMps: this.cfg.stoppedRateMps,
      resumeDistanceM: floor * this.cfg.resumeDistanceFactor,
      resumeFixes: this.cfg.minResumeFixes,
      resumeDwellMs: this.cfg.resumeDwellMs,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Decisions                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Is the trailing `quietMs` quiet enough to declare a stop?
   *
   * Measured as a RATE over the window rather than "no step at all". A phone
   * left on a rock in an urban canyon throws the occasional phantom step, and
   * under a no-step-at-all rule it would never auto-pause. A rate also stays
   * honest in the other direction: a walker at 0.3 m/s puts 7.5 m into a 25 s
   * window, which is a rate of 0.3 and comfortably above the ceiling.
   */
  private stopConfirmed(t: number, req: MovementRequirements): { ok: boolean; why: string } {
    if (!this.window.length) return { ok: false, why: "no usable fixes yet" };

    const covered = t - this.window[0].t;
    if (covered < req.quietMs) {
      return { ok: false, why: `only ${s(covered)} of history, needs ${s(req.quietMs)}` };
    }

    const slice = this.window.filter((e) => e.t >= t - req.quietMs);
    if (slice.length < req.quietFixes) {
      return {
        ok: false,
        why: `${slice.length} usable fixes in the last ${s(req.quietMs)}, needs ${req.quietFixes}`,
      };
    }

    const dist = slice.reduce((a, e) => a + e.stepM, 0);
    const rate = dist / (req.quietMs / 1000);
    if (rate > req.quietRateMps) {
      return {
        ok: false,
        why: `${m(dist)} banked in the last ${s(req.quietMs)} — ${mps(rate)} is above the ${mps(
          req.quietRateMps,
        )} still rate`,
      };
    }

    // Known speeds may DENY a stop. They can never be required, because on a
    // held frame there are none, and demanding them would mean a stop could
    // only ever be confirmed on hardware that reports Doppler speed.
    const known = slice.map((e) => e.knownSpeed).filter((v): v is number => v !== null);
    const meanKnown = mean(known);
    if (meanKnown !== null && meanKnown > this.cfg.stoppedSpeedMps) {
      return { ok: false, why: `measured speed ${mps(meanKnown)} still says moving` };
    }

    const speedNote =
      meanKnown === null ? "no speed reported" : `speed ${mps(meanKnown)}`;
    return {
      ok: true,
      why: `${m(dist)} banked over ${slice.length} fixes in ${s(req.quietMs)} (${mps(
        rate,
      )}, ${speedNote}) at ~${m(req.accuracyM)} accuracy`,
    };
  }

  /**
   * Has movement been demonstrated well enough to leave a stop?
   *
   * Integrated metres over independent fixes, not one step and not one speed
   * reading. This is the direction that used to flip on a single noisy fix.
   */
  private resumeConfirmed(t: number, req: MovementRequirements): { ok: boolean; why: string } {
    const since = this.movingSinceT ?? this.enteredAt ?? t;
    // Never let ancient phantom steps add up: only evidence inside the retained
    // window counts, so two spurious steps twenty minutes apart cannot resume.
    const from = Math.max(since, t - windowKeepMs(req.accuracyM, this.cfg));
    const slice = this.window.filter((e) => e.t >= from);

    const dwell = t - (this.enteredAt ?? t);
    if (dwell < req.resumeDwellMs) {
      return { ok: false, why: `${s(dwell)} of movement, needs ${s(req.resumeDwellMs)}` };
    }

    const moveFixes = slice.filter((e) => e.movement).length;
    if (moveFixes < req.resumeFixes) {
      return { ok: false, why: `${moveFixes} movement fixes, needs ${req.resumeFixes}` };
    }

    const known = slice.map((e) => e.knownSpeed).filter((v): v is number => v !== null);
    const meanKnown = mean(known);

    const dist = slice.reduce((a, e) => a + e.stepM, 0);
    const spanSec = slice.length ? Math.max(0.001, (t - slice[0].t) / 1000) : 0;

    // THE TWO TESTS MUST AGREE ABOUT WHAT STILLNESS IS.
    //
    // `stopConfirmed` decides stillness on a RATE — metres per second banked
    // across the window — precisely because a stationary phone throws the odd
    // phantom step and a total would veto auto-pause forever. This test used to
    // decide movement on a TOTAL over the same window, and the two then
    // contradicted each other on identical evidence: a phone drifting 8 m in a
    // minute is STILL by the first test (0.13 m/s, under the 0.2 m/s ceiling)
    // and MOVING by the second (8 m, over the two-noise-floor bar). The machine
    // oscillated between those two verdicts, which is the owner's bouncing
    // surviving inside the very module built to remove it — measured at ELEVEN
    // auto-pause flips across a single ten-minute stand at 8 m accuracy.
    //
    // So the same rate ceiling applies here. It costs a genuine restart
    // nothing: leaving a stop needs `resumeDistanceM` metres anyway, and any
    // athlete covering them at better than the still rate clears this on the
    // same fix that clears the distance. It costs drift everything, because
    // drift is bounded — it can eventually total the distance, but only ever
    // slowly, which is the one thing that distinguishes it from walking.
    // DISPLACEMENT FIRST, when the caller can supply it. Path length is what
    // drift can fake; displacement from the stop position is what it cannot.
    // See `netFromStopM` on MovementObservation for the measurement that forced
    // this. When the caller supplies nothing the test is skipped rather than
    // guessed at — an absent measurement must never read as a failed one.
    if (this.netFromStopM !== null && this.netFromStopM < req.resumeDistanceM) {
      return {
        ok: false,
        why: `${m(dist)} of path but only ${m(
          this.netFromStopM,
        )} from where the stop was declared — needs ${m(
          req.resumeDistanceM,
        )}; drift walks in circles, people do not`,
      };
    }

    const rate = dist / spanSec;
    if (dist >= req.resumeDistanceM && rate <= this.cfg.stoppedRateMps) {
      return {
        ok: false,
        why: `${m(dist)} over ${s(spanSec * 1000)} is ${mps(rate)} — at or below the ${mps(
          this.cfg.stoppedRateMps,
        )} still rate, so the stop test would still call this stopped`,
      };
    }

    if (dist < req.resumeDistanceM) {
      // Fallback for hardware with a good Doppler solution and a poor position
      // fix: repeated measured speeds well above the moving threshold, covering
      // the same ground the banked-distance test would have demanded. Without
      // it a device that reports honest speed but banks nothing (its position
      // still inside the noise floor of where it stopped) can be stranded in
      // `stopped` while plainly walking. Just as strong as the distance path —
      // it still needs `resumeFixes` independent measurements — and it is only
      // ever used to pick a state, never to display or bank a number.
      const impliedM = meanKnown === null ? 0 : meanKnown * spanSec;
      const speedCarries =
        known.length >= req.resumeFixes &&
        meanKnown !== null &&
        meanKnown >= this.cfg.movingSpeedMps &&
        impliedM >= req.resumeDistanceM;

      if (!speedCarries) {
        return { ok: false, why: `${m(dist)} banked, needs ${m(req.resumeDistanceM)}` };
      }
      return {
        ok: true,
        why: `${mps(meanKnown ?? 0)} measured over ${known.length} fixes for ${s(
          spanSec * 1000,
        )} — ${m(impliedM)} of travel with nothing bankable yet`,
      };
    }

    // A known speed may contradict, but is not required to exceed
    // `movingSpeedMps`: a genuinely slow walker's reported speed sits inside the
    // hysteresis band, and demanding they clear it would strand them in
    // `stopped` for as long as they kept walking slowly. Banked distance is the
    // confirming evidence; instantaneous speed only gets a veto.
    if (meanKnown !== null && meanKnown <= this.cfg.stoppedSpeedMps) {
      return { ok: false, why: `measured speed ${mps(meanKnown)} still says stopped` };
    }

    return {
      ok: true,
      why: `${m(dist)} over ${moveFixes} fixes in ${s(dwell)} (needed ${m(
        req.resumeDistanceM,
      )} / ${req.resumeFixes} fixes / ${s(req.resumeDwellMs)})`,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Transition                                                              */
  /* ---------------------------------------------------------------------- */

  private evaluate(t: number, inertNote?: string): MovementUpdate {
    const previous = this.state;
    const req = this.requirements();

    // Edge cases 5 and 10. No usable fix for a while means we know nothing
    // about right now. Holding is the only honest answer: auto-pausing on
    // silence would quietly under-count moving time and flatter average pace,
    // and resuming on silence would invent movement outright.
    const staleFor = this.lastUsableT === null ? Infinity : t - this.lastUsableT;
    if (staleFor > this.cfg.evidenceStaleAfterMs) {
      const detail =
        this.lastUsableT === null
          ? "no usable fix yet"
          : `no usable fix for ${s(staleFor)}`;
      return this.result(
        previous,
        t,
        `holding ${previous}: ${detail} — silence is not evidence of stillness`,
      );
    }

    if (inertNote) {
      return this.result(previous, t, `holding ${previous}: ${inertNote}`);
    }

    switch (previous) {
      case "moving": {
        if (
          this.quietSinceT !== null &&
          this.stillRunFixes >= this.cfg.minCandidateQuietFixes &&
          t - this.quietSinceT >= this.cfg.candidateStopDwellMs
        ) {
          return this.transition(
            "possibly-stopped",
            t,
            `possibly-stopped: ${this.stillRunFixes} still fixes over ${s(
              t - this.quietSinceT,
            )}, nothing banked since ${this.sinceMovement(t)} — watching for ${s(req.quietMs)}`,
          );
        }
        return this.result(previous, t, `moving: ${this.movingHoldNote(t)}`);
      }

      case "possibly-stopped": {
        // Owner test 5, and the reason this state exists. A single banked step
        // cancels a stop that was never declared. There is no hysteresis debt
        // to pay because nothing was paused, so cancelling costs nothing and
        // wrongly pausing a slow walker costs a lot.
        //
        // The degrade guard is deliberately NOT applied here: holding a pending
        // stop through a bad fix would risk pausing someone who is moving, and
        // between the two errors this one is free to avoid.
        if (this.quietSinceT === null) {
          return this.transition(
            "moving",
            t,
            `moving: a banked step cancelled the pending stop before it was declared`,
          );
        }

        if (this.degrading) {
          return this.result(previous, t, this.degradeNote(previous, req));
        }

        const stop = this.stopConfirmed(t, req);
        if (stop.ok) {
          this.movingSinceT = null;
          return this.transition("stopped", t, `stopped: ${stop.why}`);
        }
        return this.result(previous, t, `possibly-stopped: ${stop.why}`);
      }

      case "stopped": {
        // The movement must be NEWER than the stop itself. Without the
        // timestamp check, a stop confirmed on a tick whose last observation
        // happened to bank a step would flip straight back to `possibly-moving`
        // on the very next tick, off the same single fix — the same one-fix
        // resume this module exists to prevent, wearing a different hat.
        const freshMovement =
          this.lastMovementAt !== null &&
          (this.enteredAt === null || this.lastMovementAt > this.enteredAt);

        if (this.lastEvidence === "movement" && freshMovement && this.lastMovementAt !== null) {
          this.movingSinceT = this.lastMovementAt;
          return this.transition(
            "possibly-moving",
            t,
            `possibly-moving: a step was banked while stopped — needs ${m(
              req.resumeDistanceM,
            )} over ${req.resumeFixes} fixes to confirm`,
          );
        }
        return this.result(previous, t, `stopped: no movement banked (${this.sinceMovement(t)})`);
      }

      case "possibly-moving": {
        if (this.degrading) {
          return this.result(previous, t, this.degradeNote(previous, req));
        }

        const resume = this.resumeConfirmed(t, req);
        if (resume.ok) {
          const backdate =
            this.movingSinceT === null ? "" : `; moving time back-dates to ${s(t - this.movingSinceT)} ago`;
          return this.transition("moving", t, `moving: ${resume.why}${backdate}`);
        }

        // Falling back needs the FULL stop evidence again — never a cheaper
        // test than the one that declared the stop in the first place — AND it
        // must give the resume a full quiet window to prove itself first.
        //
        // Without that second clause the stop test looks at a trailing window
        // still full of the stillness that preceded the restart, so the first
        // second of a genuine restart reads as "not sustained" and the machine
        // rattles stopped -> possibly-moving -> stopped -> possibly-moving
        // before settling. Nothing user-visible moves during that, but it is
        // the same bouncing in miniature, and it would make the debug trace
        // unreadable at exactly the moment someone is reading it.
        const dwell = t - (this.enteredAt ?? t);
        const stop = dwell >= req.quietMs ? this.stopConfirmed(t, req) : { ok: false, why: "" };
        if (stop.ok) {
          this.movingSinceT = null;
          return this.transition("stopped", t, `stopped: the resume was not sustained — ${stop.why}`);
        }
        return this.result(previous, t, `possibly-moving: ${resume.why}`);
      }
    }
  }

  private transition(next: MovementState, t: number, reason: string): MovementUpdate {
    const previous = this.state;
    this.state = next;
    this.enteredAt = t;
    this.reason = reason;
    return { ...this.snapshot(t), changed: true, previous };
  }

  private result(previous: MovementState, t: number, reason: string): MovementUpdate {
    this.reason = reason;
    return { ...this.snapshot(t), changed: false, previous };
  }

  /* ---------------------------------------------------------------------- */
  /* Reason helpers — the debug overlay reads these                          */
  /* ---------------------------------------------------------------------- */

  private sinceMovement(t: number): string {
    return this.lastMovementAt === null
      ? "no movement banked yet"
      : `last step ${s(t - this.lastMovementAt)} ago`;
  }

  private movingHoldNote(t: number): string {
    if (this.lastEvidence === "movement") return `step banked, ${this.sinceMovement(t)}`;
    if (this.lastEvidence === "ambiguous") {
      return "speed inside the hysteresis band — no vote either way";
    }
    if (this.quietSinceT !== null) {
      return `${this.stillRunFixes} still fix${this.stillRunFixes === 1 ? "" : "es"} over ${s(
        t - this.quietSinceT,
      )} — not yet enough to suspect a stop`;
    }
    return this.sinceMovement(t);
  }

  private degradeNote(state: MovementState, req: MovementRequirements): string {
    const cur = this.lastAccuracyM === null ? "unknown" : m(this.lastAccuracyM);
    return `holding ${state}: accuracy degrading (${cur} against a ~${m(
      req.accuracyM,
    )} recent mean) — a worsening fix must not move the state`;
  }
}

/* -------------------------------------------------------------------------- */
/* Speed selection                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The device's own ground speed, if it can be believed, else null.
 *
 * EXPORTED because the recorder needs the identical rule for the speed it
 * DISPLAYS. It did not have it: `pushGeo` fell back to `sample.speed` with no
 * accuracy gate at all, so on a 32 m fix a chipset emitting its flat `speed: 0`
 * placeholder poured zeroes into the rolling mean between banked steps. A
 * walker doing a measured 1.20 m/s was shown 0.17 m/s — a pace seven times too
 * slow — while this module, two files away, was correctly refusing to believe
 * the same zeroes. Two code paths, one quantity, opposite answers. One rule
 * now, in one place.
 *
 * NEVER returns 0 for "we don't know": a reported zero is only passed through
 * on a fix good enough that it represents a real Doppler solution.
 */
export function trustedDeviceSpeed(
  reported: number | null | undefined,
  accuracyM: number | null | undefined,
  cfg: MovementConfig,
): number | null {
  if (reported === null || reported === undefined || !Number.isFinite(reported) || reported < 0) {
    return null;
  }
  if (accuracyM === null || accuracyM === undefined || !Number.isFinite(accuracyM)) return null;
  return accuracyM <= cfg.speedTrustAccuracyM ? reported : null;
}

/**
 * The speed this observation actually measured, or null.
 *
 * The derived speed comes from the filtered track and is preferred; the
 * device's own figure is only believed under `trustedDeviceSpeed` above.
 */
function usableSpeed(obs: MovementObservation, cfg: MovementConfig): number | null {
  const derived = obs.derivedSpeed;
  if (derived !== null && Number.isFinite(derived) && derived >= 0) return derived;
  return trustedDeviceSpeed(obs.reportedSpeed, obs.accuracy, cfg);
}

function describeInert(obs: MovementObservation, cfg: MovementConfig): string {
  if (obs.accepted === false) return "fix rejected by the GPS filter";
  if (!Number.isFinite(obs.accuracy)) return "fix reported no accuracy";
  if (obs.accuracy > cfg.maxUsableAccuracyM) {
    return `accuracy ${m(obs.accuracy)} is past the ${m(cfg.maxUsableAccuracyM)} limit`;
  }
  return "fix carried no usable information";
}
