/**
 * Scorer settings — admin-tunable rubric weights + scoring guidance + capacity
 * params, stored as key/value JSON rows in `scorer_settings`. Defaults mirror
 * the constants in rubric.ts / accounts.ts (and the migration seed), so an
 * un-seeded DB still produces the live model.
 */
import { supabase } from "@/integrations/supabase/client";
import { RUBRIC_WEIGHTS, DEFAULT_GUIDANCE, type RubricWeights, type ScoringGuidance } from "./rubric";
import { ACCOUNT_BUFFER, POSTS_PER_NEW_ACCOUNT_PER_DAY, type CapacityParams } from "./accounts";

export const STALE_AFTER_DAYS_DEFAULT = 45;

export type ScorerSettings = {
  rubricWeights: RubricWeights;
  guidance: ScoringGuidance;
  capacity: CapacityParams & { staleAfterDays: number };
};

export const DEFAULT_SETTINGS: ScorerSettings = {
  rubricWeights: { ...RUBRIC_WEIGHTS },
  guidance: { ...DEFAULT_GUIDANCE },
  capacity: {
    shadowbanBuffer: ACCOUNT_BUFFER,
    proxiesPerAccount: 1,
    postsPerAccountPerDay: POSTS_PER_NEW_ACCOUNT_PER_DAY,
    staleAfterDays: STALE_AFTER_DAYS_DEFAULT,
  },
};

const sb = supabase as unknown as { from: (t: string) => any };

/** Load all settings rows, falling back to defaults for anything missing. */
export async function loadScorerSettings(): Promise<ScorerSettings> {
  try {
    const { data } = await sb.from("scorer_settings").select("key, value");
    const map = new Map<string, unknown>((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    const weights = map.get("rubric_weights") as Partial<RubricWeights> | undefined;
    const guidance = map.get("guidance") as Partial<ScoringGuidance> | undefined;
    const capacity = map.get("capacity") as Partial<ScorerSettings["capacity"]> | undefined;
    return {
      // Pick only known keys so a stale/old-schema row can't pollute the model.
      rubricWeights: pick(DEFAULT_SETTINGS.rubricWeights, weights),
      guidance: pick(DEFAULT_SETTINGS.guidance, guidance),
      capacity: pick(DEFAULT_SETTINGS.capacity, capacity),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Merge `override` onto `base`, keeping ONLY keys that exist on `base`. */
function pick<T extends Record<string, number>>(base: T, override: Partial<T> | undefined): T {
  if (!override) return { ...base };
  const out = { ...base };
  for (const k of Object.keys(base) as (keyof T)[]) {
    const v = override[k];
    if (typeof v === "number" && !Number.isNaN(v)) out[k] = v as T[keyof T];
  }
  return out;
}

/** Persist settings (upsert the three rows). */
export async function saveScorerSettings(s: ScorerSettings): Promise<{ error: string | null }> {
  const rows = [
    { key: "rubric_weights", value: s.rubricWeights },
    { key: "guidance", value: s.guidance },
    { key: "capacity", value: s.capacity },
  ];
  const { error } = await sb.from("scorer_settings").upsert(rows, { onConflict: "key" });
  return { error: error?.message ?? null };
}
