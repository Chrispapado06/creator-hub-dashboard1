-- ICEFALL — internal business CRM: the commercial system.
--
-- Enquiries, bookings, commissions, revenue, internal notes, notifications and
-- the analytics event log. This is the half that decides what money is owed, so
-- three of its design choices are load-bearing.
--
-- 1. THE COMMISSION ENGINE REFUSES TO INVENT A RATE.
--
-- The operator-side referral rate is NOT SETTLED — the owner has not chosen, and
-- picking a plausible number here is how an unmade decision starts being quoted
-- back as a made one. So no default rule is seeded, and `record_commission`
-- RAISES when no rule matches rather than falling back to a constant. A booking
-- with no configured rate produces no commission and says why. When the rate is
-- decided it is one INSERT into `commission_rules` and nothing else changes.
--
-- 2. THE WHOLE APPLIED RULE IS COPIED ONTO THE COMMISSION, NOT JUST THE RATE.
--
-- The specification requires that the exact rate used at conversion be preserved
-- so later changes never rewrite historical revenue. A rate alone is not enough:
-- a floor, a cap or a fixed fee also decide the amount, and a commission carrying
-- only `rate_bps` cannot be reproduced if the cap that clipped it later moves. So
-- every component is copied, and a trigger freezes them once the booking
-- completes. `rule_id` is provenance only, and nulls out if the rule is deleted —
-- deleting a rule must never orphan or alter a historical fee.
--
-- Rates are INTEGER BASIS POINTS. 7.5% is 750, 6% is 600. Money is integer minor
-- units throughout this schema and a rate held as a float would reintroduce
-- exactly the drift that rule exists to prevent.
--
-- 3. A BOOKING MAY BE RECORDED WITHOUT A VALUE, AND THAT IS NOT ZERO.
--
-- `value_cents` is nullable with no default and `value_status` says why it is
-- absent. A coherence constraint makes "reported as nothing" unstorable. GMV then
-- sums only reported rows and states how many it excluded, rather than quietly
-- averaging in unknowns as zero.

/* ========================================================================== */
/* Threads gain commercial context                                            */
/* ========================================================================== */

-- The messaging spine already exists and is not rebuilt. `Conversation` in the
-- operator specification IS `public.threads`; a parallel table would split
-- private correspondence across two access-control models.
alter table public.threads add column if not exists company_id uuid
  references public.companies (id) on delete set null;
alter table public.threads add column if not exists product_id uuid
  references public.products (id) on delete set null;
alter table public.threads add column if not exists destination_id text
  references public.destinations (id) on delete set null;
alter table public.threads add column if not exists source_page text;

-- A conversation about a product that has since been archived still has to show
-- what it was about. The name is captured when the thread is created and never
-- follows a later rename.
alter table public.threads add column if not exists product_name_at_creation text;

create index if not exists threads_company_idx on public.threads (company_id, last_message_at desc);

-- NO NEW `kind` VALUE. `enquiry` already means "a client approaching a guide or a
-- company"; what distinguishes a company enquiry is that `company_id` is set.
-- One axis for the shape of the conversation, another for who it is with.

/* -------------------------------------------------------------------------- */
/* Widening who can SEE a thread — carefully                                  */
/* -------------------------------------------------------------------------- */

-- An operator's inbox has to show an enquiry BEFORE anyone at the company has
-- opened it, so company membership becomes a third way to see a thread ROW.
--
-- IT DOES NOT BECOME A WAY TO READ THE MESSAGES. `messages_select` is untouched:
-- access to correspondence still requires participation in the thread. The split
-- is deliberate — a thread row carries business metadata (the objective, the
-- dates, the party size, which company it is for) and that is what an inbox list
-- needs; the messages are the private correspondence, and the rule that you read
-- them by being party to them is the one thing protecting an athlete who wrote
-- down their plans and their honest assessment of their own ability.
--
-- A company user reads the conversation by JOINING it, which is an act that
-- leaves a row behind.
drop policy if exists threads_select on public.threads;
create policy threads_select on public.threads
  for select to authenticated
  using (
    public.is_thread_participant(id)
    or public.is_admin()
    or (company_id is not null and public.is_company_member(company_id))
  );

