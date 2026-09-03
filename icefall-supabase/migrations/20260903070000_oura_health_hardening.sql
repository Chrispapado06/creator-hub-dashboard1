/*
 * ═══════════════════════════════════════════════════════════════════════════
 * OURA HEALTH — closing the hole that let any signed-in stranger read, forge
 * and destroy somebody else's heart rate
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DRAFT. NOT PUSHED. The owner's to gate, like every file here. `supabase db
 * push` applies EVERY pending migration, not this one — there is no per-file
 * push — so pushing this pushes whatever else is waiting beside it.
 *
 * RUNS AFTER 20260903060000_oura_health.sql AND DEPENDS ON IT. That file
 * creates the tables, the `oura_service` role and the functions. This one does
 * not re-create any of them: a second `create table if not exists` would
 * silently do nothing while its column list sat in the repository looking
 * authoritative, and a file describing a table it did not make is the same
 * class of lie as a comment describing code it does not keep. Everything below
 * is an ALTER, a REVOKE or a CHECK on objects that already exist.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG, AND HOW IT IS KNOWN RATHER THAN SUSPECTED
 * ───────────────────────────────────────────────────────────────────────────
 *
 * 20260903060000 ends every service-only function with
 *
 *     revoke all on function public.oura_delete_all(uuid, text) from public, anon;
 *
 * and explains, correctly, that `revoke ... from public` alone is not enough
 * because Supabase's default privileges grant `anon` its own EXECUTE. That is
 * true. It is also only half the default, which reads
 *
 *     alter default privileges in schema public
 *       grant all on functions to postgres, anon, authenticated, service_role;
 *
 * `authenticated` holds its own grant by exactly the same mechanism as `anon`,
 * and revoking one while naming the trap out loud left the other in place on
 * all seventeen service-only functions.
 *
 * MEASURED, NOT INFERRED. Every migration in this directory was loaded into a
 * real PostgreSQL (PGlite, the engine the suite in `icefall-supabase/tests`
 * already runs on) with Supabase's stock default privileges applied first —
 * the one thing the existing harness omits, which is why its tests pass over
 * this. Two accounts were created; one connected a ring and stored a night.
 * The second, holding nothing but the publishable key that ships inside the
 * phone app, then:
 *
 *   1. called `oura_connection_by_user(<the other account's uuid>)` and got
 *      back the whole row — Oura user id, sealed access token, sealed refresh
 *      token;
 *   2. called `oura_upsert_day(...)` and overwrote a measured HRV of 58 ms
 *      with 999, and a measured lowest heart rate of 47 bpm with 0;
 *   3. called `oura_delete_all(...)` and erased the sleep history and the
 *      connection.
 *
 * Direct table reads were refused throughout. The tables were never the way
 * in; RLS and the table-level revokes in 060000 both hold. Every one of those
 * three calls went through a SECURITY DEFINER function, which runs as the
 * owner and does not consult RLS at all — the grant was the whole door.
 *
 * Step 2 is the one to keep in mind. The sealed tokens are ciphertext without
 * OURA_TOKEN_KEY, so step 1 leaks less than it looks like. Step 3 is loud —
 * the person sees their data gone. Step 2 is silent, and it puts a number on a
 * screen that the ring never measured, which is the single thing this project
 * says it will not do.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   1. Revokes EXECUTE from `public`, `anon` and `authenticated` on every
 *      Oura and health-consent function except the five that are deliberately
 *      callable, and derives that set from the catalogue rather than a list,
 *      so a function added later cannot be missed by being forgotten here.
 *
 *   2. Refuses to finish if any of them is still reachable. A guarantee that
 *      is only a comment has already failed once in this feature.
 *
 *   3. Adds plausibility CHECKs to the measurement columns. Nullable already
 *      separates "not measured" from "measured zero"; nothing yet stopped a
 *      write claiming a resting heart rate of 0, which is not a low pulse.
 *
 *   4. Schedules the retention prune, if pg_cron is available to schedule it.
 */


