-- ICEFALL — how many paid positions a destination has, by kind.
--
-- OWNER DECISION 17, 2026-08-29: a MOUNTAIN has five (1 Premium + 4 Featured).
-- A TREK has THREE.
--
-- The reasoning, because the number alone will not survive contact with the next
-- person who wants to add a fourth trek slot: there are 252 treks against 52
-- mountains, so five apiece would have created 1,260 further sellable positions
-- against 260 on mountains. Scarcity is the whole of what makes a Featured
-- position worth paying for; 1,260 of them are not scarce.
--
-- And the asymmetry that settled it: THE NUMBER CAN BE RAISED LATER. Lowering it
-- means taking a position off somebody who paid for it. Given a choice between
-- an error you can correct and one you can only apologise for, take the first.
--
-- ── WHY THIS IS A TRIGGER AND NOT A CHECK ──────────────────────────────────
--
-- The ceiling depends on the KIND of the destination, which lives on another
-- table, and a CHECK constraint cannot run a subquery. Denormalising `kind` onto
-- `placements` would make a CHECK possible and would also create two places
-- that can disagree about what a destination is. So: a trigger, which also holds
-- against the service role rather than only against a client.
--
-- The occupancy index is unchanged and still does its own job — it stops two
-- companies holding the SAME position. This stops a position existing at all.

create or replace function public.slots_for_kind(p_kind text)
returns int
language sql
immutable
as $$
  select case p_kind when 'trek' then 3 else 5 end;
$$;

comment on function public.slots_for_kind(text) is
  'Mountains 5 (1 Premium + 4 Featured), treks 3. Owner decision 17. Raising a number here is safe; lowering it takes a paid position off somebody.';

create or replace function public.placements_slot_within_kind()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
  v_max int;
begin
  select kind into v_kind from public.destinations where id = new.destination_id;
  if v_kind is null then
    raise exception 'no such destination: %', new.destination_id;
  end if;

  v_max := public.slots_for_kind(v_kind);

  if new.slot_position > v_max then
    raise exception 'a % has % paid positions, so there is no #%',
      v_kind, v_max, new.slot_position
      using hint = 'Positions are deliberately scarce — that is what makes a featured slot worth buying.';
  end if;

  return new;
end;
$$;

drop trigger if exists placements_slot_kind on public.placements;
create trigger placements_slot_kind
  before insert or update of slot_position, destination_id on public.placements
  for each row execute function public.placements_slot_within_kind();

revoke all on function public.slots_for_kind(text) from public, anon;
grant execute on function public.slots_for_kind(text) to authenticated;
