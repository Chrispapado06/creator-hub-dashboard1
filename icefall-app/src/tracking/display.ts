import type { ActivityTypeId, RecorderSnapshot } from "./types";

/**
 * The cadences of the live Activity screen — how often React is repainted, how
 * often the in-progress activity is written to disk, and how reluctantly the
 * map camera moves.
 *
 * This is the display sibling of `config.ts`. That module owns what the
 * tracking engine BELIEVES (the movement state machine's thresholds); this one
 * owns what the screen SHOWS and when. They are deliberately separate files
 * because they answer to different failures — one to a wrong number, one to a
 * correct number arriving so often that nobody can read it.
 *
 * The failure that caused this module: `useRecorder` called `setSnapshot` on
 * every `emit()`, and the recorder emits on every GPS fix AND on a 1 s ticker.
 * So React re-rendered the whole Activity screen at sensor rate, and the map's
 * follow effect — keyed on an object identity that changed every emit — fired
 * `easeTo` roughly once a second with a 900 ms animation, restarting the camera
 * before it had finished the last move. Standing still, the screen shook.
 *
 * NOTHING HERE CHANGES A RECORDED VALUE. The recorder keeps full sensor
 * fidelity underneath; distance, ascent, the track and the splits are
 * accumulated exactly as before. These numbers govern how often the truth is
 * repainted, never what the truth is. If a value is unknown it still arrives as
 * null and still renders as an em dash — the throttle passes snapshots through
 * untouched, it never substitutes or holds a stale one in place of a new one.
 *
 * House rule, same as `filters.ts` and `config.ts`: a number without a reason
 * is a number nobody can safely change. If you edit a value, edit its comment.
 */

/* -------------------------------------------------------------------------- */
/* Display rate                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The fastest the live numbers are handed to React, ms.
 *
 * One hertz, because the largest number on the Activity screen is a clock
 * reading in whole seconds and nothing else on it is legible faster. The
 * recorder still ingests, filters and banks every fix at whatever rate the
 * chipset produces — this is the rate at which the RESULT is repainted.
 *
 * Not lower than a second: pace, grade and vertical rate are all derived from
 * rolling windows, and repainting them at 3 Hz shows the athlete the window's
 * noise rather than their effort.
 */
export const DISPLAY_INTERVAL_MS = 1000;

/**
 * Fields whose change must be shown IMMEDIATELY, bypassing the throttle.
 *
 * These are transitions, not readings. A tap on pause has to darken the screen
 * now, not on the next tick; an auto-pause badge appearing a second late reads
 * as a laggy app; the "signal lost" warning exists precisely to be early. Every
 * other field is a measurement, and a measurement can wait for its slot.
 *
 * Capability flags are here because they change WHICH tiles exist, not what a
 * tile says — a layout change is a transition.
 */
export function transitionKey(s: RecorderSnapshot): string {
  return [
    s.status,
    s.autoPaused,
    s.signalLost,
    s.simulated,
    s.capabilities.gps,
    s.capabilities.heartRate,
    s.capabilities.barometricAltitude,
  ].join("|");
}

/* -------------------------------------------------------------------------- */
/* Persistence rate — deliberately NOT the display rate                        */
/* -------------------------------------------------------------------------- */

/**
 * How often the in-progress activity is written to storage, ms.
 *
 * Crash safety must not inherit the display throttle. This runs off the raw
 * sensor stream, so an activity killed by iOS mid-climb loses at most three
 * seconds regardless of how slowly the screen is being repainted — the two
 * cadences are independent on purpose.
 *
 * Three seconds is a compromise the owner can move in one place: shorter costs
 * battery and storage writes on a six-hour day out, longer starts to lose real
 * ground. Backgrounding also forces an immediate write (see the `pagehide` and
 * `visibilitychange` handlers), which is what actually catches the common case.
 */
export const PERSIST_INTERVAL_MS = 3_000;

/* -------------------------------------------------------------------------- */
/* Follow camera                                                               */
/* -------------------------------------------------------------------------- */

export interface FollowCameraConfig {
  /**
   * Exponential smoothing applied to the CAMERA TARGET, 0–1.
   *
   * The camera aims at a smoothed position; the marker, the track and every
   * recorded number stay on the raw fix. Nothing measured is touched by this —
   * it decides where to point a camera, not where the athlete was.
   *
   * It is needed because the step gate below is not enough on its own. A
   * stationary fix is a random walk, so it eventually wanders past ANY fixed
   * threshold, and re-anchoring there lets it ratchet: simulated against a
   * stationary 2.5 m fix the un-smoothed rule still moved the camera a dozen
   * times in five minutes. Smoothing shrinks zero-mean noise by
   * √(α/(2−α)) ≈ 0.38 at this α while costing a moving athlete only a few
   * metres of lag, and that took five minutes of standing still down to one or
   * two moves. Same idea, same reason, as the altitude smoothing in filters.ts.
   */
  targetAlpha: number;

