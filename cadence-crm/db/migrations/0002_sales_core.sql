-- Cadence CRM — Phases 2–5: the sales core.
--
-- Companies, contacts (full), leads, pipelines, deals, products and activities —
-- the objects a salesperson touches all day. Every table is tenant-scoped and
-- RLS-isolated by the SAME membership rule proven in 0001: `is_member(tenant_id)`
-- gates read and write, `anon` gets nothing, and a row can never be created in,
-- read from, or moved into a tenant the caller does not belong to.
--
-- CUSTOM FIELDS without a migration per field (§4, §5, §8, §9): a `custom_fields`
-- definition table names the fields a tenant has added, and every business row
-- carries a `custom jsonb` column holding the values. Flexible, and still
-- indexable with expression indexes when a field gets hot.

/* ========================================================================== */
/* Vocabulary                                                                 */
/* ========================================================================== */

do $$ begin
  if not exists (select 1 from pg_type where typname='lead_status') then
    create type public.lead_status as enum ('new','contacted','qualified','unqualified','converted','lost');
  end if;
  if not exists (select 1 from pg_type where typname='deal_status') then
    create type public.deal_status as enum ('open','won','lost');
  end if;
  if not exists (select 1 from pg_type where typname='activity_type') then
    create type public.activity_type as enum ('call','meeting','task','deadline','email','lunch','visit');
  end if;
  if not exists (select 1 from pg_type where typname='activity_status') then
    create type public.activity_status as enum ('planned','done','cancelled');
  end if;
end $$;

/* ========================================================================== */
/* Shared tenant plumbing: labels + custom-field definitions                  */
/* ========================================================================== */

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  color text not null default 'slate',
  created_at timestamptz not null default now()
);
create index if not exists labels_tenant_idx on public.labels (tenant_id);

create table if not exists public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entity text not null check (entity in ('contact','company','lead','deal','product','activity')),
  key text not null,
  label text not null,
  kind text not null default 'text' check (kind in ('text','number','date','select','multiselect','boolean','url','currency')),
  options jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, entity, key)
);
create index if not exists custom_fields_tenant_idx on public.custom_fields (tenant_id, entity);

/* ========================================================================== */
/* Companies (§9)                                                             */
/* ========================================================================== */

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 160),
  domain text,
  industry text,
  employees int,
  annual_revenue bigint,
  phone text,
  address text,
  label_ids uuid[] not null default '{}',
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists companies_tenant_idx on public.companies (tenant_id);
create index if not exists companies_tenant_domain_idx on public.companies (tenant_id, lower(domain));

/* ========================================================================== */
/* Contacts — extend the Phase-1 seam into the full object (§8)               */
/* ========================================================================== */

alter table public.contacts add column if not exists company_id uuid references public.companies (id) on delete set null;
alter table public.contacts add column if not exists job_title text;
alter table public.contacts add column if not exists mobile text;
alter table public.contacts add column if not exists address text;
alter table public.contacts add column if not exists birthday date;
alter table public.contacts add column if not exists label_ids uuid[] not null default '{}';
alter table public.contacts add column if not exists custom jsonb not null default '{}'::jsonb;
create index if not exists contacts_company_idx on public.contacts (company_id);

/* ========================================================================== */
/* Leads (§4)                                                                 */
/* ========================================================================== */

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  company_name text,
  job_title text,
  source text,
  value bigint,               -- minor units
  currency text not null default 'EUR',
  expected_close date,
  status public.lead_status not null default 'new',
  score int not null default 0 check (score between 0 and 100),
  label_ids uuid[] not null default '{}',
  custom jsonb not null default '{}'::jsonb,
  -- Set when converted, so the origin is never lost.
  converted_deal_id uuid,
  converted_contact_id uuid references public.contacts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_tenant_status_idx on public.leads (tenant_id, status);
create index if not exists leads_tenant_owner_idx on public.leads (tenant_id, owner_id);

/* ========================================================================== */
/* Pipelines and stages (§6)                                                  */
/* ========================================================================== */

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  is_default boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists pipelines_tenant_idx on public.pipelines (tenant_id);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  probability int not null default 0 check (probability between 0 and 100),
  color text not null default 'slate',
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists pipeline_stages_pipeline_idx on public.pipeline_stages (pipeline_id, position);