/* ═══════════════════════════════════════════════════════════════════════════
 * 1. THE PRIVILEGE HOLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE ALLOWLIST IS THE WHOLE SECURITY MODEL, so it is written out in one place
 * and everything else is closed by default rather than the other way round.
 * Each of the five takes its identity from `auth.uid()` and never from an
 * argument, which is what makes it safe to hand to `authenticated`:
 *
 *   oura_my_summary()                     the caller's own latest rows
 *   health_record_consent(text,text,text) records the caller's own decision
 *   health_my_consent(text)               the caller's own decision
 *   health_consent_wording_in_force(text) the sentence on the page; not secret
 *   oura_retention_days()                 published policy; left open to all
 *
 * Anything else that starts `oura_` or handles health consent is machinery for
 * icefall-web, takes a user id as an ARGUMENT, and must be reachable only by
 * `oura_service`.
 *
 * The three trigger functions are caught by this too and that is correct: a
 * trigger function is invoked by the trigger, as the owner, and never needs a
 * grant to anybody.
 *
 * `service_role` IS NOT REVOKED, and pretending otherwise would be the point
 * of this file inverted. It keeps direct SELECT on these tables through
 * Supabase's default table privileges, so removing its EXECUTE would narrow
 * nothing while reading as though it had. The honest statement is the one in
 * section 5: the service-role key is the whole database, health included.
 */

do $$
declare
  r record;
  sig text;
  allowed constant text[] := array[
    'oura_my_summary()',
    'health_record_consent(text,text,text)',
    'health_my_consent(text)',
    'health_consent_wording_in_force(text)',
    'oura_retention_days()'
  ];
  n integer := 0;
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and (
         p.proname like 'oura\_%'
         or p.proname like 'health\_consent\_%'
         or p.proname like 'health\_my\_%'
         or p.proname like 'health\_record\_%'
       )
  loop
    /* `regprocedure` renders an unambiguous, correctly-quoted signature —
     * safer than reassembling one from proname and argument text. */
    sig := regexp_replace(r.oid::regprocedure::text, '^public\.', '');
    if sig = any (allowed) then
      continue;
    end if;

    execute format('revoke all on function %s from public', r.oid::regprocedure);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', r.oid::regprocedure);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', r.oid::regprocedure);
    end if;
    n := n + 1;
  end loop;

  raise notice 'oura hardening: closed % service-only function(s)', n;
end
$$;


/*
 * The five that stay open are re-granted explicitly rather than left to whatever
 * 060000 happened to do, so this file states the end position on its own and a
 * reader does not have to hold two files in their head to know who can call what.
 */
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.oura_my_summary() to authenticated;
    grant execute on function public.health_record_consent(text, text, text) to authenticated;
    grant execute on function public.health_my_consent(text) to authenticated;
    grant execute on function public.health_consent_wording_in_force(text) to authenticated;
  end if;
end
$$;


/* ═══════════════════════════════════════════════════════════════════════════
 * 2. THE ASSERTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The migration fails here rather than reporting success over a hole.
 *
 * It is not a re-run of the loop above, and the difference is the entire point.
 * The loop issues REVOKE, which removes a grant held BY `authenticated`
 * directly. `has_function_privilege` answers a wider question: can this role
 * reach EXECUTE by ANY route the database recognises. The gap between those
 * two is role membership — grant EXECUTE to some group role, grant that group
 * to `authenticated`, and every REVOKE in section 1 succeeds while the
 * privilege remains. The loop reports what was done; this reports what is true,
 * and only the second one is worth trusting.
 *
 * That is not hypothetical. It was the case used to check that this block
 * actually fails: with EXECUTE on `oura_delete_all` reached through a group
 * role, section 1 ran clean and this aborted the migration by name.
 */

