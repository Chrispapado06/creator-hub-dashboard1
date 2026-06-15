-- OnlyFinder Experiment Tracker — Stage 6: tracked-link cumulative snapshots.
--
-- The OFAPI tracking-links endpoint returns LIFETIME cumulative subscriber/
-- revenue totals, not a daily delta. To get a single day's tracked contribution
-- (Option A's subtraction) the daily-pull diffs today's cumulative against the
-- previous stored cumulative for the same link. These columns hold that
-- cumulative snapshot; tracked_fans / tracked_income_usd remain the per-day delta.
alter table public.daily_tracked_sources
  add column if not exists cumulative_fans       integer,
  add column if not exists cumulative_income_usd numeric(14,2);
