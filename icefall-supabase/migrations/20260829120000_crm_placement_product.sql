-- ICEFALL — a placement features a specific expedition.
--
-- The spec's hierarchy is MOUNTAIN → SLOT → COMPANY → EXPEDITION → TERM/PRICE,
-- and until now the schema skipped a link: a placement named the company and the
-- mountain but not WHICH of that company's expeditions the slot was selling.
-- The admin screen could only render "expedition not linked" on every row, which
-- is honest and useless — a paid position on Everest exists to put one specific
-- trip in front of a climber, and an operator with three Everest programmes and
-- one slot has made a choice the CRM could not record.
--
-- Nullable, because the choice is genuinely optional: a company may buy the
-- position first and decide what to feature in it afterwards, and forcing a
-- product at creation time would either block that or invite a placeholder.
-- "Not chosen yet" is a real state and it renders as one.

alter table public.placements add column if not exists product_id uuid
  references public.products (id) on delete set null;

create index if not exists placements_product_idx on public.placements (product_id);

comment on column public.placements.product_id is
  'The expedition this paid position features. NULL means the company has not chosen yet — a real state, not a gap.';

/**
 * A placement can only feature its OWN company's expedition.
 *
 * The foreign key only says the product exists. Without this a company could buy
 * Everest #1 and point it at a competitor's expedition — and because the slot
 * renders the product's name and price on a public mountain page, the result
 * would be one operator advertising another operator's trip from a position they
 * paid for. The same reasoning already guards company banners and films.
 *
 * It also enforces the hierarchy the brief asks for: the expedition must belong
 * to the company holding the slot, or the chain from mountain to company to
 * expedition does not hold.
 */
create or replace function public.placements_product_is_own()
returns trigger
language plpgsql
as $$
declare
  v_owner uuid;
  v_on_mountain boolean;
begin
  if new.product_id is null then
    return new;
  end if;

  select p.company_id into v_owner from public.products p where p.id = new.product_id;

  if v_owner is distinct from new.company_id then
    raise exception 'a placement can only feature its own company''s expedition'
      using hint = 'Choose an expedition belonging to the company holding this slot.';
  end if;

  -- And it must actually be an expedition on THIS mountain. A slot on Everest
  -- featuring the company's Aconcagua trip is not a placement anybody wants to
  -- have sold; the climber clicks a mountain and gets a different one.
  select exists (
    select 1 from public.product_destinations pm
    where pm.product_id = new.product_id and pm.destination_id = new.destination_id
  ) into v_on_mountain;

  if not v_on_mountain then
    raise exception 'that expedition is not listed on %', new.destination_id
      using hint = 'Attach the expedition to this mountain first, or choose one already on it.';
  end if;

  return new;
end;
$$;

drop trigger if exists placements_product_own on public.placements;
create trigger placements_product_own
  before insert or update of product_id, company_id, destination_id on public.placements
  for each row execute function public.placements_product_is_own();