do $$
declare
  r record;
  sig text;
  allowed constant text[] := array[
    'oura_my_summary()',
    'health_record_consent(text,text,text)',
    'health_my_consent(text)',
    'health_consent_wording_in_force(text)',
    'oura_retention_days()'
  ];
  leaked text[] := '{}';
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and (
         p.proname like 'oura\_%'
         or p.proname like 'health\_consent\_%'
         or p.proname like 'health\_my\_%'
         or p.proname like 'health\_record\_%'
       )
  loop
    sig := regexp_replace(r.oid::regprocedure::text, '^public\.', '');
    if sig = any (allowed) then
      continue;
    end if;

    if exists (select 1 from pg_roles where rolname = 'anon')
       and has_function_privilege('anon', r.oid, 'execute') then
      leaked := leaked || (sig || ' [anon]');
    end if;

    if exists (select 1 from pg_roles where rolname = 'authenticated')
       and has_function_privilege('authenticated', r.oid, 'execute') then
      leaked := leaked || (sig || ' [authenticated]');
    end if;
  end loop;

  if array_length(leaked, 1) is not null then
    raise exception 'health functions are still reachable by an ordinary account: %',
      array_to_string(leaked, ', ')
      using hint = 'Every one of these takes a user id as an argument. Reachable by authenticated means readable, forgeable and deletable across accounts.';
  end if;

  raise notice 'oura hardening: no service-only function is reachable by anon or authenticated';
end
$$;


/*
 * ROW LEVEL SECURITY IS NOT FORCED, DELIBERATELY.
 *
 * `alter table ... force row level security` is the obvious next reach and it
 * would break this feature completely. Forcing applies policies to the table
 * OWNER as well, and every read and write here happens inside a SECURITY
 * DEFINER function running as that owner, against tables that carry no
 * policies at all. Forcing would turn "only these functions may touch this
 * data" into "nothing may touch this data", and the failure would look like
 * missing rows rather than an error.
 *
 * Written down because it is the kind of tightening that looks free.
 */


/* ═══════════════════════════════════════════════════════════════════════════
 * 3. A MEASURED ZERO, AND A NUMBER NO BODY PRODUCES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 060000 got the important half right: every measurement column is nullable
 * with no default, so NULL is "not measured" and 0 is a reading of zero. That
 * distinction is the reason the Coach can say NO SENSOR instead of drawing a
 * flat line.
 *
 * It leaves the other half open. `lowest_heart_rate_bpm` accepts 0, and 0 is
 * not a low pulse — it is a corpse, or far more likely a normaliser that read
 * a missing field as a number. The nullable column says what a missing reading
 * looks like; nothing said what an impossible one looks like, and an
 * impossible one renders identically to a real one.
 *
 * THE BOUNDS ARE SET TO CATCH GARBAGE, NOT TO JUDGE PHYSIOLOGY. They sit far
 * outside anything a living person on a mountain produces, because a check
 * tight enough to argue about is a check that will one day refuse somebody's
 * real night. A resting heart rate of 31 belongs to a well-trained climber and
 * is accepted; 0 and 400 are not measurements and are refused.
 *
 * Refusing is right rather than storing-and-hiding: a value this table cannot
 * hold is a bug in the write path, and it should surface there — where the
 * webhook retries and the failure is visible — rather than be quietly dropped
 * into a column the Coach later has to distrust.
 *
 * These also close the forgery in step 2 of the header from the other end.
 * HRV 999 and heart rate 0 are both now refused by the table itself, whoever
 * is calling and whatever grant they hold.
 */

