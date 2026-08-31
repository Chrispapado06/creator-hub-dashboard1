-- ICEFALL — OP-05c: the offer lifecycle.
--
-- Offers exist in two composers (guide app GU-03, operator portal OP-05) and
-- until now existed NOWHERE else: composed, rendered, and unrecordable — no
-- store, no acceptance, no working expiry, no amending. This table is the
-- record. ONE lifecycle, TWO commission models, and the models are STRUCTURAL
-- (`seller_kind`), not a rate column:
--
--   guide    the shared money model deducts GUIDE_COMMISSION_PCT from the
--            commissionable part of the quote (pass-through lines excluded,
--            decision 13). Computed by `totalsFor` in icefall-shared/money.ts
--            AT READ TIME — deliberately not stored here, and no SQL copy of
--            that arithmetic exists: the one place a commission is computed
--            stays one place (§6g). The rate that ultimately binds is frozen
--            per booking in `commissions.rate_bps` at conversion, exactly as
--            everywhere else.
--   company  NO commission on the offer itself; the referral stream is
--            per-agreement, and the quote's pass-through lines are the
--            stated basis a future referral agreement may use.
--
-- THE QUOTE IS PINNED VERBATIM. `quote` is the money model's Quote shape
-- (lines with per/passThrough, exclusions, cancellation tiers, party size,
-- departure) as the seller sent it. The customer decides on what they SAW, so
-- the row is immutable once sent — amending is a NEW offer that supersedes
-- this one, never an edit (the booking_agreements stance, one stage earlier).
--
-- TIMESTAMPS, NOT STATUS. created_at / accepted_at / declined_at /
-- withdrawn_at / superseded_at, each with its actor; `valid_until` makes
-- expiry a DERIVED fact (`offer_state`), so an offer cannot sit "open" past
-- its own deadline and nobody has to run a job to flip a flag.
--
-- DECISION 19 CARRIES: an offer is a seller speaking in a thread, so sending
-- one rides the same gate as sending a message — the customer must have
-- opened the conversation. A cold offer is a cold call with a price on it.
--
-- ── THE BRIDGE QUESTION, FLAGGED AND NOT CHOSEN ────────────────────────────
-- An accepted offer is presumably where a booking and its pinned agreement
-- (booking_agreements) begin. Whether acceptance CREATES the booking is a
-- product decision above this schema, so `accept_offer` records the
-- acceptance and nothing else. The alternatives, for the owner:
--   A. Acceptance creates the booking immediately and pins the offer's
--      cancellation/exclusions via record_booking_agreement in the same
--      transaction. Simplest story; but it creates bookings with no payment,
--      and ICEFALL has no processor yet.
--   B. Acceptance is a recorded fact; a person (or a payment step, when one
--      exists) converts it to a booking deliberately. Slower, honest about
--      the missing processor. THE FUNCTIONS BELOW IMPLEMENT B's first half
--      and forbid nothing: A can be layered on later without altering this
--      table.
--   C. Acceptance expires into nothing unless converted within N days —
--      needs A or B decided first.

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT: the conversation must outlive the commercial record it produced.
  thread_id uuid not null references public.threads (id) on delete restrict,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  seller_kind text not null check (seller_kind in ('guide', 'company')),
  company_id uuid references public.companies (id) on delete restrict,
  recipient_id uuid not null references public.profiles (id) on delete restrict,

  -- The money model's Quote, verbatim. Shape-checked lightly; the content is
  -- the seller's statement and is not normalised into columns that could
  -- drift from it.
  quote jsonb not null,
  valid_until timestamptz not null,

  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  decline_note text,
  withdrawn_at timestamptz,
  withdraw_reason text,
  superseded_at timestamptz,
  supersedes uuid references public.offers (id) on delete restrict,

  constraint offers_company_coherent check (
    (seller_kind = 'company' and company_id is not null)
    or (seller_kind = 'guide' and company_id is null)
  ),
  constraint offers_not_to_self check (recipient_id <> sender_id),
  constraint offers_quote_shape check (
    jsonb_typeof(quote -> 'lines') = 'array'
    and jsonb_array_length(quote -> 'lines') > 0
    and jsonb_typeof(quote -> 'exclusions') = 'array'
    and jsonb_typeof(quote -> 'cancellation') = 'object'
    and (quote ->> 'partySize')::int >= 1
  ),
  constraint offers_expiry_after_send check (valid_until > created_at),
  -- One outcome, ever: accepted, declined and withdrawn are mutually
  -- exclusive. (Superseded may coexist with none of them being set — a
  -- superseded-but-never-answered offer is the ordinary amend case.)
  constraint offers_one_outcome check (
    (accepted_at is not null)::int + (declined_at is not null)::int
      + (withdrawn_at is not null)::int <= 1
  ),
  constraint offers_decline_note_needs_decline check (decline_note is null or declined_at is not null),
  constraint offers_withdraw_reason_needs_withdrawal check (withdraw_reason is null or withdrawn_at is not null)
);

