import type { ActivityTypeId } from "./types";

/**
 * Tracking thresholds — the single home for every tuned number.
 *
 * Before this module the auto-pause thresholds lived as two bare constants at
 * the top of `recorder.ts`, the GPS noise floor lived inside `filters.ts`, and
 * nothing said WHY any of them held the value it did. Tuning one meant reading
 * three files and guessing at the interaction. Everything the movement state
 * machine reasons with is here, named, with the failure that fixes the value.
 *
 * House rule, same as `filters.ts`: a number without a reason is a number
 * nobody can safely change. If you edit a value, edit its comment.
 *
 * Not covered here: `DEFAULT_FILTER` in `filters.ts` still owns the GPS
 * acceptance filter (accuracy gate, speed sanity, altitude hysteresis). That
 * filter is upstream of this one and works well; it was left where it is
 * deliberately. The two values this module MIRRORS from it — `minStepM` and
 * `maxAccuracyM` — are called out at their definitions below, and if you change
 * them there you must change them here.
 */

/* -------------------------------------------------------------------------- */
/* Movement configuration                                                      */
/* -------------------------------------------------------------------------- */

export interface MovementConfig {
  /* ---- What the GPS can and cannot resolve ------------------------------ */

  /**
   * Floor on the "a step this short is noise" test, metres.
   *
   * MIRRORS `DEFAULT_FILTER.minStepM` in filters.ts. A stationary consumer GPS
   * wanders a couple of metres a second; anything under this is drift.
   */
  minStepM: number;

  /**
   * Fixes worse than this tell us nothing and are treated as INERT — they
   * neither confirm movement nor confirm a stop, metres.
   *
   * MIRRORS `DEFAULT_FILTER.maxAccuracyM`, because a fix the upstream filter
   * threw away must not be allowed to vote here either. It was arriving at this
   * module as `stepM: 0`, which read exactly like stillness.
   */
  maxUsableAccuracyM: number;

  /**
   * Device-reported ground speed is only believed on fixes at least this
   * accurate, metres.
   *
   * Several chipsets emit a flat `speed: 0` when they have no Doppler solution
   * rather than emitting null. On a weak fix that zero is not a measurement of
   * stillness, it is the absence of a measurement, and treating it as the
   * former is the same class of mistake as `?? 0`.
   */
  speedTrustAccuracyM: number;

  /**
   * A fix this much worse than the recent mean cannot itself trigger a state
   * change, metres.
   *
   * Walking into an urban canyon or under a cliff makes accuracy collapse for
   * a few fixes. The step lengths that come out of a collapsing fix are wild in
   * both directions, so a degrading fix is the least trustworthy possible
   * moment to change your mind. Hold, and decide once accuracy settles.
   */
  degradeGuardM: number;

  /* ---- Speed thresholds — the hysteresis band --------------------------- */

  /**
   * A KNOWN speed at or below this is evidence of stillness, m/s.
   *
   * Above stationary Doppler noise (~0.1–0.2 m/s) and below anything a person
   * does on their feet — the slowest sustained human walk on steep ground is
   * around 0.3 m/s. Never applied to a null speed: null is unknown, not zero.
   */
  stoppedSpeedMps: number;

  /**
   * A KNOWN speed at or above this is evidence of movement, m/s.
   *
   * Deliberately more than double `stoppedSpeedMps`. The gap between the two is
   * the hysteresis band: a speed hovering around one number cannot flip the
   * state back and forth, because inside the band there is no vote at all. The
   * old code used ONE threshold for both directions, which is precisely the
   * bouncing the owner reported.
   */
  movingSpeedMps: number;

  /**
   * The slowest speed the app promises to recognise as movement, m/s.
   *
   * ~1 km/h — a heavily loaded walker on steep ground, the owner's test case.
   * This is not a threshold anything is compared against; it SIZES the quiet
   * window (see `quietSafetyFactor`).
   *
   * READ IT AS "a third of the slowest speed actually delivered", not as a hard
   * floor. `quietSafetyFactor` carries the measurement: detection is reliable at
   * about three times this number and degrades steadily as you approach it.
   */
  slowestMovingSpeedMps: number;