alter table public.oura_sleep_periods
  drop constraint if exists oura_sleep_periods_hrv_plausible,
  add  constraint oura_sleep_periods_hrv_plausible
       check (average_hrv_ms is null or (average_hrv_ms > 0 and average_hrv_ms <= 500)),

  drop constraint if exists oura_sleep_periods_heart_rate_plausible,
  add  constraint oura_sleep_periods_heart_rate_plausible
       check (
         (average_heart_rate_bpm is null or (average_heart_rate_bpm >= 20 and average_heart_rate_bpm <= 250))
         and (lowest_heart_rate_bpm is null or (lowest_heart_rate_bpm >= 20 and lowest_heart_rate_bpm <= 250))
       ),

  /* Respiratory rate. 3 and 60 bracket apnoea at one end and panic at the
   * other; anything outside is not a breath count. */
  drop constraint if exists oura_sleep_periods_breath_plausible,
  add  constraint oura_sleep_periods_breath_plausible
       check (average_breath_per_min is null or (average_breath_per_min >= 3 and average_breath_per_min <= 60)),

  drop constraint if exists oura_sleep_periods_efficiency_pct,
  add  constraint oura_sleep_periods_efficiency_pct
       check (efficiency_pct is null or (efficiency_pct >= 0 and efficiency_pct <= 100)),

  /*
   * Durations get a floor and no ceiling. Zero deep sleep is a real and
   * miserable night and must be storable; a negative is arithmetic that went
   * wrong. No upper bound, because a `rest` period is not a night and this
   * table holds both — an invented ceiling would refuse real data.
   */
  drop constraint if exists oura_sleep_periods_durations_nonneg,
  add  constraint oura_sleep_periods_durations_nonneg
       check (
         coalesce(total_sleep_min, 0) >= 0 and coalesce(deep_sleep_min, 0) >= 0
         and coalesce(rem_sleep_min, 0) >= 0 and coalesce(light_sleep_min, 0) >= 0
         and coalesce(awake_min, 0) >= 0 and coalesce(time_in_bed_min, 0) >= 0
         and coalesce(latency_min, 0) >= 0 and coalesce(restless_periods, 0) >= 0
       );


/*
 * SCORES ARE 0-100 BY DEFINITION, so a value outside it is not a low score, it
 * is a different quantity that has been written into a score column — which is
 * precisely the confusion 060000's naming rule exists to prevent. The naming
 * rule made the mistake visible to a reader; this makes it impossible for a
 * writer.
 */
alter table public.oura_daily_sleep
  drop constraint if exists oura_daily_sleep_scores_0_100,
  add  constraint oura_daily_sleep_scores_0_100
       check (
         (sleep_score is null or sleep_score between 0 and 100)
         and (deep_sleep_score is null or deep_sleep_score between 0 and 100)
         and (efficiency_score is null or efficiency_score between 0 and 100)
         and (latency_score is null or latency_score between 0 and 100)
         and (rem_sleep_score is null or rem_sleep_score between 0 and 100)
         and (restfulness_score is null or restfulness_score between 0 and 100)
         and (timing_score is null or timing_score between 0 and 100)
         and (total_sleep_score is null or total_sleep_score between 0 and 100)
       );

alter table public.oura_daily_readiness
  drop constraint if exists oura_daily_readiness_scores_0_100,
  add  constraint oura_daily_readiness_scores_0_100
       check (
         (readiness_score is null or readiness_score between 0 and 100)
         and (activity_balance_score is null or activity_balance_score between 0 and 100)
         and (body_temperature_score is null or body_temperature_score between 0 and 100)
         and (hrv_balance_score is null or hrv_balance_score between 0 and 100)
         and (previous_day_activity_score is null or previous_day_activity_score between 0 and 100)
         and (previous_night_score is null or previous_night_score between 0 and 100)
         and (recovery_index_score is null or recovery_index_score between 0 and 100)
         and (resting_heart_rate_score is null or resting_heart_rate_score between 0 and 100)
         and (sleep_balance_score is null or sleep_balance_score between 0 and 100)
         and (sleep_regularity_score is null or sleep_regularity_score between 0 and 100)
       ),

  /*
   * A DEVIATION, NOT A TEMPERATURE. Bounded at ±10 °C from the person's own
   * baseline: real values sit near ±2, and this is wide enough to never argue
   * with a fever while still catching an absolute 36.6 written into the column
   * by mistake — the single most likely error here, and one that would render
   * as a catastrophic fever on screen.
   */
  drop constraint if exists oura_daily_readiness_temp_deviation_c,
  add  constraint oura_daily_readiness_temp_deviation_c
       check (
         (temperature_deviation_c is null or temperature_deviation_c between -10 and 10)
         and (temperature_trend_deviation_c is null or temperature_trend_deviation_c between -10 and 10)
       );

