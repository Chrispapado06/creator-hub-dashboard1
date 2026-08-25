-- ICEFALL — foundation: identity, roles, and the messaging spine.
--
-- This is the first ICEFALL migration. Until now the whole app ran on
-- localStorage, which meant nothing was ever really sent: the guide inbox was a
-- convincing simulation of a conversation that had no second party. This schema
-- is what makes an athlete's message actually reach a guide.
--
-- THE THING THIS SCHEMA IS MOST RESPONSIBLE FOR
--
-- A thread between an athlete and a mountain guide contains a person's plans,
-- their dates, their experience level and their judgement about their own
-- ability. That is private correspondence, and there is exactly one rule that
-- protects it: row-level security. Every table below is RLS-enabled with a
-- default-deny posture, and access is granted only through membership of a
-- thread. There is no "authenticated users can read messages" policy anywhere in
-- this file, and none may be added.
--
-- WHY THE HELPER FUNCTIONS ARE SECURITY DEFINER
--
-- A policy on `threads` that queries `thread_participants`, whose own policy
-- queries `threads`, recurses until Postgres gives up. The membership tests are
-- therefore SECURITY DEFINER functions with a pinned `search_path`, which read
-- the membership table directly and are not themselves subject to RLS. They take
-- no user-supplied predicate — only an id — so they cannot be used to read
-- anything but a yes/no answer about the caller.
--
-- Every one of them coalesces to FALSE. A SQL function over a row that does not
-- exist returns NULL, and `NULL` in a USING clause is not true — but written the
-- other way round (`not is_owner(...)`) a NULL would sail straight through the
-- negation. The coalesce makes the absent case explicitly false wherever the
-- result is read.

-- No extensions are required. `gen_random_uuid()` has been in core Postgres
-- since 13 and Supabase runs 15+, so the usual `create extension pgcrypto` is
-- dead weight here — and an extension this file does not need is one more thing
-- that has to exist for the migration to apply.

/* ========================================================================== */
/* Roles                                                                      */
/* ========================================================================== */

-- Four kinds of account, and the difference is not cosmetic: it decides whose
-- private correspondence you can read.
--
--   athlete   the person training for a mountain. The default.
--   guide     an individual holding a guiding qualification.
--   operator  a company that runs expeditions.
--   admin     ICEFALL staff.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'icefall_role') then
    create type public.icefall_role as enum ('athlete', 'guide', 'operator', 'admin');
  end if;
end
$$;

/* ========================================================================== */
/* Profiles                                                                   */
/* ========================================================================== */

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.icefall_role not null default 'athlete',
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user. `role` is not self-serviceable — see the update policy.';

/* ========================================================================== */
/* Helpers (SECURITY DEFINER — see the header)                                */
/* ========================================================================== */

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.my_role()
returns public.icefall_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

/* ========================================================================== */
/* Provider profiles                                                          */
/* ========================================================================== */

-- A guide is a PERSON holding a qualification issued to them by name.
create table if not exists public.guide_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  headline text,
  based_in text,
  specialities text[] not null default '{}',
  mountains text[] not null default '{}',
  languages text[] not null default '{}',
  years_guiding int check (years_guiding is null or years_guiding between 0 and 70),
  daily_rate_eur numeric(10, 2) check (daily_rate_eur is null or daily_rate_eur >= 0),
  availability text not null default 'available'
    check (availability in ('available', 'limited', 'unavailable')),
  bio text,

  -- ICEFALL VERIFIES NOTHING, AND THE DATABASE ENFORCES THAT.
  --
  -- The app types its credential `verified` flag as the literal `false` so no
  -- code path can set it true. The same guarantee belongs here, because a tick
  -- beside "IFMGA" is the whole of what stops a client asking to see the carnet,
  -- and on glaciated ground that is their only protection. The CHECK is not
  -- decoration: it means the claim cannot become true by an UPDATE, a bad
  -- migration, or someone with service-role credentials being careless.
  --
  -- When a real registry check exists, dropping this constraint is the
  -- deliberate act that turns it on. That is the point.
  credentials_verified boolean not null default false
    check (credentials_verified = false),

  -- Whether the directory shows them. Off until they choose to be listed.
  listed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operator_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  company_name text not null check (length(trim(company_name)) between 1 and 120),
  certification text,
  regions text[] not null default '{}',
  min_elevation_m int check (min_elevation_m is null or min_elevation_m between 0 and 9000),
  response_hours int check (response_hours is null or response_hours between 0 and 720),
  blurb text,
  listed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* ========================================================================== */
