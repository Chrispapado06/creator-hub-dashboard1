-- OnlyFinder Experiment Tracker — schema (Phase A, Stage 1)
--
-- ⚠️ DESIGN PROVENANCE: this schema was DESIGNED FROM THE BRIEF'S HARD RULES,
-- not transcribed from its Section 4 (the brief file was unreadable at build
-- time). Reconcile column-by-column against the real Section 4 before relying
-- on it. Every non-obvious choice is commented with the rule that drove it.
--
-- The four hard rules this schema is built to honor:
--   1. EXPERIMENT tracker, NOT attribution. Nothing here links a fan to a
--      keyword. We record keyword *changes* and observe metric *movement* in
--      before/after windows. There is deliberately no fan↔keyword join table.
--   2. No OnlyFinder dashboard scraper. `keyword_rankings.source` defaults to
--      'manual' — ranking positions are entered/imported, never scraped.
--   3. OnlyFans data comes from the OnlyFansAPI REST API (server-side key).
--      `daily_metrics.source` records that provenance; nothing here assumes MCP.
--   4. One keyword change at a time per creator; confounded windows NEVER
--      produce a verdict. Enforced two ways below:
--        (a) CHECK on `experiments`: confounded ⇒ verdict IS NULL.
--        (b) GIST exclusion: two verdict-bearing experiments for the same
--            creator cannot have overlapping windows.
--
-- "Other platforms" handling = OPTION A (tracked, per-platform subtraction):
--   total_new_fans (gross, from OFAPI) − tracked_fans (sum of per-platform
--   tracked rows) = direct_fans (the clean experiment signal). The per-platform
--   rows in `daily_tracked_sources` are the audit trail; a row-level CHECK on
--   `daily_metrics` guarantees the subtraction always reconciles.

-- Needed for the exclusion constraint below (equality on creator_id inside a
-- GIST exclusion). Safe no-op if already present.
create extension if not exists btree_gist;

