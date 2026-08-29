-- ICEFALL — internal business CRM: marketplace inventory and the publication
-- boundary.
--
-- Two rules from the specification are load-bearing here, and both are enforced
-- by the database rather than by the applications on top of it. An application
-- rule is a rule until someone calls the API directly.
--
-- RULE 1 — ONLY ICEFALL CONTROLS RANKING, AND EXPIRY NEVER RESHUFFLES.
--
-- Paid positions #1–#5 on a mountain are the product being sold. Two things can
-- go wrong: two companies occupying one slot, and a slot changing hands without
-- a human deciding it.
--
-- The first is a partial unique index, so a duplicate occupant is not "prevented
-- by the placement manager" — it is unstorable.
--
-- The second is subtler and is why `expired` is NOT a stored status. If a nightly
-- job flipped an expired placement to `expired`, that write would free the slot
-- under the unique index, and the next assignment would slide someone into #1
-- because a clock ticked. So the term is stored as dates, `status` holds only
-- what an administrator set, and expiry is COMPUTED at read time by the view
-- below. The occupant keeps position #1 after their term ends until a person
-- moves them. There is no code path by which a background task can alter a
-- marketplace placement, because nothing writes to this table on a timer.
--
-- RULE 2 — OPERATOR EDITS ARE NEVER IMMEDIATELY PUBLIC.
--
-- A live product cannot be updated by its operator at all: the UPDATE policy's
-- USING clause only matches rows whose status is still `draft`. Once something
-- is live, the only route to changing it is a pending content version and an
-- ICEFALL decision. That is the publication boundary, and it is a policy rather
-- than a convention so that neither CRM can route around it.
--
-- WHY A CONTENT VERSION IS A PARTIAL PATCH
--
-- `payload` holds ONLY the fields that changed. The specification requires that
-- one operator updating a single expedition price does not force every other
-- pending change back into review — which is only possible if a version knows
-- precisely which fields it touches. Two pending versions on one product coexist
-- happily while their field sets are disjoint; overlapping ones are refused at
-- submission with a message naming the clash, because the alternative is one
-- edit silently overwriting another.

/* ========================================================================== */
/* Placements — the paid positions                                            */
/* ========================================================================== */

create table if not exists public.placements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  destination_id text not null references public.destinations (id) on delete restrict,

  -- Not called `position`: that is a SQL function name, and a column that needs
  -- quoting in half its uses is a column that will eventually be mis-typed.
  slot_position int not null check (slot_position between 1 and 5),

  starts_on date not null,
  ends_on date not null,

  -- ONLY what a person set. `expired` is deliberately absent — see the header.
  status text not null default 'reserved'
    check (status in ('reserved', 'active', 'cancelled')),

  -- What the company paid for the slot. Null is a legitimate state: a placement
  -- may be recorded before its commercial terms are agreed. It is not zero.
  price_cents bigint check (price_cents is null or price_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),

  created_by uuid references public.profiles (id) on delete set null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz,
  change_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint placements_term_ordered check (starts_on <= ends_on)
);

-- THE CONSTRAINT THAT MAKES DOUBLE-SELLING A SLOT IMPOSSIBLE.
--
-- `cancelled` is the only status that releases a slot, and it is only ever set
-- by an administrator. A placement past its end date still occupies its position
-- because its status is still `reserved` or `active` — which is exactly the
-- behaviour the specification asks for.
create unique index if not exists placements_one_occupant_per_slot
  on public.placements (destination_id, slot_position)
  where status in ('reserved', 'active');

create index if not exists placements_company_idx on public.placements (company_id);
create index if not exists placements_ends_on_idx on public.placements (ends_on);

/**
 * Placements with expiry computed, never stored.
 *
 * `security_invoker` matters: without it a view runs with its owner's rights and
 * would hand every placement to any signed-in user, straight past the policies
 * on the table underneath.
 */
create or replace view public.placement_status
with (security_invoker = true)
as
select
  p.*,
  case
    when p.status = 'cancelled'      then 'cancelled'
    when p.ends_on   < current_date  then 'expired'
    when p.starts_on > current_date  then 'reserved'
    else p.status
  end as effective_status,
  -- What the internal task queue watches. A flag for a person, not an action.
  (p.status <> 'cancelled' and p.ends_on < current_date) as needs_review,
  (p.ends_on - current_date) as days_remaining
from public.placements p;

comment on view public.placement_status is
  'Expiry is derived here and never written back. Nothing alters a placement on a timer.';

