-- ICEFALL — internal CRM: verification, support, internal notes, and the
-- alerts that were specified but could never fire.
--
-- WHY `media_assets` COULD NOT HOLD A DOCUMENT.
--
-- It carries `kind = 'document'`, which looks like enough, and is not. It has no
-- document type, no issuer, no issue date and — the one that matters — NO EXPIRY
-- DATE. That absence is why `tasks.kind = 'document_expiring'` has existed since
-- the sales migration with nothing in the schema able to raise it: there was no
-- date to compare against. It is also the wrong shape in a way that would have
-- forced a lie: `media_approved_is_attributed` requires a non-empty photograph
-- licence AND credit before an asset can be approved, so approving an insurance
-- certificate would have meant inventing a photo credit for a PDF.
--
-- THE EXPIRY DATE HAS A PROVENANCE COLUMN, AND THAT IS THE POINT.
--
-- `expiry_source` is either 'printed_on_document' or 'stated_by_holder'. ICEFALL
-- must never assert a lapse date it inferred or was merely told, because the
-- consequence of getting it wrong is a company trading on the marketplace with
-- lapsed liability cover while a screen says they are covered. A missing expiry
-- renders "not recorded" — never "expired", and never "no expiry".
--
-- WHAT `checked` MEANS, EXACTLY.
--
-- A member of ICEFALL staff looked at the document. It does not mean the issuing
-- association, insurer or awarding body was contacted, because none of them was.
-- Every surface built on this table must use that wording. `guide_profiles.
-- credentials_verified` keeps its `check (= false)`: checking a carnet is not
-- verifying a guide, and conflating the two is the failure that puts a client on
-- glaciated ground behind somebody whose qualification nobody confirmed.

/* ========================================================================== */
/* Verification documents                                                     */
/* ========================================================================== */

create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(),

  -- Exactly one subject. A document belongs to a company or to a guide, never
  -- both and never neither.
  company_id uuid references public.companies (id) on delete cascade,
  guide_profile_id uuid references public.guide_profiles (id) on delete cascade,

  document_type text not null check (document_type in
    ('business_registration', 'insurance', 'licence', 'certification', 'identity', 'contract', 'other')),
  label text not null check (length(trim(label)) between 1 and 200),
  issuer text,
  reference text,

  issued_on date,
  expires_on date,
  -- See the header. Null when there is no expiry recorded at all.
  expiry_source text check (expiry_source in ('printed_on_document', 'stated_by_holder')),

  coverage_amount_cents bigint check (coverage_amount_cents is null or coverage_amount_cents >= 0),
  media_asset_id uuid references public.media_assets (id) on delete set null,

  state text not null default 'pending'
    check (state in ('pending', 'checked', 'rejected')),
  checked_by uuid references public.profiles (id) on delete set null,
  checked_at timestamptz,
  decision_reason text,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint verification_documents_one_subject check (
    (company_id is not null and guide_profile_id is null)
    or (company_id is null and guide_profile_id is not null)
  ),
  -- Mirrors companies_verification_coherent: a checked document must carry a
  -- real reviewer and a real timestamp, so a fabricated check is unstorable.
  constraint verification_documents_checked_coherent check (
    (state = 'checked' and checked_by is not null and checked_at is not null)
    or (state <> 'checked')
  ),
  constraint verification_documents_refusal_has_reason check (
    state <> 'rejected' or (decision_reason is not null and length(trim(decision_reason)) > 0)
  ),
  -- An expiry date without a provenance is a date nobody can defend.
  constraint verification_documents_expiry_sourced check (
    expires_on is null or expiry_source is not null
  ),
  constraint verification_documents_dates_ordered check (
    issued_on is null or expires_on is null or issued_on <= expires_on
  )
);

create index if not exists verification_documents_company_idx
  on public.verification_documents (company_id);
create index if not exists verification_documents_guide_idx
  on public.verification_documents (guide_profile_id);
create index if not exists verification_documents_expiry_idx
  on public.verification_documents (expires_on) where expires_on is not null;

comment on column public.verification_documents.state is
  'checked = a member of ICEFALL staff looked at the document. NEVER that the issuer was contacted.';

/**
 * Documents with expiry computed, never stored.
 *
 * `expired` is derived for the same reason placement expiry is: nothing should
 * write to this table on a timer, and a document whose date has passed has not
 * changed — only today has.
 */
