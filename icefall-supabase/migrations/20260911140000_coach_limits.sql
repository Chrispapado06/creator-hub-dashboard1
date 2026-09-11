-- The Coach's limits, moved to where they cannot be edited by the person they
-- apply to: entitlement, the usage ledger, the burst window, and the one
-- function the Edge Function calls to reserve a model call.
--
-- ============================================================================
-- DRAFT. NOT PUSHED. NOT APPLIED.
-- ============================================================================
--
-- Written 11 September 2026 alongside `supabase/functions/coach/`. The same
-- warning 20260903060000 and 20260911120000 carry applies here: `supabase db
-- push` applies EVERY pending file, not this one. There is no per-file push.
-- Check what else is waiting first.
--
-- ============================================================================
-- WHY THIS FILE EXISTS
-- ============================================================================
--
-- `icefall-app/src/coach/budget.ts` has said so since the day it was written,
-- in its own header: everything in it "runs in the browser, so it is a DISPLAY
-- and a client-side courtesy stop — not a limit. Anyone can edit localStorage
-- or call the endpoint directly. The real cap MUST live in the server-side
-- proxy that holds the API key, keyed to the account."
--
-- The proxy arrived (`functions/coach/index.ts`, 11 September) and did not pick
-- the cap up. Measured, not assumed: the proxy clamps the SIZE of one call —
-- question 2,000 chars, system 12,000, history 8 turns, reply 900 tokens — and
-- counts nothing across calls. Two consequences, both live until this file is
-- applied:
--
--   1. A modified client, or a plain `curl` with any signed-in account's token,
--      can call the endpoint in a loop. Nothing server-side counts, so the only
--      ceiling is Anthropic's own.
--   2. The three numbers the app shows an athlete — 3 conversations a month,
--      8 credits a day, a $1/month backstop — live in one localStorage key
--      (`icefall.state.v1`). Clearing site data resets all three.
--
-- ============================================================================
-- WHAT IS AND IS NOT A LIMIT HERE
-- ============================================================================
--
-- THREE DIFFERENT THINGS, and the app's own vocabulary blurs them:
--
--   monthly_calls          A PAYWALL. Three a month on the free plan, matching
--                          FREE_COACH_INTERACTIONS_PER_MONTH in
--                          `src/growth/tiers.ts`. Commercial, not protective.
--   daily_calls            An ABUSE stop. Eight a day, matching DAILY_CREDITS
--                          in `src/coach/budget.ts`. A runaway loop is what it
--                          is for; a real conversation never reaches it.
--   monthly_spend_micros   The MONEY backstop underneath both, matching
--                          HARD_CAP_MICROS ($1.00/month). Never shown to an
--                          athlete — see `coach_allowance()` below, which
--                          deliberately returns no figure.
--
-- The numbers are SEEDED here rather than hard-coded in the Edge Function so
-- that raising a cap for one launch is an UPDATE, not a redeploy. They are
-- seeded with `on conflict do nothing`, so re-running this file never undoes a
-- number the owner has since tuned.
--
-- ============================================================================
-- WHAT THIS FILE DOES NOT SOLVE, SAID PLAINLY
-- ============================================================================
--
-- ACCOUNTS ARE FREE TO MINT. Every limit here is per user_id, so somebody
-- willing to create accounts gets a fresh allowance with each one. Email
-- confirmation is ON (config.toml, 7 September), which raises the cost of that
-- from nothing to one working mailbox — it does not remove it. The defence
-- against a determined attacker is the money backstop plus Anthropic's own
-- account limits, not this table.
--
-- THE SERVER'S DAY IS UTC. The app's day is the athlete's own local day
-- (`currentDay` in budget.ts, deliberately local). The database has no
-- timezone for anybody, and taking one from the request would be an escalation
-- route — declare a new offset, get a new day. So the two clocks can disagree
-- by up to ~14 hours at the boundary, and an athlete far enough east or west
-- may see the app's credit counter reset before or after the server's does.
-- This is a known, bounded discrepancy, not a bug to be "fixed" by trusting a
-- client-supplied offset.

