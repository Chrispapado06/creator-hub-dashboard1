-- ICEFALL — four defects found by an adversarial review, all verified against
-- the source before being acted on and all mine.
--
-- ═══ 1. HIGH: ONE COMPANY COULD OVERWRITE ANOTHER'S LIVE LISTING ═══════════
--
-- `content_versions` carries two operator-supplied columns. `company_id` was
-- gated by the insert policy; `entity_id` was a bare uuid with no foreign key,
-- no coherence constraint, and no check anywhere that it belonged to the company
-- claiming it.
--
-- The whole path was reachable. `products_select` deliberately lets any signed-in
-- user read a LIVE product — that is the marketplace — so company A can read
-- company B's product and take its id. A then inserts a content version with
-- `company_id = A` (passes the policy, it is their own company) and
-- `entity_id = B's product`. `content_versions_validate` checks the changed
-- fields against the whitelist and the overlap guard, neither of which looks at
-- ownership. With `base_snapshot` left null the staleness check is skipped too.
-- The row lands in the Operations queue looking like an ordinary edit from A, and
-- approving it writes `where id = v.entity_id` — straight into B's live listing.
-- The audit event then records A as the actor on a change to B's product.
--
-- Every individual guard was doing its job. What was missing is that nothing
-- connected the two operator-supplied columns to each other, and a boundary made
-- of independent checks has a gap exactly where they meet.
--
-- Fixed in BOTH places on purpose: the validator refuses it at submission, and
-- approval re-checks before writing. The second is not redundant — a version can
-- sit in the queue across a migration that changes what the first one does.
--
-- ═══ 2. A BOOKING COULD BE COMMISSIONED TWICE ══════════════════════════════
--
-- `record_commission` never compared its `p_kind` argument to `bookings.kind`,
-- and `unique (booking_id, kind)` permits one row of each. So a single guide
-- booking could carry both a 'guide' commission and a 'referral' one — the
-- parameter even defaults to 'referral' — producing two revenue records for one
-- transaction. `money.ts` says in its own comment that mixing the two models on
-- one booking is a real bug; this is the shape that let it happen.
--
-- ═══ 3. AN INVOICE COULD BE CREDITED PAST 100% ═════════════════════════════
--
-- `issue_credit_note` capped each note at the invoice total but never summed the
-- notes already issued. Two full-value credit notes against one invoice each
-- passed, refunding twice what was billed.

/* ========================================================================== */
/* 1. A content version may only touch its own company's records              */
/* ========================================================================== */

/**
 * Which company owns the thing this version is about.
 *
 * SECURITY DEFINER because it reads tables the submitting operator cannot, and
 * it must answer for entities belonging to companies other than their own —
 * that is precisely the case being caught.
 */
