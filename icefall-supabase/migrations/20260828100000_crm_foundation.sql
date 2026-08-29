-- ICEFALL — internal business CRM: foundation.
--
-- The first migration of the commercial system. Everything the CRM does later —
-- placements, approvals, leads, bookings, commissions — hangs off the four
-- things established here: who counts as staff, an append-only record of what
-- staff did, the mountain catalogue, and the company.
--
-- WHY THIS IS A SEPARATE ROLE SYSTEM AND NOT A WIDER `icefall_role`
--
-- `icefall_role` already carries athlete/guide/operator/admin, and `is_admin()`
-- is the hinge of every policy in the foundation and chat migrations — 31
-- attack tests turn on it. Widening that enum to hold five internal job
-- functions would rewrite the meaning of `admin` underneath policies that
-- protect private correspondence, which is the single riskiest edit available
-- in this schema. So staff seniority lives in its own table: `admin` still means
-- "ICEFALL staff", and `staff_members.staff_role` says which desk they sit at.
-- A CRM policy requires BOTH. Adding a second gate can only ever narrow access.
--
-- WHY THE INTERNAL COLUMNS ARE A SEPARATE TABLE
--
-- Postgres RLS is row-level. If an operator can SELECT their own company row,
-- they can read every column on it — including the account owner, the sales
-- source, the priority and the internal notes. The specification is explicit
-- that operator users must never receive Icefall-internal commercial
-- information, so those columns do not live on a row the operator can reach.
-- `company_internal` is a 1:1 side table with staff-only policies. A column
-- cannot leak from a table the reader has no policy on.
--
-- WHY VERIFICATION CARRIES A COHERENCE CONSTRAINT
--
-- "Verified" here means one thing: documents were checked by ICEFALL. It does
-- not mean an issuing association was contacted, and it must never appear with
-- an invented check date. The constraint below makes a verified company without
-- a real reviewer and a real timestamp unrepresentable, and a check date on an
-- unverified company equally unrepresentable. The app cannot fabricate what the
-- database will not store.

/* ========================================================================== */
/* Staff                                                                      */
/* ========================================================================== */

do $$
begin
  if not exists (select 1 from pg_type where typname = 'icefall_staff_role') then
    create type public.icefall_staff_role as enum
      ('super_admin', 'sales', 'operations', 'finance', 'support');
  end if;
end
$$;

create table if not exists public.staff_members (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  staff_role public.icefall_staff_role not null,
  -- Revoking a leaver's access must not delete the history of what they did, so
  -- staff are deactivated rather than removed. Audit rows keep pointing here.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff_members is
  'ICEFALL internal staff. A row here PLUS profiles.role = ''admin'' is what makes someone staff.';

/* -------------------------------------------------------------------------- */
/* Staff helpers (SECURITY DEFINER — see the foundation migration's header)   */
/* -------------------------------------------------------------------------- */

-- Every one of these coalesces to FALSE. A SQL function over a row that does not
-- exist returns NULL, and NULL negated is still NULL — which sails straight
-- through `not ...`. The coalesce makes the absent case explicitly false.

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select s.active and p.role = 'admin'
    from public.staff_members s
    join public.profiles p on p.id = s.profile_id
    where s.profile_id = auth.uid()
  ), false);
$$;

create or replace function public.my_staff_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.staff_role::text
  from public.staff_members s
  join public.profiles p on p.id = s.profile_id
  where s.profile_id = auth.uid() and s.active and p.role = 'admin';
$$;

-- `super_admin` satisfies every desk. Roles are passed as text rather than the
-- enum so a policy can name a desk without the array literal needing a cast.
create or replace function public.has_staff_role(desks text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select s.active
       and p.role = 'admin'
       and (s.staff_role = 'super_admin' or s.staff_role::text = any(desks))
    from public.staff_members s
    join public.profiles p on p.id = s.profile_id
    where s.profile_id = auth.uid()
  ), false);
$$;

