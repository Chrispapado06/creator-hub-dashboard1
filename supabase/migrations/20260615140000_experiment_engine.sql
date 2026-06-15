-- OnlyFinder Experiment Tracker — Stage 3: experiment engine schema (Section 5)
--
-- Reconciles the `experiments` table to the brief's REAL Section 5 model (a
-- status state machine), superseding the designed-from-rules shape from Stage 1
-- (20260615120000). Also lands the Stage-2 deferred columns the engine needs.
--
-- Section 5 status machine: 'running' → 'confounded' (terminal, no verdict)
--                                     → 'concluded'  (terminal, has metrics)
--                                     → 'insufficient_data' (terminal, no metrics)
--   ('insufficient_data' is MY addition — Section 5 named running/confounded/
--    concluded; flag for reconciliation. It exists so a window without enough
--    data never shows a misleading lift.)

-- Idempotent re-declare so this migration also stands alone.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- 1) daily_metrics — OnlyFinder manual spend (+ a missing flag). Needed for the
--    fans-per-dollar-of-spend metric. The daily-pull tolerates absent spend by
--    leaving the value null and setting spend_missing=true (never crashes).
alter table public.daily_metrics
  add column if not exists onlyfinder_spend_usd numeric(12,2),
  add column if not exists spend_missing        boolean not null default true;

-- 2) keyword_changes — the action taken (for the manual log form / audit).
alter table public.keyword_changes
  add column if not exists action text;  -- 'added'|'removed'|'replaced'|'reordered'|…

-- 3) experiments — replace Stage-1 shape with the Section 5 status model.
--    Safe drop: no experiments exist yet (greenfield).
drop table if exists public.experiments cascade;

create table public.experiments (
  id                       uuid primary key default gen_random_uuid(),
  creator_id               uuid not null references public.creators(id) on delete cascade,
  keyword_change_id        uuid not null references public.keyword_changes(id) on delete cascade,
  status                   text not null default 'running',
  -- before / after windows (Section 5: D-7..D-1 and D+1..D+7):
  baseline_start           date not null,
  baseline_end             date not null,
  observation_start        date not null,
  observation_end          date not null,
  -- fans / day (from daily direct_fans):
  baseline_fans_per_day    numeric(12,4),
  observed_fans_per_day    numeric(12,4),
  fans_lift_pct            numeric(10,2),
  -- income / day (from daily direct_income_usd):
  baseline_income_per_day  numeric(14,4),
  observed_income_per_day  numeric(14,4),
  income_lift_pct          numeric(10,2),
  -- fans per dollar of OnlyFinder spend:
  baseline_fans_per_dollar numeric(12,4),
  observed_fans_per_dollar numeric(12,4),
  fans_per_dollar_lift_pct numeric(10,2),
  confounded_reason        text,
  concluded_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (keyword_change_id),                       -- one experiment per change
  constraint experiments_status_domain
    check (status in ('running','confounded','concluded','insufficient_data')),
  constraint experiments_window_order
    check (baseline_start <= baseline_end
       and baseline_end   <  observation_start
       and observation_start <= observation_end),
  -- Hard rule #4: a confounded experiment NEVER carries a verdict/metric.
  constraint experiments_confounded_has_no_metrics
    check (status <> 'confounded' or (
      baseline_fans_per_day    is null and observed_fans_per_day    is null and fans_lift_pct            is null
      and baseline_income_per_day  is null and observed_income_per_day  is null and income_lift_pct          is null
      and baseline_fans_per_dollar is null and observed_fans_per_dollar is null and fans_per_dollar_lift_pct is null
    ))
);
create index experiments_creator_idx on public.experiments (creator_id, observation_end desc);
create index experiments_status_idx  on public.experiments (status);

drop trigger if exists experiments_set_updated_at on public.experiments;
create trigger experiments_set_updated_at
  before update on public.experiments
  for each row execute function public.set_updated_at();

-- Point 1: auto-create a 'running' experiment whenever a keyword_change is
-- inserted, with the Section 5 windows. Done in the DB so EVERY insert path
-- (form, API, backfill) gets an experiment — no app code can forget.
create or replace function public.create_experiment_for_keyword_change()
returns trigger language plpgsql as $$
begin
  insert into public.experiments (
    creator_id, keyword_change_id, status,
    baseline_start, baseline_end, observation_start, observation_end
  ) values (
    new.creator_id, new.id, 'running',
    new.changed_on - 7, new.changed_on - 1,   -- baseline D-7 … D-1
    new.changed_on + 1, new.changed_on + 7    -- observation D+1 … D+7
  )
  on conflict (keyword_change_id) do nothing;
  return new;
end; $$;

drop trigger if exists keyword_changes_create_experiment on public.keyword_changes;
create trigger keyword_changes_create_experiment
  after insert on public.keyword_changes
  for each row execute function public.create_experiment_for_keyword_change();

-- RLS — same "Public full access" posture as the rest.
alter table public.experiments enable row level security;
drop policy if exists "Public full access" on public.experiments;
create policy "Public full access" on public.experiments for all using (true) with check (true);