-- Joining a conversation addressed to your own company.
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
    or exists (
      select 1 from public.threads t
      where t.id = thread_id
        and t.company_id is not null
        and public.is_company_member(t.company_id)
        and profile_id = auth.uid()
    )
  );

/* ========================================================================== */
/* Internal notes — deliberately NOT in `messages`                            */
/* ========================================================================== */

-- A sales employee's private note about a customer cannot live in `messages`:
-- `messages_select` shows every participant every row, so an internal note there
-- is a leak straight to the person it is about. It also stays out of the realtime
-- publication for the same reason.
create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index if not exists conversation_notes_thread_idx
  on public.conversation_notes (thread_id, created_at desc);

/* ========================================================================== */
/* Leads                                                                      */
/* ========================================================================== */

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  thread_id uuid references public.threads (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  destination_id text references public.destinations (id) on delete set null,

  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'quoted', 'booked', 'lost', 'disputed')),

  -- The company's own salesperson. The composite reference means an assignee must
  -- be a member of THIS company — an assignment cannot point at somebody who
  -- works somewhere else.
  assigned_to uuid,

  source_page text,

  -- The conversion timestamps. Nullable, and null means "has not happened",
  -- which is why the funnel is measurable without recomputing from an event log.
  created_at timestamptz not null default now(),
  contacted_at timestamptz,
  qualified_at timestamptz,
  quoted_at timestamptz,
  booked_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  updated_at timestamptz not null default now(),

  constraint leads_assignee_is_company_staff
    foreign key (company_id, assigned_to)
    references public.company_users (company_id, profile_id)
);

create index if not exists leads_company_idx on public.leads (company_id, created_at desc);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_thread_idx on public.leads (thread_id);

/* ========================================================================== */
/* Bookings                                                                   */
/* ========================================================================== */

-- TWO COMMERCIAL STREAMS, ONE TABLE, KEPT STRUCTURALLY APART.
--
--   expedition  the customer pays the company directly, off-platform, and
--               ICEFALL earns a referral fee on the introduction.
--   guide       an on-platform engagement priced by `money.ts`, where the client
--               pays a service fee on top of the guide's rate.
--
-- One table because Support and Revenue both want one thing to search, and
-- because the chat migration's deferred policy clause expects a single
-- `public.bookings` to test against. The streams stay distinct where it matters:
-- the status vocabularies do not overlap, and `commissions.kind` and
-- `revenue_records.stream` keep the money apart. `money.ts` warns that mixing the
-- two models on one booking is a real bug — this is the shape that prevents it.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('expedition', 'guide')),

  lead_id uuid references public.leads (id) on delete set null,
  company_id uuid references public.companies (id) on delete restrict,
  product_id uuid references public.products (id) on delete set null,
  destination_id text references public.destinations (id) on delete set null,
  customer_id uuid references public.profiles (id) on delete set null,
  thread_id uuid references public.threads (id) on delete set null,

  -- NULLABLE, NO DEFAULT. See the header.
  value_cents bigint check (value_cents is null or value_cents >= 0),
  value_status text not null default 'unknown'
    check (value_status in ('reported', 'pending', 'unknown')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),

  status text not null,
  attribution_status text not null default 'icefall'
    check (attribution_status in ('icefall', 'disputed', 'external')),

  booked_at timestamptz not null default now(),
  starts_on date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- "Reported as nothing" is unstorable. An unknown value is NULL and says why.
  constraint bookings_value_coherent check (
    (value_status = 'reported' and value_cents is not null)
    or (value_status <> 'reported' and value_cents is null)
  ),

  -- Each stream keeps its own vocabulary. A guide booking cannot be `disputed`
  -- and an expedition cannot be `awaiting_deposit`, because those words mean
  -- different things about where the money is.
  constraint bookings_status_matches_kind check (
    (kind = 'expedition'
      and status in ('reported', 'confirmed', 'completed', 'cancelled', 'disputed'))
    or (kind = 'guide'
      and status in ('awaiting_deposit', 'deposit_paid', 'paid_in_full', 'completed', 'cancelled'))
  ),

  -- An expedition booking is a company's; a guide booking is not.
  constraint bookings_expedition_has_company check (
    kind <> 'expedition' or company_id is not null
  )
);