create index if not exists offers_thread_idx on public.offers (thread_id, created_at desc);
create index if not exists offers_recipient_idx on public.offers (recipient_id, created_at desc);
create index if not exists offers_company_idx on public.offers (company_id) where company_id is not null;

/* ---- The derived state --------------------------------------------------- */

/**
 * PostgREST computed field: `offers?select=*,state:offer_state`.
 * Outcome stamps outrank expiry (an offer accepted in time STAYS accepted;
 * accept_offer refuses after valid_until, so the ordering cannot lie).
 */
create or replace function public.offer_state(o public.offers)
returns text
language sql
stable
as $$
  select case
    when o.withdrawn_at is not null then 'withdrawn'
    when o.accepted_at is not null then 'accepted'
    when o.declined_at is not null then 'declined'
    when o.superseded_at is not null then 'superseded'
    when o.valid_until < now() then 'expired'
    else 'open'
  end;
$$;

grant execute on function public.offer_state(public.offers) to authenticated;

/* ---- What was offered does not change ------------------------------------ */

/**
 * Immutable substance; stamps set once, by the right party, in their own
 * name. Staff are NOT exempt — an employee rewriting a price somebody was
 * shown is the same lie as the seller doing it.
 */
create or replace function public.offers_guard()
returns trigger
language plpgsql
as $$
begin
  if new.thread_id is distinct from old.thread_id
     or new.sender_id is distinct from old.sender_id
     or new.seller_kind is distinct from old.seller_kind
     or new.company_id is distinct from old.company_id
     or new.recipient_id is distinct from old.recipient_id
     or new.quote is distinct from old.quote
     or new.valid_until is distinct from old.valid_until
     or new.created_at is distinct from old.created_at
     or new.supersedes is distinct from old.supersedes then
    raise exception 'an offer is what the customer saw — amend by sending a new one, never by editing';
  end if;

  if new.accepted_at is distinct from old.accepted_at then
    if old.accepted_at is not null then raise exception 'an acceptance is not re-dated'; end if;
    if auth.uid() is distinct from old.recipient_id then
      raise exception 'only the person the offer was made to can accept it';
    end if;
    if old.valid_until < now() then raise exception 'this offer has expired — ask for a fresh one'; end if;
    if old.superseded_at is not null then raise exception 'this offer was superseded — answer the newest one'; end if;
  end if;

  if new.declined_at is distinct from old.declined_at or new.decline_note is distinct from old.decline_note then
    if old.declined_at is not null then raise exception 'a decline is not re-dated or re-worded'; end if;
    if auth.uid() is distinct from old.recipient_id then
      raise exception 'only the person the offer was made to can decline it';
    end if;
  end if;

  if new.withdrawn_at is distinct from old.withdrawn_at or new.withdraw_reason is distinct from old.withdraw_reason then
    if old.withdrawn_at is not null then raise exception 'a withdrawal is not re-dated or re-worded'; end if;
    if auth.uid() is distinct from old.sender_id then
      raise exception 'only the seller can withdraw their offer';
    end if;
    if old.accepted_at is not null then
      raise exception 'an accepted offer cannot be withdrawn — what was agreed stands';
    end if;
  end if;

  if new.superseded_at is distinct from old.superseded_at then
    if old.superseded_at is not null then raise exception 'supersession is stamped once'; end if;
    if auth.uid() is distinct from old.sender_id then
      raise exception 'only the seller amends their own offer';
    end if;
    if old.accepted_at is not null then
      raise exception 'an accepted offer cannot be superseded — what was agreed stands';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists offers_guard on public.offers;
create trigger offers_guard
  before update on public.offers
  for each row execute function public.offers_guard();

/* ---- The four verbs (INVOKER — RLS is the single rulebook) --------------- */

/**
 * Send, optionally superseding an earlier offer of yours in the same thread.
 * INVOKER: the insert passes through offers_insert with every conjunct
 * (self, membership, decision 19, blocks, seller-kind coherence) — a definer
 * copy of those rules would drift (§6u). The supersession stamp rides the
 * same transaction so there is never a moment with two live offers where the
 * seller meant one.
 */
