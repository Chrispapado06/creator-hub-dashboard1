import { energyModelFor, metFor } from "./energy";

/**
 * The published MET values this model is expected to reproduce.
 *
 * WHY THIS FILE EXISTS
 *
 * `energy.ts` replaced a fixed MET per activity type with the ACSM equations,
 * and the whole argument for the change is that the equations are a PUBLISHED
 * basis rather than a number somebody liked. That argument is only worth
 * anything if the implementation actually reproduces them — an equation
 * transcribed with a coefficient in the wrong place still looks authoritative
 * and is no better than the constant it replaced.
 *
 * So the reference values live here, in the repository, next to the code they
 * govern. `metEstimate` was never checkable against anything; this is.
 *
 * Tolerance is ±1.2 MET. The compendium's figures are themselves rounded
 * population estimates, so demanding closer agreement would be pretending both
 * sides are more precise than either is.
 */
export interface EnergyCase {
  label: string;
  model: "running" | "walking";
  /** Metres per second. */
  speedMps: number;
  /** Fractional grade — 0.10 is 10%. */
  grade: number;
  /** The compendium figure for this effort. */
  publishedMet: number;
}

const kmh = (k: number): number => k / 3.6;

export const ENERGY_CASES: EnergyCase[] = [
  { label: "run 10 km/h flat", model: "running", speedMps: kmh(10), grade: 0, publishedMet: 10 },
  { label: "run 12 km/h flat", model: "running", speedMps: kmh(12), grade: 0, publishedMet: 11.8 },
  { label: "run 8 km/h flat", model: "running", speedMps: kmh(8), grade: 0, publishedMet: 8.3 },
  {
    label: "run 10 km/h, 10% up",
    model: "running",
    speedMps: kmh(10),
    grade: 0.1,
    publishedMet: 14.8,
  },
  { label: "walk 5 km/h flat", model: "walking", speedMps: kmh(5), grade: 0, publishedMet: 3.5 },
  {
    label: "walk 5 km/h, 15% up",
    model: "walking",
    speedMps: kmh(5),
    grade: 0.15,
    publishedMet: 9.8,
  },
  { label: "walk 4 km/h, 20% up", model: "walking", speedMps: kmh(4), grade: 0.2, publishedMet: 10 },
];

export const ENERGY_TOLERANCE_MET = 1.2;

/** Cases whose computed MET is outside tolerance. Empty is the passing state. */
export function energyMismatches(): { label: string; got: number | null; want: number }[] {
  const out: { label: string; got: number | null; want: number }[] = [];
  for (const c of ENERGY_CASES) {
    const got = metFor(c.model, c.speedMps, c.grade);
    if (got === null || Math.abs(got - c.publishedMet) > ENERGY_TOLERANCE_MET) {
      out.push({ label: c.label, got, want: c.publishedMet });
    }
  }
  return out;
}

/**
 * The guards, checked as behaviour rather than trusted as comments.
 *
 * Each of these is a way a single bad GPS sample could otherwise add hundreds
 * of kilocalories to a real activity, with no way to tell afterwards.
 */
export function energyGuardFailures(): string[] {
  const fails: string[] = [];

  const descent = metFor("running", kmh(10), -0.3);
  if (descent === null || descent <= 0) fails.push("steep descent must not cost nothing or less");

  const absurd = metFor("walking", kmh(5), 3);
  if (absurd === null || absurd > 25) fails.push("a 300% grade must be clamped");

  const spike = metFor("running", 40, 0);
  if (spike === null || spike > 25) fails.push("a 40 m/s GPS spike must be clamped");

  if (metFor("running", 0.05, 0) !== null) fails.push("standing still must be null, never a zero");

  if (energyModelFor("cycling") !== "none") fails.push("cycling must not borrow the ACSM equations");
  if (metFor("none", kmh(30), 0) !== null) fails.push("an unmodelled family must return null");

  return fails;
}
