-- ICEFALL — internal CRM: three defects and one gap in the commercial system.
--
-- Found by a read-only audit of the eight migrations before this one, and each
-- verified against the source before being acted on. None of them is cosmetic.
--
-- 1. A GUIDE COMMISSION RULE COULD NEVER RESOLVE.
--
-- `commission_rules.scope` permits 'guide' with a `scope_profile_id`
-- (20260828120000_crm_commercial.sql:253), but `resolve_commission_rule` matches
-- only product, company and default, and takes no guide argument at all
-- (:505-509). So a guide rule was storable and unreachable, and because
-- `record_commission` raises when nothing resolves (:558-561), EVERY guide
-- commission failed with "no guide commission rule is configured" no matter how
-- carefully somebody had configured one.
--
-- It was invisible because the tests only ever exercised the referral path. A
-- test suite that covers one branch of a two-branch engine reports full health.
--
-- 2. A GUIDE BOOKING COULD NOT NAME ITS GUIDE.
--
-- `bookings.kind` has been 'expedition' | 'guide' since the commercial migration
-- (:190), with a whole status vocabulary for the guide stream (:224-229) — and
-- no guide column. The row could say a guide booking happened and not who it was
-- with. That also blocks the Guides module entirely.
--
-- 3. PROMOTING SOMEONE TO SUPER ADMIN LEFT NO TRACE.
--
-- `staff_members_write` is a bare policy (20260828100000_crm_foundation.sql:454)
-- with no audit call anywhere near it. In a system whose stated rule is that
-- every commercially meaningful internal action is auditable, the single most
-- consequential action available — granting somebody the desk that can grant
-- desks — was the one action that wrote nothing. Fixed by routing it through a
-- function and narrowing the policy so the function is the only way in.
--
-- 4. A COMPANY'S ACTIVITY COULD NOT BE READ BACK.
--
-- `audit_events` is keyed by entity, so "everything that happened to this
-- company" meant gathering that company's placement, product and content-version
-- ids and querying `entity_id in (...)`. One nullable `company_id`, stamped at
-- write time, replaces that. It is a lookup key, NOT a second history store.

/* ========================================================================== */
/* 1. Bookings gain a guide, and a dispute record                             */
/* ========================================================================== */

alter table public.bookings
  add column if not exists guide_id uuid references public.guide_profiles (id) on delete set null;

-- A guide booking without a guide is not a record of anything.
alter table public.bookings drop constraint if exists bookings_guide_named;
alter table public.bookings
  add constraint bookings_guide_named check (kind <> 'guide' or guide_id is not null);

-- `attribution_status = 'disputed'` recorded that something was contested and
-- nothing else — not what, not when, not who raised it, not how it ended. A
-- dispute pauses fee collection, so the reason it is paused has to be legible.
alter table public.bookings add column if not exists dispute_reason text;
alter table public.bookings add column if not exists disputed_at timestamptz;
alter table public.bookings add column if not exists disputed_by uuid
  references public.profiles (id) on delete set null;
alter table public.bookings add column if not exists dispute_resolution text;

alter table public.bookings drop constraint if exists bookings_dispute_coherent;
alter table public.bookings
  add constraint bookings_dispute_coherent check (
    attribution_status <> 'disputed'
    or (dispute_reason is not null and length(trim(dispute_reason)) > 0)
  );

create index if not exists bookings_guide_idx on public.bookings (guide_id);

/* ========================================================================== */
/* 2. Audit events gain a company, and the writer gains a parameter           */
/* ========================================================================== */

alter table public.audit_events add column if not exists company_id uuid
  references public.companies (id) on delete set null;

create index if not exists audit_events_company_idx
  on public.audit_events (company_id, created_at desc);

-- DROPPED AND RECREATED, NOT `create or replace`.
--
-- Adding a seventh parameter with a default via `create or replace` would leave
-- the six-parameter function in place as a separate overload, and every existing
-- six-argument call site would then be ambiguous. Dropping first means the old
-- calls resolve to the new function through its default, which is exactly what
-- is wanted. Nothing depends on the old body.
drop function if exists public.record_audit_event(text, text, text, jsonb, jsonb, text);