/* ========================================================================== */
/* Products                                                                   */
/* ========================================================================== */

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  kind text not null check (kind in ('expedition', 'trek')),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 160),
  summary text,
  description text,

  -- PRICE. A product whose price is not known is not a product priced at zero.
  price_from_cents bigint check (price_from_cents is null or price_from_cents >= 0),
  price_state text not null default 'unknown'
    check (price_state in ('known', 'on_request', 'unknown')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  payment_notes text,

  duration_days_min int check (duration_days_min is null or duration_days_min between 1 and 200),
  duration_days_max int check (duration_days_max is null or duration_days_max between 1 and 200),
  season text,
  difficulty text,
  max_altitude_m int check (max_altitude_m is null or max_altitude_m between 0 and 9000),

  -- AVAILABILITY. Same rule: unknown is a state, not the number 0.
  seats_available int check (seats_available is null or seats_available >= 0),
  availability_state text not null default 'unknown'
    check (availability_state in ('available', 'limited', 'full', 'unknown')),

  requirements text[] not null default '{}',
  inclusions   text[] not null default '{}',
  exclusions   text[] not null default '{}',
  itinerary jsonb,
  faqs jsonb,

  -- THE PUBLICATION STATE. Only ICEFALL can reach 'live'.
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'live', 'archived')),
  live_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, slug),
  constraint products_duration_ordered check (
    duration_days_min is null or duration_days_max is null
    or duration_days_min <= duration_days_max
  ),
  -- A known price must have a figure; an unknown one must not carry a number
  -- that could be read, summed or sorted as though it were real.
  constraint products_price_coherent check (
    (price_state = 'known' and price_from_cents is not null)
    or (price_state <> 'known' and price_from_cents is null)
  ),
  constraint products_live_has_date check (
    (status = 'live' and live_at is not null) or status <> 'live'
  )
);

create index if not exists products_company_idx on public.products (company_id);
create index if not exists products_status_idx  on public.products (status);

/* ---- product ↔ mountain -------------------------------------------------- */

create table if not exists public.product_destinations (
  product_id uuid not null references public.products (id) on delete cascade,
  destination_id text not null references public.destinations (id) on delete restrict,
  primary key (product_id, destination_id)
);

create index if not exists product_destinations_destination_idx
  on public.product_destinations (destination_id);

/* ---- departures ---------------------------------------------------------- */

-- A DEPARTURE HAS TWO KINDS OF COLUMN, AND THEY GET DIFFERENT WRITE PATHS.
--
-- PROVENANCE: an owner decision, 2026-08-28. Constitution §6, decision 12.
-- Put to the owner first-hand by Session 04 as a plain product question — "when a
-- company's trip fills up or a date changes, should that show on Icefall straight
-- away, or wait for Icefall to approve it first?" — against three options:
-- everything waits for approval, everything is instant, or spaces instant and the
-- rest approved. The owner chose the third, and confirmed it directly afterwards.
--
-- The reasoning is the owner's own: availability is a fact about the operator's
-- own logistics, and making them wait for ICEFALL to approve "this date is now
-- full" is an operational trap whose cost lands on the climber who enquires
-- about a sold-out trip in the meantime. Price and the existence of a departure
-- are advertised claims, and they are the two things an operator has most reason
-- to overstate — so those go through approval.
--
-- Enforced with COLUMN-LEVEL PRIVILEGES rather than a policy, so the boundary
-- holds before any policy is consulted and without every screen remembering to
-- behave. See the grants at the foot of this file.
create table if not exists public.product_departures (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,

  -- Approved content: writable only through a content version or by staff.
  departure_date date not null,
  end_date date,
  price_cents bigint check (price_cents is null or price_cents >= 0),

  -- Operational: the operator writes these directly.
  availability text not null default 'unknown'
    check (availability in ('available', 'limited', 'full', 'unavailable', 'unknown')),
  spots_total int check (spots_total is null or spots_total >= 0),
  -- Never defaulted to 0. "Not stated" and "sold out" are different statements
  -- and the app has to be able to tell them apart.
  spots_left int check (spots_left is null or spots_left >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departures_dates_ordered check (end_date is null or departure_date <= end_date),
  constraint departures_spots_sane check (
    spots_total is null or spots_left is null or spots_left <= spots_total
  )
);

create index if not exists product_departures_product_idx
  on public.product_departures (product_id, departure_date);

/* ---- media --------------------------------------------------------------- */

-- Photography carries a licence and an attribution or it does not get approved.
-- ICEFALL's rule is that images come from sources whose terms are tracked; an
-- approved asset with an empty credit is how that rule quietly stops holding.
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  -- 'document' covers the certifications and insurance papers the verification
  -- module reviews; they are uploaded and reviewed exactly like a photograph.
  kind text not null check (kind in ('image', 'video', 'document')),
  storage_path text not null,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size > 0),
  alt_text text,
  credit text,
  licence text,
  width_px int check (width_px is null or width_px > 0),
  height_px int check (height_px is null or height_px > 0),
  bytes bigint check (bytes is null or bytes >= 0),
  state text not null default 'pending'
    check (state in ('pending', 'approved', 'rejected')),
  decision_reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint media_approved_is_attributed check (
    state <> 'approved'
    or (licence is not null and length(trim(licence)) > 0
        and credit is not null and length(trim(credit)) > 0)
  ),
  constraint media_refusal_has_reason check (
    state <> 'rejected' or (decision_reason is not null and length(trim(decision_reason)) > 0)
  )
);

create index if not exists media_assets_company_idx on public.media_assets (company_id);
create index if not exists media_assets_state_idx on public.media_assets (state) where state = 'pending';

/* ========================================================================== */
/* The publication boundary                                                   */
/* ========================================================================== */

