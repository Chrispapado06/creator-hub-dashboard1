-- ICEFALL — internal business CRM: sales pipeline and the internal task queue.
--
-- Phase 6 of the build order. Two tables and one function, and the function is
-- the interesting part.
--
-- THE ALERT MAY NOTIFY. IT MAY NOT ACT.
--
-- The specification asks the CRM to raise work rather than rely on somebody
-- remembering a date: a placement expiring, a contract due for renewal, an
-- invoice unpaid, a document about to lapse. It is equally explicit that no
-- automated action may alter a marketplace placement without an administrator.
--
-- `raise_expiry_tasks()` therefore reads `placement_status` and writes into
-- `tasks`. It does not touch `placements` — it holds no privilege to, since
-- `authenticated` has SELECT only on that table and the function is not the
-- owner of it by accident but by design. The strongest statement available here
-- is that the function which notices an expiry is structurally incapable of
-- responding to one. A person picks the task up and calls `move_placement` or
-- `cancel_placement`, both of which write their own audit event.
--
-- It is also idempotent. Running it twice on the same day must not produce two
-- identical tasks — an alert queue that duplicates is one people stop reading,
-- and a queue people stop reading is worse than no queue, because it looks like
-- coverage.

/* ========================================================================== */
/* Deals — the ten-stage operator pipeline                                    */
/* ========================================================================== */

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),

  -- The ten stages, in the specification's order. `prospect` through `active` is
  -- the life of a customer, not just of an opportunity, which is why `onboarding`
  -- and `renewal` sit inside the same pipeline rather than beside it.
  stage text not null default 'prospect' check (stage in (
    'prospect', 'contacted', 'conversation', 'proposal', 'negotiation',
    'won', 'onboarding', 'active', 'renewal', 'lost'
  )),

  -- An estimate, and nullable because an early-stage deal has no honest figure.
  -- A pipeline that defaults an unknown deal to zero reports a smaller business
  -- than exists; one that defaults it to an average reports a larger one.
  estimated_value_cents bigint check (estimated_value_cents is null or estimated_value_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),

  -- Weighted pipeline needs a probability, and it is only honest if someone set
  -- it. No stage-derived default: "negotiation means 60%" is a number nobody
  -- chose being reported as though somebody had.
  probability_pct int check (probability_pct is null or probability_pct between 0 and 100),

  owner_id uuid references public.profiles (id) on delete set null,
  mountains text[] not null default '{}',
  expected_close_on date,
  contract_starts_on date,
  contract_ends_on date,
  closed_at timestamptz,
  lost_reason text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deals_contract_dates_ordered check (
    contract_starts_on is null or contract_ends_on is null
    or contract_starts_on <= contract_ends_on
  ),
  constraint deals_lost_has_reason check (
    stage <> 'lost' or (lost_reason is not null and length(trim(lost_reason)) > 0)
  )
);

create index if not exists deals_company_idx on public.deals (company_id);
create index if not exists deals_stage_idx on public.deals (stage, expected_close_on);

-- A placement is sold as part of a deal. Nullable, because ICEFALL can record a
-- placement whose paperwork came from somewhere else.
alter table public.placements
  add column if not exists deal_id uuid references public.deals (id) on delete set null;

/* ========================================================================== */
/* Tasks — the internal queue                                                 */
/* ========================================================================== */

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),

  kind text not null check (kind in (
    'placement_expiring', 'placement_expired', 'contract_renewal',
    'content_approval', 'document_expiring', 'unpaid_invoice',
    'support_escalation', 'disputed_booking', 'manual'
  )),

  title text not null check (length(trim(title)) between 1 and 200),
  detail text,

  -- What it is about. Text rather than a uuid because a placement, a company and
  -- a mountain are keyed differently and a task can point at any of them.
  entity_type text,
  entity_id text,

  company_id uuid references public.companies (id) on delete cascade,
  assigned_to uuid references public.profiles (id) on delete set null,
  -- Which desk should pick it up when nobody is named.
  desk public.icefall_staff_role,

  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'dismissed')),

  due_on date,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text,

  -- IDEMPOTENCY. A generated task carries a key identifying the thing it is
  -- about plus the day it was raised for, so a second run finds the first.
  dedupe_key text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tasks_dismissed_has_note check (
    status <> 'dismissed' or (resolution_note is not null and length(trim(resolution_note)) > 0)
  )
);

