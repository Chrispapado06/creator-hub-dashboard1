-- =====================================================================
-- OFM Workspace — Auth + RBAC + Team-Invite FOUNDATION (canonical)
-- File: supabase/migrations/20260729120000_auth_rbac_foundation.sql
--
-- CORE DECISIONS
--  * role + status live in public.memberships, keyed unique(workspace_id,user_id)
--    -> role is a property of the (user, workspace) pair => multi-workspace-ready.
--  * profiles is 1:1 with auth.users and holds identity/PII ONLY (never authZ).
--  * Membership/role are NEVER minted by an email-matching DB trigger. They are
--    created ONLY by the service_role Edge Functions (invite/deactivate) or the
--    one-time service_role bootstrap SQL. This closes the whole "self-register
--    with an email that has a pending invite -> auto-granted role" backdoor.
--  * handle_new_user() creates the PROFILE only (fail-closed: no invite = no access).
--
-- ANTI-RECURSION (Postgres 42P17)
--  * Every role/membership check used inside a policy goes through a SECURITY
--    DEFINER helper (STABLE, search_path pinned to '', fully-qualified names).
--    A definer function runs as its owner (postgres = table owner, exempt from
--    RLS unless FORCE is set), so reading memberships inside a memberships policy
--    does NOT re-enter the policy. No policy ever subqueries its own table.
--  * DO NOT `alter table ... force row level security` on these tables — FORCE
--    subjects the owner-run helpers to RLS and reintroduces 42P17. Keep these
--    tables owned by postgres.
-- =====================================================================

-- 0. Extensions ------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive email

