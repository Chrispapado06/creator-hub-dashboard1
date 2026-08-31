-- Real identity: a username nobody else can hold, a location, and somewhere for
-- the onboarding answers to live.
--
-- Signup was local-only until now: `icefall-app/src/screens/auth/Auth.tsx` matched
-- an email against a localStorage record and threw the password away on purpose.
-- This migration is the server half of making it real.
--
-- THREE DECISIONS WORTH THE PARAGRAPHS THEY TAKE.
--
-- 1. `username` IS NULLABLE, AND IT IS NOT OPTIONAL. Those are different claims.
--    The profile row is created by a trigger at the instant `auth.users` gets its
--    row. With Google or Apple that happens BEFORE the person has been asked a
--    single question — you get a session and a verified email and nothing else.
--    So the column must accept null, and the app routes any session with a null
--    username to the handle screen before anything else.
--
--    The tempting alternative is for the trigger to invent one from the email.
--    It is a trap: `alice@gmail` and `alice@outlook` collide, so the second
--    signup either fails — and a failure in this trigger ROLLS BACK the auth
--    user, meaning she cannot sign in at all, ever — or she silently becomes
--    `alice7`. And the email local part would become a public handle, printing
--    part of her address onto every share card. Nobody would have chosen their
--    own name.
--
-- 2. INPUT IS LOWERCASED; STORAGE CANNOT BE ANYTHING ELSE. Two separate rules,
--    and it is worth being exact because an earlier draft of this comment said
--    "rejected, not folded" and that was wrong about half of it.
--
--    `claim_username` lowercases what it is given, so somebody typing `Alex`
--    gets `alex` — folded, like `citext` would. What the CHECK adds is that
--    uppercase cannot exist in the column by ANY path, including a direct admin
--    UPDATE. So the stored handle is always canonical, `@alex` is unambiguous
--    everywhere it is rendered, and a plain unique index is case-insensitive in
--    effect without a functional index or an extension.
--
--    Verified against the live database: with `summit` held, both `SUMMIT` and
--    `Summit` come back `taken`.
--
-- 3. THE ONBOARDING ANSWERS DO NOT GO ON `profiles`. `profiles_select` is
--    `using (true)`: every signed-in user can read every profile row in full.
--    Body mass, height and birth year on that table would publish them to every
--    account on the platform. They go in `athlete_profiles`, owner-read-only.

begin;

/* ========================================================================== */
/* 1. USERNAME                                                                */
/* ========================================================================== */

alter table public.profiles add column if not exists username text;

-- Same alphabet the app's existing settings field already produces
-- (`icefall-app/src/screens/settings/Sections.tsx` strips [^a-zA-Z0-9_.] and
-- lowercases), so no handle anybody has already typed becomes illegal.
--
-- Must start and end alphanumeric, so `_alex` and `alex.` cannot exist as
-- near-twins of `alex`. No `..` for the same reason. 3-20: three so `@al` is not
-- a landgrab, twenty so it fits on a share card.
alter table public.profiles drop constraint if exists profiles_username_shape;
alter table public.profiles add constraint profiles_username_shape check (
  username is null or (
    username ~ '^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$'
    and username !~ '\.\.'
  )
);

-- THE ONLY THING THAT ACTUALLY ENFORCES UNIQUENESS. Everything in the app is a
-- courtesy that is stale by the time the button is pressed; this is the line
-- that decides. NULLs are distinct in a unique index, so any number of profiles
-- may sit with no username yet.
create unique index if not exists profiles_username_key on public.profiles (username);

comment on column public.profiles.username is
  'Public handle. Lowercase a-z, 0-9, _ and . — claim_username() lowercases input, and the CHECK guarantees uppercase cannot exist by any path, so the stored handle is always canonical. NULL until the person chooses one, which for a social signup is after the account already exists.';

/* ========================================================================== */
/* 2. LOCATION — a label and a country, and deliberately no coordinates       */
/* ========================================================================== */

alter table public.profiles add column if not exists location_label text;
alter table public.profiles add column if not exists country_code char(2);