create index if not exists bookings_company_idx on public.bookings (company_id, booked_at desc);
create index if not exists bookings_lead_idx on public.bookings (lead_id);
create index if not exists bookings_status_idx on public.bookings (status);

alter table public.leads
  add column if not exists booking_id uuid references public.bookings (id) on delete set null;

/* ========================================================================== */
/* Commission rules — configurable, effective-dated, NEVER hard-coded         */
/* ========================================================================== */

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('referral', 'guide')),

  -- Most specific scope wins: product, then company, then the default.
  scope text not null check (scope in ('default', 'company', 'product', 'guide')),
  scope_company_id uuid references public.companies (id) on delete cascade,
  scope_product_id uuid references public.products (id) on delete cascade,
  scope_profile_id uuid references public.profiles (id) on delete cascade,

  -- BASIS POINTS. 750 = 7.5%. Integer, for the same reason money is.
  rate_bps int check (rate_bps is null or rate_bps between 0 and 10000),
  -- A flat fee instead of a percentage, for the product-level override the
  -- specification calls for ("certain expedition → fixed fee").
  fixed_fee_cents bigint check (fixed_fee_cents is null or fixed_fee_cents >= 0),
  min_fee_cents bigint check (min_fee_cents is null or min_fee_cents >= 0),
  max_fee_cents bigint check (max_fee_cents is null or max_fee_cents >= 0),

  effective_from date not null,
  effective_to date,

  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commission_rules_dates_ordered check (
    effective_to is null or effective_from <= effective_to
  ),
  constraint commission_rules_has_a_basis check (
    rate_bps is not null or fixed_fee_cents is not null
  ),
  constraint commission_rules_bounds_ordered check (
    min_fee_cents is null or max_fee_cents is null or min_fee_cents <= max_fee_cents
  ),
  -- The scope column and the scope id have to agree, or a "company override" with
  -- no company silently becomes a second default.
  constraint commission_rules_scope_coherent check (
    (scope = 'default' and scope_company_id is null and scope_product_id is null and scope_profile_id is null)
    or (scope = 'company' and scope_company_id is not null and scope_product_id is null and scope_profile_id is null)
    or (scope = 'product' and scope_product_id is not null and scope_company_id is null and scope_profile_id is null)
    or (scope = 'guide'   and scope_profile_id is not null and scope_company_id is null and scope_product_id is null)
  )
);

create index if not exists commission_rules_lookup_idx
  on public.commission_rules (kind, scope, effective_from desc);

comment on table public.commission_rules is
  'The configurable rates. NO DEFAULT IS SEEDED: the referral rate is an open owner decision, '
  'and record_commission raises rather than falling back to a number.';

/* ========================================================================== */
/* Commissions — the rule as it stood at conversion, frozen                   */
/* ========================================================================== */

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind text not null check (kind in ('referral', 'guide')),

  -- COPIED AT CONVERSION. Not looked up at read time, ever.
  rate_bps int,
  fixed_fee_cents bigint,
  min_fee_cents bigint,
  max_fee_cents bigint,
  basis_cents bigint not null check (basis_cents >= 0),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),

  -- Provenance only. Nulls out if the rule is deleted; the figures above stand.
  rule_id uuid references public.commission_rules (id) on delete set null,

  status text not null default 'accrued'
    check (status in ('accrued', 'invoiced', 'paid', 'disputed', 'waived')),

  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (booking_id, kind)
);

create index if not exists commissions_booking_idx on public.commissions (booking_id);
create index if not exists commissions_status_idx on public.commissions (status);