/**
 * Which fields an operator is allowed to propose a change to.
 *
 * This is the "configured approval rules" the specification asks for, and it is
 * also a security boundary: without it a submitted payload could carry
 * `{"status":"live"}` or `{"company_id":"..."}` and the approval step would
 * dutifully apply it. Anything not listed here cannot be proposed at all.
 */
create table if not exists public.editable_fields (
  entity_type text not null check (entity_type in ('company', 'product')),
  field text not null,
  primary key (entity_type, field)
);

insert into public.editable_fields (entity_type, field) values
  ('company', 'name'),
  ('company', 'legal_name'),
  ('company', 'logo_path'),
  ('company', 'description'),
  ('company', 'countries'),
  ('company', 'regions'),
  ('product', 'name'),
  ('product', 'summary'),
  ('product', 'description'),
  ('product', 'price_from_cents'),
  ('product', 'price_state'),
  ('product', 'currency'),
  ('product', 'payment_notes'),
  ('product', 'duration_days_min'),
  ('product', 'duration_days_max'),
  ('product', 'season'),
  ('product', 'difficulty'),
  ('product', 'max_altitude_m'),
  ('product', 'seats_available'),
  ('product', 'availability_state'),
  ('product', 'requirements'),
  ('product', 'inclusions'),
  ('product', 'exclusions'),
  ('product', 'itinerary'),
  ('product', 'faqs')
on conflict do nothing;

