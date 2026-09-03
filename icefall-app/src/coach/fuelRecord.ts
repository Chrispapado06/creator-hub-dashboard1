/**
 * The fuel record's one public door.
 *
 * WHY THIS FILE EXISTS. `icefall.fuel.v1` holds the answers the athlete gives on
 * the Fuel screen — sex for the energy equation, everyday movement, and the
 * declines that go with them. Its accessor lived inside `screens/Nutrition.tsx`,
 * which meant nothing outside that screen could write it without importing a
 * component, so the signup flow duplicated the key and the field shape instead.
 *
 * That duplication was a bug with a fuse in it. A rename of the key on this side
 * would have killed the other side SILENTLY: no error, no type failure, a green
 * typecheck, and an estimate that quietly stopped narrowing. Which is precisely
 * the failure it was introduced to work around — the signup question already
 * shipped once collecting a private answer that reached nothing, promising a
 * benefit it did not deliver.
 *
 * So: one exported setter, one owner, and a compile error rather than silence if
 * the shape ever moves.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not read. Onboarding has no reason
 * to know what somebody previously answered on a screen they may never have
 * opened, and a getter here would invite exactly the read-then-write race that
 * `rememberSexForEnergy` refuses below.
 */

import type { Sex } from "@/coach/fuelDay";

/** The storage key. Exported ONLY so a test can clear it — never to be re-typed. */
export const FUEL_RECORD_KEY = "icefall.fuel.v1";

/**
 * The two fields any other surface may set, and nothing else.
 *
 * Narrow on purpose. The food log, the hydration totals and the height/birth-year
 * declines belong to the Fuel screen and to the person sitting in front of it; a
 * signup flow has no business writing them, and a wide `Partial<FuelLocal>` here
 * would let it.
 */
export interface FuelAnswer {
  /** Undefined means "not answering this now", NOT "declined" — see below. */
  sexForEnergy?: Sex;
  /**
   * TRUE only when the athlete actively declined. Never set this to stand in for
   * "we did not ask" — the whole point of keeping them apart is that a future run
   * may re-ask the people who were never asked, and must never re-ask somebody
   * who already said no.
   */
  sexForEnergyDeclined?: boolean;
}

type Stored = Record<string, unknown>;

function read(): Stored {
  try {
    const raw = localStorage.getItem(FUEL_RECORD_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    /* private mode, cleared storage, malformed JSON. An unreadable record is an
       empty one; it must never throw into a signup flow. */
    return {};
  }
}

/**
 * Record an answer from OUTSIDE the Fuel screen — signup, today; anywhere later.
 *
 * IT WILL NOT CLOBBER AN EXISTING ANSWER, and that rule lives here rather than in
 * the caller so it holds for every caller there will ever be. If the athlete has
 * already answered on the Fuel screen, theirs wins: they answered it looking at
 * the number it changes, which is the more considered of the two moments.
 *
 * Returns what happened, so a caller can tell "stored" from "already answered"
 * instead of assuming. A caller that ignores the result is not wrong — but one
 * that reports success on the strength of no exception would be.
 */
export function rememberSexForEnergy(answer: FuelAnswer): "stored" | "already-answered" | "nothing-to-store" {
  const hasAnswer = answer.sexForEnergy !== undefined;
  const hasDecline = answer.sexForEnergyDeclined === true;
  if (!hasAnswer && !hasDecline) return "nothing-to-store";

  const current = read();
  /* Either field counts as answered. Somebody who declined has answered the
     question — "no" is an answer, and re-asking them is the one thing this must
     not cause. */
  if (current.sexForEnergy !== undefined || current.sexForEnergyDeclined === true) {
    return "already-answered";
  }

  const next: Stored = { ...current };
  if (hasAnswer) next.sexForEnergy = answer.sexForEnergy;
  if (hasDecline) next.sexForEnergyDeclined = true;

  try {
    localStorage.setItem(FUEL_RECORD_KEY, JSON.stringify(next));
  } catch {
    /* Full or refused. The answer is lost and the estimate stays wide, which is
       the honest outcome — nothing here may pretend it was kept. */
    return "nothing-to-store";
  }

  /* The Fuel screen subscribes to its own in-module listener set, which this file
     cannot reach without importing the screen. A `storage` event does not fire in
     the tab that wrote, so a Fuel screen already mounted in THIS tab will not see
     this until it remounts. That is acceptable for the only caller there is —
     signup, which navigates away before Fuel is ever opened — and it is written
     down here so the next caller checks rather than assumes. */
  return "stored";
}