/* ========================================================================== */
/* Audit — append-only, enforced by trigger and not merely by policy          */
/* ========================================================================== */

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  -- `set null` on purpose: deleting a staff account must not erase the record of
  -- what that account did. `actor_role` is a snapshot, because a person who
  -- approved something as Operations should not read as Finance two years later
  -- because they changed desks.
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role text,
  action text not null check (length(trim(action)) between 1 and 80),
  entity_type text not null check (length(trim(entity_type)) between 1 and 60),
  -- text, not uuid: mountains are keyed by slug and some entities are composite.
  entity_id text not null,
  previous jsonb,
  next jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, created_at desc);
create index if not exists audit_events_actor_idx
  on public.audit_events (actor_id, created_at desc);
create index if not exists audit_events_created_idx
  on public.audit_events (created_at desc);

comment on table public.audit_events is
  'Append-only. Every commercially meaningful internal action. No UPDATE and no DELETE, for anyone.';

-- POLICY ALONE IS NOT ENOUGH HERE.
--
-- `messages` is protected by having no UPDATE/DELETE policy, which binds the
-- `authenticated` role the apps connect as. An audit log has to be stronger than
-- that: the whole value of the record is that nobody can go back and tidy it,
-- including whoever holds the service key. A trigger runs regardless of role and
-- regardless of RLS, so it holds where a policy does not.
--
-- Dropping these two triggers is the deliberate act that makes the log editable.
-- That is the point, and it is the same design as `credentials_verified`.
create or replace function public.audit_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events is append-only: % is not permitted', tg_op
    using hint = 'Correct a mistaken entry by recording a new event, not by editing the old one.';
end;
$$;

drop trigger if exists audit_events_no_update on public.audit_events;
create trigger audit_events_no_update before update on public.audit_events
  for each row execute function public.audit_events_append_only();

drop trigger if exists audit_events_no_delete on public.audit_events;
create trigger audit_events_no_delete before delete on public.audit_events
  for each row execute function public.audit_events_append_only();

/**
 * The only sanctioned way to write an audit event.
 *
 * Definer so that it can stamp `actor_id` from the session rather than trusting
 * a caller-supplied value — an audit trail where the actor is an argument is not
 * an audit trail.
 */
create or replace function public.record_audit_event(
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_previous    jsonb default null,
  p_next        jsonb default null,
  p_reason      text  default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if public.is_staff() is not true then
    raise exception 'only ICEFALL staff may record an audit event';
  end if;

  insert into public.audit_events
    (actor_id, actor_role, action, entity_type, entity_id, previous, next, reason)
  values
    (auth.uid(), public.my_staff_role(), p_action, p_entity_type, p_entity_id,
     p_previous, p_next, nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

/* ========================================================================== */
/* Mountains                                                                  */
/* ========================================================================== */

-- KEYED BY THE SLUG THE REST OF THE PRODUCT ALREADY USES.
--
-- `icefall-app`'s curated catalogue and `icefall-web`'s 252 trek records both
-- identify mountains as 'mont-blanc', 'matterhorn', 'everest'. A uuid primary
-- key here would mean a mapping table and two vocabularies for the same
-- mountain, which is exactly the duplication the specification forbids. A text
-- key means the consumer apps join straight onto this table.
create table if not exists public.destinations (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 120),
  range text,
  region text,
  country text,
  elevation_m int check (elevation_m is null or elevation_m between 0 and 9000),
  -- Whether the mountain is offered as marketplace inventory at all.
  listed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists destinations_region_idx on public.destinations (region);

/* ========================================================================== */
/* Companies                                                                  */
/* ========================================================================== */

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 120),
  legal_name text,
  logo_path text,
  description text,
  countries text[] not null default '{}',
  regions text[] not null default '{}',

  -- The commercial relationship, not the sales opportunity. The pipeline stage
  -- lives on `deals`; this is whether they are live on the marketplace.
  status text not null default 'prospect'
    check (status in ('prospect', 'onboarding', 'active', 'suspended', 'churned')),

  -- TRUST. `verified` means ICEFALL looked at documents. It does not mean the
  -- issuing association was contacted, and the CRM must never print or imply
  -- that it was.
  -- NAMED FOR WHAT IT ACTUALLY IS. `verified_at` invites the reading that some
  -- authority confirmed the company; `documents_checked_at` can only mean what
  -- it says. Session 04 asked for this and they are right — the surface renders
  -- "documents checked by ICEFALL on <date>" and must never imply more.
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected', 'suspended')),
  documents_checked_at timestamptz,
  documents_checked_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A verified company must carry a real reviewer and a real date; an unverified
  -- one must carry neither. This is what makes a fabricated check date
  -- unstorable rather than merely discouraged.
  constraint companies_verification_coherent check (
    (verification_status = 'verified'
       and documents_checked_at is not null and documents_checked_by is not null)
    or (verification_status <> 'verified'
       and documents_checked_at is null and documents_checked_by is null)
  )
);