/* -------------------------------------------------------------------------- */
/* The numbers                                                                */
/* -------------------------------------------------------------------------- */

create table if not exists public.coach_tier_limits (
  tier text primary key check (tier in ('free', 'pro')),
  -- NULL means unlimited, and only for this one column: the paid plan sells
  -- "Coach — unlimited" (tiers.ts) and must not be silently metered by month.
  -- The daily and money ceilings below still apply to it, because those are
  -- abuse stops rather than product promises.
  monthly_calls int check (monthly_calls is null or monthly_calls >= 0),
  daily_calls int not null check (daily_calls >= 0),
  -- How many calls a day may be routed to the stronger model. Zero means the
  -- tier never escalates: a request declaring a plan build is answered by the
  -- cheap model instead of being refused, because the athlete asked a real
  -- question and should get a real answer.
  daily_strong_calls int not null default 0 check (daily_strong_calls >= 0),
  monthly_spend_micros bigint not null check (monthly_spend_micros >= 0),
  -- The burst window. Not a cost control — the daily cap is — but the thing
  -- that stops one loop reaching the daily cap in four seconds.
  rate_window_seconds int not null default 60 check (rate_window_seconds > 0),
  rate_calls int not null default 6 check (rate_calls > 0),
  updated_at timestamptz not null default now()
);

comment on table public.coach_tier_limits is
  'What each plan may spend on the Coach. Read by coach_consume() on every model call. Tunable by the owner with an UPDATE — no redeploy — which is why the numbers live here and not in the Edge Function.';

comment on column public.coach_tier_limits.monthly_calls is
  'NULL = unlimited. Mirrors FREE_COACH_INTERACTIONS_PER_MONTH (3) for free; NULL for pro, which is sold as unlimited.';

comment on column public.coach_tier_limits.monthly_spend_micros is
  'Integer micro-dollars, 1_000_000 = $1.00. Mirrors HARD_CAP_MICROS. Never shown to an athlete: what ICEFALL pays per token is a cost of goods.';

alter table public.coach_tier_limits enable row level security;
alter table public.coach_tier_limits force row level security;
revoke all on public.coach_tier_limits from anon, authenticated;
-- NO POLICIES. Nothing a browser holds needs to read this table; the app is
-- told what is LEFT by coach_allowance(), which returns counts and no money.

insert into public.coach_tier_limits
  (tier, monthly_calls, daily_calls, daily_strong_calls, monthly_spend_micros, rate_window_seconds, rate_calls)
values
  -- Free: the app's own three-a-month, with the daily and money ceilings under
  -- it so a bypassed paywall is still bounded.
  ('free', 3, 8, 0, 1000000, 60, 6),
  -- Pro: unlimited by month, because that is what the plan says. Eight a day
  -- matches what the app already shows every athlete, so the screen and the
  -- server agree; the plan-build allowance is what the money actually buys.
  ('pro', null, 8, 3, 1000000, 60, 6)
on conflict (tier) do nothing;

/* -------------------------------------------------------------------------- */
/* Who gets which                                                             */
/* -------------------------------------------------------------------------- */

create table if not exists public.coach_entitlements (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- 'free' for everybody today, and that is the truth rather than a
  -- placeholder: ICEFALL has no payment processor, nothing is charged, and a
  -- paid plan is something that has to have HAPPENED before it is recorded.
  -- The day a processor lands, it writes this column with the service role.
  tier text not null default 'free' references public.coach_tier_limits (tier),
  -- The 14-day trial, which the app has always run purely in localStorage.
  -- Recorded once and never extended — see coach_start_trial().
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  -- Why this row says what it says, for whoever reads it in six months.
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.coach_entitlements is
  'One row per athlete who has ever asked the Coach a question; created on demand by coach_consume(). Nobody may write their own tier — there is no policy and no grant, and the only authenticated-callable writer is coach_start_trial(), which can start a trial once and can never extend one.';

alter table public.coach_entitlements enable row level security;
alter table public.coach_entitlements force row level security;
revoke all on public.coach_entitlements from anon, authenticated;
-- NO POLICIES, DELIBERATELY. A self-serviceable tier column is not an
-- entitlement, it is a suggestion. Same stance as `profiles.role`.

/* -------------------------------------------------------------------------- */
/* The ledger                                                                 */
/* -------------------------------------------------------------------------- */

create table if not exists public.coach_usage_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- UTC. See the header for why the server cannot use the athlete's own day.
  usage_day date not null,
  calls int not null default 0,
  strong_calls int not null default 0,
  -- Integer micro-dollars, settled AFTER the model answers, from the usage the
  -- API reported. Never an estimate: an estimate that lands in the ledger is a
  -- bill nobody was sent.
  spend_micros bigint not null default 0,
  last_call_at timestamptz not null default now(),
  primary key (user_id, usage_day)
);