create table if not exists public.content_versions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('company', 'product')),
  entity_id uuid not null,
  -- Denormalised so a policy can answer "is this mine?" without a join back
  -- through two tables on every row read.
  company_id uuid not null references public.companies (id) on delete cascade,

  -- ONLY the changed fields. See the header.
  payload jsonb not null,
  changed_fields text[] not null default '{}',

  -- The live values of those same fields at the moment the operator started
  -- editing. Checked again at approval: if the live value has moved since, the
  -- change is refused rather than applied over the top of it. This is the other
  -- half of "never silently lose an edit" — the overlap check stops two
  -- operators colliding, this stops an operator overwriting ICEFALL.
  base_snapshot jsonb,

  -- Set by the validator, read by the Approval Center. Advisory, never blocking:
  -- the contact-details test is a heuristic and a false positive must not stop a
  -- legitimate edit — it should put the change in front of a person.
  flags text[] not null default '{}',

  state text not null default 'draft'
    check (state in ('draft', 'pending', 'approved', 'rejected', 'changes_requested', 'superseded')),

  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_reason text,
  applied_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A refusal without a reason is not a decision the operator can act on, and
  -- the specification requires the reason be stored.
  constraint content_versions_refusal_has_reason check (
    state not in ('rejected', 'changes_requested')
    or (decision_reason is not null and length(trim(decision_reason)) > 0)
  ),
  constraint content_versions_decided_has_reviewer check (
    state not in ('approved', 'rejected', 'changes_requested')
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint content_versions_payload_is_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists content_versions_entity_idx
  on public.content_versions (entity_type, entity_id, created_at desc);
create index if not exists content_versions_queue_idx
  on public.content_versions (state, submitted_at) where state = 'pending';
create index if not exists content_versions_company_idx
  on public.content_versions (company_id);

/**
 * Does this text look like a way to take the customer off ICEFALL?
 *
 * Operator content must not carry phone numbers, email addresses, messaging
 * handles or direct booking links: the whole commercial model rests on the
 * enquiry and its attribution staying in-platform, and a climber who books
 * off-platform also loses the record of what was agreed.
 *
 * A HEURISTIC, AND TREATED AS ONE. It raises a flag for a human reviewer; it
 * never blocks a submission. "Call the hut on arrival" is not a violation, and a
 * regex that refused it would train operators to work around the system.
 */
create or replace function public.looks_like_contact_details(t text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    t ~* '[[:alnum:]._%%+-]+@[[:alnum:].-]+\.[a-z]{2,}'          -- email
    or t ~ '\+[0-9][0-9 ().-]{7,}'                                -- +NN phone run
    or t ~* '(wa\.me|t\.me|whatsapp|telegram|instagram\.com)'    -- messaging
    or t ~* 'https?://'                                            -- any external link
  , false);
$$;

/**
 * One trigger, not two, and definer.
 *
 * ONE, because these two jobs are ordered: `changed_fields` is derived from the
 * payload, and the overlap check reads it. Postgres fires BEFORE row triggers in
 * alphabetical order by trigger name, so as two triggers the overlap check ran
 * first and compared against an empty array — it detected nothing, and reported
 * success while doing so. Merging them makes the ordering a matter of statement
 * sequence rather than of what the triggers happen to be called.
 *
 * DEFINER, because the overlap check must see EVERY pending version on the
 * entity, not merely the ones the submitter is allowed to read. A conflicting
 * change hidden from the caller by row-level security is still a conflicting
 * change, and letting it through is exactly the silent overwrite this is here to
 * prevent.
 */
create or replace function public.content_versions_validate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unknown text[];
  v_clash   text[];
begin
  /* 1. `changed_fields` is derived, never supplied. If the two could disagree,
        the overlap check below could be defeated by a payload that touches the
        price while declaring that it touches nothing. */
  new.changed_fields := array(select jsonb_object_keys(new.payload) order by 1);

  if array_length(new.changed_fields, 1) is null then
    raise exception 'a content version must change at least one field';
  end if;

  /* 2. Only fields ICEFALL has opened for proposal. Without this a payload could
        carry a publication state or a change of owner, and the approval step
        would dutifully apply it. */
  select array_agg(f order by f) into v_unknown
  from unnest(new.changed_fields) f
  where not exists (
    select 1 from public.editable_fields ef
    where ef.entity_type = new.entity_type and ef.field = f
  );

  if v_unknown is not null then
    raise exception 'these fields cannot be changed through an operator submission: %',
      array_to_string(v_unknown, ', ')
      using hint = 'Publication state, ownership and commercial terms are set by ICEFALL, not proposed.';
  end if;

  /* 3. Advisory flags for the reviewer. Never a refusal — see the helper. */
  new.flags := '{}';
  if exists (
    select 1 from jsonb_each_text(new.payload) kv
    where jsonb_typeof(new.payload -> kv.key) = 'string'
      and public.looks_like_contact_details(kv.value)
  ) then
    new.flags := array_append(new.flags, 'possible_contact_details');
  end if;

  /* 4. Two pending versions may not claim the same field. Refusing the second
        submission is the "clearly serialize" half of the rule that an edit must
        never be silently lost — the operator is told which field clashes. */
  if new.state = 'pending' then
    select array_agg(distinct f) into v_clash
    from public.content_versions cv
    cross join unnest(cv.changed_fields) f
    where cv.id <> new.id
      and cv.entity_type = new.entity_type
      and cv.entity_id = new.entity_id
      and cv.state = 'pending'
      and f = any(new.changed_fields);

    if v_clash is not null then
      raise exception 'a review is already pending for: %', array_to_string(v_clash, ', ')
        using hint = 'Withdraw or wait for the pending change before proposing the same field again.';
    end if;
  end if;

  return new;
end;
$$;

-- The two earlier triggers this replaces, dropped by name so a database that
-- already ran an interim version of this migration converges on one trigger.
drop trigger if exists content_versions_sync_fields on public.content_versions;
drop trigger if exists content_versions_no_overlap on public.content_versions;

drop trigger if exists content_versions_validate on public.content_versions;
create trigger content_versions_validate
  before insert or update on public.content_versions
  for each row execute function public.content_versions_validate();

/* -------------------------------------------------------------------------- */
/* Applying an approved version                                               */
/* -------------------------------------------------------------------------- */

/**
 * Approve a pending version and promote it to live.
 *
 * Definer, because promotion is precisely the thing no operator may do. The
 * whitelist is applied a second time here rather than trusted from submission
 * time: the set of editable fields could have changed between the two moments,
 * and the narrower answer should win.
 */
create or replace function public.approve_content_version(
  p_version_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v          public.content_versions%rowtype;
  v_table    text;
  v_cols     text;
  v_merged   jsonb;
  v_before   jsonb;
  v_fields   text[];
begin
  if public.has_staff_role(array['operations']) is not true then
    raise exception 'only ICEFALL operations staff may approve content';
  end if;

  select * into v from public.content_versions where id = p_version_id for update;
  if not found then
    raise exception 'no such content version';
  end if;
  if v.state <> 'pending' then
    raise exception 'only a pending version can be approved (this one is %)', v.state;
  end if;

  v_table := case v.entity_type when 'company' then 'companies' else 'products' end;

  select array_agg(f order by f) into v_fields
  from unnest(v.changed_fields) f
  where exists (
    select 1 from public.editable_fields ef
    where ef.entity_type = v.entity_type and ef.field = f
  );

  if v_fields is null then
    raise exception 'nothing in this version is applicable any more';
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
    into v_before using v.entity_id;
  if v_before is null then
    raise exception 'the record this version belongs to no longer exists';
  end if;

  -- If the operator proposed a change from a value that has since moved, the
  -- honest answer is to refuse and show them, not to apply the patch over the
  -- newer value and lose it.
  if v.base_snapshot is not null then
    declare
      v_moved text[];
    begin
      select array_agg(f order by f) into v_moved
      from unnest(v_fields) f
      where v.base_snapshot ? f
        and (v_before -> f) is distinct from (v.base_snapshot -> f);

      if v_moved is not null then
        raise exception 'the live value of % changed after this was proposed',
          array_to_string(v_moved, ', ')
          using hint = 'Ask the operator to resubmit against the current value.';
      end if;
    end;
  end if;

  v_merged := v_before || v.payload;
  v_cols := (select string_agg(format('%I', f), ', ') from unnest(v_fields) f);

  execute format(
    'update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id = $2',
    v_table, v_cols, v_cols, v_table
  ) using v_merged, v.entity_id;

  -- Approving product content is what makes it public.
  if v.entity_type = 'product' then
    update public.products
       set status = 'live', live_at = coalesce(live_at, now())
     where id = v.entity_id and status in ('draft', 'pending_review');
  end if;

  update public.content_versions
     set state = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         applied_at = now(),
         decision_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = v.id;

  perform public.record_audit_event(
    'content.approved', v.entity_type, v.entity_id::text,
    jsonb_build_object('fields', v_fields, 'before', v_before - 'id'),
    v.payload, p_reason
  );
end;
$$;

/**
 * Refuse a pending version. The live record is not touched — that is the point.
 */
create or replace function public.decide_content_version(
  p_version_id uuid,
  p_decision text,      -- 'rejected' | 'changes_requested'
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.content_versions%rowtype;
begin
  if public.has_staff_role(array['operations']) is not true then
    raise exception 'only ICEFALL operations staff may decide on content';
  end if;
  if p_decision not in ('rejected', 'changes_requested') then
    raise exception 'decision must be rejected or changes_requested';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'a reason is required so the operator knows what to change';
  end if;

  select * into v from public.content_versions where id = p_version_id for update;
  if not found then
    raise exception 'no such content version';
  end if;
  if v.state <> 'pending' then
    raise exception 'only a pending version can be decided (this one is %)', v.state;
  end if;

  update public.content_versions
     set state = p_decision,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         decision_reason = btrim(p_reason)
   where id = v.id;

  perform public.record_audit_event(
    'content.' || p_decision, v.entity_type, v.entity_id::text,
    null, v.payload, p_reason
  );
end;
$$;

/* -------------------------------------------------------------------------- */
/* Placement writes                                                           */
/* -------------------------------------------------------------------------- */

/**
 * EVERY write to `placements` goes through one of these four functions, and
 * `authenticated` holds no INSERT, UPDATE or DELETE privilege on the table at
 * all — see the grants at the foot of this file.
 *
 * The reason is the specification's requirement that every position change
 * create an audit event. A policy can say who may write; it cannot make the
 * writer also record what they did. With a bare UPDATE available, a staff member
 * changing a position from a SQL console — or a screen that forgot the second
 * call — leaves no trace, and the audit log silently stops being complete.
 * Routing the writes through functions makes the audit event a consequence of
 * the change rather than a courtesy alongside it.
 *
 * Session 04 asked for the blunter privilege-level version of this rule. They
 * were right, and it turns out to close a hole in the audit trail as well.
 */
create or replace function public.create_placement(
  p_company_id uuid,
  p_destination_id text,
  p_slot_position int,
  p_starts_on date,
  p_ends_on date,
  p_price_cents bigint default null,
  p_currency text default 'EUR',
  p_status text default 'reserved'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if public.has_staff_role(array['operations']) is not true then
    raise exception 'only ICEFALL operations staff may create a placement';
  end if;

  begin
    insert into public.placements
      (company_id, destination_id, slot_position, starts_on, ends_on,
       price_cents, currency, status, created_by)
    values
      (p_company_id, p_destination_id, p_slot_position, p_starts_on, p_ends_on,
       p_price_cents, p_currency, p_status, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'position #% on % is already held. Move or cancel the current occupant first.',
      p_slot_position, p_destination_id;
  end;

  perform public.record_audit_event(
    'placement.created', 'placement', v_id::text, null,
    jsonb_build_object('company_id', p_company_id, 'destination_id', p_destination_id,
                       'slot_position', p_slot_position, 'starts_on', p_starts_on,
                       'ends_on', p_ends_on, 'status', p_status),
    null);
  return v_id;
end;
$$;

/** Change the term or the price. Never the position — that is `move_placement`. */
create or replace function public.set_placement_terms(
  p_placement_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_price_cents bigint default null,
  p_status text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.placements%rowtype;
begin
  if public.has_staff_role(array['operations', 'finance']) is not true then
    raise exception 'only ICEFALL operations or finance staff may change placement terms';
  end if;

  select * into v from public.placements where id = p_placement_id for update;
  if not found then
    raise exception 'no such placement';
  end if;

  update public.placements
     set starts_on = p_starts_on,
         ends_on = p_ends_on,
         price_cents = coalesce(p_price_cents, price_cents),
         status = coalesce(p_status, status),
         changed_by = auth.uid(),
         changed_at = now(),
         change_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_placement_id;

  perform public.record_audit_event(
    'placement.terms_changed', 'placement', p_placement_id::text,
    jsonb_build_object('starts_on', v.starts_on, 'ends_on', v.ends_on,
                       'price_cents', v.price_cents, 'status', v.status),
    jsonb_build_object('starts_on', p_starts_on, 'ends_on', p_ends_on,
                       'price_cents', coalesce(p_price_cents, v.price_cents),
                       'status', coalesce(p_status, v.status)),
    p_reason);
end;
$$;

/**
 * Release a slot.
 *
 * The ONLY thing that frees a position under the occupancy index, and it is
 * always a person doing it. This is the counterpart to expiry being derived:
 * a term running out flags the placement, cancelling it is what actually lets
 * someone else in, and only an administrator can do the second one.
 */
create or replace function public.cancel_placement(
  p_placement_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.placements%rowtype;
begin
  if public.has_staff_role(array['operations']) is not true then
    raise exception 'only ICEFALL operations staff may cancel a placement';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'cancelling a paid position requires a reason';
  end if;

  select * into v from public.placements where id = p_placement_id for update;
  if not found then
    raise exception 'no such placement';
  end if;

  update public.placements
     set status = 'cancelled',
         changed_by = auth.uid(),
         changed_at = now(),
         change_reason = btrim(p_reason)
   where id = p_placement_id;

  perform public.record_audit_event(
    'placement.cancelled', 'placement', p_placement_id::text,
    jsonb_build_object('status', v.status, 'slot_position', v.slot_position,
                       'destination_id', v.destination_id),
    jsonb_build_object('status', 'cancelled', 'slot_position', v.slot_position,
                       'destination_id', v.destination_id),
    p_reason);
end;
$$;

/**
 * Move a company between slots, or onto one.
 *
 * A function rather than a bare UPDATE so that the old and new position are
 * captured in the same breath as the change — the specification requires the
 * audit event to carry both, and a client that does the update itself will
 * eventually forget the second half.
 */
create or replace function public.move_placement(
  p_placement_id uuid,
  p_slot_position int,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.placements%rowtype;
begin
  if public.has_staff_role(array['operations']) is not true then
    raise exception 'only ICEFALL operations staff may change a marketplace position';
  end if;
  if p_slot_position not between 1 and 5 then
    raise exception 'a marketplace position is #1 to #5';
  end if;

  select * into v from public.placements where id = p_placement_id for update;
  if not found then
    raise exception 'no such placement';
  end if;
  if v.slot_position = p_slot_position then
    return;
  end if;

  -- The unique index refuses an occupied slot. Catching it here turns a
  -- constraint name into something a person can act on.
  begin
    update public.placements
       set slot_position = p_slot_position,
           changed_by = auth.uid(),
           changed_at = now(),
           change_reason = nullif(btrim(coalesce(p_reason, '')), '')
     where id = p_placement_id;
  exception when unique_violation then
    raise exception 'position #% on % is already held. Move or cancel the current occupant first.',
      p_slot_position, v.destination_id;
  end;

  perform public.record_audit_event(
    'placement.moved', 'placement', p_placement_id::text,
    jsonb_build_object('slot_position', v.slot_position, 'destination_id', v.destination_id),
    jsonb_build_object('slot_position', p_slot_position, 'destination_id', v.destination_id),
    p_reason
  );
end;
$$;

/**
 * The approved half of a departure — price and dates.
 *
 * `authenticated` has no UPDATE privilege on these columns (see the grants), so
 * this function is the only route, and it is staff-only. The operational half —
 * availability and spot counts — needs no function: the operator writes it
 * directly, which is the whole point of the split.
 */
create or replace function public.set_departure_terms(
  p_departure_id uuid,
  p_departure_date date,
  p_end_date date default null,
  p_price_cents bigint default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.product_departures%rowtype;
begin
  if public.has_staff_role(array['operations']) is not true then
    raise exception 'only ICEFALL operations staff may change a departure date or price';
  end if;

  select * into v from public.product_departures where id = p_departure_id for update;
  if not found then
    raise exception 'no such departure';
  end if;

  update public.product_departures
     set departure_date = p_departure_date,
         end_date = p_end_date,
         price_cents = p_price_cents
   where id = p_departure_id;

  perform public.record_audit_event(
    'departure.terms_changed', 'product_departure', p_departure_id::text,
    jsonb_build_object('departure_date', v.departure_date, 'end_date', v.end_date,
                       'price_cents', v.price_cents),
    jsonb_build_object('departure_date', p_departure_date, 'end_date', p_end_date,
                       'price_cents', p_price_cents),
    p_reason);
end;
$$;

/* ========================================================================== */
/* Row-level security                                                         */
/* ========================================================================== */

alter table public.placements         enable row level security;
alter table public.products           enable row level security;
alter table public.product_destinations  enable row level security;
alter table public.product_departures enable row level security;
alter table public.media_assets       enable row level security;
alter table public.editable_fields    enable row level security;
alter table public.content_versions   enable row level security;

alter table public.content_versions   force row level security;

/* ---- placements ---------------------------------------------------------- */

-- An operator may see their own placements — it is their own contract — and
-- nothing about anyone else's. Staff see everything.
drop policy if exists placements_select on public.placements;
create policy placements_select on public.placements
  for select to authenticated
  using (public.is_staff() or public.is_company_member(company_id));

-- Writing is Operations only, in every direction. This is the rule that
-- operators cannot change their own ranking, and it is stated once, here.
drop policy if exists placements_write on public.placements;
create policy placements_write on public.placements
  for all to authenticated
  using (public.has_staff_role(array['operations']))
  with check (public.has_staff_role(array['operations']));

/* ---- products ------------------------------------------------------------ */

-- A live product is the marketplace, so any signed-in user may read one. A draft
-- belongs to its company and to staff.
drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated
  using (status = 'live' or public.is_staff() or public.is_company_member(company_id));

drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert to authenticated
  with check (
    public.has_staff_role(array['operations'])
    or (
      public.is_company_admin(company_id)
      and status = 'draft'
      and live_at is null
    )
  );

-- THE PUBLICATION BOUNDARY.
--
-- The USING clause is the important half: it only matches rows that are still
-- drafts, so an operator cannot update a live or in-review product at all. Their
-- route to changing live content is a content version and an ICEFALL decision.
drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update to authenticated
  using (
    public.has_staff_role(array['operations'])
    or (public.is_company_admin(company_id) and status = 'draft')
  )
  with check (
    public.has_staff_role(array['operations'])
    or (public.is_company_admin(company_id) and status in ('draft', 'pending_review'))
  );

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete to authenticated
  using (public.has_staff_role(array['operations']));

/* ---- product mountains / departures -------------------------------------- */

drop policy if exists product_destinations_select on public.product_destinations;
create policy product_destinations_select on public.product_destinations
  for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (p.status = 'live' or public.is_staff() or public.is_company_member(p.company_id))
    )
  );

-- A company may only attach a product to a mountain ICEFALL has assigned it.
-- This is `CompanyMountain` acting as the authorization boundary it is meant to
-- be, rather than a label on a screen.
drop policy if exists product_destinations_write on public.product_destinations;
create policy product_destinations_write on public.product_destinations
  for all to authenticated
  using (
    public.has_staff_role(array['operations'])
    or exists (
      select 1 from public.products p
      where p.id = product_id and public.company_may_edit_destination(p.company_id, destination_id)
    )
  )
  with check (
    public.has_staff_role(array['operations'])
    or exists (
      select 1 from public.products p
      where p.id = product_id and public.company_may_edit_destination(p.company_id, destination_id)
    )
  );

drop policy if exists product_departures_select on public.product_departures;
create policy product_departures_select on public.product_departures
  for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (p.status = 'live' or public.is_staff() or public.is_company_member(p.company_id))
    )
  );

-- Adding or removing a departure on a LIVE product is an advertised claim, so
-- it is staff-only. While the parent product is still a draft the operator is
-- building it and may do as they like.
drop policy if exists product_departures_insert on public.product_departures;
create policy product_departures_insert on public.product_departures
  for insert to authenticated
  with check (
    public.has_staff_role(array['operations'])
    or exists (select 1 from public.products p
               where p.id = product_id and p.status = 'draft'
                 and public.is_company_member(p.company_id))
  );

drop policy if exists product_departures_delete on public.product_departures;
create policy product_departures_delete on public.product_departures
  for delete to authenticated
  using (
    public.has_staff_role(array['operations'])
    or exists (select 1 from public.products p
               where p.id = product_id and p.status = 'draft'
                 and public.is_company_member(p.company_id))
  );

-- UPDATE is open at the row level to the owning company; WHICH COLUMNS they may
-- touch is decided by the column grants at the foot of this file, not here.
drop policy if exists product_departures_update on public.product_departures;
create policy product_departures_update on public.product_departures
  for update to authenticated
  using (
    public.has_staff_role(array['operations'])
    or exists (select 1 from public.products p
               where p.id = product_id and public.is_company_member(p.company_id))
  )
  with check (
    public.has_staff_role(array['operations'])
    or exists (select 1 from public.products p
               where p.id = product_id and public.is_company_member(p.company_id))
  );

/* ---- media --------------------------------------------------------------- */

drop policy if exists media_assets_select on public.media_assets;
create policy media_assets_select on public.media_assets
  for select to authenticated
  using (state = 'approved' or public.is_staff() or public.is_company_member(company_id));

-- An operator uploads and withdraws; only ICEFALL decides. The `state` an
-- operator may write is `pending` and nothing else. Uploading is a Company
-- Admin's job — a Sales Employee gets conversations and leads, not the catalogue.
drop policy if exists media_assets_insert on public.media_assets;
create policy media_assets_insert on public.media_assets
  for insert to authenticated
  with check (
    public.has_staff_role(array['operations'])
    or (public.is_company_admin(company_id) and state = 'pending')
  );

drop policy if exists media_assets_update on public.media_assets;
create policy media_assets_update on public.media_assets
  for update to authenticated
  using (
    public.has_staff_role(array['operations'])
    or (public.is_company_admin(company_id) and state = 'pending')
  )
  with check (
    public.has_staff_role(array['operations'])
    or (public.is_company_admin(company_id) and state = 'pending')
  );

drop policy if exists media_assets_delete on public.media_assets;
create policy media_assets_delete on public.media_assets
  for delete to authenticated
  using (public.has_staff_role(array['operations']) or public.is_company_member(company_id));

/* ---- editable fields ----------------------------------------------------- */

-- Readable by anyone signed in: an operator's form needs to know which fields it
-- may offer. Changing the list is a super admin's decision.
drop policy if exists editable_fields_select on public.editable_fields;
create policy editable_fields_select on public.editable_fields
  for select to authenticated
  using (true);

drop policy if exists editable_fields_write on public.editable_fields;
create policy editable_fields_write on public.editable_fields
  for all to authenticated
  using (public.has_staff_role(array['super_admin']))
  with check (public.has_staff_role(array['super_admin']));

/* ---- content versions ---------------------------------------------------- */

drop policy if exists content_versions_select on public.content_versions;
create policy content_versions_select on public.content_versions
  for select to authenticated
  using (public.is_staff() or public.is_company_member(company_id));

-- An operator may submit. They may not decide: `state` on insert is limited to
-- draft or pending, and the decided states are unreachable from here.
drop policy if exists content_versions_insert on public.content_versions;
create policy content_versions_insert on public.content_versions
  for insert to authenticated
  with check (
    public.is_staff()
    or (
      public.is_company_admin(company_id)
      and state in ('draft', 'pending')
      and reviewed_by is null and reviewed_at is null and applied_at is null
    )
  );

-- An operator may edit or submit their own DRAFT. Once pending it is out of
-- their hands, and the decision states are reachable only through the two
-- functions above, which check the staff desk themselves.
drop policy if exists content_versions_update on public.content_versions;
create policy content_versions_update on public.content_versions
  for update to authenticated
  using (
    public.is_staff()
    or (public.is_company_admin(company_id) and state = 'draft')
  )
  with check (
    public.is_staff()
    or (
      public.is_company_admin(company_id)
      and state in ('draft', 'pending')
      and reviewed_by is null and reviewed_at is null and applied_at is null
    )
  );

drop policy if exists content_versions_delete on public.content_versions;
create policy content_versions_delete on public.content_versions
  for delete to authenticated
  using (
    public.has_staff_role(array['super_admin'])
    or (public.is_company_member(company_id) and state = 'draft')
  );

/* ========================================================================== */
/* Triggers                                                                   */
/* ========================================================================== */

drop trigger if exists placements_touch on public.placements;
create trigger placements_touch before update on public.placements
  for each row execute function public.touch_updated_at();

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists product_departures_touch on public.product_departures;
create trigger product_departures_touch before update on public.product_departures
  for each row execute function public.touch_updated_at();

drop trigger if exists media_assets_touch on public.media_assets;
create trigger media_assets_touch before update on public.media_assets
  for each row execute function public.touch_updated_at();

drop trigger if exists content_versions_touch on public.content_versions;
create trigger content_versions_touch before update on public.content_versions
  for each row execute function public.touch_updated_at();

/* ========================================================================== */
/* Grants                                                                     */
/* ========================================================================== */

-- PLACEMENTS ARE READ-ONLY AT THE PRIVILEGE LAYER.
--
-- No INSERT, UPDATE or DELETE for anybody reachable from a browser, staff
-- included. Every write goes through create_placement / move_placement /
-- set_placement_terms / cancel_placement, which are the only things that also
-- write the audit event the specification requires. This is why "an operator
-- cannot change its own ranking position" is refused before a policy is even
-- consulted.
grant select on public.placements to authenticated;
grant select, insert, update, delete on public.products           to authenticated;
grant select, insert, update, delete on public.product_destinations  to authenticated;
-- DEPARTURES: the owner's split write path, expressed as privileges.
-- Availability and spot counts are the operator's own operational facts and they
-- write them directly. Price and dates are advertised claims — no UPDATE
-- privilege on those columns exists, so `set_departure_terms` is the only route.
grant select, insert, delete on public.product_departures to authenticated;
grant update (availability, spots_total, spots_left)
  on public.product_departures to authenticated;
grant select, insert, update, delete on public.media_assets       to authenticated;
grant select, insert, update, delete on public.editable_fields    to authenticated;
grant select, insert, update, delete on public.content_versions   to authenticated;
grant select on public.placement_status to authenticated;

revoke all on public.placements         from anon;
revoke all on public.products           from anon;
revoke all on public.product_destinations  from anon;
revoke all on public.product_departures from anon;
revoke all on public.media_assets       from anon;
revoke all on public.editable_fields    from anon;
revoke all on public.content_versions   from anon;
revoke all on public.placement_status   from anon;

revoke all on function public.content_versions_validate()              from public, anon;
revoke all on function public.looks_like_contact_details(text)         from public, anon;
revoke all on function public.create_placement(uuid, text, int, date, date, bigint, text, text) from public, anon;
revoke all on function public.set_placement_terms(uuid, date, date, bigint, text, text) from public, anon;
revoke all on function public.cancel_placement(uuid, text)             from public, anon;
revoke all on function public.set_departure_terms(uuid, date, date, bigint, text) from public, anon;
revoke all on function public.approve_content_version(uuid, text)      from public, anon;
revoke all on function public.decide_content_version(uuid, text, text) from public, anon;
revoke all on function public.move_placement(uuid, int, text)          from public, anon;

grant execute on function public.approve_content_version(uuid, text)      to authenticated;
grant execute on function public.decide_content_version(uuid, text, text) to authenticated;
grant execute on function public.move_placement(uuid, int, text)          to authenticated;
grant execute on function public.looks_like_contact_details(text)        to authenticated;
grant execute on function public.create_placement(uuid, text, int, date, date, bigint, text, text) to authenticated;
grant execute on function public.set_placement_terms(uuid, date, date, bigint, text, text) to authenticated;
grant execute on function public.cancel_placement(uuid, text)            to authenticated;
grant execute on function public.set_departure_terms(uuid, date, date, bigint, text) to authenticated;