/**
 * Once the booking is done, the arithmetic is history.
 *
 * The specification's rule is that historical commission rates are immutable for
 * completed bookings. A policy cannot express "these columns, after that event",
 * so it is a trigger — and a trigger also holds against the service role, which
 * is the connection most likely to be used for a well-meaning bulk correction.
 *
 * `status` deliberately stays editable: accrued → invoiced → paid is the life of
 * the record, not a change to what was owed.
 */
create or replace function public.commissions_freeze_history()
returns trigger
language plpgsql
as $$
declare
  v_done boolean;
begin
  select b.status = 'completed' into v_done from public.bookings b where b.id = old.booking_id;

  if coalesce(v_done, false) and (
       new.rate_bps        is distinct from old.rate_bps
    or new.fixed_fee_cents is distinct from old.fixed_fee_cents
    or new.min_fee_cents   is distinct from old.min_fee_cents
    or new.max_fee_cents   is distinct from old.max_fee_cents
    or new.basis_cents     is distinct from old.basis_cents
    or new.amount_cents    is distinct from old.amount_cents
    or new.currency        is distinct from old.currency
  ) then
    raise exception 'the commission on a completed booking cannot be rewritten'
      using hint = 'Changing a rate must not move historical revenue. Record an adjustment instead.';
  end if;

  return new;
end;
$$;

drop trigger if exists commissions_freeze on public.commissions;
create trigger commissions_freeze before update on public.commissions
  for each row execute function public.commissions_freeze_history();

/* ========================================================================== */
/* Revenue                                                                    */
/* ========================================================================== */

create table if not exists public.revenue_records (
  id uuid primary key default gen_random_uuid(),
  -- Four streams, kept apart because they are four different businesses.
  stream text not null
    check (stream in ('placement', 'referral', 'guide_commission', 'subscription', 'other')),

  source_type text not null check (source_type in ('placement', 'commission', 'manual')),
  placement_id uuid references public.placements (id) on delete set null,
  commission_id uuid references public.commissions (id) on delete set null,

  company_id uuid references public.companies (id) on delete set null,
  destination_id text references public.destinations (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,

  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),

  status text not null default 'accrued'
    check (status in ('accrued', 'invoiced', 'collected', 'written_off')),

  recognised_on date not null,
  period_start date,
  period_end date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint revenue_period_ordered check (
    period_start is null or period_end is null or period_start <= period_end
  )
);

create index if not exists revenue_stream_idx on public.revenue_records (stream, recognised_on desc);
create index if not exists revenue_company_idx on public.revenue_records (company_id);

/* ========================================================================== */
/* Notifications                                                              */
/* ========================================================================== */

create table if not exists public.operator_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists operator_notifications_inbox_idx
  on public.operator_notifications (profile_id, created_at desc) where read_at is null;

comment on table public.operator_notifications is
  'Includes placement_expiring and placement_expired — the REMINDER that replaces an automatic reorder.';

/* ========================================================================== */
/* Analytics events                                                           */
/* ========================================================================== */

