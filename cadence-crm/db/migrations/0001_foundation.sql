-- Cadence CRM — Phase 1: authentication, multi-tenancy, and the database core.
--
-- THIS FILE IS THE PRODUCT'S SPINE. Everything in the 50-section spec — deals,
-- pipelines, activities, automations, reports — hangs off the tenancy model
-- established here, and the single most important guarantee is the one the spec
-- states twice (§29, §39): TENANT ISOLATION IS ENFORCED AT THE DATABASE, NEVER
-- IN THE FRONTEND. One installation serves many businesses; no query, however
-- it is constructed, may cross a tenant boundary.
--
-- HOW ISOLATION IS ENFORCED
--
-- Every business row carries a `tenant_id`. Row-level security is on and FORCED
-- on every table, default-deny, and the only way a row is visible is through a
-- `memberships` row proving the caller belongs to that tenant. The membership
-- test is a SECURITY DEFINER function (`is_member`) so a policy on one table can
-- consult membership without recursing through another table's policy — the same
-- pattern, and the same NULL-safety discipline (`coalesce(..., false)`), used and
-- tested in the ICEFALL backend.
--
-- A user is NOT a tenant. `profiles` is one row per auth user; `memberships` is
-- the user×tenant join that carries their role. This is deliberate: a
-- salesperson may consult for two companies, an agency may run several — a model
-- that fused user and tenant would make that impossible and, worse, tempt a
-- shortcut that leaks data across accounts.

/* ========================================================================== */
/* Roles                                                                      */
/* ========================================================================== */

-- The four built-in roles (§27). `owner` is the account holder; `admin` manages
-- settings and members; `manager` sees the team; `member` is a salesperson.
-- Granular per-object permissions (§28) layer on top in a later phase — this is
-- the RBAC floor everything else refines.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'tenant_role') then
    create type public.tenant_role as enum ('owner', 'admin', 'manager', 'member');
  end if;
end $$;

/* ========================================================================== */
/* Tenants and identity                                                       */
/* ========================================================================== */

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  industry text,
  -- Plan and limits live here so pricing changes without a code change (§40).
  plan text not null default 'free' check (plan in ('free','starter','pro','business','enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenants is 'A customer account. Every business row belongs to exactly one of these.';

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per authenticated user, independent of any tenant.';

-- The user×tenant join. A user with a row here is a member of that tenant, at
-- the given role. No row means no access — full stop.
create table if not exists public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.tenant_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (tenant_id, profile_id)
);

create index if not exists memberships_profile_idx on public.memberships (profile_id);

/* ========================================================================== */
/* Teams (§27)                                                                */
/* ========================================================================== */

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists teams_tenant_idx on public.teams (tenant_id);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (team_id, profile_id)
);

/* ========================================================================== */
/* Contacts — the first business object, here to prove isolation end to end   */
/* ========================================================================== */

-- Contacts belong to Phase 2, but a minimal version exists now as the seam the
-- whole tenant-isolation model is tested against: tenant A must never see tenant
-- B's people. The columns Phase 2 adds (custom fields, labels, owner, timeline)
-- build on this shape.
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_tenant_idx on public.contacts (tenant_id);
create index if not exists contacts_tenant_email_idx on public.contacts (tenant_id, lower(email));

/* ========================================================================== */
/* Audit log (§30)                                                            */
/* ========================================================================== */

-- Append-only: no update or delete policy for anyone. An audit trail you can
-- edit is not an audit trail.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index if not exists audit_log_tenant_idx on public.audit_log (tenant_id, at desc);

/* ========================================================================== */
/* Membership helpers (SECURITY DEFINER — the hinge of every policy)          */
/* ========================================================================== */

create or replace function public.is_member(t uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select true from public.memberships m
    where m.tenant_id = t and m.profile_id = auth.uid() limit 1
  ), false);
$$;

-- True when the caller holds one of the given roles in the tenant. Used to gate
-- writes that only an admin/owner may perform.
create or replace function public.has_tenant_role(t uuid, roles public.tenant_role[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select m.role = any(roles) from public.memberships m
    where m.tenant_id = t and m.profile_id = auth.uid() limit 1
  ), false);
$$;