  /**
   * How much longer than one guaranteed step the quiet window must run, ratio.
   *
   * At accuracy A the upstream filter will not bank anything until the walker
   * has covered `noiseFloorM(A)`, so at `slowestMovingSpeedMps` a step lands
   * every `noiseFloorM(A) / slowestMovingSpeedMps` seconds. Requiring 1.5× that
   * span before declaring a stop puts at least one banked step inside the window
   * for anyone moving at or above that speed. This single factor is what
   * protects the slow walker, and it is why the required quiet time grows when
   * accuracy gets worse instead of shrinking.
   *
   * WHAT IT ACTUALLY GUARANTEES, MEASURED. That step interval is the NOISE-FREE
   * one. Real position error is a correlated random walk, so the true interval
   * has a long right tail: about half the time the walker has not yet cleared
   * the noise floor when the nominal moment arrives. The margin 1.5 buys is
   * therefore comfortable well above the floor and thin at it. Share of a
   * twenty-minute walk spent WRONGLY auto-paused, eight seeds per cell, three
   * activities, 8 / 12 / 20 m accuracy:
   *
   *     speed as a multiple of slowestMovingSpeedMps   wrongly paused
   *                       1.00x                            10 - 51%
   *                       1.25x                             7 - 28%
   *                       1.50x                             4 - 14%
   *                       2.00x                             0 -  4%
   *                       2.50x                             0 -  1%
   *                       3.00x and above                       0%
   *
   * So the honest statement of the promise is: movement is held reliably at
   * THREE TIMES this number, nearly reliably at 2.5x, and unreliably at the
   * number itself. It is NOT an accuracy problem — the ratio is what matters,
   * and the failure is as bad on a 5 m fix as on a 30 m one.
   *
   * WHY IT IS STILL 1.5. Raising it to 3 was measured too, for hiking at 8 m
   * accuracy: a walker at the 0.30 m/s floor goes from 29% of the walk wrongly
   * paused to 6%, and the time to notice a REAL stop goes from 26 s to 52 s.
   * That is a genuine product trade-off with a visible cost on both sides, not a
   * bug with a right answer, so the number is left alone and the measurement is
   * written down here instead of the trade being made quietly. The owner's own
   * stated case — 0.6 m/s on steep ground, which is 2x the hiking floor — passes
   * at 5, 8, 12, 20 and 30 m accuracy with zero false pauses.
   */
  quietSafetyFactor: number;

  /* ---- Entering a stop --------------------------------------------------- */

  /**
   * Floor on the quiet time required before a stop is declared, ms.
   *
   * The accuracy-scaled requirement is usually larger; this only binds on an
   * excellent fix. Raised from the old 8 s because 8 s was tuned against the
   * single-boolean auto-pause, which had no confirmation stage at all — with a
   * candidate state in front of it, a slightly longer floor costs nothing and
   * removes the last of the flicker at traffic lights and gear stops.
   */
  baseStopDwellMs: number;

  /**
   * Independent usable fixes needed inside the quiet window before a stop can
   * be declared.
   *
   * Time alone is not evidence. Four fixes that each say "no displacement"
   * is evidence; one fix and a long wait is just a long wait, and could as
   * easily be a phone that has stopped reporting.
   */
  minQuietFixes: number;

  /**
   * Banked distance per second, averaged over the quiet window, at or below
   * which the window counts as quiet, m/s.
   *
   * A rate rather than a total, so an isolated phantom step from a bad fix does
   * not veto auto-pause forever — the alternative (any banked step cancels the
   * stop) means a phone left on a rock in an urban canyon never auto-pauses.
   * Held at `stoppedSpeedMps` so the distance test and the speed test agree on
   * what "still" means.
   */
  stoppedRateMps: number;

  /**
   * Quiet fixes needed before entering the `possibly-stopped` candidate state.
   *
   * Entering the candidate is deliberately cheap — it changes no user-visible
   * behaviour, it only starts the clock. But not free: one held frame mid-stride
   * is completely normal, and re-entering the candidate on every one of them
   * would make the debug log unreadable.
   */
  minCandidateQuietFixes: number;

  /** Quiet time before entering `possibly-stopped`, ms. Cheap, see above. */
  candidateStopDwellMs: number;

  /* ---- Leaving a stop — deliberately more expensive ---------------------- */