-- WHAT THIS TABLE IS AND IS NOT TRUSTED FOR.
--
-- An operator reads their view count on the dashboard they use to decide whether
-- to keep paying ICEFALL. A row written by a browser is self-reported: anyone
-- holding the publishable key can insert one, so a client-emitted count is not
-- evidence and must never be presented as an audited figure.
--
-- `source` is therefore not decoration. Commercial reporting — anything an
-- operator sees, anything a renewal conversation rests on — must filter to
-- `source = 'server'`. Client events are usable for product analytics, where
-- being roughly right is enough and nobody is spending money on the answer.
--
-- Nothing emits either kind yet, which is why the operator portal currently says
-- ICEFALL is not counting views. That sentence is correct and should stay until
-- a trusted emitter exists.
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event_type text not null check (length(trim(event_type)) between 1 and 60),
  source text not null default 'client' check (source in ('client', 'server')),

  company_id uuid references public.companies (id) on delete set null,
  destination_id text references public.destinations (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  thread_id uuid references public.threads (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  source_page text,

  -- A salted, rotating hash — never a stable identifier, never an address. It
  -- exists to deduplicate a refresh, not to follow a person between sessions.
  visitor_hash text
);

create index if not exists analytics_events_company_idx
  on public.analytics_events (company_id, occurred_at desc);
create index if not exists analytics_events_type_idx
  on public.analytics_events (event_type, occurred_at desc);

/* ========================================================================== */
/* The commission engine                                                      */
/* ========================================================================== */

/**
 * Which rule applies, on a given day.
 *
 * Most specific scope wins — product, then company, then the default — and within
 * a scope the latest rule that had already come into effect. Returns nothing when
 * nothing matches, and the caller is expected to treat that as an answer rather
 * than reach for a constant.
 */
create or replace function public.resolve_commission_rule(
  p_kind text,
  p_company_id uuid,
  p_product_id uuid,
  p_on date default current_date
)
returns public.commission_rules
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.*
  from public.commission_rules r
  where r.kind = p_kind
    and r.effective_from <= p_on
    and (r.effective_to is null or r.effective_to >= p_on)
    and (
      (r.scope = 'product' and r.scope_product_id = p_product_id)
      or (r.scope = 'company' and r.scope_company_id = p_company_id)
      or r.scope = 'default'
    )
  order by
    case r.scope when 'product' then 0 when 'company' then 1 else 2 end,
    r.effective_from desc
  limit 1;
$$;

/**
 * Work out what is owed on a booking, and freeze the rule that decided it.
 *
 * THIS FUNCTION WILL NOT INVENT A RATE. If no rule matches it raises, and no
 * commission row is created. That is deliberate: the referral rate is an open
 * decision, and a function that quietly fell back to a plausible default would
 * turn an unmade choice into figures somebody quotes in a meeting.
 *
 * It also refuses a booking with no recorded value. A commission computed on a
 * `pending` value would be a number derived from an absence.
 */
create or replace function public.record_commission(
  p_booking_id uuid,
  p_kind text default 'referral'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.bookings%rowtype;
  r public.commission_rules%rowtype;
  v_amount bigint;
  v_id uuid;
begin
  if public.has_staff_role(array['finance', 'operations']) is not true then
    raise exception 'only ICEFALL finance or operations staff may record a commission';
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'no such booking';
  end if;

  if b.value_status <> 'reported' or b.value_cents is null then
    raise exception 'this booking has no recorded value, so no commission can be computed'
      using hint = 'Record the booking value first. A commission on an unknown value would be invented.';
  end if;

  r := public.resolve_commission_rule(p_kind, b.company_id, b.product_id, b.booked_at::date);

  if r.id is null then
    raise exception 'no % commission rule is configured for this booking', p_kind
      using hint = 'Add a rule in Settings. Nothing is assumed — the rate is a decision, not a default.';
  end if;

  -- A fixed fee wins over a percentage when both are set: an explicitly agreed
  -- amount is a stronger statement than a rate that happens to also apply.
  v_amount := coalesce(r.fixed_fee_cents, (b.value_cents * r.rate_bps) / 10000);

  if r.min_fee_cents is not null then v_amount := greatest(v_amount, r.min_fee_cents); end if;
  if r.max_fee_cents is not null then v_amount := least(v_amount, r.max_fee_cents); end if;

  -- A fee larger than the booking it is charged on is arithmetic gone wrong, not
  -- a commercial arrangement.
  v_amount := least(v_amount, b.value_cents);

  insert into public.commissions
    (booking_id, kind, rate_bps, fixed_fee_cents, min_fee_cents, max_fee_cents,
     basis_cents, amount_cents, currency, rule_id)
  values
    (b.id, p_kind, r.rate_bps, r.fixed_fee_cents, r.min_fee_cents, r.max_fee_cents,
     b.value_cents, v_amount, b.currency, r.id)
  returning id into v_id;

  insert into public.revenue_records
    (stream, source_type, commission_id, company_id, destination_id, product_id,
     amount_cents, currency, recognised_on)
  values
    (case when p_kind = 'referral' then 'referral' else 'guide_commission' end,
     'commission', v_id, b.company_id, b.destination_id, b.product_id,
     v_amount, b.currency, b.booked_at::date);

  perform public.record_audit_event(
    'commission.recorded', 'booking', b.id::text, null,
    jsonb_build_object('kind', p_kind, 'rate_bps', r.rate_bps,
                       'fixed_fee_cents', r.fixed_fee_cents,
                       'basis_cents', b.value_cents, 'amount_cents', v_amount),
    null);

  return v_id;
end;
$$;

/* ========================================================================== */
/* Row-level security                                                         */
/* ========================================================================== */

alter table public.conversation_notes      enable row level security;
alter table public.leads                   enable row level security;
alter table public.bookings                enable row level security;
alter table public.commission_rules        enable row level security;
alter table public.commissions             enable row level security;
alter table public.revenue_records         enable row level security;
alter table public.operator_notifications  enable row level security;
alter table public.analytics_events        enable row level security;

alter table public.conversation_notes      force row level security;
alter table public.commissions             force row level security;
alter table public.revenue_records         force row level security;

/* ---- conversation notes -------------------------------------------------- */

-- The company and ICEFALL. NEVER the customer, who is a participant in the
-- thread this note hangs off — which is exactly why it is not in `messages`.
drop policy if exists conversation_notes_select on public.conversation_notes;
create policy conversation_notes_select on public.conversation_notes
  for select to authenticated
  using (public.is_staff() or public.is_company_member(company_id));

drop policy if exists conversation_notes_insert on public.conversation_notes;
create policy conversation_notes_insert on public.conversation_notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_staff() or public.is_company_member(company_id))
  );