comment on table public.coach_usage_days is
  'One row per athlete per UTC day: how many model calls, how many of them on the stronger model, and what they cost. The month figures are a sum over this table — there is no second monthly table to fall out of step with it.';

alter table public.coach_usage_days enable row level security;
alter table public.coach_usage_days force row level security;
revoke all on public.coach_usage_days from anon, authenticated;

-- For the sweep below, which scans by day across all users.
create index if not exists coach_usage_days_day_idx
  on public.coach_usage_days (usage_day);

create table if not exists public.coach_rate (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  window_calls int not null default 0,
  last_call_at timestamptz not null default now()
);

comment on table public.coach_rate is
  'The burst window, one row per athlete. Separate from coach_usage_days because a window that reset at UTC midnight would hand out one free burst a night, and because this row is written on every single call while the ledger is not.';

alter table public.coach_rate enable row level security;
alter table public.coach_rate force row level security;
revoke all on public.coach_rate from anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Reserving a call                                                           */
/* -------------------------------------------------------------------------- */

-- THE ONE FUNCTION THAT DECIDES. The Edge Function calls it before it calls
-- Anthropic, holding the service role.
--
-- IT RESERVES RATHER THAN ASKS. The call is counted here, inside the same
-- statement that checked the limits, so two requests arriving together cannot
-- both be told there is one call left. A reservation that never produces an
-- answer — the model timed out, the function crashed — still spends a call.
-- That is the deliberate direction to fail: the alternative is a loop that
-- costs nothing because it never waits for a reply.
--
-- MONEY IS CHECKED, NOT RESERVED. `p_estimate_micros` is what the caller
-- believes this exchange will cost at the model it is about to use; it is
-- added to the month's settled spend for the comparison and then discarded.
-- The real figure is written afterwards by coach_settle(). So the cap is
-- crossed at most by the difference between one pessimistic estimate and one
-- real cost, and never by a whole call.
--
-- THE STRONGER MODEL IS GRANTED, NOT DEMANDED. `p_strong` is a request. If the
-- tier does not allow it, or today's allowance is gone, this returns
-- strong_granted = false and the call still goes ahead on the cheap model.
-- Refusing outright would turn "we would rather not spend that today" into an
-- error on a screen, which is not what the athlete asked about.
create or replace function public.coach_consume(
  p_user uuid,
  p_strong boolean default false,
  p_estimate_micros bigint default 0
)
returns table (
  allowed boolean,
  reason text,
  tier text,
  strong_granted boolean,
  retry_after_seconds int,
  calls_today int,
  calls_this_month int,
  strong_today int,
  spend_this_month bigint,
  limit_daily_calls int,
  limit_monthly_calls int,
  limit_monthly_spend_micros bigint
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tier         text;
  v_lim          public.coach_tier_limits%rowtype;
  v_day          date := (now() at time zone 'utc')::date;
  v_month_start  date := date_trunc('month', (now() at time zone 'utc')::date)::date;
  v_calls_today  int := 0;
  v_strong_today int := 0;
  v_calls_month  int := 0;
  v_spend_month  bigint := 0;
  v_window_start timestamptz;
  v_window_calls int;
  v_strong       boolean := false;
  v_estimate     bigint := greatest(coalesce(p_estimate_micros, 0), 0);
  v_retry        int := 0;
begin
  if p_user is null then
    return query select false, 'no_user'::text, 'free'::text, false,
                        0, 0, 0, 0, 0::bigint, 0, null::int, 0::bigint;
    return;
  end if;

  /* The entitlement row is created on first use rather than by a trigger on
     sign-up: most accounts never ask the Coach anything, and a table with a row
     per account is a table that has to be backfilled. The no-op UPDATE is there
     to take the row lock, not to change anything. */
  insert into public.coach_entitlements as e (user_id)
  values (p_user)
  on conflict (user_id) do update set updated_at = e.updated_at
  returning
    case
      when e.tier = 'pro' then 'pro'
      when e.trial_ends_at is not null and e.trial_ends_at > now() then 'pro'
      else 'free'
    end
  into v_tier;

  select l.* into v_lim from public.coach_tier_limits l where l.tier = v_tier;
  if not found then
    /* A tier with no limits row is a half-applied migration. Refuse rather than
       run uncapped — the whole point of this file is that "no limit found"
       must never mean "no limit". */
    return query select false, 'not_configured'::text, v_tier, false,
                        0, 0, 0, 0, 0::bigint, 0, null::int, 0::bigint;
    return;
  end if;

  select coalesce(sum(d.calls), 0)::int,
         coalesce(sum(d.spend_micros), 0)::bigint
    into v_calls_month, v_spend_month
    from public.coach_usage_days d
   where d.user_id = p_user
     and d.usage_day >= v_month_start;

  select d.calls, d.strong_calls
    into v_calls_today, v_strong_today
    from public.coach_usage_days d
   where d.user_id = p_user and d.usage_day = v_day;
  if not found then
    v_calls_today := 0;
    v_strong_today := 0;
  end if;

  /* Same no-op-update trick: this locks the burst row for the rest of the
     statement, so two simultaneous requests cannot both read window_calls = 5
     and both decide there is room. */
  insert into public.coach_rate as r (user_id)
  values (p_user)
  on conflict (user_id) do update set last_call_at = r.last_call_at
  returning r.window_started_at, r.window_calls
  into v_window_start, v_window_calls;

  if v_window_start < now() - make_interval(secs => v_lim.rate_window_seconds) then
    v_window_start := now();
    v_window_calls := 0;
  end if;

  /* Order of refusals, most abusive first. Every branch returns the same
     counters, so the caller can report what is left whichever wall was hit. */
  if v_window_calls >= v_lim.rate_calls then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (
        v_window_start + make_interval(secs => v_lim.rate_window_seconds) - now()
      )))::int
    );
    return query select false, 'rate_limited'::text, v_tier, false, v_retry,
                        v_calls_today, v_calls_month, v_strong_today, v_spend_month,
                        v_lim.daily_calls, v_lim.monthly_calls, v_lim.monthly_spend_micros;
    return;
  end if;

  if v_lim.monthly_calls is not null and v_calls_month >= v_lim.monthly_calls then
    return query select false, 'monthly_calls'::text, v_tier, false, 0,
                        v_calls_today, v_calls_month, v_strong_today, v_spend_month,
                        v_lim.daily_calls, v_lim.monthly_calls, v_lim.monthly_spend_micros;
    return;
  end if;

  if v_calls_today >= v_lim.daily_calls then
    return query select false, 'daily_calls'::text, v_tier, false, 0,
                        v_calls_today, v_calls_month, v_strong_today, v_spend_month,
                        v_lim.daily_calls, v_lim.monthly_calls, v_lim.monthly_spend_micros;
    return;
  end if;

  if v_spend_month + v_estimate > v_lim.monthly_spend_micros then
    return query select false, 'monthly_spend'::text, v_tier, false, 0,
                        v_calls_today, v_calls_month, v_strong_today, v_spend_month,
                        v_lim.daily_calls, v_lim.monthly_calls, v_lim.monthly_spend_micros;
    return;
  end if;

  v_strong := coalesce(p_strong, false)
              and v_lim.daily_strong_calls > 0
              and v_strong_today < v_lim.daily_strong_calls;

  insert into public.coach_usage_days as d (user_id, usage_day, calls, strong_calls, last_call_at)
  values (p_user, v_day, 1, case when v_strong then 1 else 0 end, now())
  on conflict (user_id, usage_day) do update
    set calls = d.calls + 1,
        strong_calls = d.strong_calls + case when v_strong then 1 else 0 end,
        last_call_at = now()
  returning d.calls, d.strong_calls
  into v_calls_today, v_strong_today;

  update public.coach_rate r
     set window_started_at = v_window_start,
         window_calls = v_window_calls + 1,
         last_call_at = now()
   where r.user_id = p_user;

  v_calls_month := v_calls_month + 1;

  return query select true, ''::text, v_tier, v_strong, 0,
                      v_calls_today, v_calls_month, v_strong_today, v_spend_month,
                      v_lim.daily_calls, v_lim.monthly_calls, v_lim.monthly_spend_micros;