create index if not exists companies_status_idx on public.companies (status);

comment on column public.companies.verification_status is
  'verified = documents checked by ICEFALL. Never an assertion that the issuing body was contacted.';

comment on column public.companies.documents_checked_at is
  'Set only by a real staff review. NULL renders as absent — never as a placeholder date.';

-- `public.operator_profiles` (foundation migration) is LEGACY as of this file.
-- It is keyed one-row-per-auth-user, which cannot express a company with several
-- staff logins, so `companies` + `company_users` supersede it. Left in place
-- rather than dropped: `icefall-app/src/backend/types.ts` still declares it, and
-- removing a table another session's generated types reference is not a change
-- to make from here. No new code should read or write it.
comment on table public.operator_profiles is
  'LEGACY — superseded by public.companies + public.company_users. Do not build on this.';

/* -------------------------------------------------------------------------- */
/* Company — internal-only columns, on a table operators cannot reach          */
/* -------------------------------------------------------------------------- */

create table if not exists public.company_internal (
  company_id uuid primary key references public.companies (id) on delete cascade,
  account_owner_id uuid references public.profiles (id) on delete set null,
  source text,
  priority text check (priority is null or priority in ('low', 'normal', 'high')),
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.company_internal is
  'ICEFALL-internal commercial fields. Split from `companies` because RLS is row-level: '
  'an operator who can read their own company row can read every column on it.';

/* -------------------------------------------------------------------------- */
/* Company users                                                              */
/* -------------------------------------------------------------------------- */

create table if not exists public.company_users (
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Two roles, deliberately. The operator portal is not an enterprise product
  -- and a configurable permission matrix is not wanted.
  company_role text not null check (company_role in ('admin', 'sales')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, profile_id)
);

create index if not exists company_users_profile_idx on public.company_users (profile_id);

/* -------------------------------------------------------------------------- */
/* Company ↔ mountain — the authorization boundary                            */
/* -------------------------------------------------------------------------- */

-- What an operator is allowed to edit is decided HERE, not by what they can see
-- in the marketplace. A company that has not been assigned Everest cannot touch
-- Everest content, whatever their placement record says.
create table if not exists public.company_destinations (
  company_id uuid not null references public.companies (id) on delete cascade,
  destination_id text not null references public.destinations (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended', 'ended')),
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  ended_at timestamptz,
  primary key (company_id, destination_id)
);

create index if not exists company_destinations_destination_idx on public.company_destinations (destination_id);

/* -------------------------------------------------------------------------- */
/* Membership helpers                                                         */
/* -------------------------------------------------------------------------- */

create or replace function public.is_company_member(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select true
    from public.company_users cu
    where cu.company_id = c and cu.profile_id = auth.uid() and cu.status = 'active'
    limit 1
  ), false);
$$;

create or replace function public.is_company_admin(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select true
    from public.company_users cu
    where cu.company_id = c and cu.profile_id = auth.uid()
      and cu.status = 'active' and cu.company_role = 'admin'
    limit 1
  ), false);
$$;

