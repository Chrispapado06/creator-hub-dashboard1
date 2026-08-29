-- ICEFALL — what a commission is charged ON.
--
-- OWNER DECISION, 2026-08-28 (constitution §6, decision 13):
--
--   An Everest expedition sells for €62,000, of which roughly €10,000 is the
--   Nepal permit the company collects and hands straight to the government.
--   The 7.5% applies to €52,000, not €62,000. €3,900, not €4,650.
--
-- ICEFALL earns on the work a counterparty did, not on money that merely passed
-- through their hands. The rule already held on the guide stream — hut fees and
-- permits were excluded there — and the two halves of one money model disagreed
-- until somebody compared them. They no longer do.
--
-- NOTE WHICH ARTEFACT LOST. The internal CRM specification says the booking
-- value is the "gross transaction value", and the guide precedent says net. The
-- specification is authoritative about WHAT TO BUILD; it is not authoritative
-- about what the business charges, and the owner is the tiebreak on the second.
-- Worth remembering the next time a spec sentence looks like a commercial fact.
--
-- ── THE PASS-THROUGH IS STATED, NEVER INFERRED ──────────────────────────────
--
-- Nothing can look at €62,000 and deduce that €10,000 of it was a permit. An
-- operator states it, or it is not known — exactly as an unreported booking
-- value is stated as unreported rather than guessed at zero.
--
-- So `pass_through_state` has three values and the third one matters most:
--
--   stated   the operator gave a figure, and it is here
--   none     the operator confirmed there are no pass-through costs
--   unknown  nobody has said
--
-- A BOOKING WITH NO STATED PASS-THROUGH IS NOT A BOOKING WITH ZERO PASS-THROUGH.
-- Collapsing `unknown` into 0 would silently mean ICEFALL charges on the full
-- gross, which is the decision this migration exists to reverse. So
-- `record_commission` REFUSES a booking whose pass-through is unknown, the same
-- way it already refuses one whose value is unknown. Refusing is cheap —
-- recording "none" takes a moment. Guessing is not cheap, because it produces a
-- fee somebody will be invoiced for.

/* ========================================================================== */
/* Bookings gain a stated pass-through                                        */
/* ========================================================================== */

alter table public.bookings add column if not exists pass_through_cents bigint
  check (pass_through_cents is null or pass_through_cents >= 0);

alter table public.bookings add column if not exists pass_through_state text
  not null default 'unknown';

alter table public.bookings drop constraint if exists bookings_pass_through_known;
alter table public.bookings
  add constraint bookings_pass_through_known
  check (pass_through_state in ('stated', 'none', 'unknown'));

alter table public.bookings drop constraint if exists bookings_pass_through_coherent;
alter table public.bookings
  add constraint bookings_pass_through_coherent check (
    (pass_through_state = 'stated'  and pass_through_cents is not null and pass_through_cents > 0)
    or (pass_through_state = 'none' and pass_through_cents = 0)
    or (pass_through_state = 'unknown' and pass_through_cents is null)
  );

-- A pass-through larger than the booking is arithmetic gone wrong, not a
-- commercial arrangement.
alter table public.bookings drop constraint if exists bookings_pass_through_within_value;
alter table public.bookings
  add constraint bookings_pass_through_within_value check (
    pass_through_cents is null or value_cents is null or pass_through_cents <= value_cents
  );

comment on column public.bookings.pass_through_state is
  'unknown is NOT zero. A commission cannot be computed until an operator states the pass-through, or states there is none.';

/* ========================================================================== */
/* Commissions record the whole sum, not just the answer                      */
/* ========================================================================== */

-- `basis_cents` alone no longer explains the fee: a reader seeing €3,900 on a
-- €62,000 booking needs to see the €10,000 that was taken out first, or the
-- arithmetic looks wrong. All three are frozen together.
alter table public.commissions add column if not exists gross_cents bigint
  check (gross_cents is null or gross_cents >= 0);
alter table public.commissions add column if not exists pass_through_cents bigint
  check (pass_through_cents is null or pass_through_cents >= 0);

/**
 * Once the booking is done, the arithmetic is history.
 *
 * Recreated to cover the two new columns. Leaving them out would have meant a
 * completed booking's gross and pass-through could be edited while its rate and
 * amount stayed frozen — which is worse than not freezing at all, because the
 * record would then disagree with itself and look like a rounding error.
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
       new.rate_bps           is distinct from old.rate_bps
    or new.fixed_fee_cents    is distinct from old.fixed_fee_cents
    or new.min_fee_cents      is distinct from old.min_fee_cents
    or new.max_fee_cents      is distinct from old.max_fee_cents
    or new.basis_cents        is distinct from old.basis_cents
    or new.gross_cents        is distinct from old.gross_cents
    or new.pass_through_cents is distinct from old.pass_through_cents
    or new.amount_cents       is distinct from old.amount_cents
    or new.currency           is distinct from old.currency
  ) then
    raise exception 'the commission on a completed booking cannot be rewritten'
      using hint = 'Changing a rate must not move historical revenue. Record an adjustment instead.';
  end if;

  return new;
end;
$$;

/* ========================================================================== */
/* The engine charges on the net                                              */
/* ========================================================================== */

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