-- No UPDATE policy: a note is a record of what somebody thought at the time.
drop policy if exists conversation_notes_delete on public.conversation_notes;
create policy conversation_notes_delete on public.conversation_notes
  for delete to authenticated
  using (author_id = auth.uid() or public.has_staff_role(array['super_admin']));

/* ---- leads --------------------------------------------------------------- */

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (public.is_staff() or public.is_company_member(company_id) or customer_id = auth.uid());

drop policy if exists leads_write on public.leads;
create policy leads_write on public.leads
  for all to authenticated
  using (public.has_staff_role(array['sales', 'operations', 'support']) or public.is_company_member(company_id))
  with check (public.has_staff_role(array['sales', 'operations', 'support']) or public.is_company_member(company_id));

/* ---- bookings ------------------------------------------------------------ */

-- An operator SEES bookings attributed to them; ICEFALL records them. The fee
-- rests on the attribution, so who may assert one is the whole question.
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated
  using (
    public.is_staff()
    or (company_id is not null and public.is_company_member(company_id))
    or customer_id = auth.uid()
  );

drop policy if exists bookings_write on public.bookings;
create policy bookings_write on public.bookings
  for all to authenticated
  using (public.has_staff_role(array['sales', 'operations', 'finance', 'support']))
  with check (public.has_staff_role(array['sales', 'operations', 'finance', 'support']));

/* ---- commission rules, commissions, revenue ------------------------------ */

-- INTERNAL COMMERCIAL INFORMATION. No operator-facing policy exists on any of
-- these three, in any direction. What one company is charged is not another
-- company's business, and ICEFALL's margin is nobody's but ICEFALL's.
drop policy if exists commission_rules_select on public.commission_rules;
create policy commission_rules_select on public.commission_rules
  for select to authenticated using (public.is_staff());

drop policy if exists commission_rules_write on public.commission_rules;
create policy commission_rules_write on public.commission_rules
  for all to authenticated
  using (public.has_staff_role(array['finance']))
  with check (public.has_staff_role(array['finance']));

drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions
  for select to authenticated using (public.is_staff());

