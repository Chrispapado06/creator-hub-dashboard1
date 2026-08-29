-- ICEFALL — internal CRM: invoicing, payments and contracts.
--
-- The Invoices & Payments page had nothing behind it at all: across eight
-- migrations, `grep invoice` returned only the STRING 'invoiced' as a status on
-- `commissions` and `revenue_records`, plus a `tasks.kind` of 'unpaid_invoice'
-- that nothing could ever raise. This is that gap.
--
-- THREE THINGS THIS SCHEMA REFUSES TO DO.
--
-- 1. THERE IS NO `outstanding_cents` COLUMN, and there must not be one.
--
-- An outstanding balance is `total − payments − credit notes`, and the moment it
-- is also stored it can disagree with its own components. Worse, a stored
-- balance defaults: a company with no invoices would read €0.00 outstanding,
-- which is a statement that they owe nothing rather than that nothing has been
-- billed. Those are different facts and a finance screen must not merge them.
-- Derive it, every time, and render "no invoices issued" when there are none.
--
-- 2. A PAYMENT IS A STAFF MEMBER'S ASSERTION, NOT A PROCESSOR'S CONFIRMATION.
--
-- There is no payment provider anywhere in ICEFALL and no money has ever moved
-- through it. Every row in `payments` is somebody in finance saying they saw a
-- bank transfer. `recorded_by` is therefore NOT NULL — an unattributed payment
-- record is a claim with nobody behind it — and no screen may present these rows
-- as confirmed by a gateway.
--
-- 3. A REFUND IS NOT A NEGATIVE PAYMENT.
--
-- Every money column in this family is `check (>= 0)`, deliberately, because a
-- sign error in a marketplace ledger is silent and compounds. A refund is a
-- credit note with a mandatory reason, the same shape as `cancel_placement`
-- requiring one: releasing money, like releasing a paid position, is a decision
-- somebody has to own in writing.

/* ========================================================================== */
/* Billing identity                                                           */
/* ========================================================================== */

-- An invoice has to be addressed to somebody, and `companies` carried no billing
-- identity at all.
alter table public.companies add column if not exists billing_email text;
alter table public.companies add column if not exists billing_address text;
alter table public.companies add column if not exists tax_number text;
alter table public.companies add column if not exists billing_contact_id uuid
  references public.profiles (id) on delete set null;

alter table public.companies drop constraint if exists companies_billing_email_shape;
alter table public.companies
  add constraint companies_billing_email_shape check (
    billing_email is null or billing_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  );

/* ========================================================================== */
/* Invoices                                                                   */
/* ========================================================================== */

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  company_id uuid not null references public.companies (id) on delete restrict,

  issued_on date not null default current_date,
  due_on date,

  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  tax_cents bigint check (tax_cents is null or tax_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),

  -- `part_paid` exists because a company paying half of a placement fee is an
  -- ordinary event, and calling it either 'issued' or 'paid' would be false.
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'part_paid', 'paid', 'overdue', 'void')),

  voided_reason text,
  note text,
  pdf_storage_path text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoices_dates_ordered check (due_on is null or issued_on <= due_on),
  -- Voiding an invoice cancels a demand for money. It needs a reason for the
  -- same reason cancelling a paid position does.
  constraint invoices_void_has_reason check (
    status <> 'void' or (voided_reason is not null and length(trim(voided_reason)) > 0)
  )
);

create index if not exists invoices_company_idx on public.invoices (company_id, issued_on desc);
create index if not exists invoices_status_idx on public.invoices (status, due_on);

comment on table public.invoices is
  'No outstanding balance column, deliberately — derive it from payments and credit notes.';

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 300),

  -- No 'subscription': there is no subscription product, and a source type
  -- nothing can produce is an invitation to produce one.
  source_type text not null check (source_type in ('placement', 'commission', 'manual')),
  placement_id uuid references public.placements (id) on delete set null,
  commission_id uuid references public.commissions (id) on delete set null,

  quantity int not null default 1 check (quantity > 0),
  unit_amount_cents bigint not null check (unit_amount_cents >= 0),
  amount_cents bigint not null check (amount_cents >= 0),
  period_start date,
  period_end date,

  constraint invoice_lines_source_coherent check (
    (source_type = 'placement'  and placement_id is not null and commission_id is null)
    or (source_type = 'commission' and commission_id is not null and placement_id is null)
    or (source_type = 'manual'     and placement_id is null and commission_id is null)
  ),
  constraint invoice_lines_period_ordered check (
    period_start is null or period_end is null or period_start <= period_end
  )
);

create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

/* ========================================================================== */
/* Payments and credit notes                                                  */
/* ========================================================================== */

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices (id) on delete set null,
  company_id uuid not null references public.companies (id) on delete restrict,

  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  received_on date not null,
  method text not null default 'bank_transfer'
    check (method in ('bank_transfer', 'card', 'cash', 'other')),
  reference text,
  note text,

  -- NOT NULL. See the header: this is somebody's assertion, and an assertion
  -- with nobody behind it is not evidence of anything.
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists payments_company_idx on public.payments (company_id, received_on desc);

