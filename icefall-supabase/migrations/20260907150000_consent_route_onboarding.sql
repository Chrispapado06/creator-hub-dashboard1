-- A sixth route for a health-consent event: the last page of sign-up.
--
-- The owner, 2026-09-07: a final sign-up page "where they can connect all of
-- the applications like strava, all trails, kamoot, oura ring". Connecting an
-- Oura ring stores health measurements, and storing health measurements needs
-- the person's recorded permission first — so that page has to be able to
-- RECORD a grant, and every grant is stamped with the route it came through.
--
-- IT IS A NEW VALUE RATHER THAN A REUSE OF 'app-settings' because the route is
-- evidence. "They agreed in the settings box" and "they agreed on the sign-up
-- page" are different facts about how considered the decision was, and a
-- future reader of `health_consent_events` — a support request, a deletion
-- request, an audit — is owed the true one.
--
-- Nothing else changes. The sentence shown is still fetched from
-- `health_consent_wording_in_force` and frozen by the same trigger; the page
-- shows it and records within the same sitting, exactly as settings does.

/*
 * The original CHECK was declared inline on the column, so its name was chosen
 * by Postgres rather than written down. It is found by THE COLUMN IT
 * CONSTRAINS, not by its text: Postgres stores a CHECK as a parse tree and
 * reprints `route in ('a','b')` as `route = ANY (ARRAY['a'::text, ...])`, so a
 * search for the words "route in" matches nothing — which was the first
 * version of this block, and it would have refused to apply. A guessed name
 * that misses would be worse still: both checks would stay, and the new route
 * would be rejected with no migration error to say why.
 */
do $$
declare
  v_name text;
  v_count int;
begin
  select count(*), min(c.conname)
    into v_count, v_name
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
   where c.conrelid = 'public.health_consent_events'::regclass
     and c.contype = 'c'
     and a.attname = 'route'
     and array_length(c.conkey, 1) = 1;

  if v_count <> 1 then
    raise exception 'health_consent_events: expected exactly one CHECK on route, found %; refusing to guess', v_count;
  end if;

  execute format('alter table public.health_consent_events drop constraint %I', v_name);
end
$$;

alter table public.health_consent_events
  add constraint health_consent_events_route_check check (route in (
    'app-settings',       -- the box in the ICEFALL app
    'app-onboarding',     -- the "Connect your accounts" page at the end of sign-up
    'app-disconnect',     -- they pressed Disconnect; recorded as withdrawal
    'retention-expiry',   -- the data aged out and the grant went with it
    'staff-recorded',     -- recorded on their behalf, reason in `note`
    'account-deleted'     -- the account went; this is the last thing written
  ));