  /**
   * Distance needed to leave `stopped`, as a multiple of the noise floor.
   *
   * THIS is the asymmetry the brief asks for. Entering a stop needs only the
   * sustained ABSENCE of movement; leaving it needs positive metres — both
   * banked along the path and, when the caller can supply a position, as
   * straight-line DISPLACEMENT from where the stop was declared.
   *
   * WHY 4 AND NOT 2. The noise floor is `0.5 x accuracy`, which is the app's own
   * estimate of the scale (sigma) of the position error. A stationary phone's
   * error is a 2-D random walk about the true position.
   *
   * The tempting sum is P(radius > k x sigma) = exp(-k^2 / 2), which would make
   * k = 3 plenty. That is WRONG here, and the measurement said so before the
   * arithmetic did. The displacement being tested is not measured from the true
   * position: it is measured from WHERE THE PHONE APPEARED TO BE when the stop
   * was declared, which is itself a draw from the same error. Two independent
   * draws, so the variance doubles and the tail is
   *
   *     P > exp(-k^2 / 4):    k = 2 -> 37%    k = 3 -> 11%    k = 4 -> 1.8%
   *
   * The error decorrelates in roughly ninety seconds, so ten stationary minutes
   * is about seven draws. At k = 2 that predicts a false resume roughly every
   * ninety seconds, and the measurement agreed: ELEVEN auto-pause flips across a
   * single ten-minute stand at 8 m accuracy — the owner's bouncing complaint,
   * reproduced at a desk, inside the module built to remove it. k = 3 cut that
   * to three. k = 4 is the first value where the predicted rate (about one false
   * resume per two stationary hours) is below what anyone would notice.
   *
   * WHAT IT COSTS. At 8 m accuracy a resume needs 16 m of displacement rather
   * than 8 m: 11 s at walking pace instead of 6 s, 27 s instead of 13 s for the
   * 0.6 m/s walker. NO MOVING TIME IS LOST to that latency — the confirmed
   * resume is back-dated to `movingSinceT` — so the whole cost is a few extra
   * seconds of the "Auto-paused" badge, which is the cheap side of this trade.
   * The expensive side would be the opposite error, and the badge is the only
   * thing that is late: distance, moving time and pace are all correct.
   */
  resumeDistanceFactor: number;

  /**
   * Independent movement fixes needed to leave `stopped`.
   *
   * The confirmation rule. One fix is a rumour.
   */
  minResumeFixes: number;

  /**
   * Minimum time in `possibly-moving` before movement is confirmed, ms.
   *
   * Short on purpose, and it is the one place where leaving is cheaper than
   * entering in SECONDS while still being dearer in EVIDENCE. Two reasons: a
   * pause held while the user is walking is visible and infuriating, and the
   * confirmed resume is back-dated to `movingSinceT`, so the moving-time figure
   * does not depend on how long confirmation took.
   */
  resumeDwellMs: number;

  /* ---- The rolling window ------------------------------------------------ */

  /**
   * Shortest span of history kept for the rolling decision, ms.
   *
   * Decisions are made from a window, never one fix. The window actually kept
   * is `max(this, requiredQuietMs × windowSpanFactor)` so that on a poor fix,
   * where the required quiet time stretches towards two minutes, the window
   * still outlives it — otherwise the evidence needed to resume would age out
   * of the window before it could ever be assembled, and a slow walker on a
   * weak fix would be stuck in `stopped` permanently.
   */
  windowMs: number;

  /** How many times the required quiet span the window must cover, ratio. */
  windowSpanFactor: number;

  /** Hard ceiling on retained history, ms — bounds memory on a long day out. */
  maxWindowMs: number;

  /**
   * After this long with no usable fix, no transition may be made at all, ms.
   *
   * Silence is not evidence of stillness. A pocketed phone that has lost the
   * sky, a tunnel, a backgrounded app — none of them mean the user stopped, and
   * auto-pausing on absence would silently under-count moving time and flatter
   * the average pace. Sits just above `SIGNAL_LOST_AFTER_MS` (12 s) in
   * recorder.ts so the "signal lost" banner appears before the machine freezes.
   */
  evidenceStaleAfterMs: number;
}

/**
 * Defaults tuned for walking pace on a phone in a hand or a hip pocket, which
 * is the hardest common case: slow enough to sit near the noise floor, and
 * without the clean Doppler a runner or a cyclist gives you.
 */
