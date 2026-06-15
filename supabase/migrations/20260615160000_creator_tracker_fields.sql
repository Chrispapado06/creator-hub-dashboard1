-- OnlyFinder Experiment Tracker — Stage 5: creator fields for the dashboard.
--
-- The Add-Creator form must capture everything onboarding needs, so adding a
-- creator never requires a code change. `of_username` + `onlyfansapi_acct_id`
-- already exist on creators (the OFAPI ref). This adds the OnlyFinder ref, the
-- daily OnlyFinder budget, and the list of OTHER tracked platforms (the ones
-- Option A subtracts out). All nullable / defaulted — safe on the shared table.

alter table public.creators
  add column if not exists onlyfinder_ref   text,
  add column if not exists daily_budget_usd numeric(12,2),
  add column if not exists other_platforms  text[] not null default '{}';