/* Threads                                                                    */
/* ========================================================================== */

-- A conversation about an objective.
--
-- Modelled with a participants table rather than two columns on the thread.
-- Two-party is all the product needs today, but expedition parties talk as a
-- group, and retrofitting that onto `athlete_id`/`guide_id` would mean rewriting
-- every policy in this file — the riskiest edit possible on a table holding
-- private correspondence.
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  -- What it is about. Denormalised on purpose: the objective as it stood when
  -- the enquiry was written is part of the record, and must not change under the
  -- conversation if a goal is later edited.
  peak_name text,
  peak_elevation_m int check (peak_elevation_m is null or peak_elevation_m between 0 and 9000),
  from_date date,
  to_date date,
  group_size int check (group_size is null or group_size between 1 and 40),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint threads_dates_ordered check (from_date is null or to_date is null or from_date <= to_date)
);

create table if not exists public.thread_participants (
  thread_id uuid not null references public.threads (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Per-participant, so "unread" is a fact about a person, not about a message.
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (thread_id, profile_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 8000),
  created_at timestamptz not null default now()
);

-- The reads a conversation performs constantly.
create index if not exists messages_thread_created_idx
  on public.messages (thread_id, created_at desc);
create index if not exists thread_participants_profile_idx
  on public.thread_participants (profile_id);
create index if not exists threads_last_message_idx
  on public.threads (last_message_at desc);

/* -------------------------------------------------------------------------- */
/* Membership test — the hinge every messaging policy turns on                */
/* -------------------------------------------------------------------------- */

create or replace function public.is_thread_participant(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select true
    from public.thread_participants tp
    where tp.thread_id = t and tp.profile_id = auth.uid()
    limit 1
  ), false);
$$;

/* ========================================================================== */
/* Row-level security                                                         */
/* ========================================================================== */

alter table public.profiles            enable row level security;
alter table public.guide_profiles      enable row level security;
alter table public.operator_profiles   enable row level security;
alter table public.threads             enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages            enable row level security;

-- Force RLS for table owners too, so a mistake in a definer function or a
-- migration run as the owner cannot quietly read past these policies.
alter table public.threads             force row level security;
alter table public.thread_participants force row level security;
alter table public.messages            force row level security;

/* ---- profiles ------------------------------------------------------------ */

-- Readable by any signed-in user: a display name and avatar are what make a
-- conversation legible. Nothing sensitive lives on this table.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role = 'athlete');

-- You may edit your own profile but NOT your own role. Self-promotion to admin
-- would hand the whole message store to anyone who signs up, so the role column
-- is pinned to its current value unless an admin is making the change.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (
    (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()))
    or public.is_admin()
  );

/* ---- provider profiles --------------------------------------------------- */

-- A listed provider is public to signed-in users; an unlisted one is visible
-- only to its owner and to staff.
drop policy if exists guide_profiles_select on public.guide_profiles;
create policy guide_profiles_select on public.guide_profiles
  for select to authenticated
  using (listed or id = auth.uid() or public.is_admin());

drop policy if exists guide_profiles_write on public.guide_profiles;
create policy guide_profiles_write on public.guide_profiles
  for all to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists operator_profiles_select on public.operator_profiles;
create policy operator_profiles_select on public.operator_profiles
  for select to authenticated
  using (listed or id = auth.uid() or public.is_admin());

drop policy if exists operator_profiles_write on public.operator_profiles;
create policy operator_profiles_write on public.operator_profiles
  for all to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

/* ---- threads ------------------------------------------------------------- */

drop policy if exists threads_select on public.threads;
create policy threads_select on public.threads
  for select to authenticated
  using (public.is_thread_participant(id) or public.is_admin());