create or replace view public.verification_document_status
with (security_invoker = true)
as
select
  d.*,
  case
    when d.state = 'rejected' then 'rejected'
    when d.expires_on is null then d.state
    when d.expires_on < current_date then 'expired'
    else d.state
  end as effective_state,
  case when d.expires_on is null then null else (d.expires_on - current_date) end as days_until_expiry
from public.verification_documents d;

/* ---- guide credentials --------------------------------------------------- */

-- `guide_profiles.specialities` is a list of disciplines, not credentials.
create table if not exists public.guide_certifications (
  id uuid primary key default gen_random_uuid(),
  guide_profile_id uuid not null references public.guide_profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 120),
  qualification text not null check (length(trim(qualification)) between 1 and 160),
  reference text,
  awarded_on date,
  expires_on date,
  document_id uuid references public.verification_documents (id) on delete set null,

  -- `claimed` is the default and the honest starting point: the guide says they
  -- hold this. `document_checked` means ICEFALL looked at a carnet. There is
  -- deliberately no third value meaning the awarding body confirmed it, because
  -- ICEFALL has never contacted one.
  state text not null default 'claimed' check (state in ('claimed', 'document_checked', 'rejected')),
  checked_by uuid references public.profiles (id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guide_certifications_checked_coherent check (
    state <> 'document_checked' or (checked_by is not null and checked_at is not null)
  )
);

create index if not exists guide_certifications_guide_idx
  on public.guide_certifications (guide_profile_id);

/* ========================================================================== */
/* Support                                                                    */
/* ========================================================================== */

-- `public.reports` is an ABUSE QUEUE and is deliberately left alone: its policies
-- let a reporter read their own row, and widening that shape to carry tickets
-- would hand every reporter a view of the support desk.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  subject text not null check (length(trim(subject)) between 1 and 200),

  type text not null check (type in
    ('account', 'booking', 'payment', 'content', 'operator', 'safety', 'technical', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'investigating', 'waiting_on_customer', 'waiting_on_company', 'resolved', 'closed')),

  requester_id uuid references public.profiles (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  assigned_to uuid references public.profiles (id) on delete set null,

  opened_at timestamptz not null default now(),
  first_response_at timestamptz,
  resolved_at timestamptz,
  resolution text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint support_tickets_resolved_coherent check (
    status not in ('resolved', 'closed')
    or (resolved_at is not null and resolution is not null and length(trim(resolution)) > 0)
  )
);

create index if not exists support_tickets_status_idx
  on public.support_tickets (status, priority, opened_at desc);
create index if not exists support_tickets_company_idx on public.support_tickets (company_id);

-- Cannot live in `public.messages`: that policy shows every thread participant
-- every row, so an internal note would be delivered to the customer it concerns.
create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 8000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_messages_ticket_idx
  on public.support_ticket_messages (ticket_id, created_at);

/* ========================================================================== */
/* Internal notes on a company                                                */
/* ========================================================================== */

-- `company_internal.notes` is one text column on a 1:1 row, so a second author
-- overwrites the first. `conversation_notes` has the right shape but requires a
-- thread and is readable by the operator — it is their surface, not ICEFALL's.
create table if not exists public.company_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index if not exists company_notes_company_idx
  on public.company_notes (company_id, created_at desc);

/* ========================================================================== */
/* Account status on a profile                                                */
/* ========================================================================== */

-- `company_users.status` is membership of one company; this is the account.
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_account_status_known;
alter table public.profiles
  add constraint profiles_account_status_known check (account_status in ('active', 'suspended', 'closed'));
alter table public.profiles add column if not exists suspended_reason text;
alter table public.profiles add column if not exists suspended_at timestamptz;

alter table public.profiles drop constraint if exists profiles_suspension_coherent;
alter table public.profiles
  add constraint profiles_suspension_coherent check (
    account_status <> 'suspended'
    or (suspended_reason is not null and length(trim(suspended_reason)) > 0)
  );

/* ========================================================================== */
/* The alerts that could never fire                                           */
/* ========================================================================== */

/**
 * Raise a task for every document approaching or past its expiry.
 *
 * SKIPS ROWS WITH NO `expires_on`. A missing expiry is "not recorded" — it is not
 * an expiry of never, and it is certainly not an expiry of today. Raising a task
 * for a document whose date ICEFALL does not hold would train staff to dismiss
 * this queue, and a dismissed queue is worse than an empty one.
 *
 * Notifies only. Nothing here alters a document, a company or a placement.
 */