end;
$fn$;

revoke all on function public.coach_consume(uuid, boolean, bigint) from public, anon, authenticated;
grant execute on function public.coach_consume(uuid, boolean, bigint) to service_role;

comment on function public.coach_consume(uuid, boolean, bigint) is
  'Reserve one Coach model call for one athlete, or refuse it. Counts the call inside the same statement that checked the limits, so concurrent requests cannot both be allowed. Returns strong_granted = false rather than refusing when the stronger model is out of reach — the cheap model still answers.';

/* -------------------------------------------------------------------------- */
/* Settling what it actually cost                                             */
/* -------------------------------------------------------------------------- */

-- Called after the model answers, with the real cost worked out from the usage
-- the API reported.
--
-- IF THIS NEVER RUNS — the function crashed between the answer and this call —
-- the call is still counted, so the daily and monthly call caps still bound the
-- day. What is lost is the money figure for that one exchange. That is the
-- right way round: an uncounted call would be free to repeat.
create or replace function public.coach_settle(p_user uuid, p_spend_micros bigint)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  insert into public.coach_usage_days as d (user_id, usage_day, calls, spend_micros, last_call_at)
  values (p_user, (now() at time zone 'utc')::date, 0, greatest(coalesce(p_spend_micros, 0), 0), now())
  on conflict (user_id, usage_day) do update
    set spend_micros = d.spend_micros + greatest(coalesce(p_spend_micros, 0), 0),
        last_call_at = now();