create or replace function public.record_audit_event(
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_previous    jsonb default null,
  p_next        jsonb default null,
  p_reason      text  default null,
  p_company_id  uuid  default null
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
    (actor_id, actor_role, action, entity_type, entity_id, previous, next, reason, company_id)
  values
    (auth.uid(), public.my_staff_role(), p_action, p_entity_type, p_entity_id,
     p_previous, p_next, nullif(btrim(coalesce(p_reason, '')), ''), p_company_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_audit_event(text, text, text, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.record_audit_event(text, text, text, jsonb, jsonb, text, uuid) to authenticated;

/* ========================================================================== */
/* 3. The commission engine learns about guides                               */
/* ========================================================================== */

-- Dropped rather than replaced: the signature changes, and two overloads would
-- make every call site ambiguous.
drop function if exists public.resolve_commission_rule(text, uuid, uuid, date);

/**
 * Which rule applies, on a given day.
 *
 * Most specific scope wins — guide, then product, then company, then the
 * default — and within a scope the latest rule already in effect. A guide rule
 * is the most specific because it is about a named person: if somebody has
 * troubled to agree terms with an individual guide, those terms beat anything
 * inherited from the product or the company.
 *
 * Returns nothing when nothing matches, and the caller treats that as an answer
 * rather than reaching for a constant.
 */
create or replace function public.resolve_commission_rule(
  p_kind text,
  p_company_id uuid,
  p_product_id uuid,
  p_guide_id uuid default null,
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
      (r.scope = 'guide'   and r.scope_profile_id = p_guide_id)
      or (r.scope = 'product' and r.scope_product_id = p_product_id)
      or (r.scope = 'company' and r.scope_company_id = p_company_id)
      or r.scope = 'default'
    )
  order by
    case r.scope
      when 'guide' then 0 when 'product' then 1 when 'company' then 2 else 3
    end,
    r.effective_from desc
  limit 1;
$$;

revoke all on function public.resolve_commission_rule(text, uuid, uuid, uuid, date) from public, anon;
grant execute on function public.resolve_commission_rule(text, uuid, uuid, uuid, date) to authenticated;

-- Recreated so it passes the guide through, and stamps the company onto its
-- audit event. The arithmetic and the freezing rule are unchanged.
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

  r := public.resolve_commission_rule(p_kind, b.company_id, b.product_id, b.guide_id, b.booked_at::date);

  if r.id is null then
    raise exception 'no % commission rule is configured for this booking', p_kind
      using hint = 'Add a rule in Settings. Nothing is assumed — the rate is a decision, not a default.';
  end if;

  -- THE BASIS IS THE WHOLE RECORDED BOOKING VALUE, and that is an open question
  -- rather than a settled one.
  --
  -- The guide stream deliberately does NOT work this way: `platformFeeFor` in
  -- icefall-app charges only the guide's own fee, excluding pass-through lines,
  -- so ICEFALL does not earn more because a hut raised its charges. An
  -- expedition booking has the same shape — an Everest package carries a permit
  -- the operator merely passes on — but `bookings` holds one gross figure and
  -- cannot express the split, so the question cannot even be asked of the data
  -- today. The specification says "gross transaction value", which is why it is
  -- built this way; the guide precedent says otherwise; nobody has reconciled
  -- them. Raised with the owner 2026-08-28. Do not "fix" it in passing — it is a
  -- commercial decision about what ICEFALL is charging for.
  --
  -- Integer division truncates, so the fee rounds DOWN. That is deliberate and
  -- matches the guide side: rounding is never in ICEFALL's favour.
  v_amount := coalesce(r.fixed_fee_cents, (b.value_cents * r.rate_bps) / 10000);

  if r.min_fee_cents is not null then v_amount := greatest(v_amount, r.min_fee_cents); end if;
  if r.max_fee_cents is not null then v_amount := least(v_amount, r.max_fee_cents); end if;
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
    null, b.company_id);

  return v_id;
end;
$$;

/* ========================================================================== */
/* 4. Staff changes become auditable                                          */
/* ========================================================================== */

alter table public.staff_members add column if not exists job_title text;
alter table public.staff_members add column if not exists department text;
alter table public.staff_members add column if not exists invited_at timestamptz;
alter table public.staff_members add column if not exists invited_by uuid
  references public.profiles (id) on delete set null;

-- A boolean has no third state, and "invited but not yet accepted" is a state
-- the team page has to be able to show. `active` is kept in step by a check so
-- the two can never disagree about whether somebody can sign in.
alter table public.staff_members add column if not exists status text not null default 'active';
alter table public.staff_members drop constraint if exists staff_members_status_known;
alter table public.staff_members
  add constraint staff_members_status_known check (status in ('invited', 'active', 'suspended'));
alter table public.staff_members drop constraint if exists staff_members_status_agrees;
alter table public.staff_members
  add constraint staff_members_status_agrees check ((status = 'active') = active);

/**
 * Appoint, move or suspend a member of staff — and leave a record of it.
 *
 * The only route to writing `staff_members`, because the policy below no longer
 * permits a direct write. Granting somebody the desk that can grant desks is the
 * most consequential action in this system and it was, until now, the one that
 * wrote nothing to the audit log.
 */
create or replace function public.set_staff_role(
  p_profile_id uuid,
  p_role public.icefall_staff_role,
  p_status text default 'active',
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.staff_members%rowtype;
begin
  if public.has_staff_role(array['super_admin']) is not true then
    raise exception 'only a super admin may appoint or change staff';
  end if;
  if p_status not in ('invited', 'active', 'suspended') then
    raise exception 'status must be invited, active or suspended';
  end if;

  select * into v_before from public.staff_members where profile_id = p_profile_id;

  insert into public.staff_members (profile_id, staff_role, status, active, invited_by, invited_at)
  values (p_profile_id, p_role, p_status, p_status = 'active', auth.uid(),
          case when p_status = 'invited' then now() end)
  on conflict (profile_id) do update
    set staff_role = excluded.staff_role,
        status = excluded.status,
        active = excluded.active;

  perform public.record_audit_event(
    case when v_before.profile_id is null then 'staff.appointed' else 'staff.changed' end,
    'staff', p_profile_id::text,
    case when v_before.profile_id is null then null
         else jsonb_build_object('staff_role', v_before.staff_role, 'status', v_before.status) end,
    jsonb_build_object('staff_role', p_role, 'status', p_status),
    p_reason, null);
end;
$$;

-- Narrowed: reading the team stays open to staff, but writing is the function's
-- job now. Without this the audit call above is a courtesy somebody can skip.
drop policy if exists staff_members_write on public.staff_members;

revoke insert, update, delete on public.staff_members from authenticated;
grant select on public.staff_members to authenticated;

revoke all on function public.set_staff_role(uuid, public.icefall_staff_role, text, text) from public, anon;
grant execute on function public.set_staff_role(uuid, public.icefall_staff_role, text, text) to authenticated;