export const MOVEMENT_DEFAULTS: MovementConfig = {
  minStepM: 2.5,
  maxUsableAccuracyM: 40,
  speedTrustAccuracyM: 25,
  degradeGuardM: 10,

  stoppedSpeedMps: 0.2,
  movingSpeedMps: 0.45,
  slowestMovingSpeedMps: 0.3,
  quietSafetyFactor: 1.5,

  baseStopDwellMs: 10_000,
  minQuietFixes: 4,
  stoppedRateMps: 0.2,
  minCandidateQuietFixes: 2,
  candidateStopDwellMs: 3_000,

  resumeDistanceFactor: 4,
  minResumeFixes: 2,
  resumeDwellMs: 3_000,

  windowMs: 60_000,
  windowSpanFactor: 2,
  maxWindowMs: 300_000,
  evidenceStaleAfterMs: 15_000,
};

/* -------------------------------------------------------------------------- */
/* Per-activity overrides                                                      */
/* -------------------------------------------------------------------------- */

function group(
  ids: readonly ActivityTypeId[],
  cfg: Partial<MovementConfig>,
): Partial<Record<ActivityTypeId, Partial<MovementConfig>>> {
  const out: Partial<Record<ActivityTypeId, Partial<MovementConfig>>> = {};
  for (const id of ids) out[id] = cfg;
  return out;
}

/**
 * Where an activity genuinely behaves differently.
 *
 * Only overrides that have a reason are here. An activity with no entry uses
 * the defaults, which is the correct outcome for most of the catalogue —
 * inventing a distinct number per activity would be false precision.
 *
 * Indoor types (treadmill, turbo trainer, gym climbing) have no GPS at all and
 * so never reach this machine; the recorder must not run it for them, because
 * a machine fed no fixes holds its state forever by design.
 */
export const MOVEMENT_OVERRIDES: Partial<Record<ActivityTypeId, Partial<MovementConfig>>> = {
  // ---- Running -----------------------------------------------------------
  // A runner wants auto-pause to bite at a road crossing, and their slowest
  // real movement is a walk break at roughly 1 m/s, not a 0.3 m/s plod. Both
  // facts point the same way: less quiet time is needed to be sure.
  ...group(["outdoor-run", "trail-run", "track-run"], {
    stoppedSpeedMps: 0.35,
    movingSpeedMps: 0.9,
    slowestMovingSpeedMps: 0.8,
    stoppedRateMps: 0.35,
    baseStopDwellMs: 6_000,
  }),

  // ---- Hiking ------------------------------------------------------------
  // Defaults were tuned for exactly this case. Backpacking gets a slower floor
  // because a full load on a steep climb genuinely does drop below 0.3 m/s.
  ...group(["backpacking", "trekking"], {
    slowestMovingSpeedMps: 0.22,
  }),

  // ---- Cycling -----------------------------------------------------------
  // A bicycle that is moving is moving fast, and one that has stopped has
  // stopped completely — there is no cycling equivalent of the slow plod. The
  // exception is a track stand at a junction, which reads as a stop and should:
  // the rider is not covering ground.
  ...group(["road-cycling", "gravel-cycling", "mountain-biking"], {
    stoppedSpeedMps: 0.5,
    movingSpeedMps: 1.5,
    slowestMovingSpeedMps: 1.2,
    stoppedRateMps: 0.5,
    baseStopDwellMs: 6_000,
  }),

  // ---- Mountaineering and climbing ---------------------------------------
  // Standing still is part of the activity: belaying, placing gear, waiting out
  // a rope team, route-finding on a ridge. Pausing after ten seconds of that
  // would chop the moving time of a real alpine day into confetti, so the quiet
  // requirement is long and the movement floor is very low — a pitch of mixed
  // ground can average well under 0.2 m/s and is unambiguously movement.
  ...group(["mountaineering", "alpine-climbing", "scrambling", "rock-climbing"], {
    slowestMovingSpeedMps: 0.15,
    stoppedSpeedMps: 0.15,
    stoppedRateMps: 0.15,
    baseStopDwellMs: 45_000,
    minQuietFixes: 8,
  }),

  // ---- Winter ------------------------------------------------------------
  // A chairlift moves at 2–5 m/s, so a lift ride is not a stop and never looks
  // like one; what does look like a stop is a queue, which is a real stop.
  // Ski touring inherits the alpine problem of long transitions instead.
  ...group(["skiing", "snowboarding"], {
    stoppedSpeedMps: 0.5,
    movingSpeedMps: 1.5,
    slowestMovingSpeedMps: 1.0,
    stoppedRateMps: 0.5,
  }),
  ...group(["ski-touring", "ski-mountaineering", "snowshoeing"], {
    slowestMovingSpeedMps: 0.2,
    baseStopDwellMs: 20_000,
  }),

  // ---- Water -------------------------------------------------------------
  // A phone or watch at water level has a bad view of the sky and gets wet,
  // and current moves the craft while the paddler rests. Demand more.
  ...group(["kayaking", "paddleboarding", "swimming"], {
    minQuietFixes: 6,
    baseStopDwellMs: 20_000,
    speedTrustAccuracyM: 15,
  }),
};