$$;

revoke all on function public.coach_settle(uuid, bigint) from public, anon, authenticated;
grant execute on function public.coach_settle(uuid, bigint) to service_role;

comment on function public.coach_settle(uuid, bigint) is
  'Bank what one Coach exchange actually cost, in integer micro-dollars. Adds to today''s row, and creates it when a call started before UTC midnight and finished after — that row carries the cost with calls = 0, which is correct rather than tidy.';

/* -------------------------------------------------------------------------- */
/* What the app may ask                                                       */
/* -------------------------------------------------------------------------- */

-- The honest version of the counters the app currently keeps in localStorage.
--
-- NO MONEY FIGURE, DELIBERATELY. budget.ts says why, and it is right: what
-- ICEFALL pays per token is commercial information, and showing it invites an
-- athlete to price their own questions — exactly the wrong thing to be
-- thinking about while asking a coach whether to rest. `spend_capped` is the
-- only thing that leaves: whether the backstop has been reached.
create or replace function public.coach_allowance()
returns table (
  tier text,
  calls_today int,
  calls_this_month int,
  daily_calls int,
  monthly_calls int,
  spend_capped boolean,
  trial_ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid          uuid := (select auth.uid());
  v_tier         text := 'free';
  v_trial_ends   timestamptz;
  v_lim          public.coach_tier_limits%rowtype;
  v_day          date := (now() at time zone 'utc')::date;
  v_month_start  date := date_trunc('month', (now() at time zone 'utc')::date)::date;
  v_calls_today  int := 0;
  v_calls_month  int := 0;
  v_spend_month  bigint := 0;
begin
  if v_uid is null then
    return;
  end if;

  select
    case
      when e.tier = 'pro' then 'pro'
      when e.trial_ends_at is not null and e.trial_ends_at > now() then 'pro'
      else 'free'
    end,
    e.trial_ends_at
  into v_tier, v_trial_ends
  from public.coach_entitlements e
  where e.user_id = v_uid;

  if not found then
    v_tier := 'free';
  end if;

  select l.* into v_lim from public.coach_tier_limits l where l.tier = v_tier;
  if not found then
    return;
  end if;

  select coalesce(sum(d.calls), 0)::int,
         coalesce(sum(d.spend_micros), 0)::bigint
    into v_calls_month, v_spend_month
    from public.coach_usage_days d
   where d.user_id = v_uid and d.usage_day >= v_month_start;

  select coalesce(d.calls, 0) into v_calls_today
    from public.coach_usage_days d
   where d.user_id = v_uid and d.usage_day = v_day;
  if not found then
    v_calls_today := 0;
  end if;

  return query select v_tier, v_calls_today, v_calls_month,
                      v_lim.daily_calls, v_lim.monthly_calls,
                      v_spend_month >= v_lim.monthly_spend_micros,
                      v_trial_ends;
end;
$fn$;

revoke all on function public.coach_allowance() from public, anon;
grant execute on function public.coach_allowance() to authenticated;

comment on function public.coach_allowance() is
  'What the caller has left on the Coach today and this month, by the SERVER''s count. Returns no money figure — only whether the backstop is reached. An empty result means the caller has never asked the Coach anything, which reads as a full allowance.';

-- Starting the trial, once, ever.
--
-- The app has run its 14-day trial entirely in localStorage since tiers
-- existed: `startTrial()` in AppState writes a date and nothing else knows.
-- That is fine while nothing is enforced and useless the moment something is —
-- the server would meter a trialing athlete at the free plan's three a month
-- while the app showed them "unlimited". This is the server's half.
--
-- FOURTEEN DAYS IS WRITTEN TWICE, here and as TRIAL_DAYS in tiers.ts. That is a
-- real duplication and the two must be changed together; the alternative is a
-- length the client can choose, which is not a trial.
create or replace function public.coach_start_trial()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := (select auth.uid());
  v_ends timestamptz;
begin
  if v_uid is null then
    return null;
  end if;

  /* `coalesce(e.trial_started_at, ...)` is the whole guarantee: a second call
     returns the FIRST trial's dates. There is no path here that extends one,
     which is why this is safe to expose to a browser at all. */
  insert into public.coach_entitlements as e (user_id, trial_started_at, trial_ends_at)
  values (v_uid, now(), now() + interval '14 days')
  on conflict (user_id) do update
    set trial_started_at = coalesce(e.trial_started_at, now()),
        trial_ends_at    = coalesce(e.trial_ends_at, now() + interval '14 days'),
        updated_at       = now()
  returning e.trial_ends_at into v_ends;

  return v_ends;
end;
$fn$;

revoke all on function public.coach_start_trial() from public, anon;
grant execute on function public.coach_start_trial() to authenticated;

comment on function public.coach_start_trial() is
  'Starts the caller''s 14-day Coach trial and returns when it ends. Idempotent and once ever: calling it again returns the first trial''s end date, never a later one. Grants no tier by itself — it records a trial, and coach_consume() reads it.';

/* -------------------------------------------------------------------------- */
/* Housekeeping                                                               */
/* -------------------------------------------------------------------------- */

-- The ledger is not history anybody needs. Thirteen months keeps a full year of
-- month comparisons available and no more; a per-athlete record of how often
-- somebody asked their coach for advice is not something to hold indefinitely
-- because deleting it was never scheduled.
create or replace function public.coach_sweep_usage()
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  delete from public.coach_usage_days
   where usage_day < ((now() at time zone 'utc')::date - 400);
$$;

revoke all on function public.coach_sweep_usage() from public, anon, authenticated;
grant execute on function public.coach_sweep_usage() to service_role;

comment on function public.coach_sweep_usage() is
  'Drops usage rows older than 400 days. Nothing calls it on a schedule yet — said plainly rather than implying a cron that does not exist.';
