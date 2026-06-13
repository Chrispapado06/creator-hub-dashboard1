-- Reddit Viability Scorer — rubric v2.
--
-- The verdict is now CALCULATED from five criteria (niche_demand,
-- competitor_benchmark, content_supply, verification_willingness,
-- conversion_history) instead of subjective "rate her" sliders. This replaces
-- the old rubric_weights seed (which used nicheFit/visualAppeal/etc.) and adds
-- a `guidance` row holding the thresholds the two manual criteria are scored
-- against. Idempotent — safe to run more than once.

-- Replace the rubric weights with the five-criterion model (sums to 100).
INSERT INTO public.scorer_settings (key, value) VALUES
  ('rubric_weights', '{
    "niche_demand": 30,
    "competitor_benchmark": 25,
    "content_supply": 15,
    "verification_willingness": 15,
    "conversion_history": 15
  }')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Scoring guidance — the thresholds derivations + manual entries score against.
INSERT INTO public.scorer_settings (key, value) VALUES
  ('guidance', '{
    "targetMatches": 8,
    "targetCombinedMembers": 10000000,
    "targetPiecesPerWeek": 7,
    "studioPenalty": 0.6,
    "benchmarkTargetUpvotes": 300,
    "conversionTargetPct": 10
  }')
ON CONFLICT (key) DO NOTHING;
