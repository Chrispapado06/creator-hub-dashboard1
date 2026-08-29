-- ICEFALL — treks become placeable inventory alongside mountains.
--
-- Until now `mountains` was the only thing a company could buy a position on.
-- The owner has asked for treks too, and there are 252 of them against 52
-- mountains — so this is not a small addition to the catalogue, it is most of it.
--
-- ── ONE TABLE, NOT TWO ─────────────────────────────────────────────────────
--
-- A trek and a mountain are different things in the product, but they are the
-- SAME thing to a placement: a destination with five paid positions on it.
-- Everything already hanging off this table — the occupancy index that makes
-- double-selling impossible, `placements`, `company_destinations`, `products`,
-- `leads`, `bookings`, `revenue_records` — keeps working untouched, and a
-- placement stays one row whatever it was placed on.
--
-- The alternative was a parallel `treks` table, which would have meant a second
-- occupancy index, a second set of foreign keys, and every query that asks
-- "what is this company placed on" becoming a union. That is how one concept
-- ends up with two half-implementations that disagree.
--
-- THE COST, STATED PLAINLY: the table is called `mountains` and now holds treks.
-- That is a naming lie and it will mislead somebody. The `destinations` view
-- below is the honest name for new code to read; the rename of the underlying
-- table is a follow-up, cheap while nothing is deployed and worth doing before
-- anything is.
--
-- ── WHAT A TREK DOES NOT HAVE ──────────────────────────────────────────────
--
-- No summit elevation. `elevation_m` stays NULL for a trek rather than being
-- filled with the high point of the route, because those are different claims
-- and a screen showing "5,364 m" beside a trek name reads as a summit. Where a
-- route's high point is known it goes in `max_altitude_m`, which says what it is.

alter table public.destinations add column if not exists kind text not null default 'mountain';

alter table public.destinations drop constraint if exists destinations_kind_known;
alter table public.destinations
  add constraint destinations_kind_known check (kind in ('mountain', 'trek'));

-- Trek-shaped facts. Null on a mountain, and null on a trek nobody has measured
-- — which is the ordinary case and renders as absent, not as zero.
alter table public.destinations add column if not exists max_altitude_m int
  check (max_altitude_m is null or max_altitude_m between 0 and 9000);
alter table public.destinations add column if not exists duration_days_min int
  check (duration_days_min is null or duration_days_min between 1 and 200);
alter table public.destinations add column if not exists duration_days_max int
  check (duration_days_max is null or duration_days_max between 1 and 200);
alter table public.destinations add column if not exists distance_km numeric(6, 1)
  check (distance_km is null or distance_km >= 0);

alter table public.destinations drop constraint if exists destinations_duration_ordered;
alter table public.destinations
  add constraint destinations_duration_ordered check (
    duration_days_min is null or duration_days_max is null
    or duration_days_min <= duration_days_max
  );

-- A summit elevation belongs to a mountain. A trek has a high point, which is a
-- different statement and lives in `max_altitude_m`.
alter table public.destinations drop constraint if exists destinations_trek_has_no_summit;
alter table public.destinations
  add constraint destinations_trek_has_no_summit check (kind <> 'trek' or elevation_m is null);

create index if not exists destinations_kind_idx on public.destinations (kind);

comment on column public.destinations.kind is
  'mountain or trek. Both are placeable destinations with five paid positions; this table is the inventory, not a list of peaks.';

-- NOTE: an earlier draft of this file created a `destinations` VIEW over a table
-- still called `mountains`. That was the wrong fix — two names for one thing,
-- and the next reader has to work out which is the lie. The table itself is now
-- named `destinations`, so the view is gone rather than kept alongside it.
--
-- `slots_held` was the one thing the view computed. It stays derived, in the
-- application, from the placements themselves; storing it on the destination
-- would be a count that can disagree with what it counts.

/* -------------------------------------------------------------------------- */
/* Treks link to the mountains they touch                                     */
/* -------------------------------------------------------------------------- */

-- `icefall-web`'s trek records already carry `mountainIds: ["mont-blanc"]`, and
-- that relationship is worth keeping: a climber looking at Mont Blanc should be
-- able to reach the Tour du Mont Blanc, and an operator holding both should see
-- them as related inventory rather than two unconnected line items.
create table if not exists public.trek_mountains (
  trek_id text not null references public.destinations (id) on delete cascade,
  destination_id text not null references public.destinations (id) on delete cascade,
  primary key (trek_id, destination_id),
  constraint trek_mountains_not_self check (trek_id <> destination_id)
);

create index if not exists trek_mountains_destination_idx on public.trek_mountains (destination_id);

alter table public.trek_mountains enable row level security;

drop policy if exists trek_mountains_select on public.trek_mountains;
create policy trek_mountains_select on public.trek_mountains
  for select to authenticated using (true);

drop policy if exists trek_mountains_write on public.trek_mountains;
create policy trek_mountains_write on public.trek_mountains
  for all to authenticated
  using (public.has_staff_role(array['operations']))
  with check (public.has_staff_role(array['operations']));

grant select, insert, update, delete on public.trek_mountains to authenticated;
revoke all on public.trek_mountains from anon;

/**
 * A trek links to mountains, not the other way round, and never to another trek.
 *
 * Without this the pairing is just two text columns and nothing stops
 * `trek_mountains` holding two mountains or two treks — at which point the
 * relationship means nothing and every query reading it has to re-check.
 */
create or replace function public.trek_mountains_kinds_are_right()
returns trigger
language plpgsql
as $$
declare
  v_trek text;
  v_mountain text;
begin
  select kind into v_trek from public.destinations where id = new.trek_id;
  select kind into v_mountain from public.destinations where id = new.destination_id;

  if v_trek is distinct from 'trek' then
    raise exception '% is not a trek', new.trek_id;
  end if;
  if v_mountain is distinct from 'mountain' then
    raise exception '% is not a mountain', new.destination_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trek_mountains_kinds on public.trek_mountains;
create trigger trek_mountains_kinds
  before insert or update on public.trek_mountains
  for each row execute function public.trek_mountains_kinds_are_right();
