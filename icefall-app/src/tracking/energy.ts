/**
 * Energy cost from pace and gradient.
 *
 * WHAT THIS REPLACED, AND WHY THE OWNER WAS RIGHT
 *
 * The estimate was `metEstimate * bodyMassKg * hours` with ONE fixed MET per
 * activity type — 10 for an outdoor run, whatever the run was. A flat jog and a
 * hill sprint of the same duration returned the same figure, so the number did
 * not move with effort. The owner reported it simply as *"when running calories
 * were inaccurate"*, which is exactly what a constant looks like from outside.
 *
 * THE EQUATIONS, AND WHERE THEY COME FROM
 *
 * The ACSM metabolic equations, which are the standard published basis for
 * estimating oxygen cost from speed and grade:
 *
 *   running   VO2 = 0.2 × S + 0.9 × S × G + 3.5
 *   walking   VO2 = 0.1 × S + 1.8 × S × G + 3.5
 *
 * `S` is speed in metres per minute, `G` is fractional grade (0.08 for 8%), and
 * `VO2` is ml·kg⁻¹·min⁻¹. One MET is 3.5 ml·kg⁻¹·min⁻¹ by definition, so
 * `MET = VO2 / 3.5`.
 *
 * These are estimates of a population, not a measurement of a person. They are
 * a large improvement on a constant and they are still not a calorimeter, which
 * is why every surface that shows the result calls it an estimate and names
 * what it was computed against.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not use heart rate. There is no paired heart-rate stream and no
 * measured threshold, and a figure derived from an unmeasured heart would be
 * the same fabrication in a new place.
 *
 * BOUNDS, AND WHY THEY EXIST RATHER THAN BEING TIDIED AWAY
 *
 * GPS produces nonsense occasionally — a 40 m/s "sprint" from a jumped fix, a
 * -60% grade from a barometric spike. Unbounded, a single bad sample can add
 * hundreds of kcal to a real activity in one tick and there is no way to tell
 * afterwards. The clamps below are the difference between an estimate that
 * degrades and one that lies.
 */

/** Millilitres of oxygen per kg per minute in one MET, by definition. */
const ML_PER_MET = 3.5;

/**
 * Grade is clamped to ±40%.
 *
 * The walking equation's gradient term is heavily weighted (1.8), so an
 * altitude spike producing a bogus 300% grade would return a MET in the
 * hundreds. Real mountain running does not sustain much beyond 40%, and beyond
 * it the equations are outside their validated range anyway.
 */
const MAX_GRADE = 0.4;

/**
 * MET is clamped to 25.
 *
 * Roughly the ceiling of sustained human output — elite runners at racing pace
 * sit near 20. Anything above this is a bad fix, not an athlete.
 */
const MAX_MET = 25;

/** Below this there is no meaningful forward motion to cost. */
const MIN_SPEED_M_PER_MIN = 10;

/** Which equation applies, or none. */
export type EnergyModel = "running" | "walking" | "none";

/**
 * The model for an activity family.
 *
 * Anything not ambulatory — cycling, ski touring, climbing, gym work — keeps
 * its fixed MET. The ACSM running and walking equations describe running and
 * walking, and applying them to a bike would be borrowing the authority of a
 * published equation for a number it was never fitted to.
 */
export function energyModelFor(family: string): EnergyModel {
  if (family === "running") return "running";
  if (family === "hiking" || family === "walking") return "walking";
  return "none";
}

/**
 * Instantaneous MET from speed and grade.
 *
 * `speedMps` in metres per second, `grade` as a fraction (0.08 = 8%), null
 * where no gradient could be derived — in which case the flat term is used
 * alone rather than a guess being substituted for it.
 *
 * Returns null when the model does not apply or there is no real movement, so
 * the caller can fall back rather than accumulate a zero. A zero and "not
 * applicable" are not the same figure.
 */
export function metFor(model: EnergyModel, speedMps: number, grade: number | null): number | null {
  if (model === "none") return null;
  if (!Number.isFinite(speedMps) || speedMps <= 0) return null;

  const s = speedMps * 60; // m/min, the unit the equations take
  if (s < MIN_SPEED_M_PER_MIN) return null;

  const g = grade === null || !Number.isFinite(grade) ? 0 : clamp(grade, -MAX_GRADE, MAX_GRADE);

  // Descending costs less than flat but never nothing, and the linear term
  // alone can go negative on a steep enough descent. Floored at the flat cost
  // of the same speed: walking downhill is not free, and a negative MET would
  // subtract from the total.
  const vo2 =
    model === "running" ? 0.2 * s + 0.9 * s * g + ML_PER_MET : 0.1 * s + 1.8 * s * g + ML_PER_MET;

  const flat = (model === "running" ? 0.2 * s : 0.1 * s) + ML_PER_MET;
  const met = Math.max(vo2, flat * 0.5) / ML_PER_MET;

  return Math.min(met, MAX_MET);
}

/**
 * Kilocalories burned over `seconds` at `met` for a body of `massKg`.
 *
 * 1 MET is 1 kcal per kg per hour, which is what makes the arithmetic this
 * short.
 */
export function kcalFor(met: number, massKg: number, seconds: number): number {
  return (met * massKg * seconds) / 3600;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
