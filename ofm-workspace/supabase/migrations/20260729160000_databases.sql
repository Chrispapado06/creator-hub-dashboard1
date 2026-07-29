-- =====================================================================
-- OFM Workspace — Step 3: Databases (records with typed properties + views)
-- Reuses Step 1 helpers; adds SECURITY DEFINER helpers so child-table policies
-- resolve the parent database's workspace without recursion.
-- =====================================================================

-- 1. Enums
do $$ begin
  create type public.db_property_type as enum
    ('text','number','select','multi_select','date','checkbox','person','url','created_time','updated_time','relation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.db_view_type as enum ('table','board','calendar','gallery','list');
exception when duplicate_object then null; end $$;

-- 2. Tables
create table if not exists public.databases (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title        text not null default 'Untitled database',
  icon         text,
  created_by   uuid references auth.users(id) on delete set null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists databases_ws_idx on public.databases (workspace_id, archived_at);

create table if not exists public.db_properties (
  id          uuid primary key default gen_random_uuid(),
  database_id uuid not null references public.databases(id) on delete cascade,
  name        text not null default 'Property',
  type        public.db_property_type not null default 'text',
  config      jsonb not null default '{}'::jsonb,   -- select options, relation target db, etc.
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists db_properties_db_idx on public.db_properties (database_id, position);

create table if not exists public.db_records (
  id          uuid primary key default gen_random_uuid(),
  database_id uuid not null references public.databases(id) on delete cascade,
  properties  jsonb not null default '{}'::jsonb,   -- { property_id: value }
  position    double precision not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists db_records_db_idx on public.db_records (database_id, position);

create table if not exists public.db_views (
  id          uuid primary key default gen_random_uuid(),
  database_id uuid not null references public.databases(id) on delete cascade,
  name        text not null default 'Table',
  type        public.db_view_type not null default 'table',
  config      jsonb not null default '{}'::jsonb,   -- { filters, sorts, group_by, hidden, ... }
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists db_views_db_idx on public.db_views (database_id, position);

-- updated_at triggers
drop trigger if exists trg_databases_updated on public.databases;
create trigger trg_databases_updated before update on public.databases for each row execute function public.set_updated_at();
drop trigger if exists trg_db_properties_updated on public.db_properties;
create trigger trg_db_properties_updated before update on public.db_properties for each row execute function public.set_updated_at();
drop trigger if exists trg_db_records_updated on public.db_records;
create trigger trg_db_records_updated before update on public.db_records for each row execute function public.set_updated_at();
drop trigger if exists trg_db_views_updated on public.db_views;
create trigger trg_db_views_updated before update on public.db_views for each row execute function public.set_updated_at();

-- 3. SECURITY DEFINER helpers (resolve a database's workspace; no recursion)
create or replace function public.db_workspace(p_db uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select workspace_id from public.databases where id = p_db;
$$;

-- read: any active member of the database's workspace
create or replace function public.can_read_db(p_db uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_member(public.db_workspace(p_db));
$$;

-- manage (schema/views/database itself): owner/manager OR the database's creator
create or replace function public.can_manage_db(p_db uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_member(public.db_workspace(p_db))
     and (
       public.is_manager_or_owner(public.db_workspace(p_db))
       or exists (select 1 from public.databases d where d.id = p_db and d.created_by = auth.uid())
     );
$$;

-- 4. RLS
alter table public.databases     enable row level security;
alter table public.db_properties enable row level security;
alter table public.db_records    enable row level security;
alter table public.db_views      enable row level security;

-- databases: active members read; create own; owner/manager or creator writes.
drop policy if exists databases_select on public.databases;
create policy databases_select on public.databases for select to authenticated
  using ( public.is_active_member(workspace_id) );
drop policy if exists databases_insert on public.databases;
create policy databases_insert on public.databases for insert to authenticated
  with check ( public.is_active_member(workspace_id) and created_by = auth.uid() );
drop policy if exists databases_update on public.databases;
create policy databases_update on public.databases for update to authenticated
  using ( public.is_active_member(workspace_id)
          and (public.is_manager_or_owner(workspace_id) or created_by = auth.uid()) )
  with check ( public.is_active_member(workspace_id)
          and (public.is_manager_or_owner(workspace_id) or created_by = auth.uid()) );
drop policy if exists databases_delete on public.databases;
create policy databases_delete on public.databases for delete to authenticated
  using ( public.is_active_member(workspace_id)
          and (public.is_manager_or_owner(workspace_id) or created_by = auth.uid()) );

-- db_properties: read if can read db; write (schema) requires manage.
drop policy if exists db_properties_select on public.db_properties;
create policy db_properties_select on public.db_properties for select to authenticated
  using ( public.can_read_db(database_id) );
drop policy if exists db_properties_write on public.db_properties;
create policy db_properties_write on public.db_properties for all to authenticated
  using ( public.can_manage_db(database_id) )
  with check ( public.can_manage_db(database_id) );

-- db_records: any active member of the db's workspace can CRUD rows (shared table).
drop policy if exists db_records_select on public.db_records;
create policy db_records_select on public.db_records for select to authenticated
  using ( public.can_read_db(database_id) );
drop policy if exists db_records_write on public.db_records;
create policy db_records_write on public.db_records for all to authenticated
  using ( public.can_read_db(database_id) )
  with check ( public.can_read_db(database_id) );

-- db_views: read if can read db; write requires manage (views are shared config).
drop policy if exists db_views_select on public.db_views;
create policy db_views_select on public.db_views for select to authenticated
  using ( public.can_read_db(database_id) );
drop policy if exists db_views_write on public.db_views;
create policy db_views_write on public.db_views for all to authenticated
  using ( public.can_manage_db(database_id) )
  with check ( public.can_manage_db(database_id) );

-- 5. Grants (RLS still applies)
revoke all on public.databases, public.db_properties, public.db_records, public.db_views
  from anon, authenticated;
grant select, insert, update, delete
  on public.databases, public.db_properties, public.db_records, public.db_views
  to authenticated;
grant all on public.databases, public.db_properties, public.db_records, public.db_views
  to service_role;

revoke execute on function
  public.db_workspace(uuid), public.can_read_db(uuid), public.can_manage_db(uuid)
  from public;
grant execute on function
  public.db_workspace(uuid), public.can_read_db(uuid), public.can_manage_db(uuid)
  to authenticated;