create or replace function public.send_offer(
  p_thread_id uuid,
  p_recipient_id uuid,
  p_quote jsonb,
  p_valid_until timestamptz,
  p_seller_kind text,
  p_company_id uuid default null,
  p_supersedes uuid default null
)
returns public.offers
language plpgsql
as $$
declare
  v_row public.offers;
begin
  if p_supersedes is not null then
    update public.offers
       set superseded_at = now()
     where id = p_supersedes
       and thread_id = p_thread_id
       and sender_id = auth.uid()
       and superseded_at is null;
    if not found then
      raise exception 'nothing to supersede: not your offer, not this thread, or already superseded';
    end if;
  end if;

  insert into public.offers
    (thread_id, sender_id, seller_kind, company_id, recipient_id, quote, valid_until, supersedes)
  values
    (p_thread_id, auth.uid(), p_seller_kind, p_company_id, p_recipient_id, p_quote, p_valid_until, p_supersedes)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.accept_offer(p_offer_id uuid)
returns public.offers
language plpgsql
as $$
declare
  v_row public.offers;
begin
  -- The guard trigger holds every rule (right person, not expired, not
  -- superseded, once only); this update merely proposes the stamp.
  update public.offers set accepted_at = now()
   where id = p_offer_id
  returning * into v_row;
  if not found then
    raise exception 'no such offer, or it is not yours to answer';
  end if;
  return v_row;
end;
$$;

create or replace function public.decline_offer(p_offer_id uuid, p_note text default null)
returns public.offers
language plpgsql
as $$
declare
  v_row public.offers;
begin
  update public.offers set declined_at = now(), decline_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_offer_id
  returning * into v_row;
  if not found then
    raise exception 'no such offer, or it is not yours to answer';
  end if;
  return v_row;
end;
$$;

create or replace function public.withdraw_offer(p_offer_id uuid, p_reason text default null)
returns public.offers
language plpgsql
as $$
declare
  v_row public.offers;
begin
  update public.offers set withdrawn_at = now(), withdraw_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_offer_id
  returning * into v_row;
  if not found then
    raise exception 'no such offer, or it is not yours to withdraw';
  end if;
  return v_row;
end;
$$;

revoke all on function public.send_offer(uuid, uuid, jsonb, timestamptz, text, uuid, uuid) from public, anon;
revoke all on function public.accept_offer(uuid) from public, anon;
revoke all on function public.decline_offer(uuid, text) from public, anon;
revoke all on function public.withdraw_offer(uuid, text) from public, anon;
grant execute on function public.send_offer(uuid, uuid, jsonb, timestamptz, text, uuid, uuid) to authenticated;
grant execute on function public.accept_offer(uuid) to authenticated;
grant execute on function public.decline_offer(uuid, text) to authenticated;
grant execute on function public.withdraw_offer(uuid, text) to authenticated;

/* ---- RLS + grants (§6v) --------------------------------------------------- */

alter table public.offers enable row level security;
alter table public.offers force row level security;

-- The parties see it; a company's team sees the company's offers; staff see
-- the market. Nobody else knows the offer exists.
drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers
  for select to authenticated
  using (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
    or (company_id is not null and public.is_company_member(company_id))
    or public.is_staff()
  );

-- Sending: yourself, in a thread you are in, that the customer opened
-- (decision 19), past no block, to a participant of that thread, wearing a
-- seller kind you actually are. valid_until must still be ahead.
drop policy if exists offers_insert on public.offers;
create policy offers_insert on public.offers
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_thread_participant(thread_id)
    and not public.blocked_in_thread(thread_id)
    and public.may_write_to_thread(thread_id)
    and exists (
      select 1 from public.thread_participants tp
      where tp.thread_id = offers.thread_id and tp.profile_id = recipient_id
    )
    and (seller_kind <> 'company' or public.is_company_member(company_id))
    and (seller_kind <> 'guide' or exists (
      select 1 from public.guide_profiles g where g.id = auth.uid()
    ))
    and valid_until > now()
  );

-- Updates carry only the stamps; the guard trigger decides who may stamp
-- what. Sender and recipient both need the row updatable for their verbs.
drop policy if exists offers_update on public.offers;
create policy offers_update on public.offers
  for update to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid())
  with check (sender_id = auth.uid() or recipient_id = auth.uid());

-- No DELETE for anyone: a priced promise somebody saw is a commercial record.

revoke all on public.offers from anon, authenticated;
grant select, insert, update on public.offers to authenticated;
