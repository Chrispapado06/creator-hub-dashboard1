/**
 * Scorer settings — admin-tunable rubric weights + capacity params, stored as
 * key/value JSON rows in `scorer_settings`. Defaults mirror the constants in
 * rubric.ts / accounts.ts (and the migration seed), so an un-seeded DB still
 * produces the live model.
 */
import { supabase } from "@/integrations/supabase/client";
import { RUBRIC_WEIGHTS, type RubricWeights } from "./rubric";
import { ACCOUNT_BUFFER, POSTS_PER_NEW_ACCOUNT_PER_DAY, type CapacityParams } from "./accounts";

export const STALE_AFTER_DAYS_DEFAULT = 45;

export type ScorerSettings = {
  rubricWeights: RubricWeights;
  capacity: CapacityParams & { staleAfterDays: number };
};

export const DEFAULT_SETTINGS: ScorerSettings = {
  rubricWeights: { ...RUBRIC_WEIGHTS },
  capacity: {
    shadowbanBuffer: ACCOUNT_BUFFER,
    proxiesPerAccount: 1,
    postsPerAccountPerDay: POSTS_PER_NEW_ACCOUNT_PER_DAY,
    staleAfterDays: STALE_AFTER_DAYS_DEFAULT,
  },
};

const sb = supabase as unknown as { from: (t: string) => any };

/** Load both settings rows, falling back to defaults for anything missing. */
export async function loadScorerSettings(): Promise<ScorerSettings> {
  try {
    const { data } = await sb.from("scorer_settings").select("key, value");
    const map = new Map<string, unknown>((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    const weights = map.get("rubric_weights") as Partial<RubricWeights> | undefined;
    const capacity = map.get("capacity") as Partial<ScorerSettings["capacity"]> | undefined;
    return {
      rubricWeights: { ...DEFAULT_SETTINGS.rubricWeights, ...(weights ?? {}) },
      capacity: { ...DEFAULT_SETTINGS.capacity, ...(capacity ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Persist settings (upsert both rows). */
export async function saveScorerSettings(s: ScorerSettings): Promise<{ error: string | null }> {
  const rows = [
    { key: "rubric_weights", value: s.rubricWeights },
    { key: "capacity", value: s.capacity },
  ];
  const { error } = await sb.from("scorer_settings").upsert(rows, { onConflict: "key" });
  return { error: error?.message ?? null };
}
