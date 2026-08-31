-- ICEFALL — the trek catalogue's presentation columns, and named high points.
--
-- ANSWER TO REQUEST 09 (Session 04's `company_treks` proposal): most of it
-- ALREADY EXISTS, deliberately, and this migration adds only what does not.
--
--   proposed `treks`          → `destinations` with kind = 'trek'
--                               (20260829130000: one inventory table, one
--                               occupancy index — a parallel treks table was
--                               considered there and refused by name)
--   proposed `company_treks`  → `company_destinations`. A trek grant and a
--                               peak grant are separate ROWS with independent
--                               status already — the feared welded lifecycle
--                               only arises from a kind column on one row,
--                               which this schema never had.
--   proposed `trek_mountains` → exists, kind-checked by trigger.
--   proposed predicate        → `company_may_edit_destination(company, id)`,
--                               active-membership AND active-grant, exactly
--                               the active-only semantics the request calls
--                               load-bearing.
--
-- What was genuinely missing: the presentation fields the web catalogue
-- carries (difficulty, season, style, summary) and — the governance flag —
-- a NAMED high point.

alter table public.destinations add column if not exists difficulty text;
alter table public.destinations add column if not exists season text;
alter table public.destinations add column if not exists style text;
alter table public.destinations add column if not exists summary text;

alter table public.destinations drop constraint if exists destinations_style_known;
alter table public.destinations add constraint destinations_style_known check (
  style is null or style in (
    'Base camp', 'Circuit', 'Traverse', 'Valley',
    'High pass', 'Pilgrimage', 'Coastal', 'Long distance'
  )
);

-- Style is a trek vocabulary; a mountain carrying one would be a category
-- error the same way a trek carrying a summit elevation is.
alter table public.destinations drop constraint if exists destinations_style_is_trek;
alter table public.destinations
  add constraint destinations_style_is_trek check (style is null or kind = 'trek');

/* ---- The named high point ------------------------------------------------ */

-- THE RULING THE EBC DIVERGENCE FORCED. The same route carries 5,545 m in the
-- web catalogue (Kala Patthar, which most itineraries include) and 5,364 m in
-- the operator seed (base camp itself) — 181 m apart, on the number a person
-- uses to judge whether they can survive the trip. Both are true OF SOMETHING,
-- which is exactly the problem: a bare figure does not say of what.
--
-- So the catalogue row — the ONE owner of the figure from here on — must name
-- the point its altitude measures: max_altitude_m 5545 / max_altitude_of
-- 'Kala Patthar', or 5364 / 'Everest Base Camp'. Whichever the catalogue fill
-- chooses, the choice is explicit and a reader knows what they are reading.
-- Neither number may ever become the parent peak's summit.
alter table public.destinations add column if not exists max_altitude_of text
  check (max_altitude_of is null or length(trim(max_altitude_of)) between 2 and 120);

comment on column public.destinations.max_altitude_of is
  'THE NAME OF THE POINT max_altitude_m measures ("Kala Patthar", "Thorong La"). '
  'Required whenever a trek states a figure: two true numbers 181 m apart taught '
  'us that a bare altitude does not say what it is an altitude OF.';

/**
 * Enforced at write time rather than as a table constraint so rows that
 * predate this rule keep reading until the catalogue fill names them — a
 * migration that fails on the live table's history helps nobody. Every NEW
 * or CHANGED figure carries its name.
 */
create or replace function public.destinations_altitude_named()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'trek'
     and new.max_altitude_m is not null
     and (tg_op = 'INSERT' or new.max_altitude_m is distinct from old.max_altitude_m
          or new.max_altitude_of is distinct from old.max_altitude_of)
     and (new.max_altitude_of is null or length(trim(new.max_altitude_of)) < 2) then
    raise exception 'a trek altitude names the point it measures (max_altitude_of)';
  end if;
  return new;
end;
$$;

drop trigger if exists destinations_altitude_named on public.destinations;
create trigger destinations_altitude_named
  before insert or update on public.destinations
  for each row execute function public.destinations_altitude_named();

/* ---- Still deliberately absent, per the request's own reasoning ---------- */

-- price_from: an operator's commercial claim no operator has made — a column
-- whose only value is null invites somebody to fill it in.
-- operator_ids: `company_destinations` is that relation, as a grant ICEFALL
-- makes; a region map over invented companies is not a data source.
-- request_trek_access / request_mountain_access: wanted, real, and a separate
-- change (request 08 §5.4) — the one write path covering both nouns arrives
-- as its own migration, not as a rider on catalogue columns.