-- Only the status moves by hand; the arithmetic is written by
-- `record_commission` and frozen by trigger once the booking completes.
drop policy if exists commissions_update on public.commissions;
create policy commissions_update on public.commissions
  for update to authenticated
  using (public.has_staff_role(array['finance']))
  with check (public.has_staff_role(array['finance']));

drop policy if exists revenue_records_select on public.revenue_records;
create policy revenue_records_select on public.revenue_records
  for select to authenticated using (public.is_staff());

drop policy if exists revenue_records_write on public.revenue_records;
create policy revenue_records_write on public.revenue_records
  for all to authenticated
  using (public.has_staff_role(array['finance']))
  with check (public.has_staff_role(array['finance']));

/* ---- notifications ------------------------------------------------------- */

drop policy if exists operator_notifications_select on public.operator_notifications;
create policy operator_notifications_select on public.operator_notifications
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

-- Marking your own as read, and nothing else.
drop policy if exists operator_notifications_update on public.operator_notifications;
create policy operator_notifications_update on public.operator_notifications
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

/* ---- analytics ----------------------------------------------------------- */

-- Staff read the raw log. Operators do not: their performance figures come from
-- an aggregate, so no company can enumerate another's traffic row by row.
drop policy if exists analytics_events_select on public.analytics_events;
create policy analytics_events_select on public.analytics_events
  for select to authenticated using (public.is_staff());

-- Anyone signed in may emit, because the consumer apps are where views happen —
-- and that is exactly why `source` defaults to 'client' and why a client row is
-- not evidence. A signed-in user cannot claim a row came from the server.
drop policy if exists analytics_events_insert on public.analytics_events;
create policy analytics_events_insert on public.analytics_events
  for insert to authenticated
  with check (source = 'client' or public.is_staff());

/* ========================================================================== */
/* Triggers                                                                   */
/* ========================================================================== */

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

drop trigger if exists commission_rules_touch on public.commission_rules;
create trigger commission_rules_touch before update on public.commission_rules
  for each row execute function public.touch_updated_at();

drop trigger if exists commissions_touch on public.commissions;
create trigger commissions_touch before update on public.commissions
  for each row execute function public.touch_updated_at();

drop trigger if exists revenue_records_touch on public.revenue_records;
create trigger revenue_records_touch before update on public.revenue_records
  for each row execute function public.touch_updated_at();

/* ========================================================================== */
/* Grants                                                                     */
/* ========================================================================== */

grant select, insert, delete         on public.conversation_notes     to authenticated;
grant select, insert, update, delete on public.leads                  to authenticated;
grant select, insert, update, delete on public.bookings               to authenticated;
grant select, insert, update, delete on public.commission_rules       to authenticated;
-- No INSERT and no DELETE on commissions: they are created by
-- `record_commission`, which copies the rule that produced them. A hand-inserted
-- commission is one with no provenance.
grant select, update                 on public.commissions            to authenticated;
grant select, insert, update, delete on public.revenue_records        to authenticated;
grant select, update                 on public.operator_notifications to authenticated;
grant select, insert                 on public.analytics_events       to authenticated;

revoke all on public.conversation_notes     from anon;
revoke all on public.leads                  from anon;
revoke all on public.bookings               from anon;
revoke all on public.commission_rules       from anon;
revoke all on public.commissions            from anon;
revoke all on public.revenue_records        from anon;
revoke all on public.operator_notifications from anon;
revoke all on public.analytics_events       from anon;

revoke all on function public.resolve_commission_rule(text, uuid, uuid, date) from public, anon;
revoke all on function public.record_commission(uuid, text)                   from public, anon;
grant execute on function public.resolve_commission_rule(text, uuid, uuid, date) to authenticated;
grant execute on function public.record_commission(uuid, text)                   to authenticated;

/* ========================================================================== */
/* Realtime                                                                   */
/* ========================================================================== */

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.operator_notifications;
  end if;
exception
  when duplicate_object then null;
end
$$;

-- `conversation_notes` is deliberately NOT in the realtime publication. It is
-- the one table on a thread that the customer must never receive.