-- Both halves: an active membership AND an active mountain assignment.
create or replace function public.company_may_edit_destination(c uuid, m text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select true
    from public.company_users cu
    join public.company_destinations cm on cm.company_id = cu.company_id
    where cu.company_id = c and cu.profile_id = auth.uid() and cu.status = 'active'
      and cm.destination_id = m and cm.status = 'active'
    limit 1
  ), false);
$$;

-- Convenience for the operator portal, which is single-company by design.
-- Returns NULL rather than guessing when a person somehow belongs to several.
create or replace function public.my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cu.company_id
  from public.company_users cu
  where cu.profile_id = auth.uid() and cu.status = 'active'
  limit 1;
$$;

/* ========================================================================== */
/* Row-level security                                                         */
/* ========================================================================== */

alter table public.staff_members     enable row level security;
alter table public.audit_events      enable row level security;
alter table public.destinations         enable row level security;
alter table public.companies         enable row level security;
alter table public.company_internal  enable row level security;
alter table public.company_users     enable row level security;
alter table public.company_destinations enable row level security;

alter table public.company_internal  force row level security;

/* ---- staff_members ------------------------------------------------------- */

-- Staff can see the team. Nobody else can even learn that the table has rows —
-- a list of who works at ICEFALL and on which desk is internal.
drop policy if exists staff_members_select on public.staff_members;
create policy staff_members_select on public.staff_members
  for select to authenticated
  using (public.is_staff());

-- Only a super admin appoints or removes staff. Sales cannot promote itself to
-- Finance, which is the whole point of separating the desks.
drop policy if exists staff_members_write on public.staff_members;
create policy staff_members_write on public.staff_members
  for all to authenticated
  using (public.has_staff_role(array['super_admin']))
  with check (public.has_staff_role(array['super_admin']));

/* ---- audit_events -------------------------------------------------------- */

drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (public.is_staff());

drop policy if exists audit_events_insert on public.audit_events;
create policy audit_events_insert on public.audit_events
  for insert to authenticated
  with check (public.is_staff() and actor_id = auth.uid());

-- No UPDATE and no DELETE policy exists, for anyone, including a super admin.
-- The triggers above enforce the same thing one level lower down.

/* ---- mountains ----------------------------------------------------------- */

-- The catalogue is the shared vocabulary of the whole product; any signed-in
-- user may read it. Only Operations changes inventory.
drop policy if exists mountains_select on public.destinations;
create policy mountains_select on public.destinations
  for select to authenticated
  using (true);

drop policy if exists mountains_write on public.destinations;
create policy mountains_write on public.destinations
  for all to authenticated
  using (public.has_staff_role(array['operations']))
  with check (public.has_staff_role(array['operations']));

/* ---- companies ----------------------------------------------------------- */

-- Staff see every company. A company user sees their own. Nobody else sees any:
-- the operator directory the consumer app renders is built from approved,
-- published content, not from this table.
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to authenticated
  using (public.is_staff() or public.is_company_member(id));

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies
  for insert to authenticated
  with check (public.has_staff_role(array['sales', 'operations']));

-- An operator may NOT update their company row directly. Every operator-facing
-- edit goes through a pending content version and an ICEFALL approval; letting
-- them write here would route around the entire approval engine.
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
  for update to authenticated
  using (public.has_staff_role(array['sales', 'operations']))
  with check (public.has_staff_role(array['sales', 'operations']));

drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies
  for delete to authenticated
  using (public.has_staff_role(array['super_admin']));

/* ---- company_internal ---------------------------------------------------- */

-- Staff only, in every direction. There is deliberately no operator-facing
-- policy on this table at all.
drop policy if exists company_internal_all on public.company_internal;
create policy company_internal_all on public.company_internal
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

/* ---- company_users ------------------------------------------------------- */

drop policy if exists company_users_select on public.company_users;
create policy company_users_select on public.company_users
  for select to authenticated
  using (public.is_staff() or profile_id = auth.uid() or public.is_company_member(company_id));