create or replace function public.raise_document_expiry_tasks(p_warn_days int default 30)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created int := 0;
  d record;
begin
  if public.is_staff() is not true then
    raise exception 'only ICEFALL staff may run the document sweep';
  end if;

  for d in
    select v.id, v.label, v.company_id, v.expires_on, v.effective_state, v.days_until_expiry,
           coalesce(c.name, g.display_name, 'a guide') as subject
    from public.verification_document_status v
    left join public.companies c on c.id = v.company_id
    left join public.profiles g on g.id = v.guide_profile_id
    where v.expires_on is not null
      and v.state <> 'rejected'
      and v.expires_on <= current_date + p_warn_days
  loop
    insert into public.tasks (kind, title, detail, entity_type, entity_id, company_id,
                              desk, priority, due_on, dedupe_key)
    values ('document_expiring',
            case when d.effective_state = 'expired'
                 then format('%s — %s has expired', d.subject, d.label)
                 else format('%s — %s expires in %s days', d.subject, d.label, d.days_until_expiry) end,
            format('Expiry recorded as %s. Ask for the renewed document. Nothing about the '
                   'company''s listing changes automatically.', d.expires_on),
            'verification_document', d.id::text, d.company_id,
            'operations',
            case when d.effective_state = 'expired' then 'critical' else 'normal' end,
            d.expires_on,
            'document_expiry:' || d.id::text)
    on conflict (dedupe_key) do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;

  return v_created;
end;
$$;

/** Unpaid invoices past their due date. Notifies; changes no invoice. */
create or replace function public.raise_unpaid_invoice_tasks()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created int := 0;
  i record;
begin
  if public.is_staff() is not true then
    raise exception 'only ICEFALL staff may run the invoice sweep';
  end if;

  for i in
    select b.id, b.number, b.company_id, b.due_on, b.outstanding_cents, c.name
    from public.invoice_balances b
    join public.companies c on c.id = b.company_id
    where b.is_overdue and b.outstanding_cents > 0
  loop
    insert into public.tasks (kind, title, detail, entity_type, entity_id, company_id,
                              desk, priority, due_on, dedupe_key)
    values ('unpaid_invoice',
            format('%s — invoice %s is past its due date', i.name, i.number),
            format('Due %s, still outstanding. Finance to chase.', i.due_on),
            'invoice', i.id::text, i.company_id, 'finance', 'high', i.due_on,
            'unpaid_invoice:' || i.id::text)
    on conflict (dedupe_key) do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;

  return v_created;
end;
$$;

/** Contracts approaching their end date. Notifies; renews nothing. */
create or replace function public.raise_contract_renewal_tasks(p_warn_days int default 60)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created int := 0;
  k record;
begin
  if public.is_staff() is not true then
    raise exception 'only ICEFALL staff may run the contract sweep';
  end if;

  for k in
    select ct.id, ct.title, ct.company_id, ct.ends_on, c.name
    from public.contracts ct
    join public.companies c on c.id = ct.company_id
    where ct.ends_on is not null
      and ct.status in ('signed', 'active')
      and ct.ends_on <= current_date + p_warn_days
  loop
    insert into public.tasks (kind, title, detail, entity_type, entity_id, company_id,
                              desk, priority, due_on, dedupe_key)
    values ('contract_renewal',
            format('%s — %s ends %s', k.name, k.title, k.ends_on),
            'A renewal date raises this task and nothing else. It does not change a '
            'marketplace position, and an expiring contract never reshuffles a mountain.',
            'contract', k.id::text, k.company_id, 'sales', 'normal', k.ends_on,
            'contract_renewal:' || k.id::text)
    on conflict (dedupe_key) do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;

  return v_created;
end;
$$;

/* ========================================================================== */
/* Row-level security                                                         */
/* ========================================================================== */

alter table public.verification_documents   enable row level security;
alter table public.guide_certifications     enable row level security;
alter table public.support_tickets          enable row level security;
alter table public.support_ticket_messages  enable row level security;
alter table public.company_notes            enable row level security;

alter table public.company_notes            force row level security;
alter table public.support_ticket_messages  force row level security;

-- A company sees its own documents and their state — it submitted them. Only
-- ICEFALL decides.
drop policy if exists verification_documents_select on public.verification_documents;
create policy verification_documents_select on public.verification_documents
  for select to authenticated
  using (
    public.is_staff()
    or (company_id is not null and public.is_company_member(company_id))
    or guide_profile_id = auth.uid()
  );