  /**
   * A jump larger than this abandons smoothing and goes straight there, metres.
   *
   * Smoothing a genuine relocation — a fix returning after a tunnel, a lift, or
   * a backgrounded app — would crawl the camera across the gap over a minute.
   * Beyond any plausible noise excursion, the honest reading is "you are
   * somewhere else now". Floor value; the effective threshold scales with the
   * accuracy of the fix, because what counts as implausible depends on how good
   * the fix is. Without that scaling a weak fix snaps on almost every sample and
   * the smoothing silently stops working.
   */
  targetSnapM: number;

  /** Multiple of the reported accuracy at which a jump counts as relocation. */
  targetSnapAccuracyFactor: number;

  /**
   * Floor on the distance the smoothed target must have moved since the last
   * camera command before the camera may move again, metres.
   *
   * THIS is the rule that stops the shaking. A stationary consumer GPS wanders
   * a couple of metres a second, so the head position handed to the map is
   * never twice the same. Chasing it re-issued `easeTo` about once a second
   * while the athlete stood perfectly still. Five metres is above that wander
   * and below anything anyone would call a move.
   *
   * Measured against the position the CAMERA last acted on, not against the
   * previous fix, so a slow walker's small steps accumulate towards a move
   * instead of each being dismissed — the same anchoring trick `GpsFilter` uses
   * for distance.
   */
  minHeadStepM: number;

  /**
   * Multiple of the reported accuracy the step gate grows to on a poor fix.
   *
   * A 12 m fix cannot tell a standing athlete from one who has taken six paces,
   * and a camera that moves anyway is inventing motion out of uncertainty. Two
   * came out of the parameter sweep: at 1.5 a stationary 12 m fix still moved
   * the camera fourteen times in five minutes, at 2 it moved it twice, and
   * pushing further only made a walking athlete's camera sluggish for no gain.
   *
   * `GpsFilter` scales its own noise floor by 0.5 × accuracy for DISTANCE. The
   * camera needs a bigger multiple than distance does because it is judging an
   * already-smoothed position against a held anchor, where the noise has had
   * time to accumulate in one direction, rather than one fix against the last.
   */
  headStepAccuracyFactor: number;

  /**
   * Floor on the gap between two camera commands, ms.
   *
   * A fast descent can produce a qualifying step every fix. Without a floor the
   * camera would take a new order before the previous ease had travelled any
   * distance, which is exactly the restart-mid-flight stutter this module
   * exists to remove.
   */
  minCameraGapMs: number;

  /**
   * How long a camera move takes, ms.
   *
   * Longer than `minCameraGapMs` on purpose: consecutive moves overlap into one
   * continuous glide instead of a series of visible hops. It is not marked
   * `essential`, so a viewer who has asked their phone for reduced motion gets
   * an instant cut instead of an animation — their setting, not ours.
   */
  easeMs: number;

  /**
   * Zoom applied the FIRST time the camera locks onto the athlete.
   *
   * Applied once and never again. The old code passed
   * `zoom: Math.max(map.getZoom(), 15)` on every follow update, so an athlete
   * who pinched out to see the valley was dragged back to z15 within the
   * second — the app fighting the hand on the glass.
   */
  firstFollowZoom: number;

  /**
   * After the user pans, pinches, rotates or tilts, the camera is theirs for
   * this long, ms.
   *
   * Twelve seconds is long enough to read the map ahead and short enough that
   * an accidental brush does not strand the view behind you. The Crosshair
   * control ends it immediately, which is what that button is for.
   */
  userControlGraceMs: number;

  /* ---- Rotation — the most nauseating move a map can make ---------------- */

  /**
   * Whether the map turns to face the direction of travel at all.
   *
   * Off for activities where the GPS heading is meaningless: a climber moving
   * at 0.2 m/s gets a heading derived from noise, and a map that spins while
   * you are belaying is worse than a map that never turns.
   */
  rotateWithHeading: boolean;

  /**
   * Travel required before a reported heading is believed, metres.
   *
   * Heading is only trustworthy once you have gone somewhere. Thirty metres of
   * ground is enough to have a direction; three metres of GPS wander is not.
   */
  bearingStepM: number;