create or replace function public.is_tenant_admin(t uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_tenant_role(t, array['owner','admin']::public.tenant_role[]);
$$;

/* ========================================================================== */
/* Row-level security                                                         */
/* ========================================================================== */

alter table public.tenants      enable row level security;
alter table public.profiles     enable row level security;
alter table public.memberships  enable row level security;
alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.contacts     enable row level security;
alter table public.audit_log    enable row level security;

alter table public.tenants      force row level security;
alter table public.memberships  force row level security;
alter table public.teams        force row level security;
alter table public.team_members force row level security;
alter table public.contacts     force row level security;
alter table public.audit_log    force row level security;

/* ---- tenants ------------------------------------------------------------- */
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select to authenticated using (public.is_member(id));

-- Only an owner or admin may rename the account or change its plan.
drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
  for update to authenticated using (public.is_tenant_admin(id)) with check (public.is_tenant_admin(id));

/* ---- profiles ------------------------------------------------------------ */
-- Readable by anyone who shares a tenant with you — you need to see your
-- colleagues' names — and by yourself.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships a
      join public.memberships b on a.tenant_id = b.tenant_id
      where a.profile_id = auth.uid() and b.profile_id = profiles.id
    )
  );

drop policy if exists profiles_upsert_self on public.profiles;
create policy profiles_upsert_self on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

/* ---- memberships --------------------------------------------------------- */
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated using (profile_id = auth.uid() or public.is_member(tenant_id));

-- Adding or changing members is an admin action. A member CANNOT elevate their
-- own role — the check requires admin rights in the tenant, which a member does
-- not have, so the update is refused before the new role is ever considered.
drop policy if exists memberships_write on public.memberships;
create policy memberships_write on public.memberships
  for all to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

/* ---- teams --------------------------------------------------------------- */
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated using (public.is_member(tenant_id));
drop policy if exists teams_write on public.teams;
create policy teams_write on public.teams
  for all to authenticated
  using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated using (
    exists (select 1 from public.teams t where t.id = team_id and public.is_member(t.tenant_id))
  );
drop policy if exists team_members_write on public.team_members;
create policy team_members_write on public.team_members
  for all to authenticated using (
    exists (select 1 from public.teams t where t.id = team_id and public.is_tenant_admin(t.tenant_id))
  ) with check (
    exists (select 1 from public.teams t where t.id = team_id and public.is_tenant_admin(t.tenant_id))
  );

/* ---- contacts — plain tenant isolation ---------------------------------- */
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select to authenticated using (public.is_member(tenant_id));
-- Any member may create and edit contacts in their own tenant, and only there:
-- both USING and WITH CHECK are scoped to membership, so a row cannot be read,
-- written, or moved into a tenant the caller does not belong to.
drop policy if exists contacts_write on public.contacts;
create policy contacts_write on public.contacts
  for all to authenticated
  using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));

/* ---- audit_log — read within tenant, append-only ------------------------ */
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select to authenticated using (public.is_member(tenant_id));
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert to authenticated with check (public.is_member(tenant_id) and actor_id = auth.uid());
-- No update, no delete, for anyone.

/* ========================================================================== */
/* Creating a tenant: the caller becomes its owner, atomically                */
/* ========================================================================== */

-- A brand-new user has a profile but no tenant. This is how the first one is
-- made: it creates the tenant AND the owner membership in one call, as the
-- definer, so there is never a window where a tenant exists with no owner (which
-- RLS would otherwise make unreachable and unrecoverable).
create or replace function public.create_tenant(p_name text, p_slug text, p_industry text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.tenants (name, slug, industry) values (p_name, p_slug, p_industry)
    returning id into new_id;
  insert into public.memberships (tenant_id, profile_id, role) values (new_id, auth.uid(), 'owner');
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id)
    values (new_id, auth.uid(), 'tenant.created', 'tenant', new_id);
  return new_id;
end $$;

/* ========================================================================== */
/* Triggers                                                                    */
/* ========================================================================== */

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists tenants_touch on public.tenants;
create trigger tenants_touch before update on public.tenants for each row execute function public.touch_updated_at();
drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();

-- A profile for every new auth user, so a signed-in user always has an identity
-- to attach memberships to.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

/* ========================================================================== */
/* Grants                                                                      */
/* ========================================================================== */

grant usage on schema public to authenticated;
grant select, update on public.tenants to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert on public.audit_log to authenticated;
grant execute on function public.create_tenant(text, text, text) to authenticated;

-- `anon` gets nothing. Every surface requires a session; the default grants
-- Supabase issues would otherwise expose these tables before a policy is read.
revoke all on public.tenants, public.profiles, public.memberships, public.teams,
  public.team_members, public.contacts, public.audit_log from anon;