comment on table public.payments is
  'A MANUAL LEDGER. No processor observes these rows; each one is a staff member recording a bank confirmation.';

create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  reason text not null check (length(trim(reason)) between 1 and 500),
  issued_on date not null default current_date,
  issued_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists credit_notes_invoice_idx on public.credit_notes (invoice_id);

/* -------------------------------------------------------------------------- */
/* What is actually outstanding — computed, never stored                      */
/* -------------------------------------------------------------------------- */

create or replace view public.invoice_balances
with (security_invoker = true)
as
select
  i.*,
  coalesce((select sum(p.amount_cents) from public.payments p where p.invoice_id = i.id), 0) as paid_cents,
  coalesce((select sum(c.amount_cents) from public.credit_notes c where c.invoice_id = i.id), 0) as credited_cents,
  greatest(
    i.total_cents
      - coalesce((select sum(p.amount_cents) from public.payments p where p.invoice_id = i.id), 0)
      - coalesce((select sum(c.amount_cents) from public.credit_notes c where c.invoice_id = i.id), 0),
    0
  ) as outstanding_cents,
  (i.status not in ('paid', 'void', 'draft') and i.due_on is not null and i.due_on < current_date) as is_overdue
from public.invoices i;

comment on view public.invoice_balances is
  'Outstanding is derived here and never written back. A company with no invoices has no row, which is not the same as a zero balance.';

/* ========================================================================== */
/* Contracts                                                                  */
/* ========================================================================== */

-- `deals.contract_starts_on/ends_on` is a date pair on a sales opportunity: no
-- document, no signature, no renewal state, and several contracts collapsing
-- into one deal row. A renewal alert needs a contract to be about.
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  reference text,
  title text not null check (length(trim(title)) between 1 and 200),

  starts_on date not null,
  ends_on date,
  -- Null means nobody has decided. It is not "no", which would be a commercial
  -- position ICEFALL has not taken.
  auto_renews boolean,
  notice_days int check (notice_days is null or notice_days between 0 and 365),

  status text not null default 'draft'
    check (status in ('draft', 'sent', 'signed', 'active', 'expired', 'terminated')),
  signed_on date,
  signed_by_name text,
  document_storage_path text,
  note text,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contracts_dates_ordered check (ends_on is null or starts_on <= ends_on),
  -- A contract cannot be signed without a date it was signed on. The CRM should
  -- not be able to assert an agreement exists and not say when it was made.
  constraint contracts_signed_has_date check (
    status not in ('signed', 'active') or signed_on is not null
  )
);

create index if not exists contracts_company_idx on public.contracts (company_id);
create index if not exists contracts_ends_idx on public.contracts (ends_on) where ends_on is not null;

/* ========================================================================== */
/* Links back to what was billed                                              */
/* ========================================================================== */

alter table public.commissions add column if not exists invoice_id uuid
  references public.invoices (id) on delete set null;
-- `status = 'paid'` was a claim with no date behind it.
alter table public.commissions add column if not exists paid_on date;
alter table public.commissions add column if not exists payment_reference text;

alter table public.revenue_records add column if not exists invoice_id uuid
  references public.invoices (id) on delete set null;

/* ========================================================================== */
/* Writes — all through functions, as everywhere else in this CRM             */
/* ========================================================================== */

create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount_cents bigint,
  p_received_on date,
  p_method text default 'bank_transfer',
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice public.invoices%rowtype;
  v_paid bigint;
  v_id uuid;
begin
  if public.has_staff_role(array['finance']) is not true then
    raise exception 'only ICEFALL finance staff may record a payment';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a payment must be a positive amount';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'no such invoice';
  end if;
  if v_invoice.status = 'void' then
    raise exception 'this invoice has been voided; a payment against it needs a new invoice';
  end if;

  insert into public.payments
    (invoice_id, company_id, amount_cents, currency, received_on, method, reference, note, recorded_by)
  values
    (p_invoice_id, v_invoice.company_id, p_amount_cents, v_invoice.currency,
     p_received_on, p_method, p_reference, p_note, auth.uid())
  returning id into v_id;

  select coalesce(sum(amount_cents), 0) into v_paid
  from public.payments where invoice_id = p_invoice_id;

  update public.invoices
     set status = case when v_paid >= v_invoice.total_cents then 'paid' else 'part_paid' end
   where id = p_invoice_id;

  perform public.record_audit_event(
    'payment.recorded', 'invoice', p_invoice_id::text, null,
    jsonb_build_object('amount_cents', p_amount_cents, 'received_on', p_received_on,
                       'method', p_method, 'reference', p_reference),
    p_note, v_invoice.company_id);

  return v_id;
