import type { AthleteProfile } from "./types";

/**
 * Everyone ICEFALL can see, which is nobody.
 *
 * MUST STAY EMPTY until there is a real backend returning real people. Adding a
 * single entry here — even behind a flag, even labelled "demo" — puts an
 * invented climbing partner in front of someone planning a mountain. Somebody
 * could arrange an alpine objective around a person who does not exist, and
 * this feature's own safety copy is about meeting strangers in remote places. A
 * fabricated partner is a hazard, not a placeholder.
 *
 * It lives here rather than inside `People.tsx` because search reads it too,
 * and a rule this important must not exist in two copies that can drift. Every
 * consumer iterates it exactly as it would iterate a populated list, so the
 * wiring is exercised code rather than a branch nobody has ever run — the day a
 * backend exists this becomes a fetch and nothing downstream changes.
 */
export const DISCOVERABLE_ATHLETES: readonly AthleteProfile[] = [];

/**
 * Name and bio only.
 *
 * Deliberately NOT the objective, the readiness or the location. Letting a
 * stranger find someone by typing a mountain name turns a partner directory
 * into "who will be on this peak in March", which is a different and much less
 * comfortable product. You look someone up because you already know who they
 * are; you find people for a mountain through People's own filters, which the
 * athlete opted into.
 */
export function matchesAthlete(athlete: AthleteProfile, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return false;
  return (
    athlete.displayName.toLowerCase().includes(q) ||
    (athlete.bio?.toLowerCase().includes(q) ?? false)
  );
}