alter table public.oura_daily_activity
  drop constraint if exists oura_daily_activity_scores_0_100,
  add  constraint oura_daily_activity_scores_0_100
       check (
         (activity_score is null or activity_score between 0 and 100)
         and (meet_daily_targets_score is null or meet_daily_targets_score between 0 and 100)
         and (move_every_hour_score is null or move_every_hour_score between 0 and 100)
         and (recovery_time_score is null or recovery_time_score between 0 and 100)
         and (stay_active_score is null or stay_active_score between 0 and 100)
         and (training_frequency_score is null or training_frequency_score between 0 and 100)
         and (training_volume_score is null or training_volume_score between 0 and 100)
       ),

  /*
   * Counters and durations: a floor only. A day with 0 steps is a rest day and
   * has to be storable — it is exactly the measured zero the nullable columns
   * exist to distinguish from a missing one.
   */
  drop constraint if exists oura_daily_activity_counters_nonneg,
  add  constraint oura_daily_activity_counters_nonneg
       check (
         coalesce(steps, 0) >= 0 and coalesce(active_calories_kcal, 0) >= 0
         and coalesce(total_calories_kcal, 0) >= 0 and coalesce(equivalent_walking_distance_m, 0) >= 0
         and coalesce(high_activity_min, 0) >= 0 and coalesce(medium_activity_min, 0) >= 0
         and coalesce(low_activity_min, 0) >= 0 and coalesce(sedentary_min, 0) >= 0
         and coalesce(resting_min, 0) >= 0 and coalesce(non_wear_min, 0) >= 0
         and coalesce(average_met_minutes, 0) >= 0 and coalesce(inactivity_alerts, 0) >= 0
       );

alter table public.oura_daily_spo2
  /*
   * Blood oxygen. Floored at 50 rather than 0: a reading below that is
   * incompatible with the person having worn the ring to bed and woken up, so
   * it is a sensor artefact, not a night to show somebody.
   */
  drop constraint if exists oura_daily_spo2_plausible,
  add  constraint oura_daily_spo2_plausible
       check (
         (spo2_average_pct is null or (spo2_average_pct >= 50 and spo2_average_pct <= 100))
         and (breathing_disturbance_index is null or breathing_disturbance_index >= 0)
       );

alter table public.oura_daily_stress
  drop constraint if exists oura_daily_stress_minutes_nonneg,
  add  constraint oura_daily_stress_minutes_nonneg
       check (
         coalesce(stress_high_min, 0) >= 0 and coalesce(recovery_high_min, 0) >= 0
       );


/* ═══════════════════════════════════════════════════════════════════════════
 * 4. RETENTION, ON A TIMER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The consent sentence people agree to says health data "is kept for up to 400
 * days and then deleted". 060000 names the gap honestly: `oura_prune_expired`
 * is only called opportunistically from the write paths, so if nobody's ring
 * syncs, nothing expires — and the 400 days is a tendency rather than the
 * promise that was made.
 *
 * This attaches it to a clock. 03:17 daily, off the hour because everything
 * else in the world runs on the hour.
 *
 * IT IS CONDITIONAL, AND THAT IS ITSELF A LIMITATION WORTH READING. pg_cron
 * has to be enabled on the project (Dashboard → Database → Extensions) and
 * this file will not enable it: `create extension` needs privileges a
 * migration may not have, and a failure there would abort every other pending
 * migration in the push. So if the extension is absent this raises a NOTICE
 * and moves on, and THE RETENTION PROMISE IS THEN STILL UNKEPT. The push
 * output says which happened; it is worth reading rather than assuming.
 */

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice
      'oura hardening: pg_cron is NOT installed, so the 400-day retention prune is NOT scheduled. '
      'Enable pg_cron and re-run section 4, or run public.oura_prune_expired() from an external '
      'scheduler. Until then the consent wording promises a deletion nothing performs on a timer.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'oura-retention-prune') then
    perform cron.unschedule('oura-retention-prune');
  end if;

  /*
   * 5000 rows a night. The bound is what stops a sweep from holding a lock
   * over a table the webhook path is trying to write to; a backlog drains over
   * several nights rather than in one long transaction.
   */
  perform cron.schedule(
    'oura-retention-prune',
    '17 3 * * *',
    $job$ select public.oura_prune_expired(5000); $job$
  );

  raise notice 'oura hardening: retention prune scheduled daily at 03:17 UTC';