alter table public.profiles drop constraint if exists profiles_location_label_shape;
alter table public.profiles add constraint profiles_location_label_shape check (
  location_label is null or length(btrim(location_label)) between 1 and 80
);

alter table public.profiles drop constraint if exists profiles_country_code_shape;
alter table public.profiles add constraint profiles_country_code_shape check (
  country_code is null or country_code ~ '^[A-Z]{2}$'
);

-- NO LATITUDE, NO LONGITUDE, AND NO GEOCODING OF THE LABEL.
--
-- The app already asks for this exact thing in settings with the right framing:
-- "A town or region. Never an address — ICEFALL has no field for one." It also
-- already has a SEPARATE, opt-in, deliberately coarse grid coordinate for the
-- Expedition Network, quantised before it is stored. That separation is the
-- product's honesty about precision and it must survive.
--
-- Turning "Chamonix" into a lat/lon and treating it as where somebody lives
-- would manufacture precision from a free-text box. The country code earns its
-- place because it is the only part the product can act on — currency, regional
-- filtering — without implying more than it knows.
comment on column public.profiles.location_label is
  'A town or region, as typed. Never an address, never geocoded. See the Expedition Network coarse grid for the separate, opt-in, quantised coordinate.';

/* ========================================================================== */
/* 3. RESERVED NAMES — a table, because the list will grow                    */
/* ========================================================================== */

create table if not exists public.reserved_usernames (
  name text primary key,
  reason text
);
alter table public.reserved_usernames enable row level security;

insert into public.reserved_usernames (name, reason) values
  ('icefall','brand'), ('admin','impersonation'), ('administrator','impersonation'),
  ('support','impersonation'), ('help','impersonation'), ('staff','impersonation'),
  ('team','impersonation'), ('official','impersonation'), ('security','impersonation'),
  ('moderator','impersonation'), ('mod','impersonation'), ('system','impersonation'),
  ('root','impersonation'), ('billing','impersonation'), ('contact','impersonation'),
  ('guide','role confusion'), ('guides','role confusion'), ('operator','role confusion'),
  ('sherpa','role confusion'),
  ('api','route'), ('www','route'), ('app','route'), ('auth','route'),
  ('signin','route'), ('signup','route'), ('login','route'), ('logout','route'),
  ('settings','route'), ('profile','route'), ('new','route'), ('edit','route'),
  ('me','route'), ('p','route'),
  ('legal','policy'), ('privacy','policy'), ('terms','policy'),
  ('null','parser'), ('undefined','parser'), ('anonymous','parser')
on conflict (name) do nothing;

-- `p` is here because `icefall-app/src/routes/p.$slug.tsx` already owns that
-- path segment. A handle that shadows a route is a bug that only shows up in
-- production, on one person's profile.
--
-- Enforced in `claim_username`, not in a CHECK: a CHECK cannot reference another
-- table, and adding a reserved word should not rewrite `profiles`.
comment on table public.reserved_usernames is
  'Handles nobody may claim. Enforced by claim_username(), not by a constraint, so the list can grow without a migration.';

/* ========================================================================== */
/* 4. ATHLETE PROFILE — the onboarding answers, private to their owner         */
/* ========================================================================== */

create table if not exists public.athlete_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,

  -- Typed columns for the answers the product COMPUTES on. A bad value here
  -- should fail loudly rather than sit in a blob.
  experience            text,
  body_mass_kg          numeric(5,2),
  height_cm             smallint,
  birth_year            smallint,
  typical_session_min   smallint,
  training_days         smallint[] not null default '{}',   -- 0 = Sunday
  max_altitude_m        integer,

  -- Everything else. The questionnaire has already changed shape once; anything
  -- only RECORDED should not cost a migration when a question is reworded.
  answers               jsonb not null default '{}'::jsonb,
  answers_version       smallint not null default 1,

  onboarded_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint athlete_profiles_body_mass_sane
    check (body_mass_kg is null or (body_mass_kg > 20 and body_mass_kg < 400)),
  constraint athlete_profiles_height_sane
    check (height_cm is null or (height_cm between 50 and 260)),
  constraint athlete_profiles_birth_year_sane
    check (birth_year is null or (birth_year between 1900 and extract(year from now())::int)),
  constraint athlete_profiles_session_sane
    check (typical_session_min is null or (typical_session_min between 1 and 1440)),
  constraint athlete_profiles_altitude_sane
    check (max_altitude_m is null or (max_altitude_m between 0 and 9000)),
  constraint athlete_profiles_training_days_sane
    check (training_days <@ array[0,1,2,3,4,5,6]::smallint[])
);