create or replace function public.content_entity_owner(p_entity_type text, p_entity_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  if p_entity_type = 'company' then
    select c.id into v_owner from public.companies c where c.id = p_entity_id;
  elsif p_entity_type = 'product' then
    select p.company_id into v_owner from public.products p where p.id = p_entity_id;
  elsif p_entity_type = 'company_mountain' then
    select cd.company_id into v_owner from public.company_destinations cd where cd.id = p_entity_id;
  else
    raise exception 'unknown content entity type: %', p_entity_type;
  end if;

  return v_owner;
end;
$$;

revoke all on function public.content_entity_owner(text, uuid) from public, anon;
grant execute on function public.content_entity_owner(text, uuid) to authenticated;

create or replace function public.content_versions_validate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unknown text[];
  v_clash   text[];
  v_owner   uuid;
begin
  /* 0. THE RECORD MUST BELONG TO THE COMPANY CLAIMING IT.
        `company_id` and `entity_id` are both supplied by the operator, and until
        this check existed nothing tied them together — which let one company
        submit an edit against another company's live listing. */
  v_owner := public.content_entity_owner(new.entity_type, new.entity_id);

  if v_owner is null then
    raise exception 'no % exists with that id', new.entity_type;
  end if;

  if v_owner <> new.company_id then
    raise exception 'that % belongs to another company', new.entity_type
      using hint = 'A content version can only propose a change to your own records.';
  end if;

  /* 1. `changed_fields` is derived, never supplied. If the two could disagree,
        the overlap check below could be defeated by a payload that touches the
        price while declaring that it touches nothing. */
  new.changed_fields := array(select jsonb_object_keys(new.payload) order by 1);

  if array_length(new.changed_fields, 1) is null then
    raise exception 'a content version must change at least one field';
  end if;

  /* 2. Only fields ICEFALL has opened for proposal. */
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

  /* 3. Advisory flags for the reviewer. Never a refusal — the contact-details
        test is a heuristic and a false positive must not stop a legitimate edit. */
  new.flags := '{}';
  if exists (
    select 1 from jsonb_each_text(new.payload) kv
    where jsonb_typeof(new.payload -> kv.key) = 'string'
      and public.looks_like_contact_details(kv.value)
  ) then
    new.flags := array_append(new.flags, 'possible_contact_details');
  end if;

  /* 4. Two pending versions may not claim the same field. */
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

revoke all on function public.content_versions_validate() from public, anon;

/* ========================================================================== */
/* 2 + the approval-time re-check                                             */
/* ========================================================================== */

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
  v_owner    uuid;
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

  -- CHECKED AGAIN HERE, and this is not redundant. A version can sit in the
  -- queue across a migration, an ownership transfer or a change to the validator
  -- itself; approval is the moment the write actually happens, so it is the
  -- moment worth being sure.
  v_owner := public.content_entity_owner(v.entity_type, v.entity_id);
  if v_owner is null or v_owner <> v.company_id then
    raise exception 'this version claims a % that does not belong to its company', v.entity_type
      using hint = 'Reject it. A submission naming another company''s record is not an editing mistake.';
  end if;

  v_table := case v.entity_type
               when 'company' then 'companies'
               when 'product' then 'products'
               when 'company_mountain' then 'company_destinations'
             end;
  if v_table is null then
    raise exception 'no table is mapped for entity type %', v.entity_type;
  end if;

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
    v.payload, p_reason, v.company_id
  );
end;
$$;

/* ========================================================================== */
/* 2. A commission's kind must match the booking's                            */
/* ========================================================================== */

create or replace function public.commission_kind_matches(p_kind text, p_booking_kind text)
returns boolean
language sql
immutable
as $$
  select (p_kind = 'referral' and p_booking_kind = 'expedition')
      or (p_kind = 'guide'    and p_booking_kind = 'guide');
$$;

comment on function public.commission_kind_matches(text, text) is
  'An expedition booking earns a REFERRAL fee; a guide booking earns a GUIDE commission. Never both on one booking.';

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
  v_basis bigint;
  v_amount bigint;
  v_id uuid;
  v_blockers text[] := '{}';
