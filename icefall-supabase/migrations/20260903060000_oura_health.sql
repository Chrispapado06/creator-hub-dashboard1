/*
 * ═══════════════════════════════════════════════════════════════════════════
 * OURA RING — health measurements, and the consent that makes them lawful
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DRAFT. NOT PUSHED. This file is written by the session that built
 * `icefall-web/api/_oura*.mjs` and it is the owner's to gate, like every other
 * migration in this directory. `supabase db push` applies EVERY pending file,
 * not this one — there is no per-file push — so pushing this pushes whatever
 * else is waiting alongside it.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT MAKES THIS DIFFERENT FROM EVERY OTHER TABLE IN THIS PROJECT
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Heart rate, heart-rate variability, respiratory rate, blood oxygen, body
 * temperature and sleep are DATA CONCERNING HEALTH — Article 9 special
 * category. Processing them is prohibited by default and permitted only on a
 * named exception; the one available here is Article 9(2)(a), the person's
 * explicit consent.
 *
 * Explicit consent is a higher bar than the ordinary kind, and three things
 * follow that ordinary tables do not have to do:
 *
 *   1. IT IS ITS OWN QUESTION. Not bundled into signing up, and not the
 *      marketing tick from 20260903050000 — a different purpose needs its own
 *      unticked box and its own sentence. That migration argued this at length
 *      for email; the argument is stronger here.
 *
 *   2. IT EXPIRES. Health data kept forever, for a screen that shows the last
 *      few days, is not storage limitation. `oura_retention_days()` is the
 *      number, it is quoted in the consent wording, and the two must not drift.
 *
 *   3. WITHDRAWAL DELETES. Not a flag, not a soft delete. A disconnect that
 *      only forgets a token leaves a sleep and heart-rate history in a database
 *      the person believes they cleared.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE SHAPE IS BORROWED FROM 20260903050000, DELIBERATELY
 * ───────────────────────────────────────────────────────────────────────────
 *
 * A purpose per ROW rather than a boolean per purpose; an append-only decision
 * log rather than a column; the wording FROZEN with the decision; `needs_wording`
 * separating "no sentence was shown" from "we lost it"; nothing pre-ticked.
 * That migration explains why at length and this one does not repeat it.
 *
 * Two things are new, because email did not need them: the retention rule
 * above, and the fact that WITHDRAWAL HERE ALSO DESTROYS DATA rather than only
 * stopping a future send.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AND ONE THING THIS SCHEMA CANNOT PROMISE
 * ───────────────────────────────────────────────────────────────────────────
 *
 * `oura_delete_all` removes everything ICEFALL holds. IT DOES NOT REVOKE THE
 * GRANT AT OURA. Oura publishes no token-revocation endpoint — there is nothing
 * in their v2 OpenAPI document or their authentication docs that accepts a
 * token and invalidates it. The person removes ICEFALL in their own Oura
 * account, and `handleOuraDisconnect` says exactly that instead of claiming a
 * revocation nothing performed.
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. THE SERVICE ROLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `icefall-web` needs to write health rows on behalf of a person whose session
 * it does not have. A webhook carries an HMAC and an Oura user id; it carries
 * no ICEFALL token, because it is not that person's request.
 *
 * THE TWO OBVIOUS KEYS BOTH FAIL.
 *
 *   The publishable key is PUBLIC — it ships inside the phone app's bundle.
 *   Anything granted to `anon` is granted to everybody. A function that returns
 *   somebody's OAuth tokens cannot be granted to `anon` at any price.
 *
 *   The service-role key would work and costs the whole database. This feature
 *   needs nine tables. `_waitlist.mjs` refused that trade for a list of email
 *   addresses; it is not a better trade for sleep and heart rate.
 *
 * So: a role that can execute the Oura functions and nothing else. The server
 * mints a sixty-second JWT naming it. An attacker holding that environment
 * holds this feature — not `waitlist`, not `enquiries`, not `profiles`.
 */

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'oura_service') then
    create role oura_service nologin noinherit;
  end if;
end
$$;

/*
 * PostgREST switches to the role named in the JWT with SET ROLE, which requires
 * that `authenticator` be a member of it. Without this grant every call fails
 * with a role error — loudly, which is the failure to prefer over a silent
 * fallback to `anon`.
 */
grant oura_service to authenticator;
grant usage on schema public to oura_service;

/*
 * NO TABLE PRIVILEGES ARE GRANTED TO IT. Every access goes through the
 * SECURITY DEFINER functions at the bottom of this file, so the role can do the
 * six things this integration does and cannot run a SELECT of its own choosing.
 */


/* ═══════════════════════════════════════════════════════════════════════════
 * 2. CONSENT
 * ═══════════════════════════════════════════════════════════════════════════ */

