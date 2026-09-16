/**
 * Turns the stored `icefall.state.v1` text into the state the app starts with.
 *
 * This is the parsing half of `load()` in `AppState.tsx`, moved here so it can
 * be tested without React or a browser (structure plan §3.2). `load()` keeps the
 * storage read and nothing else.
 *
 * IT SEEDS NO GROUPS, IN ANY BUILD. Demo groups used to be written into saved
 * state here, which put invented records beside real ones and brought them back
 * whenever the list was empty. They are gone, and `dropSeededDemoGroups` removes
 * the four records from installs that already hold them, on every load. Demo
 * content for groups belongs behind the group read seams, never in saved state
 * (plan §3.3).
 */
import { MOUNTAINS } from "@/data/mock/mountains";
import { dropSeededDemoGroups } from "@/groups/local/stateCleanup";
import type { Persisted, SavedObjective } from "@/state/AppState";

export const EMPTY_PERSISTED: Persisted = {
  onboarded: false,
  customGoals: [],
  sessionOverrides: {},
  kudos: [],
};

/** Today, as an ISO date. Stamped once, the first time the app runs. */
const todayIso = () => new Date().toISOString();

/** First run starts from the curated objectives rather than an empty screen. */
export function seedObjectives(): SavedObjective[] {
  return MOUNTAINS.map((m) => ({
    id: `curated:${m.id}`,
    name: m.name,
    elevationM: m.elevationM,
    lat: m.coords.lat,
    lon: m.coords.lon,
    curatedId: m.id,
    photo: m.photo,
    addedAt: new Date(0).toISOString(),
  }));
}

/**
 * `raw` is the stored text, or null when nothing is stored. `now` stamps
 * `memberSince` on a first run or on a record that predates the field.
 *
 * Text that is not a JSON object gives the empty state, as a failed parse
 * always has.
 */
export function normalisePersisted(raw: string | null, now: () => string = todayIso): Persisted {
  if (!raw)
    return {
      ...EMPTY_PERSISTED,
      memberSince: now(),
      objectives: seedObjectives(),
    };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_PERSISTED;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return EMPTY_PERSISTED;
  const stored = parsed as Partial<Persisted>;

  return dropSeededDemoGroups({
    ...EMPTY_PERSISTED,
    ...stored,
    // Existing installs predate the objectives list — seed it once.
    objectives: stored.objectives ?? seedObjectives(),
    // Installs that predate this field get stamped now rather than inheriting
    // the fixture's rolling date. Once written it never moves again.
    memberSince: stored.memberSince ?? now(),
  });
}