alter table public.athlete_profiles enable row level security;

-- OWNER-ONLY, unlike `profiles`. This is the whole reason the table exists.
drop policy if exists athlete_profiles_select on public.athlete_profiles;
create policy athlete_profiles_select on public.athlete_profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists athlete_profiles_insert on public.athlete_profiles;
create policy athlete_profiles_insert on public.athlete_profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists athlete_profiles_update on public.athlete_profiles;
create policy athlete_profiles_update on public.athlete_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select, insert, update on public.athlete_profiles to authenticated;

drop trigger if exists athlete_profiles_touch on public.athlete_profiles;
create trigger athlete_profiles_touch before update on public.athlete_profiles
  for each row execute function public.touch_updated_at();

comment on table public.athlete_profiles is
  'The onboarding answers. Separate from profiles because profiles_select is using(true) — body mass and birth year on that table would be readable by every account on the platform. The SERVER copy is a sync target, not the source of truth: the app keeps working offline on localStorage.';

/* ========================================================================== */
/* 5. CLAIMING A USERNAME                                                     */
/* ========================================================================== */

create or replace function public.username_format_ok(candidate text)
returns boolean
language sql immutable
as $$
  select candidate is not null
     and candidate ~ '^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$'
     and candidate !~ '\.\.';
$$;

/**
 * Three alternatives, each free at the moment it was generated.
 * Returned in the SAME round trip as a rejection so the screen can offer them
 * without a second call the person has to wait for.
 */
create or replace function public.username_suggestions(base text)
returns text[]
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  root text := left(regexp_replace(lower(btrim(coalesce(base,''))), '[^a-z0-9]', '', 'g'), 14);
  out text[] := '{}';
  cand text;
  n int := 0;
begin
  if length(root) < 2 then root := 'climber'; end if;
  for cand in
    select c from unnest(array[
      root || '1', root || '.climbs', root || '_ice', root || '2',
      root || '.alp', root || '3', root || '_summit'
    ]) as c
  loop
    exit when n >= 3;
    if public.username_format_ok(cand)
       and not exists (select 1 from public.profiles p where p.username = cand)
       and not exists (select 1 from public.reserved_usernames r where r.name = cand)
    then
      out := out || cand; n := n + 1;
    end if;
  end loop;
  return out;
end;
$$;

/**
 * ADVISORY ONLY. Always stale by the time the button is pressed — two people can
 * both be told "available" and only one can win. That is not a flaw to engineer
 * away; it is why `claim_username` is built to fail politely.
 *
 * Granted to `authenticated` and NOT to `anon`, deliberately. `anon` has no read
 * on `profiles` at all, and granting this to `anon` would hand the internet a
 * scriptable oracle for enumerating who exists. It is also the second reason the
 * handle step belongs after the account exists rather than before.
 */
create or replace function public.username_available(candidate text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare c text := lower(btrim(coalesce(candidate, '')));
begin
  if not public.username_format_ok(c) then
    return jsonb_build_object('ok', false, 'reason', 'format');
  end if;
  if exists (select 1 from public.reserved_usernames r where r.name = c) then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;
  if exists (select 1 from public.profiles p where p.username = c) then
    return jsonb_build_object('ok', false, 'reason', 'taken',
                              'suggestions', public.username_suggestions(c));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

/**
 * THE ONLY CALL THAT DECIDES. Catching 23505 and returning a typed reason —
 * rather than letting it raise — is the entire point: the screen never parses a
 * Postgres error string, and it can never mistake "somebody took it a second
 * ago" for "the network died".
 */
create or replace function public.claim_username(candidate text)
returns jsonb
language plpgsql volatile security definer
set search_path to 'public', 'pg_temp'
as $$
declare c text := lower(btrim(coalesce(candidate, '')));
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if not public.username_format_ok(c) then
    return jsonb_build_object('ok', false, 'reason', 'format');
  end if;
  if exists (select 1 from public.reserved_usernames r where r.name = c) then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;

  begin
    update public.profiles set username = c where id = auth.uid();
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'taken',
                              'suggestions', public.username_suggestions(c));
  end;

  return jsonb_build_object('ok', true, 'username', c);