-- A company admin manages their own team; ICEFALL staff can too. A sales
-- employee at the company cannot add colleagues.
drop policy if exists company_users_write on public.company_users;
create policy company_users_write on public.company_users
  for all to authenticated
  using (public.has_staff_role(array['sales', 'operations', 'support']) or public.is_company_admin(company_id))
  with check (public.has_staff_role(array['sales', 'operations', 'support']) or public.is_company_admin(company_id));

/* ---- company_destinations --------------------------------------------------- */

-- An operator may SEE which mountains they hold. Only ICEFALL grants them.
drop policy if exists company_destinations_select on public.company_destinations;
create policy company_destinations_select on public.company_destinations
  for select to authenticated
  using (public.is_staff() or public.is_company_member(company_id));

drop policy if exists company_destinations_write on public.company_destinations;
create policy company_destinations_write on public.company_destinations
  for all to authenticated
  using (public.has_staff_role(array['operations']))
  with check (public.has_staff_role(array['operations']));

/* ========================================================================== */
/* Triggers                                                                   */
/* ========================================================================== */

drop trigger if exists staff_members_touch on public.staff_members;
create trigger staff_members_touch before update on public.staff_members
  for each row execute function public.touch_updated_at();

drop trigger if exists destinations_touch on public.destinations;
create trigger destinations_touch before update on public.destinations
  for each row execute function public.touch_updated_at();

drop trigger if exists companies_touch on public.companies;
create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();

drop trigger if exists company_internal_touch on public.company_internal;
create trigger company_internal_touch before update on public.company_internal
  for each row execute function public.touch_updated_at();

drop trigger if exists company_users_touch on public.company_users;
create trigger company_users_touch before update on public.company_users
  for each row execute function public.touch_updated_at();

/* ========================================================================== */
/* Grants                                                                     */
/* ========================================================================== */

grant select, insert, update, delete on public.staff_members     to authenticated;
-- Deliberately no UPDATE or DELETE on the audit log. See the triggers above.
grant select, insert                 on public.audit_events       to authenticated;
grant select, insert, update, delete on public.destinations          to authenticated;
grant select, insert, update, delete on public.companies          to authenticated;
grant select, insert, update, delete on public.company_internal   to authenticated;
grant select, insert, update, delete on public.company_users      to authenticated;
grant select, insert, update, delete on public.company_destinations  to authenticated;

-- `anon` gets nothing. Supabase's default privileges hand the anonymous role
-- access to every new table in `public`, so this revoke is not decoration —
-- omitting it leaves the whole commercial system readable before a single
-- policy is consulted.
revoke all on public.staff_members     from anon;
revoke all on public.audit_events      from anon;
revoke all on public.destinations         from anon;
revoke all on public.companies         from anon;
revoke all on public.company_internal  from anon;
revoke all on public.company_users     from anon;
revoke all on public.company_destinations from anon;

-- Same problem, one level up: EXECUTE on a new function is granted to PUBLIC by
-- default, and PUBLIC includes `anon`. Revoking from PUBLIC alone is not enough
-- if a direct grant exists, so both are named.
revoke all on function public.record_audit_event(text, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.record_audit_event(text, text, text, jsonb, jsonb, text) to authenticated;

revoke all on function public.is_staff()                          from public, anon;
revoke all on function public.my_staff_role()                     from public, anon;
revoke all on function public.has_staff_role(text[])              from public, anon;
revoke all on function public.my_company_id()                     from public, anon;
revoke all on function public.is_company_member(uuid)             from public, anon;
revoke all on function public.is_company_admin(uuid)              from public, anon;
revoke all on function public.company_may_edit_destination(uuid, text) from public, anon;

grant execute on function public.is_staff()                          to authenticated;
grant execute on function public.my_staff_role()                     to authenticated;
grant execute on function public.has_staff_role(text[])              to authenticated;
grant execute on function public.my_company_id()                     to authenticated;
grant execute on function public.is_company_member(uuid)             to authenticated;
grant execute on function public.is_company_admin(uuid)              to authenticated;
grant execute on function public.company_may_edit_destination(uuid, text) to authenticated;