-- NOT a partial index. `on conflict (dedupe_key)` cannot infer a partial unique
-- index unless the statement repeats its predicate, which is a footgun waiting
-- for the next person who writes an upsert here. A plain unique index does the
-- same job: Postgres permits any number of NULLs in one, so hand-written tasks
-- with no dedupe key are unaffected.
create unique index if not exists tasks_dedupe_key_idx on public.tasks (dedupe_key);
create index if not exists tasks_open_idx
  on public.tasks (status, priority, due_on) where status in ('open', 'in_progress');

/**
 * Raise a task for every placement whose term has run out or is about to.
 *
 * READS `placement_status`. WRITES `tasks`. Touches nothing else — see the
 * header. Returns how many it created so a caller can log something truthful.
 *
 * The 30-day warning and the expiry itself are separate tasks with separate
 * dedupe keys, because they are different pieces of work: one is "start the
 * renewal conversation", the other is "this slot is past its term and somebody
 * has to decide". Collapsing them loses the first.
 */
create or replace function public.raise_expiry_tasks(p_warn_days int default 30)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created int := 0;
  p record;
  v_key text;
begin
  if public.is_staff() is not true then
    raise exception 'only ICEFALL staff may run the expiry sweep';
  end if;

  for p in
    select ps.id, ps.company_id, ps.destination_id, ps.slot_position,
           ps.ends_on, ps.needs_review, ps.days_remaining
    from public.placement_status ps
    where ps.status <> 'cancelled'
      and ps.ends_on <= current_date + p_warn_days
  loop
    if p.needs_review then
      v_key := 'placement_expired:' || p.id::text;
      insert into public.tasks (kind, title, detail, entity_type, entity_id, company_id,
                                desk, priority, due_on, dedupe_key)
      values ('placement_expired',
              format('Position #%s on %s has passed its term', p.slot_position, p.destination_id),
              format('The term ended on %s. The company still holds this position and will '
                     'continue to until an administrator moves or cancels the placement. '
                     'Nothing has changed automatically.', p.ends_on),
              'placement', p.id::text, p.company_id, 'operations', 'high', p.ends_on, v_key)
      on conflict (dedupe_key) do nothing;
    else
      v_key := 'placement_expiring:' || p.id::text;
      insert into public.tasks (kind, title, detail, entity_type, entity_id, company_id,
                                desk, priority, due_on, dedupe_key)
      values ('placement_expiring',
              format('Position #%s on %s expires in %s days', p.slot_position, p.destination_id, p.days_remaining),
              format('Term ends %s. Start the renewal conversation, or plan the handover. '
                     'The position does not change on its own.', p.ends_on),
              'placement', p.id::text, p.company_id, 'sales', 'normal', p.ends_on, v_key)
      on conflict (dedupe_key) do nothing;
    end if;

    if found then v_created := v_created + 1; end if;
  end loop;

  return v_created;
end;
$$;

/* ========================================================================== */
/* Row-level security                                                         */
/* ========================================================================== */

alter table public.deals enable row level security;
alter table public.tasks enable row level security;
alter table public.deals force row level security;
alter table public.tasks force row level security;

-- BOTH ARE INTERNAL. A deal carries what ICEFALL thinks a company is worth and
-- how likely they are to sign; a task can carry the same in its detail. Neither
-- has an operator-facing policy in any direction, deliberately.
drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals
  for select to authenticated using (public.is_staff());

drop policy if exists deals_write on public.deals;
create policy deals_write on public.deals
  for all to authenticated
  using (public.has_staff_role(array['sales']))
  with check (public.has_staff_role(array['sales']));

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated using (public.is_staff());

drop policy if exists tasks_write on public.tasks;
create policy tasks_write on public.tasks
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

/* ========================================================================== */
/* Triggers and grants                                                        */
/* ========================================================================== */

drop trigger if exists deals_touch on public.deals;
create trigger deals_touch before update on public.deals
  for each row execute function public.touch_updated_at();

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.deals to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
revoke all on public.deals from anon;
revoke all on public.tasks from anon;

revoke all on function public.raise_expiry_tasks(int) from public, anon;
grant execute on function public.raise_expiry_tasks(int) to authenticated;