drop policy if exists verification_documents_insert on public.verification_documents;
create policy verification_documents_insert on public.verification_documents
  for insert to authenticated
  with check (
    public.has_staff_role(array['operations'])
    or (
      state = 'pending' and checked_by is null and checked_at is null
      and (
        (company_id is not null and public.is_company_admin(company_id))
        or guide_profile_id = auth.uid()
      )
    )
  );

drop policy if exists verification_documents_write on public.verification_documents;
create policy verification_documents_write on public.verification_documents
  for update to authenticated
  using (public.has_staff_role(array['operations']))
  with check (public.has_staff_role(array['operations']));

drop policy if exists guide_certifications_select on public.guide_certifications;
create policy guide_certifications_select on public.guide_certifications
  for select to authenticated
  using (public.is_staff() or guide_profile_id = auth.uid());

drop policy if exists guide_certifications_write on public.guide_certifications;
create policy guide_certifications_write on public.guide_certifications
  for all to authenticated
  using (public.has_staff_role(array['operations']) or guide_profile_id = auth.uid())
  with check (public.has_staff_role(array['operations']) or guide_profile_id = auth.uid());

-- Support is staff-only plus the person who raised the ticket. A company does
-- not get to read tickets raised about it.
drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (public.is_staff() or requester_id = auth.uid());

drop policy if exists support_tickets_write on public.support_tickets;
create policy support_tickets_write on public.support_tickets
  for all to authenticated
  using (public.has_staff_role(array['support']))
  with check (public.has_staff_role(array['support']));

-- `internal = true` is never visible to the person who raised the ticket. That
-- is the whole reason this table is not `public.messages`.
drop policy if exists support_ticket_messages_select on public.support_ticket_messages;
create policy support_ticket_messages_select on public.support_ticket_messages
  for select to authenticated
  using (
    public.is_staff()
    or (
      internal = false
      and exists (
        select 1 from public.support_tickets t
        where t.id = ticket_id and t.requester_id = auth.uid()
      )
    )
  );

drop policy if exists support_ticket_messages_insert on public.support_ticket_messages;
create policy support_ticket_messages_insert on public.support_ticket_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.is_staff()
      or (
        internal = false
        and exists (
          select 1 from public.support_tickets t
          where t.id = ticket_id and t.requester_id = auth.uid()
        )
      )
    )
  );

-- Staff only, in every direction. There is deliberately no operator-facing
-- policy: this is ICEFALL's opinion of a company, written where the company
-- cannot read it.
drop policy if exists company_notes_all on public.company_notes;
create policy company_notes_all on public.company_notes
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff() and author_id = auth.uid());

/* ========================================================================== */
/* Triggers and grants                                                        */
/* ========================================================================== */

drop trigger if exists verification_documents_touch on public.verification_documents;
create trigger verification_documents_touch before update on public.verification_documents
  for each row execute function public.touch_updated_at();

drop trigger if exists guide_certifications_touch on public.guide_certifications;
create trigger guide_certifications_touch before update on public.guide_certifications
  for each row execute function public.touch_updated_at();

drop trigger if exists support_tickets_touch on public.support_tickets;
create trigger support_tickets_touch before update on public.support_tickets
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.verification_documents  to authenticated;
grant select, insert, update, delete on public.guide_certifications    to authenticated;
grant select, insert, update, delete on public.support_tickets         to authenticated;
grant select, insert                 on public.support_ticket_messages to authenticated;
grant select, insert, delete         on public.company_notes           to authenticated;
grant select on public.verification_document_status to authenticated;

revoke all on public.verification_documents        from anon;
revoke all on public.guide_certifications          from anon;
revoke all on public.support_tickets               from anon;
revoke all on public.support_ticket_messages       from anon;
revoke all on public.company_notes                 from anon;
revoke all on public.verification_document_status  from anon;

revoke all on function public.raise_document_expiry_tasks(int)  from public, anon;
revoke all on function public.raise_unpaid_invoice_tasks()      from public, anon;
revoke all on function public.raise_contract_renewal_tasks(int) from public, anon;
grant execute on function public.raise_document_expiry_tasks(int)  to authenticated;
grant execute on function public.raise_unpaid_invoice_tasks()      to authenticated;
grant execute on function public.raise_contract_renewal_tasks(int) to authenticated;