exception
  when insufficient_privilege or undefined_table or undefined_function or undefined_object then
    /*
     * The extension exists but this role cannot reach it. Reported rather than
     * fatal — the alternative is one missing grant blocking every unrelated
     * migration in the same push — and reported LOUDLY, because a silently
     * unscheduled prune is a promise in the consent wording that nothing keeps.
     */
    raise notice
      'oura hardening: pg_cron is installed but could not be scheduled from this role (%). '
      'The 400-day retention prune is NOT scheduled.', sqlerrm;
end
$$;


/* ═══════════════════════════════════════════════════════════════════════════
 * 5. WHAT IS STILL TRUE AFTER THIS FILE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Named, because each one is a thing somebody could otherwise believe this
 * feature does.
 *
 *   THE SERVICE-ROLE KEY STILL READS EVERY HEALTH ROW. `service_role` keeps
 *   direct table privileges from Supabase's defaults, and they are not revoked
 *   here: other ICEFALL surfaces use that key broadly, and breaking them from
 *   this file would be a surprise in the wrong place. The consequence is
 *   simple and should not be softened — that key is the whole database, sleep
 *   and heart rate included, and it must never be handed to something that
 *   only needs one table.
 *
 *   THE OWNER ROLE STILL READS EVERYTHING, by definition, including through
 *   the dashboard SQL editor. There is no arrangement of RLS that hides data
 *   from the role that owns the tables. Access is a matter of who holds the
 *   database password, not of policy.
 *
 *   NO STAFF ARM EXISTS ANYWHERE IN THIS FEATURE, and none is added here.
 *   Support cannot read a heart rate to help somebody with a bug, and that is
 *   the intended answer rather than an omission: the alternative is a support
 *   tool that reads sleep, which is the thing this schema is for refusing.
 *   `oura_connections.state` and `oura_webhook_events` carry enough to diagnose
 *   a broken connection without a single measurement being visible.
 *
 *   DISCONNECT STILL CANNOT REVOKE AT OURA. Oura publishes no token-revocation
 *   endpoint. `oura_delete_all` erases what ICEFALL holds and forgets the
 *   tokens; the grant itself is removed by the person in their own Oura
 *   account, and the app has to say that rather than imply otherwise.
 *
 *   ACCOUNT DELETION ERASES THE EVIDENCE OF CONSENT ALONG WITH THE DATA.
 *   `health_consent_events` cascades from `auth.users`, so after an account is
 *   deleted nothing records that a grant existed or was withdrawn. 060000 and
 *   20260903050000 both make this trade deliberately and for the same reason:
 *   retaining a record about somebody who asked to be forgotten is the worse
 *   of the two, and it is not ours to choose for them.
 *
 *   WEBHOOK DELIVERY ROWS OUTLIVE ERASURE BY UP TO 90 DAYS. They hold an
 *   opaque Oura user id and no measurement, and they are what stops a
 *   post-disconnect notification storm being reprocessed from scratch. It is a
 *   pseudonymous identifier surviving a deletion, which is a real thing to have
 *   decided rather than a nothing.
 *
 *   AND THE ROOT CAUSE IS NOT FIXED, ONLY THIS INSTANCE OF IT. Supabase's
 *   default privileges will keep granting EXECUTE to `anon` and `authenticated`
 *   on every function any future migration creates in `public`. The permanent
 *   fix is one statement —
 *
 *       alter default privileges in schema public
 *         revoke execute on functions from anon, authenticated;
 *
 *   — and it is deliberately NOT in this file, because it silently changes the
 *   result of every migration written by every other session from that moment
 *   on, including ones already drafted and waiting to be pushed. That is a
 *   project-wide decision and it belongs to the owner, not to the file that
 *   happened to find the bug. Section 2's assertion is the local defence: this
 *   feature will now refuse to migrate rather than migrate open.
 */