end;
$$;

create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.invoices%rowtype;
begin
  if public.has_staff_role(array['finance']) is not true then
    raise exception 'only ICEFALL finance staff may void an invoice';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'voiding an invoice requires a reason';
  end if;

  select * into v from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'no such invoice'; end if;
  if exists (select 1 from public.payments where invoice_id = p_invoice_id) then
    raise exception 'this invoice has payments against it; issue a credit note instead of voiding it';
  end if;

  update public.invoices set status = 'void', voided_reason = btrim(p_reason) where id = p_invoice_id;

  perform public.record_audit_event(
    'invoice.voided', 'invoice', p_invoice_id::text,
    jsonb_build_object('status', v.status), jsonb_build_object('status', 'void'),
    p_reason, v.company_id);
end;
$$;

create or replace function public.issue_credit_note(
  p_invoice_id uuid, p_amount_cents bigint, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.invoices%rowtype;
  v_id uuid;
begin
  if public.has_staff_role(array['finance']) is not true then
    raise exception 'only ICEFALL finance staff may issue a credit note';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'a credit note requires a reason — returning money is a decision somebody owns';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a credit note must be a positive amount';
  end if;

  select * into v from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'no such invoice'; end if;
  if p_amount_cents > v.total_cents then
    raise exception 'a credit note cannot exceed the invoice it credits';
  end if;

  insert into public.credit_notes (invoice_id, company_id, amount_cents, currency, reason, issued_by)
  values (p_invoice_id, v.company_id, p_amount_cents, v.currency, btrim(p_reason), auth.uid())
  returning id into v_id;

  perform public.record_audit_event(
    'credit_note.issued', 'invoice', p_invoice_id::text, null,
    jsonb_build_object('amount_cents', p_amount_cents), p_reason, v.company_id);

  return v_id;
end;
$$;

/* ========================================================================== */
/* Row-level security — finance is internal, in every direction               */
/* ========================================================================== */

alter table public.invoices      enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments      enable row level security;
alter table public.credit_notes  enable row level security;
alter table public.contracts     enable row level security;

alter table public.payments      force row level security;
alter table public.credit_notes  force row level security;

-- An operator sees what they were billed — it is their own invoice — but nothing
-- of anyone else's, and nothing of ICEFALL's margin. Payments, credit notes and
-- contracts stay staff-only until somebody asks for an operator billing view,
-- because it is easier to open later than to discover it was open all along.
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated
  using (public.is_staff() or public.is_company_member(company_id));

drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices
  for all to authenticated
  using (public.has_staff_role(array['finance']))
  with check (public.has_staff_role(array['finance']));

drop policy if exists invoice_lines_select on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (public.is_staff() or public.is_company_member(i.company_id))
    )
  );

drop policy if exists invoice_lines_write on public.invoice_lines;
create policy invoice_lines_write on public.invoice_lines
  for all to authenticated
  using (public.has_staff_role(array['finance']))
  with check (public.has_staff_role(array['finance']));

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated using (public.is_staff());

drop policy if exists credit_notes_select on public.credit_notes;
create policy credit_notes_select on public.credit_notes
  for select to authenticated using (public.is_staff());

drop policy if exists contracts_all on public.contracts;
create policy contracts_all on public.contracts
  for all to authenticated
  using (public.has_staff_role(array['sales', 'finance']))
  with check (public.has_staff_role(array['sales', 'finance']));

/* ========================================================================== */
/* Triggers and grants                                                        */
/* ========================================================================== */

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

drop trigger if exists contracts_touch on public.contracts;
create trigger contracts_touch before update on public.contracts
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.invoices      to authenticated;
grant select, insert, update, delete on public.invoice_lines to authenticated;
grant select, insert, update, delete on public.contracts     to authenticated;
-- Payments and credit notes are written by their functions only: a hand-inserted
-- payment is one with no audit event behind it.
grant select on public.payments     to authenticated;
grant select on public.credit_notes to authenticated;
grant select on public.invoice_balances to authenticated;

revoke all on public.invoices          from anon;
revoke all on public.invoice_lines     from anon;
revoke all on public.payments          from anon;
revoke all on public.credit_notes      from anon;
revoke all on public.contracts         from anon;
revoke all on public.invoice_balances  from anon;

revoke all on function public.record_payment(uuid, bigint, date, text, text, text) from public, anon;
revoke all on function public.void_invoice(uuid, text)                             from public, anon;
revoke all on function public.issue_credit_note(uuid, bigint, text)                from public, anon;
grant execute on function public.record_payment(uuid, bigint, date, text, text, text) to authenticated;
grant execute on function public.void_invoice(uuid, text)                             to authenticated;
grant execute on function public.issue_credit_note(uuid, bigint, text)                to authenticated;