end;
$$;

/** Location is ordinary profile data and goes through the normal update path. */
create or replace function public.set_my_location(p_label text, p_country char(2))
returns jsonb
language plpgsql volatile security definer
set search_path to 'public', 'pg_temp'
as $$
declare l text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if l is not null and length(l) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'too_long');
  end if;
  if p_country is not null and p_country !~ '^[A-Z]{2}$' then
    return jsonb_build_object('ok', false, 'reason', 'country');
  end if;
  update public.profiles
     set location_label = l, country_code = p_country
   where id = auth.uid();
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.username_available(text) from public, anon;
revoke all on function public.claim_username(text) from public, anon;
revoke all on function public.username_suggestions(text) from public, anon;
revoke all on function public.set_my_location(text, char) from public, anon;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.claim_username(text) to authenticated;
grant execute on function public.set_my_location(text, char) to authenticated;

/* ========================================================================== */
/* 6. THE SELF-UPDATE POLICY MUST PIN `username` THE WAY IT PINS `role`       */
/* ========================================================================== */

-- Without this, the unique index still holds, but a handle could be changed by
-- a direct table update — losing any chance of a cooldown, a quarantine on
-- released names, or an audit trail when somebody reports impersonation.
-- Changes go through `claim_username` (SECURITY DEFINER) or not at all.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using ((id = (select auth.uid())) or public.is_admin())
  with check (
    (
      id = (select auth.uid())
      and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
      and username is not distinct from
          (select p.username from public.profiles p where p.id = (select auth.uid()))
    )
    or public.is_admin()
  );

/* ========================================================================== */
/* 7. `handle_new_user` — it currently BREAKS social login, three ways        */
/* ========================================================================== */

-- Any exception in this trigger rolls back the INSERT into `auth.users`. The
-- person then sees an opaque "Database error saving new user", has no account,
-- and has nothing to retry into. So every branch here must be total.
--
-- What was wrong, and why each becomes live the moment OAuth is enabled:
--
--   1. It read only `display_name`. Google, Apple and Microsoft never write that
--      key — they write `full_name`, `name`, `preferred_username` and
--      `picture`/`avatar_url`. So every social signup would have been named
--      after the local part of their email address.
--   2. A provider that returns NO email made `split_part(NULL,'@',1)` null, and
--      `display_name` is NOT NULL — signup would hard-fail and roll back.
--   3. `raw_user_meta_data` is caller-supplied, so a display name over 80
--      characters hit the CHECK and did the same thing.
--
-- IT STILL PASSES THE LITERAL 'athlete'. It reads metadata for `display_name`
-- and `avatar_url` ONLY. It must never read `role` — that is whatever the client
-- sent — and it must never read `username`, which is chosen on a screen after
-- the account exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nm   text;
  av   text;
begin
  nm := nullif(btrim(coalesce(
          meta ->> 'display_name',
          meta ->> 'full_name',
          meta ->> 'name',
          meta ->> 'preferred_username',
          nullif(split_part(coalesce(new.email, ''), '@', 1), '')
        )), '');
  nm := left(coalesce(nm, 'Climber'), 80);

  av := nullif(btrim(coalesce(meta ->> 'avatar_url', meta ->> 'picture')), '');
  if av is not null and left(av, 8) <> 'https://' then av := null; end if;

  insert into public.profiles (id, display_name, avatar_url, role)
  values (new.id, nm, av, 'athlete')
  on conflict (id) do nothing;

  return new;
end;
$$;

commit;
