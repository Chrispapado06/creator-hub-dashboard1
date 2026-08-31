-- ICEFALL — operator-created leads: tags, origin, and the attribution guard.
--
-- Request 04 from the operator portal, accepted 2026-08-29 and answered here.
-- The commercial point is the whole point: today every lead is an ICEFALL
-- enquiry, so every portal figure is honestly attributable to us. The moment an
-- operator can type in their own phone enquiries, that stops being true unless
-- the ROW distinguishes the two — and unless the database, not the client,
-- refuses to let an operator file their own work as ours.
--
-- ── ANSWERS TO THE REQUEST'S THREE QUESTIONS ───────────────────────────────
--
-- 1. `tags` is the array, not a child table. Normalised by trigger (trimmed,
--    inner whitespace collapsed, de-duplicated case-insensitively keeping the
--    first casing) and REFUSED over the caps rather than silently trimmed — a
--    client-side cap is a suggestion; this one is not.
-- 2. `origin` with the operator-side insert policy FORCED via `with check`.
--    One deliberate difference from the request: a smuggled
--    `origin = 'icefall'` is REFUSED, not coerced to 'company'. A database
--    that silently rewrites a value teaches clients it accepted them; the
--    portal's adapter hard-codes 'company' anyway, so nothing legitimate hits
--    the refusal.
-- 3. `customer_id` becomes NULLABLE, permitted only for `origin = 'company'`:
--    an operator's walk-in is not an ICEFALL user, and an operator may not
--    attach an ICEFALL user to their own-origin lead either (attribution runs
--    through that column). For `source`: use the existing free-text
--    `source_page` — it is unconstrained, "Phone" / "Referral" fit as they are.
--
-- ── WHAT THE POLICY SPLIT ALSO CLOSES ──────────────────────────────────────
--
-- The old `leads_write` was one FOR ALL policy shared by staff and company
-- members — which meant an operator could DELETE an ICEFALL lead, or update
-- any column of one, including (once it existed) `origin` itself. Split:
-- staff keep full write; operators get INSERT (forced to their own origin,
-- no customer attached) and UPDATE (their pipeline work — but a trigger
-- refuses a non-staff change to `origin` or `customer_id`, the two columns
-- attribution rests on). Operators never DELETE: a lead is a commercial
-- record, and removing one is ICEFALL's act.

begin;

/* ---- Columns ------------------------------------------------------------- */

alter table public.leads
  add column if not exists tags text[] not null default '{}',
  add column if not exists origin text not null default 'icefall';

alter table public.leads drop constraint if exists leads_origin_known;
alter table public.leads add constraint leads_origin_known check (
  origin in ('icefall', 'company')
);

alter table public.leads drop constraint if exists leads_tags_capped;
alter table public.leads add constraint leads_tags_capped check (
  cardinality(tags) <= 8
);

alter table public.leads alter column customer_id drop not null;

-- An ICEFALL lead without a customer is a broken record; a company lead with
-- one would put ICEFALL attribution on an operator's own enquiry.
alter table public.leads drop constraint if exists leads_customer_coherent;
alter table public.leads add constraint leads_customer_coherent check (
  (origin = 'icefall' and customer_id is not null)
  or (origin = 'company' and customer_id is null)
);

comment on column public.leads.tags is
  'The company''s own labels on their own customers. NOT company_internal.tags, which is ICEFALL''s commercial view of the company and which operators never read.';
comment on column public.leads.origin is
  'Who produced the enquiry. Portal scorecards count icefall only — "is ICEFALL worth what I pay" must not be flattered by the operator''s own referrals — and if referral fees ever carry a percentage, this column is the difference between a right invoice and a wrong one.';

/* ---- Tag normalisation --------------------------------------------------- */

create or replace function public.leads_tags_normalise()
returns trigger
language plpgsql
as $$
declare
  cleaned text[] := '{}';
  t text;
  candidate text;
begin
  foreach t in array new.tags loop
    candidate := regexp_replace(btrim(t), '\s+', ' ', 'g');
    if candidate = '' then continue; end if;
    if length(candidate) > 24 then
      raise exception 'a lead tag is at most 24 characters: "%"', candidate;
    end if;
    -- Case-insensitive de-dupe, first casing wins: "Deposit"/"deposit" must be
    -- ONE tag, or a pipeline filter silently splits in half and neither column
    -- is right.
    if not exists (select 1 from unnest(cleaned) c where lower(c) = lower(candidate)) then
      cleaned := cleaned || candidate;
    end if;
  end loop;
  if cardinality(cleaned) > 8 then
    raise exception 'a lead carries at most 8 tags';
  end if;
  new.tags := cleaned;
  return new;
end;
$$;

drop trigger if exists leads_tags_normalise on public.leads;
create trigger leads_tags_normalise
  before insert or update of tags on public.leads
  for each row execute function public.leads_tags_normalise();

/* ---- The attribution guard ----------------------------------------------- */

create or replace function public.leads_attribution_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.origin is distinct from old.origin
      or new.customer_id is distinct from old.customer_id)
     and public.is_staff() is not true then
    raise exception 'only ICEFALL staff may change a lead''s origin or customer — attribution rests on them';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_attribution_guard on public.leads;
create trigger leads_attribution_guard
  before update on public.leads
  for each row execute function public.leads_attribution_guard();

/* ---- The policy split ---------------------------------------------------- */

drop policy if exists leads_write on public.leads;

create policy leads_staff_write on public.leads
  for all to authenticated
  using (public.has_staff_role(array['sales', 'operations', 'support']))
  with check (public.has_staff_role(array['sales', 'operations', 'support']));

-- The forced value the request asked for: an operator-authored insert can only
-- ever produce their own origin, for their own company, with no ICEFALL
-- customer attached.
create policy leads_operator_insert on public.leads
  for insert to authenticated
  with check (
    public.is_company_member(company_id)
    and origin = 'company'
    and customer_id is null
  );

-- Their pipeline work: status moves, tags, notes-adjacent fields. The trigger
-- above keeps origin and customer_id out of reach; delete is not granted.
create policy leads_operator_update on public.leads
  for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

commit;