/* ========================================================================== */
/* Deals — the central object (§5)                                            */
/* ========================================================================== */

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 160),
  value bigint not null default 0,      -- minor units
  currency text not null default 'EUR',
  pipeline_id uuid not null references public.pipelines (id) on delete restrict,
  stage_id uuid not null references public.pipeline_stages (id) on delete restrict,
  status public.deal_status not null default 'open',
  probability int check (probability is null or probability between 0 and 100),
  expected_close date,
  company_id uuid references public.companies (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  source text,
  label_ids uuid[] not null default '{}',
  custom jsonb not null default '{}'::jsonb,
  -- Deal-rotting (§7): the app compares this to a per-pipeline threshold. Kept
  -- as a column, not derived, so "no activity for N days" is a cheap index scan
  -- over 100k deals rather than a correlated subquery.
  last_activity_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A won/lost deal must carry its timestamp; an open one must not.
  constraint deals_status_consistent check (
    (status = 'won'  and won_at  is not null and lost_at is null)
    or (status = 'lost' and lost_at is not null and won_at is null)
    or (status = 'open' and won_at is null and lost_at is null)
  )
);
create index if not exists deals_tenant_stage_idx on public.deals (tenant_id, stage_id);
create index if not exists deals_tenant_status_idx on public.deals (tenant_id, status);
create index if not exists deals_tenant_owner_idx on public.deals (tenant_id, owner_id);
create index if not exists deals_rot_idx on public.deals (tenant_id, last_activity_at);

-- Every stage move is recorded, so cycle-time and stage-conversion reports (§19,
-- §20) read from fact, not from a mutable current state.
create table if not exists public.deal_stage_history (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages (id) on delete set null,
  to_stage_id uuid not null references public.pipeline_stages (id) on delete restrict,
  moved_by uuid references public.profiles (id) on delete set null,
  at timestamptz not null default now()
);
create index if not exists deal_stage_history_deal_idx on public.deal_stage_history (deal_id, at);

/* ========================================================================== */
/* Products and line items (§16)                                              */
/* ========================================================================== */

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 160),
  code text,
  description text,
  unit_price bigint not null default 0,   -- minor units
  currency text not null default 'EUR',
  tax_rate numeric(5,2) not null default 0,
  unit text,
  category text,
  active boolean not null default true,
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists products_tenant_idx on public.products (tenant_id);

create table if not exists public.deal_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,                     -- snapshot: a later price edit must not rewrite a quote
  quantity numeric(12,2) not null default 1,
  unit_price bigint not null default 0,
  discount_pct numeric(5,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists deal_products_deal_idx on public.deal_products (deal_id);

/* ========================================================================== */
/* Activities (§10)                                                           */
/* ========================================================================== */

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  type public.activity_type not null default 'task',
  title text not null check (length(trim(title)) between 1 and 200),
  due_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  status public.activity_status not null default 'planned',
  deal_id uuid references public.deals (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists activities_tenant_due_idx on public.activities (tenant_id, due_at);
create index if not exists activities_deal_idx on public.activities (deal_id);
create index if not exists activities_owner_open_idx on public.activities (tenant_id, owner_id, status);

/* ========================================================================== */
/* Row-level security — one pattern, applied to every table                   */
/* ========================================================================== */

do $$
declare t text;
begin
  foreach t in array array[
    'labels','custom_fields','companies','leads','pipelines','pipeline_stages',
    'deals','deal_stage_history','products','deal_products','activities'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    execute format($f$
      drop policy if exists %1$s_select on public.%1$I;
      create policy %1$s_select on public.%1$I
        for select to authenticated using (public.is_member(tenant_id));
      drop policy if exists %1$s_write on public.%1$I;
      create policy %1$s_write on public.%1$I
        for all to authenticated
        using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
    $f$, t);
  end loop;
end $$;

-- updated_at touch on the mutable tables.
do $$
declare t text;
begin
  foreach t in array array['companies','leads','deals','activities'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$I', t);
    execute format('create trigger %1$s_touch before update on public.%1$I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