-- Shared updated_at trigger fn (pinned search_path; now() is in pg_catalog)
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. Enums -----------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('owner','manager','chatter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_status as enum ('active','deactivated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invite_status as enum ('pending','accepted','revoked','expired');
exception when duplicate_object then null; end $$;

-- 2. Tables ----------------------------------------------------------

-- 2a. workspaces (one shared workspace in v1; modelled for many)
create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'OFM Workspace',
  slug       citext unique not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2b. profiles (1:1 with auth.users; identity/PII ONLY — no authZ columns)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      citext unique not null,
  full_name  text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2c. memberships (role + access state; source of truth for authZ)
-- user_id references auth.users (NOT profiles) so the Edge Function can create a
-- membership immediately after inviteUserByEmail without depending on the
-- profile-creation trigger having committed first.
create table if not exists public.memberships (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id)        on delete cascade,
  role         public.app_role          not null default 'chatter',
  status       public.membership_status not null default 'active',
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists memberships_user_status_idx on public.memberships (user_id, status);
create index if not exists memberships_ws_role_idx     on public.memberships (workspace_id, role, status);

-- 2d. invites (audit / "an email invite was sent" record)
create table if not exists public.invites (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  email            citext not null,
  role             public.app_role      not null default 'chatter',
  status           public.invite_status not null default 'pending',
  invited_by       uuid references auth.users(id) on delete set null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  expires_at       timestamptz not null default (now() + interval '7 days'),
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (workspace_id, email)            -- one invite row per email per ws (re-invite upserts)
);
create index if not exists invites_ws_status_idx on public.invites (workspace_id, status);
create index if not exists invites_email_idx     on public.invites (email);

-- 2e. Seed the single v1 workspace (benign; NO owner/invite seeded — bootstrap
--     is an explicit service_role act, see apply instructions). Edit name/slug.
insert into public.workspaces (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'OFM Workspace', 'ofm')
on conflict (id) do nothing;

-- updated_at triggers
drop trigger if exists trg_workspaces_updated  on public.workspaces;
create trigger trg_workspaces_updated  before update on public.workspaces  for each row execute function public.set_updated_at();
drop trigger if exists trg_profiles_updated    on public.profiles;
create trigger trg_profiles_updated    before update on public.profiles    for each row execute function public.set_updated_at();
drop trigger if exists trg_memberships_updated on public.memberships;
create trigger trg_memberships_updated before update on public.memberships for each row execute function public.set_updated_at();
drop trigger if exists trg_invites_updated     on public.invites;
create trigger trg_invites_updated     before update on public.invites     for each row execute function public.set_updated_at();

-- 3. SECURITY DEFINER helpers (the 42P17 fix + the authoritative authZ gate)
--    They read LIVE table state, so a deactivation (status flip) denies the very
--    next statement even while the user still holds an unexpired access token.

create or replace function public.membership_role(p_workspace uuid)
returns public.app_role
language sql stable security definer set search_path = '' as $$
  select m.role
  from public.memberships m
  where m.user_id = auth.uid()
    and m.workspace_id = p_workspace
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.is_active_member(p_workspace uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select public.membership_role(p_workspace) is not null;
$$;

-- Any active membership at all (drives self-scoped policies so that self-access
-- dies immediately on deactivation — see profiles / memberships SELECT).
create or replace function public.is_active_member_any()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function public.is_owner(p_workspace uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select public.membership_role(p_workspace) = 'owner'::public.app_role;
$$;

create or replace function public.is_manager_or_owner(p_workspace uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select public.membership_role(p_workspace)
         in ('owner'::public.app_role, 'manager'::public.app_role);
$$;

-- Do the current user and p_other share an ACTIVE workspace? (co-worker reads)
create or replace function public.shares_workspace(p_other uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships me
    join public.memberships them on them.workspace_id = me.workspace_id
    where me.user_id = auth.uid() and me.status = 'active'
      and them.user_id = p_other  and them.status = 'active'
  );
$$;

-- Can the current user (active owner/manager) manage p_id's profile — even when
-- p_id is DEACTIVATED (so the admin Members screen can still show their name)?
create or replace function public.can_manage_profile(p_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships me
    join public.memberships them on them.workspace_id = me.workspace_id
    where me.user_id = auth.uid()
      and me.status = 'active'
      and me.role in ('owner'::public.app_role,'manager'::public.app_role)
      and them.user_id = p_id            -- any status
  );
$$;

-- 4. handle_new_user: create the PROFILE only. No membership, no invite match.
--    (Membership/role come exclusively from the service_role Edge Functions.)
--    NOTE: we insert new.email (text) into a citext column; the text->citext
--    coercion is resolved by pg_cast OID, so it is SAFE under search_path=''.
--    (An explicit ::citext cast would NOT be — do not add one.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5a. Self-guard: a user JWT may NEVER change its own role/status. auth.uid()
--     reflects the caller even inside SECURITY DEFINER RPCs. service_role
--     (Edge Functions) is exempt because it enforces its own checks.
create or replace function public.enforce_membership_self_guard()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role','') = 'service_role' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.user_id = auth.uid()
     and (new.role is distinct from old.role
          or new.status is distinct from old.status) then
    raise exception 'You cannot change your own role or status' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_membership_self_guard on public.memberships;
create trigger trg_membership_self_guard
  before update on public.memberships
  for each row execute function public.enforce_membership_self_guard();

-- 5b. Last-active-owner invariant, enforced at the DB for EVERY path (Edge
--     Function, RPC, dashboard edit, direct SQL, even a multi-row UPDATE).
--     It is a CONSTRAINT TRIGGER (AFTER, per row): by the time it runs, all
--     rows changed by the statement are visible, so `UPDATE ... WHERE
--     role='owner'` demoting two owners at once is still caught (fixes the
--     per-row BEFORE-trigger snapshot bypass).
create or replace function public.enforce_last_owner()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := coalesce(old.workspace_id, new.workspace_id);
  v_active_owners int;
begin
  select count(*) into v_active_owners
  from public.memberships m
  where m.workspace_id = v_ws
    and m.role = 'owner'::public.app_role
    and m.status = 'active';

  if v_active_owners = 0 then
    raise exception 'Workspace % must retain at least one active owner', v_ws
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_last_owner on public.memberships;
create constraint trigger trg_last_owner
  after update or delete on public.memberships
  deferrable initially immediate
  for each row execute function public.enforce_last_owner();

-- 6. Owner-only RPC for in-app ROLE changes (no auth-admin side effects needed,
--    so it does not require the Edge Function). Deactivation is NOT offered as
--    an RPC — it must go through the Edge Function so it also bans + revokes
--    sessions. Re-checks is_owner() and refuses self; DB triggers back it up.
create or replace function public.set_member_role(
  p_user uuid, p_workspace uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner(p_workspace) then
    raise exception 'Only an active owner can change roles' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  update public.memberships
     set role = p_role, updated_at = now()
   where user_id = p_user and workspace_id = p_workspace;
  if not found then raise exception 'Membership not found'; end if;
end;
$$;

-- Client calls this once after first login to mark its own pending invite(s)
-- accepted. It ONLY updates invite audit rows for the caller's confirmed email;
-- it grants NO access (so it cannot be an escalation vector).
create or replace function public.accept_my_invites()
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if auth.email() is null then return 0; end if;
  update public.invites
     set status = 'accepted', accepted_at = now(), accepted_user_id = auth.uid()
   where email = auth.email()
     and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Service_role-only: force-logout a user by deleting their GoTrue sessions
-- (called by the deactivate Edge Function so refresh tokens die immediately).
create or replace function public.revoke_user_sessions(p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.sessions where user_id = p_user;
end;
$$;

-- 7. (OPTIONAL) Custom Access Token Hook — stamps {workspace_id: role} into the
--    JWT for role-aware UI ONLY. It is explicitly NOT the security gate: a JWT
--    stays valid until it expires, so all authoritative checks stay DB-backed
--    (=> deactivation is immediate). Enable in Dashboard > Auth > Hooks.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  claims   jsonb := coalesce(event->'claims', '{}'::jsonb);
  ws_roles jsonb;
begin
  select coalesce(
           jsonb_object_agg(m.workspace_id::text, m.role::text)
             filter (where m.status = 'active'),
           '{}'::jsonb)
    into ws_roles
  from public.memberships m
  where m.user_id = (event->>'user_id')::uuid;

  claims := jsonb_set(claims, '{app_metadata,workspace_roles}', ws_roles, true);
  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

-- 8. Enable RLS on EVERY table (never FORCE — see header)
alter table public.workspaces  enable row level security;
alter table public.profiles    enable row level security;
alter table public.memberships enable row level security;
alter table public.invites     enable row level security;

-- 9. Policies --------------------------------------------------------

-- workspaces: active members read; owners update (name only, via column grant)
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select to authenticated
  using ( public.is_active_member(id) );

drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces
  for update to authenticated
  using ( public.is_owner(id) )
  with check ( public.is_owner(id) );
-- no insert/delete policy => denied for clients (bootstrap/service_role only)

-- profiles: self (only while active) + co-members + admin-of-member can read;
-- self updates limited to full_name/avatar_url by column grant.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    (id = auth.uid() and public.is_active_member_any())
    or public.shares_workspace(id)
    or public.can_manage_profile(id)
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using ( id = auth.uid() and public.is_active_member_any() )
  with check ( id = auth.uid() and public.is_active_member_any() );
-- insert handled by handle_new_user() (definer); no client insert/delete policy

-- memberships: read own row (only while active) + owners/managers read roster.
-- NO write policy for authenticated => all writes go via RPC / service_role.
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    (user_id = auth.uid() and public.is_active_member(workspace_id))
    or public.is_manager_or_owner(workspace_id)
  );

-- invites: owners only (user management is owner-only).
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select to authenticated
  using ( public.is_owner(workspace_id) );
-- writes only via the invite Edge Function (service_role)

-- 10. Privilege hardening (defense-in-depth, independent of RLS) -----
-- Supabase default privileges GRANT ALL on new public tables to anon+authenticated.
-- Strip everything, then grant the minimum so writes truly require service_role.
revoke all on public.workspaces, public.profiles, public.memberships, public.invites
  from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;   -- id/email NOT grantable

grant select on public.memberships to authenticated;   -- NO insert/update/delete
grant select on public.invites     to authenticated;   -- NO insert/update/delete

-- service_role bypasses RLS but still needs table privileges:
grant all on public.workspaces, public.profiles, public.memberships, public.invites
  to service_role;

-- 11. Function privileges. Postgres grants EXECUTE to PUBLIC by default: revoke,
--     then grant narrowly. Trigger fns + revoke_user_sessions are NOT for clients.
revoke execute on function
  public.membership_role(uuid),
  public.is_active_member(uuid),
  public.is_active_member_any(),
  public.is_owner(uuid),
  public.is_manager_or_owner(uuid),
  public.shares_workspace(uuid),
  public.can_manage_profile(uuid),
  public.set_member_role(uuid, uuid, public.app_role),
  public.accept_my_invites(),
  public.revoke_user_sessions(uuid)
from public;

grant execute on function
  public.membership_role(uuid),
  public.is_active_member(uuid),
  public.is_active_member_any(),
  public.is_owner(uuid),
  public.is_manager_or_owner(uuid),
  public.shares_workspace(uuid),
  public.can_manage_profile(uuid),
  public.set_member_role(uuid, uuid, public.app_role),
  public.accept_my_invites()
to authenticated;

grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- Custom access token hook is executed by the auth admin role only.
grant usage on schema public to supabase_auth_admin;
grant select on public.memberships to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- =====================================================================
-- END migration
-- =====================================================================