begin
  if public.has_staff_role(array['finance', 'operations']) is not true then
    raise exception 'only ICEFALL finance or operations staff may record a commission';
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'no such booking';
  end if;

  -- EVERY REASON, NOT THE FIRST ONE CHECKED.
  --
  -- A booking can be blocked by more than one thing at once, and reporting only
  -- the first sends somebody away to fix it — after which they hit the next one
  -- as a surprise. Two round trips for one blocked thing. The same reasoning
  -- already governs `content_versions_validate`, which names the clashing field
  -- rather than saying "a review is pending": the actionable form of a refusal
  -- is the one that says what to do, and it has to say all of it.
  --
  -- The rule is resolved BEFORE the guard so a missing rate can be reported
  -- alongside missing data rather than after it.
  r := public.resolve_commission_rule(p_kind, b.company_id, b.product_id, b.guide_id, b.booked_at::date);

  -- AN EXPEDITION BOOKING EARNS A REFERRAL FEE; A GUIDE BOOKING EARNS A GUIDE
  -- COMMISSION. Never both. `unique (booking_id, kind)` permits one row of each,
  -- and this parameter DEFAULTS to 'referral' — so without this check a single
  -- guide booking could be commissioned twice and produce two revenue records
  -- for one transaction. money.ts says in its own comment that mixing the two
  -- models on one booking is a real bug; this is the shape that allowed it.
  if public.commission_kind_matches(p_kind, b.kind) is not true then
    raise exception 'a % booking cannot earn a % commission', b.kind, p_kind
      using hint = 'An expedition booking earns a referral fee. A guide booking earns a guide commission.';
  end if;

  if b.value_status <> 'reported' or b.value_cents is null then
    v_blockers := array_append(v_blockers,
      'the booking value has not been reported (a commission on an unknown value would be invented)');
  end if;

  if b.pass_through_state = 'unknown' then
    v_blockers := array_append(v_blockers,
      'nothing states what the company passed straight on — record the permits and fees they '
      'collect and hand over, or record that there are none; it cannot be inferred from the total');
  end if;

  if r.id is null then
    v_blockers := array_append(v_blockers,
      format('no %s commission rule is configured (the rate is a decision, not a default)', p_kind));
  end if;

  if array_length(v_blockers, 1) is not null then
    raise exception 'this booking cannot produce a commission yet: %',
      array_to_string(v_blockers, '; ')
      using hint = 'Everything blocking it is listed, so it can be fixed in one pass.';
  end if;

  v_basis := b.value_cents - coalesce(b.pass_through_cents, 0);

  -- Integer division truncates, so the fee rounds DOWN and the fraction goes to
  -- the operator. Rounding is never in ICEFALL's favour, on either stream.
  v_amount := coalesce(r.fixed_fee_cents, (v_basis * r.rate_bps) / 10000);

  if r.min_fee_cents is not null then v_amount := greatest(v_amount, r.min_fee_cents); end if;
  if r.max_fee_cents is not null then v_amount := least(v_amount, r.max_fee_cents); end if;
  -- Capped at the BASIS, not the gross: a floor must not claw back money the
  -- company only passed on.
  v_amount := least(v_amount, v_basis);

  insert into public.commissions
    (booking_id, kind, rate_bps, fixed_fee_cents, min_fee_cents, max_fee_cents,
     basis_cents, gross_cents, pass_through_cents, amount_cents, currency, rule_id)
  values
    (b.id, p_kind, r.rate_bps, r.fixed_fee_cents, r.min_fee_cents, r.max_fee_cents,
     v_basis, b.value_cents, coalesce(b.pass_through_cents, 0), v_amount, b.currency, r.id)
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
                       'gross_cents', b.value_cents,
                       'pass_through_cents', coalesce(b.pass_through_cents, 0),
                       'basis_cents', v_basis, 'amount_cents', v_amount),
    null, b.company_id);

  return v_id;
end;
$$;


/* ========================================================================== */
/* 3. An invoice cannot be credited past what it billed                       */
/* ========================================================================== */

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
  v_already bigint;
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

  -- THE CUMULATIVE TOTAL, not this note alone. Capping each note at the invoice
  -- total let two full-value notes both pass, refunding twice what was billed.
  select coalesce(sum(amount_cents), 0) into v_already
  from public.credit_notes where invoice_id = p_invoice_id;

  if p_amount_cents + v_already > v.total_cents then
    raise exception 'that would credit % against an invoice of %, of which % is already credited',
      p_amount_cents, v.total_cents, v_already
      using hint = 'An invoice cannot be credited for more than it billed.';
  end if;

  insert into public.credit_notes (invoice_id, company_id, amount_cents, currency, reason, issued_by)
  values (p_invoice_id, v.company_id, p_amount_cents, v.currency, btrim(p_reason), auth.uid())
  returning id into v_id;

  perform public.record_audit_event(
    'credit_note.issued', 'invoice', p_invoice_id::text, null,
    jsonb_build_object('amount_cents', p_amount_cents, 'total_credited', p_amount_cents + v_already),
    p_reason, v.company_id);

  return v_id;
end;
$$;

/* ========================================================================== */
/* Grants                                                                     */
/* ========================================================================== */

revoke all on function public.commission_kind_matches(text, text) from public, anon;
grant execute on function public.commission_kind_matches(text, text) to authenticated;