create table if not exists public.health_consent_purposes (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text not null check (length(btrim(label)) between 3 and 80),

  /*
   * What processing under this purpose actually means, in a sentence. Read by
   * a person deciding whether a NEW use fits an existing purpose or needs a new
   * one, so it describes the LIMIT rather than the intention.
   */
  description text not null check (length(btrim(description)) between 20 and 1000),

  /* True when a grant is meaningless without the sentence that was on screen. */
  needs_wording boolean not null default true,

  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

insert into public.health_consent_purposes (slug, label, description, needs_wording, sort_order) values
  (
    'health-metrics',
    'Health measurements',
    'Storing measurements from a connected wearable - sleep, heart rate, heart-rate variability, respiratory rate, blood oxygen, body-temperature deviation and daily activity - so the Coach can use them. Special category data under Article 9, so it needs its own explicit consent. DOES NOT COVER research, sharing with expedition companies, or any use by a third party: each of those is a new purpose and fresh consent from each person.',
    true,
    10
  )
on conflict (slug) do nothing;

comment on table public.health_consent_purposes is
  'One row per purpose health data may be processed for. Deliberately not a boolean: '
  'a single flag over two purposes cannot be specific, and Article 9 consent has to be.';


create table if not exists public.health_consent_wordings (
  version text primary key check (version ~ '^[a-z0-9]+(-[a-z0-9.]+)*$'),

  purpose text not null references public.health_consent_purposes (slug)
    on update cascade
    on delete restrict,

  /*
   * The sentence shown on screen, stored verbatim. A bare `true` records that
   * somebody agreed and not what to, and the copy will change.
   */
  wording text not null check (length(btrim(wording)) between 10 and 1000),

  /* At most one per purpose is on the page now; none is also legal. */
  in_force boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists health_consent_wordings_one_in_force
  on public.health_consent_wordings (purpose)
  where in_force;

create index if not exists idx_health_consent_wordings_purpose
  on public.health_consent_wordings (purpose);

/*
 * THE WORDING QUOTES THE RETENTION PERIOD, AND `oura_retention_days()` IS THE
 * SAME NUMBER. If one changes without the other, people have agreed to a
 * sentence the database does not keep. Changing the period means a new wording
 * version and a fresh decision from every person, not an UPDATE.
 */
insert into public.health_consent_wordings (version, purpose, wording, in_force, notes) values
  (
    'health-metrics-2026-09',
    'health-metrics',
    'Store measurements from my Oura ring - sleep, heart rate, heart-rate variability, respiratory rate, blood oxygen, body-temperature deviation and daily activity - so ICEFALL can show them and the Coach can use them. This is health data. It is kept for up to 400 days and then deleted. I can disconnect at any time, which deletes all of it.',
    true,
    'First wording. 400 days matches oura_retention_days(); the two must be changed together or not at all.'
  )
on conflict (version) do nothing;

/*
 * Version, purpose and wording are immutable and rows cannot be deleted.
 * Editing them would silently rewrite what every past decision was made
 * against; `in_force` stays editable because which sentence is on the page now
 * is a fact about the present.
 */
create or replace function public.health_consent_wordings_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'consent wordings cannot be deleted'
      using hint = 'Decisions reference the sentence they were made against. Set in_force = false instead.';
  end if;

  if new.version is distinct from old.version
     or new.purpose is distinct from old.purpose
     or new.wording is distinct from old.wording then
    raise exception 'version, purpose and wording are immutable'
      using hint = 'A changed sentence is a NEW version. Insert one and take fresh decisions against it.';
  end if;

  return new;
end;
$$;

drop trigger if exists health_consent_wordings_immutable on public.health_consent_wordings;
create trigger health_consent_wordings_immutable
  before update or delete on public.health_consent_wordings
  for each row execute function public.health_consent_wordings_immutable();

revoke all on function public.health_consent_wordings_immutable() from public, anon;


create table if not exists public.health_consent_events (
  seq bigint generated always as identity primary key,

  /*
   * `on delete cascade`, with the same trade named in 20260903050000: erasing
   * the account erases the evidence that they withdrew. Keeping rows about
   * somebody who asked to be forgotten is worse, and is not ours to choose.
   */
  user_id uuid not null references auth.users (id) on delete cascade,

  purpose text not null references public.health_consent_purposes (slug)
    on update cascade
    on delete restrict,

  /*
   * `declined` is recorded, not inferred from an absence. An absent row means
   * "nobody has asked yet", which is a different instruction to the app.
   */
  decision text not null check (decision in ('granted', 'declined', 'withdrawn')),

  version text references public.health_consent_wordings (version)
    on update cascade
    on delete restrict,

  /* Server-copied from `version` by the freeze trigger. Never accepted from a caller. */
  wording text check (wording is null or length(btrim(wording)) between 10 and 1000),

  route text not null check (route in (
    'app-settings',       -- the box in the ICEFALL app
    'app-disconnect',     -- they pressed Disconnect; recorded as withdrawal
    'retention-expiry',   -- the data aged out and the grant went with it
    'staff-recorded',     -- recorded on their behalf, reason in `note`
    'account-deleted'     -- the account went; this is the last thing written
  )),

  recorded_at timestamptz not null default now(),
  note text check (note is null or length(btrim(note)) between 1 and 1000)
);

create index if not exists idx_health_consent_events_user
  on public.health_consent_events (user_id, purpose, seq desc);

/*
 * A decision that is not a grant carries no evidence at all, and a grant for a
 * purpose that needs a wording MUST name one. A tick box means nothing without
 * its label, so a grant with no label is refused rather than tidied up.
 */
create or replace function public.health_consent_event_freeze()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_needs_wording boolean;
  v_wording text;
  v_purpose text;
begin
  select p.needs_wording into v_needs_wording
    from public.health_consent_purposes p
   where p.slug = new.purpose;

  if new.version is not null then
    select w.wording, w.purpose into v_wording, v_purpose
      from public.health_consent_wordings w
     where w.version = new.version;

    if v_purpose is distinct from new.purpose then
      raise exception 'consent wording % does not belong to purpose %', new.version, new.purpose
        using hint = 'A decision about one purpose cannot be evidenced with another purpose''s words.';
    end if;
  end if;

  if new.decision = 'granted' then
    new.wording := v_wording;
    /* `is not true` rather than `not`: a NULL from an unknown purpose must not
     * read as "no wording needed" and wave the row through. */
    if v_needs_wording is not false and new.version is null then
      raise exception 'a granted health consent must name the wording that was shown'
        using hint = 'Record the version the person read. A tick with no label is not evidence of anything.';
    end if;
  else
    new.version := null;
    new.wording := null;
  end if;

  return new;
end;
$$;

drop trigger if exists health_consent_event_freeze on public.health_consent_events;
create trigger health_consent_event_freeze
  before insert on public.health_consent_events
  for each row execute function public.health_consent_event_freeze();

revoke all on function public.health_consent_event_freeze() from public, anon;

create or replace function public.health_consent_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'health consent decisions are append-only'
    using hint = 'A decision is not corrected, it is superseded. Append the new one; the latest row per person per purpose is the current state.';
end;
$$;

drop trigger if exists health_consent_events_append_only on public.health_consent_events;
create trigger health_consent_events_append_only
  before update or delete on public.health_consent_events
  for each row execute function public.health_consent_events_append_only();

revoke all on function public.health_consent_events_append_only() from public, anon;


/* ═══════════════════════════════════════════════════════════════════════════
 * 3. THE CONNECTION
 * ═══════════════════════════════════════════════════════════════════════════ */

create table if not exists public.oura_connections (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null unique references auth.users (id) on delete cascade,

  /*
   * Oura's own id for this person. THE ONLY THING A WEBHOOK CARRIES that can
   * be matched to an ICEFALL account, which is the whole reason the `personal`
   * scope is requested. Unique, because one ring account is one connection —
   * two ICEFALL accounts pointing at the same ring would make the webhook
   * ambiguous, and an ambiguous health write is not a write worth doing.
   */
  oura_user_id text not null unique check (length(btrim(oura_user_id)) between 1 and 200),

  /*
   * SEALED, NOT STORED. `v1.<iv>.<tag>.<ciphertext>` under AES-256-GCM with a
   * key that lives in the icefall-web environment and never in this database.
   * Whoever reads this table without OURA_TOKEN_KEY reads ciphertext.
   *
   * The health tables are NOT encrypted, and the difference is deliberate: a
   * stolen health row is a snapshot of the past, a stolen refresh token is a
   * live subscription to everything the ring measures from now on.
   */
  access_token_sealed text not null check (access_token_sealed like 'v1.%'),
  refresh_token_sealed text check (refresh_token_sealed is null or refresh_token_sealed like 'v1.%'),

  /* From Oura's `expires_in`, read rather than assumed. Never a hardcoded 30 days. */
  access_token_expires_at timestamptz not null,

  /* What Oura actually granted, which may be less than what was asked for. */
  granted_scope text not null default '',

  /*
   * `active` is the only state that yields data. Every other value is a reason,
   * and the reasons are kept apart because the sentences differ:
   *
   *   reauthorise        the grant is gone - most likely revoked at Oura
   *   membership-lapsed  Oura returned 403; their subscription ended
   *   rotation-lost      a refresh was issued and never reached us. See below.
   *   token-unreadable   OURA_TOKEN_KEY changed; the data is intact, the key is not
   *   consent-withdrawn  they withdrew; the rows are already gone
   */
  state text not null default 'active' check (state in (
    'active', 'reauthorise', 'membership-lapsed', 'rotation-lost',
    'token-unreadable', 'consent-withdrawn'
  )),
  state_detail text check (state_detail is null or length(state_detail) <= 500),
  state_changed_at timestamptz,

  /*
   * THE LOCK THAT MAKES ROTATION SAFE.
   *
   * Oura's refresh tokens are single use: a refresh returns a new pair and
   * kills the old one. Two instances refreshing at once means one of them
   * stores a token that is already dead, and which one wins depends on write
   * order. An in-process mutex cannot see the other instance; a conditional
   * UPDATE on this column can.
   */
  refresh_lock_until timestamptz,

  /*
   * THE MARK THAT MAKES A LOST ROTATION LEGIBLE.
   *
   * Set before the refresh request, cleared when the new pair is stored. If a
   * process dies in between, this stays set — and the next `invalid_grant` can
   * be reported as `rotation-lost` (we lost it) rather than `reauthorise` (you
   * revoked it). Two different sentences to show a person, and no way to tell
   * them apart without this column.
   */
  refresh_in_flight_at timestamptz,

  backfill_state text not null default 'pending'
    check (backfill_state in ('pending', 'running', 'done')),

  connected_at timestamptz not null default now(),
  last_data_at timestamptz
);

comment on table public.oura_connections is
  'One Oura grant per ICEFALL account. Tokens are sealed with a key held by icefall-web, '
  'not by this database. `state` is the only thing that decides whether data is served: '
  'anything but `active` returns the reason and no numbers.';

create index if not exists idx_oura_connections_state on public.oura_connections (state);


/* ═══════════════════════════════════════════════════════════════════════════
 * 4. WEBHOOK DELIVERIES
 * ═══════════════════════════════════════════════════════════════════════════ */

create table if not exists public.oura_webhook_events (
  id bigint generated always as identity primary key,

  /*
   * Oura's user id, NOT ours, and no foreign key. Deliberate: Oura keeps
   * notifying us about everybody who ever authorised ICEFALL, including people
   * whose rows were deleted, and a foreign key would reject exactly the events
   * that most need recording.
   *
   * This row holds an opaque provider id and no health value, which is what
   * makes it safe to keep after erasure.
   */
  oura_user_id text not null,

  data_type text not null,
  event_type text not null check (event_type in ('create', 'update', 'delete')),
  object_id text not null,
  event_time timestamptz not null,

  received_at timestamptz not null default now(),

  /*
   * PROCESSED, NOT MERELY SEEN. Oura retries on any non-2xx for about an hour,
   * so an event we recorded and then failed to act on must come back as work to
   * do. Deduplicating on arrival would turn every transient failure into
   * permanently missing data.
   */
  processed_at timestamptz,
  outcome text check (outcome is null or length(outcome) <= 60)
);

create unique index if not exists oura_webhook_events_delivery
  on public.oura_webhook_events (oura_user_id, data_type, event_type, object_id, event_time);

create index if not exists idx_oura_webhook_events_unprocessed
  on public.oura_webhook_events (received_at)
  where processed_at is null;


/* ═══════════════════════════════════════════════════════════════════════════
 * 5. THE MEASUREMENTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── THE NAMING RULE IS LOAD-BEARING ────────────────────────────────────────
 *
 * A column ending `_score` is Oura's 0-100 opinion. A column carrying a unit
 * (`_bpm`, `_ms`, `_min`, `_pct`, `_c`) is a measurement. Nothing is named
 * without one or the other.
 *
 * The reason is a real trap in the specification this was built from. It asked
 * for HRV and resting heart rate from `daily_readiness` — and
 * `daily_readiness.contributors.resting_heart_rate` IS A SCORE OUT OF 100. It
 * is not a pulse. 62 there does not mean 62 bpm. Building to the brief as
 * written would have printed that number on a tile labelled bpm.
 *
 * Every actual physiological measurement comes from `/v2/usercollection/sleep`,
 * which is a different endpoint from `daily_sleep`, and lands in
 * `oura_sleep_periods` below.
 *
 * ── NULL MEANS NOT MEASURED ────────────────────────────────────────────────
 *
 * Every measurement column is nullable and none has a default. A missing
 * reading is NULL, and 0 is a reading of zero. A default of 0 would turn a
 * night the ring spent in a drawer into a night of no sleep.
 *
 * ── source_event_at ────────────────────────────────────────────────────────
 *
 * On every table, and it is what makes the writes idempotent AND ordered. Two
 * webhooks for one day are normal — `create` then `update` as a night is
 * re-scored — and Oura's retries can arrive out of order. The upsert refuses a
 * write older than the one already stored, so a late retry cannot roll a row
 * backwards.
 */

create table if not exists public.oura_sleep_periods (
  user_id uuid not null references auth.users (id) on delete cascade,

  /* Oura's own id. The key, because a day can hold a night AND a nap, and
   * collapsing them onto one row per day would let an afternoon nap overwrite
   * a night's HRV. */
  oura_id text not null,
  day date not null,

  /* long_sleep | sleep | late_nap | rest — a nap is not a night, and the read
   * path filters on this rather than taking whatever was latest. */
  period_type text,

  bedtime_start timestamptz,
  bedtime_end timestamptz,

  /* ── the measurements the whole integration exists for ── */
  average_hrv_ms numeric,
  average_heart_rate_bpm numeric,
  lowest_heart_rate_bpm numeric,
  /* Respiratory rate. Oura calls it `average_breath`; breaths per minute. */
  average_breath_per_min numeric,

  total_sleep_min integer,
  deep_sleep_min integer,
  rem_sleep_min integer,
  light_sleep_min integer,
  awake_min integer,
  time_in_bed_min integer,
  latency_min integer,
  efficiency_pct numeric,
  restless_periods integer,

  /*
   * The ring ran out of charge. It is the honest reason a night has no HRV, and
   * without it a screen has to guess between "not worn" and "battery died".
   */
  low_battery_alert boolean,

  source_event_at timestamptz not null,
  updated_at timestamptz not null default now(),

  primary key (user_id, oura_id)
);

create index if not exists idx_oura_sleep_periods_day
  on public.oura_sleep_periods (user_id, day desc);


create table if not exists public.oura_daily_sleep (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  oura_id text,

  /* All 0-100. There is not one measurement on this endpoint. */
  sleep_score integer,
  deep_sleep_score integer,
  efficiency_score integer,
  latency_score integer,
  rem_sleep_score integer,
  restfulness_score integer,
  timing_score integer,
  total_sleep_score integer,

  summary_at timestamptz,
  source_event_at timestamptz not null,
  updated_at timestamptz not null default now(),

  primary key (user_id, day)
);


create table if not exists public.oura_daily_readiness (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  oura_id text,

  readiness_score integer,

  /*
   * The only two MEASUREMENTS on this endpoint: degrees away from the person's
   * own baseline, not an absolute temperature. `_c` is in the name because a
   * reader assuming absolute would see 0.9 and think the ring was broken.
   */
  temperature_deviation_c numeric,
  temperature_trend_deviation_c numeric,

  activity_balance_score integer,
  body_temperature_score integer,
  hrv_balance_score integer,
  previous_day_activity_score integer,
  previous_night_score integer,
  recovery_index_score integer,
  /* SCORE, NOT BPM. The bpm figure is oura_sleep_periods.lowest_heart_rate_bpm. */
  resting_heart_rate_score integer,
  sleep_balance_score integer,
  sleep_regularity_score integer,

  summary_at timestamptz,
  source_event_at timestamptz not null,
  updated_at timestamptz not null default now(),

  primary key (user_id, day)
);


create table if not exists public.oura_daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  oura_id text,

  activity_score integer,

  steps integer,
  active_calories_kcal integer,
  total_calories_kcal integer,
  equivalent_walking_distance_m integer,
  high_activity_min integer,
  medium_activity_min integer,
  low_activity_min integer,
  sedentary_min integer,
  resting_min integer,

  /*
   * Minutes the ring was off. Stored although nothing renders it yet: it is the
   * only field that separates a quiet day from a ring on a bedside table, and a
   * zero we cannot explain is worse than a zero we can.
   */
  non_wear_min integer,

  average_met_minutes numeric,
  inactivity_alerts integer,

  meet_daily_targets_score integer,
  move_every_hour_score integer,
  recovery_time_score integer,
  stay_active_score integer,
  training_frequency_score integer,
  training_volume_score integer,

  summary_at timestamptz,
  source_event_at timestamptz not null,
  updated_at timestamptz not null default now(),

  primary key (user_id, day)
);


create table if not exists public.oura_daily_spo2 (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  oura_id text,

  spo2_average_pct numeric,
  breathing_disturbance_index numeric,

  source_event_at timestamptz not null,
  updated_at timestamptz not null default now(),

  primary key (user_id, day)
);


create table if not exists public.oura_daily_stress (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  oura_id text,

  stress_high_min integer,
  recovery_high_min integer,
  /* restored | normal | stressful. Oura's own word, not a score and not ranked. */
  day_summary text check (day_summary is null or day_summary in ('restored', 'normal', 'stressful')),

  source_event_at timestamptz not null,
  updated_at timestamptz not null default now(),

  primary key (user_id, day)
);


/* ═══════════════════════════════════════════════════════════════════════════
 * 6. RETENTION
 * ═══════════════════════════════════════════════════════════════════════════ */

/*
 * THE RETENTION PERIOD, IN ONE PLACE.
 *
 * 400 days: a little over a year, so a season can be compared with the same
 * season before it, and no longer. The consent wording quotes this number.
 * CHANGING IT MEANS A NEW WORDING VERSION AND A FRESH DECISION FROM EVERY
 * PERSON — not an UPDATE here, because people agreed to the sentence, not to
 * whatever this function happens to return later.
 */
create or replace function public.oura_retention_days()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 400 $$;

/*
 * DELIBERATELY LEFT CALLABLE BY EVERYONE, unlike every other function in this
 * file. It returns a published policy — the same number printed in the consent
 * sentence — and a retention period that is harder to read than to agree to
 * would be a strange thing to hide.
 */
comment on function public.oura_retention_days() is
  'Days health measurements are kept. Quoted verbatim in health_consent_wordings; '
  'the two must change together or people have agreed to a sentence this does not keep. '
  'Deliberately not revoked: it is published policy, not a secret.';


/* ═══════════════════════════════════════════════════════════════════════════
 * 7. THE FUNCTIONS icefall-web CALLS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * All SECURITY DEFINER, all `set search_path`, all revoked from `public` AND
 * `anon` before being granted to `oura_service`.
 *
 * `revoke ... from anon` IS NOT REDUNDANT. Supabase's default privileges grant
 * EXECUTE to `anon` separately from PUBLIC, so `revoke from public` alone
 * leaves the function callable by anybody holding the publishable key — which
 * is everybody, since it ships in the app bundle. 20260903050000 records the
 * same trap; it costs one word and it is the difference between a private
 * function and a public one.
 */

create or replace function public.oura_consent_state(p_user uuid)
returns table (decision text, version text, recorded_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.decision, e.version, e.recorded_at
    from public.health_consent_events e
   where e.user_id = p_user
     and e.purpose = 'health-metrics'
   order by e.seq desc
   limit 1
$$;

revoke all on function public.oura_consent_state(uuid) from public, anon;
grant execute on function public.oura_consent_state(uuid) to oura_service;

comment on function public.oura_consent_state(uuid) is
  'The latest decision, or no row at all. No row means never asked, which is a '
  'different instruction to the app than declined.';


create or replace function public.oura_connect(
  p_user uuid,
  p_oura_user text,
  p_access text,
  p_refresh text,
  p_expires_at timestamptz,
  p_scope text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_consent text;
begin
  /*
    CONSENT IS CHECKED AGAIN HERE, IN THE DATABASE.
    `_oura.mjs` checks it twice already — before the redirect and at the
    callback. This is the check that cannot be skipped by a future caller that
    forgets, which is the only kind of check worth having on Article 9 data.
  */
  select decision into v_consent from public.oura_consent_state(p_user);
  if v_consent is distinct from 'granted' then
    raise exception 'no health-metrics consent for this account'
      using hint = 'Record a granted health_consent_events row before storing a ring connection.';
  end if;

  insert into public.oura_connections as c (
    user_id, oura_user_id, access_token_sealed, refresh_token_sealed,
    access_token_expires_at, granted_scope, state, state_detail, state_changed_at,
    refresh_lock_until, refresh_in_flight_at, backfill_state, connected_at
  )
  values (
    p_user, p_oura_user, p_access, p_refresh,
    p_expires_at, coalesce(p_scope, ''), 'active', null, now(),
    null, null, 'pending', now()
  )
  on conflict (user_id) do update
     set oura_user_id = excluded.oura_user_id,
         access_token_sealed = excluded.access_token_sealed,
         refresh_token_sealed = excluded.refresh_token_sealed,
         access_token_expires_at = excluded.access_token_expires_at,
         granted_scope = excluded.granted_scope,
         /* Reconnecting clears whatever broke last time. That is the point of
          * reconnecting, and leaving the old state would make the new grant
          * refuse to serve data. */
         state = 'active',
         state_detail = null,
         state_changed_at = now(),
         refresh_lock_until = null,
         refresh_in_flight_at = null,
         backfill_state = 'pending',
         connected_at = now()
  returning c.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.oura_connect(uuid, text, text, text, timestamptz, text) from public, anon;
grant execute on function public.oura_connect(uuid, text, text, text, timestamptz, text) to oura_service;


create or replace function public.oura_connection_by_user(p_user uuid)
returns setof public.oura_connections
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select * from public.oura_connections where user_id = p_user $$;

revoke all on function public.oura_connection_by_user(uuid) from public, anon;
grant execute on function public.oura_connection_by_user(uuid) to oura_service;


create or replace function public.oura_connection_by_oura_user(p_oura_user text)
returns setof public.oura_connections
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select * from public.oura_connections where oura_user_id = p_oura_user $$;

revoke all on function public.oura_connection_by_oura_user(text) from public, anon;
grant execute on function public.oura_connection_by_oura_user(text) to oura_service;

comment on function public.oura_connection_by_oura_user(text) is
  'Webhook routing. Returns the sealed tokens, which is why it is granted to '
  'oura_service and to nothing else - anon holds the publishable key, and the '
  'publishable key ships inside the phone app.';


/*
 * ONE REFRESH AT A TIME, DECIDED BY POSTGRES.
 *
 * Returns true to exactly one caller while the lock holds. `refresh_in_flight_at`
 * is set in the SAME statement, so a process that dies mid-refresh leaves the
 * evidence that it tried — which is what lets the next attempt report
 * `rotation-lost` instead of retrying a token Oura has already destroyed.
 */
create or replace function public.oura_claim_refresh(p_connection uuid, p_seconds integer default 30)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean := false;
begin
  update public.oura_connections
     set refresh_lock_until = now() + make_interval(secs => greatest(5, least(120, p_seconds))),
         refresh_in_flight_at = now()
   where id = p_connection
     and (refresh_lock_until is null or refresh_lock_until < now())
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.oura_claim_refresh(uuid, integer) from public, anon;
grant execute on function public.oura_claim_refresh(uuid, integer) to oura_service;


/*
 * The new pair, written in one statement, clearing both the lock and the
 * in-flight mark. Never write half of a rotated pair: the refresh token is the
 * half that cannot be recovered.
 */
create or replace function public.oura_store_tokens(
  p_connection uuid,
  p_access text,
  p_refresh text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.oura_connections
     set access_token_sealed = p_access,
         /* A refresh response without a refresh token keeps the one we hold
          * rather than nulling it — losing it would end the connection at the
          * next expiry for no reason. */
         refresh_token_sealed = coalesce(p_refresh, refresh_token_sealed),
         access_token_expires_at = p_expires_at,
         refresh_lock_until = null,
         refresh_in_flight_at = null
   where id = p_connection;

  return found;
end;
$$;

revoke all on function public.oura_store_tokens(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.oura_store_tokens(uuid, text, text, timestamptz) to oura_service;


create or replace function public.oura_mark_state(p_connection uuid, p_state text, p_detail text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.oura_connections
     set state = p_state,
         state_detail = nullif(btrim(coalesce(p_detail, '')), ''),
         state_changed_at = now(),
         /* A broken connection holds no lock. Leaving one would block the
          * reconnect that fixes it. */
         refresh_lock_until = null
   where id = p_connection;

  return found;
end;
$$;

revoke all on function public.oura_mark_state(uuid, text, text) from public, anon;
grant execute on function public.oura_mark_state(uuid, text, text) to oura_service;


create or replace function public.oura_mark_backfilled(p_connection uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.oura_connections set backfill_state = 'done' where id = p_connection;
  return found;
end;
$$;

revoke all on function public.oura_mark_backfilled(uuid) from public, anon;
grant execute on function public.oura_mark_backfilled(uuid) to oura_service;


/*
 * ONE DAY OF ONE COLLECTION, IDEMPOTENT AND ORDERED.
 *
 * The `where` on each `do update` is the monotonic guard: a write whose
 * `source_event_at` is older than the row already stored is ignored. That is
 * what makes Oura's retries and out-of-order deliveries harmless, and it is why
 * the backfill timestamps its rows with the DAY rather than with `now()` — a
 * month-old fetch must not overwrite this morning's live update.
 */
create or replace function public.oura_upsert_day(
  p_user uuid,
  p_day date,
  p_kind text,
  p_payload jsonb,
  p_source_event_at timestamptz,
  p_object_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state text;
  v_object_id text := coalesce(p_object_id, p_payload->>'oura_id');
begin
  /* A person whose connection is not active does not receive writes. This is
   * the backstop for a webhook that raced a disconnect. */
  select state into v_state from public.oura_connections where user_id = p_user;
  if v_state is distinct from 'active' then
    return false;
  end if;

  if p_kind = 'sleep' then
    /* A sleep period is keyed by Oura's own id, so one without an id is not a
     * row this table can hold. Refused rather than raised: an exception here
     * would answer the webhook 503 and have Oura retry a document that will
     * never have an id, ten times an hour. */
    if v_object_id is null then
      return false;
    end if;

    insert into public.oura_sleep_periods as t (
      user_id, oura_id, day, period_type, bedtime_start, bedtime_end,
      average_hrv_ms, average_heart_rate_bpm, lowest_heart_rate_bpm, average_breath_per_min,
      total_sleep_min, deep_sleep_min, rem_sleep_min, light_sleep_min, awake_min,
      time_in_bed_min, latency_min, efficiency_pct, restless_periods, low_battery_alert,
      source_event_at, updated_at
    ) values (
      p_user, v_object_id, p_day,
      p_payload->>'period_type',
      (p_payload->>'bedtime_start')::timestamptz, (p_payload->>'bedtime_end')::timestamptz,
      (p_payload->>'average_hrv_ms')::numeric, (p_payload->>'average_heart_rate_bpm')::numeric,
      (p_payload->>'lowest_heart_rate_bpm')::numeric, (p_payload->>'average_breath_per_min')::numeric,
      (p_payload->>'total_sleep_min')::integer, (p_payload->>'deep_sleep_min')::integer,
      (p_payload->>'rem_sleep_min')::integer, (p_payload->>'light_sleep_min')::integer,
      (p_payload->>'awake_min')::integer, (p_payload->>'time_in_bed_min')::integer,
      (p_payload->>'latency_min')::integer, (p_payload->>'efficiency_pct')::numeric,
      (p_payload->>'restless_periods')::integer, (p_payload->>'low_battery_alert')::boolean,
      p_source_event_at, now()
    )
    on conflict (user_id, oura_id) do update set
      day = excluded.day,
      period_type = excluded.period_type,
      bedtime_start = excluded.bedtime_start,
      bedtime_end = excluded.bedtime_end,
      average_hrv_ms = excluded.average_hrv_ms,
      average_heart_rate_bpm = excluded.average_heart_rate_bpm,
      lowest_heart_rate_bpm = excluded.lowest_heart_rate_bpm,
      average_breath_per_min = excluded.average_breath_per_min,
      total_sleep_min = excluded.total_sleep_min,
      deep_sleep_min = excluded.deep_sleep_min,
      rem_sleep_min = excluded.rem_sleep_min,
      light_sleep_min = excluded.light_sleep_min,
      awake_min = excluded.awake_min,
      time_in_bed_min = excluded.time_in_bed_min,
      latency_min = excluded.latency_min,
      efficiency_pct = excluded.efficiency_pct,
      restless_periods = excluded.restless_periods,
      low_battery_alert = excluded.low_battery_alert,
      source_event_at = excluded.source_event_at,
      updated_at = now()
    where excluded.source_event_at >= t.source_event_at;

  elsif p_kind = 'daily_sleep' then
    insert into public.oura_daily_sleep as t (
      user_id, day, oura_id, sleep_score, deep_sleep_score, efficiency_score,
      latency_score, rem_sleep_score, restfulness_score, timing_score, total_sleep_score,
      summary_at, source_event_at, updated_at
    ) values (
      p_user, p_day, p_payload->>'oura_id',
      (p_payload->>'sleep_score')::integer, (p_payload->>'deep_sleep_score')::integer,
      (p_payload->>'efficiency_score')::integer, (p_payload->>'latency_score')::integer,
      (p_payload->>'rem_sleep_score')::integer, (p_payload->>'restfulness_score')::integer,
      (p_payload->>'timing_score')::integer, (p_payload->>'total_sleep_score')::integer,
      (p_payload->>'summary_at')::timestamptz, p_source_event_at, now()
    )
    on conflict (user_id, day) do update set
      oura_id = excluded.oura_id,
      sleep_score = excluded.sleep_score,
      deep_sleep_score = excluded.deep_sleep_score,
      efficiency_score = excluded.efficiency_score,
      latency_score = excluded.latency_score,
      rem_sleep_score = excluded.rem_sleep_score,
      restfulness_score = excluded.restfulness_score,
      timing_score = excluded.timing_score,
      total_sleep_score = excluded.total_sleep_score,
      summary_at = excluded.summary_at,
      source_event_at = excluded.source_event_at,
      updated_at = now()
    where excluded.source_event_at >= t.source_event_at;

  elsif p_kind = 'daily_readiness' then
    insert into public.oura_daily_readiness as t (
      user_id, day, oura_id, readiness_score,
      temperature_deviation_c, temperature_trend_deviation_c,
      activity_balance_score, body_temperature_score, hrv_balance_score,
      previous_day_activity_score, previous_night_score, recovery_index_score,
      resting_heart_rate_score, sleep_balance_score, sleep_regularity_score,
      summary_at, source_event_at, updated_at
    ) values (
      p_user, p_day, p_payload->>'oura_id', (p_payload->>'readiness_score')::integer,
      (p_payload->>'temperature_deviation_c')::numeric,
      (p_payload->>'temperature_trend_deviation_c')::numeric,
      (p_payload->>'activity_balance_score')::integer, (p_payload->>'body_temperature_score')::integer,
      (p_payload->>'hrv_balance_score')::integer, (p_payload->>'previous_day_activity_score')::integer,
      (p_payload->>'previous_night_score')::integer, (p_payload->>'recovery_index_score')::integer,
      (p_payload->>'resting_heart_rate_score')::integer, (p_payload->>'sleep_balance_score')::integer,
      (p_payload->>'sleep_regularity_score')::integer,
      (p_payload->>'summary_at')::timestamptz, p_source_event_at, now()
    )
    on conflict (user_id, day) do update set
      oura_id = excluded.oura_id,
      readiness_score = excluded.readiness_score,
      temperature_deviation_c = excluded.temperature_deviation_c,
      temperature_trend_deviation_c = excluded.temperature_trend_deviation_c,
      activity_balance_score = excluded.activity_balance_score,
      body_temperature_score = excluded.body_temperature_score,
      hrv_balance_score = excluded.hrv_balance_score,
      previous_day_activity_score = excluded.previous_day_activity_score,
      previous_night_score = excluded.previous_night_score,
      recovery_index_score = excluded.recovery_index_score,
      resting_heart_rate_score = excluded.resting_heart_rate_score,
      sleep_balance_score = excluded.sleep_balance_score,
      sleep_regularity_score = excluded.sleep_regularity_score,
      summary_at = excluded.summary_at,
      source_event_at = excluded.source_event_at,
      updated_at = now()
    where excluded.source_event_at >= t.source_event_at;

  elsif p_kind = 'daily_activity' then
    insert into public.oura_daily_activity as t (
      user_id, day, oura_id, activity_score, steps, active_calories_kcal, total_calories_kcal,
      equivalent_walking_distance_m, high_activity_min, medium_activity_min, low_activity_min,
      sedentary_min, resting_min, non_wear_min, average_met_minutes, inactivity_alerts,
      meet_daily_targets_score, move_every_hour_score, recovery_time_score,
      stay_active_score, training_frequency_score, training_volume_score,
      summary_at, source_event_at, updated_at
    ) values (
      p_user, p_day, p_payload->>'oura_id', (p_payload->>'activity_score')::integer,
      (p_payload->>'steps')::integer, (p_payload->>'active_calories_kcal')::integer,
      (p_payload->>'total_calories_kcal')::integer,
      (p_payload->>'equivalent_walking_distance_m')::integer,
      (p_payload->>'high_activity_min')::integer, (p_payload->>'medium_activity_min')::integer,
      (p_payload->>'low_activity_min')::integer, (p_payload->>'sedentary_min')::integer,
      (p_payload->>'resting_min')::integer, (p_payload->>'non_wear_min')::integer,
      (p_payload->>'average_met_minutes')::numeric, (p_payload->>'inactivity_alerts')::integer,
      (p_payload->>'meet_daily_targets_score')::integer, (p_payload->>'move_every_hour_score')::integer,
      (p_payload->>'recovery_time_score')::integer, (p_payload->>'stay_active_score')::integer,
      (p_payload->>'training_frequency_score')::integer, (p_payload->>'training_volume_score')::integer,
      (p_payload->>'summary_at')::timestamptz, p_source_event_at, now()
    )
    on conflict (user_id, day) do update set
      oura_id = excluded.oura_id,
      activity_score = excluded.activity_score,
      steps = excluded.steps,
      active_calories_kcal = excluded.active_calories_kcal,
      total_calories_kcal = excluded.total_calories_kcal,
      equivalent_walking_distance_m = excluded.equivalent_walking_distance_m,
      high_activity_min = excluded.high_activity_min,
      medium_activity_min = excluded.medium_activity_min,
      low_activity_min = excluded.low_activity_min,
      sedentary_min = excluded.sedentary_min,
      resting_min = excluded.resting_min,
      non_wear_min = excluded.non_wear_min,
      average_met_minutes = excluded.average_met_minutes,
      inactivity_alerts = excluded.inactivity_alerts,
      meet_daily_targets_score = excluded.meet_daily_targets_score,
      move_every_hour_score = excluded.move_every_hour_score,
      recovery_time_score = excluded.recovery_time_score,
      stay_active_score = excluded.stay_active_score,
      training_frequency_score = excluded.training_frequency_score,
      training_volume_score = excluded.training_volume_score,
      summary_at = excluded.summary_at,
      source_event_at = excluded.source_event_at,
      updated_at = now()
    where excluded.source_event_at >= t.source_event_at;

  elsif p_kind = 'daily_spo2' then
    insert into public.oura_daily_spo2 as t (
      user_id, day, oura_id, spo2_average_pct, breathing_disturbance_index,
      source_event_at, updated_at
    ) values (
      p_user, p_day, p_payload->>'oura_id',
      (p_payload->>'spo2_average_pct')::numeric,
      (p_payload->>'breathing_disturbance_index')::numeric,
      p_source_event_at, now()
    )
    on conflict (user_id, day) do update set
      oura_id = excluded.oura_id,
      spo2_average_pct = excluded.spo2_average_pct,
      breathing_disturbance_index = excluded.breathing_disturbance_index,
      source_event_at = excluded.source_event_at,
      updated_at = now()
    where excluded.source_event_at >= t.source_event_at;

  elsif p_kind = 'daily_stress' then
    insert into public.oura_daily_stress as t (
      user_id, day, oura_id, stress_high_min, recovery_high_min, day_summary,
      source_event_at, updated_at
    ) values (
      p_user, p_day, p_payload->>'oura_id',
      (p_payload->>'stress_high_min')::integer, (p_payload->>'recovery_high_min')::integer,
      p_payload->>'day_summary', p_source_event_at, now()
    )
    on conflict (user_id, day) do update set
      oura_id = excluded.oura_id,
      stress_high_min = excluded.stress_high_min,
      recovery_high_min = excluded.recovery_high_min,
      day_summary = excluded.day_summary,
      source_event_at = excluded.source_event_at,
      updated_at = now()
    where excluded.source_event_at >= t.source_event_at;

  else
    /* An unknown kind is a caller bug, not a row to guess at. */
    raise exception 'unknown oura collection %', p_kind
      using hint = 'Add the table and the branch together, or the write silently goes nowhere.';
  end if;

  update public.oura_connections
     set last_data_at = greatest(coalesce(last_data_at, p_source_event_at), p_source_event_at)
   where user_id = p_user;

  return true;
end;
$$;

revoke all on function public.oura_upsert_day(uuid, date, text, jsonb, timestamptz, text) from public, anon;
grant execute on function public.oura_upsert_day(uuid, date, text, jsonb, timestamptz, text) to oura_service;


/*
 * Oura deleted the object; ours goes too. A row Oura no longer stands behind is
 * a measurement with no source, and keeping it would show the person a night
 * their own ring app does not.
 */
create or replace function public.oura_delete_object(p_user uuid, p_kind text, p_object_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_kind = 'sleep' then
    delete from public.oura_sleep_periods where user_id = p_user and oura_id = p_object_id;
  elsif p_kind = 'daily_sleep' then
    delete from public.oura_daily_sleep where user_id = p_user and oura_id = p_object_id;
  elsif p_kind = 'daily_readiness' then
    delete from public.oura_daily_readiness where user_id = p_user and oura_id = p_object_id;
  elsif p_kind = 'daily_activity' then
    delete from public.oura_daily_activity where user_id = p_user and oura_id = p_object_id;
  elsif p_kind = 'daily_spo2' then
    delete from public.oura_daily_spo2 where user_id = p_user and oura_id = p_object_id;
  elsif p_kind = 'daily_stress' then
    delete from public.oura_daily_stress where user_id = p_user and oura_id = p_object_id;
  else
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.oura_delete_object(uuid, text, text) from public, anon;
grant execute on function public.oura_delete_object(uuid, text, text) to oura_service;


create or replace function public.oura_record_event(
  p_oura_user text,
  p_data_type text,
  p_event_type text,
  p_object_id text,
  p_event_time timestamptz
)
returns table (event_id bigint, fresh boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_processed timestamptz;
begin
  insert into public.oura_webhook_events (oura_user_id, data_type, event_type, object_id, event_time)
  values (p_oura_user, p_data_type, p_event_type, p_object_id, p_event_time)
  on conflict (oura_user_id, data_type, event_type, object_id, event_time) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  /*
    Already recorded. `fresh` depends on whether it was PROCESSED, not on
    whether it was seen: Oura retries every non-2xx, and a delivery we failed to
    act on must come back as work rather than be deduplicated into silence.
  */
  select id, processed_at into v_id, v_processed
    from public.oura_webhook_events
   where oura_user_id = p_oura_user
     and data_type = p_data_type
     and event_type = p_event_type
     and object_id = p_object_id
     and event_time = p_event_time;

  return query select v_id, (v_processed is null);
end;
$$;

revoke all on function public.oura_record_event(text, text, text, text, timestamptz) from public, anon;
grant execute on function public.oura_record_event(text, text, text, text, timestamptz) to oura_service;


create or replace function public.oura_mark_event_processed(p_event bigint, p_outcome text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.oura_webhook_events
     set processed_at = now(), outcome = left(coalesce(p_outcome, ''), 60)
   where id = p_event;
  return found;
end;
$$;

revoke all on function public.oura_mark_event_processed(bigint, text) from public, anon;
grant execute on function public.oura_mark_event_processed(bigint, text) to oura_service;


/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ERASURE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deletes, and returns the counts so the person can be told what went rather
 * than the word "done".
 *
 * The withdrawal is recorded BEFORE the rows go, and it survives them: the
 * consent log is keyed on `auth.users`, not on the connection, so it outlives
 * the disconnect and records that a grant existed and was withdrawn. It is
 * deleted only when the account itself is.
 *
 * The webhook event rows are NOT deleted. They hold an opaque Oura user id and
 * no health value, and they are the only thing that stops a stream of
 * post-disconnect notifications being reprocessed from scratch.
 */
create or replace function public.oura_delete_all(p_user uuid, p_reason text)
returns table (
  sleep_periods integer,
  daily_sleep integer,
  daily_readiness integer,
  daily_activity integer,
  daily_spo2 integer,
  daily_stress integer,
  connections integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c1 integer; c2 integer; c3 integer; c4 integer; c5 integer; c6 integer; c7 integer;
  v_route text;
  v_last text;
begin
  v_route := case
    when p_reason = 'retention-expiry' then 'retention-expiry'
    when p_reason = 'account-deleted' then 'account-deleted'
    else 'app-disconnect'
  end;

  select decision into v_last from public.oura_consent_state(p_user);

  /*
    Recorded first, and only if the log does not already say so.
    `health_record_consent` writes the withdrawal and then calls this, so
    without the guard a single tap would leave two withdrawal rows and make the
    log read as two separate decisions.

    If the deletes below fail, the withdrawal still stands and the connection is
    already refusing to serve data — the right way round for this to break.
  */
  if v_last is distinct from 'withdrawn' and v_last is distinct from 'declined' then
    insert into public.health_consent_events (user_id, purpose, decision, route, note)
    values (p_user, 'health-metrics', 'withdrawn', v_route, left(coalesce(p_reason, ''), 1000));
  end if;

  delete from public.oura_sleep_periods where user_id = p_user;
  get diagnostics c1 = row_count;
  delete from public.oura_daily_sleep where user_id = p_user;
  get diagnostics c2 = row_count;
  delete from public.oura_daily_readiness where user_id = p_user;
  get diagnostics c3 = row_count;
  delete from public.oura_daily_activity where user_id = p_user;
  get diagnostics c4 = row_count;
  delete from public.oura_daily_spo2 where user_id = p_user;
  get diagnostics c5 = row_count;
  delete from public.oura_daily_stress where user_id = p_user;
  get diagnostics c6 = row_count;

  /* The connection row goes last, and with it the sealed tokens. */
  delete from public.oura_connections where user_id = p_user;
  get diagnostics c7 = row_count;

  return query select c1, c2, c3, c4, c5, c6, c7;
end;
$$;

revoke all on function public.oura_delete_all(uuid, text) from public, anon;
grant execute on function public.oura_delete_all(uuid, text) to oura_service;


/*
 * RETENTION, ENFORCED.
 *
 * Bounded by `p_limit` because icefall-web calls it opportunistically from the
 * write paths, and a request must not be held open by a housekeeping sweep.
 *
 * OPPORTUNISTIC IS NOT SCHEDULED, AND THIS IS THE HONEST GAP IN THIS FILE. If
 * nobody's ring syncs for a week, nothing expires that week. Something has to
 * call this on a timer — a Supabase cron job or an external scheduler — for the
 * 400 days in the consent wording to be a promise rather than a tendency. That
 * is not built and is named in the handover.
 */
create or replace function public.oura_prune_expired(p_limit integer default 500)
returns table (deleted_rows integer, cutoff date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff date := (current_date - public.oura_retention_days());
  v_n integer := 0;
  v_c integer;
  v_lim integer := greatest(1, least(10000, coalesce(p_limit, 500)));
begin
  delete from public.oura_sleep_periods
   where ctid in (select ctid from public.oura_sleep_periods where day < v_cutoff limit v_lim);
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  delete from public.oura_daily_sleep
   where ctid in (select ctid from public.oura_daily_sleep where day < v_cutoff limit v_lim);
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  delete from public.oura_daily_readiness
   where ctid in (select ctid from public.oura_daily_readiness where day < v_cutoff limit v_lim);
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  delete from public.oura_daily_activity
   where ctid in (select ctid from public.oura_daily_activity where day < v_cutoff limit v_lim);
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  delete from public.oura_daily_spo2
   where ctid in (select ctid from public.oura_daily_spo2 where day < v_cutoff limit v_lim);
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  delete from public.oura_daily_stress
   where ctid in (select ctid from public.oura_daily_stress where day < v_cutoff limit v_lim);
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  /* Webhook rows carry no health value; they are kept 90 days as a delivery
   * record and then go, so the dedupe index does not grow without end. */
  delete from public.oura_webhook_events
   where ctid in (
     select ctid from public.oura_webhook_events
      where received_at < now() - interval '90 days'
      limit v_lim
   );
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  return query select v_n, v_cutoff;
end;
$$;

revoke all on function public.oura_prune_expired(integer) from public, anon;
grant execute on function public.oura_prune_expired(integer) to oura_service;


/* ═══════════════════════════════════════════════════════════════════════════
 * 8. WHAT THE APP CALLS, AS ITSELF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These are the only functions granted to `authenticated`, and every one of
 * them derives the person from `auth.uid()` rather than from an argument. A
 * user id parameter would be a function that returns anybody's sleep to
 * whoever asks for it.
 */

create or replace function public.oura_my_summary()
returns table (
  state text,
  backfill_state text,
  sleep jsonb,
  readiness jsonb,
  daily_sleep jsonb,
  activity jsonb,
  spo2 jsonb,
  stress jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.state,
    c.backfill_state,
    /*
      A NIGHT, NOT A NAP. Filtering on `period_type` matters: without it an
      afternoon rest becomes "last night's HRV", and the number would be real,
      measured, and about the wrong thing.
    */
    (select to_jsonb(s) from public.oura_sleep_periods s
      where s.user_id = c.user_id
        and (s.period_type is null or s.period_type in ('long_sleep', 'sleep'))
      order by s.day desc, s.total_sleep_min desc nulls last
      limit 1),
    (select to_jsonb(r) from public.oura_daily_readiness r
      where r.user_id = c.user_id order by r.day desc limit 1),
    (select to_jsonb(d) from public.oura_daily_sleep d
      where d.user_id = c.user_id order by d.day desc limit 1),
    (select to_jsonb(a) from public.oura_daily_activity a
      where a.user_id = c.user_id order by a.day desc limit 1),
    (select to_jsonb(o) from public.oura_daily_spo2 o
      where o.user_id = c.user_id order by o.day desc limit 1),
    (select to_jsonb(t) from public.oura_daily_stress t
      where t.user_id = c.user_id order by t.day desc limit 1)
  from public.oura_connections c
  where c.user_id = auth.uid()
$$;

revoke all on function public.oura_my_summary() from public, anon;
grant execute on function public.oura_my_summary() to authenticated;

comment on function public.oura_my_summary() is
  'The latest of each collection for the caller. Returns no row when there is no '
  'connection, which the endpoint reports as not-connected rather than as zeros. '
  'Note it does NOT filter on freshness - icefall-web applies that, so the rule '
  'lives in one readable place instead of being split across two languages.';


/*
 * The sentence currently on the page, so the app can render the exact wording a
 * decision will be recorded against — rather than hardcoding a copy of it that
 * drifts from the row this database will freeze.
 */
create or replace function public.health_consent_wording_in_force(p_purpose text)
returns table (version text, wording text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.version, w.wording
    from public.health_consent_wordings w
   where w.purpose = p_purpose and w.in_force
   limit 1
$$;

revoke all on function public.health_consent_wording_in_force(text) from public, anon;
grant execute on function public.health_consent_wording_in_force(text) to authenticated;


/*
 * Record a decision. Handles granted, declined and withdrawn, so a re-grant is
 * the same call — the latest row per person per purpose is the current state.
 *
 * The caller does not choose the wording. It is taken from whatever is in force
 * NOW, because that is what was on the page they just read; accepting a version
 * from the client would let a stale app record a consent against a sentence
 * nobody was shown.
 */
create or replace function public.health_record_consent(
  p_purpose text,
  p_decision text,
  p_route text default 'app-settings'
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_needs boolean;
  v_version text;
  v_seq bigint;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select p.needs_wording into v_needs
    from public.health_consent_purposes p where p.slug = p_purpose;

  if v_needs is null then
    raise exception 'unknown consent purpose %', p_purpose;
  end if;

  if p_decision = 'granted' then
    select w.version into v_version
      from public.health_consent_wordings w
     where w.purpose = p_purpose and w.in_force;

    /* `is not false` rather than `not`: an unexpected NULL must not read as
     * "no wording needed" and let an unevidenced grant through. */
    if v_needs is not false and v_version is null then
      raise exception 'no wording is in force for purpose %', p_purpose
        using hint = 'Nothing may be recorded as granted while there is no current sentence to grant against.';
    end if;
  end if;

  insert into public.health_consent_events (user_id, purpose, decision, version, route)
  values (v_user, p_purpose, p_decision, v_version, p_route)
  returning seq into v_seq;

  /*
    WITHDRAWAL DELETES. This is the difference between health consent and
    marketing consent: stopping a send is enough for email, and it is not enough
    for a heart-rate history. The erasure is here rather than in the app so it
    cannot be forgotten by a caller.
  */
  if p_decision in ('withdrawn', 'declined') then
    perform public.oura_delete_all(v_user, 'consent-' || p_decision);
  end if;

  return v_seq;
end;
$$;

revoke all on function public.health_record_consent(text, text, text) from public, anon;
grant execute on function public.health_record_consent(text, text, text) to authenticated;


create or replace function public.health_my_consent(p_purpose text)
returns table (decision text, version text, wording text, recorded_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.decision, e.version, e.wording, e.recorded_at
    from public.health_consent_events e
   where e.user_id = auth.uid() and e.purpose = p_purpose
   order by e.seq desc
   limit 1
$$;

revoke all on function public.health_my_consent(text) from public, anon;
grant execute on function public.health_my_consent(text) to authenticated;


/* ═══════════════════════════════════════════════════════════════════════════
 * 9. ROW LEVEL SECURITY — ON, WITH NO POLICIES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every table below has RLS enabled and NOT ONE POLICY. That is not an
 * oversight; it is the tightest possible setting. With RLS on and no policy,
 * `anon` and `authenticated` can read and write nothing at all, and every path
 * into this data is one of the SECURITY DEFINER functions above — where the
 * rules are written down and reviewable.
 *
 * The privileges are revoked as well as the policies withheld, for the reason
 * 20260825120000 and 20260903050000 both record: a table with RLS on and no
 * policy is closed by the policy, but a function default-granted to `anon` is
 * open by the grant. Belt and braces, and the braces are the ones that have
 * failed before.
 */

alter table public.oura_connections enable row level security;
alter table public.oura_webhook_events enable row level security;
alter table public.oura_sleep_periods enable row level security;
alter table public.oura_daily_sleep enable row level security;
alter table public.oura_daily_readiness enable row level security;
alter table public.oura_daily_activity enable row level security;
alter table public.oura_daily_spo2 enable row level security;
alter table public.oura_daily_stress enable row level security;
alter table public.health_consent_purposes enable row level security;
alter table public.health_consent_wordings enable row level security;
alter table public.health_consent_events enable row level security;

revoke all on public.oura_connections from anon, authenticated;
revoke all on public.oura_webhook_events from anon, authenticated;
revoke all on public.oura_sleep_periods from anon, authenticated;
revoke all on public.oura_daily_sleep from anon, authenticated;
revoke all on public.oura_daily_readiness from anon, authenticated;
revoke all on public.oura_daily_activity from anon, authenticated;
revoke all on public.oura_daily_spo2 from anon, authenticated;
revoke all on public.oura_daily_stress from anon, authenticated;
revoke all on public.health_consent_events from anon, authenticated;

/*
 * The vocabulary tables are readable by signed-in people, and only readable:
 * the app has to render the purpose and the sentence in force, and neither is
 * a secret. `health_consent_wordings` is additionally protected by its
 * immutability trigger, which applies to every role including service_role.
 */
grant select on public.health_consent_purposes to authenticated;
grant select on public.health_consent_wordings to authenticated;

drop policy if exists health_consent_purposes_read on public.health_consent_purposes;
create policy health_consent_purposes_read
  on public.health_consent_purposes for select to authenticated using (true);

drop policy if exists health_consent_wordings_read on public.health_consent_wordings;
create policy health_consent_wordings_read
  on public.health_consent_wordings for select to authenticated using (true);


/* ═══════════════════════════════════════════════════════════════════════════
 * 10. WHAT IS NOT IN THIS FILE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Named rather than left to be discovered:
 *
 *   A SCHEDULED PRUNE. `oura_prune_expired` exists and is called
 *   opportunistically from the write paths. Until something calls it on a
 *   timer, the 400 days in the consent wording is what usually happens rather
 *   than what is guaranteed.
 *
 *   A SCHEDULED SUBSCRIPTION RENEWAL. Oura's webhook subscriptions expire and
 *   the period is published nowhere. `server/oura-subscriptions.mjs renew`
 *   does it by hand. Unrenewed, delivery stops silently — which is survivable
 *   only because stale rows age out into "no recent data" instead of sitting on
 *   a screen looking current.
 *
 *   HRV AND HEART-RATE SAMPLE SERIES. Oura offers five-minute and thirty-second
 *   series. Nothing in ICEFALL plots them, so they are not requested and there
 *   is no table for them. Adding one means widening the consent wording.
 *
 *   daily_resilience, daily_cardiovascular_age, vO2_max. Real collections. The
 *   scope that grants them is documented nowhere Oura publishes, so whether the
 *   grant covers them is unknown until a live token is tried.
 */