drop policy if exists threads_insert on public.threads;
create policy threads_insert on public.threads
  for insert to authenticated
  with check (created_by = auth.uid());

-- Participants may close a thread. Nobody may rewrite what it was about: the
-- objective, dates and party size are the record of what was actually asked.
drop policy if exists threads_update on public.threads;
create policy threads_update on public.threads
  for update to authenticated
  using (public.is_thread_participant(id) or public.is_admin())
  with check (public.is_thread_participant(id) or public.is_admin());

/* ---- participants -------------------------------------------------------- */

drop policy if exists thread_participants_select on public.thread_participants;
create policy thread_participants_select on public.thread_participants
  for select to authenticated
  using (profile_id = auth.uid() or public.is_thread_participant(thread_id) or public.is_admin());

-- Adding people to a conversation is deliberately narrow: you may add yourself
-- only to a thread you created, and an existing participant may bring in one
-- more party. Anything looser lets a stranger insert themselves into a private
-- correspondence, which is the worst thing this schema could permit.
drop policy if exists thread_participants_insert on public.thread_participants;
create policy thread_participants_insert on public.thread_participants
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.threads t
      where t.id = thread_id and t.created_by = auth.uid()
    )
    or public.is_thread_participant(thread_id)
  );

-- Marking your own place in the conversation. Only your own row.
drop policy if exists thread_participants_update_self on public.thread_participants;
create policy thread_participants_update_self on public.thread_participants
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

/* ---- messages ------------------------------------------------------------ */

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (public.is_thread_participant(thread_id) or public.is_admin());

-- You can only write as yourself, and only into a thread you are in. Both halves
-- matter: the first stops messages being forged in someone else's name, the
-- second stops them being posted into a conversation you are not part of.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_thread_participant(thread_id));

-- No UPDATE and no DELETE policy exists, for anyone, including admin. A message
-- is a record of what was said. Editing it after the fact would let either side
-- of a commercial conversation rewrite what they agreed to, and the athlete is
-- the party with less power in that exchange.

/* ========================================================================== */
/* Triggers                                                                   */
/* ========================================================================== */

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists guide_profiles_touch on public.guide_profiles;
create trigger guide_profiles_touch before update on public.guide_profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists operator_profiles_touch on public.operator_profiles;
create trigger operator_profiles_touch before update on public.operator_profiles
  for each row execute function public.touch_updated_at();

-- Keeps the inbox ordered without a correlated subquery on every list render.
create or replace function public.bump_thread_last_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.threads
     set last_message_at = new.created_at
   where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists messages_bump_thread on public.messages;
create trigger messages_bump_thread after insert on public.messages
  for each row execute function public.bump_thread_last_message();

-- A profile for every new auth user, so the app never has a signed-in user with
-- nothing to join against. Role is always 'athlete' here; staff and providers
-- are promoted deliberately, never by signing up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    'athlete'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

/* ========================================================================== */
/* Grants                                                                     */
/* ========================================================================== */

-- Table privileges are the floor; RLS above is the ceiling. Both are needed —
-- RLS does nothing on a table the role cannot reach, and a grant does nothing
-- without a policy.
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.guide_profiles to authenticated;
grant select, insert, update, delete on public.operator_profiles to authenticated;
grant select, insert, update on public.threads to authenticated;
grant select, insert, update, delete on public.thread_participants to authenticated;
-- Deliberately no UPDATE or DELETE on messages. See the note above the policies.
grant select, insert on public.messages to authenticated;

-- `anon` gets nothing. Every surface built on this schema requires a session,
-- and the default privileges Supabase grants would otherwise leave these tables
-- reachable before a single policy is consulted.
revoke all on public.profiles            from anon;
revoke all on public.guide_profiles      from anon;
revoke all on public.operator_profiles   from anon;
revoke all on public.threads             from anon;
revoke all on public.thread_participants from anon;
revoke all on public.messages            from anon;

/* ========================================================================== */
/* Realtime                                                                   */
/* ========================================================================== */

-- Realtime respects RLS, so a subscriber is only sent rows their policies allow.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.threads;
  end if;
exception
  when duplicate_object then null;
end
$$;