  /** Rotate only for a change of direction at least this large, degrees. */
  bearingDeltaDeg: number;

  /**
   * Floor on the gap between two rotations, ms.
   *
   * Rotation moves every pixel on the screen. It should feel like a deliberate
   * turn onto a new ridge, not like a compass needle settling.
   */
  minBearingGapMs: number;
}

/**
 * Defaults tuned for walking and hiking pace, the same hard case `config.ts`
 * tunes for: slow enough to sit near the GPS noise floor, on a phone held in a
 * hand or buried in a hip pocket.
 */
export const FOLLOW_CAMERA_DEFAULTS: FollowCameraConfig = {
  targetAlpha: 0.25,
  targetSnapM: 25,
  targetSnapAccuracyFactor: 3,

  minHeadStepM: 5,
  headStepAccuracyFactor: 2,
  minCameraGapMs: 900,
  easeMs: 1200,
  firstFollowZoom: 15,
  userControlGraceMs: 12_000,

  rotateWithHeading: true,
  bearingStepM: 30,
  bearingDeltaDeg: 25,
  minBearingGapMs: 8_000,
};

/**
 * Where an activity genuinely wants a different camera.
 *
 * Only overrides with a reason are here; an activity with no entry uses the
 * defaults, which is right for most of the catalogue. Inventing a distinct
 * number per activity would be false precision dressed up as tuning.
 */
const FOLLOW_CAMERA_OVERRIDES: Partial<Record<ActivityTypeId, Partial<FollowCameraConfig>>> = {
  // Standing still is part of climbing — belaying, placing gear, waiting on a
  // rope team. The heading a chipset reports at that speed is derived from
  // drift, so turning the world with it is turning it at random.
  mountaineering: { rotateWithHeading: false, minHeadStepM: 8 },
  "alpine-climbing": { rotateWithHeading: false, minHeadStepM: 8 },
  scrambling: { rotateWithHeading: false, minHeadStepM: 8 },
  "rock-climbing": { rotateWithHeading: false, minHeadStepM: 8 },

  // Fast, committed lines. A five-metre step arrives several times a second at
  // 8 m/s, which would spend the whole descent at the rate limit; and the
  // direction of travel is both real and worth showing, so rotation stays on
  // but needs more ground under it before it fires.
  "road-cycling": { minHeadStepM: 15, bearingStepM: 60 },
  "gravel-cycling": { minHeadStepM: 15, bearingStepM: 60 },
  "mountain-biking": { minHeadStepM: 12, bearingStepM: 50 },
  skiing: { minHeadStepM: 15, bearingStepM: 60 },
  snowboarding: { minHeadStepM: 15, bearingStepM: 60 },
};

/** Resolved follow-camera config for one activity. */
export function followCameraFor(
  activityTypeId: ActivityTypeId | undefined,
  overrides: Partial<FollowCameraConfig> = {},
): FollowCameraConfig {
  return {
    ...FOLLOW_CAMERA_DEFAULTS,
    ...(activityTypeId ? (FOLLOW_CAMERA_OVERRIDES[activityTypeId] ?? {}) : {}),
    ...overrides,
  };
}

/** Smallest signed angle between two compass bearings, degrees (0–180). */
export function bearingDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * How far the smoothed target must travel before the camera follows, metres.
 *
 * Grows with the accuracy of the fix, and that direction is the point: weak
 * evidence should buy less movement, not more. An unknown accuracy is treated
 * as the floor rather than as perfect — a caller that does not report accuracy
 * (a replay of a finished activity, a static place marker) is not claiming a
 * good fix, and inflating the gate for it would make those cameras sluggish for
 * no reason.
 */
export function cameraStepM(accuracyM: number | null | undefined, cfg: FollowCameraConfig): number {
  if (accuracyM === null || accuracyM === undefined || !Number.isFinite(accuracyM)) {
    return cfg.minHeadStepM;
  }
  return Math.max(cfg.minHeadStepM, accuracyM * cfg.headStepAccuracyFactor);
}

/** Displacement beyond which the camera stops smoothing and relocates, metres. */
export function cameraSnapM(accuracyM: number | null | undefined, cfg: FollowCameraConfig): number {
  if (accuracyM === null || accuracyM === undefined || !Number.isFinite(accuracyM)) {
    return cfg.targetSnapM;
  }
  return Math.max(cfg.targetSnapM, accuracyM * cfg.targetSnapAccuracyFactor);
}