-- Shared updated_at trigger (already exists in the dashboard project; declared
-- idempotently so this migration also runs on a fresh project).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- NOTE: `public.creators` is intentionally NOT created here — we reuse the
-- dashboard's existing table. All FKs below reference it. If you are running
-- this on a Supabase project that does NOT already have `creators`, create it
-- first (or tell me and I'll add a guarded minimal definition).

-- ─────────────────────────────────────────────────────────────────────────────
-- keyword_changes — the intervention log. One row per keyword change event.
-- This is the ONLY thing that starts an experiment. (Rule 1: we track the
-- change, not which fan it produced.)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.keyword_changes (
  id                uuid primary key default gen_random_uuid(),
  creator_id        uuid not null references public.creators(id) on delete cascade,
  changed_on        date not null,                 -- the intervention date
  previous_keywords text[] not null default '{}',  -- audit: what it was before
  new_keywords      text[] not null default '{}',  -- the keyword set after the change
  note              text,
  created_by        text,                           -- app session username
  created_at        timestamptz not null default now()
);
create index if not exists keyword_changes_creator_date_idx
  on public.keyword_changes (creator_id, changed_on desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- daily_metrics — one row per creator per day, from OnlyFansAPI (Rule 3).
-- Holds gross totals, the tracked sum, and the derived direct (clean) signal.
-- Option A: direct = total − tracked, enforced by CHECK so it can never drift.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_metrics (
  id                  uuid primary key default gen_random_uuid(),
  creator_id          uuid not null references public.creators(id) on delete cascade,
  metric_date         date not null,
  -- Gross, straight from OFAPI:
  total_new_fans      integer not null default 0,
  total_income_usd    numeric(12,2) not null default 0,
  -- Sum of the per-platform tracked rows (denormalized for fast querying;
  -- the rows in daily_tracked_sources are the audit trail behind these):
  tracked_fans        integer not null default 0,
  tracked_income_usd  numeric(12,2) not null default 0,
  -- Derived clean signal = gross − tracked (Option A):
  direct_fans         integer not null default 0,
  direct_income_usd   numeric(12,2) not null default 0,
  source              text not null default 'onlyfansapi',
  created_at          timestamptz not null default now(),
  unique (creator_id, metric_date),
  -- The subtraction must always reconcile — this is the auditability guarantee:
  constraint daily_metrics_direct_fans_reconciles
    check (direct_fans = total_new_fans - tracked_fans),
  constraint daily_metrics_direct_income_reconciles
    check (direct_income_usd = total_income_usd - tracked_income_usd),
  constraint daily_metrics_nonneg
    check (total_new_fans >= 0 and tracked_fans >= 0 and tracked_fans <= total_new_fans)
);
create index if not exists daily_metrics_creator_date_idx
  on public.daily_metrics (creator_id, metric_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- daily_tracked_sources — the per-platform audit trail behind tracked_* above.
-- Option A: "store tracked numbers PER platform (not lumped) so subtractions
-- are auditable." Each row says how many fans/$ a tracked platform contributed
-- that day, with the tracking reference that reported it.
-- (This is a 6th table beyond the brief's named five — it exists ONLY because
-- Option A demands per-platform auditability. Fold into Section 4 as needed.)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_tracked_sources (
  id                 uuid primary key default gen_random_uuid(),
  creator_id         uuid not null references public.creators(id) on delete cascade,
  metric_date        date not null,
  platform           text not null,            -- 'reddit'|'instagram'|'tiktok'|'x'|'shoutout'|'other'
  tracked_fans       integer not null default 0,
  tracked_income_usd numeric(12,2) not null default 0,
  tracking_ref       text,                     -- OFAPI tracking-link id / campaign code that reported it
  created_at         timestamptz not null default now(),
  unique (creator_id, metric_date, platform),
  constraint daily_tracked_sources_nonneg
    check (tracked_fans >= 0 and tracked_income_usd >= 0)
);
create index if not exists daily_tracked_sources_creator_date_idx
  on public.daily_tracked_sources (creator_id, metric_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- keyword_rankings — OnlyFinder ranking position over time, per creator+keyword.
-- Rule 2: NO scraper. source defaults to 'manual' (entered/imported), and a
-- null position means "not seen / unranked" rather than an error.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.keyword_rankings (
  id               uuid primary key default gen_random_uuid(),
  creator_id       uuid not null references public.creators(id) on delete cascade,
  keyword          text not null,
  ranking_position integer,                    -- null = unranked / not observed
  captured_on      date not null,
  source           text not null default 'manual',
  note             text,
  created_at       timestamptz not null default now(),
  unique (creator_id, keyword, captured_on),
  constraint keyword_rankings_position_positive
    check (ranking_position is null or ranking_position > 0)
);
create index if not exists keyword_rankings_creator_kw_date_idx
  on public.keyword_rankings (creator_id, keyword, captured_on desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- experiments — one per keyword_change. Holds the before/after windows, the
-- computed movement, the confounded flag, and the verdict.
-- Rule 4 lives here: a confounded experiment can NEVER carry a verdict, and two
-- verdict-bearing experiments for one creator can never overlap in time.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.experiments (
  id                          uuid primary key default gen_random_uuid(),
  creator_id                  uuid not null references public.creators(id) on delete cascade,
  keyword_change_id           uuid not null references public.keyword_changes(id) on delete cascade,
  -- Before / after observation windows (inclusive dates):
  baseline_start              date not null,
  baseline_end                date not null,
  observation_start           date not null,
  observation_end             date not null,
  -- Computed averages of the CLEAN signal (daily_metrics.direct_*):
  baseline_avg_direct_fans    numeric(12,2),
  observation_avg_direct_fans numeric(12,2),
  baseline_avg_direct_income  numeric(12,2),
  observation_avg_direct_income numeric(12,2),
  delta_fans_pct              numeric(8,2),
  delta_income_pct            numeric(8,2),
  -- Rule 4 machinery:
  confounded                  boolean not null default false,
  confounded_reason           text,
  verdict                     text,             -- 'positive'|'negative'|'inconclusive'|null
  status                      text not null default 'pending', -- 'pending'|'observing'|'complete'
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- Generated window used by the exclusion constraint below:
  window_range                daterange generated always as
                                (daterange(baseline_start, observation_end, '[]')) stored,
  constraint experiments_window_order
    check (baseline_start <= baseline_end
       and baseline_end   <  observation_start
       and observation_start <= observation_end),
  constraint experiments_verdict_domain
    check (verdict is null or verdict in ('positive','negative','inconclusive')),
  constraint experiments_status_domain
    check (status in ('pending','observing','complete')),
  -- Rule 4(a): confounded ⇒ NO verdict, ever.
  constraint experiments_confounded_has_no_verdict
    check (confounded = false or verdict is null),
  -- Rule 4(b): two VERDICT-BEARING experiments for the same creator may not
  -- overlap. Confounded / verdict-less rows are exempt (we still record them).
  constraint experiments_no_overlapping_verdicts
    exclude using gist (
      creator_id   with =,
      window_range with &&
    ) where (confounded = false and verdict is not null)
);
create index if not exists experiments_creator_idx
  on public.experiments (creator_id, observation_end desc);
create index if not exists experiments_change_idx
  on public.experiments (keyword_change_id);

drop trigger if exists experiments_set_updated_at on public.experiments;
create trigger experiments_set_updated_at
  before update on public.experiments
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — match the dashboard's "Public full access" posture. Server actions use
-- the service-role key (bypasses RLS); these permissive policies let the anon
-- browser client read. NOTE: same trust model as the rest of the app — not a
-- hardened boundary. Tighten when app-wide auth lands.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'keyword_changes','daily_metrics','daily_tracked_sources',
    'keyword_rankings','experiments'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "Public full access" on public.%I;', t);
    execute format(
      'create policy "Public full access" on public.%I for all using (true) with check (true);', t);
  end loop;
end $$;