/** Resolved config for one activity, with an optional caller override on top. */
export function movementConfigFor(
  activityTypeId: ActivityTypeId,
  overrides: Partial<MovementConfig> = {},
): MovementConfig {
  return { ...MOVEMENT_DEFAULTS, ...(MOVEMENT_OVERRIDES[activityTypeId] ?? {}), ...overrides };
}

/* -------------------------------------------------------------------------- */
/* Derived quantities                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The shortest displacement that can be told apart from drift at this accuracy,
 * metres.
 *
 * MIRRORS the `Math.max(minStepM, accuracy * 0.5)` in `GpsFilter.push`. It is
 * duplicated rather than shared because filters.ts is upstream, working, and
 * deliberately untouched — but the movement machine has to know the same number
 * to reason about what the filter's silence means. If the formula changes
 * there, change it here.
 */
export function noiseFloorM(accuracyM: number, cfg: MovementConfig): number {
  if (!Number.isFinite(accuracyM)) return cfg.minStepM;
  return Math.max(cfg.minStepM, accuracyM * 0.5);
}

/**
 * How long a window must stay quiet before a stop may be declared, ms.
 *
 * Grows with accuracy, and that direction is the whole point: with a 40 m fix
 * you genuinely cannot tell a slow walker from a phone on a rock inside ten
 * seconds, and the honest response to weak evidence is to wait for more, not to
 * decide faster.
 */
export function requiredQuietMs(accuracyM: number, cfg: MovementConfig): number {
  const stepSeconds = noiseFloorM(accuracyM, cfg) / Math.max(0.05, cfg.slowestMovingSpeedMps);
  return Math.max(cfg.baseStopDwellMs, stepSeconds * cfg.quietSafetyFactor * 1000);
}

/** How much history to retain at this accuracy, ms. See `windowMs`. */
export function windowKeepMs(accuracyM: number, cfg: MovementConfig): number {
  return Math.min(
    cfg.maxWindowMs,
    Math.max(cfg.windowMs, requiredQuietMs(accuracyM, cfg) * cfg.windowSpanFactor),
  );
}

/* -------------------------------------------------------------------------- */
/* What the engine can honestly report                                         */
/* -------------------------------------------------------------------------- */

/*
 * These are floors on MEASURABILITY, not on presentation — below them the
 * recorder has no figure to give and returns null, and the screen renders the
 * em dash this app reserves for NOT MEASURED. How often that null is repainted,
 * and how the map behaves, are separate questions answered in `display.ts`.
 */

/**
 * Window of the recorder's rolling speed mean, ms.
 *
 * Long enough to smooth out the metre-scale jitter that makes an instantaneous
 * GPS speed unreadable, short enough that the figure still tracks a change of
 * effort. It doubles as the staleness bound: once the newest speed sample in
 * the window is older than the window itself, the mean is a memory rather than
 * a measurement, and the recorder reports null instead. Without that, standing
 * still with no bankable steps left the last walking speed on the screen
 * indefinitely, because a window only prunes when something is pushed into it.
 */
export const SPEED_WINDOW_MS = 20_000;

/**
 * Slowest speed the live pace figure is derived from, m/s.
 *
 * Pace is the reciprocal of speed, so the slower the speed the more violently
 * pace swings: at 0.3 m/s one noisy metre per second moves the displayed pace
 * by minutes. Below this the number would imply a precision the sensor does
 * not have, so the recorder returns null and the screen shows an em dash. The
 * distinction this app keeps everywhere: an em dash is NOT MEASURED, a zero is
 * a measured zero.
 */
export const MIN_DISPLAY_SPEED_MPS = 0.3;

/**
 * Slowest average speed an average pace is derived from, m/s.
 *
 * Lower than the live floor because an average is taken over the whole moving
 * time and does not swing — the only case it guards is the first seconds of a
 * recording, where a couple of metres over a couple of seconds would otherwise
 * publish an average pace for an activity that has barely begun.
 */
export const MIN_DISPLAY_AVG_SPEED_MPS = 0.1;
